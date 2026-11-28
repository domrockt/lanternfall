// m10-hazard-tex-cap K3: Textur-Cap fuer die Hazard-Telegraph-Canvases.
//
// Bedarfsmeldung m10-heap-regression-fix: hazard_disc/ring/beam-Canvases werden pro
// Radius bzw. Laenge gebacken und nie freigegeben (1-px-Quantisierung -> Nachbar-Keys
// wie hazard_disc_r22/r24, hazard_beam_l832/l840) — ungebundener Heap-Wachstumshebel.
// Fix (K2): Textur-Spezifikation auf grobes 16-px-Raster abrundend quantisieren; die
// Zahl moeglicher Keys ist damit hart gebunden, unabhaengig von Spieldauer/Seed.
import { describe, expect, it, vi } from "vitest";
// document-Stub (wie hazard-disc.test.ts): bakeFromMask zeichnet in eine Canvas —
// im Node-Test genuegt ein Zahlen-Sammler, gezaehlt wird der addCanvas-Key.
vi.stubGlobal("document", {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      globalAlpha: 1,
      fillStyle: "",
      fillRect: () => {},
    }),
  }),
});
import {
  BEAM_W,
  DISC_STACK_THRESHOLD,
  TEX_BEAM_COUNT,
  TEX_BEAM_MAX,
  TEX_BEAM_MIN,
  TEX_QUANT_STEP,
  TEX_RADIUS_COUNT,
  TEX_RADIUS_MAX,
  TEX_RADIUS_MIN,
  beamMask,
  beamRimMask,
  discMask,
  hazardBeamRimTexture,
  hazardBeamTexture,
  hazardDiscTexture,
  hazardRingTexture,
  quantizedBeamLength,
  quantizedRadius,
  ringMask,
  texQuantizedBeamLength,
  texQuantizedRadius,
} from "../src/gfx/hazardDisc";

describe("hazard-tex-cap: 16-px-Textur-Raster (Quantisierungstabelle)", () => {
  it("texQuantizedRadius rundet auf 16-px-Raster ABRUNDEND und klemmt auf 8..160", () => {
    const tabelle: Array<[number, number]> = [
      [Number.NaN, 8], [0, 8], [7.9, 8], [8, 8], [15, 8], [15.9, 8],
      [16, 16], [22.4, 16], [23, 16], [24, 16], [31.9, 16], [32, 32],
      [60, 48], [61, 48], [95.9, 80], [96, 96], [159.9, 144], [160, 160],
      [161, 160], [9999, 160],
    ];
    for (const [eingang, erwartet] of tabelle) {
      expect(texQuantizedRadius(eingang), `texQuantizedRadius(${eingang})`).toBe(erwartet);
    }
  });

  it("texQuantizedBeamLength rundet auf 16-px-Raster ABRUNDEND und klemmt auf 8..1024", () => {
    const tabelle: Array<[number, number]> = [
      [Number.NaN, 8], [0, 8], [7.9, 8], [8, 8], [16, 16], [17, 16],
      [112, 112], [120, 112], [216, 208], [421, 416], [832, 832], [840, 832],
      [1023.9, 1008], [1024, 1024], [99999, 1024],
    ];
    for (const [eingang, erwartet] of tabelle) {
      expect(texQuantizedBeamLength(eingang), `texQuantizedBeamLength(${eingang})`).toBe(erwartet);
    }
  });

  it("Toleranz: Abweichung zur 1-px-Quantisierung bleibt < TEX_QUANT_STEP (abrundend nie groesser)", () => {
    for (let r = 0; r <= 400; r += 0.5) {
      const fein = quantizedRadius(r);
      const grob = texQuantizedRadius(r);
      expect(grob).toBeLessThanOrEqual(fein);
      // Halbe-pixel-Rundung des Feinrasts: max. Abweichung = TEX_QUANT_STEP (am x.5-Rand).
      expect(fein - grob).toBeLessThanOrEqual(TEX_QUANT_STEP);
    }
    for (let l = 0; l <= 2000; l += 0.5) {
      const fein = quantizedBeamLength(l);
      const grob = texQuantizedBeamLength(l);
      expect(grob).toBeLessThanOrEqual(fein);
      expect(fein - grob).toBeLessThanOrEqual(TEX_QUANT_STEP);
    }
  });

  it("Masken werden mit den gerasterten Radien bitgleich gefuettert (nur Input aendert sich)", () => {
    const r = texQuantizedRadius(60); // 48
    expect(discMask(r).length).toBe((2 * r + 3) ** 2);
    expect(ringMask(r).length).toBe((2 * r + 3) ** 2);
    const l = texQuantizedBeamLength(223.6); // 208
    expect(beamMask(l).length).toBe(BEAM_W * l);
    expect(beamRimMask(l).length).toBe(10 * l);
    // Klemm-Grenzen unverändert sichtbar in den Maskenwerten.
    expect(discMask(TEX_RADIUS_MIN).length).toBe((2 * TEX_RADIUS_MIN + 3) ** 2);
    expect(discMask(TEX_RADIUS_MAX).length).toBe((2 * TEX_RADIUS_MAX + 3) ** 2);
  });
});

/** Stub-Szene wie in hazard-disc.test.ts: addCanvas zaehlt gebackene Keys. */
function mkBakeScene(): { scene: import("phaser").Scene; baked: Set<string> } {
  const baked = new Set<string>();
  const scene = {
    textures: {
      exists: (key: string) => baked.has(key),
      addCanvas: vi.fn((key: string) => {
        baked.add(key);
      }),
    },
  } as unknown as import("phaser").Scene;
  return { scene, baked };
}

describe("hazard-tex-cap: Key-Anzahl ist hart gebunden (Cap-Verhalten)", () => {
  it("200 unterschiedliche Radien erzeugen hoechstens TEX_RADIUS_COUNT Keys je Familie", () => {
    const { scene, baked } = mkBakeScene();
    for (let r = 1; r <= 200; r++) hazardDiscTexture(scene, r);
    for (let r = 1; r <= 200; r++) hazardRingTexture(scene, r);
    const discKeys = [...baked].filter((k) => k.startsWith("hazard_disc_r")).length;
    const ringKeys = [...baked].filter((k) => k.startsWith("hazard_ring_r")).length;
    expect(discKeys).toBeLessThanOrEqual(TEX_RADIUS_COUNT);
    expect(ringKeys).toBeLessThanOrEqual(TEX_RADIUS_COUNT);
    expect(discKeys).toBe(TEX_RADIUS_COUNT); // alle Radien des Rasters wirklich erreicht
    expect(ringKeys).toBe(TEX_RADIUS_COUNT);
  });

  it("200 unterschiedliche Strahl-Laengen erzeugen hoechstens TEX_BEAM_COUNT Keys je Familie", () => {
    const { scene, baked } = mkBakeScene();
    for (let l = 1; l <= 200; l++) hazardBeamTexture(scene, l * 7);
    for (let l = 1; l <= 200; l++) hazardBeamRimTexture(scene, l * 7);
    const beamKeys = [...baked].filter((k) => k.startsWith("hazard_beam_l")).length;
    const rimKeys = [...baked].filter((k) => k.startsWith("hazard_beam_rim_l")).length;
    expect(beamKeys).toBeLessThanOrEqual(TEX_BEAM_COUNT);
    expect(rimKeys).toBeLessThanOrEqual(TEX_BEAM_COUNT);
  });

  it("Gesamt-Cap ueber alle vier Key-Familien: <= 2*RADIUS + RADIUS + 2*BEAM Keys", () => {
    const cap = 2 * TEX_RADIUS_COUNT + TEX_RADIUS_COUNT + 2 * TEX_BEAM_COUNT;
    const { scene, baked } = mkBakeScene();
    for (let i = 1; i <= 300; i++) {
      const r = i * 1.7;
      const l = i * 5.3;
      hazardDiscTexture(scene, r);
      hazardRingTexture(scene, r);
      hazardBeamTexture(scene, l);
      hazardBeamRimTexture(scene, l);
    }
    expect(baked.size).toBeLessThanOrEqual(cap);
    expect(cap).toBe(2 * 11 + 11 + 2 * 65); // 163 — fest dokumentierte Obergrenze
  });

  it("Bestehende Keys bleiben stabil (exists greift, kein Re-Bake)", () => {
    const { scene, baked } = mkBakeScene();
    const key1 = hazardDiscTexture(scene, 60);
    expect(baked.has(key1)).toBe(true);
    const addCanvas = (scene.textures as unknown as { addCanvas: ReturnType<typeof vi.fn> }).addCanvas;
    hazardDiscTexture(scene, 60.4); // gleicher Raster-Key
    expect(addCanvas).toHaveBeenCalledTimes(1);
    expect(key1).toBe(`hazard_disc_r${texQuantizedRadius(60)}`);
  });

  it("Stapel-Stufe erzeugt nur die eine zusaetzliche Key-Familie (_s1), Cap unveraendert", () => {
    const warnDisc = { kind: "circle", triggered: false, active: true };
    const mkStackScene = (n: number) => ({
      hazards: { active: Array.from({ length: n }, () => warnDisc) },
      textures: { exists: () => false, addCanvas: vi.fn() },
    }) as unknown as import("phaser").Scene;
    const few = mkStackScene(DISC_STACK_THRESHOLD - 1);
    const many = mkStackScene(DISC_STACK_THRESHOLD);
    const base = hazardDiscTexture(few, 60);
    const stacked = hazardDiscTexture(many, 60);
    expect(base).toBe(`hazard_disc_r${texQuantizedRadius(60)}`);
    expect(stacked).toBe(`${base}_s1`);
  });
});
