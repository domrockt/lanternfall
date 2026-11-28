#!/usr/bin/env node
// Nachabnahme G (Lane m10-acceptance-refresh-g, Karte #11950):
// Burst + Minute-25 FPS auf der iGPU, Pflicht-Renderer-String im selben JSON.
// Messlogik identisch zu scripts/perf.mjs / F-Harness (~/tmp/m10-acceptance-refresh-f/perf-f.mjs).
// Tore (Briefing K2): Burst >= 55 FPS, Minute-25 >= 50 FPS.
// Aufruf: flock /home/ai/games/.lf-perf.lock node scripts/m10-refresh-g-perf.mjs \
//   --viewport 780x360 --dpr 3 --tag accg-780d3
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const { ensureBuild, startServer, loadPlaywright, startRun } = await import("./harness.mjs");

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const vp = String(argOf("viewport", "780x360")).split("x").map(Number);
const VIEWPORT = { width: vp[0], height: vp[1] };
const DPR = Number(argOf("dpr", "1")) || 1;
const TAG = String(argOf("tag", "accg"));
const BURST_GATE = 55;
const M25_GATE = 50;

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

const measure = async (target, seconds = 10) =>
  page.evaluate(async ({ target, seconds }) => {
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
          samples.push(active);
        }
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const ms = performance.now() - start;
    return {
      fps: Math.round((frames / ms) * 1000 * 10) / 10,
      frames,
      ms: Math.round(ms),
      worstFrameMs: Math.round(worst * 10) / 10,
      minEnemies: samples.length ? Math.min(...samples) : 0,
      targetEnemies: target,
    };
  }, { target, seconds });

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  const rendererInfo = await page.evaluate(() => window.__lf.rendererInfo());

  // Phase 1: synthetische Burst-Last (500 Gegner).
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    window.__lf.spawnEnemy("bog_rat", 400);
    window.__lf.spawnEnemy("wisp", 50);
    window.__lf.spawnEnemy("bogzombie", 50);
  });
  await page.waitForTimeout(500);
  const burst = await measure(500);
  await clearLevelUps();
  const burstState = await page.evaluate(() => window.__lf.stats());

  // Phase 2: natürliche Director-Dichte bei Minute 25.
  await page.evaluate(({ evolutions, passives }) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await page.waitForTimeout(6000);
  await clearLevelUps();
  const natural = await page.evaluate(() => window.__lf.stats());
  const minute25 = await measure(Math.max(300, natural.enemies));
  const minute25State = await page.evaluate(() => window.__lf.stats());

  await browser.close();
  await server.stop();

  const sw = /swiftshader|llvmpipe|software/i.test(rendererInfo.renderer);
  result = {
    tag: TAG,
    gates: { burst: BURST_GATE, minute25: M25_GATE },
    viewport: VIEWPORT,
    dpr: DPR,
    renderer: {
      context: rendererInfo.context,
      renderer: rendererInfo.renderer,
      vendor: rendererInfo.vendor,
      swiftshader: /swiftshader|llvmpipe|software/i.test(rendererInfo.renderer),
    },
    burst: { ...burst, measuredFps: burstState.fps, passed: burst.fps >= BURST_GATE, enemiesAtEnd: burstState.enemies },
    minute25: {
      ...minute25,
      measuredFps: minute25State.fps,
      time: minute25State.time,
      enemies: minute25State.enemies,
      // minEnemies ist hier nur Info: der God-Mode-Bot räumt Minute 25 schneller
      // ab als der Director spawnt (F-Audit-Restmangel 3, urteilsändernd nicht) —
      // Tor ist ausschliesslich das FPS-Kriterium.
      passed: minute25.fps >= M25_GATE,
    },
    jsErrors: errors,
    passed:
      burst.fps >= BURST_GATE &&
      minute25.fps >= M25_GATE &&
      errors.length === 0 && !sw,
  };
} catch (e) {
  await browser.close().catch(() => {});
  server.stop();
  throw e;
}

const outDir = join(homedir(), "games", ".evidence", "m10-acceptance-refresh-g");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `k2-perf-${TAG}.json`);
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(`${TAG}: burst ${result.burst.fps} fps (gate ${BURST_GATE}), minute25 ${result.minute25.fps} fps (gate ${M25_GATE}), renderer=${result.renderer.renderer}, passed=${result.passed}`);
process.exit(result.passed ? 0 : 1);
