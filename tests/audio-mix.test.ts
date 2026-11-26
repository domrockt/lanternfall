import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

// AudioSystem imports Phaser nur für Typen/Sound-API; im Node-Test genügt ein Stub.
vi.mock("phaser", () => ({ default: {} }));

import {
  AudioSystem, EVOLUTION_SFX_IDS, SFX_CONFIG, SFX_KEYS, WEAPON_SFX_IDS,
} from "../src/audio/AudioSystem";
import { MAX_TOTAL_VOICES, PRIORITY, canPlay, effectiveVolume, newMixerState, notePlayed } from "../src/audio/mixing";

const SFX_DIR = resolve(__dirname, "../public/sfx");

/** Minimaler WAV-Leser: 16-bit mono PCM, wie scripts/gen_sfx.py ihn schreibt. */
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

/** Iterative Cooley-Tukey-FFT (in-place). Liefert Amplitudenspektrum. */
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

/** 8 Band-Energien (normiert) als grobe Spektral-Signatur. */
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

function cosine(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / Math.max(1e-9, na * nb);
}

function duration(samples: number[], sr: number): number {
  return samples.length / sr;
}

/** Grobe Pitch-Richtung: Spektral-Centroid erstes vs. letztes Drittel. */
function pitchTrend(samples: number[], sr: number): "rising" | "falling" | "flat" {
  const cent = (seg: number[]): number => {
    const size = 1024;
    const s = seg.slice(0, size);
    while (s.length < size) s.push(0);
    const win = s.map((v, i) => v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))));
    const spec = amplitudeSpectrum(win);
    const total = spec.reduce((a, b) => a + b, 0) || 1e-9;
    const binHz = sr / size;
    return spec.reduce((acc, v, i) => acc + i * binHz * v, 0) / total;
  };
  const third = Math.max(64, Math.floor(samples.length / 3));
  const ratio = cent(samples.slice(-third)) / Math.max(1e-9, cent(samples.slice(0, third)));
  return ratio > 1.12 ? "rising" : ratio < 0.89 ? "falling" : "flat";
}

const ALL_IDS = [...WEAPON_SFX_IDS, ...EVOLUTION_SFX_IDS];

describe("M10 Audio-Distinct — Mapping und WAVs", () => {
  it("12 Waffen-/Evolutions-Keys sind gemappt und die WAVs existieren", () => {
    expect(WEAPON_SFX_IDS).toHaveLength(6);
    expect(EVOLUTION_SFX_IDS).toHaveLength(6);
    expect(ALL_IDS).toHaveLength(12);
    for (const id of ALL_IDS) {
      expect(SFX_KEYS[id], `SFX_KEYS fehlt ${id}`).toBeTruthy();
      const data = readWav(`${SFX_KEYS[id]}.wav`);
      expect(data.samples.length, `${id} ist leer`).toBeGreaterThan(2205);
    }
  });

  it("Basis-Treffer sind kurz (<0,4 s), Evolutions-Stinger 0,6–1,0 s mit Aufwärts-Glissando", () => {
    for (const id of WEAPON_SFX_IDS) {
      const { sr, samples } = readWav(`${SFX_KEYS[id]}.wav`);
      expect(duration(samples, sr), `${id} zu lang`).toBeLessThan(0.4);
    }
    for (const id of EVOLUTION_SFX_IDS) {
      const { sr, samples } = readWav(`${SFX_KEYS[id]}.wav`);
      const d = duration(samples, sr);
      expect(d, `${id} Stinger zu kurz`).toBeGreaterThanOrEqual(0.6);
      expect(d, `${id} Stinger zu lang`).toBeLessThanOrEqual(1.0);
      expect(pitchTrend(samples, sr), `${id} ohne Aufwärts-Glissando`).toBe("rising");
    }
  });

  it("kein Clipping: Peak <= 0,98, Anteil voll ausgesteuerter Samples < 0,1 %", () => {
    for (const id of ALL_IDS) {
      const { samples } = readWav(`${SFX_KEYS[id]}.wav`);
      const peak = Math.max(...samples.map(Math.abs));
      expect(peak, `${id} clipped`).toBeLessThanOrEqual(0.98);
      const clipped = samples.filter((s) => Math.abs(s) >= 0.979).length;
      expect(clipped / samples.length, `${id} zu viele Vollausschläge`).toBeLessThan(0.001);
    }
  });

  it("alle 66 Key-Paare klingen spektral verschieden (Band-Distanz >= 0,12)", () => {
    const energies = new Map<string, number[]>();
    for (const id of ALL_IDS) {
      const { samples } = readWav(`${SFX_KEYS[id]}.wav`);
      energies.set(id, bandEnergies(samples));
    }
    let worst = "";
    let worstDist = 1;
    for (let i = 0; i < ALL_IDS.length; i++) {
      for (let j = i + 1; j < ALL_IDS.length; j++) {
        const a = ALL_IDS[i];
        const b = ALL_IDS[j];
        const dist = 1 - cosine(energies.get(a)!, energies.get(b)!);
        if (dist < worstDist) { worstDist = dist; worst = `${a}/${b}`; }
        expect(dist, `Paar ${a}/${b} zu ähnlich (${dist.toFixed(3)})`).toBeGreaterThanOrEqual(0.12);
      }
    }
    expect(worst, `ähnlichstes Paar ${worst} (${worstDist.toFixed(3)})`).toBeTruthy();
  });
});

describe("M10 Audio-Distinct — Mixer und Mute", () => {
  it("Lautstärken liegen in [0,1] und Respektieren Master × Priorität", () => {
    for (const id of ALL_IDS) {
      const cfg = SFX_CONFIG[id];
      expect(cfg.volume).toBeGreaterThanOrEqual(0);
      expect(cfg.volume).toBeLessThanOrEqual(1);
      expect(effectiveVolume(1, { id, ...cfg })).toBeGreaterThanOrEqual(0);
      expect(effectiveVolume(1, { id, ...cfg })).toBeLessThanOrEqual(1);
    }
    expect(effectiveVolume(0, { id: "ember", ...SFX_CONFIG.ember })).toBe(0);
  });

  it("Spam niederpriorer Waffen verdrängt keine hohe Priorität", () => {
    const st = newMixerState();
    st.now = 10;
    const weapon = { id: "spam_w", priority: PRIORITY.weapon, cooldown: 0, maxVoices: 99, volume: 0.5 };
    for (let i = 0; i < MAX_TOTAL_VOICES; i++) {
      expect(canPlay(st, weapon)).toBe(true);
      notePlayed(st, weapon);
    }
    expect(st.totalVoices).toBe(MAX_TOTAL_VOICES);
    // Budget voll: Waffen-Spam wird verworfen ...
    expect(canPlay(st, weapon)).toBe(false);
    // ... Boss/Warnung dürfen weiter spielen und verdrängen niemanden.
    const boss = { id: "boss", priority: PRIORITY.boss, cooldown: 0, maxVoices: 1, volume: 0.9 };
    expect(canPlay(st, boss)).toBe(true);
    notePlayed(st, boss);
    expect(st.totalVoices).toBe(MAX_TOTAL_VOICES + 1);
    expect(st.voices.spam_w).toBe(MAX_TOTAL_VOICES);
    expect(canPlay(st, weapon)).toBe(false);
  });

  it("Master-Mute blockt jeden SFX-Request", () => {
    const played: string[] = [];
    const game = {
      sound: {
        add: (key: string) => ({
          setVolume: () => {},
          play: () => { played.push(key); return true; },
          once: () => {},
        }),
      },
    } as unknown as ConstructorParameters<typeof AudioSystem>[0];
    const audio = new AudioSystem(game);
    for (const id of ALL_IDS) expect(audio.play(id), `unmuted ${id}`).toBe(true);
    expect(played).toHaveLength(12);
    audio.setMuted(true);
    for (const id of [...ALL_IDS, "hit", "levelup", "evolution"]) {
      expect(audio.play(id), `muted ${id} darf nicht spielen`).toBe(false);
    }
    expect(audio.debugState().muted).toBe(true);
    expect(played).toHaveLength(12);
  });
});
