#!/usr/bin/env node
// m10-boss-fx-contrast: Vorher/Nachher-Messung der Boss-FX-Lesbarkeit im Horde-Kontext.
//
// Karte #5218 (Ist-Zustand) und #5221 (Nachher): fuer alle 6 Bosse wird bei
// 640x360 (dpr 1) und 780x360@3 (dpr 3) je ein Screenshot mit aktivem
// Boss-Intro-FX (fx_boss_core + fx_shock) bei >= 200 Gegnern aufgenommen und
// per PNG-Dekodierung in Node vermessen:
//   - Luminanz-Spread (p95 - p05) im Boss-FX-Crop (64 Spielpx um fx_boss_core)
//   - Luminanz-Spread im Hintergrund-Crop (48 Spielpx, +170 Spielpx seitlich)
//   - Kontrast-Zahl = Spread(Boss) / Spread(Hintergrund)
//   - Near-White-% im Boss-Crop (zwei kalibrierte Definitionen wie Ember-Fix #2879)
//
// Keine FPS-Messung -> kein flock (feste Substeps, Momentaufnahmen).
// Aufruf: node scripts/m10-boss-fx-contrast.mjs --tag=baseline|after
import { writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "baseline"));
const OUT_JSON = `shots/m10-boss-fx-contrast-${TAG}.json`;
const OUT_PNG_PREFIX = `shots/m10-boss-fx-contrast-${TAG}`;

// Horde >= 200 Gegner: Mischung mehrerer Stufen/Silhouetten, gespawnt um den Spieler.
const HORDE = [
  ["bog_rat", 60], ["wisp", 40], ["bogzombie", 30], ["crow", 30],
  ["skeleton", 25], ["bat", 25], ["ghoul", 30], ["spider", 30],
];
const HORDE_TOTAL = HORDE.reduce((a, b) => a + b[1], 0); // 270

const VIEWS = [
  { name: "640x360@1", width: 640, height: 360, dpr: 1 },
  { name: "780x360@3", width: 780, height: 360, dpr: 3 },
];

// Minute 16: Gegner-Deckel 308 (640) bzw. 262 (780) -> >= 250 -> reduced-LOD
// (fxAlpha-Daempfung 0,72 aktiv). Naturliche Boss-Spawns werden vorher per
// bossFlags abgeschaltet (nur Mess-Harness, kein Spielcode).
const SKIP_SECOND = 1000;

// ── Mini-PNG-Dekodierer (8-bit RGB/RGBA, nicht interlaced) ────────────────
function decodePng(buf) {
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`PNG bitDepth ${bitDepth} nicht unterstuetzt`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (channels === null) throw new Error(`PNG colorType ${colorType} nicht unterstuetzt`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(w * h * channels);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= channels ? prev[x - channels] : 0;
      let v = raw[p + x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
      cur[x] = v;
    }
    p += stride;
  }
  return { w, h, channels, data: out };
}

function luminance(r, g, b) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function percentile(sorted, q) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[i];
}

/** Misst einen quadratischen Crop (Dev-Pixel) im Screenshot. */
function cropStats(img, cx, cy, half, label) {
  const { w, h, channels, data } = img;
  const x0 = Math.max(0, Math.floor(cx - half));
  const x1 = Math.min(w - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const y1 = Math.min(h - 1, Math.ceil(cy + half));
  if (x1 <= x0 || y1 <= y0) return null; // Crop liegt (fast) komplett außerhalb
  const lums = [];
  let nearMin200 = 0;
  let nearA7 = 0;
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const o = (y * w + x) * channels;
      const r = data[o], g = data[o + 1], b = data[o + 2];
      lums.push(luminance(r, g, b));
      if (Math.min(r, g, b) >= 200) nearMin200++;
      if (r >= 150 && g >= 150 && b >= 150 && r >= 235) nearA7++;
      count++;
    }
  }
  lums.sort((a, b) => a - b);
  const p05 = percentile(lums, 0.05);
  const p95 = percentile(lums, 0.95);
  const sum = lums.reduce((a, b) => a + b, 0);
  return {
    label, cx: Math.round(cx), cy: Math.round(cy), halfDev: half,
    pixels: count,
    lumP05: round(p05), lumP95: round(p95), lumMean: round(sum / count),
    spread: round(p95 - p05),
    nearWhiteMin200Pct: round((nearMin200 / count) * 100),
    nearWhiteA7Pct: round((nearA7 / count) * 100),
  };
}

const round = (v) => Math.round(v * 10000) / 10000;

// ── Harness ───────────────────────────────────────────────────────────────
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
const errors = [];
const runs = [];

try {
  for (const view of VIEWS) {
    const page = await browser.newPage({
      viewport: { width: view.width, height: view.height },
      deviceScaleFactor: view.dpr,
    });
    page.on("pageerror", (e) => errors.push(`[${view.name}] ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${view.name}] ${m.text()}`); });

    for (let boss = 0; boss < 6; boss++) {
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
      await startRun(page);
      await page.evaluate(async ({ skipSecond, horde }) => {
        const run = window.__game.scene.getScene("run");
        window.__lf.god(true);
        window.__lf.autoPlay(false);
        window.__lf.setSuppressLevelUps(true);
        window.__lf.setTimeScale(1);
        // Naturliche Boss-Spawns abschalten (nur Mess-Harness):
        for (let i = 0; i < 6; i++) run.bossFlags[i] = true;
        // Naturliche Spawns abschalten + Bestand leeren:
        window.__game.registry.set("lf-density", 0);
        run.registry.set("lf-density", 0);
        for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
        await new Promise((r) => setTimeout(r, 200));
        window.__lf.skipTo(skipSecond);
        window.__lf.teleport(2048, 2048);
        await new Promise((r) => setTimeout(r, 150));
        for (const [id, n] of horde) window.__lf.spawnEnemy(id, n);
        await new Promise((r) => setTimeout(r, 150));
      }, { skipSecond: SKIP_SECOND, horde: HORDE });

      // Horde oben auffuellen (Frame-Budget-Regler kann unter den Deckel druecken).
      await page.evaluate((total) => {
        const run = window.__game.scene.getScene("run");
        const alive = run.enemies.active.filter((e) => e.alive).length;
        if (alive < total) window.__lf.spawnEnemy("bog_rat", total - alive);
      }, HORDE_TOTAL);

      // Boss + Intro-FX ausloesen, im FX-Peak einfrieren und screenshoten.
      await page.evaluate((b) => { window.__lf.spawnBoss(b); }, boss);
      await page.waitForFunction(() => {
        const run = window.__game.scene.getScene("run");
        const fx = run.combat.fx.active.find((f) => f.active && f.frames[0].startsWith("fx_boss_core"));
        if (!fx) return false;
        // Kamera muss den FX schon im View haben (Follow-Lerp nach Teleport).
        const wv = run.cameras.main.worldView;
        return fx.x > wv.x + 40 && fx.x < wv.x + wv.width - 40 && fx.y > wv.y + 40 && fx.y < wv.y + wv.height - 40;
      }, { timeout: 5000 });
      // In die FX-Mitte warten (Peak: Scale ~1,5-1,8, Alpha noch hoch), dann einfrieren.
      await page.waitForTimeout(280);

      const info = await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        const fx = run.combat.fx.active.find((f) => f.active && f.frames[0].startsWith("fx_boss_core"));
        const cam = run.cameras.main;
        const wv = cam.worldView;
        const canvas = document.querySelector("canvas");
        const rect = canvas.getBoundingClientRect();
        return {
          wx: fx.x, wy: fx.y,
          wv: { x: wv.x, y: wv.y, width: wv.width, height: wv.height },
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          enemies: window.__lf.state().enemies,
          keys: run.combat.fx.keys,
        };
      });

      // Szene einfrieren (FX-Update + Kamera stehen, Rendering bleibt) -> stabiler Crop.
      await page.evaluate(() => window.__game.scene.pause("run"));
      const shot = await page.screenshot();
      await page.evaluate(() => window.__game.scene.resume("run"));

      const img = decodePng(shot);
      const dsf = img.w / view.width;
      const devPerGame = (info.rect.width / info.wv.width) * dsf;
      const cx = (info.rect.left + (info.wx - info.wv.x) * (info.rect.width / info.wv.width)) * dsf;
      const cy = (info.rect.top + (info.wy - info.wv.y) * (info.rect.height / info.wv.height)) * dsf;
      const halfBoss = 32 * devPerGame;   // 64 Spielpx
      const halfBg = 24 * devPerGame;     // 48 Spielpx

      const bossCrop = cropStats(img, cx, cy, halfBoss, "boss");
      // Hintergrund robust: 4 Crops um den Boss-FX, Median der Spreads —
      // einzelne Waffen-FX/Gems im Hintergrund-Crop sollen die Zahl nicht kippen.
      const bgOffsets = [[170, 0], [-170, 0], [0, 170], [0, -170]];
      const bgSpreads = [];
      for (const [ox, oy] of bgOffsets) {
        const s = cropStats(img, cx + ox * devPerGame, cy + oy * devPerGame, halfBg, "bg");
        if (s) bgSpreads.push(s);
      }
      if (!bossCrop || bgSpreads.length < 3) throw new Error(`Crops ungueltig (${view.name}, Boss ${boss})`);
      bgSpreads.sort((a, b) => a.spread - b.spread);
      const mid = Math.floor(bgSpreads.length / 2);
      const bgSpreadMedian = bgSpreads.length % 2
        ? bgSpreads[mid].spread
        : round((bgSpreads[mid - 1].spread + bgSpreads[mid].spread) / 2);
      const contrast = round(bossCrop.spread / Math.max(bgSpreadMedian, 0.01));

      const pngPath = `${OUT_PNG_PREFIX}-boss${boss}-${view.name.replace(/[@x.]/g, "")}.png`;
      writeFileSync(pngPath, shot);
      runs.push({
        boss, view: view.name,
        enemies: info.enemies,
        fxKeys: info.keys.filter((k) => k.startsWith("fx_boss") || k.startsWith("fx_shock")),
        bossCrop, bg: { spreadMedian: bgSpreadMedian, spreads: bgSpreads.map((s) => s.spread) }, contrast,
        png: pngPath,
      });
      console.log(`[m10-boss-fx-contrast] ${view.name} boss ${boss}: Gegner ${info.enemies}, Kontrast ${contrast}, Spread ${bossCrop.spread}/${bgSpreadMedian}, NearWhite ${bossCrop.nearWhiteMin200Pct}%`);

      await page.waitForTimeout(1200); // FX ablaufen lassen
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.stop?.();
}

const okRuns = runs.filter((r) => r.enemies >= 200);
const summary = {
  tag: TAG,
  generatedAt: new Date().toISOString(),
  hordeTarget: HORDE_TOTAL,
  views: VIEWS.map((v) => v.name),
  runs,
  enemiesOk: okRuns.length === runs.length,
  errors,
};
writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ out: OUT_JSON, runs: runs.length, enemiesOk: summary.enemiesOk, errors: errors.length }, null, 2));
if (errors.length > 0 || !summary.enemiesOk) process.exit(1);
