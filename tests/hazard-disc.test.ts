import { describe, expect, it, vi } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs/zlib bereit.
import { inflateSync } from "node:zlib";
// @ts-ignore — dito
import { readFileSync } from "node:fs";

// Phaser-Stub (hazardDisc.ts nutzt nur den Typ, Hazards.ts die BlendModes).
vi.mock("phaser", () => ({
  default: { BlendModes: { NORMAL: 0, ADD: 1 } },
}));

// atlas-Stub mit Aufruf-Protokoll, damit Draw-Pfad (Key + Scale 1) pruefbar ist.
const imageCalls: { key: string; calls: [string, ...unknown[]][] }[] = [];
vi.mock("../src/gfx/atlas", () => ({
  makeImage: (_scene: unknown, _x: number, _y: number, key: string) => {
    const entry = { key, calls: [] as [string, ...unknown[]][] };
    imageCalls.push(entry);
    const img: Record<string, unknown> = {};
    for (const m of [
      "setDepth", "setBlendMode", "setScale", "setAlpha", "setTint",
      "setRotation", "setVisible", "destroy",
    ]) {
      img[m] = (...args: unknown[]) => { entry.calls.push([m, ...args]); return img; };
    }
    return img;
  },
}));

// document-Stub: bakeFromMask zeichnet in eine Canvas — im Node-Test reicht einZahlen-Sammler.
vi.stubGlobal("document", {
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({
      clearRect: () => {},
      fillStyle: "",
      fillRect: () => {},
    }),
  }),
});

import { HazardSystem } from "../src/systems/Hazards";
import {
  BEAM_RIM_W, BEAM_W, DISC_CONTOUR_I, DISC_FILL_ALPHA, DISC_FILL_ALPHA_BY_STAGE,
  DISC_FILL_ALPHA_STACKED, DISC_FILL_I, DISC_STACK_THRESHOLD, MASK_CLEAR,
  applyMask, beamMask, beamRimMask, discMask, discSide, fillStageForStacks,
  hazardDiscTexture, hazardRingTexture,
  quantizedBeamLength, quantizedRadius, ringMask, warnDiscStacks,
} from "../src/gfx/hazardDisc";
import { PAL, C } from "../src/palette";

const lum = (pi: number) => {
  const v = PAL[pi];
  return 0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255);
};

const colorsIn = (mask: Uint8Array) => new Set([...mask].filter((v) => v !== MASK_CLEAR));

describe("hazardDisc: gebackene Telegraph-Texturen sind gerastert, nicht milchig", () => {
  const radii = [8, 22, 30, 45, 52, 60, 68, 90, 96, 160];

  it("discMask/ringMask enthalten nur Masken-Clear und genau 2 Palettenindizes (kein Gradient)", () => {
    for (const r of radii) {
      const discColors = colorsIn(discMask(r));
      expect([...discColors].sort(), `disc r=${r}`).toEqual([DISC_CONTOUR_I, DISC_FILL_I].sort());
      expect(colorsIn(ringMask(r)), `ring r=${r}`).toEqual(new Set([DISC_CONTOUR_I]));
    }
  });

  it("Sprite-Pixelgroesse: Texturseite = Radius in Spielpixeln, Draw-Scale immer 1", () => {
    for (const r of radii) {
      expect(discSide(r)).toBe(2 * r + 3);
      expect(discMask(r).length).toBe(discSide(r) ** 2);
    }
    expect(quantizedRadius(22.4)).toBe(22);
    expect(quantizedRadius(0)).toBe(8);
    expect(quantizedRadius(Number.NaN)).toBe(8);
    expect(quantizedRadius(9999)).toBe(160);
  });

  it("Warnlesbarkeit: 2-px-Konturband am Radius, heller als die Fuellfarbe", () => {
    for (const r of radii) {
      const side = discSide(r);
      const mask = discMask(r);
      const c = (side - 1) / 2;
      // Konturbreite auf der Horizontalachse: genau 2 Pixel je Seite am Radius.
      const band = [];
      for (let x = 0; x < side; x++) {
        const pi = mask[Math.round(c) * side + x];
        if (pi === DISC_CONTOUR_I && x >= c) band.push(x);
      }
      expect(band.length, `r=${r} Kontur-Pixel je Achse`).toBe(2);
      // Kontur ringfoermig: in 16 Richtungen je ein Kontur-Pixel nahe r-1 (round(d)-Band:
      // die zwei Schichten round(d)=r-1/r liegen pixelgenau, der Idealtyp-Pixel kann zwischen
      // ihnen liegen — daher 3x3-Nachbarschaft statt exaktem Pixel).
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = Math.round(c + Math.cos(a) * (r - 1));
        const y = Math.round(c + Math.sin(a) * (r - 1));
        let near = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (mask[(y + dy) * side + (x + dx)] === DISC_CONTOUR_I) near = true;
          }
        }
        expect(near, `r=${r} winkel ${k}`).toBe(true);
      }
      // Band-Kontrast: Kontur deutlich heller als Fuellung (lesbar als Gefahr-Rand).
      expect(lum(DISC_CONTOUR_I) - lum(DISC_FILL_I)).toBeGreaterThanOrEqual(20);
    }
  });

  it("Fuellung ist flaechig und rasterfrei (Raster-Guard: Flaeche voll, kein Schachbrett)", () => {
    for (const r of [22, 60, 90, 160]) {
      const side = discSide(r);
      const mask = discMask(r);
      const c = (side - 1) / 2;
      let inside = 0, fill = 0;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          if (Math.round(Math.hypot(x - c, y - c)) <= r - 3) {
            inside++;
            // Raster-Guard: JEDE Innen-Flaeche ist Fuellung — kein Loch, kein Dither, kein Muster.
            expect(mask[y * side + x], `r=${r} Flaeche ${x},${y}`).toBe(DISC_FILL_I);
            fill++;
          }
        }
      }
      expect(inside, `r=${r} Innenflaeche nicht leer`).toBeGreaterThan(0);
      expect(fill / inside).toBe(1);
    }
  });

  it("Dither nur am Rand: Uebergangsband genau 1 px (round(d)=r-2), sonst ditherfrei", () => {
    for (const r of [22, 60, 90]) {
      const side = discSide(r);
      const mask = discMask(r);
      const c = (side - 1) / 2;
      let band = 0, bandFill = 0, outsideBand = 0;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const di = Math.round(Math.hypot(x - c, y - c));
          if (di === r - 2) {
            band++;
            if (mask[y * side + x] === DISC_FILL_I) {
              bandFill++;
              // Band-Dither auf (x+y)-Paritaet: benachbarte Bandpixel wechseln (1 px breit).
              if ((x + y) % 2 !== 0) throw new Error(`Band off-parity r=${r} ${x},${y}`);
            }
          } else if (di < r - 2 && mask[y * side + x] !== DISC_FILL_I) {
            outsideBand++;
          }
        }
      }
      expect(band, `r=${r} Band-Pixel`).toBeGreaterThan(0);
      // Uebergangsband: teils Fuellung, teils transparent. Der schmale Annulus sampelt den
      // (x+y)-Checker systematisch schief -> weiter Korridor statt exakter 50 %.
      expect(bandFill / band, `r=${r} Band-Dichte`).toBeGreaterThan(0.3);
      expect(bandFill / band, `r=${r} Band-Dichte`).toBeLessThan(0.8);
      // Innerhalb der Flaeche (<= r-3) genau eine Fuellfarbe, keine Luecken.
      expect(outsideBand, `r=${r} ditherfreie Flaeche`).toBe(0);
    }
  });

  it("ringMask: durchgehendes 2-px-Band ohne Luecken (Rand-Puls lesbar)", () => {
    for (const r of [30, 60, 90]) {
      const side = discSide(r);
      const mask = ringMask(r);
      const c = (side - 1) / 2;
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2;
        const hits = [r - 1, r - 0.5, r].filter((d) => {
          const x = Math.round(c + Math.cos(a) * d);
          const y = Math.round(c + Math.sin(a) * d);
          return mask[y * side + x] === DISC_CONTOUR_I;
        }).length;
        expect(hits, `r=${r} winkel ${k}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("applyMask zeichnet alle nicht-transparenten Pixel genau einmal", () => {
    const mask = discMask(30);
    const painted: [number, number, number][] = [];
    const n = applyMask((x, y, pi) => painted.push([x, y, pi]), mask);
    expect(n).toBe(painted.length);
    expect(n).toBe([...mask].filter((v) => v !== MASK_CLEAR).length);
  });

  it("beamMask/beamRimMask: gerastert in Sprite-Pixelgroesse, Laenge quantisiert abrundend", () => {
    for (const len of [16, 100, 420]) {
      const mask = beamMask(len);
      expect(mask.length).toBe(BEAM_W * quantizedBeamLength(len));
      expect(colorsIn(mask)).toEqual(new Set([DISC_CONTOUR_I, DISC_FILL_I]));
      // Kern = Kontur (2 Spalten), Rand = dunkle Fuellung (hellt nie auf).
      expect(mask[0 * BEAM_W + 3]).toBe(DISC_CONTOUR_I);
      expect(mask[0 * BEAM_W + 2]).toBe(DISC_FILL_I);
      expect(lum(DISC_CONTOUR_I) - lum(DISC_FILL_I)).toBeGreaterThanOrEqual(20);
      const rim = beamRimMask(len);
      expect(rim.length).toBe(BEAM_RIM_W * quantizedBeamLength(len));
      expect(colorsIn(rim)).toEqual(new Set([DISC_CONTOUR_I]));
      expect(rim[0 * BEAM_RIM_W + 4]).toBe(DISC_CONTOUR_I);
      expect(rim[0 * BEAM_RIM_W + 2]).toBe(MASK_CLEAR);
    }
    // Abrundende 8er-Quantiserung: nie laenger als der Treffer-Strahl, begrenzter Cache.
    expect(quantizedBeamLength(421)).toBe(416);
    expect(quantizedBeamLength(7.9)).toBe(8);
    expect(quantizedBeamLength(Number.NaN)).toBe(8);
    expect(quantizedBeamLength(99999)).toBe(1024);
  });
});

describe("Hazards.ts nutzt den Bake mit Draw-Scale 1 (Draw-Pfad sonst bitgleich)", () => {
  const fakeScene = () => ({
    tweens: { add: vi.fn() },
    textures: { exists: () => false, addCanvas: () => {} },
  }) as unknown as import("phaser").Scene;

  it("spawnCircle backt Disc + Ring in Radiengroesse, Scale 1, Gefahr-Tint", () => {
    imageCalls.length = 0;
    const hz = new HazardSystem(fakeScene());
    hz.spawnCircle(40, 40, { warn: 1, damage: 1, radius: 60 });
    expect(imageCalls).toHaveLength(2);
    expect(imageCalls[0].key).toBe("hazard_disc_r60");
    expect(imageCalls[1].key).toBe("hazard_ring_r60");
    const discScale = imageCalls[0].calls.find(([m]) => m === "setScale");
    const rimScale = imageCalls[1].calls.find(([m]) => m === "setScale");
    expect(discScale).toEqual(["setScale", 1]);
    expect(rimScale).toEqual(["setScale", 1]);
    // Warnlogik bitgleich: Alpha-Werte wie zuvor (0.9 Boden, Rim-Puls-Start).
    expect(imageCalls[0].calls.find(([m]) => m === "setAlpha")).toEqual(["setAlpha", 0.9]);
    expect(imageCalls[0].calls.find(([m]) => m === "setTint")?.[1]).toBe(PAL[C.crimson]);
    expect(imageCalls[1].calls.find(([m]) => m === "setTint")?.[1]).toBe(PAL[C.hotRed]);
    // Expliciter color-Index bleibt bedienbar.
    imageCalls.length = 0;
    hz.spawnCircle(40, 40, { warn: 1, damage: 1, radius: 30, color: 25 });
    expect(imageCalls[0].calls.find(([m]) => m === "setTint")?.[1]).toBe(PAL[25]);
  });

  it("spawnBeam backt Strahl + Rand in Laengengroesse, Scale 1 (nie >1x gestreckt)", () => {
    imageCalls.length = 0;
    const hz = new HazardSystem(fakeScene());
    hz.spawnBeam(10, 10, 210, 110, { warn: 1, damage: 1, radius: 16 });
    expect(imageCalls).toHaveLength(2);
    expect(imageCalls[0].key).toBe(`hazard_beam_l${quantizedBeamLength(Math.hypot(200, 100))}`);
    expect(imageCalls[1].key).toBe(`hazard_beam_rim_l${quantizedBeamLength(Math.hypot(200, 100))}`);
    expect(imageCalls[0].calls.find(([m]) => m === "setScale")).toEqual(["setScale", 1]);
    expect(imageCalls[1].calls.find(([m]) => m === "setScale")).toEqual(["setScale", 1]);
    expect(imageCalls[0].calls.find(([m]) => m === "setAlpha")).toEqual(["setAlpha", 0.9]);
    expect(imageCalls[0].calls.find(([m]) => m === "setTint")?.[1]).toBe(PAL[C.crimson]);
    expect(imageCalls[1].calls.find(([m]) => m === "setTint")?.[1]).toBe(PAL[C.hotRed]);
    // Expliciter color-Index am Strahl (fire_cross nutzt 26).
    imageCalls.length = 0;
    hz.spawnBeam(10, 10, 210, 110, { warn: 1, damage: 1, radius: 18, color: 26 });
    expect(imageCalls[0].calls.find(([m]) => m === "setTint")?.[1]).toBe(PAL[26]);
  });
});

describe("K2: Uebergangsband quantisiert + Ringkontur radial konstant 2 px", () => {
  it("Innenkante: 1-px-Ditherband auf (x+y)-Paritaet bei round(d)=r-2, danach feste Kontur", () => {
    for (const r of [8, 30, 60, 160]) {
      const side = discSide(r);
      const mask = discMask(r);
      const c = (side - 1) / 2;
      let cells = 0, fill = 0, offParity = 0;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const di = Math.round(Math.hypot(x - c, y - c));
          if (di === r - 2) {
            cells++;
            if (mask[y * side + x] === DISC_FILL_I) {
              fill++;
              if ((x + y) % 2 !== 0) offParity++;
            }
          } else if (di === r - 1) {
            // Direkt ausserhalb des Bands: Kontur lueckenlos (harte Kante ist ins Band gewandert).
            expect(mask[y * side + x], `r=${r} round(d)=r-1`).toBe(DISC_CONTOUR_I);
          }
        }
      }
      expect(offParity, `r=${r} Band off-parity`).toBe(0);
      const share = cells > 0 ? fill / cells : 0.5;
      // Schmaler Annulus sampelt den Checker systematisch schief -> weiter Korridor.
      expect(share, `r=${r} Band-Dichte`).toBeGreaterThan(0.3);
      expect(share, `r=${r} Band-Dichte`).toBeLessThan(0.8);
    }
  });

  it("Kein 1/2-px-Wechselschlag: beide round(d)-Schichten (r-1 und r) rundum geschlossen", () => {
    for (const r of [8, 30, 45, 60, 90, 160]) {
      const side = discSide(r);
      const c = (side - 1) / 2;
      for (const [name, mask] of [["ring", ringMask(r)], ["disc", discMask(r)]] as const) {
        for (const layer of [r - 1, r]) {
          let closed = 0;
          for (let k = 0; k < 360; k++) {
            const a = (k * Math.PI) / 180;
            let hit = false;
            for (const t of [layer - 0.4, layer, layer + 0.4]) {
              const x = Math.round(c + Math.cos(a) * t);
              const y = Math.round(c + Math.sin(a) * t);
              const idx = y * side + x;
              if (idx >= 0 && idx < mask.length && mask[idx] === DISC_CONTOUR_I) {
                hit = true;
                break;
              }
            }
            if (hit) closed++;
          }
          expect(closed, `${name} r=${r} Schicht round(d)=${layer}`).toBe(360);
        }
      }
    }
  });
});

describe("K3: Stapel-Fuellstufe ab 5 Warn-Discs (deterministisch)", () => {
  it("fillStageForStacks: Stufe 1 genau ab DISC_STACK_THRESHOLD, sonst 0 (inkl. NaN/negativ)", () => {
    for (const n of [0, 1, 4, DISC_STACK_THRESHOLD - 1]) expect(fillStageForStacks(n)).toBe(0);
    for (const n of [DISC_STACK_THRESHOLD, DISC_STACK_THRESHOLD + 1, 9, 40]) {
      expect(fillStageForStacks(n)).toBe(1);
    }
    expect(fillStageForStacks(Number.NaN)).toBe(0);
    expect(fillStageForStacks(-3)).toBe(0);
  });

  it("Raster-Guard-Stapel: Maske ist stufenunabhaengig (flaechige Fuellung, nie Dither-Flaeche)", () => {
    for (const r of [30, 60, 90]) {
      // Nur noch EIN Maskenlayout: kein stage-Parameter mehr, kein 25-%/50-%-Raster im Interieur.
      const mask = discMask(r);
      const side = discSide(r);
      const c = (side - 1) / 2;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          if (Math.round(Math.hypot(x - c, y - c)) <= r - 3) {
            expect(mask[y * side + x], `r=${r} Flaeche ${x},${y}`).toBe(DISC_FILL_I);
          }
        }
      }
    }
  });

  it("Stufe 1: Maske bitgleich zur Basis, Stapel wirkt nur ueber die niedrigere Bake-Alpha", () => {
    const r = 60;
    const m = discMask(r);
    // Alpha-Kurve: Stufe 1 ruhiger als Basis, beide halbtransparent und < 50 %.
    expect(DISC_FILL_ALPHA_BY_STAGE[0]).toBe(DISC_FILL_ALPHA);
    expect(DISC_FILL_ALPHA_BY_STAGE[1]).toBe(DISC_FILL_ALPHA_STACKED);
    expect(DISC_FILL_ALPHA_STACKED).toBeLessThan(DISC_FILL_ALPHA);
    expect(DISC_FILL_ALPHA).toBeLessThan(0.5);
    expect(DISC_FILL_ALPHA).toBeGreaterThan(0.2);
    // Maske enthaelt weiterhin genau die 2 Palettenindizes (kein Gradient, keine 3. Farbe).
    expect([...new Set([...m].filter((v) => v !== MASK_CLEAR))].sort()).toEqual(
      [DISC_CONTOUR_I, DISC_FILL_I].sort(),
    );
  });

  it("warnDiscStacks zaehlt nur warnende Circle-Hazards; Key: <5 Stapel Basis-Key, >=5 '_s1'", () => {
    const warnDisc = { kind: "circle", triggered: false, active: true };
    const mkScene = (active: unknown[]) =>
      ({
        tweens: { add: vi.fn() },
        hazards: { active },
        textures: { exists: () => false, addCanvas: () => {} },
      }) as unknown as import("phaser").Scene;

    expect(warnDiscStacks(mkScene([]))).toBe(0);
    expect(
      warnDiscStacks(mkScene([warnDisc, { kind: "beam", triggered: false, active: true }, { kind: "circle", triggered: true, active: true }])),
    ).toBe(1);

    const sceneFew = mkScene(Array.from({ length: DISC_STACK_THRESHOLD - 1 }, () => warnDisc));
    expect(hazardDiscTexture(sceneFew, 60)).toBe("hazard_disc_r60");
    expect(hazardRingTexture(sceneFew, 60)).toBe("hazard_ring_r60");

    const sceneMany = mkScene(Array.from({ length: DISC_STACK_THRESHOLD }, () => warnDisc));
    expect(hazardDiscTexture(sceneMany, 60)).toBe("hazard_disc_r60_s1");
    // Ring hat keine Fuellung — kein Stufen-Key.
    expect(hazardRingTexture(sceneMany, 60)).toBe("hazard_ring_r60");
  });
});

describe("Vorher-Nachher-Beleg liegt vor und ist belastbar", () => {
  it("before-JSON: 0 JS-Fehler, iGPU-Renderer, Metrik + Akzeptanzgrenze fixiert", () => {
    const raw = JSON.parse(readFileSync(new URL("../shots/m10-chaos-fix-disc-before.json", import.meta.url), "utf8"));
    expect(raw.errors).toEqual([]);
    expect(raw.swiftShader).toBe(false);
    expect(raw.renderer.renderer).toMatch(/Intel/i);
    expect(raw.acceptance.threshold).toMatch(/50/);
    const stress = raw.scenarios.filter((s: { tag: string }) => s.tag.startsWith("stress500"));
    expect(stress.length).toBe(2);
    for (const s of stress) expect(s.milkyShareDiscAvg).toBeGreaterThan(30);
  });
});
