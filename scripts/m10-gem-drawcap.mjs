#!/usr/bin/env node
// M10-Messung "Gem-Draw-Cap": Bei 500 Gegnern (Seed 1, autoPlay, god, 10 s)
// werden aktive Gem-Sprites, aktive Tweens, ms/Frame und gesammelte XP erfasst.
// Aufruf:
//   node scripts/m10-gem-drawcap.mjs --tag before
//   node scripts/m10-gem-drawcap.mjs --tag after
// Ergebnis: shots/m10-gem-drawcap-<tag>.json + shots/m10-gem-drawcap-<tag>.png
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "measure"));
const OUT = String(argOf("out", `shots/m10-gem-drawcap-${TAG}.json`));
const SHOT = String(argOf("shot", `shots/m10-gem-drawcap-${TAG}.png`));
const TARGET = 500;
const SECONDS = 10;

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
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

/** Level-up-Dialoge wegklicken, damit die Messung weiterläuft. */
const clearLevelUps = async () => {
  for (let i = 0; i < 60; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
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

  // Frame-/Gem-Sampling über 10 s bei 1x. Gegner werden auf 500 aufgefüllt,
  // damit die Last während der ganzen Messung stehen bleibt.
  const run = await page.evaluate(async ({ target, seconds }) => {
    const scene = window.__game.scene.getScene("run");
    const p = scene.pickups;
    const samples = [];
    const start = performance.now();
    let frames = 0;
    let elapsed = 0;
    let last = start;
    let lastSample = 0;
    let lastSpawn = start;
    let worst = 0;
    let peakGems = 0;
    let peakTweens = 0;
    let peakDrawObjects = 0;
    const gemSizes = () => {
      const out = { small: 0, medium: 0, large: 0 };
      for (const g of p.gems) out[g.size] += 1;
      return out;
    };
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        last = now;
        elapsed += dt;
        if (frames > 0) worst = Math.max(worst, dt);
        frames += 1;
        if (now - lastSpawn >= 100) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          const deficit = target - active;
          if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
        }
        const tweens = scene.tweens.getTweens().length;
        const drawObjects = scene.children.list.length;
        peakGems = Math.max(peakGems, p.count);
        peakTweens = Math.max(peakTweens, tweens);
        peakDrawObjects = Math.max(peakDrawObjects, drawObjects);
        if (now - lastSample >= 500) {
          lastSample = now;
          const st = window.__lf.stats();
          samples.push({
            atMs: Math.round(now - start),
            enemies: st.enemies,
            kills: st.kills,
            gems: p.count,
            visibleGems: p.gems.filter((g) => g.sprite.visible).length,
            gemSizes: gemSizes(),
            gemXp: p.totalXp,
            tweens,
            drawObjects,
            fps: st.fps,
          });
        }
        if (elapsed >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Level-ups einsammeln, damit collectedXp den ganzen Lauf widerspiegelt.
    return {
      seconds,
      targetEnemies: target,
      frames,
      elapsedMs: Math.round(elapsed),
      msPerFrame: Math.round((elapsed / Math.max(1, frames)) * 100) / 100,
      worstFrameMs: Math.round(worst * 100) / 100,
      peakGems,
      peakTweens,
      peakDrawObjects,
      samples,
      stats: p.stats,
      cap: p.cap,
      final: (() => {
        const st = window.__lf.stats();
        return { enemies: st.enemies, kills: st.kills, level: st.level, fps: st.fps };
      })(),
    };
  }, { target: TARGET, seconds: SECONDS });

  // Vor dem Beleg-Screenshot Level-ups unterdrücken und die Zeit einfrieren,
  // damit das Bild die Horde + Kristalle zeigt und nicht das Level-up-Panel.
  await page.evaluate(() => window.__lf.setSuppressLevelUps(true));
  await clearLevelUps();
  await page.evaluate(() => window.__lf.setTimeScale(0));
  await page.waitForTimeout(400);
  await page.screenshot({ path: SHOT });
  const gemCaps = await page.evaluate(() => {
    const st = window.__lf.stats();
    const scene = window.__game.scene.getScene("run");
    const p = scene.pickups;
    return {
      kills: st.kills, enemies: st.enemies, level: st.level,
      shotGems: p.count, shotVisibleGems: p.gems.filter((g) => g.sprite.visible).length,
      shotTweens: scene.tweens.getTweens().length,
      spawnedXp: p.stats.spawnedXp,
      grantedXp: p.stats.grantedXp,
      fieldXp: p.totalXp,
      xpLoss: p.stats.spawnedXp - p.stats.grantedXp - p.totalXp,
    };
  });

  result = {
    lane: "m10-gem-drawcap",
    tag: TAG,
    createdAt: new Date().toISOString(),
    seed: 1,
    viewport: "960x540@1",
    timeScale: 1,
    targetEnemies: TARGET,
    ...run,
    endState: gemCaps,
    jsErrors: errors,
    passed: errors.length === 0,
  };
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

if (result) {
  writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    tag: TAG,
    msPerFrame: result.msPerFrame,
    worstFrameMs: result.worstFrameMs,
    peakGems: result.peakGems,
    peakTweens: result.peakTweens,
    cap: result.cap,
    kills: result.final?.kills,
    collectedXp: result.stats?.collectedXp,
    mergedXp: result.stats?.mergedXp,
    jsErrors: result.jsErrors,
  }, null, 2));
}
process.exit(result && result.passed ? 0 : 1);
