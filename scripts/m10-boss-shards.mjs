#!/usr/bin/env node
// m10-boss-death-shards: Ist-/Nachher-Messung des Boss-Tod-Shard-Pfads (ParticleSystem).
//
//   node scripts/m10-boss-shards.mjs --tag=before
//   node scripts/m10-boss-shards.mjs --tag=after
//
// Stellt den Boss-Tod nach (spawnBoss + hp=0 -> collectKills -> CombatSystem.killsFx
// mit particles.burst("fx_boss_core") + Run.playBossDeathFx mit particles.shards
// ("fx_death_bone"/"fx_fire")) im Horde-Kontext (>= 250 Gegner, reduced-LOD, aktive
// fxAlpha-Daempfung) und misst pro Partikel-Key:
//   - Rendermode je Partikel (sprite.blendMode: 0 = NORMAL, 1 = ADD)
//   - Alpha-Werte (sprite.alpha, alphaFrom) min/max
//   - Glow-Slot-Belegung (p.glow, geteilter Overdraw-Deckel mit FxSystem)
//   - Screenshot im Shard-Peak (Shard-Partikel sichtbar, nicht nach dem Effekt)
//
// Muster: scripts/m10-boss-fx-contrast.mjs (gleicher Horde-Aufbau, gleiche Views).
// Keine FPS-/Echtzeit-Messung -> laeuft OHNE flock. Ein Lauf, kein Tuning-Loop.
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
const OUT_JSON = `shots/m10-boss-shards-${TAG}.json`;
const OUT_PNG_PREFIX = `shots/m10-boss-shards-${TAG}`;
// Shard-Peak: shards() feuert im delayedCall(260); Shard-Life 0,7-0,9 s. 120 ms
// nach Sichtbarkeit sitzen die Splitter mitten im Flug und fx_boss_core (Kern,
// Life 0,9 s) ist noch voll da — beides im selben Bild.
const SHARD_DELAY_MS = 120;

// Horde 270 + Top-up auf HORDE_TOTAL (gemessen: 283 lebend — der Frame-Budget-
// Regler frisst einen Teil, daher oben auffuellen): reduced-LOD, aktive
// fxAlpha-Daempfung. Mischung mehrerer Stufen/Silhouetten wie in m10-boss-fx-contrast.
const HORDE = [
  ["bog_rat", 60], ["wisp", 40], ["bogzombie", 30], ["crow", 30],
  ["skeleton", 25], ["bat", 25], ["ghoul", 30], ["spider", 30],
];
const HORDE_TOTAL = HORDE.reduce((a, b) => a + b[1], 0); // 270

const VIEWS = [
  { name: "640x360@1", width: 640, height: 360, dpr: 1 },
  { name: "780x360@3", width: 780, height: 360, dpr: 3 },
];

// Minute 16 (SKIP_SECOND=1000): Gegner-Deckel 308 (640) bzw. 262 (780) ->
// reduced-LOD. Natuerliche Boss-Spawns per bossFlags abschalten (nur Mess-Harness).
const SKIP_SECOND = 1000;

/** Aggregiert die aktiven Partikel des Pools je Textur-Key. */
function summarizeParticles(page) {
  return page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const pool = run.combat.particles;
    const out = {};
    const blendName = (m) => (m === 0 ? "NORMAL" : m === 1 ? "ADD" : String(m));
    for (const p of pool.active) {
      if (!p.active) continue;
      const key = p.frames[0] || "fx_spark";
      const e = (out[key] ??= {
        count: 0, blend: {}, glow: 0,
        alphaMin: 1, alphaMax: 0, alphaFromMin: 1, alphaFromMax: 0,
        sample: null,
      });
      e.count++;
      const b = blendName(p.sprite.blendMode);
      e.blend[b] = (e.blend[b] ?? 0) + 1;
      if (p.glow) e.glow++;
      e.alphaMin = Math.min(e.alphaMin, p.sprite.alpha);
      e.alphaMax = Math.max(e.alphaMax, p.sprite.alpha);
      e.alphaFromMin = Math.min(e.alphaFromMin, p.alphaFrom);
      e.alphaFromMax = Math.max(e.alphaFromMax, p.alphaFrom);
      if (!e.sample) {
        e.sample = { key, additive: p.additive, glow: p.glow, blend: b,
          alpha: Math.round(p.sprite.alpha * 1000) / 1000,
          alphaFrom: Math.round(p.alphaFrom * 1000) / 1000 };
      }
    }
    const round = (v) => Math.round(v * 1000) / 1000;
    for (const e of Object.values(out)) {
      e.alphaMin = round(e.alphaMin); e.alphaMax = round(e.alphaMax);
      e.alphaFromMin = round(e.alphaFromMin); e.alphaFromMax = round(e.alphaFromMax);
    }
    return {
      keys: out,
      poolCount: pool.active.filter((p) => p.active).length,
      alphaScale: pool.alphaScale,
      glowUsed: pool.glowUsed,
      glowCap: pool.glowCap,
    };
  });
}

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
const errors = [];
const views = [];

try {
  for (const view of VIEWS) {
    const page = await browser.newPage({
      viewport: { width: view.width, height: view.height },
      deviceScaleFactor: view.dpr,
    });
    page.on("pageerror", (e) => errors.push(`[${view.name}] ${e}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`[${view.name}] ${m.text()}`); });

    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate(async ({ skipSecond, horde }) => {
      const run = window.__game.scene.getScene("run");
      window.__lf.god(true);
      window.__lf.autoPlay(false);
      window.__lf.setSuppressLevelUps(true);
      window.__lf.setTimeScale(1);
      // Natuerliche Boss-Spawns abschalten (nur Mess-Harness):
      for (let i = 0; i < 6; i++) run.bossFlags[i] = true;
      // Natuerliche Spawns abschalten + Bestand leeren:
      window.__game.registry.set("lf-density", 0);
      run.registry.set("lf-density", 0);
      for (const e of run.enemies.active) if (e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
      await new Promise((r) => setTimeout(r, 200));
      window.__lf.skipTo(skipSecond);
      window.__lf.teleport(2048, 2048);
      await new Promise((r) => setTimeout(r, 150));
      for (const [id, n] of horde) window.__lf.spawnEnemy(id, n);
      await new Promise((r) => setTimeout(r, 150));
    }, { skipSecond: SKIP_SECOND, horde: HORDE });

    // Horde oben auffuellen (Frame-Budget-Regler kann unter den Deckel druecken).
    await page.evaluate((total) => {
      const run = window.__game.scene.getScene("run");
      const alive = run.enemies.active.filter((e) => e.alive).length;
      if (alive < total) window.__lf.spawnEnemy("bog_rat", total - alive);
    }, HORDE_TOTAL);

    // Boss-Tod ausloesen: hp=0 -> collectKills -> playBossDeathFx (shards
    // fx_death_bone/fx_fire @260 ms). Der echte Todespfad laeuft zusaetzlich
    // hitEnemy -> killsFx (particles.burst "fx_boss_core" + fx_halo); der
    // Direkt-hp-Alias umgeht hitEnemy, daher ruft der Harness killsFx hier
    // explizit — genau wie im Spiel laufen BEIDE Pfade gleichzeitig.
    await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      window.__lf.spawnBoss(0);
      const boss = run.enemies.active.find((e) => e.boss);
      if (boss) {
        boss.hp = 0;
        run.combat.killsFx(boss);
      }
    });

    // Warten bis die Shard-Partikel da sind (fx_boss_core sofort, shards im
    // delayedCall 260 ms nach Tod).
    await page.waitForFunction(() => {
      const run = window.__game.scene.getScene("run");
      return run.combat.particles.active.some(
        (p) => p.active && (p.frames[0] === "fx_death_bone" || p.frames[0] === "fx_death_fire" || p.frames[0] === "fx_boss_core"),
      );
    }, { timeout: 5000 });
    // Shard-Peak: shards feuern im delayedCall(260) — bis sie sichtbar sind,
    // liegen fx_boss_core-Partikel (Life 0,7-1,4 s) noch vor. 120 ms nach dem
    // ersten Shard sitzen beide Gruppen mitten im Effekt.
    await page.waitForFunction(() => {
      const run = window.__game.scene.getScene("run");
      return run.combat.particles.active.some(
        (p) => p.active && (p.frames[0] === "fx_death_bone" || p.frames[0] === "fx_death_fire"),
      );
    }, { timeout: 5000 });
    await page.waitForTimeout(SHARD_DELAY_MS);

    // Messung VOR dem Freeze (Werte aendern sich im Freeze nicht, aber so ist
    // der Zeitpunkt exakt der des Screenshots).
    const particles = await summarizeParticles(page);
    const rendererInfo = await page.evaluate(() => {
      const info = window.__lf.rendererInfo();
      return { context: info.context, renderer: info.renderer, vendor: info.vendor, version: info.version };
    });
    const enemies = await page.evaluate(() => window.__lf.state().enemies);

    // Szene einfrieren (FX-Update + Kamera stehen, Rendering bleibt) -> Screenshot.
    await page.evaluate(() => window.__game.scene.pause("run"));
    const png = `${OUT_PNG_PREFIX}-${view.name.replace(/[@.]/g, "")}.png`;
    await page.screenshot({ path: png });
    await page.evaluate(() => window.__game.scene.resume("run"));

    views.push({ view: view.name, png, enemies, particles, rendererInfo });
    console.log(`[m10-boss-shards] ${view.name} -> ${png} (enemies=${enemies}, particleKeys=${Object.keys(particles.keys).join(",")}, alphaScale=${particles.alphaScale}, renderer=${rendererInfo.renderer})`);
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

// Abnahme-Gate: SwiftShader-Belege sind ungueltig; jsErrors = 0.
for (const v of views) {
  if (!v.rendererInfo.renderer || /swiftshader|software|llvmpipe/i.test(v.rendererInfo.renderer)) {
    throw new Error(`Ungueltiger Renderer "${v.rendererInfo.renderer}" (${v.view}) — Beleg ungueltig`);
  }
}
if (errors.length > 0) throw new Error(`JS-Fehler im Lauf: ${errors.join(" | ")}`);

const mainPng = views[views.length - 1].png;
writeFileSync(OUT_JSON, JSON.stringify({
  tag: TAG,
  generatedAt: new Date().toISOString(),
  views,
  mainPng,
  jsErrors: errors.length,
  note: "Boss-Tod-Pfad (beide, wie im Spiel): CombatSystem.killsFx burst(fx_boss_core/fx_halo) + Run.playBossDeathFx shards(fx_death_bone/fx_fire). Gemessen im Shard-Peak (120 ms nach delayedCall(260)).",
}, null, 2));
console.log(`[m10-boss-shards] -> ${OUT_JSON} (jsErrors=0, renderer geprueft)`);
