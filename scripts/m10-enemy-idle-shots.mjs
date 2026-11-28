#!/usr/bin/env node
// M10-enemy-idle-anim-r2 K4: Sicht-Beleg — Elite-Idle/Bob im echten Run.
// Beweisziel: Elite-Gegner (Rim-Frameset) wechseln live zwischen
// "<sprite>_rim" (Ruhepose) und "<sprite>_rim2" (Bob-Pose) — vorher Standbild
// (genau 1 Rim-Frame, K1-Befund).
// GIF + JSON: Belege nach ~/games/.evidence/m10-enemy-idle-anim-r2/ und
// Abnahme-PNG nach shots/m10-enemy-idle-abnahme.png.
// Aufruf: node scripts/m10-enemy-idle-shots.mjs
import { mkdirSync, rmSync, writeFileSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const frames = `${homedir()}/tmp/m10-enemy-idle-anim-r2/frames`;
const evidence = `${homedir()}/games/.evidence/m10-enemy-idle-anim-r2`;
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
mkdirSync(evidence, { recursive: true });
const log = [];
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=42`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true); // dauerhaft: kein Level-up-Dialog (pausiert die Sim)
    // Deterministische Debug-Elites (K4-Freischaltung: spawnEnemy reicht elite durch).
    window.__lf.spawnEnemy("mudling", 4, true);
    window.__lf.spawnEnemy("bog_rat", 2, true);
  });
  // Warten, bis ein Elite ins Sample-Fenster von __lfEnemyFrames gelaufen ist.
  await page.waitForFunction(
    () => (globalThis.__lfEnemyFrames ?? (() => []))().some((e) => e.id.endsWith("_rim")),
    null, { timeout: 90000 },
  );
  // 2,4 s bei ~15 fps Aufnahme; 6 fps Zyklus -> jeder Rim-Frame 2-3x sichtbar.
  for (let i = 0; i < 36; i++) {
    const sample = await page.evaluate(() => {
      const open = window.__lf.state().levelUpOpen;
      if (open) window.__lf.pickLevelUp(0);
      return (globalThis.__lfEnemyFrames ?? (() => []))();
    });
    const elites = sample.filter((e) => e.id.endsWith("_rim")).map((e) => `${e.id}:${e.frame}@${e.sx},${e.sy}`);
    log.push({ shot: i, elites, onScreen: sample.length });
    await page.screenshot({ path: `${frames}/f${String(i).padStart(3, "0")}.png` });
    await page.waitForTimeout(66);
  }
  const rimSwitches = log.filter((s) => s.elites.length > 0);
  const rimIds = new Set(rimSwitches.flatMap((s) => s.elites.map((e) => e.split(":")[0])));
  const rimFramesSeen = new Set(rimSwitches.flatMap((s) => s.elites.map((e) => e.split(":")[1].split("@")[0])));
  // Anderer Rim-Frame am gleichen Screen-Slot = echter Idle-/Bob-Wechsel.
  const bySlot = {};
  for (const s of rimSwitches) {
    for (const e of s.elites) {
      const slot = e.split("@")[1];
      (bySlot[slot] ??= new Set()).add(e.split(":")[1].split("@")[0]);
    }
  }
  const slotsWithBoth = Object.entries(bySlot).filter(([, f]) => f.size >= 2).map(([slot, f]) => `${slot}:${[...f].sort().join("+")}`);
  writeFileSync(`${evidence}/m10-enemy-idle-ingame.json`, JSON.stringify({
    jsErrors: errors,
    eliteSamples: rimSwitches.length,
    rimIdsSeen: [...rimIds].sort(),
    rimFramesSeen: [...rimFramesSeen].sort(),
    slotsWithBothFrames: slotsWithBoth,
    samples: log,
  }, null, 2));
  // Abnahme-PNG: bester Frame mit Elite im Viewport (nach Vergrössern 4x in Doku referenziert).
  const best = log.findIndex((s) => s.elites.length > 0);
  if (best >= 0) copyFileSync(`${frames}/f${String(best).padStart(3, "0")}.png`, "shots/m10-enemy-idle-abnahme.png");
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "15", "-i", `${frames}/f%03d.png`,
    "-vf", "split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];[s1][p]paletteuse=dither=none",
    `${evidence}/m10-enemy-idle-ingame.gif`], { stdio: ["ignore", "ignore", "inherit"] });
  console.log(`Elite-Samples: ${rimSwitches.length}/36, Rim-IDs: ${[...rimIds].join(",") || "-"}`);
  console.log(`Rim-Frames gesehen: ${[...rimFramesSeen].join(", ") || "-"}`);
  console.log(`Slots mit beiden Rim-Frames: ${slotsWithBoth.join(" ") || "-"}`);
  if (errors.length) console.log(`JS-Fehler: ${errors.join(" | ")}`);
} finally {
  await browser.close();
  server.stop();
}
