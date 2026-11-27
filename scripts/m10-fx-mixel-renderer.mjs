#!/usr/bin/env node
// Hängt den WebGL-Renderer-String an eine bestehende Perf-Mess-JSON an
// (Abnahme-Kriterium: Renderer in jeder Mess-JSON, SwiftShader ungültig).
// Keine FPS-Messung -> ohne flock. Läuft < 20 s.
import { readFileSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const out = process.argv[2] ?? "shots/m10-fx-mixel-perf-m25.json";
ensureBuild();
const server = await startServer();
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1`);
  await startRun(page);
  const info = await page.evaluate(() => {
    const gl = window.__game?.renderer?.gl ?? null;
    if (!gl) return { renderer: "", vendor: "", webglVersion: "" };
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "") : String(gl.getParameter(gl.RENDERER) ?? ""),
      vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? "") : String(gl.getParameter(gl.VENDOR) ?? ""),
      webglVersion: String(gl.getParameter(gl.VERSION) ?? ""),
    };
  });
  const json = JSON.parse(readFileSync(out, "utf8"));
  json.renderer = info.renderer;
  json.vendor = info.vendor;
  json.webglVersion = info.webglVersion;
  json.swiftShader = /swiftshader|llvmpipe|software/i.test(info.renderer);
  writeFileSync(out, JSON.stringify(json, null, 2));
  console.log(`[renderer] ${info.renderer} | swiftShader=${json.swiftShader}`);
  process.exitCode = json.renderer && !json.swiftShader ? 0 : 1;
} finally {
  await page.close();
  await browser.close();
  server.stop();
}
