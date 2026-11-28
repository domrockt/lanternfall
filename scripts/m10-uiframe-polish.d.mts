/* Typdeklaration fuer scripts/m10-uiframe-polish.mjs (Analysefunktionen). */
import type { GenSprite } from "../src/gfx/gen-ui";

export declare function decodeChar(ch: string): number;

export interface GlyphComponentInfo {
  size: number;
  orth: boolean;
}
export interface GlyphInfo {
  components: GlyphComponentInfo[];
  holes: { size: number; w: number; h: number }[];
}
export interface GlyphAnalysis {
  glyphCount: number;
  perGlyph: Record<string, GlyphInfo>;
  isolatedSinglePixels: string[];
  diagonalOnlyChains: string[];
  onePxHoles: { ch: string; size: number; w: number; h: number }[];
  holeGlyphShare: number;
}
export interface FrameEdgeRun {
  color: number;
  len: number;
  at: [number, number];
}
export interface FrameAnalysis {
  w: number;
  h: number;
  top: { runs: FrameEdgeRun[] };
  bottom: { runs: FrameEdgeRun[] };
  left: { runs: FrameEdgeRun[] };
  right: { runs: FrameEdgeRun[] };
  corners: { x: number; y: number; color: number }[];
  centerColor: number;
  contrast: Record<string, { edge: string; against: string; ratio: number }>;
  pass3to1: Record<string, boolean>;
}

export declare function analyzeGlyphs(GLYPHS: Record<string, string[]>): GlyphAnalysis;
export declare function analyzeFrame(frame: GenSprite, PAL: readonly number[]): FrameAnalysis;
