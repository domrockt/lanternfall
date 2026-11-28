// M10-tablet-fx-rootcause (K1/K2): GL-Aufruf-Matrix ueber den Evo-Stack.
// Misst pro Fenster fps + GL-Aufrufe/Frame (draws, blendFunc, useProgram,
// bindFramebuffer, ...) fuer Basis, jede Evo-Einzelstufe und Stapel in zwei
// Reihenfolgen. Zaehlt ausserdem echte setBlendMode-Wechsel mit Stack (K2:
// Datei+Zeile der Blend-Quelle) und sammelt bindFramebuffer/useProgram-Stacks.
//
// Modi:
//   node scripts/m10-tablet-fx-rc.mjs --mode local  --out <pfad.json>
//   node scripts/m10-tablet-fx-rc.mjs --mode device --out <pfad.json>
//
// Nur Messung: keine Aenderungen an src/** oder tests/**.
import { loadPlaywright, ensureBuild, startServer } from "./harness.mjs";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const mode = arg("mode", "local");
const outPath = arg("out", null);
const winSecs = Number(arg("secs", "4"));

const BRIDGE = "http://172.17.0.1:5181";
const CDP = "http://172.17.0.1:9333";

const EVOS = ["thorn_storm", "phoenix", "eternal_winter", "thunder_seal", "soul_beacon", "wrath_pendulum"];
const ORDER_A = [...EVOS];
const ORDER_B = [...EVOS].reverse();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Instrumentierung nach jedem Szenenstart installieren.
const INSTRUMENT = () => {
  const P = WebGLRenderingContext.prototype;
  window.__glc = {};
  for (const fn of ["drawElements", "drawArrays", "blendFunc", "blendFuncSeparate", "useProgram", "bindFramebuffer", "bindTexture", "bufferSubData", "bufferData", "texImage2D", "texSubImage2D", "clear"]) {
    const o = P[fn];
    if (!o) continue;
    P[fn] = function (...a) {
      window.__glc[fn] = (window.__glc[fn] || 0) + 1;
      return o.apply(this, a);
    };
  }
  window.__fbStacks = [];
  window.__fbNull = 0; window.__fbNonNull = 0;
  const ofb = P.bindFramebuffer;
  P.bindFramebuffer = function (t, fb) {
    if (fb == null) window.__fbNull++;
    else {
      window.__fbNonNull++;
      if (window.__fbStacks.length < 4) window.__fbStacks.push({ fb: String(fb), stack: new Error().stack.split("\n").slice(2, 10).join(" | ") });
    }
    return ofb.call(this, t, fb);
  };
  window.__progStacks = [];
  window.__progSeen = new Map();
  const up = P.useProgram;
  P.useProgram = function (pr) {
    if (!window.__progSeen.has(pr) && window.__progStacks.length < 8) {
      window.__progSeen.set(pr, true);
      window.__progStacks.push(new Error().stack.split("\n").slice(2, 10).join(" | "));
    }
    return up.call(this, pr);
  };
  window.__blendStacks = [];
  let lastB = null;
  const obf = P.blendFunc;
  P.blendFunc = function (s, d) {
    const key = String(s) + "/" + String(d);
    if (key !== lastB && window.__blendStacks.length < 8) window.__blendStacks.push(key + " @ " + new Error().stack.split("\n").slice(2, 12).join(" | "));
    lastB = key;
    return obf.call(this, s, d);
  };
  window.__bmChanges = [];
  const SP = Phaser.GameObjects.Sprite.prototype;
  const osb = SP.setBlendMode;
  SP.setBlendMode = function (m) {
    const prev = this._blendMode;
    const r = osb.call(this, m);
    if (prev !== m && window.__bmChanges.length < 60) {
      window.__bmChanges.push({ from: prev, to: m, stack: new Error().stack.split("\n").slice(2, 8).join(" | ") });
    }
    return r;
  };
};

// Sprite-Census: wer ist mit welchem Blend sichtbar in der Szene (K2: welche Draws).
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

// Ein Fenster messen: Zaehler nullen, N rAF-Frames sammeln, /Frame runden.
const windowFn = (secs) => {
  window.__glc = {}; window.__fbStacks = []; window.__blendStacks = []; window.__bmChanges = [];
  window.__fbNull = 0; window.__fbNonNull = 0;
  let fr = 0; const t0 = performance.now();
  return new Promise((res) => {
    function f(t) {
      fr++;
      if (t - t0 < secs * 1000) requestAnimationFrame(f);
      else {
        const per = {};
        for (const [k, v] of Object.entries(window.__glc)) per[k] = Math.round((v / fr) * 10) / 10;
        res({
          fps: Math.round((fr / secs) * 10) / 10,
          frames: fr,
          perFrame: per,
          fbNullPerFrame: Math.round((window.__fbNull / fr) * 10) / 10,
          fbNonNullPerFrame: Math.round((window.__fbNonNull / fr) * 10) / 10,
          fbStacks: window.__fbStacks.slice(0, 4),
          blendStacks: window.__blendStacks.slice(0, 6),
          progStacks: window.__progStacks.slice(0, 6),
          bmChanges: window.__bmChanges.slice(0, 30),
        });
      }
    }
    requestAnimationFrame(f);
  });
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

async function startRun(page) {
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
  const weapons = await page.evaluate(() => window.__lf.state().weapons);
  const rec = { label, ...r, census, weapons };
  const pf = r.perFrame;
  console.log(`${label}: fps=${r.fps} draws=${Math.round((pf.drawElements || 0) + (pf.drawArrays || 0))} blend=${Math.round((pf.blendFunc || 0) + (pf.blendFuncSeparate || 0))} prog=${Math.round(pf.useProgram || 0)} fb=${Math.round(pf.bindFramebuffer || 0)}`);
  return rec;
}

async function runMatrixLocal(page, results) {
  // Einzelstufen: Reload je Evo (Basis + 6 Evo-allein).
  for (let i = 0; i <= EVOS.length; i++) {
    const evo = i === 0 ? null : EVOS[i - 1];
    await page.goto(`http://127.0.0.1:${globalThis.__port}/?debug=1`, { waitUntil: "domcontentloaded" });
    await startRun(page);
    if (evo) await page.evaluate((e) => window.__lf.addWeapon(e, 1), evo);
    await sleep(2500); // FX-Peak der Waffe erreichen
    results.push(await measureWindow(page, evo ? `single:${evo}` : "base"));
  }
  // Stapel: kumulativ in zwei Reihenfolgen (je Reload, Fenster nach jedem Add).
  for (const [tag, order] of [["stackA", ORDER_A], ["stackB", ORDER_B]]) {
    await page.goto(`http://127.0.0.1:${globalThis.__port}/?debug=1`, { waitUntil: "domcontentloaded" });
    await startRun(page);
    await sleep(1500);
    results.push(await measureWindow(page, `${tag}:base`));
    for (let i = 0; i < order.length; i++) {
      await page.evaluate((e) => window.__lf.addWeapon(e, 1), order[i]);
      await sleep(2500);
      results.push(await measureWindow(page, `${tag}:+${i + 1}_${order[i]}`));
    }
  }
}

async function runMatrixDevice(page, results) {
  const relaunch = async () => {
    await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" });
    await startRun(page);
  };
  for (let i = 0; i <= EVOS.length; i++) {
    const evo = i === 0 ? null : EVOS[i - 1];
    await relaunch();
    if (evo) await page.evaluate((e) => window.__lf.addWeapon(e, 1), evo);
    await sleep(3000);
    results.push(await measureWindow(page, evo ? `single:${evo}` : "base"));
  }
  for (const [tag, order] of [["stackA", ORDER_A], ["stackB", ORDER_B]]) {
    await relaunch();
    await sleep(1500);
    results.push(await measureWindow(page, `${tag}:base`));
    for (let i = 0; i < order.length; i++) {
      await page.evaluate((e) => window.__lf.addWeapon(e, 1), order[i]);
      await sleep(3000);
      results.push(await measureWindow(page, `${tag}:+${i + 1}_${order[i]}`));
    }
  }
}

const results = [];
let meta = { mode, winSecs };

if (mode === "local") {
  ensureBuild();
  const { port, stop } = await startServer();
  globalThis.__port = port;
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  page.on("pageerror", (e) => (meta.jsErrors ||= []).push(String(e)));
  meta = { ...meta, ...(await rendererInfo(page)), viewport: "640x360" };
  await runMatrixLocal(page, results);
  await browser.close();
  stop();
} else {
  await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" });
  const { chromium } = await loadPlaywright();
  const browser = await chromium.connectOverCDP(CDP);
  const page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (e) => (meta.jsErrors ||= []).push(String(e)));
  meta = { ...meta, ...(await rendererInfo(page)) };
  await runMatrixDevice(page, results);
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
