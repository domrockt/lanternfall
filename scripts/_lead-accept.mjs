#!/usr/bin/env node
// Lead-Abnahme M3 (unabhängig vom OpenCode-Skript): Silhouetten, ranged-Abstand,
// Orbiter-Kreis, Wasser-Slow (Spieler + Gegner + Spritzer), Skalierung <960 px, Sieg-Screen.
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";
import { writeFileSync } from "node:fs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const S = {};

const mkPage = async (w, h) => {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return page;
};
const clearLevelUps = async (page) => {
  for (let i = 0; i < 60; i++) {
    if (!(await page.evaluate(() => window.__lf?.state().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

try {
  // ---------- 1) Alle 30 Silhouetten als Sheet + Paarvergleich ----------
  {
    const page = await mkPage(800, 450);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    const sheet = await page.evaluate(() => {
      const g = window.__game;
      const tx = g.textures;
      const keys = tx.getTextureKeys().filter((k) => k.startsWith("enemy_") && !k.endsWith("_2") && !k.includes("shot") && !k.includes("gem"));
      const cell = 30, zoom = 8, labelH = 10, cols = 10;
      const rows = Math.ceil(keys.length / cols);
      const cv = document.createElement("canvas");
      cv.width = cols * cell * zoom; cv.height = rows * (cell * zoom + labelH);
      const ctx = cv.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = "#101018"; ctx.fillRect(0, 0, cv.width, cv.height);
      const masks = {};
      keys.sort().forEach((k, i) => {
        const img = tx.get(k).getSourceImage();
        const src = document.createElement("canvas");
        src.width = img.width; src.height = img.height;
        src.getContext("2d").drawImage(img, 0, 0);
        const px = src.getContext("2d").getImageData(0, 0, img.width, img.height).data;
        let m = "";
        for (let p = 3; p < px.length; p += 4) m += px[p] > 40 ? "1" : "0";
        masks[k] = m;
        const col = i % cols, row = Math.floor(i / cols);
        ctx.drawImage(src, col * cell * zoom, row * (cell * zoom + labelH), img.width * zoom, img.height * zoom);
        ctx.fillStyle = "#e8e0c8"; ctx.font = "8px monospace";
        ctx.fillText(k.replace("enemy_", ""), col * cell * zoom + 2, row * (cell * zoom + labelH) + cell * zoom + 8);
      });
      // Unähnlichste-Paar-Metrik: identische Masken zählen
      const ks = Object.keys(masks);
      let identical = [];
      for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++)
        if (masks[ks[i]] === masks[ks[j]]) identical.push([ks[i], ks[j]]);
      return { keys: ks.length, identicalPairs: identical, png: cv.toDataURL("image/png") };
    });
    S.sheet = { count: sheet.keys, identicalPairs: sheet.identicalPairs.length, pairs: sheet.identicalPairs.slice(0, 5) };
    writeFileSync("shots/lead-enemies.png", Buffer.from(sheet.png.split(",")[1], "base64"));
    await page.close();
  }

  // ---------- 2) ranged hält Abstand ----------
  {
    const page = await mkPage(960, 540);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=11`);
    await startRun(page);
    await page.evaluate(() => { window.__lf.god(true); window.__lf.setTimeScale(1); });
    await page.evaluate(() => window.__lf.spawnEnemy("toad", 6));
    const ds = [];
    let shots = 0;
    for (let i = 0; i < 32; i++) {
      await page.waitForTimeout(150);
      const s = await page.evaluate(() => {
        const sc = window.__game.scene.getScene("run");
        const px = sc.player.x, py = sc.player.y;
        const st = window.__lf.state();
        const mine = st.enemyList.filter((e) => e.id === "toad");
        return {
          d: mine.map((e) => Math.round(Math.hypot(e.x - px, e.y - py))),
          shots: st.enemyShots, modes: mine.map((e) => e.mode),
        };
      });
      shots = Math.max(shots, s.shots);
      if (s.d.length) ds.push(Math.min(...s.d));
    }
    const alive = ds.length;
    const minD = Math.min(...ds), medD = ds.slice().sort((a, b) => a - b)[Math.floor(ds.length / 2)];
    S.ranged = { samples: alive, minDistance: minD, medianDistance: medD, enemyShots: shots,
      ok: alive > 8 && minD >= 20 && medD >= 30 && medD <= 170 && shots > 0 };
    await page.close();
  }

  // ---------- 3) Orbiter umkreist ----------
  {
    const page = await mkPage(960, 540);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=12`);
    await startRun(page);
    await page.evaluate(() => { window.__lf.god(true); window.__lf.setTimeScale(1); });
    await page.evaluate(() => window.__lf.spawnEnemy("harpy", 3));
    const samples = [];
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(120);
      const s = await page.evaluate(() => {
        const sc = window.__game.scene.getScene("run");
        const px = sc.player.x, py = sc.player.y;
        const mine = window.__lf.state().enemyList.filter((e) => e.id === "harpy");
        return mine.map((e) => ({ a: Math.atan2(e.y - py, e.x - px), r: Math.hypot(e.x - px, e.y - py) }));
      });
      if (s.length) samples.push(s[0]);
    }
    let sweep = 0, rMin = 1e9, rMax = 0;
    for (let i = 1; i < samples.length; i++) {
      let d = samples[i].a - samples[i - 1].a;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      sweep += Math.abs(d);
    }
    for (const s of samples) { rMin = Math.min(rMin, s.r); rMax = Math.max(rMax, s.r); }
    S.orbiter = { samples: samples.length, sweepDeg: Math.round(sweep * 180 / Math.PI), rMin: Math.round(rMin), rMax: Math.round(rMax),
      ok: samples.length > 15 && sweep * 180 / Math.PI > 120 && rMin > 25 };
    await page.close();
  }

  // ---------- 4) Wasser-Slow Spieler + Gegner + Spritzer ----------
  {
    const page = await mkPage(960, 540);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=13`);
    await startRun(page);
    await page.evaluate(() => { window.__lf.god(true); window.__lf.setTimeScale(1); });
    const tiles = await page.evaluate(() => {
      const sc = window.__game.scene.getScene("run");
      const px = sc.player.x, py = sc.player.y;
      let best = null;
      for (let r = -600; r < 600; r += 8) for (let c = -600; c < 600; c += 8) {
        const x = Math.round(px + c), y = Math.round(py + r);
        if (sc.ground.kindAt(x, y) !== "water") continue;
        // zusammenhängendes Wasser: ±32 px in alle Richtungen Wasser?
        let score = 0;
        for (let dy = -32; dy <= 32; dy += 8) for (let dx = -32; dx <= 32; dx += 8)
          if (sc.ground.kindAt(x + dx, y + dy) === "water") score++;
        if (!best || score > best.score) best = { x, y, score };
      }
      const grass = [];
      for (let r = -600; r < 600; r += 16) for (let c = -600; c < 600; c += 16) {
        const x = Math.round(px + c), y = Math.round(py + r);
        if (sc.ground.kindAt(x, y) === "grass") grass.push({ x, y });
      }
      return { water: best, grass };
    });
    const water = tiles.water ? [tiles.water] : [];
    const grass = tiles.grass;
    const speedAt = async (pos, ms = 400) => {
      await page.evaluate((p) => {
        const sc = window.__game.scene.getScene("run");
        sc.player.x = p.x; sc.player.y = p.y;
        sc.cameras.main.centerOn(p.x, p.y);
      }, pos);
      await page.waitForTimeout(250);
      const x0 = await page.evaluate(() => window.__game.scene.getScene("run").player.x);
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(ms);
      const x1 = await page.evaluate(() => window.__game.scene.getScene("run").player.x);
      const kindAfter = await page.evaluate(() => {
        const sc = window.__game.scene.getScene("run");
        return sc.ground.kindAt(sc.player.x, sc.player.y);
      });
      await page.keyboard.up("KeyD");
      await page.waitForTimeout(150);
      return { speed: Math.round((x1 - x0) / (ms / 1000)), kindAfter };
    };
    const dryRun = await speedAt(grass[Math.floor(grass.length / 2)]);
    const dry = dryRun.speed;
    const wetPos = water[0];
    // splashes: Partikel mit fx_spark bei Tiefe 6
    await page.evaluate((p) => { const sc = window.__game.scene.getScene("run"); sc.player.setPosition(p.x, p.y); }, wetPos);
    await page.keyboard.down("KeyD"); await page.waitForTimeout(900);
    const splashSeen = await page.evaluate(() => {
      const sc = window.__game.scene.getScene("run");
      const keyOf = (o) => {
        const f = o.frame?.name;
        return f && f !== "__BASE" ? f : o.texture?.key;
      };
      const arr = sc.children.list.filter((o) => keyOf(o) === "fx_spark" && o.depth === 6 && o.alpha > 0.3);
      return arr.length;
    });
    await page.keyboard.up("KeyD");
    const wetRun = await speedAt(wetPos);
    const wet = wetRun.speed;
    // Gegner im Wasser: einen Gegner ins Wasser setzen und Tempo messen
    const enemySlow = await page.evaluate(async (p) => {
      const sc = window.__game.scene.getScene("run");
      window.__lf.spawnEnemy("skeleton", 1);
      await new Promise((r) => setTimeout(r, 300));
      const e = sc.enemies.active.find((x) => x.alive && x.def.id === "skeleton");
      if (!e) return null;
      e.x = p.x; e.y = p.y;
      e.sprite.setPosition(Math.round(p.x), Math.round(p.y));
      await new Promise((r) => setTimeout(r, 300));
      const x0 = e.x, y0 = e.y;
      const kind = sc.ground.kindAt(e.x, e.y);
      await new Promise((r) => setTimeout(r, 600));
      const dist = Math.hypot(e.x - x0, e.y - y0);
      return { pxPerSec: Math.round(dist / 0.6), defSpeed: e.def.speed, kind };
    }, wetPos);
    S.water = { waterTile: tiles.water, drySpeed: dry, dryKindAfter: dryRun.kindAfter, wetSpeed: wet, wetKindAfter: wetRun.kindAfter,
      ratio: +(wet / Math.max(1, dry)).toFixed(2), splashParticles: splashSeen, enemySlow,
      ok: dry > 40 && wet / dry >= 0.45 && wet / dry <= 0.72 && wetRun.kindAfter === "water" && splashSeen >= 2
        && enemySlow && enemySlow.pxPerSec <= enemySlow.defSpeed * 0.75 };

    // Frame-genaue Gegenprobe: interne Bewegung (vor Rundung) vs. Anzeige-Position.
    await page.evaluate((p) => {
      const sc = window.__game.scene.getScene("run");
      window.__ft = { internal: [], display: [], kinds: [] };
      const orig = sc.movePlayer.bind(sc);
      sc.movePlayer = (dt) => { const p0 = sc.player.x; orig(dt); window.__ft.internal.push(+(sc.player.x - p0).toFixed(3)); };
      sc.events.on("postupdate", () => {
        window.__ft.display.push(+sc.player.x.toFixed(2));
        window.__ft.kinds.push(sc.ground.kindAt(Math.round(sc.player.x), Math.round(sc.player.y)));
      });
      sc.player.x = p.x; sc.player.y = p.y; sc.cameras.main.centerOn(p.x, p.y);
    }, wetPos);
    await page.waitForTimeout(300);
    await page.keyboard.down("KeyD"); await page.waitForTimeout(900); await page.keyboard.up("KeyD");
    const ft = await page.evaluate(() => {
      const f = window.__ft;
      let iSum = 0, dSum = 0, n = 0;
      for (let i = 1; i < f.display.length; i++) {
        if (f.kinds[i] !== "water") continue;
        iSum += f.internal[i] ?? 0; dSum += f.display[i] - f.display[i - 1]; n++;
      }
      return { frames: n, internalPxPerSec: +(iSum / Math.max(1, n) * 60).toFixed(1), displayPxPerSec: +(dSum / Math.max(1, n) * 60).toFixed(1) };
    });
    S.water.frameTest = ft;
    await page.close();
  }

  // ---------- 5) Skalierung bei 800x450 (unter 960 px) ----------
  {
    const page = await mkPage(800, 450);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=14`);
    await startRun(page);
    await page.evaluate(() => { window.__lf.god(true); window.__lf.giveXp(40); });
    await page.waitForTimeout(600);
    const geo = await page.evaluate(() => {
      const cv = document.querySelector("canvas");
      const r = cv.getBoundingClientRect();
      return { canvasW: cv.width, cssW: Math.round(r.width), cssH: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top), zoom: r.width / cv.width };
    });
    await page.screenshot({ path: "shots/lead-800x450.png" });
    // Glyphen: Level-up-Karte offen? Text vorhanden und Karte im Viewport?
    const textInfo = await page.evaluate(() => {
      const sc = window.__game.scene.getScene("ui");
      const texts = (sc.children?.list ?? []).filter((o) => o.valueText !== undefined && o.visible).map((o) => o.valueText).filter(Boolean);
      const glyphs = (sc.children?.list ?? []).filter((o) => o.type === "Image" && o.visible && o.alpha > 0.2).length;
      return { sample: texts.slice(0, 12), count: texts.length, glyphImages: glyphs, levelUpOpen: window.__lf.state().levelUpOpen };
    });
    S.scaling = { ...geo, textSample: textInfo.sample, textCount: textInfo.count,
      ok: geo.zoom === 1 && geo.canvasW === 480 && geo.cssW === 480 && textInfo.count >= 3 };
    await page.close();
  }

  // ---------- 6) Sieg-Screen nach Endboss ----------
  {
    const page = await mkPage(1440, 810);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=15`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true); window.__lf.setTimeScale(30);
      for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) window.__lf.addWeapon(id, 8);
      for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
    });
    await page.evaluate(() => window.__lf.skipTo(1790));
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(500);
      await clearLevelUps(page);
      const scene = await page.evaluate(() => window.__lf.state().scene);
      if (scene === "results") break;
    }
    const fin = await page.evaluate(() => window.__lf.finalState());
    await page.waitForTimeout(500);
    const resultText = await page.evaluate(() => {
      const sc = window.__game.scene.getScene("results");
      return (sc.children.list ?? []).filter((o) => o.valueText !== undefined && o.visible)
        .map((o) => o.valueText).filter(Boolean);
    });
    await page.screenshot({ path: "shots/lead-victory.png" });
    S.victory = { reason: fin?.resultReason ?? null, dawn: fin?.dawn, bossesDefeated: fin?.bossesDefeated, chests: fin?.chestsDropped,
      texts: resultText.slice(0, 8), ok: fin?.dawn === true && fin?.bossesDefeated === 6 && resultText.join(" ").includes("ÜBERLEBT") };
    await page.close();
  }

  // ---------- 7) Elite-Gegner: Leuchtrand + großer Kristall ----------
  {
    const page = await mkPage(960, 540);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=16`);
    await startRun(page);
    await page.evaluate(() => { window.__lf.god(true); window.__lf.setTimeScale(1); });
    await page.evaluate(() => window.__lf.skipTo(520));
    await page.waitForTimeout(300);
    let eliteInfo = null;
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(300);
      eliteInfo = await page.evaluate(() => {
        const sc = window.__game.scene.getScene("run");
        const e = sc.enemies.active.find((x) => x.alive && x.elite);
        if (!e) return null;
        return { id: e.def.id, spriteScale: e.sprite.scaleX, auraVisible: e.aura.visible, auraAlpha: e.aura.alpha,
          auraScale: e.aura.scaleX, eliteCount: sc.enemies.active.filter((x) => x.alive && x.elite).length };
      });
      if (eliteInfo) break;
    }
    // Elite töten und große Gems prüfen
    let gemBig = null;
    if (eliteInfo) {
      gemBig = await page.evaluate(async () => {
        const sc = window.__game.scene.getScene("run");
        const e = sc.enemies.active.find((x) => x.alive && x.elite);
        const before = sc.pickups.gems.filter((g) => g.active).length;
        e.hp = 0;
        await new Promise((r) => setTimeout(r, 400));
        const gems = sc.pickups.gems.filter((g) => g.active);
        const big = gems.filter((g) => g.size === "large").length;
        return { total: gems.length, delta: gems.length - before, big };
      });
      await page.screenshot({ path: "shots/lead-elite.png" });
    }
    S.elite = { info: eliteInfo, gems: gemBig, ok: Boolean(eliteInfo && eliteInfo.auraVisible && eliteInfo.spriteScale > 1 && gemBig && gemBig.big >= 1) };
    await page.close();
  }

  // ---------- 8) Gegner-Cap im natürlichen Endgame-Run (28x, Minute 20-26) ----------
  {
    const page = await mkPage(960, 540);
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=17`);
    await startRun(page);
    await page.evaluate(() => {
      window.__lf.god(true); window.__lf.autoPlay(true);
      for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) window.__lf.addWeapon(id, 8);
      for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) window.__lf.addPassive(id, 5);
      window.__lf.setTimeScale(26);
    });
    let maxAlive = 0, atTime = 0, samples = 0, over = 0;
    for (let i = 0; i < 260; i++) {
      await page.waitForTimeout(250);
      const s = await page.evaluate(() => window.__lf.state());
      if (s.scene !== "run") break;
      if (s.levelUpOpen) await page.evaluate(() => window.__lf.pickLevelUp(0));
      if (s.enemies > maxAlive) { maxAlive = s.enemies; atTime = Math.round(s.time); }
      if (s.enemies > 500) over++;
      samples++;
      if (s.time > 1560) break;
    }
    S.cap = { samples, maxAlive, atTime, samplesOver500: over, window: "Minute 20-26, natürlicher Director", ok: samples > 30 && maxAlive <= 540 };
    await page.close();
  }
} finally {
  await browser.close();
  server.stop();
}

S.jsErrors = errors;
S.passed = errors.length === 0 && ["ranged", "orbiter", "water", "scaling", "victory", "elite", "cap", "sheet"]
  .every((k) => S[k] && S[k].ok !== false);
writeFileSync("shots/lead-accept.json", JSON.stringify(S, null, 2));
console.log(JSON.stringify(S, null, 2));
process.exit(S.passed ? 0 : 1);
