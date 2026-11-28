#!/usr/bin/env node
/**
 * M10-android-proxy-gate: Android-Ersatztest im Harness (Regel 9 aus
 * Wissen/Android-Optimierung-Praxis.md).
 *
 * Ablauf je Charakter (mira, kael):
 *   1. Start im Galaxy-Tab-S4-Querformat (1138x712, dpr 2.25, Touch) mit
 *      CDP `Emulation.setCPUThrottlingRate {rate: 4}` (siehe harness.mjs).
 *   2. 6 Evolutionen + 6 Passiv-Items auf Stufe 8/5, God + AutoPlay.
 *   3. Zeitraffer (30x) bis Minute 10 — bildet Allokationen/GC im Lauf ab.
 *   4. Sprung auf Minute 25 (skipTo 1490), 6 s Einschwingen, dann 60 s
 *      ECHTZEIT-Messung bei Minute-25-Dichte (Gegner werden auf Ziel
 *      aufgefüllt, wie in perf.mjs).
 *
 * Ergebnis je Charakter: fps p5/Median, frame p95, quality-Stufe (LOD),
 * JS-Heap und der WebGL-Renderer-String (Regel: jeder Perf-Beleg schreibt
 * den Renderer-String; SwiftShader-Belege sind ungültig).
 *
 *   node scripts/android-proxy.mjs                 # → shots/m10-android-proxy.json
 *   node scripts/android-proxy.mjs --tag baseline  # → shots/m10-android-proxy-baseline.json
 *   node scripts/android-proxy.mjs --seconds 60 --target 300
 *
 * IMMER mit flock laufen lassen (Echtzeit-FPS-Messung):
 *   flock /home/ai/games/.lf-perf.lock node scripts/android-proxy.mjs
 *
 * Grenzen (ehrlich): der Proxy ersetzt das Tablet NICHT — keine GPU-, Treiber-,
 * Thermik- oder Mali/Adreno-Tile-Based-Effekte. Echte Freigabe = Geräte-Telemetrie.
 */
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene, androidProxyContext, ANDROID_PROXY_DEVICE, ANDROID_PROXY_THROTTLE_RATE } from "./harness.mjs";

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const CHARACTERS = ["mira", "kael"];

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", ""));
const OUT = String(argOf("out", `shots/m10-android-proxy${TAG ? `-${TAG}` : ""}.json`));
const SECONDS = Number(argOf("seconds", "60")) || 60;
const TARGET = Number(argOf("target", "300")) || 300;
/** Spielzeit (s), bis der Zeitraffer-Phase endet (Minute 10). */
const TIMELAPSE_TO = Number(argOf("timelapse", "600")) || 600;
const TIME_SCALE = Number(argOf("timescale", "30")) || 30;

/** Renderer-Strings, die keinen echten GPU-Beleg ergeben (Regel: SwiftShader-Belege sind ungültig). */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software/i;

const LOD_RANK = { full: 0, reduced: 1, minimal: 2 };
const LOD_NAMES = ["full", "reduced", "minimal"];

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

let result;
try {
  ensureBuild();
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
  const { context, page } = await androidProxyContext(browser);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  const rendererString = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return "";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  });

  const clearLevelUps = async () => {
    for (let i = 0; i < 40; i++) {
      if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }
  };

  /** Charselect: "1"/"2" wählt direkt, ENTER startet (CharSelect.ts). */
  const startCharRun = async (char) => {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    await waitForScene(page, "title");
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await page.keyboard.press(CHARACTERS.indexOf(char) === 0 ? "1" : "2");
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    const got = await page.evaluate(() => window.__lf.state().character);
    if (got !== char) throw new Error(`android-proxy: Charakterauswahl fehlgeschlagen (wollte ${char}, bekam ${got})`);
  };

  const viewInfo = () =>
    page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const rect = canvas.getBoundingClientRect();
      const logicalWidth = window.__game?.scale?.width ?? 640;
      const logicalHeight = window.__game?.scale?.height ?? 360;
      const renderScale = Math.max(1, Math.round(logicalWidth / canvas.width));
      return { logical: [Math.round(logicalWidth), Math.round(logicalHeight)], css: [Math.round(rect.width), Math.round(rect.height)], dpr: window.devicePixelRatio || 1, renderScale };
    });

  /** Zeitraffer bis TIMELAPSE_TO Spiel-Sekunden; Level-ups werden weggeklickt. */
  const timelapseTo = async (seconds) => {
    const t0 = Date.now();
    for (;;) {
      const s = await page.evaluate(() => {
        const st = window.__lf.stats();
        if (st.levelUpOpen) window.__lf.pickLevelUp(0);
        return st;
      });
      if (s.time >= seconds) return { wallMs: Date.now() - t0, gameSeconds: s.time, level: s.level, kills: s.kills };
      if (Date.now() - t0 > 300000) throw new Error(`android-proxy: Zeitraffer-Timeout bei ${s.time}s / Ziel ${seconds}s`);
      await page.waitForTimeout(400);
    }
  };

  /** SECONDS Echtzeit; Gegner werden auf TARGET aufgefüllt (Worst Case). */
  const measure = (target) =>
    page.evaluate(async ({ seconds, target }) => {
      const start = performance.now();
      let last = start;
      let frames = 0;
      let lastSpawn = start;
      const dts = [];
      let minEnemies = Infinity;
      let maxEnemies = 0;
      let lodWorst = 0;
      let scaleWorst = 1;
      let heapMax = 0;
      let heapEnd = 0;
      await new Promise((resolve) => {
        const tick = (now) => {
          const dt = now - last;
          last = now;
          if (frames > 0 && dt > 0 && dt < 1000) dts.push(dt);
          frames++;
          const s = window.__lf.stats();
          // Dichte nur im Spawn-Fenster NACH dem Auffüllen sampeln (wie
          // perf.mjs) — Kill-Täler zwischen zwei Refills sonstigen fluten
          // minEnemies und machen densityOk bedeutungslos.
          if (now - lastSpawn >= 50) {
            lastSpawn = now;
            const deficit = target - s.enemies;
            if (deficit > 0) {
              // Zähe Minute-25-Tiers statt bog_rat (hp 8): unter 6 Evolutionen
              // auf God-Mode sterben Ratten schneller, als ein Frame nachfüllt.
              window.__lf.spawnEnemy("treant", Math.ceil(deficit / 2));
              window.__lf.spawnEnemy("abom", Math.floor(deficit / 2));
              const filled = window.__lf.stats().enemies;
              minEnemies = Math.min(minEnemies, filled);
              maxEnemies = Math.max(maxEnemies, filled);
            } else {
              minEnemies = Math.min(minEnemies, s.enemies);
              maxEnemies = Math.max(maxEnemies, s.enemies);
            }
          }
          const rank = s.lod?.level === "minimal" ? 2 : s.lod?.level === "reduced" ? 1 : 0;
          lodWorst = Math.max(lodWorst, rank);
          const canvas = document.querySelector("canvas");
          const logicalWidth = window.__game?.scale?.width ?? 640;
          scaleWorst = Math.max(scaleWorst, Math.round(logicalWidth / canvas.width));
          if (performance.memory) {
            heapMax = Math.max(heapMax, performance.memory.usedJSHeapSize);
            heapEnd = performance.memory.usedJSHeapSize;
          }
          if (now - start >= seconds * 1000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const elapsed = performance.now() - start;
      const sorted = dts.slice().sort((a, b) => a - b);
      return {
        seconds,
        target,
        frames,
        elapsedMs: Math.round(elapsed),
        dtsSorted: sorted,
        minEnemies,
        maxEnemies,
        lodWorstRank: lodWorst,
        renderScaleWorst: scaleWorst,
        heapMB: { max: Math.round((heapMax / 1048576) * 10) / 10, end: Math.round((heapEnd / 1048576) * 10) / 10 },
      };
    }, { seconds: SECONDS, target });

  const characters = {};
  try {
    for (const char of CHARACTERS) {
      await startCharRun(char);
      await page.evaluate((ts) => {
        window.__lf.god(true);
        window.__lf.autoPlay(true);
        window.__lf.setTimeScale(ts);
      }, TIME_SCALE);
      await page.evaluate(({ evolutions, passives }) => {
        for (const id of evolutions) window.__lf.addWeapon(id, 8);
        for (const id of passives) window.__lf.addPassive(id, 5);
      }, { evolutions: EVOLUTIONS, passives: PASSIVES });

      // Phase A: Zeitraffer bis Minute 10.
      const timelapse = await timelapseTo(TIMELAPSE_TO);

      // Phase B: Minute-25-Dichte, 6 s Echtzeit einschwingen.
      await page.evaluate(() => {
        window.__lf.skipTo(1490);
        window.__lf.setTimeScale(1);
      });
      await page.waitForTimeout(6000);
      await clearLevelUps();
      const before = await page.evaluate(() => window.__lf.stats());
      const viewBefore = await viewInfo();

      // Phase C: 60 s Echtzeit-Messung.
      const raw = await measure(TARGET);
      const dts = raw.dtsSorted;
      const fpsSeries = dts.map((d) => 1000 / d).sort((a, b) => a - b);
      const measureOut = {
        ...raw,
        dtsSorted: undefined,
        lodWorstRank: raw.lodWorstRank,
        lodWorst: LOD_NAMES[raw.lodWorstRank] ?? "full",
        frames: raw.frames,
        fpsAvg: Math.round((raw.frames / (raw.elapsedMs / 1000)) * 10) / 10,
        fpsP5: Math.round(quantile(fpsSeries, 0.05) * 10) / 10,
        fpsMedian: Math.round(quantile(fpsSeries, 0.5) * 10) / 10,
        frameMedianMs: Math.round(quantile(dts, 0.5) * 10) / 10,
        frameP95: Math.round(quantile(dts, 0.95) * 10) / 10,
      };
      const after = await page.evaluate(() => window.__lf.stats());
      const viewAfter = await viewInfo();

      characters[char] = {
        timelapse,
        minute25: {
          before: { time: before.time, enemies: before.enemies, level: before.level },
          after: { time: after.time, enemies: after.enemies, kills: after.kills },
          view: { before: viewBefore, after: viewAfter },
          ...measureOut,
          densityOk: measureOut.minEnemies >= 200,
        },
      };
      console.log(`[android-proxy] ${char}: fpsMedian=${measureOut.fpsMedian} fpsP5=${measureOut.fpsP5} frameP95=${measureOut.frameP95}ms lod=${measureOut.lodWorst} heap=${measureOut.heapMB.max}MB`);
    }
  } finally {
    await context.close();
    await browser.close();
    server.stop();
  }

  const measures = Object.values(characters).map((c) => c.minute25);
  result = {
    tag: TAG || null,
    date: new Date().toISOString(),
    proxy: { device: ANDROID_PROXY_DEVICE, cpuThrottleRate: ANDROID_PROXY_THROTTLE_RATE, seconds: SECONDS, target: TARGET, timelapseTo: TIMELAPSE_TO, timeScale: TIME_SCALE },
    renderer: rendererString,
    rendererSwiftShader: SOFTWARE_RENDERER.test(rendererString),
    evolutions: EVOLUTIONS,
    characters,
    jsErrors: errors,
    passed: errors.length === 0 && measures.every((m) => m.densityOk) && rendererString.length > 0 && !SOFTWARE_RENDERER.test(rendererString),
  };
} catch (e) {
  console.error(`[android-proxy] FEHLER: ${e?.message ?? e}`);
  process.exit(2);
}

if (result) {
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`[android-proxy] geschrieben: ${OUT}`);
  console.log(JSON.stringify({ passed: result.passed, renderer: result.renderer, jsErrors: result.jsErrors.length }, null, 2));
  process.exit(result.passed ? 0 : 1);
}
