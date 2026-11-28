import Phaser from "phaser";
import { PAL } from "../palette";
import type { QualityTier } from "../logic/quality";

/**
 * Bake von Telegraph-Disc-/-Ring-Texturen in Sprite-Pixelgroesse (B3-Fix, Lane
 * m10-chaos-fix-hazard-disc).
 *
 * Befund (docs/lanes/m10-chaos-legibility.md, B3, art-director FAIL/Major): der alte
 * "telegraph_disc" ist eine 64-px-Canvas-Scheibe (weiche Alpha-Fuellung + Dash-Ring), die in
 * Hazards.ts mit radius/30 (>1) skaliert wurde — gestapelte translucente Scheiben bilden
 * milchige Felder, verdecken Terrain/Gegner und sind nicht als Gefahr lesbar ("harte
 * 1-px-Sprites unten, Luftbrause oben").
 *
 * Fix: jede Disc/jeder Ring wird in EXAKTER Sprite-Pixelgroesse gebacken (Texturseite =
 * Radius in Spielpixeln, Draw-Scale immer 1) und rein gerastert:
 *   - 2-px-Konturband am Radius (volle Gefahr-Farbe via Tint),
 *   - flaechig halbtransparente Fuellung (Alpha im Bake; seit Raster-Fix kein Schachbrett mehr),
 *   - 1-px-Dither-Uebergangsband nur am Rand, sonst binaeres Muster-Verbot auf Flaechen.
 * Die Textur ist hell/neutral gebacken; der Tint in Hazards.ts faerbt Kontur (hell -> volle
 * Gefahr-Farbe) und Fuellung (mittel -> dunkler Ton derselben Farbe).
 *
 * Warnlogik/Draw-Pfad in Hazards.ts bleiben bitgleich (Puls, Depth, Blend) — reine Optik.
 * Nicht-Telegraph-Nutzung von "ring_burst" (Impact-Ring, kurzlebig) ist bewusst unveraendert.
 *
 * Polish-Lane m10-hazard-disc-polish (2026-11-28, Nachbesserungen aus der art-director-Abnahme
 * von 3fa01eb):
 *   - K2a/K2b: Kontur via round(d)-Band, radial konstant 2 px, Uebergangsband am Innenrand.
 *   - K3: ab 5 gleichzeitig warnenden Disc-Hazards Key-Suffix "_s1" (ruhigere Stapel-Fuellung).
 *
 * Raster-Fix (Lane m10-hazard-disc-raster, 2026-11-28, Argus-Sichtung zu 45c198d): das
 * regelmaessige Schachbrett-"Fliegengitter" ueber der Disc-Flaeche ist raus. Neu (Regel
 * Dom/Claude 08:15Z): Fuellung **flaechig halbtransparent** (Alpha im Bake, keine Dither-Flaeche),
 * Dither nur als 1-px-Uebergangsband am Rand (round(d)=r-2), Kontur weiter 2 px voll. Die
 * Stapel-Stufe senkt nur die Fuell-Alpha (0.40 -> 0.28), nicht mehr die Dither-Frequenz.
 * Draw-Scale bleibt 1 (eine Pixelgroesse).
 */

/** Fuellung: dunkler Warnton — mit Tint dunkler Ton der Gefahr-Farbe (hellt nie auf). */
export const DISC_FILL_I = 15; // emberDark
/** Kontur/Band: fast-weiß — mit Tint volle Gefahr-Farbe. */
export const DISC_CONTOUR_I = 13; // lanternWhite
/** Maskenwert fuer transparent. */
export const MASK_CLEAR = 255;

/** Fuellstufe der Disc: 0 = Basis-Alpha, 1 = Stapel ab Schwelle (ruhiger, niedrigere Alpha). */
export type DiscFillStage = 0 | 1;
/** Ab so vielen gleichzeitig warnenden Disc-Hazards greift Fuellstufe 1 (deterministisch). */
export const DISC_STACK_THRESHOLD = 5;
/** Fuell-Alpha der Disc-Flaeche (flaechig halbtransparent, kein Raster): Basis und Stapel-Stufe. */
export const DISC_FILL_ALPHA = 0.4;
export const DISC_FILL_ALPHA_STACKED = 0.28;
/** Fuell-Alpha je Stapel-Stufe (Index = DiscFillStage). */
export const DISC_FILL_ALPHA_BY_STAGE: readonly [number, number] = [
  DISC_FILL_ALPHA, DISC_FILL_ALPHA_STACKED,
];

/**
 * Deterministische Stapel-Regel: ab `DISC_STACK_THRESHOLD` gleichzeitig warnenden Disc-Hazards
 * Fuellstufe 1, darunter (und bei fehlender/ungueltiger Angabe) Stufe 0. Reine Funktion.
 */
export function fillStageForStacks(stacks: number): DiscFillStage {
  if (!Number.isFinite(stacks) || stacks < DISC_STACK_THRESHOLD) return 0;
  return 1;
}

/**
 * Sprite-Radius in Spielpixeln: ganzzahlig, geklemmt auf 8..160 (gruender Teleport-Marker
 * bis Summon-Ring; alles darueber gab es im Spiel nicht). Reine Funktion.
 */
export function quantizedRadius(radius: number): number {
  if (!Number.isFinite(radius)) return 8;
  return Math.max(8, Math.min(160, Math.round(radius)));
}

// --- m10-hazard-tex-cap (K2): Textur-Cap ueber grobes Raster --------------------------
//
// Bedarfsmeldung m10-heap-regression-fix (2026-11-28): hazard_disc/ring/beam-Canvases
// werden pro Radius bzw. Laenge gebacken und nie freigegeben — der einzige ungebundene
// Wachstumsmechanismus im 30-min-Lauf (~25 neue Canvases; 1-px-Quantisierung erzeugt
// Nachbar-Keys wie r22/r24, l312/l320, l832/l840). Fix: KEINE LRU-Eviction (ein
// textures.remove() wuerde laufende Sprites anderer Hazards brechen), sondern die
// Textur-Spezifikation auf ein grobes 16-px-Raster ABRUNDEND quantisieren — analog zur
// bestehenden Strahl-Regel "Textur nie laenger als der Treffer-Strahl". Warn-Logik und
// Treffer (hazard.radius = opts.radius in Hazards.ts) bleiben bitgleich; die gezeichnete
// Warn-Geometrie weicht um maximal TEX_QUANT_STEP-1 = 15 px ab (Quantisierungstoleranz
// laut Lane-Briefing). Obergrenzen damit hart gebunden:
//   Disc:  11 Radien x 2 Fuellstufen = 22, Ring: 11, Strahl: 65 Laengen x 2 = 130
//   -> max. 163 Hazard-Canvases, unabhaengig von Spieldauer/Seed.

/** Rasterweite der Textur-Quantisierung (Radius und Strahl-Laenge) in Spielpixeln. */
export const TEX_QUANT_STEP = 16;
/** Klemme der Textur-Quantisierung fuer Radien (wie quantizedRadius). */
export const TEX_RADIUS_MIN = 8;
export const TEX_RADIUS_MAX = 160;
/** Klemme der Textur-Quantisierung fuer Strahl-Laengen (wie quantizedBeamLength). */
export const TEX_BEAM_MIN = 8;
export const TEX_BEAM_MAX = 1024;

/**
 * Textur-Radius auf dem 16-px-Raster: abrundend (Textur nie groesser als die
 * Warn-Geometrie), geklemmt auf 8..160. Reine Funktion; determiniert den Bake-Key,
 * nicht die Treffergeometrie.
 */
export function texQuantizedRadius(radius: number): number {
  if (!Number.isFinite(radius)) return TEX_RADIUS_MIN;
  return Math.max(
    TEX_RADIUS_MIN,
    Math.min(TEX_RADIUS_MAX, Math.floor(radius / TEX_QUANT_STEP) * TEX_QUANT_STEP),
  );
}

/**
 * Textur-Strahl-Laenge auf dem 16-px-Raster: abrundend, geklemmt auf 8..1024. Reine
 * Funktion; determiniert den Bake-Key, nicht den Treffer-Strahl.
 */
export function texQuantizedBeamLength(len: number): number {
  if (!Number.isFinite(len)) return TEX_BEAM_MIN;
  return Math.max(
    TEX_BEAM_MIN,
    Math.min(TEX_BEAM_MAX, Math.floor(len / TEX_QUANT_STEP) * TEX_QUANT_STEP),
  );
}

/** Zahl moeglicher Textur-Radien (8, 16, 32 .. 160) — Bestandteil des Caps. */
export const TEX_RADIUS_COUNT = Math.floor(TEX_RADIUS_MAX / TEX_QUANT_STEP) + 1;
/** Zahl moeglicher Textur-Strahl-Laengen (8, 16, 32 .. 1024) — Bestandteil des Caps. */
export const TEX_BEAM_COUNT = Math.floor(TEX_BEAM_MAX / TEX_QUANT_STEP) + 1;


/** Kantenlaenge der Disc-/Ring-Textur fuer Radius r (1 px transparenter Rand). */
export function discSide(r: number): number {
  return 2 * r + 3;
}

/**
 * Reine Rasterung der Warn-Disc: mask[y * side + x] = Palette-Index oder MASK_CLEAR.
 * - round(d) ∈ {r-1, r}: 2-px-Konturband (DISC_CONTOUR_I) — radial konstant 2 px (K2b),
 * - round(d) = r-2: 1-px-Uebergangsband, 50-%-Dither ((x+y) gerade) — Dither NUR hier am Rand,
 * - sonst (round(d) <= r-3): flaechige Fuellung (DISC_FILL_I) ohne Muster; die Halbtransparenz
 *   kommt aus dem Bake-Alpha (DISC_FILL_ALPHA_BY_STAGE), nicht aus einem Dither-Raster.
 * Kein Alpha-Verlauf, keine Zwischenfarben, nur 2 Palettenindizes. Für Vitest ohne Phaser testbar.
 */
export function discMask(r: number): Uint8Array {
  const side = discSide(r);
  const c = (side - 1) / 2;
  const mask = new Uint8Array(side * side).fill(MASK_CLEAR);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const di = Math.round(Math.hypot(x - c, y - c));
      if (di > r) continue;
      const i = y * side + x;
      if (di >= r - 1) {
        mask[i] = DISC_CONTOUR_I;
      } else if (di === r - 2) {
        if ((x + y) % 2 === 0) mask[i] = DISC_FILL_I;
      } else {
        mask[i] = DISC_FILL_I;
      }
    }
  }
  return mask;
}

/**
 * Reine Rasterung des Warn-Rings (Rand-Puls): round(d)-Band am Radius — radial konstant 2 px
 * an jeder Bogenstelle (kein 1/2-px-Wechselschlag), sonst transparent.
 * Mit Tint = volle Gefahr-Farbe, Draw-Scale 1.
 */
export function ringMask(r: number): Uint8Array {
  const side = discSide(r);
  const c = (side - 1) / 2;
  const mask = new Uint8Array(side * side).fill(MASK_CLEAR);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const di = Math.round(Math.hypot(x - c, y - c));
      if (di === r || di === r - 1) mask[y * side + x] = DISC_CONTOUR_I;
    }
  }
  return mask;
}

/**
 * Zahl der aktuell warnenden Disc-Hazards in der Szene (Stapel-Mass fuer K3). Liest nur den
 * von Run.ts gesetzten Run-Zustand (`scene.hazards.active`) — Hazards.ts wird nicht angefasst,
 * der Draw-Pfad bleibt bitgleich. Ohne erreichbaren Zustand (Unit-Test-Stubs) 0.
 */
export function warnDiscStacks(scene: Phaser.Scene): number {
  const active = (
    scene as unknown as {
      hazards?: { active?: ReadonlyArray<{ kind?: string; triggered?: boolean; active?: boolean }> };
    }
  ).hazards?.active;
  if (!Array.isArray(active)) return 0;
  let n = 0;
  for (const h of active) {
    if (h?.kind === "circle" && h.active !== false && !h.triggered) n++;
  }
  return n;
}

/** Wendet eine Maske (Breite `width`) auf einen Pixel-Zeichner an; liefert die Zahl gezeichneter Pixel. */
export function applyMask(
  put: (x: number, y: number, paletteIndex: number) => void,
  mask: Uint8Array,
  width?: number,
): number {
  const w = width ?? Math.round(Math.sqrt(mask.length));
  const h = Math.round(mask.length / w);
  let painted = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pi = mask[y * w + x];
      if (pi === MASK_CLEAR) continue;
      put(x, y, pi);
      painted++;
    }
  }
  return painted;
}

function bakeFromMask(
  scene: Phaser.Scene, key: string, mask: Uint8Array, width?: number, fillAlpha = 1,
): void {
  // Szenen ohne Texture-API (Unit-Test-Stubs) bekommen nur den Key; im Spiel ist
  // scene.textures immer vorhanden und der Bake laeuft genau einmal je Key.
  const textures = scene.textures as Phaser.Textures.TextureManager | undefined;
  if (!textures || typeof textures.addCanvas !== "function" || textures.exists(key)) return;
  const w = width ?? Math.round(Math.sqrt(mask.length));
  const h = Math.round(mask.length / w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  applyMask((x, y, pi) => {
    // Fuell-Alpha nur fuer die Warn-Disc (flaechig halbtransparent); Strahl/Ring bleiben deckend.
    ctx.globalAlpha = pi === DISC_FILL_I ? fillAlpha : 1;
    ctx.fillStyle = hexColor(PAL[pi]);
    ctx.fillRect(x, y, 1, 1);
  }, mask, w);
  ctx.globalAlpha = 1;
  scene.textures.addCanvas(key, canvas);
}

function hexColor(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

/** Ensures + liefert den Key der Warn-Disc-Textur in Sprite-Pixelgroesse fuer `radius`.
 *  Ab `DISC_STACK_THRESHOLD` gleichzeitig warnenden Disc-Hazards mit ruhigerer Stapel-Fuellung
 *  gebacken (Key-Suffix "_s1", niedrigere Fuell-Alpha); darunter Key und Alpha bitgleich zum
 *  Basis-Key. */
export function hazardDiscTexture(scene: Phaser.Scene, radius: number): string {
  const r = texQuantizedRadius(radius);
  const stage = fillStageForStacks(warnDiscStacks(scene));
  const key = stage === 0 ? `hazard_disc_r${r}` : `hazard_disc_r${r}_s1`;
  bakeFromMask(scene, key, discMask(r), undefined, DISC_FILL_ALPHA_BY_STAGE[stage]);
  return key;
}

/** Ensures + liefert den Key des Warn-Ring-Textur (Rand-Puls) in Sprite-Pixelgroesse. */
export function hazardRingTexture(scene: Phaser.Scene, radius: number): string {
  const r = texQuantizedRadius(radius);
  const key = `hazard_ring_r${r}`;
  bakeFromMask(scene, key, ringMask(r));
  return key;
}

/** Breite des Warn-Strahl-Texturen (wie zuvor 8 px Kern in Sprite-Pixeln). */
export const BEAM_W = 8;
/** Breite des Strahl-Rand-Puls (wie zuvor 8 px × 1,25). */
export const BEAM_RIM_W = 10;

/**
 * Strahl-Laenge in Spielpixeln: ganzzahlig, auf 8er-Schritte ABRUNDEND quantisiert (Textur
 * ist nie laenger als der Treffer-Strahl, max. 7 px kuerzer) — begrenzte Cache-Menge.
 */
export function quantizedBeamLength(len: number): number {
  if (!Number.isFinite(len)) return 8;
  return Math.max(8, Math.min(1024, Math.floor(len / 8) * 8));
}

/** Reine Rasterung des Warn-Strahls: 2-px-Kern (Kontur) + 1-px dunkler Rand je Seite. */
export function beamMask(len: number): Uint8Array {
  const h = quantizedBeamLength(len);
  const mask = new Uint8Array(BEAM_W * h).fill(MASK_CLEAR);
  for (let y = 0; y < h; y++) {
    mask[y * BEAM_W + 2] = DISC_FILL_I;
    mask[y * BEAM_W + 3] = DISC_CONTOUR_I;
    mask[y * BEAM_W + 4] = DISC_CONTOUR_I;
    mask[y * BEAM_W + 5] = DISC_FILL_I;
  }
  return mask;
}

/** Reine Rasterung des Strahl-Rand-Pulses: 4-px-Band, sonst transparent. */
export function beamRimMask(len: number): Uint8Array {
  const h = quantizedBeamLength(len);
  const mask = new Uint8Array(BEAM_RIM_W * h).fill(MASK_CLEAR);
  for (let y = 0; y < h; y++) {
    for (let x = 3; x <= 6; x++) mask[y * BEAM_RIM_W + x] = DISC_CONTOUR_I;
  }
  return mask;
}

/** Ensures + liefert den Key des Warn-Strahl-Texturen in Sprite-Pixelgroesse. */
export function hazardBeamTexture(scene: Phaser.Scene, length: number): string {
  const l = texQuantizedBeamLength(length);
  const key = `hazard_beam_l${l}`;
  bakeFromMask(scene, key, beamMask(l), BEAM_W);
  return key;
}

/** Ensures + liefert den Key des Strahl-Rand-Puls in Sprite-Pixelgroesse. */
export function hazardBeamRimTexture(scene: Phaser.Scene, length: number): string {
  const l = texQuantizedBeamLength(length);
  const key = `hazard_beam_rim_l${l}`;
  bakeFromMask(scene, key, beamRimMask(l), BEAM_RIM_W);
  return key;
}

// --- m10-hazard-quality-budget (K2): Tier-Regel fuer den Warn-Disc-Draw -------------
//
// Warn-Discs kosten auf Geraeten Daempfung statt Raster-Rueckbau (Raster-Fix von
// m10-hazard-disc-raster bleibt unangetastet — Masken, Keys, Draw-Scale 1):
//   - low:  Draw-Cap — nur die `DISC_DRAW_CAP_LOW` spieler-naechsten warnenden Discs
//     werden gezeichnet (Disc + ADD-Rim), der Rest bleibt unsichtbar (Gameplay/
//     Treffer/Threats unveraendert) und der Rim-Puls atmet nur in der ersten Haelfte
//     der Warnphase, danach Lesbar-Alpha-Konstante.
//   - medium/high: offen bzw. Phase 1 — BITGLEICH zum Stand vor der Lane.

/**
 * Max gleichzeitig gezeichnete Warn-Discs (Disc + Rim) bei Tier low. M25-Dichte: 20+
 * simultane Warn-Discs; jedes Disc-/Rim-Quad ist Overdraw, der ADD-Rim zuerst Engpass
 * auf Tile-GPUs (Android-Praxis). high/medium: offen (bitgleich).
 */
export const DISC_DRAW_CAP_LOW = 6;

/** Draw-Cap fuer gleichzeitig gezeichnete Warn-Discs je Tier (low = 6, sonst offen). */
export function warnDiscDrawCapForQuality(tier: QualityTier): number {
  if (tier === "low") return DISC_DRAW_CAP_LOW;
  return Number.POSITIVE_INFINITY;
}

/**
 * Anteil der Warnphase, in der der Rim-Puls atmet (danach Konstante). low = 1/2
 * ("kuerzere Puls-Phase"), sonst 1 (bitgleich).
 */
export const RIM_PULSE_PHASE_FRACTION_LOW = 0.5;

export function rimPulsePhaseFractionForQuality(tier: QualityTier): number {
  if (tier === "low") return RIM_PULSE_PHASE_FRACTION_LOW;
  return 1;
}

/**
 * Debug-Override fuer Probes/Abnahme: `window.__lfForceQuality` zwingt ein Tier
 * (unabhaengig vom FPS-Regler); alles andere als "low"/"medium"/"high" wird ignoriert.
 * Reine Funktion (Host wird uebergeben).
 */
export function forcedQualityTier(host: { __lfForceQuality?: unknown }): QualityTier | null {
  const v = host.__lfForceQuality;
  return v === "low" || v === "medium" || v === "high" ? v : null;
}

/**
 * Wirksames Tier fuer den Warn-Disc-Draw: Debug-Override hat Vorrang, sonst der
 * Regler-Stand (`QUALITY` aus config.ts). Reine Funktion.
 */
export function drawQualityTier(
  current: QualityTier,
  host: { __lfForceQuality?: unknown } = globalThis as unknown as { __lfForceQuality?: unknown },
): QualityTier {
  return forcedQualityTier(host) ?? current;
}
