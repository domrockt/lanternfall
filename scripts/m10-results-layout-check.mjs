#!/usr/bin/env node
// M10-Layout-Beleg ohne PNG-Sicht: prueft die Text-Rechtecke der 12 Waffennamen
// (slotNameLines) gegen Trennlinie, Bestwert-Banner, Balken/Zahlen und den
// Szenen-Untertitel bei 640x360 und 1920x1080. Gibt die Ueberlappungszahl aus.
//
// Kein FPS-Gate, kein flock (reine Geometrie, lastunabhaengig).
// Festes Iterationslimit 3: nach 3 Laeufen mit Ueberlappung -> Exit 1 (blocked).
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const MAX_ITERATIONS = 3;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(tmpdir(), "m10-results-layout-check");
const VIEWPORTS = [
  { label: "640x360", width: 640 },
  { label: "1920x1080", width: 1920 },
];

function buildLogic() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  execFileSync("npx", [
    "tsc", join(root, "src/logic/results.ts"),
    "--outDir", outDir,
    "--module", "commonjs",
    "--target", "es2020",
    "--skipLibCheck",
    "--esModuleInterop",
    "--ignoreConfig",
  ], { cwd: root, stdio: "inherit" });
}

function intersects(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function measure(layoutResultRows, stressEntries, viewport) {
  // Szenen-Koordinaten sind 480x270; die Viewport-Breite skaliert nur. Alle
  // Rechtecke sind relativ zur Mitte, daher ist die Relation skaleninvariant.
  const layout = layoutResultRows(stressEntries(), { width: viewport.width, oy: 0 });
  // Szenen-Untertitel "NIEDERLAGE"/"SIEG" zentriert bei y 42, 7 px hoch.
  const subtitleLen = 24;
  const subtitle = {
    x: viewport.width / 2 - (subtitleLen * 6 - 1) / 2,
    y: 42, w: subtitleLen * 6 - 1, h: 7,
  };
  const named = [
    { label: "header", rect: layout.header },
    { label: "total", rect: layout.totalLabel },
    { label: "divider", rect: layout.divider },
    { label: "banner", rect: layout.banner },
    { label: "subtitle", rect: subtitle },
  ];
  for (const row of layout.rows) {
    named.push({ label: `${row.id}:icon`, rect: row.icon });
    row.nameRects.forEach((rect, i) => named.push({ label: `${row.id}:name${i}`, rect }));
    named.push({ label: `${row.id}:bar`, rect: row.barBg });
    named.push({ label: `${row.id}:value`, rect: row.valueRect });
  }
  const overlaps = [];
  for (let i = 0; i < named.length; i++) {
    for (let j = i + 1; j < named.length; j++) {
      if (intersects(named[i].rect, named[j].rect)) {
        overlaps.push(`${named[i].label}|${named[j].label}`);
      }
    }
  }
  // Panel-Unterkante (Mitte 136, Hoehe 250) darf von keinem Text/Icon beruehrt
  // werden; 3 px Luft, sonst schneidet der goldene Rahmen die Glyphen.
  const panelBottom = 261;
  const clipped = named.filter((entry) => entry.rect.y + entry.rect.h > panelBottom - 3);
  for (const entry of clipped) overlaps.push(`panelBottom|${entry.label}`);
  return {
    viewport: viewport.label,
    rows: layout.rows.length,
    maxLines: Math.max(...layout.rows.map((row) => row.nameRects.length)),
    fullNames: layout.rows.every((row) => row.lines.join("") === row.name.toUpperCase()),
    overlaps,
  };
}

buildLogic();
const require = createRequire(import.meta.url);
const logic = require(join(outDir, "logic/results.js"));

let last = null;
for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
  const results = VIEWPORTS.map((vp) => measure(logic.layoutResultRows, logic.stressEntries, vp));
  const totalOverlaps = results.reduce((sum, r) => sum + r.overlaps.length, 0);
  last = { iteration, results, totalOverlaps };
  console.log(`iteration=${iteration} totalOverlaps=${totalOverlaps}`);
  for (const r of results) {
    console.log(`  ${r.viewport}: rows=${r.rows} maxLines=${r.maxLines} fullNames=${r.fullNames} overlaps=${r.overlaps.length}${r.overlaps.length ? " " + r.overlaps.join(",") : ""}`);
  }
  if (totalOverlaps === 0) break;
}

const ok = last.totalOverlaps === 0 &&
  last.results.every((r) => r.rows === 12 && r.maxLines <= 2 && r.fullNames);
console.log(`RESULT ${ok ? "PASS" : "FAIL"} iterations=${last.iteration} overlaps=${last.totalOverlaps}`);
process.exit(ok ? 0 : 1);
