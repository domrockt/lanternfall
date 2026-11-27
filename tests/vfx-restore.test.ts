/**
 * M10-vfx-restore: Prueft das gewaehlte Alpha-Setup gegen die gemessenen Grenzen.
 *
 * Die Messungen stammen aus scripts/m10-vfx-restore.mjs (M25-Frame, ~300 Gegner +
 * Boss -> minimal-LOD; A7-Burst-Spawn-Methode). Die JSON/PNG-Belege sind committet
 * und werden hier als Regressions-Gate gelesen:
 *   - Baseline (Stufe 0): minimal-LOD mit fxAlpha 0,5 (A7-Daempfung).
 *   - Stufe 1 (Run.ts-Hebel, FX_RESTORE_ALPHA = 0,65): Near-White A7 muss <= 4,16 %
 *     bleiben (ACCEPTANCE-A7-Grenze), FPS >= 50, Draw-Calls <= Baseline + 10 %.
 * Die Verdrahtung in Run.ts wird per Quelltext-Check geprueft (Muster
 * tests/evo-signature-calls.test.ts) — Run.ts ist eine Phaser-Szene und nicht
 * headless importierbar.
 */
import { describe, expect, it } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync, existsSync } from "node:fs";

const NEAR_WHITE_LIMIT = 4.16;
const FPS_MIN = 50;
const DRAW_MARGIN = 1.1;

interface ProfileEntry {
  profile: { label: string; width: number; height: number; dpr: number };
  renderer: { renderer: string; vendor: string };
  damped: {
    stats: { time: number; enemies: number; fxAlpha: number; lodLevel?: string; bossAlive?: boolean };
    png: string;
    pixels: {
      nearWhiteA7Pct: number;
      nearWhiteA7CropPct: number;
      nearWhiteMinRgb200Pct: number;
      nearWhiteMinRgb200CropPct: number;
    };
  };
  stage: {
    stats: { time: number; enemies: number; fxAlpha: number; lodLevel?: string };
    png: string;
    pixels: { nearWhiteA7Pct: number; nearWhiteA7CropPct: number };
    sameDensity: boolean;
  } | null;
  fps: { fps: number; frames: number; avgEnemies: number };
  drawCalls: { drawsMedian: number; drawsMean: number; drawsP95: number };
  jsErrors: string[];
}

function readReport(path: string): { stage: number; profiles: ProfileEntry[] } {
  return JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
}

describe("m10-vfx-restore Baseline (Stufe 0, A7-Daempfung)", () => {
  const report = readReport("shots/m10-vfx-restore-baseline.json");

  it("belegt beide Profile mit minimal-LOD und fxAlpha 0,5", () => {
    expect(report.profiles.map((p) => p.profile.label).sort()).toEqual(["640x360@1", "780x360@3"]);
    for (const p of report.profiles) {
      expect(p.damped.stats.lodLevel).toBe("minimal");
      expect(p.damped.stats.fxAlpha).toBe(0.5);
      expect(p.damped.stats.bossAlive).toBe(true);
      // Freeze-Frame nahe am Brief-Ziel von 300 Gegnern (>250 = minimal-LOD nötig).
      expect(p.damped.stats.enemies).toBeGreaterThan(250);
    }
  });

  it("enthält Renderer-String, Draw-Calls, FPS und 0 JS-Fehler", () => {
    for (const p of report.profiles) {
      expect(p.renderer.renderer.length).toBeGreaterThan(0);
      expect(p.drawCalls.drawsMedian).toBeGreaterThan(0);
      expect(p.fps.fps).toBeGreaterThanOrEqual(FPS_MIN);
      expect(p.jsErrors).toEqual([]);
    }
  });

  it("Baseline-Near-White ist im committeten PNG-Beleg dokumentiert", () => {
    for (const p of report.profiles) {
      expect(existsSync(new URL(`../${p.damped.png}`, import.meta.url))).toBe(true);
      expect(p.damped.pixels.nearWhiteA7CropPct).toBeGreaterThanOrEqual(0);
      expect(p.damped.pixels.nearWhiteA7Pct).toBeLessThanOrEqual(NEAR_WHITE_LIMIT);
    }
  });
});

describe("m10-vfx-restore Stufe 1 (Run.ts-Hebel, 0,65) gegen die Messgrenzen", () => {
  const report = readReport("shots/m10-vfx-restore-stage1.json");
  const baseline = readReport("shots/m10-vfx-restore-baseline.json");

  it("misst die Stufe im selben Frame (gleiche Dichte) mit fxAlpha 0,65", () => {
    expect(report.stage).toBeDefined();
    for (const p of report.profiles) {
      expect(report.stage).not.toBeNull();
      expect(p.stage!.sameDensity).toBe(true);
      expect(p.stage!.stats.fxAlpha).toBe(0.65);
      expect(p.stage!.stats.lodLevel).toBe("minimal");
    }
    void report.stage;
  });

  it("haelt Near-White A7 <= 4,16 % (Fullframe UND A7-Crop) in beiden Profilen", () => {
    for (const p of report.profiles) {
      expect(p.stage!.pixels.nearWhiteA7Pct).toBeLessThanOrEqual(NEAR_WHITE_LIMIT);
      expect(p.stage!.pixels.nearWhiteA7CropPct).toBeLessThanOrEqual(NEAR_WHITE_LIMIT);
      expect(existsSync(new URL(`../${p.stage!.png}`, import.meta.url))).toBe(true);
    }
  });

  it("haelt FPS >= 50 und Draw-Calls <= Baseline + 10 %", () => {
    for (let i = 0; i < report.profiles.length; i++) {
      const p = report.profiles[i];
      const b = baseline.profiles[i];
      expect(p.profile.label).toBe(b.profile.label);
      expect(p.fps.fps).toBeGreaterThanOrEqual(FPS_MIN);
      expect(p.drawCalls.drawsMedian).toBeLessThanOrEqual(b.drawCalls.drawsMedian * DRAW_MARGIN);
      expect(p.jsErrors).toEqual([]);
    }
  });
});

describe("m10-vfx-restore Verdrahtung in src/scenes/Run.ts", () => {
  const src = readFileSync(new URL("../src/scenes/Run.ts", import.meta.url), "utf8");

  it("setFxRestore + FX_RESTORE_ALPHA vorhanden und im LOD-Update verdrahtet", () => {
    expect(src).toContain("FX_RESTORE_ALPHA = 0.65");
    expect(src).toContain("setFxRestore(stage: number): void");
    // applyLod ruft die Ruecknahme jeden Frame (idempotent).
    expect(src).toMatch(/applyFxRestore\(\);/);
    // Nur die Run.ts-eigenen Hebel werden beruehrt (kein Import aus lod.ts-Override).
    expect(src).toContain("this.combat?.fx.setAlphaScale(a)");
    expect(src).toContain("this.combat?.particles.setAlphaScale(a)");
  });

  it("greift nur im minimal-LOD mit aktiver Daempfung", () => {
    expect(src).toContain(
      'const active = this.fxDampingEnabled && this.fxRestore > 0 && this.lod.level === "minimal";',
    );
  });
});
