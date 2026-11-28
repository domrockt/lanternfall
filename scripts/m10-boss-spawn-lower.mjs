#!/usr/bin/env node
// Lane m10-boss-spawn-lower: Boss-Spawn-Komposition vs. HP-Leiste (A10-Restpunkt).
//
// Misst im echten Spawn-Pfad (debugSpawnBoss -> spawnBossAt -> BossSystem.spawn +
// playBossIntroFx + Banner-Guard) das Boss-Sprite-Rect gegen das HP-Leisten-Rect
// der UI-Szene — pro rAF ueber das Spawn-Fenster, in beiden Abnahme-Formaten
// (640x360@1, 780x360@3). Zwei Szenarien:
//   idle      — Spawn ohne Eingabe (reiner Spawn-Moment, Intro-Zoom-Peak ~180 ms)
//   run-down  — Spawn + sofort 1,2 s Pfeil-runter (Kamera-Lerp folgt, Boss steigt
//               im Screen-Raum — der Fall "Boss am oberen Rand hinter der Leiste")
//
// Aufruf: node scripts/m10-boss-spawn-lower.mjs --tag=before|after
// Belege: shots/m10-boss-spawn-lower-<tag>-*.png + shots/m10-boss-spawn-lower-<tag>.json
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
const OUT_JSON = `shots/m10-boss-spawn-lower-${TAG}.json`;
const PNG_PREFIX = `shots/m10-boss-spawn-lower-${TAG}`;

// Spawn-Fenster: Intro-Zoom (170 ms hoch, ab 320 ms wieder runter) + Kamera-Lerp
// nach 1,2 s Lauf beruhigt. Peak-Screenshot bei ~180 ms (Zoom-Maximum).
const PEAK_MS = 180;
const WINDOW_MS = 1600;
const RUNDOWN_MS = 1200;

const VIEWS = [
  { name: "640x360@1", width: 640, height: 360, dpr: 1 },
  { name: "780x360@3", width: 780, height: 360, dpr: 3 },
];

// Monitor im Page-Kontext: pro rAF Sprite-Rect (worldView-Mapping, logische
// Screen-Pixel) vs. HP-Leisten-Rect (UI-Objekte) — identischer logischer Raum,
// weil worldView bei jedem Render-Teiler GAME_WIDTH x GAME_HEIGHT ist (#4658).
const MONITOR_FN = `
  window.__makeSpawnMonitor = (bossIndex, rundownMs) => {
    const m = {
      samples: [], last: null, frozen: false, frozenReason: null,
      peakAt: performance.now() + ${PEAK_MS}, stopAt: performance.now() + ${WINDOW_MS},
      rundownMs: rundownMs || 0, done: false, spawned: false,
      freezeOnPeak: !(rundownMs > 0),
    };
    const overlapOf = (r, bar) => {
      const h = r.x < bar.x + bar.w && bar.x < r.x + r.w;
      const v = r.y < bar.y + bar.h && bar.y < r.y + r.h;
      if (!h) return { overlap: false, penTop: 0, penBottom: 0 };
      return {
        overlap: h && v,
        penTop: Math.round((bar.y + bar.h - r.y) * 100) / 100,   // >0: Sprite ragt in die Leiste
        penBottom: Math.round((r.y + r.h - bar.y) * 100) / 100,
      };
    };
    const sample = () => {
      const game = window.__game;
      const run = game.scene.getScene("run");
      const ui = game.scene.getScene("ui");
      const cam = run.cameras.main;
      const wv = cam.worldView;
      // Neuester Boss-Agent (BossSystem.bosses) — NICHT find() ueber den
      // EnemyPool, da recycelte Slots alte Boss-Flags tragen koennen.
      const agents = run.bosses.bosses;
      const agent = agents.length ? agents[agents.length - 1] : null;
      const boss = agent && agent.enemy.alive && agent.enemy.hp > 0 ? agent.enemy : null;
      if (!boss) return;
      const s = boss.sprite;
      const rect = {
        x: Math.round((s.x - wv.x - s.displayWidth / 2) * 100) / 100,
        y: Math.round((s.y - wv.y - s.displayHeight / 2) * 100) / 100,
        w: Math.round(s.displayWidth * 100) / 100,
        h: Math.round(s.displayHeight * 100) / 100,
      };
      // HP-Leiste: ui.bossBarBg haengt im Container bossGroup (Origin 0/0.5,
      // y=46, h=12) — linke Kante = o.x, Oberkante = y - h/2.
      const bg = ui.bossBarBg;
      const bar = bg && ui.bossGroup.visible
        ? { x: bg.x, y: bg.y - bg.height / 2, w: bg.width, h: bg.height }
        : null;
      const o = bar ? overlapOf(rect, bar) : { overlap: false, penTop: 0, penBottom: 0 };
      const sample = {
        t: Math.round(performance.now() - m.t0),
        rect, hpBar: bar,
        overlap: o.overlap, penTop: o.penTop,
        zoom: Math.round(cam.zoom * 1000) / 1000,
        scrollY: Math.round(cam.scrollY * 10) / 10,
        worldViewTop: Math.round(wv.y * 10) / 10,
        spriteWorldY: Math.round(s.y * 10) / 10,
        bossIdx: boss.bossIndex,
        bossUid: boss.uid,
        tex: s.texture?.key, frame: s.frame?.name,
        camW: Math.round(cam.width * 10) / 10, camH: Math.round(cam.height * 10) / 10,
        wvW: Math.round(wv.width * 10) / 10, wvH: Math.round(wv.height * 10) / 10,
        wvX: Math.round(wv.x * 10) / 10,
        scrollX: Math.round(cam.scrollX * 10) / 10,
        playerScreenY: Math.round((run.player.y - wv.y) * 10) / 10,
      };
      m.samples.push(sample);
      m.last = sample;
      if (!m.frozen && (o.overlap || (m.freezeOnPeak && performance.now() >= m.peakAt))) {
        m.frozen = true;
        m.frozenReason = o.overlap ? "overlap" : "peak";
        m.pausedAt = performance.now();
        game.scene.pause("run");
        game.scene.pause("ui");
      }
    };
    const tick = () => {
      if (m.done) return;
      if (m.spawned) sample();
      if (performance.now() >= m.stopAt) { m.done = true; return; }
      requestAnimationFrame(tick);
    };
    m.resume = () => {
      if (m.pausedAt) {
        const d = performance.now() - m.pausedAt;
        m.peakAt += d;
        m.stopAt += d;
        m.pausedAt = null;
      }
      window.__game.scene.resume("run");
      window.__game.scene.resume("ui");
    };
    m.t0 = performance.now();
    m.spawnBoss = () => {
      m.spawned = true;
      m.t0 = performance.now();
      m.peakAt = m.t0 + ${PEAK_MS};
      m.stopAt = m.t0 + ${WINDOW_MS};
      window.__lf.spawnBoss(bossIndex);
      requestAnimationFrame(tick);
    };
    return m;
  };
`;

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
const results = [];

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
    await page.evaluate(async () => {
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
      window.__lf.skipTo(1000);
      window.__lf.teleport(2048, 2048);
      await new Promise((r) => setTimeout(r, 600)); // Kamera-Lerp beruhigen
    });

    const scenarios = [
      { name: "idle", bossIndex: 0, rundownMs: 0 },
      { name: "run-down", bossIndex: 4, rundownMs: RUNDOWN_MS },
    ];
    for (const sc of scenarios) {
      await page.evaluate(MONITOR_FN);
      await page.evaluate((s) => { window.__spawnMonitor = window.__makeSpawnMonitor(s.bossIndex, s.rundownMs); }, sc);
      await page.evaluate(() => window.__spawnMonitor.spawnBoss());
      if (sc.rundownMs > 0) {
        // Echter Spielerpfad: Pfeil-runter halten (Kamera-Lerp folgt, der Boss
        // steigt im Screen-Raum — Repro fuer "Boss hinter der HP-Leiste").
        await page.keyboard.down("ArrowDown");
        await page.waitForTimeout(sc.rundownMs);
        await page.keyboard.up("ArrowDown");
      }
      // Freeze passiert im Page-Kontext (Overlap bzw. Zoom-Peak im idle-
      // Szenario; run-down friert nur bei echtem Overlap) — Screenshot.
      await page.waitForFunction(
        () => window.__spawnMonitor && (window.__spawnMonitor.frozen || window.__spawnMonitor.done),
        { timeout: 8000 },
      );
      const frozenSample = await page.evaluate(() => window.__spawnMonitor.last);
      const bossDump = await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        const cam = run.cameras.main;
        const v = cam.worldView;
        return {
          cam: { w: cam.width, h: cam.height, zoom: cam.zoom, sx: cam.scrollX, sy: cam.scrollY },
          wv: { x: v.x, y: v.y, w: v.width, h: v.height },
          player: { x: run.player.x, y: run.player.y },
          agents: run.bosses.bosses.map((a) => ({
            uid: a.uid, idx: a.enemy.bossIndex, alive: a.enemy.alive, hp: a.enemy.hp,
            x: a.enemy.x, y: a.enemy.y, sx: a.enemy.sprite?.x, sy: a.enemy.sprite?.y,
            tex: a.enemy.sprite?.texture?.key, frame: a.enemy.sprite?.frame?.name,
            dw: a.enemy.sprite?.displayWidth, dh: a.enemy.sprite?.displayHeight,
            vis: a.enemy.sprite?.visible, alpha: a.enemy.sprite?.alpha, depth: a.enemy.sprite?.depth,
          })),
        };
      });
      const png = `${PNG_PREFIX}-${view.name.replace(/[@.]/g, "")}-${sc.name}.png`;
      await page.screenshot({ path: png });
      await page.evaluate(() => window.__spawnMonitor.resume());
      await page.waitForFunction(() => window.__spawnMonitor.done, { timeout: 10000 });
      const samples = await page.evaluate(() => window.__spawnMonitor.samples);
      const overlapFrames = samples.filter((s) => s.overlap);
      const worst = overlapFrames.length
        ? overlapFrames.reduce((a, b) => (b.penTop > a.penTop ? b : a))
        : null;
      results.push({
        view: view.name,
        scenario: sc.name,
        bossIndex: sc.bossIndex,
        frozenReason: await page.evaluate(() => window.__spawnMonitor.frozenReason),
        frozenSample,
        bossDump,
        png,
        frameCount: samples.length,
        overlapFrames: overlapFrames.length,
        maxPenTopPx: worst ? worst.penTop : 0,
        minTopBelowBarPx: Math.min(...samples.map((s) => (s.hpBar ? Math.round((s.rect.y - (s.hpBar.y + s.hpBar.h)) * 100) / 100 : 999))),
        worst,
        rendererInfo: await page.evaluate(() => {
          const info = window.__lf.rendererInfo();
          return { context: info.context, renderer: info.renderer, vendor: info.vendor, version: info.version };
        }),
      });
      console.log(`[m10-boss-spawn-lower] ${view.name} ${sc.name}: frames=${results.at(-1).frameCount} overlapFrames=${results.at(-1).overlapFrames} maxPenTop=${results.at(-1).maxPenTopPx}px -> ${png}`);
      // Boss fuer das zweite Szenario aus dem Feld nehmen (Feld leeren).
      await page.evaluate(() => {
        const run = window.__game.scene.getScene("run");
        for (const e of run.enemies.active) if (e.boss && e.alive) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
        run.bosses.clear();
        window.__game.scene.getScene("ui").hideBossBar?.();
      });
      await page.waitForTimeout(150);
    }
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

// Abnahme-Gate: SwiftShader-Belege sind ungueltig; jsErrors = 0.
for (const r of results) {
  if (!r.rendererInfo.renderer || /swiftshader|software|llvmpipe/i.test(r.rendererInfo.renderer)) {
    throw new Error(`Ungueltiger Renderer "${r.rendererInfo.renderer}" (${r.view}) — Beleg ungueltig`);
  }
}
if (errors.length > 0) throw new Error(`JS-Fehler im Lauf: ${errors.join(" | ")}`);

const totalOverlap = results.reduce((a, r) => a + r.overlapFrames, 0);
writeFileSync(OUT_JSON, JSON.stringify({
  tag: TAG,
  generatedAt: new Date().toISOString(),
  windowMs: WINDOW_MS,
  peakMs: PEAK_MS,
  jsErrors: errors.length,
  totalOverlapFrames: totalOverlap,
  results,
  note: "Boss-Spawn-Moment: debugSpawnBoss-Pfad (Komposition + Intro-Zoom + Banner-Guard). Sprite-Rect aus worldView-Mapping (logische Screen-Pixel), HP-Leiste aus UI-Objekten. Szenarien: idle (kein Input) und run-down (1,2 s Pfeil-runter, Kamera-Lerp).",
}, null, 2));
console.log(`[m10-boss-spawn-lower] -> ${OUT_JSON} (totalOverlapFrames=${totalOverlap}, jsErrors=0, renderer geprueft)`);
