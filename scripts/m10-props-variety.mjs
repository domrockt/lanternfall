#!/usr/bin/env node
// m10-props-variety — Vorher-/Nachher-Belege fuer die Prop-Vielfalt am Boden.
// Misst EINMAL je Tag (before/after): zwei Kartenabschnitte (frueh ~45 s und
// Chaos ~ Minute 25 via skipTo) als 1x-Screenshot + 2x-Crop, plus die
// Prop-Zusammensetzung ueber alle geladenen Chunks (haufigstes Prop-Anteil in %).
// Kein FPS-Ziel -> ohne flock. Aufruf:
//   node scripts/m10-props-variety.mjs --tag before
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const CHAOS_AT = Number(argOf("chaos", 1290)); // 21:30: Chaos, aber bossenfrei (Bosse: 5-Minuten-Raster)
const VIEWPORT = { width: 640, height: 360 };

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

/** Prop-Zusammensetzung ueber alle geladenen Chunks (nur Props, ohne Schatten/Glow). */
const composition = () =>
  page.evaluate(() => {
    const g = window.__game.scene.getScene("run").ground;
    const counts = {};
    let total = 0;
    for (const e of g.chunks.values()) {
      for (const p of e.props) {
        if (!p.visible || p.getData("isShadow") || p.getData("glow")) continue;
        const k = p.texture?.key ?? "?";
        counts[k] = (counts[k] || 0) + 1;
        total++;
      }
    }
    return { total, counts };
  });

const shot2x = async (name) => {
  // 2x-Crop aus der Bildmitte (320x180 -> 640x360), nearest durch pixelArt-Canvas.
  await page.screenshot({
    path: `shots/m10-props-variety-${TAG}-${name}-2x.png`,
    clip: { x: VIEWPORT.width / 4, y: VIEWPORT.height / 4, width: VIEWPORT.width / 2, height: VIEWPORT.height / 2 },
  });
};

try {
  // ── Abschnitt "frueh": frische Chunks, wenige Gegner ──
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(8);
  });
  await page.waitForTimeout(6000); // Chunks aufbauen
  await page.evaluate(() => window.__lf.setTimeScale(1));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `shots/m10-props-variety-${TAG}-early-1x.png` });
  await shot2x("early");
  const earlyComp = await composition();

  // ── Abschnitt "Chaos": Minute 25, Endgame-Build ──
  await page.evaluate((t) => {
    window.__lf.setTimeScale(30);
    window.__lf.skipTo(t);
  }, CHAOS_AT);
  for (let i = 0; i < 60; i++) {
    const st = await page.evaluate(() => window.__lf.stats());
    if (st.levelUpOpen) await page.evaluate(() => window.__lf.pickLevelUp(0));
    if (st.time >= CHAOS_AT + 5) break;
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => window.__lf.setTimeScale(1));
  await page.waitForTimeout(2500); // Chunks um Position neu aufbauen
  // Boss-Banner abwarten (UI-Szene, 2,4 s Halt + Fade), damit es die Belege nicht verdeckt.
  for (let i = 0; i < 40; i++) {
    const alpha = await page.evaluate(() => {
      const ui = window.__game.scene.getScene("UI");
      return ui?.bannerGroup ? ui.bannerGroup.alpha : 0;
    });
    if (!alpha) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/m10-props-variety-${TAG}-chaos-1x.png` });
  await shot2x("chaos");
  const chaosComp = await composition();

  const share = (comp) => {
    const entries = Object.entries(comp.counts).sort((a, b) => b[1] - a[1]);
    const top = entries[0] ?? ["-", 0];
    return {
      totalProps: comp.total,
      topProp: top[0],
      topCount: top[1],
      topSharePct: comp.total ? Math.round((top[1] / comp.total) * 1000) / 10 : 0,
      counts: comp.counts,
    };
  };
  const out = {
    card: "m10-props-variety",
    tag: TAG,
    seed: 7,
    measuredAt: new Date().toISOString(),
    command: `node scripts/m10-props-variety.mjs --tag ${TAG}`,
    early: share(earlyComp),
    chaos: share(chaosComp),
    jsErrors: errors,
  };
  writeFileSync(`shots/m10-props-variety-${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ early: out.early.topProp, earlyPct: out.early.topSharePct, chaos: out.chaos.topProp, chaosPct: out.chaos.topSharePct, errors: errors.length }));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}
process.exit(errors.length ? 1 : 0);
