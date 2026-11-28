#!/usr/bin/env node
// Lane m10-charstats-ssot K4: Sicht-Beleg — CharSelect zeigt die SSOT-Werte.
//
// Liest src/data/characters.ts (Regex, kein TS-Loader), rendert die
// CharSelect-Szene headless (Playwright + statischer dist-Server), extrahiert
// alle PixelText-Zeilen und prüft: Anzeige == Daten (insbesondere Mira
// "HP 90" nach dem K2-Fix). Ausgabe:
//   - JSON-Beleg: ~/games/.evidence/m10-charstats-ssot/charselect-display.json
//     (Belege leben außerhalb des Repos, Dom 27.11.)
//   - Sichtbeleg: shots/abnahme/m10-charstats-charselect-640.png (1x, 640x360)
//   - Vergrößerter Sichtbeleg (2x nearest): .evidence/.../charselect-640-2x.png
// Kein Eingriff in Szenen-Code. Exit 1 bei JS-Fehlern oder Abweichungen.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright } from "./harness.mjs";

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const norm = (s) => s.replace(/\s+/g, " ").trim();
const EVIDENCE = join(homedir(), "games", ".evidence", "m10-charstats-ssot");

// --- SSOT: src/data/characters.ts direkt lesen (wie m10-charselect-truth.mjs) ---
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
    for (const mm of body.matchAll(
      /(areaPct|regen|moveSpeedPct|maxHpPct|maxHpFlat|xpPct|cooldownPct|durationPct|pickupRadiusPct|damagePct|armorFlat):\s*(-?[\d.]+)/g,
    )) {
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
  for (const m of text.matchAll(/(\w+):\s*\{([^{}]*?)name:\s*"([^"]+)"/g)) out[m[1]] = m[3];
  return out;
}

function expectedLines(char, weaponNames) {
  const m = char.mods;
  const bonus = [];
  if (m.areaPct) bonus.push(`+${m.areaPct}% FLÄCHENWIRKUNG`);
  if (m.maxHpPct) bonus.push(`+${m.maxHpPct}% MAX-HP`);
  if (m.moveSpeedPct) bonus.push(`${m.moveSpeedPct}% TEMPO`);
  return {
    hp: `HP ${char.hp}`,
    tempo: `TEMPO ${char.speed}`,
    ruestung: `RÜSTUNG ${char.armor}`,
    bonus: bonus.join(" / "),
    start: `START: ${(weaponNames[char.startWeapon] ?? char.startWeapon).toUpperCase()}`,
  };
}

const chars = parseCharacters();
const weaponNames = parseWeaponNames();
const GAME_WIDTH = Number(/GAME_WIDTH\s*=\s*(\d+)/.exec(src("config.ts"))?.[1] ?? 640);

// --- Headless: CharSelect rendern, Zeilen + Screenshot ziehen ---
ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: GAME_WIDTH, height: 360 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });

await page.goto(`http://127.0.0.1:${server.port}/`);
await page.waitForFunction(() => Boolean(window.__lf), null, { timeout: 10000 });
await page.waitForFunction(() => window.__lf.state().scene === "title", null, { timeout: 10000 });
await page.keyboard.press("Enter");
await page.waitForFunction(() => window.__lf.state().scene === "charselect", null, { timeout: 10000 });
await page.evaluate(() => new Promise((r) => window.__game.events.once("step", () => window.__game.events.once("step", r))));

const { lines } = await page.evaluate(() => {
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
  return { lines: out };
});

mkdirSync("shots/abnahme", { recursive: true });
await page.screenshot({ path: "shots/abnahme/m10-charstats-charselect-640.png" });
await browser.close();
server.stop();

// --- Abgleich Anzeige vs. Daten (Panel-Zuordnung wie CharSelect-Layout) ---
const panelX = (i) => GAME_WIDTH / 2 + (i - 0.5) * 224;
const panelOf = (line) => {
  const d0 = Math.abs(line.x - panelX(0));
  const d1 = Math.abs(line.x - panelX(1));
  if (d0 === d1) return null;
  return d0 < d1 ? 0 : 1;
};
const ids = Object.keys(chars);
const deviations = [];
for (let i = 0; i < 2; i++) {
  const char = chars[ids[i]];
  const texts = lines.filter((l) => panelOf(l) === i).map((l) => norm(l.text));
  const find = (prefix) => texts.find((t) => t.startsWith(prefix));
  const exp = expectedLines(char, weaponNames);
  const checks = [
    ["name", texts.find((t) => t === norm(char.name)), char.name],
    ["hp", find("HP "), exp.hp],
    ["tempo", find("TEMPO "), exp.tempo],
    ["ruestung", find("RÜSTUNG "), exp.ruestung],
    ["bonus", find("+") ?? find("MAX-HP") ?? find("FLÄCHENWIRKUNG"), exp.bonus],
    ["start", find("START: "), exp.start],
  ];
  for (const [field, actual, expected] of checks) {
    if (actual === undefined) deviations.push({ char: char.id, field, kind: "fehlt", expected });
    else if (norm(String(actual)) !== norm(String(expected)))
      deviations.push({ char: char.id, field, kind: "abweichung", expected, actual });
  }
}

const result = {
  lane: "m10-charstats-ssot",
  generated: new Date().toISOString(),
  viewport: `${GAME_WIDTH}x360 (Canvas 1x)`,
  data: { characters: chars, weaponNames },
  displayLines: lines,
  jsErrors: errors,
  deviations,
  deviationCount: deviations.length,
  screenshot: "shots/abnahme/m10-charstats-charselect-640.png",
};

mkdirSync(EVIDENCE, { recursive: true });
const jsonPath = join(EVIDENCE, "charselect-display.json");
writeFileSync(jsonPath, JSON.stringify(result, null, 2));
execSync(
  `convert shots/abnahme/m10-charstats-charselect-640.png -filter point -resize 200% "${join(EVIDENCE, "charselect-640-2x.png")}"`,
  { stdio: "ignore" },
);

console.log(`[charstats-ssot] ${lines.length} Zeilen, ${deviations.length} Abweichungen, ${errors.length} JS-Fehler`);
console.log(`[charstats-ssot] JSON: ${jsonPath}`);
console.log(`[charstats-ssot] Shot: shots/abnahme/m10-charstats-charselect-640.png`);
if (errors.length || deviations.length) {
  console.error(JSON.stringify({ errors, deviations }, null, 2));
  process.exit(1);
}
