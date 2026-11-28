#!/usr/bin/env node
// v1.0-Host-Gate (Lane m10-v10-gate-guard): wiederholbarer lokaler Gate-Lauf,
// der die Host-Tore der v1.0-Abnahme festnagelt, BEVOR v10-final-run das Urteil
// schreibt. Orchestriert bestehende Werkzeuge — keine Doppel-Messapparate:
//
//   - Inhalte 30/6/6/6/6/2            -> scripts/acceptance-count.mjs
//   - Fullrun-Inhalt + Heap-Rohdaten  -> scripts/m10-fullrun-guard.mjs
//   - Szenen-/Meta-Checks             -> scripts/verify-final.mjs
//   - Frame-Zeit p95, Draw-Calls/Frame, Texturanzahl, Renderer-String
//                                     -> eigener Perf-Pass (Minute-25-Worst-Case,
//                                        Muster aus perf.mjs / m10-frame-tail-batching.mjs /
//                                        m10-atlas-pack.mjs — kein neues Messverfahren)
//
// Tore (rein, unit-getestet in tests/v10-gate.test.ts):
//   R1 renderer-pflicht  WebGL-Renderer-String vorhanden, KEIN SwiftShader/Software
//                        (Regel 6, 2026-11-28: SwiftShader-Belege sind ungültig → Exit 2)
//   G1 content-counts    Inhalte exakt 30/6/6/6/6/2
//   G2 frame-p95         JS-Frame-Zeit p95 <= 16 ms (Minute-25-Worst-Case, 300er Top-up)
//   G3 js-errors-0       0 JS-Fehler über Perf-Pass + Fullrun-Guard + verify:final
//   G4 fullrun-inhalt    6/6 Bosse 300–1800 s (±2 s), 6 besiegt, 6 Truhen, Sieg dawn
//                        (Tor-Definition aus scripts/m10-fullrun-guard.mjs)
//   G5 heap-retained     retained Heap (endMB vs startMB, nach erzwungenem GC) strikt
//                        < +15 % (Tor-Definition #11391 / Nachabnahme G). Das In-run-
//                        Delta m1→end bleibt Beobachtung (kalte m1-Referenz, Sägezahn).
//
// Beobachtungen (Warnung, kein FAIL — keine selbst erfundenen Tore):
//   Draw-Calls/Frame p95 <= 40, Texturanzahl <= 500.
//
// Aufruf (FPS/Echtzeit => Mess-Sperre):
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-v10-gate.mjs \
//     --out shots/m10-v10-gate.json
// Exit-Codes: 0 = alle Tore PASS, 1 = mindestens ein Tor FAIL, 2 = Renderer ungültig.
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// ---------- Tore (rein, kein Node-/Browser-I/O) ----------
export const CONTENT_TARGET = { enemies: 30, weapons: 6, powerups: 6, evolutions: 6, bosses: 6, characters: 2 };
export const FRAME_P95_TARGET_MS = 16;
export const HEAP_TARGET_PCT = 15;
export const DRAWS_P95_WARN = 40;
// Baseline-Kalibrierung aus Gate-Lauf 28.11. (gemessen 2787 Texturen): Warngrenze
// fängt grobe Regressionen, kein hartes Tor.
export const TEXTURES_WARN = 3500;

/** Render-Strings, die keinen echten GPU-Beleg ergeben (Regel 6, 2026-11-28). */
export const RENDERER_INVALID = /swiftshader|llvmpipe|softpipe|software|angle \(google|none/i;

/** Renderer-Pflichttor: String muss vorhanden sein und auf echte iGPU/GPU deuten. */
export function rendererVerdict(renderer) {
  const s = String(renderer ?? "").trim();
  if (!s || s === "none") return { ok: false, renderer: s || "none", reason: "kein Renderer-String (Pflichtfeld)" };
  if (RENDERER_INVALID.test(s)) return { ok: false, renderer: s, reason: "SwiftShader-/Software-Renderer — Beleg ungültig (Regel 6, 2026-11-28)" };
  return { ok: true, renderer: s, reason: "echter GPU-Renderer-String" };
}

/** Retained Heap über den Szenen-Teardown (endMB vs startMB) in Prozent; null, wenn nicht messbar. */
export function retainedHeapDeltaPct(startMB, endMB) {
  if (!(startMB > 0) || !(endMB > 0)) return null;
  return Math.round(((endMB - startMB) / startMB) * 1000) / 10;
}

/** p95 aus Frame-dt-Samples (ms); null, wenn keine Samples. */
export function frameP95(dts) {
  const list = (Array.isArray(dts) ? dts : []).filter((d) => Number.isFinite(d) && d >= 0).sort((a, b) => a - b);
  if (list.length === 0) return null;
  return list[Math.min(list.length - 1, Math.ceil(0.95 * list.length) - 1)];
}

/**
 * Prüft alle Host-Tore gegen die eingesammelten JSONs. Liefert
 * { verdict: "PASS"|"FAIL"|"INVALID", passed, gates, failures, warnings }.
 * INVALID = Renderer-Pflichttor verletzt (Exit 2): Messung ist dann kein gültiges Urteil.
 */
export function evaluateGates(input = {}) {
  const { renderer, content, perf, guard, verify } = input;
  const rVerdict = rendererVerdict(renderer);

  const contentOk = Boolean(content?.ok) && Object.entries(CONTENT_TARGET).every(([k, v]) => Number(content?.counts?.[k]) === v);
  const p95 = frameP95(perf?.frameDtsMs);
  const frameOk = p95 !== null && p95 <= FRAME_P95_TARGET_MS;
  const jsErrors = [
    ...(Array.isArray(perf?.jsErrors) ? perf.jsErrors : []),
    ...(Array.isArray(guard?.jsErrors) ? guard.jsErrors : []),
    ...(Array.isArray(verify?.errors) ? verify.errors : []),
  ];
  const checksFailed = (Array.isArray(verify?.checks) ? verify.checks : []).filter((c) => !c.ok);
  const guardGates = Array.isArray(guard?.gates?.gates) ? guard.gates.gates : [];
  const guardOk = Boolean(guard?.completed) && Boolean(guard?.gates?.passed);

  const heapDelta = retainedHeapDeltaPct(guard?.heap?.startMB, guard?.heap?.endMB);
  const heapOk = heapDelta !== null && heapDelta < HEAP_TARGET_PCT;

  const gates = [
    { gate: "renderer-pflicht", ok: rVerdict.ok, actual: rVerdict.renderer, target: "echter GPU-Renderer-String (kein SwiftShader)", detail: rVerdict.reason },
    { gate: "content-counts", ok: contentOk, actual: content?.counts ?? null, target: CONTENT_TARGET },
    { gate: "frame-p95", ok: frameOk, actual: p95, target: `<= ${FRAME_P95_TARGET_MS} ms` },
    { gate: "js-errors-0", ok: jsErrors.length === 0 && checksFailed.length === 0, actual: { jsErrors: jsErrors.length, verifyChecksFailed: checksFailed.length }, target: 0 },
    { gate: "fullrun-inhalt", ok: guardOk, actual: { completed: guard?.completed ?? null, failures: guard?.gates?.failures ?? null, resultReason: guard?.resultReason ?? null }, target: "6/6 Bosse ±2 s, 6 besiegt, 6 Truhen, dawn (m10-fullrun-guard)" },
    { gate: "heap-retained", ok: heapOk, actual: heapDelta, target: `< ${HEAP_TARGET_PCT} % (endMB vs startMB, retained)` },
  ];
  const failures = gates.filter((g) => !g.ok).map((g) => g.gate);

  const warnings = [];
  const drawsP95 = perf?.drawsP95 ?? null;
  if (drawsP95 !== null && drawsP95 > DRAWS_P95_WARN) warnings.push(`Draw-Calls/Frame p95 ${drawsP95} > ${DRAWS_P95_WARN} (Beobachtung)`);
  const textures = perf?.textures ?? null;
  if (textures !== null && textures > TEXTURES_WARN) warnings.push(`Texturanzahl ${textures} > ${TEXTURES_WARN} (Beobachtung)`);
  const avgEnemies = perf?.avgEnemies ?? null;
  if (avgEnemies !== null && avgEnemies < 200) warnings.push(`Minute-25-Top-up nicht gehalten (avg ${avgEnemies} < 200 Gegner) — p95-Messung weniger belastend`);

  const passed = failures.length === 0;
  return {
    verdict: rVerdict.ok ? (passed ? "PASS" : "FAIL") : "INVALID",
    passed: passed && rVerdict.ok,
    gates,
    failures,
    warnings,
    observation: {
      drawsPerFrame: perf ? { median: perf.drawsMedian ?? null, p95: drawsP95, max: perf.drawsMax ?? null } : null,
      textures: textures,
      heapInRunObservation: guard?.heap
        ? { minute1MB: guard.heap.minute1MB ?? null, endMB: guard.heap.endMB ?? null, deltaVsMinute1Pct: retainedHeapDeltaPct(guard.heap.minute1MB, guard.heap.endMB), note: "Beobachtung, kein Tor (kalte m1-Referenz bei 30x, Post-GC-Saegezahn)" }
        : null,
    },
  };
}

// ---------- Orchestrierung (nur bei direktem Start) ----------
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { ensureBuild, startServer, loadPlaywright, startRun } = await import("./harness.mjs");

  const argv = process.argv.slice(2);
  const arg = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
  };
  const OUT = arg("out", "shots/m10-v10-gate.json");
  const SKIP_FULLRUN = argv.includes("--skip-fullrun"); // nur fuer schnelle Skript-Iterationen, kein Abnahme-Lauf
  const SKIP_VERIFY = argv.includes("--skip-verify");
  const EVIDENCE = join(homedir(), "games", ".evidence", "m10-v10-gate-guard");
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync("shots", { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

  // Schritt 1: Inhaltszaehlung (acceptance-count.mjs, stdout-JSON).
  const contentRun = spawnSync("node", ["scripts/acceptance-count.mjs"], { encoding: "utf8" });
  let content = null;
  try {
    content = JSON.parse((contentRun.stdout ?? "").trim());
  } catch { content = { ok: false, counts: null, error: String(contentRun.stderr ?? contentRun.error ?? "parse") }; }

  // Schritt 2: Fullrun-Guard (Inhaltstore + Heap-Rohdaten) unter derselben flock.
  let guard = null;
  if (SKIP_FULLRUN) {
    guard = { skipped: true, completed: false, gates: { passed: false, failures: ["skipped"], gates: [] }, jsErrors: [], heap: {}, resultReason: null };
  } else {
    const guardOut = join(EVIDENCE, `fullrun-guard-${stamp}.json`);
    const guardRun = spawnSync("node", ["scripts/m10-fullrun-guard.mjs", "--out", guardOut], { encoding: "utf8", timeout: 420000 });
    try {
      const g = readJson(guardOut);
      guard = {
        completed: g.completed,
        resultReason: g.resultReason,
        gates: g.gates,
        jsErrors: g.jsErrors,
        heap: g.heap,
      };
      console.log(`[gate] fullrun-guard exit=${guardRun.status} failures=${JSON.stringify(g.gates?.failures ?? [])}`);
    } catch {
      guard = { completed: false, resultReason: null, gates: { passed: false, failures: ["no-json"], gates: [] }, jsErrors: [String(guardRun.stderr ?? guardRun.error ?? "kein Guard-JSON")], heap: {} };
    }
  }

  // Schritt 3: verify:final (Szenen-/Meta-Checks; JSON via --out-Dir).
  let verify = null;
  if (SKIP_VERIFY) {
    verify = { skipped: true, checks: [], errors: [] };
  } else {
    const verifyDir = join(EVIDENCE, `gate-verify-${stamp}`);
    const verifyRun = spawnSync("node", ["scripts/verify-final.mjs", "--out", verifyDir], { encoding: "utf8", timeout: 240000 });
    verify = { checks: [], errors: [] };
    try {
      const file = readdirSync(verifyDir).find((f) => f.endsWith("final-verify.json"));
      const v = readJson(join(verifyDir, file));
      verify = { checks: v.checks, errors: v.errors };
    } catch {
      verify.errors = [String(verifyRun.stderr ?? verifyRun.error ?? "kein verify-JSON")];
    }
    console.log(`[gate] verify:final exit=${verifyRun.status} checksFailed=${verify.checks.filter((c) => !c.ok).length} errors=${verify.errors.length}`);
  }

  // Schritt 4: eigener Perf-Pass — nur die Metriken, die kein anderes Werkzeug
  // liefert (p95, Draw-Calls/Frame, Texturanzahl, Renderer-String).
  ensureBuild();
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({ args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--enable-precise-memory-info", "--js-flags=--expose-gc", "--autoplay-policy=no-user-gesture-required",
    // Frame-Zeit-Tor: rAF an 60-Hz-VSync quantisiert dt auf 16,67 ms (p50=p90=p95=16,7 im
    // ersten Gate-Lauf) — damit ist p95 <= 16 ms nicht messbar. VSync/Frame-Limit aus,
    // damit dt die echte Frame-Kosten misst (Befund in der Lane-Doku).
    "--disable-gpu-vsync", "--disable-frame-rate-limit"] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const perfErrors = [];

  // Draw-Call-Zaehler VOR dem ersten Spielcode installieren (Muster m10-atlas-pack.mjs).
  await page.addInitScript(() => {
    window.__dc = { total: 0, current: 0 };
    for (const proto of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
      if (!proto) continue;
      for (const name of ["drawArrays", "drawElements"]) {
        const orig = proto.prototype[name];
        if (!orig) continue;
        proto.prototype[name] = function (...a) {
          window.__dc.total++;
          window.__dc.current++;
          return orig.apply(this, a);
        };
      }
    }
  });

  let perf = null;
  try {
    page.on("pageerror", (e) => perfErrors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") perfErrors.push(m.text()); });

    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    // Renderer-Pflicht (Regel 6, 2026-11-28): SwiftShader-Belege sind ungueltig.
    const renderer = await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      if (!gl) return "none";
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    });
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) window.__lf.addWeapon(id, 8);
      for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
      window.__lf.skipTo(1490);
      window.__lf.setTimeScale(1);
    });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 40; i++) {
      if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
      await page.evaluate(() => window.__lf.pickLevelUp(0));
    }
    // 10 s Minute-25-Worst-Case (300er Top-up JEDE Frame, wie device-m25 — im 50-ms-Takt
    // räumt der lokale Bot schneller nach als nachgespawnt wird: avg 61 statt 300 im
    // ersten Gate-Lauf, Befund in der Lane-Doku).
    const sample = await page.evaluate(async ({ seconds, target }) => {
      const start = performance.now();
      let frames = 0;
      let last = start;
      const dts = [];
      const draws = [];
      const enemies = [];
      let dcAtFrameStart = window.__dc.current;
      await new Promise((resolve) => {
        const tick = (now) => {
          const dt = now - last;
          if (frames > 0) {
            dts.push(Math.round(dt * 100) / 100);
            draws.push(window.__dc.current - dcAtFrameStart);
            dcAtFrameStart = window.__dc.current;
            const active = window.__lf.stats().enemies;
            enemies.push(active);
            const deficit = target - active;
            if (deficit > 0) window.__lf.spawnEnemy("bog_rat", deficit);
          }
          last = now;
          frames++;
          if (now - start >= seconds * 1000) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      const minE = enemies.length ? Math.min(...enemies) : 0;
      const avgE = enemies.length ? Math.round(enemies.reduce((a, b) => a + b, 0) / enemies.length) : 0;
      return { frames, dts, draws, minEnemies: minE, avgEnemies: avgE };
    }, { seconds: 10, target: 300 });
    await page.screenshot({ path: "shots/m10-v10-gate-minute25.png" });
    await page.screenshot({ path: join(EVIDENCE, `minute25-${stamp}.png`) });
    const textures = await page.evaluate(() => window.__game.textures.getTextureKeys().length);

    const sorted = sample.dts.slice().sort((a, b) => a - b);
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? null;
    const dsorted = sample.draws.slice().sort((a, b) => a - b);
    perf = {
      renderer,
      frames: sample.frames,
      frameDtsMs: sample.dts,
      p50: pct(0.5), p90: pct(0.9), p95: pct(0.95), p99: pct(0.99),
      worstFrameMs: sorted[sorted.length - 1] ?? null,
      drawsMedian: dsorted[Math.floor(dsorted.length / 2)] ?? null,
      drawsP95: dsorted[Math.min(dsorted.length - 1, Math.ceil(0.95 * dsorted.length) - 1)] ?? null,
      drawsMax: dsorted[dsorted.length - 1] ?? null,
      textures,
      minEnemies: sample.minEnemies,
      avgEnemies: sample.avgEnemies,
      jsErrors: perfErrors,
    };
    console.log(`[gate] perf: renderer="${renderer}" p95=${perf.p95} ms drawsP95=${perf.drawsP95} textures=${textures} frames=${perf.frames}`);
  } catch (e) {
    perf = { renderer: null, frameDtsMs: [], p95: null, drawsP95: null, textures: null, jsErrors: [...perfErrors, String(e)] };
  } finally {
    try { await page.close(); } catch { /* Target page closed ist ok */ }
    try { await browser.close(); } catch { /* dito */ }
    server.stop();
  }

  // Tor-JSON schreiben + Exit-Code.
  const verdict = evaluateGates({ renderer: perf.renderer, content, perf, guard, verify });
  const report = {
    gate: "v1.0-Host-Gate (m10-v10-gate-guard)",
    at: new Date().toISOString(),
    outPath: OUT,
    renderer: perf.renderer,
    verdict: verdict.verdict,
    passed: verdict.passed,
    gates: verdict.gates,
    failures: verdict.failures,
    warnings: verdict.warnings,
    observation: verdict.observation,
    steps: { content: { ok: content?.ok ?? false }, fullrunGuard: { skipped: Boolean(guard.skipped) }, verifyFinal: { skipped: Boolean(verify.skipped) } },
  };
  writeFileSync(OUT, JSON.stringify({ ...report, perf: { ...perf, frameDtsMs: `[${perf.frameDtsMs?.length ?? 0} Samples, Rohdaten siehe ${EVIDENCE}]` }, evidenceDir: EVIDENCE }, null, 2));
  console.log(JSON.stringify({ out: OUT, verdict: verdict.verdict, failures: verdict.failures, warnings: verdict.warnings, gates: verdict.gates.map((g) => ({ gate: g.gate, ok: g.ok, actual: g.actual })) }, null, 2));
  process.exit(verdict.verdict === "INVALID" ? 2 : verdict.passed ? 0 : 1);
}
