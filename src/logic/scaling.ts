/** Werte-Skalierung über die 30-Minuten-Run-Zeit + Director-Helfer. */

export function enemyHpScale(elapsedSeconds: number, tier: number): number {
  const t = Math.max(0, elapsedSeconds);
  // M6-Balance: flacherer Frühverlauf (Bot soll bis 20–28 min kommen), im
  // Endgame weiterhin deutlich skalierend.
  return 1 + t / 480 + tier * 0.10 + Math.pow(t / 900, 1.35) * 0.50;
}

export function enemyDamageScale(elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds);
  // M6-Balance: Kontaktschaden steigt langsamer; Gefahr kommt aus Masse,
  // Mechaniken und Projektilen, nicht aus frühem Chip-Schaden.
  return 1 + t / 5000 + Math.pow(t / 5000, 2) * 0.35;
}

/** Gegner werden im Lauf etwas flinker, aber gedeckelt (+12 %). */
export function enemySpeedScale(elapsedSeconds: number): number {
  const t = Math.max(0, elapsedSeconds);
  return 1 + Math.min(0.12, (t / 1800) * 0.12);
}

/** Elite-Chance pro normalem Spawn ab Minute 2, steigt bis 10 %. */
export function eliteChance(minute: number): number {
  if (minute < 2) return 0;
  return Math.min(0.1, 0.015 + (minute - 2) * 0.0035);
}

/** Gleichmäßig über die Run-Zeit wachsende Elite-Spawn-Welle: Minuten 4,10,16,22,28. */
export function isEliteMinute(minute: number): boolean {
  return minute >= 4 && minute % 6 === 4;
}

/** M8: Referenzfläche der M6-Balance (16:9 bei 360p). */
export const BASE_VIEW_AREA = 640 * 360;

/**
 * M8: Sichtflächen-Faktor gegenüber 640x360. Breite Formate (780x360 = 1,22x)
 * bekommen proportional mehr Gegner, damit sie nicht leerer wirken; schmale
 * 4:3-Formate bekommen etwas weniger. Gedeckelt auf 0,75..1,5.
 */
export function viewAreaFactor(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  return Math.max(0.75, Math.min(1.5, (width * height) / BASE_VIEW_AREA));
}

/**
 * M8: Spawnrate-Faktor. Breite Formate bekommen etwas mehr Nachschub, aber
 * nur mit halber Flächen-Wurzel, damit der M6-Überlebenskorridor hält
 * (780x360: +10,5 % Rate statt +21,9 %; der Deckel skaliert voll).
 */
export function spawnRateFactor(width: number, height: number): number {
  const base = Math.sqrt(viewAreaFactor(width, height));
  // M8-Balance: breite Formate bekommen dank groesserem Waffenradius ohnehin
  // mehr Kontrolle; die Spawnrate wird dort um 30 % gedrosselt, damit der
  // M6-Ueberlebenskorridor haelt (780x360: 0,94 statt 1,10).
  return width > 640 ? base * 0.85 : base;
}

/**
 * Maximal gleichzeitig aktive Gegner für den normalen Run. M6-Balance:
 * gleichmäßiger Anstieg bis Deckel 360 (Minute ~20) auf 640x360; M8 skaliert
 * den Deckel mit der sichtbaren Fläche (780x360 ~ 439, harte Obergrenze 500).
 */
export function maxActiveEnemies(
  elapsedSeconds: number,
  width = 640,
  height = 360,
): number {
  const minute = Math.floor(Math.max(0, elapsedSeconds) / 60);
  const base = 100 + minute * 13;
  return Math.min(500, Math.round(Math.min(360, base) * viewAreaFactor(width, height)));
}

/** M8: Waffen-/AoE-Reichweite an die View-Breite anpassen. Breite Formate
 *  (780/860) bekommen bis +30 % Radius, damit Flächenwaffen nicht nutzlos
 *  klein wirken; 640x360 bleibt die Referenz (Faktor 1). */
export function weaponRangeFactor(width: number, _height: number): number {
  if (!(width > 0)) return 1;
  return Math.max(1, Math.min(1.3, width / 640));
}

/** M8: Recycle-Abstand knapp außerhalb der View-Diagonale (mind. 340 px).
 *  Umkreisradius = halbe Diagonale; damit liegt der Punkt in JEDEM Winkel
 *  sicher außerhalb des Rechtecks (alte Gegner verschwinden nie sichtbar). */
export function recycleDistance(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 340;
  return Math.max(340, Math.ceil(Math.hypot(width, height) / 2) + 40);
}

/** M8: Ring-/Stream-Spawnradius juste außerhalb der sichtbaren Fläche.
 *  Umkreisradius (halbe Diagonale) + Rand: in jedem Winkel außerhalb. */
export function spawnRingRadius(width: number, height: number, extra = 20): number {
  if (!(width > 0) || !(height > 0)) return 300;
  return Math.ceil(Math.hypot(width, height) / 2) + Math.max(0, extra);
}

/** M8: Boss erscheint sichtbar, aber nicht auf dem Spieler; mit der Hoehe skaliert.
 *  0,4 * kuerzere Kante = 144 px bei 360er-Hoehe, also innerhalb des Views. */
export function bossSpawnDistance(width: number, height: number): number {
  const shorter = Math.min(width, height);
  return Math.max(130, Math.round(shorter * 0.4));
}

/** Ferne, alte Gegner dürfen recycelt werden (kein Kill, kein Drop). */
export function shouldRecycle(
  ageSeconds: number,
  distanceToPlayer: number,
  elite: boolean,
  boss = false,
  minDistance = 340,
): boolean {
  return !elite && !boss && ageSeconds > 45 && distanceToPlayer > minDistance;
}

/** Ältesten fernen Gegner finden (für Cap-Recycling). */
export function pickRecycleIndex<
  T extends { age: number; x: number; y: number; elite: boolean; boss?: boolean },
>(list: readonly T[], playerX: number, playerY: number, minDistance = 340): number {
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const d = Math.hypot(e.x - playerX, e.y - playerY);
    if (!shouldRecycle(e.age, d, e.elite, e.boss, minDistance)) continue;
    const score = e.age + d / 40;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Boss erscheint bei 05:00/10:00/15:00/20:00/25:00 und 30:00 (Endboss). */
export function bossSpawnSecond(index: number): number {
  return (index + 1) * 5 * 60;
}

/** Dämmerungs-Overlay läuft 3,2 s, danach Results. */
export const DAWN_DURATION = 3.2;
export function dawnFinished(timerSeconds: number): boolean {
  return timerSeconds > DAWN_DURATION;
}

/** Endboss startet bei 30:00, der Run endet erst mit seinem Tod (Sieg). */
export const FINAL_BOSS_AT = 30 * 60;

/**
 * M10: Frame-Budget-Regler gegen den Endgame-FPS-Einbruch. Reine Funktion,
 * deterministisch ohne Renderer/Zeitquelle — der Aufrufer liefert die gemessene
 * Frame-Zeit. Ziel ist **nicht** ein globaler Gegner-Deckel: der Regler greift
 * nur, wenn die Frame-Zeit laenger als 1 s ueber 19,2 ms (16,6 ms + 15 %) liegt,
 * senkt dann das aktive Gegner-Ziel um hoechstens 10 %/s bis zur Untergrenze
 * 320 und erholt sich bei < 15 ms mit 1-s-Hysterese wieder bis zum ursprueng-
 * lichen Ziel. Ohne Ueberlast bleibt das Default-Ziel unveraendert.
 */
export interface FrameBudgetState {
  enabled: boolean;
  /** Anteil des Deckels, den der Regler aktuell zulaesst (0..1). */
  ratio: number;
  /** Unabgesenktes Ziel (aus maxActiveEnemies bzw. Mess-Soll). */
  ceiling: number;
  /** Sekunden durchgehend ueber der Hoch-Schwelle. */
  overSeconds: number;
  /** Sekunden durchgehend unter der Tief-Schwelle. */
  underSeconds: number;
}

export const FRAME_BUDGET_HIGH_MS = 19.2;
export const FRAME_BUDGET_LOW_MS = 15;
export const FRAME_BUDGET_MIN_ACTIVE = 320;
export const FRAME_BUDGET_DROP_FRACTION_PER_S = 0.10;
export const FRAME_BUDGET_RECOVER_FRACTION_PER_S = 0.05;
export const FRAME_BUDGET_HOLD_SECONDS = 1;

export function createFrameBudget(ceiling: number, enabled = true): FrameBudgetState {
  return { enabled, ratio: 1, ceiling: Math.max(1, Math.round(ceiling)), overSeconds: 0, underSeconds: 0 };
}

/**
 * Ein Messschritt (z. B. ein echtes Frame). `frameMs` ist die gemessene
 * Frame-Zeit, `dtSeconds` die reale Dauer dieses Frames. Zwischen 15 und
 * 19,2 ms passiert nichts (Hysterese-Band); Timer werden nur ausserhalb
 * fortgeschrieben. Die Untergrenze 320 wird als Verhaeltnis zum Deckel
 * abgebildet, damit ein wachsender Frueh-Deckel (<320) den Regler nicht
 * kuenstlich ausbremst.
 */
export function stepFrameBudget(
  state: FrameBudgetState,
  frameMs: number,
  dtSeconds: number,
  ceiling?: number,
): FrameBudgetState {
  if (!state.enabled) return state;
  const ceil = Math.max(1, Math.round(ceiling ?? state.ceiling));
  const floorRatio = Math.min(1, FRAME_BUDGET_MIN_ACTIVE / ceil);
  // Aussergewoehnlich lange Frames (Tab-Wechsel, GC) nicht unbegrenzt zaehlen.
  const dt = Math.max(0, Math.min(0.1, dtSeconds));
  let ratio = Math.max(floorRatio, Math.min(1, state.ratio));
  let over = state.overSeconds;
  let under = state.underSeconds;

  if (frameMs > FRAME_BUDGET_HIGH_MS) {
    under = 0;
    over += dt;
    if (over > FRAME_BUDGET_HOLD_SECONDS) {
      ratio = Math.max(floorRatio, ratio - ratio * FRAME_BUDGET_DROP_FRACTION_PER_S * dt);
    }
  } else if (frameMs < FRAME_BUDGET_LOW_MS) {
    over = 0;
    under += dt;
    if (under > FRAME_BUDGET_HOLD_SECONDS) {
      ratio = Math.min(1, ratio + FRAME_BUDGET_RECOVER_FRACTION_PER_S * dt);
    }
  }
  // Zwischenband (15..19,2 ms): Timer einfrieren, kein Eingriff.

  return { enabled: state.enabled, ratio, ceiling: ceil, overSeconds: over, underSeconds: under };
}

/** Aufrufer-Helfer: ganzzahliges aktives Gegner-Ziel aus dem Regler. */
export function frameBudgetTarget(state: FrameBudgetState): number {
  const ceil = Math.max(1, Math.round(state.ceiling));
  const floor = Math.min(FRAME_BUDGET_MIN_ACTIVE, ceil);
  return Math.max(floor, Math.min(ceil, Math.round(ceil * state.ratio)));
}
