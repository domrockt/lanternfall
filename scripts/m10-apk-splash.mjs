// m10-apk-splash-sight K2 — Kaltstart-Belege am Gerät (NUR-MESS).
// 3 Kaltstarts über device-bridge (POST /launch = force-stop + Start),
// unmittelbar danach zeitgestaffelte adb-Screencaps (POST /screenshot),
// um das native Starting-Window (#0a0d14 + Laterne) einzufangen.
// screenrecord liefert auf dem Redmi Pad (Android 16) nur Stümpfe (Vault: Infrastruktur 28.11).
// Die Bridge legt das PNG lokal ab (/home/ai/games/.evidence/device/screen-*.png) und nennt
// den Pfad in der Antwort — wir lesen ihn per fs und archivieren ihn mit Zeitstempel.
// Kein flock (kein FPS). Spieler-Sperre: bei 409 DOM_SPIELT je Karte EIN erneuter Versuch.
const BRIDGE = "http://172.17.0.1:5181";
// M10_STARTS: Anzahl Kaltstarts (Default 1 = Beleg-Karte m10-apk-splash-window-beleg, EIN Start)
const STARTS = Number(process.env.M10_STARTS ?? 1);
const WINDOW_MS = Number(process.env.M10_WINDOW_MS ?? 6000); // Aufnahmefenster je Start

const outDir = process.argv[2];
if (!outDir) { console.error("usage: node scripts/m10-apk-splash.mjs <outdir>"); process.exit(2); }

import { mkdirSync, copyFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
mkdirSync(outDir, { recursive: true });

const manifest = { lane: "m10-apk-splash-window-beleg", card: "#13215", bridge: BRIDGE, starts: [] };

for (let n = 1; n <= STARTS; n++) {
  const run = { n, launch: null, shots: [], blocked: null };
  const statusBefore = await (await fetch(`${BRIDGE}/status`)).json();
  run.domPlayingBefore = statusBefore.dom_playing;
  run.userIdleS = statusBefore.user_idle_s;
  if (statusBefore.dom_playing) {
    run.blocked = "DOM_SPIELT (dom_playing true vor Start) — kein Launch versucht";
    manifest.starts.push(run); continue;
  }
  // Warm-up: die ERSTE /screenshot-Abfrage nach einem Launch dauert ~4,5 s (Bridge/adb kalt),
  // danach ~420 ms Takt. Ein Wegwerf-Shot vor dem Launch waermt die Pipeline, damit Shot 1
  // das native Starting-Window (erste 1-3 s) noch erwischt. Laut Versuch-2-Befund verpasst
  // ein kalter erster Shot die native Phase (erstes Bild zeigt bereits WebView-Boot).
  try {
    const wu = await fetch(`${BRIDGE}/screenshot`, { method: "POST" });
    if (wu.ok) await wu.json(); // Pfad interessiert nicht, nur Warmwerden
  } catch { /* Warm-up darf scheitern */ }
  const t0 = Date.now();
  const lr = await fetch(`${BRIDGE}/launch`, { method: "POST" });
  run.launch = { status: lr.status, body: await lr.text(), t0 };
  if (lr.status === 409) {
    // Spieler-Sperre: EIN erneuter Versuch pro Karte, sonst abbrechen (Regel 14:05Z)
    const lr2 = await fetch(`${BRIDGE}/launch`, { method: "POST" });
    run.launch.retry = { status: lr2.status, body: await lr2.text() };
    if (lr2.status === 409) {
      run.blocked = "409 DOM_SPIELT auch beim 2. Versuch — Start abgebrochen";
      manifest.starts.push(run); continue;
    }
  }
  // Screencaps im Loop bis WINDOW_MS; /screenshot blockt ~0.5-1 s selbst
  while (Date.now() - t0 < WINDOW_MS) {
    const el = Date.now() - t0;
    try {
      const sr = await fetch(`${BRIDGE}/screenshot`, { method: "POST" });
      if (sr.ok) {
        const j = await sr.json();
        const el2 = Date.now() - t0;
        if (j.path) {
          const dest = join(outDir, `start${n}-t${String(el2).padStart(5, "0")}.png`);
          try {
            if (statSync(j.path).size > 0) copyFileSync(j.path, dest);
            run.shots.push({ atMs: el2, src: j.path, dest, bytes: j.bytes ?? null });
          } catch (e) { run.shots.push({ atMs: el2, src: j.path, error: String(e) }); }
        }
      } else {
        run.shots.push({ atMs: Date.now() - t0, httpStatus: sr.status });
      }
    } catch (e) { run.shots.push({ atMs: Date.now() - t0, error: String(e) }); }
  }
  const st = await (await fetch(`${BRIDGE}/status`)).json();
  run.pidAfter = st.pid;
  manifest.starts.push(run);
}
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("done", outDir, "starts:", manifest.starts.map(s => `${s.n}:${s.blocked ?? "ok"}:${s.shots.length}shots`).join(" "));
