#!/usr/bin/env node
// M10-Menu-Art-Crisp: Misst Menü-/HUD-Art-Qualität auf 5 Screens in 2 View-Profilen.
//
// Pro Screen (Titel, Options, CharSelect, Pause, Results):
//  1. Screenshot (Viewport) → shots/m10-menu-art-crisp-<tag>-<profil>-<screen>.png
//  2. Objekt-Scan der Menü-Szenen: fraktionale Skalen (Mixel-Verdacht > 1x bzw.
//     Nicht-ganzzahlig), Subpixel-Kanten (weich, roundPixels), Off-Palette-Pixel
//     und binäres Alpha aus den ECHTEN Textur-Pixeln.
//  3. Icon-Kontrast: Icon-Sprites kurz verbergen, Backdrop per snapshotArea lesen,
//     WCAG-Kontrast Icon-Pixel vs. Backdrop (Ziel >= 3:1).
//  → shots/m10-menu-art-crisp-<tag>-<profil>.json (inkl. Renderer-String)
//
// Profile:
//   640x360@2  : Viewport 1280x720, dpr 1  → intern 640x360, n=2
//   780x360@3  : Viewport 780x360,  dpr 3  → intern 780x360, n=3
//
// Läuft OHNE flock (keine FPS-Messung, Screenshots + Pixelstatistik).
//   node scripts/m10-menu-art-crisp.mjs --tag=before
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));

const PROFILES = [
  { name: "640x360@2", viewport: { width: 1280, height: 720 }, dpr: 1 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
];

// Scan-Code, im Page-Kontext per eval ausgefuehrt. Palette exakt aus src/palette.ts.
const SCAN_SRC = `
  const PAL32 = [0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xff8a6b,0x16261e,0x22382a,0x3d5a38,0x6f9b58];
  // Weiche Licht-/Overlay-Texturen (Gradient/Alpha) sind von Mixel-/Palette-Regel
  // ausgenommen (GAME.md: additive Licht-/Vignette-Überblendungen).
  const SOFT_KEYS = new Set(["light_radius", "vignette"]);
  const ADD = 1; // Phaser.BlendModes.ADD

  function lfRendererName(game) {
    const gl = game.renderer?.gl ?? null;
    if (!gl) return null;
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? null) : null;
  }

  function lfViewInfo(game) {
    return {
      internalWidth: game.scale.width,
      internalHeight: game.scale.height,
      canvasCssWidth: game.canvas.getBoundingClientRect().width,
      canvasCssHeight: game.canvas.getBoundingClientRect().height,
      dpr: window.devicePixelRatio || 1,
      roundPixels: Boolean(game.config.roundPixels),
    };
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
            type: obj.type,
            texKey: String(obj.texture.key),
            frameName: String(obj.frame.name ?? ""),
            frameW: obj.frame.width,
            frameH: obj.frame.height,
            cutX: obj.frame.cutX,
            cutY: obj.frame.cutY,
            scaleX: obj.scaleX,
            scaleY: obj.scaleY,
            x: obj.x,
            y: obj.y,
            originX: obj.originX,
            originY: obj.originY,
            alpha: obj.alpha,
            blendMode: obj.blendMode,
            visible: obj.visible,
            depth: obj.depth,
          });
        }
      }
    };
    visit(scene.children.list);
    return out;
  }

  function lfFramePixels(game, texKey, frameName) {
    const tex = game.textures.get(texKey);
    if (!tex || !tex.frames) return null;
    const f = tex.frames[frameName] ?? tex.frames.__BASE;
    if (!f) return null;
    const direct = tex.source?.[0]?.image ?? tex.source?.[0]?.canvas;
    const ok = (s) => s instanceof HTMLCanvasElement || s instanceof HTMLImageElement
      || s instanceof ImageBitmap || s instanceof OffscreenCanvas;
    let src = ok(direct) ? direct : null;
    if (!src) {
      // Baked-Atlas-Key: teilt die GL-Textur einer baked_page_*-Seite; Pixel
      // aus deren Canvas lesen (gleiche glTexture-Identitaet).
      const glTex = tex.source?.[0]?.glTexture;
      for (const pageKey of game.textures.getTextureKeys()) {
        if (!String(pageKey).startsWith("baked_page_")) continue;
        const pageTex = game.textures.get(pageKey);
        if (pageTex.source?.[0]?.glTexture && pageTex.source[0].glTexture === glTex && ok(pageTex.source[0].image)) {
          src = pageTex.source[0].image;
          break;
        }
      }
    }
    if (!src) return { error: "quelle-nicht-lesbar:" + (direct?.constructor?.name ?? "null") };
    const c = document.createElement("canvas");
    c.width = f.width; c.height = f.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    try {
      ctx.drawImage(src, f.cutX, f.cutY, f.width, f.height, 0, 0, f.width, f.height);
    } catch (e) {
      return { error: "drawImage-fehler:" + (e?.message ?? e) };
    }
    return ctx.getImageData(0, 0, f.width, f.height);
  }

  /** Palette-/Alpha-Check eines Objekt-Frames: exakte Palette, binäres Alpha. */
  function lfTextureCheck(game, o) {
    const img = lfFramePixels(game, o.texKey, o.frameName);
    if (!img || img.error) return { error: img?.error ?? "frame-lesen-fehlgeschlagen" };
    let opaque = 0, offPalette = 0, softAlpha = 0;
    const offSamples = {};
    for (let i = 0; i < img.data.length; i += 4) {
      const a = img.data[i + 3];
      if (a < 2) continue;
      if (a > 1 && a < 254) softAlpha++;
      if (a < 128) continue;
      opaque++;
      const hex = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
      if (!PAL32.includes(hex)) {
        offPalette++;
        const key = "#" + hex.toString(16).padStart(6, "0");
        offSamples[key] = (offSamples[key] ?? 0) + 1;
      }
    }
    return {
      w: img.width, h: img.height, opaque,
      offPalette, offSamples: Object.entries(offSamples).sort((a, b) => b[1] - a[1]).slice(0, 4),
      softAlpha,
    };
  }

  function lfMixelFindings(objects) {
    const mixel = [], subpixel = [];
    for (const o of objects) {
      if (!o.visible || o.alpha < 0.05) continue;
      if (SOFT_KEYS.has(o.texKey) || o.blendMode === ADD) continue;
      const sx = Math.abs(o.scaleX - Math.round(o.scaleX));
      const sy = Math.abs(o.scaleY - Math.round(o.scaleY));
      if (sx > 1e-3 || sy > 1e-3) {
        mixel.push({
          texKey: o.texKey, frameName: o.frameName, type: o.type,
          scaleX: Math.round(o.scaleX * 1000) / 1000, scaleY: Math.round(o.scaleY * 1000) / 1000,
          frameW: o.frameW, frameH: o.frameH,
          displayW: Math.round(o.frameW * o.scaleX * 100) / 100,
          displayH: Math.round(o.frameH * o.scaleY * 100) / 100,
          blendMode: o.blendMode,
        });
        continue;
      }
      const dw = o.frameW * Math.round(o.scaleX);
      const dh = o.frameH * Math.round(o.scaleY);
      const left = o.x - o.originX * dw;
      const top = o.y - o.originY * dh;
      if (Math.abs(left - Math.round(left)) > 1e-3 || Math.abs(top - Math.round(top)) > 1e-3) {
        subpixel.push({
          texKey: o.texKey, frameName: o.frameName, type: o.type,
          x: o.x, y: o.y, originX: o.originX, originY: o.originY,
          displayW: dw, displayH: dh,
          left: Math.round(left * 100) / 100, top: Math.round(top * 100) / 100,
          note: "roundPixels rundet beim Rendern; Position nur pruefen, wenn im Bild sichtbar",
        });
      }
    }
    return { mixel, subpixel };
  }

  function lfLum(r, g, b) {
    const f = (v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function lfRatio(a, b) {
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** Icon-Kontrast: Icons verbergen, Backdrop via snapshotArea lesen, Kontrast je Icon. */
  async function lfIconContrast(game, sceneName) {
    const scene = game.scene.getScene(sceneName);
    if (!scene) return { error: "szene fehlt" };
    const objects = lfCollectObjects(scene).filter(
      (o) => o.visible && o.alpha > 0.05
        && (/icon/i.test(o.texKey) || /icon/i.test(o.frameName))
        && o.frameW <= 24 && o.frameH <= 24,
    );
    if (!objects.length) return { count: 0, icons: [] };
    const hidden = [];
    // Alle Anzeigeobjekte der Szene flach sammeln (Container rekursiv).
    const flat = [];
    const walk = (list) => { for (const c of list) { if (c) { flat.push(c); if (c.list) walk(c.list); } } };
    walk(scene.children.list);
    for (const o of objects) {
      const sprite = flat.find((c) => c.texture && c.frame
        && String(c.texture.key) === o.texKey && String(c.frame.name ?? "") === o.frameName
        && c.frame.width === o.frameW && Math.abs(c.x - o.x) < 0.01 && Math.abs(c.y - o.y) < 0.01);
      if (!sprite) continue;
      sprite.setVisible(false);
      hidden.push({ sprite, o });
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const icons = [];
    for (const { sprite, o } of hidden) {
      const dw = o.frameW * Math.round(o.scaleX);
      const dh = o.frameH * Math.round(o.scaleY);
      const left = Math.round(o.x - o.originX * dw);
      const top = Math.round(o.y - o.originY * dh);
      const R = 4;
      const sx = Math.max(0, left - R), sy = Math.max(0, top - R);
      const sw = Math.min(game.scale.width - sx, dw + 2 * R), sh = Math.min(game.scale.height - sy, dh + 2 * R);
      const img = await new Promise((resolve) => game.renderer.snapshotArea(sx, sy, sw, sh, resolve));
      const c = document.createElement("canvas");
      c.width = sw; c.height = sh;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const back = ctx.getImageData(0, 0, sw, sh);
      // Backdrop = Ring ausserhalb des Icon-Kerns; Median-Luminanz je Kanal.
      const ring = [];
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const inCore = x >= left - sx && x < left - sx + dw && y >= top - sy && y < top - sy + dh;
          if (inCore) continue;
          const i = (y * sw + x) * 4;
          ring.push([back.data[i], back.data[i + 1], back.data[i + 2]]);
        }
      }
      if (!ring.length) continue;
      const med = (idx) => {
        const arr = ring.map((p) => p[idx]).sort((a, b) => a - b);
        return arr[Math.floor(arr.length / 2)];
      };
      const bl = lfLum(med(0), med(1), med(2));
      const pix = lfFramePixels(game, o.texKey, o.frameName);
      if (!pix || pix.error) { icons.push({ texKey: o.texKey, frameName: o.frameName, error: pix?.error ?? "pix-lesen-fehlgeschlagen" }); continue; }
      // Konturfarbe (ink 0) ist bewusst 1 px dunkel und darf nicht als
      // Kontrast-Massstab dienen; Zaehlung ueber den Icon-Koerper.
      const pixels = [];
      for (let i = 0; i < pix.data.length; i += 4) {
        if (pix.data[i + 3] < 128) continue;
        const hex = (pix.data[i] << 16) | (pix.data[i + 1] << 8) | pix.data[i + 2];
        const l = lfLum(pix.data[i], pix.data[i + 1], pix.data[i + 2]);
        pixels.push({ hex, l });
      }
      const body = pixels.filter((p) => p.hex !== 0x06070c);
      let minRatio = Infinity, worst = null, maxRatio = 0;
      for (const p of body) {
        const r = lfRatio(p.l, bl);
        if (r < minRatio) { minRatio = r; worst = "#" + p.hex.toString(16).padStart(6, "0"); }
        if (r > maxRatio) maxRatio = r;
      }
      // Koerper-Kontrast: Median-Luminanz-Pixel des Icons gegen Backdrop.
      const sorted = [...body].sort((a, b) => a.l - b.l);
      const medPix = sorted[Math.floor(sorted.length / 2)];
      const bodyRatio = medPix ? lfRatio(medPix.l, bl) : 0;
      icons.push({
        texKey: o.texKey, frameName: o.frameName,
        x: left, y: top, w: dw, h: dh,
        backdrop: "#" + [med(0), med(1), med(2)].map((v) => v.toString(16).padStart(2, "0")).join(""),
        bodyContrast: Math.round(bodyRatio * 100) / 100,
        minContrast: Math.round(minRatio * 100) / 100,
        maxContrast: Math.round(maxRatio * 100) / 100,
        darkestIconColor: worst,
        pass: bodyRatio >= 3,
      });
    }
    for (const { sprite } of hidden) sprite.setVisible(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { count: objects.length, icons };
  }

  /** Texturen-Check ueber alle einzigartigen Frames der gesammelten Objekte. */
  function lfTextureStats(game, objects) {
    const seen = new Map();
    const stats = [];
    for (const o of objects) {
      if (!o.visible || o.alpha < 0.05) continue;
      if (SOFT_KEYS.has(o.texKey)) continue; // Licht/Vignette: per GAME.md ausgenommen
      const k = o.texKey + "|" + o.frameName;
      if (seen.has(k)) { seen.get(k).uses++; continue; }
      const entry = { texKey: o.texKey, frameName: o.frameName, uses: 1 };
      seen.set(k, entry);
      const chk = lfTextureCheck(game, o);
      if (chk.error) { stats.push({ ...entry, error: chk.error }); continue; }
      if (chk.offPalette > 0 || chk.softAlpha > 0) {
        stats.push({ ...entry, ...chk });
      }
    }
    for (const o of objects) {
      if (o.texKey === "__MISSING" && o.visible) {
        stats.push({ texKey: o.texKey, frameName: o.frameName, missingObject: { type: o.type, x: o.x, y: o.y, depth: o.depth, alpha: o.alpha } });
      }
    }
    return stats;
  }
`;

const SCREENS = [
  { id: "title", scenes: ["title"], nav: "laut Boot" },
  { id: "options", scenes: ["title"], nav: "Taste O im Titel" },
  { id: "charselect", scenes: ["charselect"], nav: "Enter im Titel" },
  { id: "pause", scenes: ["ui"], nav: "Run starten + ESC" },
  { id: "results", scenes: ["results"], nav: "skipTo(1700) → Sieg" },
];

async function scanScreen(page, sceneNames) {
  return page.evaluate(({ src, sceneNames }) => {
    // eslint-disable-next-line no-eval
    eval(src);
    const game = window.__game;
    const result = { scenes: {}, view: lfViewInfo(game), renderer: lfRendererName(game) };
    for (const name of sceneNames) {
      const scene = game.scene.getScene(name);
      if (!scene) { result.scenes[name] = { error: "szene fehlt" }; continue; }
      const objs = lfCollectObjects(scene);
      const { mixel, subpixel } = lfMixelFindings(objs);
      result.scenes[name] = {
        objectCount: objs.length,
        mixel,
        subpixel,
        textureIssues: lfTextureStats(game, objs),
      };
    }
    return result;
  }, { src: SCAN_SRC, sceneNames });
}

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});

const runProfile = async (profile) => {
  const page = await browser.newPage({
    viewport: profile.viewport,
    deviceScaleFactor: profile.dpr,
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const out = { profile: profile.name, viewport: profile.viewport, dpr: profile.dpr, screens: {} };
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 15000 });
    await waitForScene(page, "title");
    await page.waitForTimeout(2000); // Warmup (Atlas) abwarten

    // 1) Titel
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/m10-menu-art-crisp-${TAG}-${profile.name}-title.png` });
    out.screens.title = await scanScreen(page, ["title"]);

    // 2) Options-Overlay im Titel (Taste O)
    await page.keyboard.press("o");
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/m10-menu-art-crisp-${TAG}-${profile.name}-options.png` });
    out.screens.options = await scanScreen(page, ["title"]);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // 3) CharSelect
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await page.waitForTimeout(500);
    await page.screenshot({ path: `shots/m10-menu-art-crisp-${TAG}-${profile.name}-charselect.png` });
    out.screens.charselect = await scanScreen(page, ["charselect"]);

    // 4) Pause (Run starten, ESC) — vorher 6 Waffen + 6 Powerups setzen,
    //    damit der Build alle 12 Icon-Klassen zeigt.
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      for (const w of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(w, 1);
      for (const p of ["boots", "tome", "heart", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(p, 1);
      window.__lf.god(true);
    });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => window.__lf.state().paused === true, { timeout: 5000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `shots/m10-menu-art-crisp-${TAG}-${profile.name}-pause.png` });
    out.screens.pause = await scanScreen(page, ["ui"]);
    out.screens.pause.iconContrast = await page.evaluate(async ({ src, sceneName }) => {
      // eslint-disable-next-line no-eval
      eval(src);
      return lfIconContrast(window.__game, sceneName);
    }, { src: SCAN_SRC, sceneName: "ui" });
    await page.screenshot({ path: `shots/m10-menu-art-crisp-${TAG}-${profile.name}-pause-after-icons.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);

    // 5) Results: skipTo nahe Morgendämmerung, dann 30x + AutoPlay (Endboss
    //    fällt, Dawn-Seqenz 3,2 s → Results). Ohne Zeitraffer waeren es 100 s.
    await page.evaluate(() => {
      window.__lf.skipTo(1700);
      window.__lf.setTimeScale(30);
      window.__lf.autoPlay(true);
    });
    await waitForScene(page, "results", 90000);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `shots/m10-menu-art-crisp-${TAG}-${profile.name}-results.png` });
    out.screens.results = await scanScreen(page, ["results"]);
    out.screens.results.iconContrast = await page.evaluate(async ({ src, sceneName }) => {
      // eslint-disable-next-line no-eval
      eval(src);
      return lfIconContrast(window.__game, sceneName);
    }, { src: SCAN_SRC, sceneName: "results" });

    // Icon-Kontrast auch fuer Title-Optionen/CharSelect (Moegliche Icons: keine,
    // dann leer) — fuer Vollstaendigkeit ueber alle 5 Screens laufen lassen.
    out.iconContrast = {};
    for (const [screen, sceneName] of [["title", "title"], ["options", "title"], ["charselect", "charselect"]]) {
      out.iconContrast[screen] = await page.evaluate(async ({ src, sceneName }) => {
        // eslint-disable-next-line no-eval
        eval(src);
        return lfIconContrast(window.__game, sceneName);
      }, { src: SCAN_SRC, sceneName });
    }
    // Results ist aktuell im results-Scene; Pause in ui. Konsolidieren:
    out.iconContrast.pause = out.screens.pause.iconContrast;
    out.iconContrast.results = out.screens.results.iconContrast;
    delete out.screens.pause.iconContrast;
    delete out.screens.results.iconContrast;

    out.view = out.screens.title?.view ?? null;
    out.renderer = out.screens.title?.renderer ?? null;
    // Totals je Screen
    out.totals = {};
    for (const [screen, data] of Object.entries(out.screens)) {
      let mixel = 0, subpixel = 0, offPalette = 0, softAlpha = 0, iconFail = 0, icons = 0;
      for (const sceneData of Object.values(data.scenes ?? {})) {
        mixel += sceneData.mixel?.length ?? 0;
        subpixel += sceneData.subpixel?.length ?? 0;
        for (const t of sceneData.textureIssues ?? []) {
          offPalette += t.offPalette ?? 0;
          softAlpha += t.softAlpha ?? 0;
        }
      }
      const ic = out.iconContrast[screen];
      if (ic?.icons) {
        icons = ic.icons.length;
        iconFail = ic.icons.filter((i) => !i.pass).length;
      }
      out.totals[screen] = { mixel, subpixel, offPalette, softAlpha, icons, iconContrastFails: iconFail };
    }
    out.jsErrors = errors;
  } finally {
    await page.close();
  }
  return out;
};

const results = {};
let totalErrors = [];
try {
  for (const profile of PROFILES) {
    results[profile.name] = await runProfile(profile);
    totalErrors.push(...results[profile.name].jsErrors);
    console.log(`[scan] Profil ${profile.name}:`, JSON.stringify(results[profile.name].totals));
  }
} finally {
  await browser.close();
  server.stop();
}

const OUT_JSON = `shots/m10-menu-art-crisp-${TAG}.json`;
writeFileSync(OUT_JSON, JSON.stringify(results, null, 2) + "\n");
const summary = {
  tag: TAG,
  output: OUT_JSON,
  profiles: Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, { view: v.view, renderer: v.renderer, totals: v.totals }]),
  ),
  jsErrors: totalErrors,
};
console.log(JSON.stringify(summary, null, 2));
const failed = totalErrors.length > 0;
process.exit(failed ? 1 : 0);
