import type { CharacterDef, CharacterId } from "./types";

/** SSOT für die Charakter-Startwerte. Quelle: GAME.md Z.34 (Mira) / Z.35 (Kael),
 *  Basis-Tempo 62 px/s (GAME.md Z.173). Jede Abweichung von der Spec oder jedes
 *  spec-schweigende Feld ist kommentiert — Guard: scripts/m10-charstats-followup.mjs
 *  (Lane m10-charstats-spec-followup, docs/lanes/m10-charstats-spec-followup.md). */
export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  mira: {
    id: "mira",
    name: "Mira Ashwick",
    title: "Laternen-Hexe",
    description: "Junge Hexe mit rotem Tuch und Laterne. Schnell und flächenstark.",
    hp: 90, // Spec: GAME.md Z.34 "HP 90" (M6-Balance hatte 250; F2/P2: Korridor neu prüfen)
    speed: 62, // Spec: Basis-Tempo, GAME.md Z.173 "62,0 px/s"
    armor: 1, // Spec schweigt (F1/P1) — M6-Tuning-Basis, unverändert
    startWeapon: "ember", // Spec: GAME.md Z.34 "Start: Glutfunke"
    mods: { areaPct: 10, regen: 1.0 }, // areaPct: Z.34 "+10 % Flächenwirkung"; regen: Spec schweigt (F1/P1)
    spriteKey: "player_mira",
    artNote: "M1-Platzhalter 16x16; 32x32-Laufanimation folgt in M2.",
  },
  kael: {
    id: "kael",
    name: "Bruder Kael",
    title: "Eisen-Mönch",
    description: "Kettengewand und eiserne Ruhe. Robust, aber etwas langsamer.",
    hp: 130, // Spec: GAME.md Z.35 "HP 130"
    speed: 59, // Spec: Z.35 "-5 % Tempo" auf Basis 62 ⇒ 58,9; 59 ist der gerundete Ist-Wert (F3-Entscheid, Variante b)
    armor: 1, // Spec: GAME.md Z.35 "1 Rüstung" (war 2 aus M6-Status Z.356; F5-Entscheid)
    startWeapon: "flail", // Spec: GAME.md Z.35 "Start: Kettenflegel"
    // Bewusst: moveSpeedPct ENTFERNT (F3) — der -5 %-Abzug steckt seit je in speed 59;
    // der zusätzliche Mod machte effektiv 56,05 px/s statt Spec ≈58,9 (Doppel-Abzug).
    mods: { maxHpPct: 20, maxHpFlat: 90, regen: 1.5, xpPct: -25 },
    // maxHpPct 20: Spec GAME.md Z.35 "+20 % Max-HP" (war 25 aus M6-Status Z.356; F4-Entscheid)
    // maxHpFlat 90 / regen 1.5 / xpPct -25: Spec schweigt (F1/P1) — M6-Tuning-Basis, unverändert
    spriteKey: "player_kael",
    artNote: "M1-Platzhalter 16x16; Kettenflegel-Verhalten folgt in M2.",
  },
};

export const CHARACTER_LIST = [CHARACTERS.mira, CHARACTERS.kael];
