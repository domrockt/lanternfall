// M10-fps-cap-stackfix (K1): Stack-Capture der RangeError-Regression.
//
// Rezept wie m10-fps-cap-device.mjs (Minute-25-Last: 6 Evos Lv8, 6 Passives
// Lv5, skipTo(1490), Top-up auf 300 Gegner im 50-ms-Takt), aber LOKAL im
// Android-Ersatzprofil (Galaxy Tab S4 landscape, dpr 2.25 + CDP-CPU-Drossel,
// siehe Wissen/Android-Optimierung-Praxis.md Regel 9) — das Geraet ist
// kontentioniert (409 DOM_SPIELT), und der Stack ist ein Logik-Befund, kein
// FPS-Beleg.
//
// Wichtig: Vite-DEV-Server statt dist-Build -> Stacks unminified (Datei +
// Funktion lesbar). BILDRATE=60 via Persistenzpfad (localStorage
// lanternfall-options-v1, Feld fps) + Reload -> genau der K2-Pfad
// (resolveFpsLimit -> 60 am Cap), Desktop-Default (AUTO) bleibt unangetastet.
//
//   node scripts/m10-fps-cap-stackfix.mjs --out <pfad.json> [--windows 3]
//        [--seconds 60] [--fps 60|auto] [--cpu 4] [--label <name>]
//
// Capture: pageerror mit VOLLEM Stack (e.stack), Frozen-Loop-Erkennung je
// Fenster (rAF-Sampler stirbt / presented < 5), Heilung per Reload wie in der
// fps-cap-Lane. Nur Diagnose: keine Aenderungen an src/** oder tests/**.
import { createServer } from "vite";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const hasFlag = (name) => argv.includes(`--${name}`);
const outPath = arg("out", null);
const windows = Number(arg("windows", "3"));
const seconds = Number(arg("seconds", "60"));
const fpsMode = String(arg("fps", "60"));
const cpuRate = Number(arg("cpu", "4"));
const label = String(arg("label", "run"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

// ---------- Vite-Dev-Server (unminified Stacks) ----------
const vite = await createServer({
  server: { host: "127.0.0.1", port: 0, strictPort: false },
  logLevel: "silent",
});
await vite.listen();
const port = vite.httpServer.address().port;
const BASE = `http://127.0.0.1:${port}/index.html`;

// ---------- Browser (Android-Ersatzprofil) ----------
const { loadPlaywright, ANDROID_PROXY_DEVICE } = await import("./harness.mjs");
const pwModule = await loadPlaywright();
const { chromium } = pwModule;
const browser = await chromium.launch();
const device = pwModule.devices[ANDROID_PROXY_DEVICE];
const context = await browser.newContext({ ...device });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
if (cpuRate > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });

const errors = [];
page.on("pageerror", (e) => {
  errors.push({ at: Date.now(), message: String(e?.message ?? e), stack: e?.stack ?? null });
});
page.on("crash", () => errors.push({ at: Date.now(), message: "PAGE CRASH", stack: null }));

const waitScene = async (scene, timeout) => {
  await page.waitForFunction((s) => {
    try { return window.__lf?.state?.().scene === s; } catch { return false; }
  }, scene, { timeout });
};

const waitRunScene = async () => {
  const url = page.url();
  const targetUrl = /debug=1/.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}debug=1`;
  await page.goto(targetUrl, { waitUntil: "load" });
  await waitScene("title", 45000);
  await page.keyboard.press("Enter");
  await waitScene("charselect", 20000);
  await page.keyboard.press("Enter");
  await waitScene("run", 20000);
  await page.evaluate(({ evolutions, passives }) => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.autoPlay(true);
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await sleep(4000);
};

// BILDRATE in den Persistenzpfad schreiben, dann neu booten (K2-Pfad).
for (let i = 0; i < 30; i++) {
  try { if ((await fetch(BASE)).ok) break; } catch { /* Server waermt auf */ }
  await sleep(500);
}
await page.goto(BASE, { waitUntil: "load" }).catch(() => {});
if (fpsMode !== "auto") {
  const value = fpsMode === "60" ? 60 : 0;
  await page.evaluate((v) => {
    let opts = {};
    try { opts = JSON.parse(localStorage.getItem("lanternfall-options-v1") || "{}"); } catch { opts = {}; }
    opts.fps = v;
    localStorage.setItem("lanternfall-options-v1", JSON.stringify(opts));
  }, value).catch(() => {});
}
await waitRunScene();

const contextInfo = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2")
    ?? document.createElement("canvas").getContext("webgl");
  const dbg = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
  return {
    renderer: dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : null,
    dpr: window.devicePixelRatio || 1,
    fpsConfig: (() => { try { return window.__lf?.fpsConfig?.() ?? null; } catch { return null; } })(),
  };
});

// ---------- Messfenster (m25-Last) ----------
const samples = [];
const errorsBeforeRun = errors.length;
for (let w = 0; w < windows; w++) {
  const errBefore = errors.length;
  let win = null;
  for (let attempt = 0; attempt < 2 && !win; attempt++) {
    try {
      win = await page.evaluate(async ({ target, secs }) => {
        const start = performance.now();
        let lastSpawn = start;
        let last = start;
        let worst = 0;
        let frames = 0;
        const enemies = [];
        let aborted = false;
        await new Promise((resolve) => {
          const stats = () => { try { return window.__lf.stats(); } catch { return null; } };
          const tick = (now) => {
            if (frames > 0) worst = Math.max(worst, now - last);
            last = now;
            frames++;
            if (stats() === null || window.__lf?.state?.()?.scene !== "run") { aborted = true; resolve(); return; }
            if (now - lastSpawn >= 50) {
              lastSpawn = now;
              const active = stats().enemies;
              const deficit = target - active;
              if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
              enemies.push(active);
            }
            if (now - start >= secs * 1000) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const elapsed = performance.now() - start;
        return {
          aborted,
          rafFps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
          worstFrameMs: Math.round(worst * 10) / 10,
          avgEnemies: enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : 0,
        };
      }, { target: 300, secs: seconds });
    } catch (e) {
      console.log(`  w${w} evaluate fehlgeschlagen (${String(e).slice(0, 80)}) -> Reload`);
      await waitRunScene();
    }
  }
  const winErrors = errors.slice(errBefore);
  const rangeErrors = winErrors.filter((e) => (e.message || "").includes("RangeError"));
  const frozen = !win || win.aborted || (win.rafFps ?? 60) < 5;
  samples.push({
    window: w,
    ...win,
    frozen,
    errors: winErrors.map((e) => e.message),
  });
  console.log(`  w${w}: rafFps=${win?.rafFps} worst=${win?.worstFrameMs}ms enemies=${win?.avgEnemies} frozen=${frozen} errors=${winErrors.length} (RangeError ${rangeErrors.length})`);
  if (frozen) {
    // Heilung wie fps-cap-Lane: Reload + frischer Run, damit die Folgenfenster
    // nicht im toten Loop laufen.
    await waitRunScene();
  }
}

// ---------- Auswertung ----------
const allErrors = errors.slice(errorsBeforeRun);
const rangeErrorStacks = allErrors.filter((e) => (e.message || "").includes("RangeError"));
const result = {
  label,
  at: new Date().toISOString(),
  mode: `vite-dev + ${ANDROID_PROXY_DEVICE}, cpuThrottle x${cpuRate}, BILDRATE=${fpsMode}`,
  context: contextInfo,
  config: { windows, seconds, target: 300 },
  summary: {
    rangeErrors: rangeErrorStacks.length,
    frozenLoops: samples.filter((s) => s.frozen).length,
    totalErrors: allErrors.length,
  },
  windows: samples,
  errors: allErrors,
};
const json = JSON.stringify(result, null, 2);
if (outPath) {
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, json);
  console.log(`geschrieben: ${outPath}`);
}
console.log(json);

await browser.close();
await vite.close();
process.exitCode = 0;
