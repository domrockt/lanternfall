// @ts-ignore — Node-Typen sind im Repo nicht installiert; Vitest stellt fs bereit.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { EVOLUTION_SIGNATURES, SIGNATURE_FRAME_COUNT, fxFrames, signatureTextureKey } from "../src/gfx/gen-fx";

// FxSystem importiert Phaser fuer BlendModes/Szene; im Node-Test neutral gemockt
// (Muster wie tests/fx-overdraw.test.ts).
vi.mock("phaser", () => ({
  default: { BlendModes: { ADD: 1, NORMAL: 0 }, Scenes: { Events: { SHUTDOWN: "shutdown" } } },
}));

import Phaser from "phaser";
import { FxSystem, type FxRuntime } from "../src/systems/FxSystem";

/**
 * m10-evo-signature-calls: Die Evolutions-Waffen haben Treffer-/Todes-Signaturen
 * in FxSystem, aber sie feuern nur, wenn der onHit-Callback in Run.ts den
 * Spawn-Aufruf enthaelt. Diese Datei prueft beides:
 *  1. die Verdrahtung in src/scenes/Run.ts (genau ein Aufruf im onHit-Callback),
 *  2. das Spawn-Verhalten selbst (Hit/Kill-Typ, Position, kein Spawn bei
 *     Nicht-Evolutions-Waffen, Cooldown).
 */

/** Minimaler Sprite-Fake: alles kettenfaehig, zeichnet den letzten Zustand auf. */
type SpriteRec = {
  textureKey: string;
  frameKey: string | null;
  x: number;
  y: number;
  alpha: number;
  scale: number;
  rotation: number;
  depth: number;
  visible: boolean;
  active: boolean;
};

function makeSprite(rec: SpriteRec): Record<string, unknown> {
  const s: Record<string, unknown> = {
    texture: { key: "" },
    frame: null,
    alpha: 1,
    setTexture(key: string, frame?: string) {
      rec.textureKey = key;
      rec.frameKey = frame ?? null;
      (s.texture as { key: string }).key = key;
      return s;
    },
    setPosition(x: number, y: number) {
      rec.x = x;
      rec.y = y;
      return s;
    },
    setScale(sx: number) {
      rec.scale = sx;
      return s;
    },
    setAlpha(a: number) {
      rec.alpha = a;
      return s;
    },
    setRotation(r: number) {
      rec.rotation = r;
      return s;
    },
    setDepth(d: number) {
      rec.depth = d;
      return s;
    },
    setBlendMode() {
      return s;
    },
    setTint() {
      return s;
    },
    clearTint() {
      return s;
    },
    setVisible(v: boolean) {
      rec.visible = v;
      return s;
    },
    setActive(a: boolean) {
      rec.active = a;
      return s;
    },
  };
  return s;
}

function makeFxSystem(): { fx: FxSystem; recs: SpriteRec[]; time: { now: number } } {
  const recs: SpriteRec[] = [];
  const time = { now: 1000 };
  const scene = {
    add: {
      image: (_x: number, _y: number, _key: string) => {
        const rec: SpriteRec = {
          textureKey: "", frameKey: null, x: 0, y: 0, alpha: 1,
          scale: 1, rotation: 0, depth: 0, visible: false, active: false,
        };
        recs.push(rec);
        return makeSprite(rec);
      },
    },
    time,
    events: { once: () => {} },
  } as unknown as Phaser.Scene;
  return { fx: new FxSystem(scene), recs, time };
}

describe("m10 evo-signature-calls: Verdrahtung Run.ts onHit -> FxSystem.spawnEvolution", () => {
  it("onHit-Callback ruft genau einmal spawnEvolution mit Typ + Position", () => {
    const src = readFileSync(new URL("../src/scenes/Run.ts", import.meta.url), "utf8");
    const hitIdx = src.indexOf("onHit:");
    expect(hitIdx, "onHit-Callback fehlt in Run.ts").toBeGreaterThan(0);
    const callback = src.slice(hitIdx, src.indexOf("onHeal:", hitIdx));
    const call = `this.combat.fx.spawnEvolution(weaponId, killed ? "death" : "hit", enemy.x, enemy.y);`;
    expect(callback.split(call).length - 1, "Genau ein Spawn-Aufruf im onHit").toBe(1);
    // Der Aufruf sitzt NACH den Spiel-Pfaden (Damage-Aggregation, Audio) —
    // reine Visualisierung, keine Gameplay-Aenderung.
    expect(callback.indexOf("this.damageByWeapon[weaponId]")).toBeLessThan(callback.indexOf(call));
  });
});

describe("m10 evo-signature-calls: Spawn-Verhalten FxSystem.spawnEvolution", () => {
  it("Hit-Spawn: korrekter Typ/Textur, gerundete Position, Signatur-Parameter", () => {
    const { fx, recs } = makeFxSystem();
    const runtime = fx.spawnEvolution("phoenix", "hit", 100.4, 50.6);
    expect(runtime).not.toBeNull();
    const sig = EVOLUTION_SIGNATURES.phoenix;
    expect(recs[0].textureKey).toBe(signatureTextureKey("phoenix", "hit"));
    expect(recs[0].x).toBe(100); // Pixel-Grid: Position wird gerundet
    expect(recs[0].y).toBe(51);
    expect(recs[0].visible).toBe(true);
    expect(recs[0].scale).toBeCloseTo(3.2);
    expect(recs[0].alpha).toBeCloseTo(0.95);
    const rt = runtime as FxRuntime;
    expect(rt.life).toBeCloseTo(sig.hitLifetime);
    expect(rt.frames).toEqual(fxFrames(signatureTextureKey("phoenix", "hit"), SIGNATURE_FRAME_COUNT));
    expect(rt.additive).toBe(false);
    expect(fx.count).toBe(1);
  });

  it("Kill-Spawn ('death'): eigener Textur-Key und Todes-Timing", () => {
    const { fx, recs } = makeFxSystem();
    const runtime = fx.spawnEvolution("eternal_winter", "death", -10, -20);
    expect(runtime).not.toBeNull();
    const sig = EVOLUTION_SIGNATURES.eternal_winter;
    expect(recs[0].textureKey).toBe(signatureTextureKey("eternal_winter", "death"));
    expect((runtime as FxRuntime).life).toBeCloseTo(sig.deathLifetime);
    expect(recs[0].scale).toBeCloseTo(4.0);
    expect(recs[0].textureKey).not.toBe(signatureTextureKey("eternal_winter", "hit"));
  });

  it("Nicht-Evolutions-Waffen spawnen nichts", () => {
    const { fx, recs } = makeFxSystem();
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      expect(fx.spawnEvolution(id, "hit", 10, 10)).toBeNull();
      expect(fx.spawnEvolution(id, "death", 10, 10)).toBeNull();
    }
    expect(fx.count).toBe(0);
    expect(recs).toHaveLength(0);
  });

  it("Cooldown pro Evolution+Art: kein Sprite-Flut, death != hit, Reset via clear()", () => {
    const { fx, time } = makeFxSystem();
    // Sofort nach dem Hit-Spawn: gleicher Key gedrosselt ...
    expect(fx.spawnEvolution("thorn_storm", "hit", 0, 0)).not.toBeNull();
    expect(fx.spawnEvolution("thorn_storm", "hit", 5, 5)).toBeNull();
    // ... aber death ist ein eigener Key und feuert trotzdem:
    expect(fx.spawnEvolution("thorn_storm", "death", 5, 5)).not.toBeNull();
    // Nach Ablauf der Lifetime-Spanne feuert der Hit-Key wieder:
    const life = EVOLUTION_SIGNATURES.thorn_storm.hitLifetime;
    time.now += life * 450 + 1;
    expect(fx.spawnEvolution("thorn_storm", "hit", 0, 0)).not.toBeNull();
    fx.clear();
    expect(fx.spawnEvolution("thorn_storm", "hit", 0, 0)).not.toBeNull();
  });

  it("alle 6 Evolutionen feuern Hit UND Death (Verdrahtung ist pro Waffe identisch)", () => {
    for (const id of Object.keys(EVOLUTION_SIGNATURES)) {
      const { fx } = makeFxSystem();
      expect(fx.spawnEvolution(id, "hit", 0, 0), `${id} hit`).not.toBeNull();
      expect(fx.spawnEvolution(id, "death", 0, 0), `${id} death`).not.toBeNull();
    }
  });
});
