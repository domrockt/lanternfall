/**
 * Todes-Effekt-Klassen je Gegner-Archetyp. Vier visuell unterscheidbare Klassen:
 * `crumble` (Knochen zerfallen), `burst` (Schleim platzt), `dissolve`
 * (Geist verpufft/blendet aus), `sputter` (Feuer/Asche stiebt).
 *
 * Jede Klasse ist eine eigene, deterministische Spec (keine Zufallswerte in
 * der Spec selbst): Anzahl, Größe, Dauer, Streuung, Farbe und Textur sind
 * fest. Bosse bekommen eine eigene, größere Variante mit eigener Textur.
 * Die Spec enthält nur VFX-Werte, keine Gameplay-/Balance-Werte.
 */
import { C } from "../palette";

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
  boss: boolean;
  /** Haupt-Splitter-Frames. */
  shard: string;
  /** Sekundärer Staub/Rauch (Normal-Blend). */
  dust: string;
  /** Anzahl Haupt-Splitter. */
  count: number;
  /** Anzahl Staub-Partikel. */
  dustCount: number;
  /** Lebensdauer der Haupt-Splitter in s. */
  life: number;
  /** Lebensdauer der Staub-Partikel in s. */
  dustLife: number;
  /** Startgröße der Haupt-Splitter (Sprite-Scale). */
  scaleFrom: number;
  /** Endgröße der Haupt-Splitter (Sprite-Scale). */
  scaleTo: number;
  /** Startgröße der Staub-Partikel. */
  dustScale: number;
  /** Kontur-Textur hinter den Splittern (Rim/Silhouette gegen den Grund). */
  rim: string;
  /** Rim-Tint als Palettenindex (dunkel = harte Kante, hell = Leuchtkante). */
  rimTint: number;
  /** Rim-Skalierung relativ zu `scaleFrom` (> 1 = breiter als der Shard). */
  rimScale: number;
  /** Radiale Streu-Geschwindigkeit in px/s (Basis für Splitter). */
  spread: number;
  /** Shard-Tint als Palettenindex. */
  tint: number;
  /** Staub-Tint als Palettenindex. */
  dustTint: number;
  additive: boolean;
}

/** Werte je Nicht-Boss-Klasse. Count/Größe/Dauer/Streuung/Farbe differieren. */
const BASE: Record<DeathClass, Omit<DeathFxSpec, "cls" | "boss">> = {
  // Knochen zerfallen langsam nach unten, kalt/entsättigt. Dunkler Rim
  // (nightDeep) trennt die hellen Splitter vom Moorgrün.
  crumble: {
    shard: "fx_death_bone", dust: "fx_ash",
    count: 10, dustCount: 4,
    life: 0.6, dustLife: 0.45,
    scaleFrom: 1.6, scaleTo: 0.5, dustScale: 0.8,
    rim: "fx_death_bone", rimTint: C.nightDeep, rimScale: 1.15,
    spread: 42, tint: C.boneLight, dustTint: C.mist,
    additive: false,
  },
  // Schleim platzt explosionsartig auseinander, groß und schnell. Dunkler
  // Rim hinter dem hellen Blob verhindert grün-auf-grün (Art-Befund Runde 1).
  burst: {
    shard: "fx_death_blob", dust: "fx_death_blob",
    count: 16, dustCount: 8,
    life: 0.35, dustTint: C.mossDark,
    dustLife: 0.28,
    scaleFrom: 2.4, scaleTo: 1.0, dustScale: 1.2,
    rim: "fx_death_blob", rimTint: C.nightDeep, rimScale: 1.14,
    spread: 130, tint: C.marshLight,
    additive: true,
  },
  // Geist verpufft langsam nach oben und blendet additiv aus. Der dunkle
  // Void-Rim gibt dem weichen Halo eine lesbare Kontur.
  dissolve: {
    shard: "fx_death_void", dust: "fx_dusk",
    count: 11, dustCount: 5,
    life: 0.8, dustLife: 0.9,
    scaleFrom: 2.0, scaleTo: 0.3, dustScale: 1.0,
    rim: "fx_death_void", rimTint: C.nightDeep, rimScale: 1.25,
    spread: 22, tint: C.fogBlue, dustTint: C.nightMid,
    additive: true,
  },
  // Feuer/Asche stiebt schnell und weit, heiß und additiv. Dunkle Asche-
  // Kontur trennt die Funken von orangen Gegnern und Glut-Decals.
  sputter: {
    shard: "fx_death_dust", dust: "fx_fire",
    count: 20, dustCount: 10,
    life: 0.45, dustLife: 0.55,
    scaleFrom: 2.2, scaleTo: 0.3, dustScale: 1.1,
    rim: "fx_death_dust", rimTint: C.nightDeep, rimScale: 1.12,
    spread: 165, tint: C.flame, dustTint: C.emberOrange,
    additive: true,
  },
};

/**
 * Boss-Variante: eigene Kern-Textur (`fx_boss_core`) mit Halo-Staub,
 * deutlich mehr Partikel, länger, weiter gestreut und mit >= 2x Fläche
 * (1.6x Scale => 2.56x Flächeninhalt gegenüber der Nicht-Boss-Variante).
 */
const BOSS: Record<DeathClass, Omit<DeathFxSpec, "cls" | "boss">> = {
  crumble: {
    shard: "fx_boss_core", dust: "fx_halo",
    count: 18, dustCount: 8,
    life: 1.1, dustLife: 0.75,
    scaleFrom: 2.88, scaleTo: 0.8, dustScale: 1.2,
    rim: "fx_boss_core", rimTint: C.nightDeep, rimScale: 1.2,
    spread: 70, tint: C.boneLight, dustTint: C.amber,
    additive: false,
  },
  burst: {
    shard: "fx_boss_core", dust: "fx_halo",
    count: 30, dustCount: 14,
    life: 0.7, dustLife: 0.5,
    scaleFrom: 3.84, scaleTo: 1.6, dustScale: 1.8,
    rim: "fx_boss_core", rimTint: C.nightDeep, rimScale: 1.18,
    spread: 200, tint: C.marshLight, dustTint: C.glow,
    additive: false,
  },
  dissolve: {
    shard: "fx_boss_core", dust: "fx_halo",
    count: 22, dustCount: 10,
    life: 1.4, dustLife: 1.3,
    scaleFrom: 3.2, scaleTo: 0.5, dustScale: 1.5,
    rim: "fx_boss_core", rimTint: C.nightDeep, rimScale: 1.25,
    spread: 45, tint: C.fogBlue, dustTint: C.lanternWhite,
    additive: true,
  },
  sputter: {
    shard: "fx_boss_core", dust: "fx_halo",
    count: 34, dustCount: 16,
    life: 0.9, dustLife: 0.8,
    scaleFrom: 3.52, scaleTo: 0.6, dustScale: 1.7,
    rim: "fx_boss_core", rimTint: C.nightDeep, rimScale: 1.2,
    spread: 240, tint: C.flame, dustTint: C.emberOrange,
    additive: true,
  },
};

export function deathFxFor(cls: DeathClass, boss = false): DeathFxSpec {
  return { cls, boss, ...(boss ? BOSS[cls] : BASE[cls]) };
}

/** Alle vier Nicht-Boss-Specs, z. B. für Tabellen/Doku und Tests. */
export function allDeathFx(): DeathFxSpec[] {
  return (["crumble", "burst", "dissolve", "sputter"] as DeathClass[]).map((c) => deathFxFor(c));
}
