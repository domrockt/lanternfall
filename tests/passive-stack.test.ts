import { describe, it, expect } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { mkdirSync, writeFileSync } from "node:fs";
import { PASSIVES } from "../src/data/passives";
import {
  aggregateMods,
  effectiveCooldown,
  effectiveDamage,
  effectiveDuration,
  effectiveMoveSpeed,
  effectivePickupRadius,
  effectiveRadius,
} from "../src/logic/stats";
import type { PassiveId } from "../src/data/types";

/**
 * M10-Passive-Math: Vertrag "Stufe n eines Passives liefert genau den n-fachen
 * Basisbonus" plus harte Obergrenzen. Die Passives haben maxLevel 5; Stufen
 * 6..8 werden wie im Spiel (LevelUpSystem clamp) auf maxLevel geklemmt.
 *
 * Cap-Semantik (dokumentiert in docs/lanes/m10-passive-math.md):
 *  - Bewegungstempo: maximal +40 % (boots Stufe 5)
 *  - Abklingzeit: hoechstens -40 % (tome Stufe 5), nie unter 20 % der Basis
 *  - Schaden: hoechstens +50 % (whetstone Stufe 5)
 *  - Aufsammelradius: hoechstens +125 % (charm Stufe 5)
 *  - Flaeche/Dauer: hoechstens +50 % (hourglass Stufe 5)
 *  - Max-HP flach: hoechstens +100 (heart Stufe 5), Regen hoechstens +10/s
 */

const CAPS = {
  moveSpeedPct: 40,
  cooldownPct: 40,
  damagePct: 50,
  pickupRadiusPct: 125,
  areaPct: 50,
  durationPct: 50,
  maxHpFlat: 100,
  regen: 10,
} as const;

const BASE_MOVE = 100;
const BASE_COOLDOWN = 1;
const BASE_DAMAGE = 100;
const BASE_PICKUP = 20;
const BASE_RADIUS = 100;
const BASE_DURATION = 10;

const detailed: Array<Record<string, unknown>> = [];
const rows: Array<Record<string, unknown>> = [];

function clampedLevel(id: PassiveId, rawLevel: number): number {
  return Math.min(PASSIVES[id].maxLevel, Math.max(1, Math.floor(rawLevel)));
}

function modsFor(id: PassiveId, rawLevel: number) {
  return PASSIVES[id].levels[clampedLevel(id, rawLevel) - 1].mods;
}

function record(
  passive: PassiveId,
  rawLevel: number,
  stat: string,
  value: number,
  expected: number,
  capPct: number,
  capValue: number,
  capDirection: "max" | "min" = "max",
): void {
  const deviation = value - expected;
  const withinCap =
    capDirection === "max" ? value <= capValue + 1e-9 : value >= capValue - 1e-9;
  const finiteNonNegative = Number.isFinite(value) && value >= 0;
  const row = {
    passive,
    level: rawLevel,
    effectiveLevel: clampedLevel(passive, rawLevel),
    stat,
    value,
    expected,
    deviation,
    capPct,
    capValue,
    withinCap,
    finiteNonNegative,
  };
  rows.push(row);
  detailed.push(row);
}

for (const passive of Object.keys(PASSIVES) as PassiveId[]) {
  for (let level = 1; level <= 8; level++) {
    const mods = modsFor(passive, level);
    const agg = aggregateMods([mods]);
    const effLevel = clampedLevel(passive, level);

    switch (passive) {
      case "boots":
        record(passive, level, "moveSpeed", effectiveMoveSpeed(BASE_MOVE, agg), BASE_MOVE * (1 + (8 * effLevel) / 100), CAPS.moveSpeedPct, BASE_MOVE * (1 + CAPS.moveSpeedPct / 100));
        break;
      case "tome":
        record(passive, level, "cooldown", effectiveCooldown(BASE_COOLDOWN, agg), BASE_COOLDOWN * Math.max(0.2, 1 - (8 * effLevel) / 100), CAPS.cooldownPct, BASE_COOLDOWN * (1 - CAPS.cooldownPct / 100), "min");
        break;
      case "heart":
        record(passive, level, "maxHpFlat", agg.maxHpFlat, 20 * effLevel, CAPS.maxHpFlat, CAPS.maxHpFlat);
        record(passive, level, "regen", agg.regen, 0.3 * effLevel, CAPS.regen, CAPS.regen);
        break;
      case "charm":
        record(passive, level, "pickupRadius", effectivePickupRadius(BASE_PICKUP, agg), BASE_PICKUP * (1 + (25 * effLevel) / 100), CAPS.pickupRadiusPct, BASE_PICKUP * (1 + CAPS.pickupRadiusPct / 100));
        break;
      case "whetstone":
        record(passive, level, "damage", effectiveDamage(BASE_DAMAGE, agg), Math.round(BASE_DAMAGE * (1 + (10 * effLevel) / 100)), CAPS.damagePct, Math.round(BASE_DAMAGE * (1 + CAPS.damagePct / 100)));
        break;
      case "hourglass":
        record(passive, level, "radius", effectiveRadius(BASE_RADIUS, agg), BASE_RADIUS * (1 + (10 * effLevel) / 100), CAPS.areaPct, BASE_RADIUS * (1 + CAPS.areaPct / 100));
        record(passive, level, "duration", effectiveDuration(BASE_DURATION, agg), BASE_DURATION * (1 + (10 * effLevel) / 100), CAPS.durationPct, BASE_DURATION * (1 + CAPS.durationPct / 100));
        break;
    }
  }
}

// Kombination aller 6 Passives gleichzeitig auf Stufe 5.
const allMaxMods = (Object.keys(PASSIVES) as PassiveId[]).map((id) => modsFor(id, PASSIVES[id].maxLevel));
let comboError: string | null = null;
let comboAgg: ReturnType<typeof aggregateMods> | null = null;
try {
  comboAgg = aggregateMods(allMaxMods);
} catch (err) {
  comboError = err instanceof Error ? err.message : String(err);
}

const combo = comboAgg
  ? {
      combined: true,
      mods: comboAgg,
      effectiveMoveSpeed: effectiveMoveSpeed(BASE_MOVE, comboAgg),
      effectiveCooldown: effectiveCooldown(BASE_COOLDOWN, comboAgg),
      effectiveDamage: effectiveDamage(BASE_DAMAGE, comboAgg),
      effectivePickupRadius: effectivePickupRadius(BASE_PICKUP, comboAgg),
      effectiveRadius: effectiveRadius(BASE_RADIUS, comboAgg),
      effectiveDuration: effectiveDuration(BASE_DURATION, comboAgg),
      withinCaps:
        comboAgg.moveSpeedPct <= CAPS.moveSpeedPct &&
        comboAgg.cooldownPct <= CAPS.cooldownPct &&
        comboAgg.damagePct <= CAPS.damagePct &&
        comboAgg.pickupRadiusPct <= CAPS.pickupRadiusPct &&
        comboAgg.areaPct <= CAPS.areaPct &&
        comboAgg.durationPct <= CAPS.durationPct &&
        comboAgg.maxHpFlat <= CAPS.maxHpFlat &&
        comboAgg.regen <= CAPS.regen,
    }
  : { combined: false, error: comboError };

// Adversariale Faelle: Doppelzaehlung derselben Stufe, NaN/Infinity/negativ.
const duplicate = aggregateMods([
  PASSIVES.boots.levels[4].mods,
  PASSIVES.boots.levels[4].mods,
]);
const adversarial = {
  duplicateBootsMoveSpeed: effectiveMoveSpeed(BASE_MOVE, duplicate),
  duplicateBootsWithinCap: duplicate.moveSpeedPct <= CAPS.moveSpeedPct,
  nanDamage: aggregateMods([{ damagePct: Number.NaN }]).damagePct,
  infinityPickup: aggregateMods([{ pickupRadiusPct: Number.POSITIVE_INFINITY }]).pickupRadiusPct,
  negativeCooldown: aggregateMods([{ cooldownPct: -500 }]).cooldownPct,
};

const deviations = rows.filter((r) => Math.abs(Number(r.deviation)) > 1e-9);
const capViolations = rows.filter((r) => r.withinCap !== true);
const invalid = rows.filter((r) => r.finiteNonNegative !== true);

const summary = {
  generatedAt: new Date().toISOString(),
  passiveMaxLevel: Object.fromEntries(
    (Object.keys(PASSIVES) as PassiveId[]).map((id) => [id, PASSIVES[id].maxLevel]),
  ),
  caps: CAPS,
  levelsTested: "1..8",
  rows: rows.length,
  deviations: deviations.length,
  capViolations: capViolations.length,
  nanOrNegative: invalid.length,
  combo,
  adversarial,
};

mkdirSync("shots", { recursive: true });
writeFileSync(
  "shots/m10-passive-math-matrix.json",
  JSON.stringify(summary, null, 2) + "\n",
);

describe("Passive-Matrix: Stufe n = n-facher Basisbonus, innerhalb der Caps", () => {
  it("6 Passives x 8 Stufen erzeugen finite, nicht-negative Werte", () => {
    expect(rows.length).toBe(64);
    expect(invalid).toEqual([]);
  });

  it("jede Stufe trifft den erwarteten n-fachen Basisbonus exakt", () => {
    expect(deviations).toEqual([]);
  });

  it("kein Wert verlaesst die harte Obergrenze", () => {
    expect(capViolations).toEqual([]);
  });

  it("alle 6 Passives sind gleichzeitig auf Stufe 5 kombinierbar", () => {
    expect(comboError).toBeNull();
    expect(combo.combined).toBe(true);
    if (comboAgg) {
      expect(comboAgg.moveSpeedPct).toBe(40);
      expect(comboAgg.cooldownPct).toBe(40);
      expect(comboAgg.damagePct).toBe(50);
      expect(comboAgg.pickupRadiusPct).toBe(125);
      expect(comboAgg.areaPct).toBe(50);
      expect(comboAgg.durationPct).toBe(50);
      expect(comboAgg.maxHpFlat).toBe(100);
      expect(comboAgg.regen).toBeCloseTo(1.5);
    }
  });

  it("Adversariale Eingaben (Duplikate, NaN, Infinity, negativ) bleiben gekappt", () => {
    expect(adversarial.duplicateBootsMoveSpeed).toBeLessThanOrEqual(BASE_MOVE * (1 + CAPS.moveSpeedPct / 100) + 1e-9);
    expect(adversarial.duplicateBootsWithinCap).toBe(true);
    expect(Number.isFinite(adversarial.nanDamage)).toBe(true);
    expect(adversarial.nanDamage).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(adversarial.infinityPickup)).toBe(true);
    expect(adversarial.infinityPickup).toBeGreaterThanOrEqual(0);
    expect(adversarial.negativeCooldown).toBeGreaterThanOrEqual(0);
  });
});
