#!/usr/bin/env node
// M10-Crowd-Variantenton (#7327): Suchlauf fuer kraeftige Variantentoene.
// Einmal laufen, Tabelle nach enemySprites.ts uebernehmen — kein Hand-Tuning.
//
// Kandidaten: alle 32 Palette-Eintraege (festes Iterationslimit). Je Typ mit
// Vorher-RGB-Distanz < 60 (shots/m10-crowd-tone-before.json, schwächste zuerst):
//   - reserviert: Kontur (0), Augen/Glow (13) sowie Nacht-Himmel (1-3),
//   - Lesbarkeitsband: Kandidat-Luminanz 55-210 (dunkles Moor, keine
//     Glow-Nachahmung),
//   - prognostizierter Varianten-Mittelton = Palette-Index von 80 % Kandidat +
//     20 % Basis-Mittelton (gleiche Mischung wie enemyVariantFrames),
//   - Ziel: prognostizierte RGB-Distanz zur Basis >= 60,
//   - reserviert auch: Amber/Lantern/Glow (20-22, Elite-Signal) und paleMist
//     (9, Kanten-Naehe),
//   - Kollisions-Guard: >= 35 RGB zu jeder fremden Typ-Basis (Fallback 28),
//   - Score = min(Distanz, 120) + 0.3*HueDelta + Chroma-Bonus - Luminanz-
//     Abstandstrafe (Zielband ~125): klar, aber nicht extrem/glow-artig.
import { readFileSync } from "node:fs";

const PAL_SRC = readFileSync("src/palette.ts", "utf8");
const palBlock = PAL_SRC.slice(PAL_SRC.indexOf("export const PAL"), PAL_SRC.indexOf("] as const"));
const PAL = [...palBlock.matchAll(/0x([0-9a-f]{6})/gi)].map((m) => parseInt(m[1], 16));
const NAME_OF = Object.fromEntries(
  [...palBlock.matchAll(/0x[0-9a-f]{6},\s*\/\/\s*(\d+)\s+([a-zA-Z]+)/gi)].map((m) => [Number(m[1]), m[2]]),
);
if (PAL.length !== 32 || Object.keys(NAME_OF).length !== 32) throw new Error("Palette-Parse fehlgeschlagen");

const before = JSON.parse(readFileSync("shots/m10-crowd-tone-before.json", "utf8"));
const rows = before.weakestFirst; // alle 30 Typen, schwächste zuerst
const baseMean = Object.fromEntries(rows.map((r) => [r.spriteKey, r.base.mean]));
const weak = rows.filter((r) => r.rgbDist < 60);

const dist = (a, b) =>
  Math.round(Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * 10) / 10;
const lum = (c) => c.reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
function hue([r, g, b]) {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
  if (d === 0) return 0;
  const R = r / 255, G = g / 255, B = b / 255;
  let h;
  if (mx === R) h = ((G - B) / d) % 6;
  else if (mx === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return (h * 60 + 360) % 360;
}
function nearestIdx([r, g, b]) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < PAL.length; i++) {
    const dr = ((PAL[i] >> 16) & 255) - r, dg = ((PAL[i] >> 8) & 255) - g, db = (PAL[i] & 255) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
const rgbOf = (i) => [((PAL[i] >> 16) & 255), ((PAL[i] >> 8) & 255), (PAL[i] & 255)];

const MIX = 0.8;
const RESERVED = new Set([0, 1, 2, 3, 9, 13, 20, 21, 22]);
const LUM_MIN = 60, LUM_MAX = 195;
const assigned = new Map(); // spriteKey -> {c, toneIdx, d}

function pick(row, collision, targetDist, requireTarget) {
  const base = baseMean[row.spriteKey];
  let best = null;
  for (let c = 0; c < PAL.length; c++) { // festes Limit: 32 Kandidaten
    if (RESERVED.has(c)) continue;
    const cRgb = rgbOf(c);
    if (lum(cRgb) < LUM_MIN || lum(cRgb) > LUM_MAX) continue;
    const pred = [
      Math.round(base[0] * (1 - MIX) + cRgb[0] * MIX),
      Math.round(base[1] * (1 - MIX) + cRgb[1] * MIX),
      Math.round(base[2] * (1 - MIX) + cRgb[2] * MIX),
    ];
    const toneIdx = nearestIdx(pred);
    const toneRgb = rgbOf(toneIdx);
    const d = dist(base, toneRgb);
    if (requireTarget && d < targetDist) continue;
    let blocked = false;
    for (const [other, om] of Object.entries(baseMean)) {
      if (other !== row.spriteKey && dist(toneRgb, om) < collision) { blocked = true; break; }
    }
    if (blocked) continue;
    const chroma = Math.max(...toneRgb) - Math.min(...toneRgb);
    const score = Math.min(d, 120)
      + 0.3 * Math.abs(hue(base) - hue(toneRgb))
      + 0.05 * chroma
      - 0.1 * Math.abs(lum(toneRgb) - 125);
    if (!best || score > best.score || (score === best.score && c < best.c)) {
      best = { c, toneIdx, d, score, toneRgb };
    }
  }
  return best;
}

for (const row of weak) {
  const pass1 = pick(row, 35, 60, true);
  const best = pass1 ?? pick(row, 28, 60, true) ?? pick(row, 0, 0, true);
  if (!best) throw new Error(`${row.spriteKey}: kein Kandidat im Lesbarkeitsband`);
  assigned.set(row.spriteKey, best);
}

console.log("Typ | rgbDist vorher -> prognostiziert | Kandidat (Mischton)");
for (const [k, v] of assigned) console.log(`${k.padEnd(18)} ${String(baseMean[k] && rows.find((r) => r.spriteKey === k).rgbDist).padStart(5)} -> ${String(v.d).padStart(5)}  PAL ${v.c} (${NAME_OF[v.c]}) Mischton=${v.toneRgb.join(",")}`);
console.log("\n// Tabelle fuer enemySprites.ts (Kandidat = Ziel-Ton der 80%-Mischung):");
console.log("const VARIANT_TONE_OVERRIDES: Record<string, number> = {");
for (const [k, v] of assigned) console.log(`  ${k}: C.${NAME_OF[v.c]}, // Mischton PAL ${v.toneIdx} (${NAME_OF[v.toneIdx]}), Distanz ${v.d}`);
console.log("};");
