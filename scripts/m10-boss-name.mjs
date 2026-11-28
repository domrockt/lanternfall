// Lane m10-boss-name-legibility K1: M25-Chaos-Repro für Befund B3
// (Boss-Name über der HP-Leiste im M25-Chaos unlesbar) + EINMALige Diagnose
// Layering-vs-Kontrast + Baseline-Messung (Lehre 08:33: Baseline ist Wegpunkt).
//
// Aufruf: node scripts/m10-boss-name.mjs <mode>   (mode: before | after | diag, Default: diag)
//   before/diag: Chaos-Repro + before-Shots + Metrik + Layering-Diagnose (Gegner
//                einmal ausblenden -> Referenz-Deckung; Abweichung = Layering).
//   after:       gleicher Repro nach dem Fix (Metrik + Shots).
//
// Repro übernimmt die M25-Kommandos aus der Sightprep-Lane (m25 in
// ~/tmp/m10-sightprep-smoke/k2-shots.mjs): skipTo 1490, god, ember/frost Lv8,
// 80x horror. Belege: ~/games/.evidence/m10-boss-name-legibility/.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const MODE = process.argv[2] ?? "diag";
const OUT = "/home/ai/games/.evidence/m10-boss-name-legibility";
const FORMATS = [
  { label: "960x540", cssW: 960, cssH: 540 },
  { label: "640x360", cssW: 640, cssH: 360 },
];

// Liest Pixel im Textband/Leistenband aus dem Spiel-Canvas (Phaser-WebGL-
// Snapshot, da drawImage auf WebGL-Canvas nach dem Frame leer ist) und zählt
// Amber-Glyphe-Pixel (Boss-Name, 0xffb84d) bzw. dunkle Leisten-Pixel.
const measureBand = () => {
  const ui = window.__game.scene.getScene("ui");
  const name = ui.bossName;
  const bounds = name.getBounds();
  const canvas = window.__game.canvas;
  const k = canvas.width / window.__game.scale.width;
  return new Promise((resolve) => {
    window.__game.renderer.snapshot((img) => {
      const off = document.createElement("canvas");
      off.width = canvas.width;
      off.height = canvas.height;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, off.width, off.height);
      const rx = Math.round(bounds.x * k);
      const ry = Math.round(bounds.y * k);
      const rw = Math.max(1, Math.round(bounds.width * k));
      const rh = Math.max(1, Math.round(bounds.height * k));
      const imgData = ctx.getImageData(rx, ry, rw, rh).data;
      let amber = 0;
      let dark = 0; // Leisten-/Platten-Farbe (ink)
      let other = 0;
      const hist = {};
      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
        const key = `${r >> 4},${g >> 4},${b >> 4}`;
        hist[key] = (hist[key] ?? 0) + 1;
        if (r > 200 && g > 130 && g < 210 && b < 110) amber++;
        else if (r < 60 && g < 60 && b < 60) dark++;
        else other++;
      }
      const total = rw * rh;
      const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([key, n]) => ({ bucket16: key, n }));
      resolve({
        rect: { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height },
        canvasW: canvas.width, canvasH: canvas.height,
        text: name.valueText,
        amberPx: amber, darkPx: dark, otherPx: other, totalPx: total,
        amberCoverage: Number((amber / total).toFixed(4)),
        topColors: top,
      });
    });
  });
};

ensureBuild();
mkdirSync(OUT, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const results = [];
const errors = [];
try {
  for (const fmt of FORMATS) {
    const context = await browser.newContext({
      viewport: { width: fmt.cssW, height: fmt.cssH },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.label}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);

    // M25-Chaos wie Sightprep-Lane (m25-Repro).
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.skipTo(1490);
      window.__lf.addWeapon("ember", 8);
      window.__lf.addWeapon("frost", 8);
      window.__lf.spawnEnemy("horror", 80);
    });
    await page.waitForFunction(() => {
      const ui = window.__game.scene.getScene("ui");
      return ui.bossGroup.visible && ui.bossName.valueText.length > 3;
    }, { timeout: 20000 });
    await page.waitForTimeout(1200);

    const renderer = await page.evaluate(() => window.__lf.rendererInfo().renderer);
    const state = await page.evaluate(() => {
      const s = window.__lf.state();
      return { scene: s.scene, time: Math.round(s.time), enemies: s.enemies, fps: s.fps };
    });

    // Vorher-Chaos-Shot (Seite-Rendering, wie es der Spieler sieht).
    await page.screenshot({ path: `${OUT}/m10-boss-name-${MODE}-${fmt.label}.png` });

    const chaos = await page.evaluate(measureBand);

    // Diagnose (einmalig im selben Repro): Gegner ausblenden -> Referenz.
    let diag = null;
    let ref = null;
    if (MODE !== "after") {
      await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        for (const e of run.enemies.active) e.sprite.setVisible(false);
      });
      await page.waitForTimeout(250);
      ref = await page.evaluate(measureBand);
      await page.screenshot({ path: `${OUT}/m10-boss-name-${MODE}-${fmt.label}-noenemy.png` });
      // Layering-Urteil: Deckt der Chaos-Name die Referenz-Glyphe-Flaeche?
      // ratio ~1 -> Text liegt OBEN (Kontrastproblem); ratio << 1 -> Gegnerpixel
      // ueberdecken den Text (Layering-Problem).
      const ratio = ref.amberPx > 0 ? Number((chaos.amberPx / ref.amberPx).toFixed(3)) : 0;
      diag = { refAmberPx: ref.amberPx, chaosAmberPx: chaos.amberPx, chaosVsRef: ratio };
    }
    results.push({ format: fmt.label, renderer, state, chaos, ref, diag, label: MODE });
    console.log(`${MODE} ${fmt.label}: text="${chaos.text}" amber=${chaos.amberPx}/${chaos.totalPx} diag=${JSON.stringify(diag)} renderer=${renderer}`);
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(`${OUT}/m10-boss-name-${MODE}.json`, JSON.stringify({ mode: MODE, results, jsErrors: errors }, null, 2));
console.log(`JSON -> ${OUT}/m10-boss-name-${MODE}.json; jsErrors=${errors.length}`);
