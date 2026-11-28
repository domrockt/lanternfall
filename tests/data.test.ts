import { describe, expect, it } from "vitest";
import {
  BOSSES, CHARACTER_LIST, ENEMIES, ENEMY_IDS, EVOLUTIONS, PASSIVES,
  WAVES, WEAPONS, WEAPON_IDS,
} from "../src/data";
import { PAL } from "../src/palette";
import { charIndex, SPRITE_GRIDS } from "../src/gfx/textures";
import { GLYPHS } from "../src/gfx/glyphs";

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
    // M2: alle sechs Basiswaffen sind spielbar.
    for (const id of WEAPON_IDS) expect(WEAPONS[id].implemented, id).toBe(true);
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

  it("Sprite-Grids nutzen nur transparente Pixel oder Palettenindizes 0–31", () => {
    for (const [key, def] of Object.entries(SPRITE_GRIDS)) {
      for (const row of def.rows) {
        for (const ch of row) {
          if (ch === ".") continue;
          const i = charIndex(ch);
          expect(i, `${key}: unbekanntes Zeichen "${ch}"`).toBeGreaterThanOrEqual(0);
          expect(i, `${key}: Index ${i} ausserhalb der Palette`).toBeLessThan(32);
        }
      }
    }
  });

  it("zwei Charaktere mit Startwaffe und Bonus", () => {
    expect(CHARACTER_LIST).toHaveLength(2);
    expect(CHARACTER_LIST[0].startWeapon).toBe("ember");
    expect(CHARACTER_LIST[1].startWeapon).toBe("flail");
    // Kael ist der Tank: Basis-HP plus Charakter-Mods ergeben mehr effektive HP
    // als Mira (Spec GAME.md Z.34/35: Mira 90 ohne HP-Mods, Kael 130·1,2+90 = 246;
    // F4-Entscheid maxHpPct 20, docs/lanes/m10-charstats-spec-followup.md).
    // Tempo-Vergleich bleibt auf Basiswerten (Mira 62 > Kael 59 ≈ 62·0,95; F3).
    const effectiveHp = (c: (typeof CHARACTER_LIST)[number]) =>
      Math.round(c.hp * (1 + (c.mods.maxHpPct ?? 0) / 100)) + (c.mods.maxHpFlat ?? 0);
    expect(effectiveHp(CHARACTER_LIST[1])).toBeGreaterThan(effectiveHp(CHARACTER_LIST[0]));
    expect(CHARACTER_LIST[0].speed).toBeGreaterThan(CHARACTER_LIST[1].speed);
    // F5-Entscheid (docs/lanes/m10-charstats-spec-followup.md): Spec GAME.md Z.35 "1 Rüstung"
    // ⇒ Kael 1, Mira 1 (Spec schweigt zu Mira) — Tank-Intent bleibt über >= + HP-/Regen-Bonus.
    expect(CHARACTER_LIST[1].armor).toBeGreaterThanOrEqual(CHARACTER_LIST[0].armor);
  });

  it("Bitmap-Font hat echte Umlaute und ß (keine AE/OE/UE-Ersetzung)", () => {
    for (const ch of ["Ä", "Ö", "Ü", "ä", "ö", "ü", "ß"]) {
      expect(GLYPHS[ch], ch).toBeTruthy();
      expect(GLYPHS[ch], ch).toHaveLength(7);
      for (const row of GLYPHS[ch]) expect(row.length).toBe(5);
    }
    // Meta-Zeilen nutzen den Mittelpunkt; ohne Glyphe würde "?" gerendert.
    expect(GLYPHS["·"], "·").toBeTruthy();
    for (const row of GLYPHS["·"]) expect(row.length).toBe(5);
    // Umlaute unterscheiden sich sichtbar von ihren Grundbuchstaben.
    expect(GLYPHS["Ä"].join("")).not.toBe(GLYPHS["A"].join(""));
    expect(GLYPHS["Ö"].join("")).not.toBe(GLYPHS["O"].join(""));
    expect(GLYPHS["Ü"].join("")).not.toBe(GLYPHS["U"].join(""));
    expect(GLYPHS["ß"].join("")).not.toBe(GLYPHS["S"].join(""));
  });
});
