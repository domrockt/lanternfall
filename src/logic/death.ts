/**
 * Todes-Effekt-Klassen je Gegner-Archetyp. Vier visuell unterscheidbare Klassen:
 * `crumble` (Knochen zerfallen), `burst` (Schleim platzt), `dissolve`
 * (Geist verpufft/blendet aus), `sputter` (Feuer/Asche stiebt).
 */
export type DeathClass = "crumble" | "burst" | "dissolve" | "sputter";

const MAP: Record<string, DeathClass> = {
  chaser: "crumble",
  tank: "crumble",
  swarm: "burst",
  splitter: "burst",
  phaser: "dissolve",
  orbiter: "dissolve",
  summoner: "dissolve",
  ranged: "sputter",
  charger: "sputter",
  exploder: "sputter",
};

export function deathClassFor(archetype: string): DeathClass {
  return MAP[archetype] ?? "dissolve";
}

export interface DeathFxSpec {
  cls: DeathClass;
  /** Haupt-Splitter-Frames. */
  shard: string;
  /** Sekundärer Staub/Rauch (Normal-Blend). */
  dust: string;
  count: number;
  additive: boolean;
}

export function deathFxFor(cls: DeathClass, boss = false): DeathFxSpec {
  const n = boss ? 26 : 8;
  switch (cls) {
    case "crumble":
      return { cls, shard: "fx_death_bone", dust: "fx_ash", count: n, additive: false };
    case "burst":
      return { cls, shard: "fx_death_blob", dust: "fx_death_blob", count: n, additive: false };
    case "dissolve":
      return { cls, shard: "fx_death_void", dust: "fx_dusk", count: n, additive: true };
    case "sputter":
      return { cls, shard: "fx_death_dust", dust: "fx_fire", count: n, additive: true };
  }
}
