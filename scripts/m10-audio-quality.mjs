#!/usr/bin/env node
// M10-audio-quality-budget: Mix-Lauf je Qualitaetsstufe (500-Gegner-Chaos).
//
// Reines Node (kein Browser, kein flock — misst keine FPS). Dieselbe Methode
// wie scripts/m10-audio-mix.mjs (60 s Spielzeit Minute-25-Endgame: 12 Waffen-/
// Evo-Klaenge im Dauerfeuer, 53 Hits/s, 15 Kills/s, 15 XP/s, echte Mixer-Logik
// aus src/audio/mixing.ts + WAV-Superposition bei 22050 Hz), aber FUER JEDES
// QualityTier mit seinem Budget (audioBudgetFor): Stimmen-/Start-Budgets,
// Peak/Clipping, Band-Unterscheidbarkeit.
//
// Aufruf: node scripts/m10-audio-quality.mjs --out /pfad/zu/after-tiers.json
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
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

const OUT = arg("out", "shots/m10-audio-quality-after.json");
const SIM_SECONDS = Number(arg("seconds", 60));
const SEED = Number(arg("seed", 101));

const SR = 22050;
const DT = 1 / 60;
const MASTER_SFX = 1;
const HITS_PER_SEC = 53;
const KILLS_PER_SEC = 15;
const XP_PER_SEC = 15;

const WEAPON_IDS = [
  "ember", "flail", "frost", "thorn", "storm", "lantern",
  "phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon",
];

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t ^ (t >>> 14)) >>> 0;
    return t / 4294967296;
  };
}

const mixing = await import("../src/audio/mixing.ts");
const { newMixerState, planPlay, limiterGain, notePlayed, releaseVoice, effectiveVolume, TARGET_PEAK, SFX_CONFIG } = mixing;
if (typeof planPlay !== "function") throw new Error("planPlay fehlt in src/audio/mixing.ts");
const audioBudgetFor = mixing.audioBudgetFor ?? null;
if (!audioBudgetFor) throw new Error("audioBudgetFor fehlt — K2 muss zuerst committet sein");

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
for (const [id, key] of Object.entries(mixing.SFX_KEYS)) WAVS.set(id, readWav(`${key}.wav`));
for (const [id, key] of Object.entries({
  hit: "sfx_hit", kill: "sfx_kill", xp: "sfx_pickup_xp", levelup: "sfx_pickup_levelup", chest: "sfx_pickup_chest",
  evolution: "sfx_evolution", bossWarn: "sfx_boss_warn", bossDeath: "sfx_boss_death",
  victory: "sfx_victory", defeat: "sfx_defeat",
})) if (!WAVS.has(id)) WAVS.set(id, readWav(`${key}.wav`));

const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const percentile = (sorted, p) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const dbfs = (peak) => 20 * Math.log10(Math.max(peak, 1e-9));

function runTier(tier) {
  const budget = audioBudgetFor(tier);
  const rand = rng(SEED);
  void rand; // Seed festgehalten (deterministischer Strom via Akkumulatoren)
  const state = newMixerState();
  const mixBuf = new Float64Array(Math.ceil(SIM_SECONDS * SR));
  const endQueue = [];
  const startsPerSec = new Array(SIM_SECONDS).fill(0);
  const startsPerId = Object.fromEntries([...WEAPON_IDS, "hit", "kill", "xp"].map((id) => [id, 0]));
  let concurrentMax = 0;
  const concurrentSamples = [];
  let rejectedTotal = 0;
  let playedTotal = 0;

  function addVoiceSample(id, at, vol) {
    const { samples } = WAVS.get(id);
    const start = Math.round(at * SR);
    for (let i = start; i < Math.min(mixBuf.length, start + samples.length); i++) {
      mixBuf[i] += samples[i - start] * vol;
    }
    endQueue.push({ id, endAt: at + samples.length / SR });
  }

  function processRequest(id, t) {
    const cfg = SFX_CONFIG[id];
    const req = {
      id, priority: cfg.priority, cooldown: cfg.cooldown,
      maxVoices: cfg.maxVoices, volume: cfg.volume,
      pickup: id === "xp" || id === "powerup",
    };
    const plan = planPlay(state, req, budget);
    if (!plan.allow) { rejectedTotal += 1; return; }
    if (plan.evict) releaseVoice(state, plan.evict.id);
    let vol = effectiveVolume(MASTER_SFX, req);
    if (req.pickup) vol *= mixing.pickupDampGain(state, req);
    let sum = 0;
    for (const v of state.active) sum += v.volume;
    const scale = limiterGain(sum, vol, TARGET_PEAK);
    if (scale < 1) for (const v of state.active) v.volume *= scale;
    vol *= scale;
    notePlayed(state, req, { volume: vol, scaleExisting: scale });
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
  const events = [
    { at: 8, id: "levelup" }, { at: 20, id: "evolution" }, { at: 30, id: "bossWarn" },
    { at: 45, id: "bossDeath" }, { at: 50, id: "evolution" }, { at: 58, id: "chest" },
  ];

  for (let f = 0; f < frames; f++) {
    const t = f * DT;
    state.now = t;
    while (endQueue.length && endQueue[0].endAt <= t) releaseVoice(state, endQueue.shift().id);
    for (const id of WEAPON_IDS) {
      cooldownAcc[id] += DT / SFX_CONFIG[id].cooldown;
      if (cooldownAcc[id] >= 1) { cooldownAcc[id] -= 1; processRequest(id, t); }
    }
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
  const tailEnd = endQueue.length ? endQueue[endQueue.length - 1].endAt : 0;
  const totalSamples = Math.min(mixBuf.length, Math.ceil(Math.max(SIM_SECONDS, tailEnd) * SR));

  // Burst-Worst-Case wie im Muster-Skript: alle SFX mit maxVoices gestaffelt.
  const burstState = newMixerState();
  const burstBuf = new Float64Array(Math.ceil(3 * SR));
  let burstVoices = 0;
  function burstProcess(id, t) {
    const cfg = SFX_CONFIG[id];
    const req = { id, priority: cfg.priority, cooldown: cfg.cooldown, maxVoices: cfg.maxVoices, volume: cfg.volume };
    const plan = planPlay(burstState, req, budget);
    if (!plan.allow) return;
    if (plan.evict) releaseVoice(burstState, plan.evict.id);
    let vol = effectiveVolume(MASTER_SFX, req);
    let sum = 0;
    for (const v of burstState.active) sum += v.volume;
    const scale = limiterGain(sum, vol, TARGET_PEAK);
    if (scale < 1) for (const v of burstState.active) v.volume *= scale;
    vol *= scale;
    notePlayed(burstState, req, { volume: vol, scaleExisting: scale });
    const { samples } = WAVS.get(id);
    const start = Math.round(t * SR);
    for (let i = start; i < Math.min(burstBuf.length, start + samples.length); i++) {
      burstBuf[i] += samples[i - start] * vol;
    }
    burstVoices += 1;
  }
  for (const [id, cfg] of Object.entries(SFX_CONFIG)) {
    for (let k = 0; k < cfg.maxVoices; k++) burstProcess(id, k * cfg.cooldown);
  }
  let burstPeak = 0;
  let burstClipping = 0;
  for (let i = 0; i < burstBuf.length; i++) {
    const a = Math.abs(burstBuf[i]);
    if (a > burstPeak) burstPeak = a;
    if (a >= 1) burstClipping += 1;
  }

  let peak = 0;
  let clippingSamples = 0;
  for (let i = 0; i < totalSamples; i++) {
    const a = Math.abs(mixBuf[i]);
    if (a > peak) peak = a;
    if (a >= 1) clippingSamples += 1;
  }
  const startsSorted = [...startsPerSec].sort((a, b) => a - b);
  const concurrentSorted = [...concurrentSamples].sort((a, b) => a - b);
  const idCounts = Object.entries(startsPerId).filter(([id]) => WEAPON_IDS.includes(id));
  const weaponStarts = idCounts.reduce((a, [, n]) => a + n, 0);
  const pickupStarts = startsPerId.xp ?? 0;

  return {
    tier,
    budget: { ...budget },
    voiceStarts: {
      total: playedTotal,
      perSecAvg: round(playedTotal / SIM_SECONDS),
      perSecMax: startsSorted[startsSorted.length - 1],
      rejectedTotal,
    },
    concurrentVoices: { max: concurrentMax, p95: percentile(concurrentSorted, 95) },
    mixPeak: {
      linear: round(peak, 4),
      dbfs: round(dbfs(peak), 2),
      clippingSamples,
      clippingCases: clippingSamples > 0 ? 1 : 0,
    },
    burstWorstCase: {
      voicesStarted: burstVoices,
      dbfs: round(dbfs(burstPeak), 2),
      clippingSamples: burstClipping,
    },
    bands: {
      weaponBandStarts: weaponStarts,
      pickupBandStarts: pickupStarts,
      audibleWeaponIds: idCounts.filter(([, n]) => n > 0).length,
      missingWeaponIds: idCounts.filter(([, n]) => n === 0).map(([id]) => id),
    },
  };
}

const tiers = ["high", "medium", "low"];
const results = Object.fromEntries(tiers.map((t) => [t, runTier(t)]));
const report = {
  schema: "m10-audio-quality-budget/v1",
  generatedAt: new Date().toISOString(),
  method: `Mix-Lauf je QualityTier (Muster m10-audio-mix.mjs): 60 s Spielzeit Minute-25-Endgame, ${WEAPON_IDS.length} Waffen-/Evo-Klaenge im Dauerfeuer, ${HITS_PER_SEC} Hits/s, ${KILLS_PER_SEC} Kills/s, ${XP_PER_SEC} XP/s, Master-SFX ${MASTER_SFX}, Seed ${SEED}; audioBudgetFor(tier) aus src/audio/mixing.ts + WAV-Superposition (${SR} Hz)`,
  sim: { seconds: SIM_SECONDS, seed: SEED },
  tiers: results,
};
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(
  tiers.map((t) => {
    const r = results[t];
    return {
      tier: t,
      startsPerSecAvg: r.voiceStarts.perSecAvg,
      concurrentMax: r.concurrentVoices.max,
      mixPeakDbfs: r.mixPeak.dbfs,
      clipping: r.mixPeak.clippingCases + r.burstWorstCase.clippingSamples,
      burstVoices: r.burstWorstCase.voicesStarted,
      audibleWeaponIds: r.bands.audibleWeaponIds,
    };
  }),
  null,
  2,
));
