import { describe, expect, it } from "vitest";
import {
  BOSSES, CHARACTER_LIST, ENEMIES, ENEMY_IDS, EVOLUTIONS, PASSIVES,
  WAVES, WEAPONS, WEAPON_IDS,
} from "../src/data";
import { PAL } from "../src/palette";
import { SPRITE_GRIDS } from "../src/gfx/textures";

describe("Datentabellen", () => {
  it("Palette hat genau 32 Farben", () => {
    expect(PAL).toHaveLength(32);
    expect(new Set(PAL).size).toBe(32);
  });

  it("alle 30 Gegner mit vollständigem Schema", () => {
    expect(ENEMY_IDS).toHaveLength(30);
    expect(Object.keys(ENEMIES)).toHaveLength(30);
    for (const id of ENEMY_IDS) {
      const e = ENEMIES[id];
      expect(e.id).toBe(id);
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.hp).toBeGreaterThan(0);
      expect(e.speed).toBeGreaterThan(0);
      expect(e.radius).toBeGreaterThan(0);
      expect(["chaser", "swarm", "tank", "ranged", "charger", "splitter", "exploder", "phaser", "orbiter", "summoner"]).toContain(e.archetype);
    }
  });

  it("M1-Gegner sind implementiert", () => {
    expect(ENEMIES.bog_rat.implemented).toBe(true);
    expect(ENEMIES.wisp.implemented).toBe(true);
    expect(ENEMIES.bogzombie.implemented).toBe(true);
  });

  it("6 Waffen je 8 Stufen", () => {
    expect(WEAPON_IDS).toHaveLength(6);
    for (const id of WEAPON_IDS) {
      const w = WEAPONS[id];
      expect(w.levels).toHaveLength(8);
      w.levels.forEach((l, i) => {
        expect(l.level).toBe(i + 1);
        expect(l.damage).toBeGreaterThan(0);
        expect(l.cooldown).toBeGreaterThan(0);
      });
    }
    expect(WEAPONS.ember.implemented).toBe(true);
  });

  it("6 Powerups je 5 Stufen, 6 Evolutionen, 6 Bosse", () => {
    expect(Object.keys(PASSIVES)).toHaveLength(6);
    for (const p of Object.values(PASSIVES)) {
      expect(p.levels).toHaveLength(5);
      expect(p.maxLevel).toBe(5);
    }
    expect(EVOLUTIONS).toHaveLength(6);
    expect(BOSSES).toHaveLength(6);
    expect(BOSSES[5].atSecond).toBe(1800);
  });

  it("30 Wellen, Mischung wechselt alle 5 Minuten", () => {
    expect(WAVES).toHaveLength(30);
    expect(WAVES[0].mix.bog_rat).toBeGreaterThan(0);
    expect(WAVES[5].mix.skeleton).toBeGreaterThan(0);
    expect(WAVES[29].mix.horror).toBeGreaterThan(0);
    for (let i = 1; i < WAVES.length; i++) {
      expect(WAVES[i].spawnRate).toBeGreaterThan(WAVES[i - 1].spawnRate);
    }
  });

  it("alle Sprite-Grids sind rechteckig", () => {
    for (const [key, def] of Object.entries(SPRITE_GRIDS)) {
      expect(def.rows.length, key).toBe(def.h);
      for (const row of def.rows) expect(row.length, `${key}: ${row}`).toBe(def.w);
    }
  });

  it("zwei Charaktere mit Startwaffe und Bonus", () => {
    expect(CHARACTER_LIST).toHaveLength(2);
    expect(CHARACTER_LIST[0].startWeapon).toBe("ember");
    expect(CHARACTER_LIST[1].startWeapon).toBe("flail");
    expect(CHARACTER_LIST[1].hp).toBeGreaterThan(CHARACTER_LIST[0].hp);
  });
});
