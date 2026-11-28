#!/usr/bin/env node
// Heap-Budget-Messung (Lane m10-heap-budget, Karte #6238/#6239):
// 30-min-Echtzeitlauf (timeScale 1, AutoPlay, God) mit
//   - WebGL-Renderer-String (PFLICHT — SwiftShader-Belege sind ungueltig),
//   - Heap-Timeline je Sim-Minute (Post-GC, 3x GC + Minimum),
//   - Peak je Sim-Minute (roh, ohne erzwungenes GC),
//   - endMB nach erzwungenem GC im Run-Ende (Results-Szene),
//   - weicher Beobachtungswert: Peak je 5-min-Fenster.
//
// Tor-Definition (Karte #6239, Fall A — GC-Saegezahn-fest, nicht Peak-Jitter):
//   HARD: endMB (nach erzwungenem GC, Run-Ende) - Minute 1 <= +15 %
//   SOFT (Beobachtung): max Peak je 5-min-Fenster <= Minute 1 + 25 %
// Begruendung: endMB unter Minute-1 in den Altmessungen (31,9 -> 38,6 MB,
// endMB 27,1) ist GC-Saegezahn, kein monotoner Leak; nach Scene-Teardown
// gehaltener Heap ist der eigentliche Leak-Signalgeber (Zustandssprung
// Minute 1 vs. Minute 29 waere mit legitimer Spielstaerke konfundiert).
//
// Aufruf:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-heap-budget.mjs \
//     --out shots/m10-heap-budget-before.json
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { evaluateHeapGate } from "./m10-heap-budget-gate.mjs";

const argv = process.argv.slice(2);
const strArg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const numArg = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return Number(inline.slice(name.length + 3));
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};

const MINUTES = Math.max(1, Math.min(30, Math.floor(numArg("minutes", 30))));
const OUT = strArg("out", "shots/m10-heap-budget-before.json");
const POLL_MS = 500;
const RUN_SECONDS = MINUTES * 60;
// F2 (m10-reacceptance-d): Der Endboss spawnt bei 30:00 (FINAL_BOSS_AT,
// src/logic/scaling.ts). Baseline brach hier exakt ab (simSeconds 1800,8,
// victory=false) — der Sieg-Pfad hatte im Echtzeitlauf nie Kampfzeit. Nach dem
// 30-min-Budget warten wir bis zu dieser Verlaengerung auf den Endboss-Tod
// (Sieg -> Morgendaemmerung -> Results); der Echtzeit-Kampf dauert ~40 s
// (K1-Probe), 600 s sind Reserve fuer Phasen-3-Verzoegerung.
const BOSS_GRACE_SECONDS = 600;

const gitSha = (() => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
})();

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
// gleiche Flags wie realtime-run.mjs (disable-dev-shm-usage: /dev/shm 64 MB,
// --expose-gc: erzwungenes GC fuer die Post-GC-Messung).
const userDataDir = `${process.env.HOME}/tmp/m10-heap-budget/chrome-${process.pid}-${Date.now()}`;
mkdirSync(userDataDir, { recursive: true });
const browser = await chromium.launchPersistentContext(userDataDir, {
  args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--enable-precise-memory-info", "--js-flags=--expose-gc",
    "--autoplay-policy=no-user-gesture-required"],
  viewport: { width: 960, height: 540 },
});
const page = browser.pages()[0] ?? await browser.newPage();
const errors = [];
const crashes = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("crash", () => crashes.push({ at: new Date().toISOString() }));

const cdp = await page.context().newCDPSession(page);
await cdp.send("HeapProfiler.enable");
// Eine einzelne GC-Messung streut um 1-3 MB (Befund realtime-run.mjs):
// dreimal sammeln, Minimum nehmen = tatsaechlich gehaltener Heap.
const heapOnce = async () => {
  await cdp.send("HeapProfiler.collectGarbage");
  return page.evaluate(() => {
    if (typeof globalThis.gc === "function") globalThis.gc();
    return Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10;
  });
};
const heapGC = async () => {
  let best = await heapOnce();
  for (let i = 0; i < 2; i++) {
    const v = await heapOnce();
    if (v < best) best = v;
  }
  return best;
};

// Renderer-String (eigener Offscreen-GL-Kontext, gleiche GPU) — wie
// m10-vfx-restore.mjs. PFLICHT: ohne echten GPU-Renderer ist der Beleg ungueltig.
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") ?? c.getContext("webgl");
  if (!gl) return { renderer: "none", vendor: "none" };
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
  };
});

await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(true);
  window.__lf.setTimeScale(1);
});

const started = Date.now();
let lastHeapPollMinute = -1;
let victory = false;
let resultReason = null;
let simSeconds = 0;
let truncated = false;
let fatal = null;            // Browser-/Renderer-Tod o. ae.: partielles JSON schreiben
let minute1 = null;          // Post-GC bei Sim-Minute 1 (Tor-Referenz)
let endMB = null;
const timeline = [];         // { minute, jsMB } Post-GC je Sim-Minute
const minutePeaks = [];      // { minute, peakMB } roher Peak (ohne GC)
let curPeak = 0;
let curMinute = 0;
const fpsSamples = [];

const round1 = (x) => Math.round(x * 10) / 10;

try {
while (Date.now() - started < (RUN_SECONDS + 300) * 1000) {
  await page.waitForTimeout(POLL_MS);
  const s = await page.evaluate(() => {
    const st = window.__lf.stats();
    return {
      time: st?.time ?? null,
      scene: st?.scene ?? null,
      fps: Number.isFinite(st?.fps) ? st.fps : null,
      rawMB: Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10,
    };
  });
  if (!s || s.scene !== "run") {
    if (s?.scene === "results") {
      const r = await page.evaluate(() => {
        const scene = window.__game.scene.getScene("results");
        return { reason: scene.result?.reason ?? null };
      });
      victory = r.reason === "dawn";
      resultReason = r.reason;
      break;
    }
    continue;
  }
  simSeconds = s.time;
  const minute = Math.floor(s.time / 60);
  while (curMinute < minute) {
    minutePeaks.push({ minute: curMinute, peakMB: round1(curPeak) });
    curPeak = 0;
    curMinute++;
  }
  curPeak = Math.max(curPeak, s.rawMB);
  // Mindestens einmal pro Sim-Minute Post-GC samplen; Minute 1 ist die
  // Tor-Referenz. GC-Polls zaehlen nicht als FPS-Samples (Kosten verfaelscht).
  if (minute >= 1 && minute > lastHeapPollMinute) {
    lastHeapPollMinute = minute;
    const jsMB = await heapGC();
    timeline.push({ minute, jsMB });
    if (minute === 1) minute1 = jsMB;
    continue;
  }
  if (s.time > 10 && s.fps !== null) fpsSamples.push(s.fps);
  // F2: erst nach RUN_SECONDS + BOSS_GRACE_SECONDS truncieren — dazwischen
  // laeuft der Endboss-Kampf in Echtzeit weiter, bis Results (Sieg) erreicht
  // ist (Break oben ueber scene !== "run").
  if (s.time >= RUN_SECONDS + BOSS_GRACE_SECONDS) { truncated = true; break; }
}
// letzten Teil-Minuten-Peak flushen
minutePeaks.push({ minute: curMinute, peakMB: round1(curPeak) });

// endMB: nach erzwungenem GC im Run-Ende (Results-Szene bei vollem Lauf,
// sonst letzter Run-Zustand). Scene-Teardown + GC = Leak-Signalgeber.
try {
  endMB = await heapGC();
} catch (e) {
  fatal = fatal ?? String(e);
}
} catch (e) {
  // Renderer-/Browser-Tod: partielles JSON mit Belegen schreiben (wie
  // realtime-run.mjs), kein belegloser Absturz.
  fatal = String(e);
  try { endMB = await heapGC(); } catch { endMB = null; }
}

const fpsSorted = [...fpsSamples].sort((a, b) => a - b);
const fps = fpsSorted.length
  ? { min: round1(fpsSorted[0]), median: round1(fpsSorted[Math.floor(fpsSorted.length / 2)]), samples: fpsSorted.length }
  : { min: null, median: null, samples: 0 };

// Tor (reine Definition in m10-heap-budget-gate.mjs, getestet in
// tests/heap-budget.test.ts): HARD endMB - Minute 1 <= +15 %,
// SOFT (Beobachtung) max Peak je 5-min-Fenster <= Minute 1 + 25 %.
const gate = evaluateHeapGate({ minute1MB: minute1, endMB, minutePeaks });
gate.fatal = fatal;

const out = {
  script: "scripts/m10-heap-budget.mjs",
  lane: "m10-heap-budget",
  gitSha,
  startedAt: new Date(started).toISOString(),
  endedAt: new Date().toISOString(),
  minutes: MINUTES,
  renderer, // PFLICHT
  victory,
  resultReason,
  truncated,
  simSeconds: round1(simSeconds),
  minute1MB: minute1,
  timeline,
  minutePeaks,
  windowPeaks: gate.windowPeaks,
  fps,
  errors,
  crashes,
  gate,
  fatal,
};
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
if (fatal) console.log(`FATAL (partielles JSON geschrieben): ${fatal}`);
console.log(`${OUT}: gate=${gate.verdict} (endMB ${gate.endMB} MB vs Minute1 ${gate.minute1MB} MB = ${gate.endDeltaPct} %, Tor <= +${gate.gatePct} %), soft=${gate.softVerdict} (maxWindowPeak ${gate.maxWindowPeakMB} MB = ${gate.maxWindowPeakPct} %), renderer=${renderer.renderer}, errors=${errors.length}, victory=${victory}`);
await browser.close();
process.exit(0);
