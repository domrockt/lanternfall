#!/usr/bin/env node
// Lane m10-chest-spawn-cell-fair-r2: Gegnerdichte an der Truhen-Spawn-Zelle
// (K1 Vorher / K4 Nachher).
//
// Matrix: 3 Seeds (7/101/4242) × 6 Truhen (Bosse 300..1800 s, timeScale 30,
// god + autoplay). Pro Truhe wird im selben Sim-Schritt wie der Spawn
// (bossDefeated-Event) gezählt, wie viele lebende Gegner im 48-px- bzw.
// 96-px-Radius um die TATSÄCHLICHE Spawn-Zelle (chests.spawns) liegen.
//
// Akzeptanzgrenze (vor der Messung festgelegt, siehe Lane-Doku):
//   nearEnemies48px-Median deutlich gesenkt (vorher/nachher-Zahl in der Doku);
//   Truhen-Timing unberührt (6/6 Bosse × Seed, chest↔bossDeath ± 0,5 s).
//
// Aufruf: node scripts/m10-chest-spawn-cell.mjs <out.json>
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const SEEDS = [7, 101, 4242];
const TIME_SCALE = 30;
const WALL_TIMEOUT_MS = 200_000;
const WORLD_SIZE = 4096;
const RADII_PX = [48, 96];
const OUT = process.argv[2] ?? "/home/ai/games/.evidence/m10-chest-spawn-cell-fair-r2/m10-chest-cell-before.json";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const seeds = [];
const allErrors = [];
let report = null;
const med = (arr) => {
  const v = arr.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2 * 10) / 10;
};
try {
  for (const seed of SEEDS) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}`);
      await startRun(page);
      await page.evaluate((scale) => {
        const run = window.__game.scene.getScene("run");
        window.__m10cell = { deaths: [], startedAt: Date.now() };
        run.events.on("bossDefeated", (e) => {
          const chest = run.chests.chests[run.chests.chests.length - 1];
          if (!chest) return;
          const counts = {};
          for (const r of [48, 96]) {
            let n = 0;
            for (const en of run.enemies.active) {
              if (!en.alive) continue;
              const d = (en.x - chest.x) ** 2 + (en.y - chest.y) ** 2;
              if (d <= r * r) n += 1;
            }
            counts[`${r}px`] = n;
          }
          window.__m10cell.deaths.push({
            index: e.index,
            at: Math.round(run.elapsed * 1000) / 1000,
            playerX: Math.round(run.posX),
            playerY: Math.round(run.posY),
            nearEnemies48px: counts["48px"],
            nearEnemies96px: counts["96px"],
          });
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
          const s = window.__lf.stats();
          return { scene: s.scene, time: s.time, bossesDefeated: s.bossesDefeated ?? 0, dawn: s.dawn ?? false };
        });
        if (last.scene !== "run") break;
        if ((last.dawn || last.time >= 1830) && last.bossesDefeated >= 6) { await page.waitForTimeout(400); break; }
      }

      const finalState = (await page.evaluate(() => window.__lf.finalState())) ?? null;
      const deaths = (await page.evaluate(() => window.__m10cell?.deaths ?? [])) ?? [];
      const spawns = await page.evaluate(() => window.__game.scene.getScene("run")?.chests?.spawns?.slice() ?? []);

      const chests = spawns.map((sp, i) => {
        const death = deaths.find((d) => Math.abs(d.at - sp.at) <= 0.5) ?? deaths[i] ?? null;
        const edgeDist = Math.round(Math.min(sp.x, sp.y, WORLD_SIZE - sp.x, WORLD_SIZE - sp.y));
        return {
          index: death ? death.index : i,
          at: sp.at,
          x: sp.x,
          y: sp.y,
          edgeDistPx: edgeDist,
          distToPlayerPx: death ? Math.round(Math.hypot(sp.x - death.playerX, sp.y - death.playerY)) : null,
          nearEnemies48px: death ? death.nearEnemies48px : null,
          nearEnemies96px: death ? death.nearEnemies96px : null,
        };
      });

      const m48 = med(chests.map((c) => c.nearEnemies48px));
      const m96 = med(chests.map((c) => c.nearEnemies96px));
      seeds.push({
        seed,
        timeScale: TIME_SCALE,
        elapsedSeconds: Math.round((last?.time ?? 0) * 10) / 10,
        bossesDefeated: last?.bossesDefeated ?? 0,
        chests,
        medianNearEnemies48px: m48,
        medianNearEnemies96px: m96,
        maxNearEnemies48px: Math.max(...chests.map((c) => c.nearEnemies48px ?? 0)),
        maxNearEnemies96px: Math.max(...chests.map((c) => c.nearEnemies96px ?? 0)),
      });
      allErrors.push(...errors.map((e) => `seed ${seed}: ${e}`));
      console.log(`seed ${seed}: ${chests.length} Truhen, median48=${m48} max48=${seeds.at(-1).maxNearEnemies48px}, median96=${m96} max96=${seeds.at(-1).maxNearEnemies96px}`);
    } finally {
      await page.close();
    }
  }

  const totalChests = seeds.reduce((a, s) => a + s.chests.length, 0);
  const all48 = seeds.flatMap((s) => s.chests.map((c) => c.nearEnemies48px)).filter(Number.isFinite);
  const all96 = seeds.flatMap((s) => s.chests.map((c) => c.nearEnemies96px)).filter(Number.isFinite);
  const med48 = med(all48);
  const med96 = med(all96);
  report = {
    schema: "m10-chest-spawn-cell/v1",
    generatedAt: new Date().toISOString(),
    phase: OUT.includes("after") ? "after" : "before",
    radiiPx: RADII_PX,
    seeds,
    totals: {
      chests: totalChests,
      medianNearEnemies48px: med48,
      medianNearEnemies96px: med96,
      maxNearEnemies48px: Math.max(...all48, 0),
      maxNearEnemies96px: Math.max(...all96, 0),
      jsErrors: allErrors.length,
    },
    verdict: {
      chestsCollected: totalChests >= 18,
      jsErrors: allErrors.length === 0,
      passed: totalChests >= 18 && allErrors.length === 0,
    },
    errors: allErrors,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ out: OUT, totals: report.totals, verdict: report.verdict }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
if (!report || !report.verdict.passed) process.exit(1);
