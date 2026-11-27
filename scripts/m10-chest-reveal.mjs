#!/usr/bin/env node
// M10 chest-reveal lane, K1: Vorher-Beleg des Truhen-Moments.
//
// Rendert in beiden Zielt-Viewports (640x360 und 780x360@3):
//   1. Truhen-Moment am Boden (Glanz, Welt-Icon)
//   2. Öffnungs-Panel in der Roll-/Reveal-Phase (Mitte ~1.0 s, gesetzt ~1.8 s)
// und misst pixelgenau die Bounds der Panel-Elemente (Titel, Untertitel,
// Truhen-Icon, Lichtstrahl, Slots). Überlappungen (Fläche > 0) werden in
// shots/m10-chest-reveal-${OUT}.json dokumentiert, Screenshots nach
// shots/m10-chest-reveal-before-*.png sowie als Montage -before.png.
//
// Lauf (kein flock — Screenshot/Messung, kein FPS-/Echtzeit-Messlauf):
//   timeout 300 node scripts/m10-chest-reveal.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const OUT = process.argv.includes("--after") ? "after" : "before";

const FORMATS = [
  { label: "640x360", cssW: 640, cssH: 360, dpr: 2 },  // 16:9-Referenz
  { label: "780x360@3", cssW: 780, cssH: 360, dpr: 3 }, // 19.5:9, DPR 3
];

// Sammelt Bounds aller Kinder des Truhen-Panels (+ Welt-Truhe) im Browser.
// Texte: exakte Glyph-Box aus den Font-Metriken (Top-Origin, 5x7-Font,
// GLYPH_ADVANCE=6) — Container.getBounds() wäre durch Atlas-Frames aufgebläht.
// additive Lichter (chest-beam) und FX (fx_coin/fx_spark) zählen NICHT als
// Überlappung (Licht/FX sind by design über dem Panel), werden aber geloggt.
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
      verdict: !additiveLight && !fx,
      x: Math.round(box.x * 10) / 10,
      y: Math.round(box.y * 10) / 10,
      width: Math.round(box.width * 10) / 10,
      height: Math.round(box.height * 10) / 10,
    };
  });
  return { panel };
};

/** Paarweises Schnittflächen-Audit NUR über Inhalts-Elemente (Text, Icons).
 * Hintergrund (dim/frame/slot-bgs/zone), additiver Strahl und FX sind kein
 * Überlappungs-Kandidat — sie liegen by design hinter bzw. über dem Inhalt. */
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

ensureBuild();
mkdirSync("shots", { recursive: true });
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
    await page.waitForTimeout(400); // Glanz-Puls + Bob einschwingen
    await page.screenshot({ path: `shots/m10-chest-reveal-${OUT}-${fmt.label}-ground.png` });

    const ground = await page.evaluate(COLLECT);

    // Truhe öffnen (debugOpenChest: nächste Truhe in 200 px).
    await page.evaluate(() => window.__lf.openChest());
    await page.waitForTimeout(1000); // Mitte der Sequenz: Münzen + Slot-Rollen
    await page.screenshot({ path: `shots/m10-chest-reveal-${OUT}-${fmt.label}-open-mid.png` });
    const mid = await page.evaluate(COLLECT);

    await page.waitForTimeout(800); // ~1.8 s: erster Slot gesetzt, Panel noch sichtbar
    await page.screenshot({ path: `shots/m10-chest-reveal-${OUT}-${fmt.label}-open-settled.png` });
    const settled = await page.evaluate(COLLECT);

    // Evo-Reveal: Evolution erzwingen (Glutfunke 8 + Arkanes Buch 1 →
    // Phönixschwarm), damit die Evo-Hinweiszeilen sichtbar sind und mitgemessen
    // werden (Untertitel-/Hinweis-Fix gegen das größere Icon).
    await page.waitForTimeout(1300); // erste Sequenz läuft aus (Panel schließt)
    await page.evaluate(() => {
      window.__lf.addWeapon("ember", 8);
      window.__lf.addPassive("tome", 1);
      window.__lf.openChest();
    });
    await page.waitForTimeout(1550); // Evo-Settle (1450 ms) vor dem Panel-Hide (2130 ms bei 1 Belohnung)
    await page.screenshot({ path: `shots/m10-chest-reveal-${OUT}-${fmt.label}-open-evo.png` });
    const evo = await page.evaluate(COLLECT);

    const renderer = await page.evaluate(() => window.__lf.rendererInfo());

    formats.push({
      label: fmt.label,
      viewport: { width: fmt.cssW, height: fmt.cssH, dpr: fmt.dpr },
      renderer: renderer.renderer ?? null,
      groundBounds: ground,
      openMidBounds: mid,
      openSettledBounds: settled,
      openEvoBounds: evo,
      overlaps: {
        openMid: overlapsOf(mid.panel ?? []),
        openSettled: overlapsOf(settled.panel ?? []),
        openEvo: overlapsOf(evo.panel ?? []),
      },
    });
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

const report = {
  lane: "m10-chest-reveal",
  card: OUT === "after" ? "K4 Nachher-Beleg" : "K1 Vorher-Beleg",
  capturedAt: new Date().toISOString(),
  seed: 101,
  note: OUT === "after"
    ? "Nachher-Stand: Inszenierte Öffnungs-Sequenz (Timeline aus ChestSystem), größerer Icon, stärkerer Strahl, Münzen+Funken; Untertitel mit hartem Abstand zu Titel und Icon (0 Überlappung)."
    : "Vorher-Stand: Truhen-Panel klein/nüchtern; Untertitel (y=99) mit 2 px unter der Titel-Unterkante gequetscht, Icon klein (2.2/2.4), Strahl schwach. Rewards/Timings unangetastet.",
  jsErrors: errors,
  formats,
};
writeFileSync(`shots/m10-chest-reveal-${OUT}.json`, `${JSON.stringify(report, null, 2)}\n`);

// Montage (nur Dokumentation): Ground + Open-Mid je Viewport nebeneinander.
const tiles = formats.flatMap((f) => [
  `shots/m10-chest-reveal-${OUT}-${f.label}-open-mid.png`,
  `shots/m10-chest-reveal-${OUT}-${f.label}-open-settled.png`,
  `shots/m10-chest-reveal-${OUT}-${f.label}-open-evo.png`,
]);
execFileSync("montage", [...tiles, "-tile", "3x2", "-geometry", "+6+6", "-background", "#0a0a12",
  `shots/m10-chest-reveal-${OUT}.png`], { stdio: "inherit" });

console.log(JSON.stringify({ jsErrors: errors, overlaps: formats.map((f) => f.overlaps) }, null, 2));
if (errors.length > 0) process.exit(1);
