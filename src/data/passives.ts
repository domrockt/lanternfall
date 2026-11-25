import type { PassiveDef, PassiveId, StatMods } from "./types";

/**
 * Effekt pro Stufe, kumulativ: Stufe n enthält den n-fachen Basisbonus.
 * So wirkt eine Stufe-2-Verbesserung tatsächlich doppelt (statt wie Stufe 1).
 */
const perLevel = (mods: StatMods, maxLevel = 5) =>
  Array.from({ length: maxLevel }, (_, i) => {
    const levelMods: StatMods = {};
    for (const [key, value] of Object.entries(mods)) {
      if (typeof value === "number") (levelMods as Record<string, number>)[key] = value * (i + 1);
    }
    return { level: i + 1, mods: levelMods };
  });

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  boots: {
    id: "boots",
    name: "Windstiefel",
    description: "+8 % Bewegungstempo pro Stufe",
    maxLevel: 5,
    iconColor: 6,
    levels: perLevel({ moveSpeedPct: 8 }),
  },
  tome: {
    id: "tome",
    name: "Arkanes Buch",
    description: "-8 % Abklingzeit pro Stufe",
    maxLevel: 5,
    iconColor: 5,
    levels: perLevel({ cooldownPct: 8 }),
  },
  heart: {
    id: "heart",
    name: "Eisenherz",
    description: "+20 Max-HP und +0.2 HP/s pro Stufe",
    maxLevel: 5,
    iconColor: 25,
    levels: perLevel({ maxHpFlat: 20, regen: 0.2 }),
  },
  charm: {
    id: "charm",
    name: "Magnetamulett",
    description: "+25 % Aufsammelradius pro Stufe",
    maxLevel: 5,
    iconColor: 20,
    levels: perLevel({ pickupRadiusPct: 25 }),
  },
  whetstone: {
    id: "whetstone",
    name: "Wetzstein",
    description: "+10 % Waffenschaden pro Stufe",
    maxLevel: 5,
    iconColor: 8,
    levels: perLevel({ damagePct: 10 }),
  },
  hourglass: {
    id: "hourglass",
    name: "Sanduhr",
    description: "+10 % Effektdauer & Fläche pro Stufe",
    maxLevel: 5,
    iconColor: 21,
    levels: perLevel({ areaPct: 10, durationPct: 10 }),
  },
};
