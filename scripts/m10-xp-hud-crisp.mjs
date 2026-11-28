#!/usr/bin/env node
// M10-xp-hud-crisp: HUD-Pixel-Scan der Run-Szene (Befundklasse menu-art-crisp F1).
//
// Misst in 3 Formaten (640x360@2, 780x360@3, 1080p = 640x360@3) an einem
// GEFRORENEN Frame (Run-Scene paused, gerendert wird weiter; __rbOverride=1
// fuer vollen Renderbuffer) die sichtbaren UI-Szene-Objekte im HUD-Band
// (top < 64 Spielpixel) und findet:
//   - fractional-scale : Texturierte Objekte (Image/Sprite/NineSlice) mit
//                        nicht-ganzzahliger Skalierung (Mixel-Verdacht)
//   - fractional-edge  : Objekte mit nicht-ganzzahliger Display-Breite/-Hoehe
//                        bzw. nicht-ganzzahliger linker/oberer Kante
//   - translucent      : Info (kein Befund): Alpha 0.02..0.98 im HUD-Band
//                        (bewusste Dim-Overlays nach GAME.md-Ausnahme)
// Belege: shots/m10-xp-hud-<tag>.json + HUD-Band-Snapshot je Format
//         (shots/m10-xp-hud-<tag>-<profil>-hud.png, +4x nearest via convert).
//
// Läuft OHNE flock (keine FPS-Messung, Geometrie-/Pixel-Messung).
//   node scripts/m10-xp-hud-crisp.mjs --tag=before
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const HUD_BAND_TOP = 64; // Spielpixel: XP-Leiste, Timer/LV/KILL, HP, Icon-Reihe, Evo-Hinweis, Boss-Leiste

const PROFILES = [
  { name: "640x360@2", viewport: { width: 1280, height: 720 }, dpr: 1 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
  { name: "1080p", viewport: { width: 1920, height: 1080 }, dpr: 1 },
];

// Scan-Code im Page-Kontext: sammelt sichtbare UI-Objekte MIT Eltern-Transform
// (Container rekursiv, wie m10-hud-anchor) und prueft Ganzzahligkeit.
const SCAN_SRC = `
  function lfViewInfo(game) {
    return {
      internalWidth: game.scale.width,
      internalHeight: game.scale.height,
      canvasCssWidth: game.canvas.getBoundingClientRect().width,
      canvasCssHeight: game.canvas.getBoundingClientRect().height,
      deviceWidth: window.innerWidth * (window.devicePixelRatio || 1),
      dpr: window.devicePixelRatio || 1,
      roundPixels: Boolean(game.config.roundPixels),
      renderBuffer: { w: game.canvas.width, h: game.canvas.height },
      rbScale: (window.__rbDbg && window.__rbDbg.scale) ?? null,
    };
  }

  function lfCollect(game, sceneName) {
    const scene = game.scene.getScene(sceneName);
    if (!scene) return null;
    const out = [];
    const frac = (v) => Math.abs(v - Math.round(v));
    (function walk(list, px, py, psx, psy, path, visible) {
      for (const o of list || []) {
        if (!o) continue;
        const name = o.name ? (path ? path + "/" + o.name : o.name) : path;
        const selfVisible = visible && o.visible !== false;
        if (o.list) { walk(o.list, px + psx * o.x, py + psy * o.y, psx * (o.scaleX ?? 1), psy * (o.scaleY ?? 1), name, selfVisible); continue; }
        if (!selfVisible || (o.alpha ?? 1) < 0.02) continue;
        const w = (o.displayWidth ?? o.width ?? 0) * psx;
        const h = (o.displayHeight ?? o.height ?? 0) * psy;
        if (w <= 0 || h <= 0) continue;
        const ox = o.originX ?? 0.5, oy = o.originY ?? 0.5;
        const left = px + psx * o.x - ox * w;
        const top = py + psy * o.y - oy * h;
        if (top >= ${HUD_BAND_TOP}) continue;
        const entry = {
          name: name || o.type,
          type: o.type,
          texKey: o.texture ? String(o.texture.key) : null,
          frameW: o.frame ? o.frame.width : null,
          frameH: o.frame ? o.frame.height : null,
          scaleX: Math.round((o.scaleX ?? 1) * psx * 1000) / 1000,
          scaleY: Math.round((o.scaleY ?? 1) * psy * 1000) / 1000,
          displayW: Math.round(w * 1000) / 1000,
          displayH: Math.round(h * 1000) / 1000,
          left: Math.round(left * 1000) / 1000,
          top: Math.round(top * 1000) / 1000,
          alpha: o.alpha ?? 1,
          blendMode: o.blendMode ?? 0,
        };
        if (o.texture && (o.type === "Image" || o.type === "Sprite" || o.type === "NineSlice")) {
          if (frac(entry.scaleX) > 1e-3 || frac(entry.scaleY) > 1e-3) entry.issue = "fractional-scale";
        }
        if (!entry.issue && (frac(entry.displayW) > 1e-3 || frac(entry.displayH) > 1e-3
          || frac(entry.left) > 1e-3 || frac(entry.top) > 1e-3)) entry.issue = "fractional-edge";
        if (!entry.issue && entry.alpha > 0.02 && entry.alpha < 0.98) entry.info = "translucent";
        out.push(entry);
      }
    })(scene.children.list, 0, 0, 1, 1, "", true);
    return { objectCount: out.length, objects: out };
  }

  /** HUD-Band als Buffer-Pixel-Snapshot (PNG dataURL) fuer Belege. */
  async function lfSnapshotBand(game, hBand) {
    const img = await new Promise((resolve) => game.renderer.snapshotArea(0, 0, game.canvas.width, hBand, resolve));
    const c = document.createElement("canvas");
    c.width = game.canvas.width; c.height = hBand;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return c.toDataURL("image/png");
  }
`;

async function scanProfile(page, profile) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 15000 });
  // Voller Renderbuffer (Teiler 1), damit Buffer-Pixel == n-fach Geraetepixel.
  await page.evaluate(() => { window.__rbOverride = 1; });
  await startRun(page);
  // Level-up-Overlays (0.86-Dim) wuerden das HUD verdunkeln -> unterdruecken.
  await page.evaluate(() => { window.__lf.setSuppressLevelUps(true); });

  // Build sichtbar machen: alle 12 Icon-Klassen + Evo-Hinweis (ember 8 + tome).
  await page.evaluate(() => {
    window.__lf.addWeapon("ember", 8);
    for (const w of ["flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(w, 1);
    window.__lf.addPassive("tome", 1);
    for (const p of ["boots", "heart", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(p, 1);
  });
  // Etwas Schaden nehmen (fractionale HP-Fuellung): zum nächsten Gegner
  // teleportieren (Waffen killen aus der Ferne, deshalb DIREKTER Kontakt).
  for (let i = 0; i < 8; i++) {
    const ok = await page.evaluate(() => {
      const s = window.__lf.state();
      if (s.hp < s.maxHp) return "damaged";
      const e = (s.enemyList ?? [])[0];
      if (e) window.__lf.teleport(e.x, e.y);
      else window.__lf.spawnEnemy("bog_rat", 6);
      return "moved";
    });
    if (ok === "damaged") break;
    await page.waitForTimeout(300);
  }
  await page.evaluate(() => {
    const s = window.__lf.state();
    const n = Math.max(1, s.level) - 1;
    const need = 8 + Math.round(1.1 * n * n) + (n > 24 ? 10 * (n - 24) * (n - 24) : 0);
    const delta = Math.floor(need * 0.373) - s.xp;
    if (delta > 0) window.__lf.giveXp(delta);
    window.__lf.god(true);
  });
  await page.waitForTimeout(400);
  // Boss-Bar in den Scan (Segment-x sind fraktional, Boss-Fuellung folgt ratio).
  await page.evaluate(() => { window.__lf.god(true); window.__lf.spawnBoss(0); });
  await page.waitForTimeout(500);
  // XP-Fuellung deterministisch OFF-GRID bringen: solange die Display-Breite
  // ganzzahlig oder 0 waere, 1 XP nachlegen (max. 6 Tropfer).
  for (let i = 0; i < 6; i++) {
    const offGrid = await page.evaluate(() => {
      const o = window.__game.scene.getScene("ui").children.list.find((c) => c.name === "hud-xp-fill");
      if (!o) return true;
      const dw = o.displayWidth;
      return Math.abs(dw - Math.round(dw)) > 1e-3 && dw > 1;
    });
    if (offGrid) break;
    await page.evaluate(() => window.__lf.giveXp(1));
    await page.waitForTimeout(100);
  }
  // Nach dem Fix ist die Display-Breite IMMER ganzzahlig; fuer den after-Beleg
  // die Fuellung auf ~40 % auftanken (suppressLevelUps aktivierte Level-Ups
  // abfangen, kein Overlay-Risiko).
  await page.evaluate(() => {
    const s = window.__lf.state();
    const need = s.xpNeed ?? 9;
    const delta = Math.floor(need * 0.4037) - s.xp;
    if (delta > 0) window.__lf.giveXp(delta);
  });
  await page.waitForTimeout(150);
  // HP-Fuellung ebenfalls auf OFF-GRID pruefen (Info-Feld im JSON).
  await page.waitForTimeout(200);
  // Gefrorener Frame: Run-Scene pausiert (Phaser rendert PAUSED-Szenen weiter),
  // UI-Szene bleibt aktiv und rendert das HUD unverändert.
  await page.evaluate(() => { window.__game.scene.pause("run"); });
  await page.waitForTimeout(300);

  const data = await page.evaluate(async ({ src }) => {
    // eslint-disable-next-line no-eval
    eval(src);
    const game = window.__game;
    const scan = lfCollect(game, "ui");
    const hudBandPx = Math.round(game.canvas.height * (64 / game.scale.height));
    const bandPng = await lfSnapshotBand(game, hudBandPx);
    return { scan, view: lfViewInfo(game), bandPng };
  }, { src: SCAN_SRC });

  const pngPath = `shots/m10-xp-hud-${TAG}-${profile.name}-hud.png`;
  writeFileSync(pngPath, Buffer.from(data.bandPng.slice("data:image/png;base64,".length), "base64"));
  try {
    execFileSync("convert", [pngPath, "-filter", "point", "-resize", "400%", pngPath.replace(/\.png$/, "-4x.png")], { stdio: "pipe" });
  } catch { /* convert fehlt: 1x-Beleg bleibt */ }

  const findings = data.scan.objects.filter((o) => o.issue);
  const info = data.scan.objects.filter((o) => o.info && !o.issue);
  const hudState = await page.evaluate(() => {
    const s = window.__lf.state();
    const sc = window.__game.scene.getScene("ui");
    const read = (n) => {
      const o = sc.children.list.find((c) => c.name === n);
      return o ? { scaleX: Math.round(o.scaleX * 1000) / 1000, displayW: Math.round(o.displayWidth * 1000) / 1000 } : null;
    };
    return { hp: s.hp, maxHp: s.maxHp, xp: s.xp, xpNeed: s.xpNeed, xpRatio: s.xpRatio, boss: Boolean(s.boss),
      xpFill: read("hud-xp-fill"), hpFill: read("hud-hp-fill") };
  });
  await page.screenshot({ path: `shots/m10-xp-hud-${TAG}-${profile.name}-full.png` });

  return {
    profile: profile.name,
    viewport: profile.viewport,
    dpr: profile.dpr,
    view: data.view,
    hudState,
    scannedObjects: data.scan.objectCount,
    objects: data.scan.objects,
    findings,
    translucentInfo: info,
    jsErrors: errors,
  };
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

const results = {};
let totalErrors = [];
let totalFindings = 0;
try {
  for (const profile of PROFILES) {
    const page = await browser.newPage({ viewport: profile.viewport, deviceScaleFactor: profile.dpr });
    try {
      const r = await scanProfile(page, profile);
      results[profile.name] = r;
      totalErrors.push(...r.jsErrors);
      totalFindings += r.findings.length;
      console.log(`[scan] ${profile.name}: ${r.findings.length} findings, ${r.translucentInfo.length} translucent (Info)`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

const OUT_JSON = `shots/m10-xp-hud-${TAG}.json`;
writeFileSync(OUT_JSON, JSON.stringify({ tag: TAG, profiles: results, totalFindings, jsErrors: totalErrors }, null, 2) + "\n");
console.log(JSON.stringify({
  tag: TAG, output: OUT_JSON, totalFindings,
  perProfile: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, {
    findings: v.findings.map((f) => `${f.issue}:${f.name}`),
    view: v.view,
  }])),
  jsErrors: totalErrors,
}, null, 2));
process.exit(totalErrors.length > 0 ? 1 : 0);
