/**
 * M10-android-scale-floor-r2 (K3): Qualitaetsstufen — Budgets + Hysterese.
 */
import { describe, expect, it, vi } from "vitest";
import {
  QUALITY_BUDGETS,
  QUALITY_HIGH_FPS,
  QUALITY_HIGH_MS,
  QUALITY_LOW_FPS,
  QUALITY_LOW_MS,
  QUALITY_ORDER,
  damageLabelCapForQuality,
  damageNumbersPerSecFor,
  glowAreaCapForQuality,
  glowSlotCapForQuality,
  initialQualityState,
  particlesPerHitFor,
  qualityBudgetFor,
  stepQuality,
  type QualityState,
  type QualityTier,
} from "../src/logic/quality";
import { ADD_GLOW_MAX_SCREEN_AREA } from "../src/systems/FxSystem";
import { MAX_VISIBLE_LABELS } from "../src/logic/damage-numbers";

// FxSystem zieht Phaser ins Modul-Graph — im Node-Test gemockt (wie fx-add-cap).
vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

const DT = 1000 / 60;

describe("M10-android-scale-floor-r2 (K3): Budgets je Stufe", () => {
  it("high entspricht dem heutigen Volllaufen (kein ADD-Deckel, 220 FX, 12 Labels, Glow an)", () => {
    const b = qualityBudgetFor("high");
    expect(b.maxFxSprites).toBe(220);
    expect(b.maxAddArea).toBe(Number.POSITIVE_INFINITY);
    expect(b.maxDamageLabels).toBe(MAX_VISIBLE_LABELS);
    expect(b.glow).toBe(true);
  });

  it("medium nutzt den bestehenden FxSystem-ADD-Flaechen-Deckel (m10-A4)", () => {
    expect(qualityBudgetFor("medium").maxAddArea).toBe(ADD_GLOW_MAX_SCREEN_AREA);
  });

  it("Stufen werden streng monoton reduziert (high >= medium >= low) und low hat Glow aus", () => {
    expect(qualityBudgetFor("high").maxFxSprites).toBeGreaterThanOrEqual(
      qualityBudgetFor("medium").maxFxSprites,
    );
    expect(qualityBudgetFor("medium").maxFxSprites).toBeGreaterThanOrEqual(
      qualityBudgetFor("low").maxFxSprites,
    );
    expect(qualityBudgetFor("high").maxDamageLabels).toBeGreaterThanOrEqual(
      qualityBudgetFor("medium").maxDamageLabels,
    );
    expect(qualityBudgetFor("medium").maxDamageLabels).toBeGreaterThanOrEqual(
      qualityBudgetFor("low").maxDamageLabels,
    );
    expect(qualityBudgetFor("high").maxAddArea).toBeGreaterThanOrEqual(
      qualityBudgetFor("medium").maxAddArea,
    );
    expect(qualityBudgetFor("medium").maxAddArea).toBeGreaterThanOrEqual(
      qualityBudgetFor("low").maxAddArea,
    );
    expect(qualityBudgetFor("low").glow).toBe(false);
    expect(qualityBudgetFor("medium").glow).toBe(true);
  });

  it("unbekanntes Tier faellt auf high zurueck (nie haerter als definiert)", () => {
    // @ts-expect-error Bewusst falscher Typ zur Laufzeit.
    expect(qualityBudgetFor("bananenbrot")).toBe(QUALITY_BUDGETS.high);
  });

  it("Helfer liefern die Budget-Werte", () => {
    expect(glowAreaCapForQuality("high")).toBe(Number.POSITIVE_INFINITY);
    expect(glowAreaCapForQuality("medium")).toBe(ADD_GLOW_MAX_SCREEN_AREA);
    expect(glowSlotCapForQuality("low", 72)).toBe(0);
    expect(glowSlotCapForQuality("high", 72)).toBe(72);
    expect(damageLabelCapForQuality("medium")).toBe(8);
    expect(damageNumbersPerSecFor("low")).toBe(8);
    expect(particlesPerHitFor("low")).toBe(8);
  });
});

describe("M10-android-scale-floor-r2 (K3): Hysterese (nur Stufe, nie Aufloesung)", () => {
  const S = (tier: QualityTier = "high"): QualityState => ({ tier, belowMs: 0, aboveMs: 0 });

  it("Start ist high (erst messen, dann drosseln)", () => {
    expect(initialQualityState()).toEqual({ tier: "high", belowMs: 0, aboveMs: 0 });
  });

  it("senkt NICHT sofort: unter 45 FPS fuer < 3 s bleibt high", () => {
    let s = S();
    for (let i = 0; i < 170; i++) s = stepQuality(s, 42, 17.6); // ~2992 ms
    expect(s.tier).toBe("high");
    s = stepQuality(s, 42, 10); // 3 s ueberschritten
    expect(s.tier).toBe("medium");
    expect(s.belowMs).toBe(0);
  });

  it("senkt nur EINE Stufe pro 3-s-Zeitraum (high -> medium -> low braucht 2x 3 s)", () => {
    let s = S();
    for (let i = 0; i < 200; i++) s = stepQuality(s, 40, 17.6); // ~3,5 s
    expect(s.tier).toBe("medium");
    for (let i = 0; i < 200; i++) s = stepQuality(s, 40, 17.6);
    expect(s.tier).toBe("low");
  });

  it("hebt erst ab 57 FPS nach 12 s AM STUECK: 11,9 s reicht nicht", () => {
    let s = S("low");
    for (let i = 0; i < 700; i++) s = stepQuality(s, 60, 17); // ~11,9 s
    expect(s.tier).toBe("low");
    s = stepQuality(s, 60, 100);
    expect(s.tier).toBe("medium");
  });

  it("Abbruch der 12-s-Folge (Last UNTER 45 dazwischen) setzt den Aufstieg zurueck", () => {
    let s = S("low");
    for (let i = 0; i < 650; i++) s = stepQuality(s, 60, 17); // ~11 s
    expect(s.aboveMs).toBeGreaterThan(0);
    s = stepQuality(s, 42, 100); // unter 45 FPS bricht die >=57-Folge
    expect(s.aboveMs).toBe(0);
    for (let i = 0; i < 720; i++) s = stepQuality(s, 60, 17); // ~12,2 s neu
    expect(s.tier).toBe("medium");
  });

  it("Totzone 45..57 FPS friert beide Timer ein (Fortschritt bleibt)", () => {
    let s = S();
    s = stepQuality(s, 42, 2500);
    expect(s.belowMs).toBe(2500);
    s = stepQuality(s, 50, 100); // Totzone: einfrieren, kein Reset
    expect(s.belowMs).toBe(2500);
    expect(s.aboveMs).toBe(0);
    expect(s.tier).toBe("high");
  });

  it("kein Pumpen: abwechselnd ~2,5 s Last / ~2,5 s Entlastung wechselt nie die Stufe", () => {
    let s = S();
    for (let i = 0; i < 150; i++) s = stepQuality(s, 42, 16.5); // ~2,5 s unter 45 (< 3 s)
    for (let i = 0; i < 150; i++) s = stepQuality(s, 60, 16.5); // ~2,5 s ab 57 (< 12 s)
    for (let i = 0; i < 150; i++) s = stepQuality(s, 42, 16.5);
    for (let i = 0; i < 150; i++) s = stepQuality(s, 60, 16.5);
    expect(s.tier).toBe("high");
  });

  it("Regler-Weg ODER Leere/NaN-FPS: kein Wechsel ohne Beleg", () => {
    let s = S();
    for (let i = 0; i < 400; i++) s = stepQuality(s, NaN, 1000);
    expect(s.tier).toBe("high");
    for (let i = 0; i < 400; i++) s = stepQuality(s, 0, 1000);
    expect(s.tier).toBe("high");
  });

  it("auf der untersten Stufe laeuft belowMs nicht unbegrenzt an (Reviewer-Hinweis)", () => {
    let s = S("low");
    for (let i = 0; i < 400; i++) s = stepQuality(s, 40, 1000);
    expect(s.tier).toBe("low");
    expect(s.belowMs).toBe(0);
  });

  it("Schwellen sind die dokumentierten Konstanten (45/57, 3 s/12 s)", () => {
    expect(QUALITY_LOW_FPS).toBe(45);
    expect(QUALITY_HIGH_FPS).toBe(57);
    expect(QUALITY_LOW_MS).toBe(3000);
    expect(QUALITY_HIGH_MS).toBe(12000);
  });

  it("Qualitaets-Weg ist unabhaengig von RENDER_SCALE: der ADD-Deckel ist nie 'aus' (0)", () => {
    // K2-Invariante: Der Flaechen-Deckel darf 0 nie bedeuten (0 wuerde den
    // Deckel im FxSystem abstellen) — low durosselt auf einen kleinen Wert.
    expect(glowAreaCapForQuality("low")).toBeGreaterThan(0);
    expect(Number.isFinite(glowAreaCapForQuality("low"))).toBe(true);
    expect(QUALITY_ORDER[QUALITY_ORDER.length - 1]).toBe("high");
  });
});
