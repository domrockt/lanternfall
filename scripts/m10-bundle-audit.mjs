#!/usr/bin/env node
// Lane m10-bundle-chunk-fix (Befund E-3): ein Aufruf = Build + Chunk-Audit + index-Load-Smoke.
//
// 1) `npm run build` (tsc --noEmit + vite build) mit Zeiten und Warnstatus,
// 2) Chunk-Tabelle aus dist/assets (vorher/nachher-Vergleich für die Lane-Doku),
// 3) index-Load-Smoke über Playwright: dist wird über einen statischen Server
//    geladen, gewartet bis eine Szene läuft, JS-Fehler gezählt.
//
// Output: JSON nach ~/games/.evidence/m10-bundle-chunk/<name>.json
// (Belege bleiben außerhalb des Repos, siehe AGENTS.md „Belege NACH ~/games/.evidence/“).
//
// Aufruf: node scripts/m10-bundle-audit.mjs [outname.json]
import { execFileSync, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { extname, join as pjoin } from "node:path";
import { loadPlaywright } from "./harness.mjs";

const OUT = process.argv[2] ?? "after.json";
const MIME = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".json": "application/json" };

// 1) Build (einmal, synchron — kein Polling).
const t0 = performance.now();
let buildOut = "";
let buildStatus = null;
{
  // stdout UND stderr erfassen — Vite-Warnungen (WARN/DEP) gehen auf stderr.
  const build = spawnSync("npm", ["run", "build"], { encoding: "utf8" });
  buildStatus = build.status;
  buildOut = String(build.stdout ?? "") + String(build.stderr ?? "");
}
const wallMs = Math.round(performance.now() - t0);
const viteMatch = /built in (\d+)ms/.exec(buildOut);
const warning = /larger than 500 kB|Some chunks are larger/.test(buildOut);
// Lane m10-bundle-split: Deprecation-Warnungen (z. B. advancedChunks → codeSplitting)
// getrennt erfassen — sie sind kein Großenproblem, aber Build-Rauschen.
const deprecation = /option is deprecated/.test(buildOut);

// 2) Chunk-Tabelle.
const chunks = readdirSync("dist/assets")
  .filter((f) => f.endsWith(".js"))
  .map((f) => ({ file: f, kb: Math.round((statSync(`dist/assets/${f}`).size / 1024) * 100) / 100 }))
  .sort((a, b) => b.kb - a.kb);

// 3) index-Load-Smoke: statischer Server auf dist, Seite laden, auf Szene warten.
const server = createServer((req, res) => {
  let path = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const data = readFileSync(pjoin("dist", path));
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    if (!path.includes("favicon")) console.error("[404]", path);
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text());
});

let sceneLoaded = false;
await page.goto(`http://127.0.0.1:${port}/index.html`);
try {
  await page.waitForFunction(() => window.__game && window.__game.scene, { timeout: 20000 });
  sceneLoaded = true;
} catch { /* bleibt false */ }
await browser.close();
server.close();

const result = {
  date: new Date().toISOString(),
  command: "npm run build",
  build_rc: buildStatus,
  wall_ms: wallMs,
  vite_ms: viteMatch ? Number(viteMatch[1]) : null,
  chunk_warning: warning,
  deprecation_warning: deprecation,
  chunks,
  smoke: { sceneLoaded, jsErrors: errors },
};
const outDir = join(homedir(), "games", ".evidence", "m10-bundle-split");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, OUT);
writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ out, wall_ms: wallMs, vite_ms: result.vite_ms, chunk_warning: warning, deprecation_warning: deprecation, chunks, smoke: result.smoke }, null, 2));
if (!sceneLoaded || errors.length || warning || deprecation) process.exit(1);
