import type { WeaponAnyId, WeaponDef } from "./types";

/**
 * Evolvierte Waffen. Sie ersetzen ihre Basiswaffe im Slot und starten auf Stufe 8.
 * Die Werte liegen bewusst deutlich über den Basiswaffen, die Behaviors sind eigene
 * Effekte im gemeinsamen CombatSystem.
 */
export const EVOLUTION_WEAPONS: Partial<Record<WeaponAnyId, WeaponDef>> = {
  phoenix: {
    id: "phoenix" as WeaponAnyId,
    name: "Phönixschwarm",
    behavior: "phoenix",
    description: "Feuervögel explodieren und hinterlassen Brandflächen.",
    maxLevel: 8,
    implemented: true,
    iconColor: 18,
    levels: [
      { level: 1, damage: 14, cooldown: 0.78, count: 2, pierce: 0, speed: 190, knockback: 30 },
      { level: 2, damage: 15, cooldown: 0.74, count: 2, pierce: 0, speed: 195, knockback: 31 },
      { level: 3, damage: 17, cooldown: 0.70, count: 2, pierce: 0, speed: 200, knockback: 32 },
      { level: 4, damage: 19, cooldown: 0.66, count: 3, pierce: 0, speed: 205, knockback: 33 },
      { level: 5, damage: 21, cooldown: 0.62, count: 3, pierce: 0, speed: 210, knockback: 34 },
      { level: 6, damage: 23, cooldown: 0.58, count: 3, pierce: 0, speed: 215, knockback: 35 },
      { level: 7, damage: 27, cooldown: 0.54, count: 4, pierce: 0, speed: 220, knockback: 36 },
      { level: 8, damage: 30, cooldown: 0.48, count: 4, pierce: 0, speed: 230, knockback: 38 },
    ],
  },
  wrath_pendulum: {
    id: "wrath_pendulum" as WeaponAnyId,
    name: "Zornpendel",
    behavior: "wrath_pendulum",
    description: "360°-Schwung, heilt pro Treffer minimal.",
    maxLevel: 8,
    implemented: true,
    iconColor: 25,
    levels: [
      { level: 1, damage: 30, cooldown: 1.0, radius: 68, count: 1, knockback: 64 },
      { level: 2, damage: 34, cooldown: 0.96, radius: 72, count: 1, knockback: 67 },
      { level: 3, damage: 38, cooldown: 0.92, radius: 76, count: 1, knockback: 70 },
      { level: 4, damage: 43, cooldown: 0.88, radius: 80, count: 1, knockback: 74 },
      { level: 5, damage: 48, cooldown: 0.84, radius: 84, count: 1, knockback: 78 },
      { level: 6, damage: 53, cooldown: 0.80, radius: 88, count: 1, knockback: 82 },
      { level: 7, damage: 59, cooldown: 0.76, radius: 92, count: 1, knockback: 86 },
      { level: 8, damage: 66, cooldown: 0.70, radius: 96, count: 1, knockback: 92 },
    ],
  },
  eternal_winter: {
    id: "eternal_winter" as WeaponAnyId,
    name: "Ewiger Winter",
    behavior: "eternal_winter",
    description: "Dauerhafte Frost-Aura, periodisch Eisspitzen.",
    maxLevel: 8,
    implemented: true,
    iconColor: 12,
    levels: [
      { level: 1, damage: 24, cooldown: 2.2, radius: 64, count: 8, slow: 0.4, freeze: 0.3 },
      { level: 2, damage: 27, cooldown: 2.1, radius: 67, count: 8, slow: 0.42, freeze: 0.35 },
      { level: 3, damage: 30, cooldown: 2.0, radius: 70, count: 9, slow: 0.44, freeze: 0.4 },
      { level: 4, damage: 34, cooldown: 1.9, radius: 73, count: 10, slow: 0.46, freeze: 0.45 },
      { level: 5, damage: 38, cooldown: 1.8, radius: 76, count: 11, slow: 0.48, freeze: 0.5 },
      { level: 6, damage: 42, cooldown: 1.7, radius: 79, count: 12, slow: 0.5, freeze: 0.55 },
      { level: 7, damage: 47, cooldown: 1.6, radius: 82, count: 13, slow: 0.52, freeze: 0.6 },
      { level: 8, damage: 54, cooldown: 1.5, radius: 86, count: 14, slow: 0.55, freeze: 0.7 },
    ],
  },
  thorn_storm: {
    id: "thorn_storm" as WeaponAnyId,
    name: "Dornensturm",
    behavior: "thorn_storm",
    description: "Dornen-Wirbel in alle Richtungen, Durchschlag unendlich.",
    maxLevel: 8,
    implemented: true,
    iconColor: 31,
    levels: [
      { level: 1, damage: 26, cooldown: 0.9, count: 10, pierce: 999, speed: 250, knockback: 18 },
      { level: 2, damage: 29, cooldown: 0.86, count: 11, pierce: 999, speed: 255, knockback: 19 },
      { level: 3, damage: 32, cooldown: 0.82, count: 12, pierce: 999, speed: 260, knockback: 20 },
      { level: 4, damage: 35, cooldown: 0.78, count: 13, pierce: 999, speed: 265, knockback: 21 },
      { level: 5, damage: 38, cooldown: 0.74, count: 14, pierce: 999, speed: 270, knockback: 22 },
      { level: 6, damage: 42, cooldown: 0.70, count: 15, pierce: 999, speed: 275, knockback: 23 },
      { level: 7, damage: 46, cooldown: 0.66, count: 16, pierce: 999, speed: 280, knockback: 24 },
      { level: 8, damage: 52, cooldown: 0.60, count: 18, pierce: 999, speed: 290, knockback: 26 },
    ],
  },
  thunder_seal: {
    id: "thunder_seal" as WeaponAnyId,
    name: "Gewittersiegel",
    behavior: "thunder_seal",
    description: "Blitz-Siegel am Boden, Kettenblitz über 8 Ziele.",
    maxLevel: 8,
    implemented: true,
    iconColor: 21,
    levels: [
      { level: 1, damage: 56, cooldown: 1.8, count: 1, chain: 8 },
      { level: 2, damage: 61, cooldown: 1.75, count: 1, chain: 8 },
      { level: 3, damage: 66, cooldown: 1.70, count: 1, chain: 8 },
      { level: 4, damage: 72, cooldown: 1.65, count: 1, chain: 8 },
      { level: 5, damage: 78, cooldown: 1.60, count: 2, chain: 8 },
      { level: 6, damage: 85, cooldown: 1.55, count: 2, chain: 8 },
      { level: 7, damage: 92, cooldown: 1.50, count: 2, chain: 8 },
      { level: 8, damage: 100, cooldown: 1.42, count: 3, chain: 8 },
    ],
  },
  soul_beacon: {
    id: "soul_beacon" as WeaponAnyId,
    name: "Seelenleuchtfeuer",
    behavior: "soul_beacon",
    description: "Kreisende Seelen ziehen XP an und brennen.",
    maxLevel: 8,
    implemented: true,
    iconColor: 22,
    levels: [
      { level: 1, damage: 26, cooldown: 2.2, count: 3, radius: 50, duration: 4.5 },
      { level: 2, damage: 29, cooldown: 2.1, count: 3, radius: 52, duration: 4.8 },
      { level: 3, damage: 32, cooldown: 2.0, count: 3, radius: 54, duration: 5.1 },
      { level: 4, damage: 36, cooldown: 1.95, count: 4, radius: 56, duration: 5.4 },
      { level: 5, damage: 40, cooldown: 1.90, count: 4, radius: 58, duration: 5.7 },
      { level: 6, damage: 45, cooldown: 1.85, count: 4, radius: 60, duration: 6.0 },
      { level: 7, damage: 50, cooldown: 1.80, count: 5, radius: 62, duration: 6.3 },
      { level: 8, damage: 58, cooldown: 1.75, count: 5, radius: 64, duration: 6.6 },
    ],
  },
};

/**
 * M10-evo-fx-phoenix: reine FX-Parameter des Phönixschwarm (keine Gameplay-Werte).
 * Vorlage für die Folge-Evo-Jobs (Ewiger Winter, Seelenleuchtfeuer, Zornpendel,
 * Gewittersiegel): Texturen in Zielgröße zeichnen und mit Draw-Scale 1 rendern
 * (nie > 1x hochskalieren), klare Element-Farbtreppe, Aufbau ≤ 0,3 s → Impact →
 * kurzer Ausklang. Texturen liegen in src/gfx/gen-fx.ts (phoenix*Frame).
 */
export const PHOENIX_FX = {
  /** Vogel: 3 Flatter-Frames (Zielgröße 15x11), Takt in s. */
  birdFrames: ["projectile_phoenix", "projectile_phoenix_2", "projectile_phoenix_3"],
  birdFrameInterval: 0.09,
  /** Aufbau (Anticipation) am Abschusspunkt, life ≤ 0,3 s. */
  launchTexture: "fx_phoenix_launch",
  launchLife: 0.28,
  /** Impact-Explosion: Textur 64x64 ≈ Explode-Radius 34, Draw-Scale 1. */
  boomTexture: "fx_boom_phoenix",
  boomLife: 0.4,
  /** Ausklang: Brandfleck 64x64, Draw-Scale 1, Frame-Flackern-Takt in s. */
  burnTexture: "fx_burn_phoenix",
  burnTextureFrames: 3,
  burnFrameInterval: 0.18,
  /** Brandfleck-Lebenszeit (muss zum addBurn-Aufruf passen). */
  burnLife: 3.2,
} as const;

/**
 * m10-evo-fx-soulpyre: alle Seelenleuchtfeuer-FX-Parameter an einem Ort (Muster
 * PHOENIX_FX). Eine Pixelgroesse fuer alles: orb_soul 22x32 wird mit Scale 1
 * gezeichnet, der kalte Halo kommt als gebackene Stufe 2 (48x48) mit Scale 0.9
 * (nie > 1x hochskaliert). Farb-Treppe: Kern weiss (13/12) → kuehl (11/10) →
 * gruen (31/30) → dunkler Rand (29) — kein Ink(0), keine Grau-Stufen (5–9).
 */
export const SOUL_FX = {
  /** Orb-Texturen (3 Flacker-Frames, 22x32, Sprite-Pixelgroesse). */
  orbFrames: ["orb_soul", "orb_soul_2", "orb_soul_3"],
  orbFrameInterval: 0.2,
  /** Gebackene Halo-Stufe (48x48) + Ziel-Scale <= 1 und Puls-Alpha. */
  haloTexture: "fx_halo_cold@2",
  haloScale: 0.9,
  haloAlpha: 0.3,
  haloPulse: 0.07,
  /** Anticipation (Aufbau) <= 0,3 s und Ausklang-Fade in s. */
  anticipation: 0.28,
  fadeOut: 0.35,
  /** Aufsteigende Seelen-Funken: pro Orb alle sparkInterval s ein 1-Sprite-Funken. */
  sparkInterval: 0.34,
  sparkTexture: "fx_star",
  // m10-evo-fx-soulpyre-w2: kalt (paleMist 9) statt grün (31) — Dom-Regel 02:00Z.
  sparkTint: 9,
} as const;

/**
 * M10-evo-fx-winter: reine FX-Parameter des Ewigen Winters (keine Gameplay-Werte),
 * Muster PHOENIX_FX (Lane m10-evo-fx-phoenix). Regel „Eine Pixelgröße für alles":
 * Texturen in Zielgröße zeichnen, nie > 1x hochskalieren. Ablauf: Aufbau (Windup
 * <= 0,3 s, Anticipation) → Impact (Eisspitzen-Volley + Frost-Puls) → kurzer
 * Ausklang (Partikel-Fade in Sprite-Pixelgröße).
 */
export const WINTER_FX = {
  /** Aura-Siegel (Mixel-Bake, Level 1 = 96x96, Draw-Scale <= 1). */
  auraTexture: "ring_frost",
  auraLife: 0.45,
  /** Frost-Partikel am Aura-Rand, Sprite-Pixelgröße (Scale <= 1). */
  particleTexture: "fx_ice",
  particleFrames: 4,
  particleLife: 0.6,
  particleScale: 1,
  /** Windup (Anticipation) vor der Eisspitzen-Volley, life <= 0,3 s. */
  windupTexture: "fx_halo_cold",
  windupLife: 0.25,
  /** Restzeit der Spike-Timer, ab der der Windup einmalig gespawnt wird. */
  windupAt: 0.25,
  /** Impact-Puls beim Volley (fx_shock, Mixel-Bake, Draw-Scale <= 1). */
  impactTexture: "fx_shock",
  impactLife: 0.4,
  /** Eisspitzen-Projektil (7x7, keine Ink-Pixel mehr). */
  spikeTexture: "projectile_ice",
  /** Treffer-/Todes-Signatur in Zielgröße (128x128 @ Draw-Scale 1, gen-fx). */
  signatureDrawScale: [1, 1] as [number, number],
} as const;

/**
 * m10-evo-fx-zornpendel: alle Zornpendel-FX-Parameter an einem Ort (Muster
 * PHOENIX_FX/SOUL_FX). Eine Pixelgroesse fuer alles: der Pendel-Ring wird in
 * Zielgroesse 208 (Radius 96 + Rand) gebacken und mit Draw-Scale 1 gezeichnet,
 * der Glut-Glow am Kugelkopf 17x17 @ Scale 1 (vorher fx_halo 24x24 @ bis 10,7x).
 * Farb-Treppe: Kern hell-bernstein (22/21/20) → Glut rot (27/26/25), Kontur
 * Blutnacht (23) statt Ink — siehe ZORN_RAMP in gen-fx.ts.
 */
export const WRATH_FX = {
  /** Pendel-Ring: 3 Schwung-Frames (Aufbau → Impact), Takt folgt dem Schwung-Fortschritt. */
  ringFrames: ["fx_wrath_ring", "fx_wrath_ring_2", "fx_wrath_ring_3"],
  ringSize: 208,
  ringRadius: 96,
  ringAlpha: 0.95,
  /** Anteil der Schwungdauer, ab dem der Ring ausblendet (Ausklang). */
  fadeStart: 0.75,
  /** Glut-Rest nach dem Schwung: kurzer Fade des letzten Frames. */
  fadeOut: 0.18,
  /** Glut-Glow am Kugelkopf (17x17, Scale 1, ADD). */
  glowTexture: "fx_wrath_glow",
  glowAlpha: 0.6,
} as const;

/**
 * m10-evo-fx-gewittersiegel: alle Gewittersiegel-FX-Parameter an einem Ort (Muster
 * PHOENIX_FX). Eine Pixelgroesse fuer alles: das Boden-Siegel 64x64 (4 Phasen-
 * Frames: 0/1 Anticipation, 2 Impact-Flash, 3 Dauer-Puls) wird mit Scale 1
 * gezeichnet (nie > 1x hochskaliert). Farb-Treppe: lanternWhite(13)/
 * candleWhite(12) → glow(22)/lantern(21) auf dunkler Grundflaeche night(2)/
 * nightMid(3), Kontur nightSlate(4) — kein Ink(0), keine Grau-Stufen (5–9).
 */
export const THUNDER_FX = {
  /** Boden-Siegel-Textur (64x64, 4 Phasen-Frames, Sprite-Pixelgroesse). */
  sealTexture: "fx_seal_thunder",
  sealFrames: 4,
  /** Anticipation: Ladezeit in s (<= 0,6) + Start-Alpha, Puls um Scale 1. */
  anticipation: 0.55,
  anticipationAlphaFrom: 0.45,
  pulse: 0.06,
  /** Impact-Flash am Siegel (Frame 2) als kurzer Pool-Effekt. */
  impactFlashLife: 0.3,
  /** Kettenblitz-Ziele: Impact-Frame herunterskaliert (<= 1). */
  chainImpactFrame: 2,
  chainLife: 0.45,
  chainScaleFrom: 0.5,
  chainScaleTo: 0.7,
  /** Ausklang: Fade am Ende des Sichtbarkeits-Zyklus in s. */
  fadeOut: 0.3,
  /** Dauer-Puls (Frame 3): Alpha-Modulation um der Grundalpha. */
  sustainAlpha: 0.9,
  sustainPulse: 0.1,
} as const;
