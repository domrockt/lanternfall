#!/usr/bin/env node
// m10-chest-closed-crisp-ui (K1/K3): UI-Anzeige-Seite des Truhen-Panels messen
// (letzter offener UI-Teil des menu-art-crisp-Befunds F2; Textur-Ebene siehe
// m10-chest-closed-crisp). Misst in beiden Abnahme-Formaten (640x360@2,
// 780x360@3) alle STATISCHEN Texturen des offenen Truhen-Panels:
//   - chestSprite (chest_closed): Draw-Scale ganzzahlig, scaleX==scaleY,
//     Anker ganzzahlig, Geraetepixel je Texel ganzzahlig.
//   - 5 Reward-Slot-Icons: ganzzahlige Skala, passend im 44-px-Slot,
//     zentriert, Geraetepixel je Texel ganzzahlig.
//   - fx_coin / chestBeam (light_radius): nur informativ (animierte FX bzw.
//     additives Licht — laut GAME.md nicht Teil der statischen Crisp-Semantik).
//   - Overlaps: Icon-Box gegen Untertitel-/Hint-Text-Bounds und Panel-Rahmen
//     (0 Ueberlappung gefordert, Beruehrung erlaubt).
//   - Screenshots: Panel + 4x-nearest-Crop von Truhen-Icon und Slot-Icon,
//     Run-Length-Analyse (jede Run-Laenge Vielfaches der Texeleinheit).
// Belege nach ~/games/.evidence/m10-chest-closed-crisp-ui/ (nicht ins Repo).
// Start: node scripts/m10-chest-closed-ui.mjs before   (bzw. after)
// Kein flock: Screenshot-/JSON-Messung, keine FPS-/Echtzeitmessung.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const TAG = String(process.argv[2] ?? "before");
const EVID = join(homedir(), "games", ".evidence", "m10-chest-closed-crisp-ui");

const PROFILES = [
  { name: "640x360@2", viewport: { width: 640, height: 360 }, dpr: 2 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
];

ensureBuild();
mkdirSync(EVID, { recursive: true });
const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"],
});

// Run-Length-Analyse eines PNG-Crops: 0 Run-Laengen, die keine Vielfachen der
// Texeleinheit sind (= 0 fraktionale Skalierungsschritte / Mixel).
function cropRunLengths(png, unit) {
  const txt = execFileSync("convert", [png, "txt:-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const rows = new Map();
  for (const line of txt.split("\n")) {
    const m = line.match(/^(\d+),(\d+):\s*\(([^)]*)\)\s*#([0-9A-Fa-f]{6,8})/);
    if (!m) continue;
    const y = Number(m[2]);
    const hex = m[4].slice(0, 6).toUpperCase();
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x: Number(m[1]), hex });
  }
  let runs = 0;
  let nonMultiple = 0;
  for (const px of rows.values()) {
    px.sort((a, b) => a.x - b.x);
    let start = 0;
    for (let i = 1; i <= px.length; i++) {
      if (i === px.length || px[i].hex !== px[start].hex) {
        runs++;
        if ((i - start) % unit !== 0) nonMultiple++;
        start = i;
      }
    }
  }
  return { runs, nonMultipleRuns: nonMultiple };
}

let report;
try {
  const errors = [];
  const formats = [];
  for (const fmt of PROFILES) {
    const context = await browser.newContext({ viewport: fmt.viewport, deviceScaleFactor: fmt.dpr });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${fmt.name}: ${String(e)}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${fmt.name}: ${m.text()}`); });
    await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=101`);
    await startRun(page);

    // Truhen-Panel oeffnen (wie m10-chest-closed.mjs).
    await page.evaluate(() => {
      const run = window.__game.scene.getScene("run");
      window.__lf.god(true);
      run.teleport(1000, 1000);
      run.chests.clear();
      run.debugTriggerEvent("chest");
      // Mess-Freeze: Panel soll waehrend der Messung offen +gesetzt bleiben
      // (Settle ca. 1890 ms, Hide-Timer bei ~2570 ms wuerde sonst schliessen).
      run.finishChest = () => {};
    });
    // Auf Settle warten: Slot-Icons Alpha 1 (Settle-Phase), dann kurz ruhig stellen.
    await page
      .waitForFunction(() => {
        const ui = window.__game.scene.getScene("ui");
        return ui.chestSlots?.some((s) => s.icon.visible && s.icon.alpha === 1);
      }, { timeout: 8000 })
      .catch(() => errors.push(`${fmt.name}: settle-timeout`));
    await page.waitForTimeout(150);

    const info = await page.evaluate(() => {
      const game = window.__game;
      const ui = game.scene.getScene("ui");
      const gl = game.renderer?.gl ?? null;
      const dbg = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
      const grp = ui.chestGroup;

      const obj = (o) => ({
        name: String(o.name ?? ""),
        type: o.type,
        texKey: o.texture ? String(o.texture.key) : null,
        frameW: o.frame ? o.frame.width : null,
        frameH: o.frame ? o.frame.height : null,
        scaleX: o.scaleX, scaleY: o.scaleY,
        x: o.x, y: o.y,
        displayW: o.displayWidth, displayH: o.displayHeight,
        visible: Boolean(o.visible),
        alpha: o.alpha,
        blend: o.blendMode,
      });
      // Text-Bounds eines PixelText-Containers (Glyph-Kinder, Origin 0/0,
      // Container-Skala beruecksichtigt — Glyph-Frames sind 5x7, Tinte = Frame).
      const textBox = (c) => {
        if (!c) return null;
        const sx = c.scaleX ?? 1;
        const sy = c.scaleY ?? 1;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, n = 0;
        for (const g of c.list ?? []) {
          if (!g.visible || !g.displayWidth) continue;
          n++;
          minX = Math.min(minX, c.x + g.x * sx);
          maxX = Math.max(maxX, c.x + (g.x + g.displayWidth) * sx);
          minY = Math.min(minY, c.y + g.y * sy);
          maxY = Math.max(maxY, c.y + (g.y + g.displayHeight) * sy);
        }
        return n ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
      };

      const children = (grp?.list ?? []).map(obj);
      const chestSprite = ui.chestSprite ? obj(ui.chestSprite) : null;
      const slots = (ui.chestSlots ?? []).map((s) => ({
        bg: obj(s.bg), slotBg: obj(s.slotBg), icon: obj(s.icon),
        text: textBox(s.text), text2: textBox(s.text2), level: textBox(s.level),
      }));
      const title = ui.chestTitle ? textBox(ui.chestTitle) : null;
      const subtitle = textBox((grp?.list ?? []).find((o) => o.name === "chest-subtitle"));
      const hints = [0, 1].map((i) => textBox((grp?.list ?? []).find((o) => o.name === `chest-hint-${i}`)));
      const frame = children.find((o) => o.type === "NineSlice") ?? null;
      const coins = children.filter((o) => o.texKey === "fx_coin").map(obj);
      const beam = children.find((o) => o.texKey === "light_radius") ?? null;

      return {
        renderer: dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? null) : null,
        view: {
          internalWidth: game.scale.width,
          internalHeight: game.scale.height,
          canvasCssWidth: game.canvas.getBoundingClientRect().width,
          dpr: window.devicePixelRatio || 1,
          roundPixels: Boolean(game.config.roundPixels),
        },
        chestSprite, slots, title, subtitle, hints, frame, coins, beam,
      };
    });

    const panelOpen = Boolean(info.chestSprite?.visible);
    const pxPerGame = (info.view.canvasCssWidth / info.view.internalWidth) * info.view.dpr;
    const nearInt = (v) => Math.abs(v - Math.round(v)) < 1e-6;
    const overlap = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

    // Icon-Boxen aus den echten Laufzeit-Transforms.
    const iconBox = (o) => ({ x: o.x - o.displayW / 2, y: o.y - o.displayH / 2, w: o.displayW, h: o.displayH });

    const cs = info.chestSprite ?? {};
    const csBox = iconBox(cs);
    const csChecks = {
      visible: cs.visible === true,
      scaleIsInteger: Number.isInteger(cs.scaleX) && cs.scaleX >= 1,
      scaleXEqualsScaleY: cs.scaleX === cs.scaleY,
      anchorInteger: nearInt(cs.x) && nearInt(cs.y),
      devicePxPerTexel: cs.scaleX * pxPerGame,
      devicePxPerTexelIsInteger: nearInt(cs.scaleX * pxPerGame),
      // 0 Ueberlappung des Icons mit Untertitel/Panel (Beruehrung erlaubt):
      overlapSubtitle: overlap(csBox, info.subtitle),
      overlapTitle: overlap(csBox, info.title),
      overlapHints: info.hints.some((h) => overlap(csBox, h)),
      gapSubtitleTop: info.subtitle ? +(csBox.y - (info.subtitle.y + info.subtitle.h)).toFixed(3) : null,
      gapHintTop: info.hints?.[0] ? +((info.hints[0].y) - (csBox.y + csBox.h)).toFixed(3) : null,
      insideFrame: info.frame
        ? csBox.x >= info.frame.x - info.frame.displayW / 2 && csBox.y >= info.frame.y - info.frame.displayH / 2
          && csBox.x + csBox.w <= info.frame.x + info.frame.displayW / 2
          && csBox.y + csBox.h <= info.frame.y + info.frame.displayH / 2
        : false,
    };
    csChecks.pass = csChecks.visible && csChecks.scaleIsInteger && csChecks.scaleXEqualsScaleY
      && csChecks.anchorInteger && csChecks.devicePxPerTexelIsInteger
      && !csChecks.overlapSubtitle && !csChecks.overlapTitle && !csChecks.overlapHints
      && csChecks.insideFrame;

    const slotChecks = (info.slots ?? []).filter((s) => s.icon.visible).map((s, i) => {
      const ib = iconBox(s.icon);
      return {
        slot: i,
        scale: s.icon.scaleX,
        scaleIsInteger: Number.isInteger(s.icon.scaleX) && s.icon.scaleX >= 1,
        scaleXEqualsScaleY: s.icon.scaleX === s.icon.scaleY,
        devicePxPerTexel: s.icon.scaleX * pxPerGame,
        devicePxPerTexelIsInteger: nearInt(s.icon.scaleX * pxPerGame),
        displayW: s.icon.displayW,
        fitsSlotBg: s.icon.displayW <= s.slotBg.displayW - 4 && s.icon.displayH <= s.slotBg.displayH - 4,
        centeredInSlot: nearInt(s.icon.x - s.slotBg.x) && nearInt(s.icon.y - s.slotBg.y),
        overlapText: overlap(ib, s.text) || overlap(ib, s.text2) || overlap(ib, s.level),
        anchorInteger: nearInt(s.icon.x) && nearInt(s.icon.y),
      };
    });
    const slotsPass = slotChecks.every((s) => s.scaleIsInteger && s.scaleXEqualsScaleY
      && s.devicePxPerTexelIsInteger && s.fitsSlotBg && s.centeredInSlot && !s.overlapText && s.anchorInteger);

    // ── Screenshots + 4x-nearest-Crops ─────────────────────────────────────
    const prof = fmt.name.replace(/[^0-9a-z]/gi, "");
    const panelPng = join(EVID, `m10-chest-closed-ui-${TAG}-${prof}-panel.png`);
    await page.screenshot({ path: panelPng });

    let crops = null;
    if (panelOpen) {
      const shot = (o, texel) => {
        const b = iconBox(o);
        const left = Math.round((b.x) * pxPerGame) + texel;
        const top = Math.round((b.y) * pxPerGame) + texel;
        const w = Math.round(b.w * pxPerGame) - 2 * texel;
        const h = Math.round(b.h * pxPerGame) - 2 * texel;
        const out = join(EVID, `m10-chest-closed-ui-${TAG}-${prof}-${o.texKey.replace(/[^a-z0-9]/gi, "")}4x.png`);
        execFileSync("convert", [panelPng, "-crop", `${w}x${h}+${left}+${top}`, "+repage",
          "-filter", "point", "-resize", "400%", out], { stdio: "pipe" });
        return { png: out, w, h };
      };
      const texelChest = Math.round(cs.scaleX * pxPerGame);
      const cChest = shot(cs, texelChest);
      const firstSlot = (info.slots ?? []).find((s) => s.icon.visible);
      const cSlot = firstSlot ? shot(firstSlot.icon, Math.round(firstSlot.icon.scaleX * pxPerGame)) : null;
      crops = {
        chest: { ...cChest, ...cropRunLengths(cChest.png, texelChest * 4), unit: texelChest * 4 },
        slot: cSlot
          ? { ...cSlot, ...cropRunLengths(cSlot.png, Math.round(firstSlot.icon.scaleX * pxPerGame) * 4),
              unit: Math.round(firstSlot.icon.scaleX * pxPerGame) * 4 }
          : null,
      };
    }

    const checks = {
      rendererPresent: info.renderer != null,
      panelOpen,
      chestIcon: csChecks,
      slots: slotChecks,
      slotsPass,
      debug: {
        chestSprite: cs,
        chestIconBox: csBox,
        subtitleBox: info.subtitle,
        titleBox: info.title,
        hintBoxes: info.hints,
        frameBox: info.frame ? { x: info.frame.x, y: info.frame.y, w: info.frame.displayW, h: info.frame.displayH } : null,
        slotBoxes: (info.slots ?? []).filter((s) => s.icon.visible).map((s) => ({
          icon: iconBox(s.icon), slotBg: { x: s.slotBg.x, y: s.slotBg.y, w: s.slotBg.displayW, h: s.slotBg.displayH },
        })),
      },
      // Informativ, nicht Teil der statischen Crisp-Semantik:
      fxNote: {
        chestBeam: info.beam ? { texKey: info.beam.texKey, blend: info.beam.blend, scale: info.beam.scaleX } : null,
        fxCoins: info.coins.map((c) => ({ scale: c.scaleX, alpha: c.alpha })),
      },
      crops,
    };
    checks.pass = checks.rendererPresent && checks.panelOpen && checks.chestIcon.pass && checks.slotsPass
      && (!crops || (crops.chest.nonMultipleRuns === 0 && (!crops.slot || crops.slot.nonMultipleRuns === 0)));
    formats.push({ profile: fmt.name, pxPerGame, view: info.view, checks });
    await context.close();
  }

  const passed = formats.every((f) => f.checks.pass) && errors.length === 0;
  report = {
    schema: "m10-chest-closed-crisp-ui/v1",
    tag: TAG,
    generatedAt: new Date().toISOString(),
    scope: "UI-Anzeige-Seite des Truhen-Panels (menu-art-crisp F2, UI-Teil); keine Inszenierung",
    formats,
    verdict: {
      rendererStringPresent: formats.every((f) => f.checks.rendererPresent),
      integerChestIconScale: formats.every((f) => f.checks.chestIcon.scaleIsInteger),
      integerDevicePxPerTexel: formats.every((f) => f.checks.chestIcon.devicePxPerTexelIsInteger
        && f.checks.slots.every((s) => s.devicePxPerTexelIsInteger)),
      zeroIconOverlaps: formats.every((f) => !f.checks.chestIcon.overlapSubtitle && !f.checks.chestIcon.overlapTitle
        && !f.checks.chestIcon.overlapHints && f.checks.chestIcon.insideFrame
        && f.checks.slots.every((s) => !s.overlapText)),
      zeroFractionalCropRuns: formats.every((f) => f.checks.crops
        && f.checks.crops.chest.nonMultipleRuns === 0
        && (!f.checks.crops.slot || f.checks.crops.slot.nonMultipleRuns === 0)),
      jsErrors: errors.length,
      passed,
    },
    errors,
  };
  writeFileSync(join(EVID, `m10-chest-closed-ui-${TAG}.json`), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ tag: TAG, verdict: report.verdict, formats: formats.map((f) => ({
    profile: f.profile,
    renderer: f.checks.rendererPresent,
    chestIcon: {
      scale: f.checks.chestIcon.scaleIsInteger ? f.checks.slots.length >= 0 : null,
      devicePxPerTexel: f.checks.chestIcon.devicePxPerTexel,
      gapSubtitleTop: f.checks.chestIcon.gapSubtitleTop,
      gapHintTop: f.checks.chestIcon.gapHintTop,
      insideFrame: f.checks.chestIcon.insideFrame,
      pass: f.checks.chestIcon.pass,
    },
    slots: f.checks.slots.map((s) => ({ scale: s.scale, devicePxPerTexel: s.devicePxPerTexel, pass:
      s.scaleIsInteger && s.devicePxPerTexelIsInteger && s.fitsSlotBg && !s.overlapText })),
    cropNonMultipleRuns: f.checks.crops
      ? { chest: f.checks.crops.chest.nonMultipleRuns, slot: f.checks.crops.slot?.nonMultipleRuns ?? null }
      : null,
  })) }, null, 2));
} finally {
  await browser.close();
  server.stop();
}
if (!report || !report.verdict.passed) process.exit(1);
