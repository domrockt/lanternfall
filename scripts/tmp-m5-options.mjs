#!/usr/bin/env node
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=3`);
await page.waitForFunction(() => window.__lf?.state().scene === "title");
await page.keyboard.press("o");
await page.waitForTimeout(200);
await page.screenshot({ path: "shots/tmp-m5-options-title.png" });
// 4x rechts auf SFX-Zeile
await page.keyboard.press("ArrowDown"); await page.waitForTimeout(60);
for (let i = 0; i < 4; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(60); }
await page.keyboard.press("ArrowDown"); await page.waitForTimeout(60);
await page.keyboard.press("Enter"); await page.waitForTimeout(60); // Shake aus
const opts1 = await page.evaluate(() => ({ o: window.__lf.options(), raw: localStorage.getItem("lanternfall-options-v1") }));
await page.keyboard.press("o");
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf?.state().scene === "charselect");
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf?.state().scene === "run");
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
await page.keyboard.press("o");
await page.waitForTimeout(200);
await page.screenshot({ path: "shots/tmp-m5-options-pause.png" });
await page.reload();
await page.waitForFunction(() => window.__lf?.state().scene === "title");
const opts2 = await page.evaluate(() => window.__lf.options());
console.log(JSON.stringify({ opts1, opts2, errs }, null, 2));
await browser.close(); server.stop();
