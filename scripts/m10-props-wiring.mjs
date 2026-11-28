#!/usr/bin/env node
// m10-props-wiring — Vorher-/Nachher-Belege fuer die Verdrahtung der
// Prop-Varianten in GroundRenderer.addProp (3-Zeilen-Patch).
// Je Tag (--tag before|after) 4 Shots: early/chaos x (1x 640x360 + 3x-Crop
// 260x120 -> 780x360, nearest via convert -sample), plus Prop-Zusammensetzung
// ueber alle geladenen Chunks (boulder-Split, haeufigstes Prop-Anteil).
// Kein FPS-Ziel -> ohne flock. Aufruf:
//   node scripts/m10-props-wiring.mjs --tag before
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const CHAOS_AT = Number(argOf("chaos", 1290)); // 21:30: Chaos, bossenfrei (Bosse: 5-Minuten-Raster)
const VIEWPORT = { width: 640, height: 360 };
const CROP = { width: 260, height: 120 }; // -> @3 = 780x360

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

/** Dichte-LOD-Konsistenz: sichtbare Schatten ohne sichtbaren Owner-Prop
 *  (Review-Befund K4: prop_post_b wurde als Tier 2 versteckt, der Schatten
 *  blieb sichtbar -> schwebende Schatten). Ausserdem Fix-Probe: Stufenwechsel
 *  auf Tier 0 (N2 = nur Laternen) erzwingen und erneut pruefen — prop_post_b
 *  muss ueber ownerKey (Klasse prop_post, Tier 0) sichtbar bleiben. */
const tierProbe = () =>
  page.evaluate(() => {
    const g = window.__game.scene.getScene("run").ground;
    const probe = () => {
      // Zwei Durchlaeufe: erst alle sichtbaren Props sammeln, dann Schatten
      // pruefen (Ein-Durchlauf vergleicht gegen ein halb gefuelltes Set).
      const propsAt = new Set();
      let shadowTotal = 0;
      for (const e of g.chunks.values()) {
        for (const p of e.props) {
          if (p.getData("isShadow") || p.getData("glow")) continue;
          if (p.visible) propsAt.add(`${Math.round(p.x)},${Math.round(p.y)}`);
        }
      }
      let floatingShadows = 0, hiddenProps = 0, postB = 0, postBVisible = 0;
      for (const e of g.chunks.values()) {
        for (const p of e.props) {
          if (p.getData("glow")) continue;
          if (p.getData("isShadow")) {
            shadowTotal++;
            if (p.visible && !propsAt.has(`${Math.round(p.x)},${Math.round(p.y + 1)}`)) floatingShadows++;
            continue;
          }
          if (p.texture?.key === "prop_post_b") { postB++; if (p.visible) postBVisible++; }
          if (!p.visible) hiddenProps++;
        }
      }
      return { shadowTotal, floatingShadows, hiddenProps, postB, postBVisible };
    };
    const natural = probe();
    g.applyPropTier(0); // Stufenwechsel erzwingen (enemies-Schwelle uebergehen)
    const forcedTier0 = probe();
    g.applyPropTier(2); // Sichtbarkeitszustand zuruecksetzen (maxTier bleibt 2)
    return { maxTier: g.propLodMaxTier ?? null, natural, forcedTier0 };
  });

const shot3x = async (name) => {
  // 3x-Crop aus der Bildmitte (260x120 -> 780x360), nearest (keine Glättung).
  const raw = `shots/m10-props-wiring-${TAG}-${name}-1x.png`;
  await page.screenshot({ path: raw });
  execFileSync("convert", [raw, "-sample", "300%", `shots/m10-props-wiring-${TAG}-${name}-3x.png`]);
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
  await shot3x("early");
  const earlyComp = await composition();
  const earlyTier = await tierProbe();

  // ── Abschnitt "Chaos": Minute 21:30, Endgame-Build ──
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
  // Boss-Banner abwarten (UI-Szene), damit es die Belege nicht verdeckt.
  for (let i = 0; i < 40; i++) {
    const alpha = await page.evaluate(() => {
      const ui = window.__game.scene.getScene("UI");
      return ui?.bannerGroup ? ui.bannerGroup.alpha : 0;
    });
    if (!alpha) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);
  await shot3x("chaos");
  const chaosComp = await composition();
  const chaosTier = await tierProbe();

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
    card: "m10-props-wiring",
    tag: TAG,
    seed: 7,
    measuredAt: new Date().toISOString(),
    command: `node scripts/m10-props-wiring.mjs --tag ${TAG}`,
    early: share(earlyComp),
    chaos: share(chaosComp),
    tierProbe: { early: earlyTier, chaos: chaosTier },
    jsErrors: errors,
  };
  writeFileSync(`shots/m10-props-wiring-${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    early: out.early.topProp, earlyPct: out.early.topSharePct,
    chaos: out.chaos.topProp, chaosPct: out.chaos.topSharePct,
    boulderSplit: [out.early.counts.prop_boulder ?? 0, out.early.counts.prop_boulder_b ?? 0, out.early.counts.prop_boulder_c ?? 0],
    tierProbe: out.tierProbe,
    errors: errors.length,
  }));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}
process.exit(errors.length ? 1 : 0);
