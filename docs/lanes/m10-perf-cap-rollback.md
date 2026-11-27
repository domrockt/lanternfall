# Lane m10-perf-cap-rollback — Perf-Deckel gegen SwiftShader-Zahlen zurückbauen (2026-11-27)

Dom-Wunsch 21:15Z (Punkte 1–3): Die gegen SwiftShader-Messzahlen geplanten Perf-Deckel kosten jetzt
Optik/Spielgefühl ohne Nutzen — die iGPU (Mesa Intel RPL-S) rendert seit 19:20Z. Diese Lane baut Teil A
(View-Width-Cap, Merge `8834c19`) bedingt zurück und entschärft Teil B (ADD-Glow-Flächen-Deckel,
Merge `0ef46d6`). Teil C (DPR-Budget-Regler `e85f890`, Canvas-Budget) bleibt unverändert.

**Messgrundlage / Renderer-Beleg:** Jede JSON trägt jetzt `gpu.renderer` (Skripte `scripts/m10-view-width.mjs`,
`scripts/m10-fx-add-cap.mjs`, Feld `gpu` + `renderScale`). Alle unten genannten Läufe:
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` — **kein SwiftShader**, Belege gültig.
SwiftShader-Belege aus den Ursprungs-Lanes sind damit bewusst nicht herangezogen worden.

## Teil A — View-Width-Cap: ENTFERNT (Entscheidungsregel erfüllt)

**Regel:** M25 (780x360@3, 300 Gegner) ohne Cap Median >= 55 FPS → Cap entfernen.

### Vorher/Nachher (scripts/m10-view-width.mjs --minute 25 --enemies 300, 10 s je Lauf, unter flock)

| Stand | Lauf 1 | Lauf 2 | Lauf 3 | Median | intern | JSON |
|---|---|---|---|---|---|---|
| Mit Cap (Ist-Stand) | 60,1 | 60,0 | 60,1 | 60,0 | 640x360 (Klemme aktiv in 3/3) | `shots/m10-perf-cap-rollback-m25-cap-on-{1..3}.json` |
| Ohne Cap (`viewcap=off`) | 60,0 | 60,0 | 59,9 | **60,0** | 780x360 | `shots/m10-perf-cap-rollback-m25-cap-off-{1..3}.json` |
| Nach Rollback (Codepfad entfernt) | 60,1 | — | — | 60,1 | 780x360 | `shots/m10-perf-cap-rollback-m25-after-rollback.json` (+`.png`) |

Alle Läufe: minEnemies 300, 0 JS-Fehler, `renderScale: 1`. **Median ohne Cap 60,0 >= 55 → Cap entfernt.**
Der Cap brachte auf iGPU 0,0 FPS (beide Varianten vsync-60), kostete aber Optik: bei 780/1080-Views
(n>=2) schwarze Balken links/rechts (Canvas 640 statt 780/860 breit).

### Rückbau

- `src/logic/view.ts`: `CROWD_WIDTH`/`CROWD_ENEMY_THRESHOLD`/`CROWD_RELEASE_THRESHOLD`,
  `shouldCapForCrowd()` und der `crowd`-Parameter entfernt; `computeView` klemmt wieder nur auf
  `MAX_WIDTH` (860). M8-Verhalten wiederhergestellt.
- `src/main.ts`: Crowd-Poll (setInterval 500 ms, `getQuickStats().enemies`, `?viewcap=off`) entfernt.
- `tests/view-width.test.ts`: Crowd-Tests ersetzt durch Regression des M8-Verhaltens ohne Cap
  (780 bleibt 780, 1080 → 860 nur via MAX_WIDTH, Override maxFitN-Klemme) — 4/4 grün.
- `scripts/m10-view-width.mjs`: `--cap`/`viewcap` entfallen (Deckel existiert nicht mehr); neu:
  `--minute N` (M25/Min-20/Min-30-Nachstellung via skipTo), `gpu.renderer`, `renderScale` im JSON.

### Sichtprüfung (Abnahme-Kriterium "keine schwarzen Balken bei 960x540")

- `shots/m10-perf-cap-rollback-m25-after-rollback.png` (780x360@3 → 2340x1080 device px):
  **0 px Balken** links/rechts (Spaltenmessung, erste helle Spalte x=0, letzte x=2339).
  Vor dem Rollback waren hier 2x70 device-px Rand (Canvas 640 statt 780 breit, siehe
  `docs/lanes/m10-view-width-cap.md` Abs. 3: Balken exakt (780−640)/2).
- `shots/m10-perf-cap-rollback-m{20,30}-960x540.{png,json}` (Minute-20/-30-Nachstellung, 960x540@1):
  dort bleiben dunkle Ränder von je ~120 CSS-px — **aber das ist der M8-Fit-Fallback, nicht der Cap**:
  bei 960x540@1 ist n = floor(min(540/360, 960/480)) = 1 < 2 → `fitView()` kehrt zurück, BEVOR die
  (entfernte) Klemm-Logik greift. intern 480x360, CSS 720x540, Ränder-Helligkeit 8,3 (Seitenhintergrund).
  Verhalten vor/nach dem Rollback identisch (Klemm-Pfad war bei n=1 nie erreichbar) — gleiche Balken
  wie im Fullrun der Ursprungs-Lane (`docs/lanes/m10-view-width-cap.md` Abs. 2c). Der Rollback macht
  960x540 weder besser noch schlechter; ein evtl. gewünschter Fit-Fallback ohne Balken wäre eine eigene
  M8-Karte (nicht Teil dieses Briefings).
- Abnahme-Kriterium nach Regeltext geprüft: **Cap entfernt, M25 bleibt >= 55 FPS (60,0–60,1)** ✓.

## Teil B — ADD-Glow-Flächen-Deckel entschärft (Alpha-Floor bleibt)

(siehe Abschnitt unten — wird mit Karte B ergänzt)

## Teil C — DPR-Budget-Regler: unverändert

Teil C nicht angefasst (`e85f890`, `src/logic/scale.ts` + `src/config.ts` bleiben, Android-Sicherheitsnetz).
Beleg iGPU: `renderScale`-Feld in allen Mess-JSONs = **1** (Regler bleibt auf iGPU bei Teiler 1,
RENDER_SCALE = 1 — kein Schrumpfen ohne Beleg, erwartet: vsync-60 >= 57-FPS-Hebeschwelle).
