// M10-v10-device-acceptance (K2): Minute-25-Dichte auf dem Redmi Pad Pro.
// Methode = Phase 2 von scripts/perf.mjs (6 Evolutions-Waffen Lv8, 6 Passives
// Lv5, skipTo(1490), Director-Dichte, Top-up auf 300 Gegner, 10 s Fenster),
// aber auf dem GERAET: EINE CDP-Verbindung, kein App-Relaunch (Befund
// m10-tablet-fx-device-probe.mjs: Relaunch killt connectOverCDP).
//
//   node scripts/m10-v10-device-m25.mjs --out <pfad.json> [--secs 10] [--target 300]
//
// Nur Messung: keine Aenderungen an src/** oder tests/**.
const BRIDGE = "http://172.17.0.1:5181";
const CDP = "http://172.17.0.1:9333";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const secs = Number(arg("secs", "10"));
const target = Number(arg("target", "300"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

// Auf die Game-Page warten (App starten, falls noetig), DANN erst CDP verbinden.
let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  try {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    ready = Array.isArray(list) && list.some((p) => (p.url || "").includes("index.html"));
  } catch { /* CDP noch nicht bereit */ }
  if (!ready) {
    await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" }).catch(() => {});
    await sleep(2000);
  }
}
if (!ready) throw new Error("CDP: keine Game-Page nach ~120 s");

const { loadPlaywright } = await import("./harness.mjs");
const { chromium } = await loadPlaywright();
const browser = await chromium.connectOverCDP(CDP);
const page = browser.contexts()[0].pages()[0];
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const scene = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown");
if (scene !== "run") {
  // Frischer Start: reload, dann Titel -> Charakterwahl -> Run.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
}

// Minute-25-Setup (identisch zu perf.mjs Phase 2).
await page.evaluate(({ evolutions, passives }) => {
  window.__lf.god(true);
  window.__lf.setSuppressLevelUps(true);
  for (const id of evolutions) window.__lf.addWeapon(id, 8);
  for (const id of passives) window.__lf.addPassive(id, 5);
  window.__lf.skipTo(1490);
  window.__lf.setTimeScale(1);
}, { evolutions: EVOLUTIONS, passives: PASSIVES });
await sleep(6000);

const view = await page.evaluate(() => {
  const scale = window.__game.scale;
  const canvas = document.querySelector("canvas");
  const rect = canvas.getBoundingClientRect();
  const gl = document.createElement("canvas").getContext("webgl");
  const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
  return {
    internal: [scale.width, scale.height],
    css: [Math.round(rect.width), Math.round(rect.height)],
    dpr: window.devicePixelRatio,
    renderScale: window.__lf?.state?.()?.renderScale ?? window.__lf?.state?.()?.quality ?? null,
    state: window.__lf.state(),
    webglRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    webglVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
  };
});
await sleep(1000);

// 10 s FPS messen; Gegner unter target werden nachgespawnt (identisch zu perf.mjs).
const minute25 = await page.evaluate(async ({ target, seconds }) => {
  const start = performance.now();
  let frames = 0;
  let last = start;
  let worst = 0;
  let lastSpawn = start;
  const samples = [];
  await new Promise((resolve) => {
    const tick = (now) => {
      const dt = now - last;
      if (frames > 0) worst = Math.max(worst, dt);
      last = now;
      frames++;
      if (now - lastSpawn >= 50) {
        lastSpawn = now;
        const active = window.__lf.stats().enemies;
        const deficit = target - active;
        if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
        samples.push(window.__lf.stats().enemies);
      }
      if (now - start >= seconds * 1000) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const elapsed = performance.now() - start;
  return {
    fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
    frames,
    elapsedMs: Math.round(elapsed),
    worstFrameMs: Math.round(worst * 10) / 10,
    minEnemies: samples.length ? Math.min(...samples) : 0,
    avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
    targetEnemies: target,
  };
}, { target: target, seconds: secs });

const state = await page.evaluate(() => window.__lf.stats());
const out = {
  gate: "K2 minute25 >= 60 FPS (Ziel des Device-Gates, perf.mjs-Harness-Tor 55 bleibt unberuehrt)",
  view: { internal: view.internal, css: view.css, dpr: view.dpr, renderScale: view.renderScale },
  webglRenderer: view.webglRenderer,
  webglVendor: view.webglVendor,
  ua: await page.evaluate(() => navigator.userAgent),
  minute25: {
    ...minute25,
    measuredFps: state.fps,
    time: state.time,
    level: state.level,
    kills: state.kills,
    quality: state.quality,
    passed: minute25.fps >= 60 && minute25.minEnemies >= 200,
  },
  jsErrors: errors,
  passed: minute25.fps >= 60 && minute25.minEnemies >= 200 && errors.length === 0,
};
console.log(JSON.stringify(out.minute25));
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
process.exit(out.passed ? 0 : 1);
