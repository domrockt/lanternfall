// M10-crowd-variant-tone (#7327): Suchlauf fuer kraeftige Variantentoene.
// Läuft unter tsx (echte Grids, exakt gleiche Misch-Mathematik wie
// enemyVariantFrames und gleicher Maßstab wie tests/crowd-variant-tone.test.ts).
//
// Hartes Iterationslimit: EIN deterministischer Greedy-Durchlauf (32 Palette-
// kandidaten je Typ) — keine zweite Runde, kein Hand-Nachziehen.
// Scope: nur die 20 schwachen Typen der Vorher-Messung (rgbDist < 60,
// handgezeichnete Typen ausgenommen) — alle anderen bleiben bytegleich.
// Bedingungen je Kandidat:
//   - reserviert: 0/1/2/3 (Kontur/Nacht), 9 (paleMist-Kantennähe), 13 (Glow),
//     20/21/22 (Amber/Lantern/Glow = Elite-Signal),
//   - Lesbarkeitsband: Kandidat-Luminanz 55-195 (dunkles Moor, kein Glow),
//   - Ziel: eigene RGB-Distanz (Basis-Mittelton vs. gemischter Varianten-
//     Mittelton, 80-%-Mischung) >= 60 (Zielwert Befund #7327),
//   - Kollision: >= 40 RGB zu jeder fremden gerenderten Typ-Basis,
//   - Vielfalt: ein Zielton max. 6x (sonst degeneriert max-min auf einen Ton),
//   - Rang: max Kollisions-Distanz, dann Hue-Delta, dann Eigen-Distanz,
//     dann niedrigerer Index.
// Fallback (dokumentiert, falls kein Kandidat Ziel 60 erfüllt): max
// Eigen-Distanz unter den Band-Kandidaten.
import { ENEMY_LIST } from "../src/data/enemies";
import { enemySpriteFrames, type Grid } from "../src/gfx/enemySprites";
import { C, PAL } from "../src/palette";
import { readFileSync } from "node:fs";

const WEIGHT = 0.8;
const TARGET_DIST = 60;
const CROSS_DIST = 40;
const TONE_CAP = 6;
const RESERVED = new Set([0, 1, 2, 3, 9, 13, 20, 21, 22]);
const LUM_MIN = 55, LUM_MAX = 195;
const HAND_DRAWN = new Set(["enemy_bog_rat", "enemy_wisp", "enemy_bogzombie"]);

const rgb = (i: number): [number, number, number] => [(PAL[i] >> 16) & 255, (PAL[i] >> 8) & 255, PAL[i] & 255];
const lum = ([r, g, b]: readonly number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const hue = ([r, g, b]: readonly number[]) => {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
  if (d === 0) return 0;
  const R = r / 255, G = g / 255, B = b / 255;
  let h;
  if (mx === R) h = ((G - B) / d) % 6;
  else if (mx === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return (h * 60 + 360) % 360;
};
function nearestIdx([r, g, b]: readonly number[]) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < PAL.length; i++) {
    const [pr, pg, pb] = rgb(i);
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function bodyMean(grid: Grid): [number, number, number] {
  const s = [0, 0, 0]; let n = 0;
  for (const row of grid) for (const c of row) {
    if (c === null || c === 0 || c === 13) continue;
    const [r, g, b] = rgb(c);
    s[0] += r; s[1] += g; s[2] += b; n++;
  }
  return [s[0] / n, s[1] / n, s[2] / n];
}
/** Varianten-Mittelton (Pose 2) mit exakter enemyVariantFrames-Mischung
 *  (inkl. ausgesparter 1-px-Lichtkante: CONTRAST_TONES.top bzw. lightEdgeIndex). */
const CONTRAST_TONES_TOP: Record<string, number> = {
  treant: 12, golem: 12, bog_rat: 12, bat: 12, reaper_bat: 12, lich: 9,
  imp: 12, wisp: 12, crow: 12, voidcaller: 13,
};
function lightEdgeIndex(base: number): number {
  const c = PAL[base];
  const t = [
    Math.min(255, Math.round(((c >> 16) & 255) * 1.35)),
    Math.min(255, Math.round(((c >> 8) & 255) * 1.35)),
    Math.min(255, Math.round((c & 255) * 1.35)),
  ];
  let best = base, bd = Infinity;
  for (let i = 1; i < PAL.length; i++) {
    if (lum(rgb(i)) < 85) continue;
    const [pr, pg, pb] = rgb(i);
    const d = (pr - t[0]) ** 2 + (pg - t[1]) ** 2 + (pb - t[2]) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function mixedVariantMean(index: number, target: number, defId: string, defColor: number): [number, number, number] {
  const grid = enemySpriteFrames(index)[2];
  const top = CONTRAST_TONES_TOP[defId] ?? lightEdgeIndex(defColor);
  const s = [0, 0, 0]; let n = 0;
  const t = PAL[target];
  for (const row of grid) for (const c of row) {
    if (c === null || c === 0 || c === 13) continue;
    let mr: number, mg: number, mb: number;
    if (c === top) { [mr, mg, mb] = rgb(c); } // Lichtkante bleibt unangetastet
    else {
      const [r, g, b] = rgb(c);
      const mixed = [
        Math.round(r * (1 - WEIGHT) + ((t >> 16) & 255) * WEIGHT),
        Math.round(g * (1 - WEIGHT) + ((t >> 8) & 255) * WEIGHT),
        Math.round(b * (1 - WEIGHT) + (t & 255) * WEIGHT),
      ];
      [mr, mg, mb] = rgb(nearestIdx(mixed));
    }
    s[0] += mr; s[1] += mg; s[2] += mb; n++;
  }
  return [s[0] / n, s[1] / n, s[2] / n];
}
const dist = (a: readonly number[], b: readonly number[]) =>
  Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);

// Schwache Typen aus der eingeftrorenen Vorher-Messung (rgbDist < 60).
const before = JSON.parse(readFileSync("shots/m10-crowd-tone-before.json", "utf8"));
const weak = before.weakestFirst
  .filter((r: { rgbDist: number }) => r.rgbDist < TARGET_DIST)
  .filter((r: { spriteKey: string }) => !HAND_DRAWN.has(r.spriteKey))
  .sort((a: { rgbDist: number }, b: { rgbDist: number }) => a.rgbDist - b.rgbDist); // worst zuerst

const rendered = ENEMY_LIST.map((def, i) => ({ def, i })).filter(({ def }) => !HAND_DRAWN.has(def.spriteKey));
const baseMeans = new Map<number, [number, number, number]>();
for (const { i } of rendered) baseMeans.set(i, bodyMean(enemySpriteFrames(i)[0]));
const idxOf = new Map<string, number>(rendered.map(({ def, i }) => [def.spriteKey, i]));

const usage = new Map<number, number>();
const chosen = new Map<number, number>();
const chosenMean = new Map<number, [number, number, number]>();
let fallbacks = 0;

for (const row of weak) {
  const i = idxOf.get(row.spriteKey)!;
  const def = ENEMY_LIST[i];
  const base = baseMeans.get(i)!;
  let best: { c: number; cross: number; own: number; hue: number } | null = null;
  let fb: { c: number; own: number } | null = null;
  for (let c = 0; c < PAL.length; c++) { // festes Kandidatenlimit: 32
    if (RESERVED.has(c)) continue;
    const L = lum(rgb(c));
    if (L < LUM_MIN || L > LUM_MAX) continue;
    if ((usage.get(c) ?? 0) >= TONE_CAP) continue;
    const mean = mixedVariantMean(i, c, def.id, def.color);
    const own = dist(base, mean);
    if (!fb || own > fb.own) fb = { c, own };
    if (own < TARGET_DIST) continue;
    let cross = Infinity;
    for (const [j, jb] of baseMeans) { if (j !== i) cross = Math.min(cross, dist(mean, jb)); }
    if (cross < CROSS_DIST) continue;
    const hd = Math.abs(hue(base) - hue(mean));
    if (!best || cross > best.cross || (cross === best.cross && hd > best.hue)) best = { c, cross, own, hue: hd };
  }
  if (best) {
    chosen.set(i, best.c);
    chosenMean.set(i, mixedVariantMean(i, best.c, def.id, def.color));
    usage.set(best.c, (usage.get(best.c) ?? 0) + 1);
  } else {
    fallbacks++;
    chosen.set(i, fb!.c);
    chosenMean.set(i, mixedVariantMean(i, fb!.c, def.id, def.color));
    usage.set(fb!.c, (usage.get(fb!.c) ?? 0) + 1);
    console.error(`!! ${row.spriteKey}: Ziel ${TARGET_DIST} nicht erreichbar — Fallback max Distanz (${fb!.own.toFixed(1)})`);
  }
}

const NAME = (i: number) => Object.entries(C).find(([, v]) => v === i)![0];
console.log("\nTyp | Vorher | Zielton | eigene Distanz | min. Kollisions-Distanz");
let minOwn = Infinity, minCross = Infinity;
for (const row of weak) {
  const i = idxOf.get(row.spriteKey)!;
  const mean = chosenMean.get(i)!;
  const own = dist(baseMeans.get(i)!, mean);
  let cross = Infinity;
  for (const [j, jb] of baseMeans) { if (j !== i) cross = Math.min(cross, dist(mean, jb)); }
  minOwn = Math.min(minOwn, own); minCross = Math.min(minCross, cross);
  console.log(`${row.spriteKey.padEnd(18)} ${String(row.rgbDist).padStart(5)} -> C.${NAME(chosen.get(i)!).padEnd(12)} own=${own.toFixed(1).padStart(6)} cross=${cross.toFixed(1).padStart(6)}`);
}
console.log(`\nErgebnis (20 Typen): min own=${minOwn.toFixed(1)} (Ziel >= ${TARGET_DIST}), min cross=${minCross.toFixed(1)} (>= ${CROSS_DIST}), Fallbacks=${fallbacks}`);
console.log("\nconst VARIANT_TONE_OVERRIDES: Record<string, number> = {");
for (const row of weak) {
  const i = idxOf.get(row.spriteKey)!;
  console.log(`  ${row.spriteKey}: C.${NAME(chosen.get(i)!)},`);
}
console.log("};");
