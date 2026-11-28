// M10-mobile-fps-cap (K1/K3): 10-min-gfxinfo-Fenster am Gerät.
// Methode: Minute-25-Dichte (identisch zu scripts/m10-v10-device-m25.mjs:
// 6 Evos Lv8, 6 Passives Lv5, skipTo(1490), Top-up auf 300 Gegner im 50-ms-Takt),
// segmentiert (Run-Ende bei Minute 30 -> alle 24 Fenster page.reload + skipTo).
//
// Pro 10-s-Fenster: GET /gfxinfo VOR und NACH dem Fenster, Differenz = Fenster-
// Statistik (gfxinfo ist kumulativ seit Stats-Reset). Aus dem HISTOGRAMM-Diff
// (1-ms-Buckets bis ~33 ms) werden p50/p90/p95/p99 und die Anteile >8,3 ms
// (120-Hz-Deadline) und >16,7 ms (60-Hz-Deadline) je Fenster berechnet —
// Bucket-Oberkanten, ±1 ms Granularität. Präsentierte FPS je Fenster =
// diffFrames / Fenstergroesse (echte Render-Rate, unabhängig vom rAF-Zähler).
//
//   node scripts/m10-fps-cap-device.mjs --out <pfad.json> [--minutes 10] [--target 300]
//        [--fps auto|60|max] [--label <name>] [--gate]
//
// --fps: schreibt die BILDRATE-Option (lanternfall-options-v1, Feld "fps":
//        60 = "60", 0 = "MAX") in localStorage und lädt neu — misst damit den
//        Persistenz-Pfad der K2-Option. "auto" fasst den Speicher nicht an.
// --gate: beendet mit rc!=0, wenn der K3-Tor (janky(>16,7 ms) < 10 %, 0
//         JS-Fehler) nicht erreicht wird.
// Nur Messung: keine Aenderungen an src/** oder tests/**.
const BRIDGE = "http://172.17.0.1:5181";
const CDP = "http://172.17.0.1:9333";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const minutes = Number(arg("minutes", "10"));
const target = Number(arg("target", "300"));
const fpsMode = String(arg("fps", "auto"));
const label = String(arg("label", "run"));
const gate = argv.includes("--gate");
const WINDOW_SECS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

// ---------- device-bridge ----------
const deviceStatus = async () => {
  try {
    const j = await (await fetch(`${BRIDGE}/status`)).json();
    return { thermal: j.thermal, battery: j.battery, t: Date.now() };
  } catch (e) {
    return { error: String(e), t: Date.now() };
  }
};
const batteryTempC = (st) => {
  const s = (st?.battery || []).join(" ");
  const m = s.match(/temperature:\s*(\d+)/);
  return m ? Number(m[1]) / 10 : null;
};

// ---------- gfxinfo ----------
const parseHistogram = (text) => {
  const i = text.indexOf("HISTOGRAM:");
  if (i < 0) return {};
  const out = {};
  const re = /(\d+)ms=(\d+)/g;
  let m;
  while ((m = re.exec(text.slice(i))) !== null) out[Number(m[1])] = Number(m[2]);
  return out;
};
const gfxinfo = async () => {
  const t = await (await fetch(`${BRIDGE}/gfxinfo`)).text();
  const num = (re) => {
    const m = t.match(re);
    return m ? Number(m[1]) : null;
  };
  return {
    totalFrames: num(/Total frames rendered: (\d+)/),
    jankyFrames: num(/Janky frames: (\d+)/),
    deadlineMissed: num(/Number Frame deadline missed: (\d+)/),
    histogram: parseHistogram(t),
  };
};
const diffBuckets = (a, b) => {
  const edges = new Set([...Object.keys(a || {}), ...Object.keys(b || {})].map(Number));
  const out = {};
  for (const e of edges) out[e] = Math.max(0, (b?.[e] ?? 0) - (a?.[e] ?? 0));
  return out;
};
const histogramStats = (buckets, total) => {
  if (!total) return null;
  const edges = Object.keys(buckets).map(Number).sort((x, y) => x - y);
  const pct = (p) => {
    let acc = 0;
    for (const e of edges) {
      acc += buckets[e];
      if (acc >= total * p) return e;
    }
    return edges[edges.length - 1] ?? null;
  };
  const sumAbove = (limit) => edges.filter((e) => e >= limit).reduce((s, e) => s + buckets[e], 0);
  return {
    p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
    gt8_3Pct: Math.round((sumAbove(9) / total) * 10000) / 100,
    gt16_7Pct: Math.round((sumAbove(17) / total) * 10000) / 100,
    maxBucketMs: [...edges].reverse().find((e) => buckets[e] > 0) ?? null,
  };
};

// ---------- CDP / Run-Setup ----------
const { loadPlaywright } = await import("./harness.mjs");
const { chromium } = await loadPlaywright();

let browser = null;
let page = null;
const errors = [];
let recoveries = 0;

const applyFpsSetting = async () => {
  // BILDRATE-Option in den Persistenzpfad schreiben (K3: Option wirkt per
  // Settings-Boot, wie im Spiel über das Optionsmenü persistiert).
  if (fpsMode === "auto") return "auto";
  const value = fpsMode === "60" ? 60 : 0;
  await page.evaluate((v) => {
    let opts = {};
    try { opts = JSON.parse(localStorage.getItem("lanternfall-options-v1") || "{}"); } catch { opts = {}; }
    opts.fps = v;
    localStorage.setItem("lanternfall-options-v1", JSON.stringify(opts));
  }, value);
  return fpsMode;
};

const connectSession = async () => {
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
  browser = await chromium.connectOverCDP(CDP);
  page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (e) => errors.push(String(e)));
};

const waitRunScene = async () => {
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
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

await connectSession();
await applyFpsSetting();
await waitRunScene();

// Renderer-String (Abnahme-Pflicht: kein SwiftShader) + Kontext.
const contextInfo = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2")
    ?? document.createElement("canvas").getContext("webgl");
  const dbg = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
  return {
    renderer: dbg && gl ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : null,
    dpr: window.devicePixelRatio || 1,
  };
});

const startStatus = await deviceStatus();
const N = minutes * 6; // 6 Fenster je Minute

let windowsSinceRestart = 0;
const ensureRun = async () => {
  if (!page) await connectSession();
  const sc = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown").catch(() => "dead");
  if (sc === "run" && windowsSinceRestart < 24) return;
  await waitRunScene();
  windowsSinceRestart = 0;
};

// ---------- Messfenster ----------
const samples = [];
let gfxBefore = await gfxinfo();
const windowStartT = Date.now();
for (let w = 0; w < N; w++) {
  windowsSinceRestart++;
  const pre = await gfxinfo();
  let win = null;
  for (let attempt = 0; attempt < 3 && !win; attempt++) {
    try {
      win = await page.evaluate(async ({ target, seconds }) => {
        const start = performance.now();
        let lastSpawn = start;
        let last = start;
        let worst = 0;
        let frames = 0;
        const deltas = [];
        const enemies = [];
        let aborted = false;
        await new Promise((resolve) => {
          const stats = () => { try { return window.__lf.stats(); } catch { return null; } };
          const tick = (now) => {
            const dt = now - last;
            if (frames > 0) { worst = Math.max(worst, dt); deltas.push(dt); }
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
            if (now - start >= seconds * 1000) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const elapsed = performance.now() - start;
        deltas.sort((a, b) => a - b);
        return {
          aborted,
          rafFps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
          worstFrameMs: Math.round(worst * 10) / 10,
          rafP95Ms: deltas.length ? Math.round(deltas[Math.floor(deltas.length * 0.95)] * 10) / 10 : null,
          avgEnemies: enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : 0,
        };
      }, { target, seconds: WINDOW_SECS });
    } catch (e) {
      recoveries++;
      console.log(`  w${w} evaluate fehlgeschlagen (${String(e).slice(0, 80)}) -> Recovery #${recoveries}`);
      try { await browser?.close(); } catch { /* schon tot */ }
      browser = null; page = null;
      await sleep(2000);
      await connectSession();
      windowsSinceRestart = 99; // ensureRun erzwingt neuen Run
    }
  }
  if (!win) { console.log(`  w${w} endgueltig fehlgeschlagen`); break; }
  const post = await gfxinfo();
  const dFrames = Math.max(0, (post.totalFrames ?? 0) - (pre.totalFrames ?? 0));
  const dJanky = Math.max(0, (post.jankyFrames ?? 0) - (pre.jankyFrames ?? 0));
  const hStats = histogramStats(diffBuckets(pre.histogram, post.histogram), dFrames);
  samples.push({
    window: w,
    elapsedMin: Math.round((w * WINDOW_SECS) / 60 * 10) / 10,
    presentedFps: Math.round((dFrames / WINDOW_SECS) * 10) / 10,
    chromeJankyPct: dFrames ? Math.round((dJanky / dFrames) * 10000) / 100 : null,
    pacing: hStats,
    ...win,
  });
  console.log(`w${w} (${samples[samples.length - 1].elapsedMin} min): presented=${samples[samples.length - 1].presentedFps}fps janky16.7=${hStats?.gt16_7Pct}% p95=${hStats?.p95}ms enemies=${win.avgEnemies}${win.aborted ? " ABORTED(run-end)" : ""}`);
  if (win.aborted || windowsSinceRestart >= 24) { console.log("  -> neues Run-Segment"); await ensureRun(); }
  if (w % 6 === 5) {
    const st = await deviceStatus();
    console.log(`  status: ${(st.thermal || []).join(" ")} | ${(st.battery || []).join(" ")}`);
    samples[samples.length - 1].deviceStatus = st;
  }
}
const gfxAfter = await gfxinfo();
const endStatus = await deviceStatus();

// ---------- Auswertung ----------
const total = Math.max(0, (gfxAfter.totalFrames ?? 0) - (gfxBefore.totalFrames ?? 0));
const totalJanky = Math.max(0, (gfxAfter.jankyFrames ?? 0) - (gfxBefore.jankyFrames ?? 0));
const allBuckets = diffBuckets(gfxBefore.histogram, gfxAfter.histogram);
const overall = histogramStats(allBuckets, total);
const presentedFpsSeries = samples.map((s) => s.presentedFps);
const median = (arr) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)] * 10) / 10;
};
const elapsedTotalSec = Math.round((Date.now() - windowStartT) / 1000);
const chromeJankyPct = total ? Math.round((totalJanky / total) * 10000) / 100 : null;
const tempBefore = batteryTempC(startStatus);
const tempAfter = batteryTempC(endStatus);
const result = {
  lane: "m10-mobile-fps-cap",
  label,
  fpsMode,
  gate: gate ? "K3: janky(>16,7 ms) < 10 %, 0 JS-Fehler" : null,
  device: { renderer: contextInfo.renderer, dpr: contextInfo.dpr, swiftShader: /swiftshader/i.test(contextInfo.renderer || "") },
  window: { minutes, windowSecs: WINDOW_SECS, targetEnemies: target, elapsedTotalSec, windowsCompleted: samples.length },
  batteryTempC: { before: tempBefore, after: tempAfter, delta: tempBefore != null && tempAfter != null ? Math.round((tempAfter - tempBefore) * 10) / 10 : null },
  startStatus, endStatus,
  overall: {
    presentedFps: median(presentedFpsSeries),
    presentedFpsMin: presentedFpsSeries.length ? Math.min(...presentedFpsSeries) : null,
    presentedFpsMax: presentedFpsSeries.length ? Math.max(...presentedFpsSeries) : null,
    chromeJankyPct,
    pacing: overall,
    diffFrames: total,
    diffJanky: totalJanky,
  },
  jsErrors: errors,
  recoveries,
  samples,
};
const gatePassed = !gate || (overall && overall.gt16_7Pct < 10 && errors.length === 0 && samples.length >= N);
result.passed = gatePassed;
console.log(JSON.stringify({
  presentedFpsMedian: result.overall.presentedFps,
  chromeJankyPct,
  gt16_7Pct: overall?.gt16_7Pct,
  p95: overall?.p95, p99: overall?.p99,
  tempC: `${tempBefore} -> ${tempAfter}`,
  renderer: contextInfo.renderer,
  passed: gatePassed,
}));
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
process.exit(gatePassed ? 0 : 1);
