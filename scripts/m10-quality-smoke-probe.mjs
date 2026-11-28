#!/usr/bin/env node
// Funktions-Probe (kein Perf-Messlauf): spawnEnemy/skipTo-Verhalten im Harness.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => console.log("PAGEERROR", String(e)));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=99`);
  await startRun(page);
  await page.evaluate(() => { window.__lf.god(true); window.__lf.autoPlay(true); });
  const r1 = await page.evaluate(() => { window.__lf.skipTo(150); return window.__lf.state().time; });
  console.log("after skipTo(150): time=", r1);
  const r2 = await page.evaluate(() => {
    const a = window.__lf.spawnEnemy("bog_rat", 260);
    const b = window.__lf.spawnEnemy("wisp", 260);
    const s = window.__lf.state();
    return { a, b, enemies: s.enemies, paused: s.paused, levelUpOpen: s.levelUpOpen };
  });
  console.log("after spawn:", JSON.stringify(r2));
  for (const ms of [1000, 5000, 10000]) {
    await new Promise((r) => setTimeout(r, ms - (ms === 1000 ? 0 : ms === 5000 ? 1000 : 5000)));
    const s = await page.evaluate(() => window.__lf.state());
    console.log(`t+${ms}s: enemies=`, s.enemies, "time=", s.time, "paused=", s.paused, "levelUpOpen=", s.levelUpOpen);
  }
} finally {
  await browser.close().catch(() => {});
  server.stop();
}
