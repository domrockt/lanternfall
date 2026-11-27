// Zoom/Viewport-Matrix: welche Kamera-Konfig rendert die volle logische Szene
// in den 390x180-Buffer? Vergleich gegen die Vollstufe (rbscale=1) auf 195x90.
// Läuft OHNE flock (kein FPS-Messlauf).
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, startRun } from "/home/ai/games/lf-lanes/m10-dpr-budget-cap/scripts/harness.mjs";

const T = "/home/ai/tmp/m10-dpr-budget-cap";
const sh = (args) => {
  try {
    return execFileSync(args[0], args.slice(1), { stdio: ["ignore", "pipe", "pipe"] }).toString().trim();
  } catch (e) {
    return (e.stderr ?? "").toString().trim();
  }
};
const ae = (s) => (s === "" ? 0 : Number(s) || 0);

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 3 });
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1&rbscale=2`);
await startRun(page);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(true);
  for (const id of ["ember", "frost", "thorn"]) window.__lf.addWeapon(id, 3);
  window.__lf.spawnEnemy("bog_rat", 40);
  window.__lf.spawnEnemy("wisp", 20);
  window.__lf.spawnEnemy("bogzombie", 20);
});
await page.waitForTimeout(2500);
const frozen = await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  for (let i = 0; i < 30 && window.__lf.stats().levelUpOpen; i++) window.__lf.pickLevelUp(0);
  run.paused = true;
  return { paused: run.paused, levelUpOpen: window.__lf.stats().levelUpOpen };
});
await page.waitForTimeout(300);

// Referenz: Vollstufe (Override 1) — Grundwahrheit fuer den Strukturvergleich.
await page.evaluate(() => { window.__rbOverride = 1; });
await page.waitForTimeout(300);
await page.screenshot({ path: `${T}/ref-full.png` });

// Manuelle Matrix: Enforcement aus, Kameras per Hand setzen.
await page.evaluate(() => {
  window.__rbOverride = 2;
  window.__rbManual = true;
});
const setCameras = (zoom, vw, vh) => page.evaluate(({ zoom, vw, vh }) => {
  for (const s of window.__game.scene.scenes) {
    const mgr = s.cameras;
    const cams = mgr.cameras || mgr.list || (mgr.main ? [mgr.main] : []);
    for (const cam of cams) {
      // Midpoint vor der Aenderung sichern und danach restaurieren.
      const midX = cam.scrollX + cam.width / 2;
      const midY = cam.scrollY + cam.height / 2;
      cam.setViewport(0, 0, vw, vh, false);
      cam.setZoom(zoom);
      cam.scrollX = midX - vw / 2;
      cam.scrollY = midY - vh / 2;
    }
  }
}, { zoom, vw, vh });

const configs = [
  { name: "z1_vp_game", zoom: 1, vw: 780, vh: 360 },
  { name: "z0.5_vp_game", zoom: 0.5, vw: 780, vh: 360 },
  { name: "z0.25_vp_game", zoom: 0.25, vw: 780, vh: 360 },
  { name: "z1_vp_half", zoom: 1, vw: 390, vh: 180 },
  { name: "z0.5_vp_half", zoom: 0.5, vw: 390, vh: 180 },
  { name: "z0.25_vp_half", zoom: 0.25, vw: 390, vh: 180 },
];
const results = [];
for (const cfg of configs) {
  await setCameras(cfg.zoom, cfg.vw, cfg.vh);
  await page.waitForTimeout(250);
  const path = `${T}/mat-${cfg.name}.png`;
  await page.screenshot({ path });
  sh(["convert", path, "-filter", "point", "-resize", "390x180!", `${T}/mat-${cfg.name}-small.png`]);
  sh(["convert", `${T}/ref-full.png`, "-filter", "point", "-resize", "390x180!", `${T}/ref-small.png`]);
  const content = ae(sh(["compare", "-metric", "AE", `${T}/mat-${cfg.name}-small.png`, `${T}/ref-small.png`, "null:"]));
  sh(["convert", `${T}/mat-${cfg.name}-small.png`, "-filter", "point", "-resize", "195x90!", `${T}/mat-${cfg.name}-struct.png`]);
  sh(["convert", `${T}/ref-small.png`, "-filter", "point", "-resize", "195x90!", `${T}/ref-struct.png`]);
  const struct = ae(sh(["compare", "-metric", "AE", `${T}/mat-${cfg.name}-struct.png`, `${T}/ref-struct.png`, "null:"]));
  results.push({ ...cfg, contentAE: content, structAE: struct, structTotal: 195 * 90 });
  console.log(JSON.stringify({ ...cfg, contentAE: content, structAE: struct }));
}
console.log("frozen:", JSON.stringify(frozen));
await browser.close();
server.stop();
process.exit(0);
