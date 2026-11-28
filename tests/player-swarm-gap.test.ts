import { describe, expect, it } from "vitest";
import {
  fallbackDir,
  PLAYER_GAP_EDGE,
  PLAYER_GAP_MAX_STEP,
  PLAYER_GAP_STRENGTH,
  resolvePlayerGap,
  type CrowdNode,
} from "../src/logic/separation";
import { SpatialHash } from "../src/systems/SpatialHash";

/**
 * M10-player-swarm-gap: Mindest-Abstoß-Ring um den Spieler.
 *
 * Befund (m10-boss-stack-separation, offene Punkte): im Endgame (Minute 25+,
 * 300-500 Gegner) drückt der Kleingegner-Schwarm den Spieler zu — die
 * Lesbarkeits-Restpunkt-A10 "Spieler/HUD klar" kippt im Chaos (Vorher-Messung:
 * 9,4 Gegner < 8 px Sprite-Kante, min-Kante −12,6 px).
 *
 * Abnahme: der Spieler wird NIE bewegt (Funktion kennt nur px/py-Lesezugriff),
 * Gegner im Ring halten den Mindestrand, Gegner außerhalb bleiben exakt
 * unberührt, und 500 Gegner laufen über 2 Läufe bitgleich (Determinismus).
 * Rein rechnerisch wie tests/boss-stack-separation.test.ts — kein Renderer.
 */

const PLAYER_X = 500;
const PLAYER_Y = 300;
const PLAYER_HIT_RADIUS = 6;

/** Kantenabstand wie im Mess-Skript: Zentrierabstand − Spieler-Hitradius − Gegnerradius. */
function edgeDistance(e: CrowdNode): number {
  return Math.hypot(e.x - PLAYER_X, e.y - PLAYER_Y) - PLAYER_HIT_RADIUS - e.radius;
}

/** Dichter Schwarm: n Gegner im/zum Teil tief im Spieler-Kern (Radius 6-8). */
function makeSwarm(n: number, seedShift = 0): CrowdNode[] {
  const nodes: CrowdNode[] = [];
  for (let i = 0; i < n; i++) {
    const uid = i + 1 + seedShift;
    // Deterministische Streuung: Goldener Winkel + wachsender Radius.
    const angle = uid * 2.399963;
    const dist = (uid % 23) * 1.3;
    nodes.push({
      x: PLAYER_X + Math.cos(angle) * dist,
      y: PLAYER_Y + Math.sin(angle) * dist,
      radius: 6 + (uid % 3),
      uid,
      alive: true,
    });
  }
  return nodes;
}

function settle(nodes: CrowdNode[], frames: number): void {
  const hash = new SpatialHash<CrowdNode>(32);
  for (let f = 0; f < frames; f++) {
    hash.rebuild(nodes.filter((n) => n.alive !== false));
    resolvePlayerGap(nodes, PLAYER_X, PLAYER_Y, undefined, hash);
  }
}

describe("resolvePlayerGap", () => {
  it("verschiebt den Spieler nie (einseitige Kraft)", () => {
    const nodes = makeSwarm(40);
    // px/py sind Parameter — der Vertrag lautet: nur die Knoten bewegen sich.
    // Beleg: nach 120 Frames liegen ALLE Knoten am Ring, px/py unverändert.
    settle(nodes, 120);
    const movedBack = nodes.some(
      (n) => n.x < PLAYER_X - 40 || n.x > PLAYER_X + 40 || n.y < PLAYER_Y - 40 || n.y > PLAYER_Y + 40,
    );
    expect(movedBack).toBe(false);
    for (const n of nodes) {
      // Kein Knoten wurde AUF den Spieler zubewegt (Spieler bleibt unverrückbar).
      expect(edgeDistance(n)).toBeGreaterThan(-1);
    }
  });

  it("hält nach dem Absetzen den Mindestrand im Ring ein (Gegner < 8 px Kante: 0)", () => {
    const nodes = makeSwarm(120);
    settle(nodes, 120);
    const under8 = nodes.filter((n) => edgeDistance(n) < 8).length;
    expect(under8).toBe(0);
    // Am Ring selbst: das Rest-Defizit gegen PLAYER_GAP_EDGE bleibt klein
    // (kein Überschwingen darüber hinaus).
    for (const n of nodes) {
      if (edgeDistance(n) < PLAYER_GAP_EDGE) {
        expect(PLAYER_GAP_EDGE - edgeDistance(n)).toBeLessThanOrEqual(PLAYER_GAP_EDGE);
      }
    }
  });

  it("lässt Gegner außerhalb des Rings exakt unberührt", () => {
    const outside: CrowdNode[] = [
      { x: PLAYER_X + 80, y: PLAYER_Y, radius: 8, uid: 101, alive: true },
      { x: PLAYER_X - 70, y: PLAYER_Y + 5, radius: 8, uid: 102, alive: true },
      { x: PLAYER_X, y: PLAYER_Y + 90, radius: 8, uid: 103, alive: true },
    ];
    const before = outside.map((n) => ({ ...n }));
    resolvePlayerGap(outside, PLAYER_X, PLAYER_Y);
    outside.forEach((n, i) => {
      expect(n.x).toBe(before[i].x);
      expect(n.y).toBe(before[i].y);
    });
  });

  it("tote Gegner werden ignoriert", () => {
    const nodes: CrowdNode[] = [
      { x: PLAYER_X + 2, y: PLAYER_Y, radius: 8, uid: 201, alive: false },
      { x: PLAYER_X - 2, y: PLAYER_Y, radius: 8, uid: 202, alive: false },
    ];
    const before = nodes.map((n) => ({ ...n }));
    const res = resolvePlayerGap(nodes, PLAYER_X, PLAYER_Y);
    expect(res.moved).toBe(0);
    nodes.forEach((n, i) => {
      expect(n.x).toBe(before[i].x);
      expect(n.y).toBe(before[i].y);
    });
  });

  it("deckt deckungsgleiche Gegner über den UID-Fallback auf (kein Stillstand)", () => {
    const nodes: CrowdNode[] = [
      { x: PLAYER_X, y: PLAYER_Y, radius: 8, uid: 301, alive: true },
      { x: PLAYER_X, y: PLAYER_Y, radius: 8, uid: 302, alive: true },
    ];
    const res = resolvePlayerGap(nodes, PLAYER_X, PLAYER_Y);
    expect(res.moved).toBe(2);
    for (const n of nodes) {
      expect(Math.hypot(n.x - PLAYER_X, n.y - PLAYER_Y)).toBeGreaterThan(0);
    }
    // Fallback-Richtung = Goldener Winkel der eigenen UID; Schritt = Step-Deckel
    // (Defizit 6 + 8 + 14 = 28 px ⇒ min(6, 28 * 0.45) = 6).
    const dir = fallbackDir(301);
    expect(nodes[0].x - PLAYER_X).toBeCloseTo(dir.x * PLAYER_GAP_MAX_STEP, 5);
    expect(nodes[0].y - PLAYER_Y).toBeCloseTo(dir.y * PLAYER_GAP_MAX_STEP, 5);
  });

  it("500 Gegner: 2 Läufe mit gleichem Seed/Input sind bitgleich (Determinismus)", () => {
    const a = makeSwarm(500);
    const b = makeSwarm(500);
    settle(a, 60);
    settle(b, 60);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x).toBe(a[i].x);
      expect(b[i].y).toBe(a[i].y);
    }
  });

  it("500 Gegner: konvergiert monotone von unten an den Ring, ohne Überschwingen", () => {
    const nodes = makeSwarm(500);
    const initialEdge = nodes.map((n) => edgeDistance(n));
    settle(nodes, 90);
    let under8 = 0;
    for (const n of nodes) {
      if (edgeDistance(n) < 8) under8++;
    }
    expect(under8).toBe(0);
    // Knoten, die im Ring STARTETEN, nähern sich dem Ziel monoton von unten an
    // (Strength < 0.5 + Step-Deckel): sie enden nie über dem Ziel. Knoten, die
    // schon außerhalb starten, bleiben unberührt (Exakt-Test oben).
    for (let i = 0; i < nodes.length; i++) {
      if (initialEdge[i] < PLAYER_GAP_EDGE) {
        expect(edgeDistance(nodes[i])).toBeLessThan(PLAYER_GAP_EDGE + 1e-6);
      } else {
        expect(edgeDistance(nodes[i])).toBeCloseTo(initialEdge[i], 9);
      }
    }
  });

  it("ohne Hash baut die Funktion selbst einen und liefert dasselbe Ergebnis", () => {
    const a = makeSwarm(60);
    const b = makeSwarm(60);
    settle(a, 30);
    for (let f = 0; f < 30; f++) {
      resolvePlayerGap(b, PLAYER_X, PLAYER_Y);
    }
    for (let i = 0; i < a.length; i++) {
      expect(b[i].x).toBe(a[i].x);
      expect(b[i].y).toBe(a[i].y);
    }
  });

  it("ignore-Prädikat nimmt Knoten aus dem Ring aus (z. B. Bosse)", () => {
    const nodes: CrowdNode[] = [
      { x: PLAYER_X + 3, y: PLAYER_Y, radius: 30, uid: 401, alive: true },
    ];
    const before = nodes.map((n) => ({ ...n }));
    const res = resolvePlayerGap(nodes, PLAYER_X, PLAYER_Y, { ignore: () => true });
    expect(res.checked).toBe(1);
    expect(res.moved).toBe(0);
    expect(nodes[0].x).toBe(before[0].x);
    expect(nodes[0].y).toBe(before[0].y);
  });
});
