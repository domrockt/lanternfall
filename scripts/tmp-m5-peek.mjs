#!/usr/bin/env node
// Temp-Sichtprüfung M5-02: je Waffe ein Peak-Shot.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
const IDS = process.argv.slice(2).length ? process.argv.slice(2) : ["ember", "flail", "frost", "storm", "lantern", "phoenix", "eternal_winter", "wrath_pendulum"];
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
for (const id of IDS) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=21`);
  await startRun(page);
  await page.evaluate((w) => {
    window.__lf.god(true);
    window.__lf.addWeapon(w, 8);
    window.__lf.spawnEnemy("bog_rat", 24);
    window.__lf.spawnEnemy("wisp", 16);
    window.__lf.setTimeScale(1);
  }, id);
  await page.waitForTimeout(1200);
  // Peak: irgendein aktives FX/Projektil mit hoher Alpha im Viewport.
  let shot = false;
  for (let i = 0; i < 400 && !shot; i++) {
    const ok = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      const sprites = [];
      for (const f of run.combat?.fx?.active ?? []) sprites.push(f.sprite);
      for (const p of run.combat?.particles?.active ?? []) sprites.push(p.sprite);
      for (const p of run.combat?.projectiles?.active ?? []) sprites.push(p.sprite);
      for (const st of run.combat?.states?.values?.() ?? []) {
        for (const s of st.swings ?? []) sprites.push(s.sprite);
        for (const o of st.orbs ?? []) sprites.push(o.sprite);
      }
      for (const s of run.combat?.seals ?? []) sprites.push(s.sprite);
      return sprites.some((s) => {
        if (!s?.visible || (s.alpha ?? 1) < 0.6) return false;
        const sx = (s.x - cam.scrollX), sy = (s.y - cam.scrollY);
        return sx > 8 && sy > 8 && sx < cam.width - 8 && sy < cam.height - 8;
      });
    });
    if (ok) { shot = true; break; }
    await page.waitForTimeout(16);
  }
  await page.evaluate(() => window.__game.scene.getScene("run").scene.pause());
  await page.waitForTimeout(80);
  await page.screenshot({ path: `shots/tmp-m5-${id}.png` });
  console.log(id, shot ? "peak" : "kein Peak");
  await page.close();
}
await browser.close();
server.stop();
