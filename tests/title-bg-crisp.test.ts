import { describe, expect, it, vi } from "vitest";
// m10-title-bg-crisp: Titel-Hintergrund pixelgenau. titleBgLayout (in
// src/scenes/Title.ts) ist eine reine Funktion — hier werden Ganzzahligkeit,
// Lueckenlosigkeit (Fuellung schliesst die View) und Eingabe-Neutralitaet geprueft.
// Title.ts importiert Phaser (Szene); Phaser wird neutral gemockt
// (Muster tests/boss-banner-layout.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import { titleBgLayout } from "../src/scenes/Title";

const TEX_W = 480;
const TEX_H = 270;

/** Ziel-Viewports: Basis, M8-Standard, Width-Cap, ganzzahlige Stufen, Sonderfaelle.
 * (MIN_WIDTH = 480, src/logic/view.ts — Views kleiner als die 480x270-Textur sind
 * unerreichbar; ein Bleed-Crop-Fall tritt also nie auf.) */
const VIEWPORTS: Array<[number, number]> = [
  [480, 270], [640, 360], [780, 360], [960, 540],
  [1280, 720], [1920, 1080], [860, 484], [500, 360],
];

describe("titleBgLayout – ganzzahlige Skalierung", () => {
  it.each(VIEWPORTS)("scale ist ganzzahlig und >= 1 bei %ix%i", (w, h) => {
    const l = titleBgLayout(w, h);
    expect(Number.isInteger(l.scale)).toBe(true);
    expect(l.scale).toBeGreaterThanOrEqual(1);
  });

  it("640x360: Scale 1, Panel zentriert bei 80/45", () => {
    expect(titleBgLayout(640, 360)).toEqual({
      scale: 1, x: 80, y: 45, left: 80, top: 45, right: 80, bottom: 45,
    });
  });

  it("780x360: Scale 1, Panel zentriert bei 150/45", () => {
    expect(titleBgLayout(780, 360)).toEqual({
      scale: 1, x: 150, y: 45, left: 150, top: 45, right: 150, bottom: 45,
    });
  });

  it("1280x720: ganzzahliger Scale 2 statt fraktionaler 2.667", () => {
    expect(titleBgLayout(1280, 720).scale).toBe(2);
  });
});

describe("titleBgLayout – Fuellung schliesst die View (0 sichtbarer Rand)", () => {
  it.each(VIEWPORTS)("Kachelung lueckenlos bei %ix%i", (w, h) => {
    const l = titleBgLayout(w, h);
    // Alle Teil-Groessen ganzzahlig und >= 0
    for (const v of [l.x, l.y, l.left, l.top, l.right, l.bottom]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    // horizontal: linker Rand + Kern + rechter Rand = View-Breite
    expect(l.left + TEX_W * l.scale + l.right).toBe(w);
    // vertikal: oberer Rand + Kern + unterer Rand = View-Hoehe
    expect(l.top + TEX_H * l.scale + l.bottom).toBe(h);
    // Panel liegt im View
    expect(l.x).toBe(l.left);
    expect(l.y).toBe(l.top);
  });
});

describe("titleBgLayout – Title-Eingaben unberuehrt", () => {
  it("rein: wiederholte Aufrufe liefern identische Werte, Argumente werden nicht mutiert", () => {
    const w = 640; const h = 360;
    const a = titleBgLayout(w, h);
    const b = titleBgLayout(w, h);
    expect(b).toEqual(a);
    expect(w).toBe(640);
    expect(h).toBe(360);
  });

  it("vertikale Zentrierung entspricht dem bisherigen Layout-Anker oy (kein Text-/Button-Versatz)", () => {
    // Abnahme-Viewports (Scale 1): Panel-y == oy -> Logo/Text/Buttons unversetzt.
    for (const [w, h] of [[640, 360], [780, 360], [480, 270]] as Array<[number, number]>) {
      const oy = Math.round((h - TEX_H) / 2);
      expect(titleBgLayout(w, h).y).toBe(oy);
    }
  });
});
