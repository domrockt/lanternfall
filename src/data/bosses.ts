import type { BossDef } from "./types";

/** 6 Bosse; in M1 nur Datenbasis (Spawn wirft klaren Fehler bis M4/M5). */
export const BOSSES: BossDef[] = [
  { index: 0, id: "moor_queen", name: "Moorkönigin", atSecond: 5 * 60, mechanic: "Sprünge mit Landungs-Schockwelle, spuckt Gift-Pfützen", hp: 900, implemented: false },
  { index: 1, id: "bone_lord", name: "Knochenfürst", atSecond: 10 * 60, mechanic: "beschwört Skelett-Ringe, Knochen-Bumerang", hp: 1600, implemented: false },
  { index: 2, id: "pale_shepherd", name: "Der Fahle Hirte", atSecond: 15 * 60, mechanic: "ruft Wolfsrudel, Sichel-Schwung", hp: 2400, implemented: false },
  { index: 3, id: "bell_golem", name: "Glockenturm-Golem", atSecond: 20 * 60, mechanic: "langsame Stampfer, Steinregen mit Bodenmarkierung", hp: 3400, implemented: false },
  { index: 4, id: "coven", name: "Hexenzirkel", atSecond: 25 * 60, mechanic: "Teleport-Wechsel, kreuzende Feuerstrahlen", hp: 4200, implemented: false },
  { index: 5, id: "hollow_king", name: "Der Hohle König", atSecond: 30 * 60, mechanic: "3 Phasen, Arena-Ring aus Dornen, Sieg = Morgendämmerung", hp: 9000, implemented: false },
];
