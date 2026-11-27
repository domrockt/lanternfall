import { beforeEach, describe, expect, it, vi } from "vitest";

// m10-font-glyph-pack: ensureGlyph legt Glyphen NICHT mehr als Einzel-Canvas-
// Textur an, sondern packt sie via packCanvasTexture (bakeAtlas) in eine
// inkrementelle Baked-Atlas-Seite. Diese Suite belegt:
//   1. Glyph-Keys werden als Frames auf einer geteilten Atlas-Seite registriert
//      (addCanvas nur fuer die Seite selbst).
//   2. Pro Glyphe entsteht KEINE neue Canvas-Textur (Wiederverwendung/Early-Return).
//   3. Die Glyph-Geometrie ist bit-identisch zur alten addCanvas-Erzeugung
//      (exakt dieselbe fillRect-Menge, fillStyle, 5x7-Canvas).
// Wie in pixel-text-cache.test.ts: Phaser-Container-Stub, kein echtes DOM.
vi.mock("phaser", () => {
  class Container {
    scene: unknown;
    children: unknown[] = [];
    constructor(scene: unknown) { this.scene = scene; }
    add(child: unknown) { this.children.push(child); return this; }
    setDepth() { return this; }
  }
  return { default: { GameObjects: { Container } } };
});

import { GLYPH_ADVANCE, GLYPH_H, GLYPH_W, PixelText } from "../src/gfx/font";
import { GLYPHS } from "../src/gfx/glyphs";
import { PAL } from "../src/palette";

/** Aufgezeichnetes Canvas: Masse + alle 2D-Operationen. */
interface CanvasRec {
  width: number;
  height: number;
  fillStyle: string;
  rects: Array<[number, number, number, number]>;
  drawImages: number;
}

let canvases: CanvasRec[] = [];

beforeEach(() => {
  canvases = [];
  vi.stubGlobal("document", {
    createElement: () => {
      const rec: CanvasRec = { width: 0, height: 0, fillStyle: "", rects: [], drawImages: 0 };
      const ctx = {
        set fillStyle(v: string) { rec.fillStyle = v; },
        get fillStyle() { return rec.fillStyle; },
        set imageSmoothingEnabled(_v: boolean) { /* egal */ },
        fillRect(x: number, y: number, w: number, h: number) { rec.rects.push([x, y, w, h]); },
        drawImage() { rec.drawImages++; },
      };
      (rec as unknown as { getContext: () => typeof ctx }).getContext = () => ctx;
      canvases.push(rec);
      return rec as unknown as HTMLCanvasElement;
    },
  });
});

type FakeImage = {
  key: string;
  texture: { key: string };
  visible: boolean;
  x: number;
  y: number;
  setOrigin: () => FakeImage;
  setTexture: (key: string) => FakeImage;
  setVisible: (v: boolean) => FakeImage;
  setPosition: (x: number, y: number) => FakeImage;
};

interface CreateCall {
  key: string;
  gl: object;
  w: number;
  h: number;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
}

/**
 * TextureManager-Stub MIT GL-Wrapper (Seiten-Textur hat glTexture), damit
 * bakeAtlas.registerBaked den Atlas-Pfad (textures.create + __BASE-Frame)
 * nimmt und nicht den Canvas-Renderer-Fallback.
 */
function makeScene() {
  const texturesByKey = new Map<string, { gl: object }>();
  const calls = { addCanvas: [] as string[], create: [] as CreateCall[], refresh: 0 };
  let glSeq = 0;
  const scene = {
    textures: {
      exists: (key: string) => texturesByKey.has(key),
      addCanvas: (key: string) => {
        calls.addCanvas.push(key);
        texturesByKey.set(key, { gl: { id: ++glSeq } });
      },
      get: (key: string) => {
        const t = texturesByKey.get(key);
        return t
          ? { source: [{ glTexture: t.gl }], refresh: () => { calls.refresh++; } }
          : null;
      },
      create: (key: string, gl: object, w: number, h: number) => {
        const tex: CreateCall = { key, gl, w, h, frames: {} };
        Object.assign(tex, {
          remove: (frame: string) => { delete tex.frames[frame]; },
          add: (frame: string, _src: number, x: number, y: number, fw: number, fh: number) => {
            tex.frames[frame] = { x, y, w: fw, h: fh };
          },
        });
        calls.create.push(tex);
        texturesByKey.set(key, { gl });
        return tex as unknown;
      },
      remove: (key: string) => { texturesByKey.delete(key); },
    },
    add: {
      existing: () => undefined,
      image: (_x: number, _y: number, key: string) => {
        const img: FakeImage = {
          key,
          texture: { key },
          visible: true,
          x: 0,
          y: 0,
          setOrigin() { return img; },
          setTexture(k) { img.key = k; img.texture.key = k; return img; },
          setVisible(v) { img.visible = v; return img; },
          setPosition(x, y) { img.x = x; img.y = y; return img; },
        };
        return img;
      },
    },
  };
  return { scene: scene as unknown as import("phaser").Scene, calls };
}

const glyphKey = (color: number, ch: string): string => `glyph_${color}_${ch.charCodeAt(0)}`;

describe("m10-font-glyph-pack: Glyphen im Baked-Atlas", () => {
  it("Glyph-Keys werden als __BASE-Frames auf EINER geteilten Atlas-Seite registriert", () => {
    const { scene, calls } = makeScene();
    new PixelText(scene, 0, 0, "HP 12 LP 88", 13);
    // addCanvas nur fuer die inkrementelle Seite, nicht pro Glyphe:
    expect(calls.addCanvas).toEqual(["baked_page_0"]);
    // 6 einzigartige Zeichen (H, P, 1, 2, L, 8) -> 6 create-Registrierungen:
    expect(calls.create.length).toBe(6);
    const pageGl = texturesGlOf(calls);
    for (const c of calls.create) {
      expect(c.key.startsWith("glyph_13_")).toBe(true);
      expect(c.gl).toBe(pageGl); // geteilte GL-Textur der Seite
      expect(c.w).toBeGreaterThan(0);
      expect(c.h).toBeGreaterThan(0);
      const base = c.frames["__BASE"];
      expect(base).toBeDefined();
      expect(base.w).toBe(GLYPH_W);
      expect(base.h).toBe(GLYPH_H);
    }
  });

  it("unterschiedliche Farben landen auf derselben Seite (kein addCanvas #2)", () => {
    const { scene, calls } = makeScene();
    new PixelText(scene, 0, 0, "AB", 13);
    new PixelText(scene, 0, 0, "AB", 3);
    expect(calls.addCanvas).toEqual(["baked_page_0"]);
    // 2 Zeichen x 2 Farben:
    expect(calls.create.length).toBe(4);
    const pageGl = texturesGlOf(calls);
    expect(calls.create.every((c) => c.gl === pageGl)).toBe(true);
  });

  it("existierende Glyphe: kein neues Canvas, kein create/remove (Wiederverwendung)", () => {
    const { scene, calls } = makeScene();
    const text = new PixelText(scene, 0, 0, "00:01", 13);
    const canvasesAfterFirst = canvases.length;
    const createAfterFirst = calls.create.length;
    // Nur Zeichen, die bereits existieren (0, :, 1):
    for (const t of ["00:10", "00:00", "00:11", "00:01"]) text.setText(t);
    expect(canvases.length).toBe(canvasesAfterFirst);
    expect(calls.create.length).toBe(createAfterFirst);
  });

  it("Glyph-Geometrie ist bit-identisch zur alten addCanvas-Erzeugung", () => {
    const { scene } = makeScene();
    const color = 21;
    new PixelText(scene, 0, 0, "aü9?", color);
    // Glyph-Canvases = 5x7 (Seiten-Canvases sind BAKED_INCREMENTAL_SIZE):
    const glyphCanvases = canvases.filter((c) => c.width === GLYPH_W && c.height === GLYPH_H);
    expect(glyphCanvases.length).toBe(4);
    const chars = ["a", "ü", "9", "?"];
    const expectedHex = "#" + PAL[color].toString(16).padStart(6, "0");
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      // Exakt die alte Logik (font.ts vor m10-atlas-pack):
      const upper = ch.toUpperCase();
      const rows = GLYPHS[upper] ?? GLYPHS[ch] ?? GLYPHS["?"];
      const expected: Array<[number, number, number, number]> = [];
      for (let y = 0; y < GLYPH_H; y++) {
        for (let x = 0; x < GLYPH_W; x++) {
          if (rows[y][x] === "1") expected.push([x, y, 1, 1]);
        }
      }
      const rec = glyphCanvases[i];
      expect(rec.fillStyle).toBe(expectedHex);
      expect(rec.rects).toEqual(expected);
    }
  });

  it("Key-Schema und Konstanten unveraendert (Aufrufer/API stabil)", () => {
    const { scene, calls } = makeScene();
    const text = new PixelText(scene, 0, 0, "HP", 13);
    expect(GLYPH_W).toBe(5);
    expect(GLYPH_H).toBe(7);
    expect(GLYPH_ADVANCE).toBe(6);
    expect(text.textWidth).toBe(2 * GLYPH_ADVANCE - 1);
    // Glyph-Keys behalten das Schema glyph_<color>_<charCode>:
    const keys = calls.create.map((c) => c.key).sort();
    expect(keys).toEqual(
      [glyphKey(13, "H"), glyphKey(13, "P")].sort(),
    );
  });
});

/** gl-Objekt der Seite: alle create-Aufrufe teilen es (1 incremental Seite). */
function texturesGlOf(calls: { create: CreateCall[] }): object {
  return calls.create[0].gl;
}
