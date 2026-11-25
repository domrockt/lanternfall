import { PASSIVES } from "../data/passives";
import { WEAPONS } from "../data/weapons";
import { EVOLUTIONS } from "../data/evolutions";
import { weaponDef } from "../data/weaponIds";
import type { PassiveId, WeaponId } from "../data/types";
import { MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS } from "../config";
import type { Rng } from "./rng";

export interface OwnedItem {
  id: string;
  level: number;
}

export type OfferKind = "weapon" | "passive";

export interface Offer {
  kind: OfferKind;
  id: string;
  name: string;
  description: string;
  level: number;
  isNew: boolean;
  iconColor: number;
}

interface Candidate extends Offer {
  weight: number;
}

/**
 * Reine Angebots-Logik:
 * - maximal 6 Waffen + 6 Powerups,
 * - neue Items nur, wenn ein Slot frei ist,
 * - bereits maxed Items werden nie angeboten (Waffe 8, Powerup 5),
 * - bis zu 3 verschiedene Optionen.
 */
export function generateOffers(
  weapons: readonly OwnedItem[],
  passives: readonly OwnedItem[],
  rng: Rng,
  count = 3,
): Offer[] {
  const candidates: Candidate[] = [];
  const weaponIds = new Set(weapons.map((w) => w.id));
  // Eine evolvierte Waffe blockiert auch ihre Basiswaffe im Angebot.
  for (const w of weapons) {
    const evo = EVOLUTIONS.find((e) => e.id === w.id);
    if (evo) weaponIds.add(evo.baseWeapon);
  }
  const passiveIds = new Set(passives.map((p) => p.id));
  const weaponSlotsFree = weapons.length < MAX_WEAPON_SLOTS;
  const passiveSlotsFree = passives.length < MAX_PASSIVE_SLOTS;

  for (const owned of weapons) {
    const def = weaponDef(owned.id);
    if (!def || !def.implemented || owned.level >= def.maxLevel) continue;
    const next = owned.level + 1;
    candidates.push({
      kind: "weapon", id: def.id, name: def.name,
      description: def.levels[next - 1]?.note ?? def.description,
      level: next, isNew: false, iconColor: def.iconColor, weight: 3,
    });
  }
  for (const owned of passives) {
    const def = PASSIVES[owned.id as PassiveId];
    if (!def || owned.level >= def.maxLevel) continue;
    candidates.push({
      kind: "passive", id: def.id, name: def.name,
      description: def.description,
      level: owned.level + 1, isNew: false, iconColor: def.iconColor, weight: 2,
    });
  }
  if (weaponSlotsFree) {
    for (const def of Object.values(WEAPONS)) {
      if (weaponIds.has(def.id) || !def.implemented) continue;
      candidates.push({
        kind: "weapon", id: def.id, name: def.name,
        description: def.description, level: 1, isNew: true, iconColor: def.iconColor, weight: 2,
      });
    }
  }
  if (passiveSlotsFree) {
    for (const def of Object.values(PASSIVES)) {
      if (passiveIds.has(def.id)) continue;
      candidates.push({
        kind: "passive", id: def.id, name: def.name,
        description: def.description, level: 1, isNew: true, iconColor: def.iconColor, weight: 2,
      });
    }
  }

  // Gewichtetes Ziehen ohne Wiederholung.
  const picked: Offer[] = [];
  const pool = candidates.slice();
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((s, c) => s + c.weight, 0);
    let roll = rng.next() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].weight;
      if (roll <= 0) { idx = i; break; }
      idx = i;
    }
    const c = pool.splice(idx, 1)[0];
    picked.push({
      kind: c.kind, id: c.id, name: c.name, description: c.description,
      level: c.level, isNew: c.isNew, iconColor: c.iconColor,
    });
  }
  return picked;
}
