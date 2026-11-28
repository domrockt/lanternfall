#!/usr/bin/env node
// Lane m10-loading-screen (K4): Ladescreen + Pop-in-Belege, lokal (Galaxy-Tab-Emulation).
//
//   node scripts/m10-loading-screen.mjs [--out <evidence-dir>] [--runs 2]
//     [--shots-abnahme shots/abnahme] [--tag after]
//
// Läufe: #1 = Serie (CDP-Screencast, ~10 fps, echte Zeitstempel — zeigt Loading-
// Balken und Übergänge), #2 = Clean (keine Aufzeichnung im Boot/Run-Fenster,
// nur readyMs + Run-Frame-Timings, denn Screencast/Screenshots verfälschen Frames).
//
// Misst pro Lauf:
//  - Zeit bis "bereit" (erster gerendertes Titel-Frame, Ziel < 3 s — Geraetemessung folgt nach Merge),
//  - Pop-in-Proxy: Textur-/Glyphen-Zuwachs nach dem Titel (Muss 0 sein — alles im Warmup),
//  - Run-Start: State-Sofort-Snapshot (Timer 00:00, 0 Gegner = Start-Gate K3) + rAF-Frame-Timings.
// Kein flock: kein FPS-Echtzeit-Langlauf, nur 3-s-Fenster nach Start (lanes/common.md).
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const argv = process.argv.slice(2);
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const outDir = opt("out", join(process.env.HOME ?? "/home/ai", "games/.evidence/m10-loading-screen"));
const abnahmeDir = opt("shots-abnahme", "shots/abnahme");
const runs = Number(opt("runs", "2"));
const tag = opt("tag", "after");

ensureBuild();
mkdirSync(outDir, { recursive: true });
mkdirSync(abnahmeDir, { recursive: true });
const server = await startServer();
const { chromium } = await loadPlaywright();

// Galaxy-Tab-Emulation (Tablet, dpr 2, Touch) — Dom-Zielgeraet genahert.
const contextOpts = {
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

const results = [];
const jsErrors = [];

try {
  const browser = await chromium.launch();
  for (let i = 0; i < runs; i++) {
    const seriesRun = i === 0; // Lauf 2 = Clean (kein Screencast im Messfenster)
    const context = await browser.newContext(contextOpts);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

    // rAF-Frame-Timings ab Navigation (Run-Start-Fenster wird am Ende ausgewertet).
    await page.addInitScript(() => {
      window.__lfFrames = [];
      const loop = (t) => {
        window.__lfFrames.push(t);
        if (window.__lfFrames.length > 40000) window.__lfFrames.shift();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    // CDP-Screencast: echte Frames mit Zeitstempel, ohne Blockierung der Seite.
    const cdp = await context.newCDPSession(page);
    const frames = [];
    let castActive = false;
    if (seriesRun) {
      cdp.on("Page.screencastFrame", async (f) => {
        frames.push({ data: f.data, ts: f.metadata.timestamp });
        try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }); } catch { /* egal */ }
      });
      await cdp.send("Page.startScreencast", {
        format: "jpeg", quality: 60, everyNthFrame: 6, maxWidth: 640, maxHeight: 400,
      });
      castActive = true;
    }

    const navTs = Date.now() / 1000; // grob, ts-Skala = Sekunden seit Epoch
    await page.goto(`http://127.0.0.1:${server.port}/?seed=123&run=${i + 1}`, { waitUntil: "commit" });

    await page.waitForFunction(
      () => Boolean(window.__lf) && window.__lf.state().scene === "title",
      null, { timeout: 20000, polling: "raf" },
    );
    const atTitle = await page.evaluate(() => ({
      titleRendered: window.__bootTimings?.titleRendered ?? null,
      loadingDone: window.__bootTimings?.loadingDone ?? null,
      loadingStart: window.__bootTimings?.loadingStart ?? null,
      tasks: window.__bootTimings?.tasks ?? [],
      textures: window.__game.textures.getTextureKeys().length,
      atlas: window.__game.textures.exists("runtime_atlas"),
      glyphCalls: window.__lfText?.ensureGlyphCalls ?? -1,
    }));

    // Pop-in-Proxy: 2 s nach Titel darf NICHTS mehr erzeugt werden.
    await page.waitForTimeout(2000);
    const settled = await page.evaluate(() => ({
      textures: window.__game.textures.getTextureKeys().length,
      glyphCalls: window.__lfText?.ensureGlyphCalls ?? -1,
    }));

    // Run starten (deterministisch ueber die Szenen-API; CharSelect-Flow ist Touch-UI).
    await page.evaluate(() => {
      window.__lfFrames = []; // Frame-Fenster neu starten
      window.__game.scene.getScene("title").scene.start("run", { character: "mira", seed: 123, debug: true });
    });
    await page.waitForFunction(
      () => Boolean(window.__lf) && window.__lf.state().scene === "run",
      null, { timeout: 10000, polling: "raf" },
    );
    // Sofort-Snapshot: Timer muss bei 00:00 stehen, 0 Gegner (Start-Gate K3).
    const runStartImmediate = await page.evaluate(() => {
      const s = window.__lf.state();
      const run = window.__game.scene.getScene("run");
      return { time: s.time, enemies: s.enemies, gated: Boolean(run.startGate || run.freezeGate) };
    });
    await page.waitForTimeout(3000);
    const runState = await page.evaluate(() => {
      const s = window.__lf.state();
      const frames = window.__lfFrames;
      const deltas = [];
      for (let k = 1; k < frames.length; k++) deltas.push(frames[k] - frames[k - 1]);
      deltas.sort((a, b) => a - b);
      const p = (q) => (deltas.length ? Math.round(deltas[Math.floor(q * (deltas.length - 1))] * 10) / 10 : -1);
      return {
        time: s.time, enemies: s.enemies, fps: s.fps,
        frames: deltas.length, maxFrameMs: deltas.length ? Math.round(deltas[deltas.length - 1] * 10) / 10 : -1,
        p95FrameMs: p(0.95), p99FrameMs: p(0.99),
        hitchFramesOver33ms: deltas.filter((d) => d > 33).length,
      };
    });
    const readyMs = atTitle.titleRendered ?? -1;

    // Serie speichern (nur Serie-Lauf): Frames mit Offset-ms relativ zur Navigation.
    let bootCount = 0;
    let runCount = 0;
    if (seriesRun) {
      await cdp.send("Page.stopScreencast").catch(() => {});
      castActive = false;
      const sorted = frames.slice().sort((a, b) => a.ts - b.ts);
      let loadingShot = null;
      for (const f of sorted) {
        const offsetMs = Math.round((f.ts - navTs) * 1000);
        if (offsetMs < 0) continue;
        // Loading-Beleg: Frame mitten in der Ladephase. Domain: offsetMs (Epoch)
        // ≈ performance.now() der Seite (Seite startet bei der Navigation).
        if (atTitle.loadingStart !== null && offsetMs >= atTitle.loadingStart && offsetMs <= atTitle.loadingDone) {
          loadingShot = { offsetMs, data: f.data };
        }
        if (offsetMs <= (atTitle.titleRendered ?? 0) + 3000) {
          writeFileSync(join(outDir, `boot-${String(Math.round(offsetMs / 100)).padStart(3, "0")}.jpg`), Buffer.from(f.data, "base64"));
          bootCount++;
        } else if (offsetMs <= (atTitle.titleRendered ?? 0) + 9000) {
          writeFileSync(join(outDir, `run-${String(Math.round(offsetMs / 100)).padStart(3, "0")}.jpg`), Buffer.from(f.data, "base64"));
          runCount++;
        }
      }
      // Abnahme-Bilder: Loading mit Balken, Titel, erster Run-Frame.
      if (loadingShot) {
        writeFileSync(join(abnahmeDir, `m10-loading-screen-loading-${tag}.jpg`), Buffer.from(loadingShot.data, "base64"));
      }
      const titleFrame = sorted.filter((f) => (f.ts - navTs) * 1000 >= (atTitle.titleRendered ?? 1e9) + 200)[0];
      const runFrame = sorted.filter((f) => (f.ts - navTs) * 1000 >= (atTitle.titleRendered ?? 1e9) + 4200)[0];
      if (titleFrame) writeFileSync(join(abnahmeDir, `m10-loading-screen-title-${tag}.jpg`), Buffer.from(titleFrame.data, "base64"));
      if (runFrame) writeFileSync(join(abnahmeDir, `m10-loading-screen-runstart-${tag}.jpg`), Buffer.from(runFrame.data, "base64"));
      console.log(`[m10-loading-screen] Serie: ${bootCount} Boot-Frames, ${runCount} Run-Frames, Loading-Beleg ${loadingShot ? "ok" : "FEHLT"}`);
    }


    results.push({
      run: i + 1,
      mode: seriesRun ? "series" : "clean",
      seriesCounts: seriesRun ? { boot: bootCount, run: runCount } : null,
      readyMs,
      loading: {
        start: atTitle.loadingStart, done: atTitle.loadingDone,
        tasks: atTitle.tasks,
        taskTotalMs: Math.round((atTitle.tasks ?? []).reduce((a, b) => a + b.ms, 0)),
      },
      popin: {
        texturesAtTitle: atTitle.textures, texturesSettled: settled.textures,
        textureGrowth: settled.textures - atTitle.textures,
        glyphCallsAtTitle: atTitle.glyphCalls, glyphCallsSettled: settled.glyphCalls,
        glyphGrowth: settled.glyphCalls - atTitle.glyphCalls,
      },
      atlas: atTitle.atlas,
      runStartImmediate,
      runStart: runState,
      errors,
    });
    jsErrors.push(...errors);
    console.log(`[m10-loading-screen] Lauf ${i + 1} (${seriesRun ? "serie" : "clean"}): bereit ${readyMs} ms, Texturen ${atTitle.textures}->${settled.textures} (Zuwachs ${settled.textures - atTitle.textures}), Glyphen-Zuwachs ${settled.glyphCalls - atTitle.glyphCalls}, Run-Sofort t=${runStartImmediate.time}s enemies=${runStartImmediate.enemies}, maxFrame ${runState.maxFrameMs} ms, Fehler ${errors.length}`);
    await context.close();
  }
  await browser.close();
} finally {
  server.stop();
}

const ready = results.filter((r) => r.readyMs).map((r) => r.readyMs);
const clean = results.find((r) => r.mode === "clean") ?? results[0];
const summary = {
  tag,
  generatedAt: new Date().toISOString(),
  emulation: { viewport: "1280x800", dpr: 2, isMobile: true, hasTouch: true },
  gate: { readyTargetMs: 3000, popinGrowthAllowed: 0 },
  readyMs: { min: Math.min(...ready), max: Math.max(...ready), values: ready },
  allReadyUnder3s: ready.every((ms) => ms < 3000),
  zeroPopin: results.every((r) => r.popin.textureGrowth === 0 && r.popin.glyphGrowth === 0),
  atlasComplete: results.every((r) => r.atlas === true),
  runStartImmediate: clean?.runStartImmediate ?? null,
  runStartClean: clean ? clean.runStart : null,
  jsErrors: jsErrors.length,
  results,
};
const jsonPath = join(outDir, `m10-loading-screen-${tag}.json`);
writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
console.log(`[m10-loading-screen] Summary: ${jsonPath}`);
console.log(`[m10-loading-screen] Gate: ready<3s=${summary.allReadyUnder3s} zeroPopin=${summary.zeroPopin} atlas=${summary.atlasComplete} jsErrors=${summary.jsErrors}`);
if (!summary.zeroPopin || !summary.atlasComplete || jsErrors.length > 0) process.exitCode = 1;
