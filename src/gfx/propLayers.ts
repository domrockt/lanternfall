/**
 * Reine Helfer fuer das Prop-Batching (m10-ground-props-batch) — bewusst ohne
 * Phaser-Import, damit sie in Vitest ohne jsdom testbar sind (vgl. logic/lod.ts).
 */

/** Bekannte Prop-Texturen (13) — je Textur gibt es ein festes Layer-Paar. */
export const PROP_KEYS = new Set([
  "prop_tree_a", "prop_tree_b", "prop_stump", "prop_boulder", "prop_grave",
  "prop_cross", "prop_ruin", "prop_column", "prop_post", "prop_mushroom_ring",
  "prop_bones", "prop_reeds", "prop_lilypad",
]);

/**
 * Prop-Tiers fuer das gestufte Dichte-LOD (m10-prop-density-lod):
 * 0 = Landmarke (Laternen/Lichtquellen — bleiben immer sichtbar, Orientierung),
 * 1 = grosse Struktur (Baeume, Ruinen, Saeulen, Graeber — Horizont-Verankerung),
 * 2 = kleine Deko (zuerst ausgeblendet; entspricht dem alten DENSE_HIDE_PROPS).
 * Unbekannte Keys gelten als Tier 2 (konservativ: werden im Chaos zuerst versteckt).
 */
export const PROP_TIERS: Record<string, 0 | 1 | 2> = {
  prop_post: 0,
  prop_tree_a: 1,
  prop_tree_b: 1,
  prop_ruin: 1,
  prop_column: 1,
  prop_grave: 1,
  prop_stump: 2,
  prop_boulder: 2,
  prop_cross: 2,
  prop_bones: 2,
  prop_reeds: 2,
  prop_lilypad: 2,
  prop_mushroom_ring: 2,
};

/** Hoechster Prop-Tier dieser Textur (0 Landmarke, 1 gross, 2 kleine Deko). */
export function propTierFor(key: string | undefined | null): 0 | 1 | 2 {
  return PROP_TIERS[key ?? ""] ?? 2;
}

/** Feste Tiefen der Batch-Layer. Spieler-Tiefe ist 12 (Run.ts), Chunks liegen bei -100. */
export const PROP_LAYER_DEPTHS = {
  shadow: 11.15,
  propBehind: 11.6,
  propFront: 12.4,
  glowBehind: 11.66,
  glowFront: 12.46,
  ripple: -92,
} as const;

export type PropSide = "behind" | "front";

/** Seitenwahl (wie der alte Depth-Vergleich): footY < playerY = hinter dem Spieler. */
export function propSideFor(footY: number, playerY: number): PropSide {
  return footY < playerY ? "behind" : "front";
}

/** Batches = Layer mit mindestens einem sichtbaren Kind (leere Layer kosten nichts). */
export function visibleBatchCount(visiblePerLayer: readonly number[]): number {
  let n = 0;
  for (const c of visiblePerLayer) if (c > 0) n++;
  return n;
}

/** Feste Batch-Layer: je Prop-Textur 2 (hinter/vor Spieler) + Schatten + Glow-Paar + Ripples. */
export function batchLayerCount(textureCount: number): number {
  return textureCount * 2 + 4;
}
