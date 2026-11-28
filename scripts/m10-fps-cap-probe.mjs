// Kurz-Probe: welches Build/Setting läuft gerade auf dem Gerät?
const CDP = "http://172.17.0.1:9333";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ready = false;
for (let i = 0; i < 30 && !ready; i++) {
  try {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    ready = Array.isArray(list) && list.some((p) => (p.url || "").includes("index.html"));
  } catch {}
  if (!ready) { await fetch("http://172.17.0.1:5181/launch?q=debug=1", { method: "POST" }).catch(() => {}); await sleep(2000); }
}
const { loadPlaywright } = await import("./harness.mjs");
const { chromium } = await loadPlaywright();
const browser = await chromium.connectOverCDP(CDP);
const page = browser.contexts()[0].pages()[0];
await page.waitForFunction(() => window.__lf, null, { timeout: 30000 }).catch(() => {});
const info = await page.evaluate(() => {
  const ri = (() => { try { return window.__lf.rendererInfo(); } catch { return null; } })();
  return {
    scene: window.__lf.state?.().scene ?? "?",
    fps: ri?.fps ?? null,
    renderer: ri?.renderer ?? null,
    options: window.__lf.options?.() ?? null,
  };
});
console.log(JSON.stringify(info));
await browser.close();
