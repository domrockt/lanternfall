// M10-pickup-sfx-distinct (K4): Tests für die Pickup-Klasse.
//
//   1. Vier Pickup-WAVs gemappt, Längen im Soll, alle 6 Paar-Distanzen >= 0,15
//      (Metrik-Funktionen textgleich aus tests/audio-mix.test.ts).
//   2. Kein Clipping in den Pickup-WAVs (Peak <= 0,98).
//   3. Mixer: Pickup-Band (xp/powerup) mit eigenem Kontingent, unabhängig vom
//      globalen 24/s-Deckel; Fair-Share; Priorität 2 verdrängt Waffenstimmen.
//   4. Massen-Dämpfung pickupDampGain (rein, deterministisch).
//   5. Master-Mute bitgleich (Pfad unangetastet aus A7) + Musik-Pfade unangetastet.
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs/path bereit.
import { readFileSync } from "node:fs";
// @ts-ignore
import { resolve } from "node:path";

declare const __dirname: string;
import { describe, expect, it, vi } from "vitest";

// AudioSystem importiert Phaser nur für Typen/Sound-API; im Node-Test genügt ein Stub.
vi.mock("phaser", () => ({ default: {} }));

import { AudioSystem, MUSIC_KEYS, SFX_CONFIG, SFX_KEYS } from "../src/audio/AudioSystem";
import {
  MAX_STARTS_PER_SECOND, MAX_TOTAL_VOICES, PICKUP_BAND_STARTS_PER_SEC,
  PRIORITY, PICKUP_SFX_IDS, PICKUP_DAMP_FLOOR, PICKUP_DAMP_FULL_AT, PICKUP_DAMP_MAX_AT,
  newMixerState, pickupDampGain, planPlay, releaseVoice, notePlayed,
  type MixerState, type SoundRequest,
} from "../src/audio/mixing";

const SFX_DIR = resolve(__dirname, "../public/sfx");
export const PICKUP_IDS = ["xp", "powerup", "levelup", "chest"] as const;

function readWav(file: string): { sr: number; samples: number[] } {
  const buf = readFileSync(resolve(SFX_DIR, file));
  expect(buf.toString("ascii", 0, 4)).toBe("RIFF");
  expect(buf.toString("ascii", 8, 12)).toBe("WAVE");
  let offset = 12;
  let sr = 0;
  let dataOffset = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const len = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      sr = buf.readUInt32LE(offset + 12);
    } else if (id === "data") {
      dataOffset = offset + 8;
      dataLen = len;
      break;
    }
    offset += 8 + len + (len % 2);
  }
  expect(sr).toBe(22050);
  expect(dataOffset).toBeGreaterThan(0);
  const samples: number[] = [];
  for (let i = 0; i < dataLen; i += 2) samples.push(buf.readInt16LE(dataOffset + i) / 32768);
  return { sr, samples };
}

function amplitudeSpectrum(samples: number[]): number[] {
  const n = samples.length;
  const re = Float64Array.from(samples);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k]; const ui = im[i + k];
        const vr = re[i + k + len / 2]; const vi = im[i + k + len / 2];
        const tr = vr * wr - vi * wi;
        const ti = vr * wi + vi * wr;
        re[i + k] = ur + tr; im[i + k] = ui + ti;
        re[i + k + len / 2] = ur - tr; im[i + k + len / 2] = ui - ti;
      }
    }
  }
  const out = new Array<number>(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

function bandEnergies(samples: number[], center = 0.5): number[] {
  const size = 4096;
  const start = Math.max(0, Math.floor(samples.length * center) - size / 2);
  const seg = samples.slice(start, start + size);
  while (seg.length < size) seg.push(0);
  const win = seg.map((s, i) => s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))));
  const spec = amplitudeSpectrum(win);
  const total = spec.reduce((a, b) => a + b, 0) || 1e-9;
  const edges = [0, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  return edges.slice(0, -1).map((a, i) => spec.slice(a, edges[i + 1]).reduce((s, v) => s + v, 0) / total);
}

function cosineDistance(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return 1 - dot / Math.max(1e-9, na * nb);
}

function req(id: string, over: Partial<SoundRequest> = {}): SoundRequest {
  const cfg = SFX_CONFIG[id];
  return {
    id, priority: cfg.priority, cooldown: cfg.cooldown, maxVoices: cfg.maxVoices, volume: cfg.volume,
    // wie AudioSystem.play: Pickup-Klasse trägt das Flag.
    pickup: (PICKUP_SFX_IDS as readonly string[]).includes(id),
    ...over,
  };
}

/** Spielt den Request, wenn erlaubt (inkl. Verdrängung), wie AudioSystem.play. */
function play(state: MixerState, r: SoundRequest): boolean {
  const plan = planPlay(state, r);
  if (!plan.allow) return false;
  if (plan.evict) releaseVoice(state, plan.evict.id);
  notePlayed(state, r);
  return true;
}

describe("M10-pickup-sfx-distinct — WAVs und Signaturen", () => {
  it("4 Pickup-Keys gemappt, WAVs existieren, Längen im Soll", () => {
    const durRange: Record<string, [number, number]> = {
      xp: [0.05, 0.15], powerup: [0.2, 0.4], levelup: [0.45, 0.8], chest: [0.25, 0.5],
    };
    for (const id of PICKUP_IDS) {
      expect(SFX_KEYS[id], `SFX_KEYS fehlt ${id}`).toContain("sfx_pickup_");
      const { sr, samples } = readWav(`${SFX_KEYS[id]}.wav`);
      expect(sr).toBe(22050);
      const d = samples.length / sr;
      expect(d, `${id} Länge ${d.toFixed(2)}s`).toBeGreaterThanOrEqual(durRange[id][0]);
      expect(d, `${id} Länge ${d.toFixed(2)}s`).toBeLessThanOrEqual(durRange[id][1]);
    }
  });

  it("alle 6 Paare klingen verschieden (Band-Distanz >= 0,15)", () => {
    const energies = new Map<string, number[]>();
    for (const id of PICKUP_IDS) energies.set(id, bandEnergies(readWav(`${SFX_KEYS[id]}.wav`).samples));
    let worst = "";
    let worstDist = 1;
    for (let i = 0; i < PICKUP_IDS.length; i++) {
      for (let j = i + 1; j < PICKUP_IDS.length; j++) {
        const a = PICKUP_IDS[i];
        const b = PICKUP_IDS[j];
        const dist = cosineDistance(energies.get(a)!, energies.get(b)!);
        if (dist < worstDist) { worstDist = dist; worst = `${a}/${b}`; }
        expect(dist, `Paar ${a}/${b} zu ähnlich (${dist.toFixed(3)})`).toBeGreaterThanOrEqual(0.15);
      }
    }
    expect(worst, `ähnlichstes Paar ${worst} (${worstDist.toFixed(3)})`).toBeTruthy();
  });

  it("kein Clipping: Peak <= 0,98, Anteil voll ausgesteuerter Samples < 0,1 %", () => {
    for (const id of PICKUP_IDS) {
      const { samples } = readWav(`${SFX_KEYS[id]}.wav`);
      const peak = Math.max(...samples.map(Math.abs));
      expect(peak, `${id} clipped`).toBeLessThanOrEqual(0.98);
      const clipped = samples.filter((s) => Math.abs(s) >= 0.979).length;
      expect(clipped / samples.length, `${id} zu viele Vollausschläge`).toBeLessThan(0.001);
    }
  });
});

describe("M10-pickup-sfx-distinct — Mixer: Pickup-Klasse", () => {
  it("Pickup-Band zählt NICHT in den globalen 24/s-Deckel: volles Waffen/Treffer-Band blockt XP nicht", () => {
    const st = newMixerState();
    st.now = 10;
    // Waffen-/Treffer-Band sättigen: 12 Waffen- + 12 Treffer-Starts in 1 s.
    const weapons = ["ember", "flail", "frost", "thorn", "storm", "lantern"];
    for (let i = 0; i < 12; i++) {
      const w = weapons[i % weapons.length];
      expect(play(st, req(w, { cooldown: 0, maxVoices: 99 })), `Waffe ${i}`).toBe(true);
      releaseVoice(st, w); // Rate-Deckel prüfen, nicht das Voice-Budget
    }
    for (let i = 0; i < 12; i++) {
      const h = i % 2 === 0 ? "hit" : "kill";
      expect(play(st, req(h, { cooldown: 0, maxVoices: 99 })), `Treffer ${i}`).toBe(true);
      releaseVoice(st, h);
    }
    expect(st.starts.filter((s) => s.band < 2).length).toBe(MAX_STARTS_PER_SECOND);
    // XP (Pickup-Klasse) läuft trotzdem: eigenes Kontingent.
    expect(planPlay(st, req("xp", { cooldown: 0, maxVoices: 99 })).allow).toBe(true);
  });

  it(`eigenes Kontingent: max ${PICKUP_BAND_STARTS_PER_SEC} Pickup-Starts/s, dann rateFair`, () => {
    const st = newMixerState();
    st.now = 10;
    let allowed = 0;
    let rejected = 0;
    for (let i = 0; i < 20; i++) {
      const plan = planPlay(st, req("xp", { cooldown: 0, maxVoices: 99 }));
      if (plan.allow) { play(st, req("xp", { cooldown: 0, maxVoices: 99 })); allowed += 1; }
      else { expect(plan.reason).toBe("rateFair"); rejected += 1; }
    }
    expect(allowed).toBe(PICKUP_BAND_STARTS_PER_SEC);
    expect(rejected).toBe(20 - PICKUP_BAND_STARTS_PER_SEC);
  });

  it("Fair-Share im Pickup-Band: xp und powerup teilen das Kontingent", () => {
    const st = newMixerState();
    st.now = 10;
    let xp = 0;
    let pu = 0;
    for (let i = 0; i < 20; i++) {
      if (play(st, req("xp", { cooldown: 0, maxVoices: 99 }))) xp += 1;
      if (play(st, req("powerup", { cooldown: 0, maxVoices: 99 }))) pu += 1;
    }
    expect(xp).toBe(PICKUP_BAND_STARTS_PER_SEC / 2);
    expect(pu).toBe(PICKUP_BAND_STARTS_PER_SEC / 2);
  });

  it("Priorität 2: bei vollem Voice-Budget verdrängt XP die älteste Waffenstimme statt zu verstummen", () => {
    const st = newMixerState();
    st.now = 10;
    for (let i = 0; i < MAX_TOTAL_VOICES; i++) {
      expect(play(st, req("ember", { cooldown: 0, maxVoices: 99 }))).toBe(true);
    }
    expect(st.totalVoices).toBe(MAX_TOTAL_VOICES);
    const oldest = st.active.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
    const plan = planPlay(st, req("xp", { cooldown: 0 }));
    expect(plan.allow).toBe(true);
    expect(plan.evict?.id).toBe(oldest.id);
    // Prio 1 (Waffe) wird dagegen abgelehnt.
    expect(planPlay(st, req("flail", { cooldown: 0 })).allow).toBe(false);
  });

  it("Pickup-Starts ohne pickup-Flag verhalten sich unverändert (Rückwärtskompatibilität)", () => {
    const st = newMixerState();
    st.now = 10;
    // 24 Starts Waffen+Treffer voll -> zusätzliches xp OHNE Flag wird vom
    // globalen Deckel abgelehnt (altes Verhalten), mit Flag erlaubt.
    const weapons = ["ember", "flail", "frost", "thorn", "storm", "lantern"];
    for (let i = 0; i < 12; i++) {
      const w = weapons[i % weapons.length];
      play(st, req(w, { cooldown: 0, maxVoices: 99 }));
      releaseVoice(st, w);
    }
    for (let i = 0; i < 12; i++) {
      const h = i % 2 === 0 ? "hit" : "kill";
      play(st, req(h, { cooldown: 0, maxVoices: 99 }));
      releaseVoice(st, h);
    }
    expect(planPlay(st, req("xp", { cooldown: 0, maxVoices: 99, pickup: false })).allow).toBe(false);
    expect(planPlay(st, req("xp", { cooldown: 0, maxVoices: 99, pickup: true })).allow).toBe(true);
  });
});

describe("M10-pickup-sfx-distinct — Massen-Dämpfung", () => {
  function stateWithPickupStarts(n: number): MixerState {
    const st = newMixerState();
    st.now = 10;
    for (let i = 0; i < n; i++) {
      st.starts.push({ id: i % 2 === 0 ? "xp" : "powerup", at: 9.5, band: 3 });
    }
    return st;
  }

  it(`1 bis ${PICKUP_DAMP_FULL_AT} Starts/s: volle Lautstärke`, () => {
    for (const n of [0, 1, PICKUP_DAMP_FULL_AT]) {
      expect(pickupDampGain(stateWithPickupStarts(n), req("xp", { pickup: true }))).toBe(1);
    }
  });

  it(`>= ${PICKUP_DAMP_MAX_AT} Starts/s: Bodenwert ${PICKUP_DAMP_FLOOR} (nie stumm)`, () => {
    for (const n of [PICKUP_DAMP_MAX_AT, 20, 40]) {
      expect(pickupDampGain(stateWithPickupStarts(n), req("xp", { pickup: true }))).toBe(PICKUP_DAMP_FLOOR);
    }
  });

  it("dazwischen monoton abnehmend; Nicht-Pickup und Musik ungedämpft", () => {
    let prev = 1;
    for (let n = PICKUP_DAMP_FULL_AT; n <= PICKUP_DAMP_MAX_AT; n++) {
      const g = pickupDampGain(stateWithPickupStarts(n), req("xp", { pickup: true }));
      expect(g).toBeLessThanOrEqual(prev + 1e-9);
      prev = g;
    }
    // Kein Pickup-Request: Faktor 1.
    expect(pickupDampGain(stateWithPickupStarts(30), req("ember"))).toBe(1);
    expect(pickupDampGain(stateWithPickupStarts(30), req("chest"))).toBe(1);
  });
});

describe("M10-pickup-sfx-distinct — AudioSystem: Mute bitgleich, Musik unangetastet", () => {
  function makeAudio() {
    const added: string[] = [];
    const played: string[] = [];
    const game = {
      sound: {
        add: (key: string) => {
          added.push(key);
          return {
            setVolume: () => {},
            play: () => {
              played.push(key);
              return true;
            },
            stop: () => {},
            once: () => {},
          };
        },
      },
    } as unknown as ConstructorParameters<typeof AudioSystem>[0];
    return { audio: new AudioSystem(game), added, played };
  }

  it("Master-Mute blockt jeden Pickup-SFX und jede Musik (Pfad unverändert, bitgleich)", () => {
    const { audio, added, played } = makeAudio();
    const ids = [...PICKUP_IDS, "ember", "hit", "bossWarn"];
    for (const id of ids) expect(audio.play(id as never), `unmuted ${id}`).toBe(true);
    expect(played).toHaveLength(ids.length);
    audio.setMuted(true);
    for (const id of ids) expect(audio.play(id as never), `muted ${id}`).toBe(false);
    audio.setMusic("run");
    audio.setMusic("boss");
    expect(added).toHaveLength(ids.length); // keine Musik hinzugekommen
    expect(audio.debugState().muted).toBe(true);
    expect(audio.debugState().voices).toBeLessThanOrEqual(MAX_TOTAL_VOICES);
  });

  it("Mute-Pfad greift vor jeder Mixer-Prüfung (sfxPlayed ändert sich nicht)", () => {
    const { audio } = makeAudio();
    audio.setMuted(true);
    const before = audio.debugState().sfxPlayed;
    for (let i = 0; i < 30; i++) audio.play("xp");
    for (let i = 0; i < 10; i++) audio.play("powerup");
    expect(audio.debugState().sfxPlayed).toBe(before);
  });

  it("Musik-Pfade unangetastet (music-dawn): MUSIC_KEYS und Track-Wechsel unverändert", () => {
    expect(MUSIC_KEYS).toEqual({ run: "music_run", boss: "music_boss" });
    // Pickup-Klasse: Priorität 2 (wie Treffer), genau xp + powerup.
    expect(SFX_CONFIG.xp.priority).toBe(PRIORITY.hit);
    expect(SFX_CONFIG.powerup.priority).toBe(PRIORITY.hit);
    expect([...PICKUP_SFX_IDS].sort()).toEqual(["powerup", "xp"].sort());
    const { audio, added } = makeAudio();
    audio.setMusic("run");
    audio.setMusic("boss");
    audio.setMusic("none");
    expect(added).toEqual(["music_run", "music_boss"]);
    expect(audio.debugState().musicTrack).toBe("none");
  });
});
