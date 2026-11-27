#!/usr/bin/env node
/**
 * M10-elite-rim — Messwerkzeug fuer den ACCEPTANCE-Restpunkt A10
 * "Chaos-Rim-Light fuer Elites": Elite-Gegner muessen sich bei 300–500
 * Gegnern sofort als Elite erkennen lassen.
 *
 * Modi:
 *   node scripts/m10-elite-rim.mjs --mode baseline   (vor dem Rim-Light)
 *   node scripts/m10-elite-rim.mjs --mode after      (nach dem Rim-Light)
 *
 * Pro Modus:
 *   - Schwarm-Screenshots mit sichtbaren Elites: 640x360 (dpr 1) und
 *     780x360 (dpr 3)  →  shots/m10-elite-rim-<mode>-640.png / -780.png
 *   - Rim-Pixel-Anteil je Elite-Typ (alle 30 Typen), gemessen an den echten
 *     Spiel-Texturen (TextureManager des dist-Builds): Randpixel (4-Nachbarn,
 *     davon mindestens 1 transparent) und ihr Amber-Anteil (PAL 20, 0xffb84d)
 *       →  shots/m10-elite-rim-<mode>.json
 *   - Kontaktblatt 1x/4x ueber alle 30 Typen (baseline: Basis-Frames,
 *     after: Rim-Frames)  →  shots/m10-elite-rim-<mode>-sheet.png
 *
 * Kein FPS-/Echtzeitlauf → keine flock-Sperre noetig (Screenshots/Masken).
 */
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const MODE = String(argOf("mode", "baseline"));
if (MODE !== "baseline" && MODE !== "after") {
  console.error("mode muss 'baseline' oder 'after' sein");
  process.exit(2);
}

/** PAL 20 (C.amber) als Hex — Elite-Akzentfarbe. */
const AMBER = 0xffb84d;

/** Die 30 Gegner-IDs (GAME.md); Reihenfolge = ENEMY_LIST. */
const ENEMY_IDS = [
  "bog_rat", "wisp", "mudling", "crow", "bogzombie", "toad",
  "skeleton", "bat", "ghoul", "witchling", "slime", "scarecrow",
  "wolf", "banshee", "golem", "spider", "cultist", "bomber",
  "knight", "harpy", "lich", "wraith", "treant", "imp",
  "horror", "centipede", "gargoyle", "reaper_bat", "abom", "voidcaller",
];

/** Elite-Typen, die im Schwarm-Screenshot nah beim Spieler stehen. */
const SHOWCASE = [
  "bog_rat", "skeleton", "golem", "knight", "wisp", "bat",
  "imp", "reaper_bat", "slime", "witchling",
];

const RUNS = [
  { tag: "640", viewport: { width: 640, height: 360 }, dpr: 1 },
  { tag: "780", viewport: { width: 780, height: 360 }, dpr: 3 },
];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--autoplay-policy=no-user-gesture-required",
] });

const result = {
  mode: MODE,
  runs: {},
  rimPerType: null,
  jsErrors: [],
};

try {
  for (const run of RUNS) {
    const page = await browser.newPage({ viewport: run.viewport, deviceScaleFactor: run.dpr });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      const url = `http://127.0.0.1:${server.port}/?debug=1&seed=7`;
      await page.goto(url);
      await startRun(page);
      await page.evaluate(({ ENEMY_IDS, SHOWCASE }) => {
        window.__lf.god(true);
        window.__lf.autoPlay(true);
        window.__lf.setTimeScale(1);
        // Schwarm um den Spieler (Normale), dann Elites nah dabei.
        window.__lf.spawnEnemy("bog_rat", 240);
        window.__lf.spawnEnemy("wisp", 40);
        window.__lf.spawnEnemy("bat", 30);
        window.__lf.spawnEnemy("bogzombie", 20);
        // Elites ueber die Run-Szene (debug-API hat keinen Elite-Parameter).
        const scene = window.__game.scene.getScene("run");
        for (const id of SHOWCASE) {
          scene.spawner.spawnEnemy(id, 2, scene.posX, scene.posY, true);
        }
      }, { ENEMY_IDS, SHOWCASE });
      await page.waitForTimeout(1800);

      const live = await page.evaluate(() => {
        const s = window.__lf.state();
        const scene = window.__game.scene.getScene("run");
        return {
          enemies: s.enemies,
          elites: scene.enemies.active.filter((e) => e.alive && e.elite).length,
        };
      });
      await page.screenshot({ path: `shots/m10-elite-rim-${MODE}-${run.tag}.png` });
      result.runs[run.tag] = { viewport: run.viewport, dpr: run.dpr, live, jsErrors: errors };
      result.jsErrors.push(...errors);
    } finally {
      await page.close();
    }
  }

  // ── Textur-Messung (aufloesungsunabhaengig, aus echten Texturen) ──
  const page = await browser.newPage({ viewport: { width: 1240, height: 1000 } });
  page.on("pageerror", (e) => result.jsErrors.push(String(e)));
  try {
    const url = `http://127.0.0.1:${server.port}/?debug=1&seed=7`;
    await page.goto(url);
    await startRun(page);
    result.rimPerType = await page.evaluate(({ ENEMY_IDS, AMBER, MODE }) => {
      const game = window.__game;
      const tex = game.textures;
      const decode = (key) => {
        if (!tex.exists(key)) return null;
        const src = tex.get(key).getSourceImage();
        const c = document.createElement("canvas");
        c.width = src.width; c.height = src.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(src, 0, 0);
        return ctx.getImageData(0, 0, c.width, c.height);
      };
      const hex = (r, g, b) => (r << 16) | (g << 8) | b;
      // Randpixel: alpha > 0 und mindestens ein 4-Nachbar alpha == 0.
      const boundaryAmber = (img) => {
        if (!img) return null;
        const { width: w, height: h, data } = img;
        const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 255 : data[(y * w + x) * 4 + 3];
        let boundary = 0;
        let amber = 0;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (a(x, y) === 0) continue;
            if (a(x - 1, y) === 0 || a(x + 1, y) === 0 || a(x, y - 1) === 0 || a(x, y + 1) === 0) {
              boundary++;
              if (hex(data[(y * w + x) * 4], data[(y * w + x) * 4 + 1], data[(y * w + x) * 4 + 2]) === AMBER) amber++;
            }
          }
        }
        return { boundary, amber, share: boundary ? +(amber / boundary).toFixed(4) : 0 };
      };
      const out = [];
      for (const id of ENEMY_IDS) {
        const base = [];
        for (let k = 1; k <= 4; k++) {
          const key = k === 1 ? `enemy_${id}` : `enemy_${id}_${k}`;
          const img = decode(key);
          if (!img) break;
          base.push(boundaryAmber(img));
        }
        const rimKey = `enemy_${id}_rim`;
        const rim = decode(rimKey);
        out.push({
          id,
          frames: base.length,
          base: base.map((b) => b.share),
          baseBoundaryPx: base.reduce((s, b) => s + b.boundary, 0),
          rimFrameExists: Boolean(rim),
          rim: rim ? boundaryAmber(rim).share : null,
          rimBoundaryPx: rim ? boundaryAmber(rim).boundary : 0,
        });
      }
      return out;
    }, { ENEMY_IDS, AMBER, MODE });

    // ── Kontaktblatt 1x/4x (Basis im baseline-Modus, Rim im after-Modus) ──
    await page.evaluate(({ ENEMY_IDS, MODE }) => {
      const game = window.__game;
      const tex = game.textures;
      const MAX = 32;
      const colW = MAX * 4 + 12 + MAX + 14;  // 4x-Feld + Abstand + 1x-Feld
      const rowH = MAX * 4 + 16;             // 4x-Feld + Label
      const cols = 5;
      const rows = Math.ceil(ENEMY_IDS.length / cols);
      const c = document.createElement("canvas");
      c.id = "lf-rim-sheet";
      c.width = cols * colW + 16;
      c.height = rows * rowH + 10;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#101724"; // PAL 2, dunkler Moorgrund
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = false;
      ctx.font = "10px monospace";
      ctx.fillStyle = "#d9ddcd";
      ENEMY_IDS.forEach((id, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const key = MODE === "after" ? `enemy_${id}_rim` : `enemy_${id}`;
        if (!tex.exists(key)) return;
        const src = tex.get(key).getSourceImage();
        const bx = 8 + col * colW;
        const by = 6 + row * rowH;
        // 4x (nearest), untenbuendig in der Zelle
        ctx.drawImage(src, 0, 0, src.width, src.height,
          bx + (MAX * 4 - src.width * 4) / 2, by + (MAX * 4 - src.height * 4),
          src.width * 4, src.height * 4);
        // 1x daneben, ebenfalls untenbuendig
        ctx.drawImage(src, bx + MAX * 4 + 12, by + MAX * 4 - src.height, src.width, src.height);
        ctx.fillText(id, bx, by + MAX * 4 + 10);
      });
      document.body.appendChild(c);
    }, { ENEMY_IDS, MODE });
    await page.waitForTimeout(200);
    const sheet = await page.$("#lf-rim-sheet");
    await sheet.screenshot({ path: `shots/m10-elite-rim-${MODE}-sheet.png` });
  } finally {
    await page.close();
  }

  writeFileSync(`shots/m10-elite-rim-${MODE}.json`, JSON.stringify(result, null, 2));
  const withRim = result.rimPerType?.filter((t) => t.rimFrameExists).length ?? 0;
  console.log(JSON.stringify({
    mode: MODE,
    runs: result.runs,
    rimFrameTypes: withRim,
    jsErrors: result.jsErrors.length,
  }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
