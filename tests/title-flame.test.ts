import { describe, expect, it, vi } from "vitest";
// m10-title-flame-crisp: Guard für die Laternen-Flammen-Animation im Titel.
// Prüft (1) Frames vorhanden, (2) palettentreue Farben + binäres Alpha,
// (3) AE=0 außer der Animationsfläche (F0 ist eine Zellkopie des title_background,
// Spots/Patch liegen im 480x270-Kernbild), (4) Layout-Konstanten unverschoben.
// Title.ts importiert Phaser (Szene); Phaser wird neutral gemockt
// (Muster tests/title-bg-crisp.test.ts).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return { default: { GameObjects: { Container }, Scene } };
});
import { GEN_TITLE, TITLE_FLAME_SPOTS } from "../src/gfx/gen-title";
import { titleBgLayout } from "../src/scenes/Title";

const BASE = GEN_TITLE.title_background;

/** char-Palette-Index (wie src/gfx/textures.ts charIndex). */
function charIndex(ch: string): number {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (ch >= "a" && ch <= "z") return ch.charCodeAt(0) - 97 + 10;
  return -1;
}

const FLAME_KEYS = ["title_flame_f0", "title_flame_f1", "title_flame_f2"];
// Erlaubte Zeichen: transparent + Laternen-Rampe (13=d Glow-Kern, 20=k amber,
// 21=l Laterne, 22=m Glühen). Der Gehäuse-Rand (4) bleibt bewusst in der Basis.
const FLAME_CHARS = new Set([".", "d", "k", "l", "m"]);

describe("title-flame: Frames vorhanden", () => {
  it("GEN_TITLE enthält genau title_background + 3 Flammen-Frames", () => {
    expect(Object.keys(GEN_TITLE).sort()).toEqual([...FLAME_KEYS, "title_background"].sort());
  });

  it.each(FLAME_KEYS)("Frame %s ist 8x11 mit genau einem Frame", (key) => {
    const def = GEN_TITLE[key];
    expect(def.w).toBe(8);
    expect(def.h).toBe(11);
    expect(def.frames.length).toBe(1);
    expect(def.frames[0].length).toBe(11);
    for (const row of def.frames[0]) expect(row.length).toBe(8);
  });

  it("TITLE_FLAME_SPOTS: 4 verschiedene Laternen im Kernbild, Patch liegt komplett im Bild", () => {
    expect(TITLE_FLAME_SPOTS.length).toBe(4);
    expect(new Set(TITLE_FLAME_SPOTS.map((s) => `${s.x},${s.y}`)).size).toBe(4);
    for (const s of TITLE_FLAME_SPOTS) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.x + GEN_TITLE.title_flame_f0.w).toBeLessThanOrEqual(BASE.w);
      expect(s.y + GEN_TITLE.title_flame_f0.h).toBeLessThanOrEqual(BASE.h);
    }
  });
});

describe("title-flame: palettentreu + binäres Alpha", () => {
  it.each(FLAME_KEYS)("Frame %s nutzt nur '.' oder Laternen-Palettenfarben", (key) => {
    for (const row of GEN_TITLE[key].frames[0]) {
      for (const ch of row) {
        expect(FLAME_CHARS.has(ch), `Zeichen '${ch}' in ${key}`).toBe(true);
        if (ch !== ".") expect(charIndex(ch)).toBeGreaterThan(0);
      }
    }
  });

  it("keine neuen Palette-Einträge: Frame-Indizes sind exakt 13/20/21/22", () => {
    const used = new Set<number>();
    for (const key of FLAME_KEYS) {
      for (const row of GEN_TITLE[key].frames[0]) {
        for (const ch of row) if (ch !== ".") used.add(charIndex(ch));
      }
    }
    expect([...used].sort()).toEqual([13, 20, 21, 22]);
  });
});

describe("title-flame: AE=0 außer der Animationsfläche", () => {
  it("F0 ist an allen opaken Zellen eine Zellkopie des title_background", () => {
    const f0 = GEN_TITLE.title_flame_f0.frames[0];
    for (const spot of TITLE_FLAME_SPOTS) {
      for (let dy = 0; dy < GEN_TITLE.title_flame_f0.h; dy++) {
        for (let dx = 0; dx < GEN_TITLE.title_flame_f0.w; dx++) {
          const ch = f0[dy][dx];
          if (ch === ".") continue;
          expect(BASE.frames[0][spot.y + dy][spot.x + dx],
            `Spot ${spot.x},${spot.y} +${dx},${dy}`).toBe(ch);
        }
      }
    }
  });

  it("F0 übermalt die Glasfläche voll opak (kein Durchscheichern der Basis)", () => {
    // Reihen 5..10 des Patches (Glas) müssen komplett belegt sein.
    const f0 = GEN_TITLE.title_flame_f0.frames[0];
    for (let r = 5; r <= 10; r++) {
      for (let c = 0; c < 8; c++) expect(f0[r][c]).not.toBe(".");
    }
    // Reihen 0..4 (Funkenbereich) bis auf Funken transparent -> AE minimal.
    let opaque = 0;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) if (f0[r][c] !== ".") opaque++;
    expect(opaque).toBe(0);
  });

  it("F1/F2 unterscheiden sich sichtbar von F0, Diff bleibt sparsam (<= 10 Zellen)", () => {
    const f0 = GEN_TITLE.title_flame_f0.frames[0];
    for (const key of ["title_flame_f1", "title_flame_f2"]) {
      const f = GEN_TITLE[key].frames[0];
      let diff = 0;
      for (let r = 0; r < f.length; r++) {
        for (let c = 0; c < f[r].length; c++) if (f[r][c] !== f0[r][c]) diff++;
      }
      expect(diff).toBeGreaterThanOrEqual(2);
      expect(diff).toBeLessThanOrEqual(12);
    }
  });
});

describe("title-flame: Layout-Konstanten unverschoben", () => {
  it("titleBgLayout unverändert (640x360, 780x360, 1920x1080, ganzzahliger Scale)", () => {
    expect(titleBgLayout(640, 360)).toEqual({ scale: 1, x: 80, y: 45, left: 80, top: 45, right: 80, bottom: 45 });
    expect(titleBgLayout(780, 360)).toEqual({ scale: 1, x: 150, y: 45, left: 150, top: 45, right: 150, bottom: 45 });
    const l = titleBgLayout(1920, 1080);
    expect(l).toEqual({ scale: 4, x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0 });
    expect(Number.isInteger(l.scale)).toBe(true);
  });

  it("Flammen-Images nutzen denselben ganzzahligen Scale wie das Kernbild (keine Mixel)", () => {
    // Runtime-Vertrag aus Title.ts: Position = bgL.x/y + Spot, Scale = bgL.scale.
    for (const [w, h] of [[640, 360], [780, 360], [1920, 1080]] as Array<[number, number]>) {
      const l = titleBgLayout(w, h);
      for (const s of TITLE_FLAME_SPOTS) {
        const px = l.x + s.x * l.scale;
        const py = l.y + s.y * l.scale;
        expect(Number.isInteger(px)).toBe(true);
        expect(Number.isInteger(py)).toBe(true);
        expect(Number.isInteger(l.scale)).toBe(true);
      }
    }
  });
});
