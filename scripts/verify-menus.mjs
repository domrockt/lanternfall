#!/usr/bin/env node
// Lane m10-verify-menus-view: Screenshots aller Menü-Szenen, Maus/Tastatur-Pfade,
// Options-Persistenz über Reload, Meta-Bestwerte. Exit 0 nur wenn alles grün.
//
// M8/M10: Der View ist dynamisch (logische Höhe 360, Breite je Seitenverhältnis,
// Fit-Rückfall 480x360). Dieser Harness klickt deshalb NICHT mehr auf feste
// Pixelkoordinaten, sondern liest zur Laufzeit die sichtbaren PixelText-Objekte
// der aktiven Szenen (Wert + Bounds) und klickt deren Rechteck-Zentren. Das
// Klick-Mapping auf den Canvas läuft über __game.scale + canvas boundingBox.
// Tastatur-Pfade bleiben als Kontrolle (ESC, Aufgeben, "o").
// Viewport überschreibbar: MENUS_VIEWPORT=1280x720 node scripts/verify-menus.mjs
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const VIEWPORT = (() => {
  const m = /^(\d+)x(\d+)$/.exec(process.env.MENUS_VIEWPORT ?? "");
  return m ? { width: Number(m[1]), height: Number(m[2]) } : { width: 960, height: 540 };
})();

ensureBuild();
mkdirSync("shots", { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: VIEWPORT });
const errors = [];
const DEFAULT_MUSIC = 0.55;
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

// Vor dem Laden Bestwerte setzen, damit Titel/CharSelect echte Meta-Daten zeigen.
await page.addInitScript(() => {
  if (localStorage.getItem("m6-seeded") === "1") return;
  localStorage.setItem("lanternfall-meta-v1", JSON.stringify({
    mira: { time: 754, kills: 456, level: 12, victories: 0, runs: 2 },
    kael: { time: 512, kills: 301, level: 9, victories: 1, runs: 3 },
  }));
  localStorage.removeItem("lanternfall-options-v1");
  localStorage.setItem("m6-seeded", "1");
});

const shots = [];
const snap = async (name) => {
  const path = `shots/m10-verify-menus-${name}.png`;
  await page.screenshot({ path });
  shots.push(path);
};

// --- Klick-Ziele aus der laufenden Szene lesen (kein festes 480x270-Layout) ---

/** Alle sichtbaren Text-Objekte (PixelText.valueText) der aktiven Szenen mit Weltposition.
 *
 * Bewusst `getWorldTransformMatrix().transformPoint(0,0)` statt `getBounds()`:
 * Container-Bounds sind bei PixelText unsauber (Glyph-Texturen verfälschen Höhe/Y),
 * die Weltposition des Text-Ursprungs liegt bei allen Menü-Texten (zentriert oder
 * als Zeilen-Label) sicher innerhalb des klickbaren Elements. */
const readTargets = () => page.evaluate(() => {
  const out = [];
  const walk = (obj, parentVisible) => {
    if (obj == null) return;
    if (Array.isArray(obj)) { for (const c of obj) walk(c, parentVisible); return; }
    const visible = parentVisible && obj.visible !== false;
    if (obj.list) { for (const c of obj.list) walk(c, visible); }
    if (visible && typeof obj.valueText === "string" && obj.valueText.length > 0) {
      try {
        const p = obj.getWorldTransformMatrix().transformPoint(0, 0);
        out.push({ text: obj.valueText, cx: p.x, cy: p.y });
      } catch { /* Transformation nicht verfügbar -> überspringen */ }
    }
  };
  for (const s of window.__game.scene.scenes) {
    if (!s.scene.isActive()) continue;
    walk(s.children, true);
  }
  return out;
});

/** Wähle das beste Ziel: exakter Treffer > Präfix > enthält; kürzester Text gewinnt. */
const pickTarget = (targets, needle) => {
  const norm = (s) => s.toLowerCase();
  const n = norm(needle);
  const hits = targets.filter((t) => norm(t.text).includes(n));
  if (hits.length === 0) return null;
  const exact = hits.filter((t) => norm(t.text) === n);
  const byPrefix = hits.filter((t) => norm(t.text).startsWith(n));
  const pool = exact.length ? exact : (byPrefix.length ? byPrefix : hits);
  return pool.reduce((a, b) => (b.text.length < a.text.length ? b : a));
};

const view = () => page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
const canvasBox = () => page.locator("canvas").boundingBox();

/** Klickt auf den Center der Bounds eines zur Laufzeit gefundenen Text-Objekts. */
const clickTarget = async (target) => {
  const box = await canvasBox();
  const v = await view();
  await page.mouse.click(
    box.x + (target.cx / v.w) * box.width,
    box.y + (target.cy / v.h) * box.height,
  );
  await page.waitForTimeout(220);
};

/** Klickt das Menü-Element mit diesem Label (aus der laufenden Szene, nicht fix). */
const clickLabel = async (needle) => {
  const target = pickTarget(await readTargets(), needle);
  if (!target) throw new Error(`Klick-Ziel "${needle}" nicht in der aktiven Szene gefunden`);
  await clickTarget(target);
  return target;
};

/**
 * Klickt den ">"-Pfeil einer Optionszeile: Zeile über ihr Label finden, dann der
 * ">"-Text mit dem kleinsten y-Abstand. Funktioniert für jede View-Breite, weil
 * Zeilen-/Pfeilpositionen aus der Szene kommen.
 */
const clickOptionArrow = async (rowLabel) => {
  const targets = await readTargets();
  const row = pickTarget(targets, rowLabel);
  if (!row) throw new Error(`Optionszeile "${rowLabel}" nicht gefunden`);
  const arrows = targets
    .filter((t) => t.text === ">")
    .sort((a, b) => Math.abs(a.cy - row.cy) - Math.abs(b.cy - row.cy));
  if (arrows.length === 0) throw new Error(`Kein ">"-Pfeil für Zeile "${rowLabel}" gefunden`);
  await clickTarget(arrows[0]);
  return arrows[0];
};

const state = () => page.evaluate(() => window.__lf.state());
const options = () => page.evaluate(() => window.__lf.options());

const checks = [];
const check = (name, ok, detail) => {
  checks.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`);
};

let result = {};
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(500);
  const v0 = await view();
  if (v0.w === 480 && v0.h === 360) await snap("title-480x360"); // Sichtbeleg Fit-View
  await snap("title");

  // Optionen per Maus öffnen (Ziel = Button-Label aus der Szene); Werte per Tastatur ändern.
  await clickLabel("OPTIONEN");
  await page.waitForTimeout(200);
  await snap("options");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);

  // Credits per Maus öffnen und zurück.
  await clickLabel("CREDITS");
  await waitForScene(page, "credits");
  await page.waitForTimeout(250);
  await snap("credits");
  await clickLabel("ZURÜCK");
  await waitForScene(page, "title");

  // Charakterwahl: Kael per Maus wählen (Panel-Label), dann START-Knopf.
  await clickLabel("START");
  await waitForScene(page, "charselect");
  await page.waitForTimeout(300);
  await clickLabel("KAEL");
  await snap("charselect");
  const selectState = await state();
  check("charselect erreichbar", selectState.scene === "charselect", selectState.scene);
  await clickLabel("START (ENTER)");
  await waitForScene(page, "run");
  await page.waitForTimeout(500);
  check("run erreicht", (await state()).scene === "run");
  // Keine Level-up-Dialoge zwischen Build-Aufbau und Aufgeben.
  await page.evaluate(() => window.__lf.setSuppressLevelUps(true));

  // Build für die Pause-Übersicht füllen (6 Evolutionen + 6 Powerups).
  await page.evaluate(() => {
    const w = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
    for (const id of w) window.__lf.addWeapon(id, 8);
    const p = ["boots", "tome", "heart", "charm", "whetstone", "hourglass"];
    for (let i = 0; i < p.length; i++) window.__lf.addPassive(p[i], 1 + (i % 5));
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const paused = await state();
  check("Pause geöffnet", paused.paused === true);
  await snap("pause");

  // Pause-Optionen per Maus öffnen/schließen.
  await clickLabel("OPTIONEN");
  await page.waitForTimeout(200);
  await snap("options-pause");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const afterOptionsEsc = await state();
  check(
    "ESC schliesst Pause-Optionen, Pause bleibt",
    afterOptionsEsc.paused === true && afterOptionsEsc.scene === "run",
    `paused=${afterOptionsEsc.paused}`,
  );

  // Kur, Schaden sammeln, wieder pausieren und aufgeben.
  await clickLabel("FORTSETZEN");
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__lf.spawnEnemy("bog_rat", 30));
  await page.waitForTimeout(1800);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  // Aufgeben per Tastatur (Fokus-Navigation der Pause-Knöpfe) – Kontrolle zum Maus-Pfad.
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(70);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(70);
  await page.keyboard.press("Enter");
  await waitForScene(page, "results");
  await page.waitForTimeout(400);
  const defeat = await state();
  check("Aufgeben führt zu Results", defeat.scene === "results", defeat.scene);
  await snap("results-defeat");

  // Neue Runde per Maus, dann Debug-Sieg -> Sieg-Ergebnis.
  await clickLabel("NEUE RUNDE");
  await waitForScene(page, "run");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__lf.setSuppressLevelUps(true);
    window.__lf.addWeapon("phoenix", 8);
    window.__lf.addWeapon("thunder_seal", 8);
    window.__lf.spawnEnemy("skeleton", 24);
  });
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    window.__lf.skipTo(1700);
    window.__lf.finishRun("dawn");
  });
  await waitForScene(page, "results");
  await page.waitForTimeout(400);
  await snap("results-victory");
  check("Sieg-Ergebnis erreichbar", (await state()).scene === "results");

  // Zurück zum Titel und Meta-Anzeige prüfen.
  await clickLabel("TITEL");
  await waitForScene(page, "title");
  await page.waitForTimeout(350);
  await snap("title-meta");
  const meta = await page.evaluate(() => window.__lf.meta());
  check("Meta: Kael hat 2 Runs", meta.kael.runs >= 2, String(meta.kael.runs));
  check("Meta: Kael-Sieg gespeichert", meta.kael.victories >= 1, String(meta.kael.victories));

  // Optionen ändern (Maus), Screenshot, dann Reload-Persistenz.
  await clickLabel("OPTIONEN");
  await page.waitForTimeout(200);
  await snap("options-open-final");
  await clickOptionArrow("MUSIK");          // +10 % (Schritt)
  await clickOptionArrow("SCREEN-SHAKE");   // umschalten
  await clickOptionArrow("DAMAGE-NUMBERS"); // umschalten
  await clickOptionArrow("SKALIERUNG");     // AUTO -> 2X
  await page.waitForTimeout(250);
  const box = await canvasBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  // Erwartete Canvas-Größe aus dem Viewport rechnen (gleiche Regel wie computeView, dpr=1):
  const nFit = Math.floor(Math.min(VIEWPORT.height / 360, VIEWPORT.width / 480));
  const nEff = Math.max(1, Math.min(2, nFit));
  const expectW = nFit < 2
    ? Math.round(Math.min(VIEWPORT.width / 480, VIEWPORT.height / 360) * 480)
    : Math.min(860, Math.max(480, Math.round(VIEWPORT.width / nEff))) * nEff;
  const expectH = nFit < 2
    ? Math.round(Math.min(VIEWPORT.width / 480, VIEWPORT.height / 360) * 360)
    : 360 * nEff;
  check(
    "Skalierung 2X gestellt, Fit-View zentriert",
    Math.abs(cx - VIEWPORT.width / 2) <= 2 && Math.abs(cy - VIEWPORT.height / 2) <= 2
      && box.width === expectW && box.height === expectH,
    `center ${cx}/${cy}, ${box.width}x${box.height} (erwartet ${expectW}x${expectH})`,
  );
  await snap("options-changed");
  const beforeReload = await options();
  check("Optionen: Musik erhöht", beforeReload.music > DEFAULT_MUSIC, String(beforeReload.music));
  check("Optionen: Damage-Numbers aus", beforeReload.damageNumbers === false);
  check("Optionen: Skalierung 2X", beforeReload.scale === 2, String(beforeReload.scale));

  await page.reload();
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(350);
  const afterReload = await options();
  check(
    "Optionen überleben Reload",
    JSON.stringify(beforeReload) === JSON.stringify(afterReload),
    JSON.stringify(afterReload),
  );
  await page.keyboard.press("o");
  await page.waitForTimeout(250);
  await snap("options-reload-menu");
  await page.keyboard.press("Escape");

  // Für folgende Läufe wieder sinnvolle Defaults setzen.
  await page.evaluate(() => {
    window.__lf.setOption("music", 0.55);
    window.__lf.setOption("shake", true);
    window.__lf.setOption("damageNumbers", true);
    window.__lf.setOption("scale", 0);
  });

  result = {
    milestone: "m10-verify-menus-view",
    viewport: VIEWPORT,
    logicalView: v0,
    shots,
    checks,
    optionsBeforeReload: beforeReload,
    optionsAfterReload: afterReload,
    meta: await page.evaluate(() => window.__lf.meta()),
    jsErrors: errors,
  };
} catch (err) {
  errors.push(String(err));
  console.error(err);
} finally {
  const missing = shots.filter((p) => !existsSync(p) || statSync(p).size < 10_000);
  check("alle Screenshots vorhanden", missing.length === 0, missing.join(", "));
  check("keine JS-Fehler", errors.length === 0, errors.join(" | "));
  const passed = checks.every((c) => c.ok);
  result = { ...result, passed, jsErrors: errors, checks, shots };
  writeFileSync("shots/m10-verify-menus.json", JSON.stringify(result, null, 2));
  await browser.close();
  server.stop();
  console.log(`\n${passed ? "verify-menus: PASS" : "verify-menus: FAIL"} (${checks.filter((c) => c.ok).length}/${checks.length} Checks)`);
  process.exit(passed ? 0 : 1);
}
