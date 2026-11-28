#!/usr/bin/env node
// m10-spawn-burst-alloc K1/K3: Allokationen je Nachschub-Tick (Spawn-Burst-Pfad).
//
// Bedarf aus docs/lanes/m10-run-cpu-budget.md ("Offene Bedarfe"): die
// Spawn-Burst-Kosten des Nachschub-Ticks dominieren die JS-Frame-Zeit-Spitzen
// (p95). Diese Messung isoliert die ALLOKATIONEN im Spawn-Pfad — die
// Burst-VERTEILUNG ist bereits durch m10-spawn-burst-budget +
// m10-spawn-budget-dt abgedeckt und wird hier NICHT veraendert.
//
// Methode (deterministisch, kein Browser-Rauschen): der echte `Spawner` wird
// mit rolldown nach Node gebundelt (Phaser gemockt wie in
// tests/spawn-budget-dt.test.ts — Spawner nutzt Phaser nur fuer Math.Clamp,
// der EnemyPool ist ein Stub wie dort). Das Szenario laeuft in einem
// Child-Process mit FIX KLEINEM Young-Gen (--max-semi-space-size=1, MiB) und
// --trace-gc; Minor-GC-Haeufigkeit ist proportional zum Young-Gen-Churn, d. h.
// zu den Allokationen des Ticks (identische Heap-Konfiguration in beiden
// Laeufen):
//
//   - scavenges / gcMs je 1000 Ticks  (Hauptkriterium K3: <= 50 % der Vorher-
//     Messung; Scavenge-Haeufigkeit ~ Allokationen je Tick)
//   - tickMs je 1000 Ticks            (Laufzeit des Szenario-Loops inkl. GC)
//   - mixPickCalls je Tick            (Object.entries/values-Aufrufe im
//     Szenario — deterministischer Zaehler fuer den pickEnemy-Hebel)
//   - spawnChecksum je Seed           (Bitgleichheit K2/K3: gleiche Seeds ->
//     gleiche Spawn-Sequenz; FNV-1a ueber id|x|y|elite)
//
// Kalibrierung 2026-11-28: der Node-Sampling-Heap-Profiler (Inspector) misst
// Short-Lived-Allokationen NICHT (64 MB Churn -> 0 gemeldete Bytes) und der
// GC-PerformanceObserver liefert in diesem Node-Build keine gc-Entries — daher
// --trace-gc + fixer Semi-Space.
//
// Burst-Szenario: Minute 25, 960x540 (Cap 300, dort lief der Chaos-Lauf der
// Bedarfs-Lane), Pool am Cap minus Burst-Raum, Budget-Rueckstau 32, volle
// Allowance (SPAWN_ALLOWANCE_MAX = 16) -> genau 16 Spawns je Tick, danach
// Kill-Churn (16 entfernt) — der maximale Nachschub-Tick bei Endgame-Massedruck.
// Kein FPS/Echtzeit-Lauf -> OHNE flock.
//
//   node scripts/m10-spawn-burst-alloc.mjs --tag=before
//   node scripts/m10-spawn-burst-alloc.mjs --tag=after
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { rolldown } from "rolldown";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const HOME = process.env.HOME ?? "/home/ai";
const OUT = String(
  argOf("json", path.join(HOME, "games/.evidence/m10-spawn-burst-alloc", `m10-spawn-burst-alloc-${TAG}.json`)),
);
const TICKS_PER_SEED = Number(argOf("ticks", "30000"));
const SEEDS = [1, 2, 3];
const DT = 0.5; // Sim-Dt bei timeScale 30 und 60 fps (Burst-Fenster).
const VIEW_W = 960;
const VIEW_H = 540;
const BUDGET_BACKLOG = 32; // Rueckstau > Allowance -> Allowance (16) ist bindend.
const SEMI_SPACE_MIB = 1; // Fixer kleiner Young-Gen: Scavenge-Haeufigkeit ~ Churn.

// Mess-Harness als TS-Entry (echter Spawner + SeededRng + scaling).
const ENTRY = `
import { Spawner } from "/home/ai/games/lf-lanes/m10-spawn-burst-alloc/src/systems/Spawner";
import { SeededRng } from "/home/ai/games/lf-lanes/m10-spawn-burst-alloc/src/logic/rng";
import { maxActiveEnemies } from "/home/ai/games/lf-lanes/m10-spawn-burst-alloc/src/logic/scaling";

const VIEW_W = ${VIEW_W};
const VIEW_H = ${VIEW_H};
const DT = ${DT};
const BUDGET_BACKLOG = ${BUDGET_BACKLOG};

/** Stub-Pool (Technik tests/spawn-budget-dt.test.ts): haelt Runtime-Objekte,
 *  alloziert selbst nur das Runtime-Objekt (wie der echte Pool im Reuse-Fall). */
class StubPool {
  active = [];
  get count() { return this.active.length; }
  spawn(def, x, y, hpScale, damageScale, phase, options) {
    const e = {
      def, x, y, hpScale, damageScale, phase, age: 0,
      elite: Boolean(options?.elite), boss: options?.bossIndex !== undefined && options.bossIndex >= 0,
    };
    this.active.push(e);
    return e;
  }
  despawn(e) {
    const i = this.active.indexOf(e);
    if (i >= 0) this.active.splice(i, 1);
  }
}

function makeScene(registry) {
  return {
    registry: {
      set: (k, v) => registry.set(k, v),
      get: (k) => registry.get(k),
    },
    cameras: {
      main: {
        width: VIEW_W, height: VIEW_H, scrollX: 0, scrollY: 0,
        worldView: { x: 0, y: 0, right: VIEW_W, bottom: VIEW_H },
      },
    },
    game: { loop: { frame: 0, delta: 16.7 } },
  };
}

function fnv1a(str, seed) {
  let h = (seed >>> 0) || 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Ein Burst-Szenario (Minute 25, Pool am Cap minus Burst-Raum, Rueckstau 32).
 *  Zaehlt nebenbei Object.entries/values-Aufrufe (pickEnemy-Hebel) und liefert
 *  checksum = FNV-1a der Spawn-Sequenz (id|x|y|elite je Spawn). */
export function runScenario(seed, ticks) {
  const registry = new Map();
  const scene = makeScene(registry);
  const pool = new StubPool();
  const spawner = new Spawner(scene, pool, new SeededRng(seed));
  registry.set("lf-elapsed", 1500); // Minute 25 (Endgame, Late-Game-Mix)
  const cap = maxActiveEnemies(1500, VIEW_W, VIEW_H);
  // Fuelle den Pool auf cap - SPAWN_ALLOWANCE_MAX (16): jeder Tick hat exakt
  // Raum fuer einen vollen Burst, Bestand bleibt auf dem Cap (Kill-Churn unten).
  for (let i = 0; i < cap - 16; i++) {
    pool.active.push({ def: { id: "filler" }, x: 0, y: 0, age: 100, elite: false, boss: false });
  }
  let mixPickCalls = 0;
  const countKeys = (patched) => (...args) => { mixPickCalls++; return patched(...args); };
  const origEntries = Object.entries;
  const origValues = Object.values;
  Object.entries = countKeys(origEntries);
  Object.values = countKeys(origValues);
  try {
    let h = 0x811c9dc5;
    for (let t = 0; t < ticks; t++) {
      const elapsed = 1500 + t * DT;
      registry.set("lf-elapsed", elapsed);
      scene.game.loop.frame = t + 1;
      spawner.budget = BUDGET_BACKLOG; // Allowance (16) ist bindend -> 16 Spawns
      const spawned = spawner.update(elapsed, DT, VIEW_W / 2, VIEW_H / 2);
      for (const e of spawned) {
        h = fnv1a(e.def.id + "|" + Math.round(e.x) + "|" + Math.round(e.y) + "|" + (e.elite ? 1 : 0) + ";", h);
      }
      // Kill-Churn: exakt die frisch gespawnten wieder entfernen -> Pool bleibt
      // am Cap minus Burst-Raum, der Tick bleibt im Steady State.
      for (let k = 0; k < spawned.length; k++) pool.active.pop();
    }
    return { checksum: h >>> 0, mixPickCalls, cap };
  } finally {
    Object.entries = origEntries;
    Object.values = origValues;
  }
}
`;

const PHASER_STUB = `export default {
  Math: { Clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
  BlendModes: { NORMAL: 1, ADD: 3 },
};
`;

const TMP = path.join(HOME, "tmp", "m10-spawn-burst-alloc");
mkdirSync(TMP, { recursive: true });

const bundle = await rolldown({
  input: path.join(TMP, "m10-spawn-burst-alloc-entry.ts"),
  plugins: [
    {
      name: "phaser-stub",
      resolveId(id) {
        if (id === "phaser") return "\0phaser-stub";
        return null;
      },
      load(id) {
        if (id === "\0phaser-stub") return PHASER_STUB;
        return null;
      },
    },
  ],
});
const { output } = await bundle.generate({ format: "esm" });
const bundleFile = path.join(TMP, "m10-spawn-burst-alloc-bundle.mjs");
writeFileSync(bundleFile, output[0].code);
const { runScenario } = await import(bundleFile);

// ---------------- Child-Modus: Szenario mit --trace-gc laufen lassen ----------
if (process.argv.includes("--lf-child")) {
  runScenario(7, 500); // Warmup (JIT) ohne Messung
  const t0 = performance.now();
  const results = SEEDS.map((seed) => runScenario(seed, TICKS_PER_SEED));
  const tickMs = performance.now() - t0;
  // JSON auf fd 3 (stdout gehoert --trace-gc).
  writeFileSync(process.argv[process.argv.indexOf("--lf-out") + 1], JSON.stringify({
    tickMs: Math.round(tickMs),
    checksum: Object.fromEntries(SEEDS.map((s, i) => [String(s), results[i].checksum])),
    mixPickCalls: results.reduce((a, r) => a + r.mixPickCalls, 0),
    cap: results[0].cap,
  }));
  process.exit(0);
}

// ---------------- Parent: Child starten, --trace-gc parsen, JSON schreiben --
const childOutFile = path.join(TMP, "m10-spawn-burst-alloc-measured.json");
const childArgs = [
  `--max-semi-space-size=${SEMI_SPACE_MIB}`,
  "--trace-gc",
  fileURLToPath(import.meta.url),
  "--lf-child",
  "--lf-out",
  childOutFile,
  ...argv,
];
let stdout = "";
let stderr = "";
const child = spawn(process.execPath, childArgs, { stdio: ["ignore", "pipe", "pipe"] });
child.stdout.on("data", (d) => (stdout += d)); // --trace-gc-Zeilen + ggfl. Log
child.stderr.on("data", (d) => (stderr += d));
const childRc = await new Promise((resolve) => child.on("close", resolve));
if (childRc !== 0) {
  console.error(stderr.slice(-4000));
  process.exit(childRc ?? 1);
}
const measured = JSON.parse(await import("node:fs").then((m) => m.readFileSync(childOutFile, "utf8")));

// --trace-gc-Zeilen: "<ms>: ... <dur> ms Scavenge ..." / "Mark-compact" etc.
const gcLines = stdout.split("\n").filter((l) => /Scavenge|Mark-compact|Mark-sweep/.test(l));
const scavengeLines = gcLines.filter((l) => /Scavenge/.test(l));
const majorLines = gcLines.filter((l) => /Mark-compact|Mark-sweep/.test(l));
// Dauer steht am Zeilenende als "<pause> / <avg> ms" (nicht die Uptime am Anfang).
const sumMs = (lines) =>
  Math.round(
    lines.reduce((a, l) => a + Number(l.match(/,\s*([0-9.]+)\s*\/\s*[0-9.]+\s*ms/)?.[1] ?? 0), 0) * 10,
  ) / 10;


const totalTicks = TICKS_PER_SEED * SEEDS.length;
const per1000 = (v) => Math.round((v / totalTicks) * 1000 * 100) / 100;
const result = {
  generatedAt: new Date().toISOString(),
  tag: TAG,
  node: process.version,
  host: os.hostname(),
  method: `Minor-GC-Haeufigkeit via --trace-gc im Child-Process mit fixem Young-Gen (--max-semi-space-size=${SEMI_SPACE_MIB} MiB) — Scavenge-Zahl proportional zum Young-Gen-Churn (Allokationen je Tick); Heap-Konfiguration in Vorher-/Nachher-Lauf identisch. Echter Spawner via rolldown-Bundle, Phaser gemockt (Technik tests/spawn-budget-dt.test.ts), EnemyPool-Stub. Kalibrierung: Node-Sampling-Heap-Profiler misst Short-Lived-Allokationen nicht (64 MB Churn -> 0 B), GC-PerformanceObserver liefert hier keine gc-Entries.`,
  scenario: {
    minute: 25,
    viewport: `${VIEW_W}x${VIEW_H}`,
    cap: measured.cap,
    dt: DT,
    budgetBacklog: BUDGET_BACKLOG,
    spawnsPerTick: 16,
    ticksPerSeed: TICKS_PER_SEED,
    seeds: SEEDS,
    totalTicks,
    semiSpaceMiB: SEMI_SPACE_MIB,
  },
  alloc: {
    scavenges: scavengeLines.length,
    scavengesPer1000Ticks: per1000(scavengeLines.length),
    majorGcs: majorLines.length,
    gcMs: sumMs(gcLines),
    gcMsPer1000Ticks: per1000(sumMs(gcLines)),
    tickMs: measured.tickMs,
    tickMsPer1000Ticks: per1000(measured.tickMs),
    mixPickCalls: measured.mixPickCalls,
    mixPickCallsPerTick: Math.round((measured.mixPickCalls / totalTicks) * 100) / 100,
  },
  spawnChecksum: measured.checksum,
};
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(`[m10-spawn-burst-alloc] JSON: ${OUT}`);
