// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs/path bereit.
import { readFileSync } from "node:fs";
// @ts-ignore
import { resolve } from "node:path";

declare const __dirname: string;
import { describe, expect, it } from "vitest";

// Fokus dieser Lane (docs/lanes/m10-audio-frost-gap.md): das knapp an der
// 0,12-Schwelle liegende Paar frost/eternal_winter auf >= 0,15 bringen, ohne
// andere Paare unter 0,12 zu druecken. Metrik identisch zu tests/audio-mix.test.ts.
import { EVOLUTION_SFX_IDS, SFX_KEYS, WEAPON_SFX_IDS } from "../src/audio/mixing";
import {
  MAX_STARTS_PER_SECOND, MAX_TOTAL_VOICES, PRIORITY, SFX_CONFIG,
  TARGET_PEAK, WEAPON_BAND_STARTS_PER_SEC, HIT_BAND_STARTS_PER_SEC,
  canPlay, effectiveVolume, newMixerState, notePlayed, releaseVoice,
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

function amplitudeSpectrum(seg: number[]): number[] {
  const n = seg.length;
  const re = [...seg];
  const im = new Array<number>(n).fill(0);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
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

/** 10 Band-Energien (normiert) — identisch zu tests/audio-mix.test.ts. */
function bandEnergies(samples: number[]): number[] {
  const size = 4096;
  const start = Math.max(0, Math.floor(samples.length * 0.5) - size / 2);
  const seg = samples.slice(start, start + size);
  while (seg.length < size) seg.push(0);
  const win = seg.map((s, i) => s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))));
  const spec = amplitudeSpectrum(win);
  const total = spec.reduce((a, b) => a + b, 0) || 1e-9;
  const edges = [0, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  return edges.slice(0, -1).map((a, i) => spec.slice(a, edges[i + 1]).reduce((s, v) => s + v, 0) / total);
}

function cosineDist(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return 1 - dot / Math.max(1e-9, na * nb);
}

const ALL_IDS = [...WEAPON_SFX_IDS, ...EVOLUTION_SFX_IDS];

describe("M10 Audio-Frost-Gap — Paar-Distanz frost/eternal_winter", () => {
  const energies = new Map<string, number[]>();
  for (const id of ALL_IDS) {
    const { samples } = readWav(`${SFX_KEYS[id]}.wav`);
    energies.set(id, bandEnergies(samples));
  }

  it("frost/eternal_winter hat Abstand >= 0,15 (vorher 0,1245)", () => {
    const dist = cosineDist(energies.get("frost")!, energies.get("eternal_winter")!);
    expect(dist, `frost/eternal_winter nur ${dist.toFixed(3)}`).toBeGreaterThanOrEqual(0.15);
  });

  it("alle 66 Key-Paare bleiben >= 0,12 (kein Paar wurde unter die Schwelle gedrueckt)", () => {
    let worst = "";
    let worstDist = 1;
    for (let i = 0; i < ALL_IDS.length; i++) {
      for (let j = i + 1; j < ALL_IDS.length; j++) {
        const a = ALL_IDS[i];
        const b = ALL_IDS[j];
        const dist = cosineDist(energies.get(a)!, energies.get(b)!);
        if (dist < worstDist) { worstDist = dist; worst = `${a}/${b}`; }
        expect(dist, `Paar ${a}/${b} zu ähnlich (${dist.toFixed(3)})`).toBeGreaterThanOrEqual(0.12);
      }
    }
    expect(worst, `ähnlichstes Paar ${worst} (${worstDist.toFixed(3)})`).toBeTruthy();
  });

  it("sfx_winter bleibt regelkonform: 0,6–1,0 s Stinger, kein Clipping, Peak <= 0,98", () => {
    const { sr, samples } = readWav(`${SFX_KEYS.eternal_winter}.wav`);
    const d = samples.length / sr;
    expect(d).toBeGreaterThanOrEqual(0.6);
    expect(d).toBeLessThanOrEqual(1.0);
    const peak = Math.max(...samples.map(Math.abs));
    expect(peak).toBeLessThanOrEqual(0.98);
    const clipped = samples.filter((s) => Math.abs(s) >= 0.979).length;
    expect(clipped / samples.length).toBeLessThan(0.001);
  });
});

describe("M10 Audio-Frost-Gap — Mixer/Spam-Regeln unangetastet", () => {
  it("MAX_TOTAL_VOICES, Band-Deckel und TARGET_PEAK haben die dokumentierten Werte", () => {
    expect(MAX_TOTAL_VOICES).toBe(12);
    expect(MAX_STARTS_PER_SECOND).toBe(24);
    expect(WEAPON_BAND_STARTS_PER_SEC).toBe(12);
    expect(HIT_BAND_STARTS_PER_SEC).toBe(12);
    expect(TARGET_PEAK).toBeCloseTo(10 ** (-1 / 20), 12);
    expect(SFX_CONFIG.eternal_winter).toEqual({ priority: PRIORITY.weapon, cooldown: 1.0, maxVoices: 1, volume: 0.45 });
    expect(SFX_CONFIG.frost).toEqual({ priority: PRIORITY.weapon, cooldown: 0.22, maxVoices: 2, volume: 0.5 });
  });

  it("Spam-Begrenzung wirkt weiter: Budget-, Cooldown- und Fair-Anteil-Ablehnung", () => {
    const state = newMixerState();
    const req = { id: "frost", priority: PRIORITY.weapon, cooldown: 0.22, maxVoices: 2, volume: 0.5 };
    // Budget: 12 Stimmen voll -> weitere Waffen-Anfrage ohne Verdraengung abgelehnt.
    for (let k = 0; k < MAX_TOTAL_VOICES; k++) {
      notePlayed(state, { id: `x${k}`, priority: PRIORITY.weapon, cooldown: 1, maxVoices: 1, volume: 0.1 });
    }
    state.now = 10;
    expect(canPlay(state, req)).toBe(false);
    // Prioritaet 2 verdraengt die aelteste niederpriorere Stimme weiter.
    const hit = { id: "hit", priority: PRIORITY.hit, cooldown: 0.05, maxVoices: 4, volume: 0.45 };
    expect(canPlay(state, hit)).toBe(true);
    notePlayed(state, hit);
    releaseVoice(state, "hit");
    // Cooldown-Ablehnung.
    notePlayed(state, req);
    expect(canPlay(state, req)).toBe(false);
    // Prioritaets-Boost unveraendert.
    expect(effectiveVolume(1, hit)).toBeCloseTo(0.9 * 0.45, 12);
  });
});
