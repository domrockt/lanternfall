// m10-particles-hit-wiring (K3): Probe — Spawn-Anzahl pro Hit vorher (konstant,
// crit?5:2 in hitEnemy) / nachher (wired: hitParticlesFor-Skala gegen das
// High-Budget) je Tier. Die Budgets werden LIVE aus src/logic/quality.ts
// gelesen (Regex), damit die Probe vom aktuellen Merge-Stand abhängt (14 oder
// 10 für medium — beide akzeptiert). Kein FPS-/Echtzeit-Messen -> ohne flock.
// Ausgabe: JSON nach ~/games/.evidence/m10-particles-hit-wiring/probe.json.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const qualitySrc = readFileSync(join(root, "src/logic/quality.ts"), "utf8");

/** particlesPerHit-Werte je Tier aus quality.ts ziehen (SSOT, kein Duplikat). */
function readBudgets(src) {
  const budgets = {};
  const re = /particlesPerHit:\s*(\d+)/g;
  const nums = [...src.matchAll(re)].map((m) => Number(m[1]));
  // Reihenfolge im Quelltext: QUALITY_BUDGETS high, medium, low — dann THERMAL_BUDGET.
  const [high, medium, low, thermal] = nums;
  budgets.high = high;
  budgets.medium = medium;
  budgets.low = low;
  budgets.thermal = thermal;
  return budgets;
}

/** Vorher: konstanter Burst in hitEnemy (vor dem Wiring). */
const oldCount = (crit) => (crit ? 5 : 2);
/** Nachher: hitParticlesFor (CombatSystem.ts, K2) — identische Formel. */
function newCount(crit, budget, highBudget) {
  const scale = budget / highBudget;
  return Math.max(1, Math.round((crit ? 5 : 2) * scale));
}

const budgets = readBudgets(qualitySrc);
const highBudget = budgets.high;
const tiers = ["high", "medium", "low", "thermal"];
const table = {};
for (const tier of tiers) {
  table[tier] = {
    budget: budgets[tier],
    old: { crit: oldCount(true), normal: oldCount(false) },
    new: {
      crit: newCount(true, budgets[tier], highBudget),
      normal: newCount(false, budgets[tier], highBudget),
    },
  };
}

const result = {
  lane: "m10-particles-hit-wiring",
  card: "#13916",
  at: new Date().toISOString(),
  source: "src/logic/quality.ts (particlesPerHit je Tier, live gelesen)",
  formula: "new = max(1, round((crit ? 5 : 2) * particlesPerHitFor(tier) / particlesPerHitFor(\"high\")))",
  table,
  verdict: {
    highUnchanged:
      table.high.new.crit === table.high.old.crit && table.high.new.normal === table.high.old.normal,
    mediumReduced:
      table.medium.new.crit < table.medium.old.crit || table.medium.new.normal < table.medium.old.normal,
    monotonic:
      table.high.new.crit >= table.medium.new.crit &&
      table.medium.new.crit >= table.low.new.crit &&
      table.low.new.crit >= table.thermal.new.crit,
  },
};

const outDir = join(homedir(), "games/.evidence/m10-particles-hit-wiring");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "probe.json");
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
console.log(`\n-> ${outPath}`);
