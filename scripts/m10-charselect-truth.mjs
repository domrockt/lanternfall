#!/usr/bin/env node
// Lane m10-charselect-truth K1/K3: Charakter-Auswahl SSOT-Prüfung.
//
// Rendert die CharSelect-Szene headless (Playwright + statischer dist-Server),
// extrahiert ALLE angezeigten PixelText-Zeilen beider Charaktere und vergleicht
// sie gegen die Single Source of Truth in src/data/characters.ts + weapons.ts.
// Ausgabe: shots/m10-charselect-truth-<phase>.json (phase = before|after).
// Exit 1, wenn Abweichungen zwischen Anzeige und Daten bestehen.
//
// Aufruf: node scripts/m10-charselect-truth.mjs [--phase=before|after]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const phase = (() => {
  const m = /--phase=(\w+)/.exec(process.argv.join(" "));
  return m ? m[1] : "before";
})();

// --- SSOT: src/data direkt lesen (regex-geparst, damit das Skript ohne TS-Loader läuft) ---
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

function parseCharacters() {
  const text = src("data/characters.ts");
  const out = {};
  for (const m of text.matchAll(/(\w+):\s*\{([^}]*)\}/g)) {
    const [, id, body] = m;
    if (!["mira", "kael"].includes(id)) continue;
    const num = (key) => {
      const r = new RegExp(`${key}:\\s*(-?[\\d.]+)`).exec(body);
      return r ? Number(r[1]) : undefined;
    };
    const str = (key) => {
      const r = new RegExp(`${key}:\\s*"([^"]+)"`).exec(body);
      return r ? r[1] : undefined;
    };
    const mods = {};
    for (const mm of body.matchAll(/(areaPct|regen|moveSpeedPct|maxHpPct|maxHpFlat|xpPct|cooldownPct|durationPct|pickupRadiusPct|damagePct|armorFlat):\s*(-?[\d.]+)/g)) {
      mods[mm[1]] = Number(mm[2]);
    }
    out[id] = {
      id, name: str("name"), title: str("title"),
      hp: num("hp"), speed: num("speed"), armor: num("armor"),
      startWeapon: str("startWeapon"), mods,
    };
  }
  return out;
}

function parseWeaponNames() {
  const text = src("data/weapons.ts");
  const out = {};
  for (const m of text.matchAll(/(\w+):\s*\{([^{}]*?)name:\s*"([^"]+)"/g)) {
    out[m[1]] = m[3];
  }
  return out;
}

const norm = (s) => s.replace(/\s+/g, " ").trim();

// Erwartete Anzeigezeilen aus den Daten abgeleitet (gleiche Labels wie CharSelect.ts).
function expectedLines(char, weaponNames) {
  const m = char.mods;
  const bonus = [];
  if (m.areaPct) bonus.push(`+${m.areaPct}% FLÄCHENWIRKUNG`);
  if (m.maxHpPct) bonus.push(`+${m.maxHpPct}% MAX-HP`);
  if (m.moveSpeedPct) bonus.push(`${m.moveSpeedPct}% TEMPO`);
  return {
    name: char.name,
    title: char.title.toUpperCase(),
    hp: `HP ${char.hp}`,
    tempo: `TEMPO ${char.speed}`,
    ruestung: `RÜSTUNG ${char.armor}`,
    bonus: bonus.join(" / "),
    start: `START: ${(weaponNames[char.startWeapon] ?? char.startWeapon).toUpperCase()}`,
  };
}

// --- Headless-Lauf: CharSelect rendern und alle Zeilen extrahieren ---
async function captureDisplay() {
  ensureBuild();
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

  await page.goto(`http://127.0.0.1:${server.port}/`);
  await page.waitForFunction(() => Boolean(window.__lf), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__lf.state().scene === "title", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  // Zwei Frames warten, damit alle PixelText-Objekte erzeugt sind.
  await page.evaluate(() => new Promise((r) => window.__game.events.once("step", () => window.__game.events.once("step", r))));

  const { lines, canvasWidth } = await page.evaluate(() => {
    const scene = window.__game.scene.scenes.find((s) => s.scene.key === "charselect");
    const out = [];
    const walk = (list) => {
      for (const obj of list) {
        if (obj.valueText !== undefined) {
          const p = obj.getWorldTransformMatrix().transformPoint(0, 0);
          out.push({ text: obj.valueText, x: Math.round(p.x), y: Math.round(p.y) });
        } else if (Array.isArray(obj.list)) walk(obj.list);
      }
    };
    walk(scene.children.list);
    return { lines: out, canvasWidth: window.__game.scale.gameSize.width };
  });

  await browser.close();
  server.stop();
  return { lines, errors };
}

// --- Abgleich Anzeige vs. Daten ---
// CharSelect-Layout (CharSelect.ts): Panel i liegt bei x = GAME_WIDTH/2 + (i-0.5)*224,
// GAME_WIDTH kommt aus src/config.ts (m10-view-fill: dynamisch, aktuell 640).
const GAME_WIDTH = Number(/GAME_WIDTH\s*=\s*(\d+)/.exec(src("config.ts"))?.[1] ?? 640);
function check(displayLines, chars, weaponNames) {
  // Weltkoordinaten der Texte sind logische Spiel-Einheiten (Kamera-Zoom 1) —
  // keine Skalierung nötig.
  const panelX = (i) => GAME_WIDTH / 2 + (i - 0.5) * 224;
  const deviations = [];
  const panelOf = (line) => {
    const d0 = Math.abs(line.x - panelX(0));
    const d1 = Math.abs(line.x - panelX(1));
    if (d0 === d1) return null; // Header/Overlays exakt mittig → kein Charakterpanel
    return d0 < d1 ? 0 : 1;
  };
  const ids = Object.keys(chars);
  const panels = [0, 1].map((i) => ({
    char: chars[ids[i]],
    lines: displayLines.filter((l) => panelOf(l) === i),
  }));

  for (const { char, lines } of panels) {
    const exp = expectedLines(char, weaponNames);
    const texts = lines.map((l) => norm(l.text));
    const find = (prefix) => texts.find((t) => t.startsWith(prefix));
    const checks = [
      ["name", texts.find((t) => t === norm(char.name)), char.name],
      ["title", texts.find((t) => t === norm(char.title.toUpperCase())), char.title.toUpperCase()],
      ["hp", find("HP "), exp.hp],
      ["tempo", find("TEMPO "), exp.tempo],
      ["ruestung", find("RÜSTUNG "), exp.ruestung],
      ["bonus", find("+") ?? find("MAX-HP") ?? find("FLÄCHENWIRKUNG"), exp.bonus],
      ["start", find("START: "), exp.start],
    ];
    for (const [field, actual, expected] of checks) {
      if (actual === undefined) {
        deviations.push({ char: char.id, field, kind: "fehlt", expected, actual: null });
      } else if (norm(String(actual)) !== norm(String(expected))) {
        deviations.push({ char: char.id, field, kind: "abweichung", expected, actual });
      }
    }
  }
  return deviations;
}

const chars = parseCharacters();
const weaponNames = parseWeaponNames();
const { lines, errors, canvasWidth } = await captureDisplay();
const deviations = check(lines, chars, weaponNames, canvasWidth);

// K4: Sicht-Beleg — 1x-Vollbild der CharSelect-Szene (4x-Zoom wird nach dem
// Lauf per convert nearest-neighbor erzeugt, damit das Pixel-Grid unverzerrt bleibt).
if (process.argv.includes("--shots")) {
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${server.port}/`);
  await page.waitForFunction(() => Boolean(window.__lf), null, { timeout: 10000 });
  await page.waitForFunction(() => window.__lf.state().scene === "title", null, { timeout: 10000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
  await page.evaluate(() => new Promise((r) => window.__game.events.once("step", () => window.__game.events.once("step", r))));
  await page.screenshot({ path: "shots/m10-charselect-truth-1x.png" });
  await browser.close();
  server.stop();
  console.log("[charselect-truth] Shot shots/m10-charselect-truth-1x.png");
}

const result = {
  phase,
  generated: new Date().toISOString(),
  viewport: "960x540 (Canvas 480x270 @2x)",
  data: { characters: chars, weaponNames },
  displayLines: lines,
  jsErrors: errors,
  deviations,
  deviationCount: deviations.length,
};
mkdirSync("shots", { recursive: true });
const out = `shots/m10-charselect-truth-${phase}.json`;
writeFileSync(out, JSON.stringify(result, null, 2));

console.log(`[charselect-truth] ${lines.length} Zeilen extrahiert → ${out}`);
if (deviations.length === 0) {
  console.log("[charselect-truth] PASS: 0 Abweichungen — Anzeige entspricht src/data.");
} else {
  console.log(`[charselect-truth] FAIL: ${deviations.length} Abweichungen:`);
  for (const d of deviations) {
    console.log(`  - ${d.char}.${d.field} (${d.kind}): erwartet "${d.expected}", gefunden "${d.actual}"`);
  }
  process.exit(1);
}
