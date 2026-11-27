#!/usr/bin/env node
/**
 * M10-shot-clarity — Chaos-Messung der Gegner-Projektil-Lesbarkeit (300/500 Gegner).
 *
 * Misst in zwei Chaos-Szenen (300 und 500 Gegner, vielfach ueberlagert):
 *   - Schuesse je Typ (Texturen der aktiven Projektile + Pool-Statistik),
 *   - Near-White-Anteil der Schuss-Pixel (A7-Definition: r,g,b >= 150 und r >= 235,
 *     Kalibrierung wie ACCEPTANCE A7 / m10-ember-readability),
 *   - WCAG-Kontrast der Schuss-Pixel gegen den lokalen Hintergrund (Box je Schuss),
 *   - Palettentreue + binaeres Alpha der 4 Schuss-Texturen (Kontaktblatt aus den
 *     echten Laufzeit-Texturen),
 *   - Farb-Ueberschneidung Gegner-Schusstypen <-> Spieler-Projektil (projectile_ember).
 *
 * Screenshots: shots/m10-shot-clarity-<tag>-300.png / -500.png, JSON: -<tag>.json.
 * Aufruf: node scripts/m10-shot-clarity.mjs --tag=before
 *
 * Keine FPS-/Echtzeit-Messung -> keine flock-Sperre (feste Szenenaufbau- und
 * Wartezeiten, Screenshot/Analyse lastunabhaengig).
 */
import { mkdirSync, writeFileSync } from "node:fs";
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

// 32-Farben-Palette (Hex, identisch zu PAL in src/palette.ts).
const PALETTE_HEX = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];

// Chaos-Mix: alle 4 Schuss-Familien ueber ranged/summoner-Archetypen vertreten
// (toad=spit, witchling=bone, lich=shadow, horror=fire), Rest chaos-Fuelle.
const MIX = [
  ["toad", 22], ["witchling", 18], ["lich", 15], ["horror", 15],
  ["bog_rat", 10], ["crow", 8], ["bat", 6], ["spider", 6],
];
const FAMILIES = ["spit", "bone", "shadow", "fire"];
const HD_PREFIX = "enemy_shot_hd_";
const MINUTE = 1490; // Minute 25: Endgame-Chaos.
const INJECT_PER_FAMILY = 24; // garantiert alle 4 Familien sichtbar (3 Wellen à 8).

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
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);

// ---------- Laufzeit-Texturen (Kontaktblatt-Analyse, exakt) ----------
const texAnalysis = await page.evaluate(({ families, prefix, palette }) => {
  const run = window.__game.scene.getScene("run");
  const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const nearA7 = (r, g, b) => r >= 150 && g >= 150 && b >= 150 && r >= 235;
  const nearMin = (r, g, b) => Math.min(r, g, b) >= 200;
  const out = { textures: {}, crossFamily: {}, playerOverlap: {} };

  const gridColors = (texKey) => {
    const tex = run.textures.get(texKey);
    if (!tex || !tex.source) return null;
    const img = tex.getSourceImage();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const colors = new Map();
    let opaque = 0, semi = 0, off = 0, nA7 = 0, nMin = 0;
    for (let i = 0; i < c.width * c.height; i++) {
      const a = d[i * 4 + 3];
      if (a === 0) continue;
      const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
      if (a !== 255) { semi++; continue; }
      opaque++;
      const hex = (r << 16) | (g << 8) | b;
      const pi = palette.indexOf(hex);
      if (pi < 0) off++;
      colors.set(pi, (colors.get(pi) ?? 0) + 1);
      if (nearA7(r, g, b)) nA7++;
      if (nearMin(r, g, b)) nMin++;
    }
    return { w: c.width, h: c.height, opaque, semi, offPalette: off,
      colors: [...colors.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ index: k, n })),
      nearWhiteA7: nA7, nearWhiteA7Pct: opaque ? +((100 * nA7) / opaque).toFixed(2) : 0,
      nearWhiteMinRgb200: nMin, nearWhiteMinRgb200Pct: opaque ? +((100 * nMin) / opaque).toFixed(2) : 0,
      binaryAlpha: semi === 0,
      mask: [...colors.keys()] };
  };

  for (const f of families) out.textures[f] = gridColors(prefix + f);

  // Farb-Masken: eindeutige vs geteilte Farben ueber die 4 Familien.
  const countBy = {};
  for (const f of families) for (const i of out.textures[f].mask) countBy[i] = (countBy[i] ?? 0) + 1;
  for (const f of families) {
    const uniq = out.textures[f].mask.filter((i) => countBy[i] === 1);
    const shared = out.textures[f].mask.filter((i) => countBy[i] > 1);
    const tot = out.textures[f].opaque;
    const uniqPx = out.textures[f].colors.filter((c) => uniq.includes(c.index)).reduce((a, c) => a + c.n, 0);
    out.crossFamily[f] = {
      uniqueColors: uniq, sharedColors: shared,
      uniqueColorSharePct: tot ? +((100 * uniqPx) / tot).toFixed(2) : 0,
    };
  }

  // Spieler-Projektil (projectile_ember): Farbueberschneidung mit Gegner-Familien.
  const player = gridColors("projectile_ember");
  out.playerOverlap.projectile_ember = { colors: player.colors, mask: player.mask,
    overlapsWith: {}, };
  for (const f of families) {
    const inter = player.mask.filter((i) => out.textures[f].mask.includes(i));
    out.playerOverlap.projectile_ember.overlapsWith[f] = inter;
  }
  return out;
}, { families: FAMILIES, prefix: HD_PREFIX, palette: PALETTE_HEX });

// ---------- Chaos-Szenen ----------
const scenes = [];
mkdirSync("shots", { recursive: true });

for (const TOTAL of [300, 500]) {
  const sceneTag = `${TAG}-${TOTAL}`;
  const prep = await page.evaluate(async ({ total, mix, minute, injectPerFamily, families, prefix }) => {
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.skipTo(minute);
    window.__lf.setTimeScale(1);
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    await new Promise((r) => setTimeout(r, 250));

    const len = mix.length;
    const sum = mix.reduce((a, b) => a + b[1], 0);
    const per = mix.map(([, n]) => Math.max(1, Math.round((n / sum) * total)));
    const px = 2048, py = 2048;
    window.__lf.teleport(px, py);
    const rand = Math.random;
    let spawned = 0;
    for (let i = 0; i < len; i++) {
      const count = per[i];
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(mix[i][0], count);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        // Ueber die sichtbare Flaeche verteilt (Chaos, deutliche Ueberlagerung).
        const side = rand() < 0.5 ? 1 : -1;
        e.x = px + side * (10 + rand() * 200);
        e.y = py + (rand() - 0.5) * 230;
        e.vx = 0; e.vy = 0;
        e.hp = 1e9; e.maxHp = 1e9;
        e.damage = Math.max(0, e.damage);
      }
      spawned += fresh.length;
    }

    // KI schiezen lassen (2 s Echtzeit).
    await new Promise((r) => setTimeout(r, 2000));

    // Injection ueber den ECHTEN Pool (Wind-up 0,35 s wie im Spiel), 3 Wellen,
    // damit das Telegraph-Cap (96) nicht anschlaegt.
    const cam = run.cameras.main;
    const view = cam.worldView;
    let injected = 0;
    for (let wave = 0; wave < 3; wave++) {
      for (let f = 0; f < families.length; f++) {
        for (let k = 0; k < 8; k++) {
          const x = view.x + 30 + rand() * (view.width - 60);
          const y = view.y + 30 + rand() * (view.height - 60);
          const a = rand() * Math.PI * 2;
          const ok = run.enemyShots.spawn({
            x, y, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90,
            damage: 2, radius: 4, texture: `${prefix}${families[f]}`, life: 4,
          });
          if (ok !== null) injected++;
        }
      }
      await new Promise((r) => setTimeout(r, 550));
    }
    // Wind-up abwarten, damit alle injizierten Schuesse in der Luft sind.
    await new Promise((r) => setTimeout(r, 600));

    // Statistik + Schusszentren (Welt) + View zum Screenshot-Zeitpunkt.
    const active = run.enemyShots.active.map((s) => ({ x: s.x, y: s.y, texture: s.texture }));
    const byTexture = {};
    for (const s of active) byTexture[s.texture] = (byTexture[s.texture] ?? 0) + 1;
    const stats = run.enemyShots.statSnapshot();
    const worldView = { x: view.x, y: view.y, width: view.width, height: view.height };
    return { spawned, injected, active, byTexture, stats, worldView };
  }, { total: TOTAL, mix: MIX, minute: MINUTE, injectPerFamily: INJECT_PER_FAMILY, families: FAMILIES, prefix: HD_PREFIX });

  // Screenshot im selben Frame-Zustand (leicht versetzt, Chaos bleibt).
  const pngPath = `shots/m10-shot-clarity-${sceneTag}.png`;
  await page.screenshot({ path: pngPath });
  const shotCenters = prep.active.map((s) => ({
    fx: (s.x - prep.worldView.x) * (960 / prep.worldView.width),
    fy: (s.y - prep.worldView.y) * (540 / prep.worldView.height),
    family: s.texture.replace(HD_PREFIX, ""),
  }));

  scenes.push({ sceneTag, total: TOTAL, ...prep, centers: shotCenters, pngPath });
}

await browser.close();
server.stop();

const { chromium: chromium2 } = await loadPlaywright();
const browser2 = await chromium2.launch();
const page2 = await browser2.newPage({ viewport: { width: 10, height: 10 } });
await page2.goto("about:blank");

// Die eigentliche Analyse braucht die Familien-Farbmasken aus texAnalysis:
// In Node ueber page2 einspeisen.
const familyColorMasks = {};
for (const f of FAMILIES) familyColorMasks[f] = texAnalysis.textures[f].mask;
const sharedColors = FAMILIES.length ? Object.values(texAnalysis.crossFamily).flatMap((c) => c.sharedColors) : [];

const pngAnalysis = [];
for (const s of scenes) {
  const b64 = (await import("node:fs")).readFileSync(s.pngPath).toString("base64");
  const res = await page2.evaluate(async ({ dataUrl, centers, palette, familyMasks, shared }) => {
    const img = new Image();
    img.src = dataUrl;
    await new Promise((r) => { img.onload = r; });
    const W = img.width, H = img.height;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, W, H).data;
    const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
    const palRgb = palette.map(rgb);
    const nearA7 = (r, g, b) => r >= 150 && g >= 150 && b >= 150 && r >= 235;
    const nearMin = (r, g, b) => Math.min(r, g, b) >= 200;
    const lum = (r, g, b) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const contrast = (l1, l2) => { const a = Math.max(l1, l2), b = Math.min(l1, l2); return (a + 0.05) / (b + 0.05); };
    const tol2 = 34 * 34;
    const nearest = (r, g, b, indices) => {
      let best = -1, bestD = Infinity;
      for (const i of indices) {
        const [pr, pg, pb] = palRgb[i];
        const dd = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
        if (dd < bestD) { bestD = dd; best = i; }
      }
      return bestD <= tol2 ? best : -1;
    };
    const HALF = 18;
    const perFamily = {};
    for (const f of Object.keys(familyMasks)) perFamily[f] = { shotPixels: 0, nearA7: 0, nearMin: 0, contrastSum: 0, contrastN: 0, minContrast: Infinity };
    let total = 0, totA7 = 0, totMin = 0;
    for (const c2 of centers) {
      const cx = Math.round(c2.fx), cy = Math.round(c2.fy);
      const fam = familyMasks[c2.family] ?? [];
      // 1) Schuss-Pixel der Box bestimmen (Palette-nahe zur Familien-Farbmenge).
      const shotPx = [];
      const bg = [];
      for (let y = Math.max(0, cy - HALF); y < Math.min(H, cy + HALF); y++) {
        for (let x = Math.max(0, cx - HALF); x < Math.min(W, cx + HALF); x++) {
          const i = y * W + x;
          const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
          const pi = nearest(r, g, b, fam);
          if (pi >= 0) shotPx.push([x, y, r, g, b]);
          else bg.push([r, g, b]);
        }
      }
      if (!shotPx.length || bg.length < 8) continue;
      // Lokaler Hintergrund: Median-Luminanz der Nicht-Schuss-Pixel.
      const ls = bg.map(([r, g, b]) => lum(r, g, b)).sort((a, b) => a - b);
      const bgL = ls[Math.floor(ls.length / 2)];
      const f = perFamily[c2.family];
      for (const [x, y, r, g, b] of shotPx) {
        f.shotPixels++; total++;
        if (nearA7(r, g, b)) { f.nearA7++; totA7++; }
        if (nearMin(r, g, b)) { f.nearMin++; totMin++; }
        const k = contrast(lum(r, g, b), bgL);
        f.contrastSum += k; f.contrastN++;
        if (k < f.minContrast) f.minContrast = k;
      }
    }
    const out = {};
    for (const [fam, v] of Object.entries(perFamily)) {
      out[fam] = {
        shotsMeasured: 0, // unten in Node ergaenzt
        shotPixels: v.shotPixels,
        nearWhiteA7: v.nearA7,
        nearWhiteA7Pct: v.shotPixels ? +((100 * v.nearA7) / v.shotPixels).toFixed(2) : 0,
        nearWhiteMinRgb200: v.nearMin,
        nearWhiteMinRgb200Pct: v.shotPixels ? +((100 * v.nearMin) / v.shotPixels).toFixed(2) : 0,
        meanContrast: v.contrastN ? +(v.contrastSum / v.contrastN).toFixed(2) : null,
        minContrast: v.contrastN ? +v.minContrast.toFixed(2) : null,
      };
    }
    return { W, H, perFamily: out, totalShotPixels: total, totalNearA7: totA7, totalNearA7Pct: total ? +((100 * totA7) / total).toFixed(2) : 0, totalNearMin: totMin };
  }, {
    dataUrl: `data:image/png;base64,${b64}`,
    centers: s.centers,
    palette: PALETTE_HEX,
    familyMasks: familyColorMasks,
    shared: sharedColors,
  });
  // Schuesse je Familie in dieser Szene ergaenzen.
  const famCounts = {};
  for (const c of s.centers) famCounts[c.family] = (famCounts[c.family] ?? 0) + 1;
  for (const fam of Object.keys(res.perFamily)) res.perFamily[fam].shotsMeasured = famCounts[fam] ?? 0;
  pngAnalysis.push({ sceneTag: s.sceneTag, ...res });
}

await browser2.close();

const result = {
  tag: TAG,
  generatedAt: new Date().toISOString(),
  seed: 1,
  minute: MINUTE,
  mix: MIX,
  injectedPerFamily: INJECT_PER_FAMILY,
  nearWhiteDef: { a7: "r,g,b>=150 und r>=235 (ACCEPTANCE A7)", minRgb200: "min(R,G,B)>=200 (Info)" },
  acceptance: { nearWhiteA7PctOfShotPixelsMax: 4.16 },
  textures: texAnalysis.textures,
  crossFamily: texAnalysis.crossFamily,
  playerOverlap: texAnalysis.playerOverlap,
  scenes,
  pngAnalysis,
  jsErrors: errors,
  verdict: null,
};

// Verdikt: Near-White (A7) der Schuss-Pixel ueber beide Szenen <= 4,16 %?
const worst = Math.max(...pngAnalysis.map((p) => p.totalNearA7Pct));
result.verdict = {
  worstSceneNearWhiteA7Pct: worst,
  pass: worst <= 4.16,
};

const outJson = `shots/m10-shot-clarity-${TAG}.json`;
writeFileSync(outJson, JSON.stringify(result, null, 2));
console.log(`m10-shot-clarity: JSON -> ${outJson}`);
console.log(`  worst scene near-white(A7) of shot pixels: ${worst}% (Grenze 4,16 %) -> ${result.verdict.pass ? "PASS" : "FAIL"}`);
console.log(`  jsErrors: ${errors.length}`);
