#!/usr/bin/env node
// m10-audio-frost-gap: Paar-Distanz-Matrix aller 66 Waffen-/Evolutions-Paare.
//
// Reines Node (kein Browser, kein flock — misst keine FPS). Metrik identisch zu
// tests/audio-mix.test.ts: 10 Band-Energien (4096er-Hann-Fenster in der WAV-
// Mitte, Bandkanten [0,4,8,...,2048] Bins @22050 Hz, normiert) und
// Kosinus-Distanz 1 - cos(a,b). Schreibt alle 66 Paare + die engsten Paare.
//
// Aufruf: node scripts/m10-audio-frost-gap.mjs --out shots/m10-audio-frost-gap-matrix-before.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
const OUT = arg("out", "shots/m10-audio-frost-gap-matrix-before.json");

/** 16-bit mono PCM lesen (wie scripts/gen_sfx.py schreibt). */
function readWav(file) {
  const buf = readFileSync(`public/sfx/${file}`);
  if (buf.toString("ascii", 0, 4) !== "RIFF") throw new Error(`kein RIFF: ${file}`);
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
  const samples = new Float32Array(dataLen / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(dataOffset + i * 2) / 32768;
  return { sr, samples };
}

function amplitudeSpectrum(seg) {
  const n = seg.length;
  const re = [...seg];
  const im = new Array(n).fill(0);
  // Bit-Reversal-Permutation
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
  const out = new Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

/** 10 Band-Energien (normiert), identisch zu tests/audio-mix.test.ts. */
function bandEnergies(samples) {
  const size = 4096;
  const start = Math.max(0, Math.floor(samples.length * 0.5) - size / 2);
  const seg = Array.from(samples.slice(start, start + size));
  while (seg.length < size) seg.push(0);
  const win = seg.map((s, i) => s * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1))));
  const spec = amplitudeSpectrum(win);
  const total = spec.reduce((a, b) => a + b, 0) || 1e-9;
  const edges = [0, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];
  return edges.slice(0, -1).map((a, i) => spec.slice(a, edges[i + 1]).reduce((s, v) => s + v, 0) / total);
}

function cosine(a, b) {
  const dot = a.reduce((s, v, i) => s + v * b[i], 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return dot / Math.max(1e-9, na * nb);
}

const IDS = [
  "ember", "flail", "frost", "thorn", "storm", "lantern",
  "phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon",
];
const KEYS = {
  ember: "sfx_ember", flail: "sfx_flail", frost: "sfx_frost", thorn: "sfx_thorn",
  storm: "sfx_storm", lantern: "sfx_lantern", phoenix: "sfx_phoenix",
  wrath_pendulum: "sfx_wrath", eternal_winter: "sfx_winter", thorn_storm: "sfx_thornstorm",
  thunder_seal: "sfx_seal", soul_beacon: "sfx_soul",
};

const energies = new Map();
const durations = new Map();
for (const id of IDS) {
  const { sr, samples } = readWav(`${KEYS[id]}.wav`);
  energies.set(id, bandEnergies(samples));
  durations.set(id, Math.round((samples.length / sr) * 1000) / 1000);
}

const pairs = [];
for (let i = 0; i < IDS.length; i++) {
  for (let j = i + 1; j < IDS.length; j++) {
    const a = IDS[i];
    const b = IDS[j];
    pairs.push({ a, b, dist: Math.round((1 - cosine(energies.get(a), energies.get(b))) * 10000) / 10000 });
  }
}
pairs.sort((x, y) => x.dist - y.dist);
const bands = Object.fromEntries([...energies].map(([id, e]) => [id, e.map((v) => Math.round(v * 10000) / 10000)]));

const report = {
  schema: "m10-audio-frost-gap/v1",
  generatedAt: new Date().toISOString(),
  method: "10 Band-Energien (4096er-Hann-Fenster WAV-Mitte, Kanten [0,4,8,16,32,64,128,256,512,1024,2048] Bins @22050 Hz, normiert), Kosinus-Distanz — identisch zu tests/audio-mix.test.ts",
  thresholds: { minPairDist: 0.12, frostWinterTarget: 0.15 },
  durationsSec: Object.fromEntries(durations),
  bandEnergies: bands,
  pairs,
  closest: pairs.slice(0, 8),
  minPair: pairs[0],
  frostWinter: pairs.find((p) => (p.a === "frost" && p.b === "eternal_winter") || (p.b === "frost" && p.a === "eternal_winter")),
};

mkdirSync("shots", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
const below = pairs.filter((p) => p.dist < 0.12);
console.log(JSON.stringify({
  out: OUT,
  minPair: report.minPair,
  frostWinter: report.frostWinter,
  pairsBelow012: below,
  countPairs: pairs.length,
}, null, 2));
