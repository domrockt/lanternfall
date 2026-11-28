import { describe, expect, it } from "vitest";
import {
  computeView, isIntegerPixelPerfect, snapCanvasRect,
  type CanvasSnap, type ViewSpec,
} from "../src/logic/view";

/**
 * M10-view-pixel-snap: Guard fuer die POSITIONIERUNG des Canvas auf ganzen
 * Geraetepixeln (Bedarf aus Lane m10-view-4k K2, Beleg
 * /home/ai/games/.evidence/m10-view-4k/m10-view-4k-before.json und
 * /home/ai/games/.evidence/m10-view-pixel-snap/m10-view-snap-{before,after}.json).
 *
 * Mangel (vorher): 2560x1080@1 -> intern 853x360, Scale 3, Canvas 2559
 * Geraetepx, Flex-Zentrierung bei CSS-x = 0.5 -> die linke Randspalte blurrt
 * zum Seitenhintergrund (Pixel-Scan barsPx.left = 1).
 * Fix (main.ts applyView + snapCanvasRect): linke/obere Kante auf ganze
 * Geraetepixel abrunden -> Restspalte liegt HART rechts (hier barsPx.right=1),
 * nichts verblurrt. Die View-Rechnung (computeView) bleibt unangetastet.
 */

/** Simuliert die Flex-Zentrierung des Canvas in einem Viewport (CSS-Px). */
function centered(viewportCss: number, cssSize: number): number {
  return (viewportCss - cssSize) / 2;
}

describe("snapCanvasRect — Grundregeln", () => {
  it("2560x1080@1: zentrierte Kante 0.5 CSS -> auf 0 gesnappt, Rest nach rechts", () => {
    const s = snapCanvasRect(0.5, 0, 1);
    expect(s.alreadySnapped).toBe(false);
    expect(s.dx).toBe(-0.5);
    expect(s.dy).toBe(0);
    expect(s.snappedLeftCss).toBe(0);
    // Rechte Kante: 0 + 2559 = 2559 Geraetepx (ganzzahlig), Viewport 2560
    // -> genau die mathematisch unvermeidbare Restspalte, jetzt hart rechts.
    expect((s.snappedLeftCss + 2559) * 1).toBe(2559);
  });

  it("bereits ganzzahlige Kante -> kein Transform (dx=dy=0)", () => {
    expect(snapCanvasRect(0, 0, 1)).toEqual({
      dx: 0, dy: 0, snappedLeftCss: 0, snappedTopCss: 0, alreadySnapped: true,
    });
    expect(snapCanvasRect(12.5, 7.5, 2).alreadySnapped).toBe(true);
  });

  it("ganzzahlig in GERAETEpx reicht: 0.5 CSS bei dpr 2 = 1 Geraetepx", () => {
    const s = snapCanvasRect(0.5, 0, 2);
    expect(s.alreadySnapped).toBe(true);
    expect(s.dx).toBe(0);
    expect(s.snappedLeftCss).toBe(0.5);
  });

  it("dpr 3: 1.2 CSS = 3.6 Geraetepx -> runter auf 3 Geraetepx (1.0 CSS)", () => {
    const s = snapCanvasRect(1.2, 0, 3);
    expect(s.dx).toBeCloseTo(-0.2, 10);
    expect(s.snappedLeftCss).toBeCloseTo(1.0, 10);
    expect(s.snappedLeftCss * 3).toBeCloseTo(3, 10);
  });

  it("verschiebt immer NACH LINKS/OBEN (floor) — Restspalte rechts/unten, nie Crop links", () => {
    for (const [left, dpr] of [[0.5, 1], [0.4, 1], [1.9, 1], [0.25, 4], [1.1, 2]] as const) {
      const s: CanvasSnap = snapCanvasRect(left, 0, dpr);
      expect(s.dx).toBeLessThanOrEqual(0);
      expect(s.snappedLeftCss * dpr).toBeCloseTo(Math.floor(left * dpr + 1e-4), 6);
    }
  });

  it("doppelte Kante (CSS-x UND CSS-y) unabhaengig gesnappt", () => {
    const s = snapCanvasRect(0.5, 1.5, 1);
    expect(s.dx).toBe(-0.5);
    expect(s.dy).toBe(-0.5);
    expect(s.snappedLeftCss).toBe(0);
    expect(s.snappedTopCss).toBe(1);
  });

  it("nicht-finite Eingaben oder dpr-Anomalien -> kein NaN im Transform", () => {
    // Position NaN/Infinity: dx/dy = 0 (snapped-Werte werden dann nicht genutzt).
    expect(snapCanvasRect(NaN, 0, 1).dx).toBe(0);
    expect(snapCanvasRect(0.5, Infinity, 1).dy).toBe(0);
    // dpr<=0/NaN gilt wie in computeView als 1 (finitePositive-Fallback).
    expect(snapCanvasRect(0.5, 0, 0).dx).toBe(-0.5);
    expect(snapCanvasRect(0.5, 0, Number.NaN).dx).toBe(-0.5);
  });
});

describe("snapCanvasRect x computeView — Display-Matrix", () => {
  // (CSS-Viewport, dpr) -> erwartet intern/Scale/Restspalte (Geraetepx).
  const MATRIX = [
    // Mangelprofil der Bedarfsmeldung: 2560 = 3*853 + 1
    { cssW: 2560, cssH: 1080, dpr: 1, width: 853, scale: 3, deficit: 1 },
    // Kontrollen: teilbare Breiten -> 0 Rest, Kante exakt am Rand
    { cssW: 1280, cssH: 720, dpr: 1, width: 640, scale: 2, deficit: 0 },
    { cssW: 3840, cssH: 2160, dpr: 1, width: 640, scale: 6, deficit: 0 },
    { cssW: 3440, cssH: 1440, dpr: 1, width: 860, scale: 4, deficit: 0 },
    // dpr 2: device 2560x1080 -> gleiches Restspalten-Defizit
    { cssW: 1280, cssH: 540, dpr: 2, width: 853, scale: 3, deficit: 1 },
  ] as const;

  for (const m of MATRIX) {
    it(`${m.cssW}x${m.cssH}@${m.dpr}: View unveraendert, gesnappte Rect-Grenzen ganzzaehlig`, () => {
      const spec = computeView({ width: m.cssW, height: m.cssH, dpr: m.dpr, setting: 0 });
      // View-Rechnung unangetastet (Defizit statt Crop, siehe m10-view-4k).
      expect(spec.width).toBe(m.width);
      expect(spec.scale).toBe(m.scale);
      expect(isIntegerPixelPerfect(spec)).toBe(true);

      const left = centered(m.cssW, spec.cssWidth);
      const top = centered(m.cssH, spec.cssHeight);
      const snap = snapCanvasRect(left, top, spec.dpr);

      // Gesnappte Kanten liegen auf ganzen Geraetepixeln ...
      const leftDev = snap.snappedLeftCss * spec.dpr;
      const topDev = snap.snappedTopCss * spec.dpr;
      expect(leftDev).toBeCloseTo(Math.round(leftDev), 6);
      expect(topDev).toBeCloseTo(Math.round(topDev), 6);
      // ... nichts ragt links/oben ueber den Viewport ...
      expect(leftDev).toBeGreaterThanOrEqual(-1e-6);
      expect(topDev).toBeGreaterThanOrEqual(-1e-6);
      // ... und rechts bleibt exakt das erwartete, HART abgegrenzte Restdefizit.
      const rightDev = (snap.snappedLeftCss + spec.cssWidth) * spec.dpr;
      expect(m.cssW * spec.dpr - rightDev).toBeCloseTo(m.deficit, 6);
      // bei Restspalte ist die RECHTE Kante trotzdem ganzzaehlig (harte Kante)
      if (m.deficit > 0) expect(rightDev).toBeCloseTo(Math.round(rightDev), 6);
    });
  }

  it("Rauschen unter 1e-4 Geraetepixel aendert nichts (Browser-Rect-Stabilitaet)", () => {
    // Reale Kante 128 Geraetepx, Rect liefert knapp darunter -> no-op.
    const s = snapCanvasRect(128 - 5e-5, 0, 1);
    expect(s.alreadySnapped).toBe(true);
    expect(s.dx).toBe(0);
  });
});
