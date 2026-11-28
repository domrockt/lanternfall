// Probe (m10-ground-chunk-tex-dup): bootet das Spiel im Worktree-dist, 20 s laufen
// lassen, JS-Fehler/Warnungen + Spam-Zaehler sammeln. Kein Messlauf, nur Kanile.
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript(() => {
  const orig = console.warn.bind(console);
  console.warn = (...args) => {
    if (String(args[0]).includes("No texture found")) {
      orig("STACK:", new Error().stack?.split("\n").slice(1, 5).join(" | "));
    }
    orig(...args);
  };
});
page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(`${m.type()}: ${m.text()}`); });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
await waitForScene(page, "title");
await page.keyboard.press("Enter");
try {
  await waitForScene(page, "charselect");
} catch {
  const scene = await page.evaluate(() => {
    const g = window.__game;
    if (!g) return "no __game";
    const active = g.scene.getScenes(true).map((s) => s.scene.key);
    return active.join(",") || "none-active";
  });
  console.log(JSON.stringify({ bootTimeoutScene: scene, bootErrors: errors.slice(0, 15), errorCount: errors.length }, null, 1));
  await browser.close();
  server.stop();
  process.exit(2);
}
await page.keyboard.press("1");
await page.keyboard.press("Enter");
await waitForScene(page, "run");
await page.evaluate(() => { window.__lf.autoPlay(true); window.__lf.setTimeScale(30); });
await page.waitForTimeout(100000);
const spam = errors.filter((e) => e.includes("already in use"));
const other = errors.filter((e) => !e.includes("already in use"));
console.log(JSON.stringify({ spamLines: spam.length, spamSample: spam.slice(0, 3), otherErrors: other.slice(0, 10), otherCount: other.length }, null, 1));
await browser.close();
server.stop();
