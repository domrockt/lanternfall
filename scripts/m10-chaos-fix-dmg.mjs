#!/usr/bin/env node
// m10-chaos-fix-dmg: Vorher/Nachher-Messung der Damage-Number-Lesbarkeit (Lane
// m10-chaos-fix-dmg-overlap, Befund B4 aus m10-chaos-legibility-audit:
// "184526!" ueberlappt "4577" — keine Ueberlappungsvermeidung, 6-stellige
// Werte dominieren den Bildraum).
//
// Szenarien (je 3 Frames, Seed fest):
//   - m25:       Minute-25-Chaos (skipTo 1490, 6 Evolutionen Lv8, ~300 Gegner)
//   - stress500: 500er-Stress (Nachspawn auf 500)
// Je Frame werden aus dem Lauf gelesen (rein lesend, kein Spielcode-Aufsatz):
//   - aktive Damage-Label-Rects (Screen-Space, Glyphen 6x7, Scale)
//   - ueberlappende Label-Paare + betroffene Labels
//   - max. Labelbreite (px) und max. Zeichen inkl. "!"
//   - verdeckte Sprite-Zentren (Gegner-Mitte liegt in einem Label-Rect)
//   - Screenshots shots/m10-chaos-fix-dmg-<tag>-<szene>-f<N>.png
//
// Keine FPS-Messung -> kein flock (Momentaufnahmen, feste Substeps).
// Aufruf: node scripts/m10-chaos-fix-dmg.mjs --tag=before|after
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
const FRAMES = Math.max(1, Number(argOf("frames", "3")));
const FRAME_GAP_MS = Number(argOf("frame-gap-ms", "350"));
const OUT_JSON = `shots/m10-chaos-fix-dmg-${TAG}.json`;

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];

// Liest aktive Damage-Label-Rects + Gegner-Zentren direkt aus dem Lauf
// (private Felder sind zur Laufzeit erreichbar; nur Lesen).
const SNAP = () => {
  const game = window.__game;
  const run = game.scene.getScene("run");
  const cam = run.cameras.main;
  const dn = run.combat?.damageNumbers;
  const labels = [];
  for (const v of dn?.views ?? []) {
    if (!v.active || !v.text?.visible) continue;
    const chars = String(v.text.value ?? "").length;
    if (chars <= 0) continue;
    const scale = v.scaleApplied || 1;
    const w = Math.ceil((chars * 6 - 1) * scale);
    const h = Math.ceil(7 * scale);
    labels.push({
      key: v.key,
      text: String(v.text.value),
      x: v.text.x - cam.scrollX,
      y: v.text.y - cam.scrollY,
      w, h, chars,
    });
  }
  const enemies = [];
  for (const e of run.enemies?.active ?? []) {
    if (!e.alive) continue;
    const sx = e.x - cam.scrollX;
    const sy = e.y - cam.scrollY;
    if (sx < 0 || sy < 0 || sx > cam.width || sy > cam.height) continue;
    enemies.push({ x: sx, y: sy });
  }
  return { labels, enemies, enemiesTotal: run.enemies?.count ?? 0 };
};

/** Ueberlappende Label-Paare (echte Flaechenueberlappung > 0). */
function countOverlaps(labels) {
  let pairs = 0;
  const involved = new Set();
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) {
        pairs += 1;
        involved.add(a.text);
        involved.add(b.text);
      }
    }
  }
  return { pairs, involved: [...involved] };
}

/** Gegner-Sprite-Zentren, die in einem Label-Rect liegen. */
function countOccluded(labels, enemies) {
  let n = 0;
  for (const e of enemies) {
    for (const l of labels) {
      if (e.x >= l.x && e.x <= l.x + l.w && e.y >= l.y && e.y <= l.y + l.h) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

function frameStats(snap) {
  const { pairs, involved } = countOverlaps(snap.labels);
  const widest = snap.labels.reduce((a, l) => (l.w > (a?.w ?? 0) ? l : a), null);
  const occluded = countOccluded(snap.labels, snap.enemies);
  return {
    labels: snap.labels.length,
    labelPairsOverlapping: pairs,
    labelsInvolved: involved,
    maxChars: snap.labels.reduce((a, l) => Math.max(a, l.chars), 0),
    maxWidthPx: widest?.w ?? 0,
    widestLabel: widest?.text ?? "",
    occludedSprites: occluded,
    enemiesOnScreen: snap.enemies.length,
    enemiesTotal: snap.enemiesTotal,
  };
}

const clearLevelUps = async (page) => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => Boolean(window.__lf?.stats().levelUpOpen)))) break;
    // Racy: Dialog kann sich zwischen Check und Klick schliessen -> tolerant.
    await page.evaluate(() => {
      try {
        window.__lf.pickLevelUp(0);
      } catch (e) {
        if (!window.__lf?.stats().levelUpOpen) return;
        throw e;
      }
    });
  }
};

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
const result = { tag: TAG, jsErrors: errors, scenarios: {} };

try {
  const page = await browser.newPage({ viewport: { width: 780, height: 360 }, deviceScaleFactor: 3 });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });

  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=1`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
  });
  await page.evaluate((evolutions) => {
    for (const id of evolutions) window.__lf.addWeapon(id, 8);
    window.__lf.skipTo(1490);
    window.__lf.setTimeScale(1);
  }, EVOLUTIONS);
  await page.waitForTimeout(6000);
  await clearLevelUps(page);

  // Gegner auf Zielzahl nachsperren (wie atlas-pack-Measure): der 6-Evo-Build
  // raeumt natuerliche Wellen schneller ab, als sie spawnen — der Repro braucht
  // aber verbindlich 300 (M25) bzw. 500 (Stress) lebende Gegner.
  const topUp = async (target, id = "bog_rat") => {
    await page.evaluate(({ t, id }) => {
      const deficit = t - window.__lf.stats().enemies;
      if (deficit > 0) window.__lf.spawnEnemy(id, deficit);
    }, { t: target, id });
    await page.waitForTimeout(400);
  };

  const captureFrames = async (name, target, id) => {
    const frames = [];
    for (let f = 0; f < FRAMES; f++) {
      // Zäherer Typ im Stress (knight): bog_rats sterben am 6-Evo-Build schneller,
      // als der Spawner nachlegt — der Repro braucht die Zielzahl lebend.
      await topUp(target, id);
      await topUp(target, id);
      const snap = await page.evaluate(SNAP);
      const stats = frameStats(snap);
      stats.targetEnemies = target;
      frames.push(stats);
      // Supervisor: Metriken VOR dem Screenshot-Export flushen, damit ein
      // Timeout nicht alles verliert.
      writeFileSync(OUT_JSON, `${JSON.stringify({ ...result, partial: true }, null, 2)}\n`);
      await page.screenshot({ path: `shots/m10-chaos-fix-dmg-${TAG}-${name}-f${f + 1}.png` });
      await page.waitForTimeout(FRAME_GAP_MS);
    }
    result.scenarios[name] = { frames };
    console.error(`[m10-chaos-fix-dmg] ${TAG} ${name}: ${frames.map((f) => `labels=${f.labels} overlap=${f.labelPairsOverlapping} maxChars=${f.maxChars} occl=${f.occludedSprites}`).join(" | ")}`);
  };

  await captureFrames("m25", 300, "bog_rat");

  // 500er-Stress: auf 500 Gegnern nachsperren (Mess-Harness, kein Spielcode).
  await page.waitForTimeout(2000);
  await clearLevelUps(page);
  await captureFrames("stress500", 500, "knight");

  await page.close();
} finally {
  await browser.close();
  server.stop();
}

writeFileSync(OUT_JSON, `${JSON.stringify(result, null, 2)}\n`);
console.log(`[m10-chaos-fix-dmg] ${OUT_JSON} geschrieben; JS-Fehler: ${errors.length}`);
