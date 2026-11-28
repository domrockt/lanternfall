/**
 * M10-android-scale-floor-r2 (K3): Qualitaetsstufen statt Aufloesungsregler.
 *
 * Seit K2 rendert kein Codepfad mehr unter die logische Aufloesung
 * (RENDER_SCALE_MAX = 1, Android-Praxisregel 1). Die Laststeuerung macht ein
 * `quality`-Tier (Android-Praxisregel 3): der Regler wechselt nur die STUFE
 * (mit Hysterese), nie die Aufloesung. Stufen liefern feste Budgets:
 * max. FX-Sprites, ADD-Flaeche pro Glow, Partikel pro Treffer,
 * Schadenszahlen/s bzw. gleichzeitig sichtbare Labels, Glow an/aus.
 *
 * Verdrahtet werden ausschliesslich BESTEHENDE Caps (kleinste Aenderung):
 *  - ADD-Glow-Flaechen-Deckel im FxSystem (glowAreaCapForQuality)
 *  - Glow-Slot-Deckel im FxSystem (glowSlotCapForQuality, low = 0 -> NORMAL-Fallback)
 *  - Schadenszahlen-Sichtbar-Cap (damageLabelCapForQuality)
 * Reine Funktionen, ohne Uhr/Phaser (unit-getestet in tests/quality-tier.test.ts).
 */

export type QualityTier = "high" | "medium" | "low";

/** Reihenfolge von der schwächsten zur stärksten Stufe (Index = Tier-Ebene). */
export const QUALITY_ORDER: readonly QualityTier[] = ["low", "medium", "high"] as const;

export interface QualityBudget {
  tier: QualityTier;
  /** Max gleichzeitig aktive grosse Effekt-Sprites (FxSystem maxActive). */
  maxFxSprites: number;
  /** Max ADD-Glow-Device-Pixel-Flaeche pro Sprite (Infinity = offen). */
  maxAddArea: number;
  /** Max Partikel pro Treffer (ParticleSystem-Spawns pro Trefferereignis). */
  particlesPerHit: number;
  /** Schadenszahlen-Emission pro Sekunde (Obergrenze). */
  damageNumbersPerSec: number;
  /** Gleichzeitig sichtbare Schadenszahlen (Schadenzahlen-Sichtbar-Cap). */
  maxDamageLabels: number;
  /** ADD-Glow-Slots an/aus (low = aus: Glows fallen auf NORMAL zurueck). */
  glow: boolean;
}

/**
 * Budgets je Stufe. Referenzwerte: FxSystem maxActive 220 (heute), FxSystem
 * ADD_GLOW_MAX_SCREEN_AREA 9216 Device-px (m10-A4), DamageNumbers
 * MAX_VISIBLE_LABELS 12 (m10-damage-calm). High entspricht dem heutigen
 * Volllaufen bei voller Aufloesung, medium/low reduzieren FUELLRATE
 * (ADD-Flaeche zuerst — der Engpass auf Tile-GPUs), nicht die Aufloesung.
 */
export const QUALITY_BUDGETS: Readonly<Record<QualityTier, QualityBudget>> = {
  high: {
    tier: "high",
    maxFxSprites: 220,
    maxAddArea: Number.POSITIVE_INFINITY,
    particlesPerHit: 24,
    damageNumbersPerSec: 24,
    maxDamageLabels: 12,
    glow: true,
  },
  medium: {
    tier: "medium",
    maxFxSprites: 140,
    maxAddArea: 9216,
    particlesPerHit: 14,
    damageNumbersPerSec: 14,
    maxDamageLabels: 8,
    glow: true,
  },
  low: {
    tier: "low",
    maxFxSprites: 90,
    maxAddArea: 2025,
    particlesPerHit: 8,
    damageNumbersPerSec: 8,
    maxDamageLabels: 5,
    glow: false,
  },
};

/** Budget einer Stufe (mit Rueckfall high bei unbekanntem Tier). */
export function qualityBudgetFor(tier: QualityTier): QualityBudget {
  return QUALITY_BUDGETS[tier] ?? QUALITY_BUDGETS.high;
}

/**
 * ADD-Glow-Flaechen-Deckel (Device-px) fuer eine Stufe — am Aufrufort in
 * FxSystem direkt anstelle des alten RENDER_SCALE-Deckels. low drosselt die
 * Flaeche zusaetzlich; das Komplettausschalten der Glows laeuft ueber
 * glowSlotCapForQuality (Slot-Deckel 0 -> NORMAL-Fallback).
 */
export function glowAreaCapForQuality(tier: QualityTier): number {
  return qualityBudgetFor(tier).maxAddArea;
}

/**
 * Glow-SLOT-Deckel fuer eine Stufe, kombiniert mit dem LOD-Cap am Aufrufort:
 * low = 0 (kein ADD-Slot -> alle Glows NORMAL-Blend = Glow aus), sonst
 * mind. so offen wie der LOD-Cap.
 */
export function glowSlotCapForQuality(tier: QualityTier, lodCap: number): number {
  if (!qualityBudgetFor(tier).glow) return 0;
  return Math.max(0, Math.floor(lodCap));
}

/** Ist der ADD-Glow-Pfad in dieser Stufe ueberhaupt aktiv? (low = nein) */
export function glowEnabledFor(tier: QualityTier): boolean {
  return qualityBudgetFor(tier).glow;
}

/** Gleichzeitig sichtbare Schadenszahlen fuer eine Stufe. */
export function damageLabelCapForQuality(tier: QualityTier): number {
  return qualityBudgetFor(tier).maxDamageLabels;
}

/**
 * Fuer Mess-/Debug-Ausgaben: Schadenszahlen-Emission/s einer Stufe.
 * (Verdrahtung folgt, wenn ein Emissions-Cap existiert — Budget-Wert steht
 * hier bereit, damit Stufenwechsel an einer Stelle definiert sind.)
 */
export function damageNumbersPerSecFor(tier: QualityTier): number {
  return qualityBudgetFor(tier).damageNumbersPerSec;
}

/** Fuer Mess-/Debug-Ausgaben: Partikel pro Treffer einer Stufe. */
export function particlesPerHitFor(tier: QualityTier): number {
  return qualityBudgetFor(tier).particlesPerHit;
}

// --- Hysterese-Regler -------------------------------------------------------

/** Unter dieser FPS-Grenze (3 s lang) wird eine Stufe RUNTERgenommen. */
export const QUALITY_LOW_FPS = 45;
/** Ab dieser FPS-Grenze (12 s lang am Stueck) wird eine Stufe HOCHgenommen. */
export const QUALITY_HIGH_FPS = 57;
export const QUALITY_LOW_MS = 3000;
export const QUALITY_HIGH_MS = 12000;

/** Zustand des Stufen-Reglers (rein, ohne Uhr/Google). */
export interface QualityState {
  tier: QualityTier;
  /** Verweilzeit unter QUALITY_LOW_FPS (ms). */
  belowMs: number;
  /** Verweilzeit am Stueck ab QUALITY_HIGH_FPS (ms). */
  aboveMs: number;
}

/** Start-Stufe: high (wie vor der Karte — erst messen, dann drosseln). */
export function initialQualityState(): QualityState {
  return { tier: "high", belowMs: 0, aboveMs: 0 };
}

function tierIndex(tier: QualityTier): number {
  const i = QUALITY_ORDER.indexOf(tier);
  return i < 0 ? QUALITY_ORDER.length - 1 : i;
}

/**
 * Ein Regler-Schritt: unter 45 FPS fuer 3 s kumulativ -> Stufe runter
 * (Last reduzieren), ab 57 FPS fuer 12 s AM STUECK -> Stufe rauf. Zwischen
 * den Schwellen (Totzone) bleiben beide Timer EINGEFROREN — Last-Jitter um
 * 45 FPS loest keine Wechselkaskade aus (gleiche Semantik wie der alte
 * Teiler-Regler, siehe tests/scale-osc.test.ts). Nur der Wechsel der Stufe,
 * nie der Aufloesung (K2).
 */
export function stepQuality(
  state: QualityState,
  fpsEwma: number,
  dtMs: number,
): QualityState {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const idx = tierIndex(state.tier);
  let { belowMs, aboveMs } = state;
  let tier = state.tier;
  if (Number.isFinite(fpsEwma) && fpsEwma > 0 && fpsEwma < QUALITY_LOW_FPS) {
    belowMs += dt;
    aboveMs = 0;
    if (belowMs >= QUALITY_LOW_MS && idx > 0) {
      tier = QUALITY_ORDER[idx - 1];
      belowMs = 0;
      aboveMs = 0;
    }
  } else if (Number.isFinite(fpsEwma) && fpsEwma >= QUALITY_HIGH_FPS) {
    aboveMs += dt;
    belowMs = 0;
    if (aboveMs >= QUALITY_HIGH_MS && idx < QUALITY_ORDER.length - 1) {
      tier = QUALITY_ORDER[idx + 1];
      belowMs = 0;
      aboveMs = 0;
    }
  }
  // Totzone: beide Timer einfrieren (kein Zweig greift).
  return { tier, belowMs, aboveMs };
}
