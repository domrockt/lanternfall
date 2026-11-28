// M10-v10-device-acceptance (K5): Text-Lesbarkeit in allen Panels am Gerät.
// Screenshots: Titel, Charakterwahl, Level-Up, Truhe, Ergebnis — dazu Beleg,
// dass kein Auflösungs-Teiler aktiv ist (Canvas-Backing-Store = volle
// Gerätepixel, RENDER_SCALE == 1 via renderBufferSize-Logik).
//
//   node scripts/m10-v10-device-panels.mjs --out <pfad.json> --shots <verzeichnis>
//
// Nur Messung/Abnahme: keine Aenderungen an src/** oder tests/**.
const BRIDGE = "http://172.17.0.1:5181";
const CDP = "http://172.17.0.1:9333";

const argv = process.argv.slice(2);
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const outPath = arg("out", null);
const shotsDir = arg("shots", null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const { loadPlaywright } = await import("./harness.mjs");
const { chromium } = await loadPlaywright();

let browser = null;
let page = null;
const errors = [];
const connectSession = async () => {
  let ready = false;
  for (let i = 0; i < 60 && !ready; i++) {
    try {
      const list = await (await fetch(`${CDP}/json/list`)).json();
      ready = Array.isArray(list) && list.some((p) => (p.url || "").includes("index.html"));
    } catch { /* CDP noch nicht bereit */ }
    if (!ready) {
      await fetch(`${BRIDGE}/launch?q=debug=1`, { method: "POST" }).catch(() => {});
      await sleep(2000);
    }
  }
  if (!ready) throw new Error("CDP: keine Game-Page nach ~120 s");
  browser = await chromium.connectOverCDP(CDP);
  page = browser.contexts()[0].pages()[0];
  page.on("pageerror", (e) => errors.push(String(e)));
};
await connectSession();

const viewInfo = async () =>
  page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const dbg = canvas.getContext("webgl");
    const ext = dbg && dbg.getExtension("WEBGL_debug_renderer_info");
    return {
      canvas: [canvas.width, canvas.height],
      css: [Math.round(canvas.getBoundingClientRect().width), Math.round(canvas.getBoundingClientRect().height)],
      dpr: window.devicePixelRatio,
      webglRenderer: ext ? dbg.getParameter(ext.UNMASKED_RENDERER_WEBGL) : dbg.getParameter(dbg.RENDERER),
      webglVendor: ext ? dbg.getParameter(ext.UNMASKED_VENDOR_WEBGL) : dbg.getParameter(dbg.VENDOR),
      ua: navigator.userAgent,
    };
  });

const shot = async (name) => {
  // CDP page.screenshot liefert auf dem WebView identische/leere Frames —
  // daher der Geraete-Screencap der device-bridge (adb screencap), Beleg:
  // ~/games/.evidence/device/screen-*.png.
  const r = await fetch(`${BRIDGE}/screenshot`, { method: "POST" });
  const j = await r.json();
  const { copyFileSync } = await import("node:fs");
  if (j && j.path) {
    copyFileSync(j.path, `${shotsDir}/m10-v10-device-${name}.png`);
    console.log(`shot -> ${shotsDir}/m10-v10-device-${name}.png (via ${j.path}, ${j.bytes} bytes)`);
  } else {
    throw new Error(`bridge /screenshot fehlgeschlagen: ${JSON.stringify(j)}`);
  }
};

const panels = {};

// 1) Titel
await page.reload({ waitUntil: "load" });
await page.waitForFunction(() => window.__lf && window.__lf.state().scene === "title", null, { timeout: 30000 });
await sleep(2500);
panels.title = { scene: "title", ...(await viewInfo()) };
await shot("title");

// 2) Charakterwahl
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
await sleep(2000);
panels.charselect = { scene: "charselect" };
await shot("charselect");

// 3) Run -> Level-Up-Panel (natürliches XP-Level, ohne Suppress)
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf.state().scene === "run", null, { timeout: 10000 });
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.autoPlay(false); // Panel darf offen bleiben (autoPlay würde sofort wählen)
  window.__lf.spawnEnemy("wisp", 60);
  window.__lf.spawnEnemy("bog_rat", 60);
});
let levelUpOpen = false;
try {
  await page.waitForFunction(() => window.__lf.state().levelUpOpen === true, null, { timeout: 45000 });
  levelUpOpen = true;
} catch { /* Panel nicht geöffnet — unten ehrlich vermerken */ }
await sleep(1200);
panels.levelup = { scene: "run", levelUpOpen };
await shot("levelup");

// 4) Truhe (Debug-Chest öffnen)
if (levelUpOpen) {
  for (let i = 0; i < 20; i++) {
    if (!(await page.evaluate(() => window.__lf?.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
    await sleep(300);
  }
}
await page.evaluate(() => window.__lf.openChest());
await sleep(1200);
panels.chest = { scene: "run", chestOpen: await page.evaluate(() => !!window.__lf.state().chestOpen ?? true).catch(() => null) };
await shot("chest");

// 5) Ergebnis (Run beenden)
await page.evaluate(() => window.__lf.finishRun("dawn"));
await page.waitForFunction(() => window.__lf.state().scene === "results", null, { timeout: 15000 });
await sleep(2500);
panels.results = { scene: "results", ...(await viewInfo()) };
await shot("results");

const out = { gate: "K5 Text in allen Panels lesbar, kein Auflösungs-Teiler (RENDER_SCALE == 1)", panels, jsErrors: errors };
console.log(JSON.stringify(out.panels, null, 1));
if (outPath) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname } = await import("node:path");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 1));
  console.log("JSON ->", outPath);
}
await browser.close();
