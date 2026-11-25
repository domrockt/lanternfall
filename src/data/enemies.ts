import { C } from "../palette";
import type { EnemyDef, EnemyId } from "./types";

/**
 * Alle 30 Gegner laut GAME.md. `implemented` markiert die M1-Archetypen
 * (bog_rat = swarm, wisp/bogzombie = chaser). Der Rest ist Datenbasis für M3.
 * Werte skalieren im Run zusätzlich mit der Spielzeit.
 */
export const ENEMIES: Record<EnemyId, EnemyDef> = {
  // ── Stufe 0–5 ────────────────────────────────────────────────
  bog_rat: { id: "bog_rat", name: "Moorratte", archetype: "swarm", tier: 0, hp: 8, speed: 48, damage: 4, radius: 6, xp: 1, implemented: true, spriteKey: "enemy_bog_rat", color: C.emberBrown },
  wisp: { id: "wisp", name: "Irrlicht", archetype: "chaser", tier: 0, hp: 14, speed: 42, damage: 6, radius: 6, xp: 1, implemented: true, spriteKey: "enemy_wisp", color: C.lantern },
  mudling: { id: "mudling", name: "Schlammling", archetype: "splitter", tier: 0, hp: 26, speed: 30, damage: 8, radius: 8, xp: 2, implemented: false, spriteKey: "enemy_mudling", color: C.marsh },
  crow: { id: "crow", name: "Aaskrähe", archetype: "swarm", tier: 0, hp: 9, speed: 62, damage: 4, radius: 5, xp: 1, flying: true, implemented: false, spriteKey: "enemy_crow", color: C.fog },
  bogzombie: { id: "bogzombie", name: "Moorleiche", archetype: "chaser", tier: 0, hp: 34, speed: 28, damage: 11, radius: 8, xp: 3, implemented: true, spriteKey: "enemy_bogzombie", color: C.marshLight },
  toad: { id: "toad", name: "Giftkröte", archetype: "ranged", tier: 0, hp: 22, speed: 22, damage: 7, radius: 8, xp: 2, implemented: false, spriteKey: "enemy_toad", color: C.marshLight },

  // ── Stufe 5–10 ───────────────────────────────────────────────
  skeleton: { id: "skeleton", name: "Knochenwächter", archetype: "chaser", tier: 1, hp: 48, speed: 38, damage: 12, radius: 7, xp: 4, implemented: false, spriteKey: "enemy_skeleton", color: C.bone },
  bat: { id: "bat", name: "Blutfledermaus", archetype: "swarm", tier: 1, hp: 16, speed: 72, damage: 5, radius: 5, xp: 1, flying: true, implemented: false, spriteKey: "enemy_bat", color: C.blood },
  ghoul: { id: "ghoul", name: "Ghul", archetype: "charger", tier: 1, hp: 55, speed: 40, damage: 14, radius: 8, xp: 4, implemented: false, spriteKey: "enemy_ghoul", color: C.mossDark },
  witchling: { id: "witchling", name: "Hexenlehrling", archetype: "ranged", tier: 1, hp: 30, speed: 26, damage: 8, radius: 7, xp: 3, implemented: false, spriteKey: "enemy_witchling", color: C.crimson },
  slime: { id: "slime", name: "Moorschleim", archetype: "splitter", tier: 1, hp: 60, speed: 24, damage: 10, radius: 9, xp: 4, implemented: false, spriteKey: "enemy_slime", color: C.marsh },
  scarecrow: { id: "scarecrow", name: "Strohmann", archetype: "tank", tier: 1, hp: 110, speed: 18, damage: 15, radius: 9, xp: 6, implemented: false, spriteKey: "enemy_scarecrow", color: C.amber },

  // ── Stufe 10–15 ──────────────────────────────────────────────
  wolf: { id: "wolf", name: "Schattenwolf", archetype: "charger", tier: 2, hp: 70, speed: 58, damage: 16, radius: 8, xp: 5, implemented: false, spriteKey: "enemy_wolf", color: C.blueGrey },
  banshee: { id: "banshee", name: "Klageweib", archetype: "phaser", tier: 2, hp: 45, speed: 44, damage: 13, radius: 7, xp: 5, implemented: false, spriteKey: "enemy_banshee", color: C.paleMist },
  golem: { id: "golem", name: "Torfgolem", archetype: "tank", tier: 2, hp: 220, speed: 15, damage: 20, radius: 11, xp: 9, implemented: false, spriteKey: "enemy_golem", color: C.mossDark },
  spider: { id: "spider", name: "Grabspinne", archetype: "swarm", tier: 2, hp: 25, speed: 66, damage: 8, radius: 6, xp: 2, implemented: false, spriteKey: "enemy_spider", color: C.ink },
  cultist: { id: "cultist", name: "Kultist", archetype: "summoner", tier: 2, hp: 60, speed: 24, damage: 10, radius: 7, xp: 6, implemented: false, spriteKey: "enemy_cultist", color: C.blood },
  bomber: { id: "bomber", name: "Pilzbomber", archetype: "exploder", tier: 2, hp: 35, speed: 46, damage: 18, radius: 7, xp: 4, implemented: false, spriteKey: "enemy_bomber", color: C.hotRed },

  // ── Stufe 15–20 ──────────────────────────────────────────────
  knight: { id: "knight", name: "Verfluchter Ritter", archetype: "tank", tier: 3, hp: 340, speed: 17, damage: 24, radius: 10, xp: 12, implemented: false, spriteKey: "enemy_knight", color: C.blueGrey },
  harpy: { id: "harpy", name: "Moorharpyie", archetype: "orbiter", tier: 3, hp: 90, speed: 62, damage: 15, radius: 7, xp: 7, flying: true, implemented: false, spriteKey: "enemy_harpy", color: C.mist },
  lich: { id: "lich", name: "Kleiner Lich", archetype: "ranged", tier: 3, hp: 120, speed: 22, damage: 17, radius: 8, xp: 9, implemented: false, spriteKey: "enemy_lich", color: C.marshLight },
  wraith: { id: "wraith", name: "Wiedergänger", archetype: "phaser", tier: 3, hp: 140, speed: 40, damage: 19, radius: 8, xp: 9, implemented: false, spriteKey: "enemy_wraith", color: C.fogBlue },
  treant: { id: "treant", name: "Faulbaum", archetype: "tank", tier: 3, hp: 420, speed: 12, damage: 26, radius: 12, xp: 14, implemented: false, spriteKey: "enemy_treant", color: C.mossDark },
  imp: { id: "imp", name: "Glutimp", archetype: "exploder", tier: 3, hp: 55, speed: 58, damage: 22, radius: 7, xp: 6, implemented: false, spriteKey: "enemy_imp", color: C.flame },

  // ── Stufe 20–30 ──────────────────────────────────────────────
  horror: { id: "horror", name: "Augenhorror", archetype: "ranged", tier: 4, hp: 220, speed: 20, damage: 22, radius: 10, xp: 14, implemented: false, spriteKey: "enemy_horror", color: C.fleshWarm },
  centipede: { id: "centipede", name: "Knochenläufer", archetype: "charger", tier: 4, hp: 260, speed: 64, damage: 26, radius: 9, xp: 13, flying: false, implemented: false, spriteKey: "enemy_centipede", color: C.bone },
  gargoyle: { id: "gargoyle", name: "Wasserspeier", archetype: "orbiter", tier: 4, hp: 180, speed: 52, damage: 20, radius: 9, xp: 12, flying: true, implemented: false, spriteKey: "enemy_gargoyle", color: C.fog },
  reaper_bat: { id: "reaper_bat", name: "Nachtsense", archetype: "swarm", tier: 4, hp: 70, speed: 82, damage: 12, radius: 6, xp: 6, flying: true, implemented: false, spriteKey: "enemy_reaper_bat", color: C.bloodNight },
  abom: { id: "abom", name: "Fleischkoloss", archetype: "splitter", tier: 4, hp: 620, speed: 14, damage: 30, radius: 13, xp: 18, implemented: false, spriteKey: "enemy_abom", color: C.fleshWarm },
  voidcaller: { id: "voidcaller", name: "Leerenrufer", archetype: "summoner", tier: 4, hp: 300, speed: 18, damage: 24, radius: 10, xp: 16, implemented: false, spriteKey: "enemy_voidcaller", color: C.blueGrey },
};

export const ENEMY_LIST = Object.values(ENEMIES);
export const implementedEnemies = (): EnemyDef[] => ENEMY_LIST.filter((e) => e.implemented);
