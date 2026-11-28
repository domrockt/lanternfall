#!/usr/bin/env node
// M10-m25-density-mode (K3): Host-Gegenprobe zur Minute-25-Dichte — Befund 3 aus
// docs/lanes/m10-v10-gate-guard.md: lokal hält der Minute-25-Worst-Case nur avg ~60
// statt 300 Gegner, weil der AutoPlay-Bot auf Host-CPU schneller räumt als das
// 50-ms-Top-up füllt. Hebel: Waffen-Deaktivierung im Messfenster
// (window.__lf.setWeaponsEnabled(false), Gate im Waffen-Feuer-Pfad) — NUR
// Messwerkzeug, kein Spielverhalten im Normalbetrieb (Default bitgleich,
// tests/m25-density-mode.test.ts).
//
// Ablauf (eine 30x-Beschleunigungsphase über die letzten 10 SPIELminuten, daher
// "10-min-Lauf"; Top-up-Methodik wie m10-v10-gate.mjs / m10-v10-device-m25.mjs):
//   Phase A (Flag AUS, Minute 18-20): 50-ms-Top-up auf 300 — erwartet avg << 250
//            (Befund-Reproduktion: Bot räumt schneller als das Top-up füllt).
//   Minute 20: window.__lf.setWeaponsEnabled(false) (bleibt an bis Run-Ende;
//            Reset-Pfad dokumentiert in src/debug.ts).
//   Phase B (Minute 24:50-29:50 = Minute-25-Fenster): 50-ms-Top-up auf 300,
//            Frame-Samples dt/Gegner — ABNAHME: avg Gegner >= 250 + worstFrameMs.
//
// bewusste Ausnahme: eternal_winter wird NICHT gesetzt — die Aura ist ein Dauer-
// Effekt außerhalb des Feuer-Pfads und würde die Dichte auch bei aktivem Flag
// senken (sonst identisches Waffen-/Passive-Set wie das Device-Gate K2).
//
// Aufruf (FPS/Echtzeit => Mess-Sperre):
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-m25-density.mjs \
//     --out shots/m10-m25-density.json
// Exit-Codes: 0 = Abnahme PASS (avg >= 250 im Minute-25-Fenster), 1 = FAIL,
// 2 = Renderer ungültig (SwiftShader, Regel 6, 2026-11-28).
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { ensureBuild, startServer, loadPlaywright, startRun } = await import("./harness.mjs");

  const argv = process.argv.slice(2);
  const arg = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const OUT = arg("out", "shots/m10-m25-density.json");
  const TARGET = Number(arg("target", "300"));
  const ACCEPT_AVG = 250;
  const EVIDENCE = join(homedir(), "games", ".evidence", "m10-m25-density-mode");
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync("shots", { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  // Muster m10-v10-device-m25.mjs — 6 Evolutions-Waffen Lv8 + 6 Passives Lv5,
  // ohne eternal_winter (Dauer-Aura außerhalb des Feuer-Pfads, siehe Header).
  const EVOLUTIONS = ["phoenix", "wrath_pendulum", "thorn_storm", "thunder_seal", "soul_beacon"];
  const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

  ensureBuild();
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required",
    // Frame-Kosten statt VSync-Cap messen (Muster m10-v10-gate.mjs).
    "--disable-gpu-vsync", "--disable-frame-rate-limit"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const jsErrors = [];
  let renderer = null;

  let phases = null;
  try {
    page.on("pageerror", (e) => jsErrors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") jsErrors.push(m.text()); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    renderer = await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      if (!gl) return "none";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    });
    await startRun(page);
    await page.evaluate(({ evolutions, passives }) => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      window.__lf.setSuppressLevelUps(true);
      for (const id of evolutions) window.__lf.addWeapon(id, 8);
      for (const id of passives) window.__lf.addPassive(id, 5);
      window.__lf.skipTo(1080); // Minute 18
      window.__lf.setTimeScale(30);
    }, { evolutions: EVOLUTIONS, passives: PASSIVES });
    await page.waitForTimeout(3000);

    // 50-ms-Top-up-Takt (Geräte-Methodik): Defizit auf TARGET füllen.
    // Läuft von Spielminute 18 bis zur jeweiligen Zielmarke; sammelt je Frame dt + Gegner.
    const runWindow = ({ target, untilGameSec, maxRealMs, topup }) => page.evaluate(async ({ target, untilGameSec, maxRealMs, topup }) => {
      const start = performance.now();
      let frames = 0;
      let last = start;
      let worst = 0;
      let lastSpawn = start;
      let lastSample = start;
      const dts = [];
      const enemies = [];
      const gameTimes = [];
      await new Promise((resolve) => {
        const tick = (now) => {
          const dt = now - last;
          last = now;
          frames++;
          if (frames > 1) {
            worst = Math.max(worst, dt);
            dts.push(Math.round(dt * 100) / 100);
          }
          if (now - lastSample >= 100) {
            lastSample = now;
            const s = window.__lf.stats();
            enemies.push(s.enemies);
            gameTimes.push(s.time);
          }
          if (topup && now - lastSpawn >= 50) {
            lastSpawn = now;
            const active = window.__lf.stats().enemies;
            const deficit = target - active;
            if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          }
          const done = (untilGameSec !== null && window.__lf.stats().time >= untilGameSec)
            || now - start >= maxRealMs
            || !(window.__lf.state().scene === "run");
          if (done) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const avg = enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : 0;
      return {
        frames, worstFrameMs: Math.round(worst * 10) / 10,
        avgEnemies: avg, minEnemies: enemies.length ? Math.min(...enemies) : 0,
        maxEnemies: enemies.length ? Math.max(...enemies) : 0,
        samples: enemies.length,
        gameSecStart: gameTimes[0] ?? null, gameSecEnd: gameTimes[gameTimes.length - 1] ?? null,
        kills: window.__lf.stats().kills,
      };
    }, { target, untilGameSec, maxRealMs, topup });

    // Phase A (Flag AUS, Minute 18 -> 20): Befund-Reproduktion.
    const phaseA = await runWindow({ target: TARGET, untilGameSec: 1200, maxRealMs: 12000, topup: true });

    // Minute 20: Waffen-Feuer aus (Mess-Hebel, bleibt an; Reset: setWeaponsEnabled(true)/Reload).
    const flagState = await page.evaluate(() => window.__lf.setWeaponsEnabled(false));
    if (flagState !== false) throw new Error("setWeaponsEnabled(false): Flag nicht aktiv geworden");
    const flagAtGameSec = await page.evaluate(() => window.__lf.stats().time);

    // Übergang (Minute 20 -> 24:50): Top-up läuft weiter, Projektile/Burns/Orbs
    // aus der Flag-an-Phase laufen bei 30x innerhalb weniger Sekunden aus.
    const settle = await runWindow({ target: TARGET, untilGameSec: 1490, maxRealMs: 30000, topup: true });

    // Phase B (Minute-25-Fenster, Minute 24:50 -> 29:50): verbindliche Messung.
    await page.screenshot({ path: "shots/m10-m25-density-minute25.png" });
    await page.screenshot({ path: join(EVIDENCE, `minute25-${stamp}.png`) });
    const phaseB = await runWindow({ target: TARGET, untilGameSec: 1790, maxRealMs: 20000, topup: true });
    const flagStillOff = await page.evaluate(() => window.__lf.weaponsEnabled() === false);
    const finalScene = await page.evaluate(() => window.__lf.state().scene);

    phases = {
      flagAtGameSec: Math.round(flagAtGameSec),
      flagStillOffAtEnd: flagStillOff,
      finalScene,
      phaseA_flagAus: {
        ...phaseA,
        note: "Befund-Reproduktion (m10-v10-gate-guard Befund 3): Bot räumt schneller als das 50-ms-Top-up füllt",
        killsDelta: phaseA.kills,
      },
      settle_flagAn: { gameSecStart: settle.gameSecStart, gameSecEnd: settle.gameSecEnd, avgEnemies: settle.avgEnemies, kills: settle.kills },
      phaseB_flagAn: {
        ...phaseB,
        killsDelta: phaseB.kills - settle.kills,
        note: "Minute-25-Fenster: Top-up wie Gate/Device, Waffen-Feuer deaktiviert",
      },
    };
    console.log(JSON.stringify({
      renderer,
      flagAtGameSec: phases.flagAtGameSec,
      phaseA_avg: phaseA.avgEnemies,
      phaseB_avg: phaseB.avgEnemies,
      phaseB_worstFrameMs: phaseB.worstFrameMs,
      phaseB_killsDelta: phases.phaseB_flagAn.killsDelta,
      jsErrors: jsErrors.length,
    }, null, 2));
  } catch (e) {
    phases = { error: String(e), phaseA_flagAus: null, phaseB_flagAn: null };
    console.error(String(e));
  } finally {
    try { await page.close(); } catch { /* Target page closed ist ok */ }
    try { await browser.close(); } catch { /* dito */ }
    server.stop();
  }

  const ran = phases !== null && phases.phaseB_flagAn !== null;
  const b = phases?.phaseB_flagAn ?? null;
  // Bekanntes 30x-Harness-Artefakt (nicht gameplay-relevant, nicht flag-abhängig):
  // "Texture key already in use" aus dem GroundRenderer-Chunk-Pool bei Textur-
  // Churn unter timeScale 30 (Phase A läuft mit Flag AUS über denselben Inhalt).
  // Der strenge js-errors-0-Tor gehört zu m10-v10-gate.mjs (timeScale 1) und
  // lief dort PASS; hier zählt nur der Dichte-Beleg.
  const TEXTURE_WARN = /^Texture key already in use/;
  const jsErrorsHard = jsErrors.filter((e) => !TEXTURE_WARN.test(e));
  const jsTextureWarnings = jsErrors.filter((e) => TEXTURE_WARN.test(e));
  const passed = Boolean(b) && b.avgEnemies >= ACCEPT_AVG && b.minEnemies >= 200
    && jsErrorsHard.length === 0 && phases.flagStillOffAtEnd && phases.phaseB_flagAn.killsDelta === 0;
  // Regel 6, 2026-11-28: SwiftShader-Belege sind ungültig (Exit 2).
  const rendererInvalid = ran && (!renderer || /swiftshader|llvmpipe|softpipe|software|angle \(google|none/i.test(renderer));
  const report = {
    gate: "m25-density-mode (Host-Gegenprobe, Befund 3 m10-v10-gate-guard)",
    at: new Date().toISOString(),
    renderer,
    acceptance: `avg Gegner >= ${ACCEPT_AVG} im Minute-25-Fenster (Spielminuten 24:50-29:50, timeScale 30, 50-ms-Top-up auf ${TARGET})`,
    method: {
      timeScale: 30,
      topupMs: 50,
      targetEnemies: TARGET,
      weapons: "5 Evolutions-Waffen Lv8 + 6 Passives Lv5, OHNE eternal_winter (Dauer-Aura außerhalb des Feuer-Pfads)",
      flag: "window.__lf.setWeaponsEnabled(false) ab Spielminute 20 (Reset: setWeaponsEnabled(true)/Reload)",
    },
    phases,
    jsErrors,
    jsErrorsHard,
    jsTextureWarnings,
    passed,
    exitCode: rendererInvalid ? 2 : passed ? 0 : 1,
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  const evidenceOut = join(EVIDENCE, `density-${stamp}.json`);
  try { copyFileSync(OUT, evidenceOut); } catch { /* Beleg-Kopie ist optional */ }
  console.log(`JSON -> ${OUT} (Kopie: ${evidenceOut})`);
  process.exit(rendererInvalid ? 2 : ran && passed ? 0 : 1);
}
