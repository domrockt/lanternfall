import type { CharacterDef, CharacterId } from "./types";

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  mira: {
    id: "mira",
    name: "Mira Ashwick",
    title: "Laternen-Hexe",
    description: "Junge Hexe mit rotem Tuch und Laterne. Schnell und flächenstark.",
    hp: 90,
    speed: 62,
    armor: 0,
    startWeapon: "ember",
    mods: { areaPct: 10 },
    spriteKey: "player_mira",
    artNote: "M1-Platzhalter 16x16; 32x32-Laufanimation folgt in M2.",
  },
  kael: {
    id: "kael",
    name: "Bruder Kael",
    title: "Eisen-Mönch",
    description: "Kettengewand und eiserne Ruhe. Robust, aber etwas langsamer.",
    hp: 130,
    speed: 59,
    armor: 2,
    startWeapon: "flail",
    mods: { moveSpeedPct: -5, maxHpPct: 25 },
    spriteKey: "player_kael",
    artNote: "M1-Platzhalter 16x16; Kettenflegel-Verhalten folgt in M2.",
  },
};

export const CHARACTER_LIST = [CHARACTERS.mira, CHARACTERS.kael];
