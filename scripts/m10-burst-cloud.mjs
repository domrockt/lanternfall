#!/usr/bin/env node
// m10-burst-cloud-calm, K1/K4: Beleg-Skript fuer die burst-Tod-Klasse ("gruene
// Dither-Wolken", fx_death_blob aus BASE.burst in src/logic/death.ts).
//
//   node scripts/m10-burst-cloud.mjs --prefix shots/m10-burst-cloud-before
//
// Je Anzeige-Config 640x360@1 und 780x360@3: Startet einen Run mit Glutfunke
// (ember 8), spawnt Swarm/Splitter-Gegner (Todesklasse burst) direkt am Helden
// und macht einen Screenshot mitten in den Tod-Wolken. Belegt je Lauf:
//   - Anzahl/Scale/BlendMode/Tint aller live gerenderten fx_death_blob-Sprites
//   - WebGL-Renderer-String (SwiftShader-Belege sind ungueltig)
// Dazu je PNG eine 4x-nearest-Lupe (convert -filter point) als view_4x.
// Keine FPS-/Echtzeit-Messung -> laeuft ohne flock. Kein Sleep-Polling.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
const prefix = opt("prefix", "shots/m10-burst-cloud");
const CONFIGS = [
  { tag: "640x360@1", width: 640, height: 360, dpr: 1 },
  { tag: "780x360@3", width: 780, height: 360, dpr: 3 },
];

// Live-Sprites im Run-Scene zaehlen: fx_death_blob (burst-Shard + Dust + Rim).
const PROBE = () => {
  const scene = window.__game.scene.getScene("run");
  const kids = Array.isArray(scene.children) ? scene.children : (scene.children.list ?? []);
  const blobs = { count: 0, scaleX: [], blendModes: {}, tints: {} };
  for (const child of kids) {
    const key = child.texture?.key === "runtime_atlas" ? child.frame?.name : child.texture?.key;
    if (key !== "fx_death_blob" || !child.visible) continue;
    blobs.count++;
    blobs.scaleX.push(+child.scaleX.toFixed(2));
    const bm = String(child.blendMode);
    blobs.blendModes[bm] = (blobs.blendModes[bm] ?? 0) + 1;
    const t = "0x" + (child.tintTopLeft ?? 0).toString(16).padStart(6, "0");
    blobs.tints[t] = (blobs.tints[t] ?? 0) + 1;
  }
  return {
    renderer: window.__lf.rendererInfo(),
    state: window.__lf.state(),
    fxDeathBlob: blobs,
  };
};

const nodeRequire = (await import("node:module")).createRequire(import.meta.url);

function metricsPng(file, cssW, cssH) {
  const { execFileSync } = nodeRequire("node:child_process");
  const { readFileSync, unlinkSync, statSync } = nodeRequire("node:fs");
  const osTmp = `${nodeRequire("node:os").homedir()}/tmp/m10-burst-cloud-calm`;
  mkdirSync(osTmp, { recursive: true });
  const raw = `${osTmp}/${file.split("/").pop()}.rgb24`;
  execFileSync("ffmpeg", ["-y", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", raw], { stdio: "ignore" });
  const size = statSync(raw).size;
  const px = size / 3;
  const height = Math.round(Math.sqrt(px / (cssW / cssH)));
  const width = Math.round(px / height);
  const buf = readFileSync(raw);
  const isA7 = (r, g, b) => r >= 150 && g >= 150 && b >= 150 && r >= 235;
  const isMin200 = (r, g, b) => Math.min(r, g, b) >= 200;
  const x0 = Math.round(width * 0.25), x1 = Math.round(width * 0.75);
  const y0 = Math.round(height * 0.25), y1 = Math.round(height * 0.75);
  let a7 = 0, min200 = 0, a7Crop = 0, min200Crop = 0, cropPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const r = buf[i], g = buf[i + 1], b = buf[i + 2];
      const inCrop = x >= x0 && x < x1 && y >= y0 && y < y1;
      if (inCrop) cropPixels++;
      if (isA7(r, g, b)) { a7++; if (inCrop) a7Crop++; }
      if (isMin200(r, g, b)) { min200++; if (inCrop) min200Crop++; }
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
    cropDef: "Tod-Crop: mittleres Viertel (x 25..75 %, y 25..75 % des Frames)",
    gate: { nearWhiteA7CropPct: 4.16, definition: "A7: r,g,b >= 150 und r >= 235" },
  };
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const runs = [];
try {
  for (const cfg of CONFIGS) {
    const page = await browser.newPage({
      viewport: { width: cfg.width, height: cfg.height },
      deviceScaleFactor: cfg.dpr,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    try {
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1`);
      await startRun(page);
      await page.evaluate(() => {
        const lf = window.__lf;
        lf.god(true);
        lf.setSuppressLevelUps(true);
        lf.setFxDamping(false);
        // Glutfunke (ember) ist eine der Waffen, die burst-Klassen toeten.
        lf.addWeapon("ember", 8);
      });
      // Fuenf Spawn-Wellen Swarm/Splitter (Todesklasse burst) direkt am Helden;
      // jede Welle stirbt in ~0.2-0.4 s -> Screenshot trifft Wolken im Flug.
      for (let w = 0; w < 5; w++) {
        await page.evaluate(() => {
          window.__lf.spawnEnemy("bog_rat", 10);
          window.__lf.spawnEnemy("mudling", 6);
        });
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(60);
      await page.screenshot({ path: `${prefix}-${cfg.dpr}x.png` });
      const probe = await page.evaluate(PROBE);
      const metrics = metricsPng(`${prefix}-${cfg.dpr}x.png`, cfg.width, cfg.height);
      // 4x-nearest-Lupe als Ansichtshilfe (Anzeige, nicht Messung).
      const { execFileSync } = await import("node:child_process");
      const { homedir } = await import("node:os");
      execFileSync("convert", [
        `${prefix}-${cfg.dpr}x.png`, "-filter", "point", "-resize", "400%",
        `${prefix}-${cfg.dpr}x-view_4x.png`,
      ], { stdio: "ignore" });
      runs.push({
        tag: cfg.tag,
        file: `${prefix}-${cfg.dpr}x.png`,
        view4x: `${prefix}-${cfg.dpr}x-view_4x.png`,
        probe,
        metrics,
        jsErrors: errors,
      });
      console.log(`[m10-burst-cloud] ${cfg.tag}: blob-live=${probe.fxDeathBlob.count} scaleX-max=${Math.max(0, ...probe.fxDeathBlob.scaleX)} nearWhiteA7Crop=${metrics.nearWhiteA7CropPct}% jsErrors=${errors.length}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(`${prefix}.json`, JSON.stringify({
  generatedAt: new Date().toISOString(),
  configs: CONFIGS,
  runs,
  note: "burst-Tod-Klasse = BASE.burst in src/logic/death.ts (fx_death_blob, marshLight, additive). Beleg je Anzeige-Config.",
}, null, 2));
console.log(`[m10-burst-cloud] inventar -> ${prefix}.json`);
