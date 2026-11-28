#!/usr/bin/env node
// m10-dom-sight-package (r3): Sichtungsmaterial fuer Doms Qualitaets-Durchgang
// Grafik/Effekte (Dom 06:00Z: nach der formalen Abnahme folgt der Qualitaets-
// Durchgang bis zur Sichtabnahme — "Doms Auge entscheidet").
//
// KEINE Code-Aenderungen am Spiel: das Skript sammelt nur Belege.
//   capture : Screenshots je 640x360 UND 1280x720 in ~/games/.evidence/dom-sight/
//             (NICHT getrackt, Repo-Hygiene-Regel 061e70b) + Manifest-JSON dort.
//             Jeder Shot bekommt ein JSON-Sidecar mit WebGL-Renderer-String
//             (iGPU-Pflicht: Mesa Intel RPL-S o. iGPU-Nachweis; SwiftShader ist
//             UNGUELTIG und laesst capture fehlschlagen).
//   verify  : prueft die Existenz JEDES im Katalog aufgeführten Belegs
//             (Worktree-Datei, Git-Objekt oder Evidence-Datei) und den
//             Renderer-String der selbst erzeugten Belege. Exit != 0 bei Fehlern.
//
// Aufruf: node scripts/m10-dom-sight-package.mjs capture|verify
// Kein flock: Screenshot-/Katalog-Lauf, keine FPS-/Echtzeitmessung.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const EVID_DIR = join(homedir(), "games", ".evidence", "dom-sight");
const FORMATS = [
  { name: "640x360", viewport: { width: 640, height: 360 } },
  { name: "1280x720", viewport: { width: 1280, height: 720 } },
];
const MINUTES = [60, 300, 600, 1200, 1800]; // Minute 1/5/10/20/30

// ── K2-Katalog: bestehende Belege (Pfad + Stand) ─────────────────────────────
// type "worktree" = Datei im main-Worktree (getrackt oder untracked), "git-object"
// = nur auf Lane-Branch. (Ein "evidence"-Typ ist nicht nötig: Belege unter
// ~/games/.evidence/ prüft verify direkt über das Manifest.)
const QA_VFX = [
  "ember", "flail", "frost", "lantern", "storm", "thorn",
  "eternal_winter", "phoenix", "soul_beacon", "thorn_storm", "thunder_seal", "wrath_pendulum",
];
const CATALOG = [
  ...QA_VFX.map((id) => ({
    group: "Waffen-/Evolutions-GIFs (12)", name: `qa-vfx-${id}.gif`,
    path: `shots/qa-vfx-${id}.gif`, type: "worktree",
  })),
  ...["tier0", "tier1", "tier2", "tier3", "tier4"].flatMap((t) => [
    { group: "Gegner-Galerie (30)", name: `contact-1x-${t}`, path: `shots/m10-art-contact-1x-enemies-${t}.png`, type: "worktree" },
    { group: "Gegner-Galerie (30)", name: `contact-4x-${t}`, path: `shots/m10-art-contact-4x-enemies-${t}.png`, type: "worktree" },
  ]),
  { group: "Boss-Galerie (6)", name: "contact-1x-bosses", path: "shots/m10-art-contact-1x-bosses.png", type: "worktree" },
  { group: "Boss-Galerie (6)", name: "contact-4x-bosses", path: "shots/m10-art-contact-4x-bosses.png", type: "worktree" },
  { group: "Helden-Galerie (2)", name: "contact-1x-heroes", path: "shots/m10-art-contact-1x-heroes.png", type: "worktree" },
  { group: "Helden-Galerie (2)", name: "contact-4x-heroes", path: "shots/m10-art-contact-4x-heroes.png", type: "worktree" },
  // Evo-After-Belege der Evo-Kette (main-Worktree, je 640er Shot + JSON):
  { group: "Evo-After phoenix", name: "after-640", path: "shots/m10-evo-fx-phoenix-after-640.png", type: "worktree" },
  { group: "Evo-After phoenix", name: "after-json", path: "shots/m10-evo-fx-phoenix-after.json", type: "worktree" },
  { group: "Evo-After winter", name: "after-640", path: "shots/m10-evo-fx-winter-after-640.png", type: "worktree" },
  { group: "Evo-After winter", name: "after-json", path: "shots/m10-evo-fx-winter-after.json", type: "worktree" },
  { group: "Evo-After winter-w2", name: "after-640", path: "shots/m10-evo-fx-winter-w2-after-640.png", type: "worktree" },
  { group: "Evo-After winter-w2", name: "after-json", path: "shots/m10-evo-fx-winter-w2-after.json", type: "worktree" },
  { group: "Evo-After soulpyre", name: "after-640", path: "shots/m10-evo-fx-soulpyre-after-640.png", type: "worktree" },
  { group: "Evo-After soulpyre", name: "after-json", path: "shots/m10-evo-fx-soulpyre-after.json", type: "worktree" },
  { group: "Evo-After zornpendel", name: "after-640", path: "shots/m10-evo-fx-zornpendel-after-640.png", type: "worktree" },
  { group: "Evo-After zornpendel", name: "after-json", path: "shots/m10-evo-fx-zornpendel-after.json", type: "worktree" },
  { group: "Evo-After gewittersiegel", name: "after-640", path: "shots/m10-evo-fx-gewittersiegel-after-640.png", type: "worktree" },
  { group: "Evo-After gewittersiegel", name: "after-json", path: "shots/m10-evo-fx-gewittersiegel-after.json", type: "worktree" },
  { group: "Evo-After dornensturm", name: "after-640", path: "shots/m10-evo-fx-dornensturm-after-640.png", type: "worktree" },
  { group: "Evo-After dornensturm", name: "after-gif", path: "shots/m10-evo-fx-dornensturm-after.gif", type: "worktree" },
  // form-polish (Merge d73ab80 OHNE Lane-Beleg-Shots): After-Belege liegen auf
  // dem Lane-Branch, Stand = Lane-Commit (ehrlich ausgewiesen, siehe K3-Doku).
  ...["phoenix", "eternal_winter", "soul_beacon", "thorn_storm", "thunder_seal", "wrath_pendulum"].map((id) => ({
    group: "Evo-After form-polish (Lane-Branch)", name: `after-${id}`,
    path: `shots/m10-evo-fx-form-polish-after-${id}-640.png`, type: "git-object", ref: "m10-evo-fx-form-polish",
  })),
];

const git = (args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const mainCommitOf = (path) => {
  try {
    const line = git(["log", "-1", "--format=%h %ad", "--date=short", "--", path]);
    if (line) return line;
  } catch { /* unten */ }
  return existsSync(path) ? "untracked im main-Worktree (shots/* gitignore, kein Commit)" : "fehlt";
};
const branchTip = (ref) => git(["rev-parse", "--short", ref]);

const BAD_RENDERER = /SwiftShader|llvmpipe|softpipe|BasicRender/i;

async function capture() {
  ensureBuild();
  mkdirSync(EVID_DIR, { recursive: true });
  const { chromium } = await loadPlaywright();
  const server = await startServer();
  const browser = await chromium.launch({
    args: ["--autoplay-policy=no-user-gesture-required"],
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    job: "m10-dom-sight-package-r3",
    rendererPolicy: "iGPU-Pflicht (Mesa Intel RPL-S o. iGPU-Nachweis); SwiftShader/llvmpipe ungültig",
    renderer: {}, jsErrors: [], shots: [], catalog: [], openPoints: [],
  };
  const errors = [];

  try {
    for (const fmt of FORMATS) {
      const context = await browser.newContext({ viewport: fmt.viewport, deviceScaleFactor: 1 });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(`${fmt.name}: ${String(e)}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.name}: ${m.text()}`); });

      // Boot-Screen: Preload verlangsamen (erste sfx-Wavs), damit die Boot-Szene
      // ("LADE MOOR ...") sicher sichtbar ist.
      let delayed = 0;
      await page.route("**/sfx/*.wav", async (route) => {
        delayed += 1;
        if (delayed <= 6) await new Promise((r) => setTimeout(r, 500));
        await route.continue();
      });
      await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=77`);

      const renderer = await (async () => {
        await page.waitForFunction(() => Boolean(window.__lf?.rendererInfo), null, { timeout: 20000 });
        return await page.evaluate(() => window.__lf.rendererInfo());
      })();
      if (BAD_RENDERER.test(renderer.renderer)) {
        throw new Error(`${fmt.name}: ungültiger Renderer "${renderer.renderer}" — SwiftShader/Software-GL ist als Beleg unzulässig`);
      }
      manifest.renderer[fmt.name] = {
        context: renderer.context, renderer: renderer.renderer, vendor: renderer.vendor,
        version: renderer.version, maxTextureSize: renderer.maxTextureSize,
      };

      const shot = async (name, extra = {}) => {
        const file = `${name}-${fmt.name}.png`;
        await page.screenshot({ path: join(EVID_DIR, file) });
        const st = await page.evaluate(() => window.__lf.state());
        writeFileSync(join(EVID_DIR, `${name}-${fmt.name}.json`), JSON.stringify({
          shot: name, format: fmt.name, viewport: fmt.viewport, dpr: 1,
          generatedAt: new Date().toISOString(),
          renderer: { context: renderer.context, renderer: renderer.renderer, vendor: renderer.vendor },
          scene: st.scene, state: { time: st.time, level: st.level, enemies: st.enemies, character: st.character },
          jsErrorsSoFar: errors.length, ...extra,
        }, null, 2));
        manifest.shots.push({ name, format: fmt.name, path: join(EVID_DIR, file), scene: st.scene });
      };

      // 1) Boot-Screen
      await page.waitForFunction(
        () => window.__lf && window.__lf.state().scene === "boot",
        null, { timeout: 15000, polling: "raf" },
      ).catch(async () => {
        const s = await page.evaluate(() => window.__lf?.state().scene ?? "?");
        throw new Error(`Boot-Szene nicht erwischt (aktuell: ${s})`);
      });
      await shot("boot", { note: "Boot-Szene 'LADE MOOR ...', Preload via sfx-Route verlangsamt" });

      // 2) Titel
      await waitForScene(page, "title");
      await page.waitForTimeout(600);
      await shot("title");

      // 3) Optionen (Titel: Taste O)
      await page.keyboard.press("o");
      await page.waitForTimeout(400);
      await shot("options");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // 4) Charakterauswahl — beide Charaktere
      await page.keyboard.press("Enter");
      await waitForScene(page, "charselect");
      await page.waitForTimeout(400);
      await shot("charselect-kael");
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(400);
      await shot("charselect-mira");

      // 5) Lauf starten (mit dem zweiten Charakter), dann Minuten-Shots
      await page.keyboard.press("Enter");
      await waitForScene(page, "run");
      await page.evaluate(() => {
        window.__lf.god(true);
        window.__lf.autoPlay(true);
      });
      for (const t of MINUTES) {
        await page.evaluate((sec) => window.__lf.skipTo(sec), t);
        await page.waitForTimeout(500);
        if (t === 600) {
          // 6) Truhe-Reveal-Moment (bei Minute 10)
          await page.evaluate(() => window.__lf.openChest());
          await page.waitForTimeout(450);
          await shot("chest-reveal", { note: "Reveal-Animation ~0.45s nach openChest()" });
          await page.waitForTimeout(900);
        }
        await shot(`minute-${String(t / 60).padStart(2, "0")}`);
      }

      // 7) Pause
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await shot("pause");

      // 8) Results
      await page.keyboard.press("Escape"); // fortsetzen
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__lf.finishRun("giveup"));
      await waitForScene(page, "results");
      await page.waitForTimeout(500);
      await shot("results");

      await context.close();
    }
  } finally {
    await browser.close();
    server.stop();
  }

  manifest.jsErrors = errors;
  manifest.catalog = CATALOG.map((e) => ({
    ...e,
    stand: e.type === "git-object" ? `Lane-Branch ${e.ref} @ ${branchTip(e.ref)}` : `main @ ${mainCommitOf(e.path)}`,
  }));
  manifest.openPoints = [
    "Halo-Überstrahlung Ember (bekannter Restpunkt, Dom-Qualitätsliste)",
    "form-polish After-Belege liegen nur auf Lane-Branch m10-evo-fx-form-polish (Merge d73ab80 ohne Lane-Shots)",
    "Im Fluss: 6 -r2-Code-Lanes warten auf den Vera-Guard (nicht gemergt; maßgebliche Liste ~/games/.dispatch/claims.json) — deren Belege sind nicht Teil dieses Pakets",
  ];
  writeFileSync(join(EVID_DIR, "dom-sight-manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`ok: ${manifest.shots.length} Shots in ${EVID_DIR}`);
  console.log(`renderer: ${JSON.stringify(manifest.renderer)}`);
  if (errors.length) {
    console.error(`JS-FEHLER (${errors.length}):\n` + errors.join("\n"));
    process.exit(1);
  }
}

function verify() {
  const missing = [];
  for (const e of CATALOG) {
    if (e.type === "worktree" && !existsSync(e.path)) missing.push(`${e.path} (worktree)`);
    if (e.type === "git-object") {
      try { execFileSync("git", ["cat-file", "-e", `${e.ref}:${e.path}`]); }
      catch { missing.push(`${e.path} (git-object ${e.ref})`); }
    }
  }
  if (!existsSync(join(EVID_DIR, "dom-sight-manifest.json"))) {
    missing.push(`${join(EVID_DIR, "dom-sight-manifest.json")} (evidence)`);
  }
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync(join(EVID_DIR, "dom-sight-manifest.json"), "utf8"));
  } catch { /* unten gemeldet */ }
  if (manifest) {
    for (const s of manifest.shots ?? []) {
      if (!existsSync(s.path)) missing.push(`${s.path} (evidence shot)`);
      const sidecar = s.path.replace(/\.png$/, ".json");
      if (!existsSync(sidecar)) missing.push(`${sidecar} (evidence sidecar)`);
    }
    for (const [fmt, r] of Object.entries(manifest.renderer ?? {})) {
      if (BAD_RENDERER.test(String(r.renderer))) missing.push(`renderer ${fmt} = "${r.renderer}" (Software-GL unzulässig)`);
    }
    if ((manifest.jsErrors ?? []).length) missing.push(`${manifest.jsErrors.length} JS-Fehler im Capture-Lauf`);
  }
  if (missing.length) {
    console.error(`FEHLER: ${missing.length} Belege fehlen/unzulaessig:\n` + missing.join("\n"));
    process.exit(1);
  }
  console.log(`ok: alle ${CATALOG.length} Katalog-Belege + ${(manifest?.shots ?? []).length} Shots vorhanden, Renderer iGPU, 0 JS-Fehler`);
}

const mode = process.argv[2] ?? "verify";
if (mode === "capture") await capture();
else if (mode === "verify") verify();
else { console.error(`unbekannter Modus "${mode}" — nutze capture|verify`); process.exit(2); }
