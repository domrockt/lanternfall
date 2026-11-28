// M10-mobile-fps-cap: Render-Rate-Probe am Gerät — zählt echte WebGL-Draw-Aufrufe
// (drawElements/drawArrays) pro Sekunde im Minute-25-Setup, Modus via ?probe_fps.
// Vergleicht Cap-60 vs. max: bei wirksamem Cap halbiert sich die Draw-Rate ~60/110.
const CDP = "http://172.17.0.1:9333";
const BRIDGE = "http://172.17.0.1:5181";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const mode = process.argv[2] ?? "60"; // "60" | "max"

let ready = false;
for (let i = 0; i < 30 && !ready; i++) {
  try {
    const list = await (await fetch(`${CDP}/json/list`)).json();
    ready = Array.isArray(list) && list.some((p) => (p.url || "").includes("index.html"));
  } catch {}
  if (!ready) { await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" }).catch(() => {}); await sleep(2000); }
}
const { loadPlaywright } = await import("./harness.mjs");
const { chromium } = await loadPlaywright();
const browser = await chromium.connectOverCDP(CDP);
const page = browser.contexts()[0].pages()[0];

// Draw-Zähler VOR dem Boot der Seite installieren (gilt nach reload).
await page.addInitScript(() => {
  window.__lfDraw = { elements: 0, arrays: 0 };
  const wrap = (proto, key, slot) => {
    const orig = proto[key];
    if (typeof orig !== "function") return;
    proto[key] = function (...args) {
      window.__lfDraw[slot]++;
      return orig.apply(this, args);
    };
  };
  wrap(WebGLRenderingContext.prototype, "drawElements", "elements");
  wrap(WebGLRenderingContext.prototype, "drawArrays", "arrays");
  const w2 = WebGL2RenderingContext?.prototype;
  if (w2) { wrap(w2, "drawElements", "elements"); wrap(w2, "drawArrays", "arrays"); }
});

if (mode === "60" || mode === "max") {
  await page.evaluate((v) => {
    let opts = {};
    try { opts = JSON.parse(localStorage.getItem("lanternfall-options-v1") || "{}"); } catch {}
    opts.fps = v;
    localStorage.setItem("lanternfall-options-v1", JSON.stringify(opts));
  }, mode === "60" ? 60 : 0);
}
const url = page.url();
const targetUrl = /debug=1/.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}debug=1`;
await page.goto(targetUrl, { waitUntil: "load" });
await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.setSuppressLevelUps(true);
  window.__lf.autoPlay(true);
  for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) window.__lf.addWeapon(id, 8);
  for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
  window.__lf.skipTo(1490);
  window.__lf.setTimeScale(1);
});
await sleep(5000);
// Top-up auf 300 + 10 s messen
await page.evaluate(() => {
  const deficit = 300 - window.__lf.stats().enemies;
  if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
});
await page.evaluate(() => { window.__lfDraw = { elements: 0, arrays: 0, t0: performance.now() }; });
await sleep(10000);
const res = await page.evaluate(() => {
  const dt = (performance.now() - window.__lfDraw.t0) / 1000;
  const total = window.__lfDraw.elements + window.__lfDraw.arrays;
  return {
    mode: undefined,
    drawsPerSec: Math.round(total / dt),
    elements: window.__lfDraw.elements, arrays: window.__lfDraw.arrays,
    fps: window.__lf.stats().fps,
    enemies: window.__lf.stats().enemies,
    fpsConfig: (() => { try { return window.__lf.rendererInfo().fps; } catch { return null; } })(),
  };
});
console.log(JSON.stringify({ mode, ...res }));
await browser.close();
