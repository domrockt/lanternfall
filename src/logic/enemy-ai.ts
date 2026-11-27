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
  /** Laufende Eigenzeit für Weben/Lunzen/Flankieren (s). */
  phase: number;
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

/**
 * Archetyp-Parameter. Bewusst als reine Zahlen: keine Objekt-Allokation pro
 * Frame — `aiProfileFor` liefert eine vorab gebaute Referenz aus der Tabelle.
 */
export interface AiProfile {
  /** Bevorzugter Abstand zum Spieler (0 = kein Abstandsband). */
  band: number;
  /** Toleranz innerhalb/außerhalb des Bands (px). */
  bandIn: number;
  bandOut: number;
  /** Tangential-Anteil beim Kreuzen im Band. */
  strafe: number;
  /** Seitliches Weben für Schwarm-Gegner. */
  weaveAmp: number;
  weaveFreq: number;
  /** Flankier-Radius und Winkelgeschwindigkeits-Faktor. */
  orbitRadius: number;
  orbitSpeed: number;
  /** Chaser-Lunze: Zyklusdauer (s) und Sprint-Fenster (s). */
  lungePeriod: number;
  lungeWindow: number;
  lungeBoost: number;
  /** Charger-Werte. */
  chargeWindup: number;
  chargeDuration: number;
  chargeSpeed: number;
  chargeRecover: number;
  chargeCooldown: number;
  /** Splitter-Schwelle (px), ab der er zum Kontakt ansetzt. */
  splitThreshold: number;
  /** Exploder-Zündschnur (s) und Zündabstand (px). */
  fuseTime: number;
  fuseRange: number;
  /** Phaser-Blink-Cooldown und -Radius. */
  blinkCooldown: number;
  blinkRadius: number;
  /** Summoner-Ruf-Cooldown (s) und Anzahl Minions. */
  summonCooldown: number;
  summonCount: number;
}

const MAX_TIER = 5;

function tierClamp(tier: number): number {
  return Math.min(MAX_TIER, Math.max(0, Math.floor(tier)));
}

function buildProfile(archetype: Archetype, tier: number): AiProfile {
  const t = tierClamp(tier);
  switch (archetype) {
    case "swarm":
      // Schwarm: schnelle Annäherung, aber breites seitliches Weben.
      return {
        band: 0, bandIn: 0, bandOut: 0, strafe: 0,
        weaveAmp: 0.34 + t * 0.05, weaveFreq: 1.9 + t * 0.28,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 0, lungeWindow: 0, lungeBoost: 0,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 0, fuseTime: 0, fuseRange: 0,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: 0, summonCount: 0,
      };
    case "chaser":
      // Verfolger: direkte Linie mit rhythmischem Vorstoß.
      return {
        band: 0, bandIn: 0, bandOut: 0, strafe: 0,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 1.5 - t * 0.12, lungeWindow: 0.24, lungeBoost: 1.55 + t * 0.03,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 0, fuseTime: 0, fuseRange: 0,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: 0, summonCount: 0,
      };
    case "tank":
      // Walze: langsam, stur geradeaus, bremst periodisch zum "Stemmen".
      return {
        band: 0, bandIn: 0, bandOut: 0, strafe: 0,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 3.4 + t * 0.1, lungeWindow: 0.7, lungeBoost: 0.55 - t * 0.02,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 0, fuseTime: 0, fuseRange: 0,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: 0, summonCount: 0,
      };
    case "ranged":
      // Schütze: hält ein Tier-abhängiges Band und kreuzt seitlich.
      return {
        band: 96 + t * 8, bandIn: 24 + t * 2, bandOut: 26,
        strafe: 0.55 + t * 0.12,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 0, lungeWindow: 0, lungeBoost: 0,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 0, fuseTime: 0, fuseRange: 0,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: 2.8 - t * 0.12, summonCount: 0,
      };
    case "charger":
      // Stürmer: kürzere Anlaufzeit, härterer Sprint pro Tier.
      return {
        band: 0, bandIn: 0, bandOut: 0, strafe: 0,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 0, lungeWindow: 0, lungeBoost: 0,
        chargeWindup: Math.max(0.38, 0.68 - t * 0.05),
        chargeDuration: 0.4 + t * 0.02,
        chargeSpeed: 3.1 + t * 0.12,
        chargeRecover: Math.max(0.3, 0.78 - t * 0.07),
        chargeCooldown: Math.max(1.4, 2.3 - t * 0.12),
        splitThreshold: 0, fuseTime: 0, fuseRange: 0,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: 0, summonCount: 0,
      };
    case "splitter":
      // Teilender: drängt in Schüben heran; je Tier später und langsamer.
      return {
        band: 0, bandIn: 0, bandOut: 0, strafe: 0,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 1.7 + t * 0.14, lungeWindow: 0.4, lungeBoost: 1.15 + t * 0.04,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 50 + t * 6,
        fuseTime: 0.3, fuseRange: 0,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: 0, summonCount: 0,
      };
    case "exploder":
      // Zünder: rennt heran, zündet mit Tier-abhängiger Schnur.
      return {
        band: 0, bandIn: 0, bandOut: 0, strafe: 0,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 0, lungeWindow: 0, lungeBoost: 0,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 0,
        fuseTime: Math.max(0.5, 0.95 - t * 0.09),
        fuseRange: 30 + t * 4,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: 0, summonCount: 0,
      };
    case "phaser":
      // Phaser: teleportiert wiederholt in den Ring um den Spieler.
      return {
        band: 0, bandIn: 0, bandOut: 0, strafe: 0,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 0, lungeWindow: 0, lungeBoost: 0,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 0, fuseTime: 0, fuseRange: 0,
        blinkCooldown: Math.max(1.1, 2.7 - t * 0.14),
        blinkRadius: 62 + t * 3,
        summonCooldown: 0, summonCount: 0,
      };
    case "orbiter":
      // Flanker: kreist in fester Bahn, wechselt die Umlaufrichtung.
      return {
        band: 0, bandIn: 0, bandOut: 0, strafe: 0,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 72 + t * 4,
        orbitSpeed: 1.08 + t * 0.03,
        lungePeriod: 0, lungeWindow: 0, lungeBoost: 0,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 0, fuseTime: 0, fuseRange: 0,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: 0, summonCount: 0,
      };
    case "summoner":
      // Rufer: bleibt weit hinten, kreist langsam und ruft Minions.
      return {
        band: 150 + t * 4, bandIn: 26, bandOut: 34,
        strafe: 0.35,
        weaveAmp: 0, weaveFreq: 0,
        orbitRadius: 0, orbitSpeed: 0,
        lungePeriod: 0, lungeWindow: 0, lungeBoost: 0,
        chargeWindup: 0, chargeDuration: 0, chargeSpeed: 0, chargeRecover: 0, chargeCooldown: 0,
        splitThreshold: 0, fuseTime: 0, fuseRange: 0,
        blinkCooldown: 0, blinkRadius: 0,
        summonCooldown: Math.max(2.6, 5.2 - t * 0.42),
        summonCount: t >= 4 ? 3 : 2,
      };
  }
}

/** Vorab gebaute Profile: (Archetyp, Tier 0–5) → unveränderliche Referenz. */
const PROFILE_TABLE: Record<Archetype, AiProfile[]> = {
  swarm: [], chaser: [], tank: [], ranged: [], charger: [],
  splitter: [], exploder: [], phaser: [], orbiter: [], summoner: [],
};
for (const archetype of Object.keys(PROFILE_TABLE) as Archetype[]) {
  for (let t = 0; t <= MAX_TIER; t++) PROFILE_TABLE[archetype].push(buildProfile(archetype, t));
}

/** Reine Parameter-Abfrage ohne Allokation (Hot-Path-tauglich). */
export function aiProfileFor(archetype: Archetype, tier: number): AiProfile {
  return PROFILE_TABLE[archetype][tierClamp(tier)];
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
    phase: 0,
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
  // In-place: Run.ts ersetzt den State sowieso (`e.ai = ai.state`). Das spart
  // eine Objektkopie pro Gegner und Frame; der Hot-Path allokoiert nur das
  // `actions`-Array, das die Aufrufer-Signatur verlangt.
  const state: AiState = previous;
  const actions: AiAction[] = [];
  const profile = aiProfileFor(params.archetype, params.tier);
  const dx = params.playerX - params.x;
  const dy = params.playerY - params.y;
  const dist = Math.hypot(dx, dy);
  const inv = dist > 0.0001 ? 1 / dist : 0;
  const toX = dist > 0.0001 ? dx * inv : Math.cos(uid * 2.399963);
  const toY = dist > 0.0001 ? dy * inv : Math.sin(uid * 2.399963);
  let moveX = toX;
  let moveY = toY;
  let speedMul = 1;

  state.timer = Math.max(0, state.timer - dt);
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.phase = (state.phase ?? 0) + dt;

  switch (params.archetype) {
    case "swarm": {
      // Schwarmwolke: Annäherung mit breitem Sinus-Weben quer zur Achse.
      const wob = Math.sin(state.phase * profile.weaveFreq + uid * 0.73) * profile.weaveAmp;
      moveX = toX - toY * wob;
      moveY = toY + toX * wob;
      speedMul = 1.06;
      break;
    }
    case "tank": {
      // Stur geradeaus; periodisches Stemmen macht ihn langsam und lesbar.
      const cycle = state.phase % profile.lungePeriod;
      speedMul = cycle < profile.lungeWindow ? profile.lungeBoost : 0.98;
      break;
    }
    case "chaser": {
      // Direkte Verfolgung mit rhythmischem Vorstoß.
      const cycle = state.phase % profile.lungePeriod;
      speedMul = cycle < profile.lungeWindow ? profile.lungeBoost : 1;
      break;
    }
    case "ranged": {
      // Abstandsband: zu nah → zurück, zu weit → ran, dazwischen seitlich.
      if (dist < profile.band - profile.bandIn) {
        moveX = -toX + toY * profile.strafe * state.orbitDir;
        moveY = -toY - toX * profile.strafe * state.orbitDir;
      } else if (dist > profile.band + profile.bandOut) {
        moveX = toX;
        moveY = toY;
      } else {
        moveX = -toY * state.orbitDir;
        moveY = toX * state.orbitDir;
      }
      if (state.cooldown <= 0 && dist < 240) {
        const shotSpeed = 92 + params.tier * 10;
        actions.push({
          type: "shoot",
          vx: toX * shotSpeed,
          vy: toY * shotSpeed,
          speed: shotSpeed,
        });
        state.cooldown = Math.max(1.1, 2.8 - params.tier * 0.12);
        state.attacks += 1;
      }
      break;
    }
    case "charger": {
      if (state.mode === "approach") {
        if (state.timer <= 0 && dist < 230) {
          state.mode = "windup";
          state.timer = profile.chargeWindup;
          state.aimX = toX;
          state.aimY = toY;
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
          state.timer = profile.chargeDuration;
          actions.push({ type: "charge", duration: state.timer });
        }
      } else if (state.mode === "charge") {
        moveX = state.aimX;
        moveY = state.aimY;
        speedMul = profile.chargeSpeed;
        if (state.timer <= 0) {
          state.mode = "recover";
          state.timer = profile.chargeRecover;
        }
      } else if (state.mode === "recover") {
        speedMul = 0.32;
        if (state.timer <= 0) {
          state.mode = "approach";
          state.timer = profile.chargeCooldown;
        }
      }
      break;
    }
    case "splitter": {
      // Schubweise Annäherung; kurz vor dem Kontakt "reift" er (Split-Schwelle).
      const cycle = state.phase % profile.lungePeriod;
      if (dist <= profile.splitThreshold && cycle >= profile.fuseTime) {
        speedMul = 0.25;
        state.mode = "fuse";
      } else if (cycle < profile.lungeWindow) {
        speedMul = profile.lungeBoost;
        state.mode = "approach";
      } else {
        speedMul = 0.62;
        state.mode = "approach";
      }
      break;
    }
    case "exploder": {
      if (state.fuse > 0) {
        // Zündschnur: kaum Bewegung, Warnfläche wird von der Szene gezeichnet.
        state.fuse -= dt;
        speedMul = 0.18;
        if (state.fuse <= 0) {
          state.mode = "approach";
          actions.push({ type: "explode", radius: 36 + params.tier * 6 });
          state.attacks += 1;
        }
      } else if (dist < profile.fuseRange) {
        state.fuse = profile.fuseTime;
        state.mode = "fuse";
        speedMul = 0.18;
      } else {
        speedMul = 1.18;
      }
      break;
    }
    case "phaser": {
      if (state.cooldown <= 0) {
        // Blinzelt in den Ring um den Spieler (nie auf ihn), dann wieder ran.
        const angle = rng.next() * Math.PI * 2;
        const radius = profile.blinkRadius + rng.next() * 14;
        actions.push({
          type: "blink",
          x: params.playerX + Math.cos(angle) * radius,
          y: params.playerY + Math.sin(angle) * radius,
        });
        state.blinks += 1;
        state.cooldown = profile.blinkCooldown + rng.next() * 0.4;
        state.mode = "fade";
        state.timer = 0.18;
        speedMul = 0.7;
      } else {
        speedMul = 0.92;
        if (state.timer <= 0) state.mode = "approach";
      }
      break;
    }
    case "orbiter": {
      // Flankier-Bahn: fester Radius, tangential, Richtungswechsel per Timer.
      if (state.timer <= 0) {
        state.orbitDir = -state.orbitDir;
        state.timer = 4.2 + rng.next() * 1.8;
      }
      const radial = dist > profile.orbitRadius + 6
        ? 0.32
        : dist < profile.orbitRadius - 6
          ? -0.22
          : Math.sin(state.phase * 0.9) * 0.14;
      moveX = -toY * state.orbitDir + toX * radial;
      moveY = toX * state.orbitDir + toY * radial;
      speedMul = profile.orbitSpeed;
      break;
    }
    case "summoner": {
      // Weites Abstandsband; ruft nach Cooldown passende Minions.
      if (dist < profile.band - profile.bandIn) {
        moveX = -toX;
        moveY = -toY;
      } else if (dist > profile.band + profile.bandOut) {
        moveX = toX;
        moveY = toY;
      } else {
        moveX = -toY * state.orbitDir * profile.strafe;
        moveY = toX * state.orbitDir * profile.strafe;
      }
      if (state.cooldown <= 0) {
        actions.push({
          type: "summon",
          minion: summonMinionId(params.tier),
          count: profile.summonCount,
        });
        state.cooldown = profile.summonCooldown;
        state.attacks += 1;
      }
      speedMul = 0.88;
      break;
    }
  }

  const m = normalize(moveX, moveY, uid);
  state.aimX = toX;
  state.aimY = toY;
  return { moveX: m.x, moveY: m.y, speedMul, state, actions };
}

/** Nur für Tests/Debug: alle Archetypen als Liste. */
export const ARCHETYPES: Archetype[] = [
  "chaser", "swarm", "tank", "ranged", "charger",
  "splitter", "exploder", "phaser", "orbiter", "summoner",
];
