import { describe, expect, it } from "vitest";
import {
  ARCHETYPES, newAiState, stepEnemyAi, summonMinionId, type AiState,
} from "../src/logic/enemy-ai";
import {
  bossSpawnSecond, eliteChance, enemyDamageScale, enemyHpScale, enemySpeedScale,
  maxActiveEnemies, pickRecycleIndex, shouldRecycle, isEliteMinute,
} from "../src/logic/scaling";
import { terrainSpeedFactor, isSplashTerrain, WATER_SLOW_FACTOR } from "../src/logic/terrain";
import {
  attacksFor, bossAtSecond, bossHpColorIndex, bossPhase, bossSpawnTimes, nextBossAttack,
} from "../src/logic/bosses";
import {
  botDirection, chooseBestOffer, offerScore,
} from "../src/logic/autoplay";
import { directorPlan, elitePackCount, streamSpawnOffsets } from "../src/logic/waves";
import { SeededRng } from "../src/logic/rng";
import type { Offer } from "../src/logic/levelup";
import { BOSSES, ENEMIES, ENEMY_IDS } from "../src/data";

const rng = () => new SeededRng(99);
const params = (archetype: Parameters<typeof stepEnemyAi>[1]["archetype"], dist = 120) => ({
  archetype, tier: 1, x: 100, y: 100, playerX: 100 + dist, playerY: 100, speed: 40,
});

describe("Gegner-KI Zustandsautomaten", () => {
  it("alle 10 Archetypen liefern endliche, normalisierte Richtungen", () => {
    expect(ARCHETYPES).toHaveLength(10);
    for (const archetype of ARCHETYPES) {
      const step = stepEnemyAi(newAiState(rng()), params(archetype), 0.05, rng());
      expect(Number.isFinite(step.moveX), archetype).toBe(true);
      expect(Number.isFinite(step.moveY), archetype).toBe(true);
      expect(Math.hypot(step.moveX, step.moveY), archetype).toBeGreaterThan(0.1);
      expect(step.speedMul).toBeGreaterThan(0);
    }
  });

  it("ranged hält Abstand und schießt nach Cooldown", () => {
    const close = stepEnemyAi({ ...newAiState(rng()), cooldown: 5 }, params("ranged", 40), 0.05, rng());
    expect(close.moveX).toBeLessThan(0); // weg vom Spieler (rechts)
    expect(close.actions.some((a) => a.type === "shoot")).toBe(false);
    const ready = stepEnemyAi({ ...newAiState(rng()), cooldown: 0 }, params("ranged", 120), 0.05, rng());
    const shot = ready.actions.find((a) => a.type === "shoot");
    expect(shot, "Schuss").toBeTruthy();
    if (shot?.type === "shoot") {
      expect(Math.hypot(shot.vx, shot.vy)).toBeGreaterThan(60);
    }
  });

  it("charger: approach → windup → charge mit Sprint", () => {
    let state: AiState = { ...newAiState(rng()), timer: 0, mode: "approach" };
    const modes: string[] = [];
    let maxMul = 1;
    for (let i = 0; i < 80; i++) {
      const step = stepEnemyAi(state, params("charger", 150), 0.05, rng());
      state = step.state;
      maxMul = Math.max(maxMul, step.speedMul);
      if (!modes.includes(state.mode)) modes.push(state.mode);
    }
    expect(modes).toContain("windup");
    expect(modes).toContain("charge");
    expect(maxMul).toBeGreaterThan(2.5);
  });

  it("exploder zündet nahe am Spieler und explodiert nach der Zündschnur", () => {
    let state = newAiState(rng());
    const first = stepEnemyAi(state, params("exploder", 20), 0.05, rng());
    state = first.state;
    expect(state.fuse).toBeGreaterThan(0);
    let exploded = false;
    for (let i = 0; i < 30 && !exploded; i++) {
      const step = stepEnemyAi(state, params("exploder", 20), 0.05, rng());
      state = step.state;
      exploded = step.actions.some((a) => a.type === "explode");
    }
    expect(exploded).toBe(true);
  });

  it("phaser blinkt nach Cooldown neben den Spieler", () => {
    const step = stepEnemyAi({ ...newAiState(rng()), cooldown: 0 }, params("phaser", 120), 0.05, rng());
    const blink = step.actions.find((a) => a.type === "blink");
    expect(blink).toBeTruthy();
    if (blink?.type === "blink") {
      expect(Math.hypot(blink.x - 220, blink.y - 100)).toBeGreaterThan(50);
      expect(Math.hypot(blink.x - 220, blink.y - 100)).toBeLessThan(90);
    }
    expect(step.state.blinks).toBe(1);
  });

  it("summoner ruft passende kleine Gegner", () => {
    const step = stepEnemyAi({ ...newAiState(rng()), cooldown: 0 }, params("summoner", 140), 0.05, rng());
    const summon = step.actions.find((a) => a.type === "summon");
    expect(summon).toBeTruthy();
    expect(summonMinionId(0)).toBe("bog_rat");
    expect(summonMinionId(4)).toBe("reaper_bat");
  });

  it("orbiter bewegt sich tangential um den Spieler", () => {
    const step = stepEnemyAi(newAiState(rng()), params("orbiter", 100), 0.05, rng());
    const radial = step.moveX * 1 + step.moveY * 0; // Spieler liegt rechts (1,0)
    expect(Math.abs(radial)).toBeLessThan(0.75);
  });
});

describe("Zeit-Skalierung und Director", () => {
  it("HP/Schaden/Tempo steigen monoton, Tempo gedeckelt", () => {
    expect(enemyHpScale(1500, 4)).toBeGreaterThan(enemyHpScale(300, 4));
    expect(enemyHpScale(0, 4)).toBeGreaterThan(enemyHpScale(0, 0));
    expect(enemyDamageScale(1800)).toBeGreaterThan(enemyDamageScale(0));
    expect(enemySpeedScale(9999)).toBeCloseTo(1.25);
    expect(enemySpeedScale(1800)).toBeCloseTo(1.25);
  });

  it("Elite-Chance steigt, Elite-Minuten sind 4/10/16/22/28", () => {
    expect(eliteChance(0)).toBe(0);
    expect(eliteChance(20)).toBeGreaterThan(eliteChance(5));
    expect(eliteChance(99)).toBeLessThanOrEqual(0.1);
    expect([4, 10, 16, 22, 28].every(isEliteMinute)).toBe(true);
    expect(isEliteMinute(5)).toBe(false);
  });

  it("Gegner-Cap wächst bis 500 und bleibt dort", () => {
    expect(maxActiveEnemies(0)).toBeGreaterThan(0);
    expect(maxActiveEnemies(25 * 60)).toBe(500);
    expect(maxActiveEnemies(30 * 60)).toBe(500);
  });

  it("Recycling nur für alte, ferne, nicht-elite Gegner", () => {
    expect(shouldRecycle(60, 400, false)).toBe(true);
    expect(shouldRecycle(10, 400, false)).toBe(false);
    expect(shouldRecycle(60, 100, false)).toBe(false);
    expect(shouldRecycle(60, 400, true)).toBe(false);
    const list = [
      { age: 20, x: 0, y: 0, elite: false },
      { age: 70, x: 0, y: 0, elite: false },
      { age: 90, x: 0, y: 0, elite: true },
    ];
    expect(pickRecycleIndex(list, 1000, 1000)).toBe(1);
  });

  it("Director plant Ring/Strom/Elite korrekt", () => {
    expect(directorPlan(3 * 60).wave.special).toBe("ring");
    expect(directorPlan(6 * 60).wave.special).toBe("stream");
    expect(directorPlan(4 * 60).elite).toBe(true);
    expect(directorPlan(0).elite).toBe(false);
    expect(elitePackCount(4)).toBe(2);
    expect(elitePackCount(28)).toBe(5);
    const stream = streamSpawnOffsets(5, 300, 0);
    expect(stream).toHaveLength(5);
    expect(new Set(stream.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)).size).toBe(5);
  });
});

describe("Moorwasser", () => {
  it("Wasser bremst um 40 %, Gras nicht", () => {
    expect(terrainSpeedFactor("water")).toBe(WATER_SLOW_FACTOR);
    expect(terrainSpeedFactor("water")).toBeCloseTo(0.6);
    expect(terrainSpeedFactor("grass")).toBe(1);
    expect(terrainSpeedFactor("path")).toBe(1);
    expect(isSplashTerrain("water")).toBe(true);
    expect(isSplashTerrain("mud")).toBe(false);
  });
});

describe("Boss-Mechaniken", () => {
  it("alle 6 Bosse haben telegraphierte Angriffe", () => {
    for (let i = 0; i < 6; i++) {
      const list = attacksFor(i, 1);
      expect(list.length, `Boss ${i}`).toBeGreaterThan(0);
      for (const a of list) {
        expect(a.telegraph).toBeGreaterThan(0);
        expect(a.interval).toBeGreaterThan(0);
      }
      expect(nextBossAttack(i, 1, 0).kind.length).toBeGreaterThan(3);
    }
    expect(bossSpawnTimes()).toEqual([300, 600, 900, 1200, 1500, 1800]);
    expect(bossAtSecond(0)).toBe(300);
    expect(bossSpawnSecond(5)).toBe(1800);
  });

  it("Endboss hat 3 deutlich verschiedene Phasen", () => {
    expect(bossPhase(0.8)).toBe(1);
    expect(bossPhase(0.5)).toBe(2);
    expect(bossPhase(0.2)).toBe(3);
    const kinds = [1, 2, 3].map((p) => attacksFor(5, p).map((a) => a.kind).join(","));
    expect(new Set(kinds).size).toBe(3);
  });

  it("HP-Balkenfarbe wechselt grün→amber→rot", () => {
    expect(bossHpColorIndex(0.9)).toBe(31);
    expect(bossHpColorIndex(0.4)).toBe(20);
    expect(bossHpColorIndex(0.1)).toBe(25);
  });
});

describe("AutoPlay-Bot", () => {
  const base = {
    playerX: 500, playerY: 500, worldSize: 4096,
    enemies: [], projectiles: [], hazards: [], gems: [],
  };

  it("weicht Projekten und Warnflächen aus", () => {
    const awayFromProjectile = botDirection({
      ...base,
      projectiles: [{ x: 530, y: 500, vx: -60, vy: 0, radius: 5 }],
    });
    expect(awayFromProjectile.x).toBeLessThan(0);
    const awayFromHazard = botDirection({
      ...base,
      hazards: [{ x: 500, y: 525, radius: 30 }],
    });
    expect(awayFromHazard.y).toBeLessThan(0);
    const awayFromEnemy = botDirection({
      ...base,
      enemies: [{ x: 470, y: 500, radius: 8 }],
    });
    expect(awayFromEnemy.x).toBeGreaterThan(0);
  });

  it("sammelt XP, wenn keine Gefahr drängt", () => {
    const dir = botDirection({ ...base, gems: [{ x: 560, y: 500 }] });
    expect(dir.x).toBeGreaterThan(0.5);
  });

  it("wählt Level-ups nach Prioritätsliste", () => {
    const offers: Offer[] = [
      { kind: "passive", id: "hourglass", name: "Sanduhr", description: "", level: 2, isNew: false, iconColor: 1 },
      { kind: "weapon", id: "ember", name: "Glutfunke", description: "", level: 2, isNew: false, iconColor: 1 },
      { kind: "weapon", id: "thorn", name: "Dornen", description: "", level: 1, isNew: true, iconColor: 1 },
    ];
    expect(chooseBestOffer(offers)).toBe(2);
    expect(offerScore(offers[2])).toBeGreaterThan(offerScore(offers[1]));
    expect(chooseBestOffer([])).toBe(0);
  });
});

describe("Datentabellen M3", () => {
  it("alle 30 Gegner sind implementiert und haben eine eindeutige Farbe", () => {
    const colors = new Set<number>();
    for (const id of ENEMY_IDS) {
      expect(ENEMIES[id].implemented, id).toBe(true);
      colors.add(ENEMIES[id].color);
    }
    expect(colors.size).toBe(30);
  });

  it("Boss-Daten passen zu den Spawnzeiten", () => {
    for (const boss of BOSSES) {
      expect(boss.implemented).toBe(true);
      expect(boss.atSecond).toBe(bossSpawnSecond(boss.index));
    }
  });
});
