/**
 * M8: Dynamische View-Groesse und geraetepixelgenaue Skalierung.
 *
 * Logische Hoehe ist fest 360 px. Die Breite folgt dem Geraete-Seitenverhaeltnis:
 *   n      = floor(geraeteHoehe_px / 360)   (n >= 2, sonst Fit-Rueckfall)
 *   Breite = clamp(round(geraeteBreite_px / n), 480, 860)
 * Jeder Spielpixel ist damit exakt n x n Geraetepixel (devicePixelRatio enthalten).
 * Reine Funktionen ohne DOM/Phaser, in Vitest testbar.
 */
export const BASE_HEIGHT = 360;
export const MIN_WIDTH = 480;
export const MAX_WIDTH = 860;

/**
 * M10-Crowd: bei hoher Gegnerlast intern nur noch 640 px breit rendern.
 * Die ganzzahlige Stufe n bleibt erhalten (Pixel bleiben scharf), das Canvas
 * wird entsprechend schmaler/zentriert. Hysterese verhindert Flattern an der
 * Schwelle (einklemmen ab 300, loesen erst unter 260 aktiven Gegnern).
 */
export const CROWD_WIDTH = 640;
export const CROWD_ENEMY_THRESHOLD = 300;
export const CROWD_RELEASE_THRESHOLD = 260;

/** Reine Schwellen-Logik: gewuenschter Crowd-Zustand nach aktiver Gegnerzahl. */
export function shouldCapForCrowd(activeEnemies: number, currentlyCapped: boolean): boolean {
  const count = Number.isFinite(activeEnemies) ? activeEnemies : 0;
  return currentlyCapped ? count >= CROWD_RELEASE_THRESHOLD : count >= CROWD_ENEMY_THRESHOLD;
}

export interface ViewSpec {
  /** Logische Breite in Spielpixeln. */
  width: number;
  /** Logische Hoehe in Spielpixeln (immer 360). */
  height: number;
  /** Geraetepixel pro Spielpixel (ganzzahlig; im Fit-Rueckfall gebrochen). */
  scale: number;
  /** CSS-Breite/Hoehe des Canvas in CSS-Pixeln. */
  cssWidth: number;
  cssHeight: number;
  /** true = gebrochene Fit-Skalierung (nur bei n < 2 oder Hochkant). */
  fit: boolean;
  /** true = Hochkant: Spiel pausiert, "Geraet drehen"-Hinweis. */
  portrait: boolean;
  /** Geraetepixel-Maße, auf denen die Rechnung beruht. */
  deviceWidth: number;
  deviceHeight: number;
  dpr: number;
}

export interface DeviceInput {
  /** CSS-Viewport-Breite/Hoehe (window.innerWidth/innerHeight). */
  width: number;
  height: number;
  /** window.devicePixelRatio (mind. 1). */
  dpr: number;
  /** Option "SKALIERUNG": 0 = AUTO, 2..6 = fest. */
  setting?: number;
  /** true = hohe Gegnerlast: interne Breite auf CROWD_WIDTH deckeln. */
  crowd?: boolean;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Fit-Fallback: 480x360 mit gebrochener CSS-Skalierung in den Viewport. */
function fitView(deviceWidth: number, deviceHeight: number, dpr: number, portrait: boolean): ViewSpec {
  const width = MIN_WIDTH;
  const height = BASE_HEIGHT;
  const scale = Math.max(0.1, Math.min(deviceWidth / width, deviceHeight / height));
  return {
    width,
    height,
    scale,
    cssWidth: Math.max(1, Math.round((width * scale / dpr) * 1000) / 1000),
    cssHeight: Math.max(1, Math.round((height * scale / dpr) * 1000) / 1000),
    fit: true,
    portrait,
    deviceWidth,
    deviceHeight,
    dpr,
  };
}

/**
 * Berechnet die View aus CSS-Viewport + devicePixelRatio.
 * Hochkant liefert eine stehende Fit-View (die Szene pausiert und zeigt den
 * Dreh-Hinweis); landschaftlich gilt die ganzzahlige n-Skalierung.
 */
export function computeView(input: DeviceInput): ViewSpec {
  const dpr = Math.max(1, finitePositive(input.dpr, 1));
  const cssW = finitePositive(input.width, MIN_WIDTH);
  const cssH = finitePositive(input.height, BASE_HEIGHT);
  const deviceWidth = Math.max(1, Math.round(cssW * dpr));
  const deviceHeight = Math.max(1, Math.round(cssH * dpr));
  const portrait = cssH > cssW;
  if (portrait) return fitView(deviceWidth, deviceHeight, dpr, true);

  // Maximale ganzzahlige Stufe, bei der die Mindestbreite noch passt.
  const maxFitN = Math.floor(Math.min(deviceHeight / BASE_HEIGHT, deviceWidth / MIN_WIDTH));
  const requested = Number.isFinite(input.setting) ? Math.max(0, Math.round(input.setting as number)) : 0;
  const n = requested > 0 ? Math.min(requested, maxFitN) : maxFitN;
  if (n < 2) return fitView(deviceWidth, deviceHeight, dpr, false);

  const hardMax = input.crowd ? CROWD_WIDTH : MAX_WIDTH;
  const width = Math.min(
    hardMax,
    Math.max(MIN_WIDTH, Math.round(deviceWidth / n)),
    Math.floor(deviceWidth / n),
  );
  return {
    width,
    height: BASE_HEIGHT,
    scale: n,
    cssWidth: Math.round((width * n / dpr) * 1000) / 1000,
    cssHeight: Math.round((BASE_HEIGHT * n / dpr) * 1000) / 1000,
    fit: false,
    portrait: false,
    deviceWidth,
    deviceHeight,
    dpr,
  };
}

/** Stabile Kennung, um unnoetige Resizes zu vermeiden. */
export function viewKey(spec: ViewSpec): string {
  return `${spec.width}x${spec.height}:${spec.scale}:${spec.cssWidth}x${spec.cssHeight}:${spec.fit ? 1 : 0}`;
}

/** Prueft, ob CSS-Groesse und Geraetepixel exakt n x n ergeben (Abnahme-Beleg). */
export function isIntegerPixelPerfect(spec: ViewSpec): boolean {
  if (spec.fit) return false;
  return Math.abs(spec.cssWidth * spec.dpr - spec.width * spec.scale) <= 0.01
    && Math.abs(spec.cssHeight * spec.dpr - spec.height * spec.scale) <= 0.01;
}
