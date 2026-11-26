#!/usr/bin/env node
// Generischer Screenshot-/GIF-Helfer fuer Lanternfall.
// Basis: scripts/harness.mjs (Build pruefen, statischer Server, Playwright, Start-Flow).
//
//   node scripts/shot.mjs --out shots/x.png
//   node scripts/shot.mjs --query "debug=1&seed=21" \
//     --commands '[{"call":"god","args":[true]},{"call":"spawnEnemy","args":["bog_rat",40]}]' \
//     --out shots/x.png --gif 24
//
// Optionen:
//   --out <pfad>          PNG-Ziel (Default shots/latest.png)
//   --query <query>       Query hinter der URL (Default debug=1)
//   --url <url>           komplette URL statt Server+Build (Query wird angehaengt)
//   --commands <json>     Array aus {call,args} oder [call,...]; Objekt {call: args} geht auch
//   --commands-file <f>   JSON-Datei statt --commands
//   --gif <n>             zusaetzlich ein mit n Frames (Default-Pfad: out mit .gif)
//   --gif-out <pfad>      GIF-Ziel
//   --fps <n>             GIF-Framerate (Default 12)
//   --frame-ms <n>        Wartezeit zwischen GIF-Frames (Default 90)
//   --wait <n>            Wartezeit nach den Befehlen vor dem ersten Bild (Default 700)
//   --scene <name>        Startszene run|title|charselect (Default run)
//   --viewport <BxH>      Fenstergroesse (Default 960x540)
//   --allow-errors        JS-Fehler nur melden, Exitcode bleibt 0
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun, waitForScene } from "./harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}
function flag(name) {
  return argv.includes(`--${name}`);
}

const out = opt("out", "shots/latest.png");
const query = opt("query", "debug=1");
const fullUrl = opt("url");
const scene = opt("scene", "run");
const viewport = opt("viewport", "960x540").split("x").map(Number);
const gifFrames = Number(opt("gif", "0"));
const gifOut = opt("gif-out", out.replace(/\.png$/i, ".gif"));
const fps = Number(opt("fps", "12"));
const frameMs = Number(opt("frame-ms", "90"));
const settleMs = Number(opt("wait", "700"));

function parseCommands() {
  const file = opt("commands-file");
  const raw = opt("commands");
  if (!file && !raw) return [];
  const data = JSON.parse(file ? readFileSync(file, "utf8") : raw);
  if (Array.isArray(data)) {
    return data.map((item) => Array.isArray(item)
      ? { call: item[0], args: item.slice(1) }
      : { call: item.call, args: item.args ?? [] });
  }
  return Object.entries(data).map(([call, args]) => ({
    call,
    args: Array.isArray(args) ? args : [args],
  }));
}

const commands = parseCommands();
mkdirSync(dirname(out), { recursive: true });

let server = null;
if (!fullUrl) {
  ensureBuild();
  server = await startServer();
}
const url = fullUrl
  ? `${fullUrl}${fullUrl.includes("?") ? "&" : "?"}${query}`
  : `http://127.0.0.1:${server.port}/?${query}`;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: viewport[0], height: viewport[1] } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const framesDir = `shots/.frames-shot-${process.pid}`;
try {
  await page.goto(url);
  if (scene === "run") {
    await startRun(page);
  } else if (scene === "charselect") {
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    await waitForScene(page, "title");
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
  } else {
    await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
    await waitForScene(page, scene);
  }

  if (commands.length) {
    await page.evaluate((cmds) => {
      for (const { call, args } of cmds) {
        const fn = window.__lf?.[call];
        if (typeof fn !== "function") throw new Error(`__lf.${call} fehlt`);
        fn(...args);
      }
    }, commands);
  }
  await page.waitForTimeout(settleMs);

  if (gifFrames > 0) {
    rmSync(framesDir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    for (let i = 0; i < gifFrames; i++) {
      await page.screenshot({ path: `${framesDir}/f${String(i).padStart(3, "0")}.png` });
      if (i < gifFrames - 1) await page.waitForTimeout(frameMs);
    }
    mkdirSync(dirname(gifOut), { recursive: true });
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error",
      "-framerate", String(fps),
      "-i", `${framesDir}/f%03d.png`,
      "-vf", "scale=480:270:flags=neighbor,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=full[p];[s1][p]paletteuse=dither=none",
      gifOut,
    ], { stdio: ["ignore", "ignore", "inherit"] });
  }

  await page.screenshot({ path: out });
  writeFileSync(`${out}.json`, JSON.stringify({
    url, scene, commands, out,
    gif: gifFrames > 0 ? gifOut : null,
    jsErrors: errors,
  }, null, 2));
} finally {
  await browser.close();
  server?.stop();
  rmSync(framesDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ out, gif: gifFrames > 0 ? gifOut : null, jsErrors: errors }));
if (errors.length && !flag("allow-errors")) process.exit(1);
