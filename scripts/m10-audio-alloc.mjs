#!/usr/bin/env node
// m10-audio-alloc-fix K1/K3: Allokations-Profiling des SFX-Pfads.
//
// Chaos-Lauf wie scripts/m10-run-cpu.mjs (Seed 1, Minute 25, 6 Waffen Lv8 +
// 6 Evolutionen + 6 Passives St.5, 500 Gegner, god/autoplay), aber gemessen
// wird nur die ALLOKATIONS-Seite des Audio-Pfads:
//
//   - plays/s             (debugState().sfxPlayed-Delta, erlaubte Starts)
//   - bytesPerFrame/Play  (CDP Sampling-Heap-Profiler, Intervall 512 B)
//   - Gruppen-Attribution: audio-system (AudioSystem.ts) / mixing (mixing.ts) /
//     phaser-sfx (WebAudioSound createBufferSource+onended) / Rest
//   - topAllocSites       (fn @ url:line je Gruppe)
//
// Attribution braucht lesbare Funktionsnamen: Skript baut ZUNÄCHST unminifiziert
// (`vite build --base ./ --minify false`, nur temporär in dist) und stellt am
// Ende den normalen Build wieder her. Läuft OHNE flock (kein FPS/Echtzeit-Lauf).
//
//   node scripts/m10-audio-alloc.mjs --tag=before
//   node scripts/m10-audio-alloc.mjs --tag=after
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { ensureBuild, startServer, loadPlaywright, startRun } from "./harness.mjs";

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const prefix = `--${name}=`;
  const inline = argv.find((a) => a.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const TAG = String(argOf("tag", "before"));
const OUT = String(argOf("json", `shots/m10-audio-alloc-${TAG}.json`));
const SECONDS = Number(argOf("seconds", "20"));
const TARGET = Number(argOf("target", "500"));
const SAMPLE_INTERVAL = Number(argOf("sampling", "512"));
const SEED = String(argOf("seed", "1"));

const EVOLUTIONS = ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"];
const PASSIVES = ["heart", "boots", "tome", "charm", "whetstone", "hourglass"];

const log = (m) => console.log(`[m10-audio-alloc] ${m}`);

// Unminifizierter Build für Funktionsnamen-Attribution (temporär).
log("unminifizierter Build für Attribution ...");
execFileSync("node_modules/.bin/vite", ["build", "--base", "./", "--minify", "false"], { stdio: "inherit" });
ensureBuild();

const { chromium } = await loadPlaywright();
const server = await startServer();
const browser = await chromium.launch({
  args: [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

const clearLevelUps = async () => {
  for (let i = 0; i < 40; i++) {
    if (!(await page.evaluate(() => window.__lf?.stats().levelUpOpen))) break;
    await page.evaluate(() => window.__lf.pickLevelUp(0));
  }
};

let result;
try {
  await page.goto(`http://127.0.0.1:${server.port}/?debug=1&seed=${SEED}`);
  await startRun(page);
  await page.evaluate(() => {
    window.__lf.god(true);
    window.__lf.autoPlay(true);
    window.__lf.setTimeScale(1);
    window.__lf.setSuppressLevelUps(true);
    for (const id of ["ember", "flail", "frost", "thorn", "storm", "lantern"]) {
      window.__lf.addWeapon(id, 8);
    }
    for (const id of ["phoenix", "wrath_pendulum", "eternal_winter", "thorn_storm", "thunder_seal", "soul_beacon"]) {
      window.__lf.addWeapon(id, 8);
    }
    for (const id of ["heart", "boots", "tome", "charm", "whetstone", "hourglass"]) {
      window.__lf.addPassive(id, 5);
    }
    window.__lf.skipTo(1500);
    window.__lf.setTimeScale(1);
  });
  await page.waitForTimeout(6000);
  await clearLevelUps();

  const renderer = await page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2") ??
      document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      webglRenderer: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER) ?? ""),
      webglVendor: ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)) : String(gl?.getParameter(gl.VENDOR) ?? ""),
    };
  });

  const audioBefore = await page.evaluate(() => window.__lf.audio());

  await cdpStart(page, SAMPLE_INTERVAL);

  // Messfenster: Gegner bei 500 halten (vergleichbar mit m10-run-cpu-budget).
  const run = await page.evaluate(async ({ seconds, target }) => {
    const f0 = window.__game.loop.frame;
    const start = performance.now();
    await new Promise((resolve) => {
      const spawnTimer = setInterval(() => {
        const active = window.__lf.stats().enemies;
        if (active < target) window.__lf.spawnEnemy("bog_rat", target - active);
        if (performance.now() - start >= 4000) window.__lf.god(true); // God erneuern
      }, 50);
      setTimeout(() => { clearInterval(spawnTimer); resolve(); }, seconds * 1000);
    });
    const elapsed = performance.now() - start;
    return {
      framesMeasured: window.__game.loop.frame - f0,
      elapsedMs: Math.round(elapsed),
      avgEnemies: window.__lf.stats().enemies,
      kills: window.__lf.stats().kills,
      scene: window.__lf.state().scene,
    };
  }, { seconds: SECONDS, target: TARGET });

  const { profile: heapProfile } = await cdpStop(page);
  const audioAfter = await page.evaluate(() => window.__lf.audio());

  if (!audioAfter.loaded) throw new Error("Audio nicht geladen (loaded=false) — SFX-Pfad wurde nicht gemessen");
  const plays = audioAfter.sfxPlayed - audioBefore.sfxPlayed;
  if (plays <= 0) throw new Error("Keine SFX-Starts im Fenster — Messung unbrauchbar");

  // ---- Attribution: Sampling-Heap-Profil als Call-Tree gehen. SFX-Pfad =
  // alle Allokationen, deren Stack durch einen benannten App-"play"-Frame
  // läuft (AudioSystem.play); alles andere ist nicht Audio. Gruppen:
  //   audio-system = Blatt im AudioSystem.play-Frame bzw. anonyme Closures,
  //                  deren nächster benannter Vorfahre play() ist
  //   mixing       = Blatt unter planPlay/notePlayed/... (fremd, nur报告)
  //   phaser-sfx   = Engine-Churn, den play() auslöst (createBufferSource,
  //                  onended, EE3-Listener) (fremd, nur Bericht)
  const MIXING_FNS = new Set([
    "planPlay", "notePlayed", "pruneStarts", "pickupDampGain", "limiterGain",
    "activeVolumeSum", "effectiveVolume", "audioBudgetFor", "releaseVoice",
  ]);
  const isPhaserUrl = (url) => /phaser/.test(String(url));
  // AudioSystem liegt im gfx-Chunk (Probe: play @ gfx:3281, playWeapon @ gfx:3378);
  // nur phaser-chunk-"play" (WebAudioSound) ist nicht unseres.
  const isAudioPlayFrame = (f) => f.functionName === "play" && !isPhaserUrl(f.url);
  const base = (url) => String(url).split("/").pop() || url;

  const groups = new Map(); // group -> bytes
  const sites = new Map();  // fn @ url:line -> {group, bytes}
  const bump = (map, key, bytes) => map.set(key, (map.get(key) ?? 0) + bytes);

  const nearestNamed = (stack) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const ffn = stack[i].functionName || "";
      if (ffn && ffn !== "(anonymous)" && ffn !== "(EXTERNAL)") return ffn;
    }
    return "";
  };

  const classify = (frame, stack) => {
    const fn = frame.functionName || "(anonymous)";
    const near = nearestNamed(stack);
    if (isPhaserUrl(frame.url)) return "phaser-sfx";
    if (MIXING_FNS.has(fn) || MIXING_FNS.has(near)) return "mixing";
    if (fn === "play" || near === "play") return "audio-system";
    return "sfx-other";
  };

  const walk = (node, stack, underPlay) => {
    const cf = node.callFrame ?? {};
    const self = node.selfSize ?? 0;
    const nowUnderPlay = underPlay || isAudioPlayFrame(cf);
    if (self > 0 && nowUnderPlay) {
      const group = classify(cf, stack);
      bump(groups, group, self);
      const line = (cf.lineNumber ?? 0) + 1;
      const key = `${cf.functionName || "(anonymous)"} @ ${base(cf.url)}:${line}`;
      const entry = sites.get(key) ?? { group, bytes: 0 };
      entry.bytes += self;
      sites.set(key, entry);
    }
    const next = [...stack, cf];
    for (const c of node.children ?? []) walk(c, next, nowUnderPlay);
  };
  walk(heapProfile.head, [], false);

  const totalBytes = [...groups.values()].reduce((a, b) => a + b, 0);
  const topAllocSites = [...sites.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 20)
    .map(([site, { group, bytes }]) => ({
      site, group,
      bytes: Math.round(bytes),
      bytesPerFrame: Math.round(bytes / Math.max(1, run.framesMeasured)),
      bytesPerPlay: Math.round(bytes / Math.max(1, plays)),
      percent: Math.round((bytes / Math.max(1, totalBytes)) * 1000) / 10,
    }));

  const byGroup = {};
  for (const [group, bytes] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
    byGroup[group] = {
      bytes: Math.round(bytes),
      bytesPerFrame: Math.round(bytes / Math.max(1, run.framesMeasured)),
      bytesPerPlay: Math.round(bytes / Math.max(1, plays)),
      percent: Math.round((bytes / Math.max(1, totalBytes)) * 1000) / 10,
    };
  }

  result = {
    generatedAt: new Date().toISOString(),
    tag: TAG,
    seed: SEED,
    samplingIntervalBytes: SAMPLE_INTERVAL,
    renderer,
    run,
    audio: { playsAllowed: plays, voices: audioAfter.voices, loaded: audioAfter.loaded },
    allocGroups: byGroup,
    totalAllocBytes: Math.round(totalBytes),
    totalBytesPerFrame: Math.round(totalBytes / Math.max(1, run.framesMeasured)),
    topAllocSites,
    jsErrors: errors,
  };
} finally {
  await browser.close();
  server.stop();
  // Normalen Build wiederherstellen (dist gehört der Pipeline, nicht dieser Lane).
  log("normaler Build wird wiederhergestellt ...");
  execFileSync("npm", ["run", "build"], { stdio: "inherit" });
}

mkdirSync("shots", { recursive: true });
writeFileSync(OUT, JSON.stringify(result, null, 2));
try {
  mkdirSync(`${process.env.HOME}/games/.evidence/m10-audio-alloc-fix`, { recursive: true });
  copyFileSync(OUT, `${process.env.HOME}/games/.evidence/m10-audio-alloc-fix/${OUT.split("/").pop()}`);
} catch { /* Evidence-Dir nicht verfügbar — shots genügt */ }
console.log(JSON.stringify({
  plays: result.audio.playsAllowed,
  totalBytesPerFrame: result.totalBytesPerFrame,
  allocGroups: result.allocGroups,
  jsErrors: result.jsErrors.length,
}, null, 2));

// ---- CDP-Start/Stop isoliert (Seite existiert zum Zeitpunkt des Aufrufs).
async function cdpStart(page, interval) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.enable");
  await cdp.send("HeapProfiler.startSampling", { samplingInterval: interval });
  page.__allocCdp = cdp;
}
async function cdpStop(page) {
  const cdp = page.__allocCdp;
  return cdp.send("HeapProfiler.stopSampling");
}
