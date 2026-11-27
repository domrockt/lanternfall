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

## K2 Fix (geplant, wird nach Umsetzung mit Messwerten gefüllt)

- `src/systems/BossSystem.ts`: Banner-Rect an die Kette koppeln
  (`banner.y = hpBar.y + hpBar.h + BOSS_HUD_CLEARANCE`) — Rect-Kette statt freie Mitte.
- `src/scenes/UI.ts`: Banner-Objekte aus `bossHudRects(GAME_WIDTH).banner`
  positionieren; Fade-In kürzen.

## K3 / K4

Tests `tests/boss-banner-layout.test.ts` und Nachher-Messung (`after`-Modus,
art-director-Sichtprüfung) folgen mit den jeweiligen Karten.
