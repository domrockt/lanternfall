#!/usr/bin/env node
// M10-touch-latency: scripted Touch-Sweep in iPhone-14-quer und Pixel-7-quer.
// Misst Geste (DOM touchmove/touchend) -> Spielerbewegung/-stopp (poststep-Frames).
// Schreibt shots/m10-touch-latency.json + Beleg-Screenshots. Temp-Skript, nicht im Repo.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let pw;
try { pw = require("playwright"); } catch { pw = require("/usr/lib/node_modules/playwright"); }
const { chromium, devices } = pw;

const WORKTREE = "/home/ai/games/lf-lanes/m10-touch-latency";
const OUT_JSON = `${WORKTREE}/shots/m10-touch-latency.json`;
mkdirSync(`${WORKTREE}/shots`, { recursive: true });

const port = 5900 + Math.floor(Math.random() * 300);
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "-d", `${WORKTREE}/dist`], { stdio: "ignore" });
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(`http://127.0.0.1:${port}/`); if (r.ok) break; } catch {}
  await new Promise((r) => setTimeout(r, 100));
}

const browser = await chromium.launch();
const errors = [];

function median(a) { const s = [...a].sort((x, y) => x - y); if (!s.length) return 0; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function p95(a) { const s = [...a].sort((x, y) => x - y); if (!s.length) return 0; return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)]; }
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
function fsClean(dir) { for (const f of readdirSync(dir)) rmSync(`${dir}/${f}`, { force: true }); }

const profiles = [
  { name: "iphone14-landscape", base: devices["iPhone 14"] },
  { name: "pixel7-landscape", base: devices["Pixel 7"] },
];

const DIRS = [
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
  { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 0, dy: -1 },
  { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
];

const results = [];
for (const prof of profiles) {
  const vp = prof.base.viewport;
  const context = await browser.newContext({
    ...prof.base,
    viewport: { width: vp.height, height: vp.width },
    screen: { width: vp.height, height: vp.width },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: prof.base.deviceScaleFactor,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${prof.name}: ${String(e)}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${prof.name}: ${m.text()}`); });
  await page.goto(`http://127.0.0.1:${port}/?debug=1`);
  await page.waitForFunction(() => Boolean(window.__lf), { timeout: 8000 });
  await page.waitForFunction(() => window.__lf.state().scene === "title", { timeout: 8000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "charselect", { timeout: 8000 });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.__lf.state().scene === "run", { timeout: 8000 });
  await page.waitForTimeout(400);

  await page.evaluate(() => {
    const g = window.__game;
    const run = g.scene.getScene("run");
    const probe = { events: [], frames: [] };
    window.__probe = probe;
    g.events.on("poststep", () => {
      if (probe.frames.length > 20000) return;
      probe.frames.push({ t: performance.now(), x: run.posX, y: run.posY });
    });
    for (const obj of [document.querySelector("canvas"), window]) {
      for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
        obj.addEventListener(type, (ev) => {
          const t = ev.changedTouches ? ev.changedTouches[0] : null;
          probe.events.push({ type, t: performance.now(), x: t ? t.clientX : 0, y: t ? t.clientY : 0 });
        }, { capture: true, passive: true });
      }
    }
  });
  await page.evaluate(() => { try { window.__lf.spawnEnemy("bog_rat", 6); window.__lf.spawnEnemy("wisp", 6); } catch {} });

  const box = await page.locator("canvas").boundingBox();
  const cdp = await context.newCDPSession(page);
  const ox = box.x + box.width * 0.26;
  const oy = box.y + box.height * 0.55;
  const stickR = Math.max(box.width, box.height) * 0.09;
  const trials = [];

  let i = 0;
  let attempts = 0;
  while (i < DIRS.length && attempts < DIRS.length * 5) {
    attempts++;
    const d = DIRS[i];
    await page.evaluate(() => { const r = window.__game.scene.getScene("run"); if (r.levelUpOpen) r.pickLevelUp(0); });
    await page.waitForTimeout(140);
    const startStamp = await page.evaluate(() => ({ n: window.__probe.frames.length, x: window.__game.scene.getScene("run").posX, y: window.__game.scene.getScene("run").posY }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: ox, y: oy }] });
    await page.waitForTimeout(180);
    const baseStamp = await page.evaluate(() => ({ n: window.__probe.frames.length, x: window.__game.scene.getScene("run").posX, y: window.__game.scene.getScene("run").posY }));
    const tx = ox + d.dx * stickR;
    const ty = oy + d.dy * stickR;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: tx, y: ty }] });
    if (i === 0 && trials.length === 0) {
      await page.evaluate(() => { try { window.__lf.spawnEnemy("golem", 4); window.__lf.spawnEnemy("bog_rat", 4); } catch {} });
      await page.waitForTimeout(90);
      const frameDir = `/home/ai/tmp/m10-touch-latency/gif-${prof.name}`;
      mkdirSync(frameDir, { recursive: true });
      await page.screenshot({ path: `${WORKTREE}/shots/m10-touch-latency-${prof.name}-drag.png` });
      await fsClean(frameDir);
      for (let f = 0; f < 10; f++) {
        await page.screenshot({ path: `${frameDir}/f${String(f).padStart(3, "0")}.png` });
        await page.waitForTimeout(70);
      }
    }
    await page.waitForTimeout(420);

    const moveInfo = await page.evaluate(({ baseX, baseY, fromIdx }) => {
      const p = window.__probe;
      let moveEvT = null;
      for (let k = p.events.length - 1; k >= 0; k--) {
        if (p.events[k].type === "touchmove") { moveEvT = p.events[k].t; break; }
      }
      // Letzter Frame vor dem touchmove-Event.
      let beforeIdx = -1;
      for (let k = 0; k < p.frames.length; k++) {
        if (moveEvT != null && p.frames[k].t < moveEvT) beforeIdx = k; else if (moveEvT != null) break;
      }
      let movedIdx = null;
      for (let k = Math.max(beforeIdx + 1, fromIdx); k < p.frames.length; k++) {
        const f = p.frames[k];
        if (Math.abs(f.x - baseX) > 0.001 || Math.abs(f.y - baseY) > 0.001) { movedIdx = k; break; }
      }
      const run = window.__game.scene.getScene("run");
      const paused = Boolean(run.paused || run.levelUpOpen || run.chestOpen);
      return {
        moveEvT,
        beforeIdx,
        movedIdx,
        movedT: movedIdx != null ? p.frames[movedIdx].t : null,
        paused,
        frameMs: beforeIdx > 0 ? medianLocal(p.frames.slice(Math.max(0, beforeIdx - 30), beforeIdx + 1).map((f, idx, arr) => idx ? f.t - arr[idx - 1].t : null).filter((v) => v != null)) : 16.7,
      };
      function medianLocal(a) { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 16.7; }
    }, { baseX: baseStamp.x, baseY: baseStamp.y, fromIdx: baseStamp.n });

    if (!moveInfo.movedIdx || moveInfo.paused) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(160);
      continue; // Level-up/Truhe hat den Trial verfälscht -> wiederholen
    }

    // Loslassen: touchend -> erster Frame ohne Positionsänderung.
    const moveBaseX = await page.evaluate(() => window.__game.scene.getScene("run").posX);
    const moveBaseY = await page.evaluate(() => window.__game.scene.getScene("run").posY);
    const preEnd = await page.evaluate(() => ({ n: window.__probe.frames.length }));
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(240);
    const releaseInfo = await page.evaluate(({ fromIdx }) => {
      const p = window.__probe;
      let upEvT = null;
      for (let k = p.events.length - 1; k >= 0; k--) if (p.events[k].type === "touchend") { upEvT = p.events[k].t; break; }
      let beforeIdx = -1;
      for (let k = 0; k < p.frames.length; k++) { if (upEvT != null && p.frames[k].t < upEvT) beforeIdx = k; else if (upEvT != null) break; }
      let stoppedIdx = null;
      for (let k = Math.max(beforeIdx + 1, fromIdx); k < p.frames.length; k++) {
        if (Math.abs(p.frames[k].x - p.frames[k - 1].x) < 1e-4 && Math.abs(p.frames[k].y - p.frames[k - 1].y) < 1e-4) { stoppedIdx = k; break; }
      }
      const frameMs = beforeIdx > 0 ? (() => { const dts = []; for (let k = Math.max(1, beforeIdx - 30); k <= beforeIdx; k++) dts.push(p.frames[k].t - p.frames[k - 1].t); dts.sort((a, b) => a - b); const m = dts.length >> 1; return dts.length ? (dts.length % 2 ? dts[m] : (dts[m - 1] + dts[m]) / 2) : 16.7; })() : 16.7;
      return { upEvT, beforeIdx, stoppedIdx, frameMs, finalMovingX: p.frames[p.frames.length - 1]?.x };
    }, { fromIdx: preEnd.n });

    const latencyMs = moveInfo.movedT != null && moveInfo.moveEvT != null ? moveInfo.movedT - moveInfo.moveEvT : null;
    const latencyFrames = moveInfo.movedIdx != null && moveInfo.beforeIdx >= 0 ? moveInfo.movedIdx - moveInfo.beforeIdx : null;
    const releaseMs = releaseInfo.stoppedIdx != null && releaseInfo.upEvT != null ? Math.max(0, await page.evaluate((idx) => window.__probe.frames[idx].t, releaseInfo.stoppedIdx) - releaseInfo.upEvT) : null;
    const releaseFrames = releaseInfo.stoppedIdx != null && releaseInfo.beforeIdx >= 0 ? releaseInfo.stoppedIdx - releaseInfo.beforeIdx : null;

    trials.push({
      i, dir: d, latencyMs: latencyMs != null ? round(latencyMs) : null, latencyFrames,
      releaseMs: releaseMs != null ? round(releaseMs) : null, releaseFrames,
      frameMs: round(moveInfo.frameMs), paused: moveInfo.paused,
      movedX: round(moveInfo.movedIdx != null ? Math.abs(0) : 0),
    });
    if (i === DIRS.length - 1) {
      await page.screenshot({ path: `${WORKTREE}/shots/m10-touch-latency-${prof.name}-released.png` });
    }
    i++;
  }

  const lat = trials.map((t) => t.latencyMs).filter((v) => v != null);
  const frames = trials.map((t) => t.latencyFrames).filter((v) => v != null);
  const relFrames = trials.map((t) => t.releaseFrames).filter((v) => v != null);
  results.push({
    profile: prof.name,
    viewport: { width: vp.height, height: vp.width },
    dpr: prof.base.deviceScaleFactor,
    trials: trials.length,
    moved: lat.length,
    latencyMs: { median: round(median(lat)), p95: round(p95(lat)), min: round(Math.min(...lat)), max: round(Math.max(...lat)) },
    latencyFrames: { median: median(frames), p95: p95(frames) },
    releaseFrames: { median: median(relFrames), p95: p95(relFrames) },
    frameMs: trials[0]?.frameMs ?? null,
    perTrial: trials,
  });
  await context.close();
}

await browser.close();
server.kill();

const allMs = results.flatMap((r) => r.perTrial.map((t) => t.latencyMs).filter((v) => v != null));
const allFrames = results.flatMap((r) => r.perTrial.map((t) => t.latencyFrames).filter((v) => v != null));
const allRel = results.flatMap((r) => r.perTrial.map((t) => t.releaseFrames).filter((v) => v != null));
const summary = {
  milestone: "M10-touch-latency",
  baseSha: process.env.BASE_SHA ?? null,
  generatedAt: new Date().toISOString(),
  criterion: "Median <= 2 Frames (33 ms), p95 <= 3 Frames; Loslassen <= 1 Frame",
  passed: median(allFrames) <= 2 && p95(allFrames) <= 3 && median(allRel) <= 1 && errors.length === 0 && allMs.length > 0,
  overall: {
    latencyMs: { median: round(median(allMs)), p95: round(p95(allMs)) },
    latencyFrames: { median: median(allFrames), p95: p95(allFrames) },
    releaseFrames: { median: median(allRel), p95: p95(allRel) },
    moved: allMs.length,
  },
  profiles: results,
  jsErrors: errors,
};
writeFileSync(OUT_JSON, JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ passed: summary.passed, overall: summary.overall, profiles: results.map((r) => ({ profile: r.profile, moved: r.moved, latencyMs: r.latencyMs, latencyFrames: r.latencyFrames, releaseFrames: r.releaseFrames })), jsErrors: errors.length }, null, 2));

console.log("gif frames:", await (async () => {
  const { execFileSync } = await import("node:child_process");
  for (const prof of profiles) {
    const dir = `/home/ai/tmp/m10-touch-latency/gif-${prof.name}`;
    try {
      execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", "8", "-i", `${dir}/f%03d.png`,
        "-vf", "scale=480:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=32[p];[b][p]paletteuse",
        `${WORKTREE}/shots/m10-touch-latency-${prof.name}-drag.gif`]);
      console.log("gif ok:", prof.name);
    } catch (e) { console.log("ffmpeg:", String(e)); }
  }
})());
process.exit(summary.passed ? 0 : 1);
