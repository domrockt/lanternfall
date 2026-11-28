# Lane m10-crowd-silhouette-guard — Chaos-Lesbarkeits-Werte als Suite-Schranke

Worktree `/home/ai/games/lf-lanes/m10-crowd-silhouette-guard`, Branch `m10-crowd-silhouette-guard`.
Ziel: die hart erkämpften Chaos-Lesbarkeits-Werte (A10-Restpunkt „im Chaos verschwimmen
einzelne Typen“ / „Horde überlagert sich stark“) als schnelle `npm test`-Guards pinnen,
BEVOR die wartende Evo-FX-/Merge-Welle (gen-fx/textures/FxSystem/CombatSystem/Run.ts)
main umschreibt. Grundlage: die gemergten Lanes m10-chaos-silhouettes, m10-elite-rim,
m10-elite-tier-families, m10-enemy-palette, m10-crowd-variety, m10-enemy-idle-anim-r2.

**Nur neue Dateien** (`scripts/m10-silhouette-guard.mjs`, `tests/crowd-silhouette-guard.test.ts`,
diese Doku, `.lane-done`) — `src/gfx/enemySprites.ts` und `src/gfx/gen-enemies.ts` wurden
bewusst nicht angefasst (seit merge-m10-enemy-idle-anim-r2 frei, aber unberührt gelassen,
damit der Job disjunkt zur gesamten Merge-Welle bleibt).

## Karten

- #10331 K1: Metriken aus den Lane-Dokus extrahieren + per Skript gegen den Spritesatz verifizieren.
- #10332 K2: Guard-Test `tests/crowd-silhouette-guard.test.ts` (6 harte Assertions, ohne Browser).
- #10333 K3: diese Doku + Rebaseline-Verfahren + `.lane-done`.

## Messverfahren (#10331)

`node --experimental-strip-types scripts/m10-silhouette-guard.mjs` — browserfrei, kein
flock (keine FPS-Messung): lädt die echten Sprite-Grids (`enemySpriteFrames`,
`enemyFrameGrids`, `eliteRimFrame`, Phaser nur als Typ, per Loader-Hook gestubt) und
misst dieselben Kennzahlen, die die Lane-Dokus als Zielwerte nennen.

Vorher-Beleg (Ist-Stand des gemergten main, Commit `8bc02b33`):
`~/games/.evidence/m10-crowd-silhouette-guard/m10-silhouette-guard-before.json`
(Belege laufen nach `~/games/.evidence/`, nicht in git — Dom-Wunsch 27.11./Vera 28.11.).

## Gepinnte Werte (#10332) und ihre Herkunft

| # | Metrik | Ist (verifiziert) | Schranke im Guard | Herkunft |
|---|---|---|---|---|
| M1 | Kontur: Mittel Rim-Light % | 69,8 | >= 60 | m10-chaos-silhouettes (K2/Korrekturrunden, art-director-Forderung „Kante/Lichtkante oben“) |
| M1 | Kontur: Mittel Top-Light % | 100 | >= 95 | dito — Lichtkante über den gesamten oberen Bogen |
| M1 | Kontur: Mittel Randkontrast dunkel (L) | 78,0 | >= 70 | dito (Kontrast gegen dunkles Moor PAL 28, Schwelle 40) |
| M1 | Kontur: Mittel unter Schwelle dunkel % | 31,6 | <= 40 | dito |
| M1 | Kontur: min Randkontrast dunkel je Typ | 41,6 (wisp) | > 40 bei ALLEN 30 | Lane-Vertrag „Kantenkontrast > 40 bei allen 30“ |
| M2 | Elite-Rim: Amber-Edge-Share (beide Posen) | 1,0 | == 1 bei 30/30 | m10-elite-rim (#5241, art-director PASS 4/5) + Rim-Idle aus m10-enemy-idle-anim-r2 |
| M3 | Familien: strongFamilies in 500er-Mischung | 5 (blau, blut-rot, glut-braun, gruen, hell-neutral) | >= 5, alle 5 namentlich | m10-enemy-palette (Nachher-Stand, art-director PASS 4/5) |
| M4 | Varianten: 27 gerenderte Typen, min Body-RGB-Distanz | 60,4 | >= 60, Silhouetten bytegleich (Posen 2 **und** 3), Diff > 0 (beide Posen) | m10-crowd-variety + m10-crowd-variant-tone (#7327, Zielmarke 60) |
| M5 | Idle: Basis-Framesets / Rim-Framesets | 30×4 / 30×2, 0 Duplikate, Posen-Diff > 0; `ELITE_RIM_FRAMES` a 2 Keys | fest gepinnt | m10-enemy-idle-anim-r2 (K1-Befund + K4-Test) |
| M6 | Tier-Dyes: `ELITE_TIER_DYES` / min Zentroid-Distanz | [16,8,19,25,31] / 42,5 | Werte fix, Distanz >= 30 | m10-elite-tier-families + -refine (#7523/#7524) |

Warum diese Werte: sie sind der abgenommene Ist-Stand (art-director PASS 4/5 in
m10-enemy-palette, m10-elite-tier-families; A10-Restpunkt in m10-chaos-silhouettes
ist nur noch über die FX-Überlagerung offen — genau die Dateien der Merge-Welle).
Die Schranken liegen mit kleinem Sicherheitsabstand **unter** dem Ist, damit
deterministische Rundungsdifferenzen zwischen Skript und Test nicht flackern,
aber jede inhaltliche Verschlechterung (Kontur weicher, Rim-Lücken, Grau-Rückfall,
Klone, Standbild-Elites) rot schlägt.

Hinweise zur Metrik-Abgrenzung (ehrlich):
- Die Kontur-Mittel weichen von den Zahlen in m10-chaos-silhouettes (80,3/91,8/96,3/21,7)
  ab, weil dort die Rim-Band-Definition der Browser-Messung gilt; mein Rim-Band
  (Randpixel + 1 px innen, Luminanz-Schwellen 70/85) ist leicht strenger. Ballpark und
  Reihenfolge passen; gepinnt sind die **verifizierten** Werte des eigenen Skripts, nicht
  die Dokuzahlen — der Guard bewacht Regressionen relativ zum gemergten Stand.
- `bog_rat`/`wisp`/`bogzombie` werden im Spiel als handgezeichnete 2-Frame-Sets
  (`SPRITE_GRIDS` in textures.ts) gerendert; ihre generierten Varianten-Frames (2/3)
  werden nie gezeigt und sind in M4 ausgespart — identisch zu
  `tests/crowd-variant-tone.test.ts`.

## Rebaseline-Verfahren (gewollte Änderungen)

1. **Einverständnis**: Die Änderung muss eine eigene Board-Karte haben, die den A10-Vertrag
   nennt (kein stilles Verschieben der Schranken).
2. **Vorher-Messung**: `node --experimental-strip-types scripts/m10-silhouette-guard.mjs`
   auf dem alten Stand laufen lassen und die JSON nach
   `~/games/.evidence/m10-crowd-silhouette-guard/…-before.json` schreiben.
3. **Änderung umsetzen**, Skript erneut laufen lassen (after-JSON).
4. **Schranken anpassen**: Nur mit Begründung in der Lane-Doku der auslösenden Karte
   (was ändert sich, warum ist der neue Wert die neue Baseline). Schranken so setzen wie
   hier: leicht unter dem neuen Ist.
5. **Guard + Suite grün**, dann committen (`#<Karte>` im Commit). Der Guard-Test nennt den
   neuen Beleg-Pfad im Kommentar über der betroffenen Assertion-Gruppe.
6. Werte **niemals per Hand im Loop drehen** — bei Unstimmigkeit zuerst das Mess-Skript
   prüfen (deterministisch, kein Browser), nicht die Schranken lockern.

## Abnahme

- Guard deckt 6 harte Metriken ab (Kontur, Rim, Familien, Varianten, Idle, Tier-Dyes) — Ziel >= 5.
- `npx vitest run tests/crowd-silhouette-guard.test.ts`: **7/7 grün in 0,59 s** (Ziel < 2 s).
- `npm test`: 1852 + 7 = **1859/1859 grün**, `npx tsc --noEmit` rc=0, `npm run build` rc=0.
- Vorher-JSON (`~/games/.evidence/m10-crowd-silhouette-guard/m10-silhouette-guard-before.json`,
  erzeugt auf main-HEAD `ddab8749`) belegt: gepinnte Werte = Ist-Stand, keine Wunschwerte;
  strongFamilies = exakt die 5 Familien der Lane-Doku m10-enemy-palette.
- **Reviewer-Runde (28.11.)**: FAIL mit 3 Befunden, alle behoben —
  (1) M6-Zentroid im Test war doppelt gewichtet und ohne Amber-Ausschluss (Schranke
  wirkungslos, korrekt gerechnet 29.5 statt 42.5) → Test-Metrik jetzt deckungsgleich zum
  Skript (pixelweise, ohne 0/13/Amber); (2) Frame-3-Silhouetten/Diffs waren im Skript nicht
  gemessen → nachgemessen, alle 27 Typen bytegleich/diff > 0; (3) Rim-Frameset-Länge war
  hartkodiert → jetzt echte Assertion über `ELITE_RIM_FRAMES` (M5b) + gemessen im JSON.
- Nur neue Dateien: `git diff ddab8749..HEAD --stat` enthält keine fremden Quelldateien.

## Offene Punkte

- Der Guard bewacht die **Sprite-Ebene**; die FX-/Overlay-Ebene (Boss-Ringe, additive
  Flashes), die im art-director-Urteil von m10-chaos-silhouettes als Restpunkt steht,
  liegt in gen-fx/FxSystem/Run.ts und wird von der Merge-Welle ohnehin umgeschrieben —
  dafür ist der Chaos-Frame-Screenshot-Beleg der FX-Lanes zuständig, nicht dieser Guard.
- `topLightPct` ist mit 100 % gesättigt (jede Spalte trägt die Lichtkante); die Schranke
  >= 95 würde erst rot, wenn die Lichtkante-Mechanik in `sharpenEnemyGrid` beschädigt wird.
