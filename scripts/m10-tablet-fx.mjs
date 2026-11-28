// M10-tablet-fx-hotspot (K2/K3): Vorher/Nachher-Messung des Blend-Flush-Hotspots.
// Basis: scripts/m10-tablet-fx-rc.mjs aus der Root-Cause-Lane (gleiche Instrumentierung,
// schlanke Fensterauswahl — Korridor laut Bericht: stackA:+6, blend <= 8, draws <= 14).
//
//   node scripts/m10-tablet-fx.mjs --mode local  --out <pfad.json> [--quick] [--shots <dir>]
//   node scripts/m10-tablet-fx.mjs --mode device --out <pfad.json>
//
// Nur Messung: keine Spiellogik-Aenderungen hier. Belege nach ~/games/.evidence/.
import { loadPlaywright, ensureBuild, startServer } from "./harness.mjs";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const mode = arg("mode", "local");
const outPath = arg("out", null);
const winSecs = Number(arg("secs", "4"));
const quick = argv.includes("--quick");
const shotsDir = arg("shots", null);

const BRIDGE = "http://172.17.0.1:5181";
const CDP = "http://172.17.0.1:9333";

const EVOS = ["thorn_storm", "phoenix", "eternal_winter", "thunder_seal", "soul_beacon", "wrath_pendulum"];
const ORDER_A = [...EVOS];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Instrumentierung nach jedem Szenenstart (identisch zur Root-Cause-Lane).
const INSTRUMENT = () => {
  const P = WebGLRenderingContext.prototype;
  window.__glc = {};
  for (const fn of ["drawElements", "drawArrays", "blendFunc", "blendFuncSeparate", "useProgram", "bindFramebuffer", "bufferSubData", "bufferData"]) {
    const o = P[fn];
    if (!o) continue;
    P[fn] = function (...a) {
      window.__glc[fn] = (window.__glc[fn] || 0) + 1;
      return o.apply(this, a);
    };
  }
  window.__fbNull = 0; window.__fbNonNull = 0;
  const ofb = P.bindFramebuffer;
  P.bindFramebuffer = function (t, fb) {
    if (fb == null) window.__fbNull++;
    else window.__fbNonNull++;
    return ofb.call(this, t, fb);
  };
};

const windowFn = (secs) => {
  const w = secs * 1000;
  return new Promise((resolve) => {
    const start = performance.now();
    const zero = {};
    for (const k in window.__glc) zero[k] = 0;
    window.__glc = { ...zero };
    const fb0 = { n: window.__fbNull, nn: window.__fbNonNull };
    const frames = [];
    let last = 0;
    const f = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (now - start >= w) {
        const dt = (now - start) / 1000;
        const perFrame = {};
        for (const k in window.__glc) perFrame[k] = window.__glc[k] / frames.length;
        perFrame.bindFramebuffer = (window.__fbNull - fb0.n + window.__fbNonNull - fb0.nn) / frames.length;
        resolve({
          fps: frames.length / dt,
          frames: frames.length,
          perFrame,
          fbNonNullPerFrame: (window.__fbNonNull - fb0.nn) / frames.length,
        });
        return;
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
};

const CENSUS = () => {
  const game = window.__game;
  if (!game) return null;
  const scene = game.scene.getScene("run") || game.scene.getScenes(true)[0];
  if (!scene) return null;
  const groups = new Map();
  for (const c of scene.children.list) {
    if (!c.visible) continue;
    const key = `${c.constructor.name}|blend${c.blendMode}|${c.texture && c.texture.key ? c.texture.key : "-"}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  return [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, n]) => ({ k, n }));
};

const rendererInfo = (page) => page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    webglRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    webglVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    dpr: window.devicePixelRatio,
  };
});

async function startRun(page, baseUrl) {
  await page.goto(`${baseUrl}/?debug=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.spawnEnemy("wisp", 200);
  });
  await page.evaluate(INSTRUMENT);
  await sleep(2500); // Crowd einschwarmen lassen
}

async function measureWindow(page, label) {
  const r = await page.evaluate(windowFn, winSecs);
  const census = await page.evaluate(CENSUS);
  const rec = { label, ...r, census };
  const pf = r.perFrame;
  console.log(`${label}: fps=${r.fps} draws=${Math.round((pf.drawElements || 0) + (pf.drawArrays || 0))} blend=${Math.round((pf.blendFunc || 0) + (pf.blendFuncSeparate || 0))} bufSub=${Math.round(pf.bufferSubData || 0)} fb=${Math.round(pf.bindFramebuffer || 0)} fbNonNull=${r.fbNonNullPerFrame}`);
  return rec;
}

// Lokal: Reload je Fenster (getrennte Runs, wie Root-Cause-Lane).
async function runLocal(page, port, results) {
  const base = `http://127.0.0.1:${port}`;
  await startRun(page, base);
  results.push(await measureWindow(page, "base"));

  // Einzel Evo thorn_storm (Device-Report-Schwelle).
  await startRun(page, base);
  await page.evaluate((e) => window.__lf.addWeapon(e, 1), "thorn_storm");
  await sleep(2500);
  results.push(await measureWindow(page, "single:thorn_storm"));

  // Stapel kumulativ in Reihenfolge A (Bericht-Fenster stackA:+3/+6).
  await startRun(page, base);
  await sleep(1500);
  for (let i = 0; i < ORDER_A.length; i++) {
    await page.evaluate((e) => window.__lf.addWeapon(e, 1), ORDER_A[i]);
    await sleep(2500);
    if (!quick || i === ORDER_A.length - 1 || i === 2) {
      results.push(await measureWindow(page, `stackA:+${i + 1}_${ORDER_A[i]}`));
    }
  }

  // Optik-Beleg: je Evo ein Screenshot im Einzelstufen-Peak (Vergleich vor/nach).
  if (shotsDir) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(shotsDir, { recursive: true });
    for (const evo of EVOS) {
      await startRun(page, base);
      await page.evaluate((e) => window.__lf.addWeapon(e, 1), evo);
      await sleep(2500);
      await page.screenshot({ path: `${shotsDir}/evo-${evo}.png` });
      console.log(`shot -> ${shotsDir}/evo-${evo}.png`);
    }
  }
}

async function runDevice(page, results, browser) {
  const relaunch = async () => {
    await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" });
    // App-Restart schliesst die alte CDP-Page -> frisch holen.
    page = browser.contexts()[0].pages()[0];
    page.on("pageerror", (e) => (meta.jsErrors ||= []).push(String(e)));
    await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.setSuppressLevelUps(true);
      window.__lf.spawnEnemy("wisp", 200);
    });
    await page.evaluate(INSTRUMENT);
    await sleep(3000);
  };
  await relaunch();
  results.push(await measureWindow(page, "base"));
  await relaunch();
  for (let i = 0; i < ORDER_A.length; i++) {
    await page.evaluate((e) => window.__lf.addWeapon(e, 1), ORDER_A[i]);
    await sleep(3000);
    results.push(await measureWindow(page, `stackA:+${i + 1}_${ORDER_A[i]}`));
  }
}

const results = [];
let meta = { mode, winSecs, quick, script: "scripts/m10-tablet-fx.mjs" };

if (mode === "local") {
  ensureBuild();
  const { port, stop } = await startServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on("pageerror", (e) => (meta.jsErrors ||= []).push(String(e)));
  meta = { ...meta, ...(await rendererInfo(page)), viewport: "640x360" };
  await runLocal(page, port, results);
  await browser.close();
  stop();
} else {
  await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP);
  let page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (e) => (meta.jsErrors ||= []).push(String(e)));
  meta = { ...meta, ...(await rendererInfo(page)) };
  await runDevice(page, results, browser);
  await browser.close();
}

const out = { meta, results };
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("JSON ->", outPath);
}
