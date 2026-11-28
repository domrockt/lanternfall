#!/usr/bin/env node
// Lane m10-menubg-crisp-rest: Ist-/After-Messung der Menue-Hintergrund-Skalierung
// in CharSelect, Results und Credits (F1-Befundklasse aus m10-menu-art-crisp:
// Texturen werden per setDisplaySize fraktional hochskaliert).
//
//   node scripts/m10-menubg-crisp.mjs before   -> shots/m10-menubg-before.json + PNGs
//   node scripts/m10-menubg-crisp.mjs after    -> shots/m10-menubg-after.json  + PNGs
//
// Formate: 640x360@1, 780x360@3 (dpr 3), 960x540 (Fill-View 640x360@1.5 intern).
// Klassifikation: Hintergrund/Panel = Bild mit depth <= 0 ohne ADD-Blend
// (Licht-Glows sind kein Hintergrund und out of scope, wie in m10-menu-art-crisp).
// Ohne flock (keine FPS-Messung).
import { mkdirSync, writeFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, waitForScene } from "./harness.mjs";

const mode = process.argv[2] ?? "before"; // before | after
const outJson = `shots/m10-menubg-${mode}.json`;

const VIEWS = [
  { name: "640x360", viewport: { width: 640, height: 360 }, dpr: 1 },
  { name: "780x360@3", viewport: { width: 780, height: 360 }, dpr: 3 },
  { name: "960x540", viewport: { width: 960, height: 540 }, dpr: 1 },
];

ensureBuild();
mkdirSync("shots", { recursive: true });
const pw = await loadPlaywright();
const server = await startServer();
const browser = await pw.chromium.launch();

const result = {
  name: `m10-menubg-${mode}`,
  generatedAt: new Date().toISOString(),
  views: [],
};

// Alle Bilder der Szene mit Textur, Scale, Blend, Depth (rekursiv, inkl. Container).
const measureScene = (sceneKey) => {
  const scene = window.__game.scene.getScene(sceneKey);
  if (!scene) return null;
  const images = [];
  const walk = (obj) => {
    if (obj == null) return;
    if (Array.isArray(obj.list)) for (const c of obj.list) walk(c);
    if (obj.texture && obj.texture.key) {
      images.push({
        key: obj.texture.key,
        depth: obj.depth,
        blend: obj.blendMode,
        texW: obj.width,
        texH: obj.height,
        scaleX: obj.scaleX,
        scaleY: obj.scaleY,
        displayW: obj.displayWidth,
        displayH: obj.displayHeight,
      });
    }
  };
  walk(scene.children);
  return {
    scene: sceneKey,
    view: { w: window.__game.scale.width, h: window.__game.scale.height },
    images,
  };
};

// Klick-Ziele aus sichtbaren PixelText-Objekten (wie scripts/verify-menus.mjs).
const readTargets = (page) => page.evaluate(() => {
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
      } catch { /* Transformation nicht verfuegbar */ }
    }
  };
  for (const s of window.__game.scene.scenes) {
    if (!s.scene.isActive()) continue;
    walk(s.children, true);
  }
  return out;
});

const clickLabel = async (page, needle) => {
  const norm = (s) => s.toLowerCase();
  const n = norm(needle);
  const targets = await readTargets(page);
  const hits = targets.filter((t) => norm(t.text).includes(n));
  if (hits.length === 0) throw new Error(`Klick-Ziel "${needle}" nicht gefunden`);
  const target = hits.reduce((a, b) => (b.text.length < a.text.length ? b : a));
  const box = await page.locator("canvas").boundingBox();
  const v = await page.evaluate(() => ({ w: window.__game.scale.width, h: window.__game.scale.height }));
  await page.mouse.click(box.x + (target.cx / v.w) * box.width, box.y + (target.cy / v.h) * box.height);
  await page.waitForTimeout(250);
};

for (const spec of VIEWS) {
  const context = await browser.newContext({
    viewport: spec.viewport,
    deviceScaleFactor: spec.dpr,
  });
  const page = await context.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") jsErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__lf), undefined, { timeout: 45000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(300);

  const scenes = [];

  // Credits (vom Titel per Maus, wie verify-menus).
  await clickLabel(page, "CREDITS");
  await waitForScene(page, "credits");
  await page.waitForTimeout(250);
  scenes.push(await page.evaluate(measureScene, "credits"));
  await page.screenshot({ path: `shots/m10-menubg-${mode}-credits-${spec.name.replace(/[@]/g, "_")}.png` });
  await clickLabel(page, "ZURÜCK");
  await waitForScene(page, "title");

  // CharSelect (ENTER vom Titel).
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.waitForTimeout(250);
  scenes.push(await page.evaluate(measureScene, "charselect"));
  await page.screenshot({ path: `shots/m10-menubg-${mode}-charselect-${spec.name.replace(/[@]/g, "_")}.png` });

  // Results (Run starten, Debug-Sieg).
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__lf.setSuppressLevelUps(true);
    window.__lf.skipTo(1700);
    window.__lf.finishRun("dawn");
  });
  await waitForScene(page, "results");
  await page.waitForTimeout(300);
  scenes.push(await page.evaluate(measureScene, "results"));
  await page.screenshot({ path: `shots/m10-menubg-${mode}-results-${spec.name.replace(/[@]/g, "_")}.png` });

  // Klassifikation: Hintergrund/Panel = depth <= 0, kein ADD-Blend (1).
  // Kanten-Fuell-Texturen (vignette_col_*/row_*/px_*) sind die dokumentierte
  // Fuellung: ganzzahlige Texel-Streckung pro Achse ungleich ist dort Design.
  const isLight = (img) => img.blend === 1;
  const isBg = (img) => img.depth <= 0 && !isLight(img);
  const FILL_RE = /^[a-z_]+_(col_l|col_r|row_t|row_b|px_tl|px_tr|px_bl|px_br)$/;
  const frac = (v) => !Number.isInteger(v);
  const findings = [];
  for (const s of scenes) {
    if (!s) continue;
    for (const img of s.images) {
      if (!isBg(img)) continue;
      if (FILL_RE.test(img.key)) {
        if (frac(img.scaleX) || frac(img.scaleY)) findings.push({ scene: s.scene, ...img });
      } else if (frac(img.scaleX) || frac(img.scaleY) || img.scaleX !== img.scaleY) {
        findings.push({ scene: s.scene, ...img });
      }
    }
  }

  result.views.push({
    view: spec.name,
    internal: scenes[0]?.view ?? null,
    jsErrors,
    scenes,
    backgroundFindings: findings,
  });
  console.log(
    `${spec.name}: ${scenes.filter(Boolean).length} Szenen,`
    + ` fraktionale BG-Faelle: ${findings.length}`
    + (findings.length
      ? ` -> ${findings.map((f) => `${f.scene}/${f.key} ${f.scaleX}x${f.scaleY}`).join(", ")}`
      : ""),
  );
  await context.close();
}

// --- Live-Resize-Probe: 640x360 laden, Viewport auf 780x360 aendern. ---
// Die Vignette-Textur bleibt auf der Boot-Groesse (Texture-Manager global,
// createVignetteTexture bricht bei exists ab), die Szene restartet und
// streckt dann per setDisplaySize fraktional (F1-Klasse). Jede Szene einmal.
{
  const context = await browser.newContext({
    viewport: { width: 640, height: 360 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const jsErrors = [];
  page.on("pageerror", (e) => jsErrors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") jsErrors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=7`);
  await page.waitForFunction(() => Boolean(window.__lf), undefined, { timeout: 45000 });
  await waitForScene(page, "title");
  await page.waitForTimeout(300);

  const resizeScenes = [];
  const findings = [];
  const FILL_RE = /^[a-z_]+_(col_l|col_r|row_t|row_b|px_tl|px_tr|px_bl|px_br)$/;
  const classify = (entries) => {
    for (const s of entries) {
      if (!s) continue;
      for (const img of s.images) {
        if (img.depth > 0 || img.blend === 1) continue; // Licht-Glows out of scope
        if (FILL_RE.test(img.key)) {
          // dokumentierte Kanten-Fuellung: pro Achse ganzzahlig
          if (!Number.isInteger(img.scaleX) || !Number.isInteger(img.scaleY)) {
            findings.push({ scene: s.scene, ...img });
          }
        } else if (!Number.isInteger(img.scaleX) || !Number.isInteger(img.scaleY)
          || img.scaleX !== img.scaleY) findings.push({ scene: s.scene, ...img });
      }
    }
  };

  // CharSelect: frisch messen, dann Viewport aendern und erneut messen.
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.waitForTimeout(250);
  resizeScenes.push(await page.evaluate(measureScene, "charselect"));
  await page.setViewportSize({ width: 780, height: 360 });
  await page.waitForTimeout(600); // RESIZE -> scene.restart()
  resizeScenes.push(await page.evaluate(measureScene, "charselect"));
  await page.screenshot({ path: `shots/m10-menubg-${mode}-resize-charselect-780.png` });

  // Credits.
  await page.keyboard.press("Escape");
  await waitForScene(page, "title");
  await clickLabel(page, "CREDITS");
  await waitForScene(page, "credits");
  await page.waitForTimeout(250);
  resizeScenes.push(await page.evaluate(measureScene, "credits"));
  await page.setViewportSize({ width: 960, height: 540 });
  await page.waitForTimeout(600);
  resizeScenes.push(await page.evaluate(measureScene, "credits"));
  await page.screenshot({ path: `shots/m10-menubg-${mode}-resize-credits-960.png` });
  await clickLabel(page, "ZURÜCK");
  await waitForScene(page, "title");

  // Results.
  await page.keyboard.press("Enter");
  await waitForScene(page, "charselect");
  await page.keyboard.press("Enter");
  await waitForScene(page, "run");
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.__lf.setSuppressLevelUps(true);
    window.__lf.skipTo(1700);
    window.__lf.finishRun("dawn");
  });
  await waitForScene(page, "results");
  await page.waitForTimeout(300);
  resizeScenes.push(await page.evaluate(measureScene, "results"));
  await page.setViewportSize({ width: 780, height: 360 });
  await page.waitForTimeout(600);
  resizeScenes.push(await page.evaluate(measureScene, "results"));
  await page.screenshot({ path: `shots/m10-menubg-${mode}-resize-results-780.png` });

  classify(resizeScenes);
  result.views.push({
    view: "resize-probe (640->780, 640->960x540)",
    internal: resizeScenes[0]?.view ?? null,
    jsErrors,
    scenes: resizeScenes,
    backgroundFindings: findings,
  });
  console.log(
    `resize-probe: fraktionale BG-Faelle: ${findings.length}`
    + (findings.length
      ? ` -> ${findings.map((f) => `${f.scene}/${f.key} ${f.scaleX}x${f.scaleY} tex ${f.texW}x${f.texH}`).join(", ")}`
      : ""),
  );
  await context.close();
}

await browser.close();
writeFileSync(outJson, `${JSON.stringify(result, null, 2)}\n`);
console.log(`[m10-menubg-crisp] geschrieben: ${outJson}`);
