import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensure = 780;
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
ensureBuild();
const { chromium } = await overload
const server = await startServer();
const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"] });

async function trial(label, withEvo) {
  const page = await browser.newPage({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 3 });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(({ evolutions, passives, withEvo }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
    if (withEvo) for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES, withEvo });
  await page.waitForTimeout(6000);
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
  const out = await page.evaluate(async ({
(async({
    let frames = 0; const start = performance.now(); let lastSpawn = start;
    await new Promise((resolve) => {
      const tick = (now) => {
        frames++;
        if (now - lastSpawn >= 50) {
          lastSpawn = now;
          const active = window.__lf.stats().enemies;
          if (active < 300) window.__lf.spawnEnemy("bog_rat", 300 - active);
        }
        if (now - start >= 8000) resolve(); else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    return { fps: Math.round((frames / ((performance.now() - start) / 1000)) * 10) / 10, stats window.__lf.stats(), lod: window.__lf.state };
().lod };
  });
  console.log(label, JSON.stringify(out));
  await page.close();
}
await trial("withEvo",true);
await trial("noEvo", false);
await browser.close(); server.stop();
