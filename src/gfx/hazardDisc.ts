import Phaser from "phaser";
import { PAL } from "../palette";

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
 *   - 50-%-Schachbrett-Dither-Fuellung (Terrain bleibt zwischen den Pixeln sichtbar),
 *   - binaeres Alpha, nur 2 Palettenindizes — kein stufenloser Gradient.
 * Die Textur ist hell/neutral gebacken; der Tint in Hazards.ts faerbt Kontur (hell -> volle
 * Gefahr-Farbe) und Fuellung (mittel -> dunkler Ton derselben Farbe).
 *
 * Warnlogik/Draw-Pfad in Hazards.ts bleiben bitgleich (Puls, Depth, Blend) — reine Optik.
 * Nicht-Telegraph-Nutzung von "ring_burst" (Impact-Ring, kurzlebig) ist bewusst unveraendert.
 */

/** Fuellung: dunkler Warnton — mit Tint dunkler Ton der Gefahr-Farbe (hellt nie auf). */
export const DISC_FILL_I = 15; // emberDark
/** Kontur/Band: fast-weiß — mit Tint volle Gefahr-Farbe. */
export const DISC_CONTOUR_I = 13; // lanternWhite
/** Maskenwert fuer transparent. */
export const MASK_CLEAR = 255;

/**
 * Sprite-Radius in Spielpixeln: ganzzahlig, geklemmt auf 8..160 (gruender Teleport-Marker
 * bis Summon-Ring; alles darueber gab es im Spiel nicht). Reine Funktion.
 */
export function quantizedRadius(radius: number): number {
  if (!Number.isFinite(radius)) return 8;
  return Math.max(8, Math.min(160, Math.round(radius)));
}

/** Kantenlaenge der Disc-/Ring-Textur fuer Radius r (1 px transparenter Rand). */
export function discSide(r: number): number {
  return 2 * r + 3;
}

/**
 * Reine Rasterung der Warn-Disc: mask[y * side + x] = Palette-Index oder MASK_CLEAR.
 * - d in (r-2, r]: 2-px-Konturband (DISC_CONTOUR_I)
 * - d <= r-2 und (x+y) gerade: Dither-Fuellung (DISC_FILL_I)
 * Kein Alpha-Verlauf, keine Zwischentöne. Für Vitest ohne Phaser testbar.
 */
export function discMask(r: number): Uint8Array {
  const side = discSide(r);
  const c = (side - 1) / 2;
  const mask = new Uint8Array(side * side).fill(MASK_CLEAR);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > r) continue;
      const i = y * side + x;
      if (d > r - 2) {
        mask[i] = DISC_CONTOUR_I;
      } else if ((x + y) % 2 === 0) {
        mask[i] = DISC_FILL_I;
      }
    }
  }
  return mask;
}

/**
 * Reine Rasterung des Warn-Rings (Rand-Puls): durchgehendes 2-px-Band am Radius,
 * sonst transparent. Mit Tint = volle Gefahr-Farbe, Draw-Scale 1.
 */
export function ringMask(r: number): Uint8Array {
  const side = discSide(r);
  const c = (side - 1) / 2;
  const mask = new Uint8Array(side * side).fill(MASK_CLEAR);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > r - 2 && d <= r) mask[y * side + x] = DISC_CONTOUR_I;
    }
  }
  return mask;
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

function bakeFromMask(scene: Phaser.Scene, key: string, mask: Uint8Array, width?: number): void {
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
    ctx.fillStyle = hexColor(PAL[pi]);
    ctx.fillRect(x, y, 1, 1);
  }, mask, w);
  scene.textures.addCanvas(key, canvas);
}

function hexColor(rgb: number): string {
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

/** Ensures + liefert den Key der Warn-Disc-Textur in Sprite-Pixelgroesse fuer `radius`. */
export function hazardDiscTexture(scene: Phaser.Scene, radius: number): string {
  const r = quantizedRadius(radius);
  const key = `hazard_disc_r${r}`;
  bakeFromMask(scene, key, discMask(r));
  return key;
}

/** Ensures + liefert den Key des Warn-Ring-Textur (Rand-Puls) in Sprite-Pixelgroesse. */
export function hazardRingTexture(scene: Phaser.Scene, radius: number): string {
  const r = quantizedRadius(radius);
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
  const l = quantizedBeamLength(length);
  const key = `hazard_beam_l${l}`;
  bakeFromMask(scene, key, beamMask(l), BEAM_W);
  return key;
}

/** Ensures + liefert den Key des Strahl-Rand-Puls in Sprite-Pixelgroesse. */
export function hazardBeamRimTexture(scene: Phaser.Scene, length: number): string {
  const l = quantizedBeamLength(length);
  const key = `hazard_beam_rim_l${l}`;
  bakeFromMask(scene, key, beamRimMask(l), BEAM_RIM_W);
  return key;
}
