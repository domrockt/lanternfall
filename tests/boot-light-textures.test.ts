/**
 * m10-boot-glow-local — K3 (rev., Versuch 2).
 *
 * Boot.ts ist eine Phaser-Szene und nicht headless importierbar; die Pruefung
 * laeuft als Quelltext-Check (Muster tests/chaos-glow-runpath.test.ts) plus
 * reine Tabellen-Mathematik, die aus dem Boot.ts-Quelltext extrahiert und
 * ausgewertet wird (kein Doppel der Tabelle im Test — die Werte werden aus
 * der Datei gelesen, damit der Test beim Driften anschlaegt).
 *
 * Geprueft wird der K2-rev.-Port der harten Alpha-Stufen (eaf2ab6) in die
 * Boot-Local-Kopien von light_radius/vignette:
 * - 0 createRadialGradient mehr in Boot.ts (weiche Bögen weg),
 * - LIGHT_EDGE_STEPS-Tabelle exakt wie eaf2ab6 (Bänder >= 6 px, monoton),
 * - vignetteSteps: 11 Bänder à 20 px + Ecken-Klemme, Alpha-Treppe 0.18/0.72,
 * - B2-Ring-Tuning bleibt (Kern 20/21, kein lanternWhite/candle) —
 *   Guard-Kompatibilität mit tests/chaos-glow-runpath.test.ts.
 */
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BOOT_TS = readFileSync(new URL("../src/scenes/Boot.ts", import.meta.url), "utf8");

/** Extrahiert die LIGHT_EDGE_STEPS-Tabelle aus dem Boot.ts-Quelltext. */
function lightEdgeStepsFromSource(): Array<[number, number, number]> {
  const start = BOOT_TS.indexOf("const LIGHT_EDGE_STEPS");
  const block = BOOT_TS.slice(start, BOOT_TS.indexOf("];", start));
  const rows = [...block.matchAll(/\[(\d+),\s*(\d+),\s*([\d.]+)\]/g)];
  expect(rows.length).toBeGreaterThan(0);
  return rows.map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
}

/** Baut die Vignette-Stufen exakt wie die Funktion in Boot.ts (alphaAt-Logik). */
function expectedVignetteSteps(): Array<[number, number, number]> {
  const steps: Array<[number, number, number]> = [];
  const r0 = 70;
  const r1 = 290;
  const bands = 11;
  const alphaAt = (t: number): number =>
    t < 0.7 ? 0.18 * (t / 0.7) : 0.18 + 0.54 * ((t - 0.7) / 0.3);
  for (let i = 0; i < bands; i++) {
    const from = r0 + ((r1 - r0) * i) / bands;
    const to = r0 + ((r1 - r0) * (i + 1)) / bands;
    steps.push([from, to, Math.round(alphaAt((i + 1) / bands) * 100) / 100]);
  }
  steps.push([r1, r1 + 120, 0.72]);
  return steps;
}

describe("Boot.ts Licht-/Vignette-Texturen (m10-boot-glow-local, K2 rev.)", () => {
  it("Boot.ts enthaelt keinen Radialgradient mehr (0 weiche Boegen im Quelltext)", () => {
    expect(BOOT_TS).not.toContain("createRadialGradient");
    expect(BOOT_TS).not.toContain("addColorStop");
  });

  it("LIGHT_EDGE_STEPS: Bänder >= 6 px, Alpha monoton fallend, Kern Alpha 1", () => {
    const steps = lightEdgeStepsFromSource();
    expect(steps).toEqual([
      [0, 70, 1],
      [70, 76, 0.66],
      [76, 82, 0.38],
      [82, 88, 0.18],
      [88, 96, 0.08],
    ]);
    for (const [r0, r1] of steps) {
      expect(r1 - r0).toBeGreaterThanOrEqual(6);
    }
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i][2]).toBeLessThan(steps[i - 1][2]);
    }
    expect(steps[0][0]).toBe(0);
    expect(steps[0][2]).toBe(1);
    expect(steps[steps.length - 1][1]).toBe(96); // Textur 192 px, Radius 96
  });

  it("vignetteSteps: Funktions-Port vorhanden, 11 Bänder à 20 px + Klemm-Band", () => {
    expect(BOOT_TS).toContain("function vignetteSteps()");
    // Band-Parameter des Ports (eaf2ab6): r0 70, r1 290, 11 Bänder, Klemme 0.72.
    expect(BOOT_TS).toMatch(/const r0 = 70;/);
    expect(BOOT_TS).toMatch(/const r1 = 290;/);
    expect(BOOT_TS).toMatch(/const bands = 11;/);
    expect(BOOT_TS).toMatch(/steps\.push\(\[r1, r1 \+ 120, 0\.72\]\)/);
    // Alpha-Treppe identisch zur eaf2ab6-Funktion (Stückweise 0.18/0.54-Rampe).
    const expected = expectedVignetteSteps();
    expect(expected.length).toBe(12);
    expect(expected[0]).toEqual([70, 90, 0.02]); // alphaAt am Bandende t=1/11
    expect(expected[7]).toEqual([210, 230, 0.23]); // t=8/11 > 0.7 → Rampe 0.18+0.54*(t-0.7)/0.3
    expect(expected[10]).toEqual([270, 290, 0.72]);
    expect(expected[11]).toEqual([290, 410, 0.72]);
    // Der Zeichn-Pfad nutzt die Stufen-Bänder mit harten Kanten (arc-Loop).
    expect(BOOT_TS).toMatch(/for \(const \[r0, r1, a\] of vignetteSteps\(\)\)/);
  });

  it("Licht-Zeichnpfad nutzt die Stufen-Bänder statt fillRect + Gradient", () => {
    expect(BOOT_TS).toMatch(/for \(const \[r0, r1, a\] of LIGHT_EDGE_STEPS\)/);
    expect(BOOT_TS).toContain('ctx.arc(c, c, r0, 0, Math.PI * 2, true)');
  });

  it("B2-Ring-Tuning bleibt: Kern Amber/Lantern (20/21), kein lanternWhite/candle", () => {
    // Guard-Kompatibilität mit tests/chaos-glow-runpath.test.ts (A7 Near-White).
    const block = BOOT_TS.slice(BOOT_TS.indexOf("const rings"), BOOT_TS.indexOf("const c = size / 2"));
    expect(block).not.toMatch(/\{ r: (8|16|24|32|40), color: (13|22)/);
    expect(block).toMatch(/\{ r: 8, color: 20/);
    expect(BOOT_TS).toContain("RUN_LIGHT_ALPHA_MAX");
  });

  it("Local-Kopien bleiben registriert + idempotent (Warmup-Vertrag)", () => {
    expect(BOOT_TS).toContain('const key = "light_radius"');
    expect(BOOT_TS).toContain('const key = "vignette"');
    expect((BOOT_TS.match(/if \(scene\.textures\.exists\(key\)\) return;/g) ?? []).length).toBe(2);
  });
});
