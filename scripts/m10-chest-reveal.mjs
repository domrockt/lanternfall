#!/usr/bin/env node
// M10 chest-reveal lane, K1: Vorher-Beleg des Truhen-Moments.
//
// Rendert in beiden Zielt-Viewports (640x360 und 780x360@3):
//   1. Truhen-Moment am Boden (Glanz, Welt-Icon)
//   2. Öffnungs-Panel in der Roll-/Reveal-Phase (Mitte ~1.0 s, gesetzt ~1.8 s)
// und misst pixelgenau die Bounds der Panel-Elemente (Titel, Untertitel,
// Truhen-Icon, Lichtstrahl, Slots). Überlappungen (Fläche > 0) werden in
// shots/m10-chest-reveal-before.json dokumentiert, Screenshots nach
// shots/m10-chest-reveal-before-*.png sowie als Montage -before.png.
//
// Lauf (kein flock — Screenshot/Messung, kein FPS-/Echtzeit-Messlauf):
//   timeout 300 node scripts/m10-chest-reveal.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const FORMATS = [
  { label: "640x360", cssW: 640, cssH: 360, dpr: 2 },  // 16:9-Referenz
  { label: "780x360@3", cssW: 780, cssH: 360, dpr: 3 }, // 19.5:9, DPR 3
];

// Sammelt Bounds aller Kinder des Truhen-Panels (+ Welt-Truhe) im Browser.
const COLLECT = () => {
  const ui = window.__game.scene.getScene("ui");
  const group = ui.children.getByName("chest-group");
  if (!group || !group.visible) return { panel: null };
  const panel = group.list.map((ch) => {
    const b = ch.getBounds();
    return {
      name: ch.name || null,
      type: ch.type,
      texture: ch.texture && ch.texture.key ? String(ch.texture.key) : null,
      x: Math.round(b.x * 10) / 10,
      y: Math.round(b.y * 10) / 10,
      width: Math.round(b.width * 10) / 10,
      height: Math.round(b.height * 10) / 10,
    };
  });
  return { panel };
};

/** Paarweises Schnittflächen-Audit über ausgewählte Panel-Elemente. */
function overlapsOf(items) {
  const named = items
    .map((it, i) => ({ ...it, id: it.name || `${it.type}:${it.texture ?? ""}#${i}` }))
    // Rectangle-Hintergründe/Dim/Rahmen füllen das Panel — nur Inhalts-Elemente prüfen.
    .filter((it) => it.type === "Container" || (it.texture && !it.texture.startsWith("ui_") && it.texture !== "__DEFAULT"));
  const out = [];
  for (let a = 0; a < named.length; a++) {
    for (let b = a + 1; b < named.length; b++) {
      const A = named[a];
      const B = named[b];
      const ix = Math.max(0, Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x));
      const iy = Math.max(0, Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y));
      if (ix > 0 && iy > 0) {
        out.push({ a: A.id, b: B.id, area: Math.round(ix * iy * 10) / 10 });
      }
    }
  }
  return out;
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const errors = [];
const formats = [];
try {
  for (const fmt of FORMATS) {
    const context = await browser.newContext({
      viewport: { width: fmt.cssW, height: fmt.cssH },
      deviceScaleFactor: fmt.dpr,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.label}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.setTimeScale(1);
      const run = window.__game.scene.getScene("run");
      run.teleport(1000, 1000);
      run.chests.spawn(1030, 1000);
    });
    await page.waitForTimeout(400); // Glanz-Puls + Bob einschwingen
    await page.screenshot({ path: `shots/m10-chest-reveal-before-${fmt.label}-ground.png` });

    const ground = await page.evaluate(COLLECT);

    // Truhe öffnen (debugOpenChest: nächste Truhe in 200 px).
    await page.evaluate(() => window.__lf.openChest());
    await page.waitForTimeout(1000); // Mitte der Sequenz: Münzen + Slot-Rollen
    await page.screenshot({ path: `shots/m10-chest-reveal-before-${fmt.label}-open-mid.png` });
    const mid = await page.evaluate(COLLECT);

    await page.waitForTimeout(800); // ~1.8 s: erster Slot gesetzt, Panel noch sichtbar
    await page.screenshot({ path: `shots/m10-chest-reveal-before-${fmt.label}-open-settled.png` });
    const settled = await page.evaluate(COLLECT);

    const renderer = await page.evaluate(() => window.__lf.rendererInfo());

    formats.push({
      label: fmt.label,
      viewport: { width: fmt.cssW, height: fmt.cssH, dpr: fmt.dpr },
      renderer: renderer.renderer ?? null,
      groundBounds: ground,
      openMidBounds: mid,
      openSettledBounds: settled,
      overlaps: {
        openMid: overlapsOf(mid.panel ?? []),
        openSettled: overlapsOf(settled.panel ?? []),
      },
    });
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const report = {
  lane: "m10-chest-reveal",
  card: "K1 Vorher-Beleg",
  capturedAt: new Date().toISOString(),
  seed: 101,
  note: "Vorher-Stand: Truhen-Panel klein/nüchtern; Untertitel (y=99) sitzt direkt über dem Truhen-Icon (Bounds-Messung unten), Lichtstrahl und Münzen minimal. Rewards/Timings unangetastet.",
  jsErrors: errors,
  formats,
};
writeFileSync("shots/m10-chest-reveal-before.json", `${JSON.stringify(report, null, 2)}\n`);

// Montage (nur Dokumentation): Ground + Open-Mid je Viewport nebeneinander.
const tiles = formats.flatMap((f) => [
  `shots/m10-chest-reveal-before-${f.label}-ground.png`,
  `shots/m10-chest-reveal-before-${f.label}-open-mid.png`,
]);
execFileSync("montage", [...tiles, "-tile", "2x2", "-geometry", "+6+6", "-background", "#0a0a12",
  "shots/m10-chest-reveal-before.png"], { stdio: "inherit" });

console.log(JSON.stringify({ jsErrors: errors, overlaps: formats.map((f) => f.overlaps) }, null, 2));
if (errors.length > 0) process.exit(1);
