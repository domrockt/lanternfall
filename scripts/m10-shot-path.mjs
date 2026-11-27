#!/usr/bin/env node
// M10-shot-path-budget K1/K4: Deterministischer Bench fuer den Gegner-Schuss-Pfad
// (EnemyProjectilePool.update + Gates) bei 500 Gegnern.
//
// Misst ms/Frame fuer spawn()-Versuche + update() des EnemyProjectilePool mit
// 500 Gegnern (Endgame-Mix, 13% Schuetzen). Rein logisch — Phaser/Atlas sind
// Stubs (Loader-Hook), kein Renderer/Server, daher OHNE flock.
// JSON geht nach shots/m10-shot-path-<tag>.json.
//
//   node scripts/m10-shot-path.mjs --tag=before
//   node scripts/m10-shot-path.mjs --tag=after
//
// Das echte src/systems/EnemyProjectiles.ts wird geladen; "phaser" und
// ../gfx/atlas werden per Resolver-Hook auf Stubs umgeleitet (Sprite-Methoden
// zaehlen ihre Aufrufe fuer das Profil), extensionless Importe bekommen ".ts".
import { writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import path from "node:path";

const TMP = path.join(homedir(), "tmp", "m10-shot-path-budget");

function ensureHook() {
  mkdirSync(TMP, { recursive: true });
  const phaserStub = `// Stub: nur was EnemyProjectiles.ts zur Laufzeit braucht.
class Image {}
const Phaser = {
  BlendModes: { NORMAL: 0, ADD: 1 },
  Math: { Clamp: (v, a, b) => (v < a ? a : v > b ? b : v) },
  GameObjects: { Image },
  Scene: class Scene {},
};
export default Phaser;
`;
  const atlasStub = `// Stub fuer gfx/atlas: Sprite-Methoden setzen Felder (billig, aber nicht frei)
// und zaehlen Aufrufe fuer das Profil.
const counts = {
  setPosition: 0, setRotation: 0, setScale: 0, setAlpha: 0,
  setVisible: 0, setActive: 0, setDepth: 0, setBlendMode: 0,
  makeImage: 0, applyTexture: 0,
};
function mkImg() {
  const img = {
    x: 0, y: 0, alpha: 1, scale: 1, rotation: 0, visible: false, active: false,
  };
  for (const m of ["setPosition", "setRotation", "setScale", "setAlpha", "setVisible", "setActive", "setDepth", "setBlendMode"]) {
    img[m] = function (v) {
      counts[m] += 1;
      if (m === "setPosition") { img.x = arguments[0]; img.y = arguments[1]; }
      else img[m.slice(3).toLowerCase()] = v;
      return img;
    };
  }
  img.clearTint = () => img;
  img.setTexture = () => img;
  img.destroy = () => {};
  return img;
}
export const makeImage = (scene, x, y, key) => { counts.makeImage += 1; const i = mkImg(); i.x = x; i.y = y; return i; };
export const applyTexture = () => { counts.applyTexture += 1; };
export const takeStubCounts = () => {
  const out = { ...counts };
  for (const k of Object.keys(counts)) counts[k] = 0;
  return out;
};
`;
  const hook = `
import { pathToFileURL } from "node:url";
const phaserStub = pathToFileURL(${JSON.stringify(path.join(TMP, "phaser-stub.mjs"))}).href;
const atlasStub = pathToFileURL(${JSON.stringify(path.join(TMP, "atlas-stub.mjs"))}).href;
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "phaser") return { url: phaserStub, shortCircuit: true };
  if (specifier.endsWith("gfx/atlas")) return { url: atlasStub, shortCircuit: true };
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      !/\\.[tj]s$/.test(specifier)
    ) {
      return nextResolve(specifier + ".ts", context);
    }
    throw err;
  }
}
`;
  writeFileSync(path.join(TMP, "phaser-stub.mjs"), phaserStub);
  writeFileSync(path.join(TMP, "atlas-stub.mjs"), atlasStub);
  writeFileSync(path.join(TMP, "lf-hook.mjs"), hook);
  return pathToFileURL(path.join(TMP, "lf-hook.mjs")).href;
}

async function main() {
  const argv = process.argv.slice(2);
  const argOf = (name, fallback) => {
    const prefix = `--${name}=`;
    const inline = argv.find((a) => a.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : fallback;
  };

  const TAG = String(argOf("tag", "baseline"));
  const OUT = String(argOf("json", `shots/m10-shot-path-${TAG}.json`));
  const ENEMIES = Number(argOf("enemies", "500"));
  const FRAMES = Number(argOf("frames", "300"));
  const PASSES = Number(argOf("passes", "9"));
  const DT = 1 / 60;
  const SEED = 20261127;

  const { EnemyProjectilePool, shotTextureFor } = await import(
    new URL("../src/systems/EnemyProjectiles.ts", import.meta.url).href
  );
  const { mulberry32 } = await import(new URL("../src/logic/rng.ts", import.meta.url).href);

  // Archetyp-Mix wie im Endgame-Crowd (identisch zu m10-ai-budget.mjs).
  const ARCHETYPE_WEIGHTS = {
    swarm: 0.3, chaser: 0.22, tank: 0.08, ranged: 0.1, charger: 0.07,
    splitter: 0.07, exploder: 0.05, phaser: 0.04, orbiter: 0.04, summoner: 0.03,
  };
  function archetypeFor(i) {
    const r = mulberry32(SEED + i * 15485863)();
    let acc = 0;
    for (const [a, w] of Object.entries(ARCHETYPE_WEIGHTS)) {
      acc += w;
      if (r < acc) return a;
    }
    return "chaser";
  }
  function ringDistance(i) {
    const bucket = i % 10;
    const r = mulberry32(SEED + i * 7919)();
    if (bucket < 5) return 40 + r * 180; // 40..220 (im View)
    if (bucket < 8) return 220 + r * 200; // 220..420 (teils im View)
    return 420 + r * 280; // 420..700 (ausserhalb des 640x360-Views)
  }
  function ringAngle(i) {
    return (i / ENEMIES) * Math.PI * 2 + mulberry32(SEED + i * 104729)() * 0.6;
  }

  // 500 Gegner um den Spieler (0,0); Schuetzen = ranged/summoner (Endgame ~13%).
  const enemies = [];
  const shooters = [];
  for (let i = 0; i < ENEMIES; i++) {
    const archetype = archetypeFor(i);
    const tier = i % 6;
    const dist = ringDistance(i);
    const ang = ringAngle(i);
    const e = {
      archetype, tier, alive: true,
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
    };
    enemies.push(e);
    if (archetype === "ranged" || archetype === "summoner") {
      // Feuerrate 1-2 s pro Schuss, gestaffelt (deterministisch), Schuss tangential
      // (trifft den Spieler nicht -> stabiler aktiver Bestand wie im Chaos).
      const interval = 60 + Math.floor(mulberry32(SEED + i * 31)() * 60);
      shooters.push({
        e, tier, archetype,
        interval,
        stagger: (i * 37) % interval,
        vx: Math.cos(ang + Math.PI / 2) * 120,
        vy: Math.sin(ang + Math.PI / 2) * 120,
        texture: shotTextureFor(archetype, tier),
      });
    }
  }

  // View wie Burst-640: 640x360 um den Spieler. Mini-Tween-Manager wie Phaser:
  // tweens.add({targets, alpha, scale, duration, onComplete}) erfasst Startwerte
  // und interpoliert linear je step(dt) — damit ist der Trail-Fade im Bench
  // ueber beide Varianten hinweg ehrlich kostet (vorher: Tween-Manager,
  // nachher: manuelles Fade im Pool).
  const tweens = [];
  const scene = {
    cameras: { main: { worldView: { x: -320, y: -180, width: 640, height: 360 } } },
    enemies: { active: enemies },
    textures: { exists: () => true, addCanvas: () => {} },
  };
  scene.tweens = {
    add(o) {
      tweens.push({
        img: o.targets, a0: o.targets.alpha, s0: o.targets.scale,
        alpha: o.alpha, scale: o.scale, duration: o.duration, t: 0,
        onComplete: o.onComplete,
      });
    },
  };
  let tweenAdds = 0;
  scene.tweens.add = (o) => { tweenAdds += 1; tweens.push({ img: o.targets, a0: o.targets.alpha, s0: o.targets.scale, alpha: o.alpha, scale: o.scale, duration: o.duration, t: 0, onComplete: o.onComplete }); };
  function stepTweens(dtMs) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dtMs;
      const k = Math.min(1, tw.t / tw.duration);
      tw.img.setAlpha(tw.a0 + (tw.alpha - tw.a0) * k);
      tw.img.setScale(tw.s0 + (tw.scale - tw.s0) * k);
      if (k >= 1) {
        tweens.splice(i, 1);
        if (tw.onComplete) tw.onComplete();
      }
    }
  }

  const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

  function runPass() {
    const pool = new EnemyProjectilePool(scene);
    pool.prewarm(256);
    let hits = 0;
    const onHit = () => { hits += 1; };
    // Warmup 120 Frames (Windup + volle Lebenszeit laufen).
    for (let f = 0; f < 120; f++) frame(pool, f, onHit);
    const t0 = performance.now();
    for (let f = 0; f < FRAMES; f++) frame(pool, 120 + f, onHit);
    const ms = (performance.now() - t0) / FRAMES;
    const stats = pool.statSnapshot();
    return { ms, stats, hits };
  }

  function frame(pool, f, onHit) {
    for (const s of shooters) {
      if ((f + s.stagger) % s.interval === 0) {
        pool.spawn({
          x: s.e.x, y: s.e.y, vx: s.vx, vy: s.vy,
          damage: 2, texture: s.texture,
        });
      }
    }
    pool.update(DT, 0, 0, onHit);
    stepTweens(DT * 1000);
  }

  // ── Messung: PASSES Laeufe, Minimum zaehlt (Micro-Bench-Standard). ──
  const passMs = [];
  let last = null;
  for (let p = 0; p < PASSES; p++) {
    const r = runPass();
    passMs.push(r.ms);
    last = r;
  }
  passMs.sort((a, b) => a - b);

  // ── Zaehler/Profil ueber einen stabilen Messlauf ──
  const { takeStubCounts } = await import(
    pathToFileURL(path.join(TMP, "atlas-stub.mjs")).href
  );
  const pool = new EnemyProjectilePool(scene);
  pool.prewarm(256);
  const profFrames = 300;
  let hitsTotal = 0;
  const onHit = () => { hitsTotal += 1; };
  for (let f = 0; f < 120; f++) frame(pool, f, onHit);
  const stub = takeStubCounts();
  tweenAdds = 0;
  for (let f = 0; f < profFrames; f++) frame(pool, 120 + f, onHit);
  const stubPerFrame = takeStubCounts();
  for (const k of Object.keys(stubPerFrame)) stubPerFrame[k] = round(stubPerFrame[k] / profFrames, 2);
  const stats = pool.statSnapshot();

  mkdirSync("shots", { recursive: true });
  const report = {
    tag: TAG,
    date: new Date().toISOString(),
    config: {
      enemies: ENEMIES,
      shooters: shooters.length,
      framesPerPass: FRAMES,
      passes: PASSES,
      warmupFrames: 120,
      dt: DT,
      seed: SEED,
      view: "640x360 um Spieler (0,0)",
      shotSpeed: 120,
      shotLife: 3.2,
      fireIntervalFrames: "60-120, gestaffelt",
    },
    results: {
      msPerFrame: round(passMs[0]),
      passMsPerFrame: passMs.map((m) => round(m)),
      statsAfterProfileRun: stats,
      hitsInProfileRun: hitsTotal,
      tweenAddsPerFrame: round(tweenAdds / profFrames, 2),
      stubCallsPerFrame: stubPerFrame,
    },
  };
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(
    `EnemyShot-Pfad @ ${ENEMIES} Gegner (${shooters.length} Schuetzen): ${report.results.msPerFrame} ms/Frame (min ueber ${PASSES} Passes) -> ${OUT}`,
  );
  console.log(`  Stub-Aufrufe/Frame: ${JSON.stringify(stubPerFrame)}`);
}

// ── Boot: beim ersten Start Hook schreiben + Kind mit Hook neu starten. ──
if (!process.env.LF_SHOT_PATH_HOOK) {
  const hookUrl = ensureHook();
  const res = spawnSync(
    process.execPath,
    // Wichtig: Entry als Pfad (kein file:-URL) — Node 22.14 resolves URL-Entries
    // hinter dem Loader-Rewrite falsch.
    ["--experimental-strip-types", "--experimental-loader", hookUrl, process.argv[1],
      ...process.argv.slice(2)],
    { stdio: "inherit", env: { ...process.env, LF_SHOT_PATH_HOOK: "1" } },
  );
  process.exit(res.status ?? 1);
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
