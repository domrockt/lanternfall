import type { Archetype, EnemyId } from "../data/types";

/** Einfache RNG-Schnittstelle (SeededRng oder Test-Stub). */
export interface AiRng {
  next(): number;
}

export type AiMode =
  | "approach"
  | "windup"
  | "charge"
  | "recover"
  | "orbit"
  | "fade"
  | "fuse";

export interface AiState {
  mode: AiMode;
  /** Restzeit im aktuellen Modus (s). */
  timer: number;
  /** Cooldown bis zur nächsten Spezialaktion (s). */
  cooldown: number;
  /** Blickrichtung des Anlaufs / Teleports (normalisiert). */
  aimX: number;
  aimY: number;
  /** Umlaufrichtung für Orbiter (+1 / -1). */
  orbitDir: number;
  /** Exploder-Zündschnur (s), 0 = nicht gezündet. */
  fuse: number;
  /** Blink-Zähler (für Verifikation/Debug). */
  blinks: number;
  /** Anzahl ausgelöster Spezialangriffe. */
  attacks: number;
}

export interface AiParams {
  archetype: Archetype;
  tier: number;
  x: number;
  y: number;
  playerX: number;
  playerY: number;
  /** Basisgeschwindigkeit px/s (nur informativ, Bewegung liefert Richtung). */
  speed: number;
}

export type AiAction =
  | { type: "windup"; duration: number }
  | { type: "charge"; duration: number }
  | { type: "shoot"; vx: number; vy: number; speed: number }
  | { type: "summon"; minion: EnemyId; count: number }
  | { type: "blink"; x: number; y: number }
  | { type: "explode"; radius: number };

export interface AiStep {
  /** Normalisierte Wunschrichtung. */
  moveX: number;
  moveY: number;
  /** Geschwindigkeits-Multiplikator (z. B. Sprint 3, Zündschnur 0.25). */
  speedMul: number;
  state: AiState;
  actions: AiAction[];
}

/** Max. 2 Splitter-Generationen; verhindert eine unendliche Teilungs-Kaskade. */
export const MAX_SPLIT_DEPTH = 2;
export function shouldSplit(splitDepth: number): boolean {
  return splitDepth < MAX_SPLIT_DEPTH;
}

export function newAiState(rng: AiRng): AiState {
  return {
    mode: "approach",
    timer: 1.2 + rng.next() * 1.4,
    cooldown: 0.8 + rng.next() * 1.8,
    aimX: 1,
    aimY: 0,
    orbitDir: rng.next() < 0.5 ? -1 : 1,
    fuse: 0,
    blinks: 0,
    attacks: 0,
  };
}

/** Welche kleinen Gegner ein Summoner je Zeitstufe ruft. */
export function summonMinionId(tier: number): EnemyId {
  if (tier <= 0) return "bog_rat";
  if (tier <= 1) return "bat";
  if (tier <= 2) return "spider";
  return "reaper_bat";
}

function normalize(x: number, y: number, fallbackUid = 1): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len > 0.0001) return { x: x / len, y: y / len };
  const a = fallbackUid * 2.399963;
  return { x: Math.cos(a), y: Math.sin(a) };
}

/**
 * Ein reiner Zustandsautomat pro Archetyp. Liefert Bewegungsrichtung plus
 * ausgelöste Aktionen; die Szene kümmert sich um Sprites/Projektile.
 * Deterministisch über `rng` (seeded) und damit testbar.
 */
export function stepEnemyAi(
  previous: AiState,
  params: AiParams,
  dt: number,
  rng: AiRng,
  uid = 1,
): AiStep {
  const state: AiState = { ...previous };
  const actions: AiAction[] = [];
  const dx = params.playerX - params.x;
  const dy = params.playerY - params.y;
  const dist = Math.hypot(dx, dy);
  const toPlayer = normalize(dx, dy, uid);
  let moveX = toPlayer.x;
  let moveY = toPlayer.y;
  let speedMul = 1;

  state.timer = Math.max(0, state.timer - dt);
  state.cooldown = Math.max(0, state.cooldown - dt);

  switch (params.archetype) {
    case "swarm": {
      speedMul = 1.08;
      break;
    }
    case "tank": {
      speedMul = 0.92;
      break;
    }
    case "chaser": {
      speedMul = 1;
      break;
    }
    case "ranged": {
      // Abstand halten: zu nah → zurück, zu weit → ran, dazwischen seitlich kreuzen.
      const preferred = 108 + params.tier * 6;
      if (dist < preferred - 22) {
        moveX = -toPlayer.x;
        moveY = -toPlayer.y;
      } else if (dist > preferred + 28) {
        moveX = toPlayer.x;
        moveY = toPlayer.y;
      } else {
        moveX = -toPlayer.y * state.orbitDir;
        moveY = toPlayer.x * state.orbitDir;
      }
      if (state.cooldown <= 0 && dist < 230) {
        const shotSpeed = 92 + params.tier * 10;
        actions.push({
          type: "shoot",
          vx: toPlayer.x * shotSpeed,
          vy: toPlayer.y * shotSpeed,
          speed: shotSpeed,
        });
        state.cooldown = Math.max(1.1, 2.4 - params.tier * 0.18);
        state.attacks += 1;
      }
      break;
    }
    case "charger": {
      if (state.mode === "approach") {
        if (state.timer <= 0 && dist < 220) {
          state.mode = "windup";
          state.timer = 0.58;
          state.aimX = toPlayer.x;
          state.aimY = toPlayer.y;
          actions.push({ type: "windup", duration: state.timer });
        }
      } else if (state.mode === "windup") {
        // Während des Anlaufs stehen bleiben und weiter zielen.
        speedMul = 0.12;
        if (state.timer <= 0) {
          const aim = normalize(params.playerX - params.x, params.playerY - params.y, uid);
          state.aimX = aim.x;
          state.aimY = aim.y;
          state.mode = "charge";
          state.timer = 0.42;
          actions.push({ type: "charge", duration: state.timer });
        }
      } else if (state.mode === "charge") {
        moveX = state.aimX;
        moveY = state.aimY;
        speedMul = 3.2;
        if (state.timer <= 0) {
          state.mode = "recover";
          state.timer = 0.75;
        }
      } else if (state.mode === "recover") {
        speedMul = 0.35;
        if (state.timer <= 0) {
          state.mode = "approach";
          state.timer = 1.7 + rng.next() * 0.8;
        }
      }
      break;
    }
    case "splitter": {
      speedMul = 0.95;
      break;
    }
    case "exploder": {
      if (state.fuse > 0) {
        // Zündschnur: kaum Bewegung, Warnfläche wird von der Szene gezeichnet.
        state.fuse -= dt;
        speedMul = 0.2;
        if (state.fuse <= 0) {
          state.mode = "approach";
          actions.push({ type: "explode", radius: 36 + params.tier * 6 });
          state.attacks += 1;
        }
      } else if (dist < 34) {
        state.fuse = 0.85;
        state.mode = "fuse";
        speedMul = 0.2;
      }
      break;
    }
    case "phaser": {
      if (state.cooldown <= 0 && dist > 55) {
        // Blinzelt hinter/neben den Spieler (60–78 px entfernt), nie auf ihn.
        const angle = rng.next() * Math.PI * 2;
        const radius = 60 + rng.next() * 18;
        actions.push({
          type: "blink",
          x: params.playerX + Math.cos(angle) * radius,
          y: params.playerY + Math.sin(angle) * radius,
        });
        state.blinks += 1;
        state.cooldown = Math.max(1.6, 3.2 - params.tier * 0.2);
        state.mode = "fade";
        state.timer = 0.18;
      }
      speedMul = 0.9;
      break;
    }
    case "orbiter": {
      // Tangential um den Spieler, langsam nach innen spiralend.
      const desired = 88 - params.tier * 3;
      const radial = dist > desired ? 0.35 : -0.25;
      moveX = -toPlayer.y * state.orbitDir + toPlayer.x * radial;
      moveY = toPlayer.x * state.orbitDir + toPlayer.y * radial;
      const n = normalize(moveX, moveY, uid);
      moveX = n.x;
      moveY = n.y;
      speedMul = 0.95;
      break;
    }
    case "summoner": {
      const preferred = 136;
      if (dist < preferred - 26) {
        moveX = -toPlayer.x;
        moveY = -toPlayer.y;
      } else if (dist > preferred + 30) {
        moveX = toPlayer.x;
        moveY = toPlayer.y;
      } else {
        moveX = -toPlayer.y * state.orbitDir * 0.6;
        moveY = toPlayer.x * state.orbitDir * 0.6;
      }
      if (state.cooldown <= 0) {
        actions.push({ type: "summon", minion: summonMinionId(params.tier), count: 2 });
        state.cooldown = Math.max(3.2, 5.2 - params.tier * 0.35);
        state.attacks += 1;
      }
      break;
    }
  }

  state.aimX = toPlayer.x;
  state.aimY = toPlayer.y;
  return { moveX, moveY, speedMul, state, actions };
}

/** Nur für Tests/Debug: alle Archetypen als Liste. */
export const ARCHETYPES: Archetype[] = [
  "chaser", "swarm", "tank", "ranged", "charger",
  "splitter", "exploder", "phaser", "orbiter", "summoner",
];
