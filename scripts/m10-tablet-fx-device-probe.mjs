// Einmal-Probe (m10-tablet-fx-hotspot): GL-Zahlen auf dem Redmi Pad Pro,
// EINE CDP-Verbindung, kein App-Relaunch (der killt connectOverCDP).
// Misst base und stackA:+6 (cumulativ) auf dem Geraet.
import { loadPlaywright } from "/home/ai/games/lf-lanes/m10-tablet-fx-hotspot/scripts/harness.mjs";

const CDP = "http://172.17.0.1:9333";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INSTRUMENT = () => {
  const P = WebGLRenderingContext.prototype;
  window.__glc = {};
  for (const fn of ["drawElements", "drawArrays", "blendFunc", "blendFuncSeparate", "useProgram", "bindFramebuffer", "bufferSubData"]) {
    const o = P[fn];
    if (!o) continue;
    P[fn] = function (...a) {
      window.__glc[fn] = (window.__glc[fn] || 0) + 1;
      return o.apply(this, a);
    };
  }
  window.__fbNonNull = 0;
  const ofb = P.bindFramebuffer;
  P.bindFramebuffer = function (t, fb) {
    if (fb != null) window.__fbNonNull++;
    return ofb.call(this, t, fb);
  };
};

const windowFn = (secs) => {
  const w = secs * 1000;
  return new Promise((resolve) => {
    const start = performance.now();
    window.__glc = {};
    const fb0 = window.__fbNonNull;
    let last = 0;
    const frames = [];
    const f = () => {
      const now = performance.now();
      frames.push(now - last);
      last = now;
      if (now - start >= w) {
        const per = {};
        for (const k in window.__glc) per[k] = window.__glc[k] / frames.length;
        resolve({
          fps: frames.length / ((now - start) / 1000),
          frames: frames.length,
          perFrame: per,
          fbNonNullPerFrame: (window.__fbNonNull - fb0) / frames.length,
        });
        return;
      }
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
};

const { chromium } = await loadPlaywright();
const browser = await chromium.connectOverCDP(CDP);
const page = browser.contexts()[0].pages()[0];
page.on("pageerror", (e) => console.log("PAGEERROR:", String(e)));

const state = await page.evaluate(() => window.__lf?.state?.()?.scene ?? "unknown");
console.log("scene:", state);
if (state !== "run") {
  await page.keyboard.press("Enter");
  await sleep(1500);
  await page.keyboard.press("Enter");
  await sleep(1500);
}
const st = await page.evaluate(() => window.__lf.state().scene);
console.log("scene now:", st);
await page.evaluate(() => {
  window.__lf.god(true);
  window.__lf.setSuppressLevelUps(true);
  window.__lf.spawnEnemy("wisp", 200);
});
await sleep(3000);
await page.evaluate(INSTRUMENT);

const EVOS = ["thorn_storm", "phoenix", "eternal_winter", "thunder_seal", "soul_beacon", "wrath_pendulum"];
const results = [];
const label = `stackA:+${1}_${EVOS[0]}`;
await page.evaluate((e) => window.__lf.addWeapon(e, 1), EVOS[0]);
await sleep(3000);
let r = await page.evaluate(windowFn, 5);
results.push({ label, ...r });
console.log(`${label}: fps=${r.fps.toFixed(1)} blend=${Math.round((r.perFrame.blendFunc || 0) + (r.perFrame.blendFuncSeparate || 0))} draws=${Math.round((r.perFrame.drawElements || 0) + (r.perFrame.drawArrays || 0))} bufSub=${Math.round(r.perFrame.bufferSubData || 0)} fbNN=${r.fbNonNullPerFrame}`);
for (let i = 1; i < EVOS.length; i++) {
  await page.evaluate((e) => window.__lf.addWeapon(e, 1), EVOS[i]);
  await sleep(3000);
  const lbl = `stackA:+${i + 1}_${EVOS[i]}`;
  r = await page.evaluate(windowFn, 5);
  results.push({ label: lbl, ...r });
  console.log(`${lbl}: fps=${r.fps.toFixed(1)} blend=${Math.round((r.perFrame.blendFunc || 0) + (r.perFrame.blendFuncSeparate || 0))} draws=${Math.round((r.perFrame.drawElements || 0) + (r.perFrame.drawArrays || 0))} bufSub=${Math.round(r.perFrame.bufferSubData || 0)} fbNN=${r.fbNonNullPerFrame}`);
}
const renderer = await page.evaluate(() => {
  const dbg = WebGLRenderingContext.prototype.getExtension ? null : null;
  return navigator.userAgent;
});
const { writeFileSync } = await import("node:fs");
writeFileSync("/home/ai/games/.evidence/m10-tablet-fx-hotspot/after-device-probe.json", JSON.stringify({ ua: renderer, results }, null, 1));
console.log("JSON -> ~/games/.evidence/m10-tablet-fx-hotspot/after-device-probe.json");
await browser.close();
