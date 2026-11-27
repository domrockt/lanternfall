#!/usr/bin/env node
// M10-Abnahme: belegt per reiner Simulation, dass alle 30 Gegnertypen im
// 30-min-Run tatsaechlich spawnen (nicht nur in src/data/enemies.ts stehen).
//
// Simuliert die Director-Semantik aus src/systems/Spawner.ts in 1-s-Schritten:
//   - waveForMinute(minute) liefert Mix + Spawnrate,
//   - advanceSpawnBudget akkumuliert die Rate,
//   - pickEnemy waehlt gewichtet aus dem Mix,
//   - Spezialwellen (Ring/Strom) und Elite-Pakete spawnen am Minutengrenzpunkt.
// Seeds 101 und 202, je 30 Sim-Minuten.
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
  const rngMod = await server.ssrLoadModule("/src/logic/rng.ts");
  const scaling = await server.ssrLoadModule("/src/logic/scaling.ts");
  const { ENEMIES } = data;
  const { waveForMinute } = data;
  const { advanceSpawnBudget, pickEnemy, elitePackCount } = logic;
  const { SeededRng } = rngMod;

  const ENEMY_IDS = Object.keys(ENEMIES);
  if (ENEMY_IDS.length !== 30) {
    throw new Error(`erwarte 30 Gegner-IDs, gefunden ${ENEMY_IDS.length}`);
  }

  // In-Game skaliert die Spawnrate mit der sichtbaren Flaeche. Fuer den
  // Coverage-Beleg ist die Rate selbst unkritisch; wir nehmen den Faktor fuer
  // den Standard-View 640x360 (=1), damit die Zahlen zum Spiel passen.
  const RATE_FACTOR = scaling.spawnRateFactor(640, 360);

  const tierEndForId = (id) => {
    const tier = ENEMIES[id].tier;
    // Tier n endet bei (n+1)*5 Minuten; Tier 4 (20-30) endet bei 30:00.
    return (tier + 1) * 5 * 60;
  };

  const simulate = (seed) => {
    const rng = new SeededRng(seed);
    const spawns = Object.fromEntries(ENEMY_IDS.map((id) => [id, 0]));
    const firstSpawn = Object.fromEntries(ENEMY_IDS.map((id) => [id, null]));
    const blockCounts = Array.from({ length: 6 }, () =>
      Object.fromEntries(ENEMY_IDS.map((id) => [id, 0])));
    const blockTotals = Array(6).fill(0);
    let budget = 0;
    let lastMinute = -1;

    const record = (id, second) => {
      spawns[id] += 1;
      if (firstSpawn[id] === null) firstSpawn[id] = second;
      const block = Math.min(5, Math.floor(second / (5 * 60)));
      blockCounts[block][id] += 1;
      blockTotals[block] += 1;
    };

    for (let second = 0; second < SECONDS; second++) {
      const minute = Math.min(29, Math.floor(second / 60));
      const wave = waveForMinute(minute);
      if (minute !== lastMinute) {
        lastMinute = minute;
        // Spezialwelle am Minutengrenzpunkt (wie Spawner.update).
        if (wave.special === "ring" || wave.special === "stream") {
          const count = wave.special === "ring"
            ? 6 + Math.floor(wave.minute / 6)
            : 6 + Math.floor(wave.minute / 5);
          for (let i = 0; i < count; i++) {
            const id = pickEnemy(wave.mix, rng);
            if (id) record(id, second);
          }
        }
        if (wave.elitePack) {
          const count = elitePackCount(wave.minute);
          for (let i = 0; i < count; i++) {
            const id = pickEnemy(wave.mix, rng);
            if (id) record(id, second);
          }
        }
      }
      const scaled = advanceSpawnBudget(budget, wave.spawnRate * RATE_FACTOR, 1);
      budget = scaled.budget;
      for (let i = 0; i < scaled.count; i++) {
        const id = pickEnemy(wave.mix, rng);
        if (!id) throw new Error(`pickEnemy lieferte null (Minute ${minute})`);
        record(id, second);
      }
    }

    const blockShares = blockCounts.map((counts, i) => {
      const total = blockTotals[i];
      return total === 0 ? {} : Object.fromEntries(
        Object.entries(counts).map(([id, n]) => [id, Math.round((n / total) * 1000) / 10]),
      );
    });

    const missing = ENEMY_IDS.filter((id) => spawns[id] === 0);
    const afterTier = ENEMY_IDS.filter((id) =>
      firstSpawn[id] !== null && firstSpawn[id] > tierEndForId(id));
    const overShare = [];
    for (let b = 0; b < blockShares.length; b++) {
      for (const [id, share] of Object.entries(blockShares[b])) {
        if (share > 35) overShare.push({ block: b, id, share });
      }
    }

    return {
      seed,
      totalSpawns: blockTotals.reduce((a, b) => a + b, 0),
      covered: ENEMY_IDS.length - missing.length,
      missing,
      firstSpawnAfterTierEnd: afterTier,
      shareOver35: overShare,
      spawns,
      firstSpawn,
      blockTotals,
      blockShares,
    };
  };

  const results = SEEDS.map(simulate);
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
