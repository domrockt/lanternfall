#!/usr/bin/env node
// M10-enemy-frame-cadence: Sicht-Beleg — Lauf-Frame-Zyklus eines 4-Frame-Gegners.
// GIF 640x360 (native Aufloesung) + Log der am Sprite stehenden Frame-Keys.
// Beweisziel: Ritter (4-Frame-Typ) nutzt zyklisch F0..F3 (enemy_knight,
// _2, _3, _4) — vor dem Fix wurden nur F0/F1 gezeigt bzw. fuer die meisten
// Gegner gar kein Frame-Wechsel ausgeloest (SPRITE_FRAMES-Lookup nach
// falschem Key).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
// Spiel ist nativ 640x360 (GAME_WIDTH/HEIGHT) -> Viewport 1:1, kein Skalieren.
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const frames = "~/tmp/m10-enemy-frame-cadence/frames".replace("~", process.env.HOME);
rmSync(frames, { recursive: true, force: true });
mkdirSync(frames, { recursive: true });
const log = [];
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=42`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true); // Spieler bleibt unangetastet, kein Hit-Stop/Flash
    window.__lf.spawnEnemy("knight", 1); // 4-Frame-Typ, 340 hp (stirbt nicht sofort)
  });
  await page.waitForTimeout(450); // Start-FadeIn (220 ms) abwarten, GIF nicht abdunkeln
  // 2 s bei ~15 fps Aufnahme; 6 fps Spielzyklus -> jeder Frame 2-3x sichtbar.
  for (let i = 0; i < 30; i++) {
    const sample = await page.evaluate(() => {
      const open = window.__lf.state().levelUpOpen;
      if (open) window.__lf.pickLevelUp(0);
      const frames = (globalThis.__lfEnemyFrames ?? (() => []))();
      // Nachspawnen, falls der Ritter doch stirbt: Zyklus muss durchlaufend bleiben.
      if (!frames.some((e) => e.id === "knight")) window.__lf.spawnEnemy("knight", 1);
      return frames;
    });
    const kn = sample.filter((e) => e.id === "knight").map((e) => `${e.frame}@${e.sx},${e.sy}`);
    log.push({ shot: i, knightFrames: kn, onScreen: sample.length });
    await page.screenshot({ path: `${frames}/f${String(i).padStart(3, "0")}.png` });
    await page.waitForTimeout(66);
  }
  await page.screenshot({ path: "shots/m10-enemy-frame-cadence-last.png" });
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", "15", "-i", `${frames}/f%03d.png`,
    "-vf", "split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];[s1][p]paletteuse=dither=none",
    "shots/m10-enemy-frame-cadence-run.gif"], { stdio: ["ignore", "ignore", "inherit"] });
} finally {
  await browser.close();
  server.stop();
}
// PNG-Frames bleiben bewusst liegen (~/tmp/m10-enemy-frame-cadence/frames),
// damit die Zoom-Montage daraus geschnitten werden kann.
writeFileSync("shots/m10-enemy-frame-cadence-run.json",
  `${JSON.stringify({ jsErrors: errors, samples: log }, null, 2)}\n`);

// Zoom-Montage (4x, 400 % nearest): erster Treffer je Frame-Key, Crop um den
// Ritter. Kalibrierung: die Hook-Position liest die Kamera zur Update-Zeit,
// das Renderbild folgt dem Player-Container mit leichtem Versatz (+79/+4 px,
// an f20 des Laufs gemessen). Labels F0..F3 nach SPRITE_FRAMES-Reihenfolge.
const seen = {};
for (const s of log) {
  for (const v of s.knightFrames) {
    const [f, pos] = v.split("@");
    if (!seen[f]) seen[f] = { shot: s.shot, pos: pos.split(",").map(Number) };
  }
}
const CAL_X = 79, CAL_Y = 4;
const crops = [];
for (const [f, { shot, pos }] of Object.entries(seen)) {
  const cx = pos[0] + CAL_X, cy = pos[1] + CAL_Y;
  const idx = f === "enemy_knight" ? 0 : Number(f.split("_").pop()) - 1; // Keys 1-basiert: _2.._4 -> F1..F3
  const out = `${frames}/crop-${f}.png`;
  execFileSync("convert", [`${frames}/f${String(shot).padStart(3, "0")}.png`,
    "-crop", `72x72+${cx - 36}+${cy - 36}`, "+repage", "-scale", "400%",
    "-bordercolor", "black", "-border", "1",
    "-background", "black", "-fill", "white", "-pointsize", "20",
    `label:F${idx} = ${f}`, "-append", out]);
  crops.push(out);
}
execFileSync("montage", [...crops, "-tile", "4x1", "-geometry", "+8+8",
  "-background", "black", "shots/m10-enemy-frame-cadence-frames.png"]);
console.log("knight frame keys ueber die Zeit:");
for (const s of log) console.log(`  f${s.shot}: [${s.knightFrames.join(", ") || "-"}] onScreen=${s.onScreen}`);
const keys = new Set(log.flatMap((s) => s.knightFrames.map((v) => v.split("@")[0])));
console.log(keys.size ? "distinct frames: " + [...keys].join(", ") : "KEINE SAMPLES");
console.log(errors.length ? "JS ERRORS:\n" + errors.join("\n") : "no JS errors");
