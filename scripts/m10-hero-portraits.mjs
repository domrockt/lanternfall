#!/usr/bin/env node
// M10-Hero-Portraits: Auswahl-Szene headless aufnehmen (Beleg fuer Art-Karten).
// Usage: node scripts/m10-hero-portraits.mjs <tag>
//   -> shots/m10-hero-portraits-<tag>-select.png (Szene 640x360)
// Portraet-Crops + Nearest-Upgrades macht scripts/art via ffmpeg separat.
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/usr/lib/node_modules/playwright")); }

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tag = process.argv[2] || "before";

const srvPort = 5397;
const srv = spawn("python3", ["-m", "http.server", String(srvPort), "--bind", "127.0.0.1", "-d", "dist"], { cwd: root });
await new Promise(r => setTimeout(r, 700));

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errors = [];
p.on("pageerror", e => errors.push(String(e)));
p.on("console", m => m.type() === "error" && errors.push(m.text()));
await p.goto(`http://127.0.0.1:${srvPort}/`);
await p.waitForTimeout(900);
await p.keyboard.press("Enter");            // Titel -> CharSelect
await p.waitForTimeout(1200);
await p.screenshot({ path: path.join(root, "shots", `m10-hero-portraits-${tag}-select.png`) });
console.log(errors.length ? "JS ERRORS:\n" + errors.join("\n") : "no JS errors");
await b.close();
srv.kill();
