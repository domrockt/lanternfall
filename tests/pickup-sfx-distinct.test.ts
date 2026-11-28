// M10-pickup-sfx-distinct: K4-Test. Metrik-Funktionen textgleich aus
// tests/audio-mix.test.ts uebernommen (gleiche Pseudo-FFT, gleiche Bänder).
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs/path bereit.
import { readFileSync } from "node:fs";
// @ts-ignore
import { resolve } from "node:path";

declare const __dirname: string;
import { describe, expect, it } from "vitest";

import { SFX_KEYS } from "../src/audio/mixing";

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

export function bandEnergies(samples: number[], center = 0.5): number[] {
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

export function cosineDistance(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return 1 - dot / Math.max(1e-9, na * nb);
}

// ── Debug (K2): Waffen-Distanzen unter derselben Metrik — Referenzpunkte. ──
describe("DEBUG K2 Metrik-Referenz", () => {
  it("Waffen-Paare (Referenz)", () => {
    const ids = ["ember", "flail", "frost", "thorn", "storm", "lantern"] as const;
    const E: Record<string, number[]> = {};
    for (const id of ids) E[id] = bandEnergies(readWav(`sfx_${id}.wav`).samples);
    let min = 1; let mp = "";
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const d = cosineDistance(E[ids[i]], E[ids[j]]);
      if (d < min) { min = d; mp = `${ids[i]}/${ids[j]}`; }
    }
    console.log(`WEAPON min dist: ${min.toFixed(4)} (${mp})`);
    for (const id of ["xp", "levelup", "chest"] as const) {
      const e = bandEnergies(readWav(`${SFX_KEYS[id]}.wav`).samples);
      console.log(`${id}:`, e.map((v) => v.toFixed(3)).join(" "));
    }
    expect(true).toBe(true);
  });
});
