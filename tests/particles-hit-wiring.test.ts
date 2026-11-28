// m10-particles-hit-wiring (K4): Regression für das Wiring von
// particlesPerHitFor() in den Treffer-Partikelpfad (Rest-Hebel 1 aus
// docs/lanes/m10-fx-medium-cap). Pinnt (a) die Tier-Tabelle von
// hitParticlesFor — high bitgleich (crit 5 / normal 2), medium/low/thermal
// proportional gesenkt und monoton, (b) per Quell-Guard, dass der Burst in
// hitEnemy() die Anzahl über hitParticlesFor(crit, QUALITY) bezieht und
// Spawn-Reihenfolge/Positionen unverändert sind.
import { describe, expect, it, vi } from "vitest";
// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";

// Phaser wird neutral gemockt (PixelText erweitert Phaser.GameObjects.Container,
// FxSystem/CombatSystem nutzen BlendModes/CANVAS/Core.Events).
vi.mock("phaser", () => {
  class Container {}
  class Scene {}
  return {
    default: {
      GameObjects: { Container },
      Scene,
      BlendModes: { ADD: 1, NORMAL: 0 },
      CANVAS: 2,
      Core: { Events: { READY: "ready" } },
    },
  };
});

const { hitParticlesFor } = await import("../src/systems/CombatSystem");
const { qualityBudgetFor } = await import("../src/logic/quality");
const combatSrc = readFileSync(new URL("../src/systems/CombatSystem.ts", import.meta.url), "utf8");

describe("m10-particles-hit-wiring: Partikel pro Hit folgt particlesPerHitFor", () => {
  it("High bleibt bitgleich: crit 5 / normal 2 wie vor dem Wiring", () => {
    expect(hitParticlesFor(true, "high")).toBe(5);
    expect(hitParticlesFor(false, "high")).toBe(2);
  });

  it("Tier-Tabelle: medium/low/thermal folgen dem gesenkten Budget (min. 1)", () => {
    expect(hitParticlesFor(true, "medium")).toBe(3);
    expect(hitParticlesFor(false, "medium")).toBe(1);
    expect(hitParticlesFor(true, "low")).toBe(2);
    expect(hitParticlesFor(false, "low")).toBe(1);
    expect(hitParticlesFor(true, "thermal")).toBe(1);
    expect(hitParticlesFor(false, "thermal")).toBe(1);
  });

  it("Formel hinkt am quality.ts-Budget: Skala = particlesPerHitFor(tier)/high", () => {
    for (const tier of ["high", "medium", "low", "thermal"] as const) {
      const budget = qualityBudgetFor(tier).particlesPerHit;
      const scale = budget / qualityBudgetFor("high").particlesPerHit;
      expect(hitParticlesFor(true, tier)).toBe(Math.max(1, Math.round(5 * scale)));
      expect(hitParticlesFor(false, tier)).toBe(Math.max(1, Math.round(2 * scale)));
    }
  });

  it("Monoton über die Stufen: high >= medium >= low >= thermal", () => {
    for (const crit of [true, false]) {
      const seq = (["high", "medium", "low", "thermal"] as const).map((t) => hitParticlesFor(crit, t));
      for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeLessThanOrEqual(seq[i - 1]);
    }
  });

  it("Quell-Guard: hitEnemy-Burst liest hitParticlesFor(crit, QUALITY), nicht mehr die Konstante", () => {
    const hitAt = combatSrc.indexOf("private hitEnemy(");
    expect(hitAt).toBeGreaterThan(0);
    const endAt = combatSrc.indexOf("private killsFx(", hitAt);
    const body = combatSrc.slice(hitAt, endAt);
    expect(body).toContain("hitParticlesFor(crit, QUALITY)");
    expect(body).not.toMatch(/burst\("fx_star",\s*e\.x,\s*e\.y,\s*crit \? 5 : 2/);
  });

  it("Quell-Guard: Spawn-Reihenfolge und Positionen unverändert (report -> onHit -> burst an e.x/e.y)", () => {
    const hitAt = combatSrc.indexOf("private hitEnemy(");
    const endAt = combatSrc.indexOf("private killsFx(", hitAt);
    const body = combatSrc.slice(hitAt, endAt);
    const reportAt = body.indexOf("this.damageNumbers.report(");
    const onHitAt = body.indexOf("ctx.onHit(");
    const burstAt = body.indexOf('this.particles.burst("fx_star", e.x, e.y, hitParticlesFor(crit, QUALITY)');
    expect(reportAt).toBeGreaterThan(0);
    expect(onHitAt).toBeGreaterThan(reportAt);
    expect(burstAt).toBeGreaterThan(onHitAt);
    // Burst-Optik unverändert (life/tint-Klassen/alpha/scale).
    expect(body.slice(burstAt)).toContain("life: 0.16");
    expect(body.slice(burstAt)).toContain("tint: crit ? PAL[C.lanternWhite] : PAL[C.emberOrange]");
    expect(body.slice(burstAt)).toContain("alphaFrom: 0.9");
  });
});
