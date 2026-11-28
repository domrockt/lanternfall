#!/usr/bin/env node
// M10-Lane "gem-rows-texture": Vorher-/Nachher-Beleg der Gem-Rampenfarben.
//
// Erzeugt einen Chaos-Frame (500 Gegner via Spawn-Automat, autoPlay, god,
// Seed 1), friert ihn ein, macht Screenshots (960 + 640) und misst pro
// Gem-Groesse die Kernfarbe (Dominantfarbe ohne Ink-Kontur) der aktiven
// Textur — Beleg, dass gem_small/gem_medium die Rampe (Silber/Gold/Rubin)
// zeigen.
// Aufruf:
//   node scripts/m10-gem-rows.mjs --tag before
//   node scripts/m10-gem-rows.mjs --tag after
// Output (Belege, nicht Deliverables):
//   /home/ai/games/.evidence/m10-gem-rows-texture/gem-rows-<tag>.json
//   /home/ai/games/.evidence/m10-gem-rows-texture/chaos-<tag>-960.png (+ -640)
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const EVID = "/home/ai/games/.evidence/m10-gem-rows-texture";
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

    // Spawn-Automat: Gegner auf 500 auffüllen, bis >= 300 Gem-Drops erzeugt wurden.
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

    // Kernfarbe je Gem-Groesse: Dominantfarbe des Atlas-Frames (Ink PAL 0
    // und transparente Pixel ausgenommen).
    const sizes = await page.evaluate(() => {
      const scene = window.__game.scene.getScene("run");
      const out = {};
      const tex = scene.textures.get("runtime_atlas");
      const hist = (frameName) => {
        const f = tex.frames[frameName];
        if (!f) return null;
        const c = document.createElement("canvas");
        c.width = f.cutWidth;
        c.height = f.cutHeight;
        const cx = c.getContext("2d");
        cx.imageSmoothingEnabled = false;
        cx.drawImage(tex.getSourceImage(), f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
        const d = cx.getImageData(0, 0, c.width, c.height).data;
        const counts = new Map();
        let opaque = 0;
        let offAlpha = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] === 0) continue;
          opaque += 1;
          if (d[i + 3] !== 255) offAlpha += 1;
          const col = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
          counts.set(col, (counts.get(col) ?? 0) + 1);
        }
        const INK = 0x06070c;
        let core = 0;
        let coreN = 0;
        for (const [col, n] of counts) if (col !== INK && n > coreN) { core = col; coreN = n; }
        return {
          w: c.width, h: c.height, opaque, offAlpha,
          core, coreN,
          coreHex: `#${core.toString(16).padStart(6, "0")}`,
          counts: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([col, n]) => [`#${col.toString(16).padStart(6, "0")}`, n]),
        };
      };
      for (const size of ["small", "medium", "large"]) out[size] = hist(`gem_${size}`);
      return out;
    });

    return { width, drops, sizes, errors };
  } finally {
    await page.close();
  }
}

const at960 = await chaosFrame({ width: 960, height: 540 });
const at640 = await chaosFrame({ width: 640, height: 360 });
await browser.close();
server.stop();

const out = { tag: TAG, at960, at640, at: new Date().toISOString() };
writeFileSync(`${EVID}/gem-rows-${TAG}.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ tag: TAG, drops960: at960.drops, drops640: at640.drops, sizes: at960.sizes, errors: [...at960.errors, ...at640.errors] }, null, 2));
