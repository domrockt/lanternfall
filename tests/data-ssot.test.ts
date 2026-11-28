// m10-data-ssot-guard K3: Guard-Test für die Data-SSOT-Dateien
// (weaponIds.ts, index.ts, types.ts als ID-/Schema-Quelle).
//
// Schützt die Konsistenz, auf der der acceptance-count-Vertrag A3
// (30/6/6/6/6/2) und die Evo-FX-Kette (Waffen-ID-Eindeutigkeit) ruhen:
// keine doppelten IDs, weaponIds ↔ WEAPONS-Keys, Evolutions-Paare vollständig,
// types-Kernfelder vorhanden. Bei Datenänderung schlägt dieser Test fehl,
// BEVOR unsichtbarer Drift entsteht. Befund-Lauf: scripts/m10-data-ssot.mjs.
import { describe, expect, it } from "vitest";
import {
  BOSS_IDS,
  CHARACTER_IDS,
  ENEMY_IDS,
  EVOLUTION_WEAPON_IDS,
  PASSIVE_IDS,
  WEAPON_IDS,
} from "../src/data/types";
import { WEAPONS } from "../src/data/weapons";
import { EVOLUTIONS } from "../src/data/evolutions";
import { EVOLUTION_WEAPONS } from "../src/data/evolution-weapons";
import { PASSIVES } from "../src/data/passives";
import { CHARACTERS, CHARACTER_LIST } from "../src/data/characters";
import { ENEMIES, ENEMY_LIST } from "../src/data/enemies";
import { BOSSES } from "../src/data/bosses";
import { weaponDef } from "../src/data/weaponIds";

function dupes(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  return ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
}

describe("data-ssot: ID-Eindeutigkeit (types.ts)", () => {
  it("kein ID-Array enthält Dubletten", () => {
    expect(dupes(WEAPON_IDS)).toEqual([]);
    expect(dupes(EVOLUTION_WEAPON_IDS)).toEqual([]);
    expect(dupes(PASSIVE_IDS)).toEqual([]);
    expect(dupes(CHARACTER_IDS)).toEqual([]);
    expect(dupes(BOSS_IDS)).toEqual([]);
    expect(dupes(ENEMY_IDS)).toEqual([]);
  });

  it("WEAPON_IDS hat die Sollmenge 6 und deckt alle WEAPONS-Keys ab", () => {
    expect(WEAPON_IDS).toHaveLength(6);
    expect([...WEAPON_IDS].sort()).toEqual(Object.keys(WEAPONS).sort());
    for (const [key, def] of Object.entries(WEAPONS)) {
      expect(def.id).toBe(key);
    }
  });

  it("EVOLUTION_WEAPON_IDS hat die Sollmenge 6 und deckt alle EVOLUTION_WEAPONS-Keys ab", () => {
    expect(EVOLUTION_WEAPON_IDS).toHaveLength(6);
    expect([...EVOLUTION_WEAPON_IDS].sort()).toEqual(Object.keys(EVOLUTION_WEAPONS).sort());
  });
});

describe("data-ssot: Evolutions-Paare vollständig", () => {
  it("jede Basiswaffe hat genau eine Evolution mit gültigem Passive", () => {
    expect(EVOLUTIONS).toHaveLength(6);
    const bases = EVOLUTIONS.map((e) => e.baseWeapon).sort();
    expect(bases).toEqual([...WEAPON_IDS].sort());
    for (const evo of EVOLUTIONS) {
      expect(PASSIVE_IDS).toContain(evo.passive);
      expect(EVOLUTION_WEAPON_IDS).toContain(evo.id);
      const def = EVOLUTION_WEAPONS[evo.id];
      expect(def).toBeDefined();
      expect(def!.behavior).toBe(evo.id);
    }
  });

  it("weaponDef() löst jede Basis- und Evolutionswaffe auf", () => {
    for (const id of [...WEAPON_IDS, ...EVOLUTION_WEAPON_IDS]) {
      expect(weaponDef(id)).not.toBeNull();
    }
  });

  it("jede Waffe (Basis + Evolution) hat fortlaufende Stufen 1..maxLevel", () => {
    const all = { ...WEAPONS, ...EVOLUTION_WEAPONS };
    for (const [key, def] of Object.entries(all)) {
      expect(def.levels, key).toHaveLength(def.maxLevel);
      def.levels.forEach((lvl, i) => {
        expect(lvl.level, `${key} Stufe ${i + 1}`).toBe(i + 1);
      });
    }
  });
});

describe("data-ssot: weitere Key/ID-Drifts", () => {
  it("PASSIVES/CHARACTERS/ENEMIES/BOSSES folgen ihren ID-Arrays", () => {
    expect(Object.keys(PASSIVES).sort()).toEqual([...PASSIVE_IDS].sort());
    expect(Object.keys(CHARACTERS).sort()).toEqual([...CHARACTER_IDS].sort());
    expect(Object.keys(ENEMIES).sort()).toEqual([...ENEMY_IDS].sort());
    expect(BOSSES.map((b) => b.id)).toEqual([...BOSS_IDS]);
    BOSSES.forEach((b, i) => expect(b.index).toBe(i));
  });

  it("Listen-Exporte haben dieselbe Laenge wie die ID-Arrays", () => {
    expect(CHARACTER_LIST).toHaveLength(CHARACTER_IDS.length);
    expect(ENEMY_LIST).toHaveLength(ENEMY_IDS.length);
  });
});

describe("data-ssot: types-Kernfelder vorhanden", () => {
  it("WeaponDef-Kernfelder und StatMods-Felder sind an allen Defs belegt", () => {
    const all = { ...WEAPONS, ...EVOLUTION_WEAPONS };
    for (const [key, def] of Object.entries(all)) {
      expect(def.name, key).toBeTruthy();
      expect(def.description, key).toBeTruthy();
      expect(def.implemented, key).toBe(true);
      expect(typeof def.iconColor, key).toBe("number");
      expect(def.levels[0].damage, `${key} Stufe 1 damage`).toBeGreaterThan(0);
      expect(def.levels[0].cooldown, `${key} Stufe 1 cooldown`).toBeGreaterThan(0);
    }
    for (const p of Object.values(PASSIVES)) {
      expect(p.levels.length, p.id).toBeGreaterThanOrEqual(1);
      expect(Object.keys(p.levels[0].mods).length, p.id).toBeGreaterThanOrEqual(1);
    }
    for (const c of CHARACTER_LIST) {
      expect(c.hp).toBeGreaterThan(0);
      expect(c.speed).toBeGreaterThan(0);
      expect(WEAPON_IDS).toContain(c.startWeapon);
      expect(Object.keys(c.mods).length).toBeGreaterThanOrEqual(1);
    }
    for (const e of ENEMY_LIST) {
      expect(e.hp).toBeGreaterThan(0);
      expect(e.xp).toBeGreaterThan(0);
      expect(e.spriteKey).toBeTruthy();
    }
    for (const b of BOSSES) {
      expect(b.hp).toBeGreaterThan(0);
      expect(b.atSecond).toBeGreaterThan(0);
    }
  });
});

describe("data-ssot: acceptance-count-Vertrag A3", () => {
  it("Inhaltszaehlung bleibt 30/6/6/6/6/2", () => {
    const counts = {
      enemies: Object.keys(ENEMIES).length,
      weapons: Object.keys(WEAPONS).length,
      powerups: Object.keys(PASSIVES).length,
      evolutions: EVOLUTIONS.length,
      bosses: BOSSES.length,
      characters: Object.keys(CHARACTERS).length,
    };
    expect(counts).toEqual({ enemies: 30, weapons: 6, powerups: 6, evolutions: 6, bosses: 6, characters: 2 });
  });
});
