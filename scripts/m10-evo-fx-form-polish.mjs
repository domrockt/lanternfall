// m10-evo-fx-form-polish, K1/K3: Vorher-/Nachher-Beleg aller 6 Evolutionen.
// Je Evo: Waffe Lv 8, 20 Gegner, Screenshot im Signatur-Peak (640-View, wie Winter-Lane),
// Textur-Groessen, Live-Sprite-Scales (Mixel-Nachweis) und Farb-Histogramme der
// Evo-relevanten Texturen (Paletten-Treffer + Ink-Anteil).
// Keine FPS-Messung -> kein flock. rendererInfo() im JSON — SwiftShader-Belege sind ungueltig.
// Aufruf: node scripts/m10-evo-fx-form-polish.mjs before|after
// Vorlage: scripts/m10-evo-fx-winter.mjs (Lane m10-evo-fx-winter).
import { mkdirSync, writeFileSync, readFile } from "node:fs";
import { ensureBuild, loadPlaywright, startRun } from "./harness.mjs";
import http from "node:http";

ensureBuild();
mkdirSync("shots", { recursive: true });

// Kollisionsfreier statischer Server (Port 0) — siehe m10-evo-fx-winter.mjs Befund fixprobe.
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

// Evo -> relevante Textur-Keys (Ausloesung/Wirkung + Signaturen).
const EVOS = {
  phoenix: ["projectile_phoenix", "fx_phoenix_launch", "fx_boom_phoenix", "fx_burn_phoenix"],
  wrath_pendulum: ["fx_wrath_ring", "fx_wrath_glow", "fx_smear"],
  eternal_winter: ["ring_frost", "projectile_ice", "fx_ice", "fx_halo_cold", "fx_shock"],
  thorn_storm: ["fx_thorn", "projectile_thorn"],
  thunder_seal: ["fx_seal_thunder", "fx_bolt"],
  soul_beacon: ["orb_soul", "fx_halo_cold", "fx_halo"],
};

const PAL = [0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xd8572f,0x8a8f7c,0x59743a,0x86983f,0xa9b063];
const PAL_HEX = PAL.map((v) => "#" + v.toString(16).padStart(6, "0"));

const COLOR_PROBE_KEYS = [
  "fx_evo_hit_", "fx_evo_death_", "projectile_phoenix", "fx_boom_phoenix", "fx_burn_phoenix",
  "fx_wrath_ring", "orb_soul", "projectile_ice", "ring_frost", "fx_thorn", "fx_seal_thunder", "fx_bolt",
];

// Laeuft im Browser: Texturen-Metriken + Live-Sprite-Scales + Farbhistogramme.
const PROBE = ({ keys, colorKeys }) => {
  const scene = window.__game.scene.getScene("run");
  const out = { textures: {}, live: {}, colors: {} };
  for (const key of keys) {
    const tex = window.__game.textures.get(key);
    if (!tex || !tex.source) continue;
    out.textures[key] = { w: tex.source[0].width, h: tex.source[0].height };
  }
  const kids = Array.isArray(scene.children) ? scene.children : (scene.children.list ?? []);
  const counts = {};
  for (const child of kids) {
    const key = child.texture?.key === "runtime_atlas" ? child.frame?.name : child.texture?.key;
    if (!key) continue;
    const hit = keys.some((k) => key === k || key.startsWith(k)) || key.startsWith("fx_evo_");
    if (!hit || !child.visible) continue;
    counts[key] = (counts[key] ?? 0) + 1;
    const rec = { sx: +child.scaleX.toFixed(3), sy: +child.scaleY.toFixed(3), w: Math.round(child.displayWidth), h: Math.round(child.displayHeight) };
    const cur = out.live[key];
    if (!cur) out.live[key] = { maxScale: Math.max(rec.sx, rec.sy), samples: [rec] };
    else {
      cur.maxScale = Math.max(cur.maxScale, Math.max(rec.sx, rec.sy));
      if (cur.samples.length < 8) cur.samples.push(rec);
    }
  }
  out.liveCounts = counts;
  // Farb-Histogramme: exakte Paletten-Treffer + Ink-Anteil + Randpixel.
  const PAL_HEX = [0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xd8572f,0x8a8f7c,0x59743a,0x86983f,0xa9b063].map((v) => "#" + v.toString(16).padStart(6, "0"));
  const palSet = new Map(PAL_HEX.map((h, i) => [h, i]));
  for (const prefix of colorKeys) {
    for (const tkey of window.__game.textures.getTextureKeys().filter((k) => k.startsWith(prefix))) {
      const tex = window.__game.textures.get(tkey);
      if (!tex || !tex.source) continue;
      const src = tex.source[0];
      const cv = document.createElement("canvas");
      cv.width = src.width; cv.height = src.height;
      const cx = cv.getContext("2d");
      cx.drawImage(src.image, 0, 0);
      const data = cx.getImageData(0, 0, cv.width, cv.height).data;
      const hist = {}; let ink = 0; let opaque = 0; let edge = 0;
      for (let y = 0; y < cv.height; y++) {
        for (let x = 0; x < cv.width; x++) {
          const i = (y * cv.width + x) * 4;
          if (data[i + 3] < 8) continue;
          opaque++;
          const h = "#" + ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]).toString(16).padStart(6, "0");
          const idx = palSet.get(h);
          if (idx === undefined) hist["OUTSIDE:" + h] = (hist["OUTSIDE:" + h] ?? 0) + 1;
          else { hist["pal" + idx] = (hist["pal" + idx] ?? 0) + 1; if (idx === 0) ink++; }
          if ((x === 0 || y === 0 || x === cv.width - 1 || y === cv.height - 1) && data[i + 3] >= 8) edge++;
        }
      }
      out.colors[tkey] = { w: cv.width, h: cv.height, opaque, inkPixels: ink, edgePixels: edge, hist };
    }
  }
  return out;
};

const MODE = process.argv[2] ?? "before";
const { chromium } = await loadPlaywright();
const server = await startServerLocal();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const results = {};
const allErrors = [];
try {
  for (const [evo, keys] of Object.entries(EVOS)) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => allErrors.push(`[${evo}] ` + String(e)));
    page.on("console", (m) => { if (m.type() === "error") allErrors.push(`[${evo}] ` + m.text()); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate((ev) => {
      window.__lf.god(true);
      window.__lf.autoPlay(false);
      window.__lf.setSuppressLevelUps(true);
      window.__lf.addWeapon(ev, 8);
      window.__lf.spawnEnemy("mudling", 12);
      window.__lf.spawnEnemy("bog_rat", 8);
    }, evo);

    const colorKeys = COLOR_PROBE_KEYS;
    // Warten bis eine Treffer-/Todes-Signatur dieses Evos sichtbar ist, dann Peak abwarten.
    await page.waitForFunction(
      (ev) => {
        const scene = window.__game.scene.getScene("run");
        const kids = Array.isArray(scene.children) ? scene.children : (scene.children.list ?? []);
        return kids.some((c) => {
          const key = c.texture?.key === "runtime_atlas" ? c.frame?.name : c.texture?.key;
          return key === `fx_evo_death_${ev}` && c.visible;
        });
      },
      evo,
      { timeout: 15000 },
    ).catch(() => allErrors.push(`[${evo}] death-signature timeout`));
    await page.waitForTimeout(250);

    results[evo] = {
      renderer: await page.evaluate(() => window.__lf.rendererInfo()),
      ...(await page.evaluate(PROBE, { keys, colorKeys })),
      shot: `shots/m10-evo-fx-form-polish-${MODE}-${evo}-640.png`,
    };
    await page.screenshot({ path: `shots/m10-evo-fx-form-polish-${MODE}-${evo}-640.png` });
    await page.close();
  }
} finally {
  await browser.close();
  server.stop?.();
}

writeFileSync(`shots/m10-evo-fx-form-polish-${MODE}.json`, JSON.stringify({ mode: MODE, evos: results, errors: allErrors }, null, 2));
console.log(JSON.stringify({ mode: MODE, evos: Object.keys(results), errors: allErrors }, null, 2));
if (allErrors.length > 0) process.exit(1);
