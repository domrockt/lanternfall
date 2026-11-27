// M10-Hero-Contrast: Vorher/Nachher-Belege fuer die Helden-Lesbarkeit.
//
// Rendert (1) die CharSelect-Portraets von Mira und Kael und (2) Kael im
// Chaos-Frame mit 300+ dicht um den Spieler gestapelten Gegnern (Minute 25,
// echte Kamera). Aus dem Chaos-Frame wird eine Kontrast-Metrik berechnet:
// Anteil Spieler-Box-Pixel, deren Palette-Farbe im umliegenden Gegnerring
// selten (<2%) ist, plus Luminanz-/Warmanteil-Delta Spieler vs. Umgebung.
//
// Aufruf (KEIN flock — kein FPS-Echtzeit-Mass):
//   node scripts/m10-hero-contrast.mjs --tag=before
//   node scripts/m10-hero-contrast.mjs --tag=after
//
// Ausgabe:
//   shots/m10-hero-contrast-<tag>.png              Chaos-Frame 960x540
//   shots/m10-hero-contrast-<tag>-charselect.png   CharSelect-Szene
//   shots/m10-hero-contrast-<tag>-portraits.png    beide Portraets 3x nearest
//   shots/m10-hero-contrast-<tag>.json             Metrik + Rahmenbedingungen
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const TARGET = Number(argOf("enemies", "320")) || 320;
const CHAOS_JSON = `shots/m10-hero-contrast-${TAG}.json`;
const CHAOS_PNG = `shots/m10-hero-contrast-${TAG}.png`;
const SELECT_PNG = `shots/m10-hero-contrast-${TAG}-charselect.png`;

const VIEW_W = 960;
const VIEW_H = 540;
// Gegner-Mischung Minute ~25: viele graue/eiserne Silhouetten (Kael-Lesbarkeitsfall).
const MIX = [
  ["knight", 70], ["golem", 40], ["gargoyle", 40], ["reaper_bat", 40],
  ["wraith", 40], ["abom", 30], ["centipede", 30], ["voidcaller", 30],
];
// Minute 0: kein skipTo -> kein Boss-Banner/HP-Leiste im Chaos-Frame.
// Die graue Gegnermasse kommt aus der Mischung, nicht aus der Spielzeit.
const SKIP_SECONDS = 0;

// Die 32 Palette-Farben (src/palette.ts) fuer die Pixel-Klassifikation.
const PAL_HEX = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];

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
const page = await browser.newPage({ viewport: { width: VIEW_W, height: VIEW_H } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

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

try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await page.waitForFunction(() => window.__lf.state().scene === "title", { timeout: 8000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", { timeout: 8000 });
  await page.waitForTimeout(400);
  // Canvas-Rect messen (View-Width-Cap kann letterboxen): Basis fuer alle
  // Screen-Koordinaten (Portrait-Crops, Metrik-Mitte).
  const rect = await page.evaluate(() => {
    const r = window.__game.canvas.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  // Beide Portraets im CharSelect (Mira links, Kael rechts).
  await page.screenshot({ path: SELECT_PNG });

  // Kael waehlen (2. Panel) und Run starten.
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", { timeout: 8000 });

  // Chaos-Aufbau: Minute 25, Natur-Spawns aus, dichte Traube um den Spieler.
  const prep = await page.evaluate(async ({ mix, target, seedSrc, skip }) => {
    // eslint-disable-next-line no-eval
    eval(seedSrc);
    const run = window.__game.scene.getScene("run");
    window.__lf.god(true);
    window.__lf.autoPlay(false);
    if (skip > 0) window.__lf.skipTo(skip);
    window.__lf.setTimeScale(1);
    window.__game.registry.set("lf-density", 0);
    run.registry.set("lf-density", 0);
    for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
    await new Promise((r) => setTimeout(r, 250));

    const rand = mulberry32(20261127);
    const len = mix.length;
    const per = mix.map(([, n]) => Math.max(1, Math.round((n / mix.reduce((a, b) => a + b[1], 0)) * target)));
    const px = 2048;
    const py = 2048;
    window.__lf.teleport(px, py);
    let spawned = 0;
    for (let i = 0; i < len; i++) {
      const [id] = mix[i];
      const before = run.enemies.active.filter((e) => e.alive).length;
      window.__lf.spawnEnemy(id, per[i]);
      const fresh = run.enemies.active.filter((e) => e.alive).slice(before);
      for (const e of fresh) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 70;
        e.x = px + Math.cos(a) * r;
        e.y = py + Math.sin(a) * r;
        e.vx = 0;
        e.vy = 0;
        e.hp = 1e9;
        e.maxHp = 1e9;
        e.damage = 0;
      }
      spawned += fresh.length;
    }
    // ~30 Frames laufen lassen, damit die Gegner den Spieler umdrängen.
    await new Promise((resolve) => {
      let seen = 0;
      const tick = () => { seen++; if (seen >= 30) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    // God-Mode-Ifs machen den Spieler halbtransparent (alpha 0.55) — fuer den
    // Kontrast-Frame wieder voll sichtbar machen. Kamera deterministisch auf
    // den Spieler zentrieren (Follow-Lerp wuerde zwischen Sampling und Shot
    // weiterziehen), damit die Metrik-Mitte exakt stimmt.
    run.invuln = 0;
    run.hitFlash = 0;
    run.playerBody.setAlpha(1);
    run.cameras.main.stopFollow();
    run.cameras.main.centerOn(run.player.x, run.player.y);
    return {
      spawned,
      alive: run.enemies.active.filter((e) => e.alive).length,
      playerX: run.player.x,
      playerY: run.player.y,
      camScrollX: run.cameras.main.scrollX,
      camScrollY: run.cameras.main.scrollY,
      camWidth: run.cameras.main.width,
      camHeight: run.cameras.main.height,
      bodyAlpha: run.playerBody.alpha,
      char: window.__lf.state().character,
    };
  }, { mix: MIX, target: TARGET, seedSrc: SEED_FN, skip: SKIP_SECONDS });

  await page.screenshot({ path: CHAOS_PNG });

  // Metrik aus dem PNG im Browser-Kontext (Canvas) berechnen.
  const fsPng = await import("node:fs/promises");
  const b64 = (await fsPng.readFile(CHAOS_PNG)).toString("base64");
  const metrics = await page.evaluate(({ dataUrl, pal, cx, cy, scale }) => {
    const img = new Image();
    return new Promise((resolve, reject) => {
      img.onload = () => {
        const cv = document.createElement("canvas");
        cv.width = img.width;
        cv.height = img.height;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
        const w = cv.width;
        const h = cv.height;
        const cxp = cx;
        const cyp = cy;
        // Klassifikation: naechste Palette-Farbe (RGB-Euklid).
        const cls = (r, g, b) => {
          let best = 0;
          let bestD = Infinity;
          for (let i = 0; i < pal.length; i++) {
            const pr = (pal[i] >> 16) & 255;
            const pg = (pal[i] >> 8) & 255;
            const pb = pal[i] & 255;
            const d = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
            if (d < bestD) { bestD = d; best = i; }
          }
          return best;
        };
        // Spieler-Box: 32x32 Spiel-px um die Bildmitte.
        const box = 16 * scale;
        // Ring: 40..110 Spiel-px um die Bildmitte (Gegner-Umgebung).
        const rIn = 40 * scale;
        const rOut = 110 * scale;
        const counts = new Array(pal.length).fill(0);
        let boxN = 0;
        let ringN = 0;
        let boxRare = 0;
        let boxLum = 0;
        let ringLum = 0;
        let boxWarm = 0;
        let ringWarm = 0;
        let boxRim = 0;
        const warm = new Set([16, 17, 18, 19, 20, 21, 22, 26, 27]);
        // Luminanz-P99: die hellsten Pixel der Spieler-Box (Glow-Kontur)
        // gegen die hellsten Pixel des Gegner-Rings.
        const lumsBox = [];
        const lumsRing = [];
        const p99 = (arr) => {
          if (!arr.length) return 0;
          arr.sort((a, b) => a - b);
          return Math.round(arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.99))] * 10) / 10;
        };
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const o = (y * w + x) * 4;
            const r = data[o];
            const g = data[o + 1];
            const b = data[o + 2];
            const a = data[o + 3];
            if (a < 128) continue;
            // Warme Laterne-Pixel (Palettenfamilie amber 20 / lantern 21 /
            // glow 22): der helle Spieler-Konturakzent.
            const isRim = r >= 230 && g >= 170 && b <= 190 && (r - b) >= 60;
            const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const c = cls(r, g, b);
            const dx = x - cxp;
            const dy = y - cyp;
            const d2 = dx * dx + dy * dy;
            const inBox = Math.abs(dx) <= box && Math.abs(dy) <= box;
            const inRing = d2 >= rIn * rIn && d2 <= rOut * rOut;
            if (inBox) {
              boxN++;
              counts[c]++;
              boxLum += lum;
              lumsBox.push(lum);
              if (warm.has(c)) boxWarm++;
              if (isRim) boxRim++;
            } else if (inRing) {
              ringN++;
              counts[c]++;
              ringLum += lum;
              lumsRing.push(lum);
              if (warm.has(c)) ringWarm++;
            }
          }
        }
        // Seltene Farben im Ring (<2% Anteil) = Farben, die den Helden herausheben.
        const ringShare = counts.map((n) => (ringN > 0 ? n / ringN : 0));
        let rareShareBox = 0;
        const rareIdx = [];
        for (let i = 0; i < pal.length; i++) {
          if (ringShare[i] < 0.02) { rareIdx.push(i); rareShareBox += counts[i]; }
        }
        resolve({
          boxN,
          ringN,
          rareColorsInRing: rareIdx,
          heroRarity: boxN > 0 ? Math.round((rareShareBox / boxN) * 10000) / 10000 : 0,
          rimPixelsBox: boxRim,
          rimSharePlayer: boxN > 0 ? Math.round((boxRim / boxN) * 10000) / 10000 : 0,
          lumP99Player: p99(lumsBox),
          lumP99Surround: p99(lumsRing),
          lumP99Delta: Math.round((p99(lumsBox) - p99(lumsRing)) * 10) / 10,
          lumPlayer: boxN > 0 ? Math.round((boxLum / boxN) * 10) / 10 : 0,
          lumSurround: ringN > 0 ? Math.round((ringLum / ringN) * 10) / 10 : 0,
          lumDelta: Math.round(((boxLum / Math.max(1, boxN)) - (ringLum / Math.max(1, ringN))) * 10) / 10,
          warmSharePlayer: boxN > 0 ? Math.round((boxWarm / boxN) * 10000) / 10000 : 0,
          warmShareSurround: ringN > 0 ? Math.round((ringWarm / ringN) * 10000) / 10000 : 0,
          scale,
        });
      };
      img.onerror = () => reject(new Error("Chaos-PNG konnte nicht geladen werden"));
      img.src = dataUrl;
    });
  }, {
    dataUrl: `data:image/png;base64,${b64}`,
    pal: PAL_HEX,
    cx: Math.round(rect.x + rect.w / 2),
    cy: Math.round(rect.y + rect.h / 2),
    scale: rect.w / prep.camWidth,
  });

  // Portraet-Belege kommen aus der Asset-Pipeline (scripts/art/m10_hero_portraits.py),
  // nicht aus Screen-Crops — die Spiel-Texturen sind WebGL-verwaltet.
  execFileSync("python3", ["scripts/art/m10_hero_portraits.py", TAG], { stdio: "inherit" });

  const out = {
    tag: TAG,
    character: prep.char,
    playerDebug: {
      x: prep.playerX, y: prep.playerY,
      camScrollX: prep.camScrollX, camScrollY: prep.camScrollY,
      camWidth: prep.camWidth,
      bodyTexture: prep.bodyTexture, bodyVisible: prep.bodyVisible, bodyAlpha: prep.bodyAlpha,
    },
    enemiesTarget: TARGET,
    enemiesSpawned: prep.spawned,
    enemiesAlive: prep.alive,
    simMinute: Math.round((SKIP_SECONDS / 60) * 100) / 100,
    metric: metrics,
    jsErrors: errors,
  };
  writeFileSync(CHAOS_JSON, JSON.stringify(out, null, 2));
  console.log("[m10-hero-contrast]", JSON.stringify(out));
} finally {
  await browser.close();
  server.stop();
}
