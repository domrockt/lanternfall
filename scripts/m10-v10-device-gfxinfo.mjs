// M10-v10-device-acceptance (K3): gfxinfo janky < 10 % ueber das Messfenster.
// Methode: Minute-25-Dichte (identisch zu scripts/m10-v10-device-m25.mjs),
// `GET /gfxinfo` der device-bridge VOR und NACH dem 10-s-Lastfenster, Differenz
// = Fenster-Statistik (gfxinfo ist kumulativ seit Stat-Reset).
//
//   node scripts/m10-v10-device-gfxinfo.mjs --out <pfad.json> [--secs 10] [--target 300]
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

const scene = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown");
if (scene !== "run") {
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
}

// Minute-25-Setup (identisch zu m10-v10-device-m25.mjs).
await page.evaluate(({ evolutions, passives }) => {
  window.__lf.god(true);
  window.__lf.setSuppressLevelUps(true);
  for (const id of evolutions) window.__lf.addWeapon(id, 8);
  for (const id of passives) window.__lf.addPassive(id, 5);
  window.__lf.skipTo(1490);
  window.__lf.setTimeScale(1);
}, { evolutions: EVOLUTIONS, passives: PASSIVES });
await sleep(6000);
const st0 = await page.evaluate(() => window.__lf.stats());

const before = await gfxinfo();

// 10-s-Lastfenster (identisch zu perf.mjs/m25): Top-up auf target Gegner.
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
  };
}, { target: target, seconds: secs });

await sleep(500); // Letzte Frames der Fenster rendern lassen
const after = await gfxinfo();

const dFrames = after.totalFrames - before.totalFrames;
const dJanky = after.jankyFrames - before.jankyFrames;
const jankyPct = Math.round((dJanky / dFrames) * 10000) / 100;
const out = {
  gate: "K3 gfxinfo janky < 10 % über das Messfenster (Minute-25-Dichte)",
  window: { seconds: secs, targetEnemies: target, fps: minute25.fps, minEnemies: minute25.minEnemies, avgEnemies: minute25.avgEnemies, worstFrameMs: minute25.worstFrameMs },
  gfxinfo: {
    before: { totalFrames: before.totalFrames, jankyFrames: before.jankyFrames, p99: before.p99 },
    after: { totalFrames: after.totalFrames, jankyFrames: after.jankyFrames, p99: after.p99 },
    diffFrames: dFrames,
    diffJanky: dJanky,
    jankyPct,
  },
  percentiles: { p50: after.p50, p90: after.p90, p95: after.p95, p99: after.p99 },
  runState: { time: st0.time, level: st0.level, quality: st0.quality },
  jsErrors: errors,
  passed: jankyPct < 10 && errors.length === 0,
};
console.log(JSON.stringify({ fps: minute25.fps, diffFrames: dFrames, diffJanky: dJanky, jankyPct, passed: out.passed }));
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ ...out, gfxinfoRawBefore: before.raw, gfxinfoRawAfter: after.raw }, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
process.exit(out.passed ? 0 : 1);
