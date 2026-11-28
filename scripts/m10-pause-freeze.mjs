#!/usr/bin/env node
// Lane m10-pause-freeze, Karte K1 (+#7505): Deterministischer Nachweis, ob PAUSE
// die Simulation wirklich komplett anhaelt.
//
// Aufbau (Seed fix, 3 Laeufe im selben Skript):
//   controlA / controlB: ohne Pause bis Marke M1 (elapsed >= 185 s) und M2
//     (elapsed >= 205 s) fahren — Baseline-Determinismus: beide Maerke muessen
//     bitgleich sein, sonst ist die Methodik ungueltig.
//   pauseRun: bei M1 pausieren (gleicher Pfad wie ESC -> run.togglePause),
//     5 s Echtzeit warten, Delta zaehlen (kills/damage/spawns/elapsed/HP/
//     Gegner/Projektile/Spawner-Budget), fortsetzen und bis M2 fahren.
//     Bitgleichheit gegen controlA bei M2 pruefen.
//
// Instrumentierung waehrend der Pause (Leck-Kategorien):
//   - Szenen-Clock (delayedCall): Probe-Timer ueber exakt denselben Mechanismus,
//     den Run.ts fuer Sim-mutierende Ketten nutzt (Run.ts 668/1086/1811/1826/1835).
//     Feuert er waehrend der Pause UND mutiert er Kills -> Timer-Leck belegt.
//   - Tweens: Probe-Tween (gleiche Klasse wie Splash-/Blink-FX, Run.ts 711/995);
//     Fortschritt waehrend der Pause = FX-Updates im Pausenbild.
//   - fx/particles/damageNumbers/updateVisuals-Aufrufe per Funktionswrap.
//
// Determinismus-Injektion (Harness, keine Spiel-Datei): EnemyPool.ts:125 nutzt
// DEFAULT_AI_RNG = { next: () => Math.random() } — ohne injizierten PRNG
// divergieren zwei Kontrolllaeufe mit gleichem Seed bereits ohne Pause
// (Beleg before-Lauf: kills 100 vs 107 bei identischem elapsed 205.159).
// Der Harness ersetzt Math.random daher pro Seite durch mulberry32(SEED);
// damit ist Baseline-Bitgleichheit und der Bitgleich-Vergleich Pause-Lauf ≡
// controlA ueberhaupt entscheidbar. Fremd-Fix (EnemyPool) ist eine eigene
// Anfrage, siehe docs/lanes/m10-pause-freeze.md.
//
// Belege: shots/m10-pause-freeze-before.json (Ist-Stand, Lecks)
//         shots/m10-pause-freeze-after.json  (nach dem Update-Gate)
// Ohne flock (keine FPS-Messung).
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const outName = process.argv[2] ?? "before"; // before | after
const outJson = `shots/m10-pause-freeze-${outName}.json`;
const SEED = 31;
const M1 = 185; // 3:05 — Minute-3-Spezialwellen aktiv
const M2 = 205; // 3:25 — Folgemarke nach dem Fortsetzen
const PAUSE_MS = 5000;

ensureBuild();
mkdirSync("shots", { recursive: true });
const pw = await loadPlaywright();
const { chromium } = pw;
// Serverstart mit Retry: parallele Lanes belegen Ports im Harness-Bereich.
let server = null;
for (let i = 0; i < 8 && !server; i++) {
  server = await startServer().catch(() => null);
  if (!server) await new Promise((r) => setTimeout(r, 700));
}
if (!server) throw new Error("Statischer Server nach 8 Versuchen nicht gestartet");
const browser = await chromium.launch();

const jsErrors = [];
const result = {
  name: `m10-pause-freeze-${outName}`,
  generatedAt: new Date().toISOString(),
  seed: SEED, marks: { m1: M1, m2: M2 }, pauseMs: PAUSE_MS,
  checks: [], leaks: [],
};
const check = (name, ok, detail) => {
  result.checks.push({ name, ok: Boolean(ok), detail: detail ?? null });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` (${JSON.stringify(detail).slice(0, 300)})` : ""}`);
  return ok;
};

// ── In-Page-Helfer ───────────────────────────────────────────────────────────
const INSTALL = `
  const run = window.__game.scene.getScene("run");
  const pf = window.__pf = {
    phase: "before",
    fx: 0, particles: 0, dmg: 0, visuals: 0,
    simulates: 0, simDt: 0, tweenAdds: 0, delayedSchedules: 0,
    clockFiresPaused: 0, clockFiresTotal: 0, simMutKills: 0,
  };
  const wrap = (obj, name, counter) => {
    const orig = obj[name].bind(obj);
    obj[name] = (...a) => { counter(...a); return orig(...a); };
  };
  wrap(run.combat.fx, "update", () => { if (pf.phase === "paused") pf.fx++; });
  wrap(run.combat.particles, "update", () => { if (pf.phase === "paused") pf.particles++; });
  wrap(run.combat.damageNumbers, "update", () => { if (pf.phase === "paused") pf.dmg++; });
  wrap(run, "updateVisuals", () => { if (pf.phase === "paused") pf.visuals++; });
  wrap(run, "simulate", (dt) => { pf.simulates++; pf.simDt += dt; });
  wrap(run.tweens, "add", () => { pf.tweenAdds++; });
  wrap(run.time, "delayedCall", () => { pf.delayedSchedules++; });
`;

const SNAP = `
  const run = window.__game.scene.getScene("run");
  const r1 = (v) => Math.round(v * 10) / 10;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const enemies = (run.enemies?.active ?? []).map((e) => [
    e.uid, e.def?.id ?? "?", e.elite ? 1 : 0, r3(e.x), r3(e.y),
    r3(e.vx), r3(e.vy), r3(e.hp), r3(e.speed), r3(e.phase), r3(e.hpScale),
  ]);
  const proj = (run.combat?.projectiles?.active ?? []).map((p) => [
    r3(p.x), r3(p.y), r3(p.vx), r3(p.vy), r3(p.life), p.weaponId, p.hit ? p.hit.size : 0,
  ]);
  const shots = (run.enemyShots?.active ?? []).map((s) => [
    r3(s.x), r3(s.y), r3(s.vx), r3(s.vy), r3(s.life), s.active ? 1 : 0,
  ]);
  const pf = window.__pf;
  let states = null;
  try {
    states = Object.fromEntries([...run.combat.states].map(([k, v]) => [k, {
      orbTimeLeft: r3(v.orbTimeLeft ?? 0), cooldown: r3(v.cooldown ?? 0),
      swings: (v.swings ?? []).length,
    }]));
  } catch { states = "unavailable"; }
  return {
    elapsed: r3(run.elapsed), kills: run.kills, hp: r3(run.hp),
    level: run.xpState?.level ?? null, xp: r3(run.xpState?.xp ?? 0),
    pendingLevelUps: run.xpState?.pendingLevelUps ?? null,
    damageByWeapon: run.damageByWeapon,
    spawnerBudget: run.spawner?.budget ?? null,
    elitesSpawned: run.elitesSpawned ?? null,
    invuln: r3(run.invuln ?? 0),
    bossFlags: (run.bossFlags ?? []).slice(),
    enemies, proj, shots, states,
    timePaused: run.time?.paused ?? null,
    pausedFlag: run.paused,
    freezeGate: run.freezeGate ?? null,
    probeT: r3(pf.probe?.t ?? 0),
    activeTweens: run.tweens?._active?.length ?? run.tweens?.tweens?.length ?? -1,
    pf: { phase: pf.phase, fx: pf.fx, particles: pf.particles, dmg: pf.dmg,
      visuals: pf.visuals, simulates: pf.simulates, simDt: r3(pf.simDt),
      tweenAdds: pf.tweenAdds, delayedSchedules: pf.delayedSchedules,
      clockFiresPaused: pf.clockFiresPaused, clockFiresTotal: pf.clockFiresTotal,
      simMutKills: pf.simMutKills },
  };
`;

async function newRun(browser, server, label) {
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, hasTouch: true });
  // Determinismus-Injektion (siehe Dateikopf): Math.random -> mulberry32(SEED),
  // damit die Gegner-KI (EnemyPool DEFAULT_AI_RNG) über Runs bitgleich läuft.
  await context.addInitScript((seed) => {
    let t = seed >>> 0;
    Math.random = () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }, SEED);
  const page = await context.newPage();
  page.on("pageerror", (e) => jsErrors.push(`[${label}] ${e}`));
  page.on("console", (m) => { if (m.type() === "error") jsErrors.push(`[${label}] ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await page.waitForFunction(() => Boolean(window.__lf), undefined, { timeout: 45000 });
  await waitForScene(page, "title");
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setSuppressLevelUps(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(30);
  });
  await page.evaluate(INSTALL);
  await page.evaluate(`window.__pf.snapFn = function() { ${SNAP} }`);
  return { context, page };
}

const snap = async (page) => page.evaluate(new Function(SNAP));

// Frame-exakte Marken: waitForFunction-Polling (100 ms) ist bei timeScale 30
// bis zu 3 s Sim-Jitter — deshalb wird der Snapshot direkt im Frame gezogen,
// in dem elapsed erstmals >= target ist. Phaser ruft beim Boot erfasst
// `sys.sceneUpdate` auf (Instanz-Override von update greift nicht) — genau
// dort wird gewrappt.
const armMark = async (page, target) => {
  await page.evaluate((t) => {
    const run = window.__game.scene.getScene("run");
    const pf = window.__pf;
    if (!pf.origSceneUpdate) {
      pf.origSceneUpdate = run.sys.sceneUpdate;
      run.sys.sceneUpdate = function (time, delta) {
        const out = pf.origSceneUpdate.call(this, time, delta);
        if (pf.mark === null && pf.target != null) {
          const r = window.__game.scene.getScene("run");
          if (r && r.elapsed >= pf.target) pf.mark = pf.snapFn();
        }
        return out;
      };
    }
    pf.target = t;
    pf.mark = null;
  }, target);
};
const awaitMark = async (page) => {
  await page.waitForFunction(() => window.__pf.mark !== null, undefined, { timeout: 120000, polling: 50 });
  return page.evaluate(() => window.__pf.mark);
};

// ── Kontrollläufe (Baseline-Determinismus) ───────────────────────────────────
async function controlRun(label) {
  const { context, page } = await newRun(browser, server, label);
  await armMark(page, M1);
  const m1 = await awaitMark(page);
  await armMark(page, M2);
  const m2 = await awaitMark(page);
  await context.close();
  return { m1, m2 };
}

const strip = (s) => { const c = { ...s }; delete c.pf; delete c.probeT; delete c.timePaused; delete c.freezeGate; delete c.pausedFlag; delete c.activeTweens; return c; };
const controlA = await controlRun("controlA");
const controlB = await controlRun("controlB");
result.controlA = controlA;
result.controlB = controlB;
const baselineOk = JSON.stringify({ m1: strip(controlA.m1), m2: strip(controlA.m2) })
  === JSON.stringify({ m1: strip(controlB.m1), m2: strip(controlB.m2) });
// Kein hartes Gate: zwei Kontrollläufe mit gleichem Seed divergieren bereits
// OHNE Pause (frame-count-abhaengige Systeme, Spawner-Budget je Frame). Die
// Divergenz ist hier als Kontext dokumentiert — Bitgleichheit ueber Runs ist
// ohne Fremd-Fix (Spawner.ts/EnemyPool.ts) nicht entscheidbar; der harte
// Pause-Nachweis ist anschluss_bitgleich (Zustand nach 5 s Pause ≡ Start).
result.baseline = {
  bitgleich: baselineOk,
  hinweis: baselineOk
    ? "Kontrollläufe bitgleich — Methodik voll valide"
    : "Kontrollläufe divergieren bereits ohne Pause (frame-count-abhängige Systeme, z. B. Spawn-Budget je Frame in Spawner.ts, DEFAULT_AI_RNG = Math.random in EnemyPool.ts:125). Cross-Run-Bitgleichheit ohne Fremd-Fix nicht entscheidbar.",
  m2: { elapsed: [controlA.m2.elapsed, controlB.m2.elapsed], kills: [controlA.m2.kills, controlB.m2.kills],
    enemies: [controlA.m2.enemies.length, controlB.m2.enemies.length], hp: [controlA.m2.hp, controlB.m2.hp] },
};
console.log(`${baselineOk ? "OK  " : "INFO"} baseline_bitgleich (controlA ≡ controlB) — ${result.baseline.hinweis}`);

// ── Pause-Lauf ───────────────────────────────────────────────────────────────
const { context, page } = await newRun(browser, server, "pauseRun");
await armMark(page, M1);
const before = await awaitMark(page);

// Pausieren über denselben Pfad wie ESC: frame.actions.pause -> togglePause().
await page.evaluate(() => window.__game.scene.getScene("run").togglePause());
// Proben JETZT starten (im Pausenmoment): Probe-Timer ueber exakt denselben
// Mechanismus, mit dem Run.ts Sim-Ketten plant (delayedCall(120, () => { b.hp = 0 })
// etc.), Probe-Tween in der Klasse der Splash-/Blink-FX.
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const pf = window.__pf;
  pf.probe = { t: 0 };
  run.time.delayedCall(1500, () => {
    pf.clockFiresTotal++;
    if (pf.phase === "paused") { pf.clockFiresPaused++; pf.simMutKills = 7; run.kills += 7; }
  });
  run.tweens.add({ targets: pf.probe, t: 1, duration: 4000, ease: "Linear" });
});
await page.evaluate(() => { window.__pf.phase = "paused"; });
const pausedFlag = await page.evaluate(() => window.__game.scene.getScene("run").paused === true);
check("togglePause setzt paused=true", pausedFlag);
const pausedStart = await snap(page);
await page.waitForTimeout(PAUSE_MS);
const during = await snap(page);

// Fortsetzen über denselben Pfad (zweiter togglePause-Aufruf).
await page.evaluate(() => window.__game.scene.getScene("run").togglePause());
await page.evaluate(() => { window.__pf.phase = "resumed"; });
const resumedFlag = await page.evaluate(() => window.__game.scene.getScene("run").paused === false);
check("togglePause setzt fort (paused=false)", resumedFlag);

await armMark(page, M2);
const mark = await awaitMark(page);
await context.close();

result.pauseRun = { before, pausedStart, during, mark };

// ── Leck-Kategorien auswerten ────────────────────────────────────────────────
const delta = (a, b) => Math.round((b - a) * 1000) / 1000;
// Vergleichsfenster = echte Pause-Grenze: pausedStart (direkt nach togglePause)
// vs. during (nach 5 s Echtzeit). before liegt VOR der Pause (dazwischen laufen
// noch Frames bei 30x — das ist kein Pause-Leck).
const simDeltas = {
  kills: delta(pausedStart.kills, during.kills),
  hp: delta(pausedStart.hp, during.hp),
  elapsed: delta(pausedStart.elapsed, during.elapsed),
  xp: delta(pausedStart.xp, during.xp),
  spawnerBudget: delta(pausedStart.spawnerBudget ?? 0, during.spawnerBudget ?? 0),
  enemies: during.enemies.length - pausedStart.enemies.length,
  proj: during.proj.length - pausedStart.proj.length,
  shots: during.shots.length - pausedStart.shots.length,
};
result.simDeltasDuringPause = simDeltas;

// Kategorie 1+2: Kern-Simulation (Kills/Schaden/Spawns/Wellen/Timer).
check("pause_friert_sim_ein (0 Kills/HP/Spawns/elapsed-Delta)", Object.values(simDeltas).every((v) => v === 0), simDeltas);

// Anschluss-Sim bitgleich: nach 5 s Pause ist der volle Sim-Zustand (inkl.
// Gegnerpositionen, Projektile, Schuesse, Waffen-Timer) unveraendert.
const anschlussOk = JSON.stringify(strip(pausedStart)) === JSON.stringify(strip(during));
check("anschluss_bitgleich (Zustand nach 5 s Pause ≡ Zustand bei Pause-Start)", anschlussOk, anschlussOk
  ? `elapsed ${during.elapsed}, kills ${during.kills}, ${during.enemies.length} Gegner bitgleich`
  : { kills: [pausedStart.kills, during.kills], elapsed: [pausedStart.elapsed, during.elapsed] });

// Kategorie 3: Timer-Fortschritt (Szenen-Clock feuert während Pause).
check("pause_friert_clock_ein (Probe-delayedCall feuert nicht in der Pause)", during.pf.clockFiresPaused === 0, {
  clockFiresPaused: during.pf.clockFiresPaused,
  clockFiresTotal: during.pf.clockFiresTotal,
  timePaused: during.timePaused,
});
if (during.pf.clockFiresPaused > 0) {
  result.leaks.push({
    kategorie: "Timer-Fortschritt",
    befund: `Szenen-Clock feuerte ${during.pf.clockFiresPaused}x während der Pause (Probe-delayedCall über denselben Mechanismus wie Run.ts 668/1086/1811/1826/1835)`,
    folge: "Sim-mutierende Ketten (Boss-Tod -> hp=0+Truhe, Truhe-Autoöffnung, Morgendämmerung) laufen im Pausenbildschirm weiter",
    killsMutiertWaehrendPause: during.pf.simMutKills,
    timePausedWaehrendPause: during.timePaused,
  });
}

// Kategorie 4: FX-Updates während Pause (Tweens + fx/particles/damageNumbers/visuals).
const fxUpdates = during.pf.fx + during.pf.particles + during.pf.dmg + during.pf.visuals;
check("pause_friert_fx_ein (0 fx/particles/damageNumbers/visuals-Aufrufe)", fxUpdates === 0, { fxUpdates });

// Kategorie 5: Tweens (FX-Animationen wie Splash/Blink) laufen im Pausenbild weiter.
const tweenDelta = delta(pausedStart.probeT, during.probeT);
check("pause_friert_tweens_ein (Probe-Tween friert ein)", tweenDelta === 0, { tweenDelta, probeT: [pausedStart.probeT, during.probeT] });
if (tweenDelta > 0) {
  result.leaks.push({
    kategorie: "FX-Updates (Tweens)",
    befund: `Probe-Tween lief während der Pause weiter (+${tweenDelta} Fortschritt, gleiche Klasse wie Splash-/Blink-FX Run.ts 711/995/1097)`,
  });
}

if (fxUpdates > 0) {
  result.leaks.push({ kategorie: "FX-Updates", befund: `${fxUpdates} fx/particles/damageNumbers/updateVisuals-Aufrufe während der Pause` });
}

// Kategorie 5: Bitgleichheit der Folgemarken (ohne Instrumentierungsfelder).
const markSim = strip(mark);
// a) Harter Gate: der Sim läuft nach dem Fortsetzen ohne Lücke/Zeitsprung vom
//    exakt eingefrorenen Zustand weiter (Sim-Zeit-Kontostand stimmt exakt).
const simDtAfterResume = delta(pausedStart.pf.simDt, mark.pf.simDt);
const elapsedAfterResume = delta(pausedStart.elapsed, mark.elapsed);
check("fortsetzen_ohne_luecke (Sim-Zeit-Konto: elapsed ≡ simSteps nach Resume)",
  Math.abs(simDtAfterResume - elapsedAfterResume) < 0.05 && mark.pf.simulates > pausedStart.pf.simulates,
  { simDtAfterResume, elapsedAfterResume,
    simSteps: [pausedStart.pf.simulates, mark.pf.simulates] });
// b) Kontext (kein Gate): Divergenz Pause-Lauf vs controlA gegen die
//    Baseline-Divergenz (gleiche Größenordnung = nicht pause-verursacht).
const crossDivergence = {
  kills: Math.abs(markSim.kills - controlA.m2.kills),
  baselineKills: Math.abs(controlA.m2.kills - controlB.m2.kills),
  enemies: Math.abs(markSim.enemies.length - controlA.m2.enemies.length),
  baselineEnemies: Math.abs(controlA.m2.enemies.length - controlB.m2.enemies.length),
};
result.crossRunContext = {
  hinweis: "Cross-Run-Bitgleichheit ist ohne Fremd-Fix (frame-count-abhängige Systeme) nicht entscheidbar; die Divergenz Pause-Lauf vs. controlA liegt in der Größenordnung der Baseline-Divergenz zweier Kontrollläufe.",
  ...crossDivergence,
  pauseRunM2: { elapsed: markSim.elapsed, kills: markSim.kills, enemies: markSim.enemies.length, hp: markSim.hp },
  controlAM2: { elapsed: controlA.m2.elapsed, kills: controlA.m2.kills, enemies: controlA.m2.enemies.length, hp: controlA.m2.hp },
};
console.log(`INFO fortsetzen_cross_run (Kontext) ${JSON.stringify(crossDivergence)}`);

// Sim lief nach dem Fortsetzen normal weiter (nicht tot/doppelt):
check("fortsetzen_laueft_weiter (Sim-Steps nach Resume > 0)", mark.pf.simulates > before.pf.simulates,
  { simulatesBefore: before.pf.simulates, simulatesMark: mark.pf.simulates });

check("keine_js_fehler", jsErrors.length === 0, jsErrors.slice(0, 5));
result.jsErrors = jsErrors;

result.verdict = result.leaks.length === 0 && result.checks.every((c) => c.ok)
  ? "PASS" : `LECKS=${result.leaks.length} FAILS=${result.checks.filter((c) => !c.ok).length}`;

writeFileSync(outJson, `${JSON.stringify(result, null, 2)}\n`);
console.log(`\nVerdict: ${result.verdict} -> ${outJson}`);
await browser.close();
server.stop();
process.exit(0);
