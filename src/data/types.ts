/** Zentrale, typisierte Schemas für alle Inhalte. */

export const WEAPON_IDS = ["ember", "flail", "frost", "thorn", "storm", "lantern"] as const;
export type WeaponId = (typeof WEAPON_IDS)[number];

/** Evolvierte Waffen belegen denselben Slot wie ihre Basiswaffe. */
export const EVOLUTION_WEAPON_IDS = [
  "phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon",
] as const;
export type EvolutionWeaponId = (typeof EVOLUTION_WEAPON_IDS)[number];
/** Jede Waffen-ID, die in einem Slot stehen kann (Basis oder Evolution). */
export type WeaponAnyId = WeaponId | EvolutionWeaponId;

export const PASSIVE_IDS = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"] as const;
export type PassiveId = (typeof PASSIVE_IDS)[number];

export const CHARACTER_IDS = ["mira", "kael"] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const BOSS_IDS = [
  "moor_queen",
  "bone_lord",
  "pale_shepherd",
  "bell_golem",
  "coven",
  "hollow_king",
] as const;
export type BossId = (typeof BOSS_IDS)[number];

export const ENEMY_IDS = [
  // Stufe 0–5
  "bog_rat", "wisp", "mudling", "crow", "bogzombie", "toad",
  // 5–10
  "skeleton", "bat", "ghoul", "witchling", "slime", "scarecrow",
  // 10–15
  "wolf", "banshee", "golem", "spider", "cultist", "bomber",
  // 15–20
  "knight", "harpy", "lich", "wraith", "treant", "imp",
  // 20–30
  "horror", "centipede", "gargoyle", "reaper_bat", "abom", "voidcaller",
] as const;
export type EnemyId = (typeof ENEMY_IDS)[number];

export type Archetype =
  | "chaser"
  | "swarm"
  | "tank"
  | "ranged"
  | "charger"
  | "splitter"
  | "exploder"
  | "phaser"
  | "orbiter"
  | "summoner";

export type WeaponBehavior =
  | "ember"
  | "flail"
  | "frost"
  | "thorn"
  | "storm"
  | "lantern"
  | "phoenix"
  | "wrath_pendulum"
  | "eternal_winter"
  | "thorn_storm"
  | "thunder_seal"
  | "soul_beacon";

export interface StatMods {
  /** +x % Bewegungstempo */
  moveSpeedPct?: number;
  /** -x % Abklingzeit (positiv = schneller) */
  cooldownPct?: number;
  /** +x Max-HP */
  maxHpFlat?: number;
  /** +x % Max-HP (Basis-HP) */
  maxHpPct?: number;
  /** +x HP pro Sekunde */
  regen?: number;
  /** +x % Aufsammelradius */
  pickupRadiusPct?: number;
  /** +x % Waffenschaden */
  damagePct?: number;
  /** +x % Fläche/Radius */
  areaPct?: number;
  /** +x % Effektdauer */
  durationPct?: number;
  /** flache Rüstung */
  armorFlat?: number;
}

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  description: string;
  /** Startwerte */
  hp: number;
  speed: number;
  armor: number;
  startWeapon: WeaponId;
  /** Charakter-Bonus, angewendet wie ein Passive-Mod */
  mods: StatMods;
  spriteKey: string;
  /** Platzhalter bis eigene 32x32-Laufanimationen in M2/M3 entstehen. */
  artNote: string;
}

export interface WeaponLevel {
  level: number;
  damage: number;
  /** Sekunden zwischen Schüssen */
  cooldown: number;
  /** Anzahl Projektile / Treffer / Lichter */
  count?: number;
  /** Durchschlag (zusätzliche Treffer) */
  pierce?: number;
  /** Projektilgeschwindigkeit px/s */
  speed?: number;
  /** Radius / Fläche px */
  radius?: number;
  /** Effektdauer in s */
  duration?: number;
  /** Rückstoß in px */
  knockback?: number;
  /** Verlangsamung 0..1 */
  slow?: number;
  /** Freeze-Dauer s */
  freeze?: number;
  /** Kettenglieder (storm) */
  chain?: number;
  /** Kurzbeschreibung der Stufe für UI */
  note?: string;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  behavior: WeaponBehavior;
  description: string;
  maxLevel: number;
  /** Stufe 1–8. */
  levels: WeaponLevel[];
  /** true, wenn in dieser Meilenstein-Version spielbar. */
  implemented: boolean;
  iconColor: number;
}

export interface PassiveLevel {
  level: number;
  mods: StatMods;
  note?: string;
}

export interface PassiveDef {
  id: PassiveId;
  name: string;
  description: string;
  maxLevel: number;
  levels: PassiveLevel[];
  iconColor: number;
}

export interface EvolutionDef {
  /** Zugleich die WeaponAnyId der evolvierten Waffe. */
  id: EvolutionWeaponId;
  name: string;
  baseWeapon: WeaponId;
  passive: PassiveId;
  description: string;
  effect: string;
  implemented: boolean;
  iconColor: number;
}

export interface EnemyDef {
  id: EnemyId;
  name: string;
  archetype: Archetype;
  /** Zeitstufe 0..4 (0–5, 5–10, 10–15, 15–20, 20–30 min) */
  tier: number;
  hp: number;
  speed: number;
  damage: number;
  /** Kollisions-/Separierradius px */
  radius: number;
  /** XP-Wert des Drops (Basis; Größe wird gewürfelt) */
  xp: number;
  flying?: boolean;
  /** Nur diese drei sind in M1 gespielt; Rest ist Datenbasis für M3. */
  implemented: boolean;
  spriteKey: string;
  /** Platzhalterfarbe (Palettenindex) für Data-only-Gegner. */
  color: number;
}

export interface BossDef {
  index: number;
  id: BossId;
  name: string;
  atSecond: number;
  mechanic: string;
  hp: number;
  implemented: boolean;
}

export type WaveSpecial = "ring" | "stream" | null;

export interface WaveDef {
  /** Spielminute, 0-basiert (0 = 00:00–00:59) */
  minute: number;
  /** Gegner pro Sekunde (Basis) */
  spawnRate: number;
  /** Gewichtete Mischung */
  mix: Partial<Record<EnemyId, number>>;
  special: WaveSpecial;
  /** Boss, der in dieser Minute erscheint (Index in BOSSES). */
  bossIndex?: number;
}
