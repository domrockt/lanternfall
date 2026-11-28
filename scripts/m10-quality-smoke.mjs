#!/usr/bin/env node
// M10-quality-stacked-smoke (K1/K2): Integrativer Smoke ueber die gestapelte
// Qualitaetsstufen-Kette (audio-budget + hazard-budget + thermal-guard +
// thermal-wiring). NUR-MESS-Lane: konsumiert harness.mjs, aendert nichts.
//
// Ablauf:
//   A0 Burst-Tor        ~500 Gegner Minute 3, 15 s, Gate >= 55 FPS
//   A1 Minute-25-Ref    skipTo(1500), 20 s Referenz (>= 55 angestrebt)
//   B  Drosselphase     CDP-CPU-Throttle, 1-Hz-Timeline bis thermal engagiert
//                       + 40 s Cap-Beobachtung (low/thermal wirksam?)
//   C  Erholungsphase   Throttle aus, 1-Hz-Timeline bis high zurueck (oder
//                       5 min -> ehrlicher Befund "Erholung unvollständig")
//
// Belege (NICHT ins git, Dom-Regel 27.11.): JSON nach
// ~/games/.evidence/m10-quality-stacked-smoke/ (--out ueberschreibbar).
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
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

ensureBuild();
mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push({ at: Date.now(), text: String(e) }));
page.on("console", (m) => { if (m.type() === "error") errors.push({ at: Date.now(), text: m.text() }); });

// --- In-Page Sensoren ---------------------------------------------------------

// WebGL-Renderer-String (Pflicht, Regel 6): eigener Offscreen-Kontext, gleiche GPU.
const rendererString = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") ?? c.getContext("webgl");
  if (!gl) return "no-webgl";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
});

const senseOnce = () => page.evaluate(() => {
  const dbg = window.__rbDbg ?? {};
  const s = window.__lf?.state?.() ?? {};
  const audio = window.__lf?.audio?.() ?? {};
  const run = window.__game ? null : null;
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

/** 1-Hz-Timeline bis stop() true oder Timeout. topup haelt die Last (500 Gegner). */
async function sampleLoop(stop, maxMs, label, timeline) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await topUp();
    const s = await senseOnce();
    s.phase = label;
    timeline.push(s);
    if (stop(s)) return s;
    await sleep(1000);
  }
  return timeline[timeline.length - 1];
}

const transitions = [];
let lastTier = null;
let lastBase = null;
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

// --- Run ---------------------------------------------------------------------

const summary = { startedAt: new Date().toISOString(), renderer: rendererString, throttle: THROTTLE, gates: {}, findings: [] };
let timeline = [];
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
  await startRun(page);
  await page.evaluate(({ evolutions, passives }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });

  // Gegner-Top-up (wie perf.mjs): Evolutions-Waffen killen instant — ohne
  // Nachspawnen waere das Burst-Tor ohne Last gemessen.
  const topUp = () => page.evaluate(() => {
    const en = window.__lf?.state?.()?.enemies ?? 0;
    const deficit = Math.min(500 - en, 120);
    if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
    return en;
  });

  // A0 Burst-Tor: ~500 Gegner bei Minute 3, normale Zeit, 15 s.
  await page.evaluate(() => { window.__lf.skipTo(150); });
  await page.evaluate(() => { window.__lf.spawnEnemy("bog_rat", 260); window.__lf.spawnEnemy("wisp", 260); });
  await page.waitForFunction(() => (window.__lf?.state?.()?.enemies ?? 0) >= 400, null, { timeout: 30000 });
  const burst = [];
  const bEnd = Date.now() + 15000;
  while (Date.now() < bEnd) { await topUp(); burst.push(await senseOnce()); await sleep(500); }
  for (const s of burst) { s.phase = "A0-burst"; timeline.push(s); noteTiers(s); }
  const burstFps = burst.map((s) => s.fpsEwma).sort((a, b) => a - b);
  summary.gates.burst = { fpsMedian: burstFps[Math.floor(burstFps.length / 2)], fpsMin: burstFps[0], pass: burstFps[Math.floor(burstFps.length / 2)] >= 55 };

  // A1 Minute-25-Referenz: 30x hochlaufen, dann 20 s bei 1x.
  await page.evaluate(() => { window.__lf.setTimeScale(30); });
  await page.waitForFunction(() => (window.__lf?.state?.()?.time ?? 0) >= 1500, null, { timeout: 240000, polling: 500 });
  await page.evaluate(() => { window.__lf.setTimeScale(1); });
  await page.waitForFunction(() => (window.__lf?.state?.()?.enemies ?? 0) >= 300, null, { timeout: 30000, polling: 500 }).catch(() => {});
  const m25 = [];
  const mEnd = Date.now() + 20000;
  while (Date.now() < mEnd) { await topUp(); m25.push(await senseOnce()); await sleep(500); }
  for (const s of m25) { s.phase = "A1-minute25"; timeline.push(s); noteTiers(s); }
  const m25Fps = m25.map((s) => s.fpsEwma).sort((a, b) => a - b);
  summary.gates.minute25 = { fpsMedian: m25Fps[Math.floor(m25Fps.length / 2)], fpsMin: m25Fps[0], pass: m25Fps[Math.floor(m25Fps.length / 2)] >= 55 };

  // Cap-Schnappschuss VOR der Drosselphase (Stufe high) fuer Bitgleichheits-Vergleich.
  const snapOf = (samples) => ({
    tier: samples[0]?.effTier,
    damageLabelsMax: Math.max(...samples.map((s) => s.damageLabels ?? 0)),
    audioVoicesMax: Math.max(...samples.map((s) => s.audioVoices ?? 0)),
    addChildrenMed: samples.map((s) => s.addChildren).sort((a, b) => a - b)[Math.floor(samples.length / 2)],
    addMaxAreaMax: Math.max(...samples.map((s) => s.addMaxArea ?? 0)),
    warnDiscsMax: Math.max(...samples.map((s) => s.warnDiscs ?? 0)),
  });
  summary.snapshotHighBefore = snapOf([...burst, ...m25]);

  // B Drosselphase: CPU-Throttle an, bis thermal engagiert + 40 s Beobachtung.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  let thermalSeenAt = 0;
  await sampleLoop((s) => {
    noteTiers(s);
    if (s.effTier === "thermal") { if (!thermalSeenAt) thermalSeenAt = s.t; if (s.t - thermalSeenAt >= 40000) return true; }
    return false;
  }, 360000, "B-throttle", timeline);
  if (!thermalSeenAt) {
    summary.findings.push({ severity: "blocker", text: `Thermal-Stufe in 6 min Drossel (${THROTTLE}x) NICHT erreicht — Kette high->medium->low pruefen` });
  }
  const bSamples = timeline.filter((s) => s.phase === "B-throttle");
  summary.snapshotLowThermal = snapOf(bSamples.filter((s) => s.effTier !== "high"));

  // C Erholungsphase: Throttle aus, bis high zurueck (oder 5 min).
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  let highBackAt = 0;
  await sampleLoop((s) => {
    noteTiers(s);
    if (s.effTier === "high") { if (!highBackAt) highBackAt = s.t; if (s.t - highBackAt >= 30000) return true; }
    return false;
  }, 300000, "C-recovery", timeline);
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
