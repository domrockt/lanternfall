#!/usr/bin/env node
// Lane m10-title-bestwert-spacing: Misst den vertikalen Freiraum zwischen der
// Bestwerte-Zeile (KAEL-Zeile) und dem oberen Rahmen der Knopfreihe
// (START/OPTIONEN/CREDITS) auf dem Title-Screen — Muster:
// scripts/m10-menu-contrast.mjs, aber nur der Posten-6-Hebel dieser Lane.
//
// Ziel (art-director, Posten 6): >= 4 interne px Puffer, 0 Overlap, in beiden
// Abnahme-Formaten (640x360@1 und 780x360@3).
//
// Belege (JSON + PNG) gehen nach ~/games/.evidence/m10-title-bestwert-spacing/,
// NICHT ins Repo. Läuft OHNE flock (keine FPS-Messung).
//   node scripts/m10-title-spacing.mjs --tag=before
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const TAG = (() => {
  const m = /--tag=(\w+)/.exec(process.argv.join(" "));
  return m ? m[1] : "before";
})();

const OUT_DIR = "/home/ai/games/.evidence/m10-title-bestwert-spacing";

const PROFILES = [
  { name: "640x360@1", viewport: { width: 640, height: 360 }, dpr: 1 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
];

// Scan-Code im Page-Kontext: Text-Rechtecke (PixelText-Glyphen) + ui_frame-
// NineSlice-Rahmen (Knopfreihe). Identische Geometrie-Extraktion wie
// m10-menu-contrast.mjs (lfTextRect/lfFrameRects).
const SCAN_SRC = `
  function lfTextRect(text) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of text.list) {
      if (!g || !g.texture) continue;
      if (!/^glyph_/.test(String(g.texture.key))) continue;
      const w = g.getWorldTransformMatrix();
      const p = w.transformPoint(0, 0);
      // 5x7 = GLYPH_W/GLYPH_H aus src/gfx/font.ts (Glyph-Sprite-Masse).
      const gw = 5 * (g.scaleX ?? 1), gh = 7 * (g.scaleY ?? 1);
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + gw); y1 = Math.max(y1, p.y + gh);
    }
    if (x0 === Infinity) return null;
    return { x0, y0, x1, y1 };
  }

  /** ui_frame-NineSlices (Menue-Knoepfe) als Rahmen-Rechtecke. */
  function lfFrameRects(scene) {
    const out = [];
    const visit = (obj, parentVisible) => {
      if (obj == null) return;
      if (Array.isArray(obj)) { for (const c of obj) visit(c, parentVisible); return; }
      const visible = parentVisible && obj.visible !== false;
      if (obj.list) { for (const c of obj.list) visit(c, visible); return; }
      if (!visible || obj.alpha < 0.05) return;
      if (String(obj.texture?.key ?? "") !== "ui_frame" || obj.type !== "NineSlice") return;
      const p = obj.getWorldTransformMatrix().transformPoint(0, 0);
      const dw = obj.displayWidth, dh = obj.displayHeight;
      const x0 = p.x - obj.originX * dw, y0 = p.y - obj.originY * dh;
      out.push({ kind: "frame", x0, y0, x1: x0 + dw, y1: y0 + dh });
    };
    visit(scene.children, true);
    return out;
  }

  window.__lfTitleSpacingScan = function () {
    const game = window.__game;
    const scene = game.scene.getScene("title");
    const result = {
      renderer: null,
      gameSize: { w: game.scale.width, h: game.scale.height },
      texts: {},
      frames: [],
      gap: null,
    };
    const gl = game.renderer?.gl ?? null;
    if (gl) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      result.renderer = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? null) : null;
    }
    if (!scene) { result.error = "title szene fehlt"; return result; }

    // Sichtbare PixelText-Container einsammeln.
    const texts = [];
    const visit = (obj, parentVisible) => {
      if (obj == null) return;
      if (Array.isArray(obj)) { for (const c of obj) visit(c, parentVisible); return; }
      const visible = parentVisible && obj.visible !== false;
      if (obj.list) {
        const isText = visible && typeof obj.valueText === "string" && obj.valueText.length > 0
          && obj.list.some((c) => c && c.texture && /^glyph_/.test(String(c.texture.key)));
        if (isText) texts.push(obj);
        for (const c of obj.list) visit(c, visible);
      }
    };
    visit(scene.children, true);

    for (const t of texts) {
      const r = lfTextRect(t);
      if (!r) continue;
      result.texts[String(t.valueText).slice(0, 24)] = {
        rect: [Math.round(r.x0), Math.round(r.y0), Math.round(r.x1), Math.round(r.y1)],
      };
    }
    result.frames = lfFrameRects(scene)
      .map((f) => ({ label: null, x0: Math.round(f.x0), y0: Math.round(f.y0), x1: Math.round(f.x1), y1: Math.round(f.y1) }));

    // Kernmass: KAEL-Zeile (unterste Bestwerte-Zeile) vs. oberster ui_frame-
    // Rahmen UNTERHALB der Zeile (= oberer Rahmen der Knopfreihe).
    const kaelKey = Object.keys(result.texts).find((k) => k.startsWith("KAEL"));
    if (kaelKey) {
      const kael = result.texts[kaelKey].rect;
      const below = result.frames.filter((f) => f.y0 > kael[1] && f.x0 < kael[2] && f.x1 > kael[0]);
      if (below.length) {
        const top = below.reduce((a, b) => (b.y0 < a.y0 ? b : a));
        const gap = top.y0 - kael[3];
        result.gap = {
          kaelLine: kaelKey,
          kaelRect: kael,
          frameTop: { y0: top.y0, x0: top.x0, x1: top.x1 },
          gapPx: gap,
          overlapPx: Math.max(0, -gap),
          pass4px: gap >= 4,
        };
      }
    }
    return result;
  };
`;

async function main() {
  ensureBuild();
  mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch();
  const report = { tag: TAG, date: new Date().toISOString(), profiles: [] };

  for (const profile of PROFILES) {
    const context = await browser.newContext({
      viewport: profile.viewport,
      deviceScaleFactor: profile.dpr,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    await page.addInitScript(() => {
      if (localStorage.getItem("m6-seeded") === "1") return;
      localStorage.setItem("lanternfall-meta-v1", JSON.stringify({
        mira: { time: 754, kills: 456, level: 12, victories: 0, runs: 2 },
        kael: { time: 512, kills: 301, level: 9, victories: 1, runs: 3 },
      }));
      localStorage.removeItem("lanternfall-options-v1");
      localStorage.setItem("m6-seeded", "1");
    });

    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    await waitForScene(page, "title");
    await page.waitForTimeout(500);

    const scan = await page.evaluate(`(() => { ${SCAN_SRC}; return window.__lfTitleSpacingScan(); })()`);
    const shotPath = `${OUT_DIR}/m10-title-spacing-${TAG}-${profile.name.replace(/[@.]/g, "")}.png`;
    await page.screenshot({ path: shotPath });
    console.log(`[${profile.name}] gap=`, JSON.stringify(scan.gap), `errors=${errors.length}`);
    report.profiles.push({ profile: profile.name, jsErrors: errors, shot: shotPath, ...scan });
    await context.close();
  }

  await browser.close();
  const jsonPath = `${OUT_DIR}/m10-title-spacing-${TAG}.json`;
  writeFileSync(jsonPath, JSON.stringify(report, null, 1));
  const verdict = report.profiles.every((p) => p.gap && p.gap.pass4px);
  console.log(`JSON: ${jsonPath}  pass4px=${verdict}`);
  process.exitCode = verdict ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exit(2); });
