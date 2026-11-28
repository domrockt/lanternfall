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
  tier: ThermalTier;
  /** Max gleichzeitig aktive grosse Effekt-Sprites. BUDGET-DATEN, noch NICHT
   *  verdrahtet (FxSystem.maxActive bleibt LOD-getrieben) — Folgekarte. */
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
export function qualityBudgetFor(tier: ThermalTier): QualityBudget {
  if (tier === "thermal") return THERMAL_BUDGET;
  return QUALITY_BUDGETS[tier] ?? QUALITY_BUDGETS.high;
}

/**
 * ADD-Glow-Flaechen-Deckel (Device-px) fuer eine Stufe — am Aufrufort in
 * FxSystem direkt anstelle des alten RENDER_SCALE-Deckels. low drosselt die
 * Flaeche zusaetzlich; das Komplettausschalten der Glows laeuft ueber
 * glowSlotCapForQuality (Slot-Deckel 0 -> NORMAL-Fallback).
 */
/**
 * m10-thermal-tier-types: Signatur QualityTier -> ThermalTier. qualityBudgetFor
 * deckt "thermal" zur Laufzeit bereits voll ab (THERMAL_BUDGET) — die
 * Cap-Wrapper tragen das jetzt auch im Typ (reine Typ-Gewinnrate, kein
 * Verhaltensunterschied).
 */
export function glowAreaCapForQuality(tier: ThermalTier): number {
  return qualityBudgetFor(tier).maxAddArea;
}

/**
 * Glow-SLOT-Deckel fuer eine Stufe, kombiniert mit dem LOD-Cap am Aufrufort:
 * low = 0 (kein ADD-Slot -> alle Glows NORMAL-Blend = Glow aus), sonst
 * mind. so offen wie der LOD-Cap. DEBUG-/TEST-HELFER: die Slot-Schaltung im
 * FxSystem frage ueber glowEnabledFor (die Slot-Requests pruefen die Stufe
 * direkt); dieser Deckel ist fuer eine spaere Feinstaffelung reserviert.
 */
export function glowSlotCapForQuality(tier: QualityTier, lodCap: number): number {
  if (!qualityBudgetFor(tier).glow) return 0;
  return Math.max(0, Math.floor(lodCap));
}

/** Ist der ADD-Glow-Pfad in dieser Stufe ueberhaupt aktiv? (low/thermal = nein) */
export function glowEnabledFor(tier: ThermalTier): boolean {
  return qualityBudgetFor(tier).glow;
}

/** Gleichzeitig sichtbare Schadenszahlen fuer eine Stufe (m10-thermal-tier-types: ThermalTier). */
export function damageLabelCapForQuality(tier: ThermalTier): number {
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

/** Fuer Mess-/Debug-Ausgaben: Partikel pro Treffer einer Stufe (m10-thermal-tier-types: ThermalTier). */
export function particlesPerHitFor(tier: ThermalTier): number {
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
    } else if (idx === 0) {
      // Reviewer-Hinweis: auf der untersten Stufe gibt es nichts mehr
      // herunterzunehmen — der Timer bleibt auf 0 (taeuscht sonst in
      // __rbDbg.qualityState Aktivitaet vor, die nie wirkt).
      belowMs = 0;
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

// --- Thermischer Guard (M10-quality-thermal-guard) --------------------------
//
// Haertefall unterhalb der Qualitaets-Regler-Stufe "low": Der stepQuality-
// Regler endet bei "low" — bleibt das Geraet DAUERHAFT ueber der Schwelle
// heiss und fallt trotz "low" unter die Absturz-Schwelle, dreht dieser Guard
// eine zusaetzliche, strengere Stufe auf. AUSSCHLIESSLICH ueber Qualitaets-
// Budgets (weniger FX/ADD-Flaeche/Partikel/Labels) — RENDER_SCALE und
// Aufloesung bleiben unangetastet (Android-Praxisregel 1), keine Asset-/
// Texturpfade im Spiel.

/** Stufen-Erweiterung: "thermal" liegt UNTER "low" (nur dort erreichbar). */
export type ThermalTier = QualityTier | "thermal";

/** Absturz-Schwelle: FPS-Median dauerhaft darunter = thermischer Absturz. */
export const THERMAL_FPS = 30;
/**
 * Laenge des Median-Fensters, das der Aufrufer als `fpsSerie` vorhalten soll
 * (ms). Die Funktion wertet die Serie als Ganzes aus (Median) — die Fenster-
 * fuehrung ist Aufrufer-Verantwortung; diese Konstante dokumentiert, was
 * "ueber N Sekunden" heisst (8 s @ 1 Hz Samples).
 */
export const THERMAL_WINDOW_MS = 8000;
/** Haltefenster: Abstieg erst, wenn der Absturz SO LANG anhaelt (Hysterese). */
export const THERMAL_HOLD_MS = 10000;
/** Erholungszeit AM STUECK ab dieser FPS-Grenze, bevor zurueck auf "low". */
export const THERMAL_RECOVERY_FPS = QUALITY_LOW_FPS;
export const THERMAL_RECOVERY_MS = 20000;

/**
 * Budget der thermischen Stufe — streng hartler als "low" (Last senken statt
 * Aufloesung): FX-Sprites, ADD-Flaeche, Partikel, Schadenszahlen alles unter
 * dem low-Budget, Glow bleibt aus. Referenz: low = 90/2025/8/8/5.
 */
export const THERMAL_BUDGET: Readonly<QualityBudget> = {
  tier: "thermal",
  maxFxSprites: 48,
  maxAddArea: 640,
  particlesPerHit: 4,
  damageNumbersPerSec: 4,
  maxDamageLabels: 3,
  glow: false,
};

/** Zustand des thermischen Guards (rein, ohne Uhr/Phaser). */
export interface ThermalState {
  /** "thermal" waehrend aktiv, sonst die Basis-Stufe des stepQuality-Reglers. */
  tier: ThermalTier;
  /** true = thermischer Haertefall aktiv (nur erreichbar ab Basis-Stufe "low"). */
  active: boolean;
  /** Kumulierte Absturzzeit unter THERMAL_FPS (ms, Ruecksetzen bei Erholung). */
  crashMs: number;
  /** Kumulierte Erholungszeit am Stueck ab THERMAL_RECOVERY_FPS (ms). */
  recoverMs: number;
}

export function initialThermalState(): ThermalState {
  return { tier: "high", active: false, crashMs: 0, recoverMs: 0 };
}

/** Median einer FPS-Serie (leere/ungueltige Serie = NaN, kein Signal). */
function medianOf(serie: readonly number[]): number {
  const xs = serie.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (xs.length === 0) return NaN;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

/**
 * Ein Guard-Schritt. Definition (K1): thermischer Absturz = FPS-Median der
 * Serie dauerhaft unter THERMAL_FPS TROTZ Basis-Stufe "low". Engage erst nach
 * THERMAL_HOLD_MS anhaltendem Absturz; ohne Signal (NaN/leer) bleiben die
 * Timer eingefroren (wie stepQuality in der Totzone). Auf hoher/medium-Stufe
 * greift der Guard NICHT — dort faehrt stepQuality ab (Definition "trotz
 * low"). Kein Flapping (K2): Abstieg erst nach dem Haltefenster, Rueckweg
 * erst nach ununterbrochener Erholungszeit — danach braucht ein neuer Abstieg
 * wieder das volle Haltefenster. Aufloesung/RENDER_SCALE werden nie
 * angefasst.
 */
export function evaluateThermalStep(
  fpsSerie: readonly number[],
  state: ThermalState,
  dtMs: number,
): ThermalState {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const median = medianOf(fpsSerie);
  if (state.active) {
    if (Number.isFinite(median) && median >= THERMAL_RECOVERY_FPS) {
      // Rueckweg nur nach THERMAL_RECOVERY_MS AM STUECK (Hysterese, Muster
      // stepQuality aboveMs): eine Unterbrechung beginnt die Erholung neu.
      const recoverMs = state.recoverMs + dt;
      if (recoverMs >= THERMAL_RECOVERY_MS) {
        return { tier: "low", active: false, crashMs: 0, recoverMs: 0 };
      }
      return { ...state, recoverMs };
    }
    // Erholungsfolge abgebrochen (wieder unter der Schwelle): neu beginnen.
    return { ...state, recoverMs: 0 };
  }
  // Guard nur ab Basis-Stufe "low" (Definition: "trotz LOW-Stufe").
  if (state.tier !== "low") return state;
  if (!Number.isFinite(median)) return state; // kein Signal: Timer einfrieren
  if (median < THERMAL_FPS) {
    const crashMs = state.crashMs + dt;
    if (crashMs >= THERMAL_HOLD_MS) {
      return { tier: "thermal", active: true, crashMs: 0, recoverMs: 0 };
    }
    return { ...state, crashMs };
  }
  return { ...state, crashMs: 0 };
}
