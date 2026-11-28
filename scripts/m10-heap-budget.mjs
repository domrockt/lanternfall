#!/usr/bin/env node
// Heap-Budget-Messung (Lane m10-heap-budget, Karte #6238/#6239):
// 30-min-Echtzeitlauf (timeScale 1, AutoPlay, God) mit
//   - WebGL-Renderer-String (PFLICHT — SwiftShader-Belege sind ungueltig),
//   - Heap-Timeline je Sim-Minute (Post-GC, 3x GC + Minimum),
//   - Peak je Sim-Minute (roh, ohne erzwungenes GC),
//   - endMB nach erzwungenem GC im Run-Ende (Results-Szene),
//   - weicher Beobachtungswert: Peak je 5-min-Fenster.
//
// Tor-Definition (Karte #6239, Fall A — GC-Saegezahn-fest, nicht Peak-Jitter):
//   HARD: endMB (nach erzwungenem GC, Run-Ende) - Minute 1 <= +15 %
//   SOFT (Beobachtung): max Peak je 5-min-Fenster <= Minute 1 + 25 %
// Begruendung: endMB unter Minute-1 in den Altmessungen (31,9 -> 38,6 MB,
// endMB 27,1) ist GC-Saegezahn, kein monotoner Leak; nach Scene-Teardown
// gehaltener Heap ist der eigentliche Leak-Signalgeber (Zustandssprung
// Minute 1 vs. Minute 29 waere mit legitimer Spielstaerke konfundiert).
//
// Mess-Retry (diese Lane, K2 — Befund Nachabnahme F + m10-heap-gate-recovery):
//   Der Chromium-Renderer stirbt gelegentlich MITTEN im 30-min-Lauf
//   ("Target page, context or browser has been closed"); Playwright wirft den
//   Fehler erst beim naechsten page.*/CDP-Aufruf (page.on("crash") bleibt leer,
//   siehe Belege in docs/lanes/m10-heap-gate-retry.md). Nach Target-Tod bleibt
//   kein valider Teilbeleg (Minute-1-Referenz + endMB gehoeren zum selben
//   Lauf) — deshalb wird der GESAMTE Messversuch (Browser-Neustart + Lauf)
//   wiederholt: max. 1 + 2 Retries. Scheitern alle Versuche, wird EINDEUTIG
//   verdict=UNMESSBAR mit Ursachefeld (gate.cause, Fehlerklasse) geschrieben,
//   statt nur eines Halbsatzes im Log. Die Tor-Definition in
//   m10-heap-budget-gate.mjs bleibt UNANGETASTET (tests/heap-budget.test.ts).
//
// Aufruf:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-heap-budget.mjs \
//     --out shots/m10-heap-budget-before.json
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { evaluateHeapGate } from "./m10-heap-budget-gate.mjs";

const strArg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const numArg = (name, fallback) => {
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return Number(inline.slice(name.length + 3));
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};

const MINUTES = Math.max(1, Math.min(30, Math.floor(numArg("minutes", 30))));
const OUT = strArg("out", "shots/m10-heap-budget-before.json");
const POLL_MS = 500;
const RUN_SECONDS = MINUTES * 60;
// F2 (m10-reacceptance-d): Der Endboss spawnt bei 30:00 (FINAL_BOSS_AT,
// src/logic/scaling.ts). Baseline brach hier exakt ab (simSeconds 1800,8,
// victory=false) — der Sieg-Pfad hatte im Echtzeitlauf nie Kampfzeit. Nach dem
// 30-min-Budget warten wir bis zu dieser Verlaengerung auf den Endboss-Tod
// (Sieg -> Morgendaemmerung -> Results); der Echtzeit-Kampf dauert ~40 s
// (K1-Probe), 600 s sind Reserve fuer Phasen-3-Verzoegerung.
const BOSS_GRACE_SECONDS = 600;

// --- Mess-Retry (K2, exportiert fuer tests/heap-budget-retry.test.ts) ---

// Gesamtversuche: 1 + 2 Retries (Briefing K2: "begrenzte Versuche, z. B. 2 Retries").
export const MEASUREMENT_ATTEMPTS = 3;

/**
 * Fehlerklasse eines Messfehlers (K2). Beide historischen Crashes waren
 * "Target page, context or browser has been closed" (waitForTimeout bzw.
 * page.evaluate) — Klasse "target-closed".
 */
export function classifyError(msg) {
  const s = String(msg ?? "");
  if (/target\s+(page|context|browser|closed)|has been closed|session closed|target closed/i.test(s)) return "target-closed";
  if (/cdp|detached/i.test(s)) return "cdp-detached";
  if (/timeout.*exceeded|timed?\s*out/i.test(s)) return "timeout";
  return "other";
}

/** Nur diese Klassen rechtfertigen einen Neustart der Messung (K2). */
export const RETRYABLE_CLASSES = new Set(["target-closed", "cdp-detached", "timeout"]);
export function isRetryable(msg) {
  return RETRYABLE_CLASSES.has(classifyError(msg));
}

/**
 * Fuehrt `fn(attempt)` mit begrenzten Versuchen aus (Muster: harness.mjs
 * startServer, B5). Bei retryable Fehler wiederholt; nach Erschoepfung oder
 * bei nicht-retryable Fehler wird der letzte Fehler geworfen. `onRetry`
 * erhaelt (attempt, klasse, fehler) fuer das Versuchs-Protokoll.
 */
export async function withRetry(fn, { attempts = MEASUREMENT_ATTEMPTS, onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt === attempts || !isRetryable(e)) break;
      onRetry?.(attempt, classifyError(String(e)), e);
    }
  }
  throw lastErr;
}

/**
 * Ursachenfeld fuer das UNMESSBAR-Urteil (K2): statt Halbsatz im Log wird
 * gate.cause gesetzt — Fehlerklasse + gekuerzte Meldung + Versuchsprotokoll.
 */
export function buildCause(fatalMsg, attemptsLog = []) {
  const cls = classifyError(fatalMsg);
  const tries = attemptsLog.length
    ? ` Versuche: ${attemptsLog.map((a) => `#${a.attempt}:${a.errorClass}`).join(" ")};`
    : "";
  // tatsaechliche Versuchszahl: Retry-Eintraege + der letzte, der hier ankommt
  const used = attemptsLog.length + 1;
  return `UNMESSBAR nach ${used} Versuch${used === 1 ? "" : "en"} — Fehlerklasse ${cls},${tries} Ursache: ${String(fatalMsg).slice(0, 200)}`;
}

// --- eigentliche Messung (ein Gesamtversuch) ---

async function measureOnce({ chromium, port, attempt }) {
  // gleiche Flags wie realtime-run.mjs (disable-dev-shm-usage: /dev/shm 64 MB,
  // --expose-gc: erzwungenes GC fuer die Post-GC-Messung).
  const userDataDir = `${process.env.HOME}/tmp/m10-heap-budget/chrome-${process.pid}-${Date.now()}-${attempt}`;
  mkdirSync(userDataDir, { recursive: true });
  const browser = await chromium.launchPersistentContext(userDataDir, {
    args: ["--disable-dev-shm-usage", "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
      "--enable-precise-memory-info", "--js-flags=--expose-gc",
      "--autoplay-policy=no-user-gesture-required"],
    viewport: { width: 960, height: 540 },
  });
  try {
    const page = browser.pages()[0] ?? await browser.newPage();
    const errors = [];
    const crashes = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    page.on("crash", () => crashes.push({ at: new Date().toISOString() }));

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("HeapProfiler.enable");
    // Eine einzelne GC-Messung streut um 1-3 MB (Befund realtime-run.mjs):
    // dreimal sammeln, Minimum nehmen = tatsaechlich gehaltener Heap.
    const heapOnce = async () => {
      await cdp.send("HeapProfiler.collectGarbage");
      return page.evaluate(() => {
        if (typeof globalThis.gc === "function") globalThis.gc();
        return Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10;
      });
    };
    const heapGC = async () => {
      let best = await heapOnce();
      for (let i = 0; i < 2; i++) {
        const v = await heapOnce();
        if (v < best) best = v;
      }
      return best;
    };

    // Renderer-String (eigener Offscreen-GL-Kontext, gleiche GPU) — wie
    // m10-vfx-restore.mjs. PFLICHT: ohne echten GPU-Renderer ist der Beleg ungueltig.
    await page.goto(`http://127.0.0.1:${port}/?debug=1&seed=99`);
    const renderer = await page.evaluate(() => {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      if (!gl) return { renderer: "none", vendor: "none" };
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      return {
        renderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
        vendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR)),
      };
    });

    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true);
      window.__lf.autoPlay(true);
      window.__lf.setTimeScale(1);
    });

    const started = Date.now();
    let lastHeapPollMinute = -1;
    let victory = false;
    let resultReason = null;
    let simSeconds = 0;
    let truncated = false;
    let fatal = null;            // Browser-/Renderer-Tod o. ae.: partielles JSON schreiben
    let minute1 = null;          // Post-GC bei Sim-Minute 1 (Tor-Referenz)
    let endMB = null;
    const timeline = [];         // { minute, jsMB } Post-GC je Sim-Minute
    const minutePeaks = [];      // { minute, peakMB } roher Peak (ohne GC)
    let curPeak = 0;
    let curMinute = 0;
    const fpsSamples = [];

    const round1 = (x) => Math.round(x * 10) / 10;

    try {
      while (Date.now() - started < (RUN_SECONDS + 300) * 1000) {
        await page.waitForTimeout(POLL_MS);
        const s = await page.evaluate(() => {
          const st = window.__lf.stats();
          return {
            time: st?.time ?? null,
            scene: st?.scene ?? null,
            fps: Number.isFinite(st?.fps) ? st.fps : null,
            rawMB: Math.round(((performance.memory?.usedJSHeapSize ?? 0) / 1048576) * 10) / 10,
          };
        });
        if (!s || s.scene !== "run") {
          if (s?.scene === "results") {
            const r = await page.evaluate(() => {
              const scene = window.__game.scene.getScene("results");
              return { reason: scene.result?.reason ?? null };
            });
            victory = r.reason === "dawn";
            resultReason = r.reason;
            break;
          }
          continue;
        }
        simSeconds = s.time;
        const minute = Math.floor(s.time / 60);
        while (curMinute < minute) {
          minutePeaks.push({ minute: curMinute, peakMB: round1(curPeak) });
          curPeak = 0;
          curMinute++;
        }
        curPeak = Math.max(curPeak, s.rawMB);
        // Mindestens einmal pro Sim-Minute Post-GC samplen; Minute 1 ist die
        // Tor-Referenz. GC-Polls zaehlen nicht als FPS-Samples (Kosten verfaelscht).
        if (minute >= 1 && minute > lastHeapPollMinute) {
          lastHeapPollMinute = minute;
          const jsMB = await heapGC();
          timeline.push({ minute, jsMB });
          if (minute === 1) minute1 = jsMB;
          continue;
        }
        if (s.time > 10 && s.fps !== null) fpsSamples.push(s.fps);
        // F2: erst nach RUN_SECONDS + BOSS_GRACE_SECONDS truncieren — dazwischen
        // laeuft der Endboss-Kampf in Echtzeit weiter, bis Results (Sieg) erreicht
        // ist (Break oben ueber scene !== "run").
        if (s.time >= RUN_SECONDS + BOSS_GRACE_SECONDS) { truncated = true; break; }
      }
      // letzten Teil-Minuten-Peak flushen
      minutePeaks.push({ minute: curMinute, peakMB: round1(curPeak) });

      // endMB: nach erzwungenem GC im Run-Ende (Results-Szene bei vollem Lauf,
      // sonst letzter Run-Zustand). Scene-Teardown + GC = Leak-Signalgeber.
      try {
        endMB = await heapGC();
      } catch (e) {
        fatal = fatal ?? String(e);
      }
    } catch (e) {
      // Renderer-/Browser-Tod: partielles Ergebnis mit Belegen zurueckgeben
      // (wie realtime-run.mjs). K2: der Gesamtversuch wird oben wiederholt,
      // falls der Fehler retryable ist — kein valider Teilbeleg bleibt uebrig.
      fatal = fatal ?? String(e);
      try { endMB = await heapGC(); } catch { endMB = null; }
    }

    const fpsSorted = [...fpsSamples].sort((a, b) => a - b);
    const fps = fpsSorted.length
      ? { min: round1(fpsSorted[0]), median: round1(fpsSorted[Math.floor(fpsSorted.length / 2)]), samples: fpsSorted.length }
      : { min: null, median: null, samples: 0 };

    return {
      startedAt: new Date(started).toISOString(),
      renderer, victory, resultReason, truncated, simSeconds: round1(simSeconds),
      minute1, timeline, minutePeaks, fps, errors, crashes, fatal,
    };
  } finally {
    // Haertung (Karte m10-heap-regression-fix K4): Nach "Target page closed"
    // darf das Aufräumen nicht noch den Fehler des Laufs entwerten.
    try { await browser.close(); } catch (e) { console.log(`browser.close ignoriert: ${e}`); }
  }
}

// --- main: Server 1x, Messversuch mit Retry (K2), JSON + Tor ---

async function main() {
  const gitSha = (() => {
    try { return execSync("git rev-parse --short HEAD").toString().trim(); }
    catch { return "unknown"; }
  })();

  ensureBuild();
  mkdirSync("shots", { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await startServer();

  const attemptsLog = [];   // [{ attempt, errorClass, message }]
  let measure = null;
  let fatal = null;

  // K2: bei Target-Tod (Renderer stirbt mitten im Lauf) wird der GESAMTE
  // Messversuch neu angesetzt — Minute-1-Referenz und endMB muessen aus dem
  // selben Lauf stammen, ein Teilbeleg ist kein Tor-Beleg. Begrenzt auf
  // MEASUREMENT_ATTEMPTS (1 + 2 Retries); danach eindeutiges UNMESSBAR.
  try {
    await withRetry(
      async (attempt) => {
        measure = await measureOnce({ chromium, port: server.port, attempt });
        fatal = measure.fatal;
        if (fatal != null && isRetryable(fatal)) {
          throw new Error(fatal); // Retryable -> withRetry startet den Versuch neu
        }
        return measure;
      },
      {
        attempts: MEASUREMENT_ATTEMPTS,
        onRetry: (attempt, cls, e) => {
          attemptsLog.push({ attempt, errorClass: cls, message: String(e).slice(0, 200) });
          console.log(`[m10-heap-budget] Versuch ${attempt} scheiterte (Klasse ${cls}), Neustart der Messung (Retry ${attempt}/${MEASUREMENT_ATTEMPTS - 1}): ${String(e).slice(0, 120)}`);
        },
      },
    );
  } catch (e) {
    // Erschoepft oder nicht-retryable: letzer Fehler bleibt als fatal stehen.
    fatal = fatal ?? String(e);
  }

  // K2: ein Lauf ist nur dann ein valider Tor-Beleg, wenn er vollstaendig
  // durchgelaufen ist (kein fatal, nicht truncated, Sieg ODER Sim-Zeit
  // erreicht das Budget). Ansonsten EINDEUTIG UNMESSBAR mit Ursachefeld —
  // ein PASS/FAIL auf Teilbeleg wuerde den Tor-Vertrag verletzen (Review K2).
  const runComplete = measure != null
    && measure.fatal == null
    && !measure.truncated
    && (measure.victory || measure.simSeconds >= RUN_SECONDS);

  const gate = evaluateHeapGate({
    minute1MB: runComplete ? measure.minute1 : null,
    endMB: runComplete ? measure.endMB : null,
    minutePeaks: measure?.minutePeaks ?? [],
  });
  gate.fatal = fatal;
  if (!runComplete) {
    // K2: eindeutige Ursache statt Halbsatz im Log. Die Tor-Definition in
    // m10-heap-budget-gate.mjs bleibt unangetastet (verdict kommt aus der
    // Gate-Funktion via minute1MB/endMB = null -> "UNMESSBAR").
    gate.cause = fatal != null
      ? buildCause(fatal, attemptsLog)
      : `UNMESSBAR nach ${attemptsLog.length + 1} Versuch(en) — Lauf unvollstaendig (truncated=${measure?.truncated ?? false}, simSeconds=${measure?.simSeconds ?? 0} von ${RUN_SECONDS} s, victory=${measure?.victory ?? false}), kein valider Tor-Beleg`;
  }

  const out = {
    script: "scripts/m10-heap-budget.mjs",
    lane: "m10-heap-budget",
    gitSha,
    startedAt: measure?.startedAt ?? new Date().toISOString(),
    endedAt: new Date().toISOString(),
    minutes: MINUTES,
    attempts: attemptsLog,
    renderer: measure?.renderer ?? { renderer: "none", vendor: "none" }, // PFLICHT
    victory: measure?.victory ?? false,
    resultReason: measure?.resultReason ?? null,
    truncated: measure?.truncated ?? false,
    simSeconds: measure?.simSeconds ?? 0,
    minute1MB: measure?.minute1 ?? null,
    timeline: measure?.timeline ?? [],
    minutePeaks: measure?.minutePeaks ?? [],
    windowPeaks: gate.windowPeaks,
    fps: measure?.fps ?? { min: null, median: null, samples: 0 },
    errors: measure?.errors ?? [],
    crashes: measure?.crashes ?? [],
    gate,
    fatal,
  };
  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");
  if (gate.cause) console.log(`UNMESSBAR (partielles JSON geschrieben): ${gate.cause}`);
  else if (fatal) console.log(`FATAL (partielles JSON geschrieben): ${fatal}`);
  // Karte m10-heap-softprint K1: Konsolen-Print zeigt das ROBUSTE Urteil
  // (gate.softFloorVerdict, Floor je 5-min-Fenster) statt des rohen
  // softVerdict (F1-GC-Saegezahn-Spitzen erzeugten Fehl-FAILs wie +41,5 %).
  // Die Rohpeaks bleiben als Beobachtung im JSON (gate.windowPeaks) und hier
  // als Zusatzfeld sichtbar — die Gate-Logik in m10-heap-budget-gate.mjs ist
  // unveraendert.
  console.log(`${OUT}: gate=${gate.verdict} (endMB ${gate.endMB} MB vs Minute1 ${gate.minute1MB} MB = ${gate.endDeltaPct} %, Tor <= +${gate.gatePct} %), soft=${gate.softFloorVerdict} (maxWindowFloor ${gate.maxWindowFloorMB} MB = ${gate.maxWindowFloorPct} % vs Floor Fenster 0 ${gate.softReferenceMB} MB, Tor <= +${gate.softPct} %; Rohpeak-Beobachtung: maxWindowPeak ${gate.maxWindowPeakMB} MB = ${gate.maxWindowPeakPct} %), renderer=${out.renderer.renderer}, errors=${out.errors.length}, victory=${out.victory}`);
  // Review K2 (kritisch): ohne explizites Ende haengt Node am lebenden
  // http.server-Child (startServer liefert stop(), das vorher nie gerufen
  // wurde) und haette flock /home/ai/games/.lf-perf.lock dauerhaft.
  try { server.stop(); } catch { /* schon tot */ }
  process.exit(0);
}

// Guard-Test-faehig (K2/K3): Import durch vitest fuehrt main() nicht aus.
const isMain = process.argv[1] != null
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) await main();
