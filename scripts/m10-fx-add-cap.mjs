#!/usr/bin/env node
// M10-A4-Nachzug (Bedarfsmeldung m10-android-perf, 2026-11-27): ADD-Partikel
// (Glows) sind der teuerste FX-Anteil im Minute-25-Chaos-Frame bei 780x360@3.
// Dieses Skript friert die Messbasis ein: aktive ADD-Sprites je Klasse
// (fx-Pool / Partikel-Pool / Rest der Display-Liste), ihre Screengroesse
// (Device-Pixel) und Overdraw-Pixel. KEIN FPS-Langlauf -> ohne flock starten.
//
//   node scripts/m10-fx-add-cap.mjs --out shots/m10-fx-add-cap-baseline.json
//   node scripts/m10-fx-add-cap.mjs --out shots/m10-fx-add-cap-after.json
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const num = (name, fallback) => {
  const v = Number(argOf(name, fallback));
  return Number.isFinite(v) ? v : fallback;
};

const OUT = String(argOf("out", "shots/m10-fx-add-cap-baseline.json"));
const TARGET_ENEMIES = Math.max(1, Math.floor(num("enemies", 500)));
const SAMPLES = Math.max(1, Math.floor(num("samples", 12)));
const VIEWPORT_ARG = String(argOf("viewport", "780x360")).split("x").map(Number);
const VIEW = { width: VIEWPORT_ARG[0] || 780, height: VIEWPORT_ARG[1] || 360, dpr: num("dpr", 3) };
const SHOT = argOf("shot", null);

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

ensureBuild();
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

const clearLevelUps = async (page) => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

/** Truhen-Panel schliessen (pausiert den Run und verdeckt die Szene). */
const clearChests = async (page) => {
  for (let i = 0; i < 10; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().chestOpen))) break;
    await page.keyboard.press("a");
    await page.waitForTimeout(350);
  }
};

/**
 * Eine Probe: In EINEM evaluate (atomar, Single-Thread) werden FX-Pool,
 * Partikel-Pool und die restliche Display-Liste ausgelesen. ADD = Phaser
 * BlendModes.ADD. Screengroesse in Device-Pixel: displayWidth * backingStore/
 * interne Breite (Backstore = intern * dpr).
 */
async function sample(page, target) {
  return page.evaluate((targetEnemies) => {
    const scene = window.__game.scene.getScene("run");
    const scale = window.__game.scale;
    const combat = scene.combat;
    const canvas = document.querySelector("canvas");
    // Backing-Store / interne Breite = Device-Pixel je Spielpixel
    const deviceScale = canvas && scale.width ? canvas.width / scale.width : window.devicePixelRatio || 1;
    const internalArea = scale.width * scale.height;

    // 500-Gegner-Frame: Defizit VOR dem Zaehlen nachziehen (Worst-Case-Deckel).
    const enemiesBefore = scene.enemies?.count ?? 0;
    const deficit = Math.max(0, targetEnemies - enemiesBefore);
    if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
    const enemies = scene.enemies?.count ?? enemiesBefore;

    const classify = (list, cls) => {
      const rows = [];
      for (const fx of list) {
        const s = fx.sprite;
        // Unsichtbare gepoolte Sprites kosten keine Fuellrate -> nicht zaehlen.
        if (s.visible === false || (s.alpha ?? 1) <= 0) continue;
        const w = Math.max(0, s.displayWidth ?? s.width ?? 0);
        const h = Math.max(0, s.displayHeight ?? s.height ?? 0);
        rows.push({
          cls,
          texture: fx.frames?.[0] ?? s.texture?.key ?? "?",
          add: s.blendMode === Phaser.BlendModes.ADD,
          glow: fx.glow === true,
          alpha: Math.round((s.alpha ?? 1) * 1000) / 1000,
          wCss: Math.round(w * 10) / 10,
          hCss: Math.round(h * 10) / 10,
          wDev: Math.round(w * deviceScale),
          hDev: Math.round(h * deviceScale),
          overdrawDev: Math.round(w * deviceScale) * Math.round(h * deviceScale),
        });
      }
      return rows;
    };

    // Restliche Display-Liste (nicht in den FX-Pools): rekursiv Container.
    // Nur SICHTBARE Sprites; gepoolte unsichtbare auras/overlays kosten nichts.
    const poolSprites = new Set();
    for (const fx of combat.fx.active) poolSprites.add(fx.sprite);
    for (const p of combat.particles.active) poolSprites.add(p.sprite);
    const others = [];
    const walk = (children) => {
      if (!children) return;
      for (const c of children) {
        if (c.isContainer) {
          walk(c.list);
          continue;
        }
        if (poolSprites.has(c) || c.isRectangle || c.type === "Shape") continue;
        if (c.visible === false || (c.alpha ?? 1) <= 0) continue;
        if (c.blendMode === Phaser.BlendModes.ADD) {
          const w = Math.max(0, c.displayWidth ?? c.width ?? 0);
          const h = Math.max(0, c.displayHeight ?? c.height ?? 0);
          others.push({
            cls: "other",
            texture: c.texture?.key ?? "?",
            frame: typeof c.frame?.name === "string" ? c.frame.name : "",
            depth: Math.round(c.depth),
            add: true,
            glow: false,
            alpha: Math.round((c.alpha ?? 1) * 1000) / 1000,
            wCss: Math.round(w * 10) / 10,
            hCss: Math.round(h * 10) / 10,
            wDev: Math.round(w * deviceScale),
            hDev: Math.round(h * deviceScale),
            overdrawDev: Math.round(w * deviceScale) * Math.round(h * deviceScale),
          });
        }
      }
    };
    walk(scene.children?.list);

    const rows = [
      ...classify(combat.fx.active, "fx"),
      ...classify(combat.particles.active, "particles"),
      ...others,
    ];
    const budget = combat.fx.glowUsed !== undefined
      ? { cap: combat.fx.glowCap ?? null, used: combat.fx.glowUsed ?? null }
      : null;

    const aggregate = (cls) => {
      const rs = rows.filter((r) => r.cls === cls);
      const add = rs.filter((r) => r.add);
      return {
        total: rs.length,
        addCount: add.length,
        alphaLt1: rs.filter((r) => r.alpha < 1).length,
        overdrawDevPx: rs.filter((r) => r.add).reduce((a, r) => a + r.overdrawDev, 0),
        overdrawScreenPercent:
          Math.round((rs.filter((r) => r.add).reduce((a, r) => a + r.overdrawDev, 0) / internalArea) * 1000) / 10,
        maxWDev: add.reduce((a, r) => Math.max(a, r.wDev), 0),
        maxHDev: add.reduce((a, r) => Math.max(a, r.hDev), 0),
        textures: [...new Set(add.map((r) => r.texture))],
      };
    };

    return {
      enemies,
      lodLevel: scene.lod?.level ?? null,
      deviceScale: Math.round(deviceScale * 100) / 100,
      internal: [scale.width, scale.height],
      dpr: window.devicePixelRatio || 1,
      glowBudget: budget,
      fx: aggregate("fx"),
      particles: aggregate("particles"),
      other: aggregate("other"),
      all: {
        addCount: rows.filter((r) => r.add).length,
        alphaLt1OrAdd: rows.filter((r) => r.add || r.alpha < 1).length,
        overdrawDevPx: rows.filter((r) => r.add).reduce((a, r) => a + r.overdrawDev, 0),
      },
      rows,
    };
  }, target);
}

let result;
try {
  const page = await browser.newPage({ viewport: { width: VIEW.width, height: VIEW.height }, deviceScaleFactor: VIEW.dpr });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.evaluate(({ evolutions, passives }) => {
      const run = window.__lf;
      run.god(true);
      run.autoPlay(true);
      for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) run.addWeapon(id, 8);
      for (const id of evolutions) run.addWeapon(id, 8);
      for (const id of passives) run.addPassive(id, 5);
      run.skipTo(1490);
      run.setTimeScale(1);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES });
    await page.waitForTimeout(6000);
    await clearLevelUps(page);
    await clearChests(page);

    // Chaos-Frame herstellen: 500 Gegner halten (Worst-Case-Deckel), dann
    // SAMPLES Proben ueber ~2 s, damit Streuung sichtbar wird.
    const samples = [];
    for (let i = 0; i < SAMPLES; i++) {
      samples.push(await sample(page, TARGET_ENEMIES));
      await page.waitForTimeout(150);
    }
    const filled = samples.filter((s) => s.enemies >= TARGET_ENEMIES * 0.95);
    const use = filled.length ? filled : samples;

    const avg = (fn) => Math.round(use.reduce((a, s) => a + fn(s), 0) / use.length * 10) / 10;
    const max = (fn) => Math.round(Math.max(...use.map((s) => fn(s))) * 10) / 10;
    const sum = (fn) => Math.round(use.reduce((a, s) => a + fn(s), 0) / use.length);

    // M10-perf-cap-rollback: Renderer-String (SwiftShader-Belege ungueltig) +
    // Reglerstufe des DPR-Budget-Reglers (Teil C: bleibt 1 auf iGPU).
    const gpu = await page.evaluate(() => {
      const gl = window.__game?.renderer?.gl;
      if (!gl) return { renderer: null, vendor: null };
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
        vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
      };
    });
    const renderScale = await page.evaluate(() => Number(window.__rbDbg?.scale ?? 1));

    // Optionaler Sicht-Beleg (png): grosse Feuer-/Aura-Glows im Chaos-Frame.
    if (SHOT) {
      await clearLevelUps(page);
      await clearChests(page);
      await page.waitForTimeout(800);
      await page.screenshot({ path: SHOT });
    }

    result = {
      suite: "fx-add-cap",
      when: new Date().toISOString(),
      viewport: VIEW,
      gpu,
      renderScale,
      scenario: { seed: 1, minute: 25, god: true, autoPlay: true, targetEnemies: TARGET_ENEMIES },
      samplesTaken: samples.length,
      samplesFilled: filled.length,
      summary: {
        enemies: avg((s) => s.enemies),
        lodLevel: use[0].lodLevel,
        glowBudget: use[0].glowBudget,
        fx: {
          addCount: avg((s) => s.fx.addCount),
          overdrawDevPx: sum((s) => s.fx.overdrawDevPx),
          overdrawScreenPercent: avg((s) => s.fx.overdrawScreenPercent),
          maxWDev: max((s) => s.fx.maxWDev),
          maxHDev: max((s) => s.fx.maxHDev),
        },
        particles: {
          addCount: avg((s) => s.particles.addCount),
          overdrawDevPx: sum((s) => s.particles.overdrawDevPx),
          overdrawScreenPercent: avg((s) => s.particles.overdrawScreenPercent),
          maxWDev: max((s) => s.particles.maxWDev),
          maxHDev: max((s) => s.particles.maxHDev),
        },
        other: {
          addCount: avg((s) => s.other.addCount),
          overdrawDevPx: sum((s) => s.other.overdrawDevPx),
          overdrawScreenPercent: avg((s) => s.other.overdrawScreenPercent),
        },
        all: {
          addCount: avg((s) => s.all.addCount),
          alphaLt1OrAdd: avg((s) => s.all.alphaLt1OrAdd),
          overdrawDevPx: sum((s) => s.all.overdrawDevPx),
        },
      },
      perSample: samples.map((s) => ({
        enemies: s.enemies,
        fxAdd: s.fx.addCount, fxOverdraw: s.fx.overdrawDevPx,
        particleAdd: s.particles.addCount, particleOverdraw: s.particles.overdrawDevPx,
        otherAdd: s.other.addCount, otherOverdraw: s.other.overdrawDevPx,
        allAdd: s.all.addCount, allAlphaLt1OrAdd: s.all.alphaLt1OrAdd,
      })),
      // Groesste ADD-Sprites der letzten Probe (Diagnose, welche Glows teuer sind)
      topOverdraw: samples[samples.length - 1].rows
        .filter((r) => r.add)
        .sort((a, b) => b.overdrawDev - a.overdrawDev)
        .slice(0, 15)
        .map(({ cls, texture, frame, depth, wDev, hDev, overdrawDev, alpha, glow }) =>
          ({ cls, texture, frame: frame ?? "", depth: depth ?? null, wDev, hDev, overdrawDev, alpha, glow })),
      jsErrors: errors,
    };
  } finally {
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

mkdirSync("shots", { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result.summary, null, 2));
process.exit(result.jsErrors.length === 0 ? 0 : 1);
