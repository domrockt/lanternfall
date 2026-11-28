#!/usr/bin/env node
// M3-Abnahme Moorwasser: Spieler-Slow frame-genau (logische Float-Position),
// Gegner-Slow, Spritzer und Screenshots Gras/Wasser. Exit != 0 bei Verstoß.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { checkScreenshot } from "./terrain-coverage.mjs";

const RATIO_MIN = 0.55;
const RATIO_MAX = 0.68;
const RATIO_TARGET = 0.6;

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];

const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const result = {};
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.setTimeScale(1);
  });
  await page.waitForTimeout(300);

  // Große zusammenhängende Wasserfläche und wasserfreie Grasfläche finden.
  const tiles = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const px = sc.posX;
    const py = sc.posY;
    let water = null;
    let grass = null;
    for (let r = -700; r <= 700; r += 8) {
      for (let c = -700; c <= 700; c += 8) {
        const x = Math.round(px + c);
        const y = Math.round(py + r);
        const kind = sc.ground.kindAt(x, y);
        let waterScore = 0;
        let grassOk = kind !== "water";
        for (let dy = -48; dy <= 48; dy += 8) {
          for (let dx = -48; dx <= 48; dx += 8) {
            const k = sc.ground.kindAt(x + dx, y + dy);
            if (k === "water") waterScore++;
            if (k === "water") grassOk = false;
          }
        }
        // 169 waere ein vollkommen geschlossener See (13x13 Samples). Nach dem
        // organischen Ufer-/Bucht-Umbau sind 140 (=83 %) ein verlaessliches
        // "grosse Wasserflaeche"-Kriterium, ohne einen kuenstlichen See zu suchen.
        if (!water && waterScore >= 140) water = { x, y };
        if (!grass && kind === "grass" && grassOk) grass = { x, y };
      }
    }
    return { water, grass, start: { x: Math.round(px), y: Math.round(py) } };
  });

  if (!tiles.water || !tiles.grass) throw new Error("Keine große Wasser-/Grasfläche gefunden");

  /** Frame-genau: posX (logisch) und player.x (Darstellung) pro postupdate. */
  const startRecording = async () => {
    await page.evaluate(() => {
      const sc = window.__game.scene.getScene("run");
      window.__ftRec = { samples: [], active: true };
      if (!sc.__ftHook) {
        sc.events.on("postupdate", () => {
          const rec = window.__ftRec;
          if (!rec || !rec.active) return;
          rec.samples.push({
            x: sc.posX,
            displayX: sc.player.x,
            t: performance.now(),
            kind: sc.ground.kindAt(sc.posX, sc.posY),
          });
        });
        sc.__ftHook = true;
      }
    });
  };

  const measureRun = async (pos, holdMs = 900) => {
    await page.evaluate((p) => window.__lf.teleport(p.x, p.y), pos);
    await page.waitForTimeout(350);
    await page.keyboard.down("KeyD");
    await page.waitForTimeout(80); // Tastenrahmen abwarten, keine Stand-Frames messen
    await startRecording();
    await page.waitForTimeout(holdMs);
    await page.keyboard.up("KeyD");
    return page.evaluate(() => {
      window.__ftRec.active = false;
      return window.__ftRec.samples;
    });
  };

  const speedFrom = (samples, kind) => {
    // Nur zusammenhaengende Laeufe derselben Art messen: sonst koennte eine
    // Landzunge zwischen zwei Wasserflaechen die Wasserzeit verfaelschen.
    let run = [];
    let best = [];
    for (const s of samples) {
      if (s.kind === kind) {
        run.push(s);
        if (run.length > best.length) best = run.slice();
      } else {
        run = [];
      }
    }
    if (best.length < 5) return { speed: 0, displaySpeed: 0, frames: best.length, kindAfter: null, contiguous: false };
    const a = best[0];
    const b = best[best.length - 1];
    const dt = (b.t - a.t) / 1000;
    return {
      speed: dt > 0 ? Math.abs(b.x - a.x) / dt : 0,
      displaySpeed: dt > 0 ? Math.abs(b.displayX - a.displayX) / dt : 0,
      frames: best.length,
      kindAfter: best[best.length - 1].kind,
      contiguous: best.length === samples.filter((s) => s.kind === kind).length,
      start: { x: Math.round(a.x), y: Math.round(a.y) },
      end: { x: Math.round(b.x), y: Math.round(b.y) },
    };
  };

  // Gras: keine Spritzer, volle Geschwindigkeit.
  await page.evaluate((p) => window.__lf.teleport(p.x, p.y), tiles.grass);
  await page.waitForTimeout(350);
  await page.screenshot({ path: "shots/m3-water-grass.png" });
  const grassSamples = await measureRun(tiles.grass);
  const grassRun = speedFrom(grassSamples, "grass");

  // Wasser: erst die Bewegung messen (kein Screenshot-Stall in der Messzeit),
  // danach Spritzer zählen und während der Bewegung screenshotten.
  await page.evaluate((p) => window.__lf.teleport(p.x, p.y), tiles.water);
  await page.waitForTimeout(350);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(80);
  await startRecording();
  await page.waitForTimeout(900);
  const waterSamples = await page.evaluate(() => {
    window.__ftRec.active = false;
    return window.__ftRec.samples;
  });
  const splashParticles = await page.evaluate(() => {
    const sc = window.__game.scene.getScene("run");
    const keyOf = (o) => {
      const f = o.frame?.name;
      return f && f !== "__BASE" ? f : o.texture?.key;
    };
    return sc.children.list.filter((o) =>
      keyOf(o) === "fx_spark" && o.depth === 6 && o.alpha > 0.3
    ).length;
  });
  await page.screenshot({ path: "shots/m3-water.png" });
  await page.keyboard.up("KeyD");
  const waterRun = speedFrom(waterSamples, "water");

  const ratio = waterRun.speed / Math.max(1, grassRun.speed);
  const ratioDisplay = waterRun.displaySpeed / Math.max(1, grassRun.displaySpeed);

  // Gegner im Wasser: Tank mit hoher HP, kurze Strecke vollständig im Wasser.
  const enemySlow = await page.evaluate(async (p) => {
    const sc = window.__game.scene.getScene("run");
    window.__lf.teleport(p.x - 120, p.y);
    window.__lf.spawnEnemy("golem", 1);
    await new Promise((r) => setTimeout(r, 150));
    const e = sc.enemies.active.find((x) => x.alive && x.def.id === "golem");
    if (!e) return null;
    e.hp = 1e9;
    e.x = p.x + 40;
    e.y = p.y;
    e.vx = 0;
    e.vy = 0;
    await new Promise((r) => setTimeout(r, 120));
    const x0 = e.x;
    const y0 = e.y;
    const kindStart = sc.ground.kindAt(e.x, e.y);
    await new Promise((r) => setTimeout(r, 600));
    const dist = Math.hypot(e.x - x0, e.y - y0);
    return {
      pxPerSec: Math.round((dist / 0.6) * 10) / 10,
      defSpeed: e.def.speed,
      kindStart,
      kindEnd: sc.ground.kindAt(e.x, e.y),
    };
  }, tiles.water);

  result.clamp = {
    targetRatio: RATIO_TARGET,
    acceptedRatio: [RATIO_MIN, RATIO_MAX],
    grassSpeed: Math.round(grassRun.speed * 10) / 10,
    grassDisplaySpeed: Math.round(grassRun.displaySpeed * 10) / 10,
    waterSpeed: Math.round(waterRun.speed * 10) / 10,
    waterDisplaySpeed: Math.round(waterRun.displaySpeed * 10) / 10,
    ratio: Math.round(ratio * 100) / 100,
    ratioDisplay: Math.round(ratioDisplay * 100) / 100,
    grassFrames: grassRun.frames,
    waterFrames: waterRun.frames,
    grassKindAfter: grassRun.kindAfter,
    waterKindAfter: waterRun.kindAfter,
    splashParticles,
    waterTile: tiles.water,
    grassTile: tiles.grass,
  };
  result.enemy = enemySlow;
  result.enemyOk = Boolean(
    enemySlow &&
    enemySlow.kindStart === "water" &&
    enemySlow.kindEnd === "water" &&
    enemySlow.pxPerSec <= enemySlow.defSpeed * 0.75,
  );
  result.speedOk =
    grassRun.speed > 40 &&
    ratio >= RATIO_MIN &&
    ratio <= RATIO_MAX &&
    waterRun.kindAfter === "water" &&
    grassRun.kindAfter === "grass";
  result.splashOk = splashParticles >= 3;

  // ---- Terrain-Schwarz-Pixel-Guard (Lane m10-terrain-hole-guard, K2) ----
  // Festes Abnahme-Kriterium „kein Pixel der Spielflaeche ohne Terrain“:
  // je Format Screenshots Start + nach 60 Spiel-Sekunden Lauf in 8 Richtungen,
  // dann (im Node-Teil) Pruefung auf zusammenhaengende reine Schwarz-Flaechen
  // (r,g,b < 6) im Spielfeld-Rect. Gleiche Prueffunktion wie der Suite-Test.
  const SIZES = [
    { width: 960, height: 540 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ];
  const DIRECTIONS = [
    ["ArrowRight"], ["ArrowRight", "ArrowUp"], ["ArrowUp"], ["ArrowLeft", "ArrowUp"],
    ["ArrowLeft"], ["ArrowLeft", "ArrowDown"], ["ArrowDown"], ["ArrowRight", "ArrowDown"],
  ];
  const PHASE_MS = Math.round(7500 / 8); // 7.5 Spiel-Sekunden je Richtung (timeScale 8)
  const coverage = [];
  for (const size of SIZES) {
    const gpage = await browser.newPage({ viewport: size });
    gpage.on("pageerror", (e) => errors.push(`[guard ${size.width}] ${e}`));
    gpage.on("console", (m) => { if (m.type() === "error") errors.push(`[guard ${size.width}] ${m.text()}`); });
    try {
      await gpage.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
      await startRun(gpage);
      await gpage.evaluate(() => {
        window.__lf.god(true);
        window.__lf.setSuppressLevelUps(true); // keine Overlays im Prueffenster
        window.__lf.setTimeScale(8); // 60 Spiel-Sekunden in ~8 s Echtzeit
      });
      await gpage.waitForTimeout(300);
      const startShot = await gpage.screenshot();
      for (const keys of DIRECTIONS) {
        for (const k of keys) await gpage.keyboard.down(k);
        await gpage.waitForTimeout(PHASE_MS);
        for (const k of keys) await gpage.keyboard.up(k);
      }
      const endShot = await gpage.screenshot();
      const renderer = await gpage.evaluate(() => window.__lf.rendererInfo());
      const startCov = checkScreenshot(startShot);
      const endCov = checkScreenshot(endShot);
      coverage.push({
        size: `${size.width}x${size.height}`,
        renderer: { context: renderer.context, renderer: renderer.renderer, vendor: renderer.vendor },
        start: startCov,
        end: endCov,
      });
      writeFileSync(`shots/m10-terrain-guard-${size.width}-end.png`, endShot);
    } finally {
      await gpage.close();
    }
  }
  result.coverage = coverage;
  result.coverageOk = coverage.length === SIZES.length && coverage.every((c) => c.start.ok && c.end.ok);
  const rendererStrings = coverage.map((c) => c.renderer.renderer).join(", ");
  // Beleg-Pflicht: Software-Renderer machen visuelle Belege ungueltig.
  result.rendererValid = coverage.length === SIZES.length &&
    !/swiftshader|llvmpipe|software/i.test(rendererStrings);
  result.coverageSummary = coverage.map(
    (c) => `${c.size}: maxRegion ${c.start.maxRegion}/${c.end.maxRegion} (start/end), ok=${c.start.ok}/${c.end.ok}`,
  );
} finally {
  await page.close();
  await browser.close();
  server.stop();
}

result.jsErrors = errors;
result.passed = Boolean(
  result.speedOk && result.splashOk && result.enemyOk &&
  result.coverageOk && result.rendererValid && errors.length === 0,
);
writeFileSync("shots/m3-terrain.json", JSON.stringify(result, null, 2));
writeFileSync("shots/m10-terrain-guard.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
console.log(
  `verify-terrain: Gras ${result.clamp?.grassSpeed} px/s, Wasser ${result.clamp?.waterSpeed} px/s, ` +
  `Ratio ${result.clamp?.ratio} (Ziel ${RATIO_TARGET}, erlaubt ${RATIO_MIN}-${RATIO_MAX}), ` +
  `Spritzer ${result.clamp?.splashParticles}, Gegner ${result.enemy?.pxPerSec}/${result.enemy?.defSpeed} px/s, ` +
  `Schwarz-Pixel-Guard ${(result.coverageSummary ?? []).join(" | ") || "n/a"}, ` +
  `Renderer ${result.rendererValid ? "gueltig" : "UNGUeLTIG"} -> ` +
  `${result.passed ? "OK" : "FAIL"}`
);
process.exit(result.passed ? 0 : 1);
