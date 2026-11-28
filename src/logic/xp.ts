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
  // m10-gem-value-reading: Farb-Rampe Silber -> Gold -> Rubin, Kernfarben aus
  // der Nacht-/Gold-Palette. Ist-Messung (Chaos-Frame, 305 Gem-Drops):
  // marshLight-Grün kollidierte zu 7,43 % der Frame-Pixel mit der Bog-Horde;
  // r2 fogBlue wurde an der Nachher-Messung verworfen (29,45 % Boden-Kollision,
  // RGB-Dist zum marsh-Boden nur 39,6); bone liegt bei 2,24 % (je-Stufe-
// Messung, gem-reading-after.json). Paarweise
  // Deltas 137,4 / 154,1 / 197,7 (Schwelle 120, Guard-Test gem-value-reading).
  small: { size: "small", value: 2, color: 10, weight: 70 },
  medium: { size: "medium", value: 6, color: 20, weight: 24 },
  large: { size: "large", value: 18, color: 25, weight: 6 },
};

/** Kern-/Highlight-Farbe je Wertstufe (m10-gem-value-reading). Die Gem-
 *  Texturen (SPRITE_GRIDS.gem_*) malen exakt diese Indizes; der Guard-Test
 *  prüft Textur gegen Rampe, paarweise Deltas >= 120 und 0 Off-Palette.
 *  sparkle = 1-3 px Glanz in candleWhite/lanternWhite ( hebt das Gem über
 *  Glow-/Brand-Decals und liest sich auch im LOD-Dim). */
export const GEM_VALUE_RAMP: Record<GemSize, { core: number; highlight: number; sparkle?: number }> = {
  // r3: fogBlue kollidierte zu 29,45 % des Chaos-Frames mit dem Moor-Boden
  // (RGB-Dist marsh<->fogBlue 39,6, gem-reading-after.json). bone = Silber-
  // Ende der Rampe: Luminanz 193, keine exakte Gegnerfarbe, 2,24 % Kollision
  // (je-Stufe-Messung).
  small: { core: 10, highlight: 12, sparkle: 13 }, // bone / candleWhite / lanternWhite — Silber, häufig
  medium: { core: 20, highlight: 21, sparkle: 13 }, // amber / lantern / lanternWhite — Gold, mittel
  large: { core: 25, highlight: 26 }, // crimson / hotRed — Rubin, selten
};

/** Deterministische Zuordnung XP-Wert -> Stufe (Kern der Merge-Semantik,
 *  bitgleich zu der bisherigen Inline-Logik in mergeGemValues). */
export function gemStageForValue(value: number): GemSize {
  return value >= GEMS.large.value ? "large" : value >= GEMS.medium.value ? "medium" : "small";
}

/**
 * Benötigte XP vom aktuellen Level zum nächsten.
 * M6-Balance: früh günstig (damit der 5-min-Boss nicht mit Level 6 kommt),
 * im Verlauf quadratisch teurer (natürlicher 30-min-Run landet bei Level
 * 25–40 statt bei ~147 wie mit dem M1-Rohbau 8 + 7/Level).
 *
 * M10-Balance: ab Level 25 zusätzlicher quadratischer Aufschlag. Die
 * Kill- und Gem-Menge der dichten 960x540-Viewports liefert roh bis ~39k XP;
 * ohne Aufschlag wäre bei vollständigem Einsammeln Level 47+ möglich (alter
 * A5-Ausreißer). Level 1–25 bleibt exakt unverändert, damit der frühe
 * Spielfluss und die 5-Minuten-Boss-Kurve gleich bleiben.
 *
 * M10-Lane level-target-balance: ab Level 28 ein zweiter Endgame-Aufschlag.
 * Die God-Modus-Ist-Messung (shots/m10-level-target-before.json, 6 Läufe,
 * Seeds 101/202/404 × kael/mira) sammelt bis ~55k XP und landete bei Level
 * 42–44, also 4/6 Läufe über dem Zielband [25, 40]. Der Multiplikator wurde
 * per Suchlauf (K ∈ 0..60, Kriterium: alle God-XP-Obergrenzen → Level ≤ 40,
 * alle No-God-Referenzen 6,3k–10,2k XP → Level ≥ 25) gewählt: K = 40 ergibt
 * God-Level 35–39 und hält den No-God-Korridor (balance-kael, Level 27–30)
 * auf 27–29. Level 1–27 bleibt bitgleich. Gegnerwerte (HP/Damage) unberührt.
 */
export const XP_ENDGAME_START_N = 26; // n = level - 1; n > 26 ⇒ ab Level 28
export const XP_ENDGAME_MULT = 40;

export function xpToNext(level: number): number {
  const n = Math.max(1, level) - 1;
  const late = n > 24 ? 10 * (n - 24) * (n - 24) : 0;
  const endgame =
    n > XP_ENDGAME_START_N
      ? XP_ENDGAME_MULT * (n - XP_ENDGAME_START_N) * (n - XP_ENDGAME_START_N)
      : 0;
  return 8 + Math.round(1.1 * n * n) + late + endgame;
}

/** Kumulatives XP-Budget, um `level` zu erreichen (Start auf Level 1, 0 XP). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 1; l < Math.max(1, level); l++) total += xpToNext(l);
  return total;
}

/** Umkehrung: höchstes Level, das mit `totalXp` erreichbar ist. */
export function levelForXp(totalXp: number, startLevel = 1): number {
  let level = Math.max(1, startLevel);
  let xp = Math.max(0, totalXp);
  let guard = 0;
  while (xp >= xpToNext(level) && guard++ < 10000) {
    xp -= xpToNext(level);
    level += 1;
  }
  return level;
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
