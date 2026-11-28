// M10-audio-quality-budget: Audio-Budgets an Qualitaetsstufe gekoppelt.
//
// Geprüft wird die reine Mixer-Logik (src/audio/mixing.ts):
//   1. Tier-Matrix: low < medium < high in ALLEN Budgetfeldern; high bitgleich
//      zu den Legacy-Konstanten (MAX_TOTAL_VOICES, MAX_STARTS_PER_SECOND, Bänder).
//   2. 0 Clipping im Burst je Tier: realer WAV-Burst (alle SFX mit maxVoices,
//      gestaffelt um Cooldown) mit WAV-Superposition — Peak bleibt < 1 (0 dBFS).
//   3. Pickup-/Waffen-Bänder bitgleich bei HIGH: dieselbe deterministische
//      Chaos-Sequenz liefert mit explizitem HIGH-Budget exakt dieselben
//      Entscheidungen und Band-Starts wie mit dem Default-Budget.
//   4. LOW drosselt messbar: weniger Voice-Starts und weniger gleichzeitige
//      Stimmen als HIGH bei identischem Request-Strom.
//   5. Verdrängungsgrenze je Tier: Prio 2 verdrängt nur bis zum Tier-Budget.
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs/path bereit.
import { readFileSync } from "node:fs";
// @ts-ignore
import { resolve } from "node:path";

declare const __dirname: string;

import {
  AUDIO_BUDGET_HIGH, AUDIO_BUDGETS, HIT_BAND_STARTS_PER_SEC, MAX_STARTS_PER_SECOND,
  MAX_TOTAL_VOICES, PICKUP_BAND_STARTS_PER_SEC, PRIORITY, PRIORITY_PICKUP, SFX_CONFIG,
  SFX_KEYS, TARGET_PEAK, WEAPON_BAND_STARTS_PER_SEC, activeVolumeSum, audioBudgetFor,
  effectiveVolume, limiterGain, newMixerState, notePlayed, planPlay, releaseVoice,
  type AudioBudget, type MixerState, type SoundRequest,
} from "../src/audio/mixing";

const SFX_DIR = resolve(__dirname, "../public/sfx");

/** Minimaler WAV-Leser: 16-bit mono PCM, wie scripts/gen_sfx.py ihn schreibt. */
function readWav(file: string): { sr: number; samples: number[] } {
  const buf = readFileSync(resolve(SFX_DIR, file));
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  let offset = 12;
  let sr = 0;
  let dataOffset = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const len = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") sr = buf.readUInt32LE(offset + 12);
    else if (id === "data") { dataOffset = offset + 8; dataLen = len; break; }
    offset += 8 + len + (len % 2);
  }
  expect(sr).toBe(22050);
  const samples: number[] = [];
  for (let i = 0; i < dataLen / 2; i++) samples.push(buf.readInt16LE(dataOffset + i * 2) / 32768);
  return { sr, samples };
}

const WAVS = new Map(Object.entries(SFX_KEYS).map(([id, key]) => [id, readWav(`${key}.wav`)]));

function req(id: string, priority: number, over: Partial<SoundRequest> = {}): SoundRequest {
  return { id, priority, cooldown: 0, maxVoices: 99, volume: 0.5, ...over };
}

/** Spielt den Request, wenn erlaubt (inkl. Verdrängung), wie AudioSystem.play. */
function play(state: MixerState, r: SoundRequest, budget?: AudioBudget): boolean {
  const plan = planPlay(state, r, budget);
  if (!plan.allow) return false;
  if (plan.evict) releaseVoice(state, plan.evict.id);
  notePlayed(state, r, { volume: effectiveVolume(1, r) });
  return true;
}

describe("M10-audio-quality-budget — Tier-Matrix", () => {
  it("low < medium < high in allen Budgetfeldern", () => {
    const keys = [
      "maxTotalVoices", "maxStartsPerSecond", "weaponBandStartsPerSec",
      "hitBandStartsPerSec", "pickupBandStartsPerSec",
    ] as const;
    for (const k of keys) {
      expect(AUDIO_BUDGETS.low[k], `low.${k}`).toBeLessThan(AUDIO_BUDGETS.medium[k]);
      expect(AUDIO_BUDGETS.medium[k], `medium.${k}`).toBeLessThan(AUDIO_BUDGETS.high[k]);
      expect(Number.isInteger(AUDIO_BUDGETS.low[k])).toBe(true);
    }
  });

  it("HIGH ist bitgleich zu den Legacy-Konstanten (heutiges Verhalten)", () => {
    expect(AUDIO_BUDGET_HIGH).toEqual({
      maxTotalVoices: MAX_TOTAL_VOICES,
      maxStartsPerSecond: MAX_STARTS_PER_SECOND,
      weaponBandStartsPerSec: WEAPON_BAND_STARTS_PER_SEC,
      hitBandStartsPerSec: HIT_BAND_STARTS_PER_SEC,
      pickupBandStartsPerSec: PICKUP_BAND_STARTS_PER_SEC,
    });
    expect(AUDIO_BUDGETS.high).toBe(AUDIO_BUDGET_HIGH); // dieselbe Referenz
  });

  it("audioBudgetFor fällt bei unbekanntem Tier auf HIGH zurück", () => {
    expect(audioBudgetFor("high")).toBe(AUDIO_BUDGET_HIGH);
    expect(audioBudgetFor("medium")).toBe(AUDIO_BUDGETS.medium);
    expect(audioBudgetFor("low")).toBe(AUDIO_BUDGETS.low);
    expect(audioBudgetFor("egal" as never)).toBe(AUDIO_BUDGET_HIGH);
  });
});

describe("M10-audio-quality-budget — 0 Clipping im Burst je Tier", () => {
  /** Burst: alle SFX starten maxVoices Stimmen, gestaffelt um Cooldown (WAV-Superposition). */
  function burst(tier: Parameters<typeof audioBudgetFor>[0]): { peak: number; voices: number; clipping: number } {
    const budget = audioBudgetFor(tier);
    const state = newMixerState();
    const len = Math.ceil(3 * 22050);
    const buf = new Float64Array(len);
    const ends: { id: string; endAt: number }[] = [];
    let voices = 0;
    let t = 0;
    for (const [id, cfg] of Object.entries(SFX_CONFIG)) {
      for (let k = 0; k < cfg.maxVoices; k++) {
        t = k * cfg.cooldown;
        state.now = t;
        const r = req(id, cfg.priority, { cooldown: cfg.cooldown, maxVoices: cfg.maxVoices, volume: cfg.volume });
        const plan = planPlay(state, r, budget);
        if (!plan.allow) continue;
        if (plan.evict) releaseVoice(state, plan.evict.id);
        let vol = effectiveVolume(1, r);
        const scale = limiterGain(activeVolumeSum(state), vol, TARGET_PEAK);
        if (scale < 1) for (const v of state.active) v.volume *= scale;
        vol *= scale;
        notePlayed(state, r, { volume: vol, scaleExisting: scale });
        const { samples } = WAVS.get(id) ?? WAVS.get("hit")!;
        const start = Math.round(t * 22050);
        for (let i = start; i < Math.min(len, start + samples.length); i++) buf[i] += samples[i - start] * vol;
        ends.push({ id, endAt: t + samples.length / 22050 });
        voices += 1;
      }
    }
    for (const e of ends) releaseVoice(state, e.id);
    let peak = 0;
    let clipping = 0;
    for (let i = 0; i < len; i++) {
      const a = Math.abs(buf[i]);
      if (a > peak) peak = a;
      if (a >= 1) clipping += 1;
    }
    return { peak, voices, clipping };
  }

  for (const tier of ["high", "medium", "low"] as const) {
    it(`${tier}: Peak < 0 dBFS, 0 Clipping-Samples`, () => {
      const r = burst(tier);
      expect(r.clipping).toBe(0);
      expect(r.peak).toBeLessThan(1);
    });
  }

  it("LOW startet im selben Burst weniger Stimmen als HIGH", () => {
    expect(burst("low").voices).toBeLessThan(burst("high").voices);
  });
});

/** Deterministische Chaos-Sequenz: Waffen-Dauerfeuer + Treffer-Kills + XP-Pickups. */
function chaosRun(budget?: AudioBudget): { allowed: number; band0: number; band3: number; maxVoices: number } {
  const st = newMixerState();
  const ids = ["ember", "flail", "frost", "storm", "lantern"];
  let allowed = 0;
  let maxVoices = 0;
  for (let t = 0; t < 300; t++) {
    st.now = t * 0.01;
    for (const id of ids) if (play(st, req(id, PRIORITY.weapon, { cooldown: 0.09 }), budget)) allowed += 1;
    if (play(st, req("hit", PRIORITY.hit, { cooldown: 0 }), budget)) allowed += 1;
    // Pickups (eigene Klasse, Band 3): Massen-XP.
    for (let k = 0; k < 3; k++) if (play(st, req("xp", PRIORITY_PICKUP, { cooldown: 0.05, pickup: true }), budget)) allowed += 1;
    // Alte Stimmen freigeben (kurze WAVs).
    const done = st.active.filter((v) => st.now - v.startedAt >= 0.2).map((v) => v.id);
    for (const id of done) releaseVoice(st, id);
    maxVoices = Math.max(maxVoices, st.totalVoices);
  }
  const band0 = st.starts.filter((s) => s.band === 0).length;
  const band3 = st.starts.filter((s) => s.band === 3).length;
  return { allowed, band0, band3, maxVoices };
}

describe("M10-audio-quality-budget — Bänder bitgleich bei HIGH", () => {
  it("explizites HIGH-Budget: identische Entscheidungen und Band-Starts wie Default", () => {
    const def = chaosRun();
    const high = chaosRun(AUDIO_BUDGET_HIGH);
    expect(high).toEqual(def);
    // Sowohl Waffen-Band (0) als auch Pickup-Band (3) sind belegt.
    expect(def.band0).toBeGreaterThan(0);
    expect(def.band3).toBeGreaterThan(0);
  });

  it("LOW drosselt denselben Request-Strom messbar (Starts und Stimmen)", () => {
    const high = chaosRun(AUDIO_BUDGET_HIGH);
    const low = chaosRun(AUDIO_BUDGETS.low);
    expect(low.allowed).toBeLessThan(high.allowed);
    expect(low.maxVoices).toBeLessThan(high.maxVoices);
    expect(low.maxVoices).toBeLessThanOrEqual(AUDIO_BUDGETS.low.maxTotalVoices);
  });
});

describe("M10-audio-quality-budget — Verdrängungsgrenze je Tier", () => {
  it("Prio 2 verdrängt bis zum Tier-Budget, nicht darüber", () => {
    for (const tier of ["high", "medium", "low"] as const) {
      const budget = audioBudgetFor(tier);
      const st = newMixerState();
      st.now = 10;
      for (let i = 0; i < budget.maxTotalVoices; i++) {
        play(st, req(`w${i}`, PRIORITY.weapon, { volume: 0.4, maxVoices: 99 }), budget);
      }
      expect(st.totalVoices).toBe(budget.maxTotalVoices);
      // Prio 2 verdrängt die älteste Waffe (1:1) statt abgelehnt zu werden.
      const plan = planPlay(st, req("hit", PRIORITY.hit, { cooldown: 0 }), budget);
      expect(plan.allow).toBe(true);
      expect(plan.evict?.id).toBe("w0");
      if (plan.evict) releaseVoice(st, plan.evict.id);
      notePlayed(st, req("hit", PRIORITY.hit, { cooldown: 0 }), { volume: 0.4 });
      expect(st.totalVoices).toBe(budget.maxTotalVoices);
    }
  });
});
