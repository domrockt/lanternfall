import { EVOLUTIONS } from "../data/evolutions";
import type { Offer } from "./levelup";

export interface BotPoint {
  x: number;
  y: number;
  radius?: number;
}

export interface BotThreat extends BotPoint {
  vx?: number;
  vy?: number;
  /** Gewichtung: Gegner 1, Projektil 2.2, Warnfläche 3. */
  threat?: number;
}

export interface BotInput {
  playerX: number;
  playerY: number;
  worldSize: number;
  enemies: readonly BotThreat[];
  projectiles: readonly BotThreat[];
  hazards: readonly BotThreat[];
  gems: readonly BotPoint[];
  /** Nahkampf-Build (Kettenflegel/Zornpendel): weniger Abstand, um in Reichweite zu bleiben. */
  melee?: boolean;
  /** Aktiver Boss: Nahkampf hält 38–60 px Abstand, damit der Schwung trifft. */
  boss?: BotPoint;
  /** Truhen: Bot läuft hin, damit Evolutionen nicht liegen bleiben. */
  chests?: readonly BotPoint[];
}

const WEAPON_PRIORITY: Record<string, number> = {
  ember: 60, thorn: 58, frost: 56, storm: 50, lantern: 46, flail: 42,
  phoenix: 90, wrath_pendulum: 88, eternal_winter: 88, thorn_storm: 86, thunder_seal: 86, soul_beacon: 86,
};

const PASSIVE_PRIORITY: Record<string, number> = {
  heart: 34, boots: 30, tome: 28, charm: 22, whetstone: 20, hourglass: 18,
};

/** Aktueller Build des Bots (für Evolutions-Fokus und Slot-Begrenzung). */
export interface BuildContext {
  weapons: readonly { id: string; level: number }[];
  passives: readonly { id: string; level: number }[];
  /** Startwaffe des Charakters: bleibt der Fokus-Slot, nicht die zufällig höchste Waffe. */
  startingWeapon?: string;
}

/**
 * Balance M6: Der Bot spielt auf Überleben UND eine Evolution, statt alle 6
 * Waffen anzusammeln. Er konzentriert sich auf die höchste Basiswaffe, nimmt
 * deren Evolutions-Powerup und hält HP/Tempo hoch. Neue Waffen sind nur eine
 * Option, wenn noch kein Fokus-Slot existiert.
 */
export function offerScore(offer: Offer, build?: BuildContext): number {
  const id = String(offer.id);
  const weapons = build?.weapons ?? [];
  const passives = build?.passives ?? [];
  const passiveLevel = new Map(passives.map((p) => [p.id, p.level]));
  // Fokus = Startwaffe (bleibt stabil); nur wenn sie evolviert/maxed ist, zählt
  // die höchste andere Basiswaffe. So erreicht genau ein Slot Stufe 8.
  const baseOwned = weapons.filter((w) => w.id in WEAPON_PRIORITY && !EVOLUTIONS.some((e) => e.id === w.id));
  let focus: { id: string; level: number } | null = null;
  const start = build?.startingWeapon ? baseOwned.find((w) => w.id === build.startingWeapon) : undefined;
  if (start) focus = { id: start.id, level: start.level };
  else {
    for (const w of baseOwned) {
      if (!focus || w.level > focus.level) focus = { id: w.id, level: w.level };
    }
  }
  const evo = focus ? EVOLUTIONS.find((e) => e.baseWeapon === focus!.id) : undefined;

  if (offer.kind === "weapon") {
    if (focus && offer.id === focus.id && !offer.isNew && offer.level < 8) return 1250 + offer.level;
    // Solange der Fokus-Slot nicht Stufe 8 ist, keine Nebenwaffen nehmen: das
    // verzögert die Evolution und macht Runs unzuverlässig. Stattdessen lieber
    // Passiven (HP/Tempo/Evolutions-Powerup) verbessern.
    if (focus && focus.level < 8) {
      return offer.isNew ? 60 + (WEAPON_PRIORITY[id] ?? 0) : 120 + (WEAPON_PRIORITY[id] ?? 0) + offer.level;
    }
    if (offer.isNew) return 500 + (WEAPON_PRIORITY[id] ?? 0);
    return 450 + (WEAPON_PRIORITY[id] ?? 0) + offer.level * 4;
  }

  const level = passiveLevel.get(id) ?? 0;
  if (evo && evo.passive === id) return offer.isNew ? 900 : 820 + level * 4;
  // Heart ist nur für Nahkampf-Builds (Flegel-Evolution) wichtig; für Mira
  // bleibt die Evolutions-Passive (Tome) vor der HP-Reserve.
  if (id === "heart") return (build?.startingWeapon === "flail" ? 1050 : 850) + (offer.isNew ? 0 : level * 5);
  if (id === "boots") return offer.isNew ? 950 : 650 + level * 4;
  if (offer.isNew) return 420 + (PASSIVE_PRIORITY[id] ?? 0);
  return 380 + (PASSIVE_PRIORITY[id] ?? 0) + offer.level * 4;
}

/** Index des besten Level-up-Angebots nach Prioritätsliste + Build-Kontext. */
export function chooseBestOffer(offers: readonly Offer[], build?: BuildContext): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < offers.length; i++) {
    const score = offerScore(offers[i], build);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/**
 * AutoPlay-Bot: kitet Gegnerdichte, meidet Projektile und Warnflächen,
 * sammelt XP-Kristalle und meidet Weltgrenzen. Reine Vektor-Summe.
 */
export function botDirection(input: BotInput): { x: number; y: number } {
  const px = input.playerX;
  const py = input.playerY;
  let x = 0;
  let y = 0;

  const repel = (t: BotThreat, range: number, weight: number, lead = 0): void => {
    const tx = t.x + (t.vx ?? 0) * lead;
    const ty = t.y + (t.vy ?? 0) * lead;
    const dx = px - tx;
    const dy = py - ty;
    const d = Math.hypot(dx, dy);
    const radius = t.radius ?? 6;
    if (d > range + radius) return;
    const falloff = Math.max(0.12, 1 - d / (range + radius));
    const nx = d > 0.001 ? dx / d : 1;
    const ny = d > 0.001 ? dy / d : 0;
    x += nx * falloff * weight;
    y += ny * falloff * weight;
  };

  // Nahkampf-Builds müssen in Waffenreichweite bleiben, Fernkampf kitet breiter.
  const enemyRange = input.melee ? 92 : 118;
  const enemyWeight = input.melee ? 0.85 : 1.0;
  for (const e of input.enemies) repel(e, enemyRange, (e.threat ?? 1.0) * enemyWeight);
  for (const p of input.projectiles) repel(p, 96, p.threat ?? 2.3, 0.28);
  for (const h of input.hazards) repel(h, 42, h.threat ?? 3.0);

  // Akt anlaufen: Ein aktiver Boss darf nicht am Spawn-Ring stehen bleiben,
  // sonst farmt der Bot Trash und der Bosskamptankt minutenlang (535-s-Ausreißer).
  if (input.boss) {
    const dx = input.boss.x - px;
    const dy = input.boss.y - py;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d;
    const ny = dy / d;
    if (input.melee) {
      if (d > 95) { x += nx * 18; y += ny * 18; }
      else if (d < 72) { x -= nx * 4; y -= ny * 4; }
    } else if (d > 260) {
      x += nx * 4;
      y += ny * 4;
    } else if (d < 120) {
      x -= nx * 2;
      y -= ny * 2;
    }
  }

  // Truhe zuerst: Evolutionen kommen nur über die Boss-Truhe.
  if (input.chests && input.chests.length > 0) {
    let chest: BotPoint | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const c of input.chests) {
      const d = (c.x - px) ** 2 + (c.y - py) ** 2;
      if (d < best) { best = d; chest = c; }
    }
    if (chest) {
      const dx = chest.x - px;
      const dy = chest.y - py;
      const d = Math.hypot(dx, dy) || 1;
      x += (dx / d) * 1.2;
      y += (dy / d) * 1.2;
    }
  }

  // Nahkampf: in den Gegner-Trupp hineinlaufen, damit der Schwung trifft.
  if (input.melee) {
    let closest: BotThreat | null = null;
    let bestDist = 220 * 220;
    for (const e of input.enemies) {
      const d = (e.x - px) ** 2 + (e.y - py) ** 2;
      if (d < bestDist) { bestDist = d; closest = e; }
    }
    if (closest) {
      const dx = closest.x - px;
      const dy = closest.y - py;
      const d = Math.hypot(dx, dy) || 1;
      x += (dx / d) * 0.40;
      y += (dy / d) * 0.40;
    }
  }

  // XP sammeln, solange kein massiver Druck herrscht.
  let nearest: BotPoint | null = null;
  let bestGem = 230 * 230;
  for (const g of input.gems) {
    const dx = g.x - px;
    const dy = g.y - py;
    const d = dx * dx + dy * dy;
    if (d < bestGem) {
      bestGem = d;
      nearest = g;
    }
  }
  if (nearest) {
    const dx = nearest.x - px;
    const dy = nearest.y - py;
    const d = Math.hypot(dx, dy) || 1;
    const gemWeight = input.melee ? 0.45 : 0.85;
    x += (dx / d) * gemWeight;
    y += (dy / d) * gemWeight;
  }

  // Wandmeidung mit weichem Rand.
  const margin = 90;
  if (px < margin) x += (margin - px) / margin;
  if (px > input.worldSize - margin) x -= (px - (input.worldSize - margin)) / margin;
  if (py < margin) y += (margin - py) / margin;
  if (py > input.worldSize - margin) y -= (py - (input.worldSize - margin)) / margin;

  if (Math.hypot(x, y) < 0.05) {
    // Idle-Kreisbewegung, damit der Bot nicht stehen bleibt.
    return { x: Math.cos(input.enemies.length * 1.7) * 0.5, y: Math.sin(input.enemies.length * 1.3) * 0.5 };
  }
  const len = Math.hypot(x, y);
  return { x: x / len, y: y / len };
}
