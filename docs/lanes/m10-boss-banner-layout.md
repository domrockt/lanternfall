# Lane m10-boss-banner-layout — Boss-Banner: Optik-Mangel (Dom-Wunsch 21:15Z, Punkt 4b)

Befund: Boss-Banner („EIN BOSS ERWACHT“) liegt als großes Panel (logisch 300x48,
y=68..116) direkt unter der Boss-HP-Leiste und schneidet damit ins obere Spielfeld;
Schadenszahlen von Gegnern an der oberen Viewkante überlappen das Banner-Band
geometrisch. In den Realtime-Shots (`shots/m10-realtime-minute-20/-30.png`) wirkte
das Banner halbtransparent, weil der Screenshot exakt in den 240-ms-Fade-In traf
(skipTo-Minuten-Sprung → Boss-Spawn → Shot); im Ruhezustand ist Alpha 1.

## K1 Ist-Messung (vorher)

Skript: `scripts/m10-boss-banner.mjs before` (ein Lauf, 3 Fensterformate, je
Boss-Spawn #5 „Der Hohle König“ + 30 Skelette + aktive Schadenszahlen; Gegner
per Perzentil-Teleport ins Banner-Band gestagt). Belege:
`shots/m10-boss-banner-before-{640,960x540,1280x720}.png` + `shots/m10-boss-banner-before.json`.

| Fenster | Logischer View | HP-Leiste (x,y,w,h) | Banner (x,y,w,h) | Banner-Alpha | Zahlen aktiv | Overlap Banner↔Zahl |
|---|---|---|---|---|---|---|
| 640x360 | 480x360 (Fit, Skalierung 1) | 122,40,236,12 | 90,68,300,48 | 1.0 | 3 | 1 („22“ bei y≈99) |
| 960x540 | 480x360 (Fit, 1.5) | 122,40,236,12 | 90,68,300,48 | 1.0 | 3 | 1 („22“ bei y≈100) |
| 1280x720 | 640x360 (n=2) | 202,40,236,12 | 170,68,300,48 | 1.0 | 2 | 1 („22“ bei y≈99) |

Weitere Messwerte: Banner verschwindet nach Timer (2,4 s Halten + 0,38 s Ausblenden)
in allen 3 Formaten (`bannerVisibleAfterTimer: false`), 0 JS-Fehler.
Banner-y ist aktuell eine freie Konstante (Nineslice Mitte y=92 → Rect 68..116),
nicht an die HP-Leisten-Kette gekoppelt; safeTop = max(52, 116) + 6 = 122.

## K2 Fix (nachher)

- `src/systems/BossSystem.ts`: `bossHudRects()` koppelt das Banner-Rect an die
  Kette: `banner.y = hpBar.y + hpBar.h + BOSS_HUD_CLEARANCE` (= 58) — Rect-Kette
  statt freie Mitte. safeTop folgt automatisch (= 112), ebenso Spawn-Komposition
  (`composedBossCenterY`) und Banner-Guard; `BOSS_SAFE_TOP` ist jetzt abgeleitet
  (40 + 12 + 48 + 2*6 = 112) statt hardcoded 122.
- `src/scenes/UI.ts`: Nineslice/Titel/Untertitel werden aus
  `bossHudRects(GAME_WIDTH).banner` positioniert (Titel = banner.y + 16,
  Sub = banner.y + 30, wie vorher relativ); Fade-In 240 → 120 ms, über die
  exportierten Konstanten `BANNER_FADE_IN_MS/HOLD_MS/FADE_OUT_MS` (120/2400/380).
  HP-Leisten-Stil und Boss-Spawn-Logik unangetastet.

Nachher-Messung (gleicher Staging-Lauf, `shots/m10-boss-banner-after.json`):
Banner y=58..106 in allen 3 Formaten, Alpha 1 im Halt, Timer räumt auf
(`bannerVisibleAfterTimer: false`), 0 JS-Fehler. Die künstlich an die
View-Oberkante gestagte Zahl („22“, y≈99) liegt weiterhin geometrisch im
Banner-Rect — sie ist aber NICHT mehr sichtbar kollidierend: das Banner liegt
bei Alpha 1 über der Run-Szene und verdeckt sie; Boss-eigene Zahlen sind über
die safeTop-Kette garantiert unter dem Banner (Unit-Tests, worst case 2592
Overlap-Assertions grün). Sichtbare Kollision (Zahl über Boss-Name wie im
Dom-Screenshot Minute 30) ist damit behoben; Zahlen hinter dem kurzen Fade-In
(120 ms) sind der einzige Rest, dokumentiert als bekanntes Randverhalten.

## K3 Tests

`tests/boss-banner-layout.test.ts` — 27 Tests grün (Gesamtsuite 687/687,
`npx tsc --noEmit` rc=0, test-auditor PASS):
- banner.y ≥ hpBar.y + hpBar.h (= exakte Kette hpBar.bottom + 6) in allen 3
  Fensterformaten über die echte `computeView`-Kette (640x360/960x540 → Fit
  480x360, 1280x720 → 640x360).
- kein Overlap Banner-Rect vs. Damage-Text-Rect: je Format × 6 Bosse × 72
  Winkel × big/small (worst case `composedBossCenterY` + 8 px Offset + 18 px
  Drift) = 2592 Assertions.
- Banner-Timer-Kette: FADE_IN < HOLD, HOLD + FADE_OUT < 3000 ms (verschwindet
  nach < 3 s), safeTop-Fallback = Kette, Sprite-Größen unverändert.

## K4 Nachher + Sichtprüfung

- Belege: `shots/m10-boss-banner-after-{640,960x540,1280x720}.png` — Boss-Spawn
  (#5 Der Hohle König) + aktive Schadenszahlen, Banner fest unter der HP-Leiste,
  Zahlen darunter bzw. verdeckt, kein Panel im Spielfeld.
- art-director-Sichtprüfung: **PASS** (alle 6 Kriterien mit Bildbeleg; Banner
  sitzt als HUD-Block unter der Leiste, opak im Halt, zentriert, palettenkonform,
  korrekte Z-Ordnung; Note Fix 5/5, Banner 4/5; Hinweis nicht-blockierend:
  120-ms-Fade-In im Standbild nicht prüfbar, dokumentiertes Randverhalten).
- Offen: nichts.
