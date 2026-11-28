// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/logic/rng";
import { newAiState, stepEnemyAi, type AiParams, type AiRng, type AiState } from "../src/logic/enemy-ai";

// Lane m10-run-cpu-budget, K4 (#11755): Guard-Tests zum CPU-/Alloc-Budget-Fix.
//
// K3 hat in src/scenes/Run.ts (nur dort) Allokationen aus dem update-Loop
// gehoben: KI-Param-Objekt je Gegner je Schritt (~30k Objekte/s bei 500
// Gegnern), Combat-Kontext + 4 Closures + Pickup-View + Gap-Optionen je
// Schritt, splits-Array je Schritt. Kein Verhaltens-Wandel — das frieren
// diese Tests ein:
//   1. Verhaltens-Bitgleichheit: wiederverwendetes AiParams-Objekt liefert
//      mit gleichem Seed EXAKT dieselben KI-Entscheidungen wie ein frisches
//      Objekt je Aufruf (alle 10 Archetypen, viele Frames).
//   2. Quell-Kontrakt: die Hoisting-Hebel bleiben verdrahtet (Regressionsschutz).

const SOURCE = readFileSync(new URL("../src/scenes/Run.ts", import.meta.url), "utf8");

const ARCHETYPES = [
  "chaser", "swarm", "tank", "ranged", "charger",
  "splitter", "exploder", "phaser", "orbiter", "summoner",
] as const;

function rngFor(seed: number): AiRng {
  const next = mulberry32(seed);
  return { next };
}

function paramsFor(i: number, t: number, archetype: (typeof ARCHETYPES)[number]): AiParams {
  return {
    archetype,
    tier: (i % 5) + 1,
    x: 480 + Math.cos(i * 1.3 + t * 0.01) * 200,
    y: 270 + Math.sin(i * 0.9 + t * 0.01) * 150,
    playerX: 480 + Math.cos(t * 0.006) * 60,
    playerY: 270 + Math.sin(t * 0.006) * 40,
    speed: 40 + (i % 7) * 12,
  };
}

describe("m10-run-cpu-budget: KI-Param-Wiederverwendung ist verhaltens-bitgleich", () => {
  for (const archetype of ARCHETYPES) {
    it(`Archetyp ${archetype}: wiederverwendetes Params-Objekt === frische Objekte (600 Frames)`, () => {
      // Zwei identische Gegner: A nutzt EIN wiederverwendetes Objekt (K3-Muster),
      // B bekommt je Frame ein frisches Objekt mit denselben Werten.
      const stateA: AiState = newAiState(rngFor(0xa11ce));
      const stateB: AiState = newAiState(rngFor(0xa11ce));
      const rngA = rngFor(0x5eed + archetype.length * 131);
      const rngB = rngFor(0x5eed + archetype.length * 131);
      const reused: AiParams = { ...paramsFor(3, 0, archetype) };
      let frames = 0;
      for (let t = 0; t < 600; t++) {
        const p = paramsFor(3, t, archetype);
        Object.assign(reused, p); // exakt das K3-Muster: Felder mutieren, Referenz bleibt
        const a = stepEnemyAi(stateA, reused, 1 / 60, rngA, 42);
        const b = stepEnemyAi(stateB, { ...p }, 1 / 60, rngB, 42);
        // Bitgleich: Zustand, Bewegung, Tempo-Multiplikator und Aktionen.
        expect(a.state).toEqual(b.state);
        expect(a.moveX).toBe(b.moveX);
        expect(a.moveY).toBe(b.moveY);
        expect(a.speedMul).toBe(b.speedMul);
        expect(a.actions).toEqual(b.actions);
        frames++;
      }
      expect(frames).toBe(600);
    });
  }
});

describe("m10-run-cpu-budget: Quell-Kontrakt der Hoisting-Hebel (Run.ts)", () => {
  it("KI-Params sind ein Instanz-Feld und werden je Gegner nur mutiert (kein Literal im Hot-Path)", () => {
    expect(SOURCE).toContain("private aiParams: AiParams = {");
    // Der stepEnemyAi-Aufruf uebergibt das wiederverwendete Objekt, kein Literal.
    expect(SOURCE).toContain("const p = this.aiParams;");
    expect(SOURCE).toContain("stepEnemyAi(e.ai, p, dt, e.aiRng, e.uid)");
    // Regressionsschutz: kein Inline-Param-Literal im updateEnemies-Hot-Path.
    expect(SOURCE).not.toMatch(/stepEnemyAi\(\s*e\.ai,\s*\{/);
  });

  it("Combat-Kontext + Closures sind Instanz-Felder, simulate() mutiert sie nur", () => {
    expect(SOURCE).toContain("private combatCtx: CombatContext = {");
    expect(SOURCE).toContain("onHit: (enemy: EnemyRuntime, damage: number, weaponId: string, killed: boolean): void => {");
    expect(SOURCE).toContain("private onEnemyShotHit = (damage: number, shot: EnemyShotRuntime): void => {");
    expect(SOURCE).toContain("private onHazardHit = (damage: number): void => {");
    expect(SOURCE).toContain("private onCollect = (value: number): void => {");
    // simulate() uebergibt die Felder statt neuer Closures/Literale.
    expect(SOURCE).toContain("this.combat.update(ctx);");
    expect(SOURCE).toContain("this.enemyShots.update(dt, this.posX, this.posY, this.onEnemyShotHit);");
    expect(SOURCE).toContain("this.hazards.update(dt, this.posX, this.posY, this.onHazardHit);");
    expect(SOURCE).toContain("this.pickups.update(dt, this.posX, this.posY, pickupRadius, this.onCollect, view);");
    expect(SOURCE).not.toMatch(/combat\.update\(\s*\{/);
  });

  it("Pickup-View, Gap-Optionen und splits-Scratch werden wiederverwendet", () => {
    expect(SOURCE).toContain("private pickupView = { x0: 0, y0: 0, x1: 0, y1: 0 };");
    expect(SOURCE).toContain("resolvePlayerGap(this.enemies.active, px, py, this.gapOpts, this.hash)");
    expect(SOURCE).toContain("private splitsScratch: EnemyRuntime[] = [];");
    expect(SOURCE).toContain("splits.length = 0;");
  });
});
