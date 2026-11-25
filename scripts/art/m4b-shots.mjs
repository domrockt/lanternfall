// M4-In-Game-Belege: Titel, CharSelect, Run-Minuten, Bosskampf, Truhe, Terrain.
// Aufruf: node scripts/art/shots.mjs
import { ensureBuild, startServer, loadPlaywright, waitForScene, startRun } from "../harness.mjs";

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const shot = async (name) => {
  await page.screenshot({ path: `shots/m4b-${name}.png` });
  console.log(`shots/m4b-${name}.png`);
};

const base = `http://127.0.0.1:${server.port}`;
const closeLevelUps = async () => {
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < 100; i++) {
      const open = await page.evaluate(() => { try { window.__lf.pickLevelUp(0); return true; } catch { return false; } });
      if (!open) break;
      await page.waitForTimeout(12);
    }
    const st = await page.evaluate(() => window.__lf.state());
    if (!st.levelUpOpen) return;
    await page.waitForTimeout(180);
  }
};

// Titel
await page.goto(`${base}/?debug=1&seed=21`);
await waitForScene(page, "title");
await page.waitForTimeout(700);
await shot("title");

// CharSelect
await page.keyboard.press("Enter");
await waitForScene(page, "charselect");
await page.waitForTimeout(600);
await shot("charselect");

// Run starten
await page.goto(`${base}/?debug=1&seed=21`);
await startRun(page);
await page.evaluate(() => { window.__lf.god(true); window.__lf.autoPlay(true); });

// 6 Basiswaffen + Powerups für volle FX-Dichte.
for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
  await page.evaluate((w) => window.__lf.addWeapon(w, 6), id);
}

// Minuten-Be: echter Run mit 30x statt skipTo -> Zeit, Kills, Level und Drops
// entstehen organisch (kein debug-gestagtes LV/KILL-Verhaeltnis).
await page.evaluate(() => window.__lf.setTimeScale(30));
for (const sec of [120, 720, 1320]) {
  await page.waitForFunction(
    (s) => window.__lf.state().time >= s,
    sec,
    { timeout: 120000, polling: 500 },
  );
  await page.evaluate(() => window.__lf.setTimeScale(1));
  await closeLevelUps();
  await page.waitForTimeout(900);
  const st = await page.evaluate(() => window.__lf.state());
  console.log("minute", sec / 60, "timer", st.time, "level", st.level, "kills", st.kills);
  await shot(`run-minute${sec / 60}`);
  await page.evaluate(() => window.__lf.setTimeScale(30));
}
await page.evaluate(() => window.__lf.setTimeScale(1));

// Gegner-Roster: frischer Run, nur das Tableau (keine Horde, kein Boss-Banner).
await page.goto(`${base}/?debug=1&seed=21`);
await startRun(page);
await page.evaluate(() => window.__lf.autoPlay(false));
const ids = ["bog_rat", "wisp", "mudling", "crow", "bogzombie", "toad", "skeleton", "bat",
  "ghoul", "witchling", "slime", "scarecrow", "wolf", "banshee", "golem", "spider",
  "cultist", "bomber", "knight", "harpy", "lich", "wraith", "treant", "imp", "horror",
  "centipede", "gargoyle", "reaper_bat", "abom", "voidcaller"];
await page.evaluate((list) => {
  const run = window.__game.scene.getScene("run");
  // Bestehende Horde nur ausblenden (Logik laeuft weiter), Tableau frisch spawnen.
  for (const e of run.enemies.active) { e.alive = false; e.sprite.setVisible(false).setActive(false); }
  const cx = run.posX, cy = run.posY;
  list.forEach((id, i) => {
    window.__lf.spawnEnemy(id, 1);
    const e = run.enemies.active[run.enemies.active.length - 1];
    const col = i % 6, row = Math.floor(i / 6);
    e.x = cx + (col - 2.5) * 58;
    e.y = cy + (row - 2) * 50 - 36;
    e.vx = 0; e.vy = 0;
    e.sprite.setPosition(Math.round(e.x), Math.round(e.y));
    e.sprite.setVisible(true).setAlpha(1).clearTint();
  });
  run.playerBody.setPosition(cx, cy + 128);
  // FX/Gems/Projektile ausblenden und den Run pausieren, damit das Tableau
  // ruhig steht (keine wandernden Gegner, keine Waffeneffekte im Bild).
  // Fast eingefroren (winziges dt), damit das Tableau steht und keine neuen
  // Waffeneffekte das Bild fluten.
  run.setTimeScale(0.0002);
}, ids);
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  for (const o of run.children.list) {
    const k = o.texture && o.texture.key;
    if (k && (/^(fx_|projectile_|orb_|gem_|ring_|telegraph|hazard|bolt_|chain_|flail_|arrow_)/.test(k))) {
      o.setVisible(false);
    }
  }
});
await page.waitForTimeout(160);
await shot("enemy-roster");
await page.evaluate(() => window.__game.scene.getScene("run").setTimeScale(1));
await page.evaluate(() => window.__lf.autoPlay(true));

// Bosskampf (Endboss, Phase 2, mitten im Telegraph).
// Für einen lesbaren Boss-Beleg: angesammelte Horde ausblenden (nur Darstellung,
// die Boss-Logik läuft weiter), dann wenige Begleiter frisch spawnen.
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  for (const e of run.enemies.active) { e.alive = false; e.sprite.setVisible(false); }
});
await page.evaluate(() => window.__lf.spawnBoss(5));
await page.evaluate(() => window.__lf.spawnEnemy("skeleton", 3));
await page.waitForTimeout(400);
// Komposition fixieren: Spieler links unter dem Boss, Kamera mittig auf den
// Boss (Follow aus), Zeit fast eingefroren -> Boss vollstaendig im Bild.
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const cam = run.cameras.main;
  const b = run.bosses.living()[0];
  run.setTimeScale(0.05);
  if (b) {
    window.__lf.teleport(b.x - 92, b.y + 46);
    cam.stopFollow();
    cam.centerOn(b.x, b.y - 18);
  }
});
// Banner (2,4 s + 0,38 s) ausblenden lassen, dann Level-ups aufräumen.
await page.waitForTimeout(3000);
// Level-Ups abwählen (AutoPlay erzeugt laufend neue), erst dann screenshotten.
for (let pass = 0; pass < 6; pass++) {
  for (let i = 0; i < 100; i++) {
    const open = await page.evaluate(() => { try { window.__lf.pickLevelUp(0); return true; } catch { return false; } });
    if (!open) break;
    await page.waitForTimeout(15);
  }
  const st = await page.evaluate(() => window.__lf.state());
  if (!st.levelUpOpen) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(300);
// Boss sichtbar machen (Hohler Koenig teleportiert und blendet sich kurz aus)
// und grosse Telegraph-Flaechen ausblenden, damit der Boss selbst zu sehen ist.
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const b = run.bosses.living()[0];
  if (b) { b.sprite.setVisible(true).setAlpha(1); b.sprite.clearTint(); }
  // Volle HP-Leiste fuer ein lesbares HUD (God-Mode laesst sonst 1 HP stehen).
  run.hp = run.maxHp;
  for (const o of run.children.list) {
    const k = o.texture && o.texture.key;
    if (k && (k.startsWith("hazard") || k.startsWith("telegraph") || k.startsWith("enemy_shot"))) {
      o.setVisible(false);
    }
  }
});
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  const cam = run.cameras.main;
  const b = run.bosses.living()[0];
  const px = run.player.x, py = run.player.y;
  // Boss kurz vor dem Shot neben den Spieler setzen und die Kamera zwischen
  // beide legen: Spieler und Boss vollstaendig im Bild, UI bleibt oben.
  if (b) { b.x = px + 80; b.y = py - 36; }
  cam.centerOn(px + 38, py - 22);
});
await page.waitForTimeout(140);
await shot("boss-fight");

// Level-up-Panel mit 18 Icons (Waffen/Powerups/Evolutionen).
await page.evaluate(() => { window.__lf.giveXp(4000); });
await page.waitForTimeout(800);
await shot("levelup");
// Alle aufgestauten Level-Ups abwählen, bis keiner mehr offen ist.
let cleared = 0;
for (let i = 0; i < 400; i++) {
  const open = await page.evaluate(() => { try { window.__lf.pickLevelUp(0); return true; } catch { return false; } });
  if (!open) break;
  cleared++;
  await page.waitForTimeout(30);
}
console.log("levelups cleared:", cleared);
await page.waitForTimeout(300);

// Truhe öffnen: erst alle Level-Ups schließen, dann mit Wiederholung öffnen,
// und bis zum Ende der Roll-Animation warten (Namen müssen stehen).
let chestOpen = false;
for (let pass = 0; pass < 8 && !chestOpen; pass++) {
  for (let i = 0; i < 100; i++) {
    const open = await page.evaluate(() => { try { window.__lf.pickLevelUp(0); return true; } catch { return false; } });
    if (!open) break;
    await page.waitForTimeout(10);
  }
  chestOpen = await page.evaluate(() => { try { window.__lf.openChest(); return true; } catch { return false; } });
  if (!chestOpen) await page.waitForTimeout(150);
}
const chestState = await page.evaluate(() => window.__lf.state());
// Anzahl Belohnungen aus der UI lesen und den Moment abpassen, in dem alle
// Slots ausgerollt sind, das Panel aber noch offen ist.
const rewardCount = await page.evaluate(() => {
  const ui = window.__game.scene.getScene("ui");
  return ui.chestSlots.filter((s) => s.bg.visible).length;
});
console.log("chestOpen:", chestOpen, "chestState:", chestState.chestOpen, "rewards:", rewardCount,
  "panel:", await page.evaluate(() => {
    const ui = window.__game.scene.getScene("ui");
    return { vis: ui.chestGroup.visible, slots: ui.chestSlots.filter((s)=>s.bg.visible).length, paused: ui.run.paused };
  }));
const settleMs = 1450 + Math.max(0, rewardCount - 1) * 220 + 140;
await page.waitForTimeout(settleMs);
console.log("panelAtShot:", await page.evaluate(() => {
  const ui = window.__game.scene.getScene("ui");
  return { vis: ui.chestGroup.visible, paused: ui.run.paused, chestOpen: ui.run.chestOpen,
    alpha: ui.chestGroup.alpha, active: ui.scene.isActive() };
}));
await shot("chest");

// Echte FX-Texturen aus dem laufenden Spiel exportieren (Canvas -> PNG), damit
// der FX-Kontaktbogen die tatsächlichen In-Game-Sprites zeigt (inkl. Ringe/Evo).
const FX_KEYS = [
  "projectile_ember", "projectile_thorn", "projectile_ice", "projectile_phoenix",
  "flail_ball", "chain_link", "orb_lantern", "orb_soul", "bolt_seg",
  "ring_frost", "ring_burst", "ring_seal", "ring_soul",
  "chest_closed", "chest_open", "lantern_small", "gem_small", "gem_medium", "gem_large",
  "fx_coin", "fx_spark", "arrow_chest",
];
const fsm = await import("node:fs");
fsm.mkdirSync("shots/fx", { recursive: true });
for (const key of FX_KEYS) {
  const data = await page.evaluate((k) => {
    const tex = window.__game.textures.get(k);
    if (!tex || tex.key === "__MISSING") return null;
    const src = tex.getSourceImage();
    if (!src || !src.toDataURL) return null;
    return src.toDataURL("image/png");
  }, key);
  if (data) fsm.writeFileSync(`shots/fx/${key}.png`, Buffer.from(data.split(",")[1], "base64"));
}
console.log("fx exported:", FX_KEYS.length);

// Tileset-Atlas (Basiskacheln, Kanten, 3x3-Uebergang, Dekor) fuer den Kontaktbogen.
const atlas = await page.evaluate(() => window.__lf.tileset());
fsm.writeFileSync("shots/tileset-atlas.png", Buffer.from(atlas.split(",")[1], "base64"));

// Frischer Terrain-Beleg fuer den Tiles-Kontaktbogen (960x540 = 2x Spielpixel):
// Gegner und VFX ausblenden, damit Pfad/Moor/Wasser/Dekor unverdeckt zu sehen sind.
await page.evaluate(() => {
  const run = window.__game.scene.getScene("run");
  for (const e of run.enemies.active) { e.alive = false; e.sprite.setVisible(false); }
  for (const o of run.children.list) {
    const k = o.texture && o.texture.key;
    if (k && (k.startsWith("ring_") || k.startsWith("telegraph") ||
        k === "light_radius" || k === "vignette" || k.startsWith("enemy_shot"))) {
      o.setVisible(false);
    }
  }
});
await page.setViewportSize({ width: 960, height: 540 });
await page.waitForTimeout(700);
await shot("probe-terrain");

console.log(JSON.stringify({ jsErrors: errors }));
await browser.close();
server.stop();
