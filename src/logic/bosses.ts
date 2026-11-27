import { BOSSES } from "../data/bosses";
import { bossSpawnSecond } from "./scaling";

/** Boss-Angriffsarten; jede hat eine sichtbare Warnphase vor dem Treffer. */
export type BossAttackKind =
  | "jump_slam"
  | "poison_puddles"
  | "summon_ring"
  | "bone_boomerang"
  | "summon_wolves"
  | "scythe_sweep"
  | "stomp"
  | "stone_rain"
  | "teleport"
  | "fire_cross"
  | "thorn_ring"
  | "thorn_burst";

export interface BossAttackDef {
  kind: BossAttackKind;
  /** Vorwarnzeit in s (Bodenmarkierung/Wind-up). */
  telegraph: number;
  /** Pause bis zur nächsten Aktion in s. */
  interval: number;
  /** Trefferradius in px (0 = nur Projektile). */
  radius: number;
  /** Schadensfaktor relativ zum Boss-Kontaktschaden. */
  damageMul: number;
  note: string;
}

/** Mechaniken je Boss laut GAME.md, Endboss mit 3 Phasen. */
export const BOSS_ATTACKS: Record<number, BossAttackDef[][]> = {
  0: [
    [
      { kind: "jump_slam", telegraph: 0.95, interval: 4.2, radius: 74, damageMul: 1.15, note: "Sprung + Schockwelle" },
      { kind: "poison_puddles", telegraph: 0.8, interval: 3.2, radius: 26, damageMul: 0.5, note: "Giftpfützen" },
    ],
  ],
  1: [
    [
      { kind: "summon_ring", telegraph: 0.9, interval: 5.5, radius: 0, damageMul: 0, note: "Skelett-Ring" },
      { kind: "bone_boomerang", telegraph: 0.6, interval: 3.4, radius: 0, damageMul: 0.8, note: "Knochen-Bumerang" },
    ],
  ],
  2: [
    [
      { kind: "summon_wolves", telegraph: 0.75, interval: 5.4, radius: 0, damageMul: 0, note: "Wolfsrudel" },
      { kind: "scythe_sweep", telegraph: 0.72, interval: 3.0, radius: 82, damageMul: 1.0, note: "Sichel-Schwung" },
    ],
  ],
  3: [
    [
      { kind: "stomp", telegraph: 1.05, interval: 3.6, radius: 92, damageMul: 1.1, note: "Stampfer" },
      { kind: "stone_rain", telegraph: 1.2, interval: 4.0, radius: 24, damageMul: 0.7, note: "Steinregen mit Markierung" },
    ],
  ],
  4: [
    [
      { kind: "teleport", telegraph: 0.6, interval: 3.2, radius: 0, damageMul: 0, note: "Teleport-Wechsel" },
      { kind: "fire_cross", telegraph: 0.95, interval: 3.8, radius: 30, damageMul: 0.9, note: "Kreuzende Feuerstrahlen" },
    ],
  ],
  5: [
    [
      { kind: "thorn_ring", telegraph: 1.0, interval: 4.6, radius: 22, damageMul: 0.8, note: "Dornen-Arena-Ring" },
      { kind: "bone_boomerang", telegraph: 0.6, interval: 3.4, radius: 0, damageMul: 0.7, note: "Knochenwurf" },
    ],
    [
      { kind: "thorn_burst", telegraph: 0.9, interval: 3.2, radius: 28, damageMul: 0.9, note: "Dornen-Ausbruch" },
      { kind: "fire_cross", telegraph: 0.85, interval: 3.8, radius: 30, damageMul: 0.9, note: "Feuerkreuz" },
      { kind: "summon_ring", telegraph: 0.8, interval: 5.0, radius: 0, damageMul: 0, note: "Geister-Ring" },
    ],
    [
      { kind: "thorn_ring", telegraph: 0.75, interval: 3.4, radius: 24, damageMul: 1.0, note: "Dornen-Ring (Phase 3)" },
      { kind: "thorn_burst", telegraph: 0.7, interval: 2.6, radius: 30, damageMul: 1.1, note: "Dornen-Sturm (Phase 3)" },
      { kind: "fire_cross", telegraph: 0.65, interval: 2.9, radius: 30, damageMul: 1.1, note: "Feuerkreuz (Phase 3)" },
    ],
  ],
};

/** Endboss-Phasen: 1 bei > 66 %, 2 bei > 33 %, 3 darunter. */
export function bossPhase(hpRatio: number): 1 | 2 | 3 {
  if (hpRatio > 0.66) return 1;
  if (hpRatio > 0.33) return 2;
  return 3;
}

export function attacksFor(index: number, phase: number): BossAttackDef[] {
  const phases = BOSS_ATTACKS[index];
  if (!phases) return [];
  return phases[Math.max(0, Math.min(phases.length - 1, phase - 1))];
}

/** Rotierender Angriffsplan (deterministisch, ohne Zufall). */
export function nextBossAttack(index: number, phase: number, counter: number): BossAttackDef {
  const list = attacksFor(index, phase);
  if (list.length === 0) {
    return { kind: "stomp", telegraph: 1, interval: 3, radius: 70, damageMul: 1, note: "Fallback" };
  }
  return list[counter % list.length];
}

export function bossSpawnTimes(): number[] {
  return BOSSES.map((b) => bossSpawnSecond(b.index));
}

/** HP-Balkenfarbe (Palettenindex): grün → amber → rot. */
export function bossHpColorIndex(ratio: number): number {
  if (ratio > 0.55) return 31; // marshLight
  if (ratio > 0.25) return 20; // amber
  return 25; // crimson
}

export function bossAtSecond(index: number): number {
  return BOSSES[index]?.atSecond ?? bossSpawnSecond(index);
}

// ---------------------------------------------------------------------------
// Gegnerschuss-Fairness (M10-enemy-shots-fair)
// Reine Helfer, bewusst in dieser Datei (Claim der Lane), damit
// EnemyProjectiles.ts sie nutzen kann und die Regeln unit-testbar bleiben.
// ---------------------------------------------------------------------------

/** Jeder ranged-/summoner-Schuss zeigt vor dem Abflug mindestens 0,3 s Vorwarnung. */
export const ENEMY_SHOT_WINDUP_SECONDS = 0.36;
export const ENEMY_SHOT_WINDUP_MIN_SECONDS = 0.3;

/** Ein Schuss darf nur entstehen, wenn der Schütze lebt und im View liegt. */
export interface ShotLaunchGate {
  shooterAlive: boolean;
  originInView: boolean;
  windupElapsed: number;
  windupSeconds: number;
}

export function canLaunchShot(gate: ShotLaunchGate): boolean {
  return (
    gate.shooterAlive &&
    gate.originInView &&
    gate.windupSeconds >= ENEMY_SHOT_WINDUP_MIN_SECONDS &&
    gate.windupElapsed >= gate.windupSeconds
  );
}

/** Punkt-in-Rechteck-Test für das sichtbare Welt-Rechteck (Kamera-View). */
export function isPointInView(
  x: number,
  y: number,
  view: { x: number; y: number; width: number; height: number },
  margin = 0,
): boolean {
  return (
    x >= view.x - margin &&
    y >= view.y - margin &&
    x <= view.x + view.width + margin &&
    y <= view.y + view.height + margin
  );
}

/** Die vier Schuss-Optiken laut Briefing, je mit eigener Form/Farbe. */
export interface EnemyShotVisual {
  key: string;
  family: "spit" | "bone" | "shadow" | "fire";
  shape: "round" | "bone" | "halo" | "flame";
  /** Palettenindizes: helle Kontur, Kern, Glanz (Distinktheit belegbar). */
  rim: number;
  core: number;
  spark: number;
}

export const ENEMY_SHOT_VISUALS: Record<string, EnemyShotVisual> = {
  enemy_shot_spit: { key: "enemy_shot_spit", family: "spit", shape: "round", rim: 31, core: 17, spark: 21 },
  enemy_shot_bone: { key: "enemy_shot_bone", family: "bone", shape: "bone", rim: 11, core: 10, spark: 12 },
  enemy_shot_shadow: { key: "enemy_shot_shadow", family: "shadow", shape: "halo", rim: 6, core: 26, spark: 13 },
  enemy_shot_fire: { key: "enemy_shot_fire", family: "fire", shape: "flame", rim: 19, core: 18, spark: 12 },
};

/** Textur-Key je Archetyp/Tier; liefert genau eine der vier Optiken. */
export function shotTextureKeyFor(archetype: string, tier: number): string {
  if (archetype === "summoner") return "enemy_shot_shadow";
  if (archetype === "ranged") {
    // Alle vier Optiken kommen im Spiel vor: TI4 (horror) → Feuer, TI3 (lich) → Schatten.
    if (tier >= 4) return "enemy_shot_fire";
    if (tier >= 3) return "enemy_shot_shadow";
    return tier >= 1 ? "enemy_shot_bone" : "enemy_shot_spit";
  }
  return tier >= 2 ? "enemy_shot_fire" : "enemy_shot_spit";
}

/** Distinktheits-Maß: 4 Keys, 4 Formen, paarweise verschiedene Kernfarben. */
export function shotVisualsDistinct(): boolean {
  const list = Object.values(ENEMY_SHOT_VISUALS);
  const keys = new Set(list.map((v) => v.key));
  const shapes = new Set(list.map((v) => v.shape));
  const cores = new Set(list.map((v) => v.core));
  return keys.size === 4 && shapes.size === 4 && cores.size === 4;
}
