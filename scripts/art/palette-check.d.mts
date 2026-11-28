/** Typen fuer scripts/art/palette-check.mjs, damit der Vitest-Guard typsicher importiert. */

export interface PaletteViolation {
  x: number;
  y: number;
  index: number;
  char?: string;
  color?: string | number;
  alpha?: number;
  reason: "off-palette" | "alpha";
}

export interface PaletteAsset {
  file: string;
  name: string;
  w: number;
  h: number;
  hasAlphaField: boolean;
  total: number;
  opaque: number;
  transparent: number;
  offPalette: number;
  alphaViolations: number;
  colorCount: number;
  transparentPct: number;
  offPalettePct: number;
  violations: PaletteViolation[];
}

export function decodeChar(ch: string | undefined): number;
export function validIndex(idx: number, pal: readonly number[]): boolean;
export function colorSet(pal: readonly number[]): Set<number>;
export function analyzeGrid(name: string, file: string, rows: readonly string[], w: number, h: number, pal: readonly number[]): PaletteAsset;
export function analyzePixelGrid(name: string, file: string, grid: Array<Array<number | null>>, pal: readonly number[]): PaletteAsset;
export function makeFakeDocument(captured: Map<string, unknown>): { createElement: () => unknown };
export function analyzeCapturedFx(captured: Map<string, unknown>, pal: readonly number[]): PaletteAsset[];
export function collectStaticSources(mods: Record<string, unknown>): Array<{ file: string; name: string; rows: string[]; w: number; h: number }>;
export function summarize(assets: PaletteAsset[]): {
  assets: number;
  pixels: number;
  opaque: number;
  offPalette: number;
  alphaViolations: number;
  offPalettePct: number;
  transparentPct: number;
};
export function loadAndAnalyze(root?: string): Promise<{ paletteSize: number; assets: PaletteAsset[]; summary: ReturnType<typeof summarize> }>;

// ── M10 FX-Frame-Guard (Lane m10-palette-fx-guard) ─────────────────────────
export interface DitherMetrics {
  /** Anzahl Dither-Pixel (Abwechslung in horizontaler UND vertikaler Richtung). */
  ditherPixels: number;
  /** Groesste Banddicke: Minimum der durchgehenden Dither-Laeufe (4 Richtungen). */
  bandPx: number;
}

export function ditherMetrics(rows: readonly string[]): DitherMetrics;

export function analyzeFxGuard(
  name: string,
  file: string,
  rows: readonly string[],
  w: number,
  h: number,
  pal: readonly number[],
): PaletteAsset & { dither: DitherMetrics };

export interface ScaleCoverageResult {
  key: string;
  maxScale: number;
  bakeMaxLevel: number;
  level: number;
  effectiveScale: number;
  covered: boolean;
}

export function scaleCoverage(
  key: string,
  maxScale: number,
  fns: { mixelMaxLevel: (key: string) => number; mixelLevelFor: (key: string, scale: number) => number },
): ScaleCoverageResult;

