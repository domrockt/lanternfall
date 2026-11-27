#!/usr/bin/env node
// M10-audio-mix-chaos: synthetischer 500-Gegner-Chaos-Lauf fuer den SFX-Mix.
//
// Reines Node (kein Browser, kein flock — misst keine FPS). Es nutzt die ECHTE
// Mixer-Logik aus src/audio/mixing.ts (per --experimental-strip-types) und die
// per-SFX-Konfiguration (SFX_CONFIG) plus die rohen WAV-Samples:
//   - Voice-Starts/s (avg / p95 / max, je Band)
//   - gleichzeitige Voices (max / p95)
//   - gemessener Mix-Peak in dBFS (Sample-Superposition aller Stimmen)
//   - Clipping-Faelle (Sample-Wert >= 0 dBFS)
//   - sfxPlayed-Verteilung je Waffen-/Evolutions-Key (12/12 hoerbar?)
//
// Request-Raten (Spielzeit, Minute-25-Endgame, dokumentierte Baseline):
//   Waffen/Evos feuern mit 1/Cooldown (Dauerfeuer), Treffer ~53/s, Kills ~15/s,
//   XP ~15/s (aus shots/m10-feedback-budget-baseline.json: 26,5 Hits/Wall-Frame
//   bei timeScale 30 => ~53 Hits/Sekunde Spielzeit), Boss-Events seltener.
//
// Vorher/Nachher: Das Skript erkennt die neuen Funktionen (planPlay/limiterGain)
// per Feature-Detection und arbeitet sonst mit canPlay (Ist-Stand). Dadurch
// misst derselbe Skriptlauf "before" (nur Ablehnung, kein Limiter) und "after"
// (Fairness-Verdraengung + 24/s-Deckel + -1-dBFS-Limiter).
//
// Aufruf: node scripts/m10-audio-mix.mjs --out shots/m10-audio-mix-before.json
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Node < 22.18 braucht das Flag zum Typ-Stripping fuer den mixing.ts-Import.
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

const OUT = arg("out", "shots/m10-audio-mix-before.json");
const LABEL = arg("label", "before");
const SIM_SECONDS = Number(arg("seconds", 60));
const SEED = Number(arg("seed", 101));

const SR = 22050;
const DT = 1 / 60;
const MASTER_SFX = 1;

// Baseline-Raten im 500er-Chaos (Spielzeit), siehe Kopfkommentar.
const HITS_PER_SEC = 53;
const KILLS_PER_SEC = 15;
const XP_PER_SEC = 15;

const WEAPON_IDS = [
  "ember", "flail", "frost", "thorn", "storm", "lantern",
  "phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon",
];

// Deterministischer RNG (mulberry32).
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mixing = await import("../src/audio/mixing.ts");
const { newMixerState, canPlay, notePlayed, releaseVoice, effectiveVolume, PRIORITY } = mixing;
// Feature-Detection: Nachher-Verhalten (Fairness + Limiter) nur wenn vorhanden.
const planPlay = mixing.planPlay ?? null;
const limiterGain = mixing.limiterGain ?? null;
const TARGET_PEAK = mixing.TARGET_PEAK ?? 1;

const SFX_CONFIG = mixing.SFX_CONFIG;
if (!SFX_CONFIG) throw new Error("SFX_CONFIG fehlt in src/audio/mixing.ts");

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

const WAVS = new Map();
for (const [id, key] of Object.entries(mixing.SFX_KEYS ?? {})) WAVS.set(id, readWav(`${key}.wav`));
for (const [id, key] of Object.entries({
  hit: "sfx_hit", kill: "sfx_kill", xp: "sfx_xp", levelup: "sfx_levelup", chest: "sfx_chest",
  evolution: "sfx_evolution", bossWarn: "sfx_boss_warn", bossDeath: "sfx_boss_death",
  victory: "sfx_victory", defeat: "sfx_defeat",
})) if (!WAVS.has(id)) WAVS.set(id, readWav(`${key}.wav`));

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const percentile = (sorted, p) => {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)))];
};

// --- Synthetischer Chaos-Lauf -----------------------------------------------
const rand = rng(SEED);
const state = newMixerState();

const mixBuf = new Float64Array(Math.ceil(SIM_SECONDS * SR));
const endQueue = []; // { id, endAt, rec } sortiert nach endAt
const startsPerSec = new Array(SIM_SECONDS).fill(0);
const startsPerId = Object.fromEntries([...WEAPON_IDS, "hit", "kill", "xp"].map((id) => [id, 0]));
let concurrentMax = 0;
const concurrentSamples = [];
let rejected = { cooldown: 0, voices: 0, budget: 0, rate: 0, evicted: 0 };
let playedTotal = 0;
let evictTotal = 0;

/** Eine Stimme im Superpositions-Modell (Spiegel von state.active). */
function addVoiceSample(id, at, vol) {
  const { samples } = WAVS.get(id);
  const start = Math.round(at * SR);
  const end = Math.min(mixBuf.length, start + samples.length);
  for (let i = start; i < end; i++) mixBuf[i] += samples[i - start] * vol;
  endQueue.push({ id, endAt: at + samples.length / SR, vol });
  endQueue.sort((a, b) => a.endAt - b.endAt);
}

function processRequest(id, t) {
  const cfg = SFX_CONFIG[id];
  const req = {
    id, priority: cfg.priority, cooldown: cfg.cooldown,
    maxVoices: cfg.maxVoices, volume: cfg.volume,
  };
  // 1) Mischer-Entscheidung (vorher: canPlay, nachher: planPlay mit Verdraengung).
  let allow;
  let evict = null;
  if (planPlay) {
    const plan = planPlay(state, req);
    allow = plan.allow;
    evict = plan.evict ?? null;
  } else {
    allow = canPlay(state, req);
  }
  if (!allow) {
    if ((state.voices[id] ?? 0) >= req.maxVoices) rejected.voices += 1;
    else if (state.lastPlayed[id] !== undefined && state.now - state.lastPlayed[id] < req.cooldown) rejected.cooldown += 1;
    else rejected.budget += 1;
    return;
  }
  // 2) Verdraengung (AudioSystem stoppt die Stimme; hier: Freigabe + Buchung).
  if (evict) {
    releaseVoice(state, evict.id);
    evictTotal += 1;
  }
  // 3) Limiter: Summe aktiver Lautstaerken <= TARGET_PEAK (-1 dBFS) halten.
  let vol = effectiveVolume(MASTER_SFX, req);
  let scale = 1;
  if (limiterGain) {
    let sum = 0;
    for (const v of state.active) sum += v.volume;
    scale = limiterGain(sum, vol, TARGET_PEAK);
    if (scale < 1) for (const v of state.active) v.volume *= scale;
    vol *= scale;
    notePlayed(state, req, { volume: vol, scaleExisting: scale });
  } else {
    notePlayed(state, req);
  }
  addVoiceSample(id, t, vol);
  playedTotal += 1;
  startsPerId[id] = (startsPerId[id] ?? 0) + 1;
  startsPerSec[Math.min(SIM_SECONDS - 1, Math.floor(t))] += 1;
}

const frames = Math.floor(SIM_SECONDS / DT);
const hitAcc = { v: 0 };
const killAcc = { v: 0 };
const xpAcc = { v: 0 };
const cooldownAcc = Object.fromEntries(WEAPON_IDS.map((id) => [id, 0]));
// Seltene Events (feste Zeitpunkte, wie im Spiel: Bosse/Level-ups/Evolution).
const events = [
  { at: 8, id: "levelup" }, { at: 20, id: "evolution" }, { at: 30, id: "bossWarn" },
  { at: 45, id: "bossDeath" }, { at: 50, id: "evolution" }, { at: 58, id: "chest" },
];

for (let f = 0; f < frames; f++) {
  const t = f * DT;
  state.now = t;
  // Endende Stimmen freigeben (wie der complete-Listener in AudioSystem).
  while (endQueue.length && endQueue[0].endAt <= t) {
    releaseVoice(state, endQueue.shift().id);
  }
  // Waffen-/Evolutions-Dauerfeuer: Versuch mit Rate 1/Cooldown.
  for (const id of WEAPON_IDS) {
    cooldownAcc[id] += DT / SFX_CONFIG[id].cooldown;
    if (cooldownAcc[id] >= 1) {
      cooldownAcc[id] -= 1;
      processRequest(id, t);
    }
  }
  // Treffer/Kills/XP aus der Baseline (fraktionale Akkumulatoren).
  hitAcc.v += HITS_PER_SEC * DT;
  while (hitAcc.v >= 1) { hitAcc.v -= 1; processRequest("hit", t); }
  killAcc.v += KILLS_PER_SEC * DT;
  while (killAcc.v >= 1) { killAcc.v -= 1; processRequest("kill", t); }
  xpAcc.v += XP_PER_SEC * DT;
  while (xpAcc.v >= 1) { xpAcc.v -= 1; processRequest("xp", t); }
  for (const ev of events) if (Math.abs(t - ev.at) < DT / 2) processRequest(ev.id, t);

  concurrentMax = Math.max(concurrentMax, state.totalVoices);
  concurrentSamples.push(state.totalVoices);
}
// Nachlauf: Stimmen, die ueber das Sim-Ende hinaus laufen, ausmessen lassen.
const tailEnd = endQueue.length ? endQueue[endQueue.length - 1].endAt : 0;
const totalSamples = Math.min(mixBuf.length, Math.ceil(Math.max(SIM_SECONDS, tailEnd) * SR));

// --- Worst-Case-Burst: alle Stimmen-Slots aller 23 SFX belegen ---------------
// Jeder Sound startet maxVoices Stimmen, gestaffelt um seine Cooldown-Periode
// (so entstehen im Chaos tatsaechlich mehrere Stimmen je Sound). Alle 23 Sounds
// starten im selben Moment — die dichtestmoegliche Ueberlagerung, wie sie im
// 500er-Chaos bei einem simultanen Event (Boss + Level-up + Volldauerfeuer)
// kurzzeitig auftritt. Zeigt, ob der Mix clippt (vorher) bzw. ob der Limiter
// den Peak deckelt (nachher).
const burstState = newMixerState();
const burstBuf = new Float64Array(Math.ceil(3 * SR));
const burstEndQueue = [];
let burstVoices = 0;
function burstProcess(id, t) {
  const cfg = SFX_CONFIG[id];
  const req = { id, priority: cfg.priority, cooldown: cfg.cooldown, maxVoices: cfg.maxVoices, volume: cfg.volume };
  let allow;
  if (planPlay) allow = planPlay(burstState, req).allow;
  else allow = canPlay(burstState, req);
  if (!allow) return;
  let vol = effectiveVolume(MASTER_SFX, req);
  if (limiterGain) {
    let sum = 0;
    for (const v of burstState.active) sum += v.volume;
    const scale = limiterGain(sum, vol, TARGET_PEAK);
    if (scale < 1) for (const v of burstState.active) v.volume *= scale;
    vol *= scale;
    notePlayed(burstState, req, { volume: vol, scaleExisting: scale });
  } else {
    notePlayed(burstState, req);
  }
  const { samples } = WAVS.get(id);
  const start = Math.round(t * SR);
  for (let i = start; i < Math.min(burstBuf.length, start + samples.length); i++) {
    burstBuf[i] += samples[i - start] * vol;
  }
  burstEndQueue.push({ id, endAt: t + samples.length / SR });
  burstVoices += 1;
}
for (const [id, cfg] of Object.entries(SFX_CONFIG)) {
  for (let k = 0; k < cfg.maxVoices; k++) burstProcess(id, k * cfg.cooldown);
}
while (burstEndQueue.length) {
  const v = burstEndQueue.shift();
  releaseVoice(burstState, v.id);
}
let burstPeak = 0;
let burstClipping = 0;
for (let i = 0; i < burstBuf.length; i++) {
  const a = Math.abs(burstBuf[i]);
  if (a > burstPeak) burstPeak = a;
  if (a >= 1) burstClipping += 1;
}
const burstDbfs = 20 * Math.log10(Math.max(burstPeak, 1e-9));

// --- Auswertung --------------------------------------------------------------
let peak = 0;
let clippingSamples = 0;
for (let i = 0; i < totalSamples; i++) {
  const a = Math.abs(mixBuf[i]);
  if (a > peak) peak = a;
  if (a >= 1) clippingSamples += 1;
}
const peakDbfs = 20 * Math.log10(Math.max(peak, 1e-9));
const startsSorted = [...startsPerSec].sort((a, b) => a - b);
const concurrentSorted = [...concurrentSamples].sort((a, b) => a - b);
const idCounts = Object.entries(startsPerId).filter(([id]) => WEAPON_IDS.includes(id));
const minIdStarts = Math.min(...idCounts.map(([, n]) => n));
const missingIds = idCounts.filter(([, n]) => n === 0).map(([id]) => id);

const report = {
  schema: "m10-audio-mix-chaos/v1",
  label: LABEL,
  generatedAt: new Date().toISOString(),
  method: `synthetischer 500-Gegner-Chaos-Lauf (Minute 25): 60 s Spielzeit, ${WEAPON_IDS.length} Waffen-/Evo-Klaenge im Dauerfeuer, ${HITS_PER_SEC} Hits/s, ${KILLS_PER_SEC} Kills/s, ${XP_PER_SEC} XP/s, Master-SFX ${MASTER_SFX}; echte Mixer-Logik aus src/audio/mixing.ts + WAV-Superposition (${SR} Hz)`,
  sim: { seconds: SIM_SECONDS, seed: SEED, masterSfx: MASTER_SFX },
  mixerMode: planPlay ? "fairness+limiter (planPlay/limiterGain)" : "ist-Stand (canPlay, Ablehnung, kein Limiter)",
  voiceStarts: {
    total: playedTotal,
    perSecAvg: round(playedTotal / SIM_SECONDS),
    perSecP95: percentile(startsSorted, 95),
    perSecMax: startsSorted[startsSorted.length - 1],
    rejectedByCooldown: rejected.cooldown,
    rejectedByPerSoundVoices: rejected.voices,
    rejectedByBudget: rejected.budget,
    rejectedByRateCap: rejected.rate,
    evictions: evictTotal,
  },
  concurrentVoices: {
    max: concurrentMax,
    p95: percentile(concurrentSorted, 95),
    limit: mixing.MAX_TOTAL_VOICES,
  },
  mixPeak: {
    linear: round(peak, 4),
    dbfs: round(peakDbfs, 2),
    targetDbfs: -1,
    clippingSamples,
    clippingPctOfSamples: round((100 * clippingSamples) / totalSamples, 4),
    clippingCases: clippingSamples > 0 ? 1 : 0,
  },
  burstWorstCase: {
    method: "alle 23 SFX mit maxVoices-Stimmen im selben Moment gestartet (gestaffelt um Cooldown)",
    voicesStarted: burstVoices,
    linear: round(burstPeak, 4),
    dbfs: round(burstDbfs, 2),
    clippingSamples: burstClipping,
    clippingCases: burstClipping > 0 ? 1 : 0,
  },
  weaponAudibility: {
    perIdStarts: Object.fromEntries(idCounts),
    minStartsPerId: minIdStarts,
    audibleIds: idCounts.length - missingIds.length,
    missingIds,
  },
  jsErrors: [],
};

mkdirSync("shots", { recursive: true });
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  out: OUT, label: LABEL, mixerMode: report.mixerMode,
  voiceStartsPerSecAvg: report.voiceStarts.perSecAvg,
  voiceStartsPerSecMax: report.voiceStarts.perSecMax,
  concurrentVoicesMax: report.concurrentVoices.max,
  mixPeakDbfs: report.mixPeak.dbfs,
  clippingSamples: report.mixPeak.clippingSamples,
  burstPeakDbfs: report.burstWorstCase.dbfs,
  burstClippingSamples: report.burstWorstCase.clippingSamples,
  minStartsPerId: report.weaponAudibility.minStartsPerId,
  audibleIds: report.weaponAudibility.audibleIds,
}, null, 2));
