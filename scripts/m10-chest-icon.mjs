#!/usr/bin/env node
// m10-chest-icon-crisp: Truhen-Icon im offenen Panel (menu-art-crisp Befund F2).
// Misst den fraktionalen Scale des chest_closed-Icons (Mixelklasse wie
// title_background F1) bei 640x360@2 und 780x360@3, Renderer-String-Pflicht (iGPU),
// und schneidet 4x-nearest-Zoom-Crops um das Icon als Beleg.
// Start: node scripts/m10-chest-icon.mjs before   (bzw. after)
// Kein flock: Screenshot/JSON-Messung, keine FPS-/Echtzeitmessung.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const TAG = String(process.argv[2] ?? "before");

const PROFILES = [
  { name: "640x360@2", viewport: { width: 640, height: 360 }, dpr: 2 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
];

// Panel-Anker (m10-chest-panel-ui), nur zur Einordung der Icon-Umgebung.
const CHEST_PANEL_BAND_H = 270;
const CHEST_ICON_Y = 92;
const CHEST_ICON_TEX = 16;
const CHEST_FRAME_W = 452;
const CHEST_FRAME_H = 244;
const CHEST_FRAME_CY = 140;
const CHEST_HINT_Y = 122;

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

let report;
try {
  const errors = [];
  const formats = [];
  for (const fmt of PROFILES) {
    const context = await browser.newContext({
      viewport: fmt.viewport,
      deviceScaleFactor: fmt.dpr,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.name}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.name}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);

    // Truhen-Panel oeffnen (wie m10-chest-layout.mjs).
    await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      window.__lf.god(true);
      run.teleport(1000, 1000);
      run.chests.clear();
      run.debugTriggerEvent("chest");
    });
    await page.waitForTimeout(1100);

    // Screenshot-Pixel pro logischem Spielpixel (Game-Render aufpringen).
    const info = await page.evaluate(() => {
      const game = window.__game;
      const ui = game.scene.getScene("ui");
      const s = ui.chestSprite;
      const gl = game.renderer?.gl ?? null;
      const dbg = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
      return {
        renderer: dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? null) : null,
        view: {
          internalWidth: game.scale.width,
          internalHeight: game.scale.height,
          canvasCssWidth: game.canvas.getBoundingClientRect().width,
          canvasCssHeight: game.canvas.getBoundingClientRect().height,
          dpr: window.devicePixelRatio || 1,
          roundPixels: Boolean(game.config.roundPixels),
        },
        icon: s
          ? {
              visible: s.visible,
              texKey: String(s.texture.key),
              texW: s.frame.width,
              texH: s.frame.height,
              scaleX: s.scaleX,
              scaleY: s.scaleY,
              x: s.x,
              y: s.y,
              originX: s.originX,
              originY: s.originY,
              displayWidth: s.displayWidth,
              displayHeight: s.displayHeight,
            }
          : null,
      };
    });
    const panelOpen = info.icon && info.icon.visible;
    const pxPerGame = info.view.canvasCssWidth / info.view.internalWidth * info.view.dpr; // Screenshot-px pro Spielpixel

    const panel = `shots/m10-chest-icon-${TAG}-${fmt.name.replace(/[^0-9a-z]/gi, "")}-panel.png`;
    await page.screenshot({ path: panel });

    // 4x-nearest-Zoom-Crop um die Icon-Mitte (Ordnungsgrosse: halbes Ankerfeld + Marge).
    const oy = Math.round((info.view.internalHeight - CHEST_PANEL_BAND_H) / 2);
    const cx = info.view.internalWidth / 2;
    const iconCy = CHEST_ICON_Y + oy;
    const half = 28; // Spielpixel je Seite -> 56x56-Fenster
    const crop = execFileSync("convert", [
      panel,
      "-crop",
      `${Math.round(2 * half * pxPerGame)}x${Math.round(2 * half * pxPerGame)}+${Math.round((cx - half) * pxPerGame)}+${Math.round((iconCy - half) * pxPerGame)}`,
      "+repage",
      "-filter", "point",
      "-resize", "400%",
      `shots/m10-chest-icon-${TAG}-${fmt.name.replace(/[^0-9a-z]/gi, "")}-icon4x.png`,
    ], { stdio: "pipe" });

    // Kennzahlen: Scale ganzzahlig? Geraetepixel je Texel ganzzahlig? Zentriert? Im Panel?
    const icon = info.icon ?? {};
    const texW = icon.texW ?? CHEST_ICON_TEX;
    const scale = icon.scaleX ?? NaN;
    const devicePxPerTexel = scale * pxPerGame;
    const frameHalf = { w: Math.min(CHEST_FRAME_W, info.view.internalWidth - 24) / 2, h: CHEST_FRAME_H / 2 };
    const frameCy = CHEST_FRAME_CY + oy;
    const drawHalf = (texW * scale) / 2;
    const checks = {
      panelOpen: Boolean(panelOpen),
      scale: scale,
      scaleIsInteger: Number.isInteger(scale),
      scaleIsPositiveInteger: Number.isInteger(scale) && scale >= 1,
      devicePxPerTexel,
      devicePxPerTexelIsInteger: Number.isInteger(Math.round(devicePxPerTexel * 1e6) / 1e6) && Math.abs(devicePxPerTexel - Math.round(devicePxPerTexel)) < 1e-6,
      scaleXEqualsScaleY: icon.scaleX === icon.scaleY,
      centerX: icon.x ?? null,
      expectedCenterX: cx,
      centeredX: icon.x === Math.round(cx),
      centerY: icon.y ?? null,
      expectedCenterY: iconCy,
      centeredY: icon.y === iconCy,
      drawTop: iconCy - drawHalf,
      drawBottom: iconCy + drawHalf,
      frameTop: frameCy - frameHalf.h,
      frameBottom: frameCy + frameHalf.h,
      hintTop: CHEST_HINT_Y + oy,
      iconClearOfHintTop: iconCy + drawHalf <= CHEST_HINT_Y + oy,
      noClipping: iconCy - drawHalf >= frameCy - frameHalf.h + 2 && iconCy + drawHalf <= frameCy + frameHalf.h - 2,
      screenshotPanel: panel,
      screenshotIcon4x: `shots/m10-chest-icon-${TAG}-${fmt.name.replace(/[^0-9a-z]/gi, "")}-icon4x.png`,
      cropBytes: crop.length,
    };
    checks.pass = checks.panelOpen && checks.scaleIsPositiveInteger && checks.devicePxPerTexelIsInteger
      && checks.scaleXEqualsScaleY && checks.centeredX && checks.centeredY && checks.noClipping
      && checks.iconClearOfHintTop && info.renderer != null;
    formats.push({ profile: fmt.name, ...info, pxPerGame, checks });
    await context.close();
  }

  const passed = formats.every((f) => f.checks.pass) && errors.length === 0;
  report = {
    schema: "m10-chest-icon/v1",
    tag: TAG,
    generatedAt: new Date().toISOString(),
    formats,
    verdict: {
      rendererStringPresent: formats.every((f) => f.renderer != null),
      integerScaleEverywhere: formats.every((f) => f.checks.scaleIsPositiveInteger),
      integerDevicePxPerTexel: formats.every((f) => f.checks.devicePxPerTexelIsInteger),
      centeredAndUnclipped: formats.every((f) => f.checks.centeredX && f.checks.centeredY && f.checks.noClipping),
      jsErrors: errors.length,
      passed,
    },
    errors,
  };
  writeFileSync(`shots/m10-chest-icon-${TAG}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    tag: TAG,
    passed,
    formats: formats.map((f) => ({
      profile: f.profile,
      renderer: f.renderer,
      scale: f.checks.scale,
      devicePxPerTexel: f.checks.devicePxPerTexel,
      centerX: f.checks.centerX,
      centerY: f.checks.centerY,
      noClipping: f.checks.noClipping,
    })),
    errors,
  }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
if (!report || !report.verdict.passed) process.exit(1);
