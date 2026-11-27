import { describe, expect, it } from "vitest";
import { ENEMIES } from "../src/data/enemies";
import {
  ENEMY_SHOT_VISUALS,
  ENEMY_SHOT_WINDUP_MIN_SECONDS,
  ENEMY_SHOT_WINDUP_SECONDS,
  canLaunchShot,
  isPointInView,
  shotTextureKeyFor,
  shotVisualsDistinct,
  type EnemyShotVisual,
} from "../src/logic/bosses";

const VIEW = { x: 100, y: 50, width: 640, height: 360 };

function visualOf(key: string): EnemyShotVisual {
  const v = ENEMY_SHOT_VISUALS[key];
  if (!v) throw new Error(`unbekannte Schuss-Optik: ${key}`);
  return v;
}

describe("M10 Gegnerschüsse fair — Vorwarnung", () => {
  it("Wind-up ist mindestens 0,3 s lang", () => {
    expect(ENEMY_SHOT_WINDUP_SECONDS).toBeGreaterThanOrEqual(ENEMY_SHOT_WINDUP_MIN_SECONDS);
    expect(ENEMY_SHOT_WINDUP_MIN_SECONDS).toBeGreaterThanOrEqual(0.3);
  });

  it("jeder ranged-/summoner-Schuss nutzt die gemeinsame Vorwarnzeit", () => {
    const shooters = Object.values(ENEMIES).filter((e) => e.archetype === "ranged" || e.archetype === "summoner");
    expect(shooters.length).toBeGreaterThan(0);
    for (const e of shooters) {
      expect(shotTextureKeyFor(e.archetype, e.tier)).toBeTypeOf("string");
    }
    expect(ENEMY_SHOT_WINDUP_SECONDS).toBeGreaterThanOrEqual(0.3);
  });

  it("Schuss entsteht erst nach Ablauf der Vorwarnung", () => {
    const gate = { shooterAlive: true, originInView: true, windupSeconds: ENEMY_SHOT_WINDUP_SECONDS };
    expect(canLaunchShot({ ...gate, windupElapsed: 0.1 })).toBe(false);
    expect(canLaunchShot({ ...gate, windupElapsed: ENEMY_SHOT_WINDUP_SECONDS - 0.01 })).toBe(false);
    expect(canLaunchShot({ ...gate, windupElapsed: ENEMY_SHOT_WINDUP_SECONDS })).toBe(true);
  });

  it("bricht ab, wenn der Schütze stirbt/recycelt wird", () => {
    const gate = {
      originInView: true,
      windupElapsed: ENEMY_SHOT_WINDUP_SECONDS,
      windupSeconds: ENEMY_SHOT_WINDUP_SECONDS,
    };
    expect(canLaunchShot({ ...gate, shooterAlive: false })).toBe(false);
    expect(canLaunchShot({ ...gate, shooterAlive: true })).toBe(true);
  });

  it("kein Spawn aus einer Offscreen-Position", () => {
    expect(isPointInView(120, 60, VIEW)).toBe(true);
    expect(isPointInView(99, 60, VIEW)).toBe(false);
    expect(isPointInView(300, 49, VIEW)).toBe(false);
    expect(isPointInView(741, 200, VIEW)).toBe(false);
    expect(isPointInView(300, 411, VIEW)).toBe(false);
    const gate = {
      shooterAlive: true,
      windupElapsed: ENEMY_SHOT_WINDUP_SECONDS,
      windupSeconds: ENEMY_SHOT_WINDUP_SECONDS,
    };
    expect(canLaunchShot({ ...gate, originInView: false })).toBe(false);
  });
});

describe("M10 Gegnerschüsse fair — Optiken unterscheidbar", () => {
  it("die vier Texture-Keys sind paarweise verschieden", () => {
    const keys = [
      shotTextureKeyFor("ranged", 0),
      shotTextureKeyFor("ranged", 1),
      shotTextureKeyFor("ranged", 3),
      shotTextureKeyFor("chaser", 2),
    ];
    expect(new Set(keys).size).toBe(4);
    for (const key of keys) expect(ENEMY_SHOT_VISUALS[key]).toBeTruthy();
  });

  it("jede Optik hat eigene Form und Kernfarbe", () => {
    expect(shotVisualsDistinct()).toBe(true);
    const visuals = Object.values(ENEMY_SHOT_VISUALS);
    expect(new Set(visuals.map((v) => v.shape)).size).toBe(4);
    expect(new Set(visuals.map((v) => v.core)).size).toBe(4);
    expect(new Set(visuals.map((v) => v.rim)).size).toBe(4);
  });

  it("alle 30 Gegner mappen auf eine der vier Optiken", () => {
    const known = new Set(Object.keys(ENEMY_SHOT_VISUALS));
    for (const e of Object.values(ENEMIES)) {
      expect(known.has(shotTextureKeyFor(e.archetype, e.tier))).toBe(true);
    }
    // summoner ist immer die Schatten-Optik.
    expect(visualOf(shotTextureKeyFor("summoner", 4)).family).toBe("shadow");
  });
});
