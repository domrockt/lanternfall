import { describe, expect, it } from "vitest";
// m10-menubg-crisp-rest: Menue-Hintergrund (vignette) pixelgenau in
// CharSelect/Results/Credits. vignetteBgLayout/vignetteBgCoversView
// (src/gfx/vignette-bg.ts) sind reine Funktionen — hier werden Ganzzahligkeit,
// Lueckenlosigkeit (Fuellung schliesst die View) und die Befundfaelle aus
// shots/m10-menubg-before.json geprueft (Resize 640 -> 780 liess die Textur
// auf Texel 640x360 stehen und streckte fraktional 1.21875x).
//
// Zusätzlich statische Quell-Checks: die 3 Szenen duerfen die Vignette nicht
// mehr per setDisplaySize zeichnen (Muster tests/vfx-restore.test.ts).
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { vignetteBgCoversView, vignetteBgLayout } from "../src/gfx/vignette-bg";

const TEX_W = 640; // Boot-Groesse der Vignette (GAME_WIDTH beim Boot)
const TEX_H = 360;

/** Views (intern, logische px): Basis, 780@dpr3, Fill-View 960x540, Width-Cap,
 *  Fit-Rueckfall 480, ganzzahlige Stufen. Textur immer 640x360 (Boot-Groesse),
 *  weil der Texture-Manager sie ueber Resizes hinweghaelt (Befund F1). */
const VIEWS: Array<[number, number]> = [
  [640, 360], [780, 360], [960, 540],
  [860, 360], [480, 360], [860, 484],
];

describe("vignetteBgLayout – ganzzahlige Skalierung (Befund 1.21875x ist weg)", () => {
  it.each(VIEWS)("scale ist ganzzahlig und >= 1 bei %ix%i", (w, h) => {
    const l = vignetteBgLayout(w, h, TEX_W, TEX_H);
    expect(Number.isInteger(l.scale)).toBe(true);
    expect(l.scale).toBeGreaterThanOrEqual(1);
  });

  it("640x360: Scale 1, exakte Abbildung ohne Fuellung (AE = 0)", () => {
    expect(vignetteBgLayout(640, 360, TEX_W, TEX_H)).toEqual({
      scale: 1, x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0,
    });
  });

  it("780x360: Scale 1, Kanten-Fuellung 70px links/rechts (statt 1.21875x)", () => {
    expect(vignetteBgLayout(780, 360, TEX_W, TEX_H)).toEqual({
      scale: 1, x: 70, y: 0, left: 70, top: 0, right: 70, bottom: 0,
    });
  });

  it("860x360 (Width-Cap): Fuellung 110px links/rechts", () => {
    expect(vignetteBgLayout(860, 360, TEX_W, TEX_H)).toEqual({
      scale: 1, x: 110, y: 0, left: 110, top: 0, right: 110, bottom: 0,
    });
  });

  it("960x540 wird intern 640x360 -> Scale 1, keine Fuellung", () => {
    expect(vignetteBgLayout(640, 360, TEX_W, TEX_H).scale).toBe(1);
  });
});

describe("vignetteBgLayout – Fuellung schliesst die View (0 sichtbarer Rand)", () => {
  it.each(VIEWS)("Kachelung lueckenlos bei %ix%i", (w, h) => {
    const l = vignetteBgLayout(w, h, TEX_W, TEX_H);
    expect(l.left + TEX_W * l.scale + l.right).toBe(w);
    expect(l.top + TEX_H * l.scale + l.bottom).toBe(h);
    expect(vignetteBgCoversView(l, w, h, TEX_W, TEX_H)).toBe(true);
  });

  it("Resize nach unten (Texur 780x360, View 640x360): Crop deckt die View ab", () => {
    const l = vignetteBgLayout(640, 360, 780, 360);
    expect(l.scale).toBe(1);
    expect(l.x).toBeLessThanOrEqual(0);
    expect(l.x + 780 * l.scale).toBeGreaterThanOrEqual(640);
    expect(vignetteBgCoversView(l, 640, 360, 780, 360)).toBe(true);
  });

  it("Fuellstreifen-Skalen waeren pro Achse ganzzahlig (Klassifikator-Kontrakt)", () => {
    // Der Mess-Skript-Klassifikator erlaubt col/row/px-Baendern ungleiche
    // Achsen, verlangt aber ganzzahlige Werte — hier der Beleg fuer 780.
    const l = vignetteBgLayout(780, 360, TEX_W, TEX_H);
    expect(Number.isInteger(l.left)).toBe(true);
    expect(Number.isInteger(l.right)).toBe(true);
    expect(Number.isInteger(l.scale)).toBe(true);
  });
});

describe("Szenen-Quelle – kein setDisplaySize mehr auf der Vignette", () => {
  const SCENES = ["CharSelect", "Results", "Credits"] as const;

  it.each(SCENES)("%s nutzt addVignetteBg und streckt die Vignette nicht mehr", (scene) => {
    const src = readFileSync(`src/scenes/${scene}.ts`, "utf8");
    expect(src).toContain('from "../gfx/vignette-bg"');
    expect(src).toContain("addVignetteBg(this, W, H)");
    // Die alte fraktionale Zeile darf nicht uebrig bleiben:
    expect(src).not.toMatch(/"vignette"\)[\s\S]{0,80}\.setDisplaySize/);
  });
});
