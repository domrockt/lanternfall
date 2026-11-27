#!/usr/bin/env node
/**
 * M10 Android/ARM-Audit (lane m10-android-perf).
 *
 * Misst Lanternfall im Pixel-7-Mobilprofil (915x412 CSS, dpr 2) mit
 * CDP `Emulation.setCPUThrottlingRate 4`:
 *   - Draw-Calls und Texturwechsel pro Frame (gl-Wrapper per addInitScript)
 *   - Anzahl und Groesse aller Phaser-Texturen; > 2048 px = Befund
 *   - Vollbild-Overlays mit Alpha < 1 oder ADD-Blend
 *   - preFX/postFX-Nutzung
 *   - Canvas-Groesse vs. logische Groesse (darf NICHT in Geraetepixeln rendern)
 *   - Startzeit bis Titel (inkl. Sprite-/Textur-Erzeugung)
 *
 * Ergebnis: shots/m10-android-audit.json + Screenshot und eine Markdown-Tabelle
 * auf stdout (wird in docs/lanes/m10-android-perf.md uebernommen).
 *
 *   node scripts/android-audit.mjs            # baut dist/ bei Bedarf
 *   node scripts/android-audit.mjs --no-build # nur messen, dist/ muss aktuell sein
 *
 * Die reinen Helfer unten sind ohne Browser importierbar (Unit-Tests).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ensureBuild, startServer, loadPlaywright, waitForScene, startRun } from "./harness.mjs";

/** Geraete-Profil: Pixel 7 quer (Chrome-Android-UA, Touch, dpr 2). */
export const ANDROID_PROFILE = {
  name: "pixel7",
  width: 915,
  height: 412,
  dpr: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

export const CPU_THROTTLE_RATE = 4;
/** Texturen oberhalb dieser Kantenlaenge gelten als ARM-Risiko. */
export const MAX_SAFE_TEXTURE_SIZE = 2048;
/** Ab diesem Anteil der logischen Flaeche gilt ein Objekt als Vollbild-Overlay. */
export const FULLSCREEN_COVERAGE = 0.8;

/** Phaser-BlendModes: 0 NORMAL, 1 ADD, 2 MULTIPLY, 3 SCREEN, 4 ERASE. */
export const BLEND_NAMES = ["NORMAL", "ADD", "MULTIPLY", "SCREEN", "ERASE"];
export function blendName(mode) {
  return BLEND_NAMES[mode] ?? `BLEND_${mode}`;
}

/**
 * Fasst Textur-Eintraege zusammen. Erwartet [{key,width,height,frames}].
 * Liefert Anzahl, Summe der Pixel, groesste Kante und die >2048-Befunde.
 */
export function summarizeTextures(entries) {
  const textures = entries.filter((e) => e.width > 0 && e.height > 0);
  const oversized = textures.filter(
    (e) => e.width > MAX_SAFE_TEXTURE_SIZE || e.height > MAX_SAFE_TEXTURE_SIZE,
  );
  let pixels = 0;
  let maxEdge = 0;
  for (const t of textures) {
    pixels += t.width * t.height;
    maxEdge = Math.max(maxEdge, t.width, t.height);
  }
  return {
    count: textures.length,
    pixels,
    approxBytes: pixels * 4,
    maxEdge,
    oversized: oversized.map((t) => ({
      key: t.key,
      width: t.width,
      height: t.height,
      frames: t.frames ?? 1,
    })),
    oversizedCount: oversized.length,
  };
}

/**
 * Klassifiziert ein Display-Objekt als Vollbild-Overlay.
 * `bounds` ist {width,height} in logischen Spielpixeln.
 */
export function classifyOverlay({ bounds, canvasWidth, canvasHeight, alpha, blendMode, visible }) {
  if (visible === false) return null;
  if (!bounds || canvasWidth <= 0 || canvasHeight <= 0) return null;
  const coverage = (bounds.width * bounds.height) / (canvasWidth * canvasHeight);
  if (coverage < FULLSCREEN_COVERAGE) return null;
  const additive = blendMode === 1;
  const translucent = typeof alpha === "number" && alpha < 0.999;
  if (!additive && !translucent) return null;
  return {
    coverage: Math.round(coverage * 1000) / 1000,
    blend: blendName(blendMode),
    additive,
    translucent,
    alpha: Math.round((alpha ?? 1) * 100) / 100,
    /** Tile-GPUs zahlen Füllrate doppelt: ADD + Alpha zusammen ist der Worst Case. */
    severity: additive && translucent ? "hoch" : additive ? "mittel" : "niedrig",
  };
}

/** Prozentwerte aus FPS-/Frame-Samples, robust bei leeren Arrays. */
export function percentiles(samples, p) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] * 100) / 100;
}

/** Startzeit-Bewertung: ARM-Mittelklasse ~3-5x langsamer als Desktop. */
export function rateStartup(ms) {
  if (ms <= 1500) return "gut";
  if (ms <= 3000) return "grenzwertig";
  return "zu langsam";
}

const INIT_SCRIPT = () => {
  const audit = {
    bootStart: performance.now(),
    titleAt: 0,
    draws: 0,
    textureBinds: 0,
    textureSwitches: 0,
    lastTexture: null,
    programs: 0,
    frames: 0,
    sampleDraws: [],
    sampleSwitches: [],
    lastDraws: 0,
    lastSwitches: 0,
    lastAt: performance.now(),
  };
  window.__lfAudit = audit;
  const protos = [window.WebGLRenderingContext?.prototype, window.WebGL2RenderingContext?.prototype]
    .filter(Boolean);
  const seen = new Set();
  for (const proto of protos) {
    if (seen.has(proto)) continue;
    seen.add(proto);
    for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
      const orig = proto[name];
      if (typeof orig !== "function") continue;
      proto[name] = function wrapped(...args) {
        audit.draws++;
        return orig.apply(this, args);
      };
    }
    const bind = proto.bindTexture;
    if (typeof bind === "function") {
      proto.bindTexture = function wrappedBind(...args) {
        audit.textureBinds++;
        const tex = args[1];
        if (tex !== audit.lastTexture) {
          audit.textureSwitches++;
          audit.lastTexture = tex;
        }
        return bind.apply(this, args);
      };
    }
    for (const name of ["createProgram", "linkProgram"]) {
      const orig = proto[name];
      if (typeof orig !== "function") continue;
      proto[name] = function wrappedProgram(...args) {
        if (name === "linkProgram") audit.programs++;
        return orig.apply(this, args);
      };
    }
  }
  const tick = () => {
    const now = performance.now();
    const dt = now - audit.lastAt;
    if (audit.frames > 0) {
      audit.sampleDraws.push(audit.draws - audit.lastDraws);
      audit.sampleSwitches.push(audit.textureSwitches - audit.lastSwitches);
    }
    audit.lastDraws = audit.draws;
    audit.lastSwitches = audit.textureSwitches;
    audit.lastAt = now;
    audit.frames++;
    audit.lastFrameMs = Math.round(dt * 100) / 100;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

/**
 * Liest im Browser alle Texturen, Overlays und FX-Objekte aus.
 * Wird als page.evaluate-Funktion genutzt, daher self-contained.
 */
function collectPageAudit() {
  const game = window.__game;
  const audit = window.__lfAudit;
  const gl = game.renderer?.gl ?? null;

  const textures = [];
  try {
    for (const key of game.textures.getTextureKeys()) {
      const tex = game.textures.get(key);
      if (!tex) continue;
      let width = 0;
      let height = 0;
      const source = tex.getSourceImage?.();
      if (source) {
        width = source.width ?? source.naturalWidth ?? 0;
        height = source.height ?? source.naturalHeight ?? 0;
      } else if (tex.source?.[0]) {
        width = tex.source[0].width ?? 0;
        height = tex.source[0].height ?? 0;
      }
      textures.push({ key, width, height, frames: tex.frameTotal ?? 1 });
    }
  } catch { /* TextureManager nicht bereit */ }

  let maxTextureSize = 0;
  const extensions = [];
  let rendererName = "";
  let vendor = "";
  let precision = {};
  let contextAttributes = {};
  if (gl) {
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    for (const ext of gl.getSupportedExtensions() ?? []) extensions.push(ext);
    contextAttributes = gl.getContextAttributes() ?? {};
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    if (dbg) {
      rendererName = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "";
      vendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? "";
    }
    const fp = (type, shader) => {
      try {
        const f = gl.getShaderPrecisionFormat(type, shader);
        return f ? { rangeMin: f.rangeMin, rangeMax: f.rangeMax, precision: f.precision } : null;
      } catch {
        return null;
      }
    };
    precision = {
      fragmentHighp: fp(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT),
      fragmentMediump: fp(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT),
      vertexHighp: fp(gl.VERTEX_SHADER, gl.HIGH_FLOAT),
    };
  }

  const sceneKeys = ["run", "ui", "title", "charselect", "results", "credits", "boot"];
  const overlays = [];
  const fx = { preFXObjects: 0, postFXObjects: 0, details: [] };
  const visit = (sceneKey, obj, depth = 0) => {
    if (!obj || obj.visible === false || depth > 6) return;
    if (Array.isArray(obj.list)) {
      for (const child of obj.list) visit(sceneKey, child, depth + 1);
      return;
    }
    const pre = obj.preFX?.list?.length ?? 0;
    const post = obj.postFX?.list?.length ?? 0;
    if (pre > 0 || post > 0) {
      fx.preFXObjects += pre > 0 ? 1 : 0;
      fx.postFXObjects += post > 0 ? 1 : 0;
      fx.details.push({
        scene: sceneKey,
        type: obj.type,
        name: obj.name || obj.texture?.key || "",
        pre: pre > 0,
        post: post > 0,
      });
    }
    if (typeof obj.getBounds === "function") {
      const b = obj.getBounds();
      const alpha = obj.alpha ?? 1;
      const blendMode = obj.blendMode ?? 0;
      if (blendMode !== 0 || alpha < 0.999) {
        overlays.push({
          scene: sceneKey,
          type: obj.type,
          name: obj.name || obj.texture?.key || "",
          bounds: { width: b.width, height: b.height },
          alpha,
          blendMode,
        });
      }
    }
  };
  for (const key of sceneKeys) {
    if (!game.scene.isActive(key) && !game.scene.isPaused(key) && !game.scene.isSleeping(key)) continue;
    const scene = game.scene.getScene(key);
    if (!scene?.children) continue;
    for (const obj of scene.children.list) visit(key, obj);
  }

  const canvas = game.canvas;
  const rect = canvas.getBoundingClientRect();
  const scale = game.scale;

  return {
    boot: {
      timeToTitleMs: Math.round((window.__lfTitleAt || performance.now()) - audit.bootStart),
      texturesAtTitle: window.__lfTitleTextureCount ?? null,
      framesSampled: audit.frames,
    },
    gl: {
      present: Boolean(gl),
      renderer: rendererName,
      vendor,
      version: gl ? gl.getParameter(gl.VERSION) : "",
      shadingLanguage: gl ? gl.getParameter(gl.SHADING_LANGUAGE_VERSION) : "",
      maxTextureSize,
      maxTextureImageUnits: gl ? gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) : 0,
      extensionCount: extensions.length,
      extensions,
      contextAttributes,
      precision,
    },
    canvas: {
      attrWidth: canvas.width,
      attrHeight: canvas.height,
      logicalWidth: scale.width,
      logicalHeight: scale.height,
      cssWidth: Math.round(rect.width * 100) / 100,
      cssHeight: Math.round(rect.height * 100) / 100,
      deviceWidth: Math.round(rect.width * window.devicePixelRatio),
      deviceHeight: Math.round(rect.height * window.devicePixelRatio),
      dpr: window.devicePixelRatio,
      rendersDevicePixels: canvas.width !== scale.width || canvas.height !== scale.height,
    },
    textures,
    overlays,
    fx,
    draws: audit.draws,
    textureBinds: audit.textureBinds,
    textureSwitches: audit.textureSwitches,
    programs: audit.programs,
    sampleDraws: audit.sampleDraws.slice(-1000),
    sampleSwitches: audit.sampleSwitches.slice(-1000),
  };
}

/** Markdown-Tabellenzeilen aus dem Audit-JSON. */
export function auditTable(report) {
  const rows = [];
  rows.push("| Messpunkt | Wert | Befund |");
  rows.push("|---|---|---|");
  const g = report.gl ?? {};
  rows.push(`| GL-Renderer (SwiftShader/Emulation) | ${g.renderer || "–"} | nur Emulations-Hinweis, kein echtes Mali/Adreno |`);
  rows.push(`| MAX_TEXTURE_SIZE | ${g.maxTextureSize ?? "–"} | ${(g.maxTextureSize ?? 0) >= 2048 ? "ok" : "zu klein"} |`);
  rows.push(`| Texturen gesamt | ${report.textureSummary?.count ?? 0} | ${report.textureSummary?.oversizedCount ? "Befunde siehe unten" : "keine >2048"} |`);
  rows.push(`| Textur-Pixel / ca. VRAM | ${report.textureSummary?.pixels ?? 0} px / ${Math.round((report.textureSummary?.approxBytes ?? 0) / 1024 / 1024)} MiB | Tile-GPU: grosse Texturen kosten Bandbreite |`);
  rows.push(`| Canvas-Attribut vs. logisch | ${report.canvas?.attrWidth}×${report.canvas?.attrHeight} vs ${report.canvas?.logicalWidth}×${report.canvas?.logicalHeight} | ${report.canvas?.rendersDevicePixels ? "FAIL rendert in Geraetepixeln" : "ok, CSS skaliert"} |`);
  rows.push(`| Titel-Messung Draws/Frame | ${report.title?.drawsPerFrame ?? "–"} | ${report.title?.frames ?? 0} Frames, ${report.title?.fps ?? "–"} FPS @ CPU-Throttle ${report.cpuThrottle} |`);
  rows.push(`| Titel-Messung Texturwechsel/Frame | ${report.title?.switchesPerFrame ?? "–"} | Batching-Findings |`);
  rows.push(`| Run-Messung (300 Gegner) Draws/Frame | ${report.run?.drawsPerFrame ?? "–"} | p95 ${report.run?.drawsP95 ?? "–"} |`);
  rows.push(`| Run-Messung (300 Gegner) Texturwechsel/Frame | ${report.run?.switchesPerFrame ?? "–"} | Atlas-Potenzial |`);
  rows.push(`| Vollbild-Overlays Alpha/ADD | ${report.overlays?.count ?? 0} | ${report.overlays?.worst || "–"} |`);
  rows.push(`| preFX/postFX-Objekte | ${report.fx?.preFXObjects ?? 0} / ${report.fx?.postFXObjects ?? 0} | ${(report.fx?.preFXObjects ?? 0) + (report.fx?.postFXObjects ?? 0) ? "Befund: Shader-Pass pro Sprite" : "ok"} |`);
  rows.push(`| Startzeit bis Titel | ${report.boot?.timeToTitleMs ?? "–"} ms | ${report.boot?.startupRating ?? "–"} |`);
  return rows.join("\n");
}

export function makeReport(raw) {
  const textureSummary = summarizeTextures(raw.textures);
  const isAdditiveOrTranslucent = (o) => o.blendMode !== 0 || o.alpha < 0.999;
  const overlays = raw.overlays.flatMap((o) => {
    const classified = classifyOverlay({
      ...o,
      canvasWidth: raw.canvas.logicalWidth,
      canvasHeight: raw.canvas.logicalHeight,
    });
    return classified ? [{ ...o, ...classified }] : [];
  }).sort((a, b) => b.coverage - a.coverage);
  const overlayAll = raw.overlays.filter(isAdditiveOrTranslucent);
  const drawStats = stats(raw.sampleDraws);
  const switchStats = stats(raw.sampleSwitches);
  return {
    generatedAt: new Date().toISOString(),
    profile: raw.profile,
    cpuThrottle: raw.cpuThrottle,
    boot: { ...raw.boot, startupRating: rateStartup(raw.boot.timeToTitleMs) },
    gl: raw.gl,
    canvas: raw.canvas,
    textureSummary,
    textures: raw.textures,
    overlays: {
      count: overlayAll.length,
      fullscreen: overlays,
      worst: overlays.length
        ? `${overlays[0].severity}: ${overlays[0].scene}/${overlays[0].name || overlays[0].type} (${Math.round(overlays[0].coverage * 100)} % Flaeche, ${overlays[0].blend}${overlays[0].translucent ? ", Alpha " + overlays[0].alpha : ""})`
        : "keine Vollbild-Overlays mit Alpha/ADD",
    },
    fx: raw.fx,
    title: {
      frames: raw.titleFrames,
      fps: raw.titleFps,
      drawsPerFrame: drawStats.mean,
      drawsP95: drawStats.p95,
      drawsMax: drawStats.max,
      switchesPerFrame: switchStats.mean,
      switchesMax: switchStats.max,
    },
    run: {
      enemies: raw.runEnemies,
      frames: raw.runFrames,
      fps: raw.runFps,
      drawsPerFrame: stats(raw.runSampleDraws).mean,
      drawsP95: stats(raw.runSampleDraws).p95,
      drawsMax: stats(raw.runSampleDraws).max,
      switchesPerFrame: stats(raw.runSampleSwitches).mean,
      switchesMax: stats(raw.runSampleSwitches).max,
    },
    programs: raw.programs,
    textureBindsTotal: raw.textureBinds,
    textureSwitchesTotal: raw.textureSwitches,
    jsErrors: raw.jsErrors,
    passed:
      !raw.canvas.rendersDevicePixels &&
      raw.jsErrors.length === 0 &&
      textureSummary.oversizedCount === 0,
  };
}

function stats(samples) {
  if (!samples.length) return { mean: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    mean: Math.round((sorted.reduce((a, b) => a + b, 0) / sorted.length) * 10) / 10,
    p95: percentiles(sorted, 95),
    max: sorted[sorted.length - 1],
  };
}

async function measureWindow(page, seconds, selector) {
  return page.evaluate(
    async ({ seconds, selector }) => {
      const audit = window.__lfAudit;
      const start = performance.now();
      const startDraws = audit.draws;
      const startSwitches = audit.textureSwitches;
      const d0 = audit.sampleDraws.length;
      const s0 = audit.sampleSwitches.length;
      await new Promise((resolve) => {
        const tick = () => {
          if (performance.now() - start >= seconds * 1000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const elapsed = performance.now() - start;
      const draws = audit.sampleDraws.slice(d0);
      const switches = audit.sampleSwitches.slice(s0);
      const frames = Math.max(1, draws.length);
      return {
        selector,
        seconds,
        elapsedMs: Math.round(elapsed),
        frames: draws.length,
        fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
        drawsTotal: audit.draws - startDraws,
        drawsPerFrame: Math.round((draws.reduce((a, b) => a + b, 0) / frames) * 10) / 10,
        drawsMax: draws.length ? Math.max(...draws) : 0,
        switchesTotal: audit.textureSwitches - startSwitches,
        switchesPerFrame: Math.round((switches.reduce((a, b) => a + b, 0) / frames) * 10) / 10,
        switchesMax: switches.length ? Math.max(...switches) : 0,
        lastFrameMs: audit.lastFrameMs,
      };
    },
    { seconds, selector },
  );
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.includes("--no-build")) ensureBuild();
  mkdirSync("shots", { recursive: true });

  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({
    args: [
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: ANDROID_PROFILE.width, height: ANDROID_PROFILE.height },
    deviceScaleFactor: ANDROID_PROFILE.dpr,
    isMobile: ANDROID_PROFILE.isMobile,
    hasTouch: ANDROID_PROFILE.hasTouch,
    userAgent: ANDROID_PROFILE.userAgent,
  });
  const page = await context.newPage();
  await page.addInitScript(INIT_SCRIPT);
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") jsErrors.push(m.text());
  });

  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE_RATE });

  try {
    const navStart = Date.now();
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await waitForScene(page, "title");
    const titleAt = await page.evaluate(() => performance.now());
    const bootStart = await page.evaluate(() => window.__lfAudit.bootStart);
    await page.evaluate(() => {
      window.__lfTitleAt = performance.now();
      window.__lfTitleTextureCount = window.__game.textures.getTextureKeys().length;
    });
    const titleMeasurement = await measureWindow(page, 3, "title");
    const titleAtServer = titleAt - bootStart;

    // Run starten und 300 Gegner halten, damit Draw-Calls/Texturwechsel unter Last messbar sind.
    await page.keyboard.press("Enter");
    await waitForScene(page, "charselect");
    await page.keyboard.press("Enter");
    await waitForScene(page, "run");
    await page.waitForFunction(() => Boolean(window.__lf?.stats), { timeout: 8000 });
    for (let i = 0; i < 40; i++) {
      if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }
    await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 300));
    await page.waitForTimeout(1000);
    const enemiesNow = await page.evaluate(() => window.__lf.stats().enemies);
    const runMeasurement = await measureWindow(page, 5, "run-300");

    const raw = await page.evaluate(collectPageAudit);

    await page.screenshot({ path: "shots/m10-android-pixel7-run.png" });

    const report = makeReport({
      ...raw,
      profile: ANDROID_PROFILE,
      cpuThrottle: CPU_THROTTLE_RATE,
      boot: {
        ...raw.boot,
        timeToTitleMs: Math.round(titleAtServer),
        texturesAtTitle: await page.evaluate(() => window.__lfTitleTextureCount),
      },
      titleFrames: titleMeasurement.frames,
      titleFps: titleMeasurement.fps,
      runEnemies: enemiesNow,
      runFrames: runMeasurement.frames,
      runFps: runMeasurement.fps,
      runSampleDraws: (await page.evaluate(() => window.__lfAudit.sampleDraws.slice(-300))),
      runSampleSwitches: (await page.evaluate(() => window.__lfAudit.sampleSwitches.slice(-300))),
      jsErrors,
    });

    writeFileSync("shots/m10-android-audit.json", JSON.stringify(report, null, 2));
    console.log("\n" + auditTable(report));
    console.log(`\nJSON: shots/m10-android-audit.json`);
    console.log(`passed: ${report.passed} | JS-Fehler: ${jsErrors.length} | Oversized-Texturen: ${report.textureSummary.oversizedCount}`);
  } finally {
    await browser.close();
    server.stop();
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => {
    console.error("android-audit failed:", e);
    process.exit(1);
  });
}
