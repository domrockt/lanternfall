// m10-evo-fx-zornpendel, Karte 4 Nachtrag (art-director): Hit-Signatur im Einsatz.
// Golems (220 HP) überleben den 66er-Schwung → fx_evo_hit_wrath_pendulum feuert am
// lebenden Gegner. Wartet auf die Hit-Signatur und macht sofort einen Screenshot
// (Lifetime 0,12 s). Keine FPS-Messung -> kein flock.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
mkdirSync("shots", { recursive: true });

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const results = {};
const allErrors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => allErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") allErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.addWeapon("wrath_pendulum", 8);
    window.__lf.spawnEnemy("golem", 2);
    window.__lf.spawnEnemy("treant", 1);
  });
  // Sofort screenshoten, sobald die Hit-Signatur am lebenden Gegner sichtbar ist.
  await page.waitForFunction(
    () => {
      const scene = window.__game.scene.getScene("run");
      const kids = scene.children.list ?? [];
      return kids.some((c) => {
        const key = c.texture?.key === "runtime_atlas" ? c.frame?.name : c.texture?.key;
        return c.visible && key === "fx_evo_hit_wrath_pendulum";
      });
    },
    { timeout: 20000 },
  );
  results.renderer = await page.evaluate(() => window.__lf.rendererInfo());
  results.live = await page.evaluate(() => {
    const scene = window.__game.scene.getScene("run");
    const out = {};
    for (const child of scene.children.list ?? []) {
      const key = child.texture?.key === "runtime_atlas" ? child.frame?.name : child.texture?.key;
      if (!key || !(key === "fx_evo_hit_wrath_pendulum" || key.startsWith("fx_evo_hit_wrath_pendulum"))) continue;
      if (!child.visible) continue;
      out[key] = { scaleX: +child.scaleX.toFixed(3), scaleY: +child.scaleY.toFixed(3), dispW: Math.round(child.displayWidth), aliveEnemies: window.__lf.state().enemies };
    }
    return out;
  });
  await page.screenshot({ path: "shots/m10-evo-fx-zornpendel-aftersig.png" });
  results.aliveEnemies = await page.evaluate(() => window.__lf.state().enemies);
  await page.close();
} finally {
  await browser.close();
  server.stop?.();
}

const renderer = results.renderer?.renderer ?? "UNKNOWN";
const summary = {
  generatedAt: new Date().toISOString(),
  renderer,
  valid: !/swiftshader|llvmpipe|software/i.test(renderer),
  errors: allErrors,
  results,
};
writeFileSync("shots/m10-evo-fx-zornpendel-aftersig.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
if (allErrors.length > 0 || !summary.valid) process.exit(1);
