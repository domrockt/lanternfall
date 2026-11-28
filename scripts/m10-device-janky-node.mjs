// M10-device-janky-node (K1/K3): gfxinfo-janky-Baseline am Geraet.
// Methode wie scripts/m10-v10-device-gfxinfo.mjs (Minute-25-Dichte, GET /gfxinfo
// vor/nach je 10-s-Fenster, Differenz = Fenster-Statistik), erweitert:
//  - Renderer-String (UNMASKED_RENDERER_WEBGL) + DPR + Display-Refresh im JSON
//    (Mess-Sperren-Regel: kein Beleg ohne Renderer-String, nie SwiftShader),
//  - 2 x Minute-25-Fenster MIT Top-up (target 300) + 1 Fenster OHNE Top-up
//    (natuerliche Director-Dichte — fairer Zielwert, Methodik-Hinweis der
//    Vor-Lane m10-v10-device-acceptance K3 Befund 3),
//  - je-Fenster rAF-Framezeit-Verteilung (p50/p90/p95/p99/worst, primary
//    p95-Metrik, da gfxinfo-Perzentile kumulativ seit Stat-Reset sind),
//  - quality-Tier vor/nach jedem Fenster (state().quality).
//
//   node scripts/m10-device-janky-node.mjs --out <pfad.json> [--secs 10] [--target 300]
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

const gfxinfo = async () => {
  const r = await fetch(`${BRIDGE}/gfxinfo`);
  const t = await r.text();
  const num = (re) => {
    const m = t.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    totalFrames: num(/Total frames rendered: (\d+)/),
    jankyFrames: num(/Janky frames: (\d+)/),
    p50: num(/50th percentile: (\d+)ms/),
    p90: num(/90th percentile: (\d+)ms/),
    p95: num(/95th percentile: (\d+)ms/),
    p99: num(/99th percentile: (\d+)ms/),
    raw: t.split("HISTOGRAM")[0],
  };
};

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

const ensureRun = async () => {
  const scene = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown");
  if (scene === "run") return;
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
};

// Geraete-Identitaet: Renderer-String + DPR + Panel-Refresh (Pflicht in jedem Beleg).
const device = await page.evaluate(() => {
  let renderer = null;
  let vendor = null;
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
    renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER) ?? "");
    vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl?.getParameter(gl.VENDOR) ?? "");
  } catch { /* kein GL */ }
  return { renderer, vendor, dpr: window.devicePixelRatio, screen: `${screen.width}x${screen.height}` };
});

// Minute-25-Setup (identisch zu m10-v10-device-m25.mjs / m10-v10-device-gfxinfo.mjs).
const setupM25 = async () => {
  await page.evaluate(({ evolutions, passives }) => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await sleep(6000);
};

// 10-s-Fenster mit rAF-Framezeit-Sammlung. topUp=false = KEIN Spawn-Top-up
// (natuerliche Director-Dichte, Befund 3 der Vor-Lane).
const runWindow = (seconds, topUp, tgt) => page.evaluate(async ({ seconds, topUp, target }) => {
  const start = performance.now();
  let frames = 0;
  let last = start;
  let worst = 0;
  let lastSpawn = start;
  const samples = [];
  const dts = [];
  await new Promise((resolve) => {
    const tick = (now) => {
      const dt = now - last;
      if (frames > 0) {
        worst = Math.max(worst, dt);
        dts.push(dt);
      }
      last = now;
      frames++;
      if (topUp && now - lastSpawn >= 50) {
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
  const sorted = [...dts].sort((a, b) => a - b);
  const pct = (q) => sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 100) / 100 : null;
  return {
    fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
    frames,
    elapsedMs: Math.round(elapsed),
    worstFrameMs: Math.round(worst * 10) / 10,
    minEnemies: samples.length ? Math.min(...samples) : null,
    avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null,
    p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
  };
}, { seconds, topUp, target: tgt });

const window_ = async (label, topUp) => {
  const qualityBefore = await page.evaluate(() => window.__lf.state().quality);
  const before = await gfxinfo();
  const raf = await runWindow(secs, topUp, target);
  await sleep(500); // Letzte Frames des Fensters rendern lassen
  const after = await gfxinfo();
  const qualityAfter = await page.evaluate(() => window.__lf.state().quality);
  const dFrames = after.totalFrames - before.totalFrames;
  const dJanky = after.jankyFrames - before.jankyFrames;
  const jankyPct = Math.round((dJanky / dFrames) * 10000) / 100;
  return {
    label,
    topUp,
    window: { seconds: secs, targetEnemies: topUp ? target : null, ...raf },
    quality: { before: qualityBefore, after: qualityAfter },
    gfxinfo: {
      before: { totalFrames: before.totalFrames, jankyFrames: before.jankyFrames, p95: before.p95 },
      after: { totalFrames: after.totalFrames, jankyFrames: after.jankyFrames, p95: after.p95 },
      diffFrames: dFrames,
      diffJanky: dJanky,
      jankyPct,
      rawBefore: before.raw,
      rawAfter: after.raw,
    },
  };
};

// --- Ablauf -----------------------------------------------------------------

await ensureRun();
await setupM25();

const w1 = await window_("m25-topup-1", true);
const w2 = await window_("m25-topup-2", true);

// Drittes Fenster: frischer Lauf, Setup ohne Top-up (natuerliche Director-Dichte).
await ensureRun();
await setupM25();
const w3 = await window_("m25-natural", false);

const agg = (a, b) => {
  const frames = a.gfxinfo.diffFrames + b.gfxinfo.diffFrames;
  const janky = a.gfxinfo.diffJanky + b.gfxinfo.diffJanky;
  return {
    diffFrames: frames,
    diffJanky: janky,
    jankyPct: Math.round((janky / frames) * 10000) / 100,
    fpsAvg: Math.round(((a.window.fps + b.window.fps) / 2) * 10) / 10,
    p95RafMax: Math.max(a.window.p95, b.window.p95),
  };
};

const m25 = agg(w1, w2);
const out = {
  gate: "K1/K3 gfxinfo janky < 10 % bei FPS >= 60, p95 (rAF je Fenster) <= 16 ms",
  device: { ...device, bridgeStatus: await (await fetch(`${BRIDGE}/status`)).json().catch(() => null) },
  windows: [w1, w2, w3],
  m25Aggregate: m25,
  naturalWindow: { jankyPct: w3.gfxinfo.jankyPct, fps: w3.window.fps, p95Raf: w3.window.p95 },
  jsErrors: errors,
  passed: m25.jankyPct < 10 && m25.fpsAvg >= 60 && m25.p95RafMax <= 16 && errors.length === 0,
};
console.log(JSON.stringify({
  renderer: device.renderer,
  m25: m25,
  natural: out.naturalWindow,
  passed: out.passed,
}, null, 1));
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
process.exit(out.passed ? 0 : 1);
