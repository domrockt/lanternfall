#!/usr/bin/env node
// M10-ground-chunk-budget (#12436): Suchskript fuer das Chunk-Install-Gate
// (Supervisor-Steer: Hand-Tuning ersetzen). Variiert Budget/Defer-Limit des
// Gates als Parameter, je Kandidat ein kurzer Walk-Harness-Lauf (Minute-25-
// Worst-Case, ArrowRight = garantierte Chunk-Grenzueberfahrten) und wertet
// automatisch aus: worstFrame-p99/worst/janky + Schwarz-Pixel-Check
// (scripts/terrain-coverage.mjs, Muster m10-terrain-hole-guard).
//
//   timeout 1700 node scripts/tune-chunk-budget.mjs
//
// HARTES ITERATIONSLIMIT: 12 Kandidaten. Danach bester Kandidat (kleinstes
// jankyPct, dann p99, dann worst; nur Kandidaten mit Chunk-Ereignissen und
// coverage-ok) einfrieren — die Konstanten werden im Quellcode gesetzt und
// der Hook bleibt ungesetzt (Produktion nutzt die Konstanten).
//
// Nur Messung/Tuning: aenderung an src/** ist NUR der __lfChunkGate-Hook.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { checkScreenshot } from "./terrain-coverage.mjs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];
const OUT = "/home/ai/games/.evidence/m10-ground-chunk-budget/tune-results.json";
const LIMIT = 12;
const SECS = 20;

// Kandidaten: Budget (ms) x Defer-Limit; dazu zwei Grenzfaelle (0 = strikt
// rationieren -> Install alle maxDefers+1 Frames; grosses Budget = Gate aus).
const CANDIDATES = [];
for (const budgetMs of [16.7, 22, 33]) {
  for (const maxDefers of [1, 3, 6]) CANDIDATES.push({ budgetMs, maxDefers });
}
CANDIDATES.push({ budgetMs: 0, maxDefers: 3 });   // Streng-Modus (Stressprobe)
CANDIDATES.push({ budgetMs: 9999, maxDefers: 3 }); // Gate faktisch aus (Referenz)

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--enable-precise-memory-info",
    "--autoplay-policy=no-user-gesture-required"],
});

const renderer = await (async () => {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  const r = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) return null;
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  await page.close();
  return r;
})();

const results = [];
const deadline = Date.now() + 25 * 60 * 1000;
for (const cand of CANDIDATES) {
  if (results.length >= LIMIT || Date.now() > deadline) break;
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
    await startRun(page);
    await page.evaluate(({ evolutions, passives, cand }) => {
      window.__lf.god(true);
      window.__lf.setSuppressLevelUps(true);
      window.__lf.autoPlay(true);
      for (const id of evolutions) window.__lf.addWeapon(id, 8);
      for (const id of passives) window.__lf.addPassive(id, 5);
      window.__lf.skipTo(1490);
      window.__lf.setTimeScale(1);
      // Kandidat setzen (Mess-Hook aus GroundRenderer):
      const hook = window.__lfChunkGate;
      hook.budgetMs = cand.budgetMs;
      hook.maxDefers = cand.maxDefers;
    }, { evolutions: EVOLUTIONS, passives: PASSIVES, cand });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 40; i++) {
      if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }

    // Kandidat gilt erst AB JETZT — der Walk misst nur den Gate-Unterschied.
    await page.evaluate((cand) => {
      window.__lf.autoPlay(false);
      window.__lfChunkGate.budgetMs = cand.budgetMs;
      window.__lfChunkGate.maxDefers = cand.maxDefers;
    }, cand);
    await page.keyboard.down("ArrowRight");
    const run = await page.evaluate(async ({ target, seconds }) => {
      const g = window.__game.scene.getScene("run").ground;
      g.debugEnableCounters();
      const start = performance.now();
      let frames = 0;
      let last = start;
      let lastSpawn = start;
      const rows = [];
      await new Promise((resolve) => {
        const tick = (now) => {
          const dt = now - last;
          let topup = 0;
          const s = g.debugStats();
          const chunks = window.__game.textures.getTextureKeys().filter((k) => k.startsWith("chunk_")).length;
          const heap = performance.memory ? performance.memory.usedJSHeapSize : -1;
          if (frames > 0) {
            if (now - lastSpawn >= 50) {
              lastSpawn = now;
              const active = window.__lf.stats().enemies;
              const deficit = target - active;
              if (deficit > 0) {
                window.__lf.spawnEnemy("bog_rat", deficit);
                topup = deficit;
              }
            }
            rows.push({ dt: Math.round(dt * 100) / 100, topup, chunks, heap,
              installs: prev ? s.readyInstalled - prev.readyInstalled : 0,
              builds: prev ? s.chunkBuilds - prev.chunkBuilds : 0 });
          }
          var prev = { readyInstalled: s.readyInstalled, chunkBuilds: s.chunkBuilds };
          last = now;
          frames++;
          if (now - start >= seconds * 1000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const total = g.debugStats();
      return { frames, rows, total, chunks: window.__game.textures.getTextureKeys().filter((k) => k.startsWith("chunk_")).length };
    }, { target: 300, seconds: SECS });
    await page.keyboard.up("ArrowRight");

    // Schwarz-Pixel-Check direkt im Walk-Endzustand (Spielfeld bewegt).
    const shot = await page.screenshot();
    const cov = checkScreenshot(shot, { width: 960 });

    const dts = run.rows.map((r) => r.dt).sort((a, b) => a - b);
    const pct = (p) => dts[Math.min(dts.length - 1, Math.ceil(p * dts.length) - 1)] ?? null;
    const res = {
      candidate: cand,
      frames: run.frames,
      p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), worst: dts[dts.length - 1],
      jankyPct: Math.round((dts.filter((d) => d > 16.9).length / dts.length) * 10000) / 100,
      installs: run.total.readyInstalled, builds: run.total.chunkBuilds,
      chunkTexAtEnd: run.chunks,
      coverageOk: cov.ok === true, maxBlackRegion: cov.maxRegion ?? null,
      jsErrors: errors,
    };
    results.push(res);
    console.log(JSON.stringify(res));
  } catch (e) {
    results.push({ candidate: cand, error: String(e) });
    console.log(JSON.stringify({ candidate: cand, error: String(e) }));
  } finally {
    await page.close().catch(() => {});
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ renderer, results, limit: LIMIT }, null, 1));
  }
}

// Bester Kandidat: nur mit Chunk-Ereignissen und coverage-ok, dann janky -> p99 -> worst.
const valid = results.filter((r) => r.p99 !== undefined && r.installs > 0 && r.coverageOk && (r.jsErrors?.length ?? 0) === 0);
const best = valid.length
  ? [...valid].sort((a, b) => a.jankyPct - b.jankyPct || a.p99 - b.p99 || a.worst - b.worst)[0]
  : null;
const verdict = {
  renderer,
  limit: LIMIT,
  ran: results.length,
  validCount: valid.length,
  best: best?.candidate ?? null,
  bestMetrics: best ? { jankyPct: best.jankyPct, p99: best.p99, worst: best.worst, installs: best.installs, coverageOk: best.coverageOk } : null,
  abort: valid.length === 0 ? "kein gueltiger Kandidat (Coverage/Chunk-Ereignisse/JS-Fehler)" : null,
};
writeFileSync(OUT, JSON.stringify({ ...verdict, candidates: results }, null, 1));
console.log("VERDICT", JSON.stringify(verdict));
await browser.close();
process.exit(0);
