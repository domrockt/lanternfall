# Lane m10-perf-cap-rollback — Perf-Deckel gegen SwiftShader-Zahlen zurückbauen (2026-11-27)

Karten-Zuordnung: **A = #5778** (View-Width-Cap), **B = #5779** (ADD-Glow-Flächen-Deckel),
**C = #5780** (DPR-Budget-Regler-Verifikation; Belege in den Commits zu A/B).

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

- **780x360@3 mit Cap (Vorher):** `shots/m10-perf-cap-rollback-m25-cap-on-{1..3}.png` — uniformes
  Hintergrundband (Helligkeit 8,3) von **210 device-px je Seite** (Spalten 0–209 und 2131–2339), Canvas
  nur 640 statt 780 Spielpixel breit. Das war der Optik-Verlust des Deckels.
- **780x360@3 nach Rollback:** `shots/m10-perf-cap-rollback-m25-after-rollback.png` (2340x1080 device px):
  Spaltenprofil durchgehend Canvas-Inhalt (9,4–53, variierend, kein uniformes Band) — **0 px Balken**.
  identisch `m25-cap-off-{1..3}.png`.
- `shots/m10-perf-cap-rollback-m{20,30}-960x540.{png,json}` (Minute-20/-30-Nachstellung, 960x540@1):
  dort bleiben dunkle Ränder von je 120 CSS-px (uniformes 8,3-Band, Spalten 0–119/840–959) — **aber das
  ist der M8-Fit-Fallback, nicht der Cap**: bei 960x540@1 ist n = floor(min(540/360, 960/480)) = 1 < 2 →
  `fitView()` kehrt zurück, BEVOR die (entfernte) Klemm-Logik greift. intern 480x360, CSS 720x540.
  Verhalten vor/nach dem Rollback identisch (Klemm-Pfad war bei n=1 nie erreichbar) — gleiche Balken
  wie im Fullrun der Ursprungs-Lane (`docs/lanes/m10-view-width-cap.md` Abs. 2c). Ein evtl. gewünschter
  Fit-Fallback ohne Balken wäre eine eigene M8-Karte (nicht Teil dieses Briefings).
- Abnahme-Kriterium nach Regeltext geprüft: **Cap entfernt, M25 bleibt >= 55 FPS (60,0–60,1)** ✓.

## Teil B — ADD-Glow-Flächen-Deckel entschärft (Alpha-Floor bleibt)

**Geändert in `src/systems/FxSystem.ts`:** Der dpr-basierte Aktivierungsschalter
(`ADD_GLOW_DPR_THRESHOLD` 1,5 + `glowAreaCapForDpr`) ist ersetzt durch
`glowAreaCapForRenderScale(renderScale)` — der Flächen-Deckel (96x96 dev-px) greift **nur noch, wenn
der adaptive DPR-Budget-Regler tatsächlich gesenkt hat** (`RENDER_SCALE > 1`, Live-Binding aus
`config.ts`, nur gelesen). Auf iGPU bleibt `RENDER_SCALE = 1` → kein Deckel, große Feuer-/Aura-Glows
laufen wieder volllaufend. Android-Sicherheitsnetz bleibt bestehen: sobald der Regler unter Last senkt,
kappt der Deckel die Flächen wieder.

- **Alpha-Floor `ADD_GLOW_ALPHA_FLOOR = 0,04` bleibt unverändert** (von Dom behalten), ebenso die
  dpr-Alpha-Treppe (`fxAlphaForDpr`) und der geteilte Glow-Budget-Deckel (LOD-Caps 72/40/24).
- `clampGlowScreenArea` (reine Funktion) unverändert; Tests `tests/fx-add-cap.test.ts` auf die neue
  Schaltstelle umgeschrieben (Deckel nur bei `setRenderScale(2)` + dpr 3; bei RENDER_SCALE 1 volllaufend
  auch bei dpr 3) — 45/45 mit fx-overdraw-Regression, Gesamtstand 683/683, `tsc` rc=0, Build rc=0.

### Overdraw vorher/nachher (scripts/m10-fx-add-cap.mjs, 500er-Chaos-Frame, 780x360@3, iGPU)

| Messgröße | Vorher (Deckel aktiv) | Nachher (Deckel via Regler aus) | Delta |
|---|---|---|---|
| fx-Pool ADD-Overdraw | 17.025 dev-px | **128.592 dev-px** | +111.567 (**Optik zurück**: ~7,5x mehr Glow-Fläche) |
| max. ADD-Sprite (fx) | 93 dev-px | **416 dev-px** | Deckel 96 → aufgehoben |
| Glow-Budget (Anzahl) | 40/40 | 35/40 (Cap 40 unverändert) | Anzahl-Deckel wirkt weiter |
| renderScale | 1 | 1 | Teil C: Regler bleibt bei 1 |

JSONs: `shots/m10-perf-cap-rollback-fx-before.json` / `-fx-after.json` / `-fx-after-960.json`
(jeweils mit `gpu.renderer` = Mesa Intel RPL-S).

### Sichtbeleg

`shots/m10-perf-cap-rollback-glows-960x540.png` (Minute ~25, 960x540@1, Overlay-frei nach Truhen-/Level-up-Close):
Phönix-Blüte, Ring-Aura und Sonnen-Glow laufen volllaufend über die Terrainfläche — keine 96er-Kante mehr.
Skript hierfür: `--viewport 960x540 --dpr 1 --shot`; neu geschlossen werden Level-up- **und** Truhen-Panels
(`clearChests`, Taste A), damit der Beleg die Szene zeigt.

## Teil C — DPR-Budget-Regler: unverändert

Teil C nicht angefasst (`e85f890`, `src/logic/scale.ts` + `src/config.ts` bleiben, Android-Sicherheitsnetz).
Beleg iGPU (Zahl): `renderScale` in allen Mess-JSONs = **1** —
`shots/m10-perf-cap-rollback-m25-after-rollback.json`, `...-m25-cap-off-{1..3}.json`,
`...-fx-after.json`, `...-fx-after-960.json` je Feld `renderScale: 1`. Auf iGPU bleibt RENDER_SCALE = 1
(Regler senkt nur unter 45 FPS über 2 s; alle Läufe vsync-60 → Hebeschwelle 57 hält Stufe 1).
Damit ist der Teil-B-Deckel auf iGPU definitionsgemäß inaktiv (RENDER_SCALE > 1 nötig) und der
Android-Pfad (Regler senkt → Deckel greift) ist in `tests/fx-add-cap.test.ts` (setRenderScale(2)) gedeckt.
