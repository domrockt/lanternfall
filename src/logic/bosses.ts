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

// ---------------------------------------------------------------------------
// Boss-Lure-Fairness (M10-boss-lure-fair)
// Reine Regeln für Verfolgungs-/Aggro-Verhalten, bewusst in dieser Datei
// (Claim der Lane), damit BossSystem.ts dünn bleibt und alles unit-testbar
// ist. KEINE Balance-Werte: Boss-HP/Grundtempo/Kontaktschaden stehen in
// src/data/bosses.ts und bleiben unverändert (Boss-Dauern 20-60 s,
// Beleg shots/balance-main.json + docs/lanes/m10-boss-lure-fair.md).
// ---------------------------------------------------------------------------

/** Radius der Spawn-Zone (px); halbe kurze View-Seite (640x360 → 320). */
export const BOSS_LEASH_RADIUS = 320;
/** Toleranz (px), innerhalb derer der Spieler die Zone noch "bewohnt". */
export const BOSS_LEASH_RELEASE_SLACK = 40;
/** Anteil, mit dem die Bewegung zur Zone zurückgemischt wird (0..1). */
export const BOSS_LEASH_BLEND = 0.55;
/** Ab dieser Spielerentfernung gilt der Boss als abgedriftet (px). */
export const BOSS_CATCHUP_DIST = 360;
/** So lange (s) jenseits von BOSS_CATCHUP_DIST, bevor Catch-up greift. */
export const BOSS_CATCHUP_AFTER_S = 2;
/** Verfolgungs-Faktor während des Catch-up (nur bis ENGAGE_DIST aktiv). */
export const BOSS_CATCHUP_SPEED_MUL = 1.2;
/** Obere Gesamttempo-Grenze während Catch-up (px/s, unter Mira-Tempo 62). */
export const BOSS_CATCHUP_MAX_SPEED = 60;
/** Catch-up endet, wenn der Boss wieder so nah ist (px). */
export const BOSS_CATCHUP_ENGAGE_DIST = 220;
/** Mindest-Schadensfenster (s), ab dem ein Zielwechsel fair ist. */
export const BOSS_MIN_DAMAGE_WINDOW_S = 0.3;
/** Boss gilt bis zu dieser View-Marge (px) als sichtbar. */
export const BOSS_ONSCREEN_MARGIN = 48;
/** Zusätzliche Klemme (px) beim Sichtbarkeits-Clamp um den Flächentrand. */
export const BOSS_VIEW_CLAMP_MARGIN = 2;

/** Sichtbarer Weltbereich (Kamera worldView). */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * m10-boss-dur-determinism (K2-Befund, docs/lanes/m10-boss-dur-determinism.md):
 * Phaser aktualisiert camera.worldView nur im preRender (pro Render-Frame) —
 * im SIM_MAX_STEP-Teilschritt-Loop ist das frame-abhängig. Diese reine Funktion
 * leitet den sichtbaren Weltbereich stattdessen aus dem Sim-Anker ab:
 * scrollX/Y wird pro Teilschritt in Run.simulate gesetzt; die Weite ergibt sich
 * aus Viewport × Render-Teiler (enforceCameraProjection: camera.width =
 * scale.width/s, zoom = 1/s → worldView.width = scale.width). Bei zoom = 1/s
 * bis auf Phasers Integer-Rundung der worldView identisch (Camera.preRender
 * rundet x/y/Weite ganzzahlig, Delta ≤ 0,5 px an Gate-Grenzen); der
 * Intro-Zoom-Puls (Echtzeit-Tween) wird bewusst NICHT eingerechnet — rein
 * visuell, keine Sim-Bedeutung.
 */
export function simViewRect(
  scrollX: number,
  scrollY: number,
  cameraWidth: number,
  cameraHeight: number,
  renderDivisor: number,
): ViewRect {
  const s = Math.max(1, Math.round(renderDivisor || 1));
  const w = cameraWidth * s;
  const h = cameraHeight * s;
  return {
    x: scrollX + cameraWidth / 2 - w / 2,
    y: scrollY + cameraHeight / 2 - h / 2,
    width: w,
    height: h,
  };
}

/**
 * Klemmt den Mittelpunkt einer (Schadens-)Fläche in den sichtbaren
 * Weltbereich: Warnfläche und Trefferfläche liegen komplett im View, auch
 * wenn die Kamera an der Weltkante geklemmt ist. Rein geometrisch, ohne
 * Änderung von Schaden/Radius/Warnzeit.
 */
export function clampPointToView(
  x: number, y: number, radius: number, view: ViewRect,
): { x: number; y: number } {
  const m = radius + BOSS_VIEW_CLAMP_MARGIN;
  if (view.width < 2 * m || view.height < 2 * m) {
    return { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  }
  return {
    x: Math.min(Math.max(x, view.x + m), view.x + view.width - m),
    y: Math.min(Math.max(y, view.y + m), view.y + view.height - m),
  };
}

/**
 * Sanfter Leash: Der Boss verlässt die Spawn-Zone nicht dauerhaft. Solange
 * der Spieler die Zone (fast) noch bewohnt, wird die Bewegung anteilig zur
 * Zone zurückgemischt; hat der Spieler die Arena selbst verlassen, wird der
 * Leash gelöst (der Boss muss mitkommen, sonst stockt der Kampf).
 */
export function bossLeashSteer(
  bossX: number, bossY: number, spawnX: number, spawnY: number,
  playerX: number, playerY: number, moveX: number, moveY: number,
): { mx: number; my: number; leashed: boolean } {
  const dx = bossX - spawnX;
  const dy = bossY - spawnY;
  const dSpawn = Math.hypot(dx, dy);
  if (dSpawn <= BOSS_LEASH_RADIUS || dSpawn === 0) {
    return { mx: moveX, my: moveY, leashed: false };
  }
  const dPlayer = Math.hypot(playerX - spawnX, playerY - spawnY);
  if (dPlayer > BOSS_LEASH_RADIUS + BOSS_LEASH_RELEASE_SLACK) {
    return { mx: moveX, my: moveY, leashed: false };
  }
  const keep = 1 - BOSS_LEASH_BLEND;
  return {
    mx: moveX * keep + (-dx / dSpawn) * BOSS_LEASH_BLEND,
    my: moveY * keep + (-dy / dSpawn) * BOSS_LEASH_BLEND,
    leashed: true,
  };
}

/**
 * Catch-up-Tempo: Ein Boss, das länger als BOSS_CATCHUP_AFTER_S weiter als
 * BOSS_CATCHUP_DIST vom Spieler entfernt ist, holt deterministisch auf
 * (Faktor auf dem Grundtempo, hart geklemmt unter dem Spielertempo), bis er
 * wieder in Engagement-Distanz ist. `farSeconds` akkumuliert das System.
 */
export function bossCatchupSpeed(
  baseSpeed: number, sprintMul: number, distToPlayer: number, farSeconds: number,
): number {
  const engaged = distToPlayer <= BOSS_CATCHUP_ENGAGE_DIST;
  const chasing = distToPlayer > BOSS_CATCHUP_DIST && farSeconds >= BOSS_CATCHUP_AFTER_S;
  if (!chasing || engaged) return baseSpeed * sprintMul;
  return Math.min(baseSpeed * sprintMul * BOSS_CATCHUP_SPEED_MUL, BOSS_CATCHUP_MAX_SPEED);
}

/**
 * Zielwechsel-Regel: Ein Angriff darf nur umgeplant werden, wenn das
 * Schadensfenster (Telegraph + Wirkzeit) mindestens fair lang bleibt.
 * Kurze Fenster (< 0,3 s) dürfen nicht (mehr) aufs Ziel gelegt werden.
 */
export function canRetargetAttack(windowS: number): boolean {
  return windowS >= BOSS_MIN_DAMAGE_WINDOW_S;
}

/** Kürzester Telegraph aller Boss-Angriffe (Guard-Datenquelle). */
export function minBossAttackTelegraph(): number {
  let min = Number.POSITIVE_INFINITY;
  for (const phases of Object.values(BOSS_ATTACKS)) {
    for (const phase of phases) {
      for (const attack of phase) {
        if (attack.telegraph < min) min = attack.telegraph;
      }
    }
  }
  return min;
}
