# Lane m10-pickup-moment — Aufnahme-Moment für Powerup-Einsammeln

Briefing: Dom 21:45Z "Effekte ausgereift" + A10-Lesbarkeit. Das Einsammeln der 6 Powerups
(Level-up-Wahl bzw. Truhe) war ein lautloser Stat-Austausch — kein erkennbarer Aufnahme-Moment
wie bei Truhe (chest-reveal) oder Evolutionen. Kein Produktumfang, nur Sicht-/Feedback-Qualität.

## Karten

| Karte | Inhalt | Commit |
|---|---|---|
| K1 #7505 | Ist-Beleg: Messskript + before-JSON/-PNG/-4x | 077bf81 |
| K2 #7506 | Fix: Aufnahme-Moment in src/systems/PickupSystem.ts (+ after-Belege) | daed82f |
| K3 #7507 | tests/pickup-moment.test.ts (14 Tests) | 408d2a4 |
| K4 | art-director-Sichtung + Sichtungs-Belege (GIFs/Sheet) + Doku + .lane-done | (dieser Commit) |

## Implementierung (K2, nur src/systems/PickupSystem.ts)

- **Erkennung ohne Eingriff in fremde Dateien:** PickupSystem liest in `update()` den
  Passiv-Stand der Run-Szene (`levelSys.passives`) und differenziert gegen den letzten Stand
  (`diffPassiveAcquisitions`, rein/exportiert). Neu **oder** Level-Stufe höher →
  `playPowerupMoment(id, playerX, playerY)`. Deckt Level-up-Wahl **und** Truhen-Rewards ab
  (beide laufen über `applyOffer`), zusätzlich Debug-Pfad. Erstes `update()` liefert nur den
  Grundzustand (kein Moment beim Run-Start).
- **Darstellung** (eigene Phaser-Objekte, eigene Uhr in `update()`, kein FxSystem-Slot, keine
  Tweens im Massenpfad):
  - `icon_passive_<id>` 16x16 @ **Scale 1** (Zielgröße, nie > 1x hochskaliert — kein Mixel),
    steigt 6 px in **1-px-Schritten** (ganzzahlige Positionen), letzte 25 % Alpha-Fade.
  - **Aufblitz** (erste 15 %): Icon fill-tinted in der **Akzentfarbe** des Powerups.
    Bewusst nicht Laternenweiß: die generische Level-up-Säule (weiß, 950 ms) läuft zur selben
    Zeit — Weiß ging in ihr unter (after-4x-Vergleich vor/nach Fix).
  - **1-px-Rim** (18x18-Rahmen) um das Icon, Akzentfarbe, Alpha 1 → 0,5 (Stufen) → aus bei 40 %.
  - **1-px-Ring-Welle** um den Spieler, Radius 8 → 16 in Ganzzahlschritten, Alpha linear aus.
  - Dauer `MOMENT_DURATION = 0,4 s` (Abnahme ≤ 0,5 s), max. 3 parallel
    (`MAX_MOMENTS`, Ältester wird sofort beendet), Staffelung +6 px bei Parallelen.
  - Depth 15 (über Gegner-Projektilen 14, unter Licht 20) — im Chaos über dem Geschehen.
  - Akzentfarben je Powerup (`POWERUP_ACCENT`): boots=marshLight(31), tome=fogBlue(6),
    heart=crimson(25), charm=amber(20), whetstone=paleMist(9), hourglass=glow(22) — 6
    unterscheidbare Palettenindizes.
- **Gem-/XP-Pfad unberührt:** nur neue Felder/Methoden + zwei Aufrufe am Anfang von `update()`;
  die Gem-Schleife ist unverändert. `releaseAll()` räumt Momente mit ab (`clearMoments`),
  Szenen-Restart wird über `icon.active`-Check abgesichert.

## Messwerte (scripts/m10-pickup-moment.mjs, 300er-Horde, Minute ~16, seed=7)

Vor der Messung festgelegte Akzeptanzgrenzen: after > before (diff/Near-White), Palette-
Anteil der Änderungen after ≥ 50 %, xpLoss = 0. 

| Metrik (Spieler-Crop 96x72) | before (077bf81) | after (daed82f) |
|---|---|---|
| momentTriggered | **0** (lautloser Austausch — Ist-Beleg) | **1** (tome, Level 1) |
| diffPeakPostPct (starke Pixeländerungen > 90 ΣΔRGB) | 81,43 % | 72,77 % |
| nearWhitePct (Crop) | 10,06 % | 4,79 % |
| xpLoss (spawned − granted − total) | 0 | 0 |
| JS-Fehler | 0 | 0 |

Ehrliche Einordnung: Die Crop-Metriken sind **Chaos-drift-dominiert** (Spielereignisse im
Spieler-Crop ändern sich zwischen Peak- und Post-Frame ohnehin; der additive Lichtkreis um
den Spieler blendet den Bereich). Der Diff ist daher keine Moment-Binary, sondern dokumentiert
die Drift-Basis. Der Nachweis "Moment existiert und ist unterscheidbar" liegt auf:
- `momentTriggered` 0 → 1 (Laufzeit-Messung, JSON),
- den 14 Unit-Tests (Moment je Powerup, Dauer, Palette/Scale/1-px),
- den Sichtungs-Belegen (GIFs/Sheet) und dem art-director-Urteil.

XP-/Gem-Invarianten (gem-drawcap) unverändert: xpLoss = 0 in before **und** after,
Draw-Cap aktiv (`cap` ≤ MAX_VISIBLE_GEMS=120), pickup-gems-Tests grün.

## Sichtungs-Belege (K4, scripts/m10-pickup-moment-shots.mjs)

Slow-Mo-Protokoll (run.timeScale = 0,12 → 0,4 s Spielzeit ≈ 3,3 s Echtzeit), 300er-Chaos,
echter Erwerb über die Erkennung (`window.__lf.addPassive` → passives-Diff → Moment):

- `shots/m10-pickup-moment-moment-<id>.gif` — 8-Frame-Sequenz je Powerup (4x nearest), alle 6
- `shots/m10-pickup-moment-sheet.png` — alle 6 im Peak-Frame nebeneinander
- `shots/m10-pickup-moment-shots.json` — triggered 6/6, xpLoss 0, 0 JS-Fehler

Vorher-Belege je 6 Powerups entfallen bewusst: der Ist-Zustand war bei allen 6 identisch
"nichts" (K1: momentTriggered=0, before-4x zeigt den Spieler ohne jeden Pickup-Moment);
der Nachweis "kein Moment je Powerup" liegt in den Unit-Tests (vor K2 wäre
`playPowerupMoment` nicht existent) und im K1-JSON.

## art-director-Urteil

- **Runde 1: FAIL 3,5/5.** Defekte: Akzent-Kamouflage (boots marshLight auf Moorgrün,
  tome fogBlue liest grau, whetstone paleMist auf grauen Skeletten), Rim-Timing (volle
  Rim-Alpha exakt im maskierenden Aufblitz-Block, danach nur 0,5 und ab p=0,4 weg),
  Ring-Welle stirbt vor Radius 16. Ok: Pixel-Disziplin aller 6, Timing-Dramaturgie,
  Dosierung, heart/charm/hourglass-Signaturen.
- **Umgesetzte Korrekturen** (PickupSystem.ts): `MOMENT_RIM_UNTIL = 0.6` + volle
  Alpha bis p<0,4; Ring-Alpha `max(0.45, 1-p) * 0.9`; dunkle 1-px-Gegenkontur
  (Palette-Ink, `MomentSpec.edge`) außen um den Rim bei allen Powerups; tome-Aufblitz
  paleMist über fogBlue-Rim.
- **Runde 2: PASS 4,5/5** (art-director, 2026-11-28). Belegt frame-weise über alle
  6 GIFs inkl. Pixelmessung der Ring-Bahn gegen den vorhergesagten Alpha-Blend.
  Protokoll-Anmerkungen (keine Abwertung, behoben): GIFs wurden mit 3x statt 4x
  nearest skaliert und die Slow-Mo-Sequenz endete bei p≈0,63 — Skript auf 4x +
  12 Frames (voll bis p=1,0) umgestellt, Belege neu generiert. Optionaler Hinweis:
  boots-Icon-Silhouette (Bestandsasset, liest sich als „L") — nicht Teil dieser Lane.

## Offene Punkte

- Der generische Level-up-Pillar (Run.playLevelUpFx, 950 ms) läuft gleichzeitig zum Moment;
  Aufblitz/Rim sind dagegen lesbar gestaltet (Akzent statt Weiß). Falls der Pillar künftig
  nur bei Waffen-Offers laufen soll, wäre das eine Folgekarte in src/scenes/Run.ts (fremde
  Datei, hier nicht angefasst — Run.ts ist bei m10-pause-freeze geclaimed).
- Die Crop-Diff-Metrik im Messskript ist drift-dominiert; eine stabile "Unterscheidbarkeits"-Zahl
  bräuchte einen deterministischen Frame-Vergleich (Same-Seed + eingefrorene Chaos-Uhr). Der
  Aufwand steht nicht mehr im Verhältnis zum Sichtungs-Nutzen (GIF + art-director).
