#!/usr/bin/env node
// M2-Abnahme: alle 12 Waffen (6 Basen + 6 Evolutionen) mit 50 Gegnern, 5 s,
// Screenshot pro Waffe + Schadensprüfung. Zusätzlich Truhen-GIF mit Evolution.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const WEAPONS = ["ember", "flail", "frost", "thorn", "storm", "lantern"];
const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const ALL = [...WEAPONS, ...EVOLUTIONS];
const WAIT_MS = 5000;
// Lane m10-weapons-stable: nur die Truhen-Sektion prüfen (schnelle Flake-Reproduktion).
const CHEST_ONLY = process.env.M10_CHEST_ONLY === "1";

/** Erwartete VFX-Texturen je Waffe, abgeleitet aus CombatSystem. */
const VFX_KEYS = {
  ember: ["projectile_ember"],
  flail: ["flail_ball", "fx_smear"],
  frost: ["ring_frost", "fx_ice"],
  thorn: ["projectile_thorn"],
  storm: ["fx_bolt", "fx_seal"],
  lantern: ["orb_lantern"],
  phoenix: ["projectile_phoenix"],
  wrath_pendulum: ["flail_ball", "fx_smear"],
  eternal_winter: ["ring_frost", "projectile_ice"],
  thorn_storm: ["projectile_thorn"],
  thunder_seal: ["fx_bolt", "fx_seal"],
  soul_beacon: ["orb_soul"],
};

const VFX_DELAY_MS = {
  ember: 40, flail: 100, frost: 0, thorn: 40, storm: 80, lantern: 0,
  phoenix: 0, wrath_pendulum: 0, eternal_winter: 0, thorn_storm: 40,
  thunder_seal: 80, soul_beacon: 0,
};

/**
 * Evolutions-Slot 0 ist fertig ausgerollt, sobald die UI "EVOLUTION" zeigt und
 * der Name eingeblendet ist (Settle-Tween fertig) — unabhängig von Magic-Timings.
 */
async function evolutionSlotReady(page) {
  return page.evaluate(() => {
    const ui = window.__game.scene.getScene("ui");
    const slot = ui?.chestSlots?.[0];
    if (!slot || !slot.level) return false;
    return ui.chestGroup?.visible === true && slot.level.value === "EVOLUTION";
  });
}

/**
 * Roll-Frame-Assert: In der Rollphase (noch kein STUFE/EVOLUTION gesetzt) zeigt
 * jeder Slot einen vollständigen Belohnungsnamen, mindestens einer zweizeilig.
 */
async function rollNamesComplete(page) {
  return page.evaluate(() => {
    const run = window.__game.scene.getScene("run");
    const ui = window.__game.scene.getScene("ui");
    const rewards = (run?.chestResult?.rewards ?? []).map((r) => r.name.toUpperCase());
    if (rewards.length === 0) return false;
    const slots = (ui?.chestSlots ?? []).slice(0, rewards.length);
    if (slots.length !== rewards.length) return false;
    const rolling = slots.every((s) => !s.level?.value);
    const allFull = slots.every((s) => rewards.includes(`${s.text?.value ?? ""}${s.text2?.value ?? ""}`));
    const twoLine = slots.some((s) => s.text2?.visible && s.text2?.value);
    // Zwei Zeilen sind nur noetig, wenn ein Name die Slotbreite (13 Zeichen) ueberschreitet.
    const needsTwoLine = rewards.some((r) => r.length > 13);
    return rolling && allFull && (!needsTwoLine || twoLine);
  });
}

/**
 * Für Schwung-Waffen (Kettenflegel/Zornpendel) das Schwung-Sprite früh im Bogen
 * pausieren. Der FX-Trail lebt länger als der Schwung und würde sonst statt der
 * Kugel getroffen (Screenshot zeigt nur noch einen fast unsichtbaren Trail).
 */
async function shotAtSwing(page, weaponId, path, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await clearLevelUps(page);
    const state = await page.evaluate((id) => {
      const run = window.__game.scene.getScene("run");
      for (const st of run.combat?.states?.values?.() ?? []) {
        const swing = (st.swings ?? []).find(
          (s) => s.weaponId === id && s.t > 0.04 && s.t < s.dur - 0.08,
        );
        if (swing) return { t: swing.t, dur: swing.dur };
      }
      return null;
    }, weaponId);
    if (state) {
      if (await page.evaluate(() => window.__lf?.state().levelUpOpen)) {
        await clearLevelUps(page);
        continue;
      }
      await page.evaluate(() => window.__game.scene.getScene("run").scene.pause());
      try {
        await page.waitForTimeout(80);
        await page.screenshot({ path });
      } finally {
        await page.evaluate(() => window.__game.scene.getScene("run").scene.resume());
      }
      return true;
    }
    await page.waitForTimeout(16);
  }
  await page.screenshot({ path });
  return false;
}

/**
 * Phönixschwarm: warten, bis ≥2 Feuervögel knapp neben dem Spieler fliegen
 * (Abstand 18–90 Welt-px), dann pausieren und im Schwarm-Peak schießen.
 * Liefert Anzahl + Abstände für den eigenen Phönix-Assert.
 */
async function shotAtPhoenix(page, path, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await clearLevelUps(page);
    const birds = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const cam = run.cameras.main;
      const px = run.player?.x ?? 0;
      const py = run.player?.y ?? 0;
      const keyOf = (s) => {
        const f = s?.frame?.name;
        return f && f !== "__BASE" ? f : s?.texture?.key;
      };
      return (run.combat?.projectiles?.active ?? [])
        .filter((p) => keyOf(p.sprite) === "projectile_phoenix")
        .map((p) => ({
          d: Math.round(Math.hypot(p.x - px, p.y - py)),
          vis: Boolean(p.sprite.visible),
          a: p.sprite.alpha,
          x: Math.round(p.x),
          y: Math.round(p.y),
          onScreen:
            (p.x - cam.scrollX) > 6 && (p.y - cam.scrollY) > 6 &&
            (p.x - cam.scrollX) < cam.width - 6 && (p.y - cam.scrollY) < cam.height - 6,
        }));
    });
    let near = birds.filter((b) => b.vis && b.a >= 0.6 && b.onScreen && b.d >= 18 && b.d <= 90);
    // Zwei Vögel auf demselben Pixel sind kein Schwarm → nur klar getrennte zählen.
    for (let i = 0; i < near.length; i++) {
      if (near.findIndex((o) => Math.hypot(o.x - near[i].x, o.y - near[i].y) < 10) !== i) near[i].dup = true;
    }
    const distinct = near.filter((b) => !b.dup);
    if (distinct.length >= 2) {
      if (await page.evaluate(() => window.__lf?.state().levelUpOpen)) {
        await clearLevelUps(page);
        continue;
      }
      await page.evaluate(() => window.__game.scene.getScene("run").scene.pause());
      try {
        await page.waitForTimeout(80);
        await page.screenshot({ path });
      } finally {
        await page.evaluate(() => window.__game.scene.getScene("run").scene.resume());
      }
      return { count: distinct.length, distances: distinct.map((b) => b.d) };
    }
    await page.waitForTimeout(16);
  }
  await page.screenshot({ path });
  return { count: 0, distances: [] };
}

/**
 * Frost-Ring: sofort beim Spawn pausieren (Delay 0) und den tatsächlichen
 * Ring-Radius aus der FX-Scale ableiten, damit der Pixel-Check nicht an
 * Timing-Roundtrips hängt.
 */
async function shotAtFrost(page, path, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await clearLevelUps(page);
    const found = await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      const px = run.player?.x ?? 0;
      const py = run.player?.y ?? 0;
      const keyOf = (s) => {
        const f = s?.frame?.name;
        return f && f !== "__BASE" ? f : s?.texture?.key;
      };
      const fx = (run.combat?.fx?.active ?? []).find(
        (f) => keyOf(f.sprite) === "ring_frost" && Math.hypot((f.x ?? 0) - px, (f.y ?? 0) - py) < 60,
      );
      return fx ? { scale: fx.sprite.scaleX } : null;
    });
    if (found) {
      if (await page.evaluate(() => window.__lf?.state().levelUpOpen)) {
        await clearLevelUps(page);
        continue;
      }
      await page.evaluate(() => window.__game.scene.getScene("run").scene.pause());
      try {
        await page.waitForTimeout(80);
        await page.screenshot({ path });
      } finally {
        await page.evaluate(() => window.__game.scene.getScene("run").scene.resume());
      }
      // Eis-Siegel: äußerer Zackerand bei 47 px, Canvas 3x → Bildradius.
      return { scale: found.scale, radius: Math.round(47 * found.scale * 3) };
    }
    await page.waitForTimeout(16);
  }
  await page.screenshot({ path });
  return null;
}

/**
 * Frost-Pixel-Check im 1440×810-Shot: helles Ring-Band um die Bildmitte
 * (720,405) im Radius ±10 px um den gemessenen Ring-Radius, Summe RGB > 560
 * in mindestens 60 Pixeln.
 */
function frostRingPixels(path, radius) {
  const W = 1440;
  const H = 810;
  const raw = execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-i", path,
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-vcodec", "rawvideo", "-",
  ], { maxBuffer: 16 * 1024 * 1024 });
  if (raw.length !== W * H * 3) {
    throw new Error(`frostRingPixels: erwartet ${W * H * 3} Bytes, bekam ${raw.length}`);
  }
  const cx = W / 2;
  const cy = H / 2;
  const inner = Math.max(40, radius - 10);
  const outer = radius + 10;
  let bright = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < inner * inner || d2 > outer * outer) continue;
      const i = (y * W + x) * 3;
      // Eis-Band: mist/paleMist (blau-grau, Summe ~410–470) muss mitzählen, nicht nur Weiß.
      if (raw[i] + raw[i + 1] + raw[i + 2] > 400) bright++;
    }
  }
  return bright;
}

/**
 * Aktive FX-/Projektil-Texturen aus der Run-Szene (gepoolt, nur aktive Einträge).
 * Ehrlicher Match: nur Sprites mit Alpha ≥ 0,6 (keine ausgeblichenen Trails) und
 * nur, wenn der Effekt tatsächlich im 480×270-Viewport liegt.
 */
async function activeFxKeys(page, nearPlayer = false) {
  return page.evaluate((near) => {
    const run = window.__game.scene.getScene("run");
    const cam = run.cameras.main;
    const keys = [];
    const px = run.player?.x ?? 0;
    const py = run.player?.y ?? 0;
    const onScreen = (wx, wy) => {
      const sx = (wx - cam.scrollX) * cam.zoom;
      const sy = (wy - cam.scrollY) * cam.zoom;
      return sx > 6 && sy > 6 && sx < cam.width - 6 && sy < cam.height - 6;
    };
    const push = (sprite, wx, wy) => {
      const logical = sprite?.frame?.name;
      const key = logical && logical !== "__BASE" ? logical : sprite?.texture?.key;
      if (!key || !sprite.visible) return;
      if ((sprite.alpha ?? 1) < 0.6) return;
      if (!onScreen(wx, wy)) return;
      if (near && Math.hypot(wx - px, wy - py) >= 45) return;
      keys.push(key);
    };
    for (const fx of run.combat?.fx?.active ?? []) push(fx.sprite, fx.x ?? fx.sprite.x, fx.y ?? fx.sprite.y);
    for (const p of run.combat?.projectiles?.active ?? []) push(p.sprite, p.x, p.y);
    for (const s of run.combat?.seals ?? []) push(s.sprite, s.sprite.x, s.sprite.y);
    for (const state of run.combat?.states?.values?.() ?? []) {
      for (const swing of state.swings ?? []) push(swing.sprite, swing.sprite.x, swing.sprite.y);
      for (const orb of state.orbs ?? []) push(orb.sprite, orb.sprite.x, orb.sprite.y);
    }
    return [...new Set(keys)];
  }, nearPlayer);
}

/**
 * Wartet bis eine erwartete FX-Textur aktiv ist, pausiert die Run-Szene kurz
 * (Pause rendert weiter) und schießt den Screenshot im Wirk-Peak.
 */
async function shotAtVfx(page, expected, path, { delayMs = 0, timeoutMs = 8000, nearPlayer = false } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await clearLevelUps(page);
    const active = await activeFxKeys(page, nearPlayer);
    const matched = expected.filter((key) => active.includes(key));
    if (matched.length === 0) {
      await page.waitForTimeout(16);
      continue;
    }
    if (delayMs > 0) await page.waitForTimeout(delayMs);
    // Während des Delay kann ein Level-up aufgehen → nicht mit Overlay schießen.
    if (await page.evaluate(() => window.__lf?.state().levelUpOpen)) {
      await clearLevelUps(page);
      continue;
    }
    await page.evaluate(() => window.__game.scene.getScene("run").scene.pause());
    await page.waitForTimeout(90);
    await page.screenshot({ path });
    await page.evaluate(() => window.__game.scene.getScene("run").scene.resume());
    return matched;
  }
  // Diagnose-Shot ohne Match; der Aufrufer wertet das leere Ergebnis als FAIL.
  await page.screenshot({ path });
  return [];
}

ensureBuild();
mkdirSync("shots", { recursive: true });

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const errors = [];
const results = [];
let chestTiming = null;

async function newPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  return page;
}

async function clearLevelUps(page) {
  for (let i = 0; i < 60; i++) {
    const open = await page.evaluate(() => window.__lf?.state().levelUpOpen);
    if (!open) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
}

try {
  if (!CHEST_ONLY) for (const id of ALL) {
    const page = await newPage();
    try {
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=21`);
      await startRun(page);
      // Phönix-Projektile sind additiv; über dunklem Gras sind die Vögel klarer zu sehen.
      if (id === "phoenix") {
        await page.keyboard.down("ArrowLeft");
        await page.waitForTimeout(1200);
        await page.keyboard.up("ArrowLeft");
      }
      await page.evaluate((weaponId) => {
        window.__lf.god(true);
        window.__lf.setTimeScale(2);
        window.__lf.addWeapon(weaponId, 8);
        window.__lf.spawnEnemy("bog_rat", 30);
        window.__lf.spawnEnemy("wisp", 20);
      }, id);
      const deadline = Date.now() + WAIT_MS;
      while (Date.now() < deadline) {
        await page.waitForTimeout(100);
        await clearLevelUps(page);
      }
      await page.evaluate(() => window.__lf.setTimeScale(1));
      await clearLevelUps(page);
      // Frische Gegner; dann auf den VFX-Peak warten statt nach Ablauf zu schießen.
      await page.evaluate(() => {
        window.__lf.spawnEnemy("bog_rat", 30);
        window.__lf.spawnEnemy("wisp", 10);
        window.__lf.setTimeScale(1);
      });
      let vfx;
      let frostRadius = 55;
      const swingShot = id === "flail" || id === "wrath_pendulum";
      if (swingShot) {
        const ok = await shotAtSwing(page, id, `shots/m2-weapon-${id}.png`);
        vfx = ok ? ["flail_ball (swing)"] : [];
      } else if (id === "phoenix") {
        const birds = await shotAtPhoenix(page, "shots/m2-weapon-phoenix.png");
        vfx = birds.count > 0 ? ["projectile_phoenix"] : [];
        results.push({
          id: "phoenix-birds", damage: null, owned: birds.count >= 2, enemies: 0, kills: 0, fps: 0, ok: birds.count >= 2,
        });
        console.log(`Phönix-Check: ${birds.count} Vögel neben Spieler (Abstand ${birds.distances.join(", ")} px): ${birds.count >= 2 ? "OK" : "FEHLER"}`);
      } else if (id === "frost") {
        const ring = await shotAtFrost(page, "shots/m2-weapon-frost.png");
        vfx = ring ? ["ring_frost"] : [];
        if (ring) frostRadius = ring.radius;
      } else {
        vfx = await shotAtVfx(page, VFX_KEYS[id], `shots/m2-weapon-${id}.png`, {
          delayMs: VFX_DELAY_MS[id] ?? 0,
          nearPlayer: id === "phoenix",
        });
      }
      if (id === "frost") {
        const bright = frostRingPixels("shots/m2-weapon-frost.png", frostRadius);
        results.push({
          id: "frost-ring-pixels", damage: null, owned: bright >= 60, enemies: 0, kills: 0, fps: 0, ok: bright >= 60,
        });
        console.log(`Frost-Pixel-Check: ${bright} helle Ring-Pixel (Radius ${frostRadius}±10 px, Ziel ≥60): ${bright >= 60 ? "OK" : "FEHLER"}`);
      }
      await page.evaluate(() => window.__lf.setTimeScale(1));
      await clearLevelUps(page);
      const state = await page.evaluate(() => window.__lf.state());
      const damage = state.damageByWeapon[id] ?? 0;
      const owned = state.weapons.some((w) => w.id === id && w.level === 8);
      const vfxOk = vfx.length > 0;
      const entry = { id, damage, owned, vfx, enemies: state.enemies, kills: state.kills, fps: state.fps, ok: owned && damage > 0 && vfxOk };
      results.push(entry);
      console.log(`${id}: Schaden ${damage}, Stufe8 ${owned ? "ja" : "NEIN"}, vfx:${vfx.join("+") || "KEINE"} ${vfxOk ? "OK" : "FEHLER"}${entry.ok ? "" : " -> FEHLER"}`);
    } finally {
      await page.close();
    }
  }

  // Regression: Evolution ersetzt die Basiswaffe, deren Runtime-State (Orbs) muss enden.
  if (!CHEST_ONLY) {
  const evoPage = await newPage();
  try {
    await evoPage.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=31`);
    await startRun(evoPage);
    await evoPage.evaluate(() => {
      window.__lf.god(true);
      window.__lf.addWeapon("lantern", 8);
      window.__lf.spawnEnemy("bog_rat", 20);
      window.__lf.setTimeScale(2);
    });
    await evoPage.waitForTimeout(1600);
    await evoPage.evaluate(() => window.__lf.setTimeScale(1));
    await clearLevelUps(evoPage);
    const before = await evoPage.evaluate(() => window.__lf.state().damageByWeapon);
    await evoPage.evaluate(() => {
      window.__lf.addWeapon("soul_beacon", 8);
      window.__lf.spawnEnemy("bog_rat", 40);
      window.__lf.setTimeScale(2);
    });
    await evoPage.waitForTimeout(2600);
    await evoPage.evaluate(() => window.__lf.setTimeScale(1));
    await clearLevelUps(evoPage);
    const afterState = await evoPage.evaluate(() => window.__lf.state());
    const lanternBefore = before.lantern ?? 0;
    const lanternAfter = afterState.damageByWeapon.lantern ?? 0;
    const soulDamage = afterState.damageByWeapon.soul_beacon ?? 0;
    const hasBase = afterState.weapons.some((w) => w.id === "lantern");
    const hasEvolved = afterState.weapons.some((w) => w.id === "soul_beacon");
    const oldOrbsGone = lanternAfter === lanternBefore;
    const evoOk = !hasBase && hasEvolved && oldOrbsGone && soulDamage > 0;
    results.push({ id: "evolution-state", damage: soulDamage, owned: evoOk, enemies: afterState.enemies, kills: afterState.kills, fps: afterState.fps, ok: evoOk });
    console.log(`Evolution-State: Laterne ${lanternBefore} -> ${lanternAfter}, Seele ${soulDamage}, Slot ${!hasBase && hasEvolved ? "nur Evolution" : "FEHLER"}: ${evoOk ? "OK" : "FEHLER"}`);
  } finally {
    await evoPage.close();
  }
  }

  // Truhen-Sequenz als GIF + Evolution via Truhe beweisen.
  const chestPage = await newPage();
  try {
    await chestPage.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=12`);
    await startRun(chestPage);
    await chestPage.evaluate(() => {
      window.__lf.god(true);
      window.__lf.addWeapon("ember", 8);
      window.__lf.addPassive("tome", 1);
      window.__lf.spawnEnemy("bog_rat", 20);
      window.__lf.setTimeScale(2);
    });
    await chestPage.waitForTimeout(1200);
    await chestPage.evaluate(() => window.__lf.setTimeScale(1));
    await clearLevelUps(chestPage);
    await chestPage.evaluate(() => window.__lf.skipTo(1500));
    // Instrumentierung (#K2): Zeit ab openChest für Panel-Sichtbarkeit und Check-Reads.
    const tOpen = Date.now();
    await chestPage.evaluate(() => window.__lf.openChest());
    rmSync("shots/chest-frames", { recursive: true, force: true });
    mkdirSync("shots/chest-frames", { recursive: true });
    let evoCaptured = false;
    let rollCaptured = false;
    let panelVisibleMs = null;
    const samples = [];
    for (let i = 0; i < 48; i++) {
      await chestPage.screenshot({ path: `shots/chest-frames/f${String(i).padStart(3, "0")}.png` });
      const readAtMs = Date.now() - tOpen;
      const panelVisible = await chestPage.evaluate(
        () => window.__game.scene.getScene("ui")?.chestGroup?.visible === true,
      );
      if (!panelVisibleMs && panelVisible) panelVisibleMs = readAtMs;
      // Während des Rollens: jeder Slot zeigt einen vollständigen Rollnamen (ggf. 2 Zeilen).
      const namesComplete = await rollNamesComplete(chestPage);
      samples.push({ atMs: readAtMs, panelVisible, namesComplete });
      if (!rollCaptured && namesComplete) rollCaptured = true;
      // Evolutions-Slot fertig ausgerollt: Panel mit Icon/Name/EVOLUTION schießen.
      if (!evoCaptured && (await evolutionSlotReady(chestPage))) {
        await chestPage.waitForTimeout(280); // Settle-Tween (220 ms) abwarten.
        await chestPage.screenshot({ path: "shots/m2-evolution-phoenix.png" });
        evoCaptured = true;
      }
      await chestPage.waitForTimeout(90);
    }
    const okSamples = samples.filter((s) => s.namesComplete).map((s) => s.atMs);
    const gaps = samples.slice(1).map((s, i) => s.atMs - samples[i].atMs);
    chestTiming = {
      panelVisibleMs,
      firstReadMs: samples[0]?.atMs ?? null,
      rollNamesReadyMs: okSamples[0] ?? null,
      lastReadMs: samples.at(-1)?.atMs ?? null,
      okSampleCount: okSamples.length,
      sampleCount: samples.length,
      medianSampleGapMs: gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : null,
      samples,
    };
    if (!evoCaptured) {
      results.push({ id: "chest-evolution-shot", damage: null, owned: false, enemies: 0, kills: 0, fps: 0, ok: false });
      console.log("Evolution-Screenshot: Evolutions-Slot nie fertig ausgerollt -> FEHLER");
    }
    results.push({ id: "chest-roll-names", damage: null, owned: rollCaptured, enemies: 0, kills: 0, fps: 0, ok: rollCaptured });
    console.log(`Roll-Namen: ${rollCaptured ? "alle Slots vollständig (auch 2-zeilig), OK" : "kein vollständiger Roll-Frame -> FEHLER"}`);
    await chestPage.waitForTimeout(1200);
    const chestState = await chestPage.evaluate(() => window.__lf.state());
    const evolved = chestState.weapons.some((w) => w.id === "phoenix" && w.level === 8);
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", "11",
      "-i", "shots/chest-frames/f%03d.png",
      "-vf", "scale=480:270:flags=neighbor",
      "shots/m2-chest.gif",
    ], { stdio: "inherit" });
    results.push({ id: "chest-evolution", damage: null, owned: evolved, enemies: chestState.enemies, kills: chestState.kills, fps: chestState.fps, ok: evolved });
    console.log(`Truhe -> Evolution: ${evolved ? "Phönixschwarm im Slot, OK" : "FEHLT"}`);
  } finally {
    await chestPage.close();
  }

  // Langname vollständig im Slot: Laterne -> Seelenleuchtfeuer (17 Zeichen, 2 Zeilen).
  if (!CHEST_ONLY) {
  const longNamePage = await newPage();
  try {
    await longNamePage.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=33`);
    await startRun(longNamePage);
    await longNamePage.evaluate(() => {
      window.__lf.god(true);
      window.__lf.addWeapon("lantern", 8);
      window.__lf.addPassive("charm", 1);
      window.__lf.setTimeScale(1);
    });
    await clearLevelUps(longNamePage);
    await longNamePage.evaluate(() => window.__lf.skipTo(1500));
    await longNamePage.evaluate(() => window.__lf.openChest());
    const slotDeadline = Date.now() + 4000;
    while (Date.now() < slotDeadline && !(await evolutionSlotReady(longNamePage))) {
      await longNamePage.waitForTimeout(50);
    }
    await longNamePage.waitForTimeout(300); // Settle-Tween (220 ms) abschließen.
    await longNamePage.screenshot({ path: "shots/m2-chest-longname.png" });
    const longNameOk = await longNamePage.evaluate(() => {
      const ui = window.__game.scene.getScene("ui");
      const slot = ui?.chestSlots?.[0];
      const full = `${slot?.text?.value ?? ""}${slot?.text2?.value ?? ""}`;
      return full === "SEELENLEUCHTFEUER" && slot?.level?.value === "EVOLUTION" && Boolean(slot?.text2?.visible);
    });
    results.push({ id: "chest-longname", damage: null, owned: longNameOk, enemies: 0, kills: 0, fps: 0, ok: longNameOk });
    console.log(`Langname im Slot: ${longNameOk ? "SEELENLEUCHTFEUER vollständig (2 Zeilen), OK" : "FEHLER"}`);
  } finally {
    await longNamePage.close();
  }
  }
} finally {
  await browser.close();
  server.stop();
}


const failed = results.filter((r) => !r.ok);
const WEAPON_IDS = new Set(Object.keys(VFX_KEYS));
const summary = {
  weapons: results.filter((r) => WEAPON_IDS.has(r.id)).length,
  evolved: results.find((r) => r.id === "chest-evolution")?.owned ?? false,
  evolutionState: results.find((r) => r.id === "evolution-state")?.owned ?? false,
  longName: results.find((r) => r.id === "chest-longname")?.owned ?? false,
  phoenixBirds: results.find((r) => r.id === "phoenix-birds")?.owned ?? false,
  frostRingPixels: results.find((r) => r.id === "frost-ring-pixels")?.owned ?? false,
  rollNames: results.find((r) => r.id === "chest-roll-names")?.owned ?? false,
  chestTiming,
  failed: failed.map((r) => r.id),
  jsErrors: errors,
  passed: failed.length === 0 && errors.length === 0,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.passed ? 0 : 1);
