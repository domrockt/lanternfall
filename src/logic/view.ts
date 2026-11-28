/**
 * M8: Dynamische View-Groesse und geraetepixelgenaue Skalierung.
 *
 * Logische Hoehe ist fest 360 px. Die Breite folgt dem Geraete-Seitenverhaeltnis:
 *   n      = floor(geraeteHoehe_px / 360)   (n >= 2, sonst Fit-Rueckfall)
 *   Breite = clamp(round(geraeteBreite_px / n), 480, 860)
 * Jeder Spielpixel ist damit exakt n x n Geraetepixel (devicePixelRatio enthalten).
 * M10-view-fill: Im Fit-Rueckfall (n < 2) fuellt das Spielfeld das Fenster
 * komplett (fillView) statt auf der 4:3-Basis 480x360 Balken zu lassen.
 * Reine Funktionen ohne DOM/Phaser, in Vitest testbar.
 *
 * M10-perf-cap-rollback (2026-11-27): der M10-Crowd-Deckel (interne Breite 640
 * ab 300 Gegnern) ist rueckgebaut — auf der iGPU (Mesa Intel RPL-S) liegt M25
 * 780x360@3 mit und ohne Deckel bei vsync-60 (Median 60,0 >= 55, Belege
 * shots/m10-perf-cap-rollback-m25-cap-{on,off}-*.json); der Deckel kostete
 * Optik (schwarzene Balken an 780/1080-Views) ohne messbaren Nutzen.
 */
export const BASE_HEIGHT = 360;
export const MIN_WIDTH = 480;
export const MAX_WIDTH = 860;

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
  /** true = Rueckfall-Pfad (Fill bei n < 2, Hochkant-Fit); Skalierung kann
   *  trotzdem ganzzahlig sein (640x360 -> Fill mit 1x). */
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
 * M10-view-fill: Fit-Rueckfall, der das Fenster VOLL ausfuellt (Hoehe skaliert
 * mit, kein 4:3-Balken mehr). scale = deviceHeight/BASE_HEIGHT exakt; Breite =
 * deviceWidth/scale, damit das Spielfeld bis an beide Raender reicht.
 * Jedes 16:9-Fenster ergibt dadurch exakt 640 px interne Breite:
 *   width = deviceWidth / (deviceHeight/360) = 16/9 * 360 = 640.
 * Skalierung ist ganzzahlig, wenn die Fensterhoehe ein 360er-Vielfaches ist
 * (640x360 -> 1x, 1280x720 -> 2x), sonst gebrochen (960x540 -> 1.5x) und
 * dokumentiert; roundPixels bleibt aktiv, die Kamera bleibt subpixelfrei.
 * Fiele die Fuell-Breite unter MIN_WIDTH (sehr schmales Fenster), Rueckfall
 * auf die alte 4:3-Fit-View statt Canvas-Overflow. hardMax (MAX_WIDTH) bleibt
 * Obergrenze: dokumentierte Randbedingung — Ultrawide-Fenster koennen wieder
 * Balken zeigen. (M10-perf-cap-rollback: die ehemalige Crowd-Klemme
 * CROWD_WIDTH ist rueckgebaut, hardMax ist immer MAX_WIDTH.)
 */
function fillView(
  deviceWidth: number,
  deviceHeight: number,
  dpr: number,
  hardMax: number,
  portrait: boolean,
): ViewSpec {
  const scale = Math.max(0.1, deviceHeight / BASE_HEIGHT);
  const fillWidth = Math.floor(deviceWidth / scale);
  if (fillWidth < MIN_WIDTH) return fitView(deviceWidth, deviceHeight, dpr, portrait);
  const width = clamp(fillWidth, MIN_WIDTH, hardMax);
  return {
    width,
    height: BASE_HEIGHT,
    scale,
    cssWidth: Math.max(1, Math.round((width * scale / dpr) * 1000) / 1000),
    cssHeight: Math.max(1, Math.round((BASE_HEIGHT * scale / dpr) * 1000) / 1000),
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
  // M10-perf-cap-rollback: keine Crowd-Klemme mehr, hardMax ist immer MAX_WIDTH.
  const hardMax = MAX_WIDTH;
  const maxFitN = Math.floor(Math.min(deviceHeight / BASE_HEIGHT, deviceWidth / MIN_WIDTH));
  const requested = Number.isFinite(input.setting) ? Math.max(0, Math.round(input.setting as number)) : 0;
  const n = requested > 0 ? Math.min(requested, maxFitN) : maxFitN;
  if (n < 2) return fillView(deviceWidth, deviceHeight, dpr, hardMax, false);

  const width = Math.min(
    MAX_WIDTH,
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

/**
 * M10-view-fill-refit: Prueft die exakte, gleichmaessige Abbildung —
 * Canvas in Geraetepixeln == interne Groesse x Scale (jeder Spielpixel ist
 * ueberall exakt scale x scale Geraetepixel, keine Rundungsverluste).
 * Vorher kurzcircuitte der Fit-Pfad auf false; der Pixel-Scan der
 * Format-Matrix (shots/m10-viewrefit-before.json, 7 Formate, 0 Balken)
 * belegt aber, dass Fill-Views exakt abbilden — die Funktion meldete den
 * Pfad statt die Eigenschaft. Ganzzahligkeit der Stufe ist eine separate
 * Eigenschaft (ViewSpec.scale, im Fill-Fall gebrochen und dokumentiert).
 */
export function isIntegerPixelPerfect(spec: ViewSpec): boolean {
  return Math.abs(spec.cssWidth * spec.dpr - spec.width * spec.scale) <= 0.01
    && Math.abs(spec.cssHeight * spec.dpr - spec.height * spec.scale) <= 0.01;
}

export interface CanvasSnap {
  /** Verschiebung in CSS-Px, die den Rect auf ganze Geraetepixel bringt (0 = schon ganzzaehlig). */
  dx: number;
  dy: number;
  /** Position nach dem Verschieben (leftCss + dx). */
  snappedLeftCss: number;
  snappedTopCss: number;
  /** true = Rect lag bereits auf ganzen Geraetepixeln, keine Aenderung noetig. */
  alreadySnapped: boolean;
}

/**
 * M10-view-pixel-snap: Verschiebung (CSS-Px), die einen Canvas-Rect mit linker/
 * oberer Kante bei leftCss/topCss auf GANZE Geraetepixel snapt (Bedarf aus
 * Lane m10-view-4k, Beleg /home/ai/games/.evidence/m10-view-4k/:
 * 2560x1080@1 -> Canvas 2559 Geraetepx, zentriert bei CSS-x=0.5 -> die linke
 * Randspalte blurrt zum Seitenhintergrund).
 *
 * Die View-Rechnung (computeView) bleibt unangetastet — bei unteilbaren
 * Breiten ist ein 1-Geraetepx-Defizit bei ganzzahligem Scale mathematisch
 * unvermeidbar; hier wird nur die POSITIONIERUNG korrigiert:
 * - Nach UNEN/LINKS abrunden (floor) -> die Restspalte landet HART am rechten/
 *   unteren Rand (Seitenhintergrund mit scharfer Kante) statt zu verblurren.
 * - Toleranz 1e-4 Geraetepixel frisst Browser-Rauschen in getBoundingClientRect.
 * - Faelschungs-sicher: NaN/Infinity/dpr<=0 liefern dx=dy=0.
 * Reine Funktion ohne DOM, in Vitest testbar.
 */
export function snapCanvasRect(leftCss: number, topCss: number, dpr: number): CanvasSnap {
  const d = finitePositive(dpr, 1);
  const EPS = 1e-4;
  const snapOne = (css: number): { delta: number; snapped: number } => {
    if (!Number.isFinite(css)) return { delta: 0, snapped: css };
    const device = css * d;
    const deltaDevice = Math.floor(device + EPS) - device;
    // Bereits ganzzaehlig (oder nur Rauschen) -> exakt 0, kein Transform.
    if (Math.abs(deltaDevice) <= EPS) return { delta: 0, snapped: css };
    const deltaCss = deltaDevice / d;
    return { delta: deltaCss, snapped: css + deltaCss };
  };
  const x = snapOne(leftCss);
  const y = snapOne(topCss);
  return {
    dx: x.delta,
    dy: y.delta,
    snappedLeftCss: x.snapped,
    snappedTopCss: y.snapped,
    alreadySnapped: x.delta === 0 && y.delta === 0,
  };
}
