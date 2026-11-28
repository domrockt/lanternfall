// m10-blend-band-followup (K1/K4): Rest-Blend-Wechsel/Frame nach dem
// FX_GLOW_DEPTH-Band (m10-tablet-fx-hotspot). Misst in 2 Profilen je Fenster
// FPS + GL-Aufrufe/Frame (blendFunc+blendFuncSeparate = Blend-Wechsel, draws,
// bufferSubData) und zaehlt echte setBlendMode-Wechsel. Census gruppiert
// sichtbare Objekte nach Tiefe+Blend — zeigt, welche ADD-Quellen NICHT im
// Band (7.5) liegen. Renderer-String Pflicht (Mess-Sperren-Regel: kein
// SwiftShader-Beleg).
//
// Profile:
//   stack     — Basis + Evo-Stack kumulativ bis +6 (200 wisp, god)
//   minute25  — voller Evo-Stack + 300 wisp (Minute-25-Dichte, Worst-Case)
//
// Aufruf:
//   node scripts/m10-blend-band.mjs --out <pfad.json> [--profiles stack,minute25] [--secs 4] [--shot <png-prefix>]
//
// Vorher/Nachher-Belege: ~/games/.evidence/m10-blend-band-followup/.
// FPS/Zeit-Anteil dieses Laufs ist VSync-gekappt — Kennzahl ist der
// Blend-Wechsel-Zaehler (rendererunabhaengig), kein FPS-Tor.
import { loadPlaywright, ensureBuild, startServer } from "./harness.mjs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const winSecs = Number(arg("secs", "4"));
const profiles = String(arg("profiles", "stack,minute25")).split(",");
const shotPrefix = arg("shot", null);

const EVOS = ["thorn_storm", "phoenix", "eternal_winter", "thunder_seal", "soul_beacon", "wrath_pendulum"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GL-Zaehler + setBlendMode-Instrumentierung nach dem Szenenstart installieren.
const INSTRUMENT = () => {
  const P = WebGLRenderingContext.prototype;
  window.__glc = {};
  for (const fn of ["drawElements", "drawArrays", "blendFunc", "blendFuncSeparate", "bufferSubData", "bindFramebuffer"]) {
    const o = P[fn];
    if (!o) continue;
    P[fn] = function (...a) {
      window.__glc[fn] = (window.__glc[fn] || 0) + 1;
      return o.apply(this, a);
    };
  }
  // GL-Blend-Wechsel mit Stack (welche Insel kosten die Wechsel je Frame).
  window.__blendStacks = [];
  let lastB = null;
  const obf = P.blendFunc;
  P.blendFunc = function (s, d) {
    const key = String(s) + "/" + String(d);
    if (key !== lastB && window.__blendStacks.length < 12) {
      window.__blendStacks.push(key + " @ " + new Error().stack.split("\n").slice(2, 9).join(" | "));
    }
    lastB = key;
    return obf.call(this, s, d);
  };
  // Echte Blend-Modus-Wechsel je Objekt (Image + Sprite, FX sind Images).
  window.__bmChanges = [];
  for (const Proto of [Phaser.GameObjects.Image.prototype, Phaser.GameObjects.Sprite.prototype]) {
    const osb = Proto.setBlendMode;
    Proto.setBlendMode = function (m) {
      const prev = this._blendMode;
      const r = osb.call(this, m);
      if (prev !== m && window.__bmChanges.length < 80) {
        window.__bmChanges.push({
          from: prev, to: m,
          texture: this.texture && this.texture.key ? this.texture.key : "-",
          depth: this.depth,
          stack: new Error().stack.split("\n").slice(2, 7).join(" | "),
        });
      }
      return r;
    };
  }
};

// Census: sichtbare Objekte gruppiert nach Tiefe (1 Dezimalstelle) + Blend.
const CENSUS = () => {
  const game = window.__game;
  if (!game) return null;
  const scene = game.scene.getScene("run") || game.scene.getScenes(true)[0];
  if (!scene) return null;
  const groups = new Map();
  for (const c of scene.children.list) {
    if (!c.visible) continue;
    const depth = Math.round((c.depth ?? 0) * 10) / 10;
    const key = `d${depth}|blend${c.blendMode}|${c.constructor.name}`;
    const e = groups.get(key) || { key, n: 0, textures: {} };
    e.n++;
    const t = c.texture && c.texture.key ? c.texture.key : "-";
    e.textures[t] = (e.textures[t] || 0) + 1;
    groups.set(key, e);
  }
  return [...groups.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, 24)
    .map((e) => ({ depthBlend: e.key, n: e.n, top: Object.entries(e.textures).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}x${v}`).join(",") }));
};

const windowFn = (secs) => {
  window.__glc = {}; window.__bmChanges = []; window.__blendStacks = [];
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
          blendSwitchPerFrame: Math.round(((per.blendFunc || 0) + (per.blendFuncSeparate || 0)) * 10) / 10,
          blendStacks: window.__blendStacks.slice(0, 12),
          bmChanges: window.__bmChanges.slice(0, 40),
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

const fullStack = async (page) => {
  for (const evo of EVOS) {
    await page.evaluate((e) => window.__lf.addWeapon(e, 1), evo);
    await sleep(1800); // FX-Peak der Waffe erreichen
  }
};

async function measureWindow(page, label) {
  const r = await page.evaluate(windowFn, winSecs);
  const census = await page.evaluate(CENSUS);
  const rec = { label, ...r, census };
  console.log(`${label}: fps=${r.fps} blend=${r.blendSwitchPerFrame} draws=${Math.round((r.perFrame.drawElements || 0) + (r.perFrame.drawArrays || 0))}`);
  if (shotPrefix) {
    await page.screenshot({ path: `${shotPrefix}-${label.replace(/[^a-z0-9]+/gi, "_")}.png` });
  }
  return rec;
}

const results = [];
let meta = { winSecs, profiles };
ensureBuild();
const { port, stop } = await startServer();
globalThis.__port = port;
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
page.on("pageerror", (e) => (meta.jsErrors ||= []).push(String(e)));
meta = { ...meta, ...(await rendererInfo(page)), viewport: "640x360" };

if (profiles.includes("stack")) {
  // Basis (keine Evo) + kumulativer Stack bis +6 (je Reload, wie tablet-fx-rc).
  for (let i = 0; i <= EVOS.length; i++) {
    await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: "domcontentloaded" });
    await startRun(page);
    for (let k = 0; k < i; k++) {
      await page.evaluate((e) => window.__lf.addWeapon(e, 1), EVOS[k]);
      await sleep(1200);
    }
    await sleep(2000);
    results.push(await measureWindow(page, i === 0 ? "base" : `stack:+${i}`));
  }
}
if (profiles.includes("minute25")) {
  // Worst-Case: voller Evo-Stack + 300 Gegner (Minute-25-Dichte).
  await page.goto(`http://127.0.0.1:${port}/?debug=1`, { waitUntil: "domcontentloaded" });
  await startRun(page);
  await page.evaluate(() => window.__lf.spawnEnemy("wisp", 100)); // 200 -> 300
  await sleep(1500);
  await fullStack(page);
  await sleep(2000);
  results.push(await measureWindow(page, "minute25:stack6+300"));
}
await browser.close();
stop();

const out = { meta, results };
if (outPath) {
  mkdirSync(dirname(outPath), { recursive: true });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("JSON ->", outPath);
}
