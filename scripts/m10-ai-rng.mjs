#!/usr/bin/env node
// m10-ai-rng-seed K1/K3: Determinismus-Probe fuer die Gegner-KI-RNG.
//
// Reproduziert den EnemyPool-Fallback-Vertrag ueber die reine Logik
// (stepEnemyAi/newAiState aus src/logic/enemy-ai.ts, kein Phaser):
//
//   --fallback=math    alter Zustand: { next: () => Math.random() } (DEFAULT_AI_RNG,
//                      modulweit geteilt — exakt wie EnemyPool.ts Z.125 vor dem Fix)
//   --fallback=seeded  neuer Zustand: pool-eigener SeededRng aus dem Run-Seed
//                      (Muster Run-SeededRng, ein Stream pro Pool)
//
// Zwei Kontrolllaeufe mit gleichem Seed und identischer dt-Folge (feste Substeps).
// Akzeptanz (vor der Messung festgelegt):
//   math   → KI-Marken der beiden Läufe DIVERGIERN (Nichtdeterminismus belegt)
//   seeded → KI-Marken BITGLEICH (Determinismus belegt)
// Rein logisch — kein Renderer, kein Server, daher OHNE flock.
//
//   node --experimental-strip-types scripts/m10-ai-rng.mjs --fallback=math   --tag=before
//   node --experimental-strip-types scripts/m10-ai-rng.mjs --fallback=seeded --tag=after
//
// JSON geht nach shots/m10-ai-rng-<tag>.json.
import { mkdirSync, writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "before"));
const FALLBACK = String(argOf("fallback", "math"));
const OUT = String(argOf("json", `shots/m10-ai-rng-${TAG}.json`));
const ENEMIES = Number(argOf("enemies", "120"));
const FRAMES = Number(argOf("frames", "600"));
const DT = 1 / 60;
const SEED = Number(argOf("seed", "20261127")) >>> 0;

if (FALLBACK !== "math" && FALLBACK !== "seeded") {
  console.error(`unbekannter Fallback: ${FALLBACK} (math|seeded)`);
  process.exit(2);
}

const { stepEnemyAi, newAiState } = await import(
  new URL("../src/logic/enemy-ai.ts", import.meta.url)
);
const { mulberry32, SeededRng } = await import(
  new URL("../src/logic/rng.ts", import.meta.url)
);

// Alter DEFAULT_AI_RNG (EnemyPool.ts Z.125 vor dem Fix), modulweit geteilt —
// auch ueber mehrere Pool-Instanzen hinweg, genau wie im Spiel.
const MATH_FALLBACK = { next: () => Math.random() };

/** Archetyp-Mix wie im Endgame-Crowd (vgl. scripts/m10-ai-budget.mjs). */
const ARCHETYPE_WEIGHTS = {
  swarm: 0.3, chaser: 0.22, tank: 0.08, ranged: 0.1, charger: 0.07,
  splitter: 0.07, exploder: 0.05, phaser: 0.04, orbiter: 0.04, summoner: 0.03,
};

function layoutRng(salt, i) {
  return mulberry32((SEED + i * salt) >>> 0);
}

function archetypeFor(i) {
  const r = layoutRng(15485863, i)();
  let acc = 0;
  for (const [a, w] of Object.entries(ARCHETYPE_WEIGHTS)) {
    acc += w;
    if (r < acc) return a;
  }
  return "chaser";
}

function ringDistance(i) {
  const r = layoutRng(7919, i)();
  const bucket = i % 10;
  if (bucket < 5) return 40 + r * 180;
  if (bucket < 8) return 220 + r * 200;
  return 420 + r * 280;
}

function ringAngle(i) {
  return (i / ENEMIES) * Math.PI * 2 + layoutRng(104729, i)() * 0.6;
}

/**
 * Ein Kontrolllauf: Crowd + KI-Sim ueber FRAMES feste Substeps.
 * Layout ist seed-deterministisch und fuer beide Läufe identisch; nur die
 * KI-RNG-Quelle unterscheidet sich zwischen math|seeded.
 */
function controlRun(fallbackRng) {
  const enemies = [];
  for (let i = 0; i < ENEMIES; i++) {
    const archetype = archetypeFor(i);
    const tier = i % 6;
    const dist = ringDistance(i);
    const ang = ringAngle(i);
    enemies.push({
      archetype,
      tier,
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      speed: 70,
      uid: i + 1,
      state: newAiState(fallbackRng),
    });
  }
  for (let f = 0; f < FRAMES; f++) {
    const t = f * DT;
    // Deterministische Spielerbewegung (Kreis, Radius 60) — beide Läufe identisch.
    const px = Math.cos(t * 0.7) * 60;
    const py = Math.sin(t * 0.7) * 60;
    for (const e of enemies) {
      e.state = stepEnemyAi(
        e.state,
        {
          archetype: e.archetype, tier: e.tier, x: e.x, y: e.y,
          playerX: px, playerY: py, speed: e.speed,
        },
        DT,
        fallbackRng,
        e.uid,
      ).state;
      // Bewegung wie Run.ts: Richtung * speed * dt (nur Entscheidungs-Marken
      // relevant, hier vereinfacht gerade Bewegung aus dem letzten Step).
      const st = e.state;
      e.x += (st.aiMoveX ?? 0) * e.speed * DT;
      e.y += (st.aiMoveY ?? 0) * e.speed * DT;
    }
  }
  return enemies;
}

/** FNV-1a-Marke ueber allen KI-Entscheidungen (bitgleicher Vergleich). */
function mark(enemies) {
  let h = 2166136261 >>> 0;
  const push = (s) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x7c;
    h = Math.imul(h, 16777619) >>> 0;
  };
  for (const e of enemies) {
    const s = e.state;
    push(
      `${e.uid}|${s.mode}|${s.blinks}|${s.attacks}|${s.orbitDir}|`
      + `${Math.round(e.x * 10)}|${Math.round(e.y * 10)}|`
      + `${Math.round(s.timer * 1000)}|${Math.round(s.cooldown * 1000)}|${Math.round(s.phase * 1000)}`,
    );
  }
  return h.toString(16).padStart(8, "0");
}

function sample(enemies) {
  return enemies.slice(0, 4).map((e) => ({
    uid: e.uid,
    mode: e.state.mode,
    blinks: e.state.blinks,
    attacks: e.state.attacks,
    x: Math.round(e.x * 10) / 10,
    y: Math.round(e.y * 10) / 10,
  }));
}

// Zwei Kontrollläufe, gleicher Seed, gleiche dt-Folge.
const runA = FALLBACK === "math"
  ? controlRun(MATH_FALLBACK)
  : controlRun(new SeededRng(SEED));
const runB = FALLBACK === "math"
  ? controlRun(MATH_FALLBACK)
  : controlRun(new SeededRng(SEED));

const markA = mark(runA);
const markB = mark(runB);
const identical = markA === markB;

mkdirSync("shots", { recursive: true });
const result = {
  tag: TAG,
  fallback: FALLBACK,
  seed: SEED,
  enemies: ENEMIES,
  frames: FRAMES,
  dt: DT,
  runs: [{ mark: markA, sample: sample(runA) }, { mark: markB, sample: sample(runB) }],
  identical,
  akzeptanz: FALLBACK === "math"
    ? "Vorher: Marken der beiden Kontrollläufe DIVERGIERN (Nichtdeterminismus des Math.random-Fallbacks belegt)."
    : "Nachher: Marken der beiden Kontrollläufe BITGLEICH (gesäter Pool-Fallback deterministisch).",
  bestanden: FALLBACK === "math" ? !identical : identical,
};
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(`fallback=${FALLBACK} seed=${SEED} markA=${markA} markB=${markB} identical=${identical} bestanden=${result.bestanden} → ${OUT}`);
if (!result.bestanden) process.exit(1);
