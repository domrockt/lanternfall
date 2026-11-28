/**
 * M5-LOD: Effekt-Dichte an Gegnerlast anpassen. Reine Funktion, unit-getestet.
 * Schwelle laut Brief: > 400 Gegner → Partikel-Cap, Trails aus, Damage-Summen.
 */
export interface LodState {
  enemies: number;
  fxCap: number;
  particleCap: number;
  trails: boolean;
  damageAggregate: boolean;
  gemCap: number;
  /** Anzeige in Debug/HUD. */
  level: "full" | "reduced" | "minimal";
}

/** M6: Effekt-Alpha je LOD-Stufe (Endgame lesbar halten).
 * M10-vfx-restore Stufe 1 (Lane m10-lod-min-restore): minimal 0,5 → 0,65
 * (A7-Restmangel "verwaschen"; Near-White-Gate ≤ 4,16 %, siehe docs/lanes/
 * m10-lod-min-restore.md). Kette bleibt monoton: 0,65 < 0,72 < 1. */
export function fxAlphaFor(level: LodState["level"]): number {
  return level === "minimal" ? 0.65 : level === "reduced" ? 0.72 : 1;
}

export const LOD_THRESHOLD = 400;
export const LOD_REDUCED_THRESHOLD = 250;

/**
 * M10-Ambient: Glühwürmchen/Nebel sind bildschirmverankerte ADD/NORMAL-Sprites.
 * Im Endgame brechen sie das Batching (m10-perf-recovery, c0f56d5). Die Glow-Zahl
 * wird deshalb an die Gegnerlast gekoppelt; der Nebel bleibt als ruhiger Layer.
 */
export interface AmbientBudget {
  /** Sichtbare ADD-Glühwürmchen (max. 24). */
  glow: number;
  /** Sichtbare NORMAL-Nebelbänder (max. 3). */
  fog: number;
  /** Update-Rate der Ambient-Animation in Hz. */
  updateHz: number;
}

export const AMBIENT_GLOW_MAX = 24;
export const AMBIENT_FOG_MAX = 3;

export function ambientBudgetFor(enemies: number): AmbientBudget {
  const n = Math.max(0, Math.floor(enemies));
  if (n >= 360) return { glow: 0, fog: 1, updateHz: 15 };
  if (n >= 250) return { glow: 0, fog: 1, updateHz: 30 };
  return { glow: AMBIENT_GLOW_MAX, fog: AMBIENT_FOG_MAX, updateHz: 60 };
}

/** Anzahl Blend-Batches, die der Ambient-Layer im Idealfall kostet (Fog+NORMAL, Glow+ADD). */
export function ambientBatchCount(budget: AmbientBudget): number {
  return (budget.fog > 0 ? 1 : 0) + (budget.glow > 0 ? 1 : 0);
}

/**
 * m10-props-always-visible K3: Hysterese für die Ambient-Budgets. Die
 * Ambient-Partikel (Glühwürmchen/Nebel) bleiben die EINZIGEN lastabhängigen
 * Objekte — aber nie hart An/Aus: Abstieg erst ab `off` Gegnern, Rückkehr
 * erst wenn die Gegnerzahl das Hysterese-Band unterschreitet (`on`-Schwelle).
 * Dadurch kann Pendeln um die Schwelle die Stufe nicht mehr flappen lassen;
 * der sichtbare Übergang ist zusätzlich im GroundRenderer eingeblendet
 * (Alpha-Rampe), nicht umgeschaltet.
 */
export const AMBIENT_HYSTERESIS_BAND = 40;

/** Abstiegs-/Rückkehr-Schwellen, absteigend geprüft (updateHz = Kennung der Stufe). */
const AMBIENT_STEPS: ReadonlyArray<{ off: number; on: number; budget: AmbientBudget }> = [
  { off: 360, on: 360 - AMBIENT_HYSTERESIS_BAND, budget: { glow: 0, fog: 1, updateHz: 15 } },
  { off: 250, on: 250 - AMBIENT_HYSTERESIS_BAND, budget: { glow: 0, fog: 1, updateHz: 30 } },
];

const AMBIENT_FULL: AmbientBudget = { glow: AMBIENT_GLOW_MAX, fog: AMBIENT_FOG_MAX, updateHz: 60 };

/**
 * Ein Ambient-Budget-Schritt mit Hysterese: `current` ist das zuletzt
 * angewendete Budget (Kennung über updateHz). Abstieg sofort bei enemies >= off;
 * Rückkehr nur, wenn enemies < on (Band). Kaputte Eingaben liefern das
 * volle Budget wie ambientBudgetFor.
 */
export function ambientBudgetWithHysteresis(current: AmbientBudget, enemies: number): AmbientBudget {
  const n = Math.max(0, Math.floor(enemies));
  if (!Number.isFinite(enemies)) return AMBIENT_FULL;
  // Rückkehr prüfen, bevor der Abstieg greift: Wer schon tiefer gestuft ist,
  // kommt nur über die on-Schwelle wieder hoch (Flapping-Schutz).
  for (const step of AMBIENT_STEPS) {
    if (current.updateHz === step.budget.updateHz) {
      // Wir sind auf dieser Stufe: über die on-Schwelle zurück auf voll,
      // ab der tieferen off-Schwelle weiter runter, sonst bleiben.
      const deeper = AMBIENT_STEPS.find((s) => s.off > step.off);
      if (n < step.on) return AMBIENT_FULL;
      if (deeper && n >= deeper.off) return deeper.budget;
      return step.budget;
    }
  }
  // Volle Stufe aktiv: normal absteigen.
  for (const step of AMBIENT_STEPS) {
    if (n >= step.off) return step.budget;
  }
  return AMBIENT_FULL;
}

/**
 * Weiche Überblendung (K3): ein sichtbarer Ambient-Zähler ("Shown") läuft
 * mit begrenzter Rate auf das Budget-Ziel — der Übergang ist eine Alpha-Rampe
 * über ~2 s, kein hartes An/Aus. Rein, unit-getestet.
 */
export function ambientShownStep(
  current: number,
  target: number,
  ratePerSec: number,
  dtSec: number,
): number {
  const rate = Math.max(0, ratePerSec) * Math.max(0, Number.isFinite(dtSec) ? dtSec : 0);
  const d = target - current;
  if (!Number.isFinite(current)) return target;
  if (Math.abs(d) <= rate) return target;
  return current + Math.sign(d) * rate;
}

/** Fade-Raten: 24 Glühwürmchen faden in ~2,4 s, 3 Nebelbänder in ~2 s. */
export const AMBIENT_GLOW_FADE_PER_SEC = 10;
export const AMBIENT_FOG_FADE_PER_SEC = 1.5;

/**
 * M10-props-always-visible (Dom 2026-11-28): Der Dichte-LOD für Props wurde
 * ENTFERNT. Vorher: >=150 Gegner -> Deko aus, >=200 -> nur Laternen; die
 * Gegnerzahl pendelt im Endgame um die Schwellen -> Props flackerten im
 * Sekundentakt (Beleg ~/games/.evidence/m10-props-always-visible/before.json,
 * 8 Tier-Wechsel in 12 s). Lehre: Welt-Objekte nie per LOD verstecken —
 * Flackern ist schlimmer als ein paar FPS. Die Funktion bleibt als
 * Single-Source "alles sichtbar" (Tier 2) erhalten, damit kein Aufrufer
 * versehentlich wieder einen Tier-Layer einführt.
 */
/** Hoechster sichtbarer Prop-Tier: IMMER 2 = alle Props/Schatten/Glows sichtbar. */
export function propDensityMaxTier(_enemies: number): 0 | 1 | 2 {
  return 2;
}

export function lodFor(enemies: number, pressure = false): LodState {  const n = Math.max(0, Math.floor(enemies));
  // Endboss-Kampf: auch bei (kurzzeitig) wenigen Gegnern viele Evolutions-VFX,
  // Projektile und Warnflaechen. Eine Stufe hoeher halten die 55 FPS.
  const boost = pressure ? 1 : 0;
  if (n > LOD_THRESHOLD) {
    return { enemies: n, fxCap: 60, particleCap: 100, trails: false, damageAggregate: true, gemCap: 90, level: "minimal" };
  }
  if (n > LOD_REDUCED_THRESHOLD || boost > 0) {
    const minimal = n > LOD_REDUCED_THRESHOLD && boost > 0;
    return minimal
      ? { enemies: n, fxCap: 60, particleCap: 100, trails: false, damageAggregate: true, gemCap: 90, level: "minimal" }
      : { enemies: n, fxCap: 90, particleCap: 140, trails: false, damageAggregate: true, gemCap: 140, level: "reduced" };
  }
  return { enemies: n, fxCap: 180, particleCap: 280, trails: true, damageAggregate: false, gemCap: 180, level: "full" };
}
