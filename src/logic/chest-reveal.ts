// ── M10-chest-reveal: Öffnungs-Sequenz (reine Teile) ────────────────────────
//
// Das Öffnen ist ein Kernmoment des Genres und bekommt eine inszenierte
// Sequenz mit klarer Reihenfolge: Aufleuchten (Glanz hoch) → Deckel →
// Lichtstrahl → Münzen/Funken aus der Truhe → Belohnungs-Reveal nacheinander.
// Die Zeiten sind EINE Quelle für Welt-Sequenz (ChestSystem) und Panel — reine
// Funktionen, unit-getestet (tests/chest-reveal.test.ts), ohne Phaser-Import.

export type ChestOpenStepName =
  | "shine"        // Glanz-Animation hoch (Welt + Panel-Strahl-Vorbereitung)
  | "lid"          // Deckel öffnet
  | "beam"         // Lichtstrahl aus der Truhe
  | "burst"        // Münzen-/Funken-Partikel aus der Truhe
  | "reveal"       // Roll-Phase der Belohnungen beginnt
  | "revealSettle" // eine Belohnung settlebt lesbar (Name + Label + Icon)
  | "finish";      // Sequenz zuende (Panel übernimmt/schließt)

export interface ChestOpenStep {
  step: ChestOpenStepName;
  /** Millisekunden nach Öffnung der Truhe. */
  at: number;
  /** Nur bei `revealSettle`: Index der Belohnung (0-basiert). */
  rewardIndex?: number;
}

/** Basiszeiten der Sequenz (ms). Von der bisherigen Panel-Sequenz übernommen — bewährtes Timing, jetzt geprüft und getestet. */
export const CHEST_OPEN_LID_MS = 280;
export const CHEST_OPEN_BEAM_MS = 360;
export const CHEST_OPEN_BURST_MS = 420;
export const CHEST_OPEN_REVEAL_MS = 520;
export const CHEST_SETTLE_BASE_MS = 1450;
export const CHEST_SETTLE_STAGGER_MS = 220;
export const CHEST_FINISH_BASE_MS = 1650;

/**
 * Reveal-Reihenfolge als reine Funktion: aufsteigende Zeiten, Deckel vor
 * Strahl vor Partikeln vor Reveal; die Belohnungen settleben nacheinander
 * (i*220 ms), `finish` liegt nach dem letzten Settle. rewardCount wird auf
 * 1..5 geklemmt (Truhen geben 1/3/5 Belohnungen).
 */
export function chestOpenTimeline(rewardCount: number): ChestOpenStep[] {
  const n = Math.max(1, Math.min(5, Math.round(rewardCount)));
  const steps: ChestOpenStep[] = [
    { step: "shine", at: 0 },
    { step: "lid", at: CHEST_OPEN_LID_MS },
    { step: "beam", at: CHEST_OPEN_BEAM_MS },
    { step: "burst", at: CHEST_OPEN_BURST_MS },
    { step: "reveal", at: CHEST_OPEN_REVEAL_MS },
  ];
  for (let i = 0; i < n; i++) {
    steps.push({ step: "revealSettle", at: CHEST_SETTLE_BASE_MS + i * CHEST_SETTLE_STAGGER_MS, rewardIndex: i });
  }
  steps.push({ step: "finish", at: CHEST_FINISH_BASE_MS + n * CHEST_SETTLE_STAGGER_MS });
  return steps;
}

/** Ein Partikel des Öffnungs-Bursts (deterministisch, kein RNG). */
export interface ChestBurstParticle {
  kind: "coin" | "spark";
  /** Absprungwinkel (Bogenmaß); Münzen fächern nach oben, Funken radial. */
  angle: number;
  /** Distanz in px (Skalierung macht der Aufrufer: Welt vs. Panel). */
  dist: number;
  /** Startverzögerung in ms (gestaffelt, keine Wand). */
  delayMs: number;
  lifeMs: number;
  scale: number;
}

/**
 * Münzen-/Funken-Burst aus der Truhe. Deterministisch über den Index (i*7 /
 * i*5-Streuung wie die bewährten Panel-Münzen), damit GIF-Frames und Screenshots
 * reproduzierbar sind. Münzen: enger Fächer nach oben (Inszenierung "Schatz
 * springt heraus"), Funken: kurze radiale Glitzer (ADD-Blend beim Renderer).
 */
export function chestBurstSpec(coinCount = 16, sparkCount = 8): ChestBurstParticle[] {
  const out: ChestBurstParticle[] = [];
  for (let i = 0; i < coinCount; i++) {
    const t = coinCount > 1 ? (i * 7) % coinCount / (coinCount - 1) : 0.5;
    out.push({
      kind: "coin",
      angle: -Math.PI / 2 + (t - 0.5) * 2.2,
      dist: 70 + t * 90,
      delayMs: (i % 4) * 18,
      lifeMs: 700 + Math.round(t * 350),
      // Ganzzahlige Pixelgrößen (art-director-Korrektur): fx_coin 2x2 → 3 px.
      scale: 1.5,
    });
  }
  for (let i = 0; i < sparkCount; i++) {
    const t = sparkCount > 1 ? (i * 5) % sparkCount / (sparkCount - 1) : 0.5;
    out.push({
      kind: "spark",
      angle: (i / sparkCount) * Math.PI * 2 - Math.PI / 2,
      dist: 26 + t * 22,
      delayMs: 40 + (i % 3) * 24,
      lifeMs: 380 + Math.round(t * 160),
      scale: 1.5,
    });
  }
  return out;
}

// ── M10-chest-reveal: Panel-Layout (Überlappungsfreiheit als reine Funktion) ─

export interface ChestPanelLayout {
  titleY: number;
  subtitleY: number;
  beamY: number;
  iconY: number;
  iconScale: number;
  hintY: [number, number];
}

/** Glyphenhöhe des Bitmap-Fonts in px (GLYPH_H) — Basis der Abstands-Prüfung. */
export const CHEST_PANEL_GLYPH_H = 7;

/**
 * Y-Positionen des Truhen-Panels (Spielpixel). Vorher saß der Untertitel mit
 * 2 px unter der Titel-Unterkante und 5 px über dem Icon gequetscht (belegt in
 * shots/m10-chest-reveal-before.json, beide Viewports). Jetzt:
 * - Untertitel eine Zeile tiefer (harter Abstand ≥ 5 px zu Titel und Icon),
 * - Truhen-Icon ganzzahlig skaliert (3.0 → 48 px) und positioniert (Pixel-Grid,
 *   art-director-Korrektur), Evo-Hinweiszeilen unter dem Icon, über den Slots.
 * Alle vertikalen Abstände zwischen Titel / Untertitel / Icon / Hinweis
 * sind > 0 (geprüft in tests/chest-reveal.test.ts und per Pixel-Messung).
 * UI.ts ist für die Lane Tabu — ChestSystem setzt diese Positionen zur
 * Laufzeit auf die existierenden Panel-Objekte (applyPanelFix).
 */
export function chestPanelLayout(oy: number): ChestPanelLayout {
  return {
    titleY: 38 + oy,
    subtitleY: 58 + oy,
    beamY: 74 + oy,
    iconY: 94 + oy,
    iconScale: 3,
    hintY: [124 + oy, 132 + oy],
  };
}

/** Nach dieser ms-Zahl ist die Welt-Sequenz zuende und die Überreste werden freigegeben. */
export const CHEST_OPENING_TTL_MS = 1600;
