// Typen fuer scripts/terrain-coverage.mjs (Muster: m10-heap-budget-gate.d.mts).
// Reine Prueffunktionen des Terrain-Schwarz-Pixel-Guards; Input/Output als
// Uint8Array (keine Node-Typen im Repo).

export interface CoverageRegion {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CoverageImage {
  width: number;
  height: number;
  /** RGBA, 4 Byte je Pixel. */
  data: Uint8Array;
}

export interface CoverageResult {
  width: number;
  height: number;
  topExcludePx: number;
  blackPx: number;
  maxRegion: number;
  regions: CoverageRegion[];
  ok: boolean;
  findings: CoverageRegion[];
}

export interface CoverageOpts {
  blackMax?: number;
  minArea?: number;
  topExcludePx?: number;
}

export declare const BLACK_RGB_MAX: number;
export declare const MIN_REGION_PX: number;
export declare const HUD_GAME_PX: number;
export declare const GAME_BASE_WIDTH: number;

export declare function playfieldTopPx(width: number, gameWidth?: number): number;
export declare function decodePng(bytes: Uint8Array): CoverageImage;
export declare function analyzeCoverage(img: CoverageImage, opts?: CoverageOpts): CoverageResult;
export declare function checkScreenshot(bytes: Uint8Array, opts?: CoverageOpts): CoverageResult;
