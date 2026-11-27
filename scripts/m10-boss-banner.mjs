#!/usr/bin/env node
// Lane m10-boss-banner-layout: Boss-Banner vs. Schadenszahlen (Dom-Wunsch 21:15Z, Punkt 4b).
// Löst Boss-Spawn UND aktive Schadenszahlen gleichzeitig aus und misst die Screen-Rects
// (Banner, HP-Leiste, Damage-Texte) plus Banner-Alpha in drei Fensterformaten
// (640x360, 960x540, 1280x720). Ein Lauf, kein Mess-Loop.
// Aufruf: node scripts/m10-boss-banner.mjs [before|after]   (Default: before)
// Belege: shots/m10-boss-banner-<mode>-<label>.png + shots/m10-boss-banner-<mode>.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const MODE = (process.argv[2] ?? "before") === "after" ? "after" : "before";
// Fensterformate laut Briefing; logische Views ergeben sich über computeView:
// 640x360 → Fit 480x360 (Skalierung 1), 960x540 → Fit 480x360 (1.5), 1280x720 → 640x360 (n=2).
const FORMATS = [
  { label: "640", cssW: 640, cssH: 360, dpr: 1 },
  { label: "960x540", cssW: 960, cssH: 540, dpr: 1 },
  { label: "1280x720", cssW: 1280, cssH: 720, dpr: 1 },
];

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
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
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=4211`);
    await startRun(page);

    // Szene aufbauen: Spieler nach unten verlagern, Skelette oben im View,
    // dann Boss-Spawn (Banner "DER HOHE KOENIG") — Zahlen und Banner gleichzeitig aktiv.
    await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      window.__lf.god(true);
      window.__lf.setTimeScale(1);
      run.teleport(2000, 1600);
    });
    await page.waitForTimeout(300);
    // Skelette um den Spieler spawnen, dann den Spieler so weit nach unten
    // verlagern, dass die Gegner (und damit ihre Schadenszahlen) im Banner-Band
    // an der oberen Viewkante liegen — wie im Dom-Screenshot Minute 30.
    const avgScreenY = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      window.__lf.spawnEnemy("skeleton", 30);
      // Starke Waffe: viele Treffer; mit setTimeScale(0.2) bleiben die Zahlen
      // ~4 s Echtzeit sichtbar und das Messfenster wird ruhig.
      window.__lf.addWeapon("lantern", 8);
      const enemies = run.enemies?.active ?? [];
      const ys = enemies.slice(-30).map((e) => e.y - cam.scrollY);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 120;
    });
    // Ziel: Gegner-Screen-Y ~70 => Zahlen (y-8, drift -18) liegen im Banner-Band.
    // Kamera lerpt und Gegner chase den Spieler -> bis zu 3 korrigierende Teleports.
    for (let i = 0; i < 3; i++) {
      const avgSy = await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        const cam = run.cameras.main;
        const enemies = run.enemies?.active ?? [];
        const ys = enemies.map((e) => e.y - cam.scrollY);
        return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 70;
      });
      if (Math.abs(avgSy - 70) < 12) break;
      await page.evaluate((delta) => {
        const run = window.__game.scene.getScene("run");
        run.teleport(run.player.x, run.player.y + delta);
      }, avgSy - 70);
      await page.waitForTimeout(600);
    }
    await page.evaluate(() => window.__lf.setTimeScale(0.2));
    await page.evaluate(() => window.__lf.spawnBoss(5));
    await page.waitForTimeout(800); // Fade-in fertig, mehrere Zahlen aktiv, Banner sichtbar

    const data = await page.evaluate(() => {
      const game = window.__game;
      const ui = game.scene.getScene("ui");
      const run = game.scene.getScene("run");
      const cam = run.cameras.main;
      const W = cam.width;
      const zoom = cam.zoom ?? 1;

      // HP-Leiste: echtes Objekt (Rectangle, h=12, y=46, Origin 0/0.5) suchen.
      let hpBar = null;
      for (const o of ui.children.list) {
        if (o.type === "Rectangle" && Math.abs(o.height - 12) < 0.01 && Math.abs(o.y - 46) < 0.01) {
          hpBar = { x: o.x, y: o.y - o.height / 2, w: o.width, h: o.height };
          break;
        }
      }
      if (!hpBar) hpBar = { x: W / 2 - Math.min(236, W - 48) / 2, y: 40, w: Math.min(236, W - 48), h: 12 };

      // Banner: Nineslice "hud-banner-bg" im Container bannerGroup (Container-
      // Kinder haengen nicht mehr in der Display-Liste der Szene).
      const group = ui.bannerGroup;
      const bg = group ? group.list.find((o) => o.name === "hud-banner-bg") : null;
      let banner = null;
      if (bg) {
        const cy = group.y + bg.y;
        banner = { x: bg.x - bg.width / 2, y: cy - bg.height / 2, w: bg.width, h: bg.height };
      }
      const title = ui.bannerText;
      const sub = ui.bannerSub;
      // PixelText: Container, Glyphen haengen an y=0 (Oberkante), center-Ausrichtung
      // verschiebt intern um -textWidth/2. Rect = Screen-Position + Textbreite x 7.
      const bannerTextRect = title
        ? { x: title.x - (title.textWidth * title.scale) / 2, y: group.y + title.y, w: title.textWidth * title.scale, h: 7 * title.scale }
        : null;

      // Schadenszahlen: PixelTexts (Container, valueText) mit Depth 15 in der
      // Run-Szene, Weltkoordinaten → Screen inkl. Kamera-Zoom.
      const damageTexts = [];
      for (const o of run.children.list) {
        if (o.depth !== 15 || !o.visible) continue;
        const value = o.valueText ?? "";
        if (value.length === 0) continue;
        const w = o.textWidth * o.scale;
        const h = 7 * o.scale;
        const sx = (o.x - cam.scrollX) * zoom;
        const sy = (o.y - cam.scrollY) * zoom;
        damageTexts.push({
          text: value,
          rect: { x: sx - w / 2, y: sy, w, h },
        });
      }

      const overlaps = damageTexts.filter((d) => banner && (d.rect.x < banner.x + banner.w && banner.x < d.rect.x + d.rect.w && d.rect.y < banner.y + banner.h && banner.y < d.rect.y + d.rect.h));
      const overlapsTitle = bannerTextRect
        && damageTexts.some((d) => d.rect.x < bannerTextRect.x + bannerTextRect.w
          && bannerTextRect.x < d.rect.x + d.rect.w
          && d.rect.y < bannerTextRect.y + bannerTextRect.h
          && bannerTextRect.y < d.rect.y + d.rect.h);

      return {
        logical: { w: W, h: cam.height },
        zoom,
        hpBar,
        banner,
        bannerAlpha: group ? Number(group.alpha.toFixed(3)) : null,
        bannerVisible: group ? group.visible : null,
        bannerTitle: title ? (title.valueText ?? title.text) : "",
        bannerSub: sub ? (sub.valueText ?? sub.text) : "",
        bannerTextRect,
        damageCount: damageTexts.length,
        damageTexts,
        overlapCount: overlaps.length,
        overlapTexts: overlaps.map((d) => d.text),
        overlapWithTitle: Boolean(overlapsTitle),
      };
    });

    await page.screenshot({ path: `shots/m10-boss-banner-${MODE}-${fmt.label}.png` });

    // Banner verschwindet nach Timer (2,4 s Halten + 0,38 s Ausblenden)?
    await page.waitForTimeout(3200);
    const after = await page.evaluate(() => {
      const ui = window.__game.scene.getScene("ui");
      return { visible: ui.bannerGroup.visible, alpha: Number(ui.bannerGroup.alpha.toFixed(3)) };
    });

    formats.push({
      label: fmt.label,
      viewport: { width: fmt.cssW, height: fmt.cssH, dpr: fmt.dpr },
      ...data,
      bannerVisibleAfterTimer: after.visible,
      bannerAlphaAfterTimer: after.alpha,
      screenshot: `shots/m10-boss-banner-${MODE}-${fmt.label}.png`,
    });
    await context.close();
  }
} finally {
  await browser.close();
  await server.stop();
}

const summary = {
  mode: MODE,
  capturedAt: new Date().toISOString(),
  jsErrors: errors,
  formats,
  totalOverlaps: formats.reduce((a, f) => a + f.overlapCount, 0),
};
writeFileSync(`shots/m10-boss-banner-${MODE}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({
  mode: MODE,
  jsErrors: errors.length,
  formats: formats.map((f) => ({
    label: f.label,
    logical: f.logical,
    hpBar: f.hpBar,
    banner: f.banner,
    bannerAlpha: f.bannerAlpha,
    bannerTitle: f.bannerTitle,
    damageCount: f.damageCount,
    overlapCount: f.overlapCount,
    overlapTexts: f.overlapTexts,
    bannerVisibleAfterTimer: f.bannerVisibleAfterTimer,
  })),
}, null, 2));
