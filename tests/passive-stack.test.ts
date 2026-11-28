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
  STAT_CAPS,
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
 *  - Flaeche/Dauer: Sanity-Cap +200 % (hourglass Stufe 5 liefert +50 %)
 *  - Max-HP flach: Sanity-Cap +500 (heart Stufe 5 liefert +100), Regen-Cap 50/s
 * Quelle der Caps: STAT_CAPS in src/logic/stats.ts.
 */

const CAPS = STAT_CAPS;


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

// Kein generatedAt: Die Datei ist ein getrackter, stabiler Snapshot — ein
// Lauf-Zeitstempel wuerde bei jedem Suite-Lauf andere Bytes schreiben und den
// git-Status dauerhaft dirty halten (siehe docs/lanes/m10-passive-math-artifact-fix.md).
const summary = {
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

// ---------------------------------------------------------------------------
// #2920 Grenz-Beleg: Caps an den Grenzen (Stufe 5, Stufe 8 geclampt,
// mehrfach angewendete Mods) und Kombination aller 6 Passives gleichzeitig.
// ---------------------------------------------------------------------------

interface CapCheck {
  scenario: string;
  stat: string;
  value: number;
  cap: number;
  direction: "max" | "min";
  withinCap: boolean;
  finiteNonNegative: boolean;
}

const boundary: CapCheck[] = [];

function check(
  scenario: string,
  stat: string,
  value: number,
  cap: number,
  direction: "max" | "min" = "max",
): void {
  const withinCap =
    direction === "max" ? value <= cap + 1e-9 : value >= cap - 1e-9;
  boundary.push({
    scenario,
    stat,
    value,
    cap,
    direction,
    withinCap,
    finiteNonNegative: Number.isFinite(value) && value >= 0,
  });
}

const boots5 = aggregateMods([PASSIVES.boots.levels[4].mods]);
const boots5x2 = aggregateMods([PASSIVES.boots.levels[4].mods, PASSIVES.boots.levels[4].mods]);
const boots5x3 = aggregateMods([
  PASSIVES.boots.levels[4].mods,
  PASSIVES.boots.levels[4].mods,
  PASSIVES.boots.levels[4].mods,
]);
const boots8 = aggregateMods([PASSIVES.boots.levels[clampedLevel("boots", 8) - 1].mods]);
check("boots Stufe 5 einzeln", "moveSpeed", effectiveMoveSpeed(BASE_MOVE, boots5), BASE_MOVE * (1 + CAPS.moveSpeedPct / 100));
check("boots Stufe 5 doppelt", "moveSpeed", effectiveMoveSpeed(BASE_MOVE, boots5x2), BASE_MOVE * (1 + CAPS.moveSpeedPct / 100));
check("boots Stufe 5 dreifach", "moveSpeed", effectiveMoveSpeed(BASE_MOVE, boots5x3), BASE_MOVE * (1 + CAPS.moveSpeedPct / 100));
check("boots Stufe 8 (Level-Clamp)", "moveSpeed", effectiveMoveSpeed(BASE_MOVE, boots8), BASE_MOVE * (1 + CAPS.moveSpeedPct / 100));

const tome5 = aggregateMods([PASSIVES.tome.levels[4].mods]);
const tome5x2 = aggregateMods([PASSIVES.tome.levels[4].mods, PASSIVES.tome.levels[4].mods]);
check("tome Stufe 5 einzeln", "cooldown", effectiveCooldown(BASE_COOLDOWN, tome5), BASE_COOLDOWN * (1 - CAPS.cooldownPct / 100), "min");
check("tome Stufe 5 doppelt", "cooldown", effectiveCooldown(BASE_COOLDOWN, tome5x2), BASE_COOLDOWN * (1 - CAPS.cooldownPct / 100), "min");

const whet5 = aggregateMods([PASSIVES.whetstone.levels[4].mods]);
const whet5x2 = aggregateMods([PASSIVES.whetstone.levels[4].mods, PASSIVES.whetstone.levels[4].mods]);
check("whetstone Stufe 5 einzeln", "damage", effectiveDamage(BASE_DAMAGE, whet5), Math.round(BASE_DAMAGE * (1 + CAPS.damagePct / 100)));
check("whetstone Stufe 5 doppelt", "damage", effectiveDamage(BASE_DAMAGE, whet5x2), Math.round(BASE_DAMAGE * (1 + CAPS.damagePct / 100)));

const charm5 = aggregateMods([PASSIVES.charm.levels[4].mods]);
const charm5x2 = aggregateMods([PASSIVES.charm.levels[4].mods, PASSIVES.charm.levels[4].mods]);
check("charm Stufe 5 einzeln", "pickupRadius", effectivePickupRadius(BASE_PICKUP, charm5), BASE_PICKUP * (1 + CAPS.pickupRadiusPct / 100));
check("charm Stufe 5 doppelt", "pickupRadius", effectivePickupRadius(BASE_PICKUP, charm5x2), BASE_PICKUP * (1 + CAPS.pickupRadiusPct / 100));

const heart5 = aggregateMods([PASSIVES.heart.levels[4].mods]);
const heart5x2 = aggregateMods([PASSIVES.heart.levels[4].mods, PASSIVES.heart.levels[4].mods]);
check("heart Stufe 5 einzeln", "maxHpFlat", heart5.maxHpFlat, CAPS.maxHpFlat);
check("heart Stufe 5 doppelt", "maxHpFlat", heart5x2.maxHpFlat, CAPS.maxHpFlat);
check("heart Stufe 5 einzeln", "regen", heart5.regen, CAPS.regen);

const hour5 = aggregateMods([PASSIVES.hourglass.levels[4].mods]);
const hour5x2 = aggregateMods([PASSIVES.hourglass.levels[4].mods, PASSIVES.hourglass.levels[4].mods]);
check("hourglass Stufe 5 einzeln", "radius", effectiveRadius(BASE_RADIUS, hour5), BASE_RADIUS * (1 + CAPS.areaPct / 100));
check("hourglass Stufe 5 doppelt", "radius", effectiveRadius(BASE_RADIUS, hour5x2), BASE_RADIUS * (1 + CAPS.areaPct / 100));
check("hourglass Stufe 5 einzeln", "duration", effectiveDuration(BASE_DURATION, hour5), BASE_DURATION * (1 + CAPS.durationPct / 100));

if (comboAgg) {
  check("Kombination 6/6 Stufe 5", "moveSpeed", effectiveMoveSpeed(BASE_MOVE, comboAgg), BASE_MOVE * (1 + CAPS.moveSpeedPct / 100));
  check("Kombination 6/6 Stufe 5", "cooldown", effectiveCooldown(BASE_COOLDOWN, comboAgg), BASE_COOLDOWN * (1 - CAPS.cooldownPct / 100), "min");
  check("Kombination 6/6 Stufe 5", "damage", effectiveDamage(BASE_DAMAGE, comboAgg), Math.round(BASE_DAMAGE * (1 + CAPS.damagePct / 100)));
  check("Kombination 6/6 Stufe 5", "pickupRadius", effectivePickupRadius(BASE_PICKUP, comboAgg), BASE_PICKUP * (1 + CAPS.pickupRadiusPct / 100));
  check("Kombination 6/6 Stufe 5", "radius", effectiveRadius(BASE_RADIUS, comboAgg), BASE_RADIUS * (1 + CAPS.areaPct / 100));
  check("Kombination 6/6 Stufe 5", "duration", effectiveDuration(BASE_DURATION, comboAgg), BASE_DURATION * (1 + CAPS.durationPct / 100));
}

const junkAgg = aggregateMods([
  { damagePct: Number.NaN },
  { cooldownPct: Number.POSITIVE_INFINITY },
  { pickupRadiusPct: Number.NEGATIVE_INFINITY },
  { moveSpeedPct: -999 },
  { maxHpFlat: Number.NaN },
  { regen: Number.NEGATIVE_INFINITY },
  { areaPct: -50 },
  { durationPct: Number.NaN },
]);
const junk = {
  mods: junkAgg,
  moveSpeed: effectiveMoveSpeed(BASE_MOVE, junkAgg),
  cooldown: effectiveCooldown(BASE_COOLDOWN, junkAgg),
  damage: effectiveDamage(BASE_DAMAGE, junkAgg),
  pickupRadius: effectivePickupRadius(BASE_PICKUP, junkAgg),
  radius: effectiveRadius(BASE_RADIUS, junkAgg),
  duration: effectiveDuration(BASE_DURATION, junkAgg),
};
const junkValues = Object.values(junk).filter((v) => typeof v === "number") as number[];
const junkInvalid = junkValues.filter((v) => !Number.isFinite(v) || v < 0);

const boundaryViolations = boundary.filter((c) => !c.withinCap || !c.finiteNonNegative);

// Kein generatedAt — siehe Kommentar ueber `summary` (stabile Snapshot-Bytes).
const capsSummary = {
  caps: CAPS,
  checks: boundary.length,
  violations: boundaryViolations.length,
  boundary,
  combo: {
    combined: combo.combined,
    threw: comboError !== null,
    error: comboError,
    allSixAtMax: (Object.keys(PASSIVES) as PassiveId[]).every((id) => modsFor(id, PASSIVES[id].maxLevel) !== undefined),
    withinCaps: combo.combined && (combo as { withinCaps?: boolean }).withinCaps === true,
    mods: comboAgg,
  },
  junk: {
    mods: junkAgg,
    effective: junk,
    invalidValues: junkInvalid.length,
  },
};

writeFileSync(
  "shots/m10-passive-math-caps.json",
  JSON.stringify(capsSummary, null, 2) + "\n",
);

describe("Grenz-Beleg: Caps und 6/6-Kombination", () => {
  it("kein Grenzfall verlaesst Cap oder erzeugt NaN/negativ", () => {
    expect(boundary.length).toBeGreaterThanOrEqual(15);
    expect(boundaryViolations).toEqual([]);
  });

  it("Doppelzaehlung derselben Passiv-Stufe bleibt am Cap", () => {
    expect(boots5x2.moveSpeedPct).toBe(CAPS.moveSpeedPct);
    expect(boots5x3.moveSpeedPct).toBe(CAPS.moveSpeedPct);
    expect(tome5x2.cooldownPct).toBe(CAPS.cooldownPct);
    expect(whet5x2.damagePct).toBe(CAPS.damagePct);
    expect(charm5x2.pickupRadiusPct).toBe(CAPS.pickupRadiusPct);
  });

  it("alle 6 Passives gleichzeitig auf Stufe 5: kombinierbar, kein Wurf", () => {
    expect(comboError).toBeNull();
    expect(combo.combined).toBe(true);
    expect(capsSummary.combo.allSixAtMax).toBe(true);
    expect(capsSummary.combo.withinCaps).toBe(true);
  });

  it("Muell-Eingaben (NaN/Infinity/negativ) werden zu finiten, nicht-negativen Werten", () => {
    expect(junkInvalid).toEqual([]);
    expect(junk.moveSpeed).toBeGreaterThanOrEqual(10);
    expect(junk.cooldown).toBeGreaterThanOrEqual(0.2);
    expect(junk.damage).toBeGreaterThanOrEqual(1);
    expect(junk.pickupRadius).toBeGreaterThanOrEqual(0);
    expect(junk.radius).toBeGreaterThanOrEqual(0);
    expect(junk.duration).toBeGreaterThanOrEqual(0);
  });
});
