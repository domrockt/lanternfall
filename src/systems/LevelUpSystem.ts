import { PASSIVES } from "../data/passives";
import { EVOLUTIONS } from "../data/evolutions";
import { weaponDef } from "../data/weaponIds";
import type { PassiveId, WeaponAnyId, WeaponId } from "../data/types";
import { MAX_PASSIVE_SLOTS, MAX_WEAPON_SLOTS } from "../config";
import { aggregateMods, type AggregateStats } from "../logic/stats";
import { generateOffers, type Offer, type OwnedItem } from "../logic/levelup";
import type { Rng } from "../logic/rng";

export interface OwnedWeapon extends OwnedItem {
  id: WeaponAnyId;
  timer: number;
}

/** Verwaltet Build (6+6), Angebote und Stats. */
export class LevelUpSystem {
  weapons: OwnedWeapon[] = [];
  passives: OwnedItem[] = [];

  constructor(startWeapon: WeaponId, startLevel = 1) {
    this.addWeapon(startWeapon, startLevel);
  }

  addWeapon(id: WeaponAnyId, level = 1): void {
    const def = weaponDef(id);
    if (!def) throw new Error(`addWeapon: unbekannte Waffe "${id}"`);
    if (!def.implemented) throw new Error(`addWeapon: "${id}" ist noch nicht spielbar`);
    let existing = this.weapons.find((w) => w.id === id);
    if (!existing) {
      // Evolvierte Waffe ersetzt ihre Basiswaffe im selben Slot.
      const evo = EVOLUTIONS.find((e) => e.id === id);
      if (evo) existing = this.weapons.find((w) => w.id === evo.baseWeapon);
    }
    if (existing) {
      existing.id = id;
      existing.level = Math.max(1, Math.min(def.maxLevel, level));
      return;
    }
    if (this.weapons.length >= MAX_WEAPON_SLOTS) return;
    this.weapons.push({ id, level: Math.max(1, Math.min(def.maxLevel, level)), timer: 0 });
  }

  addPassive(id: PassiveId, level = 1): void {
    const def = PASSIVES[id];
    if (!def) throw new Error(`addPassive: unbekanntes Powerup "${id}"`);
    const existing = this.passives.find((p) => p.id === id);
    if (existing) {
      existing.level = Math.max(1, Math.min(def.maxLevel, level));
      return;
    }
    if (this.passives.length >= MAX_PASSIVE_SLOTS) return;
    this.passives.push({ id, level: Math.max(1, Math.min(def.maxLevel, level)) });
  }

  offers(rng: Rng): Offer[] {
    return generateOffers(this.weapons, this.passives, rng, 3);
  }

  applyOffer(offer: Offer): void {
    if (offer.kind === "weapon") {
      this.addWeapon(offer.id as WeaponId, offer.level);
    } else {
      this.addPassive(offer.id as PassiveId, offer.level);
    }
  }

  get mods(): AggregateStats {
    return aggregateMods([
      ...this.passives.map((p) => PASSIVES[p.id as PassiveId]?.levels[p.level - 1]?.mods ?? {}),
    ]);
  }
}
