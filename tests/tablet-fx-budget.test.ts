import { describe, it, expect, vi } from "vitest";
import { FX_GLOW_DEPTH, glowDepthFor } from "../src/systems/FxSystem";
import { DEPTH } from "../src/gfx/depth";

// Phaser wie in tests/fx-add-cap.test.ts mocken (Node-Tests ohne window).
vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

/**
 * M10-tablet-fx-hotspot (K2, 2026-11-28): Budget-/Gruppierungs-Invariante.
 *
 * Root Cause (docs/lanes/m10-tablet-fx-rootcause.md, Belege
 * ~/games/.evidence/m10-tablet-fx-rootcause/): Phaser flushed den Batch bei
 * jeder ADD<->NORMAL-Grenze im depth-sortierten Render-Walk (flush + blendFunc
 * + Vertex-Upload). ADD-Glows lagen bisher auf DEPTH.fxLow (7) mitten zwischen
 * NORMAL-Draws -> 32 Blend-Wechsel/Frame bei vollem Evo-Stapel (gemessen,
 * before.json). Fix: alle echten ADD-Glows rendern im Band FX_GLOW_DEPTH,
 * sodass der Walk sie als EINEN Block zeichnet.
 *
 * Die Tests hier sind pure Funktionen (kein Phaser): sie modellieren den
 * depth-sortierten Walk ueber eine gemischte Population und zaehlen
 * Blend-Wechsel. Reale Belege: scripts/m10-tablet-fx.mjs
 * (~/games/.evidence/m10-tablet-fx-hotspot/).
 */

/** Blend-Wechsel in einer in Zeichenreihenfolge sortierten Population. */
function blendSwitches(sorted: Array<{ depth: number; add: boolean }>): number {
  let switches = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].add !== sorted[i - 1].add) switches++;
  }
  return switches;
}

function walkOrder(pop: Array<{ baseDepth: number; glow: boolean }>): Array<{ depth: number; add: boolean }> {
  return pop
    .map((p) => ({ depth: glowDepthFor(p.baseDepth, p.glow), add: p.glow }))
    .sort((a, b) => a.depth - b.depth);
}

/** Census des Root-Cause-Fensters stackA:+6: 38 ADD-Glows zwischen 26+ NORMAL-Sprites. */
function censusStackA6(): Array<{ baseDepth: number; glow: boolean }> {
  const pop: Array<{ baseDepth: number; glow: boolean }> = [];
  // Boden-Decals + Gems (NORMAL, unter den FX)
  for (let i = 0; i < 8; i++) pop.push({ baseDepth: DEPTH.decal, glow: false });
  for (let i = 0; i < 10; i++) pop.push({ baseDepth: DEPTH.gem, glow: false });
  // FX-Formen/Trails (NORMAL, fxLow) und ADD-Glows (gleiche Basis-Tiefe, gemischt)
  for (let i = 0; i < 26; i++) pop.push({ baseDepth: DEPTH.fxLow, glow: false });
  for (let i = 0; i < 38; i++) pop.push({ baseDepth: DEPTH.fxLow, glow: true });
  // Gegner/Projektile (NORMAL, ueber den FX)
  for (let i = 0; i < 12; i++) pop.push({ baseDepth: DEPTH.enemy, glow: false });
  for (let i = 0; i < 6; i++) pop.push({ baseDepth: DEPTH.enemyShot, glow: false });
  return pop;
}

describe("FX_GLOW_DEPTH (ADD-Band, Optik-Ordnung bleibt)", () => {
  it("liegt strikt zwischen fxLow (NORMAL-FX-Formen) und death (Gegner-Tode-Decals)", () => {
    expect(FX_GLOW_DEPTH).toBeGreaterThan(DEPTH.fxLow);
    expect(FX_GLOW_DEPTH).toBeLessThan(DEPTH.death);
  });

  it("liegt unter Gegnern/Bossen/Projektilen (GAME.md: Spieler-VFX < Gegner-Silhouetten)", () => {
    expect(FX_GLOW_DEPTH).toBeLessThan(DEPTH.enemy);
    expect(FX_GLOW_DEPTH).toBeLessThan(DEPTH.enemyShot);
  });

  it("liegt ueber Trail- und Gem-Baendern (Glow leuchtet ueber seiner Form)", () => {
    expect(FX_GLOW_DEPTH).toBeGreaterThan(DEPTH.trail);
    expect(FX_GLOW_DEPTH).toBeGreaterThan(DEPTH.gem);
  });
});

describe("glowDepthFor (Zuordnung Tiefe <-> Glow-Zustand)", () => {
  it("echte ADD-Glows mit Spieler-VFX-Basis-Tiefe landen im Band", () => {
    expect(glowDepthFor(DEPTH.fxLow, true)).toBe(FX_GLOW_DEPTH);
    expect(glowDepthFor(DEPTH.decal, true)).toBe(FX_GLOW_DEPTH);
    expect(glowDepthFor(DEPTH.death, true)).toBe(FX_GLOW_DEPTH);
  });

  it("additive Treffer-/Tod-FX ueber den Gegnern (basis >= enemy) behalten ihre Basis-Tiefe (Review-Fix: Band nur unterhalb)", () => {
    // shard-/dust-/sputter-Bursts rendern auf enemyDeath (11) — im 300er-Gedraenge
    // sonst unsichtbar; sie duerfen NICHT ins Band ruecken (Popping-Gefahr).
    expect(glowDepthFor(DEPTH.enemyDeath, true)).toBe(DEPTH.enemyDeath);
    expect(glowDepthFor(DEPTH.enemy, true)).toBe(DEPTH.enemy);
    expect(glowDepthFor(DEPTH.enemyShot, true)).toBe(DEPTH.enemyShot);
  });

  it("NORMAL-FX behalten ihre gewuenschte Basis-Tiefe (Ordnung unveraendert)", () => {
    expect(glowDepthFor(DEPTH.fxLow, false)).toBe(DEPTH.fxLow);
    expect(glowDepthFor(DEPTH.decal, false)).toBe(DEPTH.decal);
    expect(glowDepthFor(DEPTH.enemyDeath, false)).toBe(DEPTH.enemyDeath);
  });
});

describe("Gruppierungs-Invariante (K2-Abnahme: Blend-Wechsel/Frame < 8)", () => {
  it("stackA:+6-Census: alle ADD-Glows bilden EINEN zusammenhaengenden Block", () => {
    const sorted = walkOrder(censusStackA6());
    const glowIdx = sorted.map((s, i) => (s.add ? i : -1)).filter((i) => i >= 0);
    expect(glowIdx.length).toBe(38);
    expect(glowIdx[glowIdx.length - 1] - glowIdx[0] + 1).toBe(38); // lueckenlos
  });

  it("stackA:+6-Census: Blend-Wechsel/Frame < 8 (vorher gemessen 32)", () => {
    const switches = blendSwitches(walkOrder(censusStackA6()));
    expect(switches).toBeLessThan(8);
  });

  it("vor dem Fix waere derselbe Census massiv ueber dem Budget (Regressions-Anker)", () => {
    // Modell des Alts-Zustands: Glows rendern auf ihrer Basis-Tiefe fxLow,
    // INTERLEAVED mit den NORMAL-FX (so kommt die Population aus den Spawn-
    // Pfaden: jede FX je nach Glow-Budget ADD oder NORMAL, Reihenfolge wie
    // im Anzeigeliste-Einschieben). Deterministisch alterniert.
    const fxLow = censusStackA6().filter((p) => p.baseDepth === DEPTH.fxLow);
    const alt: Array<{ depth: number; add: boolean }> = [];
    let a = 0; let n = 0;
    while (a + n < fxLow.length) {
      if (a <= n * 38 / 26 && a < 38) alt.push({ depth: DEPTH.fxLow, add: fxLow[a++].glow });
      if (n < 26) alt.push({ depth: DEPTH.fxLow, add: fxLow[38 + n++].glow });
    }
    const rest = censusStackA6().filter((p) => p.baseDepth !== DEPTH.fxLow);
    const full = [
      ...rest.filter((p) => p.baseDepth < DEPTH.fxLow).map((p) => ({ depth: p.baseDepth, add: p.glow })),
      ...alt,
      ...rest.filter((p) => p.baseDepth > DEPTH.fxLow).map((p) => ({ depth: p.baseDepth, add: p.glow })),
    ];
    expect(blendSwitches(full)).toBeGreaterThanOrEqual(8);
  });

  it("auch bei Teildeckel (haeufiger NORMAL-Fallback gemischt mit Glows) bleibt der Block zusammenhaengend", () => {
    const pop = censusStackA6();
    // Deckel: jeder dritte Glow faellt auf NORMAL zurueck (Basis-Tiefe).
    for (let i = 0; i < pop.length; i += 3) {
      if (pop[i].glow) pop[i] = { baseDepth: DEPTH.fxLow, glow: false };
    }
    const sorted = walkOrder(pop);
    const glowIdx = sorted.map((s, i) => (s.add ? i : -1)).filter((i) => i >= 0);
    expect(glowIdx[glowIdx.length - 1] - glowIdx[0] + 1).toBe(glowIdx.length);
    expect(blendSwitches(sorted)).toBeLessThan(8);
  });
});
