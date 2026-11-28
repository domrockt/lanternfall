#!/usr/bin/env node
// m10-pickup-moment: Ist-/Nachher-Messung des Powerup-Aufnahme-Moments.
//
//   node scripts/m10-pickup-moment.mjs --tag=before
//   node scripts/m10-pickup-moment.mjs --tag=after
//
// Szenario: 300er-Gegner-Horde (Minute ~16, reduced-LOD-Kontext), echter
// Level-up-Pick eines PASSIVEN Angebots über window.__lf.pickLevelUp —
// derselbe Pfad wie im Spiel (UI → Run.pickLevelUp → LevelUpSystem.applyOffer).
//
// Gemessen wird im Spieler-Crop (96x72 Spielpixel, Screen-Mitte — Kamera
// zentriert den Spieler; der additive Lichtkreis um den Spieler blendet dort
// ohnehin, deshalb werden nur STARKE Pixelaenderungen gezaehlt):
//   - diffPeakPostPct: Anteil stark geänderter Pixel (Summe |ΔRGB| > 90,
//     Peak-Frame vs. Post-Frame 1,5 s später). Vorher = Chaos-Drift + generisches
//     Level-up-FX; nachher = derselbe Drift + Aufnahme-Moment.
//     AKZEPTANZGRENZE (vor der Messung festgelegt): after > before.
//   - paletteExactShareChanged: Anteil der stark geänderten Pixel, die exakt
//     einer der 32 Palettenfarben entsprechen (Mixel-/Blend-Anteil indirekt).
//     AKZEPTANZGRENZE: after > before UND after >= 50 %.
//   - nearWhitePct: Anteil Near-White-Pixel (Aufblitz lanternWhite).
//     AKZEPTANZGRENZE: after > before.
//   - moment: { triggered, activeIds } aus run.pickups (before: Felder
//     fehlen -> 0 = Ist-Beleg "lautloser Austausch").
//   - XP-/Gem-Invarianten (gem-drawcap): xpLoss = spawnedXp - grantedXp -
//     totalXp muss 0 sein, Draw-Cap MAX_VISIBLE_GEMS aktiv.
//
// Belege: shots/m10-pickup-moment-<tag>.json, -<tag>.png (Peak, voller Frame),
// -<tag>-4x.png (Spieler-Crop, 4x nearest).
// Keine FPS-/Echtzeit-Messung -> laeuft OHNE flock. Ein Lauf, kein Tuning-Loop.
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};

const TAG = String(argOf("tag", "before"));
const OUT_JSON = `shots/m10-pickup-moment-${TAG}.json`;
const OUT_PNG = `shots/m10-pickup-moment-${TAG}.png`;
const OUT_CROP = `shots/m10-pickup-moment-${TAG}-4x.png`;

// Horde 300 wie im 500er-Chaos-Kontext (Minute ~16, mehrere Silhouetten/Familien).
const HORDE = [
  ["bog_rat", 70], ["wisp", 40], ["bogzombie", 30], ["crow", 30],
  ["skeleton", 25], ["bat", 25], ["ghoul", 30], ["spider", 30],
  ["wolf", 10], ["slime", 10],
];
const HORDE_TOTAL = HORDE.reduce((a, b) => a + b[1], 0); // 300
const SKIP_SECOND = 1000; // Minute ~16,7
const POST_WAIT_MS = 1500; // Moment (0,4 s) und generisches Level-up-FX (0,95 s) vorbei

// 32-Farben-Palette (palette.ts) für die exakte Pixelzuordnung im Page-Kontext.
const PAL32 = [0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xff8a6b,0x16261e,0x22382a,0x3d5a38,0x6f9b58];

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});
const errors = [];

try {
  const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await startRun(page);

  // Chaos aufbauen: Spawns/Bosse aus, Horde 300, Spieler Mitte, God, kein Bot.
  await page.evaluate(async ({ skipSecond, horde }) => {
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.setTimeScale(1);
    for (let i = 0; i < 6; i++) run.bossFlags[i] = true;
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    await new Promise((r) => setTimeout(r, 200));
    window.__lf.skipTo(skipSecond);
    window.__lf.teleport(2048, 2048);
    await new Promise((r) => setTimeout(r, 150));
    for (const [id, n] of horde) window.__lf.spawnEnemy(id, n);
    await new Promise((r) => setTimeout(r, 150));
  }, { skipSecond: SKIP_SECOND, horde: HORDE });

  // Horde oben auffüllen (Frame-Budget-Regler kann unter den Deckel drücken).
  await page.evaluate((total) => {
    const run = window.__game.scene.getScene("run");
    const alive = run.enemies.active.filter((e) => e.alive).length;
    if (alive < total) window.__lf.spawnEnemy("bog_rat", total - alive);
  }, HORDE_TOTAL);

  // Echten Powerup-Pick auslösen: XP in 1er-Schritten (genau 1 Pending-Level),
  // passives Angebot wählen, danach restliche Level-ups schließen (echter Pfad).
  const picked = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const lf = window.__lf;
    lf.setSuppressLevelUps(false);
    let info = null;
    for (let i = 0; i < 300 && !info; i++) {
      if (!run.levelUpOpen) lf.giveXp(1);
      if (!run.levelUpOpen) continue;
      const idx = run.currentOffers.findIndex((o) => o.kind === "passive");
      if (idx >= 0) {
        info = { index: idx, id: run.currentOffers[idx].id, level: run.currentOffers[idx].level };
      } else {
        lf.pickLevelUp(0);
      }
    }
    if (!info) return { picked: false, panelStillOpen: run.levelUpOpen };
    lf.pickLevelUp(info.index);
    // Restliche Level-ups sofort schließen, damit die Szene weiterläuft.
    for (let i = 0; i < 30 && run.levelUpOpen; i++) lf.pickLevelUp(0);
    return { picked: true, ...info, panelStillOpen: run.levelUpOpen, paused: run.paused };
  });
  if (picked.picked && picked.panelStillOpen) {
    throw new Error("Level-up-Panel offen geblieben — Spiel pausiert, Messung ungueltig");
  }

  // Peak-Frame: Moment-Fenster abwarten (after) bzw. festes kurzes Fenster
  // (before: generisches Level-up-FX läuft, ~120 ms nach Panel-Schluss), dann
  // Szene einfrieren und aufnehmen.
  let peakMs = null;
  if (picked.picked) {
    const hasMoment = await page.waitForFunction(() => {
      const run = window.__game.scene.getScene("run");
      return Array.isArray(run.pickups?.moments) && run.pickups.moments.length > 0;
    }, { timeout: 3000 }).then(() => true).catch(() => false);
    if (hasMoment) peakMs = "momentWindow";
  }
  if (peakMs === null) await page.waitForTimeout(120);
  await page.evaluate(() => window.__game.scene.pause("run"));

  const runtimePeak = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const p = run.pickups;
    const s = p?.stats ?? {};
    return {
      momentActive: Array.isArray(p?.moments) ? p.moments.map((m) => m.id) : [],
      momentTriggered: p?.momentStats?.triggered ?? 0,
      momentById: p?.momentStats?.byId ?? {},
      enemies: run.enemies.active.filter((e) => e.alive).length,
      xp: {
        spawnedXp: s.spawnedXp ?? null, grantedXp: s.grantedXp ?? null,
        totalXp: p?.totalXp ?? null, collectedXp: s.collectedXp ?? null,
        xpLoss: (s.spawnedXp != null && p?.totalXp != null)
          ? s.spawnedXp - s.grantedXp - p.totalXp : null,
      },
      drawCap: p ? { maxVisibleGems: p.cap, limit: 120 } : null,
    };
  });
  await page.screenshot({ path: OUT_PNG });
  // Sanity: Simulation laeuft nach dem Resume wirklich (sonst sind Peak/Post identisch).
  const t1 = await page.evaluate(() => window.__game.scene.getScene("run").elapsed);
  await page.evaluate(() => window.__game.scene.resume("run"));
  await page.waitForTimeout(POST_WAIT_MS);
  const t2 = await page.evaluate(() => window.__game.scene.getScene("run").elapsed);
  await page.evaluate(() => window.__game.scene.pause("run"));
  const POST_PNG = OUT_PNG.replace(/\.png$/, "-post.png");
  await page.screenshot({ path: POST_PNG });
  const rendererInfo = await page.evaluate(() => {
    const info = window.__lf.rendererInfo();
    return { context: info.context, renderer: info.renderer, vendor: info.vendor, version: info.version };
  });
  await page.evaluate(() => window.__game.scene.resume("run"));

  // ── Pixel-Analyse im Browser (Peak vs. Post, Spieler-Crop 96x72 @ Screen-Mitte) ──
  const b64Peak = (await import("node:fs")).readFileSync(OUT_PNG).toString("base64");
  const b64Post = (await import("node:fs")).readFileSync(POST_PNG).toString("base64");
  const analysis = await page.evaluate(async ({ dataPeak, dataPost, pal }) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = `data:image/png;base64,${b64}`;
      await new Promise((r) => { img.onload = r; });
      const c = document.createElement("canvas");
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      return { ctx, W: c.width, H: c.height, d: ctx.getImageData(0, 0, c.width, c.height).data };
    };
    const peak = await load(dataPeak);
    const post = await load(dataPost);
    const palRgb = pal.map((h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255]);
    const isPal = (r, g, b) => palRgb.some(([pr, pg, pb]) =>
      Math.abs(r - pr) + Math.abs(g - pg) + Math.abs(b - pb) <= 12);
    const nearWhite = (r, g, b) => Math.min(r, g, b) >= 200;

    // Spieler sitzt durch Kamera-Follow in der Bildmitte.
    const S = peak.W / 480; // Screen-px je Spielpixel
    const cropW = Math.round(96 * S), cropH = Math.round(72 * S);
    const x0 = Math.round((peak.W - cropW) / 2), y0 = Math.round((peak.H - cropH) / 2);

    let n = 0, changed = 0, changedPal = 0, changedWhite = 0, whitePeak = 0, offPalPeak = 0;
    for (let y = y0; y < y0 + cropH; y++) {
      for (let x = x0; x < x0 + cropW; x++) {
        const i = (y * peak.W + x) * 4;
        const r1 = peak.d[i], g1 = peak.d[i + 1], b1 = peak.d[i + 2];
        const j = (y * post.W + x) * 4;
        const r2 = post.d[j], g2 = post.d[j + 1], b2 = post.d[j + 2];
        const diff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
        n++;
        if (nearWhite(r1, g1, b1)) whitePeak++;
        if (!isPal(r1, g1, b1)) offPalPeak++;
        if (diff > 90) {
          changed++;
          if (isPal(r1, g1, b1)) changedPal++;
          if (nearWhite(r1, g1, b1)) changedWhite++;
        }
      }
    }
    const pct = (v, t) => (t ? +((100 * v) / t).toFixed(2) : 0);
    return {
      crop: { w: cropW, h: cropH },
      diffPeakPostPct: pct(changed, n),
      paletteExactShareChanged: changed ? pct(changedPal, changed) : 0,
      nearWhitePct: pct(whitePeak, n),
      nearWhiteChangedShare: changed ? pct(changedWhite, changed) : 0,
      offPalettePct: pct(offPalPeak, n),
    };
  }, { dataPeak: b64Peak, dataPost: b64Post, pal: PAL32 });

  // Spieler-Crop als 4x-nearest-Beleg (Ausschnitt aus dem Peak-Frame).
  execFileSync("convert", [
    OUT_PNG,
    "-crop", `${analysis.crop.w}x${analysis.crop.h}+${Math.round((640 - analysis.crop.w) / 2)}+${Math.round((360 - analysis.crop.h) / 2)}`,
    "-filter", "point", "-scale", "400%", OUT_CROP,
  ], { stdio: "inherit" });

  const result = {
    tag: TAG,
    picked,
    peakWindow: peakMs ?? "fixed120ms",
    sanityElapsedAdvanced: t2 > t1,
    elapsedPeak: t1, elapsedPost: t2,
    view: "640x360@1",
    rendererInfo,
    runtimePeak,
    analysis,
    acceptance: {
      diffPeakPostPct: { value: analysis.diffPeakPostPct, rule: "after > before (Moment addiert sichtbare Aenderung)" },
      paletteExactShareChanged: { value: analysis.paletteExactShareChanged, rule: "after > before UND >= 50" },
      nearWhitePct: { value: analysis.nearWhitePct, rule: "after > before" },
      xpLoss: { value: runtimePeak.xp.xpLoss, rule: "== 0" },
    },
    jsErrors: errors,
  };
  writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ tag: TAG, picked, analysis, momentTriggered: runtimePeak.momentTriggered, xpLoss: runtimePeak.xp.xpLoss, jsErrors: errors.length }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
