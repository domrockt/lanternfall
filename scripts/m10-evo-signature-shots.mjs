// m10-evo-signature-calls, Karte K3: In-Game-Beleg fuer die Evolutions-Signaturen.
// Phoenix (Evolution von Glutfunke) als Waffe geben, Gegner daneben spawnen und
// im Moment der sichtbaren Treffer-/Todes-Signatur screenshoten. Die Textur-Keys
// der aktiven FX werden live gelesen (FxSystem.keys) — kein Blind-Screenshot.
// Keine FPS-Messung -> kein flock.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
mkdirSync("shots", { recursive: true });

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});
const errors = [];
const observed = { hit: false, death: false, keysSeen: [] };

try {
  const page = await browser.newPage({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 2 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.addWeapon("phoenix", 8);
    window.__lf.spawnEnemy("mudling", 10);
    window.__lf.spawnEnemy("bog_rat", 6);
  });
  await page.waitForTimeout(300);

  const keysActive = () =>
    page.evaluate(() => window.__game.scene.getScene("run").combat.fx.keys);

  // 1) Treffer-Signatur (fx_evo_hit_phoenix, kurz lebig aber oft wiederholt):
  await page.waitForFunction(
    () => window.__game.scene.getScene("run").combat.fx.keys.some((k) => k.startsWith("fx_evo_hit_")),
    { timeout: 8000 },
  );
  observed.keysSeen = await keysActive();
  observed.hit = true;
  await page.screenshot({ path: "shots/m10-evo-signature-hit.png" });

  // 2) Todes-Signatur (fx_evo_death_phoenix, 0,62 s sichtbar):
  await page.waitForFunction(
    () => window.__game.scene.getScene("run").combat.fx.keys.some((k) => k.startsWith("fx_evo_death_")),
    { timeout: 10000 },
  );
  observed.keysSeen = await keysActive();
  observed.death = true;
  await page.screenshot({ path: "shots/m10-evo-signature-death.png" });

  await page.waitForTimeout(1200); // Restlauf beobachten -> JS-Fehler sichtbar machen
} finally {
  await browser.close();
  server.close?.();
}

writeFileSync("shots/m10-evo-signature-evidence.json", JSON.stringify({ observed, errors }, null, 2));
console.log(JSON.stringify({ observed, errors }, null, 2));
if (errors.length > 0 || !observed.hit || !observed.death) process.exit(1);
