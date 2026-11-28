# Lane m10-boss-name-legibility — Befund B3: Boss-Name im M25-Chaos unlesbar

Befund B3 (Major) aus `docs/lanes/m10-sightprep-smoke.md`: Der Boss-Name ("GLOCKENTURM-GOLEM")
über der Boss-HP-Leiste ist im M25-Chaos unlesbar — Amber-Glyphen von Gegnerpixeln durchsetzt;
in M6 (dünnerer Horde) klar lesbar. Die HP-Leiste selbst bleibt lesbar.

## K1 — Chaos-Repro, Befundklärung (Layering vs. Kontrast) + Baseline (#10454)

**Repro** (`scripts/m10-boss-name.mjs before`): seed 1, `skipTo(1490)`, god, ember+frost Lv8,
80x `horror` — identisch zur M25-Probe der Sightprep-Lane. Formate 960x540 + 640x360 (iGPU,
`ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`), 0 JS-Fehler, Boss aktiv
(`bossGroup.visible`, Name "GLOCKENTURM-GOLEM").

**Messmethode:** Phaser-WebGL-Snapshot des Frames, Pixelzählung im exakten Textband-Rect
(`bossName.getBounds()` = x270,y33,101x7 logisch): Amber-Glyphen-Pixel (0xffb84d-Familie)
im Chaos vs. Referenz desselben Frames mit ausgeblendeten Gegnern.

**Baseline (`~/games/.evidence/m10-boss-name-legibility/m10-boss-name-before.json`):**

| Format | amberPx Chaos | amberPx Referenz (Gegner aus) | Chaos/Referenz | Band gesamt |
|---|---|---|---|---|
| 960x540 | 253 | 253 | **1.0** | 707 |
| 640x360 | 253 | 253 | **1.0** | 707 |

**Urteil: (b) Kontrast, NICHT (a) Layering.** Im Chaos sind **alle** Glyphen-Pixel intakt
(Deckung 253/253 = 1.0 in beiden Formaten) — der Text liegt korrekt ÜBER den Gegnern
(UI-Szene nach Run, Depth 90); Depth-Hebel in `src/gfx/depth.ts` ist unverändert nötig.
Das Band ist aber zu 43 % mit Horde-Pixeln gefüllt (305/707 `other`): die 1-px-Glyphen
stehen ohne Platte direkt auf den warmroten/weißen Horror-Sprites (Bucket 14,8,6/15,8,7),
dt. Hue-Familie wie das Amber 0xffb84d — Glyphen und Gegnerpixel verschmelzen visuell
(`m10-boss-name-before-960x540-text-zoom6x.png`). Damit deckt sich auch der M6-Befund:
dünnerer Horde → sauberer Hintergrund → lesbar.

**Belege (Vorher):** `~/games/.evidence/m10-boss-name-legibility/m10-boss-name-before-{960x540,640x360}.png`
(Abnahme-Kopien in `shots/abnahme/`), 6x-Zooms `*-text-zoom6x.png` / `*-bar-zoom6x.png`
(Leistenband weiterhin sauber lesbar), Referenz ohne Gegner `*-noenemy.png`.

**Fix-Schnitt (K2):** Textband auf dieselbe dunkle Alpha-Platte wie die Leiste setzen
(ink, Alpha 0,95, direkt über dem Leistenband, gleiche Breite) — Befund (b)-Zweig des
Briefings. Keine Depth-Änderung nötig (Diagnose belegt korrektes Layering).

## K2 — Fix: dunkle Textband-Platte (#10455)

**Änderung (nur area):** `src/scenes/UI.ts` — neue reine Geometrie
`bossNamePlateRect(viewWidth)` (Platte = Leistenbreite, bündig über der Leiste,
28..40, Textband y 33..40 vollständig abgedeckt) + `BOSS_NAME_PLATE_ALPHA = 0.95`;
in `createBossUI` wird die Platte als **erstes Kind** von `bossGroup` (unter
Leiste/Name) erzeugt — dieselbe ink-Farbe und dasselbe Alpha 0,95 wie die
HP-Leiste, HUD liest sich als ein Block. Keine Depth-Änderung (`src/gfx/depth.ts`
unverändert — K1 hat korrektes Layering belegt), keine anderen UI-Umbauten.

**Regressionstest:** `tests/boss-name-legibility.test.ts` (17 Tests, Phaser gemockt,
Muster boss-banner-layout): Platte bündig über der Leiste, gleiche Breite,
Textband-Abdeckung, ganzzahlige Pixel, Alpha = 0,95 — für View-Breiten
480/640/780/960/1280.

**Verifikation:** `npx tsc --noEmit` rc=0; `npx vitest run tests/boss-name-legibility.test.ts`
17/17; `npm test` 1884/1884 grün (2 Folgeläufe; im 1. Lauf 1 flaky Fremd-Test, nicht
reproduzierbar, nicht aus dieser Änderung — Testdatei war in jenem Lauf noch nicht
im Build-Path betroffen); `npm run build` grün.

**Hinweis Mess-Technik:** Ein „before“-Ersatzlauf nach dem Fix ist wertlos (dist enthält
dann den Fix — erst falscher Lauf fabrizierte eine geplattete before-Shot, Beleg im
Log); der committete before-Stand stammt aus einem verifizierten Pre-Fix-Build
(`grep bossNamePlateRect dist` = 0 vor dem Lauf). Vorher/Nachher-Paare jetzt bei
identischen Bedingungen (dieselben Kommandos, 3,5 s Konvergenz, beide t≈24:53).

