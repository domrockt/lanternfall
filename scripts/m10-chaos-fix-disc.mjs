#!/usr/bin/env node
/**
 * m10-chaos-fix-hazard-disc K1/K4 — Vorher-/Nachher-Messung B3 (milchige Telegraph-Discs).
 *
 * Repro wie Audit-Lane m10-chaos-legibility (B3): 500er-Stress + M25, 640x360@1 + 780x360@3,
 * seed=1, god, autoPlay, 6 Waffen Lv8 + 6 Evolutionen Lv8 + 6 Passives St5, skipTo(1490).
 * Zusaetzlich deterministische Telegraph-Discs (warn=120 s, Radien 30-90) um den Spieler,
 * damit der Disc-Anteil im Frame gross und reproduzierbar ist.
 *
 * Metrik (je Frame, Scotty-prinzip: A/B im SELBEN Frame):
 *   Pro Frame zwei Screenshots — einmal mit Telegraph-Sprites (shown), einmal ohne (hidden,
 *   Sprites unsichtbar, Szene pausiert). Ein Pixel zaehlt als hazard-attribuiert, wenn er
 *   sich unterscheidet (max |Delta| > 10); als "milchig" wenn er ausserdem
 *   (a) kein exakter 32-Paletten-Farbwert ist (Transparenz-/ADD-Überblendung = weiche Scheibe)
 *   und (b) hell ist (max(R,G,B) >= 110). Sauber gerasterte, opake Telegraph-Pixel sind
 *   exakte Palettenfarben und zaehlen NICHT als milchig — genau der Fix.
 *
 *   primary: milkyShareDisc  = milchige Pixel / Fenster-Pixel ueber alle injizierten Disc-Fenster
 *   diag:    milkyShareFull  = dasselbe ueber den ganzen Frame (Licht-/Glow-Baseline mit drin)
 *
 * Akzeptanzgrenze (vor der Messung fixiert): milkyShareDisc im 500er-Stress-Repro (Mittel je
 * Viewport) um >= 50 % gesenkt vs. before. 0 JS-Fehler. Keine FPS-/Echtzeit-Messung -> kein flock.
 *
 * Aufruf: node scripts/m10-chaos-fix-disc.mjs --tag=before   (bzw. after)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
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
const PREFIX = "m10-hazard-disc-polish"; // Eigener Shot-Praefix der Polish-Lane (Belege von 3fa01eb bleiben unangetastet).

const OUT = "shots";
const TMP = `${homedir()}/tmp/m10-chaos-fix-hazard-disc`;
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const PALETTE_HEX = [
  0x06070c, 0x0a0e16, 0x101724, 0x17202e, 0x1e2a3a, 0x2a3547, 0x3a4a5c, 0x4e5f6e,
  0x6b7c86, 0x8fa0a6, 0xb8c4c2, 0xd9ddcd, 0xf2edd8, 0xfff8e6, 0x2b1410, 0x4d2214,
  0x7a331a, 0xa84a21, 0xcf6b26, 0xef9130, 0xffb84d, 0xffd77a, 0xffeeb0, 0x3d1220,
  0x7a1f2e, 0xb8303f, 0xe4574d, 0xff8a6b, 0x16261e, 0x22382a, 0x3d5a38, 0x6f9b58,
];
// Deterministische Disc-Injektion: [winkel-Grad, dist, radius] um den Spieler.
const DISCS = [
  [0, 70, 30], [36, 105, 45], [72, 80, 60], [108, 130, 90], [144, 95, 30],
  [180, 140, 45], [216, 75, 60], [252, 110, 90], [288, 85, 52], [324, 120, 68],
];
const MILKY_BRIGHT = 110; // max(R,G,B) >= 110: hell genug, um Terrain milchig zu ueberdecken
const DIFF_MIN = 10; // max |Delta| shown vs hidden, sonst nicht hazard-attribuiert

ensureBuild();
mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

// ---- Minimaler PNG-Decoder (8-bit RGB/RGBA, non-interlaced). ----
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

const palSet = new Set(PALETTE_HEX);
const isMilky = (shown, hidden) => {
  const dr = Math.abs(shown[0] - hidden[0]);
  const dg = Math.abs(shown[1] - hidden[1]);
  const db = Math.abs(shown[2] - hidden[2]);
  if (Math.max(dr, dg, db) <= DIFF_MIN) return 0; // nicht hazard-attribuiert
  const hex = (shown[0] << 16) | (shown[1] << 8) | shown[2];
  if (palSet.has(hex)) return 0; // opak gerasterte Palettenfarbe = lesbar, nicht milchig
  const max = Math.max(shown[0], shown[1], shown[2]);
  return max >= MILKY_BRIGHT ? 1 : 0;
};

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
  ],
});

const clearLevelUps = async (page) => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

const rendererInfo = (page) => page.evaluate(() => {
  const gl = window.__game?.renderer?.gl ?? null;
  if (!gl) return { renderer: "", vendor: "", webglVersion: "" };
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "") : String(gl.getParameter(gl.RENDERER) ?? ""),
    vendor: dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? "") : String(gl.getParameter(gl.VENDOR) ?? ""),
    webglVersion: String(gl.getParameter(gl.VERSION) ?? ""),
  };
});

const setup = async (width, height, dpr) => {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[console] ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true); window.__lf.autoPlay(true); window.__lf.setTimeScale(1);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) window.__lf.addWeapon(id, 8);
  });
  await page.waitForTimeout(500);
  await page.evaluate(({ evolutions, passives }) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    for (const id of passives) window.__lf.addPassive(id, 5);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, { evolutions: EVOLUTIONS, passives: PASSIVES });
  await page.waitForTimeout(6000);
  await clearLevelUps(page);
  return { ctx, page };
};

const topUp = (page, n) => page.evaluate((target) => {
  const active = window.__lf.stats().enemies;
  if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
}, n);

/** Injiziert die deterministischen Discs und liefert deren Welt-Positionen/Radien. */
const injectDiscs = (page) => page.evaluate((discs) => {
  const run = window.__game.scene.getScene("run");
  const before = run.hazards.active.length;
  for (const [deg, dist, radius] of discs) {
    const a = (deg * Math.PI) / 180;
    run.hazards.spawnCircle(
      Math.round(run.posX + Math.cos(a) * dist),
      Math.round(run.posY + Math.sin(a) * dist),
      { warn: 120, damage: 0, radius, source: "measure" },
    );
  }
  const added = run.hazards.active.slice(before);
  return added.map((h) => ({ x: h.x, y: h.y, radius: h.radius, discKey: h.warnSprite?.texture?.key ?? "" }));
}, DISCS);

const raf = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

const errors = [];
const report = {
  lane: "m10-hazard-disc-polish", tag: TAG, generatedAt: new Date().toISOString(),
  swiftShader: null, renderer: null, errors: [],
  acceptance: {
    metric: "milkyShareDisc (hazard-attribuierte helle Nicht-Paletten-Pixel in Disc-Fenstern, shown-vs-hidden im selben Frame)",
    threshold: "500er-Stress: Mittel je Viewport um >= 50 % vs. before gesenkt; 0 JS-Fehler",
    milkyBrightMin: MILKY_BRIGHT, diffMin: DIFF_MIN,
  },
  scenarios: [],
};

const configs = [
  { tag: "stress500-640", width: 640, height: 360, dpr: 1, target: 500, frames: 3 },
  { tag: "stress500-780", width: 780, height: 360, dpr: 3, target: 500, frames: 2 },
  { tag: "m25-640", width: 640, height: 360, dpr: 1, target: 300, frames: 2 },
];

try {
  for (const cfg of configs) {
    const { ctx, page } = await setup(cfg.width, cfg.height, cfg.dpr);
    const frames = [];
    for (let i = 0; i < cfg.frames; i++) {
      for (let k = 0; k < 14; k++) { await topUp(page, cfg.target); await page.waitForTimeout(150); }
      await topUp(page, cfg.target);
      const discs = await injectDiscs(page);
      await page.waitForTimeout(400);
      // Frisch toppen direkt vorm Pausieren: Waffen killn den Schwarm in <1 s.
      await topUp(page, cfg.target);
      await page.waitForTimeout(120);
      // Szene pausieren -> beide Screenshots exakt derselbe Sim-Zustand.
      await page.evaluate(() => window.__game.scene.getScene("run").scene.pause());
      await raf(page);
      const camInfo = await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        const cam = run.cameras.main;
        return { scrollX: cam.scrollX, scrollY: cam.scrollY, camWidth: cam.width, camHeight: cam.height };
      });
      const shotShown = `${OUT}/${PREFIX}-${TAG}-${cfg.tag}-f${i + 1}.png`;
      await page.screenshot({ path: shotShown });
      const shown = decodePng(await page.screenshot());

      await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        for (const h of run.hazards.active) {
          h.warnSprite?.setVisible(false);
          h.rimSprite?.setVisible(false);
          h.activeSprite?.setVisible(false);
        }
      });
      await raf(page);
      const shotHidden = `${TMP}/${PREFIX}-${TAG}-${cfg.tag}-f${i + 1}-hidden.png`;
      await page.screenshot({ path: shotHidden });
      const hidden = decodePng(await page.screenshot());

      await page.evaluate(() => window.__game.scene.getScene("run").scene.resume());
      const stats = await page.evaluate(() => {
        const s = window.__lf.stats();
        return { time: Math.round(s.time), enemies: s.enemies, fps: s.fps, hazards: s.hazards ?? null };
      });

      // Disc-Fenster in Device-Pixeln.
      const scale = shown.width / camInfo.camWidth;
      let milkyDisc = 0, discPx = 0, hazardPx = 0, discWindows = 0, stackedDiscs = 0;
      for (const d of discs) {
        if (d.discKey.includes("_s1")) stackedDiscs++;
        const cx = Math.round((d.x - camInfo.scrollX) * scale);
        const cy = Math.round((d.y - camInfo.scrollY) * scale);
        const half = Math.round((d.radius + 5) * scale);
        const x0 = Math.max(0, cx - half), x1 = Math.min(shown.width - 1, cx + half);
        const y0 = Math.max(0, cy - half), y1 = Math.min(shown.height - 1, cy + half);
        if (x1 <= x0 || y1 <= y0) continue;
        discWindows++;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const idx = (y * shown.width + x) * 4;
            discPx++;
            const m = isMilky(shown.data.subarray(idx, idx + 3), hidden.data.subarray(idx, idx + 3));
            if (m) milkyDisc++;
            const dr = Math.abs(shown.data[idx] - hidden.data[idx]);
            const dg = Math.abs(shown.data[idx + 1] - hidden.data[idx + 1]);
            const db = Math.abs(shown.data[idx + 2] - hidden.data[idx + 2]);
            if (Math.max(dr, dg, db) > DIFF_MIN) hazardPx++;
          }
        }
      }
      // Diagnose: ganzer Frame (gleiche Regel, Licht-/Glow-Baseline mit drin).
      let milkyFull = 0;
      for (let p = 0; p < shown.width * shown.height; p++) {
        const idx = p * 4;
        milkyFull += isMilky(shown.data.subarray(idx, idx + 3), hidden.data.subarray(idx, idx + 3));
      }

      const frame = {
        shot: shotShown, hiddenShot: shotHidden.replace(homedir(), "~"),
        discs: discs.length, discWindows,
        milkyShareDisc: discPx ? +((100 * milkyDisc) / discPx).toFixed(2) : 0,
        stackedDiscs,
        discKeys: discs.map((d) => d.discKey),
        hazardShareDisc: discPx ? +((100 * hazardPx) / discPx).toFixed(2) : 0,
        milkyShareFull: +((100 * milkyFull) / (shown.width * shown.height)).toFixed(2),
        ...stats,
      };
      frames.push(frame);
      console.log(`[${cfg.tag}] f${i + 1}: milkyDisc=${frame.milkyShareDisc}% hazardDisc=${frame.hazardShareDisc}% milkyFull=${frame.milkyShareFull}% enemies=${stats.enemies} fps=${stats.fps} errs=${errors.length}`);

      // 4x-Zoom (nearest) um die erste grosse Disc — Beleg fuer art-director.
      if (i === Math.floor(cfg.frames / 2) - (cfg.frames % 2 === 0 ? 1 : 0)) {
        const d = discs.find((x) => x.radius >= 52) ?? discs[0];
        const cx = Math.round((d.x - camInfo.scrollX) * scale);
        const cy = Math.round((d.y - camInfo.scrollY) * scale);
        const half = Math.round((d.radius + 12) * scale);
        const w = Math.min(2 * half, shown.width), h = Math.min(2 * half, shown.height);
        const x0 = Math.min(Math.max(0, cx - half), shown.width - w);
        const y0 = Math.min(Math.max(0, cy - half), shown.height - h);
        execFileSync("convert", [
          `${OUT}/${PREFIX}-${TAG}-${cfg.tag}-f${i + 1}.png`,
          "-crop", `${w}x${h}+${x0}+${y0}`, "-filter", "point", "-resize", "400%",
          `${OUT}/${PREFIX}-${TAG}-${cfg.tag}-f${i + 1}-zoom4x.png`,
        ]);
      }
    }
    report.scenarios.push({
      tag: cfg.tag, viewport: `${cfg.width}x${cfg.height}@${cfg.dpr}`, target: cfg.target, frames,
      milkyShareDiscAvg: +((frames.reduce((a, f) => a + f.milkyShareDisc, 0)) / frames.length).toFixed(2),
      milkyShareFullAvg: +((frames.reduce((a, f) => a + f.milkyShareFull, 0)) / frames.length).toFixed(2),
    });
    await ctx.close();
    if (errors.length >= 5) break;
  }
  // Renderer-String (Pflicht fuer art-director).
  {
    const { ctx, page } = await setup(780, 360, 3);
    report.renderer = await rendererInfo(page);
    report.swiftShader = /swiftshader|llvmpipe|software/i.test(report.renderer.renderer);
    console.log(`[renderer] ${report.renderer.renderer} | swiftShader=${report.swiftShader}`);
    await ctx.close();
  }
} finally {
  report.errors = errors;
  writeFileSync(`${OUT}/${PREFIX}-${TAG}.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server.stop();
}
console.log(`[done] ${report.scenarios.map((s) => `${s.tag}: ${s.milkyShareDiscAvg}%`).join("  ")} | errors=${errors.length}`);
