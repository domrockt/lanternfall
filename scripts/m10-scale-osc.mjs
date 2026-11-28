#!/usr/bin/env node
// M10-scale-osc-guard: deterministische Lastserie gegen stepRenderScale
// (src/logic/scale.ts). Frage: fuehrt alternierende Last (hoch/hoch/niedrig/…)
// zu Stufen-Pumpen (Wechsel zwischen Teilerstufen)?
//
// Laeuft OHNE Browser und OHNE flock (reine Funktion, lastunabhaengig):
//   node --experimental-strip-types scripts/m10-scale-osc.mjs \
//     --out shots/m10-scale-osc-before.json
// Eingaben sind fix (kein Zufall); Determinismus wird im Skript geprueft
// (zwei identische Laeufe muessen byte-gleiche Übergangslisten liefern).

import { writeFileSync } from "node:fs";
import { stepRenderScale } from "../src/logic/scale.ts";

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const OUT = String(argOf("out", "shots/m10-scale-osc-before.json"));

const DT_MS = 1000 / 60; // ein Frame
const FPS_HIGH = 62; // >= SCALE_HIGH_FPS 57 (Heben moeglich)
const FPS_LOW = 41.5; // < SCALE_LOW_FPS 45 (Senken moeglich)
const CAP = 3; // 780x360 dpr3 -> maxRenderScale = 3

// Lastmuster: je Eintrag [Dauer s, FPS]. Alles deterministisch.
const PATTERNS = {
  // Alternierend 5 s Lastspitze / 5 s Entlastung, 240 s:
  // Hysterese-Timer (2 s senken / 4 s heben) laufen in JEDEM Epochenteil an.
  alternating_5s: {
    desc: "5s@41.5fps / 5s@62fps, 24 Epochen (120 s je Richtung)",
    epochs: Array.from({ length: 24 }, () => [
      [5, FPS_LOW],
      [5, FPS_HIGH],
    ]).flat(),
  },
  // Kurzalternierend 3 s / 3 s: unter 4-s-Hebezeit bleibt das Heben selbst
  // ohne Guard aus, das Senken (2 s) greift jede Spitze -> Pumpen-Kandidat.
  alternating_3s: {
    desc: "3s@41.5fps / 3s@62fps, 40 Epochen",
    epochs: Array.from({ length: 40 }, () => [
      [3, FPS_LOW],
      [3, FPS_HIGH],
    ]).flat(),
  },
  // Lastspitzen: 30 s stabil @62, dann 4 s Einbruch @41.5 (flock-Wartezeit
  // aehnlich), 8 Spitzen. Prio: nach jeder Spitze muss der Regler wieder
  // auf Teiler 1 zurueck — genau dort pumpt er ggf. hin und her.
  spikes_4s: {
    desc: "8x (30s@62fps + 4s@41.5fps)",
    epochs: Array.from({ length: 8 }, () => [
      [30, FPS_HIGH],
      [4, FPS_LOW],
    ]).flat(),
  },
};

// Spiegelt die Verdrahtung in src/config.ts: fpsEwma = 0.9*alt + 0.1*instant,
// dann ein stepRenderScale-Aufruf je Frame (dt wie dort auf 16.67 ms gekappt).
function runSeries(epochs, cap = CAP) {
  let state = { scale: 1, belowMs: 0, aboveMs: 0 };
  let ewma = 0;
  const transitions = [];
  let t = 0;
  for (const [seconds, fps] of epochs) {
    for (let i = 0; i < Math.round((seconds * 1000) / DT_MS); i++) {
      ewma = ewma === 0 ? fps : ewma * 0.9 + fps * 0.1;
      const before = state.scale;
      state = stepRenderScale(state, ewma, DT_MS, cap);
      if (state.scale !== before) {
        transitions.push({
          tMs: Math.round(t),
          from: before,
          to: state.scale,
          dir: state.scale > before ? "down" : "up", // Teiler hoch = Pixel runter
        });
      }
      t += DT_MS;
    }
  }
  return { transitions, final: state.scale };
}

const result = { dtMs: DT_MS, fpsHigh: FPS_HIGH, fpsLow: FPS_LOW, cap: CAP, patterns: {} };
let allDeterministic = true;
for (const [name, p] of Object.entries(PATTERNS)) {
  const a = runSeries(p.epochs);
  const b = runSeries(p.epochs);
  const deterministic = JSON.stringify(a) === JSON.stringify(b);
  if (!deterministic) allDeterministic = false;
  const ups = a.transitions.filter((x) => x.dir === "up").length;
  const downs = a.transitions.filter((x) => x.dir === "down").length;
  // Pumpen = ein Richtungspaar (up+down) an derselben Stufe; hier:
  // Teiler-Wechsel in beide Richtungen ueber den Lauf.
  result.patterns[name] = {
    desc: p.desc,
    totalMs: Math.round(p.epochs.reduce((s, [sec]) => s + sec * 1000, 0)),
    deterministic,
    transitionCount: a.transitions.length,
    upCount: ups,
    downCount: downs,
    pumpPairs: Math.min(ups, downs),
    finalScale: a.final,
    transitions: a.transitions,
  };
}
result.allDeterministic = allDeterministic;

writeFileSync(OUT, JSON.stringify(result, null, 2));
const line = (n) => {
  const p = result.patterns[n];
  return `${n}: ${p.transitionCount} Wechsel (${p.upCount} up / ${p.downCount} down), Ende Stufe ${p.finalScale}`;
};
console.log(line("alternating_5s"));
console.log(line("alternating_3s"));
console.log(line("spikes_4s"));
console.log(`deterministic: ${allDeterministic}`);
