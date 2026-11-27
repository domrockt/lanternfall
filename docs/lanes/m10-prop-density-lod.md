# M10 Prop-Dichte-LOD (Lane m10-prop-density-lod)

## Auftrag

FPS 640x360 Minute 25 (Median 48,5 nach m10-ground-props-batch) Richtung >= 55:
weniger gerenderte Prop-Quads bei hoher Gegnerdichte über gestuftes Dichte-LOD.
Renderpfad ist submit-limitiert (~900 sichtbare Prop-Quads), nicht draw-call-limitiert
(75/85 Kandidaten, < 300 PASS) — siehe docs/lanes/m10-ground-props.md.

## Ansatz

Gestufte Prop-Tiers (propLayers.ts) + Schwellwerte (lod.ts), umgesetzt in
GroundRenderer.updateAmbient (dort lief bereits DENSE_HIDE_PROPS ab 250):

- Tier 0 = Landmarken (`prop_post`, Laternen mit Glow) — bleiben immer sichtbar.
- Tier 1 = grosse Strukturen (Baeume, Ruinen, Saeulen, Graeber) — sichtbar bis N2.
- Tier 2 = kleine Deko (Stump, Boulder, Cross, Bones, Reeds, Lilypad, Mushroom) —
  ausgeblendet ab N1 (identisch zum alten DENSE_HIDE_PROPS-Verhalten).
- N1 = 250, N2 = 300 (Hebel 1). Schatten/Glows folgen ihrem Prop (kein schwebender Schatten).

## Messbasis (Vorher, belegt)

`flock .lf-perf.lock node scripts/m10-ground-props.mjs --tag before --out m10-prop-density --runs 3 --png`
(seed 7, skipTo(1490), 10-s-Fenster, Gegner-Top-up auf 300; Skript um p90-Frametime
und propComposition erweitert — Skript-Aenderung aendert kein Spielverhalten):

| Kondition | FPS Median | Median Frame | p90 | Props sichtbar/Frame | Kandidaten/Frame |
|---|---|---|---|---|---|
| 640x360 @dpr1 | 60 / 60 / 60 | 16,7 ms | 16,7 ms | 747/713/730 | 72/69/70 |
| 780x360 @dpr3 | 60 / 60 / 60,1 | 16,7 ms | 16,7 ms | 1103/991/1044 | 84/66/82 |

**Abweichung zur Referenz-Lane:** docs/lanes/m10-ground-props.md meldet 48,5 FPS
(640) fuer denselben Messaufbau; dieser Lauf misst 60 FPS (vsync-Cap) mit
p90 = 16,7 ms in ALLEN Bedingungen. Der Host lief beim Vorher-Lauf offenbar
ohne parallele Lane-Last — der FPS-Kontrast ist Host-Last, nicht Code-Stand.
Folgerung: Auf diesem Host ist der FPS-Median bei vsync-Cap fuer Vorher/Nachher-
Vergleiche unbrauchbar; Frametime-Verteilungen (p90) und Quad-Zahlen sind die
belastbaren Belege. Quads bei 300 Gegnern (propComposition-Snapshot, 640):
906 gesamt = 448 Schatten + 458 Props (davon nur 10 prop_post als Landmarken),
Deko-Props waren im Messfenster bereits via DENSE_HIDE_PROPS versteckt (26/30
Prop-Batches).

## Hebel-Protokoll (max. 3)

### Hebel 1: Tier-System mit N1=250 / N2=300 (beibehaltene alte Schwelle + Verschärfung)

Implementierung (propLayers.ts `propTierFor`/`PROP_TIERS`, lod.ts
`propDensityMaxTier`, GroundRenderer `applyPropTier` + Tier-Erbau in `addProp`,
Schatten folgen ihrem Prop, Glows immer sichtbar). Messung
`--tag after --runs 3`:

| Kondition | FPS Median | p90 | Props sichtbar/Frame | Batches (Prop) |
|---|---|---|---|---|
| 640 | 60/60/60 | 16,7 ms | 663/581/701 | 26/26/26 |
| 780 | 60/60,1/60 | 16,7 ms | 945/988/856 | 26/12/12 |

**Nicht ausreichend:** N2=300 wird im Messfenster nie erreicht — die
Messbedingung „300 Gegner" (Top-up auf 300) hält real nur avg 175-236 lebende
Gegner (Waffen töten schneller als der Top-up nachlegt; auch die Referenz-Lane
maß nur avg 175-236). Das alte DENSE_HIDE_PROPS ab 250 griff aus demselben Grund
im Fenster kaum. Quad-Reduktion nur ~5-20 % → Kriterium 1 verfehlt.

### Hebel 2: Schwellwerte an reale Endgame-Dichte (N1=150 / N2=200)

Gleiche Mechanik, Schwellwerte gesenkt. Messung `--tag after2 --runs 3`:

| Kondition | FPS Median | p90 | Props sichtbar/Frame | Prop-Batches | avg/min Gegner |
|---|---|---|---|---|---|
| 640 | 60/60,1/60 | 16,7 ms | 422/442/399 | 26/26/26 | 249/16, 204/15, 250/16 |
| 780 | 60/60/60 | 16,7 ms | 726/714/699 | 2/2/26 | 209/27, 215/28, 175/24 |

**Nicht ausreichend — Flackerbefund:** Die Gegnerzahl oszilliert im Fenster
stark (16..300, avg 175-250; AoE-Waffen räumen Wellen ab, Top-up legt nach).
Jede momentanbasierte Schwelle flappert deshalb im Sekundentakt zwischen den
Stufen (propBatches 26 ↔ 2 innerhalb desselben Laufs); die Mittel landen bei
~400 (640, knapp über Ziel) bzw. ~700 (780, über Ziel). Zusätzlich wäre das
Flackern von Props im Spiel sichtbar. Quad-Ziel formal knapp verfehlt,
Optik-Risiko — Schwellwert allein ist der falsche Hebel.

### Hebel 3: Hysterese + Bäume als Landmarken — GEMESSEN, REVERTIERT

Implementiert (`PROP_LOD_HOLD_MS = 2000`: Verschärfung erst nach 2 s anhaltend,
Entspannung sofort; Bäume zu Tier 0). Messung `--tag after3 --runs 3`:

| Kondition | Props sichtbar/Frame | Prop-Batches | avg/min Gegner |
|---|---|---|---|
| 640 | 846/810/872 | 26/26/26 | 224/15, 249/18, 178/17 |
| 780 | 1165/1012/1235 | 26/26/26 | 227/28, 238/29, 206/16 |

**Urteil: gescheitert und revertiert.** Die Gegnerzahl fällt in kurzen Wellen
unter N1 (min 15-29) — die sofortige Entspannung setzt das LOD bei fast jeder
Welle zurück; die 2-s-Anhalte-Frist für die Verschärfung wird wegen der
Flatterkandidaten (0/1/2 wechselnd) selten erreicht. Ergebnis: LOD praktisch
inaktiv (810-1235 Quads, schlimmer als Hebel 2). Befund: Momentbasierte
Schwellen sind bei dieser Oszillation entweder wirkungslos (Hysterese mit
soforter Entspannung) oder flackrig (keine Hysterese). Der korrekte Mechanismus
wäre eine **geglättete Dichte (EMA über ~2-3 s) als Entscheidungsgrundlage** —
das ist Hebel 4 und überschreitet das Abbruchkriterium (max. 3). Empfehlung an
den Lead: EMA-Variante als eigene Karte; Alternativ Hebel gegen die
Gegner-Quads/FX oder vsync-Thema.

## Abnahme-Bilanz (bester Stand = Hebel 2, Commit d6cb8be)

| Kriterium | Ziel | Ist | |
|---|---|---|---|
| 1. Sichtbare Prop-Quads @300-Gegner-Bedingung | < 360 (−60 % gegen ~900) | 640: Median **422** (422/442/399, −53 % gegen Vollzustand 906, −48 % gegen ~806 Referenz); 780: Median **714** (−43 % gegen 1245) | **FAIL** |
| 2. Optik art-director 640+780, Note >= 4/5, keine Löcher | >= 4/5 | **PASS, Note 4/5** — Belege shots/m10-prop-density-before-*.png vs. after2-*.png, Crops m10-prop-density-ad-crop-{lean,full,640lean}.png; keine Loch-Effekte im Lean-Boden, keine schwebenden Schatten (Schatten folgen dem Prop), Pixelraster 640/780@3x intakt. Einschränkung: Tier-Übergang (Pop) nur live/GIF prüfbar, aus Einzelbildern nicht beurteilbar — GIF-Empfehlung für Folge-Karte | **PASS** |
| 3. FPS 640 M25 Median >= 52 ODER p90-Gewinn >= 2 ms | s.o. | 60/60,1/60 (>= 52) — **aber vsync-verwässert**: Host lief idle, p90 = 16,7 ms in ALLEN Bedingungen inkl. Vorher; p90-Gewinn 0 ms | formal PASS, nicht ursächlich |
| 4. Kein Draw-Call-Regression (< 300) | < 300 | 640: 69/73/70; 780: 61/60/82 | **PASS** |
| 5. npm test / tsc / build grün | 0 fail | 582/582, tsc 0, build 0, 0 JS-Fehler in allen Messläufen | **PASS** |

**Welcher FPS-Beleg greift (ehrlich):** formal der FPS-Median (60 >= 52), aber
er ist nicht als Verbundenheit mit der Änderung interpretierbar: der Vorher-Lauf
auf demselben Host lief ebenfalls 60 FPS (vs. 48,5 in der Referenz-Lane unter
paralleler Lane-Last), p90 = 16,7 ms überall — vsync-Cap schluckt jede
Frametime-Differenz. Ein p90-Gewinn ist auf diesem Host-Zustand nicht messbar
(0 ms Differenz). Die Abbruch-Frage "wie viel ms liegen ground-hidden vs.
ground-on bei p90 auseinander?" ist damit beantwortet: **auf dem idle Host: 0 ms
(p90 16,7 ms in beiden Zuständen — vsync-gedeckelt)**; unter Last bleibt der
Befund der Vorher-Lane: Ground-Renderpfad 4,09 ms/Frame (m10-ground-cost), von
denen ~2,5 ms auf Prop-Quads entfallen — genau die Größenordnung, die vsync
verschluckt, solange die echte Frame-Zeit unter 16,7 ms bleibt.

**Gesamturteil:** Abbruchkriterium greift — 3 Hebel, Kriterium 1 nicht erfüllt
(best: −53 % statt >= 60 %). Bester Stand (Hebel 2: gestuftes Tier-LOD,
N1=150/N2=200) ist committet und bleibt nicht schädlich: Quads −43..−53 % im
Chaos-Fenster, Draw-Calls unverändert gut (< 100), Tests grün, Optik siehe
Art-Check. Der fehlende Rest liegt an der Gegner-Oszillation (16..300 lebende
Gegner trotz Top-up 300) — Prop-Quads allein sind bei diesem Host nicht das
FPS-Limit (vsync-Cap 60 FPS idle); EMA-Glättung wäre der nächste Versuch.

## Verworfene Alternativen

- **Hysterese mit sofortiger Entspannung** (Hebel 3): gemessen, hebt das LOD in
  der Oszillation praktisch ganz auf (810-1235 Quads) — revertiert.
- **Chunk-Composite / pro-Frame-setDepth**: siehe docs/lanes/m10-ground-props.md
  (bereits widerlegt, nicht wiederholt).
