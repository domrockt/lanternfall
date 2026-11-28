#!/usr/bin/env node
// M10-Lane "gem-value-reading": Ist-/Nachher-Messung der Gem-Lesbarkeit.
//
// Erzeugt einen Chaos-Frame (500 Gegner via Spawn-Automat, autoPlay, god,
// Seed 1), friert ihn ein und klassifiziert JESEN Gem:
//   - Stufe nach px-Fläche (opake Textur-Pixel, unabhängig vom size-Label),
//   - Farbe (Dominantfarbe der Textur),
//   - Off-Palette-Pixel (gegen die 32-Farben-Palette aus src/palette.ts),
//   - Chaos-Kollision: Anteil Frame-Pixel nahe jeder Gem-Kernfarbe.
// Aufruf:
//   node scripts/m10-gem-reading.mjs --tag before
//   node scripts/m10-gem-reading.mjs --tag after
// Output (Belege, nicht Deliverables):
//   /home/ai/games/.evidence/m10-gem-value-reading/gem-reading-<tag>.json
//   /home/ai/games/.evidence/m10-gem-value-reading/chaos-<tag>-960.png (+ -640)
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const EVID = "/home/ai/games/.evidence/m10-gem-value-reading";
const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "measure"));
const TARGET = 500;
const SECONDS = 10;

// Palette aus src/palette.ts übernehmen (eine Quelle der Wahrheit).
const palSrc = readFileSync("src/palette.ts", "utf8");
const PAL = [...palSrc.matchAll(/0x([0-9a-f]{6})/gi)].map((m) => parseInt(m[1], 16));
if (PAL.length !== 32) throw new Error(`Palette-Parse: ${PAL.length} != 32 Farben`);

ensureBuild();
mkdirSync(EVID, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const dist2 = (a, b) => Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));

/** Ein Chaos-Lauf in einem Viewport: Chaos aufbauen, einfrieren, messen. */
async function chaosFrame(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      window.__lf.setTimeScale(1);
      for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
        window.__lf.addWeapon(id, 8);
      }
      window.__lf.spawnEnemy("bog_rat", 400);
      window.__lf.spawnEnemy("wisp", 50);
      window.__lf.spawnEnemy("bogzombie", 50);
    });
    await page.waitForTimeout(500);

    // Spawn-Automat: Gegner auf 500 auffüllen, bis >= 300 Gem-Drops
    // erzeugt wurden (Kills droppen Gems; der Draw-Cap der gemergten
    // gem-drawcap-Lane bleibt unangetastet).
    const drops = await page.evaluate(async ({ target, seconds }) => {
      const scene = window.__game.scene.getScene("run");
      const p = scene.pickups;
      const start = performance.now();
      let lastSpawn = start;
      return await new Promise((resolve) => {
        const tick = (now) => {
          if (now - lastSpawn >= 100) {
            lastSpawn = now;
            const deficit = target - window.__lf.stats().enemies;
            if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          }
          if (p.stats.dropped >= 300 || now - start >= seconds * 1000) {
            resolve({
              dropped: p.stats.dropped,
              added: p.stats.added,
              mergedGems: p.stats.mergedGems,
              spawnedXp: p.stats.spawnedXp,
              ms: Math.round(now - start),
            });
          } else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { target: TARGET, seconds: SECONDS });

    // Level-ups unterdrücken + Zeit einfrieren, damit das Bild die Horde
    // + Kristalle zeigt und nicht das Level-up-Panel.
    await page.evaluate(() => window.__lf.setSuppressLevelUps(true));
    for (let i = 0; i < 60 && (await page.evaluate(() => window.__lf.stats().levelUpOpen)); i++) {
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }
    await page.evaluate(() => window.__lf.setTimeScale(0));
    await page.waitForTimeout(400);

    const width = viewport.width;
    const shotPath = `${EVID}/chaos-${TAG}-${width}.png`;
    await page.screenshot({ path: shotPath });
    const shotDataUrl = `data:image/png;base64,${readFileSync(shotPath).toString("base64")}`;

    // Klassifikation: Gem-Texturen (px-Fläche, Dominantfarbe, Off-Palette),
    // Feld-Gems (Stufe aus px-Fläche), Chaos-Kollision im Frame.
    const result = await page.evaluate(async ({ PAL, shot }) => {
      const scene = window.__game.scene.getScene("run");
      const p = scene.pickups;
      const palSet = new Set(PAL);

      const hist = (tex) => {
        // Atlas-Frame in ein Offscreen-Canvas zeichnen (getSourceImage ist
        // beim Atlas ein Image, kein Canvas).
        const src = tex.getSourceImage();
        const f = (tex.get ? tex.get() : tex.frame) ?? tex;
        const w = f.cutWidth ?? tex.width;
        const h = f.cutHeight ?? tex.height;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const cx = c.getContext("2d");
        cx.imageSmoothingEnabled = false;
        cx.drawImage(src, f.cutX ?? 0, f.cutY ?? 0, w, h, 0, 0, w, h);
        const canvas = c;
        const ctx = canvas.getContext("2d");
        const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const counts = new Map();
        let opaque = 0;
        let offPalette = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          opaque += 1;
          const c = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
          counts.set(c, (counts.get(c) ?? 0) + 1);
          if (!palSet.has(c)) offPalette += 1;
        }
        let core = 0;
        let coreN = 0;
        // Kernfarbe = Dominantfarbe OHNE Ink-Kontur (PAL 0) — sonst gewinnt
        // bei dünnen Gems die 1-px-Umrandung und das Farb-Delta misst Schwarz.
        const INK = PAL[0];
        for (const [c, n] of counts) if (c !== INK && n > coreN) { core = c; coreN = n; }
        return { w: canvas.width, h: canvas.height, opaque, core, coreN, offPalette, counts };
      };

      const dist2 = (a, b) =>
        Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));

      const textures = {};
      for (const size of ["small", "medium", "large"]) {
        const tex = window.__game.textures.get(`gem_${size}`);
        textures[size] = hist(tex);
      }

      // Chaos-Kollision: Screenshot-Pixel nahe je Gem-Kernfarbe (<= 60 RGB-
      // Distanz). Der Screenshot ist komponiert und braucht keinen
      // preserveDrawingBuffer-Zugriff auf den WebGL-Canvas.
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = shot; });
      const cv = document.createElement("canvas");
      cv.width = img.width;
      cv.height = img.height;
      const ctx2 = cv.getContext("2d");
      ctx2.drawImage(img, 0, 0);
      const frame = ctx2.getImageData(0, 0, cv.width, cv.height).data;
      const near = { small: 0, medium: 0, large: 0 };
      const total = cv.width * cv.height;
      const cores = { small: textures.small.core, medium: textures.medium.core, large: textures.large.core };
      for (let i = 0; i < frame.length; i += 4) {
        if (frame[i + 3] === 0) continue;
        const c = (frame[i] << 16) | (frame[i + 1] << 8) | frame[i + 2];
        for (const s of ["small", "medium", "large"]) {
          if (dist2(c, cores[s]) <= 60) { near[s] += 1; break; }
        }
      }
      for (const s of ["small", "medium", "large"]) near[s] = Math.round((near[s] / total) * 10000) / 100;

      // Kandidatenfarben (Nacht-/Gold-Palette): Anteil Frame-Pixel je Farbe
      // (<= 60 Distanz) — Datenbasis für die Wahl der Rampe, EIN Durchlauf.
      const CANDIDATES = {
        marshLight: 0x6f9b58, marsh: 0x3d5a38, fogBlue: 0x3a4a5c, mist: 0x6b7c86,
        paleMist: 0x8fa0a6, bone: 0xb8c4c2, amber: 0xffb84d, lantern: 0xffd77a,
        glow: 0xffeeb0, crimson: 0xb8303f, hotRed: 0xe4574d, emberOrange: 0xcf6b26,
      };
      const candNear = {};
      const candNames = Object.keys(CANDIDATES);
      const candHits = new Array(candNames.length).fill(0);
      for (let i = 0; i < frame.length; i += 4) {
        if (frame[i + 3] === 0) continue;
        const c = (frame[i] << 16) | (frame[i + 1] << 8) | frame[i + 2];
        for (let k = 0; k < candNames.length; k++) {
          if (dist2(c, CANDIDATES[candNames[k]]) <= 60) { candHits[k] += 1; break; }
        }
      }
      candNames.forEach((n, k) => { candNear[n] = Math.round((candHits[k] / total) * 10000) / 100; });

      // Je Feld-Gem: Stufe-Klassifikation aus der px-Fläche seiner Textur.
      const sizes = ["small", "medium", "large"]
        .map((s) => ({ s, a: textures[s].opaque }))
        .sort((a, b) => a.a - b.a);
      const stageByArea = (area) =>
        area <= sizes[0].a ? "small" : area <= sizes[1].a ? "medium" : "large";
      const field = p.gems.map((g) => {
        const tex = window.__game.textures.get(g.sprite.texture.key);
        return { size: g.size, stageByArea: stageByArea(textures[g.size].w * textures[g.size].h), area: textures[g.size].opaque, value: g.value };
      });
      const bySize = { small: 0, medium: 0, large: 0 };
      for (const g of field) bySize[g.size] += 1;

      return {
        textures,
        pairwise: {
          "small-medium": Math.round(dist2(textures.small.core, textures.medium.core) * 100) / 100,
          "medium-large": Math.round(dist2(textures.medium.core, textures.large.core) * 100) / 100,
          "small-large": Math.round(dist2(textures.small.core, textures.large.core) * 100) / 100,
        },
        areaMonotonic: sizes[0].a < sizes[1].a && sizes[1].a < sizes[2].a,
        stageOrder: sizes.map((x) => `${x.s}:${x.a}`),
        chaosNearSharePct: near,
        candidateNearSharePct: candNear,
        fieldGems: field.length,
        fieldBySize: bySize,
        totalXp: p.totalXp,
        cap: p.cap,
        shotViewport: `${cv.width}x${cv.height}`,
      };
    }, { PAL, shot: shotDataUrl });

    const st = await page.evaluate(() => {
      const s = window.__lf.stats();
      const p = window.__game.scene.getScene("run").pickups;
      return { enemies: s.enemies, kills: s.kills, level: s.level, fps: s.fps, stats: p.stats };
    });

    return { viewport: `${viewport.width}x${viewport.height}`, shotPath, drops, ...result, endState: st, jsErrors: errors };
  } finally {
    await page.close();
  }
}

let result;
try {
  const r960 = await chaosFrame({ width: 960, height: 540 });
  const r640 = await chaosFrame({ width: 640, height: 360 });
  result = {
    lane: "m10-gem-value-reading",
    tag: TAG,
    createdAt: new Date().toISOString(),
    seed: 1,
    targetEnemies: TARGET,
    palCount: PAL.length,
    run960: r960,
    run640: r640,
    passed:
      r960.drops.dropped >= 300 && r960.jsErrors.length === 0 &&
      r640.drops.dropped >= 300 && r640.jsErrors.length === 0,
  };
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(`${EVID}/gem-reading-${TAG}.json`, JSON.stringify(result, null, 2));
const t = result.run960;
console.log(JSON.stringify({
  tag: TAG,
  dropped960: t.drops.dropped,
  fieldGems: t.fieldGems,
  fieldBySize: t.fieldBySize,
  cores: { small: t.textures.small.core, medium: t.textures.medium.core, large: t.textures.large.core },
  areas: t.stageOrder,
  pairwise: t.pairwise,
  areaMonotonic: t.areaMonotonic,
  chaosNearSharePct: t.chaosNearSharePct,
  candidateNearSharePct: t.candidateNearSharePct,
  offPalette: { small: t.textures.small.offPalette, medium: t.textures.medium.offPalette, large: t.textures.large.offPalette },
  jsErrors: [...t.jsErrors, ...result.run640.jsErrors],
  passed: result.passed,
}, null, 2));
process.exit(result.passed ? 0 : 1);
