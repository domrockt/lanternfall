// Gemeinsame Helfer für perf.mjs / verify.mjs: statischer Server + Browser.
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";

const require = createRequire(import.meta.url);

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir)) {
    const path = `${dir}/${entry}`;
    const stat = statSync(path);
    newest = Math.max(newest, stat.isDirectory() ? newestMtime(path) : stat.mtimeMs);
  }
  return newest;
}

export function ensureBuild() {
  const index = "dist/index.html";
  const stale =
    !existsSync(index) ||
    newestMtime("src") > statSync(index).mtimeMs ||
    statSync("index.html").mtimeMs > statSync(index).mtimeMs ||
    statSync("package.json").mtimeMs > statSync(index).mtimeMs;
  if (stale) {
    console.log("[harness] dist veraltet/fehlt, baue neu ...");
    execFileSync("npm", ["run", "build"], { stdio: "inherit" });
  }
  mkdirSync("shots", { recursive: true });
}

export async function startServer() {
  const port = 5400 + Math.floor(Math.random() * 400);
  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "-d", "dist"], {
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) return { port, stop: () => server.kill() };
    } catch { /* noch nicht bereit */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  server.kill();
  throw new Error("Statischer Server konnte nicht gestartet werden");
}

export async function loadPlaywright() {
  try {
    return require("playwright");
  } catch {
    return require("/usr/lib/node_modules/playwright");
  }
}

export async function waitForScene(page, scene, timeout = 8000) {
  await page.waitForFunction(
    (s) => window.__lf && window.__lf.state().scene === s,
    scene,
    { timeout },
  );
}

export async function startRun(page) {
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
}
