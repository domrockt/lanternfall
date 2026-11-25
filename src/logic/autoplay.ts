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
}

const WEAPON_PRIORITY: Record<string, number> = {
  ember: 60, thorn: 58, frost: 56, storm: 50, lantern: 46, flail: 42,
  phoenix: 90, wrath_pendulum: 88, eternal_winter: 88, thorn_storm: 86, thunder_seal: 86, soul_beacon: 86,
};

const PASSIVE_PRIORITY: Record<string, number> = {
  heart: 34, boots: 30, tome: 28, charm: 22, whetstone: 20, hourglass: 18,
};

export function offerScore(offer: Offer): number {
  const id = String(offer.id);
  if (offer.kind === "weapon") {
    if (offer.isNew) return 500 + (WEAPON_PRIORITY[id] ?? 0);
    return 320 + (WEAPON_PRIORITY[id] ?? 0) + offer.level * 6;
  }
  if (offer.isNew) return 220 + (PASSIVE_PRIORITY[id] ?? 0);
  return 140 + (PASSIVE_PRIORITY[id] ?? 0) + offer.level * 4;
}

/** Index des besten Level-up-Angebots nach einfacher Prioritätsliste. */
export function chooseBestOffer(offers: readonly Offer[]): number {
  let best = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < offers.length; i++) {
    const score = offerScore(offers[i]);
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

  for (const e of input.enemies) repel(e, 118, e.threat ?? 1.0);
  for (const p of input.projectiles) repel(p, 96, p.threat ?? 2.3, 0.28);
  for (const h of input.hazards) repel(h, 42, h.threat ?? 3.0);

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
    x += (dx / d) * 0.85;
    y += (dy / d) * 0.85;
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
