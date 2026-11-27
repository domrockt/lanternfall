#!/usr/bin/env node
// M10-hud-wide-anchor: misst die HUD-Anker bei 4 Formaten (M8-Display-Tabelle):
//
//   640x360-ref  = 1920x1080 @1  -> 640x360 (n=3, Referenzpfad, AE=0)
//   780x360@3    = 2340x1080 @3  -> 780x360 (n=3)
//   1280x720     = 1280x720  @1  -> 640x360 (n=2)
//   1920x1080    = 1920x1080 @1  -> 640x360 (n=3)
//
// Pro Format und Zustand (hud, banner, levelup, chest) werden die ECHT
// gerenderten Bounding-Boxen der benannten GameObjects gemessen (SetName-
// Instrumentierung in UI.ts, aendert kein Layout) und gegen den Safe-Area-Rand
// geprueft (links/rechts 5 px, oben 1 px, unten 7 px Spielpixel - HUD-Konvention
// der 640x360-Referenz; alle 4 Formate sind Profile ohne Geraete-Insets).
// Zusätzlich: Kollisionen zwischen den HUD-Bloecken und ganzzahlige
// Spielpixel-Positionen (Pixelgenauigkeit).
//
// Kein FPS-Gate, kein flock: reine Geometrie-/Anzeige-Messung.
// Aufruf: node scripts/m10-hud-anchor.mjs --tag baseline|after
import { writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "baseline"));

// M8-Display-Tabelle: Geraet -> logische View. safeArea: HUD-Konvention in
// Spielpixeln (siehe docs/lanes/m10-hud-wide-anchor.md).
const FORMATS = [
  { name: "640x360-ref", width: 1920, height: 1080, dpr: 1 },
  { name: "780x360@3", width: 780, height: 360, dpr: 3 },
  { name: "1280x720", width: 1280, height: 720, dpr: 1 },
  { name: "1920x1080", width: 1920, height: 1080, dpr: 1 },
];
const SAFE = { left: 5, right: 5, top: 1, bottom: 7 };

ensureBuild();
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];

// Bounding-Boxen benannter Objekte aus der laufenden UI-Szene sammeln.
// Container-Skalierung selbst aufloesen (Phaser Container.getBounds ignoriert sie).
async function measure(page) {
  return page.evaluate(() => {
    const sc = window.__game.scene.getScene("ui");
    const round = (v) => Math.round(v);
    function boundsOf(o, px, py, psx, psy) {
      if (o.list) {
        const cx = px + psx * o.x, cy = py + psy * o.y;
        const csx = psx * (o.scaleX ?? 1), csy = psy * (o.scaleY ?? 1);
        let b = null;
        for (const c of o.list) {
          if (c.visible === false) continue;
          const r = boundsOf(c, cx, cy, csx, csy);
          if (r) b = b ? {
            x: Math.min(b.x, r.x), y: Math.min(b.y, r.y),
            w: Math.max(b.x + b.w, r.x + r.w) - Math.min(b.x, r.x),
            h: Math.max(b.y + b.h, r.y + r.h) - Math.min(b.y, r.y),
          } : r;
        }
        return b;
      }
      const w = (o.displayWidth ?? o.width ?? 0) * psx;
      const h = (o.displayHeight ?? o.height ?? 0) * psy;
      if (w <= 0 || h <= 0) return null;
      const ox = o.originX ?? 0.5, oy = o.originY ?? 0.5;
      return { x: px + psx * o.x - ox * w, y: py + psy * o.y - oy * h, w, h };
    }
    const named = {};
    (function walk(objs, px, py, psx, psy, vis) {
      for (const o of objs) {
        const selfVisible = vis && o.visible !== false;
        if (o.name && selfVisible) {
          const b = boundsOf(o, px, py, psx, psy);
          if (b) named[o.name] = {
            x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h),
            xi: Number.isInteger(b.x) && Number.isInteger(b.y) &&
                Number.isInteger(b.w) && Number.isInteger(b.h),
          };
        }
        if (o.list) walk(o.list, px + psx * o.x, py + psy * o.y,
          psx * (o.scaleX ?? 1), psy * (o.scaleY ?? 1), selfVisible);
      }
    })(sc.children.list, 0, 0, 1, 1, true);
    return {
      named,
      view: { w: sc.scale.width, h: sc.scale.height, dpr: window.devicePixelRatio },
    };
  });
}

/** Bloecke gruppieren: Name-Praefix -> Blockname. */
function blockOf(name) {
  if (name === "hud-level") return "level";
  if (name === "hud-timer") return "timer";
  if (name === "hud-kills") return "kills";
  if (name.startsWith("hud-hp-") || name.startsWith("hud-xp-")) return "hp-xp";
  if (name === "hud-icons-bg") return "icons-bg";
  if (name.startsWith("hud-icon-")) return "weapon-icons";
  if (name.startsWith("hud-evo-hint-")) return "evo-hint";
  if (name.startsWith("hud-banner-")) return "banner";
  if (name.startsWith("levelup-card-") || name === "levelup-frame") return "levelup-cards";
  if (name === "levelup-title" || name === "levelup-sub" || name.startsWith("levelup-hint-")) return "levelup-text";
  if (name === "levelup-foot" || name === "chest-foot") return "foot";
  if (name === "chest-title") return "chest-title";
  if (name.startsWith("chest-hint-")) return "chest-hint";
  return null;
}

/** HUD-Topstreifen: diese Bloecke duerfen nie kollidieren. */
const STRIP = new Set(["level", "timer", "kills", "hp-xp", "weapon-icons", "evo-hint", "icons-bg"]);

/** Verschachtelungs-Gruppen: dieselbe Gruppe darf contained sein (Fuellung im
 * Balken, Icon im Icon-Hintergrund). Fremde Gruppen im Streifen nicht. */
function groupOf(blk) {
  if (blk === "icons-bg" || blk === "weapon-icons") return "iconrow";
  return blk;
}

function union(boxes) {
  return boxes.reduce((a, b) => {
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.max(a.x + a.w, b.x + b.w) - x;
    const h = Math.max(a.y + a.h, b.y + b.h) - y;
    return { x, y, w, h };
  });
}

function checkState(named, view) {
  const blocks = {};
  for (const [name, box] of Object.entries(named)) {
    const blk = blockOf(name);
    if (!blk) continue;
    blocks[blk] = blocks[blk] ?? [];
    blocks[blk].push(box);
  }
  const violations = [];
  const blockBoxes = {};
  for (const [blk, boxes] of Object.entries(blocks)) {
    const u = union(boxes);
    blockBoxes[blk] = u;
    // Safe-Area-Rand
    if (u.x < SAFE.left - 0.5
      || u.x + u.w > view.w - SAFE.right + 0.5
      || u.y < SAFE.top - 0.5
      || u.y + u.h > view.h - SAFE.bottom + 0.5) {
      violations.push({ type: "margin", block: blk, box: u });
    }
    // View-Grenzen (hart)
    if (u.x < -0.5 || u.y < -0.5 || u.x + u.w > view.w + 0.5 || u.y + u.h > view.h + 0.5) {
      violations.push({ type: "view", block: blk, box: u });
    }
  }
  // Kollisionen auf Named-Box-Ebene: Verschachtelung (Fuellung im Balken,
  // Caption auf Panel, Titel im Rahmen) ist beabsichtigt und wird via
  // Containment ignoriert. Geprueft werden Paare, bei denen mindestens ein
  // Block zum HUD-Topstreifen gehoert (Overlay-ueber-Overlay = Design).
  const collides = (a, b) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const contained = (s, big) =>
    s.x >= big.x - 0.5 && s.y >= big.y - 0.5 &&
    s.x + s.w <= big.x + big.w + 0.5 && s.y + s.h <= big.y + big.h + 0.5;
  const namedBoxes = Object.entries(named).map(([name, box]) => ({ name, blk: blockOf(name), box }));
  for (let i = 0; i < namedBoxes.length; i++) {
    for (let j = i + 1; j < namedBoxes.length; j++) {
      const A = namedBoxes[i], B = namedBoxes[j];
      if (!A.blk || !B.blk) continue;
      const stripInvolved = STRIP.has(A.blk) || STRIP.has(B.blk);
      if (!stripInvolved) continue;
      if (!collides(A.box, B.box)) continue;
      // Verschachtelung: gleiche Gruppe (Fuellung im Balken, Icon im
      // Icon-Hintergrund) ist beabsichtigt. Fremde Gruppen im Streifen
      // werden nicht geschluckt (z. B. icons-bg ueber der HP-Zeile) -> Meldung.
      const sameGroup = groupOf(A.blk) === groupOf(B.blk);
      const stripPair = STRIP.has(A.blk) && STRIP.has(B.blk);
      if (contained(A.box, B.box) || contained(B.box, A.box)) {
        if (!(stripPair && !sameGroup)) continue;
      }
      violations.push({ type: "collision", a: `${A.blk}(${A.name})`, b: `${B.blk}(${B.name})` });
    }
  }
  // Pixelgenauigkeit: ganzzahlige Spielpixel. Balken-Fuellungen (skalierende
  // Rects mit XP/HP-Ratio) sind kontinuierlich und ausgenommen.
  const nonInteger = Object.entries(named)
    .filter(([n, b]) => !b.xi && !n.endsWith("-fill")).map(([n]) => n);
  if (nonInteger.length > 0) violations.push({ type: "subpixel", blocks: nonInteger });
  return { blockBoxes, violations };
}

const results = [];
try {
  for (const f of FORMATS) {
    const context = await browser.newContext({
      viewport: { width: f.width, height: f.height },
      deviceScaleFactor: f.dpr,
    });
    const page = await context.newPage();
    const label = f.name;
    page.on("pageerror", (e) => errors.push(`${label}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${label}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
    await startRun(page);
    await page.evaluate(() => {
      const lf = window.__lf;
      lf.god(true);
      // Vollbuild: 6 Waffen + 6 Powerups; ember@8 + tome -> Evolution bereit.
      lf.addWeapon("ember", 8);
      lf.addWeapon("flail", 5);
      lf.addWeapon("frost", 5);
      lf.addWeapon("thorn", 5);
      lf.addWeapon("storm", 5);
      lf.addWeapon("lantern", 5);
      lf.addPassive("tome", 5);
      lf.addPassive("heart", 5);
      lf.addPassive("boots", 5);
      lf.addPassive("charm", 5);
      lf.addPassive("whetstone", 5);
      lf.addPassive("hourglass", 5);
    });
    await page.waitForTimeout(400);

    // --- Zustand: HUD ---
    let m = await measure(page);
    let c = checkState(m.named, m.view);
    const shotHud = `shots/m10-hud-anchor-${TAG}-${label}-hud.png`;
    await page.screenshot({ path: shotHud });

    // --- Zustand: Banner (Evolution) ---
    await page.evaluate(() => {
      const sc = window.__game.scene.getScene("ui");
      sc.showBanner("EVOLUTION", "PHÖNIXSCHWARM", 6);
    });
    await page.waitForTimeout(400);
    m = await measure(page);
    const cBanner = checkState(m.named, m.view);
    const shotBanner = `shots/m10-hud-anchor-${TAG}-${label}-banner.png`;
    await page.screenshot({ path: shotBanner });
    // Banner ist temporal: fuer die Folg states ausblenden, damit es nicht
    // faelschlich mit dem Level-Up-Dialog kollidiert.
    await page.evaluate(() => {
      const sc = window.__game.scene.getScene("ui");
      sc.bannerTimer?.remove(false);
      sc.bannerGroup.setVisible(false);
    });

    // --- Zustand: Level-Up-Dialog (echter Pfad: XP -> levelup-Event) ---
    await page.evaluate(() => window.__lf.giveXp(9999));
    await page.waitForTimeout(500);
    m = await measure(page);
    const cLevel = checkState(m.named, m.view);
    const shotLevel = `shots/m10-hud-anchor-${TAG}-${label}-levelup.png`;
    await page.screenshot({ path: shotLevel });
    // Level-up-Kette schliessen (giveXp kann viele Levels hintereinander
    // ausloesen), bevor die Truhe geoeffnet wird, damit sich die Fusszeilen
    // nicht ueberlagern.
    for (let k = 0; k < 40; k++) {
      const open = await page.evaluate(() => {
        const sc = window.__game.scene.getScene("ui");
        if (!sc.levelGroup.visible) return false;
        try { window.__lf.pickLevelUp(0); } catch { /* bereits zu */ }
        return true;
      });
      if (!open) break;
      await page.waitForTimeout(120);
    }
    await page.evaluate(() => {
      const sc = window.__game.scene.getScene("ui");
      sc.onChestOpen({
        count: 5,
        rewards: [
          { kind: "evolution", id: "phoenix", name: "Phönixschwarm", description: "Feuervögel", level: 8, isNew: true, iconColor: 18,
            evolution: { id: "phoenix", name: "Phönixschwarm", description: "Glutfunke + Arkanes Buch", effect: "Feuervögel", baseWeapon: "ember", passive: "tome", implemented: true, iconColor: 18 } },
          { kind: "weapon", id: "flail", name: "Kettenflegel", description: "", level: 3, isNew: false, iconColor: 24 },
          { kind: "weapon", id: "frost", name: "Frostnova", description: "", level: 3, isNew: false, iconColor: 25 },
          { kind: "passive", id: "tome", name: "Arkanes Buch", description: "", level: 2, isNew: false, iconColor: 20 },
          { kind: "passive", id: "heart", name: "Eisenherz", description: "", level: 2, isNew: false, iconColor: 21 },
        ],
      });
    });
    await page.waitForTimeout(2400);
    m = await measure(page);
    const cChest = checkState(m.named, m.view);
    const shotChest = `shots/m10-hud-anchor-${TAG}-${label}-chest.png`;
    await page.screenshot({ path: shotChest });

    results.push({
      format: label,
      device: { width: f.width, height: f.height, dpr: f.dpr },
      view: m.view,
      shotHud, shotBanner, shotLevel, shotChest,
      hud: { blocks: c.blockBoxes, violations: c.violations },
      banner: { blocks: cBanner.blockBoxes, violations: cBanner.violations },
      levelup: { blocks: cLevel.blockBoxes, violations: cLevel.violations },
      chest: { blocks: cChest.blockBoxes, violations: cChest.violations },
      violationCount: c.violations.length + cBanner.violations.length
        + cLevel.violations.length + cChest.violations.length,
    });
    await context.close();
  }
} finally {
  await browser.close();
  server.stop();
}

// AE gegen 640x360-Referenz: alle 640er-Formate muessen identische HUD-Boxen haben.
const ref = results.find((r) => r.format === "640x360-ref");
let ae = 0;
const aeDetails = [];
for (const r of results) {
  if (r.view.w !== ref.view.w || r.view.h !== ref.view.h) continue;
  for (const state of ["hud", "levelup", "chest"]) {
    const A = r[state].blocks, B = ref[state].blocks;
    const keys = new Set([...Object.keys(A ?? {}), ...Object.keys(B ?? {})]);
    for (const k of keys) {
      const a = JSON.stringify(A?.[k]), b = JSON.stringify(B?.[k]);
      if (a !== b) { ae++; aeDetails.push(`${r.format}/${state}/${k}: ${a} vs ${b}`); }
    }
  }
}

const totalViolations = results.reduce((s, r) => s + r.violationCount, 0);
const out = {
  tag: TAG, generated: new Date().toISOString(), safeArea: SAFE, formats: FORMATS,
  results, aeVs640Ref: { count: ae, details: aeDetails }, totalViolations, errors,
};
writeFileSync(`shots/m10-hud-anchor-${TAG}.json`, JSON.stringify(out, null, 2));
for (const r of results) {
  console.log(`${r.format}: violations=${r.violationCount}`);
  for (const v of [...r.hud.violations, ...r.banner.violations, ...r.levelup.violations, ...r.chest.violations]) {
    console.log(`  ${JSON.stringify(v)}`);
  }
}
console.log(`AE-vs-640ref: ${ae} Abweichungen${aeDetails.length ? " (" + aeDetails.join("; ") + ")" : ""}`);
console.log(`RESULT ${totalViolations === 0 && ae === 0 && errors.length === 0 ? "PASS" : "FAIL"} violations=${totalViolations} ae=${ae} errors=${errors.length}`);
process.exit(totalViolations === 0 && ae === 0 && errors.length === 0 ? 0 : 1);
