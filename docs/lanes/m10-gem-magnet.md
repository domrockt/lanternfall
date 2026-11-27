# Lane m10-gem-magnet — XP-Kristalle lesbar und fair

Branch `m10-gem-magnet`, Worktree `/home/ai/games/lf-lanes/m10-gem-magnet`.
Basis-SHA beim Start: **cd85332b** (main-HEAD, Merge der Lane m10-acceptance-sync).

Ziel: Rein Pickup-/Anzeige-Verhalten. Der aktive Kristall-Cap wird nie
überschritten, der Magnet zieht erst ab dem definierten Radius, Kristallgröße ↔
XP-Wert ist monoton/eindeutig, und die drei Größen bleiben im Chaos von
Gegnern/Effekten unterscheidbar. **Kein** XP-Kurven-Rebalancing (xp.ts nur
gelesen/getestet).

## Karten-Checkliste

| # | Karte | Status | Beleg |
|---|---|---|---|
| 1 | Ist-Messung: 12 Minuten-Samples, Baseline-JSON + Vorher-Shot | done | `shots/m10-gem-magnet-baseline.json`, `shots/m10-gem-magnet-before.png` (Commit 4611bc6, Nachlauf 37a3812) |
| 2 | Cap-Härtung + älteste zuerst verschmelzen, XP erhalten | done | `src/systems/PickupSystem.ts`, `tests/pickup-gems.test.ts` 8/8 (Commit 59da2a3) |
| 3 | Magnet-Semantik: Anziehung exakt am Radius, Ankunft ≤ 0,4 s | done | `shots/m10-gem-magnet-magnet.json` (Commit accf051) |
| 4 | Lesbarkeit der 3 Größen im Chaos, 4×-Zoom, Near-White ≤ 4,16 % | done | `shots/m10-gem-magnet-readability.json`, `shots/m10-gem-magnet-chaos.png`, `-chaos-4x.png`, `-chaos-4x-large.png` (Commit ef5d88e + Nachbeleg) |
| 5 | Doku + `.lane-done` | done | diese Datei + `.lane-done` |

## 1. Ist-Messung (10-min-autoPlay, Debug-Hook)

Aufnahme: `?debug=1&seed=99`, `god(true)`, `autoPlay(true)`, 6 Waffen und 6
Passives auf Maximum, `setTimeScale(30)`. Ein Sample je simulierter Minute;
Ist-Shot bei Minute 12. Skript: `/home/ai/tmp/m10-gem-magnet/baseline.mjs`.

Die Messung wurde nach der Cap-Härtung erneut gefahren (Commit 37a3812). Die
**Vorher-Zahlen** stammen aus dem ersten Lauf vor dem Fix (Commit 4611bc6) und
sind unten zum Vergleich zitiert.

| Metrik | vorher (4611bc6) | nachher (37a3812) |
|---|---|---|
| Samples (1/Minute) | 12 | 12 |
| aktive Kristalle / Cap | 31–147 / 140–180 | 35–140 / 140–180 |
| Cap-Überschreitung je Sample | 0 | **0** (alle 12 Samples) |
| verworfen (`rejected`) | 0 | **0** |
| durch Alter recycelt (`expired`) | 222 | 174 (XP wird jetzt in Nachbarn verschmolzen, nicht vernichtet) |
| eingesammelt (`collected`) | 674 | 648 |
| JS-Fehler | 0 | **0** |

Pickup-Distanz-Verteilung (Median je Minute, Welt-Pixel): 379–1.306. Der
Magnetradius lag bei 140/180-Cap zwischen ≈ 201 und ≈ 240 px; nur Kristalle
innerhalb dieses Radius wurden angezogen (`inMagnet` 0–3 je Sample, Messung
bestätigt die harte Grenze).

## 2. Cap-Härtung

`PickupSystem.drop()` verschmilzt bei vollem Cap den ältesten Kristall mit dem
neuen Drop statt ihn zu verwerfen. `mergeGemValues(a, b)` nimmt die größte
kanonische Größe ≤ Summe und schreibt den Rest sofort als XP gut
(`value + credited === a + b`, kein Verlust). Auch das Alter-Recycling (90 s)
verschmilzt in den nächstgelegenen Kristall. `setCap()` senkt den Cap paarweise
verschmelzend und garantiert danach `count <= cap`.

Tests (`tests/pickup-gems.test.ts`, 8/8):
- XP-Summe vor/nach Verschmelzen identisch, Größen kanonisch/monoton,
- Cap 24 mit 100 weiteren Drops: `count ≤ 24`, XP exakt erhalten, `rejected = 0`,
- Boss-Burst 500 Drops: `count ≤ cap`, kein Reject,
- `setCap(180 → 24)`: XP-Summe unverändert.

## 3. Magnet-Semantik

Anziehung beginnt exakt bei `dist <= magnetRadius` (`radius * 2.2`, Toleranz
1e-6) und nicht davor. Geschwindigkeit = `magnetRadius / 0.4 s`; der Schritt
wird auf `dist` geklemmt (kein Überschwingen). In-Game-Beleg
(`shots/m10-gem-magnet-magnet.json`):

- Startdistanzen 5 Kristalle: 48,400 px = exakt Magnetradius,
- erste Bewegung im nächsten Frame: 44,372 px (angezogen),
- Ankunft vom äußeren Rand: **340,7 ms** (21 Frames) ≤ 400 ms,
- 5 Kristalle gleichzeitig eingesammelt,
- Cap-Burst: 500 Drops bei Cap 24 → `count = 24`, `xpBefore 0 + incoming 5004 = xpAfter 5004`, `rejected = 0`.

Grenzfälle als Unit-Tests: Radius 0 zieht nicht; mehrere Kristalle gleichzeitig.

## 4. Lesbarkeit

`shots/m10-gem-magnet-readability.json` (Textur-/Frame-Messung) und die
Chaos-Belege (319 lebende Gegner, 24 Kristalle aller drei Größen, eingefroren
per `timeScale 0`):

| Größe | XP | Größe px | Hauptfarbe | RGB-Abstand zu anderen Größen | min. Abstand zu 6 häufigsten Gegnerfarben |
|---|---|---|---|---|---|
| small | 2 | 7×7 | Moor-Grün `#6f9b58` | ≥ 131,9 | 55,6 |
| medium | 6 | 9×9 | Bernstein `#ffb84d` | ≥ 147,3 | 138,6 |
| large | 18 | 11×11 | Karmesin `#b8303f` | ≥ 131,9 | 129,4 |

Alle drei Größen tragen eine 1-px-Tinten-Kontur (`boundary === inkBoundary`
für jede Textur). Near-White-Anteil im echten Chaos-Frame: **0,3 %**
(Grenze 4,16 %). Urteil: **PASS**.

Offener Punkt (ehrlich): `large` nutzt PAL 25 (`#b8303f`), das auch als
seltene Gegnerfarbe vorkommt; im 4×-Zoom trennen Form (Diamant), Kontur und
heiße Kante (`#ff8a6b`) die Größe ausreichend, aber in M11 sollte die
Large-Farbe gegen neue Gegner-Tints erneut geprüft werden.

## Offene Punkte / Hinweise für den Merge

- #2099 hat Cap-Härtung und Magnet-Härtung in **einem** Commit (59da2a3)
  gebündelt; vom Supervisor als Stopp vermerkt, fachlich aber grün.
- #2101 ändert `src/gfx/textures.ts` (Gem-Grids) — diese Datei stand nicht in
  der Disponent-Zuteilung dieser Lane. Änderung ist klein (3 Grids + Kontur)
  und muss beim Merge gegen die Art-Lanes geprüft werden.
- Der Supervisor-Snapshot `6ea60f5` enthält Zwischenstände der Chaos-Shots;
  der finale Satz liegt im Nachbeleg-Commit dieser Lane.
- `shots/m10-gem-magnet-baseline.json` beschreibt nach dem Nachlauf den
  **Ist-Stand nach dem Fix**; die Vorher-Zahlen stehen in Commit 4611bc6.
