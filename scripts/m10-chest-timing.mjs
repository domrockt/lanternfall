#!/usr/bin/env node
// M10 chest-timing lane: 30-minute run at timeScale 30, records each boss
// spawn/death and every chest spawn. Writes shots/m10-chest-timing.json.
// Start with: flock /home/ai/games/.lf-perf.lock node scripts/m10-chest-timing.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const BOSS_SECONDS = [300, 600, 900, 1200, 1500, 1800];
const BOSS_NAMES = ["Moorkönigin", "Knochenfürst", "Der Fahle Hirte", "Glockenturm-Golem", "Hexenzirkel", "Der Hohle König"];
const TIME_SCALE = 30;
const WALL_TIMEOUT_MS = 240_000;

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});
// deviceScaleFactor 2 + 640x360 CSS -> logische View 640x360 (n=2).
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let report = null;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
  await startRun(page);
  await page.evaluate((scale) => {
    window.__m10 = { bossDeaths: [], startedAt: Date.now(), done: false, reason: null };
    const run = window.__game.scene.getScene("run");
    run.events.on("bossDefeated", (e) => {
      window.__m10.bossDeaths.push({ index: e.index, at: run.elapsed });
    });
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(scale);
  }, TIME_SCALE);

  const started = Date.now();
  let last = null;
  while (Date.now() - started < WALL_TIMEOUT_MS) {
    await page.waitForTimeout(250);
    last = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const s = window.__lf.stats();
      return {
        scene: s.scene,
        time: s.time,
        bossesDefeated: s.bossesDefeated ?? 0,
        chestsDropped: s.chestsDropped ?? 0,
        bossesSpawned: s.bossesSpawned ?? [],
        bossDeaths: window.__m10.bossDeaths.slice(),
        spawns: run?.chests?.spawns?.slice() ?? [],
        dawn: s.dawn ?? false,
      };
    });
    if (last.scene !== "run") break;
    if ((last.dawn || last.time >= 1830) && last.bossesDefeated >= 6) {
      await page.waitForTimeout(400);
      break;
    }
  }

  const finalState = (await page.evaluate(() => window.__lf.finalState())) ?? null;
  const elapsed = Math.max(last?.time ?? 0, finalState?.time ?? 0);

  const deaths = [...(last?.bossDeaths ?? [])].sort((a, b) => a.index - b.index);
  const spawns = last?.spawns ?? [];
  const bosses = BOSS_SECONDS.map((expectedSecond, index) => {
    const death = deaths.find((d) => d.index === index) ?? null;
    const spawnAt = (last?.bossesSpawned ?? []).find((b) => b.index === index)?.at ?? null;
    const chestsForBoss = death
      ? spawns.filter((c) => Math.abs(c.at - death.at) <= 0.5)
      : [];
    const chestAt = chestsForBoss.length > 0 ? chestsForBoss[0].at : null;
    return {
      index,
      name: BOSS_NAMES[index],
      expectedSecond,
      bossSpawnAt: spawnAt,
      bossDeathAt: death ? Math.round(death.at * 1000) / 1000 : null,
      chestAt,
      chestCount: chestsForBoss.length,
      deltaToBossDeath: chestAt !== null && death ? Math.round((chestAt - death.at) * 1000) / 1000 : null,
      deltaToSchedule: chestAt !== null ? Math.round((chestAt - expectedSecond) * 1000) / 1000 : null,
      ok: chestsForBoss.length === 1 && chestAt !== null && death !== null
        && Math.abs(chestAt - death.at) <= 0.5,
    };
  });

  const chestTotal = spawns.length;
  const expectedChests = bosses.filter((b) => b.bossDeathAt !== null).length;
  const doubleSpawns = bosses.filter((b) => b.chestCount > 1).length;
  const missing = bosses.filter((b) => b.chestCount === 0).length;
  const sixOfSix = bosses.filter((b) => b.bossDeathAt !== null).every((b) => b.ok);
  const exactlyOne = sixOfSix && doubleSpawns === 0 && missing === 0;
  const jsErrors = errors.slice();
  const deadlineHit = (last?.bossesDefeated ?? 0) < 6;

  report = {
    schema: "m10-chest-timing/v1",
    generatedAt: new Date().toISOString(),
    runSeed: 101,
    timeScale: TIME_SCALE,
    elapsedSeconds: Math.round(elapsed * 10) / 10,
    wallMs: Date.now() - started,
    bosses,
    totals: {
      bossesDefeated: last?.bossesDefeated ?? 0,
      chestsDropped: last?.chestsDropped ?? 0,
      chestSpawnsRecorded: chestTotal,
      expectedChests,
      missingChests: missing,
      doubleSpawns,
    },
    verdict: {
      sixBossesReached: !deadlineHit,
      sixOfSixWithinHalfSecond: sixOfSix,
      exactlyOneChestPerBoss: exactlyOne,
      noDoubleSpawn: doubleSpawns === 0,
      noMissingChest: missing === 0,
      jsErrors: jsErrors.length,
      passed: !deadlineHit && sixOfSix && exactlyOne && jsErrors.length === 0,
    },
    errors: jsErrors,
    finalState,
  };
  writeFileSync("shots/m10-chest-timing.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.verdict.passed, totals: report.totals, verdict: report.verdict }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
if (!report || !report.verdict.passed) process.exit(1);
