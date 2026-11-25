import type { EvolutionDef } from "./types";

/** Waffe Stufe 8 + passendes Powerup ≥1 → nächste Truhe (M4). */
export const EVOLUTIONS: EvolutionDef[] = [
  {
    id: "phoenix",
    name: "Phönixschwarm",
    baseWeapon: "ember",
    passive: "tome",
    description: "Glutfunke + Arkanes Buch",
    effect: "Feuervögel, die explodieren und Brandflächen hinterlassen",
    implemented: false,
  },
  {
    id: "wrath_pendulum",
    name: "Zornpendel",
    baseWeapon: "flail",
    passive: "heart",
    description: "Kettenflegel + Eisenherz",
    effect: "360°-Schwung, heilt pro Treffer minimal",
    implemented: false,
  },
  {
    id: "eternal_winter",
    name: "Ewiger Winter",
    baseWeapon: "frost",
    passive: "hourglass",
    description: "Frostnova + Sanduhr",
    effect: "dauerhafte Frost-Aura + periodische Eisspitzen",
    implemented: false,
  },
  {
    id: "thorn_storm",
    name: "Dornensturm",
    baseWeapon: "thorn",
    passive: "boots",
    description: "Dornensalve + Windstiefel",
    effect: "Dornen-Wirbel in alle Richtungen, Durchschlag ∞",
    implemented: false,
  },
  {
    id: "thunder_seal",
    name: "Gewittersiegel",
    baseWeapon: "storm",
    passive: "whetstone",
    description: "Sturmrune + Wetzstein",
    effect: "Blitz-Siegel am Boden, Kettenblitz über 8 Ziele",
    implemented: false,
  },
  {
    id: "soul_beacon",
    name: "Seelenleuchtfeuer",
    baseWeapon: "lantern",
    passive: "charm",
    description: "Geisterlaterne + Magnetamulett",
    effect: "kreisende Seelen ziehen XP an und brennen",
    implemented: false,
  },
];
