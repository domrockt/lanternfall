/**
 * Lane m10-damage-label-quality (K3, #11511): Guard fuer die Schadenszahlen-
 * Tier-Matrix. Friert ein, dass das Label-Budget je Qualitaetsstufe
 * monoton ist (LOW <= MID <= HIGH) und dass Tier HIGH bitgleich zum
 * Stand vor der Qualitaets-Verdrahtung bleibt (Cap == MAX_VISIBLE_LABELS,
 * Aggregat-Cap MAX_VIEWS_AGGREGATE unangetastet).
 *
 * Rein logisch (src/logic/quality.ts + src/logic/damage-numbers.ts) — kein
 * Phaser noetig, kein Laufzeit-Regler (der ist in tests/quality-tier.test.ts
 * ueber stepQuality abgedeckt).
 */
import { describe, expect, it } from "vitest";
import {
  QUALITY_BUDGETS,
  QUALITY_ORDER,
  damageLabelCapForQuality,
  damageNumbersPerSecFor,
  qualityBudgetFor,
  type QualityTier,
} from "../src/logic/quality";
import { MAX_VIEWS_AGGREGATE, MAX_VISIBLE_LABELS } from "../src/logic/damage-numbers";

describe("m10-damage-label-quality (K3): Tier-Matrix Schadenszahlen", () => {
  it("Label-Cap exakt 5/8/12 je Stufe (low/medium/high)", () => {
    expect(damageLabelCapForQuality("low")).toBe(5);
    expect(damageLabelCapForQuality("medium")).toBe(8);
    expect(damageLabelCapForQuality("high")).toBe(12);
  });

  it("Label-Cap monotone Matrix LOW <= MID <= HIGH ueber alle Stufen", () => {
    for (let i = 1; i < QUALITY_ORDER.length; i++) {
      const weaker = damageLabelCapForQuality(QUALITY_ORDER[i - 1]);
      const stronger = damageLabelCapForQuality(QUALITY_ORDER[i]);
      expect(weaker).toBeLessThanOrEqual(stronger);
    }
  });

  it("Emission/s monotone Matrix 8 <= 14 <= 24 (fuer spaere Emissions-Verdrahtung)", () => {
    expect(damageNumbersPerSecFor("low")).toBe(8);
    expect(damageNumbersPerSecFor("medium")).toBe(14);
    expect(damageNumbersPerSecFor("high")).toBe(24);
    for (let i = 1; i < QUALITY_ORDER.length; i++) {
      expect(damageNumbersPerSecFor(QUALITY_ORDER[i - 1]))
        .toBeLessThanOrEqual(damageNumbersPerSecFor(QUALITY_ORDER[i]));
    }
  });

  it("Tier HIGH bleibt bitgleich zum Stand vor der Qualitaets-Verdrahtung", () => {
    // Non-aggregate: min(maxViews=24, MAX_VISIBLE_LABELS, qualityCap) — der
    // Quality-Cap bei high darf MAX_VISIBLE_LABELS weder unter- noch
    // ueberschreiten, sonst aendert sich das high-Verhalten.
    expect(damageLabelCapForQuality("high")).toBe(MAX_VISIBLE_LABELS);
    // Aggregate: min(lodLimit, MAX_VIEWS_AGGREGATE, qualityCap) — der
    // Aggregat-Cap bleibt massgeblich, high-Cap schneidet ihn nicht an.
    expect(MAX_VIEWS_AGGREGATE).toBeLessThan(damageLabelCapForQuality("high"));
  });

  it("Budget-Tabelle und Helfer-Funktionen sind konsistent (eine Quelle)", () => {
    for (const tier of QUALITY_ORDER as readonly QualityTier[]) {
      expect(damageLabelCapForQuality(tier)).toBe(QUALITY_BUDGETS[tier].maxDamageLabels);
      expect(damageNumbersPerSecFor(tier)).toBe(QUALITY_BUDGETS[tier].damageNumbersPerSec);
    }
  });

  it("Unbekanntes Tier faellt auf high zurueck (kein strengerer Cap als high)", () => {
    expect(damageLabelCapForQuality("unknown" as QualityTier)).toBe(
      damageLabelCapForQuality("high"),
    );
    expect(qualityBudgetFor("unknown" as QualityTier).tier).toBe("high");
  });
});
