#!/usr/bin/env node
// Lane m10-postwave-smoke-r2: Einmaliger WebGL-Renderer-Beleg (kein FPS-Messapparat).
// Liest nur den WebGL-Renderer-String des Test-Chrome (vgl. Argus-Regel: jeder Perf-Beleg
// muss den Renderer nennen; perf.mjs schreibt ihn nicht -> Befund, Severity low).
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const OUT = process.argv[2] || "shots/m10-postwave-r2-renderer.json";
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
await page.goto(`http://localhost:${server.port}/`, { waitUntil: "load" });
const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return "(kein WebGL)";
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const v = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const swift = String(v).toLowerCase().includes("swiftshader");
  return `${v} | swiftshader=${swift}`;
});
await writeFileSync(OUT, JSON.stringify({ renderer, at: new Date().toISOString() }, null, 2) + "\n");
console.log("renderer:", renderer);
await browser.close();
server.stop();
