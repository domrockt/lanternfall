#!/usr/bin/env node
// m10-run-setter-churn K1/K3: Phaser-Setter-Churn + per-Frame-Allokationen im
// Run.ts-eigenen Frame-Pfad (Restbefund m10-run-cpu-budget "Offene Bedarfe:
// p95-Rest Phaser-Setter/FX" + v10-Geraeteabnahme K3 Hebel B: worstFrame
// 33-34 ms, Allokationen/Setter im Frame).
//
// Chaos-Setup identisch zu scripts/m10-fx-alloc.mjs (Seed 1, skipTo(1500),
// 6 Evolutionen + 6 Passives St. 5, 500 Gegner gehalten, god/autoplay).
// Gemessen wird im Messfenster:
//
//   - setterChurn: Phaser-GameObject-Setter-Aufrufe/s bzw. /Frame, Szene-
//     attribuiert ("run" = Run.ts-Pfad, Rest = UI/other), je Property/Methode
//     mit changed/unchanged-Anteil (Top-Quellen-Ranking).
//   - alloc: CDP Sampling-Heap-Profiler (Intervall 512 B), attribuiert auf die
//     Run.ts-Spanne im unminifizierten Bundle vs. gesamt.
//   - jsFrameCpuMs p50/p95/p99/mean/max + worstFrame-Spitzen (v10 K3 Klasse).
//   - renderer (WEBGL_debug_renderer_info, Beleg-Pflicht Android-Regeln).
//
// OHNE flock (kein FPS-/Echtzeit-Kriterium: Setter-Zaehler, Allokation und
// CPU-ms sind last-/GPU-unabhaengige Vergleichswerte, siehe common.md).
//
//   node scripts/m10-run-setter-churn.mjs --tag=before \
//     --json=/home/ai/games/.evidence/m10-run-setter-churn/m10-run-setter-churn-before.json
import { writeFileSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const OUT = resolve(String(argOf("json", `shots/m10-run-setter-churn-${TAG}.json`)));
const SECONDS = Number(argOf("seconds", "20"));
const TARGET = Number(argOf("target", "500"));
const vp = String(argOf("viewport", "640x360")).split("x").map(Number);
const VIEWPORT = { width: vp[0] || 640, height: vp[1] || 360 };
const SEED = String(argOf("seed", "1"));
/** v10-Geraetekasten K3: worstFrame 33-34 ms Klasse. */
const SPIKE_MS = Number(argOf("spike", "16"));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

// Unminifiziert (Attribution auf Run.ts-Spanne lesbar, wie m10-run-cpu-budget
// K2): vor ensureBuild bauen; nach der Lane baut npm run build wieder normal.
if (String(argOf("minify", "false")) === "false") {
  console.log("[m10-run-setter-churn] unminifizierter Build (Attribution) ...");
  execFileSync("npx", ["vite", "build", "--base", "./", "--minify", "false"], { stdio: "inherit" });
}
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e?.stack ?? e).split("\n").slice(0, 4).join(" | ")));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// rAF-Callback-CPU-Messung INJIZIEREN, bevor Phaser laedt (wie m10-fx-alloc.mjs).
await page.addInitScript(() => {
  const frames = [];
  const origRaf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (cb) {
    return origRaf.call(window, function (ts) {
      const t0 = performance.now();
      cb(ts);
      frames.push(performance.now() - t0);
    });
  };
  window.__cpuStats = { get frames() { return frames; } };
});

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

// Setter-Instrumentierung: Wraps um Accessor-Properties (x/y/alpha/depth/...)
// und set*-Methoden auf den Phaser-GameObject-Klassen. Zaehlt Aufrufe je
// Szenenschluessel ("run" = Run.ts-Pfad) mit changed/unchanged-Anteil.
// Nur Zaehlen, kein Verhalten geaendert (Forward ist identisch).
const INSTRUMENT = () => {
  const c = window.__lfSetters = { calls: new Map(), on: true };
  const bump = (target, prop, changed) => {
    const sc = target.scene;
    const key = `${sc && sc.sys ? sc.sys.settings.key : "?"}|${prop}`;
    const e = c.calls.get(key);
    if (e) { e.calls++; if (changed) e.changed++; }
    else c.calls.set(key, { calls: 1, changed: changed ? 1 : 0 });
  };
  const MARK = Symbol("lfsc");
  const ACCESSORS = ["x", "y", "angle", "alpha", "scaleX", "scaleY", "visible", "depth", "blendMode", "tint", "tintFill"];
  const METHODS = ["setAlpha", "setDepth", "setBlendMode", "setTint", "setTintFill", "clearTint",
    "setScale", "setPosition", "setVisible", "setTexture", "setActive", "setDisplaySize", "setOrigin"];
  const CLASSES = [
    window.Phaser.GameObjects.Sprite,
    window.Phaser.GameObjects.Image,
    window.Phaser.GameObjects.Rectangle,
    window.Phaser.GameObjects.Container,
    window.Phaser.GameObjects.Text,
    window.Phaser.GameObjects.BitmapText,
    window.Phaser.GameObjects.Graphics,
  ];
  const wrapProto = (proto) => {
    if (!proto || proto[MARK]) return;
    proto[MARK] = true;
    for (const prop of ACCESSORS) {
      const d = Object.getOwnPropertyDescriptor(proto, prop);
      if (!d || !d.set) continue;
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: d.enumerable,
        get: d.get,
        set(v) { bump(this, prop, d.get.call(this) !== v); d.set.call(this, v); },
      });
    }
    for (const m of METHODS) {
      const d = Object.getOwnPropertyDescriptor(proto, m);
      if (!d || typeof d.value !== "function") continue;
      const orig = d.value;
      Object.defineProperty(proto, m, {
        configurable: true,
        enumerable: d.enumerable,
        writable: true,
        value(...a) {
          bump(this, m, false);
          return orig.apply(this, a);
        },
      });
    }
  };
  for (const cls of CLASSES) {
    if (!cls) continue;
    // Eigentuemendes Proto in der Kette suchen (Accessor gehoert oft einem
    // Basis-Proto wie GameObjects.Image bzw. Shape).
    let p = cls.prototype;
    const seen = new Set();
    while (p && p !== Object.prototype && !seen.has(p)) {
      seen.add(p);
      wrapProto(p);
      p = Object.getPrototypeOf(p);
    }
  }
  return { props: ACCESSORS.length, methods: METHODS.length };
};

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    window.__lf.setSuppressLevelUps(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
  });
  await page.evaluate(({ evolutions, passives }) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1500);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await page.waitForTimeout(6000);
  await clearLevelUps();

  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2") ??
      document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      webglRenderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER) ?? ""),
      webglVendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl?.getParameter(gl.VENDOR) ?? ""),
    };
  });

  const instrumented = await page.evaluate(INSTRUMENT);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: 512 });

  // Messfenster: Gegner bei 500 halten, Frames + Setter-Zaehler sammeln.
  const run = await page.evaluate(async ({ seconds, target }) => {
    try {
    const c = window.__lfSetters;
    const f0 = window.__cpuStats.frames.length;
    const s0 = [...c.calls].map(([k, v]) => [k, { ...v }]);
    const start = performance.now();
    // Gegnerzahl mittelns (Vergleichbarkeit before/after; das Spiel cappt die
    // Population selbst ueber maxActiveEnemies/frameBudget — Ziel nur Top-up).
    let enemySum = 0;
    let enemySamples = 0;
    await new Promise((resolve0) => {
      const spawnTimer = setInterval(() => {
        const active = window.__lf.stats().enemies;
        enemySum += active;
        enemySamples++;
        if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
        if (performance.now() - start >= 4000) window.__lf.god(true); // God erneuern
      }, 50);
      setTimeout(() => { clearInterval(spawnTimer); resolve0(); }, seconds * 1000);
    });
    const elapsed = performance.now() - start;
    const f1 = window.__cpuStats.frames.length;
    // Szene-attribuiert auswerten (run vs. rest) + Top-Sites.
    const perScene = new Map();
    for (const [k, v] of c.calls) {
      const base0 = s0.find(([k2]) => k2 === k);
      const calls = v.calls - (base0 ? base0[1].calls : 0);
      const changed = v.changed - (base0 ? base0[1].changed : 0);
      const scene = k.split("|")[0];
      const prop = k.split("|")[1];
      const sc = perScene.get(scene) ?? { calls: 0, changed: 0, props: new Map() };
      sc.calls += calls; sc.changed += changed;
      const p = sc.props.get(prop) ?? { calls: 0, changed: 0 };
      p.calls += calls; p.changed += changed;
      sc.props.set(prop, p);
      perScene.set(scene, sc);
    }
    const out = { scenes: {}, top: [] };
    for (const [scene, sc] of perScene) {
      out.scenes[scene] = {
        calls: sc.calls,
        callsPerFrame: Math.round((sc.calls / Math.max(1, f1 - f0)) * 10) / 10,
        changed: sc.changed,
        changedPercent: Math.round((sc.changed / Math.max(1, sc.calls)) * 1000) / 10,
        props: [...sc.props.entries()]
          .map(([prop, p]) => ({ prop, ...p, changedPercent: Math.round((p.changed / Math.max(1, p.calls)) * 1000) / 10 }))
          .sort((a, b) => b.calls - a.calls),
      };
    }
    for (const [scene, sc] of perScene) {
      for (const [prop, p] of sc.props) out.top.push({ scene, prop, calls: p.calls, changed: p.changed });
    }
    out.top.sort((a, b) => b.calls - a.calls);
    out.top = out.top.slice(0, 25).map((t) => ({
      ...t,
      changedPercent: Math.round((t.changed / Math.max(1, t.calls)) * 1000) / 10,
    }));
    return {
      framesMeasured: f1 - f0,
      frameWindowStart: f0,
      frameWindowEnd: f1,
      elapsedMs: Math.round(elapsed),
      avgEnemies: enemySamples > 0 ? Math.round((enemySum / enemySamples) * 10) / 10 : window.__lf.stats().enemies,
      endEnemies: window.__lf.stats().enemies,
      kills: window.__lf.stats().kills,
      setterChurn: out,
    };
    } catch (e) {
      return {
        framesMeasured: 0, frameWindowStart: 0, frameWindowEnd: 0, elapsedMs: 0,
        avgEnemies: 0, endEnemies: 0, kills: 0, windowError: String(e?.stack ?? e).split("\n").slice(0, 6).join(" | "),
        setterChurn: { scenes: {}, top: [] },
      };
    }
  }, { seconds: SECONDS, target: TARGET });

  const { profile: heapProfile } = await cdp.send("HeapProfiler.stopSampling");
  const frameData = await page.evaluate(({ from, to }) => ({
    cpuMs: window.__cpuStats.frames.slice(from, to),
  }), { from: run.frameWindowStart, to: run.frameWindowEnd });

  // Top-Allokations-Sites; Run.ts-Attribution ueber die Zeilen-Spanne der
  // Run-Szene im unminifizierten Chunk ("var Run = class" bis naechstes
  // "var <X> = class" auf Spalten-0).
  const allocMap = new Map();
  const walkHeap = (n) => {
    const cf = n.callFrame ?? {};
    const self = n.selfSize ?? 0;
    if (self > 0) {
      const url = String(cf.url || "").replace(/^https?:\/\/[^/]+\//, "");
      const key = `${cf.functionName || "(anonymous)"} @ ${url}:${(cf.lineNumber ?? 0) + 1}`;
      allocMap.set(key, (allocMap.get(key) ?? 0) + self);
    }
    for (const ch of n.children ?? []) walkHeap(ch);
  };
  walkHeap(heapProfile.head);
  const totalAllocBytes = [...allocMap.values()].reduce((a, b) => a + b, 0);

  let runLines = null;
  try {
    const assetDir = "dist/assets";
    const runChunk = readdirSync(assetDir).find((f) => /^Run-.*\.js$/.test(f));
    if (runChunk) {
      const text = readFileSync(`${assetDir}/${runChunk}`, "utf8");
      const start = text.search(/^var Run = class/m);
      if (start >= 0) {
        const after = text.indexOf("\nvar ", start + 1);
        runLines = {
          file: runChunk,
          from: text.slice(0, start).split("\n").length,
          to: after < 0 ? text.split("\n").length : text.slice(0, after).split("\n").length + 1,
        };
      }
    }
  } catch { /* Attribution optional */ }

  let runAllocBytes = 0;
  let harnessAllocBytes = 0;
  for (const [site, bytes] of allocMap) {
    const [fn, rest] = site.split(" @ ");
    const url = rest ?? "";
    // Chunk-URLs im Profil tragen das "assets/"-Prefix (z. B.
    // "assets/Run-BF62BIj8.js"); runLines.file ist der bare Dateiname.
    if (runLines && (url === runLines.file || url.endsWith(`/${runLines.file}`))) {
      const line = Number(site.split(":").pop());
      if (line >= runLines.from && line < runLines.to) { runAllocBytes += bytes; continue; }
    }
    if (/queueEnemyWave|spawnEnemy/.test(fn)) harnessAllocBytes += bytes;
  }

  const xs = [...frameData.cpuMs].sort((a, b) => a - b);
  const q = (p) => (xs.length ? Math.round(xs[Math.min(xs.length - 1, Math.floor(xs.length * p))] * 100) / 100 : 0);
  const mean = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const max = xs.length ? Math.round(xs[xs.length - 1] * 100) / 100 : 0;

  result = {
    tag: TAG,
    date: new Date().toISOString(),
    seed: SEED,
    viewport: `${VIEWPORT.width}x${VIEWPORT.height}`,
    windowSeconds: SECONDS,
    spikeThresholdMs: SPIKE_MS,
    instrumented,
    renderer,
    framesMeasured: run.framesMeasured,
    elapsedMs: run.elapsedMs,
    fps: Math.round((run.framesMeasured / (run.elapsedMs / 1000)) * 10) / 10,
    avgEnemies: run.avgEnemies,
    kills: run.kills,
    jsFrameCpuMs: { p50: q(0.5), p95: q(0.95), p99: q(0.99), mean: Math.round(mean * 100) / 100, max },
    worstFrame: {
      max,
      spikesOverThreshold: xs.filter((v) => v > SPIKE_MS).length,
      spikesOver33: xs.filter((v) => v > 33).length,
    },
    alloc: {
      totalSampledBytes: Math.round(totalAllocBytes),
      bytesPerFrame: Math.round(totalAllocBytes / Math.max(1, run.framesMeasured)),
      runLines,
      runAttributionBytes: Math.round(runAllocBytes),
      runBytesPerFrame: Math.round(runAllocBytes / Math.max(1, run.framesMeasured)),
      runPercent: Math.round((runAllocBytes / Math.max(1, totalAllocBytes)) * 1000) / 10,
      harnessBytesPerFrame: Math.round(harnessAllocBytes / Math.max(1, run.framesMeasured)),
    },
    setterChurn: run.setterChurn,
    topAllocSites: [...allocMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([site, bytes]) => ({
        site,
        bytes: Math.round(bytes),
        bytesPerFrame: Math.round(bytes / Math.max(1, run.framesMeasured)),
        percent: Math.round((bytes / Math.max(1, totalAllocBytes)) * 1000) / 10,
      })),
    jsErrors: errors,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`[m10-run-setter-churn] ${TAG}: setterRun=${result.setterChurn.scenes.run?.callsPerFrame ?? "?"}/frame allocRun=${result.alloc.runBytesPerFrame}B/frame (${result.alloc.runPercent}%) p95=${result.jsFrameCpuMs.p95}ms max=${max}ms -> ${OUT}`);
} finally {
  await browser.close();
  await server.stop();
}
process.exit(result && errors.length === 0 ? 0 : 1);
