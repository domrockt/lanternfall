#!/usr/bin/env node
/**
 * M10-weapon-shot-readability — Vorher/Nachher-Matrix der 6 Spieler-Waffen-
 * Projektile: 6 Solo-Szenen (je Waffe allein im Bild) + 300-Gegner-Chaos
 * (alle 6 Waffen gleichzeitig, Minute-25-Umgebung).
 *
 * Misst je Waffe:
 *   - Laufzeit-Textur exakt (Farbmasken, A7-Near-White, binaeres Alpha),
 *   - Schuss-Pixel im Chaos (Box je bekanntem Zentrum, klassifiziert ueber die
 *     Palette-Nahe zur Waffen-Farbmaske): Near-White-A7-Anteil + WCAG-Kontrast
 *     gegen den lokalen Hintergrund (Methode wie scripts/m10-shot-clarity.mjs).
 *   - Solo-Screenshots je Waffe (Beleg der Signatur ohne Chaos-Ueberlagerung).
 *
 * Vorher-Modus: --tag=before laeuft mit ?shotsig=0 (Basis-Grids + Legacy-Blitz),
 * Nachher: --tag=after (Waffen-Shot-Signaturen aus gen-fx).
 *
 * Belege nach ~/games/.evidence/m10-weapon-shot-readability/ (nicht in git).
 * Keine FPS-/Echtzeit-Messung -> keine flock-Sperre.
 */
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
const OUT_DIR = join(homedir(), "games", ".evidence", "m10-weapon-shot-readability");
mkdirSync(OUT_DIR, { recursive: true });

const SHOTSIG = TAG === "before" ? 0 : 1;

// 32-Farben-Palette (Hex, identisch zu PAL in src/palette.ts).
const PALETTE_HEX = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];

const WEAPONS = ["ember", "flail", "frost", "storm", "thorn", "lantern"];
const SHOT_TEXTURES = {
  ember: "projectile_ember",
  flail: "flail_ball",
  frost: "projectile_ice",
  storm: "fx_bolt",
  thorn: "projectile_thorn",
  lantern: "orb_lantern",
};
const MINUTE = 1490; // Minute 25: Endgame-Chaos.
const TOTAL_ENEMIES = 300;
const MIX = [
  ["toad", 22], ["witchling", 18], ["lich", 15], ["horror", 15],
  ["bog_rat", 10], ["crow", 8], ["bat", 6], ["spider", 6],
];
const SOLO_MIX = [["toad", 6], ["bat", 4], ["bog_rat", 4]];

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

/** Neue Seite + Run; weapons = Liste der Waffen (Stufe 3). */
async function newRunPage(weapons) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1&shotsig=${SHOTSIG}`);
  await startRun(page);
  await page.evaluate((list) => {
    for (const id of list) window.__lf.addWeapon(id, 3);
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    window.__lf.setSuppressLevelUps(true);
  }, weapons);
  return page;
}

/** Zentren aller Waffen-Signaturen im View einsammeln (Projektile, Swings,
 *  Orbs, Blitzsegmente, Frost-Ring/Splitter). rafMs > 0: sammelt `rafMs` ms
 *  lang PER FRAME im Seitenkontext (erwischt auch kurzlebige Projektile wie
 *  ember im Punktblank-Gewuehl). */
async function collectCenters(page, rafMs = 0) {
  if (rafMs <= 0) {
    return page.evaluate(() => []);
  }
  return page.evaluate((ms) => new Promise((resolve) => {
    const run = window.__game.scene.getScene("run");
    const out = [];
    const cam = run.cameras.main;
    const t0 = performance.now();
    const step = () => {
      const view = cam.worldView;
      if (view && view.width > 0) {
        const toView = (x, y) => ({
          fx: (x - view.x) * (960 / view.width),
          fy: (y - view.y) * (540 / view.height),
        });
        const push = (weapon, x, y) => {
          const p = toView(x, y);
          if (p.fx >= 0 && p.fx < 960 && p.fy >= 0 && p.fy < 540) out.push({ weapon, fx: p.fx, fy: p.fy });
        };
        for (const p of run.combat.projectiles.active) {
          if (!p.active || !p.sprite.visible) continue;
          const w = p.weaponId === "eternal_winter" ? "frost"
            : p.weaponId === "thorn" || p.weaponId === "thorn_storm" ? "thorn"
            : p.weaponId === "ember" ? "ember" : null;
          if (w) push(w, p.x, p.y);
        }
        for (const state of run.combat.states.values()) {
          for (const s of state.swings) push("flail", s.sprite.x, s.sprite.y);
          for (const o of state.orbs) {
            if (o.sprite.visible) push("lantern", o.sprite.x, o.sprite.y);
          }
        }
        for (const f of run.combat.fx.active) {
          if (f.frames[0] === "fx_bolt") push("storm", f.x, f.y);
          if (f.frames[0] === "ring_frost") push("frost", f.x, f.y);
        }
        for (const p of run.combat.particles.active) {
          if (p.frames[0].startsWith("fx_ice")) push("frost", p.x, p.y);
        }
      }
      if (performance.now() - t0 < ms) requestAnimationFrame(step);
      else resolve(out);
    };
    requestAnimationFrame(step);
  }), rafMs);
}

// ---------- Solo-Szenen: je Waffe allein im Bild ----------
const soloPaths = {};
for (const weapon of WEAPONS) {
  const page = await newRunPage([weapon]);
  const prep = await page.evaluate(async ({ minute, mix }) => {
    const run = window.__game.scene.getScene("run");
    window.__lf.skipTo(minute);
    window.__lf.setTimeScale(1);
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    await new Promise((r) => setTimeout(r, 250));
    window.__lf.teleport(2048, 2048);
    let spawned = 0;
    for (const [id, n] of mix) {
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(id, n);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      let k = 0;
      for (const e of fresh) {
        const a = (k / Math.max(1, fresh.length)) * Math.PI * 2;
        k++;
        e.x = 2048 + Math.cos(a) * (60 + (k % 3) * 35);
        e.y = 2048 + Math.sin(a) * (60 + (k % 3) * 35);
        e.vx = 0; e.vy = 0;
        e.hp = 1e9; e.maxHp = 1e9;
        e.damage = Math.max(0, e.damage);
      }
      spawned += fresh.length;
    }
    return spawned;
  }, { minute: MINUTE, mix: SOLO_MIX });
  // 2 s feuern lassen; Centres akkumulieren (niedrige Duty-Cycle-Waffen).
  for (let i = 0; i < 12; i++) await collectCenters(page, 160);
  await new Promise((r) => setTimeout(r, 60));
  const path = join(OUT_DIR, `m10-weapon-shot-${TAG}-solo-${weapon}.png`);
  await page.screenshot({ path });
  soloPaths[weapon] = path;
  console.log(`  solo ${weapon}: ${prep} Gegner, shot -> ${path}`);
  await page.close();
}

// ---------- Chaos-Szene: 300 Gegner, alle 6 Waffen feuern ----------
const chaosPage = await newRunPage(WEAPONS);
const chaosPrep = await chaosPage.evaluate(async ({ total, mix, minute }) => {
  const run = window.__game.scene.getScene("run");
  window.__lf.skipTo(minute);
  window.__lf.setTimeScale(1);
  window.__game.registry.set("lf-density", 0);
  run.registry.set("lf-density", 0);
  for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
  await new Promise((r) => setTimeout(r, 250));

  const len = mix.length;
  const sum = mix.reduce((a, b) => a + b[1], 0);
  const per = mix.map(([, n]) => Math.max(1, Math.round((n / sum) * total)));
  window.__lf.teleport(2048, 2048);
  const rand = Math.random;
  let spawned = 0;
  for (let i = 0; i < len; i++) {
    const before = run.enemies.active.filter((e) => e.alive).length;
    window.__lf.spawnEnemy(mix[i][0], per[i]);
    const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
    for (const e of fresh) {
      const side = rand() < 0.5 ? 1 : -1;
      e.x = 2048 + side * (10 + rand() * 200);
      e.y = 2048 + (rand() - 0.5) * 230;
      e.vx = 0; e.vy = 0;
      e.hp = 1e9; e.maxHp = 1e9;
      e.damage = Math.max(0, e.damage);
    }
    spawned += fresh.length;
  }
  const enemies = run.enemies.active.filter((e) => e.alive).length;
  return { spawned, enemies, state: window.__lf.state() };
}, { total: TOTAL_ENEMIES, mix: MIX, minute: MINUTE });

// 3 s lang per Frame sammeln (RAF-Loop im Seitenkontext), dann Screenshot.
const chaosCenters = await collectCenters(chaosPage, 3000);
// ---------- Laufzeit-Texturen: exakte Analyse + Kontaktblatt ----------
const texAnalysis = await chaosPage.evaluate(({ weapons, shotTextures, palette }) => {
  const run = window.__game.scene.getScene("run");
  const nearA7 = (r, g, b) => r >= 150 && g >= 150 && b >= 150 && r >= 235;
  const out = { textures: {}, sheetDataUrl: null };

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
    let opaque = 0, semi = 0, off = 0, nA7 = 0;
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
    }
    return { w: c.width, h: c.height, opaque, semi, offPalette: off,
      colors: [...colors.entries()].sort((a2, b2) => b2[1] - a2[1]).map(([k, n]) => ({ index: k, n })),
      mask: [...colors.keys()],
      nearWhiteA7: nA7, nearWhiteA7Pct: opaque ? +((100 * nA7) / opaque).toFixed(2) : 0,
      binaryAlpha: semi === 0 };
  };

  for (const w of weapons) out.textures[w] = gridColors(shotTextures[w]);

  // Kontaktblatt: alle 6 Laufzeit-Texturen bei 6x nearest nebeneinander.
  const SCALE = 6, PAD = 8;
  const entries = weapons.map((w) => {
    const tex = run.textures.get(shotTextures[w]);
    const img = tex.getSourceImage();
    return { w, img };
  });
  const cw = entries.reduce((a, e) => a + e.img.width * SCALE + PAD, PAD);
  const ch = PAD + Math.max(...entries.map((e) => e.img.height * SCALE)) + PAD;
  const sheet = document.createElement("canvas");
  sheet.width = cw; sheet.height = ch;
  const sctx = sheet.getContext("2d");
  sctx.imageSmoothingEnabled = false;
  sctx.fillStyle = "#101724";
  sctx.fillRect(0, 0, cw, ch);
  let x = PAD;
  for (const e of entries) {
    sctx.drawImage(e.img, x, PAD, e.img.width * SCALE, e.img.height * SCALE);
    x += e.img.width * SCALE + PAD;
  }
  out.sheetDataUrl = sheet.toDataURL("image/png");
  return out;
}, { weapons: WEAPONS, shotTextures: SHOT_TEXTURES, palette: PALETTE_HEX });

const sheetPath = join(OUT_DIR, `m10-weapon-shot-${TAG}-sheet.png`);
writeFileSync(sheetPath, Buffer.from(texAnalysis.sheetDataUrl.split(",")[1], "base64"));

const scenePath = join(OUT_DIR, `m10-weapon-shot-${TAG}-chaos300.png`);
await chaosPage.screenshot({ path: scenePath });
await chaosPage.close();
await browser.close();

const counts = {};
for (const c of chaosCenters) counts[c.weapon] = (counts[c.weapon] ?? 0) + 1;

// ---------- PNG-Analyse: Near-White + Kontrast je Waffe ----------
const { chromium: chromium2 } = await loadPlaywright();
const browser2 = await chromium2.launch();
const page2 = await browser2.newPage({ viewport: { width: 10, height: 10 } });
await page2.goto("about:blank");

const b64 = readFileSync(scenePath).toString("base64");
const weaponMasks = Object.fromEntries(WEAPONS.map((w) => [w, texAnalysis.textures[w].mask]));
const pngAnalysis = await page2.evaluate(async ({ dataUrl, centers, palette, weaponMasks }) => {
  const img = new Image();
  img.src = dataUrl;
  await new Promise((r) => { img.onload = r; });
  const W = img.width, H = img.height;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  const palRgb = palette.map((hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
  const nearA7 = (r, g, b) => r >= 150 && g >= 150 && b >= 150 && r >= 235;
  const lum = (r, g, b) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (l1, l2) => { const a = Math.max(l1, l2), b = Math.min(l1, l2); return (a + 0.05) / (b + 0.05); };
  const tol2 = 34 * 34;
  const nearest = (r, g, b) => {
    let best = -1, bestD = Infinity;
    for (let i = 0; i < palRgb.length; i++) {
      const [pr, pg, pb] = palRgb[i];
      const dd = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (dd < bestD) { bestD = dd; best = i; }
    }
    return bestD <= tol2 ? best : -1;
  };
  const HALF = 20;
  const perWeapon = {};
  for (const w of Object.keys(weaponMasks)) perWeapon[w] = { boxes: 0, shotPixels: 0, nearA7: 0, contrastSum: 0, contrastN: 0, minContrast: Infinity };
  for (const c2 of centers) {
    const cx = Math.round(c2.fx), cy = Math.round(c2.fy);
    const mask = weaponMasks[c2.weapon] ?? [];
    const shotPx = [];
    const bg = [];
    for (let y = Math.max(0, cy - HALF); y < Math.min(H, cy + HALF); y++) {
      for (let x = Math.max(0, cx - HALF); x < Math.min(W, cx + HALF); x++) {
        const i = y * W + x;
        const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
        if (nearest(r, g, b) >= 0 && mask.includes(nearest(r, g, b))) shotPx.push([r, g, b]);
        else bg.push([r, g, b]);
      }
    }
    if (!shotPx.length || bg.length < 8) continue;
    const ls = bg.map(([r, g, b]) => lum(r, g, b)).sort((a, b2) => a - b2);
    const bgL = ls[Math.floor(ls.length / 2)];
    const f = perWeapon[c2.weapon];
    f.boxes++;
    for (const [r, g, b] of shotPx) {
      f.shotPixels++;
      if (nearA7(r, g, b)) f.nearA7++;
      const k = contrast(lum(r, g, b), bgL);
      f.contrastSum += k; f.contrastN++;
      if (k < f.minContrast) f.minContrast = k;
    }
  }
  const out = {};
  for (const [w, v] of Object.entries(perWeapon)) {
    out[w] = {
      boxes: v.boxes, shotPixels: v.shotPixels,
      nearWhiteA7: v.nearA7,
      nearWhiteA7Pct: v.shotPixels ? +((100 * v.nearA7) / v.shotPixels).toFixed(2) : null,
      meanContrast: v.contrastN ? +(v.contrastSum / v.contrastN).toFixed(2) : null,
      minContrast: v.contrastN ? +v.minContrast.toFixed(2) : null,
    };
  }
  return out;
}, { dataUrl: `data:image/png;base64,${b64}`, centers: chaosCenters, palette: PALETTE_HEX, weaponMasks });
await browser2.close();

// Texturexakt + Chaos zusammenfassen; Verdikt wie ACCEPTANCE A7 (<= 4,16 %).
const weapons = Object.fromEntries(WEAPONS.map((w) => [
  w,
  {
    texture: SHOT_TEXTURES[w],
    exact: texAnalysis.textures[w],
    chaos: pngAnalysis[w],
    solo: soloPaths[w],
  },
]));

const worstTex = Math.max(...WEAPONS.map((w) => weapons[w].exact.nearWhiteA7Pct));
const chaosVals = WEAPONS.map((w) => weapons[w].chaos.nearWhiteA7Pct).filter((v) => v !== null);
const worstChaos = chaosVals.length ? Math.max(...chaosVals) : null;
const missing = WEAPONS.filter((w) => !pngAnalysis[w] || pngAnalysis[w].shotPixels === 0);
const verdict = {
  worstTextureNearWhiteA7Pct: worstTex,
  worstChaosNearWhiteA7Pct: worstChaos,
  weaponsMissingInChaos: missing,
  passNearWhite: worstTex <= 4.16 && (worstChaos === null || worstChaos <= 4.16),
  passAllVisible: missing.length === 0,
};

const result = {
  tag: TAG, shotsig: SHOTSIG,
  generatedAt: new Date().toISOString(),
  seed: 1, minute: MINUTE, totalEnemies: TOTAL_ENEMIES,
  spawnedEnemies: chaosPrep.spawned, aliveEnemies: chaosPrep.enemies,
  weaponCenters: counts,
  soloScenes: soloPaths,
  nearWhiteDef: "A7: r,g,b >= 150 und r >= 235 (ACCEPTANCE-Kalibrierung)",
  acceptance: { nearWhiteA7PctMax: 4.16 },
  weapons,
  evidence: { sheet: sheetPath, chaosScene: scenePath },
  jsErrors: errors,
  verdict,
};

const outJson = join(OUT_DIR, `m10-weapon-shot-${TAG}.json`);
writeFileSync(outJson, JSON.stringify(result, null, 2));
console.log(`m10-weapon-shot: JSON -> ${outJson}`);
console.log(`  Waffen im Chaos (akkumuliert): ${JSON.stringify(counts)} (Zentren ${chaosCenters.length})`);
console.log(`  Near-White A7: Texturen worst ${worstTex} %, Chaos worst ${worstChaos} % (Grenze 4,16 %)`);
console.log(`  fehlend im Chaos: ${missing.length ? missing.join(",") : "-"}`);
console.log(`  jsErrors: ${errors.length}`);
