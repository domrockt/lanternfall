#!/usr/bin/env node
// m10-damage-label-quality: Misst die aktiven Damage-Labels/Frame je
// Qualitaetsstufe (high/medium/low) im echten Run-Pfad (Lane
// m10-damage-label-quality, K1 Befund + K4 Beleg).
//
// Frage K1: Kommt damageLabelCapForQuality (maxDamageLabels 5/8/12 je Tier
// aus src/logic/quality.ts) WIRKLICH bei DamageNumbers.ts an? Der statische
// Befund (import + viewLimit-Zeile 227) sagt ja — die Probe belegt es
// verhaltensbasiert: M25-Chaos mit 300 Gegnern, Tier per CDP-CPU-Drossel
// ueber den echten Hysterese-Regler (config.ts installRenderBudget) fahren,
// aktive Labels je Frame gegen den Tier-Cap pruefen.
//
// Ablauf je Tier (gleiches Spiel, gleiche Seite):
//   high   — ohne Drossel (Start-Stufe des Reglers)
//   medium — Drossel 8x bis Regler auf medium faellt, dann Drossel aus
//            (Totzone/aboveMs friert die Stufe fuer >= 12 s — Messfenster)
//   low    — Drossel 8x bis Regler auf low faellt, Drossel bleibt an
// Je Frame: aktive Label-Rects (Screen-Space), quality aus __lf.state(),
// Gegnerzahl, FPS + WebGL-Renderer-String. JSON wird JE FRAME geflushed.
//
// Keine FPS-Gate-Messung (Labels sind der Gegenstand, kein flock).
// Belege nach ~/games/.evidence/m10-damage-label-quality/ (Dom 27.11.: Belege
// gehoeren nicht ins git). Aufruf:
//   node scripts/m10-damage-label-quality.mjs --tag=before|after
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
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
const FRAMES = Math.max(1, Number(argOf("frames", "4")));
const FRAME_GAP_MS = Number(argOf("frame-gap-ms", "300"));
const THROTTLE = Number(argOf("throttle", "20"));
const EVID_DIR = `${homedir()}/games/.evidence/m10-damage-label-quality`;
const OUT_JSON = `${EVID_DIR}/label-quality-${TAG}.json`;
const TARGET_ENEMIES = 300;

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];

// Aktive Damage-Label-Rects + Lauf-Zustand je Frame (rein lesend).
const SNAP = () => {
  const game = window.__game;
  const run = game.scene.getScene("run");
  const cam = run.cameras.main;
  const dn = run.combat?.damageNumbers;
  const labels = [];
  for (const v of dn?.views ?? []) {
    if (!v.active || !v.text?.visible) continue;
    const chars = String(v.text.value ?? "").length;
    if (chars <= 0) continue;
    const scale = v.scaleApplied || 1;
    labels.push({
      key: v.key,
      text: String(v.text.value),
      x: v.text.x - cam.scrollX,
      y: v.text.y - cam.scrollY,
      w: Math.ceil((chars * 6 - 1) * scale),
      h: Math.ceil(7 * scale),
      chars,
    });
  }
  const canvas = game.canvas;
  let renderer = null;
  try {
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER);
  } catch { /* rein lesend, egal */ }
  const state = window.__lf?.state?.() ?? {};
  const dbg = window.__rbDbg ?? {};
  return {
    labels,
    quality: state.quality ?? null,
    qualityState: dbg.qualityState ?? null,
    fps: Math.round((game.loop?.actualFps ?? 0) * 10) / 10,
    renderer,
    enemiesOnScreen: (run.enemies?.active ?? []).filter((e) => {
      const sx = e.x - cam.scrollX;
      const sy = e.y - cam.scrollY;
      return e.alive && sx >= 0 && sy >= 0 && sx <= cam.width && sy <= cam.height;
    }).length,
    enemiesTotal: run.enemies?.count ?? 0,
  };
};

const clearLevelUps = async (page) => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => Boolean(window.__lf?.stats().levelUpOpen)))) break;
    await page.evaluate(() => {
      try {
        window.__lf.pickLevelUp(0);
      } catch (e) {
        if (!window.__lf?.stats().levelUpOpen) return;
        throw e;
      }
    });
  }
};

ensureBuild();
mkdirSync(EVID_DIR, { recursive: true });
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
const result = { tag: TAG, jsErrors: errors, tiers: {} };

try {
  const page = await browser.newPage({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 3 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  const cdp = await page.context().newCDPSession(page);

  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
  });
  await page.evaluate((evolutions) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, EVOLUTIONS);
  await page.waitForTimeout(6000);
  await clearLevelUps(page);

  const topUp = async (target, id = "knight") => {
    await page.evaluate(({ t, id }) => {
      const deficit = t - window.__lf.stats().enemies;
      if (deficit > 0) window.__lf.spawnEnemy(id, deficit);
    }, { t: target, id });
    await page.waitForTimeout(400);
  };
  for (let i = 0; i < 3; i++) await topUp(TARGET_ENEMIES, "knight");
  await clearLevelUps(page);

  const waitForTier = (tier, timeoutMs) =>
    page.waitForFunction(
      (t) => window.__lf?.state?.()?.quality === t,
      tier,
      { timeout: timeoutMs, polling: 120 },
    ).then(() => true).catch(() => false);

  const captureTier = async (name) => {
    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
      await topUp(TARGET_ENEMIES, "knight");
      await topUp(TARGET_ENEMIES, "knight");
      await topUp(TARGET_ENEMIES, "knight");
      const snap = await page.evaluate(SNAP);
      const cap = { high: 12, medium: 8, low: 5 }[snap.quality] ?? null;
      frames.push({
        frame: f + 1,
        labels: snap.labels.length,
        quality: snap.quality,
        expectedCap: cap,
        capRespected: cap === null ? null : snap.labels.length <= cap,
        fps: snap.fps,
        renderer: snap.renderer,
        enemiesOnScreen: snap.enemiesOnScreen,
        enemiesTotal: snap.enemiesTotal,
        qualityState: snap.qualityState,
      });
      // Supervisor: Metriken VOR dem Screenshot-Export flushen.
      result.tiers[name] = { frames };
      writeFileSync(OUT_JSON, `${JSON.stringify({ ...result, partial: true }, null, 2)}\n`);
      await page.screenshot({ path: `${EVID_DIR}/label-quality-${TAG}-${name}-f${f + 1}.png` });
      await page.waitForTimeout(FRAME_GAP_MS);
    }
    const worst = Math.max(...frames.map((f) => f.labels));
    console.error(`[m10-damage-label-quality] ${TAG} ${name}: labels=${frames.map((f) => f.labels).join("/")} max=${worst} quality=${frames[0].quality} capRespected=${frames.every((f) => f.capRespected !== false)}`);
  };

  // --- high: ohne Drossel (Regler-Start-Stufe) -------------------------------
  if ((await waitForTier("high", 4000)) === false) {
    // Falls die Maschine langsam ist und der Regler schon runter ist: Drossel
    // aus und 12 s ueber 57 FPS warten (aboveMs), sonst ehrlich vermerken.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    result.highWaitFallback = !(await waitForTier("high", 16000));
  }
  await captureTier("high");

  // --- medium: drosseln bis der Regler runterfaellt, dann Drossel aus --------
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  result.mediumReached = await waitForTier("medium", 30000);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  await page.waitForTimeout(700); // EWMA ueber 45 heben -> Stufe friert ein
  await clearLevelUps(page);
  await captureTier("medium");

  // --- low: wieder drosseln bis low, Drossel bleibt an ------------------------
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });
  result.lowReached = await waitForTier("low", 30000);
  await clearLevelUps(page);
  await captureTier("low");

  await page.close();
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
console.log(`[m10-damage-label-quality] ${OUT_JSON} geschrieben; JS-Fehler: ${errors.length}`);
