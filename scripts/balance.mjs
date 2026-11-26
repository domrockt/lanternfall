#!/usr/bin/env node
/**
 * M6-Balance-Harness (Lane balance):
 *
 *   node scripts/balance.mjs                 # 6 Runs (3 Seeds x 2 Charaktere), ohne god, 30x
 *   node scripts/balance.mjs --death         # je Charakter 1 Lauf bis zum Tod (Results-Beleg)
 *   node scripts/balance.mjs --weapons       # Waffen-Audit: jede Waffe einzeln auf Stufe 8
 *   node scripts/balance.mjs --all           # alle drei Modi
 *
 * Alle Modi: kitender autoPlay-Bot, KEIN god mode, timeScale 30, feste 1/20-s-Substeps.
 * Pro Sim-Minute werden Level, HP, Gegnerzahl und DPS je Waffe protokolliert; Boss-
 * Kampfdauern und Todeszeitpunkt werden aus dem Run-Zustand abgeleitet.
 *
 * Ausgabe: shots/balance-<mode>.json + Markdown-Tabelle zwischen den Markern
 * `<!-- BALANCE-TABLE:START -->` / `<!-- BALANCE-TABLE:END -->` in docs/lanes/balance.md.
 *
 * WICHTIG: Messläufe immer mit flock starten, z. B.
 *   flock /home/ai/games/.lf-perf.lock npm run balance
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const SCALE = 30;
const POLL_MS = 140;
const TARGET = {
  survivalMin: [20, 28],
  levelAt30: [25, 40],
  bossSeconds: [20, 60],
  // Boss-Grundtempo <= 90 % wird als Datentabelle im Unit-Test geprüft
  // (tests/m3-logic.test.ts), nicht in jedem Lauf erneut.
};
const EVOLVED = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const ALL_WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern",
  "phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const BOSS_NAMES = ["Moorkönigin", "Knochenfürst", "Der Fahle Hirte", "Glockenturm-Golem", "Hexenzirkel", "Der Hohle König"];
const MARK_START = "<!-- BALANCE-TABLE:START -->";
const MARK_END = "<!-- BALANCE-TABLE:END -->";

const args = parseArgs(process.argv.slice(2));
const mode = args.death ? "death" : args.weapons ? "weapons" : args.all ? "all" : "main";
const seeds = String(args.seeds ?? "101,202,404").split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
// M8: Viewport/devicePixelRatio waehlbar (640x360 -> 1920x1080@1, 780x360 -> 780x360@3).
const viewportArg = String(args.viewport ?? "960x540").split("x").map(Number);
const VIEWPORT = { width: viewportArg[0] || 960, height: viewportArg[1] || 540 };
const DPR = Number(args.dpr ?? 1) || 1;
const TAG = String(args.tag ?? "");
// M8-Tuning: optionaler Spawnraten-Faktor fuer alle L (nur Messung).
const DENSITY = Number(args.density ?? NaN);
const chars = String(args.characters ?? "mira,kael").split(",").map((s) => s.trim()).filter(Boolean);
const charsPerRun = mode === "main" || mode === "all";
const DOC = String(args.doc ?? "docs/lanes/balance.md");

ensureBuild();
mkdirSync("shots", { recursive: true });
mkdirSync("docs/lanes", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];

async function openRun(page, seed, character, setup) {
  const density = setup?.density;
  const densityQ = Number.isFinite(density) ? `&density=${density}` : "";
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${seed}${densityQ}`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press(character === "kael" ? "2" : "1");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.evaluate((setup) => {
    window.__lf.autoPlay(setup?.autoPlay ?? true);
    window.__lf.god(false);
    if (setup?.weapons) for (const w of setup.weapons) window.__lf.addWeapon(w.id, w.level);
    if (setup?.passives) for (const p of setup.passives) window.__lf.addPassive(p.id, p.level);
    // Exakte Boss-Todeszeiten (der Poll allein hat ±4 Sim-Sekunden Auflösung).
    const run = window.__game.scene.getScene("run");
    window.__balanceTrace = { bossDeaths: [] };
    run.events.on("bossDefeated", (e) => {
      window.__balanceTrace.bossDeaths.push({ index: e.index, at: run.elapsed });
    });
    window.__lf.setTimeScale(setup?.scale ?? 30);
  }, setup ?? {});
}

/** Kompakter Zustand (kein enemyList-Transfer, kein Voll-State pro Poll). */
async function snapshot(page) {
  return page.evaluate(() => {
    const game = window.__game;
    const run = game?.scene?.getScene("run");
    if (run && run.scene.isActive()) {
      const hud = run.getHudState();
      return {
        scene: "run",
        time: hud.time,
        level: hud.level,
        xp: hud.xp,
        xpNeed: hud.xpNeed,
        hp: hud.hp,
        maxHp: hud.maxHp,
        kills: hud.kills,
        enemies: hud.enemies,
        weapons: hud.weapons.map((w) => ({ id: w.id, level: w.level })),
        passives: hud.passives.map((p) => ({ id: p.id, level: p.level })),
        boss: hud.boss,
        dawn: hud.dawn,
        damageByWeapon: { ...(run.damageByWeapon ?? {}) },
        bossesDefeated: run.bossesDefeated ?? 0,
        bossFlags: (run.bossFlags ?? []).slice(),
        bossesSpawned: (run.bossesSpawned ?? []).slice(),
        chestsDropped: run.chestsDropped ?? 0,
        bossDeaths: [...(window.__balanceTrace?.bossDeaths ?? [])],
        levelUpOpen: Boolean(run.levelUpOpen),
        chestOpen: Boolean(run.chestOpen),
      };
    }
    const results = game?.scene?.getScene("results");
    if (results && results.scene.isActive()) {
      const r = results.result ?? {};
      return {
        scene: "results",
        reason: r.reason ?? null,
        time: r.elapsed ?? 0,
        level: r.level ?? 0,
        kills: r.kills ?? 0,
        damageByWeapon: { ...(r.damageByWeapon ?? {}) },
        character: r.character ?? null,
        god: Boolean(r.god),
      };
    }
    return { scene: game?.scene?.isActive("title") ? "title" : "other", time: 0 };
  });
}

function dpsRows(samples) {
  // Pro Intervall (zwischen zwei Minuten-Snapshots) DPS je Waffe = Damage-Delta / Sim-Sekunden.
  const rows = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    const dt = b.time - a.time;
    if (dt <= 0) continue;
    const dps = {};
    for (const [id, dmg] of Object.entries(b.damageByWeapon)) {
      const delta = dmg - (a.damageByWeapon[id] ?? 0);
      if (delta > 0) dps[id] = Math.round((delta / dt) * 10) / 10;
    }
    const total = Object.values(dps).reduce((s, v) => s + v, 0);
    const share = {};
    for (const [id, v] of Object.entries(dps)) {
      if (total > 0) share[id] = Math.round((v / total) * 1000) / 10;
    }
    rows.push({
      minuteFrom: Math.floor(a.time / 60),
      minuteTo: Math.floor(b.time / 60),
      tFrom: Math.round(a.time),
      tTo: Math.round(b.time),
      level: b.level,
      hp: Math.round(b.hp),
      maxHp: Math.round(b.maxHp),
      enemies: b.enemies,
      kills: b.kills,
      dps,
      sharePct: share,
    });
  }
  return rows;
}

function bossDurations(runTrace) {
  const spawned = runTrace.bossesSpawned ?? [];
  const lastSeen = runTrace.lastSeenByBoss ?? {};
  const defeatedEnd = runTrace.defeatedEndByBoss ?? {};
  const out = [];
  for (let i = 0; i < spawned.length; i++) {
    const spawnAt = spawned[i].at ?? spawned[i].second ?? null;
    const defeated = Number.isFinite(defeatedEnd[i]);
    const end = defeated ? defeatedEnd[i] : lastSeen[i];
    out.push({
      index: i,
      name: BOSS_NAMES[i] ?? `boss${i}`,
      spawnSecond: spawnAt,
      endSecond: Number.isFinite(end) ? Math.round(end) : null,
      durationSec: defeated && Number.isFinite(end) && Number.isFinite(spawnAt) ? Math.round(end - spawnAt) : null,
      defeated,
      aliveAtDeath: !defeated && Number.isFinite(lastSeen[i]),
    });
  }
  return out;
}

/** Ein Lauf bis Tod/Sieg; liefert Minuten-Samples, Boss-Dauern, Tod, DPS. */
async function runOnce(seed, character, setup, maxSimSeconds = 33 * 60) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") pageErrors.push(m.text()); });
  const started = Date.now();
  const trace = {
    seed, character, outcome: null, deathSecond: null, samples: [],
    autoPlay: setup?.autoPlay ?? true,
    lastSeenByBoss: {}, bossObserved: {}, defeatedEndByBoss: {},
  };
  try {
    await openRun(page, seed, character, { ...setup, scale: SCALE });
    trace.view = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const canvas = document.querySelector("canvas");
      const rect = canvas.getBoundingClientRect();
      return {
        viewport: [window.innerWidth, window.innerHeight],
        dpr: window.devicePixelRatio,
        logical: [run.scale.width, run.scale.height],
        css: [Math.round(rect.width), Math.round(rect.height)],
      };
    });
    let nextMinute = 1;
    let prevDefeated = 0;
    let activeBoss = null;
    let pollTick = 0;
    let last = await snapshot(page);
    trace.samples.push(stripSample(last));
    while (Date.now() - started < 150000) {
      await page.waitForTimeout(POLL_MS);
      // Waffen-Audit: kurze Waffen (Frostnova/Geisterlaterne) treffen nur nah am
      // Spieler. Der kite-Bot hält Abstand, daher werden für den fairen
      // Waffenvergleich einige Gegner nahe am Spieler nachgespawnt (kein god).
      if (setup?.closeSpawns && pollTick++ % 15 === 0) {
        await page.evaluate(() => {
          const p = window.__lf.state()?.player;
          if (!p) return;
          window.__lf.spawnEnemy("bog_rat", 3, p.x + 26, p.y + 18);
        });
      }
      const s = await snapshot(page);
      // Stehender Spieler (Todesbeleg ohne Bot): Level-up-Dialog automatisch
      // wegklicken, sonst pausiert der Run und es gibt keinen Tod.
      if (setup?.stationary && s.scene === "run" && s.levelUpOpen) {
        await page.evaluate(() => window.__lf.pickLevelUp(0));
      }
      if (s.scene === "results") {
        trace.outcome = s.reason === "dawn" ? "dawn" : "death";
        trace.deathSecond = Math.round(s.time * 10) / 10;
        trace.result = {
          reason: s.reason, time: s.time, level: s.level, kills: s.kills,
          damageByWeapon: s.damageByWeapon, character: s.character, god: s.god,
        };
        trace.finalDamageByWeapon = s.damageByWeapon;
        await page.screenshot({ path: `shots/balance-${mode}-${character}-${seed}.png` });
        break;
      }
      if (s.scene !== "run") break;
      for (const d of s.bossDeaths ?? []) {
        if (trace.defeatedEndByBoss[d.index] == null) trace.defeatedEndByBoss[d.index] = d.at;
      }
      if (s.boss) {
        trace.lastSeenByBoss[s.boss.index] = s.time;
        activeBoss = s.boss.index;
        trace.bossObserved[s.boss.index] = trace.bossObserved[s.boss.index] ?? { firstSecond: s.time, minHp: s.boss.ratio };
        trace.bossObserved[s.boss.index].minHp = Math.min(trace.bossObserved[s.boss.index].minHp, s.boss.ratio);
      } else if (activeBoss != null && s.bossesDefeated > prevDefeated && trace.defeatedEndByBoss[activeBoss] == null) {
        // Fallback, falls das Event vor dem Poll-Listener registriert wurde.
        trace.defeatedEndByBoss[activeBoss] = trace.lastSeenByBoss[activeBoss];
        activeBoss = null;
      }
      prevDefeated = s.bossesDefeated;
      if (s.time >= nextMinute * 60) {
        trace.samples.push(stripSample(s));
        const lastIndex = trace.samples.length - 1;
        // Bei starkem Zeitsprung nur einen Snapshot pro übersprungener Minute setzen.
        nextMinute = Math.floor(s.time / 60) + 1;
        trace.samples[lastIndex].minute = Math.floor(s.time / 60);
      }
      if (s.time > maxSimSeconds) break;
      last = s;
    }
    if (!trace.outcome && last.scene === "run") {
      trace.outcome = last.dawn ? "dawn" : "timeout";
      trace.deathSecond = Math.round(last.time * 10) / 10;
    }
    trace.run = {
      time: last.time, level: last.level, kills: last.kills, hp: Math.round(last.hp),
      maxHp: last.maxHp, enemies: last.enemies, weapons: last.weapons,
      passives: last.passives, bossesDefeated: last.bossesDefeated,
      bossFlags: last.bossFlags, bossesSpawned: last.bossesSpawned,
      chestsDropped: last.chestsDropped, dawn: last.dawn,
      damageByWeapon: last.damageByWeapon,
    };
  } finally {
    trace.pageErrors = pageErrors;
    trace.wallSeconds = Math.round((Date.now() - started) / 100) / 10;
    await page.close();
  }
  trace.dpsRows = dpsRows(trace.samples);
  trace.bossDurations = bossDurations({
    ...trace.run,
    lastSeenByBoss: trace.lastSeenByBoss,
    defeatedEndByBoss: trace.defeatedEndByBoss,
  });
  trace.evolutions = (trace.run?.weapons ?? []).map((w) => w.id).filter((id) => EVOLVED.includes(id));
  const runSeconds = trace.run?.time ?? trace.result?.time ?? trace.deathSecond ?? 0;
  trace.damageShare = damageShare(trace.run?.damageByWeapon ?? trace.finalDamageByWeapon ?? {}, runSeconds);
  trace.passed = evaluateRun(trace);
  errors.push(...pageErrors.map((e) => `${character}/${seed}: ${e}`));
  return trace;
}

function stripSample(s) {
  return {
    time: s.time, level: s.level, hp: s.hp, maxHp: s.maxHp,
    enemies: s.enemies, kills: s.kills, weapons: s.weapons, passives: s.passives,
    boss: s.boss, damageByWeapon: s.damageByWeapon, dawn: s.dawn,
  };
}

function damageShare(map, seconds = 30 * 60) {
  const total = Object.values(map).reduce((s, v) => s + v, 0);
  const share = {};
  const dps = {};
  const span = Math.max(1, seconds);
  for (const [id, v] of Object.entries(map)) {
    if (v <= 0) continue;
    dps[id] = Math.round((v / span) * 10) / 10;
    share[id] = total > 0 ? Math.round((v / total) * 1000) / 10 : 0;
  }
  return { totalDamage: Math.round(total), sharePct: share, avgDpsOverRun: dps };
}

function evaluateRun(t) {
  const minutes = (t.deathSecond ?? t.run?.time ?? 0) / 60;
  const levelAtEnd = t.result?.level ?? t.run?.level ?? t.createdLevel ?? 0;
  const bossDurations = t.bossDurations ?? [];
  const killedBosses = bossDurations.filter((b) => b.defeated);
  const bossOk = killedBosses.length === 0
    ? true
    : killedBosses.every((b) => Number.isFinite(b.durationSec) && b.durationSec >= TARGET.bossSeconds[0] && b.durationSec <= TARGET.bossSeconds[1]);
  const survivalOrWin = t.outcome === "dawn" ||
    (t.outcome === "death" && minutes >= TARGET.survivalMin[0] && minutes <= TARGET.survivalMin[1]);
  const evolutionOk = (t.evolutions ?? []).length >= 1;
  return {
    survivalMinutes: Math.round(minutes * 10) / 10,
    levelAtEnd,
    evolutionCount: (t.evolutions ?? []).length,
    bossDurationsInCorridor: bossOk,
    died: t.outcome === "death",
    // Sieg (Morgendämmerung) zählt als bestandener Überlebensfall; ein Tod muss
    // im 20–28-min-Fenster liegen.
    survivalInCorridor: survivalOrWin,
    levelInCorridor: levelAtEnd >= TARGET.levelAt30[0] && levelAtEnd <= TARGET.levelAt30[1],
    evolutionOk,
    passedAll: survivalOrWin && bossOk && levelAtEnd >= TARGET.levelAt30[0] && levelAtEnd <= TARGET.levelAt30[1] && evolutionOk,
  };
}

// ── Modi ────────────────────────────────────────────────────────────
const runs = [];
if (mode === "main" || mode === "all") {
  for (const seed of seeds) {
    for (const character of chars) {
      console.log(`[balance] Run ${character} seed ${seed} ...`);
      runs.push(await runOnce(seed, character, Number.isFinite(DENSITY) ? { density: DENSITY } : {}));
      const t = runs[runs.length - 1];
      console.log(`[balance]   -> ${t.outcome} @ ${t.passed.survivalMinutes} min, Level ${t.passed.levelAtEnd}, ${t.evolutions.length} Evo, ${t.wallSeconds}s wall`);
    }
  }
  writeFileSync("shots/balance-main-runs.json", JSON.stringify(runs, null, 2));
}

const deathRuns = [];
if (mode === "death" || mode === "all") {
  // Ein Lauf je Charakter ohne god bis zum Tod, mit genau demselben Bot wie im Hauptmodus.
  // Seeds über --deathSeeds überschreibbar (Reihenfolge = chars). Charaktere in
  // --deathIdleChars sterben ohne Bot (stehender Spieler, kein god), falls der
  // AutoPlay-Bot mit diesem Charakter sonst jeden Seed gewinnt.
  const deathSeeds = String(args.deathSeeds ?? "").split(",").map((s) => Number(s.trim())).filter(Number.isFinite);
  const idleDeath = String(args.deathIdleChars ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const stationaryDeath = String(args.deathStationaryChars ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = 0; i < chars.length; i++) {
    const character = chars[i];
    console.log(`[balance] Todeslauf ${character} ...`);
    // Seeds bewusst so gewählt, dass beide Charaktere ohne god sterben und der
    // Results-/Game-Over-Screen ausgelöst wird.
    const stationary = stationaryDeath.includes(character);
    deathRuns.push(await runOnce(deathSeeds[i] ?? (character === "mira" ? 101 : 505), character, {
      autoPlay: !stationary && !idleDeath.includes(character),
      stationary,
    }));
    const t = deathRuns[deathRuns.length - 1];
    console.log(`[balance]   -> ${t.outcome} @ ${t.passed.survivalMinutes} min, Level ${t.passed.levelAtEnd}, ${t.wallSeconds}s wall`);
  }
  writeFileSync("shots/balance-death-runs.json", JSON.stringify(deathRuns, null, 2));
}

const weaponRuns = [];
if (mode === "weapons" || mode === "all") {
  // Waffen-Audit: jede Waffe einzeln Stufe 8 + alle Powerups Stufe 3, 6 Sim-Minuten.
  const passives = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"].map((id) => ({ id, level: 3 }));
  for (const weapon of ALL_WEAPONS) {
    console.log(`[balance] Waffe ${weapon} ...`);
    const t = await runOnce(303, "mira", { weapons: [{ id: weapon, level: 8 }], passives, closeSpawns: true }, 6 * 60);
    t.weapon = weapon;
    t.windowMinutes = (t.deathSecond ?? t.run?.time ?? 0) / 60;
    const dmg = t.run?.damageByWeapon?.[weapon] ?? 0;
    t.weaponDamage = Math.round(dmg);
    t.weaponDps = Math.round((dmg / Math.max(1, (t.run?.time ?? 360))) * 10) / 10;
    t.killsPerMinute = Math.round(((t.run?.kills ?? 0) / Math.max(1, (t.run?.time ?? 360) / 60)) * 10) / 10;
    t.dead = dmg <= 0;
    weaponRuns.push(t);
  }
  writeFileSync("shots/balance-weapons-runs.json", JSON.stringify(weaponRuns, null, 2));
}

// ── Markdown ────────────────────────────────────────────────────────
const md = [];
if (runs.length) md.push(...mainMarkdown(runs));
if (deathRuns.length) md.push(...deathMarkdown(deathRuns));
if (weaponRuns.length) md.push(...weaponMarkdown(weaponRuns));
const block = md.join("\n");
const doc = existsSync(DOC) ? readFileSync(DOC, "utf8") : "";
writeFileSync(DOC, upsertMarked(doc, block));

const summary = {
  mode,
  scale: SCALE,
  viewport: VIEWPORT,
  dpr: DPR,
  generatedAt: new Date().toISOString(),
  runs: runs.map((r) => ({
    seed: r.seed, character: r.character, outcome: r.outcome,
    deathMinute: r.passed.survivalMinutes, level: r.passed.levelAtEnd,
    kills: r.run?.kills ?? r.result?.kills ?? 0, evolutions: r.evolutions,
    bossDurations: r.bossDurations, passed: r.passed,
  })),
  deathRuns: deathRuns.map((r) => ({
    character: r.character, outcome: r.outcome, deathMinute: r.passed.survivalMinutes,
    level: r.passed.levelAtEnd, kills: r.run?.kills ?? 0, resultReason: r.result?.reason ?? null,
    passed: r.passed,
  })),
  weapons: weaponRuns.map((r) => ({
    id: r.weapon, dps: r.weaponDps, damage: r.weaponDamage, killsPerMinute: r.killsPerMinute, dead: r.dead,
  })),
  jsErrors: errors,
  allRunsPass: (runs.length === 0 || runs.every((r) => r.passed.passedAll)) &&
    deathRuns.every((r) => r.outcome === "death" && r.result?.reason && r.result.god === false) &&
    weaponRuns.every((r) => !r.dead),
};
writeFileSync(`shots/balance-${mode}${TAG}.json`, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));

await browser.close();
server.stop();
const failed = errors.length > 0 || (mode === "all" && !summary.allRunsPass);
process.exit(failed ? 1 : 0);

// ── Helfer ──────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

function upsertMarked(doc, block) {
  const body = `${MARK_START}\n${block}\n${MARK_END}`;
  if (doc.includes(MARK_START) && doc.includes(MARK_END)) {
    const start = doc.indexOf(MARK_START);
    const end = doc.indexOf(MARK_END) + MARK_END.length;
    return doc.slice(0, start) + body + doc.slice(end);
  }
  return `${doc.trimEnd()}\n\n${body}\n`;
}

function fmt(n, digits = 1) {
  return Number.isFinite(n) ? String(Math.round(n * 10 ** digits) / 10 ** digits) : "–";
}

function mainMarkdown(list) {
  const out = [];
  out.push("### Hauptläufe (N = " + list.length + ", autoPlay, kein god, 30x)");
  out.push("");
  out.push("| # | Char | Seed | Ergebnis | Minuten | Level | Kills | Evos | Boss-Dauern (s) | Korridor |");
  out.push("|---|---|---|---|---|---|---|---|---|---|");
  list.forEach((r, i) => {
    const bossText = (r.bossDurations ?? []).filter((b) => b.defeated)
      .map((b) => `${b.name.split(" ")[0]} ${fmt(b.durationSec, 0)}`).join(", ") || "–";
    const fails = [];
    if (!r.passed.survivalInCorridor) fails.push("Überleben");
    if (!r.passed.levelInCorridor) fails.push("Level");
    if (!r.passed.bossDurationsInCorridor) fails.push("Boss-Dauer");
    if (!r.passed.evolutionOk) fails.push("Evolution");
    const corridor = r.outcome === "dawn" && fails.length === 0 ? "Sieg"
      : r.passed.passedAll ? "JA" : (fails.length ? `NEIN (${fails.join(", ")})` : "NEIN");
    out.push(`| ${i + 1} | ${r.character} | ${r.seed} | ${r.outcome === "death" ? "Tod" : r.outcome} | ${fmt(r.passed.survivalMinutes)} | ${r.passed.levelAtEnd} | ${r.run?.kills ?? 0} | ${r.evolutions.length} | ${bossText} | ${corridor} |`);
  });
  out.push("");

  out.push("#### Minuten-Protokoll");
  out.push("");
  for (const r of list) {
    out.push(`<details><summary>${r.character} / Seed ${r.seed} — ${r.outcome} @ ${fmt(r.passed.survivalMinutes)} min, Level ${r.passed.levelAtEnd}</summary>`);
    out.push("");
    out.push("| Min | Level | HP | Gegner | Kills | Waffen-DPS (Anteil %) |");
    out.push("|---|---|---|---|---|---|");
    for (const row of r.dpsRows) {
      const dpsText = Object.entries(row.dps)
        .sort((a, b) => b[1] - a[1])
        .map(([id, v]) => `${id} ${fmt(v)} (${fmt(row.sharePct[id] ?? 0)}%)`).join(", ") || "–";
      out.push(`| ${row.minuteTo} | ${row.level} | ${row.hp}/${row.maxHp} | ${row.enemies} | ${row.kills} | ${dpsText} |`);
    }
    out.push("");
    out.push("</details>");
    out.push("");
  }

  out.push("#### DPS-Anteil je Waffe (gesamter Lauf)");
  out.push("");
  out.push("| Char/Seed | Gesamtschaden | " + ALL_WEAPONS.map((w) => w).join(" | ") + " |");
  out.push("|---|---|" + ALL_WEAPONS.map(() => "---").join("|") + "|");
  for (const r of list) {
    const share = r.damageShare?.sharePct ?? {};
    out.push(`| ${r.character}/${r.seed} | ${r.damageShare?.totalDamage ?? 0} | ${ALL_WEAPONS.map((w) => share[w] != null ? fmt(share[w]) + "%" : "–").join(" | ")} |`);
  }
  out.push("");
  return out;
}

function deathMarkdown(list) {
  const out = [];
  out.push("### Todesläufe je Charakter (ohne god, 30x, bis zum Tod)");
  out.push("");
  out.push("| Char | Seed | Bot | Ergebnis | Todeszeit | Level | Kills | Result-Grund | Screenshot |");
  out.push("|---|---|---|---|---|---|---|---|---|");
  for (const r of list) {
    out.push(`| ${r.character} | ${r.seed} | ${r.autoPlay ? "autoPlay" : "steht still"} | ${r.outcome} | ${fmt(r.passed.survivalMinutes)} min | ${r.passed.levelAtEnd} | ${r.run?.kills ?? r.result?.kills ?? 0} | ${r.result?.reason ?? "–"} | shots/balance-death-${r.character}-${r.seed}.png |`);
  }
  out.push("");
  return out;
}

function weaponMarkdown(list) {
  const out = [];
  out.push("### Waffen-Audit (je Waffe allein auf Stufe 8, 6 Sim-Minuten, kein god)");
  out.push("");
  out.push("Der Bot kitet normalerweise; für kurze Waffen (Frostnova, Geisterlaterne) werden einige Gegner nah am Spieler nachgespawnt, damit der Vergleich fair ist.");
  out.push("");
  out.push("| Waffe | Schaden | DPS | Kills/Min | Fenster (min) | tot? |");
  out.push("|---|---|---|---|---|---|");
  for (const r of list) {
    out.push(`| ${r.weapon} | ${r.weaponDamage} | ${fmt(r.weaponDps)} | ${fmt(r.killsPerMinute)} | ${fmt(r.windowMinutes)} | ${r.dead ? "JA" : "nein"} |`);
  }
  out.push("");
  return out;
}
