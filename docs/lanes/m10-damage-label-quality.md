# Lane m10-damage-label-quality

Ziel: Schadenszahlen-Last an die Qualitaetsstufe koppeln — pruefen, dass der
Tier-Cap `damageLabelCapForQuality` (maxDamageLabels 5/8/12, src/logic/quality.ts)
im Run-Pfad WIRKLICH bei `src/systems/DamageNumbers.ts` ankommt, und das mit
Guard-Test + Chaos-Probe belegen. Board: #11509 (K1), #11510 (K2), #11511 (K3),
#11512 (K4).

## K1 Befund: Verdrahtung ist WIRKSAM (#11509)

**Antwort auf die K1-Frage: Ja, der Cap kommt an. Kein Fix erforderlich.**

Statisch:
- `src/systems/DamageNumbers.ts` Z. 12 importiert `damageLabelCapForQuality`,
  Z. 227 (`viewLimit`) liest `damageLabelCapForQuality(QUALITY)` JE Aufruf
  (nicht eingefroren), genutzt in `applyDisplayPlan` (Z. 312, `maxVisible`
  an `planLabels`) und `enforceViewCap` (Z. 410, Aggregat-Modus).
- `src/config.ts` Z. 45/210: `QUALITY` ist ein Live-Binding, das der
  Hysterese-Regler (`installRenderBudget`, rAF-Tick) je Frame setzt.
- Build-Bundle enthaelt die Verdrahtung: `maxDamageLabels` 4x in
  `dist/assets/gfx-*.js`.

Runtime-Probe (`scripts/m10-damage-label-quality.mjs`, M25-Chaos, Seed 1,
6 Evolutionen Lv8, ~300 Ritter am Leben, Tier ueber den ECHTEN Regler via
CDP-CPU-Drossel 20x gefahren, Aktive Labels je Frame aus `dn.views`):

| Tier | quality laut `__lf.state()` | Labels/Frame | Cap | bindend? |
|---|---|---|---|---|
| high | high (FPS ~59-60) | 6/6/6/6 | 12 (agg. 10) | nein — Zonen-/Burst-Caps (2/Zone, 3 Burst) binden zuerst |
| medium | medium (FPS ~41-56) | 6/6/6/6 | 8 | respektiert |
| low | low (FPS ~20-30) | 4/5/5/5 | **5** | **JA — hart am Cap** |

Belege: `~/games/.evidence/m10-damage-label-quality/label-quality-before.json`
+ Screenshots `label-quality-before-<tier>-f<N>.png` (ausserhalb des Repos,
Dom 27.11: Belege nicht ins git).

Bei ~260-270 lebenden Gegnern und laufendem Schaden ist der Kandidatendruck
weit hoeher als die Cap — low pinnt exakt auf 5 (3/4 Frames), waehrend high
unterhalb seines Caps bleibt (dort binden die aelteren Lesbarkeits-Caps
`MAX_NORMAL_PER_ZONE=2`/`LABEL_BURST_PER_FRAME=3` aus m10-damage-calm).
**LOW-Tier senkt die Labelzahl messbar: 6 (high) -> 5 (low), −1 Label/Frame
(−17 %), low bindend am Tier-Cap.** Der Tier-Cap ist in low die bindende
Schranke, in high nur eine weitere (lockere) Obergrenze — genau das
gewollte Verhalten: Last wird nur gesenkt, wenn die Stufe es verlangt.

### Nebenfunde (kein Fix in dieser Lane, keine betroffenen eigenen Dateien)

- **B1 — rbscale-Override friert die Stufe ein:** `installRenderBudget`
  (src/config.ts, tick()) verlaesst den Regler-Zweig per `return`, sobald
  `forcedRenderScale() !== null` (?rbscale=... in der URL oder
  `window.__rbOverride`). In solchen Laeufen bleibt `QUALITY` auf high und
  ALLE Tier-Caps (auch die FxSystem-Deckel) wirken nie. Realgeraete ohne
  URL-Param sind nicht betroffen; Mess-Skripte, die mit ?rbscale arbeiten,
  messen unveraendertes high-Verhalten. Bedarf ggf. ueber requests.md melden.
- **B2 — Drossel-Empirie:** 8x CPU-Drossel reichte auf dieser Maschine nicht
  unter 45 FPS (52-58 FPS bei 780x360@3); 20x fallen zuverlaessig. Fuer
  kuenftige Tier-Probes: `--throttle=20`.

## K2: Label-Budget je Tier wirksam — kein Fix noetig (#11510)

K1 belegt die Wirksamkeit im echten Run-Pfad; der von K2 vorbereitete Fix
wird nicht ausgefuehrt (nur bei negativem K1-Befund vorgesehen). HIGH-Bitgleichheit:

- Tier high: `damageLabelCapForQuality("high") = 12 = MAX_VISIBLE_LABELS`
  und `MAX_VIEWS_AGGREGATE=10 < 12` — die Qualitaets-Stufe aendert die
  Caps im high-Pfad GEGENUEBER dem Stand vor m10-android-scale-floor-r2
  (#10607 K3) nicht: non-aggregate `min(24, 12, 12) = 12`, aggregate
  `min(lodLimit, 10, 12) = min(lodLimit, 10)`.
- In Vitest/Node bleibt `QUALITY` stets "high" (installRenderBudget ist
  passiv ohne window) — alle bestehenden Tests laufen auf bitgleichem
  high-Pfad: `npx vitest run tests/damage-calm.test.ts tests/damage-grid.test.ts`
  gruen (4 Dateien, siehe K4-Lauf unten: 25 bestanden).
- Code-Aenderung in dieser Lane: keine (einzige Aenderung am Spiel:
  keine;scripts/m10-damage-label-quality.mjs ist Mess-Harness).

## K3: Guard-Test tests/damage-label-quality.test.ts (#11511)

Friert die Tier-Matrix ein (siehe Testdatei):
- `damageLabelCapForQuality`: low 5 <= medium 8 <= high 12 (exakt),
  Rueckfall bei unbekanntem Tier = high.
- `damageNumbersPerSecFor`: 8 <= 14 <= 24 (Monotonie, fuer spaere
  Emissions-Verdrahtung).
- HIGH-Bitgleichheits-Anker: high-Cap == `MAX_VISIBLE_LABELS`,
  high-Cap > `MAX_VIEWS_AGGREGATE` (Aggregat-Cap unangetastet).

## K4: Beleg + Abschluss (#11512)

Nachher/Bestaetigungs-Lauf (`--tag=after`) nach dem Guard-Test: identische
Zahlen (Code unveraendert) — siehe Tabelle oben, JSON
`~/games/.evidence/m10-damage-label-quality/label-quality-after.json`,
Abnahme-Screenshot `shots/abnahme/m10-damage-label-quality-low-tier.png`
(low-Tier, Labels <= 5 bei ~270 Gegnern).

Offene Punkte:
- B1 (rbscale friert Stufe ein) — ausserhalb des Datei-Bereichs dieser Lane.
- `damageNumbersPerSecFor` ist weiterhin NICHT verdrahtet (Emissions-Cap
  existiert nicht) — laut Kommentar in quality.ts bewusst Folgekarte.
