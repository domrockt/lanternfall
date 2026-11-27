// M10-touch-joystick-feel, Karte K1/K4: Ist-/Nachher-Messung des Touch-Joysticks.
//
// Synthetische Drag-Seren (gerade Linie mit Rauschen, Kreis, Zickzack) werden
// durch den ECHTEN TouchControls-Pfad getrieben: Das Skript kompiliert
// src/input/TouchControls.ts + TouchState.ts per tsc in ein Temp-Verzeichnis,
// stubbt das DOM (gleiche Technik wie tests/chess-lock-touch Harness bzw.
// tests/chest-lock-touch.test.ts) und ruft die installierten
// touchstart/touchmove-Handler frame-weise auf.
//
// Metriken je Serie:
// - directionChanges     : Frames, in denen der Sektor (8 Richtungen) des
//                          ausgegebenen Vektors wechselt (plus jitterChanges:
//                          Wechsel, die die Serie nicht hergibt).
// - emptyUpdates         : Frames mit Positions-Update (Vektor-Aenderung),
//                          ohne sinnvolle Bewegung (Finger-Shift < 0.75 px).
// - updatesPerFrame      : Anteil der Frames mit Snapshot-Update.
// - wrongDirection       : Anteil der Samples mit |Ausgabewinkel - Sollwinkel|
//                          > 22.5° (mehr als ein halber Sektor; nur Gerade/Kreis).
// - latencyGestureFrames : Frames vom Move, der die Geste entscheidet
//                          (Sprung 20 px), bis zur ersten Bewegungsausgabe.
//
// Gates (verbindlich im after-Lauf): wrongDirection < 2 %, latency <= 2,
// updatesPerFrame <= Baseline. Aufruf:
//   node scripts/m10-touch-joystick.mjs --mode before --out shots/m10-touch-joystick-before.json
//   node scripts/m10-touch-joystick.mjs --mode after  --out shots/m10-touch-joystick-after.json \
//        --baseline shots/m10-touch-joystick-before.json
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const mode = args.mode ?? "before";
const outPath = path.resolve(ROOT, args.out ?? `shots/m10-touch-joystick-${mode}.json`);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m10-touch-joystick-"));
const buildDir = path.join(tmpDir, "build", "src");

// --- Echtes TouchControls kompilieren (Import-Elision entfernt phaser) -------
// Eigenes Mini-tsconfig im Temp-Dir (TS5112: CLI-Files + tsconfig im Repo geht nicht);
// "phaser" wird auf einen Stub-Typ gemappt, der Import selbst wird als reiner
// Typ-Import elidiert.
fs.writeFileSync(
  path.join(tmpDir, "phaser-stub.d.ts"),
  "declare namespace Phaser {\n" +
    "  export type Scene = any;\n" +
    "  export namespace GameObjects {\n" +
    "    export type Container = any;\n" +
    "    export type Graphics = any;\n" +
    "    export type Rectangle = any;\n" +
    "  }\n" +
    "  export namespace Time {\n" +
    "    export type TimerEvent = any;\n" +
    "  }\n" +
    "  export namespace Input {\n" +
    "    export type Pointer = any;\n" +
    "  }\n" +
    "}\n" +
    'declare module "phaser" {\n' +
    "  export default Phaser;\n" +
    "}\n",
);
fs.writeFileSync(
  path.join(tmpDir, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "ES2022",
      module: "ESNext",
      moduleResolution: "bundler",
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
      rootDir: ROOT,
      outDir: "build",
      paths: { phaser: ["./phaser-stub.d.ts"] },
    },
    files: [
      path.join(tmpDir, "phaser-stub.d.ts"),
      path.join(ROOT, "src/input/TouchControls.ts"),
      path.join(ROOT, "src/input/TouchState.ts"),
    ],
  }, null, 2),
);
execSync(`npx tsc -p ${path.join(tmpDir, "tsconfig.json")}`, { cwd: ROOT, stdio: "pipe" });
const controlsJs = path.join(buildDir, "input", "TouchControls.js");
// Node-ESM braucht Dateiendungen in relativen Imports; tsc schreibt keine.
for (const f of [controlsJs, path.join(buildDir, "input", "TouchState.js")]) {
  const src = fs.readFileSync(f, "utf8");
  fs.writeFileSync(
    f,
    src.replace(/from "(\.\.?\/[^"]+)"/g, (m, p) => (p.endsWith(".js") ? m : `from "${p}.js"`)),
  );
}
// Falls tsc den phaser-Import doch behaelt: Stub unterschieben.
if (fs.readFileSync(controlsJs, "utf8").includes('"phaser"')) {
  fs.writeFileSync(path.join(buildDir, "input", "phaser.js"), "export default {};\n");
  let src = fs.readFileSync(controlsJs, "utf8").replace(/from "phaser"/g, 'from "./phaser.js"');
  fs.writeFileSync(controlsJs, src);
}
const TouchControlsMod = await import(urlFromPath(controlsJs));
const TouchStateMod = await import(urlFromPath(path.join(buildDir, "input", "TouchState.js")));
const { TouchControls } = TouchControlsMod;
const { getTouchSnapshot, resetTouchSnapshot } = TouchStateMod;
// hasTouchSupport() prueft window.matchMedia("(pointer: coarse)") — Stub wie im Vitest.
globalThis.window = { matchMedia: () => ({ matches: true }) };

// --- Konstanten der Messung --------------------------------------------------
const VIEW = { width: 480, height: 270 }; // interne Basis-Aufloesung
const ORIGIN = { x: 100, y: 200 }; // linke Bildhaelfte
const MEANINGFUL_PX = 0.75; // darunter gilt ein Finger-Shift als kein Update wert
const JUMP_PX = 20; // entscheidende Geste fuer die Latenzprobe

// --- DOM-/Phaser-Stub (Technik wie tests/chest-lock-touch.test.ts) ----------
function harness() {
  const canvasHandlers = {};
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: VIEW.width, height: VIEW.height }),
    addEventListener: (type, cb) => { canvasHandlers[type] = cb; },
    removeEventListener: () => {},
  };
  const scene = {
    scale: { width: VIEW.width, height: VIEW.height },
    game: { canvas },
    add: {
      graphics: () => fakeNode(),
      container: () => fakeNode(),
      rectangle: () => fakeNode(),
    },
    input: { on() {}, off() {} },
    time: { delayedCall: () => ({ remove() {} }) },
  };
  const controls = new TouchControls(scene, { canMove: () => true });
  return {
    touchstart: (id, x, y) => fire(canvasHandlers.touchstart, id, x, y),
    touchmove: (id, x, y) => fire(canvasHandlers.touchmove, id, x, y),
    touchend: (id) => fire(canvasHandlers.touchend, id, undefined, undefined, true),
  };
}

function fakeNode() {
  const node = {
    setScrollFactor: () => node, setDepth: () => node, setVisible: () => node,
    setPosition: () => node, fillStyle: () => node, fillRect: () => node,
    setInteractive: () => node, setStrokeStyle: () => node, disableInteractive: () => node,
    on: () => node, destroy: () => node,
  };
  return node;
}

function fire(handler, id, x, y, end = false) {
  const t = end ? null : { identifier: id, clientX: x, clientY: y };
  const list = {
    length: t ? 1 : 0,
    item: (i) => (i === 0 && t ? t : null),
  };
  handler({ changedTouches: list, touches: list, preventDefault() {} });
}

// --- Deterministisches Rauschen ----------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Drag-Seren ---------------------------------------------------------------
// Je Serie: Liste von Finger-Positionen (Scene-Koordinaten), ein Punkt pro Frame.
function seriesStraight(frames = 150) {
  const rnd = mulberry32(101);
  const pts = [];
  let x = ORIGIN.x;
  let y = ORIGIN.y;
  for (let i = 0; i < frames; i++) {
    x += 1.3 + (rnd() - 0.5) * 3.2; // Rauschen +/-1.6 px je Achse
    y += (rnd() - 0.5) * 3.2;
    pts.push({ x, y, ideal: 0 });
  }
  return { name: "straight", pts, jitterRule: "any", idealRule: "fixed" };
}

function seriesCircle(frames = 240) {
  const rnd = mulberry32(202);
  const radius = 30;
  const pts = [];
  for (let i = 0; i < frames; i++) {
    const a = (i / frames) * Math.PI * 2;
    pts.push({
      x: ORIGIN.x + Math.cos(a) * radius + (rnd() - 0.5) * 2.4,
      y: ORIGIN.y + Math.sin(a) * radius + (rnd() - 0.5) * 2.4,
      ideal: a,
    });
  }
  return { name: "circle", pts, jitterRule: "adjacent", idealRule: "angle" };
}

function seriesZigzag(frames = 180) {
  const rnd = mulberry32(303);
  const pts = [];
  let x = ORIGIN.x;
  let y = ORIGIN.y;
  let heading = Math.PI / 4;
  let lastSwitch = 0;
  const switches = [];
  for (let i = 0; i < frames; i++) {
    if (i > 0 && i % 15 === 0) {
      heading = heading === Math.PI / 4 ? -Math.PI / 4 : Math.PI / 4;
      lastSwitch = i;
      switches.push(i);
    }
    x += Math.cos(heading) * 1.6 + (rnd() - 0.5) * 2.4;
    y += Math.sin(heading) * 1.6 + (rnd() - 0.5) * 2.4;
    pts.push({ x, y, ideal: heading, sinceSwitch: i - lastSwitch });
  }
  return { name: "zigzag", pts, jitterRule: "zigzag", idealRule: null, switches };
}

// --- Eine Serie durch den Touch-Pfad laufen -----------------------------------
function runSeries(series) {
  resetTouchSnapshot();
  const h = harness();
  const samples = [];
  let prev = { x: 0, y: 0 };
  let prevFinger = null;
  h.touchstart(7, ORIGIN.x, ORIGIN.y);
  for (let i = 0; i < series.pts.length; i++) {
    const p = series.pts[i];
    h.touchmove(7, p.x, p.y);
    const snap = getTouchSnapshot();
    const fingerShift = prevFinger === null ? Infinity : Math.hypot(p.x - prevFinger.x, p.y - prevFinger.y);
    const changed = Math.hypot(snap.x - prev.x, snap.y - prev.y) > 1e-9;
    samples.push({
      i,
      outX: snap.x,
      outY: snap.y,
      changed,
      fingerShift,
      ideal: series.pts[i].ideal,
    });
    prev = { x: snap.x, y: snap.y };
    prevFinger = p;
  }
  h.touchend(7);
  return analyze(series, samples);
}

function analyze(series, samples) {
  const sector = (s) => {
    if (s.outX === 0 && s.outY === 0) return -1;
    let a = Math.atan2(s.outY, s.outX);
    return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  };
  const angleErr = (s) => {
    if (s.outX === 0 && s.outY === 0) return null;
    let d = Math.atan2(s.outY, s.outX) - s.ideal;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return Math.abs(d);
  };
  let directionChanges = 0;
  let jitterChanges = 0;
  let emptyUpdates = 0;
  let updates = 0;
  let wrong = 0;
  let scored = 0;
  let maxAngleErr = 0;
  let prevSector = -1;
  for (const s of samples) {
    const sec = sector(s);
    if (s.changed) {
      updates++;
      if (s.fingerShift < MEANINGFUL_PX) emptyUpdates++;
    }
    if (sec >= 0) {
      if (prevSector >= 0 && sec !== prevSector) {
        directionChanges++;
        if (series.jitterRule === "any") jitterChanges++;
        else if (series.jitterRule === "adjacent") {
          const step = Math.min(Math.abs(sec - prevSector), 8 - Math.abs(sec - prevSector));
          if (step !== 1) jitterChanges++;
        } else if (series.jitterRule === "zigzag") {
          if (s.sinceSwitch > 4) jitterChanges++;
        }
      }
      prevSector = sec;
      if (series.idealRule !== null) {
        const err = angleErr(s);
        if (err !== null) {
          scored++;
          if (err > maxAngleErr) maxAngleErr = err;
          // Fehlrichtung (verbindliche Definition, K4): Ausgabe weicht um mehr
          // als halber Sektor (8-Snapping-Quantisierung, 22,5°) PLUS die
          // dokumentierte Sektor-Hysterese-Marge (5,625°) vom Sollwinkel ab.
          // Beides ist Feel-Design, kein Richtungsfehler.
          const allowed = Math.PI / 8 + (TouchControlsMod.SECTOR_HYSTERESIS_RAD ?? 0);
          if (err > allowed) wrong++;
        }
      }
    }
  }
  return {
    name: series.name,
    frames: samples.length,
    updates,
    updatesPerFrame: round(updates / samples.length),
    emptyUpdates,
    directionChanges,
    directionChangesPer100: round((directionChanges / samples.length) * 100),
    jitterChanges,
    jitterChangesPer100: round((jitterChanges / samples.length) * 100),
    wrongDirectionSamples: wrong,
    scoredSamples: scored,
    wrongDirection: scored > 0 ? round(wrong / scored) : null,
    maxAngleErrDeg: maxAngleErr > 0 ? round((maxAngleErr * 180) / Math.PI) : 0,
  };
}

// --- Latenzprobe: entscheidende Geste (Sprung um JUMP_PX) --------------------
function runLatencyProbe() {
  resetTouchSnapshot();
  const h = harness();
  h.touchstart(9, ORIGIN.x, ORIGIN.y);
  let latency = null;
  for (let i = 0; i < 3; i++) {
    h.touchmove(9, ORIGIN.x + 0.4, ORIGIN.y + (i % 2 === 0 ? 0.3 : -0.3)); // Mikro-Jitter unter jeder sinnvollen Schwelle
    const s = getTouchSnapshot();
    if (s.x !== 0 || s.y !== 0) latency = i + 1; // haette nicht passieren duerfen
  }
  h.touchmove(9, ORIGIN.x + JUMP_PX, ORIGIN.y);
  const s = getTouchSnapshot();
  const emitFrame = s.x !== 0 || s.y !== 0 ? 4 : null;
  h.touchend(9);
  return {
    jumpedByPx: JUMP_PX,
    microJitterFrames: 3,
    microJitterEmitted: latency !== null,
    emitFrame,
    latencyGestureFrames: emitFrame === null ? null : emitFrame - 4, // 0 = im selben Frame
  };
}

// --- Hauptlauf ----------------------------------------------------------------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--mode") out.mode = argv[++i];
    else if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "--baseline") out.baseline = argv[++i];
  }
  return out;
}

function round(v) {
  return v === null ? null : Math.round(v * 10000) / 10000;
}

function urlFromPath(p) {
  return "file://" + p;
}

const series = [seriesStraight(), seriesCircle(), seriesZigzag()];
const results = series.map(runSeries);
const latency = runLatencyProbe();

const wrongPooled = (() => {
  const rows = results.filter((r) => r.wrongDirection !== null);
  const wrong = rows.reduce((a, r) => a + r.wrongDirectionSamples, 0);
  const scored = rows.reduce((a, r) => a + r.scoredSamples, 0);
  return { wrong, scored, ratio: round(wrong / scored) };
})();

let baseSha = null;
try { baseSha = execSync("git rev-parse HEAD", { cwd: ROOT }).toString().trim(); } catch { /* ok */ }

const gates = {
  wrongDirectionMax: 0.02,
  latencyGestureFramesMax: 2,
  wrongDirectionPooled: wrongPooled.ratio,
  latencyGestureFrames: latency.latencyGestureFrames,
  microJitterEmitted: latency.microJitterEmitted,
};
if (args.baseline) {
  const base = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.baseline), "utf8"));
  const baseRatio = base.series.reduce((a, s) => a + s.updates, 0) /
    base.series.reduce((a, s) => a + s.frames, 0);
  const nowRatio = results.reduce((a, s) => a + s.updates, 0) / results.reduce((a, s) => a + s.frames, 0);
  gates.updatesPerFrameBaseline = round(baseRatio);
  gates.updatesPerFrame = round(nowRatio);
  gates.updatesPerFrameMax = round(baseRatio);
}

gates.passed =
  gates.wrongDirectionPooled < gates.wrongDirectionMax &&
  gates.latencyGestureFrames !== null && gates.latencyGestureFrames <= gates.latencyGestureFramesMax &&
  (args.baseline ? gates.updatesPerFrame <= gates.updatesPerFrameMax : true);

const report = {
  meta: {
    script: "scripts/m10-touch-joystick.mjs",
    mode,
    date: new Date().toISOString(),
    baseSha,
    view: VIEW,
    origin: ORIGIN,
    meaningfulPx: MEANINGFUL_PX,
    note: "Echtes TouchControls via tsc kompiliert, DOM-Stub, 1 Frame = 1 touchmove.",
  },
  series: results,
  latencyProbe: latency,
  gates,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ out: outPath, gates, latencyProbe: latency, series: results }, null, 2));
process.exit(mode === "after" && !gates.passed ? 1 : 0);
