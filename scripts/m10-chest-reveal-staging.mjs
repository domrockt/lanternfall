#!/usr/bin/env node
// Lane m10-chest-reveal-staging, K1/K2/K4: Mess-Skript für den offenen
// Truhen-Panel-Stand (Muster scripts/m10-chest-reveal.mjs, keine FPS-Messung
// -> kein flock).
//
// Rendert beide Ziel-Viewports (640x360, 780x360@3), öffnet die Truhe und
// misst pixelgenau die Bounds aller Inhalts-Elemente des Truhen-Panels
// (Titel, Untertitel, Icon, Slots, Hinweise). Ergebnis: paarweise
// Überlappungsflächen (Ziel: 0 px²) + Inventar der Inszenierung
// (Panel-Strahl, Icon-Draw-Stufe, Münzen/Funken).
//
// Belege (außerhalb des Repos, Dom 27.11.):
//   ~/games/.evidence/m10-chest-reveal-staging/m10-chest-reveal-staging-<mode>.json
// Abnahme-Bilder (in git, explizit adden):
//   shots/abnahme/m10-chest-reveal-staging-<fmt>-open-*.png
//
// Lauf: timeout 300 node scripts/m10-chest-reveal-staging.mjs [--after]
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const MODE = process.argv.includes("--after") ? "after" : "audit";

const FORMATS = [
  { label: "640x360", cssW: 640, cssH: 360, dpr: 2 },   // 16:9-Referenz
  { label: "780x360@3", cssW: 780, cssH: 360, dpr: 3 }, // 19.5:9, DPR 3
];

const EVIDENCE_DIR = `${homedir()}/games/.evidence/m10-chest-reveal-staging`;
const SHOTS_DIR = "shots/abnahme";

// Bounds aller Kinder des Truhen-Panels (identisch zu scripts/m10-chest-reveal.mjs:
// Texte aus Font-Metriken statt getBounds(), additive Lichter/FX ohne Verdict).
const COLLECT = () => {
  const ui = window.__game.scene.getScene("ui");
  const group = ui.children.getByName("chest-group");
  if (!group || !group.visible) return { panel: null };
  const panel = group.list.map((ch) => {
    const isText = typeof ch.valueText === "string";
    let box;
    if (isText) {
      const s = ch.scale || 1;
      const glyphW = Math.max(0, ch.valueText.length * 6 - 1);
      const offX = ch.align === "center" ? -Math.floor(glyphW / 2)
        : ch.align === "right" ? -glyphW : 0;
      box = { x: ch.x + offX * s, y: ch.y, width: glyphW * s, height: 7 * s };
    } else {
      const b = ch.getBounds();
      box = { x: b.x, y: b.y, width: b.width, height: b.height };
    }
    const texture = ch.texture && ch.texture.key ? String(ch.texture.key) : null;
    const additiveLight = ch.name === "chest-beam";
    const fx = texture === "fx_coin" || texture === "fx_spark";
    return {
      name: ch.name || null,
      type: ch.type,
      texture,
      text: isText ? ch.valueText : null,
      alpha: Math.round(ch.alpha * 100) / 100,
      scaleX: Math.round(ch.scaleX * 100) / 100,
      verdict: !additiveLight && !fx,
      x: Math.round(box.x * 10) / 10,
      y: Math.round(box.y * 10) / 10,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
    };
  });
  return { panel };
};

function isContent(it) {
  if (it.text !== null) return true;
  return Boolean(it.texture && (it.texture.startsWith("icon_") || it.texture.startsWith("chest_")));
}

function overlapsOf(items) {
  const all = items.map((it, i) => ({ ...it, id: it.name || `${it.type}:${it.texture ?? ""}#${i}` }));
  const out = [];
  for (let a = 0; a < all.length; a++) {
    for (let b = a + 1; b < all.length; b++) {
      const A = all[a];
      const B = all[b];
      if (!A.verdict || !B.verdict || !isContent(A) || !isContent(B)) continue;
      const ix = Math.max(0, Math.min(A.x + A.width, B.x + B.width) - Math.max(A.x, B.x));
      const iy = Math.max(0, Math.min(A.y + A.height, B.y + B.height) - Math.max(A.y, B.y));
      if (ix > 0 && iy > 0) {
        out.push({ a: A.id, b: B.id, area: Math.round(ix * iy * 10) / 10 });
      }
    }
  }
  return out;
}

/** Inventar der Inszenierung (K3-Merkmale) aus den gesammelten Bounds. */
function stagingOf(collect) {
  const panel = collect.panel ?? [];
  const beam = panel.find((it) => it.texture === "light_radius") ?? null;
  const coins = panel.filter((it) => it.texture === "fx_coin");
  const sparks = panel.filter((it) => it.texture === "fx_spark");
  const icon = panel.find((it) => it.texture && it.texture.startsWith("chest_")) ?? null;
  return {
    panelBeam: beam ? { texture: beam.texture, alpha: beam.alpha, scaleX: beam.scaleX } : null,
    coinCount: coins.length,
    sparkCount: sparks.length,
    panelIcon: icon ? { texture: icon.texture, scaleX: icon.scaleX } : null,
  };
}

ensureBuild();
mkdirSync(EVIDENCE_DIR, { recursive: true });
mkdirSync(SHOTS_DIR, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();

const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

const errors = [];
const formats = [];
try {
  for (const fmt of FORMATS) {
    const context = await browser.newContext({
      viewport: { width: fmt.cssW, height: fmt.cssH },
      deviceScaleFactor: fmt.dpr,
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.label}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.setTimeScale(1);
      const run = window.__game.scene.getScene("run");
      run.teleport(1000, 1000);
      run.chests.spawn(1030, 1000);
    });
    await page.waitForTimeout(400);

    // Truhe öffnen, Roll-Phase (400 ms): Münzen im Flug — der fx_coin-Tween
    // läuft 700–1050 ms und blendet zum Ende auf alpha 0 aus, ein späterer
    // Capture verpasst die Münzen (art-director-Befund).
    await page.evaluate(() => window.__lf.openChest());
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS_DIR}/m10-chest-reveal-staging-${fmt.label}-open-mid.png` });
    const mid = await page.evaluate(COLLECT);

    await page.waitForTimeout(1400); // ~1.8 s nach Öffnen: erster Slot gesetzt, Panel sichtbar
    await page.screenshot({ path: `${SHOTS_DIR}/m10-chest-reveal-staging-${fmt.label}-open-settled.png` });
    const settled = await page.evaluate(COLLECT);

    // Evo-Reveal (Untertitel-/Hinweis-Fix gegen das größere Panel-Icon):
    await page.waitForTimeout(1300);
    await page.evaluate(() => {
      window.__lf.addWeapon("ember", 8);
      window.__lf.addPassive("tome", 1);
      window.__lf.openChest();
    });
    await page.waitForTimeout(1550);
    await page.screenshot({ path: `${SHOTS_DIR}/m10-chest-reveal-staging-${fmt.label}-open-evo.png` });
    const evo = await page.evaluate(COLLECT);

    const renderer = await page.evaluate(() => window.__lf.rendererInfo());

    formats.push({
      label: fmt.label,
      viewport: { width: fmt.cssW, height: fmt.cssH, dpr: fmt.dpr },
      renderer: renderer.renderer ?? null,
      openMidBounds: mid,
      openSettledBounds: settled,
      openEvoBounds: evo,
      overlaps: {
        openMid: overlapsOf(mid.panel ?? []),
        openSettled: overlapsOf(settled.panel ?? []),
        openEvo: overlapsOf(evo.panel ?? []),
      },
      staging: {
        openMid: stagingOf(mid),
        openSettled: stagingOf(settled),
        openEvo: stagingOf(evo),
      },
    });
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const report = {
  lane: "m10-chest-reveal-staging",
  card: MODE === "after" ? "K4 Nachher-Beleg" : "K1 Erledigt-Prüfung (Ist-Stand auf main)",
  capturedAt: new Date().toISOString(),
  seed: 101,
  acceptance: "0 px Überlappungsfläche zwischen Inhalts-Elementen in beiden Viewports (640x360, 780x360@3).",
  jsErrors: errors,
  formats,
};
const outFile = `${EVIDENCE_DIR}/m10-chest-reveal-staging-${MODE}.json`;
writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  outFile,
  jsErrors: errors,
  overlaps: formats.map((f) => ({ label: f.label, ...f.overlaps })),
  staging: formats.map((f) => ({ label: f.label, ...f.staging })),
}, null, 2));

const totalOverlaps = formats.reduce((n, f) => n
  + f.overlaps.openMid.length + f.overlaps.openSettled.length + f.overlaps.openEvo.length, 0);
if (errors.length > 0 || totalOverlaps > 0) process.exit(1);
