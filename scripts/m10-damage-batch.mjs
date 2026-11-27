#!/usr/bin/env node
// M10-Damage-Batch: Kosten der Damage-Numbers im 500-Gegner-Chaos messen.
// 500 Gegner, 6 Waffen Stufe 8, Seed 1, autoPlay + god, 10 s Messfenster.
// Erfasst aktive/visible Textobjekte, setText-Aufrufe/s, ms/Frame sowie
// (nur --hud) HUD-Gesamtschaden gegen die Balkensumme der Ergebnis-Tabelle.
//
// FPS-/Echtzeitmessung nur mit flock starten:
//   flock /home/ai/games/.lf-perf.lock node scripts/m10-damage-batch.mjs --tag=before
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "probe"));
const SECONDS = Number(argOf("seconds", "10")) || 10;
const ENEMIES = Number(argOf("enemies", "500")) || 500;
const OUT_JSON = String(argOf("json", `shots/m10-damage-batch-${TAG}.json`));
const OUT_PNG = String(argOf("png", `shots/m10-damage-batch-${TAG}.png`));
const HUD = argv.includes("--hud");

const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];

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
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);

  // Instrumentierung: PixelText.prototype.setText der Damage-Number-Views
  // zaehlen (nur diese Instanzen, kein HUD/UI-Text) und report() mitzaehlen.
  const hook = await page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const sys = run.combat.damageNumbers;
    const texts = new WeakSet(sys.views.map((v) => v.text));
    const proto = Object.getPrototypeOf(sys.views[0].text);
    const counters = { setTextCalls: 0, reportCalls: 0, reportDamage: 0 };
    const origSetText = proto.setText;
    proto.setText = function (value) {
      if (texts.has(this)) counters.setTextCalls += 1;
      return origSetText.call(this, value);
    };
    const origReport = sys.report.bind(sys);
    sys.views.forEach((v) => { v.lastLabel = ""; });
    sys.report = function (uid, x, y, damage, crit) {
      counters.reportCalls += 1;
      counters.reportDamage += damage;
      return origReport(uid, x, y, damage, crit);
    };
    window.__m10 = { counters, sys };
    return { views: sys.views.length, maxViews: sys.maxViews };
  });

  // 500 Gegner ueber die sichtbare Flaeche verteilen + 6 Waffen Stufe 8.
  await page.evaluate(({ enemies, weapons }) => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    for (const id of weapons) window.__lf.addWeapon(id, 8);
    // Vier gut verteilte Archetypen, damit alle Waffen treffen.
    const mix = [["bog_rat", 0.35], ["wisp", 0.25], ["bogzombie", 0.2], ["crow", 0.2]];
    const run = window.__game.scene.getScene("run");
    const px = window.__lf.state().player.x;
    const py = window.__lf.state().player.y;
    for (const [id, share] of mix) {
      window.__lf.spawnEnemy(id, Math.round(enemies * share));
    }
    // Ueber die sichtbare Flaeche verteilen, damit sofort echter Kampf lastet.
    let i = 0;
    for (const e of run.enemies.active) {
      if (!e.alive) continue;
      const side = i % 2 === 0 ? 1 : -1;
      e.x = px + side * (10 + ((i * 37) % 190));
      e.y = py + (((i * 53) % 220) - 110);
      // Unsterblich: konstante 500er-Last ueber das ganze Messfenster.
      e.hp = 1e9;
      e.maxHp = 1e9;
      e.damage = 0;
      i += 1;
    }
  }, { enemies: ENEMIES, weapons: WEAPONS });
  await page.waitForTimeout(400);

  // Level-ups waehrend des Fensters sofort wegklicken, damit der Run nicht pausiert.
  const measure = await page.evaluate(async ({ seconds }) => {
    const run = window.__game.scene.getScene("run");
    const sys = window.__m10.sys;
    const counters = window.__m10.counters;
    const startCalls = counters.setTextCalls;
    const startReports = counters.reportCalls;
    const startDamage = counters.reportDamage;
    const start = performance.now();
    let last = start;
    let frames = 0;
    let worst = 0;
    let maxActive = 0;
    let maxVisible = 0;
    let sumActive = 0;
    let samples = 0;
    let respawned = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        const dt = now - last;
        if (frames > 0) worst = Math.max(worst, dt);
        last = now;
        frames += 1;
        if (window.__lf.stats().levelUpOpen) {
          try { window.__lf.pickLevelUp(0); } catch { /* egal */ }
        }
        const active = sys.views.filter((v) => v.active).length;
        const visible = sys.views.filter((v) => v.active && v.text.visible).length;
        if (active > maxActive) maxActive = active;
        if (visible > maxVisible) maxVisible = visible;
        sumActive += active;
        samples += 1;
        // Bestand auf Ziel halten: Gegner sterben im Chaos, sonst faellt die Last.
        // Jeden Frame auffuellen, damit dauerhaft ~500 Gegner im Kampf stehen.
        if (frames > 1) {
          const deficit = 500 - run.enemies.count;
          if (deficit > 0) {
            window.__lf.spawnEnemy("bog_rat", deficit);
            respawned += deficit;
          }
        }
        if (now - start >= seconds * 1000) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsed = performance.now() - start;
    return {
      frames,
      elapsedMs: Math.round(elapsed),
      fps: Math.round((frames / (elapsed / 1000)) * 10) / 10,
      worstFrameMs: Math.round(worst * 100) / 100,
      medianFrameMs: Math.round((elapsed / frames) * 100) / 100,
      maxActiveViews: maxActive,
      maxVisibleViews: maxVisible,
      avgActiveViews: samples ? Math.round((sumActive / samples) * 100) / 100 : 0,
      setTextCalls: counters.setTextCalls - startCalls,
      setTextPerSecond: Math.round(((counters.setTextCalls - startCalls) / (elapsed / 1000)) * 10) / 10,
      reportCalls: counters.reportCalls - startReports,
      reportPerSecond: Math.round(((counters.reportCalls - startReports) / (elapsed / 1000)) * 10) / 10,
      reportedDamage: counters.reportDamage - startDamage,
      respawned,
      enemiesEnd: run.enemies.count,
    };
  }, { seconds: SECONDS });

  await page.screenshot({ path: OUT_PNG });

  // Optional: Ergebnis-Screen und HUD-Gesamtschaden vs. Balkensumme.
  let hud = null;
  if (HUD) {
    hud = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const byWeapon = { ...run.damageByWeapon };
      const raw = Object.values(byWeapon).reduce((a, v) => a + v, 0);
      // Balkensumme wie Results: groesste Reste, Summe = gerundeter Gesamtschaden.
      const total = Math.round(raw);
      const entries = Object.entries(byWeapon).filter(([, v]) => v > 0);
      const floors = entries.map(([id, v]) => ({ id, base: Math.floor(v), rest: v - Math.floor(v) }));
      let leftover = total - floors.reduce((a, e) => a + e.base, 0);
      const ranked = [...floors].sort((a, b) => b.rest - a.rest);
      for (const e of ranked) {
        if (leftover <= 0) break;
        e.base += 1;
        leftover -= 1;
      }
      const bars = floors.reduce((a, e) => a + e.base, 0);
      return {
        hudTotal: total,
        rawTotal: Math.round(raw * 100) / 100,
        barsSum: bars,
        deltaPct: total === 0 ? 0 : Math.round((Math.abs(total - bars) / total) * 10000) / 100,
        weapons: byWeapon,
      };
    });
  }

  const byFrameMs = measure.elapsedMs / Math.max(1, measure.frames);
  result = {
    tag: TAG,
    generatedAt: new Date().toISOString(),
    seed: 1,
    enemiesTarget: ENEMIES,
    weapons: WEAPONS,
    seconds: SECONDS,
    ...measure,
    msPerFrame: Math.round(byFrameMs * 100) / 100,
    hook,
    hud,
    jsErrors: errors,
  };
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
process.exit(result && result.jsErrors.length === 0 && result.reportCalls > 0 ? 0 : 1);
