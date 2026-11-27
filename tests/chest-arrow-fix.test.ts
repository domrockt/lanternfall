import { describe, expect, it, vi } from "vitest";
// ChestSystem importiert Phaser (Szene/BlendModes); die reine Layout-Funktion
// braucht kein DOM. Phaser wird wie in chest-arrow.test.ts gemockt.
vi.mock("phaser", () => ({ default: {} }));
import {
  CHEST_ARROW_MARGIN,
  computeChestArrow,
  type ArrowView,
} from "../src/systems/ChestSystem";

/**
 * m10-chest-arrow-fix K4: Viewport-Klemm-Invariante fuer Extrem-Kamerapositionen.
 *
 * Abnahme-Befund (shots/qa-reaccc-chest-arrow.json) stellte die Zuverlaessigkeit
 * der Randpfeil-Anzeige infrage. Der Re-Lauf mit POST_UPDATE-Sampling
 * (shots/m10-chest-arrow-fix-repro.json) belegt: computeChestArrow leitet
 * Position/Winkel aus der echten Kamera-Transform ab (Viewport, worldView,
 * Zoom) und klemmt den Pfeil vollstaendig im Viewport — fuer keine
 * Kameraposition ragt er aus dem Viewport (0 px ausserhalb). Diese Invariante
 * wird hier als Unit-Test gegen die reine Funktion festgehalten, in beiden
 * Abnahme-Formaten (640x360, 780x360) und Kamera-Varianten (Zoom 1, Zoom 0.5
 * = RENDER_SCALE 2 via enforceCameraProjection, Zoom 1.14 = Boss-Intro-Puls).
 */

const WORLD = 4096; // WORLD_SIZE = TILE * WORLD_TILES

/** ArrowView aus Kamera-Einheiten wie ChestSystem.computeArrowLayout sie liest. */
function cameraView(
  width: number,
  height: number,
  zoom: number,
  viewX: number,
  viewY: number,
): ArrowView {
  return {
    width,
    height,
    viewX,
    viewY,
    viewWidth: width / zoom,
    viewHeight: height / zoom,
    zoom,
  };
}

/** Gerenderte Screen-Position eines scrollFactor-0-Objekts (Zoom um Mitte). */
function renderPos(layout: { x: number; y: number }, v: ArrowView) {
  return {
    x: v.width / 2 + (layout.x - v.width / 2) * v.zoom,
    y: v.height / 2 + (layout.y - v.height / 2) * v.zoom,
  };
}

function angleDiffDeg(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;
}

/** Winkel von der View-Mitte zur Truhe (wahre Richtung, Screen-Raum). */
function trueAngle(v: ArrowView, chestX: number, chestY: number): number {
  const sx = v.width / 2 + (chestX - (v.viewX + v.viewWidth / 2)) * v.zoom;
  const sy = v.height / 2 + (chestY - (v.viewY + v.viewHeight / 2)) * v.zoom;
  return Math.atan2(sy - v.height / 2, sx - v.width / 2);
}

// Extrem-Kamerapositionen: worldView an den 4 Welt-Ecken (Kamera klemmt an
// setBounds) plus Welt-Mitte. Truhen weit dahinter in 8 Richtungen.
const EXTREME_CAMERAS: Array<{ label: string; viewX: number; viewY: number }> = [
  { label: "Welt-Ecke oben-links", viewX: 0, viewY: 0 },
  { label: "Welt-Ecke oben-rechts", viewX: WORLD - 640, viewY: 0 },
  { label: "Welt-Ecke unten-links", viewX: 0, viewY: WORLD - 360 },
  { label: "Welt-Ecke unten-rechts", viewX: WORLD - 640, viewY: WORLD - 360 },
  { label: "Welt-Mitte", viewX: WORLD / 2 - 320, viewY: WORLD / 2 - 180 },
];

const DIRECTIONS: Array<{ label: string; dx: number; dy: number }> = [
  { label: "links", dx: -1, dy: 0 }, { label: "rechts", dx: 1, dy: 0 },
  { label: "oben", dx: 0, dy: -1 }, { label: "unten", dx: 0, dy: 1 },
  { label: "oben-links", dx: -1, dy: -1 }, { label: "oben-rechts", dx: 1, dy: -1 },
  { label: "unten-links", dx: -1, dy: 1 }, { label: "unten-rechts", dx: 1, dy: 1 },
];

const FORMATS: Array<{ label: string; width: number; height: number }> = [
  { label: "640x360", width: 640, height: 360 },
  { label: "780x360", width: 780, height: 360 },
];

const ZOOMS = [1, 0.5, 1.14];
const FAR = 1500; // Truhe weit hinter dem View-Rand (wie Repro-Skript)

describe("M10 chest-arrow-fix: Viewport-Klemm-Invariante (Extrem-Kamerapositionen)", () => {
  it("Pfeil ragt 0 px aus dem Viewport: Margin-Klemme in beiden Formaten, allen Zooms, allen Extrem-Kamerapositions-Richtungen", () => {
    for (const fmt of FORMATS) {
      for (const cam of EXTREME_CAMERAS) {
        // 780-Format an Welt-Ecken: Kamera-Clamp schiebt die worldView ans
        // rechte/untere Weltufer (so tut es Phaser bei camera.setBounds).
        const viewX = fmt.width === 640 ? cam.viewX : Math.min(cam.viewX, WORLD - 780);
        for (const zoom of ZOOMS) {
          const v = cameraView(fmt.width, fmt.height, zoom, Math.max(0, viewX), Math.max(0, cam.viewY));
          const cx = v.viewX + v.viewWidth / 2;
          const cy = v.viewY + v.viewHeight / 2;
          for (const dir of DIRECTIONS) {
            const chestX = cx + dir.dx * (v.viewWidth / 2 + FAR);
            const chestY = cy + dir.dy * (v.viewHeight / 2 + FAR);
            const layout = computeChestArrow(v, chestX, chestY);
            expect(layout.visible, `${fmt.label} ${cam.label} zoom ${zoom} ${dir.label}`).toBe(true);
            const rp = renderPos(layout, v);
            // Klemm-Invariante: Renderpunkt komplett im Viewport, >= Margin
            // vom Rand (halbe Toleranz fuer Rundung), 0 px ausserhalb.
            expect(rp.x).toBeGreaterThanOrEqual(CHEST_ARROW_MARGIN - 1);
            expect(rp.x).toBeLessThanOrEqual(fmt.width - CHEST_ARROW_MARGIN + 1);
            expect(rp.y).toBeGreaterThanOrEqual(CHEST_ARROW_MARGIN - 1);
            expect(rp.y).toBeLessThanOrEqual(fmt.height - CHEST_ARROW_MARGIN + 1);
            // Layoutpunkt selbst (vor Zoom-Rueckrechnung) ebenfalls geklemmt.
            expect(layout.x).toBeGreaterThanOrEqual((fmt.width / 2) - ((fmt.width / 2) - CHEST_ARROW_MARGIN) / zoom - 1);
            expect(layout.y).toBeGreaterThanOrEqual((fmt.height / 2) - ((fmt.height / 2) - CHEST_ARROW_MARGIN) / zoom - 1);
          }
        }
      }
    }
  });

  it("Pfeil zeigt zur Truhe: Winkel <= 5 Grad in beiden Formaten fuer alle 8 Richtungen und Zooms (Extrem-Kameraposition Welt-Ecke oben-links)", () => {
    for (const fmt of FORMATS) {
      const v = cameraView(fmt.width, fmt.height, 1, 0, 0);
      const cx = v.viewX + v.viewWidth / 2;
      const cy = v.viewY + v.viewHeight / 2;
      for (const zoom of ZOOMS) {
        const vz = cameraView(fmt.width, fmt.height, zoom, 0, 0);
        for (const dir of DIRECTIONS) {
          const chestX = cx + dir.dx * (vz.viewWidth / 2 + FAR);
          const chestY = cy + dir.dy * (vz.viewHeight / 2 + FAR);
          const layout = computeChestArrow(vz, chestX, chestY);
          const exp = trueAngle(vz, chestX, chestY);
          expect(angleDiffDeg(layout.angle, exp), `${fmt.label} zoom ${zoom} ${dir.label}`).toBeLessThanOrEqual(5);
          const rp = renderPos(layout, vz);
          const rAngle = Math.atan2(rp.y - fmt.height / 2, rp.x - fmt.width / 2);
          expect(angleDiffDeg(rAngle, exp), `${fmt.label} zoom ${zoom} ${dir.label} (gerendert)`).toBeLessThanOrEqual(5);
        }
      }
    }
  });

  it("Truhe weit ausserhalb der Welt (negative Koordinaten): Layout bleibt endliche, geklemmte Werte am Viewportrand", () => {
    for (const fmt of FORMATS) {
      const v = cameraView(fmt.width, fmt.height, 1, 0, 0);
      for (const chest of [
        { x: -3000, y: 1000 }, { x: WORLD + 3000, y: 1000 },
        { x: 1000, y: -3000 }, { x: 1000, y: WORLD + 3000 },
        { x: -3000, y: -3000 }, { x: WORLD + 3000, y: WORLD + 3000 },
      ]) {
        const layout = computeChestArrow(v, chest.x, chest.y);
        expect(layout.visible).toBe(true);
        expect(Number.isFinite(layout.x)).toBe(true);
        expect(Number.isFinite(layout.y)).toBe(true);
        expect(Number.isFinite(layout.angle)).toBe(true);
        const rp = renderPos(layout, v);
        expect(rp.x).toBeGreaterThanOrEqual(CHEST_ARROW_MARGIN - 1);
        expect(rp.x).toBeLessThanOrEqual(fmt.width - CHEST_ARROW_MARGIN + 1);
        expect(rp.y).toBeGreaterThanOrEqual(CHEST_ARROW_MARGIN - 1);
        expect(rp.y).toBeLessThanOrEqual(fmt.height - CHEST_ARROW_MARGIN + 1);
      }
    }
  });

  it("RENDER_SCALE 2 (Kamera 320x180, Zoom 0.5): Margin bleibt in Kamera-Pixeln, gerendert vollstaendig im logischen Viewport", () => {
    // enforceCameraProjection (src/config.ts) setzt bei Buffer-Teiler 2:
    // Viewport 320x180, Zoom 0.5, worldView bleibt logisch 640x360.
    for (const [width, height] of [[320, 180], [390, 180]] as const) {
      const v = cameraView(width, height, 0.5, 0, 0);
      const cx = v.viewX + v.viewWidth / 2;
      const cy = v.viewY + v.viewHeight / 2;
      for (const dir of DIRECTIONS) {
        const chestX = cx + dir.dx * (v.viewWidth / 2 + FAR);
        const chestY = cy + dir.dy * (v.viewHeight / 2 + FAR);
        const layout = computeChestArrow(v, chestX, chestY);
        expect(layout.visible).toBe(true);
        const rp = renderPos(layout, v);
        expect(rp.x).toBeGreaterThanOrEqual(CHEST_ARROW_MARGIN - 1);
        expect(rp.x).toBeLessThanOrEqual(width - CHEST_ARROW_MARGIN + 1);
        expect(rp.y).toBeGreaterThanOrEqual(CHEST_ARROW_MARGIN - 1);
        expect(rp.y).toBeLessThanOrEqual(height - CHEST_ARROW_MARGIN + 1);
        expect(angleDiffDeg(layout.angle, trueAngle(v, chestX, chestY))).toBeLessThanOrEqual(5);
      }
    }
  });
});
