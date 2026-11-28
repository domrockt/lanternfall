// M10-janky-remeasure (K1-K3): verbindliche Nachmessung des K3-Tors
// (gfxinfo janky < 10 % @ FPS >= 60, p95 <= 16 ms) auf dem Redmi Pad Pro.
//
// Methode (Basis: m10-v10-device-10min.mjs + gfxinfo-Differenz je Fenster aus
// m10-device-janky-node.mjs), Follow-up der v10-Methodik-Befunde:
//  - Messfenster OHNE Spawn-Top-up (natuerliche Director-Dichte) = fairer
//    Vergleichswert (primär), Top-up-Fenster (target 300) = Referenz,
//    interleaved je Segment (je 10 Fenster), damit Thermik beide Varianten
//    gleich trifft,
//  - Pflichtfelder: WebGL-Renderer-String (kein SwiftShader), DPR, Build-ID
//    (Telemetrie /latest als versionName-Ersatz — Bridge ohne shell-Endpoint),
//    aktive Panel-Refresh-Rate (rAF-Probe bei BILDRATE=MAX; die APK zwingt das
//    Panel seit 2026-11-28 15:15Z auf 60 Hz — MainActivity preferredDisplayMode),
//  - BILDRATE ueber localStorage `lanternfall-options-v1` (`fps`: 60 = Cap,
//    0 = MAX, -1 = AUTO) — kein Codeeingriff,
//  - Frame-Pacing je Fenster: rAF p50/p90/p95/p99/worst (gfxinfo-Perzentile
//    sind kumulativ seit Stat-Reset),
//  - Thermal-Status + Batterietemperatur je Minute via /status,
//  - HTTP 409 / dom_playing (DOM_SPIELT) = sauberer Abbruch, kein Retry
//    (Ergaenzung 2026-11-28T15:15Z Punkt 2).
//
//   node scripts/m10-janky-remeasure.mjs --out <pfad.json> --fps 60|0
//        [--minutes 10] [--secs 10] [--target 300] [--smoke]
//
// Nur Messung: keine Aenderungen an src/** oder tests/**.
const BRIDGE = "http://172.17.0.1:5181";
const CDP = "http://172.17.0.1:9333";
const TELEMETRY = "http://10.10.50.185:5180/latest";
const OPTIONS_KEY = "lanternfall-options-v1";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const fpsSetting = Number(arg("fps", "-1")); // 60 = Cap, 0 = MAX
const minutes = Number(arg("minutes", "10"));
const secs = Number(arg("secs", "10"));
const target = Number(arg("target", "300"));
const smoke = argv.includes("--smoke");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "soul_beacon", "thunder_seal"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const WINDOWS_PER_SEGMENT = 10; // je 10 Fenster neues Run-Segment (skipTo 1490 -> Run-Ende Minute 30)

let aborted = null; // { reason, at }

const bridgeFetch = async (path, init) => {
  const res = await fetch(`${BRIDGE}${path}`, init);
  if (res.status === 409) throw new Error("DOM_SPIELT: Geraet belegt (HTTP 409) — Messung abgebrochen, NICHT wiederholt");
  return res;
};

const deviceStatus = async () => {
  try {
    const r = await bridgeFetch("/status");
    const j = await r.json();
    return { ...j, t: Date.now() };
  } catch (e) {
    if (String(e).startsWith("DOM_SPIELT")) throw e;
    return { error: String(e), t: Date.now() };
  }
};

const gfxinfo = async () => {
  const r = await bridgeFetch("/gfxinfo");
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

// --- CDP-Verbindung (WebView kann unter Volllast sterben -> Recovery) --------
const { loadPlaywright } = await import("./harness.mjs");
const { chromium } = await loadPlaywright();

let browser = null;
let page = null;
const errors = [];
const connectSession = async () => {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      ready = Array.isArray(list) && list.some((p) => (p.url || "").includes("index.html"));
    } catch { /* CDP noch nicht bereit */ }
    if (!ready) {
      await bridgeFetch("/launch?q=debug=1", { method: "POST" }).catch((e) => {
        if (String(e).startsWith("DOM_SPIELT")) throw e;
      });
      await sleep(2000);
    }
  }
  if (!ready) throw new Error("CDP: keine Game-Page nach ~120 s");
  browser = await chromium.connectOverCDP(CDP);
  page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (e) => errors.push(String(e)));
};

// BILDRATE setzen: bestehende Options lesen, fps-Feld aendern, Persistenz schreiben.
const setFpsOption = async (value) => {
  await page.evaluate(({ key, fps }) => {
    let opts = {};
    try { opts = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* kaputt -> Defaults */ }
    opts.fps = fps;
    localStorage.setItem(key, JSON.stringify(opts));
  }, { key: OPTIONS_KEY, fps: value });
};
// setFpsOption + Reload in einem Schritt (localStorage vor dem Boot setzen).
const applyFpsOption = async (value) => {
  await setFpsOption(value);
  await reloadToTitle();
};

// Reload mit Reconnect: page.reload kann die CDP-Verbindung kappen
// (WebView-Relaunch) — dann neu verbinden und Page-Handle frisch holen.
const reloadToTitle = async () => {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!page) await connectSession();
      await page.reload({ waitUntil: "load" });
      await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
      return;
    } catch (e) {
      const msg = String(e);
      if (msg.includes("Target page, context or browser has been closed") || msg.includes("Target closed")) {
        try { await browser?.close(); } catch { /* schon tot */ }
        browser = null; page = null;
        await sleep(2000);
        await connectSession();
        continue;
      }
      throw e;
    }
  }
  throw new Error("reloadToTitle: 3 Versuche fehlgeschlagen");
};

const ensureRun = async () => {
  const scene = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown");
  if (scene === "run") return;
  await reloadToTitle();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "run", null, { timeout: 10000 });
};

// Panel-Refresh-Probe: bei BILDRATE=MAX (kein Spiel-Cap) folgt rAF dem Panel.
const probePanelHz = async () => {
  await applyFpsOption(0); // MAX
  await sleep(1500); // Boot-Effekte abklingen lassen
  const raf = await page.evaluate(async () => {
    const dts = [];
    await new Promise((resolve) => {
      let last = performance.now();
      let n = 0;
      const tick = (now) => {
        dts.push(now - last);
        last = now;
        if (++n >= 120) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...dts].slice(2).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return { medianDtMs: Math.round(median * 100) / 100, fps: Math.round((1000 / median) * 10) / 10 };
  });
  return { ...raf, panelHzEstimate: raf.fps >= 100 ? 120 : raf.fps >= 85 ? 90 : raf.fps >= 50 ? 60 : null };
};

// --- Ablauf -------------------------------------------------------------------

// Preflight: Geraet frei? (DOM_SPIELT -> Abbruch, kein Retry)
const statusStart = await deviceStatus();
if (statusStart.dom_playing) {
  aborted = { reason: "DOM_SPIELT (status.dom_playing) vor Messbeginn — Start verschoben, nicht gemessen", at: Date.now() };
  console.error(aborted.reason);
  if (outPath) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({ gate: "K3-Tor Nachmessung", aborted, statusStart }, null, 1));
    console.log("JSON ->", outPath);
  }
  process.exit(3);
}

await connectSession();

// Panel-Probe (immer bei MAX, danach gewuenschter Modus) + Build-ID aus Telemetrie.
const panel = await probePanelHz();
const telemetry = await fetch(TELEMETRY).then((r) => r.json()).catch(() => null);
const latestDevice = Array.isArray(telemetry)
  ? telemetry.find((s) => String(s.renderer || "").includes("Adreno"))
  : null;

await applyFpsOption(fpsSetting);

// Geraete-Identitaet: Renderer-String + DPR (Pflicht, kein Beleg ohne).
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
if (!device.renderer || /swiftshader|llvmpipe|software/i.test(device.renderer)) {
  throw new Error(`INVALID_RENDERER: "${device.renderer}" — Mess-Sperren-Regel 6 (Beleg ohne echten GPU-Renderer ungueltig)`);
}

// Minute-25-Setup (identisch zu m10-v10-device-m25.mjs).
const setupM25 = async () => {
  await page.evaluate(({ evolutions, passives }) => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.autoPlay(true);
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await sleep(6000);
};

// 10-s-Fenster: rAF-Framezeiten (+ optionaler Spawn-Top-up), gfxinfo-Diff drumherum.
const runWindowBody = (topUp, tgt) => page.evaluate(async ({ seconds, topUp, target }) => {
  const start = performance.now();
  let frames = 0;
  let last = start;
  let worst = 0;
  let lastSpawn = start;
  const dts = [];
  const enemies = [];
  let aborted = false;
  let lastEnemies = null; // im Promise-Scope gepflegt, nach resolve lesbar
  await new Promise((resolve) => {
    const stats = () => { try { return window.__lf.stats(); } catch { return null; } };
    const tick = (now) => {
      const dt = now - last;
      if (frames > 0) { worst = Math.max(worst, dt); dts.push(dt); }
      last = now;
      frames++;
      if (stats() === null || window.__lf?.state?.()?.scene !== "run") { lastEnemies = stats()?.enemies ?? null; aborted = true; resolve(); return; }
      if (topUp && now - lastSpawn >= 50) {
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
  const sorted = [...dts].sort((a, b) => a - b);
  const pct = (q) => sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 100) / 100 : null;
  return {
    fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
    frames,
    elapsedMs: Math.round(elapsed),
    worstFrameMs: Math.round(worst * 10) / 10,
    avgEnemies: enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : (topUp ? null : lastEnemies),
    p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
    aborted,
  };
}, { seconds: secs, topUp, target: tgt });

const window_ = async (label, topUp) => {
  const qualityBefore = await page.evaluate(() => window.__lf.state().quality);
  const before = await gfxinfo();
  let raf = null;
  for (let attempt = 0; attempt < 3 && !raf; attempt++) {
    try {
      raf = await runWindowBody(topUp, target);
    } catch (e) {
      console.log(`  ${label}: evaluate fehlgeschlagen (${String(e).slice(0, 80)}) -> Recovery #${attempt + 1}`);
      try { await browser?.close(); } catch { /* schon tot */ }
      browser = null; page = null;
      await sleep(2000);
      await connectSession();
      await ensureRun();
      await setupM25();
    }
  }
  if (!raf) throw new Error(`${label}: endgueltig fehlgeschlagen (3 Recovery-Versuche)`);
  await sleep(500); // Letzte Frames des Fensters rendern lassen
  const after = await gfxinfo();
  const qualityAfter = await page.evaluate(() => window.__lf.state().quality);
  const dFrames = after.totalFrames - before.totalFrames;
  const dJanky = after.jankyFrames - before.jankyFrames;
  return {
    label,
    variant: topUp ? "topup" : "natural",
    window: { seconds: secs, targetEnemies: topUp ? target : null, ...raf },
    quality: { before: qualityBefore, after: qualityAfter },
    gfxinfo: {
      diffFrames: dFrames,
      diffJanky: dJanky,
      jankyPct: dFrames > 0 ? Math.round((dJanky / dFrames) * 10000) / 100 : null,
      p95GfxinfoMs: after.p95,
    },
  };
};

// Lauf: Segmente je 10 Fenster, natuerlich/topup interleaved, je Segment neuer Run.
const N = smoke ? 2 : minutes * 6;
await ensureRun();
await setupM25();
let windowsSinceRestart = 0;
const samples = [];
const statusPolls = [];
let recoveries = 0;
for (let w = 0; w < N; w++) {
  windowsSinceRestart++;
  const segment = Math.floor(w / WINDOWS_PER_SEGMENT);
  const topUp = segment % 2 === 1; // Segment 0,2,4 = natural (fair), 1,3,5 = topup (Referenz)
  const label = `w${w}-s${segment}-${topUp ? "topup" : "natural"}`;
  let win = null;
  try {
    win = await window_(label, topUp);
  } catch (e) {
    if (String(e).startsWith("DOM_SPIELT")) throw e;
    recoveries++;
    console.log(`  ${label}: Fenster endgueltig fehlgeschlagen -> Recovery #${recoveries}`);
    try { await browser?.close(); } catch { /* schon tot */ }
    browser = null; page = null;
    await sleep(2000);
    await connectSession();
    await ensureRun();
    await setupM25();
    windowsSinceRestart = 0;
    continue;
  }
  samples.push({ window: w, segment, elapsedMin: Math.round((w * secs) / 60 * 10) / 10, ...win });
  console.log(`${label}: fps=${win.window.fps} janky=${win.gfxinfo.jankyPct}% p95=${win.window.p95}ms p99=${win.window.p99}ms worst=${win.window.worstFrameMs}ms enemies=${win.window.avgEnemies}${win.window.aborted ? " ABORTED(run-end)" : ""}`);

  // Run-Ende (Morgendaemmerung Minute 30) oder Segmentgrenze -> neuer Run.
  if (win.window.aborted || windowsSinceRestart >= WINDOWS_PER_SEGMENT) {
    await ensureRun();
    await setupM25();
    windowsSinceRestart = 0;
  }

  // Thermal-/Batterie-/Belegungspoll jede Minute; DOM_SPIELT mid-run -> Abbruch.
  if (w % 6 === 5 || w === N - 1) {
    const st = await deviceStatus();
    if (st.dom_playing) {
      aborted = { reason: "DOM_SPIELT (status.dom_playing) mitten im Lauf — Lauf abgebrochen, Teilergebnis gespeichert", at: Date.now() };
      console.error(aborted.reason);
      break;
    }
    statusPolls.push({ afterWindow: w, t: st.t, thermal: st.thermal, battery: st.battery, domPlaying: st.dom_playing });
    console.log(`  status: ${(st.thermal || []).join(" ")} | ${(st.battery || []).join(" ")}`);
  }
}

// --- Auswertung ---------------------------------------------------------------

const agg = (variant) => {
  const ws = samples.filter((s) => s.variant === variant && s.gfxinfo.jankyPct !== null);
  const frames = ws.reduce((a, s) => a + s.gfxinfo.diffFrames, 0);
  const janky = ws.reduce((a, s) => a + s.gfxinfo.diffJanky, 0);
  const fpsVals = ws.map((s) => s.window.fps);
  return {
    windows: ws.length,
    diffFrames: frames,
    diffJanky: janky,
    jankyPct: frames > 0 ? Math.round((janky / frames) * 10000) / 100 : null,
    fpsAvg: fpsVals.length ? Math.round((fpsVals.reduce((a, b) => a + b, 0) / fpsVals.length) * 10) / 10 : null,
    fpsMin: fpsVals.length ? Math.min(...fpsVals) : null,
    p95RafMax: ws.length ? Math.max(...ws.map((s) => s.window.p95)) : null,
    p99RafMax: ws.length ? Math.max(...ws.map((s) => s.window.p99)) : null,
    worstFrameMs: ws.length ? Math.max(...ws.map((s) => s.window.worstFrameMs)) : null,
  };
};

const natural = agg("natural");
const topup = agg("topup");
const statusEnd = await deviceStatus().catch((e) => ({ error: String(e) }));

// K3-Tor (2026-11-28): gfxinfo janky < 10 % @ FPS >= 60, p95 <= 16 ms —
// bei 60-Hz-Panel ist janky < 10 % das Tor (Ergaenzung 15:15Z).
const fpsSettingEffective = fpsSetting === 60 ? "60 (Cap)" : fpsSetting === 0 ? "MAX (kein Cap)" : "AUTO";
const passed = natural.jankyPct !== null && natural.jankyPct < 10 && natural.fpsAvg >= 60 && natural.p95RafMax <= 16 && errors.length === 0 && !aborted;
const out = {
  gate: "K3-Tor Nachmessung: gfxinfo janky < 10 % @ FPS >= 60, p95 <= 16 ms (60-Hz-Panel: janky < 10 % = Tor erfuellt)",
  fpsSetting: { requested: fpsSetting, effective: fpsSettingEffective },
  device: {
    ...device,
    bridgeStatusStart: statusStart,
    bridgeStatusEnd: statusEnd,
    panelProbe: panel,
    buildFromTelemetry: latestDevice ? { build: latestDevice.build, renderer: latestDevice.renderer, dpr: latestDevice.dpr } : null,
    versionNameNote: "versionName via Bridge nicht abfragbar (kein shell-Endpoint); Build-Zuordnung ueber Telemetrie-Build-ID",
  },
  methodology: {
    windowSecs: secs,
    targetEnemies: target,
    naturalWindows: "ohne Spawn-Top-up (natuerliche Director-Dichte) = fairer Vergleich (primär)",
    topupWindows: "Top-up auf target = Referenz",
    segmentLength: WINDOWS_PER_SEGMENT,
    aborted: aborted,
  },
  natural,
  topup,
  statusPolls,
  jsErrors: errors,
  recoveries,
  samples,
  passed,
};
console.log(JSON.stringify({ fpsSetting: fpsSettingEffective, panel, natural, topup, jsErrors: errors.length, aborted, passed }, null, 1));
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
process.exit(aborted ? 3 : passed ? 0 : 1);
