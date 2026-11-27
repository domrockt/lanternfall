#!/usr/bin/env node
// M10-Damage-Calm: Schadenszahlen-Flut im Chaos-Frame belegen.
// Minute-25-Frame (300+ Gegner, 6 Waffen Stufe 8, Seed 1, god + autoPlay)
// rendern und zaehlen:
//   - sichtbare Damage-Labels (active && text.visible)
//   - Ueberlappungen zwischen Label-Rechtecken (Paare + max. Dichte)
//   - Krit- vs. Normal-Labels (Farbe amber = Krit)
// Output: shots/m10-damage-calm-<tag>.json + .png
//
// Keine FPS-/Echtzeitmessung -> bewusst OHNE flock (feste Substeps, lastunabhaengig).
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
const TAG = String(argOf("tag", "before"));
const MINUTE = Number(argOf("minute", "1490")) || 1490;
const ENEMIES = Number(argOf("enemies", "340")) || 340;
const SAMPLE_MS = Number(argOf("sample", "6000")) || 6000;
const OUT_JSON = String(argOf("json", `shots/m10-damage-calm-${TAG}.json`));
const OUT_PNG = String(argOf("png", `shots/m10-damage-calm-${TAG}.png`));
const WARMUP_MS = Number(argOf("warmup", "2500")) || 2500;
// --tight: Gegner eng um den Spieler packen (Massen-Haufen), statt ueber den
// View zu verteilen. Reproduziert die "26/30"-Flut im Sub-Threshold-Regime
// (< 120 Gegner, LOD full, pro Gegner ein Label).
const TIGHT = argv.includes("--tight");

// Vier gut verteilte Archetypen (wie m10-damage-batch), damit alle Waffen treffen.
const MIX = [["bog_rat", 0.35], ["wisp", 0.25], ["bogzombie", 0.2], ["crow", 0.2]];
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

  // Minute 25 + Last aufbauen: 300+ Gegner unsterblich ueber den View verteilen,
  // damit der Chaos-Frame laufend Treffer produziert.
  await page.evaluate(({ minute, enemies, weapons, mix, tight }) => {
    window.__lf.skipTo(minute);
    window.__lf.setTimeScale(1);
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    for (const id of weapons) window.__lf.addWeapon(id, 8);
    const run = window.__game.scene.getScene("run");
    const px = window.__lf.state().player.x;
    const py = window.__lf.state().player.y;
    let spawned = 0;
    for (const [id, share] of mix) {
      const n = Math.max(1, Math.round(enemies * share));
      window.__lf.spawnEnemy(id, n);
      spawned += n;
    }
    let i = 0;
    for (const e of run.enemies.active) {
      if (!e.alive) continue;
      const side = i % 2 === 0 ? 1 : -1;
      e.x = px + side * (tight ? 8 + ((i * 13) % 70) : 10 + ((i * 37) % 190));
      e.y = py + (tight ? (((i * 29) % 90) - 45) : (((i * 53) % 220) - 110));
      e.hp = 1e9;
      e.maxHp = 1e9;
      e.damage = 0;
      i += 1;
    }
  }, { minute: MINUTE, enemies: ENEMIES, weapons: WEAPONS, mix: MIX, tight: TIGHT });

  // Report-Hook: gemeldete Treffer/Schaden zaehlen (Referenz fuer Summen-Erhalt).
  await page.evaluate(() => {
    const sys = window.__game.scene.getScene("run").combat.damageNumbers;
    const c = { reportCalls: 0, reportDamage: 0 };
    const orig = sys.report.bind(sys);
    sys.report = function (uid, x, y, damage, crit) {
      c.reportCalls += 1;
      c.reportDamage += damage;
      return orig(uid, x, y, damage, crit);
    };
    window.__m10calm = { c, sys };
  });

  // Warmup, damit Aggregate/Views im Steady State sind.
  await page.waitForTimeout(WARMUP_MS);

  // Probe ueber SAMPLE_MS: je Frame sichtbare Labels + Ueberlappungen samplen,
  // Maximum markieren. Screenshot direkt danach (Labels leben ~1 s).
  const sampled = await page.evaluate(async ({ sampleMs }) => {
    const { sys, c } = window.__m10calm;
    const run = window.__game.scene.getScene("run");
    const cam = run.cameras.main;
    const AMBER = 20, LANTERN = 21;
    const snap = () => {
      const visible = [];
      for (const v of sys.views) {
        if (!v.active || !v.text.visible) continue;
        const t = v.text;
        visible.push({
          label: t.text,
          x: Math.round(t.x - cam.scrollX),
          y: Math.round(t.y - cam.scrollY),
          w: t.width,
          h: t.height,
          big: v.big,
          scale: v.scale,
          color: v.colorApplied,
        });
      }
      let overlapPairs = 0;
      const overlaps = new Array(visible.length).fill(0);
      for (let a = 0; a < visible.length; a++) {
        for (let b = a + 1; b < visible.length; b++) {
          const A = visible[a], B = visible[b];
          const ox = Math.min(A.x + A.w / 2, B.x + B.w / 2) - Math.max(A.x - A.w / 2, B.x - B.w / 2);
          const oy = Math.min(A.y + A.h / 2, B.y + B.h / 2) - Math.max(A.y - A.h / 2, B.y - B.h / 2);
          if (ox > 0 && oy > 0) {
            overlapPairs += 1;
            overlaps[a] += 1;
            overlaps[b] += 1;
          }
        }
      }
      return {
        visible,
        overlapPairs,
        maxOverlapsPerLabel: visible.length ? Math.max(...overlaps) : 0,
        crit: visible.filter((l) => l.color === AMBER).length,
        big: visible.filter((l) => l.big || l.scale > 1 || l.color === LANTERN).length,
        activeViews: sys.views.filter((v) => v.active).length,
        entries: sys.entries.length,
        aggregate: sys.aggregateActiveForTest ?? null,
      };
    };
    const startCalls = c.reportCalls;
    const startDamage = c.reportDamage;
    let frames = 0;
    let maxVisible = 0;
    let maxOverlapPairs = 0;
    let maxOverlapsPerLabel = 0;
    let maxActive = 0;
    let maxEntries = 0;
    let sumVisible = 0;
    let worst = null;
    const start = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        // Level-ups sofort wegklicken, damit der Run nicht pausiert.
        if (window.__lf.stats().levelUpOpen) {
          try { window.__lf.pickLevelUp(0); } catch { /* egal */ }
        }
        const s = snap();
        frames += 1;
        sumVisible += s.visible.length;
        if (s.visible.length > maxVisible) { maxVisible = s.visible.length; worst = s; }
        maxOverlapPairs = Math.max(maxOverlapPairs, s.overlapPairs);
        maxOverlapsPerLabel = Math.max(maxOverlapsPerLabel, s.maxOverlapsPerLabel);
        maxActive = Math.max(maxActive, s.activeViews);
        maxEntries = Math.max(maxEntries, s.entries);
        if (performance.now() - start >= sampleMs) resolve();
        else requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const elapsedMs = performance.now() - start;
    return {
      frames,
      elapsedMs: Math.round(elapsedMs),
      maxVisibleLabels: maxVisible,
      avgVisibleLabels: frames ? Math.round((sumVisible / frames) * 100) / 100 : 0,
      maxOverlapPairs,
      maxOverlapsPerLabel,
      maxActiveViews: maxActive,
      maxEntries,
      reportCalls: c.reportCalls - startCalls,
      reportPerSecond: Math.round(((c.reportCalls - startCalls) / (elapsedMs / 1000)) * 10) / 10,
      reportedDamage: Math.round((c.reportDamage - startDamage) * 100) / 100,
      worst,
    };
  }, { sampleMs: SAMPLE_MS });

  const stats = await page.evaluate(() => {
    const { sys } = window.__m10calm;
    const run = window.__game.scene.getScene("run");
    const visible = sys.views.filter((v) => v.active && v.text.visible).length;
    return {
      visibleLabels: visible,
      totalDamageShown: Math.round(sys.entries.reduce((a, e) => a + e.damage, 0) * 100) / 100,
      enemiesAlive: run.enemies.count,
    };
  });

  await page.screenshot({ path: OUT_PNG });
  result = {
    tag: TAG,
    generatedAt: new Date().toISOString(),
    minute: MINUTE,
    enemiesTarget: ENEMIES,
    weapons: WEAPONS,
    ...stats,
    ...sampled,
    worstFrame: sampled.worst ? { ...sampled.worst, visible: undefined } : null,
    labelsAtMax: sampled.worst ? sampled.worst.visible : [],
    jsErrors: errors,
  };
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(OUT_JSON, JSON.stringify(result, null, 2));
const j = (o) => JSON.stringify(o);
console.log(
  `m10-damage-calm[${TAG}]: maxVisibleLabels=${result.maxVisibleLabels} avg=${result.avgVisibleLabels} ` +
  `maxOverlapPairs=${result.maxOverlapPairs} maxOverlapsPerLabel=${result.maxOverlapsPerLabel} ` +
  `reports/s=${result.reportPerSecond} entries(max)=${result.maxEntries} enemies=${result.enemiesAlive} jsErrors=${result.jsErrors.length}`,
);
console.log(j({ json: OUT_JSON, png: OUT_PNG }));
