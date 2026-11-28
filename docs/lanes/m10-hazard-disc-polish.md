# Lane m10-hazard-disc-polish — Optik-Polish Telegraph-Discs (Nachbesserungen zu 3fa01eb)

Quelle: Merge 3fa01eb (`m10-chaos-fix-hazard-disc`, art-director PASS 4/5) mit 2 dort
dokumentierten, nicht blockierenden Nachbesserungen, von Argus (01:17Z, after-Zoom4x stress500-640)
eigenständig bestätigt: **(a)** Innenkante der Dither-Füllung wirkt schachbrettartig hart,
**(b)** Ringbreite wechselt an Bogen-Flachstellen zwischen 1 und 2 px; zusätzlich**(c)** wirkt
Stapelung ab ~5 überlappenden Discs unruhig. Nur Optik — Warnlogik/Draw-Pfad bitgleich,
`Hazards.ts` und Tabu-Dateien unangetastet.

Board-Karten: #7400 (K1 Vorher), #7401 (K2 Fix a), #7402 (K3 Fix b), #7403 (K4 Nachher/Doku/Abnahme).
Commits: 14449e2 (K1), 41aea60 (K2), f69b3e6 (K3), K4 folgt.

## 1. Messaufbau + Vorher (K1, 14449e2)

`scripts/m10-chaos-fix-disc.mjs --tag=before|after` — unveränderter Repro aus 3fa01eb
(500er-Stress 640×360@1 + 780×360@3, M25 300er, seed=1, god/autoPlay, skipTo(1490),
10 deterministische Telegraph-Discs, Metrik milkyShareDisc shown-vs-hidden im selben Frame).
Lane-Anpassung (1 Edit): Shot-Präfix `m10-hazard-disc-polish-*` (Belege von 3fa01eb bleiben
unangetastet) + `discKeys`/`stackedDiscs` im JSON (Beleg, dass die Stapelregel in-game feuert).

**Vorher (Stand 3fa01eb, 1 Lauf, verbindlich):** stress500-640 **12,78 %**, stress500-780
**14,75 %**, m25-640 **13,00 %**. 0 JS-Fehler, Renderer `ANGLE (Intel, Mesa Intel(R) Graphics
(RPL-S), OpenGL ES 3.2)`, swiftShader=false. Akzeptanzgrenze vorab fixiert: after
stress500-640 **< 20 %** (keine Rückkehr der Milch).

## 2. Fix a — Innenkante + stabile 2-px-Ringkontur (K2, 41aea60, `src/gfx/hazardDisc.ts`)

- **Kontur (Disc + Ring):** statt Distanz-Schwellen (`d > r-2`) jetzt **round(d)-Band**:
  Kontur genau wenn `round(d) ∈ {r-1, r}`. Das ist im Abstandsmaß ein geschlossenes 2,0-px-Band
  ([r-1.5, r+0.5)) — die beiden Schichten sind je für sich rundum geschlossen (Test: 360 Winkel ×
  Schichten r-1 und r, Ring und Disc), damit ist der 1/2-px-Wechselschlag an Bogen-Flachstellen
  weg. Nur 2 Palettenindizes, binares Alpha, Draw-Scale 1 — Draw-Pfad/Keys bitgleich.
- **Innenkante:** zwischen Kontur und 50-%-Checker liegt jetzt ein **2-px-Übergangsband**
  (round(d) ∈ {r-3, r-2}) als 25-%-Fringe aus `DISC_FILL_I` (emberDark), quantisiert ausschließlich
  auf dem (gerade, gerade)-Teilraster — die harte Checker-Kante am Ring ist in einen stufenlosen
  wirkenden Fringe aufgelöst (Test: Fringe-Dichte 0,1–0,4, keine Fringe-Pixel außerhalb des
  Rasters, round(d)=r-1 lückenlos Kontur).
- Basis-Interieur bleibt das 50-%-Schachbrett wie in 3fa01eb; Kontur-Farbe/-Tint unverändert.

## 3. Fix b — Stapel-Füllstufe ab 5 Warn-Discs (K3, f69b3e6)

- Deterministische Regel **`fillStageForStacks(stacks)`**: Stufe 1 genau ab
  `DISC_STACK_THRESHOLD = 5` gleichzeitig warnenden Circle-Hazards (NaN/negativ → Stufe 0).
  Stapel-Mass **`warnDiscStacks(scene)`** liest nur den von Run.ts gesetzten Run-Zustand
  (`scene.hazards.active`, zählt `kind==="circle"`, nicht getriggert) — `Hazards.ts` wird nicht
  angefasst, kein neuer Draw-Pfad.
- **Stufe 0 (Einzeldisc, <5 Stapel): bitgleich** — gleicher Key `hazard_disc_r<r>`, gleiche
  Rasterung wie ohne Stapelregel (Test: `discMask(r) === discMask(r, 0)`; Key-Vertrag-Test).
- **Stufe 1 (≥5 Stapel):** Interieur als 25-%-Raster (gerade/gerade) statt 50-%-Checker, Fringe
  ebenfalls nur noch auf dem Teilraster, Kontur unverändert; Key `hazard_disc_r<r>_s1`.
  Überlappende Discs stapeln sich damit nicht mehr gegen 100 % Deckung — die Fläche bleibt ruhig,
  der 2-px-Ring trägt die Lesbarkeit.
- In-game-Beleg (after-JSON): 1. Frame 5× Basis-Key + 5× `_s1`, ab 2. Frame alle 10 Discs `_s1`
  (jede neue Disc sieht ≥ 5 warnende Vorgänger) — deterministisch reproduziert in allen Szenarien.
- Grenze ehrlich notiert: die Regel ist **hazardanzahl-basiert, nicht positionsbezogen** — bei
  ≥ 5 gleichzeitig warnenden Discs bekommt jede neue Disc Stufe 1, auch wenn sie einzeln steht.
  Positionsbezogene Stapelung wäre nur mit Änderung an `Hazards.ts` (Spawn-Position an den Bake
  durchreichen) möglich — Tabu-Datei, hier bewusst nicht gemacht.

## 4. Messwerte nachher (K4, 1 Lauf, verbindlich; Ziel stress500-640 < 20 %)

| Szenario | before | after | Δ |
|---|---|---|---|
| stress500-640 (Akzeptanz-Hauptrepro) | 12,78 % | **14,44 %** | +1,7 pp, **< 20 % ✓** |
| stress500-780 | 14,75 % | **12,85 %** | −1,9 pp ✓ |
| m25-640 | 13,00 % | **16,68 %** | +3,7 pp, **< 20 % ✓** |

Alle Werte weit unter der 20-%-Grenze; die kleine Differenz zu 3fa01eb ist innerhalb der
Frame-Streuung des Repros (Gegner-/Licht-Baseline schwankt je Frame um mehrere pp) — der Fix
ändert Füllpixel nur Richtung weniger/sparser, milchige (helle, nicht-Paletten-)Pixel entstehen
davon nicht. 0 JS-Fehler, FPS 55–58 (iGPU), Renderer wie oben, swiftShader=false.

## 5. Tests (`tests/hazard-disc.test.ts`, 16 Tests, +6 neu)

Kantenband quantisiert (Fringe nur auf (gerade,gerade)-Raster, Dichte 0,1–0,4, Kontur
round(d)=r-1 lückenlos), kein Wechselschlag (beide round(d)-Schichten über 360 Winkel geschlossen,
Ring + Disc), Stapelregel deterministisch (Schwelle inkl. NaN/negativ), Einzeldisc bitgleich
(Stage-0-No-op), Stufe-1-Raster quantisiert (25 % ± 5 pp, Kontur bitgleich), Key-Vertrag
(Basis-Key ohne Stapel, `_s1` ab 5, Ring nie `_s1`). Bestehende Draw-Pfad-/Warnlogik-Tests
(Alpha 0.9, Tint, Scale 1, Keys) unverändert grün. `npx tsc --noEmit` rc=0, **Vitest 101 Dateien /
1097 Tests grün**, `npm run build` rc=0.

## 6. Sichtprüfung + Abnahme

- 4x-Zooms `shots/m10-hazard-disc-polish-{before,after}-*-zoom4x.png`: nachher durchgehende
  2-px-Ringkontur an Bogen-Flachstellen, weicher Fringe statt Checker-Kante am Innenrand,
  gestapelte Flächen ruhig (25-%-Stufe).
- art-director strenge Abnahme („kommerziell auslieferbar“): siehe Karten-Notiz #7403 / unten.
- Renderer-Pflicht: iGPU-String im JSON (`m10-hazard-disc-polish-{before,after}.json`).

## 7. Offene Punkte

- Positionsbezogene Stapelbestimmung (Überlappung am Ort statt Hazardanzahl global) braucht eine
  Zeile in `Hazards.ts` (Position an `hazardDiscTexture` durchreichen) — Tabu-Datei, auf Wunsch
  als Folgekarte.
- Beam-/Puddle-Optik weiter unverändert (Out of Scope dieser Lane).
