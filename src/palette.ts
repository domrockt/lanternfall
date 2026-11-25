/**
 * Lanternfall — 32-Farben-Palette.
 *
 * Eigene, dokumentierte Auswahl: dunkle Nacht (Blau-/Moor-Grau), warme Lichtakzente
 * (Kerzen/Gold/Glut) und gedämpfte Moor-/Blut-Töne. Kein PICO-8.
 *
 * Regel: Im fertigen Bild darf NUR eine dieser 32 Farben sichtbar sein
 * (Ausnahme: Alpha-Überblendungen von Licht/Vignette sowie dunkle UI-Dim-Overlays,
 * die nur eine Palettenfarbe über das Spielfeld legen).
 *
 * Indizes 0–31, als `PAL[i]` verwendbar. `C.name` ist die sprechende Kurzform.
 */
export const PAL = [
  0x06070c, // 0  ink             — Kontur / fast-Schwarz
  0x0a0e16, // 1  nightDeep       — Himmel/Background
  0x101724, // 2  night           — tiefe Nacht
  0x17202e, // 3  nightMid        — Nacht-Mitte
  0x1e2a3a, // 4  nightSlate      — Nacht-Schiefer
  0x2a3547, // 5  blueGrey        — Blaugrau
  0x3a4a5c, // 6  fogBlue         — Nebelblau
  0x4e5f6e, // 7  fog             — Nebel
  0x6b7c86, // 8  mist            — Dunst
  0x8fa0a6, // 9  paleMist        — heller Dunst
  0xb8c4c2, // 10 bone            — Knochen
  0xd9ddcd, // 11 boneLight       — heller Knochen
  0xf2edd8, // 12 candleWhite     — Kerzenweiß
  0xfff8e6, // 13 lanternWhite    — Laternenweiß / Glow
  0x2b1410, // 14 emberShadow     — Glut-Schatten
  0x4d2214, // 15 emberDark       — dunkle Glut
  0x7a331a, // 16 emberBrown      — Glutbraun
  0xa84a21, // 17 emberOrange     — Glutorange
  0xcf6b26, // 18 flame           — Flamme
  0xef9130, // 19 flameBright     — helle Flamme
  0xffb84d, // 20 amber           — Bernstein
  0xffd77a, // 21 lantern         — Laterne
  0xffeeb0, // 22 glow            — Glühen
  0x3d1220, // 23 bloodNight      — Blutnacht
  0x7a1f2e, // 24 blood           — Blut
  0xb8303f, // 25 crimson         — Karmesin
  0xe4574d, // 26 hotRed          — heißes Rot
  0xff8a6b, // 27 fleshWarm       — warmes Fleisch
  0x16261e, // 28 mossNight       — Moosnacht
  0x22382a, // 29 mossDark        — dunkles Moos
  0x3d5a38, // 30 marsh           — Moor
  0x6f9b58, // 31 marshLight      — helles Moor
] as const;

/** Sprechende Namen → Palettenindex. */
export const C = {
  ink: 0,
  nightDeep: 1,
  night: 2,
  nightMid: 3,
  nightSlate: 4,
  blueGrey: 5,
  fogBlue: 6,
  fog: 7,
  mist: 8,
  paleMist: 9,
  bone: 10,
  boneLight: 11,
  candleWhite: 12,
  lanternWhite: 13,
  emberShadow: 14,
  emberDark: 15,
  emberBrown: 16,
  emberOrange: 17,
  flame: 18,
  flameBright: 19,
  amber: 20,
  lantern: 21,
  glow: 22,
  bloodNight: 23,
  blood: 24,
  crimson: 25,
  hotRed: 26,
  fleshWarm: 27,
  mossNight: 28,
  mossDark: 29,
  marsh: 30,
  marshLight: 31,
} as const;

export type ColorIndex = keyof typeof C;

/** `#rrggbb` für Phaser-Text/CSS. */
export function css(i: number): string {
  return "#" + PAL[i].toString(16).padStart(6, "0");
}

/** 0xRRGGBB Int für Phaser-Fills. */
export function hex(i: number): number {
  return PAL[i];
}
