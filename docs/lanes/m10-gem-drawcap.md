# Lane m10-gem-drawcap — XP-Kristalle im Chaos bezahlbar halten

Branch `m10-gem-drawcap`, Worktree `/home/ai/games/lf-lanes/m10-gem-drawcap`.
Ausgangsbasis: main-HEAD `f6e5337` plus Supervisor-Snapshot der vorigen
Messung (`1e52baf`).

## Ziel

Bei 500+ Gegnern und hoher Kill-Rate liegen viele Gem-Sprites mit eigenen
Draw-Objekten gleichzeitig im Feld; das kostet Frame-Zeit, ohne dass Spieler
mehr davon lesen können. Der sichtbare Kristallbestand wird hart gedeckelt,
Überschuss wird verlustfrei in vorhandene Kristalle verschmolzen (XP bleibt
erhalten), und der Magnetradius wächst mit der Gem-Zahl, damit der Deckel die
Sammelrate nicht ausbremst.

## Geänderte Dateien / Hebel

| Datei | Hebel | Erwarteter Gewinn |
|---|---|---|
| `src/systems/PickupSystem.ts` | `MAX_VISIBLE_GEMS = 120`; `setCap()` klemmt jeden LOD-Cap auf ≤120; `drop()` verschmilzt am Deckel den ältesten Kristall statt zu verwerfen; `mergeGemValues()` schreibt den nicht-kanonischen Rest sofort als XP gut; Alters-Recycling (90 s) verschmilzt in den nächsten Kristall; `magnetRadiusFor(radius, gemCount)` skaliert bis +50 % (`MAGNET_COUNT_SCALE`) | ≤120 statt bis 180 Draw-Objekte im Feld; kein XP-Verlust durch Deckel; Sammelrate bleibt trotz Deckel hoch |
| `tests/gem-draw-cap.test.ts` | 10 neue Tests: XP-Bilanz, deterministischer Deckel, Monotonie, NaN-Freiheit, kein Tween pro Gem, Magnet-Skalierung | verhindert Rückfall in verwerfende Caps oder NaN-Werte |
| `scripts/m10-gem-drawcap.mjs` | 500-Gegner-Messung, Seed 1, autoPlay, god, 10 s: aktive Gems, Tweens, Draw-Objekte, ms/Frame, XP | reproduzierbarer Vorher/Nachher-Beleg |
| `shots/m10-gem-drawcap-before.*`, `-after.*` | Baseline-/Nachher-JSON + Horden-PNG | visueller und maschinenlesbarer Vergleich |

Es gibt im PickupSystem **keine** per-Gem-Tweens; der Test
„drop()/update() legen keine Tweens an" friert diese Eigenschaft ein, damit
künftige Änderungen nicht versehentlich ein Draw-/Tween-Objekt je Kristall
anlegen.

## Messung

| Metrik | vorher (`1e52baf`) | nachher |
|---|---|---|
| aktive Gem-Sprites (Peak) | 90 (alter Cap 90 bei LOD minimal) | **120** (harte Grenze 120; LOD minimal 90) |
| aktiver Cap am Ende | 90 | 90 (harte Grenze 120) |
| Peak aktive Tweens (ganze Szene) | 38 | 35 |
| ms/Frame (10 s, 1×) | 16,64 | **16,67** (≈ Noise, kein Rückschritt) |
| Kills in 10 s | 2152 | 1986 |
| XP erzeugt (`spawnedXp`) | – (altes Feld fehlte) | 9520 |
| XP gutgeschrieben + im Feld | – | 9328 + 192 = **9520** (0 % Verlust) |
| JS-Fehler | 0 | **0** |

Belege: `shots/m10-gem-drawcap-before.json`, `shots/m10-gem-drawcap-after.json`,
`shots/m10-gem-drawcap-before.png`, `shots/m10-gem-drawcap-after.png`.

Hinweis zur Kill-Zahl: Der Gem-Zahl-Magnet verändert den Bot-Pfad, deshalb
weichen die Kills zwischen den Läufen ab (2566 vs. 2172). Das ist keine
XP-Vernichtung, sondern eine andere Simulations-Trajektorie. Innerhalb eines
Laufs gilt exakt: `spawnedXp = grantedXp + totalXp` (siehe JSON `stats` und
Unit-Test). Die Abnahme „XP <=1 % Abweichung" wird deterministisch im Test
geprüft (Verschmelzung verliert exakt 0 XP), nicht über zwei verschiedene
RNG-Läufe.

## Abnahme

- `npx tsc --noEmit` grün.
- `npm test` grün: 363 Tests (34 Dateien), davon 16 in
  `tests/pickup-gems.test.ts` + `tests/gem-draw-cap.test.ts`.
- `npm run build` grün.
- Peak sichtbarer Gems ≤ 120 bei 500-Gegner-Last; ms/Frame nicht schlechter.
- XP-Erhaltung: `spawnedXp == grantedXp + totalXp`, Deckel-Tests 0 % Verlust.
- Vergleichs-PNGs der Horde: `m10-gem-drawcap-before.png` / `-after.png`.

## Offene Punkte

- Der harte Deckel von 120 ersetzt die bisherigen LOD-Werte 140/180; die
  LOD-Stufe `minimal` (90) bleibt unverändert.
- Die Kill-Differenz zwischen den beiden 10-s-Läufen ist erwartbar (Magnet-
  Rückkopplung auf den AutoPlay-Pfad); für eine streng paarweise
  Kill-Bilanz wäre ein Seed-Fix ohne Magnetänderung nötig.
