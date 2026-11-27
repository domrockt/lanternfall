#!/usr/bin/env node
/**
 * M10-vfx-restore: Baseline + Stufen-Messung zur Ruecknahme der VFX-Daempfung
 * (ACCEPTANCE-Restmangel A7: fxAlpha 0,5/NORMAL wirkt verwaschen).
 *
 * Pro Viewport-Profil (640x360 dpr1, 780x360 dpr3):
 *   - M25-Szenario (skipTo 1400, 300 Gegner nachgespawnt, 6 Waffen Lv8 + 6 Evolutionen),
 *   - Frame pausieren, Banner ausblenden, NICHT gedämpft (fxDamping aus) und
 *     gedämpft (fxDamping an) im selben Frame aufnehmen,
 *   - optional Stufe S (URL-Parameter ?fxrestore=S, Run.ts): derselbe pausierte
 *     Frame nochmal mit Ruecknahme-Stufe S,
 *   - Near-White A7 (r,g,b >= 150 und r >= 235) im AoE-Crop (A7: 240x220 bei
 *     +360+160 im 960x540-Frame; hier proportional) und ueber den ganzen Frame,
 *   - fxAlpha-Setup (lodLevel, gemeldetes fxAlpha, Stufe), Renderer-String,
 *   - Draw-Calls/Frame (gl-Wrapper, wie scripts/perf-profile.mjs),
 *   - FPS ueber SECONDS im Live-Lauf bei gehaltenen TARGET Gegnern.
 *
 * Nutzung (FPS/Realzeit -> IMMER unter der flock-Sperre):
 *   flock /home/ai/games/.lf-perf.lock node scripts/m10-vfx-restore.mjs \
 *     [--stage 0] [--seconds 45] [--target 300] \
 *     [--profile 640x360@1,780x360@3] [--prefix shots/m10-vfx-restore-baseline]
 *
 * JSON/PNG: shots/m10-vfx-restore-<prefix-letzter Teil>-<profil>.{json,png}
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const STAGE = Number(argOf("stage", "0"));
const SECONDS = Number(argOf("seconds", "45"));
const TARGET = Number(argOf("target", "300"));
const SKIP_TO = Number(argOf("skip-to", "1400"));
const PREFIX = argOf("prefix", "shots/m10-vfx-restore-baseline");
const PROFILES = String(argOf("profile", "640x360@1,780x360@3")).split(",").map((s) => {
  const [vp, dpr] = s.split("@");
  const [width, height] = vp.split("x").map(Number);
  return { label: s, width, height, dpr: Number(dpr ?? 1) };
});
const TMP = `${process.env.HOME}/tmp/m10-vfx-restore`;

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

ensureBuild();
mkdirSync(TMP, { recursive: true });
mkdirSync("shots", { recursive: true });

// ---------- Pixel-Analyse (PNG -> ffmpeg rawvideo rgb24) ----------

/** PNG-IHDR-Dimensionen ohne Abhaengigkeit. */
function pngSize(file) {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function isNearWhiteA7(r, g, b) {
  return r >= 150 && g >= 150 && b >= 150 && r >= 235;
}
function isNearWhiteMin200(r, g, b) {
  return Math.min(r, g, b) >= 200;
}

/**
 * Near-White-Statistik eines Screenshot-PNG. crop = A7-anteilig
 * (240x220 bei +360+160 im 960x540-Frame => x 37,5..62,5 %, y 29,63..70,37 %).
 */
function analyzeShot(file) {
  const { width, height } = pngSize(file);
  const raw = `${TMP}/${file.split("/").pop()}.rgb24`;
  execFileSync("ffmpeg", ["-y", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", raw], { stdio: "ignore" });
  const buf = readFileSync(raw);
  const x0 = Math.round(width * 0.375), x1 = Math.round(width * 0.625);
  const y0 = Math.round(height * (160 / 540)), y1 = Math.round(height * (380 / 540));
  let a7 = 0, min200 = 0, a7Crop = 0, min200Crop = 0, cropPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      const inCrop = x >= x0 && x < x1 && y >= y0 && y < y1;
      if (inCrop) cropPixels++;
      if (isNearWhiteA7(r, g, b)) { a7++; if (inCrop) a7Crop++; }
      if (isNearWhiteMin200(r, g, b)) { min200++; if (inCrop) min200Crop++; }
    }
  }
  unlinkSync(raw);
  const pct = (n, total) => Math.round((n / total) * 10000) / 100;
  return {
    pngWidth: width, pngHeight: height,
    nearWhiteA7Pct: pct(a7, width * height),
    nearWhiteMinRgb200Pct: pct(min200, width * height),
    nearWhiteA7CropPct: pct(a7Crop, cropPixels),
    nearWhiteMinRgb200CropPct: pct(min200Crop, cropPixels),
    cropDef: "A7-anteilig: x 37,5..62,5 %, y 29,63..70,37 % des Frames (240x220@+360+160 im 960x540-Original)",
  };
}

// ---------- Browser / Messlauf ----------

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const report = { stage: STAGE, seconds: SECONDS, target: TARGET, skipTo: SKIP_TO, profiles: [] };

try {
  for (const prof of PROFILES) {
    const page = await browser.newPage({
      viewport: { width: prof.width, height: prof.height },
      deviceScaleFactor: prof.dpr,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

    // GL-Zaehler VOR dem Laden injizieren (Muster scripts/perf-profile.mjs).
    await page.addInitScript(() => {
      const stats = { frames: [], current: { draws: 0, blends: 0, programs: 0, textures: 0 }, total: 0 };
      window.__glStats = stats;
      const wrap = (proto, name, key) => {
        if (!proto || typeof proto[name] !== "function") return;
        const orig = proto[name];
        proto[name] = function (...args) {
          stats.current[key] = (stats.current[key] || 0) + 1;
          if (key === "draws") stats.total++;
          return orig.apply(this, args);
        };
      };
      for (const name of ["WebGLRenderingContext", "WebGL2RenderingContext"]) {
        const proto = window[name]?.prototype;
        if (!proto) continue;
        wrap(proto, "drawElements", "draws");
        wrap(proto, "drawArrays", "draws");
        wrap(proto, "blendFunc", "blends");
        wrap(proto, "blendFuncSeparate", "blends");
      }
      const origRaf = window.requestAnimationFrame;
      window.requestAnimationFrame = function (cb) {
        return origRaf.call(window, function (ts) {
          cb(ts);
          stats.frames.push({ ts: Math.round(ts), ...stats.current });
          stats.current = { draws: 0, blends: 0, programs: 0, textures: 0 };
        });
      };
      window.__drawSummary = () => {
        const f = stats.frames;
        if (!f.length) return { frames: 0 };
        const med = (arr) => {
          const s = [...arr].sort((a, b) => a - b);
          const m = Math.floor(s.length / 2);
          return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
        };
        const draws = f.map((x) => x.draws);
        const p = (q) => draws[Math.min(draws.length - 1, Math.floor(draws.length * q))];
        return {
          frames: f.length,
          drawsMedian: med(draws),
          drawsMean: Math.round((draws.reduce((a, b) => a + b, 0) / draws.length) * 10) / 10,
          drawsP95: p(0.95),
          blendsMedian: med(f.map((x) => x.blends)),
          programsMedian: med(f.map((x) => x.programs)),
        };
      };
    });

    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=77&fxrestore=${STAGE}`);
    await startRun(page);
    await page.evaluate(({ skipTo }) => {
      window.__lf.god(true);
      window.__lf.setSuppressLevelUps(true);
      window.__lf.setTimeScale(30);
      // A7-Bedingungen (final-vfx-readability.mjs): nur 6 Basiswaffen Lv8 —
      // Evolutionen schlichten die Horde zu schnell fuer einen dichten Freeze-Frame.
      for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
      window.__lf.skipTo(skipTo);
      window.__lf.setTimeScale(1);
    }, { skipTo: SKIP_TO });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 40; i++) {
      if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }

    // M25-Zielstellung des Briefs: 300 Gegner + lebender Boss (Bosskampf Minute 25).
    // Der Bossdruck zwingt lodFor() in "minimal" — genau dort greift die 0,5-Daempfung.
    await page.evaluate(() => window.__lf.spawnBoss(4));
    await page.evaluate(async (target) => {
      for (let i = 0; i < 25; i++) {
        const active = window.__lf.stats().enemies;
        if (active >= target) break;
        window.__lf.spawnEnemy("bog_rat", target - active);
        await new Promise((r) => setTimeout(r, 250));
      }
    }, TARGET);
    await page.waitForTimeout(400);

    // Pool-Effekte mitten in der Horde (wie A7-Frame, echte FxSystem-Sprites).
    await page.evaluate(() => {
      const sc = window.__game.scene.getScene("run");
      const c = sc.combat;
      c.fx.burst("fx_spark", sc.posX, sc.posY, 90, { life: 3, scaleFrom: 1.6, alphaFrom: 1 });
      c.fx.spawnAnim("fx_halo", sc.posX, sc.posY, { life: 3, scaleFrom: 4.2, alphaFrom: 1, additive: true });
      c.fx.spawnAnim("fx_shock", sc.posX, sc.posY, { life: 3, scaleFrom: 3.4, alphaFrom: 1 });
    });
    await page.waitForTimeout(120);
    await page.evaluate(() => {
      window.__game.scene.getScene("ui").bannerGroup?.setVisible(false);
      window.__game.scene.pause("run");
    });
    await page.waitForTimeout(120);

    const shotBase = `${PREFIX}-${prof.label.split("@")[0]}${prof.dpr > 1 ? `@${prof.dpr}` : ""}`;

    // (1) GEDAEMPFTER Referenz-Frame (fxDamping an, Stufe 0) — "Vorher".
    await page.evaluate(() => window.__lf.setFxDamping(true));
    await page.waitForTimeout(80);
    const dampedStats = await page.evaluate(() => {
      const s = window.__lf.stats();
      return { ...s, bossAlive: Boolean(window.__game.scene.getScene("run").bosses?.hasAliveBoss?.()) };
    });
    const dampedPng = `${shotBase}-damped.png`;
    await page.screenshot({ path: dampedPng });

    // (2) Ruecknahme-Stufe im SELBEN pausierten Frame (Run-Szene public API).
    let stageStats = null;
    let stagePng = null;
    if (STAGE > 0) {
      const ok = await page.evaluate((stage) => {
        const sc = window.__game.scene.getScene("run");
        if (typeof sc.setFxRestore !== "function") return false;
        sc.setFxRestore(stage);
        return true;
      }, STAGE);
      if (!ok) throw new Error("Run-Szene hat kein setFxRestore() — Stufe " + STAGE + " nicht implementiert");
      await page.waitForTimeout(80);
      stageStats = await page.evaluate(() => window.__lf.stats());
      stagePng = `${shotBase}-stage${STAGE}.png`;
      await page.screenshot({ path: stagePng });
    }

    // FPS + Draw-Calls im Live-Lauf (Stufe bleibt aktiv).
    await page.evaluate(() => { window.__game.scene.resume("run"); });
    await page.waitForTimeout(300);
    const run = await page.evaluate(async ({ seconds, target }) => {
      const startFrame = window.__game.loop.frame;
      const start = performance.now();
      const samples = [];
      await new Promise((resolve) => {
        const spawnTimer = setInterval(() => {
          const active = window.__lf.stats().enemies;
          if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
          // Bosskampf Minute 25 halten (minimal-LOD, siehe oben).
          const sc = window.__game.scene.getScene("run");
          if (sc.bosses && !sc.bosses.hasAliveBoss()) window.__lf.spawnBoss(4);
          samples.push(active);
        }, 50);
        setTimeout(() => { clearInterval(spawnTimer); resolve(); }, seconds * 1000);
      });
      const elapsed = performance.now() - start;
      const frames = window.__game.loop.frame - startFrame;
      return {
        fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
        frames,
        elapsedMs: Math.round(elapsed),
        avgEnemies: samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0,
        minEnemies: samples.length ? Math.min(...samples) : 0,
      };
    }, { seconds: SECONDS, target: TARGET });
    const draw = await page.evaluate(() => window.__drawSummary());

    // Renderer-String (eigener Offscreen-GL-Kontext, gleiche GPU).
    const renderer = await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      if (!gl) return { renderer: "none", vendor: "none" };
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
        vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
      };
    });

    const entry = {
      profile: prof,
      renderer,
      damped: {
        stats: {
          time: dampedStats.time, enemies: dampedStats.enemies, kills: dampedStats.kills,
          fxAlpha: dampedStats.fxAlpha, lodLevel: dampedStats.lod?.level,
          bossAlive: dampedStats.bossAlive,
        },
        png: dampedPng,
        pixels: analyzeShot(dampedPng),
      },
      stage: STAGE > 0 && stageStats ? {
        stats: {
          time: stageStats.time, enemies: stageStats.enemies, kills: stageStats.kills,
          fxAlpha: stageStats.fxAlpha, lodLevel: stageStats.lod?.level,
        },
        png: stagePng,
        pixels: analyzeShot(stagePng),
        sameDensity: stageStats.time === dampedStats.time
          && stageStats.kills === dampedStats.kills
          && stageStats.enemies === dampedStats.enemies,
      } : null,
      fps: run,
      drawCalls: draw,
      jsErrors: errors,
    };
    report.profiles.push(entry);
    if (entry.damped.stats.lodLevel !== "minimal") {
      console.warn(`WARNUNG ${prof.label}: lod=${entry.damped.stats.lodLevel} (minimal erwartet — 0,5-Daempfung greift nur dort)`);
    }
    console.log(`${prof.label}: fps=${run.fps} draws=${draw.drawsMedian} lod=${entry.damped.stats.lodLevel} fxAlpha=${entry.damped.stats.fxAlpha} nearWhiteA7Crop=${entry.damped.pixels.nearWhiteA7CropPct}%${entry.stage ? ` -> stage: ${entry.stage.pixels.nearWhiteA7CropPct}%` : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const out = `${PREFIX}.json`;
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(`JSON: ${out}`);
if (report.profiles.some((p) => p.jsErrors.length > 0)) {
  console.error("JS-Fehler:", JSON.stringify(report.profiles.flatMap((p) => p.jsErrors)));
  process.exit(1);
}
