// m10-evo-fx-winter, Karte 1: Ist-Beleg Ewiger Winter (Vorher).
// Stellt die Evolution-Szene nach: Ewiger Winter (addWeapon "eternal_winter" 8), 20 lebende
// Gegner, je 640x360 (@2, Viewport 1280x720) und 960x540 (@1). Misst je Lauf:
//   - WebGL-Renderer-String (SwiftShader-Belege sind ungültig)
//   - Textur-Pixelgrößen der winter-relevanten Effekt-Texturen
//   - Draw-Scale aller live gerenderten winter-relevanten Sprites (Mixel-Nachweis)
//   - Farb-Stufen der projectile_ice-/Signaturen-Texturen (Paletten-Treffer + Ink-/Rand-Anteil)
// Keine FPS-Messung -> kein flock. Einmal laufen lassen, JSON+PNG committen.
// Vorlage: scripts/m10-evo-fx-phoenix.mjs (Lane m10-evo-fx-phoenix, Commit 6b62468).
import { mkdirSync, writeFileSync, readFile } from "node:fs";
import { ensureBuild, loadPlaywright, startRun } from "./harness.mjs";
import http from "node:http";

ensureBuild();
mkdirSync("shots", { recursive: true });

// Kollisionsfreier statischer Server: Port 0 (ephemeral) statt Zufalls-Port aus
// 5400-5800 — dort laufen parallele Lane-Server, ein Bind-Rennen liefert sonst
// stillschweigend die FREMDE dist (Befund fixprobe, 28.11.).
function startServerLocal() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = req.url === "/" || req.url.startsWith("/?")
        ? "/index.html"
        : req.url.split("?")[0];
      readFile("dist" + p, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        const type = p.endsWith(".html") ? "text/html" : p.endsWith(".js") ? "text/javascript"
          : p.endsWith(".css") ? "text/css" : p.endsWith(".png") ? "image/png" : "application/octet-stream";
        res.writeHead(200, { "content-type": type });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, stop: () => server.close() }));
  });
}

const { chromium } = await loadPlaywright();
const server = await startServerLocal();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

// Winter-relevante Texturen (Aura-Ring + Projektil + Partikel + Spike-Impact + Signaturen).
const FX_KEYS = ["ring_frost", "projectile_ice", "fx_ice", "fx_shock", "fx_halo_cold", "fx_evo_hit_eternal_winter", "fx_evo_death_eternal_winter"];

const PROBE = (FX_KEYS) => {
  const scene = window.__game.scene.getScene("run");
  const out = { renderer: window.__lf.rendererInfo(), textures: {}, live: {}, colors: {}, errors: [] };
  for (const key of FX_KEYS) {
    const tex = window.__game.textures.get(key);
    if (!tex || !tex.source) continue;
    out.textures[key] = { sourceW: tex.source[0].width, sourceH: tex.source[0].height, frameW: tex.frames.__BASE.width, frameH: tex.frames.__BASE.height };
  }
  // Live-Sprites: Scale/Displaygröße aller winter-relevanten Bilder im Run-Scene.
  const counts = {};
  const kids = Array.isArray(scene.children) ? scene.children : (scene.children.list ?? []);
  for (const child of kids) {
    // Atlasierte Keys rendern als Textur "runtime_atlas" + frame.name = Key.
    const key = child.texture?.key === "runtime_atlas" ? child.frame?.name : child.texture?.key;
    if (!key || !FX_KEYS.some((k) => key === k || key.startsWith(k))) continue;
    if (!child.visible) continue;
    const rec = { scaleX: +child.scaleX.toFixed(3), scaleY: +child.scaleY.toFixed(3), dispW: Math.round(child.displayWidth), dispH: Math.round(child.displayHeight), blend: child.blendMode };
    counts[key] = (counts[key] ?? 0) + 1;
    const cur = out.live[key];
    if (!cur) { out.live[key] = { maxScaleX: rec.scaleX, maxScaleY: rec.scaleY, samples: [rec] }; }
    else {
      cur.maxScaleX = Math.max(cur.maxScaleX, rec.scaleX);
      cur.maxScaleY = Math.max(cur.maxScaleY, rec.scaleY);
      if (cur.samples.length < 8) cur.samples.push(rec);
    }
  }
  out.liveCounts = counts;
  // Farb-Stufen der Winter-Texturen: exakte Paletten-Treffer + Ink-Rand-Anteil.
  const pal = [0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xd8572f,0x8a8f7c,0x59743a,0x86983f,0xa9b063];
  const hex = (v) => "#" + v.toString(16).padStart(6, "0");
  out.colors = {};
  for (const key of ["projectile_ice", "fx_evo_death_eternal_winter", "fx_evo_hit_eternal_winter"]) {
    const tex = window.__game.textures.get(key);
    if (!tex || !tex.source) continue;
    const src = tex.source[0];
    const cv = document.createElement("canvas");
    cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext("2d");
    cx.drawImage(tex.source[0].image, 0, 0);
    const data = cx.getImageData(0, 0, cv.width, cv.height).data;
    const hist = {}; let ink = 0; let opaque = 0;
    const palHexSet = new Map(pal.map((v, i) => [hex(v), i]));
    const border = [];
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (data[i + 3] < 8) continue;
        opaque++;
        const h = hex((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        const idx = palHexSet.get(h);
        if (idx === undefined) { hist["OUTSIDE_PAL:" + h] = (hist["OUTSIDE_PAL:" + h] ?? 0) + 1; }
        else { hist["pal" + idx] = (hist["pal" + idx] ?? 0) + 1; if (idx === 0) ink++; }
        const isEdge = x === 0 || y === 0 || x === cv.width - 1 || y === cv.height - 1;
        if (isEdge && data[i + 3] >= 8) border.push({ x, y, i: palHexSet.get(h) ?? h });
      }
    }
    out.colors[key] = { width: cv.width, height: cv.height, opaque, inkPixels: ink, edgeOpaquePixels: border.length, edgeSample: border.slice(0, 12), histogram: hist };
  }
  return out;
};

const TAG = process.argv[2] ?? "before";
const configs = [
  { tag: "640", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, shot: `shots/m10-evo-fx-winter-${TAG}-640.png` },
  { tag: "960x540", viewport: { width: 960, height: 540 }, deviceScaleFactor: 1, shot: `shots/m10-evo-fx-winter-${TAG}-960.png` },
];

const results = {};
const allErrors = [];
try {
  for (const cfg of configs) {
    const page = await browser.newPage({ viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor });
    page.on("pageerror", (e) => allErrors.push(`[${cfg.tag}] ` + String(e)));
    page.on("console", (m) => { if (m.type() === "error") allErrors.push(`[${cfg.tag}] ` + m.text()); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(false);
      window.__lf.setSuppressLevelUps(true);
      window.__lf.addWeapon("eternal_winter", 8);
      window.__lf.spawnEnemy("mudling", 12);
      window.__lf.spawnEnemy("bog_rat", 8);
    });
    // Warten, bis Aura-Ring + Eisspitzen (Spikes) sichtbar sind.
    await page.waitForFunction(
      () => {
        const scene = window.__game.scene.getScene("run");
        const kids = Array.isArray(scene.children) ? scene.children : (scene.children.list ?? []);
        return kids.some((c) => {
          const key = c.texture?.key === "runtime_atlas" ? c.frame?.name : c.texture?.key;
          return key === "projectile_ice" && c.visible;
        });
      },
      { timeout: 10000 },
    );
    // Impact-Moment: Screenshot + Messung im selben Frame-Fenster.
    results[cfg.tag] = await page.evaluate(PROBE, FX_KEYS);
    results[cfg.tag].view = await page.evaluate(() => ({ configW: window.__game.config.width, configH: window.__game.config.height, zoom: window.__game.scene.getScene("run").cameras.main.zoom, cameraW: window.__game.scene.getScene("run").cameras.main.width }));
    await page.screenshot({ path: cfg.shot });
    // Zweite Aufnahme: Aura + Partikel, für Farb-/Formbeleg.
    await page.waitForTimeout(700);
    await page.screenshot({ path: cfg.shot.replace(".png", "-aura.png") });
    results[cfg.tag].aliveEnemies = await page.evaluate(() => window.__lf.state().enemies);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop?.();
}

const renderer = results["640"]?.renderer?.renderer ?? "UNKNOWN";
const summary = {
  generatedAt: new Date().toISOString(),
  renderer,
  valid: !/swiftshader|llvmpipe|software/i.test(renderer),
  errors: allErrors,
  configs: results,
};
writeFileSync(`shots/m10-evo-fx-winter-${TAG}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (allErrors.length > 0 || !summary.valid) process.exit(1);
