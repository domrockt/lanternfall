// m10-evo-element-guard (Lane m10-evo-element-guard), K1+K2: Regression-Guard fuer
// Doms Evo-Regel: "Element muss auf einem Standbild ohne Beschriftung erkennbar sein."
// Je Evo ein eingefrorener Standbild-Frame (scene.pause, Muster m10-boss-fx-contrast.mjs)
// in 640x360 und 960x540, mit Paletten-Farb-Signatur (nearest-PAL-Histogramm im
// Spieler-Crop) statt FPS. Keine FPS-Messung -> kein flock.
//
// Signatur = ABSOLUTER Ziel-Farbband-Anteil im Spieler-Crop an fester Stelle
// (Seed 7, Teleport 2048/2048) — der Ort ist deterministisch, also ist der
// Terrain-Anteil laufstabil und eine Verschiebung zeigt FX-/Licht-Regressionen.
// (Eine waffenlose Baseline als Differenz wurde probiert und verworfen: das
// FX-Budget dimmt das Lantern-Licht, sobald eine Waffe feuert — die Baseline ist
// systematisch heller und kippt alle Deltas. Befund in docs/lanes/m10-evo-element-guard.md.)
//
// Element-Zuordnung (Dom, 02:00Z, Optik abgenommen 10:00Z):
//   phoenix        = Feuer (orange Glut-Kern)
//   eternal_winter = Frost (eisblau)
//   soul_beacon    = kalt-tuerkis Leuchtfeuer (hell, weissliche Kalte-Toene, kein Feuer)
//   thunder_seal   = Blitz (weiss-Peaks)
//   wrath_pendulum = Glut/Rot
//   thorn_storm    = gruene Dornen (kein flaechnaiges Raster -> CV-Metrik)
//
// Schwellen (K2-Kalibrierung, Mesa-iGPU, 2 Ist-Laeufe 28.11.): min = Ist-min × 0.4
// (4 Dezimalstellen) — absorbiert das beobachtete Freeze-Phasen-Rauschen (phoenix.fire
// schwankte laufabhaengig ~2x durch Sprite-Phase). soulpyre.noFire ist max:
// Umgebungsglut (Lantern/Terrain) liegt konstant bei ~4.5% (gewittersiegel-Referenz
// 4.52%), Soulpyre-FX traegt sichtbar kein Feuer; max=0.06 faellt, wenn kuenftig
// Flammen-Farben in die Soulpyre-Signatur mischen. dornensturm.green istTerrain-dominiert
// (Moor-Boden, deterministisch) und sitzt deshalb mit 0.118 bei 40% des schlechtesten Ist.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { decodePng } from "./terrain-coverage.mjs";

ensureBuild();
mkdirSync("shots", { recursive: true });

const EVOS = [
  { id: "phoenix", weapon: "phoenix", fxWait: /(fx_boom_phoenix|fx_burn_phoenix|projectile_phoenix)/ },
  { id: "winter", weapon: "eternal_winter", fxWait: /(ring_frost|fx_ice|fx_halo_cold)/ },
  { id: "soulpyre", weapon: "soul_beacon", fxWait: /(orb_soul|fx_halo_cold)/ },
  { id: "gewittersiegel", weapon: "thunder_seal", fxWait: /(fx_seal_thunder|fx_bolt)/ },
  { id: "zornpendel", weapon: "wrath_pendulum", fxWait: /(fx_wrath_ring|fx_wrath_glow|fx_smear)/ },
  { id: "dornensturm", weapon: "thorn_storm", fxWait: /(projectile_thorn|fx_thorn|ring_burst)/ },
];

const CONFIGS = [
  { tag: "640", viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 },
  { tag: "960", viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 },
];

// 32-Farben-Palette (src/palette.ts) — Node-seitig fuer nearest-Mapping.
const PAL = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];
const PAL_RGB = PAL.map((v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255]);

// Ziel-Farbbänder je Element (Palette-Indizes aus src/palette.ts) + kalibrierte
// Schwellen (siehe Kopf-Kommentar).
const BANDS = {
  phoenix: { fire: { idx: [14, 15, 16, 17, 18, 19, 20, 21, 22], min: 0.0086 }, fireCore: { idx: [17, 18, 19, 20, 21], min: 0.0014 } },
  winter: { cold: { idx: [5, 6, 7, 8, 9, 10], min: 0.0444 }, coldBright: { idx: [8, 9, 10], min: 0.0165 } },
  soulpyre: { cold: { idx: [5, 6, 7, 8, 9, 10], min: 0.0297 }, coldBright: { idx: [8, 9, 10, 12, 13], min: 0.006 }, noFire: { idx: [14, 15, 16, 17, 18, 19], max: 0.06 } },
  gewittersiegel: { whitePeak: { idx: [12, 13], min: 0.0003 } },
  zornpendel: { emberRed: { idx: [14, 15, 16, 17, 23, 24, 25, 26], min: 0.0206 } },
  dornensturm: { green: { idx: [28, 29, 30, 31], min: 0.1183 } },
};
// Dornensturm-Raster: gruenen-Pixel je Reihe variiert bei echten Dornen (CV ~0.23);
// ein flaechnaiges Raster-Overlay haette nahezu konstante Reihen (CV ~0). GREEN ab 0.1.
const GRID_CV_MIN = 0.1;

// Kalibrierlauf: Schwellen aus dem Ist-Lauf ablegen statt zu pruefen.
const CALIB = process.env.CALIB === "1";

function nearestPalIdx(r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < PAL_RGB.length; i++) {
    const dr = r - PAL_RGB[i][0], dg = g - PAL_RGB[i][1], db = b - PAL_RGB[i][2];
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Histogramm + Raster-Metrik im Spieler-Crop (Mitte des Canvas, HUD ausgespart).
function cropSignature(buf, opts = {}) {
  const img = decodePng(buf);
  const { width: w, height: h, data } = img;
  const halfW = Math.round(w * (opts.cropW ?? 0.42));
  const halfH = Math.round(h * (opts.cropH ?? 0.38));
  const cx = w >> 1, cy = h >> 1;
  const x0 = Math.max(0, cx - halfW), x1 = Math.min(w, cx + halfW);
  const y0 = Math.max(0, cy - halfH), y1 = Math.min(h, cy + halfH);
  const hist = new Array(32).fill(0);
  const rowGreen = new Array(y1 - y0).fill(0);
  let total = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      total++;
      const idx = nearestPalIdx(data[i], data[i + 1], data[i + 2]);
      hist[idx]++;
      if (idx >= 28) rowGreen[y - y0]++;
    }
  }
  // Raster-Metrik: Variationskoeffizient der Gruen-Anzahl je Reihe.
  const greenRows = rowGreen.filter((v) => v >= 2);
  const mean = greenRows.reduce((a, v) => a + v, 0) / Math.max(1, greenRows.length);
  const variance = greenRows.reduce((a, v) => a + (v - mean) * (v - mean), 0) / Math.max(1, greenRows.length);
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  return { crop: { x0, y0, x1, y1, w, h }, total, hist, grid: { greenPerRowCv: +cv.toFixed(4) } };
}

const share = (sig, band) =>
  sig.hist.filter((_, i) => band.idx.includes(i)).reduce((a, v) => a + v, 0) / Math.max(1, sig.total);

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const results = {};
const allErrors = [];
const freeze = async (page, ms) => {
  if (ms > 0) await page.waitForTimeout(ms);
  await page.evaluate(() => window.__game.scene.pause("run"));
  const shot = await page.screenshot();
  await page.evaluate(() => window.__game.scene.resume("run"));
  return shot;
};
const setup = (page, weapon) =>
  page.evaluate((w) => {
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.teleport(2048, 2048);
    if (w) window.__lf.addWeapon(w, 8);
    window.__lf.spawnEnemy("mudling", 12);
    window.__lf.spawnEnemy("bog_rat", 8);
  }, weapon);

try {
  for (const cfg of CONFIGS) {
    for (const evo of EVOS) {
      results[evo.id] ??= {};
      const page = await browser.newPage({ viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor });
      page.on("pageerror", (e) => allErrors.push(`[${evo.id}/${cfg.tag}] ` + String(e)));
      page.on("console", (m) => { if (m.type() === "error") allErrors.push(`[${evo.id}/${cfg.tag}] ` + m.text()); });
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
      await startRun(page);
      await setup(page, evo.weapon);
      // Auf die Evo-Signatur warten (FX-Keys + Live-Sprites gelesen — kein Blind-Shot;
      // Muster m10-evo-fx-soulpyre.mjs: orb_soul/Projektile sind keine FX-Keys).
      await page.waitForFunction((rx) => {
        const scene = window.__game.scene.getScene("run");
        const keys = scene.combat.fx.keys ?? [];
        if (new RegExp(rx).test(keys.join(","))) return true;
        const kids = scene.children.list ?? [];
        return kids.some((c) => {
          if (!c.visible) return false;
          const key = c.texture?.key === "runtime_atlas" ? c.frame?.name : c.texture?.key;
          return key && new RegExp(rx).test(key);
        });
      }, evo.fxWait.source, { timeout: 12000 });

      const info = await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        return { fxKeys: run.combat.fx.keys, renderer: window.__lf.rendererInfo(), enemies: window.__lf.state().enemies };
      });
      const shot = await freeze(page, 0);
      writeFileSync(`shots/m10-evo-element-${evo.id}-${cfg.tag}.png`, shot);
      await page.close();

      const sig = cropSignature(shot);
      const bands = {};
      for (const [name, band] of Object.entries(BANDS[evo.id])) {
        const s = +share(sig, band).toFixed(5);
        const threshold = band.min ?? band.max;
        const ok = band.min !== undefined ? s >= threshold : s <= threshold;
        bands[name] = { share: s, threshold, direction: band.min !== undefined ? "min" : "max", ok };
      }
      bands.grid = { greenPerRowCv: sig.grid.greenPerRowCv, threshold: GRID_CV_MIN, ok: sig.grid.greenPerRowCv >= GRID_CV_MIN };
      results[evo.id][cfg.tag] = {
        shot: `shots/m10-evo-element-${evo.id}-${cfg.tag}.png`,
        renderer: info.renderer?.renderer ?? "UNKNOWN",
        fxKeys: info.fxKeys,
        aliveEnemies: info.enemies,
        crop: sig.crop,
        paletteHist: sig.hist,
        bands,
      };
    }
  }
} finally {
  await browser.close();
  server.close?.();
}

const renderer = results.phoenix?.["640"]?.renderer ?? "UNKNOWN";
const verdicts = {};
for (const [evo, tags] of Object.entries(results)) {
  verdicts[evo] = Object.values(tags).every((r) => Object.values(r.bands).every((b) => b.ok !== false)) ? "GREEN" : "FAIL";
}
const summary = {
  generatedAt: new Date().toISOString(),
  renderer,
  valid: !/swiftshader|llvmpipe|software/i.test(renderer),
  errors: allErrors,
  verdicts,
  evos: results,
};
writeFileSync("shots/m10-evo-element-guard.json", JSON.stringify(summary, null, 2));
if (CALIB) {
  // Kalibriertabelle: Ist-Anteile + vorgeschlagene Schwellen (min: x0.4, max: x1.34).
  for (const [evo, tags] of Object.entries(results)) {
    for (const [band, b] of Object.entries(tags["640"].bands)) {
      if (band === "grid") continue;
      const sug = b.direction === "min" ? Math.floor(b.share * 0.4 * 1e4) / 1e4 : Math.ceil(b.share * 1.34 * 1e4) / 1e4;
      console.log(`CALIB ${evo}.${band} share=${b.share} -> suggested ${b.direction}=${sug}`);
    }
  }
}
console.log(JSON.stringify({ renderer, valid: summary.valid, errors: allErrors, verdicts }, null, 2));
if (allErrors.length > 0 || !summary.valid) process.exit(1);
