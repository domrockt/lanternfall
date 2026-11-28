// m10-evo-fx-gewittersiegel, Karte 1: Ist-Beleg + Bug-Repro (Vorher).
// Stellt die Szene nach: Gewittersiegel (addWeapon "thunder_seal" 8), 20 lebende
// Gegner, je 640x360 (@2, Viewport 1280x720) und 960x540 (@1). Misst je Lauf:
//   - Zeitreihe 0–4,6 s: sichtbare fx_seal/fx_halo/fx_bolt/fx_star-Sprites
//     (Anzahl, max Alpha, max Scale) + lebende Gegner -> Bug "nach 2 s nicht
//     mehr sichtbar" / "wirkt nicht" als Datenreihe
//   - WebGL-Renderer-String (SwiftShader-Belege sind ungültig)
//   - Textur-Pixelgrößen der Siegel-relevanten Effekt-Texturen
//   - Draw-Scale aller live gerenderten Siegel-Sprites (Mixel-Nachweis)
//   - Farb-Stufen der fx_seal-Textur (Paletten-Treffer + Ink-/Rand-Anteil)
// Keine FPS-Messung -> kein flock. Einmal laufen lassen, JSON+PNG committen.
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

ensureBuild();
mkdirSync("shots", { recursive: true });

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

// Siegel-relevante Texturen (Boden-Siegel + Halo + Kettenblitz + Funken).
const FX_KEYS = ["fx_seal", "fx_halo", "fx_bolt", "fx_star"];

const SNAP = (FX_KEYS) => {
  const scene = window.__game.scene.getScene("run");
  const kids = Array.isArray(scene.children) ? scene.children : (scene.children.list ?? []);
  const counts = {}; const alpha = {}; const scale = {}; const frames = {};
  for (const child of kids) {
    // Atlasierte Keys rendern als Textur "runtime_atlas" + frame.name = Key.
    const key = child.texture?.key === "runtime_atlas" ? child.frame?.name : child.texture?.key;
    if (!key) continue;
    const base = FX_KEYS.find((k) => key === k || key.startsWith(k));
    if (!base || !child.visible) continue;
    counts[base] = (counts[base] ?? 0) + 1;
    alpha[base] = Math.max(alpha[base] ?? 0, +child.alpha.toFixed(2));
    scale[base] = Math.max(scale[base] ?? 0, +child.scaleX.toFixed(2));
    if (child.frame?.name && child.frame.name !== "__BASE") frames[base] = child.frame.name;
  }
  const st = window.__lf.state();
  return {
    t: +((performance.now() - window.__sealT0) / 1000).toFixed(2),
    counts, alpha, scale, frames, aliveEnemies: st.enemies,
    kills: st.kills ?? st.killCount ?? null,
  };
};

const PROBE = (FX_KEYS) => {
  const scene = window.__game.scene.getScene("run");
  const out = { renderer: window.__lf.rendererInfo(), textures: {}, live: {}, colors: {}, errors: [] };
  for (const key of FX_KEYS) {
    const tex = window.__game.textures.get(key);
    if (!tex || !tex.source) continue;
    out.textures[key] = { sourceW: tex.source[0].width, sourceH: tex.source[0].height, frameW: tex.frames.__BASE.width, frameH: tex.frames.__BASE.height };
  }
  // Live-Sprites: Scale/Displaygröße aller Siegel-relevanten Bilder im Run-Scene.
  const counts = {};
  const kids = Array.isArray(scene.children) ? scene.children : (scene.children.list ?? []);
  for (const child of kids) {
    const key = child.texture?.key === "runtime_atlas" ? child.frame?.name : child.texture?.key;
    if (!key || !FX_KEYS.some((k) => key === k || key.startsWith(k))) continue;
    if (!child.visible) continue;
    const rec = { scaleX: +child.scaleX.toFixed(3), scaleY: +child.scaleY.toFixed(3), dispW: Math.round(child.displayWidth), dispH: Math.round(child.displayHeight), blend: child.blendMode, alpha: +child.alpha.toFixed(2) };
    counts[key] = (counts[key] ?? 0) + 1;
    const cur = out.live[key];
    if (!cur) { out.live[key] = { maxScaleX: rec.scaleX, maxScaleY: rec.scaleY, samples: [rec] }; }
    else {
      cur.maxScaleX = Math.max(cur.maxScaleX, rec.scaleX);
      cur.maxScaleY = Math.max(cur.maxScaleY, rec.scaleY);
      if (cur.samples.length < 8) cur.samples.push(rec);
    }
  }
  out.liveCounts = counts;
  // Farb-Stufen der fx_seal-Textur: exakte Paletten-Treffer + Ink-Rand-Anteil.
  const pal = [0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xd8572f,0x8a8f7c,0x59743a,0x86983f,0xa9b063];
  const hex = (v) => "#" + v.toString(16).padStart(6, "0");
  const tex = window.__game.textures.get("fx_seal");
  if (tex) {
    const src = tex.source[0];
    const cv = document.createElement("canvas");
    cv.width = src.width; cv.height = src.height;
    const cx = cv.getContext("2d");
    cx.drawImage(tex.source[0].image, 0, 0);
    const data = cx.getImageData(0, 0, cv.width, cv.height).data;
    const hist = {}; let ink = 0; let opaque = 0; let grey = 0;
    const palHexSet = new Map(pal.map((v, i) => [hex(v), i]));
    const border = [];
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        const i = (y * cv.width + x) * 4;
        if (data[i + 3] < 8) continue;
        opaque++;
        const h = hex((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        const idx = palHexSet.get(h);
        if (idx === undefined) { hist["OUTSIDE_PAL:" + h] = (hist["OUTSIDE_PAL:" + h] ?? 0) + 1; }
        else { hist["pal" + idx] = (hist["pal" + idx] ?? 0) + 1; if (idx === 0) ink++; if (idx >= 5 && idx <= 9) grey++; }
        const isEdge = x === 0 || y === 0 || x === cv.width - 1 || y === cv.height - 1;
        if (isEdge && data[i + 3] >= 8) border.push({ x, y, i: palHexSet.get(h) ?? h });
      }
    }
    out.colors = { width: cv.width, height: cv.height, opaque, inkPixels: ink, greyPixels: grey, edgeOpaquePixels: border.length, edgeSample: border.slice(0, 12), histogram: hist };
  }
  return out;
};

const TAG = process.argv[2] ?? "before";
const TICKS = 24;
const TICK_MS = 200;
const SHOT_AT = { 1: "t03", 7: "t15", 17: "t35" }; // Moment-Aufnahmen (Anticipation ~0,3s / Folgezyklus ~1,5s / spaet ~3,5s)
const configs = [
  { tag: "640", viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { tag: "960x540", viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 },
];

const results = {};
const allErrors = [];
try {
  for (const cfg of configs) {
    const page = await browser.newPage({ viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor });
    page.on("pageerror", (e) => allErrors.push(`[${cfg.tag}] ` + String(e)));
    page.on("console", (m) => { if (m.type() === "error") allErrors.push(`[${cfg.tag}] ` + m.text()); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(false);
      window.__lf.setSuppressLevelUps(true);
      window.__lf.addWeapon("thunder_seal", 8);
      window.__lf.spawnEnemy("mudling", 12);
      window.__lf.spawnEnemy("bog_rat", 8);
      window.__sealT0 = performance.now();
    });
    const rec = { series: [] };
    for (let i = 0; i < TICKS; i++) {
      rec.series.push(await page.evaluate(SNAP, FX_KEYS));
      if (SHOT_AT[i] !== undefined) {
        await page.screenshot({ path: `shots/m10-evo-fx-gewittersiegel-${TAG}-${cfg.tag}-${SHOT_AT[i]}.png` });
      }
      await page.waitForTimeout(TICK_MS);
    }
    results[cfg.tag] = rec;
    // Voll-Probe am Ende (Texturen, Farbstufen, Live-Scales).
    results[cfg.tag].probe = await page.evaluate(PROBE, FX_KEYS);
    await page.screenshot({ path: `shots/m10-evo-fx-gewittersiegel-${TAG}-${cfg.tag}.png` });
    await page.close();
  }
} finally {
  await browser.close();
  server.stop?.();
}

const renderer = results["640"]?.probe?.renderer?.renderer ?? "UNKNOWN";
const summary = {
  generatedAt: new Date().toISOString(),
  renderer,
  valid: !/swiftshader|llvmpipe|software/i.test(renderer),
  errors: allErrors,
  configs: results,
};
writeFileSync(`shots/m10-evo-fx-gewittersiegel-${TAG}.json`, JSON.stringify(summary, null, 2));
// Kurze Zusammenfassung: Sichtbarkeits-Fenster je Config.
for (const [tag, rec] of Object.entries(results)) {
  const sealTicks = rec.series.filter((s) => (s.counts.fx_seal ?? 0) > 0);
  console.log(`[${tag}] fx_seal sichtbar in ${sealTicks.length}/${rec.series.length} Ticks`,
    sealTicks.length ? `(erste ${sealTicks[0].t}s, letzte ${sealTicks[sealTicks.length - 1].t}s, maxAlpha ${Math.max(...sealTicks.map((s) => s.alpha.fx_seal ?? 0))}, maxScale ${Math.max(...sealTicks.map((s) => s.scale.fx_seal ?? 0))})` : "(NIE)");
  console.log(`[${tag}] Gegner alive: ${rec.series[0].aliveEnemies} -> ${rec.series[rec.series.length - 1].aliveEnemies}`);
}
console.log(JSON.stringify(summary, null, 2));
if (allErrors.length > 0 || !summary.valid) process.exit(1);
