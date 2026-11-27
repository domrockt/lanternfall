#!/usr/bin/env node
// M10-Abnahme: Gegner-Abdeckung im echten 30-min-Run.
//
// Ohne Argument: reine Simulation (Seeds 101/202, 1-s-Schritte) ->
//   shots/m10-coverage-sim.json + stdout-Tabelle.
// Mit `--ingame`: headless Browser, 30 Sim-Minuten @ timeScale 30,
//   Spawn-Zaehler aus window.__lf -> shots/m10-coverage-ingame.json.
//
// Die In-Game-Zahl kommt aus `Spawner.spawnCounts` (nur zaehlen, nichts steuern),
// das `window.__lf.state()` aus der Registry ergaenzt.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const SECONDS = 30 * 60;
const SEEDS = [101, 202];
const INGAME = process.argv.slice(2).includes("--ingame");

// In-Game skaliert die Spawnrate mit der sichtbaren Flaeche; fuer den
// Coverage-Beleg nehmen wir den Faktor des Standard-Views 640x360 (=1).
const RATE_FACTOR = 1;

async function runSimulation() {
  const server = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    const data = await server.ssrLoadModule("/src/data/index.ts");
    const logic = await server.ssrLoadModule("/src/logic/waves.ts");
    const scaling = await server.ssrLoadModule("/src/logic/scaling.ts");
    const { ENEMIES } = data;
    const { simulateEnemyCoverage } = logic;

    const ENEMY_IDS = Object.keys(ENEMIES);
    if (ENEMY_IDS.length !== 30) {
      throw new Error(`erwarte 30 Gegner-IDs, gefunden ${ENEMY_IDS.length}`);
    }
    const rateFactor = scaling.spawnRateFactor(640, 360) * RATE_FACTOR;

    const tierEndForId = (id) => (ENEMIES[id].tier + 1) * 5 * 60;

    const results = SEEDS.map((seed) => {
      const sim = simulateEnemyCoverage(seed, SECONDS, ENEMY_IDS, rateFactor);
      const missing = ENEMY_IDS.filter((id) => sim.spawns[id] === 0);
      const afterTier = ENEMY_IDS.filter((id) =>
        sim.firstSpawn[id] !== null && sim.firstSpawn[id] > tierEndForId(id));
      const overShare = [];
      sim.blockShares.forEach((shares, block) => {
        for (const id of ENEMY_IDS) {
          const share = shares[id];
          if (share > 35) overShare.push({ block, id, share });
        }
      });
      return {
        ...sim,
        covered: ENEMY_IDS.length - missing.length,
        missing,
        firstSpawnAfterTierEnd: afterTier,
        shareOver35: overShare,
      };
    });

    const json = {
      generatedAt: new Date().toISOString(),
      method: "pure simulation: waveForMinute + advanceSpawnBudget + pickEnemy, 1-s steps, specials/elite at minute boundaries",
      seeds: SEEDS,
      seconds: SECONDS,
      enemyIds: ENEMY_IDS,
      perSeed: Object.fromEntries(results.map((r) => [r.seed, {
        totalSpawns: r.totalSpawns,
        covered: r.covered,
        missing: r.missing,
        firstSpawnAfterTierEnd: r.firstSpawnAfterTierEnd,
        shareOver35: r.shareOver35,
        spawns: r.spawns,
        firstSpawn: r.firstSpawn,
        blockTotals: r.blockTotals,
        blockShares: r.blockShares,
      }])),
      summary: {
        allCovered: results.every((r) => r.covered === 30),
        coveredPerSeed: Object.fromEntries(results.map((r) => [r.seed, r.covered])),
        missingUnion: [...new Set(results.flatMap((r) => r.missing))],
        firstSpawnLateUnion: [...new Set(results.flatMap((r) => r.firstSpawnAfterTierEnd))],
        shareOver35: results.flatMap((r) => r.shareOver35.map((o) => ({ ...o, seed: r.seed }))),
      },
    };

    mkdirSync("shots", { recursive: true });
    writeFileSync("shots/m10-coverage-sim.json", JSON.stringify(json, null, 2) + "\n");

    // stdout-Tabelle: Spawns + First-Spawn je Seed.
    console.log(`Enemy-Coverage Sim (${SECONDS / 60} min, ${SEEDS.length} Seeds, ${rateFactor}x Rate)`);
    console.log("id".padEnd(14) + SEEDS.map((s) => `spawns@${s}`.padEnd(12)).join("") + SEEDS.map((s) => `first@${s}`.padEnd(12)).join(""));
    for (const id of ENEMY_IDS) {
      const cells = results.map((r) => String(r.spawns[id]).padEnd(12));
      const firsts = results.map((r) => (r.firstSpawn[id] === null ? "-" : `${r.firstSpawn[id]}s`).padEnd(12));
      console.log(id.padEnd(14) + cells.join("") + firsts.join(""));
    }
    console.log("");
    for (const r of results) {
      console.log(`Seed ${r.seed}: ${r.covered}/30 Typen, ${r.totalSpawns} Spawns; fehlend=[${r.missing}]; nach Tier-Ende=[${r.firstSpawnAfterTierEnd}]; Share>35%=${r.shareOver35.length}`);
    }
    const ok = json.summary.allCovered;
    console.log(ok ? "PASS: 30/30 in beiden Seeds" : "FAIL: nicht alle Typen spawnen");
    process.exitCode = ok ? 0 : 1;
  } finally {
    await server.close();
  }
}

async function runIngame() {
  const { ensureBuild, startServer, loadPlaywright, startRun } = await import("./harness.mjs");
  ensureBuild();
  mkdirSync("shots", { recursive: true });
  mkdirSync(`${process.env.HOME}/tmp/m10-enemy-coverage`, { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({
    args: [
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  let maxActive = 0;
  let samples = 0;
  let last = null;
  let json = null;
  const started = Date.now();
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      window.__lf.setTimeScale(30);
    });

    while (Date.now() - started < 240000) {
      await page.waitForTimeout(250);
      const s = await page.evaluate(() => window.__lf.stats());
      last = s;
      samples += 1;
      if (s.scene === "run") {
        maxActive = Math.max(maxActive, s.enemies ?? 0);
        if ((s.time ?? 0) >= 25 * 60 && maxActive > 0 && !json) {
          await page.screenshot({ path: "shots/m10-coverage-ingame-minute25.png" });
          json = { shotAt: s.time };
        }
        if ((s.time ?? 0) >= SECONDS) break;
      } else if (s.scene === "results") {
        break;
      }
    }

    // Endzustand inkl. spawnCounts aus window.__lf.state().
    const state = await page.evaluate(() => window.__lf.state());
    const counts = state.spawnCounts ?? {};
    // Soll-Liste aus dem Sim-JSON (von K1 committet); Fallback: gezaehlte IDs.
    let expectedIds = Object.keys(counts);
    try {
      const { readFileSync } = await import("node:fs");
      expectedIds = JSON.parse(readFileSync("shots/m10-coverage-sim.json", "utf8")).enemyIds;
    } catch { /* Sim-JSON fehlt: nutzen die gezaehlten IDs */ }
    const missing = expectedIds.filter((id) => (counts[id] ?? 0) === 0);
    const covered = expectedIds.length - missing.length;
    const totalSpawns = Object.values(counts).reduce((a, b) => a + b, 0);
    const realSeconds = Math.round((Date.now() - started) / 1000 * 10) / 10;
    const ok = covered === expectedIds.length && expectedIds.length === 30
      && maxActive >= 30 && errors.length === 0;

    const out = {
      generatedAt: new Date().toISOString(),
      milestone: "M10",
      method: `headless Chromium 640x360, ?debug=1&seed=101, god+autoPlay, timeScale 30, ${SECONDS} sim-seconds`,
      timeScale: 30,
      simSeconds: Math.round((state.time ?? last?.time ?? 0) * 10) / 10,
      realSeconds,
      samples,
      maxActiveEnemies: maxActive,
      lastActiveEnemies: state.enemies ?? 0,
      expectedEnemyIds: expectedIds.length,
      covered,
      missing,
      totalSpawns,
      spawnCounts: counts,
      jsErrors: errors,
      ok,
    };
    writeFileSync("shots/m10-coverage-ingame.json", JSON.stringify(out, null, 2) + "\n");
    console.log(JSON.stringify({
      simSeconds: out.simSeconds,
      realSeconds: out.realSeconds,
      maxActiveEnemies: out.maxActiveEnemies,
      covered: `${covered}/${expectedIds.length}`,
      totalSpawns,
      missing,
      jsErrors: errors.length,
      ok,
    }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    await browser.close();
    server.stop();
  }
}

await (INGAME ? runIngame() : runSimulation());
