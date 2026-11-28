// M10-gamepad-stick-feel, Karte K1/K4: Ist-/Nachher-Messung des Gamepad-Sticks.
//
// Synthetische Stick-Seren (Stillstand+Rauschen, Kreis, Half-Push, Sektor-Sweep)
// werden durch den ECHTEN Eingabepfad getrieben: Das Skript kompiliert
// src/input/Gamepad.ts + InputState.ts per tsc in ein Temp-Verzeichnis, stubbt
// `navigator.getGamepads()` und ruft pro Frame readNavigatorGamepad() +
// InputState.update() auf — derselbe Weg, den alle Szenen gehen
// (readSceneGamepad(this) → pad.update({ gamepad })).
//
// Metriken je Serie:
// - moveFrames        : Frames mit Bewegungsvektor != (0,0)
// - directionToggles  : Wechsel der Richtungs-Aktionen up/down/left/right
// - multiToggles      : Frames, in denen > 1 Richtung gleichzeitig wechselt
//                       (Doppel-Event-Risiko im Menue)
// - zeroFrames        : Frames mit exakt 0-Ausgabe (Stillstand-Erwartung)
// - wrongDirection    : |Ausgabewinkel - Sollwinkel| > 28.125° (halber Sektor
//                       22.5° + dokumentierte Hysterese-Marge 5.625°)
// - jitterSectors     : Sektorwechsel der Ausgabe - legitime Wechsel der Serie
//
// Fehlbewegungs-Quote (Abnahme): Anteil der Stillstand-Frames mit move-Event
// oder Richtungs-Aktion. Gate: < 5 %, und im after-Lauf 0 Events im Stillstand.
//
// Aufruf:
//   node scripts/m10-gamepad-stick.mjs --mode before --out shots/m10-gamepad-stick-before.json
//   node scripts/m10-gamepad-stick.mjs --mode after  --out shots/m10-gamepad-stick-after.json
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const mode = args.includes("--after") ? "after" : args.includes("--mode") ? args[args.indexOf("--mode") + 1] : "before";
const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const outPath = outArg ? path.resolve(ROOT, outArg) : path.join(ROOT, "shots", `m10-gamepad-stick-${mode}.json`);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "m10-gamepad-stick-"));
const buildDir = path.join(tmpDir, "build", "src");

// --- Echten Eingabe-Code kompilieren (Typ-Import phaser wird elidiert) -------
fs.writeFileSync(
  path.join(tmpDir, "phaser-stub.d.ts"),
  "declare namespace Phaser {\n" +
    "  export type Scene = any;\n" +
    "  export namespace Input {\n" +
    "    export type Gamepad = any;\n" +
    "  }\n" +
    "}\n" +
    "declare module \"phaser\" {\n" +
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
      path.join(ROOT, "src/input/Gamepad.ts"),
      path.join(ROOT, "src/input/InputState.ts"),
    ],
  }, null, 2),
);
execSync(`npx tsc -p ${path.join(tmpDir, "tsconfig.json")}`, { cwd: ROOT, stdio: "pipe" });
for (const f of ["input/Gamepad.js", "input/InputState.js", "input/TouchState.js"]) {
  const p = path.join(buildDir, f);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, "utf8");
  fs.writeFileSync(
    p,
    src.replace(/from "(\.\.?\/[^"]+)"/g, (m, s) => (s.endsWith(".js") ? m : `from "${s}.js"`)),
  );
}
const { readNavigatorGamepad, resetStickFeel } = await import(
  `file://${path.join(buildDir, "input", "Gamepad.js")}`
);
const { InputState } = await import(`file://${path.join(buildDir, "input", "InputState.js")}`);

// --- navigator-Stub ----------------------------------------------------------
// Node definiert `navigator` als Getter; defineProperty ueberschreibt sauber.
let padAxes = [0, 0];
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { getGamepads: () => [{ connected: true, axes: [...padAxes], buttons: [] }] },
});

// --- Deterministisches Rauschen (mulberry32) ---------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Summe zweier Uniforms ~ dreieckverteilt, skaliert auf sigma. */
function gauss(rnd, sigma) {
  return (rnd() + rnd() - 1) * 1.732 * sigma;
}

// --- Messrahmen --------------------------------------------------------------
const DEADZONE_ANGLE_TOL = (22.5 + 5.625) * (Math.PI / 180); // halber Sektor + Marge

function sectorOf(x, y) {
  if (Math.hypot(x, y) < 1e-9) return -1;
  let a = Math.atan2(y, x);
  if (a < 0) a += Math.PI * 2;
  return Math.floor(((a + Math.PI / 8) % (Math.PI * 2)) / (Math.PI / 4));
}

function runStream(name, frames) {
  if (typeof resetStickFeel === "function") resetStickFeel();
  const state = new InputState();
  let moveFrames = 0;
  let zeroFrames = 0;
  let wrongDirection = 0;
  let jitterSectors = 0;
  let directionToggles = 0;
  let multiToggles = 0;
  let lastSector = -1;
  let lastActions = { up: false, down: false, left: false, right: false };
  let idealSector = -1;
  for (let i = 0; i < frames.length; i++) {
    padAxes = frames[i];
    const snap = readNavigatorGamepad();
    const frame = state.update({ touch: null, keyboard: null, gamepad: snap });
    const moving = frame.move.x !== 0 || frame.move.y !== 0;
    if (moving) moveFrames++;
    if (!moving) zeroFrames++;
    const a = frame.actions;
    let toggles = 0;
    for (const k of ["up", "down", "left", "right"]) {
      if (a[k] !== lastActions[k]) toggles++;
      lastActions[k] = a[k];
    }
    directionToggles += toggles;
    if (toggles > 1) multiToggles++;
    if (moving) {
      const ang = Math.atan2(frame.move.y, frame.move.x);
      if (frames[i].idealAngle !== undefined) {
        let d = Math.abs(ang - frames[i].idealAngle);
        if (d > Math.PI) d = Math.PI * 2 - d;
        if (d > DEADZONE_ANGLE_TOL) wrongDirection++;
      }
      const s = sectorOf(frame.move.x, frame.move.y);
      if (s !== lastSector) {
        if (lastSector !== -1 && frames[i].idealAngle === undefined) jitterSectors++;
        if (idealSector !== -1 && s !== idealSector) jitterSectors++;
        lastSector = s;
      }
      if (frames[i].idealAngle !== undefined) idealSector = sectorOf(Math.cos(frames[i].idealAngle), Math.sin(frames[i].idealAngle));
    }
  }
  return {
    frames: frames.length,
    moveFrames,
    zeroFrames,
    wrongDirection,
    jitterSectors,
    directionToggles,
    multiToggles,
    moveRatio: round2(moveFrames / frames.length),
    wrongDirectionPct: round2((wrongDirection / frames.length) * 100),
  };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// --- Serien ------------------------------------------------------------------
const rnd = mulberry32(20261128);
const series = {};

// 1) Stillstand + Drift: abgenuetzter TV-Pad, Center-Drift (Betrag ~0.125)
//    + Rauschen sigma 0.05. Erwartung nach Fix: 0 move-Frames, 0 Events.
{
  const frames = [];
  for (let i = 0; i < 300; i++) {
    frames.push([0.11 + gauss(rnd, 0.05), 0.06 + gauss(rnd, 0.05)]);
  }
  const r = runStream("still", frames);
  r.fehlbewegungsQuotePct = round2((r.moveFrames / r.frames) * 100);
  r.directionEventFrames = r.frames - r.zeroFrames;
  series.still = r;
}

// 2) Kreis: Radius 0.85, 1.5°/Frame, Rauschen sigma 0.04 (240 Frames = 360°).
{
  const frames = [];
  for (let i = 0; i < 240; i++) {
    const ang = (i * 1.5 * Math.PI) / 180;
    const r0 = 0.85;
    const x = Math.cos(ang) * r0 + gauss(rnd, 0.04);
    const y = Math.sin(ang) * r0 + gauss(rnd, 0.04);
    frames.push([x, y]);
    frames[i].idealAngle = ang;
  }
  series.circle = runStream("circle", frames);
}

// 3) Kanten-Push: feste Richtung 90° (unten), Radius 0.19 straddelt die ALTE
//    0.18-Deadzone. Vorher: Dither (jede zweite Frame Bewegung/Stop, Richtungs-
//    Toggles). Nachher: liegt unter der 0.28-Engage-Kante -> sauber 0.
{
  const frames = [];
  for (let i = 0; i < 150; i++) {
    frames.push([gauss(rnd, 0.05), 0.19 + gauss(rnd, 0.05)]);
  }
  series.edge = runStream("edge", frames);
}

// 4) Push ueber der Kante: r=0.34, 90°, Rauschen sigma 0.05. Erwartung nach
//    Fix: durchgehend aktiv (Hysterese-Band haelt), 0 Zero-Frames, 0 Jitter.
{
  const frames = [];
  for (let i = 0; i < 150; i++) {
    frames.push([gauss(rnd, 0.05), 0.34 + gauss(rnd, 0.05)]);
  }
  series.push = runStream("push", frames);
}

// 4) Sektor-Sweep: Winkel 20° -> 70° langsam ueber die 45°-Grenze (Radius 0.9),
//    Rauschen sigma 0.03. Erwartung nach Fix: genau 1 Richtungs-Wechsel
//    (down bleibt, links kommt), 0 multiToggles.
{
  const frames = [];
  for (let i = 0; i < 120; i++) {
    const ang = ((20 + (i * 50) / 119) * Math.PI) / 180;
    const x = Math.cos(ang) * 0.9 + gauss(rnd, 0.03);
    const y = Math.sin(ang) * 0.9 + gauss(rnd, 0.03);
    frames.push([x, y]);
  }
  series.sweep = runStream("sweep", frames);
}

// --- Report ------------------------------------------------------------------
const report = {
  lane: "m10-gamepad-stick-feel",
  mode,
  date: new Date().toISOString(),
  path: "readNavigatorGamepad -> InputState.update (echter Szenen-Pfad)",
  streams: {
    still: { desc: "Stillstand, Drift (0.11, 0.06), Rauschen sigma 0.05, 300 Frames", ...series.still },
    circle: { desc: "Kreis r=0.85, 1.5°/Frame, Rauschen sigma 0.04, 240 Frames", ...series.circle },
    edge: { desc: "Kanten-Push r=0.19 (straddelt alte 0.18-Kante), 90°, Rauschen sigma 0.05, 150 Frames", ...series.edge },
    push: { desc: "Push über Kante r=0.34, 90°, Rauschen sigma 0.05, 150 Frames", ...series.push },
    sweep: { desc: "Winkel-Sweep 20°->70° über 45°-Sektorgrenze, r=0.9, Rauschen sigma 0.03, 120 Frames", ...series.sweep },
  },
  summary: {
    // Abnahme-Gate: Anteil Stillstand-Frames mit Fehlbewegung/Event.
    fehlmoveQuotePct: series.still.fehlbewegungsQuotePct,
    stillMoveFrames: series.still.moveFrames,
    stillDirectionEventFrames: series.still.directionEventFrames,
  },
};
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
console.log(`geschrieben: ${outPath}`);
