/**
 * M10-chaos-fix-glow-runpath — K2 (B5) + K3 (B1-Teil) + K4 (B2-Run-Anteil).
 *
 * Run.ts ist eine Phaser-Szene und nicht headless importierbar; die Verdrahtung
 * wird per Quelltext-Check geprueft (Muster tests/evo-signature-calls.test.ts,
 * dokumentiert in tests/vfx-restore.test.ts). Die reinen Deckel-Helfer liegen
 * in src/logic/fx-caps.ts und werden direkt unit-getestet.
 */
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PILLAR_BAKE_MAX_LEVEL,
  pillarBakeLevel,
  RUN_ADD_ALPHA_CAP,
  RUN_ADD_ALPHA_FLOOR,
  RUN_LIGHT_ALPHA_MAX,
  RUN_PARTICLE_SCALE_CAP,
  runAddAlpha,
  uniformScale,
} from "../src/logic/fx-caps";

const RUN_TS = readFileSync(new URL("../src/scenes/Run.ts", import.meta.url), "utf8");

describe("fx_pillar/fx_shock Bake-Pfad (B1-Teil, Mixel-Rest des fx-mixel-fix)", () => {
  it("waehlt kleinste Bake-Stufe >= |scale|, Draw-Scale bleibt <= 1 (bis Cap)", () => {
    expect(pillarBakeLevel(0.4)).toBe(1);
    expect(pillarBakeLevel(1)).toBe(1);
    expect(pillarBakeLevel(1.4)).toBe(2);
    expect(pillarBakeLevel(2.4)).toBe(3);
    expect(pillarBakeLevel(3.2)).toBe(4);
    expect(pillarBakeLevel(NaN)).toBe(1);
    // Dokumentierter Fallback (wie mixelLevelFor): über dem Cap fällt der
    // Draw-Scale wieder auf > 1 — aktuell erreicht kein Run-Caller das.
    expect(pillarBakeLevel(5)).toBe(PILLAR_BAKE_MAX_LEVEL);
    for (const s of [0.4, 0.9, 1.4, 1.5, 2.4, 2.8, 3.4]) {
      // Draw-Scale = Scale/L <= 1 (rechnerisch, wie addPillarImage zeichnet).
      expect(s / pillarBakeLevel(s)).toBeLessThanOrEqual(1);
    }
  });

  it("Run.ts: keine direkten makeImage-Pfade fuer fx_pillar/fx_shock mehr", () => {
    expect(RUN_TS).not.toMatch(/makeImage\(this,[^)]*"fx_pillar"/);
    expect(RUN_TS).not.toMatch(/makeImage\(this,[^)]*"fx_shock"/);
    // Alle drei pillar-Stellen (dawn rays, levelup, chest) ueber den Bake-Helper:
    expect((RUN_TS.match(/addPillarImage\(/g) ?? []).length).toBeGreaterThanOrEqual(4); // 1 Def + 3 Calls
    // fx_shock-Ring (playEvolutionFx) ueber den FxSystem-Bake-Pfad:
    expect(RUN_TS).toMatch(/spawnAnim\("fx_shock", x, y, \{/);
  });

  it("Bake-Stufen sind nearest (imageSmoothingEnabled=false) und idempotent", () => {
    expect(RUN_TS).toContain("imageSmoothingEnabled = false");
    expect(RUN_TS).toContain("scene.textures.exists(key)");
  });
});

describe("Boot.ts Glow-Deckel (B2-Run-Anteil, Quelltext-Check)", () => {
  const BOOT_TS = readFileSync(new URL("../src/scenes/Boot.ts", import.meta.url), "utf8");

  it("light_radius-Rampen-Ende ist Amber/Lantern, kein lanternWhite/candle-Kern", () => {
    // createLightTextureLocal: Kern (kleine Radien) darf nicht mehr die
    // near-white Palette 13/22 nutzen (A7: b >= 150 und r >= 235).
    const block = BOOT_TS.slice(BOOT_TS.indexOf("const rings"), BOOT_TS.indexOf("const c = size / 2"));
    expect(block).not.toMatch(/\{ r: (8|16|24|32|40), color: (13|22)/);
    expect(block).toMatch(/\{ r: 8, color: 20/);
  });

  it("Deckel-Kommentar dokumentiert den Boot-seitigen Alpha/Blend-Deckel", () => {
    expect(BOOT_TS).toContain("RUN_LIGHT_ALPHA_MAX");
  });
});

describe("After-Messung (Gate, shots/m10-chaos-fix-glowpath-after.json)", () => {
  // @ts-ignore — URL Relatives Pfadmuster wie oben.
  const hasAfter = existsSync(new URL("../shots/m10-chaos-fix-glowpath-after.json", import.meta.url));
  const after = hasAfter
    ? JSON.parse(readFileSync(new URL("../shots/m10-chaos-fix-glowpath-after.json", import.meta.url), "utf8"))
    : null;

  it("liegt mit dem Fix unter dem A7-Gate 4,16 % (ganzer Frame UND Crop)", () => {
    expect(after).not.toBeNull();
    expect(after.worstNearWhiteA7Pct).toBeLessThanOrEqual(4.16);
    for (const p of after.profiles) {
      for (const f of p.frames) {
        expect(f.pixels.nearWhiteA7Pct).toBeLessThanOrEqual(4.16);
        expect(f.pixels.nearWhiteA7CropPct).toBeLessThanOrEqual(4.16);
      }
    }
  });

  it("Beleg ist iGPU (kein SwiftShader), ohne JS-Fehler, FPS >= 50", () => {
    for (const p of after.profiles) {
      expect(p.renderer.swiftShader).toBe(false);
      expect(p.renderer.renderer).toMatch(/ANGLE/);
      expect(p.fps.fps).toBeGreaterThanOrEqual(50);
    }
    expect(after.jsErrors).toEqual([]);
  });
});

describe("fx-caps (Run-seitiger ADD-Pfad, B2/B5)", () => {
  it("deckelt ADD-Alpha oben (nie voll weiss allein) und unten (kein negativer Alpha)", () => {
    expect(RUN_ADD_ALPHA_CAP).toBeLessThan(1);
    expect(RUN_ADD_ALPHA_FLOOR).toBe(0);
    expect(runAddAlpha(0.95)).toBe(RUN_ADD_ALPHA_CAP);
    expect(runAddAlpha(1)).toBe(RUN_ADD_ALPHA_CAP);
    expect(runAddAlpha(0.6)).toBe(0.6);
    expect(runAddAlpha(-0.5)).toBe(0);
  });

  it("erzwingt einheitliche Scale (kein nicht-uniformes Strecken, B5) mit Cap", () => {
    expect(uniformScale(1.4, 1.6)).toEqual({ x: 1.4, y: 1.4 });
    expect(uniformScale(0.9, 1.1)).toEqual({ x: 0.9, y: 0.9 });
    expect(uniformScale(2.4, 3.2)).toEqual({ x: RUN_PARTICLE_SCALE_CAP, y: RUN_PARTICLE_SCALE_CAP });
    expect(uniformScale(5, 5)).toEqual({ x: RUN_PARTICLE_SCALE_CAP, y: RUN_PARTICLE_SCALE_CAP });
    expect(uniformScale(-2, -3)).toEqual({ x: -2, y: -2 });
  });
});

describe("Run.ts-Verdrahtung ADD-Deckel (Quelltext-Check)", () => {
  it("Lauflicht-Alpha nutzt den Deckel RUN_LIGHT_ALPHA_MAX (beide Pfaden)", () => {
    expect(RUN_LIGHT_ALPHA_MAX).toBeLessThan(0.85);
    expect((RUN_TS.match(/RUN_LIGHT_ALPHA_MAX \*/g) ?? []).length).toBe(2);
    expect(RUN_TS).not.toContain("setAlpha(0.85");
  });

  it("alle Run-seitigen ADD-Alphas laufen ueber runAddAlpha", () => {
    // splash drop, dawn rays, dawn sun, levelup pillar, chest beam (+ K3: ring)
    expect((RUN_TS.match(/runAddAlpha\(/g) ?? []).length).toBeGreaterThanOrEqual(10);
    // Review-Followup: keine unkappchten ADD-alphaFrom-Werte in spawnAnim-Calls
    // (fx_boss_core ist bewusst ausgenommen — Boss-FX-Regime mit Alpha-Boden).
    expect(RUN_TS).not.toMatch(/alphaFrom: (0\.9|1|0\.85), alphaTo: 0, additive: true/);
  });

  it("kein nicht-uniformes setScale an den FX-Stellen mehr (B5)", () => {
    // Alte Befund-Stellen (Audit 640-360-1-m25-2-4x: gestreckter Partikel):
    expect(RUN_TS).not.toContain("setScale(1.4, 1.6)");
    expect(RUN_TS).not.toContain("setScale(0.9, 1.1)");
    expect(RUN_TS).not.toContain("setScale(2.4 + (i % 2) * 0.5, 3.2)");
    expect(RUN_TS).not.toContain("scaleX: 2.4, scaleY: 2.2");
    expect(RUN_TS).not.toContain("scaleX: 1.5");
  });

  it("die verbleibenden zwei-Argument-setScale sind keine Partikel (Schatten/Aura/HP)", () => {
    const lines = RUN_TS.split("\n");
    const offenders = lines.filter((l: string) =>
      /\.setScale\([^,)]+,[^)]+\)/.test(l) && !/uniformScale|draw\.x, draw\.y/.test(l));
    for (const l of offenders) {
      expect(l).toMatch(/shadow|aura|hpFill/);
    }
  });
});
