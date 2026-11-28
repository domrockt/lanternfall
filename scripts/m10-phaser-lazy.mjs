#!/usr/bin/env node
// Lane m10-phaser-lazy-import (K1/K4): Kaltladezeit bis Titel + Bundle-Groessen.
//
//   node scripts/m10-phaser-lazy.mjs [--out ~/games/.evidence/m10-phaser-lazy-import/m10-phaser-lazy-before.json]
//                                    [--runs 3] [--tag before|after] [--throttle]
//
// --throttle: CDP Fast 3G (1,6 Mb/s, 150 ms RTT) — die netzwerknahe Frage
// (Android-Zielgeraet); ohne Drosselung dominiert lokal das Phaser-Parsen.
// Misst pro Lauf (frischer Browser-Context = kalter Cache):
//   - Zeit von navigation bis Titel-Szene aktiv (window.__lf.state().scene)
//   - Resource-Timing der kritischen Pfade (uebertragene/entpackte Bytes)
//   - WebGL-Renderer-String (Regel 6, Analyse-Schleifen: Belege ohne Renderer-String sind ungueltig)
// Zusaetzlich einmalig: gzip-Groessen aller dist/assets-Dateien.
// Kein flock: kein FPS-/Echtzeit-Langlauf, nur Boot-Messung.
// Belege gehoeren nach ~/games/.evidence/<lane>/ (Vera 28.11.), nicht nach shots/.
import { writeFileSync, mkdirSync, readdirSync, statSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const tag = opt("tag", "before");
const defaultOut = `${homedir()}/games/.evidence/m10-phaser-lazy-import/m10-phaser-lazy-${tag}.json`;
const out = opt("out", defaultOut);
const runs = Number(opt("runs", "3"));
const throttle = argv.includes("--throttle");
const titleTimeout = throttle ? 30000 : 20000;

// Bundle-Groessen: alle .js/.css aus dist/assets, einzeln + gzip.
function bundleSizes() {
  const rows = [];
  for (const f of readdirSync("dist/assets")) {
    if (!/\.(js|css)$/.test(f)) continue;
    const buf = readFileSync(join("dist/assets", f));
    const gz = gzipSync(buf);
    rows.push({ file: f, bytes: buf.length, gzipBytes: gz.length });
  }
  rows.sort((a, b) => b.gzipBytes - a.gzipBytes);
  return rows;
}

ensureBuild();
mkdirSync("shots", { recursive: true });
const sizes = bundleSizes();
const server = await startServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

const results = [];
let jsErrors = [];
try {
  for (let i = 0; i < runs; i++) {
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const page = await context.newPage();
    if (throttle) {
      const cdp = await context.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
    }
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto(`http://127.0.0.1:${server.port}/?run=${i + 1}`, { waitUntil: "commit" });
    await page.waitForFunction(
      () => Boolean(window.__lf) && window.__lf.state().scene === "title",
      null,
      { timeout: titleTimeout, polling: "raf" },
    );
    const probe = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      let renderer = "unbekannt";
      if (gl) {
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
      }
      const resources = performance
        .getEntriesByType("resource")
        .map((r) => ({
          name: r.name.split("/").pop(),
          transferSize: r.transferSize,
          decodedBodySize: Math.round(r.decodedBodySize),
          durationMs: Math.round(r.duration),
        }))
        .sort((a, b) => b.durationMs - a.durationMs)
        .slice(0, 12);
      return { ms: Math.round(performance.now()), renderer, resources };
    });
    await context.close();

    results.push({
      run: i + 1,
      titleMs: probe.ms,
      renderer: probe.renderer,
      resources: probe.resources,
    });
    jsErrors = jsErrors.concat(errors);
    console.log(`[m10-phaser-lazy] Lauf ${i + 1}: ${probe.ms} ms bis Titel, Renderer: ${probe.renderer}, Fehler: ${errors.length}`);
  }
} finally {
  await browser.close();
  server.stop();
}

const times = results.map((r) => r.titleMs);
const summary = {
  tag,
  date: new Date().toISOString(),
  runs,
  avgMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
  minMs: Math.min(...times),
  maxMs: Math.max(...times),
  renderer: results[0]?.renderer,
  bundleSizes: sizes,
  phaserGzipBytes: sizes.find((s) => /phaser/.test(s.file))?.gzipBytes ?? null,
  results,
  jsErrors,
};
mkdirSync(join(out, ".."), { recursive: true });
writeFileSync(out, JSON.stringify(summary, null, 2) + "\n");
console.log(`[m10-phaser-lazy] ${tag}: avg ${summary.avgMs} ms (min ${summary.minMs}/max ${summary.maxMs}), JS-Fehler: ${jsErrors.length} -> ${out}`);
if (jsErrors.length > 0) process.exitCode = 1;
if (/SwiftShader/.test(String(summary.renderer))) {
  console.error("[m10-phaser-lazy] FAIL: Renderer ist SwiftShader — Beleg ungueltig (Regel 6)");
  process.exitCode = 1;
}
