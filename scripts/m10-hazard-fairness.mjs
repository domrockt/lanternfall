#!/usr/bin/env node
// M10-Hazard-Fairness: Warnphasen aller Hazard-Klassen unter Schwarm-Bedingungen messen.
//
// Misst pro Hazard-Klasse (BossSystem/Bosses + Exploder, siehe K1-Audit):
//  - effektive Warnzeit (warnMax der Hazard-Instanz, wie Hazards.ts sie clamped),
//  - Kontrast des Warnrings/der Warnfläche gegen den Hintergrund (Pixel-Sampling,
//    Michelson-Kontrast der Luminanz; Ring-Annulus vs. Nachbarfläche),
//  - Bot-Trefferquote: AutoPlay-Bot, Hazard spawnt auf der Spielerposition,
//    HP-Delta bis kurz nach Warnphase-Ende = Treffer (Schadens-Klassen, 8 Trials).
//
// View 640x360: Viewport 1280x720, dpr 1 -> n=2, Canvas 640x360 logisch, CSS 1280x720.
// Keine FPS-Messung -> ohne flock (feste Substeps/Geometrie-Messung lastunabhängig).
//
//   node scripts/m10-hazard-fairness.mjs --tag=baseline --out=shots/m10-hazard-baseline.json
import { writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return fallback;
};
const TAG = String(argOf("tag", "baseline"));
const OUT_JSON = String(argOf("out", `shots/m10-hazard-${TAG}.json`));
const TRIALS = Number(argOf("trials", "8")) || 8;
const MIN_WARN_S = 0.45;

// Hazard-Klassen = exakte Aufrufer-Argumente (K1-Audit, docs/lanes/m10-hazard-warn-fairness.md).
// damage: für die Trefferquote auf einheitliches Probenschadensniveau (10) normiert;
// damage 0 = Klasse verursacht keinen Flächenschaden -> keine Trefferquote messbar.
const CLASSES = [
  { id: "jump_slam", kind: "circle", warn: 0.95, radius: 74, linger: 0.12, damage: 10, color: 25, hit: true },
  { id: "poison_puddles", kind: "circle", warn: 0.8, radius: 26, linger: 4.5, tick: 0.6, damage: 10, activeTexture: "puddle_poison", hit: true },
  { id: "summon_ring", kind: "circle", warn: 0.9, radius: 96, damage: 0, hit: false },
  { id: "bone_boomerang", kind: "beam", warn: 0.6, radius: 16, damage: 0, hit: false },
  { id: "summon_wolves", kind: "circle", warn: 0.75, radius: 70, damage: 0, hit: false },
  { id: "scythe_sweep", kind: "circle", warn: 0.72, radius: 82, linger: 0.1, damage: 10, color: 25, hit: true },
  { id: "stomp", kind: "circle", warn: 1.05, radius: 92, linger: 0.12, damage: 10, color: 25, hit: true },
  { id: "stone_rain", kind: "circle", warn: 1.2, radius: 24, linger: 0.1, damage: 10, color: 25, multi: 5, hit: true },
  { id: "teleport", kind: "circle", warn: 0.6, radius: 22, damage: 0, hit: false },
  { id: "fire_cross", kind: "beam", warn: 0.95, radius: 18, linger: 0.1, damage: 10, color: 26, hit: true },
  { id: "thorn_ring", kind: "circle", warn: 1.0, radius: 22, linger: 0.3, damage: 10, color: 25, hit: true },
  { id: "thorn_ring_p3", kind: "circle", warn: 0.75, radius: 24, linger: 0.3, damage: 10, color: 25, hit: false },
  { id: "bone_boomerang_p5", kind: "beam", warn: 0.6, radius: 16, damage: 0, hit: false },
  { id: "thorn_burst", kind: "beam", warn: 0.9, radius: 16, linger: 0.08, damage: 10, color: 25, hit: true },
  { id: "thorn_burst_p3", kind: "beam", warn: 0.7, radius: 30, linger: 0.08, damage: 10, color: 25, hit: false },
  { id: "fire_cross_p2", kind: "beam", warn: 0.85, radius: 18, linger: 0.1, damage: 10, color: 26, hit: false },
  { id: "fire_cross_p3", kind: "beam", warn: 0.65, radius: 18, linger: 0.1, damage: 10, color: 26, hit: false },
  { id: "summon_ring_p2", kind: "circle", warn: 0.8, radius: 96, damage: 0, hit: false },
  // Exploder (Run.ts "explode"): Tier 2 = bomber (radius 48), warn 0.16.
  { id: "exploder", kind: "circle", warn: 0.16, radius: 48, linger: 0.1, damage: 10, color: 18, hit: true },
];

// ---- Minimaler PNG-Decoder (8-bit RGB/RGBA, non-interlaced) für Pixel-Sampling. ----
function decodePng(buf) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buf.subarray(0, 8).equals(sig)) throw new Error("Kein PNG");
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`PNG nicht unterstuetzt: depth=${bitDepth} color=${colorType} interlace=${interlace}`);
  }
  const channels = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) cur[i] = raw[rowStart + 1 + i];
    const paeth = (a, b, c) => {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    };
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? cur[i - channels] : 0;
      const up = prev[i];
      const ul = i >= channels ? prev[i - channels] : 0;
      if (filter === 1) cur[i] = (cur[i] + left) & 255;
      else if (filter === 2) cur[i] = (cur[i] + up) & 255;
      else if (filter === 3) cur[i] = (cur[i] + ((left + up) >> 1)) & 255;
      else if (filter === 4) cur[i] = (cur[i] + paeth(left, up, ul)) & 255;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels, di = (y * width + x) * 4;
      out[di] = cur[si]; out[di + 1] = cur[si + 1]; out[di + 2] = cur[si + 2];
      out[di + 3] = channels === 4 ? cur[si + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}

const lum = (img, x, y) => {
  const i = (y * img.width + x) * 4;
  return (0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2]) / 255;
};

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
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
await startRun(page);

const SEED_FN = `
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
`;

// Szene vorbereiten: Minute 10 (Tier-1/2-Mix), Schwarm ohne Schaden um den Spieler.
const prep = await page.evaluate(async (seedSrc) => {
  // eslint-disable-next-line no-eval
  eval(seedSrc);
  const game = window.__game;
  const run = game.scene.getScene("run");
  game.registry.set("lf-density", 0);
  run.registry.set("lf-density", 0);
  window.__lf.god(true);
  window.__lf.autoPlay(false);
  window.__lf.setSuppressLevelUps(true);
  window.__lf.setSuppressFx(true);
  window.__lf.skipTo(600);
  window.__lf.setTimeScale(1);
  for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
  await new Promise((r) => setTimeout(r, 250));
  window.__lf.teleport(2048, 2048);
  return true;
}, SEED_FN);

const CROWD_MIX = [
  ["bog_rat", 110], ["wisp", 80], ["crow", 80], ["skeleton", 70],
  ["bat", 60], ["spider", 50], ["ghoul", 30], ["wolf", 20],
];
const CROWD_TARGET = 500;

/** Füllt den Schwarm auf CROWD_TARGET Gegner um den Spieler auf (Schaden 0, HP riesig). */
async function topUpCrowd() {
  return page.evaluate(({ mix, target, seedSrc }) => {
    // eslint-disable-next-line no-eval
    eval(seedSrc);
    const run = window.__game.scene.getScene("run");
    const rand = mulberry32(777);
    const alive = run.enemies.active.filter((e) => e.alive).length;
    let spawned = 0;
    for (let round = 0; round < 6 && alive + spawned < target; round++) {
      const need = target - alive - spawned;
      const [id] = mix[round % mix.length];
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(id, need);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        // Dichte Traube: fast die ganze sichtbare Fläche (640x360) um den Spieler.
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 300;
        e.x = run.posX + Math.cos(a) * r;
        e.y = run.posY + Math.sin(a) * (r * 0.56);
        e.vx = 0; e.vy = 0;
        e.hp = 1e9; e.maxHp = 1e9; e.damage = 0;
      }
      spawned += fresh.length;
    }
    // Bestand hart auf Ziel bringen: Überzählige deaktivieren.
    let aliveAll = run.enemies.active.filter((e) => e.alive);
    for (let i = target; i < aliveAll.length; i++) {
      aliveAll[i].alive = false; aliveAll[i].sprite.setVisible(false).setActive(false);
    }
    aliveAll = run.enemies.active.filter((e) => e.alive);
    return { alive: aliveAll.length };
  }, { mix: CROWD_MIX, target: CROWD_TARGET, seedSrc: SEED_FN });
}

await topUpCrowd();

// ---- Phase 1: Warnzeit + Kontrast (Szene pausiert, Hazard-Update manuell getaktet). ----
const canvasBox = await page.locator("canvas").boundingBox();
const LOGICAL_W = await page.evaluate(() => window.__game.scale.width ?? 640);
const MUL = canvasBox.width / LOGICAL_W; // Gerätepiksel pro Spielpixel

await page.evaluate(() => window.__game.scene.pause("run"));

const PX = 2048, PY = 2048;
const HAZARD_WX = PX + 110, HAZARD_WY = PY; // voll sichtbar, im Lichtkreis-Randbereich
// Bildschirm-(logische) Koordinaten des Hazards: Welt minus Kamera-Scroll.
const SCR = await page.evaluate(({ wx, wy }) => {
  const cam = window.__game.scene.getScene("run").cameras.main;
  return { x: wx - cam.scrollX, y: wy - cam.scrollY };
}, { wx: HAZARD_WX, wy: HAZARD_WY });
const HAZARD_X = SCR.x, HAZARD_Y = SCR.y;
console.log(`[cam] hazard screen logical ${HAZARD_X.toFixed(1)},${HAZARD_Y.toFixed(1)} (view ${LOGICAL_W}x360)`);
const advance = (frames) => page.evaluate((f) => {
  const run = window.__game.scene.getScene("run");
  for (let i = 0; i < f; i++) run.hazards.update(1 / 60, run.posX, run.posY, () => {});
}, frames);

const spawnHazard = (c, phase) => page.evaluate(({ c, phase, hx, hy, px, py }) => {
  const run = window.__game.scene.getScene("run");
  run.hazards.clear();
  if (c.kind === "beam") {
    const dx = Math.cos(phase) * 320, dy = Math.sin(phase) * 320;
    if (c.id.startsWith("fire_cross")) {
      // Zwei rechtwinklige Strahlen durch den Punkt (wie fire_cross).
      run.hazards.spawnBeam(hx - dx, hy - dy, hx + dx, hy + dy, c);
      const dx2 = -dy, dy2 = dx;
      run.hazards.spawnBeam(hx - dx2, hy - dy2, hx + dx2, hy + dy2, c);
    } else {
      run.hazards.spawnBeam(hx - dx, hy - dy, hx + dx, hy + dy, c);
    }
  } else {
    run.hazards.spawnCircle(hx, hy, { ...c });
  }
  return run.hazards.active.map((h) => ({ kind: h.kind, warnMax: h.warnMax, radius: h.radius }));
}, { c, phase, hx: HAZARD_WX, hy: HAZARD_WY, px: PX, py: PY });

/** Kontrast eines Kreises: Ring-Annulus vs. Hintergrund-Annulus (logische Koordinaten). */
function circleContrast(img, hx, hy, r) {
  const toDevice = (lx, ly) => [Math.round(canvasBox.x + lx * MUL), Math.round(canvasBox.y + ly * MUL)];
  const sample = (rMin, rMax) => {
    let sum = 0, n = 0, min = 1, max = 0;
    const step = Math.max(1, Math.round(MUL));
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      for (let rr = rMin; rr <= rMax; rr += 0.5) {
        const [dx, dy] = toDevice(hx + Math.cos(rad) * rr, hy + Math.sin(rad) * rr);
        if (dx < 0 || dy < 0 || dx >= img.width || dy >= img.height) continue;
        const l = lum(img, dx, dy);
        sum += l; n++; min = Math.min(min, l); max = Math.max(max, l);
      }
    }
    return n ? { mean: sum / n, min, max, n } : null;
  };
  const ring = sample(r * 0.88, r * 1.12);
  const fill = sample(r * 0.3, r * 0.55);
  const bg = sample(r * 1.45, r * 1.75);
  const michelson = (a, b) => (a && b) ? (a.mean - b.mean) / (a.mean + b.mean + 1e-6) : null;
  return { ring: ring?.mean ?? null, fill: fill?.mean ?? null, bg: bg?.mean ?? null,
    contrast: michelson(ring, bg), fillContrast: michelson(fill, bg) };
}

/** Kontrast eines horizontalen Strahls durch (hx,hy), Halbbreite w. */
function beamContrast(img, hx, hy, w) {
  const toDevice = (lx, ly) => [Math.round(canvasBox.x + lx * MUL), Math.round(canvasBox.y + ly * MUL)];
  const sampleBand = (dMin, dMax) => {
    let sum = 0, n = 0;
    const step = Math.max(1, Math.round(MUL));
    for (let lx = hx - 90; lx <= hx + 90; lx += 2) {
      for (let ly = hy + dMin; ly <= hy + dMax; ly += 0.5) {
        const [dx, dy] = toDevice(lx, ly);
        if (dx < 0 || dy < 0 || dx >= img.width || dy >= img.height) continue;
        sum += lum(img, dx, dy); n++;
      }
    }
    return n ? sum / n : null;
  };
  const ring = sampleBand(-w / 2 - 1, w / 2 + 1);
  const bg = sampleBand(w / 2 + 14, w / 2 + 34);
  return { ring, bg, contrast: (ring !== null && bg !== null) ? (ring - bg) / (ring + bg + 1e-6) : null };
}

const contrastResults = [];
for (const c of CLASSES) {
  const phase = 0.3;
  const spawned = await spawnHazard(c, phase);
  const warnMax = Math.max(...spawned.map((h) => h.warnMax));
  const phases = [];
  const shots = [0.25, 0.55, 0.85];
  let lastT = 0;
  for (const frac of shots) {
    const t = Math.min(warnMax * frac, warnMax * 0.95);
    const frames = Math.max(1, Math.round(t * 60) - Math.round(lastT * 60));
    await advance(frames);
    lastT = t;
    const buf = await page.screenshot();
    const img = decodePng(buf);
    const hxDev = canvasBox.x + HAZARD_X * MUL, hyDev = canvasBox.y + HAZARD_Y * MUL;
    if (hxDev < 0 || hyDev < 0 || hxDev >= img.width || hyDev >= img.height) throw new Error("Hazard außerhalb des Screenshots");
    const m = c.kind === "beam" ? beamContrast(img, HAZARD_X, HAZARD_Y, c.radius) : circleContrast(img, HAZARD_X, HAZARD_Y, c.radius);
    phases.push({ t: Math.round(t * 1000), ...m });
  }
  contrastResults.push({
    id: c.id, kind: c.kind, requestedWarn: c.warn, effectiveWarn: warnMax,
    warnOk: warnMax >= MIN_WARN_S - 1e-9, radius: c.radius, phases,
    minContrast: Math.min(...phases.filter((p) => p.contrast !== null).map((p) => p.contrast)),
  });
  console.log(`[contrast] ${c.id}: warn ${c.warn}→${warnMax.toFixed(3)}s ok=${warnMax >= MIN_WARN_S - 1e-9} contrast=${JSON.stringify(contrastResults.at(-1).minContrast)}`);
}

// Sichtbarer Beleg: Warnframe der Baseline (stomp + Schwarm, Puls-Maximum).
{
  const c = CLASSES.find((x) => x.id === "stomp");
  await spawnHazard(c, 0.3);
  await advance(Math.round(c.warn * 0.35 * 60));
  await page.screenshot({ path: `shots/m10-hazard-${TAG}-warnframe.png` });
  await page.evaluate(() => window.__game.scene.getScene("run").hazards.clear());
}

await page.evaluate(() => window.__game.scene.resume("run"));

// ---- Phase 2: Bot-Trefferquote (AutoPlay, Hazard spawnt auf Spielerposition). ----
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  window.__lf.god(false);
  window.__lf.autoPlay(true);
  window.__lf.setSuppressFx(false);
});
await topUpCrowd();

const hitResults = [];
for (const c of CLASSES.filter((x) => x.hit)) {
  let hits = 0;
  const trials = TRIALS;
  let warnMaxSum = 0;
  for (let t = 0; t < trials; t++) {
    const trial = await page.evaluate(async ({ c }) => {
      const run = window.__game.scene.getScene("run");
      run.hazards.clear();
      run.hp = run.maxHp;
      const px = run.posX, py = run.posY;
      if (c.kind === "beam") {
        const dx = Math.cos(0.6) * 320, dy = Math.sin(0.6) * 320;
        if (c.id.startsWith("fire_cross")) {
          run.hazards.spawnBeam(px - dx, py - dy, px + dx, py + dy, c);
          run.hazards.spawnBeam(px + dy, py - dx, px - dy, py + dx, c);
        } else {
          run.hazards.spawnBeam(px - dx, py - dy, px + dx, py + dy, c);
        }
      } else {
        run.hazards.spawnCircle(px, py, { ...c });
      }
      const hp0 = run.hp;
      const warnMax = Math.max(...run.hazards.active.map((h) => h.warnMax));
      // Bis kurz nach Ende der Warnphase warten (Puffer 0.15 s), dann HP vergleichen.
      await new Promise((r) => setTimeout(r, Math.ceil((warnMax + 0.15) * 1000)));
      return { hp0, hp1: run.hp, warnMax, aliveHazards: run.hazards.active.length };
    }, { c });
    if (trial.hp1 < trial.hp0 - 1e-6) hits++;
    warnMaxSum += trial.warnMax;
    // I-Frames (0.8 s) und Hazard-Nachlauf abwarten, bevor der nächste Trial startet.
    await page.waitForTimeout(Math.ceil((0.95 + c.linger) * 1000));
  }
  // Tatsaechliche (geclampte) Warnzeit mitteln - nicht den Sollwert c.warn melden.
  const measuredWarn = warnMaxSum / trials;
  hitResults.push({ id: c.id, kind: c.kind, requestedWarn: c.warn, effectiveWarn: measuredWarn, trials, hits, hitRate: hits / trials });
  console.log(`[hitrate] ${c.id}: ${hits}/${trials}`);
  await topUpCrowd();
}

await browser.close();
await server.stop();

mkdirSync("shots", { recursive: true });
const summary = {
  tag: TAG,
  generatedAt: new Date().toISOString(),
  view: { logical: [LOGICAL_W, 360], mul: MUL, note: "640x360 wie M8-Anzeige" },
  crowd: CROWD_TARGET,
  seed: 1,
  minWarnS: MIN_WARN_S,
  minEffectiveWarn: Math.min(...contrastResults.map((r) => r.effectiveWarn)),
  classesUnderMinWarn: contrastResults.filter((r) => !r.warnOk).map((r) => r.id),
  minRingContrast: Math.min(...contrastResults.filter((r) => Number.isFinite(r.minContrast)).map((r) => r.minContrast)),
  worstHitRate: hitResults.length ? Math.max(...hitResults.map((r) => r.hitRate)) : null,
  meanHitRate: hitResults.length ? hitResults.reduce((a, r) => a + r.hitRate, 0) / hitResults.length : null,
  jsErrors: errors,
  contrast: contrastResults,
  hitRate: hitResults,
};
writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
console.log(`[done] ${OUT_JSON}`);
console.log(`[summary] minWarn=${summary.minEffectiveWarn.toFixed(3)}s (<${MIN_WARN_S}: ${summary.classesUnderMinWarn.join(", ") || "keine"}) minContrast=${summary.minRingContrast?.toFixed(3)} meanHitRate=${summary.meanHitRate?.toFixed(3)}`);
if (errors.length) { console.error(`[js-errors] ${errors.length}`); process.exitCode = 2; }
