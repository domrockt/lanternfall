#!/usr/bin/env node
// M10-quality-stacked-smoke (K1/K2): Integrativer Smoke ueber die gestapelte
// Qualitaetsstufen-Kette (audio-budget + hazard-budget + thermal-guard +
// thermal-wiring). NUR-MESS-Lane: konsumiert harness.mjs, aendert nichts.
//
// Ablauf:
//   A0 Burst-Tor        ~500 Gegner Minute 3, 15 s, Gate >= 55 FPS (wie perf.mjs)
//   A1 Minute-25-Ref    skipTo(1500), 20 s Referenz
//   B  Drosselphase     CDP-CPU-Throttle, 1-Hz-Timeline bis thermal engagiert
//                       + 40 s Cap-Beobachtung (low/thermal wirksam?)
//   C  Erholungsphase   Throttle aus, 1-Hz-Timeline bis high zurueck (oder
//                       5 min -> ehrlicher Befund "Erholung unvollstaendig")
//
// Lasthaltung wie perf.mjs: In-Page-rAF-Loop haelt 500 Gegner (Basiswaffen Lv8,
// keine Evolutions-Insta-Kills). Belege (NICHT ins git, Dom-Regel 27.11.):
// JSON nach ~/games/.evidence/m10-quality-stacked-smoke/ (--out ueberschreibbar).
// Start IMMER mit flock /home/ai/games/.lf-perf.lock.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const THROTTLE = Number(argOf("throttle", "8")) || 8;
const OUT = resolve(argOf("out", `${homedir()}/games/.evidence/m10-quality-stacked-smoke`).replace(/^~(?=\/|$)/, homedir()));
const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const TARGET_ENEMIES = 500;

ensureBuild();
mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push({ at: Date.now(), text: String(e) }));
page.on("console", (m) => { if (m.type() === "error") errors.push({ at: Date.now(), text: m.text() }); });

// WebGL-Renderer-String (Pflicht, Regel 6): eigener Offscreen-Kontext, gleiche GPU.
const rendererString = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") ?? c.getContext("webgl");
  if (!gl) return "no-webgl";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
});

const summary = { startedAt: new Date().toISOString(), renderer: rendererString, throttle: THROTTLE, gates: {}, findings: [] };
let timeline = [];
let lastTier = null;
let lastBase = null;
const transitions = [];
const noteTiers = (s) => {
  if (s.effTier !== lastTier && s.effTier != null) {
    transitions.push({ t: s.t, kind: "effective", from: lastTier, to: s.effTier, fpsEwma: s.fpsEwma });
    lastTier = s.effTier;
  }
  if (s.baseTier !== lastBase && s.baseTier != null) {
    transitions.push({ t: s.t, kind: "base", from: lastBase, to: s.baseTier, fpsEwma: s.fpsEwma });
    lastBase = s.baseTier;
  }
};

// --- In-Page Sensoren ---------------------------------------------------------

const senseOnce = () => page.evaluate(() => {
  const dbg = window.__rbDbg ?? {};
  const s = window.__lf?.state?.() ?? {};
  const audio = window.__lf?.audio?.() ?? {};
  let addChildren = -1;
  let addMaxArea = -1;
  let warnDiscs = -1;
  let warnRings = -1;
  try {
    const scene = window.__game?.scene?.getScene?.("run");
    if (scene) {
      const list = scene.children?.list ?? [];
      addChildren = 0;
      addMaxArea = 0;
      warnDiscs = 0;
      warnRings = 0;
      for (const c of list) {
        const key = c.texture?.key ?? "";
        if (c.blendMode === 1 && c.visible !== false) {
          addChildren++;
          const area = (c.displayWidth ?? 0) * (c.displayHeight ?? 0);
          if (area > addMaxArea) addMaxArea = area;
        }
        if (key.startsWith("hazard_disc_r") && c.visible) warnDiscs++;
        if (key.startsWith("hazard_ring_r") && c.visible) warnRings++;
      }
    }
  } catch { /* Szene noch nicht da */ }
  return {
    t: Date.now(),
    fpsEwma: Math.round((dbg.fps ?? 0) * 10) / 10,
    fpsLoop: s.fps ?? null,
    baseTier: dbg.quality ?? null,
    effTier: s.quality ?? null,
    qualityState: dbg.qualityState ?? null,
    thermalState: dbg.thermalState ?? null,
    enemies: s.enemies ?? 0,
    time: s.time ?? 0,
    paused: s.paused ?? null,
    damageLabels: s.damageNumbers ?? null,
    audioVoices: audio.voices ?? null,
    audioSfxPlayed: audio.sfxPlayed ?? null,
    addChildren,
    addMaxArea: Math.round(addMaxArea),
    warnDiscs,
    warnRings,
  };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Lasthaltung wie perf.mjs: In-Page-rAF-Loop haelt TARGET_ENEMIES aktiv. */
async function startLoadKeeper() {
  await page.evaluate((target) => {
    if (window.__lfLoadKeeper) return;
    let lastSpawn = performance.now();
    const tick = (now) => {
      if (now - lastSpawn >= 50) {
        lastSpawn = now;
        const active = window.__lf.stats().enemies;
        const deficit = target - active;
        if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
      }
      window.__lfLoadKeeper = requestAnimationFrame(tick);
    };
    window.__lfLoadKeeper = requestAnimationFrame(tick);
  }, TARGET_ENEMIES);
}

/** Manueller Wartepunkt mit Diagnose (statt blindem waitForFunction-Timeout). */
async function waitDiag(name, fn, timeoutMs) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeoutMs) {
    last = await page.evaluate(() => {
      const s = window.__lf?.state?.() ?? {};
      const dbg = window.__rbDbg ?? {};
      return { enemies: s.enemies ?? null, time: s.time ?? null, paused: s.paused ?? null, levelUpOpen: s.levelUpOpen ?? null, scene: s.scene ?? null, quality: s.quality ?? null, fps: dbg.fps ?? null };
    });
    if (fn(last)) return last;
    await sleep(500);
  }
  summary.findings.push({ severity: "blocker", text: `Wartepunkt "${name}" Timeout nach ${timeoutMs} ms — letzter Zustand: ${JSON.stringify(last)}` });
  throw new Error(`waitDiag(${name}) timeout: ${JSON.stringify(last)}`);
}

/** 1-Hz-Timeline bis stop() true oder Timeout. Haelt den Run am Leben:
 *  Sim-Zeit >= 1780 s -> skipTo(1500) (sonst endet der Run bei 30:00 mitten
 *  in Phase B/C: Results-Szene, LoadKeeper-Fehler, Sensoren lesen 0). */
async function sampleLoop(stop, maxMs, label) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const s = await senseOnce();
    s.phase = label;
    timeline.push(s);
    noteTiers(s);
    if ((s.time ?? 0) >= 1780) await page.evaluate(() => { window.__lf.skipTo(1500); });
    if (stop(s)) return s;
    await sleep(1000);
  }
  return timeline[timeline.length - 1];
}

const snapOf = (samples) => samples.length === 0 ? null : ({
  n: samples.length,
  tier: samples[0]?.effTier,
  damageLabelsMax: Math.max(...samples.map((s) => s.damageLabels ?? 0)),
  audioVoicesMax: Math.max(...samples.map((s) => s.audioVoices ?? 0)),
  addChildrenMed: samples.map((s) => s.addChildren).sort((a, b) => a - b)[Math.floor(samples.length / 2)],
  addMaxAreaMax: Math.max(...samples.map((s) => s.addMaxArea ?? 0)),
  warnDiscsMax: Math.max(...samples.map((s) => s.warnDiscs ?? 0)),
});

// --- Run ---------------------------------------------------------------------

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
  await startRun(page);
  await page.evaluate(({ weapons, passives }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of weapons) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
  }, { weapons: WEAPONS, passives: PASSIVES });
  await startLoadKeeper();

  // A0 Burst-Tor: ~500 Gegner bei Minute 3, normale Zeit, 15 s (wie perf.mjs).
  await page.evaluate(() => { window.__lf.skipTo(150); });
  await waitDiag("burst-enemies", (s) => (s.enemies ?? 0) >= 400, 30000);
  const burst = [];
  const bEnd = Date.now() + 15000;
  while (Date.now() < bEnd) { burst.push(await senseOnce()); await sleep(500); }
  for (const s of burst) { s.phase = "A0-burst"; timeline.push(s); noteTiers(s); }
  const burstFps = burst.map((s) => s.fpsEwma).sort((a, b) => a - b);
  const burstEnemies = Math.round(burst.reduce((a, s) => a + s.enemies, 0) / burst.length);
  summary.gates.burst = { fpsMedian: burstFps[Math.floor(burstFps.length / 2)], fpsMin: burstFps[0], avgEnemies: burstEnemies, pass: burstFps[Math.floor(burstFps.length / 2)] >= 55 && burstEnemies >= 400 };

  // A1 Minute-25-Referenz: 30x hochlaufen, dann 20 s bei 1x.
  await page.evaluate(() => { window.__lf.setTimeScale(30); });
  await waitDiag("minute25-time", (s) => (s.time ?? 0) >= 1500, 240000);
  await page.evaluate(() => { window.__lf.setTimeScale(1); });
  await waitDiag("minute25-enemies", (s) => (s.enemies ?? 0) >= 300, 30000).catch(() => null);
  const m25 = [];
  const mEnd = Date.now() + 20000;
  while (Date.now() < mEnd) { m25.push(await senseOnce()); await sleep(500); }
  for (const s of m25) { s.phase = "A1-minute25"; timeline.push(s); noteTiers(s); }
  const m25Fps = m25.map((s) => s.fpsEwma).sort((a, b) => a - b);
  const m25Enemies = Math.round(m25.reduce((a, s) => a + s.enemies, 0) / m25.length);
  summary.gates.minute25 = { fpsMedian: m25Fps[Math.floor(m25Fps.length / 2)], fpsMin: m25Fps[0], avgEnemies: m25Enemies, pass: m25Fps[Math.floor(m25Fps.length / 2)] >= 55 && m25Enemies >= 300 };

  // Cap-Schnappschuss VOR der Drosselphase (Stufe high) fuer Bitgleichheit.
  summary.snapshotHighBefore = snapOf([...burst, ...m25]);

  // SwiftShader-Gate (Reviewer-Nit): ein Lauf auf Software-GL ist kein
  // gueltiger iGPU-Beleg — als Gate vermerken, nicht nur als String loggen.
  if (rendererString.includes("SwiftShader")) {
    summary.findings.push({ severity: "blocker", text: `Renderer ist SwiftShader (${rendererString}) — Lauf ungueltig, auf iGPU wiederholen` });
  }

  // B Drosselphase: CPU-Throttle an, bis thermal engagiert + 40 s Beobachtung.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  let thermalSeenAt = 0;
  await sampleLoop((s) => {
    if (s.effTier === "thermal") { if (!thermalSeenAt) thermalSeenAt = s.t; if (s.t - thermalSeenAt >= 40000) return true; }
    return false;
  }, 360000, "B-throttle");
  if (!thermalSeenAt) {
    summary.findings.push({ severity: "blocker", text: `Thermal-Stufe in 6 min Drossel (${THROTTLE}x) NICHT erreicht — Kette high->medium->low pruefen` });
  }
  const bSamples = timeline.filter((s) => s.phase === "B-throttle");
  // Enthaelt alle Nicht-high-Samples der Drosselphase (medium + low + thermal);
  // Per-Tier-Aufschluesselung siehe m10-quality-smoke-caps-per-tier.json.
  summary.snapshotDownThermal = snapOf(bSamples.filter((s) => s.effTier !== "high"));

  // C Erholungsphase: Throttle aus, bis high zurueck (oder 5 min).
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  let highBackAt = 0;
  await sampleLoop((s) => {
    if (s.effTier === "high") { if (!highBackAt) highBackAt = s.t; if (s.t - highBackAt >= 30000) return true; }
    return false;
  }, 300000, "C-recovery");
  if (!highBackAt) {
    summary.findings.push({ severity: "major", text: "Rueckkehr auf high in 5 min Erholung NICHT erreicht (Regler/Totzone/Last pruefen)" });
  }
  const cSamples = timeline.filter((s) => s.phase === "C-recovery");
  const cTail = cSamples.slice(-20);
  if (cTail.length > 0 && cTail.every((s) => s.effTier === "high")) {
    summary.snapshotHighAfter = snapOf(cTail);
  }

  // Flapping: Wechsel im Beobachtungsfenster (Totzone 45-57 sollte einfrieren).
  summary.transitions = transitions;
  summary.jsErrors = errors;
  summary.finishedAt = new Date().toISOString();
} finally {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  writeFileSync(resolve(OUT, `m10-quality-smoke-timeline-${stamp}.json`), JSON.stringify({ summary, timeline }, null, 2));
  writeFileSync(resolve(OUT, `m10-quality-smoke-summary-latest.json`), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  await browser.close().catch(() => {});
  server.stop();
}
