#!/usr/bin/env node
// M10 chest-spawn-fair lane: misst WO Truhen landen (K1 Vorher / K4 Nachher).
//
// Matrix: 3 Seeds × 6 Truhen (Boss-Tode bei 300..1800 s, timeScale 30).
// Pro Truhe: Terrain an der Spawn-Zelle (Moorwasser = 40 % Slow, kein hartes
// Hindernis — das Spielfeld hat keine Wände), Kantenabstand zum Spielfeldrand,
// Distanz zum Spieler beim Spawn, Gegner-Nähe ("hinter der Gegnermasse") und
// ein grober begehbarer Grid-Pfad (16-px-Raster, Wasser als blockiert).
//
// Fairness-Grenze (vor der Messung festgelegt, siehe docs/lanes/m10-chest-spawn-fair.md):
//   ok = Terrain != water UND Kantenabstand >= CHEST_EDGE_MARGIN_PX (48 px = 3 Tiles)
//
// Aufruf: node scripts/m10-chest-fair.mjs shots/m10-chestfair-before.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const SEEDS = [7, 101, 4242];
const TIME_SCALE = 30;
const WALL_TIMEOUT_MS = 200_000;
/** Fairness-Grenzen (identisch zu src/systems/ChestSystem.ts). */
const EDGE_MARGIN_PX = 48;
const WORLD_SIZE = 4096;
const WORLD_TILES = 256;
const TILE = 16;
const NEAR_ENEMY_RADIUS_PX = 96;
const OUT = process.argv[2] ?? "shots/m10-chestfair-before.json";

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

/** Grober begehbarer Pfad über das 16-px-Raster (Wasser blockiert, 4-dir BFS). */
function gridPathSteps(water, startTx, startTy, goalTx, goalTy) {
  if (startTx === goalTx && startTy === goalTy) return 0;
  if (water[startTy * WORLD_TILES + startTx] || water[goalTy * WORLD_TILES + goalTx]) return null;
  const prev = new Int32Array(WORLD_TILES * WORLD_TILES).fill(-2);
  const queue = [startTy * WORLD_TILES + startTx];
  prev[queue[0]] = -1;
  for (let qi = 0; qi < queue.length; qi++) {
    const cur = queue[qi];
    const cx = cur % WORLD_TILES;
    const cy = (cur - cx) / WORLD_TILES;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= WORLD_TILES || ny >= WORLD_TILES) continue;
      const ni = ny * WORLD_TILES + nx;
      if (prev[ni] !== -2 || water[ni]) continue;
      prev[ni] = cur;
      if (nx === goalTx && ny === goalTy) {
        let steps = 0;
        for (let p = ni; p !== queue[0]; p = prev[p]) steps += 1;
        return steps;
      }
      queue.push(ni);
    }
    if (queue.length > 60_000) return null; // Sicherheitsdeckel
  }
  return null;
}

const seeds = [];
const allErrors = [];
let report = null;
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
        window.__m10fair = { deaths: [], startedAt: Date.now() };
        // Boss-Tod == Truhen-Spawn im selben Sim-Schritt (collectKills): Spieler-
        // position und Gegner-Umgebung beim Tod mitschneiden.
        run.events.on("bossDefeated", (e) => {
          const chest = run.chests.chests[run.chests.chests.length - 1];
          let nearEnemies = 0;
          for (const en of run.enemies.active) {
            if (!en.alive) continue;
            const d = (en.x - chest.x) ** 2 + (en.y - chest.y) ** 2;
            if (d <= 96 * 96) nearEnemies += 1;
          }
          window.__m10fair.deaths.push({
            index: e.index,
            at: Math.round(run.elapsed * 1000) / 1000,
            playerX: Math.round(run.posX),
            playerY: Math.round(run.posY),
            nearEnemies,
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
          return {
            scene: s.scene,
            time: s.time,
            bossesDefeated: s.bossesDefeated ?? 0,
            dawn: s.dawn ?? false,
          };
        });
        if (last.scene !== "run") break;
        if ((last.dawn || last.time >= 1830) && last.bossesDefeated >= 6) { await page.waitForTimeout(400); break; }
      }

      // Terrain-Karte einmal pro Seed ziehen (Wasser-Bitmaske über 16-px-Tiles).
      const waterBits = await page.evaluate((worldTiles) => {
        const run = window.__game.scene.getScene("run");
        let s = "";
        for (let ty = 0; ty < worldTiles; ty++) {
          for (let tx = 0; tx < worldTiles; tx++) {
            s += (run.ground.kindAt(tx * 16 + 8, ty * 16 + 8) === "water" ? "1" : "0");
          }
        }
        return s;
      }, WORLD_TILES);

      const finalState = (await page.evaluate(() => window.__lf.finalState())) ?? null;
      const deaths = (await page.evaluate(() => window.__m10fair?.deaths ?? [])) ?? [];
      const spawns = await page.evaluate(() => window.__game.scene.getScene("run")?.chests?.spawns?.slice() ?? []);

      const chests = spawns.map((sp, i) => {
        const death = deaths.find((d) => Math.abs(d.at - sp.at) <= 0.5) ?? deaths[i] ?? null;
        const edgeDist = Math.round(Math.min(sp.x, sp.y, WORLD_SIZE - sp.x, WORLD_SIZE - sp.y));
        const tx = Math.floor(sp.x / TILE);
        const ty = Math.floor(sp.y / TILE);
        const water = waterBits[ty * WORLD_TILES + tx] === "1";
        const ptx = death ? Math.floor(death.playerX / TILE) : tx;
        const pty = death ? Math.floor(death.playerY / TILE) : ty;
        const distToPlayer = death ? Math.round(Math.hypot(sp.x - death.playerX, sp.y - death.playerY)) : null;
        const pathSteps = death ? gridPathSteps(waterBits, tx, ty, ptx, pty) : null;
        return {
          index: death ? death.index : i,
          at: sp.at,
          x: sp.x,
          y: sp.y,
          terrain: water ? "water" : "land",
          edgeDistPx: edgeDist,
          distToPlayerPx: distToPlayer,
          pathStepsWaterBlocked: pathSteps,
          nearEnemies96px: death ? death.nearEnemies : null,
          ok: !water && edgeDist >= EDGE_MARGIN_PX,
        };
      });

      const unfair = chests.filter((c) => !c.ok);
      seeds.push({
        seed,
        timeScale: TIME_SCALE,
        elapsedSeconds: Math.round((last?.time ?? 0) * 10) / 10,
        bossesDefeated: last?.bossesDefeated ?? 0,
        chests,
        unfairCount: unfair.length,
        unfair,
      });
      allErrors.push(...errors.map((e) => `seed ${seed}: ${e}`));
      console.log(`seed ${seed}: ${chests.length} Truhen, unfair ${unfair.length} (${unfair.map((u) => `#${u.index} ${u.terrain} edge=${u.edgeDistPx}`).join(", ") || "keine"})`);
    } finally {
      await page.close();
    }
  }

  const totalChests = seeds.reduce((a, s) => a + s.chests.length, 0);
  const okChests = seeds.reduce((a, s) => a + s.chests.filter((c) => c.ok).length, 0);
  report = {
    schema: "m10-chest-spawn-fair/v1",
    generatedAt: new Date().toISOString(),
    phase: OUT.includes("after") ? "after" : "before",
    fairnessLimits: { edgeMarginPx: EDGE_MARGIN_PX, worldSize: WORLD_SIZE, blockedTerrain: "water" },
    seeds,
    totals: { chests: totalChests, okChests, unfairChests: totalChests - okChests, jsErrors: allErrors.length },
    verdict: {
      allChestsOnFairCell: totalChests > 0 && okChests === totalChests,
      jsErrors: allErrors.length,
      passed: totalChests >= 18 && okChests === totalChests && allErrors.length === 0,
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
