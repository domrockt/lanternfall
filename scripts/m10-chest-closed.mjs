#!/usr/bin/env node
// m10-chest-closed-crisp (K4): Abschluss der Befundklasse menu-art-crisp F2 auf
// Textur-Ebene. Misst chest_closed in beiden Abnahme-Formaten:
//   - Textur-Scan (Canvas-Erfassung der Live-Textur): 0 Off-Palette-Pixel,
//     0 nicht-binaeres Alpha (Alpha je Pixel ∈ {0,255}).
//   - Draw-Metriken: ganzzahliger Scale, ganzzahlige Geraetepixel je Texel.
//   - Screenshot + 4x-nearest-Crop des Panel-Icons; Run-Length-Analyse des
//     Icon-Inneren: 0 Run-Laengen, die keine Vielfachen der Texeleinheit sind
//     (= 0 fraktionale Skalierungsschritte / Mixel).
// Die UI-Anzeige-Seite (src/scenes/UI.ts) ist bewusst ausgespart (m10-gamepad-nav-scenes-r2);
// das Skript MISST nur, aendert nichts.
// Start: node scripts/m10-chest-closed.mjs after
// Kein flock: Screenshot/JSON-Messung, keine FPS-/Echtzeitmessung.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const TAG = String(process.argv[2] ?? "after");

const PROFILES = [
  { name: "640x360@2", viewport: { width: 640, height: 360 }, dpr: 2 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
];

// 32er-Palette (src/palette.ts) als HEX-Set — Ground Truth fuer den Textur-Scan.
const PAL_HEX = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];
const PAL_SET = new Set(PAL_HEX);

// Panel-Anker (nur zur Crop-Fenster-Einordnung, wie m10-chest-icon.mjs).
const CHEST_PANEL_BAND_H = 270;
const CHEST_ICON_Y = 92;

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
    const context = await browser.newContext({ viewport: fmt.viewport, deviceScaleFactor: fmt.dpr });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.name}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.name}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);

    // Truhen-Panel oeffnen (wie m10-chest-layout.mjs / m10-chest-icon.mjs).
    await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      window.__lf.god(true);
      run.teleport(1000, 1000);
      run.chests.clear();
      run.debugTriggerEvent("chest");
    });
    await page.waitForTimeout(1100);

    // ── Textur-Scan + Draw-Metriken (alles im Page-Kontext) ────────────────
    const info = await page.evaluate((palArr) => {
      const palSet = new Set(palArr);
      const game = window.__game;
      const run = game.scene.getScene("run");
      const ui = game.scene.getScene("ui");
      const gl = game.renderer?.gl ?? null;
      const dbg = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;

      // Live-Textur chest_closed als Canvas erfassen (1:1) und scannen.
      const tex = run.textures.get("chest_closed");
      const src = tex ? tex.getSourceImage() : null;
      let texScan = null;
      if (src && src.width > 0) {
        const c = document.createElement("canvas");
        c.width = src.width;
        c.height = src.height;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        let offPalette = 0;
        let alphaViolations = 0;
        const colors = new Set();
        let opaque = 0;
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3];
          if (a !== 0 && a !== 255) alphaViolations++;
          if (a === 0) continue;
          opaque++;
          const hex = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
          colors.add(hex);
          if (!palSet.has(hex)) offPalette++;
        }
        texScan = {
          texKey: tex.key,
          sourceW: src.width,
          sourceH: src.height,
          frameW: tex.get().width,
          frameH: tex.get().height,
          opaquePixels: opaque,
          offPalette,
          alphaViolations,
          colorsUsed: [...colors].map((h) => "#" + h.toString(16).padStart(6, "0")).sort(),
        };
      }

      const s = ui.chestSprite;
      // Welt-Truhe (gleiche Textur, Scale 1) — informativ, optional.
      let world = null;
      const sys = run.chests;
      const list = sys && typeof sys.get === "function" ? sys.get() : sys;
      const first = Array.isArray(list) ? list[0] : null;
      if (first && first.sprite) {
        world = {
          visible: first.sprite.visible,
          texKey: String(first.sprite.texture?.key ?? ""),
          frameW: first.sprite.frame?.width ?? null,
          frameH: first.sprite.frame?.height ?? null,
          scaleX: first.sprite.scaleX,
          scaleY: first.sprite.scaleY,
          x: first.sprite.x,
          y: first.sprite.y,
        };
      }

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
        texScan,
        icon: s
          ? {
              visible: s.visible,
              texKey: String(s.texture.key),
              frameW: s.frame.width,
              frameH: s.frame.height,
              scaleX: s.scaleX,
              scaleY: s.scaleY,
              x: s.x,
              y: s.y,
              displayWidth: s.displayWidth,
              displayHeight: s.displayHeight,
            }
          : null,
        world,
      };
    }, [...PAL_SET]);

    const panelOpen = Boolean(info.icon && info.icon.visible);
    const pxPerGame = (info.view.canvasCssWidth / info.view.internalWidth) * info.view.dpr;
    const icon = info.icon ?? {};
    const scale = icon.scaleX ?? NaN;
    const devicePxPerTexel = scale * pxPerGame;
    const texelPx = Math.round(devicePxPerTexel);

    // ── Screenshots: Panel + 4x-nearest-Crop des Icons ─────────────────────
    const prof = fmt.name.replace(/[^0-9a-z]/gi, "");
    const panelPng = `shots/m10-chest-closed-${TAG}-${prof}-panel.png`;
    await page.screenshot({ path: panelPng });

    // Exakter Icon-Bereich im Screenshot (Innenbereich um 1 Texel verkleinert,
    // damit Kanten-Rundung an den Fenstergrenzen keine Schein-Runlaengen erzeugt).
    let cropBytes = 0;
    let cropScan = null;
    if (panelOpen) {
      const cxGame = info.view.internalWidth / 2;
      const cyGame = icon.y;
      const halfW = icon.displayWidth / 2;
      const halfH = icon.displayHeight / 2;
      const left = Math.round((cxGame - halfW) * pxPerGame) + texelPx;
      const top = Math.round((cyGame - halfH) * pxPerGame) + texelPx;
      const w = Math.round(icon.displayWidth * pxPerGame) - 2 * texelPx;
      const h = Math.round(icon.displayHeight * pxPerGame) - 2 * texelPx;
      const cropPng = `shots/m10-chest-closed-${TAG}-${prof}-icon4x.png`;
      execFileSync("convert", [
        panelPng, "-crop", `${w}x${h}+${left}+${top}`, "+repage",
        "-filter", "point", "-resize", "400%", cropPng,
      ], { stdio: "pipe" });
      cropBytes = execFileSync("stat", ["-c", "%s", cropPng], { encoding: "utf8" }).trim().length;

      // Run-Length-Analyse: je Zeile Laeufen identischer Farben; jede Laenge
      // muss Vielfaches der Texeleinheit (in Crop-px: texelPx*4) sein.
      const unit = texelPx * 4;
      const txt = execFileSync("convert", [cropPng, "txt:-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
      const rows = new Map();
      for (const line of txt.split("\n")) {
        const m = line.match(/^(\d+),(\d+):\s*\(([^)]*)\)\s*#([0-9A-Fa-f]{6,8})/);
        if (!m) continue;
        const x = Number(m[1]);
        const y = Number(m[2]);
        const hex = m[4].slice(0, 6).toUpperCase();
        if (!rows.has(y)) rows.set(y, []);
        rows.get(y).push({ x, hex });
      }
      let runs = 0;
      let nonMultiple = 0;
      const colors = new Set();
      for (const px of rows.values()) {
        px.sort((a, b) => a.x - b.x);
        let start = 0;
        for (let i = 1; i <= px.length; i++) {
          if (i === px.length || px[i].hex !== px[start].hex) {
            const len = i - start;
            runs++;
            colors.add(px[start].hex);
            if (len % unit !== 0) nonMultiple++;
            start = i;
          }
        }
      }
      cropScan = { unit, runs, nonMultipleRuns: nonMultiple, colorsUsed: [...colors].sort() };
    }

    const nearInt = (v) => Math.abs(v - Math.round(v)) < 1e-6;
    const checks = {
      rendererPresent: info.renderer != null,
      panelOpen,
      // Textur-Ebene (Kern dieser Lane):
      texCaptured: Boolean(info.texScan),
      texOffPalette: info.texScan ? info.texScan.offPalette : -1,
      texAlphaViolations: info.texScan ? info.texScan.alphaViolations : -1,
      // Draw-Ebene (Anzeige bleibt wie sie ist, wird aber belegt):
      drawScale: scale,
      drawScaleIsInteger: Number.isInteger(scale) && scale >= 1,
      scaleXEqualsScaleY: icon.scaleX === icon.scaleY,
      devicePxPerTexel,
      devicePxPerTexelIsInteger: nearInt(devicePxPerTexel),
      centeredX: icon.x === info.view.internalWidth / 2,
      // Screenshot-Ebene (4x-nearest, Icon-Inneres):
      cropRuns: cropScan ? cropScan.runs : 0,
      cropNonMultipleRuns: cropScan ? cropScan.nonMultipleRuns : -1,
      screenshots: {
        panel: panelPng,
        icon4x: cropScan ? `shots/m10-chest-closed-${TAG}-${prof}-icon4x.png` : null,
      },
      worldChest: info.world,
    };
    checks.pass = checks.rendererPresent && checks.panelOpen && checks.texCaptured
      && checks.texOffPalette === 0 && checks.texAlphaViolations === 0
      && checks.drawScaleIsInteger && checks.scaleXEqualsScaleY
      && checks.devicePxPerTexelIsInteger && checks.centeredX
      && checks.cropNonMultipleRuns === 0;
    formats.push({ profile: fmt.name, pxPerGame, ...info, checks });
    await context.close();
  }

  const passed = formats.every((f) => f.checks.pass) && errors.length === 0;
  report = {
    schema: "m10-chest-closed-crisp/v1",
    tag: TAG,
    generatedAt: new Date().toISOString(),
    scope: "Textur-Ebene chest_closed (menu-art-crisp F2); UI.ts bewusst unveraendert",
    formats,
    verdict: {
      rendererStringPresent: formats.every((f) => f.checks.rendererPresent),
      integerScaleEverywhere: formats.every((f) => f.checks.drawScaleIsInteger),
      integerDevicePxPerTexel: formats.every((f) => f.checks.devicePxPerTexelIsInteger),
      zeroOffPalettePixels: formats.every((f) => f.checks.texOffPalette === 0),
      zeroNonBinaryAlpha: formats.every((f) => f.checks.texAlphaViolations === 0),
      zeroFractionalScaleSteps: formats.every((f) => f.checks.cropNonMultipleRuns === 0),
      jsErrors: errors.length,
      passed,
    },
    errors,
  };
  writeFileSync(`shots/m10-chest-closed-${TAG}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ tag: TAG, verdict: report.verdict, formats: formats.map((f) => ({
    profile: f.profile, renderer: f.renderer, scale: f.checks.drawScale,
    devicePxPerTexel: f.checks.devicePxPerTexel, texOffPalette: f.checks.texOffPalette,
    texAlphaViolations: f.checks.texAlphaViolations, cropNonMultipleRuns: f.checks.cropNonMultipleRuns,
  })) }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
if (!report || !report.verdict.passed) process.exit(1);
