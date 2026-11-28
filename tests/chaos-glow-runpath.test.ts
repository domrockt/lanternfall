/**
 * M10-chaos-fix-glow-runpath — K2 (B5) + K3 (B1-Teil) + K4 (B2-Run-Anteil).
 *
 * Run.ts ist eine Phaser-Szene und nicht headless importierbar; die Verdrahtung
 * wird per Quelltext-Check geprueft (Muster tests/evo-signature-calls.test.ts,
 * dokumentiert in tests/vfx-restore.test.ts). Die reinen Deckel-Helfer liegen
 * in src/logic/fx-caps.ts und werden direkt unit-getestet.
 */
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RUN_ADD_ALPHA_CAP,
  RUN_ADD_ALPHA_FLOOR,
  RUN_LIGHT_ALPHA_MAX,
  RUN_PARTICLE_SCALE_CAP,
  runAddAlpha,
  uniformScale,
} from "../src/logic/fx-caps";

const RUN_TS = readFileSync(new URL("../src/scenes/Run.ts", import.meta.url), "utf8");

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
    expect((RUN_TS.match(/runAddAlpha\(/g) ?? []).length).toBeGreaterThanOrEqual(5);
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
    const offenders = lines.filter((l: string) => /\.setScale\([^,)]+,[^)]+\)/.test(l));
    for (const l of offenders) {
      expect(l).toMatch(/shadow|aura|hpFill/);
    }
  });
});
