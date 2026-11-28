#!/usr/bin/env node
// m10-prop-contact-shadow — Vorher-/Nachher-Belege fuer die palettetreuen
// 1-px-Kontakt-Schatten unter Props (Restthema m9-art-world "Props mit Tiefe").
//
// Je Tag (--tag before|after):
//   - Prop-Cluster-Suche ueber geladene Chunks, Teleport des Spielers an den
//     dichtesten Cluster, dann Shots 640x360 + 960x540 + 3x-Crop (nearest).
//   - Probe: je sichtbarem Prop muss ein sichtbarer Kontakt-Schatten mit dem
//     gleichen ownerKey existieren (Schweben-Suche) + Schatten-Textur-Keys.
// Kein FPS-Ziel -> ohne flock. Aufruf:
//   node scripts/m10-prop-shadow.mjs --tag before
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const SEED = String(argOf("seed", "7"));

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

/** Sichtbare Props (ohne Schatten/Glow) ueber alle geladenen Chunks. */
const visibleProps = () =>
  page.evaluate(() => {
    const g = window.__game.scene.getScene("run").ground;
    const out = [];
    for (const e of g.chunks.values()) {
      for (const p of e.props) {
        if (!p.visible || p.getData("isShadow") || p.getData("glow")) continue;
        out.push({ x: p.x, y: p.y, key: p.texture?.key ?? "?", ownerKey: p.getData("ownerKey") ?? p.texture?.key });
      }
    }
    return out;
  });

/** Dichtester Cluster: Position mit den meisten Props im 56-px-Radius. */
const densestCluster = (props) => {
  let best = { count: 0, x: 0, y: 0 };
  for (const a of props) {
    let count = 0;
    for (const b of props) {
      if (Math.abs(a.x - b.x) <= 56 && Math.abs(a.y - b.y) <= 56) count++;
    }
    if (count > best.count) best = { count, x: a.x, y: a.y };
  }
  return best;
};

/** Schweben-Probe: jeder sichtbare Prop braucht sichtbaren Schatten gleicher Klasse. */
const shadowProbe = () =>
  page.evaluate(() => {
    const g = window.__game.scene.getScene("run").ground;
    const shadowAt = new Map(); // "x,y" -> ownerKey (nur sichtbare Schatten)
    const texKeys = new Set();
    let visibleShadows = 0;
    for (const e of g.chunks.values()) {
      for (const p of e.props) {
        if (!p.getData("isShadow")) continue;
        texKeys.add(p.texture?.key ?? "?");
        if (!p.visible) continue;
        visibleShadows++;
        shadowAt.set(`${Math.round(p.x)},${Math.round(p.y)}`, p.getData("ownerKey"));
      }
    }
    let props = 0, withShadow = 0;
    const missing = [];
    for (const e of g.chunks.values()) {
      for (const p of e.props) {
        if (!p.visible || p.getData("isShadow") || p.getData("glow")) continue;
        props++;
        const k = `${Math.round(p.x)},${Math.round(p.y + 1)}`; // Schatten sitzt 1 px unter dem Fuss
        if (shadowAt.get(k) === (p.getData("ownerKey") ?? p.texture?.key)) withShadow++;
        else missing.push({ key: p.texture?.key, x: Math.round(p.x), y: Math.round(p.y) });
      }
    }
    return { props, visibleShadows, withShadow, withoutShadow: props - withShadow, missing: missing.slice(0, 8), texKeys: [...texKeys].sort() };
  });

/** Shot; mit crop=true 3x-Crop um den Cluster (260x120 -> 780x360, nearest). */
const shot = async (name, cluster, crop = false) => {
  const raw = `~/tmp/m10-prop-contact-shadow/shot-${TAG}-${name}-1x.png`.replace("~", process.env.HOME);
  await page.screenshot({ path: raw });
  const suffix = crop ? "-crop" : "";
  const target = `shots/abnahme/m10-prop-shadow-${TAG}-${name}${suffix}.png`;
  if (crop) {
    const vp = page.viewportSize();
    execFileSync("convert", [
      raw, "-crop", "260x120+" + Math.round(vp.width / 2 - 130) + "+" + Math.round(vp.height / 2 - 60),
      "-sample", "300%", target,
    ]);
  } else {
    execFileSync("convert", [raw, target]);
  }
};

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(8);
  });
  await page.waitForTimeout(6000); // Chunks aufbauen
  await page.evaluate(() => window.__lf.setTimeScale(1));
  await page.waitForTimeout(1000);

  const props = await visibleProps();
  const cluster = densestCluster(props);
  if (cluster.count >= 2) {
    // Autoplay stoppen, damit der Spieler am Cluster bleibt; Kamera zentriert
    // den Spieler, der Cluster liegt damit im Bild-Mittelfeld.
    await page.evaluate(({ x, y }) => {
      window.__lf.autoPlay(false);
      window.__lf.god(true);
      window.__lf.teleport(Math.round(x), Math.round(y) - 12);
    }, cluster);
    await page.waitForTimeout(1400); // Kamera einschwenken
  }

  // 640x360 (Full) + 3x-Crop auf den Cluster
  await shot("640", cluster);
  await shot("640", cluster, true);
  const probe640 = await shadowProbe();

  // 960x540 (Full) + 3x-Crop
  await page.setViewportSize({ width: 960, height: 540 });
  await page.waitForTimeout(1200);
  await shot("960", cluster);
  await shot("960", cluster, true);
  const probe960 = await shadowProbe();

  const out = {
    card: "m10-prop-contact-shadow",
    tag: TAG,
    seed: SEED,
    measuredAt: new Date().toISOString(),
    command: `node scripts/m10-prop-shadow.mjs --tag ${TAG}`,
    cluster,
    visiblePropsNearby: props.length,
    probe640,
    probe960,
    jsErrors: errors,
  };
  const evDir = `${process.env.HOME}/games/.evidence/m10-prop-contact-shadow`;
  writeFileSync(`${evDir}/m10-prop-shadow-${TAG}.json`, JSON.stringify(out, null, 2));
  writeFileSync(`shots/abnahme/m10-prop-shadow-${TAG}.json`, JSON.stringify(out, null, 2));
  console.log(JSON.stringify({
    tag: TAG, cluster, probe640: { props: probe640.props, withoutShadow: probe640.withoutShadow, texKeys: probe640.texKeys },
    errors: errors.length,
  }));
} finally {
  await page.close();
  await browser.close();
  server.stop();
}
process.exit(errors.length ? 1 : 0);
