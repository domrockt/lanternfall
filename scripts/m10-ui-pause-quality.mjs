#!/usr/bin/env node
// Lane m10-ui-pause-quality K1/K4: Pause-Screen-Scan (Kontrast + Icon-Frame-Overlaps
// + Zeilen-Puffer) in den Viewports 640x360@2 und 780x360@3.
//
// Basis: scripts/m10-menu-quality.mjs (Lane m10-menu-quality-55), eingedampft auf
// den Pause-Screen und erweitert um:
//   - textRects: ALLE Text-Rechtecke (nicht nur Fails) -> Zeilen-Puffer messbar
//   - iconRects: alle Icon-Rechtecke -> Frame-Overlaps und Puffer zu Nachbarspalten
//
// Ausgabe: ~/games/.evidence/m10-ui-pause-quality/m10-ui-pause-quality-<tag>-scan.json
// (+ PNG-Shots daneben). Belege gehoeren NICHT ins Repo (Dom, 27.11.).
// Läuft OHNE flock (keine FPS-Messung): Screenshots + Pixelstatistik.
//   node scripts/m10-ui-pause-quality.mjs --tag=before
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const TAG = (() => {
  const m = /--tag=(\w+)/.exec(process.argv.join(" "));
  return m ? m[1] : "before";
})();

const OUT_DIR = `${homedir()}/games/.evidence/m10-ui-pause-quality`;

const PROFILES = [
  { name: "640x360@2", viewport: { width: 1280, height: 720 }, dpr: 1 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
];

// Scan-Code im Page-Kontext. Palette exakt aus src/palette.ts.
const SCAN_SRC = `
  const PAL32 = [0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xff8a6b,0x16261e,0x22382a,0x3d5a38,0x6f9b58];
  const ADD = 1;

  function lfRendererName(game) {
    const gl = game.renderer?.gl ?? null;
    if (!gl) return null;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? null) : null;
  }

  /** Alle sichtbaren Texturobjekte einer Szene (Container rekursiv). */
  function lfCollectObjects(scene) {
    const out = [];
    const visit = (list) => {
      for (const obj of list) {
        if (!obj) continue;
        if (obj.list) visit(obj.list);
        if (obj.texture && obj.frame) {
          out.push({
            type: obj.type, texKey: String(obj.texture.key), frameName: String(obj.frame.name ?? ""),
            frameW: obj.frame.width, frameH: obj.frame.height,
            scaleX: obj.scaleX, scaleY: obj.scaleY, x: obj.x, y: obj.y,
            originX: obj.originX, originY: obj.originY,
            alpha: obj.alpha, blendMode: obj.blendMode, visible: obj.visible,
          });
        }
      }
    };
    visit(scene.children.list);
    return out;
  }

  /** Sichtbare PixelText-Container (Glyph-Sprites mit Key glyph_<color>_<code>). */
  function lfCollectTexts(scene) {
    const out = [];
    const visit = (obj, parentVisible) => {
      if (obj == null) return;
      if (Array.isArray(obj)) { for (const c of obj) visit(c, parentVisible); return; }
      const visible = parentVisible && obj.visible !== false;
      if (obj.list) {
        const isText = visible && typeof obj.valueText === "string" && obj.valueText.length > 0
          && obj.list.some((c) => c && c.texture && /^glyph_/.test(String(c.texture.key)));
        if (isText) out.push(obj);
        for (const c of obj.list) visit(c, visible);
      }
    };
    visit(scene.children, true);
    return out;
  }

  function lfTextRect(text) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, colorIdx = -1;
    for (const g of text.list) {
      if (!g || !g.texture) continue;
      const key = String(g.texture.key);
      const m = /^glyph_(\\d+)_/.exec(key);
      if (m && colorIdx < 0) colorIdx = Number(m[1]);
      if (!/^glyph_/.test(key)) continue;
      const p = g.getWorldTransformMatrix().transformPoint(0, 0);
      // 5x7 = GLYPH_W/GLYPH_H aus src/gfx/font.ts.
      const gw = 5 * (g.scaleX ?? 1), gh = 7 * (g.scaleY ?? 1);
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + gw); y1 = Math.max(y1, p.y + gh);
    }
    if (x0 === Infinity) return null;
    return { x0, y0, x1, y1, colorIdx };
  }

  function lfIconRects(objects) {
    const out = [];
    for (const o of objects) {
      if (!o.visible || o.alpha < 0.05) continue;
      if (!(/icon/i.test(o.texKey) || /icon/i.test(o.frameName))) continue;
      const dw = o.frameW * o.scaleX, dh = o.frameH * o.scaleY;
      const x0 = o.x - o.originX * dw, y0 = o.y - o.originY * dh;
      out.push({ kind: "icon", texKey: o.texKey, frameName: o.frameName, x0, y0, x1: x0 + dw, y1: y0 + dh });
    }
    return out;
  }

  function lfRectLabel(r) {
    return r.kind + ":" + (r.text ?? r.frameName ?? r.texKey ?? "?");
  }

  function lfIntersect(a, b) {
    const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    return w > 0 && h > 0 ? w * h : 0;
  }

  function lfLum(r, g, b) {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function lfRatio(a, b) { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + 0.05) / (lo + 0.05); }

  function lfBackdropStats(game, rect) {
    const R = 2;
    const sx = Math.max(0, Math.floor(rect.x0 - R));
    const sy = Math.max(0, Math.floor(rect.y0 - R));
    const sw = Math.min(game.scale.width - sx, Math.ceil(rect.x1 - rect.x0 + 2 * R));
    const sh = Math.min(game.scale.height - sy, Math.ceil(rect.y1 - rect.y0 + 2 * R));
    if (sw <= 0 || sh <= 0) return null;
    return new Promise((resolve) => {
      game.renderer.snapshotArea(sx, sy, sw, sh, (img) => {
        const c = document.createElement("canvas");
        c.width = sw; c.height = sh;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, sw, sh).data;
        const lums = [];
        for (let i = 0; i < data.length; i += 4) lums.push(lfLum(data[i], data[i + 1], data[i + 2]));
        lums.sort((a, b) => a - b);
        resolve({ median: lums[Math.floor(lums.length / 2)], min: lums[0], max: lums[lums.length - 1] });
      });
    });
  }

  window.__lfPauseQualityScan = async function (sceneNames) {
    const game = window.__game;
    const result = { renderer: lfRendererName(game), scenes: {}, jsErrors: window.__lfScanErrors ?? [] };
    for (const sceneName of sceneNames) {
      const scene = game.scene.getScene(sceneName);
      if (!scene) { result.scenes[sceneName] = { error: "szene fehlt" }; continue; }

      const objects = lfCollectObjects(scene);

      // Text-Kontrast: Text verstecken, Backdrop lesen, wieder einblenden.
      const texts = lfCollectTexts(scene);
      const textEntries = [];
      for (const t of texts) {
        const rect = lfTextRect(t);
        if (!rect) continue;
        t.setVisible(false);
        const backdrop = await lfBackdropStats(game, rect);
        t.setVisible(true);
        if (!backdrop) continue;
        const hex = rect.colorIdx >= 0 ? PAL32[rect.colorIdx] : 0;
        const tl = lfLum((hex >> 16) & 255, (hex >> 8) & 255, hex & 255);
        const medianRatio = lfRatio(tl, backdrop.median);
        textEntries.push({
          text: String(t.valueText).slice(0, 40),
          colorIdx: rect.colorIdx,
          rect: [Math.round(rect.x0), Math.round(rect.y0), Math.round(rect.x1), Math.round(rect.y1)],
          medianRatio: Math.round(medianRatio * 100) / 100,
        });
      }
      const textContrastFails = textEntries.filter((t) => t.medianRatio < 4.5);

      const iconRects = lfIconRects(objects);
      const rects = [
        ...textEntries.map((t) => ({ kind: "text", text: t.text, x0: t.rect[0], y0: t.rect[1], x1: t.rect[2], y1: t.rect[3] })),
        ...iconRects,
      ];
      const overlaps = [];
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const area = lfIntersect(rects[i], rects[j]);
          if (area > 0) {
            overlaps.push({ a: lfRectLabel(rects[i]), b: lfRectLabel(rects[j]), overlapPx: Math.round(area * 100) / 100 });
          }
        }
      }

      result.scenes[sceneName] = {
        textCount: textEntries.length,
        // ALLE Texte mit Rect -> Zeilen-Puffer zwischen Name- und LV-Spalte messbar.
        textRects: textEntries,
        textContrastFails,
        textContrastFailCount: textContrastFails.length,
        iconRects,
        overlaps,
        overlapCount: overlaps.length,
      };
    }
    return result;
  };
`;

// --- Navigation (Muster scripts/m10-menu-quality.mjs / verify-menus.mjs) ---
const NAV_SRC = `
  const walk = (obj, parentVisible, out) => {
    if (obj == null) return;
    if (Array.isArray(obj)) { for (const c of obj) walk(c, parentVisible); return; }
    const visible = parentVisible && obj.visible !== false;
    if (obj.list) {
      for (const c of obj.list) walk(c, visible, out);
    }
    if (visible && typeof obj.valueText === "string" && obj.valueText.length > 0) {
      try {
        const p = obj.getWorldTransformMatrix().transformPoint(0, 0);
        out.push({ text: obj.valueText, cx: p.x, cy: p.y });
      } catch { /* skip */ }
    }
  };
  window.__lfMenuTargets = () => {
    const out = [];
    for (const s of window.__game.scene.scenes) {
      if (!s.scene.isActive()) continue;
      walk(s.children, true, out);
    }
    return out;
  };
`;

const pickTarget = (targets, needle) => {
  const norm = (s) => s.toLowerCase();
  const n = norm(needle);
  const hits = targets.filter((t) => norm(t.text).includes(n));
  if (!hits.length) return null;
  const exact = hits.filter((t) => norm(t.text) === n);
  const byPrefix = hits.filter((t) => norm(t.text).startsWith(n));
  const pool = exact.length ? exact : (byPrefix.length ? byPrefix : hits);
  return pool.reduce((a, b) => (b.text.length < a.text.length ? b : a));
};

async function main() {
  ensureBuild();
  mkdirSync(OUT_DIR, { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch();
  const report = { tag: TAG, date: new Date().toISOString(), lane: "m10-ui-pause-quality", profiles: [] };

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
    await page.evaluate(NAV_SRC);

    const canvasBox = () => page.locator("canvas").boundingBox();
    const view = () => page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
    const clickTarget = async (t) => {
      const box = await canvasBox();
      const v = await view();
      await page.mouse.click(box.x + (t.cx / v.w) * box.width, box.y + (t.cy / v.h) * box.height);
      await page.waitForTimeout(220);
    };
    const clickLabel = async (needle) => {
      const target = pickTarget(await page.evaluate(() => window.__lfMenuTargets()), needle);
      if (!target) throw new Error(`Klick-Ziel "${needle}" nicht gefunden`);
      await clickTarget(target);
    };

    // Pause (Run + UI-Szene, gefuellter Build wie m10-menu-quality/verify-menus:
    // Title -> CharSelect -> Held waehlen -> Start)
    await clickLabel("START");
    await waitForScene(page, "charselect");
    await page.waitForTimeout(300);
    await clickLabel("KAEL");
    await page.waitForTimeout(200);
    await clickLabel("START (ENTER)");
    await waitForScene(page, "run");
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__lf.setSuppressLevelUps(true));
    await page.evaluate(() => {
      const w = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
      for (const id of w) window.__lf.addWeapon(id, 8);
      const p = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"];
      for (let i = 0; i < p.length; i++) window.__lf.addPassive(p[i], 1 + (i % 5));
    });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const res = await page.evaluate(
      `(async () => { ${SCAN_SRC}; return await window.__lfPauseQualityScan(["run", "ui"]); })()`,
    );
    const shot = `${OUT_DIR}/m10-ui-pause-quality-${TAG}-${profile.name.replace(/[@.]/g, "")}-pause.png`;
    await page.screenshot({ path: shot });

    const ui = res.scenes.ui ?? {};
    report.profiles.push({
      profile: profile.name,
      renderer: res.renderer,
      jsErrors: errors,
      shot,
      pause: {
        textContrastFailCount: ui.textContrastFailCount ?? null,
        textContrastFails: ui.textContrastFails ?? [],
        overlapCount: ui.overlapCount ?? null,
        overlaps: ui.overlaps ?? [],
        textRects: ui.textRects ?? [],
        iconRects: ui.iconRects ?? [],
        runScene: { textContrastFailCount: res.scenes.run?.textContrastFailCount ?? null, overlapCount: res.scenes.run?.overlapCount ?? null },
      },
    });
    await context.close();
  }

  await browser.close();
  server.stop();
  const out = `${OUT_DIR}/m10-ui-pause-quality-${TAG}-scan.json`;
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`[m10-ui-pause-quality] geschrieben: ${out}`);
  for (const p of report.profiles) {
    console.log(`  Profil ${p.profile} renderer=${p.renderer} jsErrors=${p.jsErrors.length}`);
    console.log(`    pause: kontrastFails=${p.pause.textContrastFailCount} overlaps=${p.pause.overlapCount}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
