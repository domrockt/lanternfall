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

// M10-android-proxy-gate (K1): optionaler Android-Ersatztest nach Regel 9 aus
// Wissen/Android-Optimierung-Praxis.md — Playwright-Geräteprofil "Galaxy Tab
// S4 landscape" (1138x712 CSS, dpr 2.25, Touch) plus CDP-CPU-Drosselung um
// Faktor 4. Fängt CPU-/GC-Probleme und Regressionen im Harness; ersetzt das
// echte Gerät NICHT (GPU, Thermik, Treiber) — echte Freigabe = Geräte-Telemetrie.
export const ANDROID_PROXY_DEVICE = "Galaxy Tab S4 landscape";
export const ANDROID_PROXY_THROTTLE_RATE = 4;

/**
 * Öffnet einen Browser-Kontext im Android-Ersatzprofil und drosselt die CPU
 * per CDP. Bestehende Aufrufer (perf.mjs & Co.) bleiben unverändert — der
 * Helfer ist rein optional:
 *
 *   const { context, page } = await androidProxyContext(browser);
 *
 * Liefert { context, page, cdp, device }. Der Aufrufer schließt context/page.
 */
export async function androidProxyContext(browser) {
  const pw = await loadPlaywright();
  const devices = pw.devices ?? browser.browserType().devices;
  const device = devices?.[ANDROID_PROXY_DEVICE];
  if (!device) {
    throw new Error(`androidProxyContext: Gerät "${ANDROID_PROXY_DEVICE}" fehlt in den Playwright-Devices`);
  }
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: ANDROID_PROXY_THROTTLE_RATE });
  return { context, page, cdp, device };
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
