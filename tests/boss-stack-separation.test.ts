import { describe, expect, it } from "vitest";
import {
  resolveBossStackSeparation,
  STACK_GAP_FACTOR,
  stackPairCoverage,
  type StackNode,
} from "../src/logic/separation";

/**
 * M10-boss-stack-separation: Boss-/Elite-Stapel müssen sich entzerren.
 *
 * Befund (late-1920, games/.review/out2/): mehrere Bosse/Elites überlappen zu
 * einem Haufen — Silhouetten und HP-Zuordnung unlesbar. Abnahme (Dom/Claude
 * 28.11. 08:15Z): Szene mit ≥ 3 Bossen/Elites auf engem Raum, kein Paar mit
 * > 80 % Sprite-Deckung (Kreisdistanz vs. Summe der Radien) und keine
 * Oszillation > 1 px/Frame im Stand.
 *
 * Rein rechnerisch wie tests/boss-lure-fair.test.ts — kein Renderer nötig.
 * Radien sind Trennradien: Bosse = Sprite-Halbbreite (28..48), Elites =
 * Hit-Radius; die Trefferfläche allein würde die sichtbare Stapelung
 * unterschätzen.
 */

const BOSS_A = 32; // Sprite 64 px (Knochenfürst)
const BOSS_B = 36; // Sprite 72 px (Fahler Hirte)
const BOSS_C = 40; // Sprite 80 px (Glockenturm-Golem)

/** ≥ 3 Bosse + Elites fast deckungsgleich auf engem Raum. */
function makePile(): StackNode[] {
  return [
    { x: 500, y: 300, radius: BOSS_A, uid: 11, alive: true },
    { x: 503, y: 302, radius: BOSS_B, uid: 23, alive: true },
    { x: 501.5, y: 300.5, radius: BOSS_C, uid: 37, alive: true },
    { x: 502, y: 301, radius: 10, uid: 41, alive: true },
    { x: 500.5, y: 302.5, radius: 10, uid: 55, alive: true },
    { x: 501, y: 299, radius: 12, uid: 60, alive: true },
  ];
}

function worstCoverage(nodes: StackNode[]): number {
  let worst = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      worst = Math.max(
        worst,
        stackPairCoverage(b.x - a.x, b.y - a.y, a.radius, b.radius),
      );
    }
  }
  return worst;
}

function runFrames(nodes: StackNode[], frames: number): void {
  for (let i = 0; i < frames; i++) resolveBossStackSeparation(nodes);
}

describe("M10-boss-stack-separation: Stapel entzerren", () => {
  it("Szene startet mit > 80 % Sprite-Deckung (Befund reproduziert)", () => {
    const nodes = makePile();
    expect(worstCoverage(nodes)).toBeGreaterThan(0.8);
  });

  it("kein Paar > 80 % Deckung nach 60 Frames", () => {
    const nodes = makePile();
    runFrames(nodes, 60);
    const worst = worstCoverage(nodes);
    expect(worst).toBeLessThanOrEqual(0.8);
    // zusätzlich: Zielabstand erreicht (Deckung am Ziel = 1 - Gap-Faktor)
    expect(worst).toBeLessThanOrEqual(1 - STACK_GAP_FACTOR + 0.01);
  });

  it("kein Oszillieren im Stand: nach Konvergenz ≤ 1 px/Frame", () => {
    const nodes = makePile();
    runFrames(nodes, 90); // konvergieren lassen
    let maxStep = 0;
    for (let f = 0; f < 120; f++) {
      const before = nodes.map((n) => ({ x: n.x, y: n.y }));
      resolveBossStackSeparation(nodes);
      for (let i = 0; i < nodes.length; i++) {
        const step = Math.hypot(nodes[i].x - before[i].x, nodes[i].y - before[i].y);
        maxStep = Math.max(maxStep, step);
      }
    }
    expect(maxStep).toBeLessThanOrEqual(1);
  });

  it("Sprungfreiheit: getrennte Paare werden exakt nicht angefasst", () => {
    const nodes: StackNode[] = [
      { x: 500, y: 300, radius: BOSS_A, uid: 11, alive: true },
      { x: 500 + 2 * STACK_GAP_FACTOR * (BOSS_A + BOSS_B), y: 300, radius: BOSS_B, uid: 23, alive: true },
    ];
    const before = nodes.map((n) => ({ x: n.x, y: n.y }));
    runFrames(nodes, 30);
    expect(nodes[0].x).toBe(before[0].x);
    expect(nodes[0].y).toBe(before[0].y);
    expect(nodes[1].x).toBe(before[1].x);
  });

  it("bewegt Elites deutlich mehr als den Boss (Massengewichtung)", () => {
    const nodes: StackNode[] = [
      { x: 500, y: 300, radius: BOSS_A, uid: 11, alive: true },
      { x: 510, y: 300, radius: 10, uid: 41, alive: true },
    ];
    resolveBossStackSeparation(nodes);
    const bossMove = Math.abs(nodes[0].x - 500);
    const eliteMove = Math.abs(nodes[1].x - 510);
    expect(eliteMove).toBeGreaterThan(bossMove * 4);
    // kein Voll-Snapping: der Schritt bleibt ein sanfter Anteil
    expect(eliteMove).toBeLessThan(4);
  });

  it("ist deterministisch (gleiche Eingabe ⇒ bitgleiche Ausgabe)", () => {
    const a = makePile();
    const b = makePile();
    runFrames(a, 30);
    runFrames(b, 30);
    for (let i = 0; i < a.length; i++) {
      expect(a[i].x).toBe(b[i].x);
      expect(a[i].y).toBe(b[i].y);
    }
  });

  it("ignoriert tote Knoten (alive=false)", () => {
    const nodes: StackNode[] = [
      { x: 500, y: 300, radius: BOSS_A, uid: 11, alive: true },
      { x: 501, y: 301, radius: BOSS_B, uid: 23, alive: false },
    ];
    const before = { x: nodes[0].x, y: nodes[0].y };
    runFrames(nodes, 10);
    expect(nodes[0].x).toBe(before.x);
    expect(nodes[0].y).toBe(before.y);
  });
});
