#!/usr/bin/env node
// M10-hud-notch-safearea (#1020): misst HUD-Kanten gegen die Notch-/Rundungs-
// Zonen der 7 Display-Profile (M8-Display-Tabelle, docs/lanes/m10-display-qa.md).
//
// Die Geraete-Insel wird per CDP `Emulation.setSafeAreaInsetsOverride`
// emuliert (Muster card3-safearea aus m10-display-qa): `env(safe-area-inset-*)`
// spiegelt sich im body-Padding (index.html) und wird hier zurueckgelesen.
// Gemessen werden die ECHT gerenderten Bounding-Boxen der benannten HUD-
// Objekte (SetName-Instrumentierung, aendert kein Layout) in Spielpixeln,
// per Canvas-Rect in Bildschirm-CSS-Px uebersetzt und gegen die Notch-Zonen
// geschnitten. Kein FPS-Gate, kein flock: reine Geometrie-Messung.
//
// Aufruf: node scripts/m10-hud-safearea.mjs --tag before|after
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));

// 7 Display-Profile (identisch zu scripts/verify-display.mjs).
const PROFILES = [
  { name: "hd", width: 1920, height: 1080, dpr: 1 },
  { name: "uhd", width: 3840, height: 2160, dpr: 1 },
  { name: "wqhd15", width: 2560, height: 1440, dpr: 1.5 },
  { name: "laptop", width: 1366, height: 768, dpr: 1 },
  { name: "iphone14", width: 844, height: 390, dpr: 3, hasTouch: true, isMobile: true },
  { name: "pixel7", width: 915, height: 412, dpr: 2, hasTouch: true, isMobile: true },
  { name: "ipadpro", width: 1366, height: 1024, dpr: 2, hasTouch: true },
];

// Emulierte Geraete-Inseln in CSS-Px (dokumentierte Gerätewerte,
// docs/lanes/m10-display-qa.md C3): iPhone-14-Querformat Notch links/rechts
// 47 + Home-Indikator unten 21; Pixel 7 Punch-Hole/Rundung rundum 12.
const SAFE_OVERRIDE = {
  iphone14: { left: 47, right: 47, top: 0, bottom: 21 },
  pixel7: { left: 12, right: 12, top: 12, bottom: 12 },
};

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];

// Benannte HUD-Boxen in Spielpixeln (Container-Skalierung selbst aufgeloest,
// Muster scripts/m10-hud-anchor.mjs).
function measureExpr() {
  const round = (v) => Math.round(v);
  function boundsOf(o, px, py, psx, psy) {
    if (o.list) {
      const cx = px + psx * o.x, cy = py + psy * o.y;
      const csx = psx * (o.scaleX ?? 1), csy = psy * (o.scaleY ?? 1);
      let b = null;
      for (const c of o.list) {
        if (c.visible === false) continue;
        const r = boundsOf(c, cx, cy, csx, csy);
        if (r) b = b ? {
          x: Math.min(b.x, r.x), y: Math.min(b.y, r.y),
          w: Math.max(b.x + b.w, r.x + r.w) - Math.min(b.x, r.x),
          h: Math.max(b.y + b.h, r.y + r.h) - Math.min(b.y, r.y),
        } : r;
      }
      return b;
    }
    const w = (o.displayWidth ?? o.width ?? 0) * psx;
    const h = (o.displayHeight ?? o.height ?? 0) * psy;
    if (w <= 0 || h <= 0) return null;
    const ox = o.originX ?? 0.5, oy = o.originY ?? 0.5;
    return { x: px + psx * o.x - ox * w, y: py + psy * o.y - oy * h, w, h };
  }
  const named = {};
  (function walk(objs, px, py, psx, psy, vis) {
    for (const o of objs) {
      const selfVisible = vis && o.visible !== false;
      if (o.name && selfVisible) {
        const b = boundsOf(o, px, py, psx, psy);
        if (b) named[o.name] = { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) };
      }
      if (o.list) walk(o.list, px + psx * o.x, py + psy * o.y,
        psx * (o.scaleX ?? 1), psy * (o.scaleY ?? 1), selfVisible);
    }
  })(window.__game.scene.getScene("ui").children.list, 0, 0, 1, 1, true);
  const canvas = window.__game.canvas;
  const rect = canvas.getBoundingClientRect();
  return {
    named,
    view: { w: window.__game.scale.width, h: window.__game.scale.height },
    canvasRect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    insetsCss: (() => {
      const s = getComputedStyle(document.body);
      const px = (v) => parseFloat(v) || 0;
      return { left: px(s.paddingLeft), right: px(s.paddingRight), top: px(s.paddingTop), bottom: px(s.paddingBottom) };
    })(),
  };
}

/** HUD-Boxen (Spielpixel) -> Bildschirm-CSS-Px. */
function toScreen(box, view, rect) {
  const kx = rect.w / view.w, ky = rect.h / view.h;
  return { x: rect.x + box.x * kx, y: rect.y + box.y * ky, w: box.w * kx, h: box.h * ky };
}

/** Notch-/Rundungs-Zonen in Bildschirm-CSS-Px (aus den emulierten Insets). */
function notchZones(screen, insets) {
  const zones = [];
  const z = (x, y, w, h, kind) => {
    const x2 = Math.max(x, 0), y2 = Math.max(y, 0);
    const w2 = Math.min(x + w, screen.w) - x2, h2 = Math.min(y + h, screen.h) - y2;
    if (w2 > 0 && h2 > 0) zones.push({ kind, x: x2, y: y2, w: w2, h: h2 });
  };
  if (insets.left > 0) z(0, 0, insets.left, screen.h, "left");
  if (insets.right > 0) z(screen.w - insets.right, 0, insets.right, screen.h, "right");
  if (insets.top > 0) z(0, 0, screen.w, insets.top, "top");
  if (insets.bottom > 0) z(0, screen.h - insets.bottom, screen.w, insets.bottom, "bottom");
  return zones;
}

const inter = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const isHudName = (n) => n.startsWith("hud-");

const results = [];
try {
  for (const p of PROFILES) {
    const context = await browser.newContext({
      viewport: { width: p.width, height: p.height },
      deviceScaleFactor: p.dpr,
      hasTouch: p.hasTouch ?? false,
      isMobile: p.isMobile ?? false,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${p.name}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${p.name}: ${m.text()}`); });
    const override = SAFE_OVERRIDE[p.name] ?? null;
    if (override) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: override });
    }
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate(() => {
      const lf = window.__lf;
      lf.god(true);
      lf.addWeapon("ember", 8); lf.addWeapon("flail", 5); lf.addWeapon("frost", 5);
      lf.addWeapon("thorn", 5); lf.addWeapon("storm", 5); lf.addWeapon("lantern", 5);
      lf.addPassive("tome", 5); lf.addPassive("heart", 5); lf.addPassive("boots", 5);
      lf.addPassive("charm", 5); lf.addPassive("whetstone", 5); lf.addPassive("hourglass", 5);
    });
    await page.waitForTimeout(400);

    const m = await page.evaluate(measureExpr);
    const screen = { w: p.width, h: p.height };
    const zones = notchZones(screen, override ?? { left: 0, right: 0, top: 0, bottom: 0 });
    const hud = {};
    const violations = [];
    for (const [name, box] of Object.entries(m.named)) {
      if (!isHudName(name)) continue;
      const s = toScreen(box, m.view, m.canvasRect);
      hud[name] = { game: box, screen: { x: Math.round(s.x), y: Math.round(s.y), w: Math.round(s.w), h: Math.round(s.h) } };
      for (const z of zones) {
        if (inter(s, z)) violations.push(`${name}: ragt in ${z.kind}-Zone (screen x=${Math.round(s.x)}..${Math.round(s.x + s.w)}, y=${Math.round(s.y)}..${Math.round(s.y + s.h)} vs zone x=${Math.round(z.x)}..${Math.round(z.x + z.w)}, y=${Math.round(z.y)}..${Math.round(z.y + z.h)})`);
      }
    }
    const shot = `shots/m10-hud-safearea-${TAG}-${p.name}.png`;
    await page.screenshot({ path: shot });
    results.push({
      profile: p.name,
      device: { width: p.width, height: p.height, dpr: p.dpr },
      safeOverride: override,
      insetsCssReadback: m.insetsCss,
      canvasRect: m.canvasRect,
      view: m.view,
      notchZones: zones,
      hud,
      violations,
      shot,
      verdict: violations.length === 0 ? "PASS" : "FAIL",
    });
    console.log(`${p.name}: ${violations.length === 0 ? "PASS" : "FAIL"}`);
    for (const v of violations) console.log(`  ${v}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const fails = results.filter((r) => r.verdict === "FAIL");
const out = { tag: TAG, generated: new Date().toISOString(), profiles: results, errors };
writeFileSync(`shots/m10-hud-safearea-${TAG}.json`, JSON.stringify(out, null, 2));
console.log(`PASS ${results.length - fails.length}/${results.length} Profile, jsErrors=${errors.length}`);
process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
