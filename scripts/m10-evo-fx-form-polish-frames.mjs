// m10-evo-fx-form-polish K1-Diagnose: rendert verdächtige FX-Frames 1:1 aus dem
// Browser-TextureManager auf ein Canvas (4x nearest im Nachgang) — zeigt, wo
// Flächendither/Ink tatsächlich in der Textur steckt. Keine FPS-Messung -> kein flock.
import { mkdirSync, writeFileSync, readFile } from "node:fs";
import { ensureBuild, loadPlaywright, startRun } from "./harness.mjs";
import http from "node:http";

ensureBuild();
mkdirSync("shots", { recursive: true });

function startServerLocal() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const p = req.url === "/" || req.url.startsWith("/?") ? "/index.html" : req.url.split("?")[0];
      readFile("dist" + p, (err, data) => {
        if (err) { res.writeHead(404); res.end(); return; }
        const type = p.endsWith(".html") ? "text/html" : p.endsWith(".js") ? "text/javascript" : "image/png";
        res.writeHead(200, { "content-type": type });
        res.end(data);
      });
    });
    server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, stop: () => server.close() }));
  });
}

const KEYS = [
  "fx_evo_death_phoenix_2", "fx_boom_phoenix_3", "fx_burn_phoenix_2",
  "fx_evo_death_thorn_storm_3", "fx_evo_hit_thunder_seal_4", "fx_evo_death_thunder_seal_3",
  "fx_seal_thunder_3", "ring_frost@3", "fx_evo_death_eternal_winter_2", "fx_evo_death_soul_beacon_2",
];

const { chromium } = await loadPlaywright();
const server = await startServerLocal();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling"] });
let dataUrl = "";
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await startRun(page);
  dataUrl = await page.evaluate((keys) => {
    const cv = document.createElement("canvas");
    cv.width = 2048; cv.height = 640;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#06070c";
    cx.fillRect(0, 0, cv.width, cv.height);
    let x = 8, y = 8, rowH = 0;
    for (const key of keys) {
      const tex = window.__game.textures.get(key);
      if (!tex || !tex.source) continue;
      const w = tex.source[0].width, h = tex.source[0].height;
      if (x + w > cv.width - 8) { x = 8; y += rowH + 8; rowH = 0; }
      cx.drawImage(tex.source[0].image, x, y);
      cx.fillStyle = "#fff8e6"; cx.font = "12px monospace"; cx.fillText(key, x, y + h + 11);
      x += w + 10; rowH = Math.max(rowH, h + 14);
    }
    return cv.toDataURL("image/png");
  }, KEYS);
} finally {
  await browser.close();
  server.stop?.();
}
const b64 = dataUrl.split(",")[1];
writeFileSync("shots/m10-evo-fx-form-polish-frames-raw.png", Buffer.from(b64, "base64"));
console.log("saved", b64.length);
