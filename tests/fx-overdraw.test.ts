import { describe, it, expect } from "vitest";
import { fxAlphaForDpr, glowCapFor, GlowBudget, type FxLodLevel } from "../src/gfx/gen-fx";

/**
 * M10-Overdraw-Deckel: additive Glow-Sprites sind der teuerste FX-Anteil bei
 * dpr 3 (Attribution shots/m10-fx-overdraw-attribution.json). Die Werte hier
 * sind die Abnahme-Vorgaben: Cap-Invariante + dpr-Alpha-Treppe.
 */
describe("fxAlphaForDpr (dpr-Treppe)", () => {
  it("dpr 1 -> Faktor 1 (unveraendert)", () => {
    expect(fxAlphaForDpr(1)).toBe(1);
  });

  it("dpr 2 -> Faktor 0,8", () => {
    expect(fxAlphaForDpr(2)).toBe(0.8);
  });

  it("dpr 3 -> Faktor 0,6 (780x360@3 = 2,5 Mio Device-Pixel)", () => {
    expect(fxAlphaForDpr(3)).toBe(0.6);
  });

  it("dpr 4 und hoeher bleibt bei 0,6", () => {
    expect(fxAlphaForDpr(4)).toBe(0.6);
    expect(fxAlphaForDpr(3.5)).toBe(0.6);
  });

  it("dpr zwischen 1,5 und 2 -> 0,8", () => {
    expect(fxAlphaForDpr(1.5)).toBe(1);
    expect(fxAlphaForDpr(1.6)).toBe(0.8);
    expect(fxAlphaForDpr(1.9)).toBe(0.8);
  });

  it("ungueltige Werte fallen auf 1 zurueck (nie Alpha erhoehen), +Infinity zaehlt als dpr > 2", () => {
    expect(fxAlphaForDpr(0)).toBe(1);
    expect(fxAlphaForDpr(-1)).toBe(1);
    expect(fxAlphaForDpr(Number.NaN)).toBe(1);
    expect(fxAlphaForDpr(Number.POSITIVE_INFINITY)).toBe(0.6);
    expect(fxAlphaForDpr(Number.NEGATIVE_INFINITY)).toBe(1);
  });
});

describe("glowCapFor (Deckel je LOD-Stufe)", () => {
  it("Stufen sind monoton fallend: full > reduced > minimal", () => {
    const full = glowCapFor("full");
    const reduced = glowCapFor("reduced");
    const minimal = glowCapFor("minimal");
    expect(full).toBeGreaterThan(reduced);
    expect(reduced).toBeGreaterThan(minimal);
    expect(minimal).toBeGreaterThanOrEqual(0);
  });

  it("Deckel ist hart, aber nicht null im Minimal-LOD (Signaturen bleiben sichtbar)", () => {
    expect(glowCapFor("minimal")).toBeGreaterThanOrEqual(8);
    expect(glowCapFor("full")).toBeGreaterThanOrEqual(glowCapFor("minimal") * 2);
  });
});

describe("GlowBudget (Cap-Invariante: nie mehr als N Glows gleichzeitig)", () => {
  it("gibt genau cap Slots, danach kein weiterer", () => {
    const budget = new GlowBudget(4);
    for (let i = 0; i < 4; i++) {
      expect(budget.request()).toBe(true);
      expect(budget.current).toBe(i + 1);
    }
    expect(budget.current).toBe(4);
    expect(budget.request()).toBe(false);
    expect(budget.current).toBe(4);
  });

  it("release schafft wieder Platz (Slot-Maechtigkeit bleibt <= cap)", () => {
    const budget = new GlowBudget(3);
    budget.request();
    budget.request();
    budget.request();
    expect(budget.request()).toBe(false);
    budget.release();
    expect(budget.current).toBe(2);
    expect(budget.request()).toBe(true);
    expect(budget.current).toBe(3);
    expect(budget.request()).toBe(false);
  });

  it("release ist idempotent und geht nicht unter 0", () => {
    const budget = new GlowBudget(2);
    budget.release();
    budget.release();
    expect(budget.current).toBe(0);
    expect(budget.request()).toBe(true);
    expect(budget.request()).toBe(true);
    expect(budget.current).toBe(2);
  });

  it("setCap senkt zukuenftige Vergaben, nie die aktuelle Zahl unter cap aushebend", () => {
    const budget = new GlowBudget(8);
    for (let i = 0; i < 8; i++) expect(budget.request()).toBe(true);
    budget.setCap(4);
    expect(budget.request()).toBe(false);
    budget.release();
    budget.release();
    budget.release();
    budget.release();
    expect(budget.current).toBe(4);
    expect(budget.request()).toBe(false);
    budget.release();
    expect(budget.request()).toBe(true);
  });

  it("setCap rundet ab und akzeptiert nie negative Caps", () => {
    const budget = new GlowBudget(2);
    budget.setCap(2.9);
    expect(budget.cap).toBe(2);
    budget.setCap(-5);
    expect(budget.cap).toBe(0);
    expect(budget.request()).toBe(false);
  });

  it("reset setzt auf 0 (Szenenwechsel)", () => {
    const budget = new GlowBudget(2);
    budget.request();
    budget.request();
    budget.reset();
    expect(budget.current).toBe(0);
    expect(budget.request()).toBe(true);
  });

  it("Cap-Invariante unter zufaelligem request/release (Fuzz, 10.000 Ops)", () => {
    const budget = new GlowBudget(16);
    let live = 0;
    for (let i = 0; i < 10000; i++) {
      if (budget.request()) live++;
      if (i % 2 === 0) {
        budget.release();
        live = Math.max(0, live - 1);
      }
      expect(budget.current).toBeLessThanOrEqual(16);
      expect(budget.current).toBeGreaterThanOrEqual(0);
    }
    expect(live).toBeLessThanOrEqual(16);
  });
});

describe("LOD-Anbindung (lod.ts wird nur gelesen)", () => {
  it("glowCapFor liefert fuer alle drei lodFor-Stufen einen Deckel", () => {
    // Stufen-Namen 1:1 aus src/logic/lod.ts (nur gelesen, nicht importiert,
    // damit die Lane lod.ts nicht anfassen muss).
    const levels: FxLodLevel[] = ["full", "reduced", "minimal"];
    for (const level of levels) {
      expect(Number.isInteger(glowCapFor(level))).toBe(true);
      expect(glowCapFor(level)).toBeGreaterThan(0);
    }
  });
});

/**
 * M10 (Review K2): Integration der Verdrahtung FxSystem/ParticleSystem <->
 * geteiltes GlowBudget. Fake-Sprites genuegen: setAlphaScale/Separation-Pfade
 * rufen nur Blend/Alpha-Setter. Phaser selbst wird importiert (BlendModes).
 */
import { vi } from "vitest";
// FxSystem importiert Phaser fuer BlendModes/Szene; im Node-Test neutral gemockt
// (Muster wie tests/enemy-pool-reuse.test.ts).
vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));
import Phaser from "phaser";
import { FxSystem, ParticleSystem, type FxRuntime } from "../src/systems/FxSystem";

type BlendRec = { blend: number };
function fakeFx(additive = true): { runtime: FxRuntime; rec: BlendRec } {
  const rec: BlendRec = { blend: Phaser.BlendModes.NORMAL };
  const sprite = {
    alpha: 0.8,
    setAlpha(a: number) { (this as { alpha: number }).alpha = a; },
    setBlendMode(m: number) { rec.blend = m; },
    setPosition() {}, setScale() {}, setRotation() {}, setDepth() {},
    setVisible() {}, setActive() {}, setTint() {}, clearTint() {},
  } as unknown as Phaser.GameObjects.Image;
  const runtime = {
    sprite, x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, scaleFrom: 1, scaleTo: 1,
    aspect: 1, alphaFrom: 1, alphaTo: 0, rotation: 0, spin: 0, frames: ["fx_spark"],
    frameRate: 18, active: true, additive, alphaScaleExempt: false, glow: false,
  } as unknown as FxRuntime;
  return { runtime, rec };
}

function addFake(system: FxSystem | ParticleSystem, recs: BlendRec[], additive = true): void {
  const { runtime, rec } = fakeFx(additive);
  (system.active as FxRuntime[]).push(runtime);
  recs.push(rec);
}

/** Demote -> Promote: erzwingt den K1-Pfad (LOD minimal -> full). */
function cycle(system: FxSystem | ParticleSystem): void {
  system.setAlphaScale(0.5);
  system.setAlphaScale(1);
}

describe("Glow-Deckel-Verdrahtung (Review K2/K1)", () => {
  it("K1-Regression: Re-Promotion setzt keinen Slot-freien Sprite auf ADD (Cap bleibt hart)", () => {
    const scene = { events: { once: () => {} } } as unknown as Phaser.Scene;
    const fx = new FxSystem(scene);
    fx.setMaxActive(180); // full -> Cap 72
    const recs: BlendRec[] = [];
    for (let i = 0; i < 100; i++) addFake(fx, recs);
    cycle(fx); // 0.5 demoted (nichts), 1.0 promoted: nur 72 duerfen ADD werden
    const add = recs.filter((r) => r.blend === Phaser.BlendModes.ADD).length;
    expect(add).toBe(glowCapFor("full"));
    expect(add).toBeLessThan(100);
  });

  it("Budget wird geteilt: FxSystem + ParticleSystem zusammen ueberschreiten den Cap nie", () => {
    const scene = { events: { once: () => {} } } as unknown as Phaser.Scene;
    const fx = new FxSystem(scene);
    const ps = new ParticleSystem(scene);
    const fxRecs: BlendRec[] = [];
    const psRecs: BlendRec[] = [];
    for (let i = 0; i < 40; i++) addFake(fx, fxRecs);
    for (let i = 0; i < 100; i++) addFake(ps, psRecs);
    cycle(fx);
    cycle(ps);
    const addFx = fxRecs.filter((r) => r.blend === Phaser.BlendModes.ADD).length;
    const addPs = psRecs.filter((r) => r.blend === Phaser.BlendModes.ADD).length;
    expect(addFx).toBe(40);
    expect(addFx + addPs).toBe(glowCapFor("full"));
  });

  it("S1: Szenen-Shutdown gibt belegte Slots frei (kein Leak in die naechste Run)", () => {
    let shutdown: (() => void) | undefined;
    const scene = {
      events: { once: (_: string, cb: () => void) => { shutdown = cb; } },
    } as unknown as Phaser.Scene;
    const fx = new FxSystem(scene);
    const recs: BlendRec[] = [];
    for (let i = 0; i < 72; i++) addFake(fx, recs);
    cycle(fx);
    expect(recs.filter((r) => r.blend === Phaser.BlendModes.ADD).length).toBe(glowCapFor("full"));
    // Run endet ohne combat.clear(): Sprites weg, Slots waeren verloren...
    fx.active.length = 0;
    shutdown?.();
    // ...neue Run im selben Scene-Objekt bekommt den vollen Cap wieder:
    const recs2: BlendRec[] = [];
    for (let i = 0; i < 72; i++) addFake(fx, recs2);
    cycle(fx);
    expect(recs2.filter((r) => r.blend === Phaser.BlendModes.ADD).length).toBe(glowCapFor("full"));
  });

  it("Demotion gibt Slots frei: nach Rueckstufung sind neue ADD-Slots wieder verfuegbar", () => {
    const scene = { events: { once: () => {} } } as unknown as Phaser.Scene;
    const fx = new FxSystem(scene);
    const recs: BlendRec[] = [];
    for (let i = 0; i < 72; i++) addFake(fx, recs);
    cycle(fx);
    fx.setAlphaScale(0.5); // minimal: alle Glows demoted, alle Slots frei
    const recs2: BlendRec[] = [];
    for (let i = 0; i < 10; i++) addFake(fx, recs2);
    fx.setAlphaScale(1); // alte 72 re-requesten zuerst, neue 10 konkurrieren
    const addAll = [...recs, ...recs2].filter((r) => r.blend === Phaser.BlendModes.ADD).length;
    expect(addAll).toBe(glowCapFor("full")); // Cap bleibt hart, keine Ueberhebung
    expect(recs2.some((r) => r.blend === Phaser.BlendModes.NORMAL)).toBe(true);
  });
});
