#!/usr/bin/env node
// M10-pickup-sfx-distinct: Paar-Distanz-Matrix der Pickup-Klasse + Voice-Last
// im 500-Gegner-Burst. Reines Node (kein Browser, kein flock — keine FPS).
//
// Nutzt die ECHTE Mixer-Logik aus src/audio/mixing.ts
// (--experimental-strip-types) und die rohen WAV-Samples:
//   1. Band-Distanzmatrix (8 Band-Energien, 1 - Kosinus — wie
//      tests/audio-mix.test.ts) ueber die Pickup-Klasse
//      (xp, powerup, levelup, chest). Fehlende WAVs (powerup vor K2)
//      werden gemeldet und uebersprungen.
//   2. Synthetischer 500er-Chaos-Lauf (60 s, Baseline-Raten wie
//      scripts/m10-audio-mix.mjs): Pickup-Voice-Starts/s, Ablehngruende
//      je Pickup-ID, gleichzeitige Voices, Mix-Peak dBFS, Clipping.
//
// Feature-Detection: neue Pickup-Klassen-Funktionen (PICKUP_SFX_IDS,
// pickupDampGain) werden erkannt, wenn vorhanden — derselbe Lauf misst
// damit "before" und "after" vergleichbar.
//
// Aufruf: node scripts/m10-pickup-sfx.mjs --label before --out <pfad>.json
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

if (!process.execArgv.some((a) => a.includes("experimental-strip-types"))) {
  const self = fileURLToPath(import.meta.url);
  const r = spawnSync(process.execPath, ["--experimental-strip-types", self, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  process.exit(r.status ?? 1);
}

function arg(name, fallback) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const LABEL = arg("label", "before");
const OUT = arg("out", "");
const SIM_SECONDS = Number(arg("seconds", 60));
const SEED = Number(arg("seed", 411));
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const mixing = await import("../src/audio/mixing.ts");
const { newMixerState, canPlay, notePlayed, releaseVoice, effectiveVolume, planPlay, limiterGain, TARGET_PEAK, SFX_CONFIG } = mixing;
if (!SFX_CONFIG) throw new Error("SFX_CONFIG fehlt in src/audio/mixing.ts");
const PICKUP_IDS = mixing.PICKUP_SFX_IDS ?? ["xp", "powerup", "levelup", "chest"];

const SR = 22050;
const DT = 1 / 60;
const MASTER_SFX = 1;

// Baseline-Raten im 500er-Chaos (Spielzeit), wie scripts/m10-audio-mix.mjs.
const HITS_PER_SEC = 53;
const KILLS_PER_SEC = 15;
const XP_PER_SEC = 15;

const WEAPON_IDS = [
  "ember", "flail", "frost", "thorn", "storm", "lantern",
  "phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon",
];

// ── WAV / Spektrum ───────────────────────────────────────────────────────────
function readWav(file) {
  const buf = readFileSync2(`${file}`);
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
import { readFileSync } from "node:fs";
function readFileSync2(p) { return readFileSync(resolve(REPO, "public/sfx", p)); }

function amplitudeSpectrum(samples) {
  const n = samples.length;
  const re = Float64Array.from(samples);
  const im = new Float64Array(n);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let k = 0; k < len; k += len) {
      const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
      for (let i = k; i < k + len / 2; i++) {
        const ur = re[i], ui = im[i];
        const vr = re[i + len / 2] * wr - im[i + len / 2] * wi;
        const vi = re[i + len / 2] * wi + im[i + len / 2] * wr;
        re[i + len / 2] = ur - vr; im[i + len / 2] = ui - vi;
        re[i] = ur + vr; im[i] = ui + vi;
      }
    }
  }
  const out = new Array(n / 2);
  for (let i = 0; i < n / 2; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}

/** 8 Band-Energien (normiert), wie tests/audio-mix.test.ts (Mitte des Sounds). */
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

// ── 1) Paar-Distanzmatrix der Pickup-Klasse ─────────────────────────────────
const wavFiles = {};
const missing = [];
for (const id of PICKUP_IDS) {
  const key = mixing.SFX_KEYS?.[id] ?? { xp: "sfx_xp", levelup: "sfx_levelup", chest: "sfx_chest" }[id];
  if (!key) { missing.push(id); continue; }
  if (existsSync(resolve(REPO, "public/sfx", `${key}.wav`))) wavFiles[id] = `${key}.wav`;
  else missing.push(id);
}
const energies = new Map();
for (const [id, file] of Object.entries(wavFiles)) energies.set(id, bandEnergies(readWav(file).samples));
const ids = Object.keys(wavFiles);
const pairs = [];
let minDist = Infinity;
let minPair = null;
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const d = 1 - cosine(energies.get(ids[i]), energies.get(ids[j]));
    pairs.push({ a: ids[i], b: ids[j], dist: Math.round(d * 1000) / 1000 });
    if (d < minDist) { minDist = d; minPair = `${ids[i]}/${ids[j]}`; }
  }
}

// ── 2) Chaos-Lauf: Voice-Last der Pickup-Klasse ─────────────────────────────
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t ^ (t >>> 7), t | 0);
    t = Math.imul(t ^ (t >>> 16), 2246822507) ^ Math.imul(t ^ (t >>> 13), 3266489909);
    return ((t ^= t >>> 16) >>> 0) / 4294967296;
  };
}
const rand = rng(SEED);
const state = newMixerState();
const mixBuf = new Float64Array(Math.ceil(SIM_SECONDS * SR));
const endQueue = [];
const pickupStartsPerSec = new Array(SIM_SECONDS).fill(0);
const startsPerId = {};
const rejectedByPickup = Object.fromEntries(PICKUP_IDS.map((id) => [id, { cooldown: 0, voices: 0, budget: 0, rate: 0, rateFair: 0, total: 0 }]));
let pickupPlayed = 0;
let pickupRequested = 0;
let concurrentMax = 0;

function processRequest(id, t) {
  const cfg = SFX_CONFIG[id];
  if (!cfg) return; // fehlender Sound (z. B. powerup vor K2) — im Burst uebersprungen
  const isPickup = PICKUP_IDS.includes(id);
  const req = {
    id, priority: cfg.priority, cooldown: cfg.cooldown,
    maxVoices: cfg.maxVoices, volume: cfg.volume,
    ...(isPickup && mixing.PICKUP_SFX_IDS ? { pickup: true } : {}),
  };
  const plan = planPlay(state, req);
  if (!plan.allow) {
    const r = plan.reason ?? "budget";
    if (isPickup) { rejectedByPickup[id][r] = (rejectedByPickup[id][r] ?? 0) + 1; rejectedByPickup[id].total += 1; }
    return;
  }
  if (plan.evict) releaseVoice(state, plan.evict.id);
  // Daempfung bei Massen-Events (nach K3): pickupDampGain auf Pickup-Klasse.
  let vol = effectiveVolume(MASTER_SFX, req);
  let scale = 1;
  let damp = 1;
  if (isPickup && mixing.pickupDampGain) {
    damp = mixing.pickupDampGain(state, req);
    vol *= damp;
  }
  let sum = 0;
  for (const v of state.active) sum += v.volume;
  scale = limiterGain(sum, vol, TARGET_PEAK);
  if (scale < 1) for (const v of state.active) v.volume *= scale;
  vol *= scale;
  notePlayed(state, req, { volume: vol, scaleExisting: scale });
  // WAV in den Mix-Puffer superponieren (Clipping-Messung).
  const w = wavFiles[id] ? readWav(wavFiles[id]) : null;
  if (w) {
    const start = Math.round(t * SR);
    const end = Math.min(mixBuf.length, start + w.samples.length);
    for (let i = start; i < end; i++) mixBuf[i] += w.samples[i - start] * vol;
    endQueue.push({ id, endAt: t + w.samples.length / SR });
    endQueue.sort((a, b) => a.endAt - b.endAt);
  } else {
    endQueue.push({ id, endAt: t + 0.2, vol });
    endQueue.sort((a, b) => a.endAt - b.endAt);
  }
  if (isPickup) {
    pickupPlayed += 1;
    pickupStartsPerSec[Math.min(SIM_SECONDS - 1, Math.floor(t))] += 1;
    startsPerId[id] = (startsPerId[id] ?? 0) + 1;
  }
}

const frames = Math.floor(SIM_SECONDS / DT);
const acc = Object.fromEntries([...WEAPON_IDS, "hit", "kill", "xp", "powerup"].map((id) => [id, 0]));
// Seltene Events (im Spiel pausiert der Run — deshalb fixe, duenn gesäte Zeitpunkte).
const events = [
  { at: 8, id: "levelup" }, { at: 20, id: "powerup" }, { at: 30, id: "chest" },
  { at: 45, id: "powerup" }, { at: 58, id: "chest" },
];
let levelupPlayed = 0, chestPlayed = 0, powerupPlayedStandalone = 0;

for (let f = 0; f < frames; f++) {
  const t = f * DT;
  state.now = t;
  while (endQueue.length && endQueue[0].endAt <= t) releaseVoice(state, endQueue.shift().id);
  for (const id of WEAPON_IDS) {
    acc[id] += DT / SFX_CONFIG[id].cooldown;
    if (acc[id] >= 1) { acc[id] -= 1; processRequest(id, t); }
  }
  acc.hit += HITS_PER_SEC * DT;
  while (acc.hit >= 1) { acc.hit -= 1; processRequest("hit", t); }
  acc.kill += KILLS_PER_SEC * DT;
  while (acc.kill >= 1) { acc.kill -= 1; processRequest("kill", t); }
  acc.xp += XP_PER_SEC * DT;
  while (acc.xp >= 1) { acc.xp -= 1; processRequest("xp", t); }
  for (const ev of events) if (Math.abs(t - ev.at) < DT / 2) processRequest(ev.id, t);
  concurrentMax = Math.max(concurrentMax, state.totalVoices);
}

// Mix-Auswertung
let peak = 0;
let clipped = 0;
for (let i = 0; i < mixBuf.length; i++) {
  const a = Math.abs(mixBuf[i]);
  if (a > peak) peak = a;
  if (a >= 1) clipped += 1;
}
const sorted = [...pickupStartsPerSec].sort((a, b) => a - b);
const percentile = (arr, p) => arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] ?? 0;
const dB = (v) => Math.round(20 * Math.log10(Math.max(1e-9, v)) * 100) / 100;

const result = {
  label: LABEL,
  seed: SEED,
  simSeconds: SIM_SECONDS,
  rates: { hitsPerSec: HITS_PER_SEC, killsPerSec: KILLS_PER_SEC, xpPerSec: XP_PER_SEC },
  pickupClass: {
    ids: PICKUP_IDS,
    features: {
      PICKUP_SFX_IDS: Boolean(mixing.PICKUP_SFX_IDS),
      pickupDampGain: Boolean(mixing.pickupDampGain),
    },
  },
  matrix: {
    files: wavFiles,
    missing,
    pairs,
    minPair,
    minDist: Math.round(minDist * 1000) / 1000,
    threshold: 0.15,
    pass: missing.length === 0 && pairs.length === 6 && minDist >= 0.15,
  },
  chaos: {
    pickupRequested: Math.round(XP_PER_SEC * SIM_SECONDS),
    pickupPlayed,
    pickupRejectedTotal: Object.values(rejectedByPickup).reduce((s, r) => s + r.total, 0),
    rejectedByPickup,
    startsPerId,
    pickupStartsPerSec: {
      avg: Math.round((pickupStartsPerSec.reduce((a, b) => a + b, 0) / SIM_SECONDS) * 100) / 100,
      p95: percentile(sorted, 95),
      max: sorted[sorted.length - 1],
    },
    concurrentVoices: { max: concurrentMax },
    mixPeakDbfs: dB(peak),
    clippedSamples: clipped,
  },
};

if (OUT) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`geschrieben: ${OUT}`);
}
console.log(JSON.stringify(result, null, 2));
