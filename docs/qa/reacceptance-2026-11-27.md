# Nachabnahme nach dem Performance-Fix — 2026-11-27

Unabhängige Re-Abnahme auf `main` @ **`78cca7e`** (Merge-Nachlauf m10-ground-cost,
2026-11-27 12:28:03 UTC), headless Chromium auf diesem Rechner.
Lange Läufe serialisiert über `flock /home/ai/games/.lf-perf.lock`.
Jede Karte hat einen eigenen Commit; dieses Dokument wächst mit den Karten.

> Status: **in Arbeit** — Urteil folgt am Ende (Abschnitt „Urteil").

## fa2-00 — Ausgangslage und Geltungsbereich

- `main` enthält seit der Endabnahme (Basis `2204ddc`) zusätzlich die Lanes
  `m10-separation-crowd` (Separation-Härtung + SpatialHash-Nachbar-Query),
  `m10-perf-rootcause` (nur A/B-Messung/Doku), `m10-ground-cost` (nur Messung/Doku,
  Chunk-Composite verworfen) sowie `m10-chaos-qa` (Lesbarkeits-Matrix), `m10-fx-evolution`,
  `m10-boss-onscreen`, `m10-heroes-pass`, `m10-palette-guard`, `m10-weapons-stable`,
  `m10-death-fx`, `m10-evolution-hint`, `m10-heap-acceptance-sync`.
- **Nicht in main:** die Lanes `m10-endgame-fps` (Frame-Budget-Regler),
  `m10-perf-recovery` (Fix-Karte #2678 blocked) und `m10-ui-text-cost`;
  d. h. der in der Endabnahme benannte Code-Fix für den Endgame-FPS-Pfad ist
  **nicht** Bestandteil des geprüften main. Geprüft wird der tatsächliche Ist-Stand.

## fa2-01 — Schnelle Checks (Build, Tests, Inhalte, verify:final)

| Zeit (UTC) | Befehl | Ergebnis | Urteil |
|---|---|---|---|
| 2026-11-27T13:15:29Z | `npm run build` (`tsc --noEmit && vite build --base ./`) | rc=0, `✓ built in 862ms`, Chunk-Warnung 1.854 kB (bekannt) | OK |
| 2026-11-27T13:15:30Z | `npm test` (`vitest run`) | **355 Tests in 33 Dateien, 0 fail**, 1,16 s | OK (+16,3 % gegen 305 der Endabnahme; neue Lanes) |
| 2026-11-27T13:15:32Z | `node scripts/acceptance-count.mjs` | `ok:true`, **30/6/6/6/6/2** (Soll = Ist) | OK |
| 2026-11-27T13:15:47–13:15:59Z | `node scripts/verify-final.mjs` | **7/7 PASS**, 0 JS-Fehler: Master-Mute gesetzt/blockt/persistiert, Aggregation 110 aus / 129 an, Ergebnis-Screen `dawn` mit 12 Waffen | OK |

Rohlog: `/tmp/lf-fa2/fa2-01.log`, `/tmp/lf-fa2/fa2-01-final.log`,
`shots/final-verify.json` (vom Skript neu geschrieben).

**Urteil fa2-01: PASS.**

## fa2-02 — Performance Burst + Minute 25 (640×360 und 780×360@3, je 3 Läufe, flock)

Alle 6 Läufe serialisiert unter `flock /home/ai/games/.lf-perf.lock`,
`scripts/perf.mjs --viewport <WxH> --dpr <n>`, 500 Gegner im Burst, 300 Gegner + 6
Evolutionen in Minute 25, je 10 s. Host-loadavg beim Start ist mit notiert.

| View | Lauf | loadavg Start | Burst FPS (500 Gegner) | Burst worst | Minute-25 FPS (300) | M25 worst | JS-Fehler |
|---|---|---|---|---|---|---|---|
| 640×360 dpr1 | 1 | 12,98 | **59,9** | 33,4 ms | 50,9 | 33,5 ms | 0 |
| 640×360 dpr1 | 2 | 14,77 | **60,1** | 16,8 ms | 51,4 | 33,4 ms | 0 |
| 640×360 dpr1 | 3 | 13,34 | **60,1** | 16,8 ms | **54,0** | 33,5 ms | 0 |
| **640 min** | | | **59,9 / Ziel 55 → PASS** | | **50,9 / Ziel 50 → PASS (knapp)** | | 0 |
| 780×360 dpr3 | 1 | 15,87 | 54,7 | 33,4 ms | 45,7 | 33,4 ms | 0 |
| 780×360 dpr3 | 2 | 14,61 | 55,2 | 33,4 ms | 42,1 | 33,5 ms | 0 |
| 780×360 dpr3 | 3 | 14,84 | **56,1** | 33,4 ms | 46,4 | 33,4 ms | 0 |
| **780 min** | | | **54,7 / Ziel 55 → FAIL (2/3 PASS, −0,5 %)** | | **42,1 / Ziel 50 → FAIL** | | 0 |

Roh-JSON: `shots/qa-reaccept-640-r{1,2,3}.json`, `shots/qa-reaccept-780-r{1,2,3}.json`.
Screenshots: `shots/perf-500.png`, `shots/perf-minute25.png` (neu geschrieben).

**Befund:** Der 640×360-Burst ist von 46,3 (Endabnahme) auf min **59,9 FPS** gestiegen
→ Punkt **grün**. Minute 25 bei 640 liegt mit min **50,9** knapp über dem 50er-Ziel.
Der 780×360-Burst ist grenzwertig (min 54,7, 2/3 ≥ 55), Minute 25 bei 780 bleibt mit
42,1–46,4 FPS klar unter 50 → **rot**. Keine JS-Fehler in allen 6 Läufen.

**Urteil fa2-02: TEILWEISE PASS** (Burst 640 PASS, M25 640 knapp PASS, Burst 780
grenzwertig FAIL, M25 780 FAIL).

### fa2-02b — Bestätigungslauf mit einem kurzen Skript (max. 3 Iterationen, Supervisor-Vorgabe)

`node scripts/qa-qa-reaccept-perf.mjs` (Datei: `scripts/qa-reaccept-perf.mjs`) startet je
Iteration zuerst 640×360 dpr1, dann 780×360 dpr3, jeweils über `scripts/perf.mjs` unter
`flock /home/ams…` → `/home/ai/games/.lf-perf.lock`, und protokolliert **Burst-FPS** und
**Minute-25-FPS getrennt**. loadavg Start 9,61/11,90/10,75. Laufzeit 14:47:50–14:52:38Z.

| Iteration | View | Burst FPS (500 Gegner) | Burst worst | Minute-25 FPS (300) | M25 worst | JS-Fehler |
|---|---|---|---|---|---|---|
| 1 | 640×360@1 | 60,1 | 16,8 ms | **55,4** | 33,4 ms | 0 |
| 1 | 780×360@3 | 55,7 | 33,4 ms | 42,9 | 33,5 ms | 0 |
| 2 | 640×360@1 | 60,1 | 16,8 ms | 53,0 | 33,5 ms | 0 |
| 2 | 780×360@3 | 55,9 | 33,5 ms | 43,4 | 33,4 ms | 0 |
| 3 | 640×360@1 | 60,1 | 16,8 ms | 51,0 | 33,4 ms | 0 |
| 3 | 780×360@3 | **56,4** | 33,4 ms | **41,3** | 33,4 ms | 0 |
| **min** | 640×360@1 | **60,1 ≥55 PASS** | | **51,0 ≥50 PASS (knapp)** | | 0 |
| **min** | 780×360@3 | **55,7 ≥55 PASS** | | **41,3 <50 FAIL** | | 0 |

Rohdaten: `shots/qa-reaccept-iter{1,2,3}-{640x360@1,780x360@3}.json`,
`shots/qa-reaccept-perf-summary.json`, Log `/tmp/lf-fa2/fa2-02b-perf.log`.

**Klarer Engpass belegt:** Der 500er-Burst ist in beiden Views grün (min 60,1 bzw. 55,7).
Der Einbruch sitzt ausschließlich in **Minute 25 bei 780×360 dpr3** (41,3–43,4 FPS, 3/3 < 50)
sowie im **fullrun-Endgame-Fenster** (35,7/34,8, siehe fa2-03), das bei 1× mit >400 Gegnern,
Boss und Gems rendert. Sim/Projektile sind laut `m10-perf-rootcause` nicht treibend; die
Kosten sind Render-/Fill-Rate (breite Canvas-Ausgabe + additive FX/UI-Overlays). Der Fix
liegt in den nicht gemergten Lanes `m10-endgame-fps`/`m10-perf-recovery` bzw. der neuen
Lane `m10-fx-overdraw-cap`. #3419 wird daher **blocked** (Abnahmekriterium M25 ≥50 bei
780 nicht erfüllt, kein Fix in main).

**Urteil fa2-02b: 640 PASS, 780-Minute-25 FAIL → Blockergrund für #3419.**

### fa2-02c — Bestätigungslauf nach Supervisor-Vorgabe (genau 1 Durchlauf, festes Timeout)

Ein einzelner Durchlauf unter `flock /home/ai/games/.lf-perf.lock`, festes Timeout 900 s,
**kein** Full-Build dazwischen: erst `node scripts/perf.mjs --viewport 640x360 --dpr 1`,
dann `node scripts/perf.mjs --viewport 780x360 --dpr 3`. loadavg beim Start: **11,21**.
Zeitstempel: 2026-11-27T15:02–15:03Z.

| View | Burst FPS (500 Gegner) | Burst worst | Minute-25 FPS (300) | M25 worst | JS-Fehler | Ziel Burst ≥55 / M25 ≥50 |
|---|---|---|---|---|---|---|
| 640×360@1 | **60,1** | 16,8 ms | **53,7** | 33,4 ms | 0 | Burst PASS / M25 **PASS** |
| 780×360@3 | **55,5** | 33,4 ms | **44,9** | 33,5 ms | 0 | Burst PASS / M25 **FAIL** |

Roh-JSON: `shots/qa-reaccept-final-640.json`, `shots/qa-reaccept-final-780.json`.
Logs: `/tmp/lf-fa2/fa2-02-final-640.log`, `fa2-02-final-780.log`.
Screenshots aus dem Lauf: `shots/perf-500.png`, `shots/perf-minute25.png` (neu geschrieben).

**Befund:** Der Befund aus fa2-02b bestätigt sich. 640×360 ist mit Burst 60,1 und
Minute-25 53,7 **grün**. 780×360 dpr3 hat den Burst grün (55,5 ≥ 55), aber Minute 25
bleibt mit **44,9 FPS** klar unter dem 50er-Ziel. Die Messung lieferte verwertbare FPS,
der Engpass ist reproduzierbar der 780er-Endgame-Renderpfad. #3419 bleibt **blocked**
(Abnahmekriterium Minute-25 780 ≥50 nicht erfüllt; Fix-Lanes `m10-endgame-fps` /
`m10-perf-recovery` / `m10-fx-overdraw-cap` sind nicht in main).

## fa2-03 — 30-min-autoPlay fullrun (30×), Boss-/Truhen-Timing, Sieg, Heap

`flock /home/ai/games/.lf-perf.lock node scripts/fullrun.mjs --viewport <WxH> --dpr <n>`,
je View **einmal** (kein Wiederholungslauf). Host-loadavg bei Start: 7,46 (640×360 dpr1)
bzw. 15,79 (780×360 dpr3).

| View | Sim-Dauer | Bosse 300/600/900/1200/1500/1800 s | Truhen | Sieg | Kills / Level | Elites | Heap Δ (Min 1→29) | fpsMin (29:20–Sieg, 1×) | JS-Fehler |
|---|---|---|---|---|---|---|---|---|---|
| 640×360 dpr1 | 30,2 min | **6/6** (`defeated 6`, `flags` alle true) | **6** | `dawn` | 4.134 / 36 | 156 | 30,9 → 33,6 MB = **+8,7 % (≤15 %, PASS)** | **35,7 (<55 → FAIL)** | 0 |
| 780×360 dpr3 | 30,2 min | **6/6 exakt** (300/600/900/1200/1500/1800 s) | **6** | `dawn` | 5.074 / 38 | 176 | 31,6 → 36,4 MB = **+15,2 % (>15 %, knapp FAIL)** | **34,8 (<55 → FAIL)** | 0 |

Rohlog mit beiden Zusammenfassungen: `/tmp/lf-fa2/fa2-03-fullrun.log`.
Vollständiges Ergebnis-JSON des letzten Laufs (780): `shots/m2…` → `shots/m3-fullrun.json`
(inkl. aller 6 Boss-Spawnzeiten, `phasesSeen 5:1/5:2/5:3`, 6 Truhen, `dawn`).
Minuten-Screenshots: `shots/m3-fullrun-minute25.png`, `shots/m3-fullrun-results.png`.

**Befund:** Inhaltlich alles grün (alle 5-Minuten-Bosse mit Truhe, Endboss-Phasen,
Sieg nach 30:00, 0 JS-Fehler). Performance im Endgame-Fenster bleibt **rot**:
fpsMin 35,7 / 34,8 FPS gegen das 55-Ziel. Heap ist bei 640 grün (+8,7 %), bei 780
marginal über dem Ziel (+15,2 %, 0,2 pp).

**Urteil fa2-03: Inhalt PASS, Performance FAIL (Endgame-Fenster), Heap 1× PASS / 1× knapp FAIL.**

## fa2-04 — 30-min-Echtzeitlauf (realtime-run), Heap ≤15 %

`flock /home/ai/games/.lf-perf.lock node scripts/realtime-run.mjs --minutes 30`, festes
Timeout 2400 s. Der Lauf wurde **einmal** gestartet (2026-11-27T15:14:14Z). Der Harness
wurde vorher einmal robust gemacht (`--disable-dev-shm-usage`, weil `/dev/shm` auf diesem
Host nur **64 MB** hat und die früheren Versuche nach ~7 min mit „Target closed" starben).

- Verlauf: Minuten-Shots bis **Minute 20** geschrieben (`shots/realtime-minute-5/10/15/20.png`,
  15:19–15:34Z), danach stirbt der Renderer erneut: `page.waitForTimeout: Target page,
  context or browser has been closed` (15:35:03Z, `RT_RC=1`).
- **Kein** vollständiges `realtime-30min.json`, kein Heap-Delta Minute 1→29, kein
  Boss-/Sieg-Protokoll für den vollen Lauf. Log: `/tmp/lf-fa2/fa2-04-final.log`.
- Ein zweiter 30-min-Lauf ohne weitere Code-Änderung ist laut Briefing nicht erlaubt.

**Urteil fa2-04: BLOCKED.** Ursache ist ein Renderer-Abbruch im letzten Drittel des
Echtzeitlaufs auf diesem Host (Speicher-/Shm-Druck bei hoher Last, loadavg >10 während
des Laufs), nicht ein Spielfehler. Die inhaltlichen Boss-/Truhen-/Sieg-Belege liegen
bereits aus dem 30×-fullrun vor (fa2-03). Für die Heap-Abnahme bleibt der Echtzeitlauf
offen, bis ein stabiler Host/Lauf vorliegt.

## fa2-05 — Touch/Gamepad (verify-input) + Optik-Urteil

### Eingabe: `node scripts/verify-input.mjs` (2026-11-27T13:43:05–13:44:54Z)

**28/28 Checks PASS**, 0 JS-Fehler (`INPUT_RC=0`). Abgedeckt: Touch (Menüs bis in den
Run, Joystick bewegt Spieler 2048→2135, Pause per zweitem Finger, Level-up/Truhe per
Tipp, 1 Minute Spiel ohne Tastatur), Gamepad (Hotplug, D-Pad+A wählt Kael, Stick,
Disconnect/Reconnect, Pause/Optionen-Fokus, Level-up/Truhe/Results), Tastatur (Bewegung,
ESC pausiert/fortsetzt, Listener-Zählung 1), alle Shots >10 KB.
Log: `shots/qa-reaccept-input-log.txt`, Shots `shots/m8-input-*.png` (13:43–13:44Z).

**Urteil Eingabe: PASS.**

### Optik: art-director-Urteil zu den aktuellen 640×360-Shots (2026-11-27T15:5xZ)

Unabhängiges Urteil des art-director (Kontrolleur, keine Code-Änderung), alle 4 Shots
4× nearest vergrößert geprüft. **GESAMT: FAIL (3,25/5)** — konkrete Mängel:

| Shot | Note | Befunde |
|---|---|---|
| `shots/perf-500.png` | 4 (ok) | Spieler-Silhouette lesbar (1-px-Ink-Kontur, Laterne mit Glow-Kern), Gegner/Pickups farblich eindeutig, Burst-FX ohne Einzelpixel-Rauschen |
| `shots/perf-minute25.png` | 3 (nachbessern) | Boss-Roben (rot) verschmelzen mit orangen Explosions-FX und Schadenszahlen; Announce-Panel halbtransparent, Münz-Pickup liegt auf „BOSS ERWACHT" |
| `shots/m3-fullrun-minute25.png` | 4 (ok) | Announce-Panel solide, Boss-Gruppe trotz Feuer-/Laser-FX lesbar, HUD-Icons distinct |
| `shots/m3-fullrun-results.png` | 2 (muss neu) | **Textüberlappung**: „SIEG…"/„SCHADEN PRO WAFFE"/„GESAMT: 3.7M" überlagern sich auf gebrochener Grundlinie; Wortumbruch „SEELENLEU/CHTFEUER" ohne Trennstrich; Tabelle zeigt 6 statt 12 Zeilen, untere Panelhälfte leer |

Folgekarten (nicht Teil dieser Re-Abnahme-Messung, bitte backlog):
Ergebnis-Screen-Layout (Überlappung/Umbruch/12 Zeilen) und Boss-FX-Kontrast
(rote Gegner vs. orange FX, opakes Announce-Panel).

**Urteil Optik: FAIL (3,25/5) — Mängel dokumentiert, Folgekarten nötig.**

**Urteil fa2-05 gesamt: Eingabe PASS, Optik FAIL (ehrlich dokumentiert).**

## fa2-06 — Endurteil der Nachabnahme

Stand: 2026-11-27T16:00Z, `main` @ `38c21c4`. Alle Messungen dieses Dokuments
(13:15–15:35Z) liefen auf dem Performance-Fix-Stand von `main` @ `78cca7e`
(+ WIP-Checkpoint), headless Chromium, lange Läufe unter `flock`.

| Abnahme-Zeile | Ergebnis | Urteil |
|---|---|---|
| fa2-01 Build/Tests/Inhalte/verify:final | build rc=0, 355 Tests 0 fail, 30/6/6/6/6/2, 7/7 | **PASS** |
| fa2-02 Perf Burst + Minute 25 | 640: Burst 59,9–60,1, M25 50,9–55,4 → grün; 780: Burst 54,7–56,4 grenzwertig, M25 41,3–46,4 | **FAIL** (780 M25 <50, reproduzierbar in 4 Läufen) |
| fa2-03 fullrun 30× | 6/6 Bosse + 6 Truhen + Sieg dawn + 0 JS-Fehler je View; fpsMin 35,7/34,8; Heap +8,7 %/+15,2 % | Inhalt **PASS**, FPS **FAIL**, Heap 1× PASS / 1× knapp FAIL |
| fa2-04 Echtzeitlauf 30 min | Renderer-Abbruch nach Minute 20 („Target closed"), kein volles JSON | **BLOCKED** (Host-Laufstabilität, nicht Spiel) |
| fa2-05 Touch/Gamepad + Optik | verify-input **28/28 PASS**, 0 JS-Fehler; art-director **FAIL 3,25/5** (Results-Overlap, Boss-FX-Kontrast) | Eingabe **PASS**, Optik **FAIL** |

**Ergebnis der Nachabnahme 2026-11-27 (Versuch 3): NICHT ABGENOMMEN.**

Der Performance-Fix hat den **640×360-Pfad** repariert (Burst 46,3 → 60,1 FPS,
Minute-25 ≥50,9): dieser Blocker aus der Endabnahme ist **gelöst**. Verbleibende
Blocker, alle mit Beleg in diesem Dokument:

1. **Minute 25 bei 780×360 dpr3**: 41,3–46,4 FPS gegen Ziel ≥50 (4 Messläufe).
2. **fullrun-fpsMin Endgame-Fenster** (beide Views): 35,7 / 34,8 gegen Ziel 55.
3. **Optik**: Ergebnis-Screen-Layout (Textüberlappung, Wortumbruch, 6 statt 12
   Tabellenzeilen) und Boss-FX-Kontrast (rot auf orange) — art-director FAIL 3,25/5.
4. **Echtzeitlauf/Heap-Nachweis**: blocked durch Host-Laufstabilität (Renderer-Abbruch
   nach Minute 20 trotz `--disable-dev-shm-usage`).

Offene Folgekarten: Results-Screen-Layout, Boss-FX-Kontrast (aus fa2-05),
780-Endgame-FPS (Lanes `m10-endgame-fps`/`m10-perf-recovery`/`m10-fx-overdraw-cap`
nicht in main), stabiler Echtzeitlauf.
