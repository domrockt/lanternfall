import { describe, it, expect, vi } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { FX_GLOW_DEPTH, glowDepthFor } from "../src/systems/FxSystem";
import { DEPTH } from "../src/gfx/depth";

// Phaser wie in tests/tablet-fx-budget.test.ts mocken (Node-Tests ohne window).
vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

/**
 * m10-blend-band-followup (K3, 2026-11-28): Blend-Band-Guard für die
 * Rest-ADD-Quellen NACH dem FX_GLOW_DEPTH-Band (m10-tablet-fx-hotspot).
 *
 * Belage (Vorher, ~/games/.evidence/m10-blend-band-followup/): lokal liegen
 * nach dem Band noch 6,2 Blend-Wechsel/Frame an (worst minute25:stack6+300);
 * die sichtbaren ADD-Inseln (Band 7.5, Lichtkreis 20) kosten dabei NICHTS
 * (A/B runtime-hide) — die verbleibenden Wechsel stammen aus
 * Graphics/SKIP_CHECK und GroundRenderer-Chunks.
 *
 * Diese Tests pinnen je Quelle:
 *  - CombatSystem: alle ADD-Sprites rendern im Glow-Band (Laterne unevolviert
 *    war die letzte ADD-Insel auf DEPTH.fxLow 7, mitten zwischen NORMAL-FX).
 *  - PickupSystem: Powerup-Momente sind KEINE ADD-Quelle (Icon tintFill +
 *    1-px-Grafik in NORMAL), MOMENT_DEPTH bleibt enemyShot+1 (bewusst über
 *    den Gegner-Projektilen, Lesbarkeit im Chaos).
 *  - EnemyProjectiles: Schüsse/Telegraphs/Trails/Hit-Funken sind ADD-frei.
 *
 * Muster: tests/tablet-fx-budget.test.ts (reine Walk-Modelle) und
 * tests/m25-density-mode.test.ts (Quelltext-Assertions, weil CombatSystem in
 * Node ohne echtes Phaser nicht importierbar ist — Phaser.GameObjects fehlt).
 */

const combatSrc = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");
const pickupSrc = readFileSync(new URL("../src/systems/PickupSystem.ts", import.meta.url), "utf8");
const enemyShotsSrc = readFileSync(new URL("../src/systems/EnemyProjectiles.ts", import.meta.url), "utf8");

/** Blend-Wechsel in einer in Zeichenreihenfolge sortierten Population. */
function blendSwitches(sorted: Array<{ depth: number; add: boolean }>): number {
  let switches = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].add !== sorted[i - 1].add) switches++;
  }
  return switches;
}

describe("Blend-Band-Followup: CombatSystem (Waffen-/Evolutions-FX)", () => {
  it("Laterne unevolviert: ADD-Korpus wandert ins Glow-Band, evolviert bleibt NORMAL auf fxLow", () => {
    // Pure Quelle: lanternOrbDepth (Muster glowDepthFor, als Quelltext geprüft,
    // weil CombatSystem in Node ohne echtes Phaser nicht importierbar ist).
    const fn = combatSrc.indexOf("export function lanternOrbDepth");
    expect(fn).toBeGreaterThan(0);
    const body = combatSrc.slice(fn, fn + 400);
    expect(body).toContain("evolved ? DEPTH.fxLow : FX_GLOW_DEPTH");
    // Aufrufstelle: der Korpus nutzt lanternOrbDepth, NICHT mehr DEPTH.fxLow.
    const orbAt = combatSrc.indexOf('"orb_lantern"');
    const orbBlock = combatSrc.slice(orbAt, orbAt + 400);
    expect(orbBlock).toContain(".setDepth(lanternOrbDepth(evolved))");
    expect(orbBlock).not.toContain(".setDepth(DEPTH.fxLow)");
  });

  it("jede ADD-Blend-Zuweisung im CombatSystem sitzt im Glow-Band-Block (FX_GLOW_DEPTH oder lanternOrbDepth)", () => {
    // Alle ADD-Zuweisungen (direkt oder als Ternary-Zweig) finden und prüfen,
    // dass im selben Sprite-Create-Block die Band-Tiefe gesetzt wird.
    const re = /Phaser\.BlendModes\.ADD/g;
    let match: RegExpExecArray | null;
    let checked = 0;
    while ((match = re.exec(combatSrc)) !== null) {
      const before = combatSrc.slice(Math.max(0, match.index - 700), match.index);
      expect(
        /FX_GLOW_DEPTH|lanternOrbDepth/.test(before),
        `ADD-Zuweisung @${match.index} ohne Band-Tiefe im Create-Block`,
      ).toBe(true);
      checked++;
    }
    // Anker: die bekannten Quellen (Wrath-/Soul-Halos, fx_halo-Fallbacks, Laterne).
    expect(checked).toBeGreaterThanOrEqual(5);
  });

  it("Walk-Modell: Laterne (ADD, im Band) erzeugt keine EXTRA-Grenze zwischen den FX-Formen", () => {
    // Population: NORMAL-FX-Formen + ADD-Glows + ADD-Laternen-Korpus (alle im
    // Band) + Gegner + Gegner-Projektile (NORMAL, darüber). Erwartung: genau
    // 2 Grenzen (Bandeintritt/-austritt), wie im hotspot-Band belegt.
    const pop: Array<{ depth: number; add: boolean }> = [];
    for (let i = 0; i < 20; i++) pop.push({ depth: DEPTH.fxLow, add: false });
    for (let i = 0; i < 10; i++) pop.push({ depth: FX_GLOW_DEPTH, add: true }); // Glows
    pop.push({ depth: FX_GLOW_DEPTH, add: true }); // Laternen-Korpus (unevolviert)
    for (let i = 0; i < 8; i++) pop.push({ depth: DEPTH.enemy, add: false });
    for (let i = 0; i < 4; i++) pop.push({ depth: DEPTH.enemyShot, add: false });
    expect(blendSwitches(pop.sort((a, b) => a.depth - b.depth))).toBe(2);
  });

  it("Gegenmodell (Regressions-Anker): alte Laterne (ADD auf fxLow zwischen NORMAL-FX) kostet 2 EXTRA-Grenzen", () => {
    // Alte Welt: der ADD-Korpus lag auf Tiefe 7 ZWISCHEN den NORMAL-FX-Formen
    // (gleiche Tiefe, Phaser sortiert stabil nach Erzeugung) — 2 zusaetzliche
    // Grenzen (rein/raus) gegenueber dem Band.
    const pop: Array<{ depth: number; add: boolean }> = [];
    for (let i = 0; i < 5; i++) pop.push({ depth: DEPTH.fxLow, add: false });
    pop.push({ depth: DEPTH.fxLow, add: true }); // alte Laterne: ADD mitten im NORMAL-Block
    for (let i = 0; i < 5; i++) pop.push({ depth: DEPTH.fxLow, add: false });
    for (let i = 0; i < 10; i++) pop.push({ depth: FX_GLOW_DEPTH, add: true });
    for (let i = 0; i < 8; i++) pop.push({ depth: DEPTH.enemy, add: false });
    expect(blendSwitches(pop.sort((a, b) => a.depth - b.depth))).toBe(4);
  });
});

describe("Blend-Band-Followup: PickupSystem (Powerup-Momente)", () => {
  it("MOMENT_DEPTH bleibt enemyShot+1 — bewusst über den Gegner-Projektilen (Doku im Quelltext)", () => {
    expect(pickupSrc).toContain("export const MOMENT_DEPTH = DEPTH.enemyShot + 1;");
    expect(pickupSrc).toMatch(/Kein ADD/);
  });

  it("Momente sind keine ADD-Quelle: PickupSystem enthält keine ADD-Blend-Zuweisung", () => {
    expect(pickupSrc).not.toContain("Phaser.BlendModes.ADD");
    expect(pickupSrc).not.toContain("BlendModes.ADD");
  });

  it("Ordnung (GAME.md): Moment (15) über Gegnern (9) und deren Projektilen (14), unter dem Licht (20)", () => {
    const moment = DEPTH.enemyShot + 1;
    expect(moment).toBeGreaterThan(DEPTH.enemy);
    expect(moment).toBeGreaterThan(DEPTH.enemyShot);
    expect(moment).toBeLessThan(DEPTH.light);
  });
});

describe("Blend-Band-Followup: EnemyProjectiles (Gegner-Projektile)", () => {
  it("Gegner-Projektile sind ADD-frei: Schüsse/Telegraphs/Trails rendern NORMAL (keine Blend-Quelle)", () => {
    expect(enemyShotsSrc).not.toContain("BlendModes.ADD");
    // Beleganker: launch() setzt den Blend bewusst auf NORMAL.
    expect(enemyShotsSrc).toContain("Phaser.BlendModes.NORMAL");
  });

  it("Ordnung (GAME.md): Band (7.5) liegt unter den Gegnern (9) und ihren Projektilen (14) — ADD-Glows malen nie über Gegnern", () => {
    expect(FX_GLOW_DEPTH).toBeLessThan(DEPTH.enemy);
    expect(FX_GLOW_DEPTH).toBeLessThan(DEPTH.enemyShot);
    expect(glowDepthFor(DEPTH.fxLow, true)).toBe(FX_GLOW_DEPTH);
  });
});
