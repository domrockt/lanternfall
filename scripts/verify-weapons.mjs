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

/** Erwartete VFX-Texturen je Waffe, abgeleitet aus CombatSystem. */
const VFX_KEYS = {
  ember: ["projectile_ember"],
  flail: ["flail_ball"],
  frost: ["ring_frost"],
  thorn: ["projectile_thorn"],
  storm: ["bolt_seg", "ring_seal"],
  lantern: ["orb_lantern"],
  phoenix: ["projectile_phoenix"],
  wrath_pendulum: ["flail_ball"],
  eternal_winter: ["ring_frost", "projectile_ice"],
  thorn_storm: ["projectile_thorn"],
  thunder_seal: ["bolt_seg", "ring_seal"],
  soul_beacon: ["orb_soul"],
};

const VFX_DELAY_MS = {
  ember: 40, flail: 100, frost: 200, thorn: 40, storm: 80, lantern: 0,
  phoenix: 120, wrath_pendulum: 0, eternal_winter: 200, thorn_storm: 40,
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

/** Aktive FX-/Projektil-Texturen aus der Run-Szene (gepoolt, nur aktive Einträge). */
async function activeFxKeys(page, nearPlayer = false) {
  return page.evaluate((near) => {
    const run = window.__game.scene.getScene("run");
    const keys = [];
    const push = (sprite) => {
      const key = sprite?.texture?.key;
      if (key) keys.push(key);
    };
    const px = run.player?.x ?? 0;
    const py = run.player?.y ?? 0;
    for (const fx of run.combat?.fx?.active ?? []) {
      if (near && Math.hypot((fx.x ?? 0) - px, (fx.y ?? 0) - py) >= 45) continue;
      push(fx.sprite);
    }
    for (const p of run.combat?.projectiles?.active ?? []) {
      if (near && Math.hypot(p.x - px, p.y - py) >= 45) continue;
      push(p.sprite);
    }
    for (const s of run.combat?.seals ?? []) push(s.sprite);
    for (const state of run.combat?.states?.values?.() ?? []) {
      for (const swing of state.swings ?? []) push(swing.sprite);
      for (const orb of state.orbs ?? []) {
        if (orb.sprite?.visible) push(orb.sprite);
      }
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
  for (const id of ALL) {
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
      const swingShot = id === "flail" || id === "wrath_pendulum";
      if (swingShot) {
        const ok = await shotAtSwing(page, id, `shots/m2-weapon-${id}.png`);
        vfx = ok ? ["flail_ball (swing)"] : [];
      } else {
        vfx = await shotAtVfx(page, VFX_KEYS[id], `shots/m2-weapon-${id}.png`, {
          delayMs: VFX_DELAY_MS[id] ?? 0,
          nearPlayer: id === "phoenix",
        });
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
    await chestPage.evaluate(() => window.__lf.openChest());
    rmSync("shots/chest-frames", { recursive: true, force: true });
    mkdirSync("shots/chest-frames", { recursive: true });
    let evoCaptured = false;
    for (let i = 0; i < 48; i++) {
      await chestPage.screenshot({ path: `shots/chest-frames/f${String(i).padStart(3, "0")}.png` });
      // Evolutions-Slot fertig ausgerollt: Panel mit Icon/Name/EVOLUTION schießen.
      if (!evoCaptured && (await evolutionSlotReady(chestPage))) {
        await chestPage.waitForTimeout(280); // Settle-Tween (220 ms) abwarten.
        await chestPage.screenshot({ path: "shots/m2-evolution-phoenix.png" });
        evoCaptured = true;
      }
      await chestPage.waitForTimeout(90);
    }
    if (!evoCaptured) {
      results.push({ id: "chest-evolution-shot", damage: null, owned: false, enemies: 0, kills: 0, fps: 0, ok: false });
      console.log("Evolution-Screenshot: Evolutions-Slot nie fertig ausgerollt -> FEHLER");
    }
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
  failed: failed.map((r) => r.id),
  jsErrors: errors,
  passed: failed.length === 0 && errors.length === 0,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.passed ? 0 : 1);
