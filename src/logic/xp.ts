/** XP-Kurve und Kristall-Größen. */
export type GemSize = "small" | "medium" | "large";

export interface GemMeta {
  size: GemSize;
  value: number;
  /** Palettenindex für Sprite/Fill */
  color: number;
  /** relative Häufigkeit */
  weight: number;
}

export const GEMS: Record<GemSize, GemMeta> = {
  small: { size: "small", value: 2, color: 31, weight: 70 },
  medium: { size: "medium", value: 6, color: 8, weight: 24 },
  large: { size: "large", value: 18, color: 25, weight: 6 },
};

/** Benötigte XP vom aktuellen Level zum nächsten. */
export function xpToNext(level: number): number {
  return 8 + (Math.max(1, level) - 1) * 7;
}

export interface XpState {
  level: number;
  xp: number;
  pendingLevelUps: number;
}

export interface XpResult extends XpState {
  levelsGained: number;
}

/** Wendet XP an und löst ggf. mehrere Level-Ups aus. */
export function applyXp(state: XpState, amount: number): XpResult {
  let level = state.level;
  let xp = state.xp + Math.max(0, amount);
  let gained = 0;
  let guard = 0;
  while (xp >= xpToNext(level) && guard++ < 1000) {
    xp -= xpToNext(level);
    level += 1;
    gained += 1;
  }
  return {
    level,
    xp,
    pendingLevelUps: state.pendingLevelUps + gained,
    levelsGained: gained,
  };
}

export function xpProgress(state: XpState): number {
  const need = xpToNext(state.level);
  return Math.max(0, Math.min(1, state.xp / need));
}
