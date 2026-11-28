// m10-evo-fx-winter-w2: Aura-Siegel-Beleg (ring_frost) auf hellem Moor-Grund.
// Stellt die Winter-Lane-Szene nach (Ewiger Winter Lv 8, lebende Gegner, seed 7) und misst:
//   - WebGL-Renderer-String (SwiftShader = ungueltig)
//   - ring_frost-Live-Sprites: Tint (fogBlue-Nachweis) + Alpha + Scale
//   - fx_ice-Live-Sprites: max Scale (Mixel-Regel <= 1)
//   - Screenshots: 640-Vollbild + Aura-Crop (Clip um Spielerposition, @2x crop)
// Keine FPS-Messung -> kein flock. Aufruf: node scripts/m10-evo-fx-winter-w2.mjs <tag>
// Vorlage: scripts/m10-evo-fx-winter.mjs (Lane m10-evo-fx-winter, Merge 1f6bcd7).
import { mkdirSync, writeFileSync, readFile } from "node:fs";
import { ensureBuild, loadPlaywright, startRun } from "./harness.mjs";
import http from "node:http";

ensureBuild();
mkdirSync("shots", { recursive: true });

// Kollisionsfreier statischer Server (Port 0), Muster m10-evo-fx-winter.mjs.
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

// fogBlue = pal6 (0x3a4a5c): der multiplikative Tint, der paleMist auf ~#2c3540 drueckt.
const FOG_BLUE = 0x3a4a5c;

const PROBE = (fogBlue) => {
  const scene = window.__game.scene.getScene("run");
  const out = { renderer: window.__lf.rendererInfo(), live: {}, errors: [] };
  const kids = Array.isArray(scene.children) ? scene.children : (scene.children.list ?? []);
  for (const child of kids) {
    const key = child.texture?.key === "runtime_atlas" ? child.frame?.name : child.texture?.key;
    // Mixel-Bakes rendern als "ring_frost@3" etc. — Prefix-Match.
    if (!key || !/^(ring_frost|fx_ice|fx_halo_cold)/.test(key)) continue;
    if (!child.visible) continue;
    const rec = {
      scaleX: +child.scaleX.toFixed(3), scaleY: +child.scaleY.toFixed(3),
      alpha: +(+child.alpha).toFixed(3),
      tint: child.tintTopLeft ?? child.tint ?? null,
      blend: child.blendMode,
    };
    const cur = out.live[key] ?? (out.live[key] = { samples: [], fogBlueTinted: 0 });
    cur.samples.push(rec);
    cur.tints = [...new Set([...(cur.tints ?? []), rec.tint])];
    if (rec.tint === fogBlue) cur.fogBlueTinted++;
  }
  for (const k of Object.keys(out.live)) {
    out.live[k].count = out.live[k].samples.length;
    out.live[k].maxScaleX = Math.max(...out.live[k].samples.map((s) => s.scaleX));
    out.live[k].maxScaleY = Math.max(...out.live[k].samples.map((s) => s.scaleY));
    out.live[k].alphas = [...new Set(out.live[k].samples.map((s) => s.alpha))].sort();
    out.live[k].tints = out.live[k].tints ?? [];
    delete out.live[k].samples;
  }
  // Spielerposition + Kamera fuer den Aura-Crop (Screen-Koordinaten).
  const st = window.__lf.state();
  const cam = scene.cameras.main;
  out.player = { x: st.playerX, y: st.playerY };
  out.cam = { scrollX: cam.scrollX, scrollY: cam.scrollY, zoom: cam.zoom, w: cam.width, h: cam.height };
  return out;
};

const TAG = process.argv[2] ?? "before";
const results = {};
const allErrors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => allErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") allErrors.push(m.text()); });
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
  // Warten bis Aura-Ring sichtbar.
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
  // Terrain-Worker malt Chunks progressiv (Befund w2: früher Screenshot = schwarze
  // Karte, Chunk-Grenze sichtbar in shots/m10-evo-fx-gewittersiegel-wtcheck-640-t03.png).
  // Aura zyklisiert alle 0,4 s — 3 s Wartezeit ändern das Aura-Moment nicht.
  await page.waitForTimeout(3000);
  // Frische Gegner um den Spieler (Aura-Kontext mit lebenden Gegnern, Belegregel).
  await page.evaluate(() => {
    window.__lf.spawnEnemy("mudling", 8);
    window.__lf.spawnEnemy("bog_rat", 6);
  });
  await page.waitForTimeout(600);
  results.run = await page.evaluate(PROBE, FOG_BLUE);
  // Aura-Partikel leben nur 0,6 s: 3 Proben ueber ~0,9 s mergen (Tint-Nachweis robust).
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(450);
    const more = await page.evaluate(PROBE, FOG_BLUE);
    for (const [k, v] of Object.entries(more.live)) {
      const cur = results.run.live[k] ?? (results.run.live[k] = { fogBlueTinted: 0, tints: [] });
      cur.fogBlueTinted += v.fogBlueTinted;
      cur.tints = [...new Set([...(cur.tints ?? []), ...(v.tints ?? [])])];
      cur.maxScaleX = Math.max(cur.maxScaleX ?? 0, v.maxScaleX ?? 0);
      cur.maxScaleY = Math.max(cur.maxScaleY ?? 0, v.maxScaleY ?? 0);
      cur.count = (cur.count ?? 0) + v.count;
    }
    results.run.player = more.player;
  }
  for (const k of Object.keys(results.run.live)) results.run.live[k].samples = undefined;
  // Crop-Fenster: Spieler mittig, 160x120 Welt-px um den Spieler (@1 Screen-px).
  await page.screenshot({ path: `shots/m10-evo-fx-winter-w2-${TAG}-640.png` });
  // Crop-Fenster FRISCH vor dem Shot (Kamera folgt per Lerp — alter Scroll wäre daneben).
  const clip2 = await page.evaluate(() => {
    const s = window.__game.scene.getScene("run");
    const cam = s.cameras.main, st = window.__lf.state();
    // Screenshot-Clip ist in CSS-Px: Canvas (cam.width) wird auf viewport skaliert.
    const k = window.innerWidth / cam.width;
    const sx = (st.playerX - cam.scrollX) * k, sy = (st.playerY - cam.scrollY) * k;
    return { x: Math.max(0, Math.round(sx - 240)), y: Math.max(0, Math.round(sy - 180)), width: 480, height: 360 };
  });
  results.run.clip = clip2;
  await page.screenshot({ path: `shots/m10-evo-fx-winter-w2-${TAG}-aura.png`, clip: clip2 });
  results.run.aliveEnemies = await page.evaluate(() => window.__lf.state().enemies);
  await page.close();
} finally {
  await browser.close();
  server.stop?.();
}

const renderer = results.run?.renderer?.renderer ?? "UNKNOWN";
const summary = {
  generatedAt: new Date().toISOString(),
  tag: TAG,
  renderer,
  valid: !/swiftshader|llvmpipe|software/i.test(renderer),
  errors: allErrors,
  run: results.run,
};
writeFileSync(`shots/m10-evo-fx-winter-w2-${TAG}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (allErrors.length > 0 || !summary.valid) process.exit(1);
