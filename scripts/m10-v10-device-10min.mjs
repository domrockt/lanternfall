// M10-v10-device-acceptance (K4): 10-min-Lauf ohne Thermik-Einbruch.
// Methode: Minute-25-Dichte dauerhaft (Top-up auf 300 Gegner, 6 Evos Lv8),
// 60 Messfenster je 10 s -> FPS-Kurve; alle 6 Fenster Poll der device-bridge
// /status (Thermal-Status + Batterietemperatur). Tor: kein FPS-Abfall > 20 %
// (Vergleich Mittelwert erste 5 min vs letzte 5 min).
//
//   node scripts/m10-v10-device-10min.mjs --out <pfad.json> [--minutes 10] [--target 300]
//
// Nur Messung: keine Aenderungen an src/** oder tests/**.
// Renderer-Guard (#13405): renderer + rendererValid im Output-JSON; SwiftShader
// -> Kennzahl-Felder invalid:true, passed=false (Beleg bleibt lesbar).
import { getRendererString, rendererValid } from "./lf-renderer.mjs";
// Panel-Refresh (Lane m10-device10min-refresh, Dom-Freigabe 17:45Z): aktive
// Hz-Zahl ist Pflicht im Beleg (60-Hz-APK-Lock vs hz=max = Tor-Entscheidungsfelder).
import { panelHzFromRaf, parseDisplayDump } from "./m10-device-refresh.mjs";
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
const WINDOW_SECS = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

const deviceStatus = async () => {
  try {
    const r = await fetch(`${BRIDGE}/status`);
    const j = await r.json();
    return { thermal: j.thermal, battery: j.battery, t: Date.now() };
  } catch (e) {
    return { error: String(e), t: Date.now() };
  }
};

// Auf die Game-Page warten (App starten, falls noetig), DANN erst CDP verbinden.
const { loadPlaywright } = await import("./harness.mjs");
const { chromium } = await loadPlaywright();

// WebView kann unter Volllast sterben (Renderer-Crash, Android killt die App):
// Recovery = App starten, auf /json/list warten, FRISCHE CDP-Verbindung.
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
      await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" }).catch(() => {});
      await sleep(2000);
    }
  }
  if (!ready) throw new Error("CDP: keine Game-Page nach ~120 s");
  browser = await chromium.connectOverCDP(CDP);
  page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (e) => errors.push(String(e)));
};
await connectSession();

// ---------- Panel-Refresh ermitteln (Pflichtfeld ab Dom-Freigabe 17:45Z) ------
// Quelle 1: `dumpsys display` via Bridge-Shell-Endpoint (falls die Bridge ihn
// anbietet). Quelle 2 (device-bridge-Äquivalent, wie m10-janky-remeasure.mjs):
// rAF-Median bei BILDRATE=MAX — im Spiel folgt rAF dem Spiel-Cap (AUTO -> 60 am
// Geräteknoten), NICHT dem Panel, daher Probe bei MAX + Option restaurieren.
// Fehler -> refresh-Feld entfaellt + Warnung; der Lauf faellt NICHT auf FAIL
// (passed-Logik unten unangetastet, renderer/rendererValid unangetastet).
let refresh = null;
const refreshWarn = (why) => console.log(`  WARN Panel-Refresh nicht ermittelbar (${why}) — refresh-Feld entfaellt`);
const readDisplayDump = async () => {
  const r = await fetch(`${BRIDGE}/shell?cmd=${encodeURIComponent("dumpsys display")}`);
  if (!r.ok) throw new Error(`bridge /shell rc=${r.status}`);
  return await r.text();
};
const rafFpsAtTitle = async () => page.evaluate(async () => {
  const dts = [];
  await new Promise((resolve) => {
    let last = performance.now(); let n = 0;
    const tick = (now) => { dts.push(now - last); last = now; if (++n >= 90) resolve(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const sorted = [...dts].slice(2).sort((a, b) => a - b);
  return Math.round((1000 / sorted[Math.floor(sorted.length / 2)]) * 10) / 10;
});
const setFpsStorage = (value) => page.evaluate((v) => {
  let o = {}; try { o = JSON.parse(localStorage.getItem("lanternfall-options-v1") || "{}"); } catch { /* neu */ }
  o.fps = v; localStorage.setItem("lanternfall-options-v1", JSON.stringify(o));
}, value);
const probePanelHzRaf = async () => {
  const prev = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem("lanternfall-options-v1") || "{}").fps ?? -1; } catch { return -1; }
  });
  await setFpsStorage(0); // 0 = MAX: rAF folgt dem Panel
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
  await sleep(1500);
  const fps = await rafFpsAtTitle();
  await setFpsStorage(prev); // restaurieren; uebernaechstes Reload (Lauf-Start unten) wendet es an
  return { fps, prev };
};
try {
  const dump = await readDisplayDump().catch(() => null);
  const parsed = dump != null ? parseDisplayDump(dump) : null;
  if (parsed) {
    refresh = { ...parsed, source: "dumpsys-display", t: Date.now() };
  } else {
    const { fps } = await probePanelHzRaf();
    const hz = panelHzFromRaf(fps);
    if (hz != null) refresh = { refreshRate: hz, panelMode: null, source: "raf-max", rafFps: fps, t: Date.now() };
    else refreshWarn(`rAF-Probe liefert keine Hz-Schaetzung (${fps} fps)`);
  }
} catch (e) {
  refreshWarn(String(e).slice(0, 100));
  // Probe kann die WebView-Seite getoetet haben (page.reload unter CDP) —
  // frisch verbinden, damit der eigentliche Lauf unberuehrt startet.
  try { await browser?.close(); } catch { /* schon tot */ }
  browser = null; page = null;
  try { await connectSession(); } catch (e2) { throw new Error(`Panel-Refresh-Recovery fehlgeschlagen: ${String(e2).slice(0, 80)}`); }
}

const scene = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown");
if (scene !== "run") {
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
}

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

const startStatus = await deviceStatus();
const samples = [];
const N = minutes * 6; // 6 Fenster je Minute
// Segmentiert: Minute-30-Morgendaemmerung beendet den Run — deshalb alle
// ~4 min (24 Fenster) neu starten (page.reload killt CDP nicht) + skipTo(1490).
let windowsSinceRestart = 99;
const ensureRun = async () => {
  if (!page) await connectSession();
  const sc = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown");
  if (sc === "run" && windowsSinceRestart < 24) return;
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
  windowsSinceRestart = 0;
  await sleep(4000);
};
await ensureRun();
let recoveries = 0;
for (let w = 0; w < N; w++) {
  windowsSinceRestart++;
  let win = null;
  for (let attempt = 0; attempt < 3 && !win; attempt++) {
    try {
      win = await page.evaluate(async ({ target, seconds }) => {
    const start = performance.now();
    let frames = 0;
    let lastSpawn = start;
    const enemies = [];
    let worst = 0;
    let last = start;
    let aborted = false;
    await new Promise((resolve) => {
      const stats = () => { try { return window.__lf.stats(); } catch { return null; } };
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames++;
        // Run kann enden (Morgendaemmerung Minute 30): Fenster frueh abbrechen.
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
    return {
      aborted,
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      frames,
      worstFrameMs: Math.round(worst * 10) / 10,
      avgEnemies: enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : 0,
      time: aborted ? -1 : window.__lf.stats().time,
    };
  }, { target: target, seconds: WINDOW_SECS });
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
  samples.push({ window: w, elapsedMin: Math.round((w * WINDOW_SECS) / 60 * 10) / 10, ...win, recovered: recoveries > 0 });
  console.log(`w${w} (${samples[samples.length - 1].elapsedMin} min): fps=${win.fps} enemies=${win.avgEnemies} worst=${win.worstFrameMs}ms time=${win.time}${win.aborted ? " ABORTED(run-end)" : ""}`);
  if (win.aborted || windowsSinceRestart >= 24) { console.log("  -> neues Run-Segment"); await ensureRun(); }
  // Thermik-Poll jede Minute (nach Fenstern 5, 11, 17, ...).
  if (w % 6 === 5) {
    const st = await deviceStatus();
    console.log(`  status: ${(st.thermal || []).join(" ")} | ${(st.battery || []).join(" ")}`);
    samples[samples.length - 1].deviceStatus = st;
  }
}
const endStatus = await deviceStatus();
const state = await page.evaluate(() => { try { return window.__lf.stats(); } catch { return { time: -1, level: -1, kills: -1, quality: "run-ended" }; } });
const renderer = await getRendererString(page);
const rendererValidFlag = rendererValid(renderer);

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const firstHalf = samples.slice(0, Math.floor(N / 2)).map((s) => s.fps);
const secondHalf = samples.slice(Math.floor(N / 2)).map((s) => s.fps);
const dropPct = Math.round(((avg(firstHalf) - avg(secondHalf)) / avg(firstHalf)) * 1000) / 10;
const minFps = Math.min(...samples.map((s) => s.fps));
const out = {
  gate: "K4 10-min-Lauf ohne Thermik-Einbruch (kein FPS-Abfall > 20 %)",
  durationMinutes: minutes,
  windowSecs: WINDOW_SECS,
  targetEnemies: target,
  renderer,
  rendererValid: rendererValidFlag,
  invalid: !rendererValidFlag,
  startStatus,
  endStatus,
  // Aktive Panel-Refresh-Rate (Dom-Freigabe 17:45Z): Pflicht im Beleg. Bei
  // Parsing-Fehlern entfaellt das Feld (Warning im Log), passed bleibt unberuehrt.
  ...(refresh ? { refresh } : {}),
  fps: { avgFirstHalf: Math.round(avg(firstHalf) * 10) / 10, avgSecondHalf: Math.round(avg(secondHalf) * 10) / 10, dropPct, minFps, invalid: !rendererValidFlag, passed: rendererValidFlag && dropPct <= 20 },
  runEnd: { time: state.time, level: state.level, kills: state.kills, quality: state.quality },
  jsErrors: errors,
  samples,
  passed: rendererValidFlag && dropPct <= 20 && errors.length === 0,
};
console.log(JSON.stringify(out.fps), "thermalEnd:", JSON.stringify(endStatus.thermal), "battEnd:", JSON.stringify(endStatus.battery));
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
process.exit(out.passed ? 0 : 1);
