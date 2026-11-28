// M10-panel-hz-device-check (K2a/K2b/K2c): Gerätemessung — hebt "BILDRATE: max"
// den 60-Hz-Panel-Lock der APK (MainActivity preferredDisplayModeId, 15:15Z)
// wirklich auf? Dom-Folgepunkt 17:45Z ("sonst bringt max am Gerät nichts").
//
// Methode (Muster: scripts/m10-janky-remeasure.mjs — gleiche Bridge/CDP/Telemetrie):
//  - Bridge hat KEINEN shell/dumpsys-Endpoint → aktive Panel-Hz über die
//    etablierte rAF-Probe (BILDRATE=MAX im Spiel, rAF folgt dem Panel;
//    janky-remeasure: "dumpsys display-Äquivalent über die rAF-Probe").
//  - Teil a (K2a, Default): Options fps=AUTO + lfhz_panel NICHT gesetzt,
//    /stop + /launch (frischer App-Start, damit MainActivity liest),
//    Panel-Probe (Erwartung lt. APK-Lock: 60 Hz) + 120-s-Kurzlauf-FPS.
//  - Teil b (K2b, Menü-Pfad): localStorage exakt wie setOption() bei
//    BILDRATE:MAX — lanternfall-options-v1.fps=0 UND lfhz_panel="max" —
//    dann /stop + /launch OHNE hz-Override. Erwartung lt. Ziel: Panel 120 Hz,
//    rAF-p95 < 12 ms. Zeigt die Probe 60 Hz, liest das installierte APK die
//    lfhz-Präferenz nicht → K3-Befund.
//  - Teil c (K2c, Brücken-Fähigkeit, ausdrücklich NICHT der Menü-Pfad):
//    /launch?...&hz=max (so lief die A/B-Tabelle 17:45Z) → zeigt nur, dass
//    Panel/Brücke 120 Hz können, nicht dass die Menü-Option wirkt.
//  - Restart-Nachweis: Marker im window vor /stop; nach Neustart muss er weg sein.
//  - Pflichtfelder je Beleg: WebGL-Renderer-String (Härte: kein SwiftShader/
//    llvmpipe, sonst INVALID_RENDERER-Abbruch), Build-ID (Telemetrie /latest),
//    aktive Panel-Hz, DPR/Screen, Thermal.
//  - Spieler-Sperre: HTTP 409 / status.dom_playing = sauberer Abbruch, KEIN Retry.
//
//   node scripts/m10-panel-hz-device-check.mjs --out <pfad.json> [--secs 120]
//
// Nur Messung: keine Änderungen an src/** oder tests/**.
const BRIDGE = "http://172.17.0.1:5181";
const CDP = "http://172.17.0.1:9333";
const TELEMETRY = "http://10.10.50.185:5180/latest";
const OPTIONS_KEY = "lanternfall-options-v1";
const PANEL_HZ_KEY = "lfhz_panel"; // src/logic/panel-hz.ts PANEL_HZ_KEY (JS-Seite, gemergt)

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const secs = Number(arg("secs", "120"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "soul_beacon", "thunder_seal"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

let aborted = null;

const bridgeFetch = async (path, init) => {
  const res = await fetch(`${BRIDGE}${path}`, init);
  if (res.status === 409) throw new Error("DOM_SPIELT: Gerät belegt (HTTP 409) — Messung abgebrochen, NICHT wiederholt");
  return res;
};

const deviceStatus = async () => {
  try {
    const r = await bridgeFetch("/status");
    return { ...(await r.json()), t: Date.now() };
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
    p95: num(/95th percentile: (\d+)ms/),
    p99: num(/99th percentile: (\d+)ms/),
  };
};

// --- CDP (Muster janky-remeasure: WebView kann beim Neustart sterben → neu verbinden)
const { loadPlaywright } = await import("./harness.mjs");
const { chromium } = await loadPlaywright();

let browser = null;
let page = null;
const errors = [];

const cdpPageReady = async () => {
  try {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    return Array.isArray(list) && list.some((p) => (p.url || "").includes("index.html"));
  } catch {
    return false;
  }
};

// Frischer App-Start: /stop (App weg) + /launch (neues Intent → MainActivity liest),
// dann auf CDP-Page warten, verbinden, Titel abwarten. Rückgabe: restart-Beleg.
// Query ROH wie in den bestehenden device-Skripten ("/launch?q=debug=1", A/B 17:45Z
// "/launch?...&hz=max") — kein encodeURIComponent.
const freshLaunch = async (query) => {
  await bridgeFetch("/stop", { method: "POST" }).catch((e) => {
    if (String(e).startsWith("DOM_SPIELT")) throw e;
    return null; // /stop kann harmlos scheitern (App war schon weg)
  });
  await sleep(2000);
  await bridgeFetch(`/launch?${query}`, { method: "POST" });
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    ready = await cdpPageReady();
    if (!ready) await sleep(2000);
  }
  if (!ready) throw new Error("CDP: keine Game-Page nach ~120 s");
  if (browser) { try { await browser.close(); } catch { /* schon tot */ } }
  browser = await chromium.connectOverCDP(CDP);
  page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 45000 });
  return { restarted: true, at: Date.now() };
};

// Marker vor /stop setzen; nach freshLaunch muss er weg sein (echter Neustart).
const setRestartMarker = async () => {
  await page.evaluate(() => { window.__panelHzMarker = Date.now(); });
};

const restartVerified = async () =>
  page.evaluate(() => window.__panelHzMarker === undefined);

// Options + Panel-Hz-Präferenz im localStorage setzen — exakt die Spuren, die
// setOption()/setPanelHzPref() (src/audio/options.ts + src/logic/panel-hz.ts)
// hinterlassen, OHNE src anzufassen. panelValue="keep" lässt lfhz unangetastet.
const applyMenuState = async (fpsValue, panelValue) => {
  await page.evaluate(({ key, fps, panelKey, panelPref }) => {
    let opts = {};
    try { opts = JSON.parse(localStorage.getItem(key) || "{}"); } catch { /* kaputt -> Defaults */ }
    opts.fps = fps;
    localStorage.setItem(key, JSON.stringify(opts));
    if (panelPref !== "keep") {
      if (panelPref === null) localStorage.removeItem(panelKey);
      else localStorage.setItem(panelKey, panelPref);
    }
  }, { key: OPTIONS_KEY, fps: fpsValue, panelKey: PANEL_HZ_KEY, panelPref: panelValue });
};

// Panel-Refresh-Probe: Spiel-Cap auf MAX + JS-Reload (KEIN App-Neustart — der
// Panel-Lock der APK bleibt unverändert), dann folgt rAF dem Panel
// (janky-remeasure: "dumpsys display-Äquivalent über die rAF-Probe").
const probePanelHz = async () => {
  await applyMenuState(0, "keep");
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 45000 });
  await sleep(1500); // Boot-Effekte abklingen lassen
  await page.evaluate(async () => {
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
    window.__panelProbe = dts;
  });
  const raf = await page.evaluate(() => {
    const dts = window.__panelProbe.slice(2).sort((a, b) => a - b);
    const median = dts[Math.floor(dts.length / 2)];
    const p95 = dts[Math.floor(dts.length * 0.95)];
    delete window.__panelProbe;
    return {
      medianDtMs: Math.round(median * 100) / 100,
      p95DtMs: Math.round(p95 * 100) / 100,
      fps: Math.round((1000 / median) * 10) / 10,
    };
  });
  return { ...raf, panelHzEstimate: raf.fps >= 100 ? 120 : raf.fps >= 85 ? 90 : raf.fps >= 50 ? 60 : null };
};

// Gerte-Identität (Pflichtfelder) — Renderer-Härte wie janky-remeasure.
const deviceIdentity = async () => {
  const d = await page.evaluate(() => {
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
  if (!d.renderer || /swiftshader|llvmpipe|software/i.test(d.renderer)) {
    throw new Error(`INVALID_RENDERER: "${d.renderer}" — Mess-Sperren-Regel 6 (Beleg ohne echten GPU-Renderer ungültig)`);
  }
  return d;
};

const readMenuState = async () =>
  page.evaluate(({ key, panelKey }) => ({
    fps: (() => { try { return JSON.parse(localStorage.getItem(key) || "{}").fps ?? null; } catch { return null; } })(),
    panelPref: localStorage.getItem(panelKey),
  }), { key: OPTIONS_KEY, panelKey: PANEL_HZ_KEY });

// Minute-25-Setup (identisch zu janky-remeasure/m25-Skripten) für belastetes Kurzlauf-FPS.
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

// rAF-Framezeiten-Fenster (Sekunden) + gfxinfo-Diff drumherum.
const rafWindow = async (seconds) => {
  const before = await gfxinfo();
  const win = await page.evaluate(async (secs_) => {
    const start = performance.now();
    let frames = 0;
    let last = start;
    const dts = [];
    let enemies = [];
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        last = now;
        frames++;
        dts.push(dt);
        try { enemies.push(window.__lf.stats().enemies); } catch { /* Szene weg */ }
        if (now - start >= secs_ * 1000 || window.__lf?.state?.()?.scene !== "run") resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    const sorted = [...dts].sort((a, b) => a - b);
    const pct = (q) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] * 100) / 100 : null);
    return {
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      frames,
      elapsedMs: Math.round(elapsed),
      avgEnemies: enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : null,
      p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
      worst: Math.round(Math.max(...dts) * 10) / 10,
    };
  }, seconds);
  const after = await gfxinfo();
  return {
    ...win,
    gfxinfoDiff: {
      frames: (after.totalFrames ?? 0) - (before.totalFrames ?? 0),
      janky: (after.jankyFrames ?? 0) - (before.jankyFrames ?? 0),
      jankyPct:
        (after.totalFrames ?? 0) > (before.totalFrames ?? 0)
          ? Math.round((((after.jankyFrames ?? 0) - (before.jankyFrames ?? 0)) / ((after.totalFrames ?? 0) - (before.totalFrames ?? 0))) * 1000) / 10
          : null,
    },
  };
};

// Ein Mess-Teil: Menu-State setzen (auf lebender Page), frischer App-Start,
// Restart-Beleg (Marker), Probe + Fenster im Zielmodus.
const measurePart = async (label, query, fpsValue, panelPref) => {
  if (!page) await freshLaunch("q=debug=1"); // nur Teil a: Page für Marker/State beschaffen
  await applyMenuState(fpsValue, panelPref); // Menu-Spur exakt wie setOption()
  await setRestartMarker();
  const launch = await freshLaunch(query); // gemessener Start — MainActivity liest hier
  const restarted = await restartVerified();
  const menu = await readMenuState();
  const probe = await probePanelHz(); // Probe intern bei Cap MAX (Panel folgt rAF)
  const identity = await deviceIdentity();
  // Fenster: Run im Zielmodus (a: AUTO=60-Cap am Gerät, b/c: MAX).
  await applyMenuState(fpsValue, panelPref);
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 45000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
  await setupM25();
  const win = await rafWindow(secs);
  const status = await deviceStatus();
  return { label, query, launch, restarted, menu, panelProbe: probe, device: identity, window: win, status };
};

// --- Ablauf -------------------------------------------------------------------

const statusStart = await deviceStatus();
if (statusStart.dom_playing) {
  aborted = { reason: "DOM_SPIELT (status.dom_playing) vor Messbeginn — Start verschoben, nicht gemessen", at: Date.now() };
  console.error(aborted.reason);
  if (outPath) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({ gate: "m10-panel-hz-device-check", aborted, statusStart }, null, 1));
  }
  process.exit(3);
}

const telemetry = await fetch(TELEMETRY).then((r) => r.json()).catch(() => null);
const latestDevice = Array.isArray(telemetry)
  ? telemetry.find((s) => String(s.renderer || "").includes("Adreno")) ?? null
  : null;
if (!latestDevice?.build) {
  // Build ist Pflichtfeld (Regel renderer-string, docs/lanes/m10-janky-remeasure.md):
  // fehlt er, ist der Beleg unbrauchbar -> markieren und laut abbrechen.
  console.error("INVALID_BUILD: Telemetrie /latest liefert keinen Adreno-Build — Beleg ohne Build-ID ungueltig");
  if (outPath) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify({ gate: "m10-panel-hz-device-check", aborted: { reason: "INVALID_BUILD: keine Build-ID aus Telemetrie", at: Date.now(), latestDevice } }, null, 1));
    console.log("JSON ->", outPath);
  }
  process.exit(3);
}

// Part a: Default (BILDRATE=AUTO, keine lfhz-Präferenz) → APK-Lock 60 Hz erwartet.
const partA = await measurePart("a-default-auto", "q=debug=1", -1, null);
console.log("part a:", partA.panelProbe.panelHzEstimate, "Hz,", partA.window.fps, "FPS");

// Part b: Menü-Pfad BILDRATE:MAX (options.fps=0 + lfhz_panel="max", kein hz-Override).
const partB = await measurePart("b-menu-max", "q=debug=1", 0, "max");
console.log("part b:", partB.panelProbe.panelHzEstimate, "Hz, rAF-p95", partB.window.p95, "ms,", partB.window.fps, "FPS");

// Part c: Brücken-Override /launch?hz=max (NICHT der Menü-Pfad, Fähigkeits-Beleg).
let partC = null;
try {
  partC = await measurePart("c-bridge-hz-max", "q=debug=1&hz=max", 0, "max");
  console.log("part c:", partC.panelProbe.panelHzEstimate, "Hz, rAF-p95", partC.window.p95, "ms,", partC.window.fps, "FPS");
} catch (e) {
  if (String(e).startsWith("DOM_SPIELT")) throw e;
  partC = { label: "c-bridge-hz-max", error: String(e) };
}

const statusEnd = await deviceStatus();
const result = {
  gate: "m10-panel-hz-device-check K2 — hebt BILDRATE:max den 60-Hz-APK-Lock auf?",
  method: "rAF-Panel-Probe (Bridge ohne dumpsys/shell-Endpoint, Muster m10-janky-remeasure); Restart-Nachweis per window-Marker",
  verdict: {
    partA_panelHz: partA.panelProbe.panelHzEstimate,
    partB_menuMax_panelHz: partB.panelProbe.panelHzEstimate,
    partB_menuMax_works: partB.panelProbe.panelHzEstimate !== null && partB.panelProbe.panelHzEstimate >= 120,
    partB_rafP95_ms: partB.window.p95,
    partC_bridgeHzMax_panelHz: partC?.panelProbe?.panelHzEstimate ?? null,
  },
  build: latestDevice ? { build: latestDevice.build, scene: latestDevice.scene } : null,
  statusStart,
  statusEnd,
  parts: { a: partA, b: partB, c: partC },
  jsErrors: errors,
};
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 1));
  console.log("JSON ->", outPath);
}
try { await browser?.close(); } catch { /* schon tot */ }
