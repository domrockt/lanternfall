/**
 * m10-thermal-tier-types: Typ-/Delegations-Guard fuer die erweiterten
 * Signaturen (QualityTier -> ThermalTier). Bedarfsmeldung requests.md
 * 2026-11-28T11:50Z (m10-thermal-wiring): qualityBudgetFor(ThermalTier) deckt
 * "thermal" zur Laufzeit bereits voll ab — die Cap-Wrapper muessen das im Typ
 * tragen. Reine Typ-Gewinnrate, KEINE Verhaltensaenderung: jeder Guard hier
 * pinnt Bitgleichheit mit den bisherigen Laufzeitwerten.
 *
 * Compile-Zeit-Anteil: Die Aufrufe mit ThermalTier-Werten (inkl. "thermal")
 * schlagen tsc fehl, falls eine Signatur zurueck auf QualityTier faellt.
 */
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import {
  QUALITY_BUDGETS,
  THERMAL_BUDGET,
  damageLabelCapForQuality,
  glowAreaCapForQuality,
  glowEnabledFor,
  particlesPerHitFor,
  qualityBudgetFor,
  type ThermalTier,
} from "../src/logic/quality";
import { AUDIO_BUDGETS, AUDIO_BUDGET_HIGH, audioBudgetFor } from "../src/audio/mixing";
import { effectiveQuality } from "../src/config";
import { initialThermalState } from "../src/logic/quality";

const configSrc = (): string =>
  readFileSync(new URL("../src/config.ts", import.meta.url), "utf8");

describe("m10-thermal-tier-types: Delegations-Guard (thermal == bisherige Laufzeitwerte)", () => {
  // ThermalTier inkl. "thermal" — jede dieser Zeilen ist zugleich ein
  // Compile-Zeit-Guard gegen ein Zurueckfallen der Signaturen.
  const thermal: ThermalTier = "thermal";

  it("Cap-Wrapper 'thermal' liefert exakt THERMAL_BUDGET (qualityBudgetFor-Delegation)", () => {
    expect(glowAreaCapForQuality(thermal)).toBe(THERMAL_BUDGET.maxAddArea);
    expect(glowEnabledFor(thermal)).toBe(THERMAL_BUDGET.glow);
    expect(damageLabelCapForQuality(thermal)).toBe(THERMAL_BUDGET.maxDamageLabels);
    expect(particlesPerHitFor(thermal)).toBe(THERMAL_BUDGET.particlesPerHit);
  });

  it.each(["high", "medium", "low"] as const)(
    "Cap-Wrapper '%s' delegieren bitgleich auf qualityBudgetFor",
    (tier) => {
      const budget = QUALITY_BUDGETS[tier];
      expect(glowAreaCapForQuality(tier)).toBe(budget.maxAddArea);
      expect(glowEnabledFor(tier)).toBe(budget.glow);
      expect(damageLabelCapForQuality(tier)).toBe(budget.maxDamageLabels);
      expect(particlesPerHitFor(tier)).toBe(budget.particlesPerHit);
    },
  );

  it("thermal != low: der thermische Haertefall bleibt strenger als low (kein Verwischen)", () => {
    expect(THERMAL_BUDGET.maxAddArea).toBeLessThan(QUALITY_BUDGETS.low.maxAddArea);
    expect(THERMAL_BUDGET.maxDamageLabels).toBeLessThan(QUALITY_BUDGETS.low.maxDamageLabels);
    expect(THERMAL_BUDGET.particlesPerHit).toBeLessThan(QUALITY_BUDGETS.low.particlesPerHit);
  });
});

describe("m10-thermal-tier-types: audioBudgetFor (thermal -> high = Status quo)", () => {
  it.each(["high", "medium", "low"] as const)(
    "audioBudgetFor('%s') ist bitgleich AUDIO_BUDGETS['%s']",
    (tier) => {
      expect(audioBudgetFor(tier)).toBe(AUDIO_BUDGETS[tier]);
    },
  );

  it("audioBudgetFor('thermal') == high (Audio ist kein thermal-Hebel, Fallback Status quo)", () => {
    expect(audioBudgetFor("thermal")).toBe(AUDIO_BUDGET_HIGH);
    expect(audioBudgetFor("thermal")).toBe(AUDIO_BUDGETS.high);
  });

  it("Unbekannt-Tier-Fallback ?? high bleibt erhalten (Robustheit, wie bisher)", () => {
    expect(audioBudgetFor("egal" as never)).toBe(AUDIO_BUDGET_HIGH);
  });
});

describe("m10-thermal-tier-types: effectiveQuality ohne Cast", () => {
  it("inaktiv -> Basis-Stufe, aktiv -> 'thermal' (Rueckgabetyp ehrlich ThermalTier)", () => {
    const eff: ThermalTier = effectiveQuality("low", initialThermalState());
    expect(eff).toBe("low");
    expect(
      effectiveQuality("low", { tier: "low", active: true, crashMs: 0, recoverMs: 0 }),
    ).toBe("thermal");
  });

  it("Pin: der dokumentierte Cast ist aus config.ts entfallen", () => {
    const src = configSrc();
    // Alte Code-Form ("thermal" as QualityTier) weg; neue Implementierung
    // (ehrlicher ThermalTier-Rueckgabetyp, kein Cast im Ausdruck) da.
    expect(src).not.toMatch(/\(\s*"thermal"\s+as\s+QualityTier\s*\)/);
    expect(src).toMatch(/return thermal\.active \? "thermal" : baseTier;/);
  });

  it("Pin: QUALITY wird weiterhin ueber effectiveQuality gesetzt (keine Umgehung)", () => {
    // Merge m10-device-janky-node: Parameter heisst jetzt `baseTier` (statt
    // `qState.tier`). Pin lockert nur den Variablennamen — der Pflicht-Aufruf
    // `effectiveQuality(<tier>, thermalState)` bleibt komplett erhalten.
    expect(configSrc()).toMatch(/QUALITY = effectiveQuality\(\w+, thermalState\)/);
  });
});
