#!/usr/bin/env node
// m10-chest-arrow-texture-r2: Probe für die Textur "arrow_chest".
//
// Bedarfsmeldung m10-atlas-gutter (2026-11-28T03:05Z): ChestSystem.ts bindet den
// Truhen-Randpfeil an die Textur "arrow_chest" (makeImage(scene, 0, 0, "arrow_chest")).
// Dieses Grid ist im M6-robust-Refactor aus SPRITE_GRIDS verloren gegangen — der Pfeil
// rendert als Fehlertextur (Phaser-__MISSING).
//
// Diese Probe misst ehrlich den Runtime-Zustand:
//  - textures.exists('arrow_chest')
//  - woran das Pfeil-Image tatsächlich hängt (texture.key + frame name)
//  - ob der Randpfeil bei off-screen Truhe sichtbar ist (Position/Rotation)
// und macht je Format einen Screenshot (Truhe off-screen rechts, Pfeil am Rand).
//
// Keine FPS-/Echtzeit-Messung -> kein flock.
// Aufruf:
//   node scripts/m10-chest-arrow-texture.mjs --label before --out <pfad.json> [--shots <prefix>]
//   node scripts/m10-chest-arrow-texture.mjs --label after  --out <pfad.json> [--shots <prefix>]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const FORMATS = [
  { label: "640x360@2", cssW: 640, cssH: 360, dpr: 2 },
  { label: "780x360@3", cssW: 780, cssH: 360, dpr: 3 },
];

const args = process.argv.slice(2);
function arg(name, fallback = undefined) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
const label = arg("--label", "probe");
const outFile = arg("--out", `shots/m10-chest-arrow-texture-${label}.json`);
const shotPrefix = arg("--shots", null);

ensureBuild();
mkdirSync(dirname(outFile), { recursive: true });

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const errors = [];
const formats = [];

try {
  for (const fmt of FORMATS) {
    const context = await browser.newContext({ viewport: { width: fmt.cssW, height: fmt.cssH }, deviceScaleFactor: fmt.dpr });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.label}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(false);
      const run = window.__game.scene.getScene("run");
      run.teleport(1000, 1000);
    });
    await page.waitForTimeout(200);

    // Truhe klar off-screen rechts spawnen -> Randpfeil muss am rechten Rand
    // sichtbar sein und nach rechts (rotation ≈ 0) zeigen.
    const sample = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      run.chests.clear();
      const view = cam.worldView;
      const cx = view.centerX + view.width / 2 + 120;
      const cy = view.centerY;
      run.chests.spawn(cx, cy);
      await sleep(400); // > 20 Frames: ChestSystem.update lief, Pfeil-Layout gesetzt
      const g = window.__game;
      const arrow = run.chests["arrow"];
      return {
        exists: g.textures.exists("arrow_chest"),
        arrowTextureKey: arrow ? arrow.texture.key : null,
        arrowFrameName: arrow && arrow.frame ? arrow.frame.name : null,
        arrowVisible: arrow ? arrow.visible : null,
        arrowX: arrow ? arrow.x : null,
        arrowY: arrow ? arrow.y : null,
        arrowRotation: arrow ? arrow.rotation : null,
        canvasW: g.canvas.width,
        canvasH: g.canvas.height,
        chestX: cx,
        chestY: cy,
      };
    });

    if (shotPrefix) {
      await page.screenshot({ path: `${shotPrefix}-${fmt.label.replace(/[^0-9x]/g, "")}.png` });
      sample.screenshot = `${shotPrefix}-${fmt.label.replace(/[^0-9x]/g, "")}.png`;
    }

    sample.label = fmt.label;
    sample.dpr = fmt.dpr;
    // "ok": Textur existiert, Pfeil sichtbar und am rechten Rand (rot ≈ 0).
    const rotOk = sample.arrowRotation !== null && Math.abs(sample.arrowRotation) < 0.3;
    sample.ok = sample.exists === true && sample.arrowVisible === true && rotOk;
    formats.push(sample);
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const result = {
  probe: "m10-chest-arrow-texture-r2",
  label,
  at: new Date().toISOString(),
  formats,
  jsErrors: errors,
  ok: formats.every((f) => f.ok) && errors.length === 0,
};
writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
