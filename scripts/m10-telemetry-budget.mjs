#!/usr/bin/env node
// M10-telemetry-budget K1: Deterministischer Probe fuer den Telemetrie-Sampler
// (Lane m10-telemetry-budget). Kein Geraet, kein Renderer, kein Server — daher
// OHNE flock (feste Iterationszahl, lastunabhaengig).
//
// Misst:
//  1. Sammel-Overhead: µs je collect()-Aufruf (collectReadings + buildSample +
//     frameStats-Sort) mit gefuelltem Frame-Puffer.
//  2. Payload-Groesse: JSON-Bytes je Sample und je Request (Samples/Flush).
//  3. Kosten je Minute: Samples/Min * µs/Sample und Payload-Bytes/Min.
//
//   node --experimental-strip-types scripts/m10-telemetry-budget.mjs --tag=before
//   ... --interval=10000 --buffer=240 --pending=24 --tag=after-reduced
//
// JSON geht nach ~/games/.evidence/m10-telemetry-budget/<tag>.json (Belege
// ausserhalb des Repos, Dom-Wunsch 27.11.).
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { rolldown } from "rolldown";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  return fallback;
};
const TAG = String(argOf("tag", "before"));

// ── TS-Logik bündeln (rolldown ist Vite-8-Dependency; src/telemetry.ts hat
//    extensionless Imports + Parameter-Properties, die node-strip nicht kann) ──
const BUNDLE = join(tmpdir(), "m10-telemetry-budget", `telemetry-bundle-${TAG}.mjs`);
mkdirSync(BUNDLE.slice(0, BUNDLE.lastIndexOf("/")), { recursive: true });
const bundle = await rolldown({ input: resolve("src/telemetry.ts") });
await bundle.write({ file: BUNDLE, format: "esm" });
await bundle.close();
const { TELEMETRY_INTERVAL_MS, TelemetryCollector } = await import(BUNDLE);

const INTERVAL = Number(argOf("interval", TELEMETRY_INTERVAL_MS));
const BUFFER = Number(argOf("buffer", 600)); // FRAME_BUFFER_MAX (Ist)
const PENDING = Number(argOf("pending", 60)); // PENDING_MAX (Ist)
const WARMUP = 2000;
const RUNS = 5;
const ITERS = 5000; // collect()-Aufrufe je Messlauf (fest, deterministisch)

// Spiel-Stub wie in tests/telemetry.test.ts: Run-Szene mit QuickStats,
// 300 Gegner, LOD "reduced"/"full" je --tier-Argument.
const TIER = String(argOf("tier", "full"));
const game = {
  events: { on: () => {} },
  scene: {
    isActive: (k) => k === "run",
    isPaused: () => false,
    getScene: (k) =>
      k === "run"
        ? {
            getQuickStats: () => ({
              time: 62.3, fps: 58.4, enemies: 300, character: "kael",
              lod: { level: TIER },
            }),
            combat: { fx: { active: new Array(12).fill(1) } },
          }
        : null,
  },
  loop: { actualFps: 58.4 },
  renderer: { drawCount: 148 },
  canvas: null,
};

const collector = new TelemetryCollector(
  game,
  { ua: "Mozilla/5.0 (Linux; Android 14; SM-T580) AppleWebKit Chrome/120", dpr: 1.75, screenW: 1280, screenH: 720 },
  { renderer: "Mali-G52 MP6 (RPL-S Proxy)", vendor: "ARM", build: "probe 2026-11-28" },
  { intervalMs: INTERVAL },
);

// Frame-Puffer fuellen wie nach 10 s @ 60 FPS (Ist: 600 Eintraege).
for (let i = 0; i < BUFFER; i++) collector.recordFrame(16.6 + (i % 3) * 0.1);

for (let i = 0; i < WARMUP; i++) collector.collect();

const runs = [];
for (let r = 0; r < RUNS; r++) {
  const t0 = performance.now();
  for (let i = 0; i < ITERS; i++) collector.collect();
  runs.push(((performance.now() - t0) * 1000) / ITERS); // µs je Aufruf
}
runs.sort((a, b) => a - b);
const usPerCollect = runs[Math.floor(RUNS / 2)];

// Payload: ein Sample + ein voller Request (PENDING Samples, Offline-Fehler
// lassen den Puffer stehen — pendingMax-Deckel greift).
let flushFail = true;
const collector2 = new TelemetryCollector(
  game,
  { ua: "probe", dpr: 1, screenW: 1280, screenH: 720 },
  { renderer: "probe", vendor: "probe", build: "probe" },
  { intervalMs: INTERVAL, send: async () => { if (flushFail) throw new Error("offline"); } },
);
for (let i = 0; i < PENDING; i++) collector2.sample();
const sampleJson = JSON.stringify(collector2.collect());
const fullRequestBody = JSON.stringify([
  // Repräsentativ: PENDING identische Samples (Felder sind konstant je Sample-Form).
  JSON.parse(sampleJson),
]);
const bytesPerSample = Buffer.byteLength(sampleJson, "utf8");
const bytesPerRequest = bytesPerSample * PENDING;

const samplesPerMin = 60000 / INTERVAL;
const result = {
  tag: TAG,
  tier: TIER,
  config: { intervalMs: INTERVAL, frameBufferMax: BUFFER, pendingMax: PENDING },
  usPerCollect: Math.round(usPerCollect * 100) / 100,
  usRuns: runs.map((r) => Math.round(r * 100) / 100),
  bytesPerSample,
  bytesPerRequest,
  samplesPerMin: Math.round(samplesPerMin * 100) / 100,
  collectMsPerMin: Math.round(((samplesPerMin * usPerCollect) / 1000) * 1000) / 1000,
  payloadKBPerMin: Math.round(((bytesPerSample * samplesPerMin) / 1024) * 100) / 100,
  note: "Deterministischer Probe: feste Iterationszahl, Median aus 5 Läufen à 5000 collect().",
};

const outDir = join(homedir(), "games", ".evidence", "m10-telemetry-budget");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${TAG}.json`);
writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
console.log(`\n-> ${outPath}`);
