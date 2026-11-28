/**
 * M10-vfx-restore-st2 (Stufe 2): Ruecknahme der Glow-dpr-Alpha bei dpr > 2
 * (0,6 -> 0,7 in src/gfx/gen-fx.ts, fxAlphaForDpr) gegen die Messgrenzen.
 *
 * Quellen:
 *   - Treppe + Alpha-Boden: direkte Unit-Pruefung von fxAlphaForDpr.
 *   - Near-White / Draw-Calls: committete Mess-Reports aus
 *     scripts/m10-vfx-st2.mjs (M25-Freeze-Frame, Methode wie m10-vfx-restore.mjs).
 *     Die PNG-Belege sind committet (Whitelist .gitignore) und werden per
 *     existsSync verlangt (Muster tests/vfx-restore.test.ts, f71c3be).
 *
 * Grenzen (Abnahme): Near-White A7 <= 4,16 % (A7-Gate), Draw-Calls <=
 * Vorher + 10 %, 0 JS-Fehler. Der after-Report wird mit K4 committet und
 * in "Stufe 2 (Nachher)" geprueft.
 */
import { describe, expect, it } from "vitest";
import { fxAlphaForDpr } from "../src/gfx/gen-fx";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync, existsSync } from "node:fs";

const NEAR_WHITE_LIMIT = 4.16;
const DRAW_MARGIN = 1.1;

interface St2Profile {
  profile: { label: string; width: number; height: number; dpr: number };
  renderer: { renderer: string; vendor: string };
  frozen: {
    stats: { time: number; enemies: number; fxAlpha: number; lodLevel?: string; bossAlive?: boolean };
    png: string;
    pixels: {
      nearWhiteA7Pct: number;
      nearWhiteA7CropPct: number;
      nearWhiteMinRgb200Pct: number;
      nearWhiteMinRgb200CropPct: number;
    };
  };
  fps: { fps: number; frames: number; avgEnemies: number };
  drawCalls: { drawsMean: number; drawsMedian: number; drawsP95: number; totalDraws: number };
  dprAlphaProbe: { dprAlpha: number | null; alphaScale: number | null; dpr?: number };
  jsErrors: string[];
}

function readReport(path: string): { profiles: St2Profile[] } {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
}

describe("fxAlphaForDpr Stufe 2 (Treppe + Alpha-Boden)", () => {
  it("dpr <= 2 bleibt unberuehrt (1 / 0,8)", () => {
    expect(fxAlphaForDpr(1)).toBe(1);
    expect(fxAlphaForDpr(1.5)).toBe(1);
    expect(fxAlphaForDpr(2)).toBe(0.8);
  });

  it("dpr > 2 ist 0,7 (Stufe 2, vorher 0,6) — Alpha-Boden auch fuer hohe dpr", () => {
    for (const d of [3, 3.5, 4, 8]) expect(fxAlphaForDpr(d)).toBe(0.7);
    expect(fxAlphaForDpr(Number.POSITIVE_INFINITY)).toBe(0.7);
  });

  it("Alpha-Boden: kein dprFaellt unter 0,7 im dpr>2-Pfad, dpr<=1.5 nie unter 1", () => {
    for (const d of [0, -1, Number.NaN]) expect(fxAlphaForDpr(d)).toBe(1);
    for (let d = 2.01; d <= 6; d += 0.5) expect(fxAlphaForDpr(d)).toBeGreaterThanOrEqual(0.7);
  });
});

describe("Stufe 2 Vorher (0,6) — committeter Report", () => {
  const report = readReport("shots/m10-vfx-st2-before.json");

  it("belegt beide Profile im minimal-LOD mit Boss und Freeze-Dichte", () => {
    expect(report.profiles.map((p) => p.profile.label).sort()).toEqual(["640x360@1", "780x360@3"]);
    for (const p of report.profiles) {
      expect(p.frozen.stats.lodLevel).toBe("minimal");
      expect(p.frozen.stats.bossAlive).toBe(true);
      expect(p.frozen.stats.enemies).toBeGreaterThan(250);
    }
  });

  it("PNG-Belege sind committet (f71c3be-Muster)", () => {
    for (const p of report.profiles) {
      expect(existsSync(new URL(`../${p.frozen.png}`, import.meta.url))).toBe(true);
    }
  });

  it("Vorher-Near-White A7 liegt unter dem Gate (4,16 %)", () => {
    for (const p of report.profiles) {
      expect(p.frozen.pixels.nearWhiteA7CropPct).toBeLessThanOrEqual(NEAR_WHITE_LIMIT);
      expect(p.frozen.pixels.nearWhiteA7Pct).toBeLessThanOrEqual(NEAR_WHITE_LIMIT);
    }
  });

  it("dprAlpha-Probe belegt den Altwert 0,6 bei dpr 3 und 1 bei dpr 1", () => {
    const byDpr = new Map(report.profiles.map((p) => [p.profile.dpr, p.dprAlphaProbe.dprAlpha]));
    expect(byDpr.get(1)).toBeCloseTo(1, 3);
    expect(byDpr.get(3)).toBeCloseTo(0.6, 3);
  });

  it("Renderer-String vorhanden (kein SwiftShader), 0 JS-Fehler", () => {
    for (const p of report.profiles) {
      expect(p.renderer.renderer).toContain("Intel");
      expect(p.renderer.renderer).not.toContain("SwiftShader");
      expect(p.jsErrors).toEqual([]);
    }
  });
});

describe("Stufe 2 Nachher (0,7) — committeter Report (K4)", () => {
  const hasAfter = existsSync(new URL("../shots/m10-vfx-st2-after.json", import.meta.url));
  const report = hasAfter ? readReport("shots/m10-vfx-st2-after.json") : null;
  const before = readReport("shots/m10-vfx-st2-before.json");

  it.runIf(hasAfter)("belegt beide Profile im minimal-LOD", () => {
    expect(report!.profiles.map((p) => p.profile.label).sort()).toEqual(["640x360@1", "780x360@3"]);
    for (const p of report!.profiles) {
      expect(p.frozen.stats.lodLevel).toBe("minimal");
      expect(p.frozen.stats.bossAlive).toBe(true);
      expect(existsSync(new URL(`../${p.frozen.png}`, import.meta.url))).toBe(true);
    }
  });

  it.runIf(hasAfter)("dprAlpha-Probe belegt 0,7 bei dpr 3 und unveraendert 1 bei dpr 1", () => {
    const byDpr = new Map(report!.profiles.map((p) => [p.profile.dpr, p.dprAlphaProbe.dprAlpha]));
    expect(byDpr.get(1)).toBeCloseTo(1, 3);
    expect(byDpr.get(3)).toBeCloseTo(0.7, 3);
  });

  it.runIf(hasAfter)("Near-White A7 bleibt unter dem Gate (4,16 %)", () => {
    for (const p of report!.profiles) {
      expect(p.frozen.pixels.nearWhiteA7CropPct).toBeLessThanOrEqual(NEAR_WHITE_LIMIT);
      expect(p.frozen.pixels.nearWhiteA7Pct).toBeLessThanOrEqual(NEAR_WHITE_LIMIT);
    }
  });

  it.runIf(hasAfter)("Draw-Calls <= Vorher + 10 % (je Profil, drawsMean)", () => {
    const beforeMean = new Map(before.profiles.map((p) => [p.profile.label, p.drawCalls.drawsMean]));
    for (const p of report!.profiles) {
      const base = beforeMean.get(p.profile.label);
      expect(base).toBeGreaterThan(0);
      expect(p.drawCalls.drawsMean).toBeLessThanOrEqual(base! * DRAW_MARGIN);
    }
  });

  it.runIf(hasAfter)("Renderer-String vorhanden (kein SwiftShader), 0 JS-Fehler", () => {
    for (const p of report!.profiles) {
      expect(p.renderer.renderer).not.toContain("SwiftShader");
      expect(p.jsErrors).toEqual([]);
    }
  });
});
