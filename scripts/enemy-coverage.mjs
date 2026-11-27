#!/usr/bin/env node
// M10-Abnahme: belegt per reiner Simulation, dass alle 30 Gegnertypen im
// 30-min-Run tatsaechlich spawnen (nicht nur in src/data/enemies.ts stehen).
//
// Nutzt `simulateEnemyCoverage` aus src/logic/waves.ts (SeededRng, Seeds 101/202,
// 1-s-Schritte); die Funktion bildet die Director-Semantik aus Spawner.update()
// nach: waveForMinute + advanceSpawnBudget + pickEnemy, inkl. Spezialwelle/Elite.
//
// Ausgabe: shots/m10-coverage-sim.json + stdout-Tabelle.
import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "vite";

const SECONDS = 30 * 60;
const SEEDS = [101, 202];

const server = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const data = await server.ssrLoadModule("/src/data/index.ts");
  const logic = await server.ssrLoadModule("/src/logic/waves.ts");
  const scaling = await server.ssrLoadModule("/src/logic/scaling.ts");
  const { ENEMIES, waveForMinute } = data;
  const { simulateEnemyCoverage } = logic;

  const ENEMY_IDS = Object.keys(ENEMIES);
  if (ENEMY_IDS.length !== 30) {
    throw new Error(`erwarte 30 Gegner-IDs, gefunden ${ENEMY_IDS.length}`);
  }
  // In-Game skaliert die Spawnrate mit der sichtbaren Flaeche; fuer den
  // Coverage-Beleg nehmen wir den Faktor des Standard-Views 640x360 (=1).
  const RATE_FACTOR = scaling.spawnRateFactor(640, 360);

  const tierEndForId = (id) => (ENEMIES[id].tier + 1) * 5 * 60;

  const results = SEEDS.map((seed) => {
    const sim = simulateEnemyCoverage(seed, SECONDS, ENEMY_IDS, RATE_FACTOR);
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
  console.log(`Enemy-Coverage Sim (${SECONDS / 60} min, ${SEEDS.length} Seeds, ${RATE_FACTOR}x Rate)`);
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
