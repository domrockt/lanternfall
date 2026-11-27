#!/usr/bin/env node
// M10-Evolutions-Reachability: alle 6 Kombinationen (Basiswaffe + passendes
// Powerup) deterministisch gegenprüfen. Fester Seed, beide Gate-Pfade:
//
//   Truchen-Pfad:    chestRewards -> canEvolve -> Truhe-UI -> applyChestReward
//   Level-Up-Pfad:   generateOffers (includeEvolutions) -> pickLevelUp -> addWeapon
//
// Gate-Matrix je Kombination (jede Stufe mit isoliertem Zustand):
//   - Basiswaffe Lv7  + passendes Powerup -> KEINE Evolution (zu frueh)
//   - Basiswaffe Lv8 + falsches Powerup   -> KEINE Evolution
//   - Basiswaffe Lv8 + passendes Powerup  -> Evolution angeboten (Truhe bzw. Level-Up),
//     angewendet, Basiswaffe ersetzt, Powerup erhalten, keine Doppel-Evolution.
//
// Determinismus: fester Seed; Level-Up-XP wird 1-er-Weise gegeben, sodass das
// erste Panel exakt einen Level-Gewinn enthaelt (kein organisches Upgrade auf
// Lv8 waehrend der Pruefung). Urteile haengen nicht am Truhen-Roll ab.
//
// Output: shots/m10-evo-reach-<phase>.json (phase = before|after, default before).
// Keine FPS-/Echtzeit-Messung -> bewusst OHNE flock (feste Gate-Logik, lastunabhaengig).
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const EVOLUTIONS = [
  { id: "phoenix", baseWeapon: "ember", passive: "tome" },
  { id: "wrath_pendulum", baseWeapon: "flail", passive: "heart" },
  { id: "eternal_winter", baseWeapon: "frost", passive: "hourglass" },
  { id: "thorn_storm", baseWeapon: "thorn", passive: "boots" },
  { id: "thunder_seal", baseWeapon: "storm", passive: "whetstone" },
  { id: "soul_beacon", baseWeapon: "lantern", passive: "charm" },
];
const SEED = Number(process.env.EVO_SEED ?? 4711);
const PHASE = process.argv.includes("--after") ? "after" : "before";
const OUT = `shots/m10-evo-reach-${PHASE}.json`;
const CHEST_TIMEOUT_MS = 15000;

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"],
});

const readRunState = (page) =>
  page.evaluate(() => {
    const run = globalThis.__game.scene.getScene("run");
    return {
      elapsed: run.elapsed,
      frame: globalThis.__game.loop.frame,
      level: run.xpState.level,
      weapons: run.levelSys.weapons.map((w) => ({ id: w.id, level: w.level })),
      passives: run.levelSys.passives.map((p) => ({ id: p.id, level: p.level })),
      levelUpOpen: run.levelUpOpen,
      chestOpen: run.chestOpen,
      offers: (run.currentOffers ?? []).map((o) => ({ kind: o.kind, id: o.id, level: o.level })),
      chest: run.chestResult
        ? {
            count: run.chestResult.count,
            rewards: run.chestResult.rewards.map((r) => ({ kind: r.kind, id: r.id })),
          }
        : null,
    };
  });

const waitChestClosed = (page) =>
  page.waitForFunction(
    () => !globalThis.__game.scene.getScene("run").chestOpen,
    { timeout: CHEST_TIMEOUT_MS },
  );

/**
 * XP 1-er-Weise geben, bis das erste Level-Up-Panel offen ist. Der Suppress
 * wird vorher ausgeschaltet; da nur 1 XP-Schritt noetig ist, hat das erste
 * Panel genau einen Level-Gewinn -> die Offers sind an diesem Gate-Zustand.
 * Liefert die Offers des ersten Panels (oder null, wenn keins aufging).
 */
const openFirstPanel = async (page) => {
  await page.evaluate(() => globalThis.__lf.setSuppressLevelUps(false));
  for (let i = 0; i < 80; i++) {
    await page.evaluate(() => globalThis.__lf.giveXp(1));
    const open = await page.evaluate(() => globalThis.__game.scene.getScene("run").levelUpOpen);
    if (open) return (await readRunState(page)).offers;
  }
  return null;
};

/** Offene Level-Up-Panels abwählen (Suppression aus), bis zu. */
const drainPanels = async (page) => {
  for (let guard = 0; guard < 40; guard++) {
    const open = await page.evaluate(() => globalThis.__game.scene.getScene("run").levelUpOpen);
    if (!open) break;
    await page.evaluate(() => globalThis.__lf.pickLevelUp(0));
  }
};

const hasEvo = (offers) => offers?.some((o) => EVOLUTIONS.some((e) => e.id === o.id)) ?? false;

const startFreshRun = async (page) => {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  // Stray-Level-Ups (durch zufaellige Kills waehrend der Sequenzen) und
  // XP-Sammeln unterdruecken, damit nur gezielte giveXp-Aufrufe Panels oeffnen.
  await page.evaluate(() => {
    globalThis.__lf.god(true);
    globalThis.__lf.setSuppressLevelUps(true);
  });
};

const results = [];
const errors = [];

for (let i = 0; i < EVOLUTIONS.length; i++) {
  const evo = EVOLUTIONS[i];
  const wrongPassive = EVOLUTIONS[(i + 1) % EVOLUTIONS.length].passive;
  const row = {
    id: evo.id,
    baseWeapon: evo.baseWeapon,
    passive: evo.passive,
    seed: SEED,
    chestPath: {},
    levelupPath: {},
    reached: false,
    error: null,
  };
  try {
    // ── Run A: Truhen-Pfad ─────────────────────────────────────
    const pageA = await browser.newPage({ viewport: { width: 960, height: 540 } });
    pageA.on("pageerror", (e) => errors.push(`A/${evo.id}: ${e}`));
    try {
      await startFreshRun(pageA);

      // G1: Basiswaffe Lv7 + passendes Powerup -> zu frueh.
      await pageA.evaluate(({ base, passive }) => {
        globalThis.__lf.addWeapon(base, 7);
        globalThis.__lf.addPassive(passive, 1);
        globalThis.__lf.openChest();
      }, { base: evo.baseWeapon, passive: evo.passive });
      let s = await readRunState(pageA);
      row.chestPath.playerLevelAtGate7 = s.level;
      row.chestPath.gate7Blocked = !s.chest.rewards.some((r) => r.kind === "evolution");
      await waitChestClosed(pageA);

      // G2: Basiswaffe Lv8 + passendes Powerup -> Evolution in der Truhe.
      // (Das Powerup ist aus G1 vorhanden; addWeapon setzt die Basiswaffe auf 8.)
      await pageA.evaluate(({ base }) => {
        globalThis.__lf.addWeapon(base, 8);
        globalThis.__lf.openChest();
      }, { base: evo.baseWeapon });
      s = await readRunState(pageA);
      row.chestPath.offered = s.chest.rewards.some(
        (r) => r.kind === "evolution" && r.id === evo.id,
      );
      row.chestPath.firstSlot =
        s.chest.rewards[0]?.kind === "evolution" && s.chest.rewards[0]?.id === evo.id;
      row.chestPath.elapsedSeconds = s.elapsed;
      row.chestPath.weaponLevelAtOffer = s.weapons.find((w) => w.id === evo.baseWeapon)?.level ?? null;
      await waitChestClosed(pageA); // UI-Sequenz applied automatisch
      s = await readRunState(pageA);
      row.chestPath.applied = s.weapons.some((w) => w.id === evo.id);
      row.chestPath.baseReplaced = !s.weapons.some((w) => w.id === evo.baseWeapon);
      row.chestPath.passiveKept = s.passives.some((p) => p.id === evo.passive);
      row.chestPath.noDuplicate = s.weapons.filter((w) => w.id === evo.id).length === 1;
      row.chestPath.appliedAtFrame = s.frame;

      // G3: Doppel-Evolution ueber die Truhe gesperrt.
      await pageA.evaluate(() => globalThis.__lf.openChest());
      s = await readRunState(pageA);
      row.chestPath.noSecondChest = !s.chest.rewards.some((r) => r.kind === "evolution");
      await waitChestClosed(pageA);
    } finally {
      await pageA.close();
    }

    // ── Run B: Level-Up-Pfad (frischer Zustand je Gate-Fall) ───
    const pageB = await browser.newPage({ viewport: { width: 960, height: 540 } });
    pageB.on("pageerror", (e) => errors.push(`B/${evo.id}: ${e}`));
    try {
      await startFreshRun(pageB);

      // G0: Basiswaffe Lv8 + falsches Powerup -> kein Angebot.
      await pageB.evaluate(({ base, wrong }) => {
        globalThis.__lf.addWeapon(base, 8);
        globalThis.__lf.addPassive(wrong, 1);
      }, { base: evo.baseWeapon, wrong: wrongPassive });
      let offers = await openFirstPanel(pageB);
      row.levelupPath.wrongPassiveBlocked = !hasEvo(offers);
      row.levelupPath.offersAtWrongPassive = offers?.length ?? 0;
      await drainPanels(pageB);
      await pageB.evaluate(() => globalThis.__lf.setSuppressLevelUps(true));

      // G1: Basiswaffe Lv7 + passendes Powerup -> kein Angebot.
      await pageB.evaluate(({ base, passive }) => {
        globalThis.__lf.addWeapon(base, 7);
        globalThis.__lf.addPassive(passive, 1);
      }, { base: evo.baseWeapon, passive: evo.passive });
      offers = await openFirstPanel(pageB);
      row.levelupPath.gate7Blocked = !hasEvo(offers);
      row.levelupPath.offersAtGate7 = offers?.length ?? 0;
      await drainPanels(pageB);
      await pageB.evaluate(() => globalThis.__lf.setSuppressLevelUps(true));

      // G2: Basiswaffe Lv8 + passendes Powerup -> Angebot, Slot 0 = Evolution.
      await pageB.evaluate(({ base }) => {
        globalThis.__lf.addWeapon(base, 8);
      }, { base: evo.baseWeapon });
      offers = await openFirstPanel(pageB);
      row.levelupPath.offered = hasEvo(offers);
      row.levelupPath.firstSlot = offers?.[0]?.id === evo.id;
      if (hasEvo(offers)) {
        const idx = offers.findIndex((o) => EVOLUTIONS.some((e) => e.id === o.id));
        await pageB.evaluate((j) => globalThis.__lf.pickLevelUp(j), idx);
      }
      await drainPanels(pageB);
      const sB = await readRunState(pageB);
      row.levelupPath.applied = sB.weapons.some((w) => w.id === evo.id);
      row.levelupPath.baseReplaced = !sB.weapons.some((w) => w.id === evo.baseWeapon);
      row.levelupPath.passiveKept = sB.passives.some((p) => p.id === evo.passive);
      row.levelupPath.noDuplicate = sB.weapons.filter((w) => w.id === evo.id).length === 1;
      row.levelupPath.elapsedSeconds = sB.elapsed;
      row.levelupPath.appliedAtFrame = sB.frame;
      row.level = sB.level;

      // G3: danach kein zweites Angebot (keine Doppel-Evolution).
      offers = await openFirstPanel(pageB);
      row.levelupPath.noSecondOffer = !hasEvo(offers);
      await drainPanels(pageB);
      await pageB.evaluate(() => globalThis.__lf.setSuppressLevelUps(true));
    } finally {
      await pageB.close();
    }

    row.reached =
      row.chestPath.gate7Blocked &&
      row.chestPath.offered &&
      row.chestPath.firstSlot &&
      row.chestPath.applied &&
      row.chestPath.baseReplaced &&
      row.chestPath.passiveKept &&
      row.chestPath.noDuplicate &&
      row.chestPath.noSecondChest &&
      row.levelupPath.gate7Blocked &&
      row.levelupPath.wrongPassiveBlocked &&
      row.levelupPath.offered &&
      row.levelupPath.firstSlot &&
      row.levelupPath.applied &&
      row.levelupPath.baseReplaced &&
      row.levelupPath.passiveKept &&
      row.levelupPath.noDuplicate &&
      row.levelupPath.noSecondOffer;
  } catch (e) {
    row.error = String(e).slice(0, 300);
  }
  results.push(row);
  const pass = row.reached ? "PASS" : "FAIL";
  console.log(`[${i + 1}/6] ${evo.id}: ${pass}${row.error ? ` (${row.error})` : ""}`);
  // Zwischenstand je Kombination schreiben (Modellausfall-Robustheit).
  writeFileSync(OUT, JSON.stringify({ phase: PHASE, seed: SEED, generatedAt: new Date().toISOString(), results }, null, 2));
}

await browser.close();
await server.stop();

const passed = results.filter((r) => r.reached).length;
console.log(`\nEvolutionen erreichbar: ${passed}/6 (Seed ${SEED}, Phase ${PHASE})`);
if (errors.length > 0) console.log(`JS-Fehler: ${errors.length}\n${errors.slice(0, 5).join("\n")}`);
writeFileSync(OUT, JSON.stringify({ phase: PHASE, seed: SEED, generatedAt: new Date().toISOString(), passed, total: 6, results }, null, 2));
process.exit(passed === 6 && errors.length === 0 ? 0 : 1);
