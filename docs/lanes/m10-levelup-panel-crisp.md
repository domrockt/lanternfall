# Lane m10-levelup-panel-crisp — Level-Up-Panel (3 Angebote) pixel-crisp

**Ziel:** Letztes ungedecktes Kernmoment: das Level-Up-Panel ist pixel-crisp, lesbar und
ohne Überlappung. Angebotslogik bleibt bitgleich (keine Balance-/Drop-Änderung).
Re-Queue des Vorrats-Jobs (07:53Z, Runner-Lauf als Ancestor-Bug-Opfer verloren).

**Karten:** #10665 K1 Vorher-Belege · #10666 K2 Pixel-Crisp-Fix · #10667 K3 Fokus-Kontrast ·
#10668 K4 Regressionstest + Doku. Commits: fef07bd9 (#10665), 58723ee8 (#10666),
48b3da1a (#10667), K4-Commit s. u.

## Messaufbau

`scripts/m10-levelup-panel.mjs` (Playwright, Panel-Öffnung via `run.giveXp(200)` —
Panel öffnet im Pause-Zustand; kein flock, kein FPS-Messen):

- Phase A: Angebots-Snapshot für 3 Seeds (101/202/303) — Bitgleich-Baseline.
- Phase B: 3 Formate 640x360@2, 780x360@3, 960x540@2 (Spiel-View bleibt 640x360@3,
  vgl. src/logic/view.ts M10-view-fill); Glyph-/Rect-Boxen, Überlappungen,
  fraktionale Skalen, Fokus-Kontrast (WCAG), Screenshots.
- Phase C: Fokus-Verhalten je Eingabeart (Tastatur-Öffnung, parkende Maus vor
  Öffnung, echte Mausbewegung nach Öffnung).

Belege (ungetrackt): `~/games/.evidence/m10-levelup-panel-crisp/` —
`m10-levelup-panel-before-{640,780,960}.png`, `m10-levelup-panel-before.json`,
`m10-levelup-panel-after-{640,780,960}.png`, `m10-levelup-panel-after.json`.

## Befunde Vorher (K1, Commit fef07bd9)

| Befund | Beleg |
|---|---|
| **Trennlinie falsch geankert**: Divider-Rect (Origin 0.5) lag zentriert auf `textX`, ragte also 72 px links aus der Karte — kreuzte Kartenrand, Nachbarkarte und Panelrahmen (bei 640/960 `left = -10`, außerhalb des Spielfelds) | before.json: 5 Überlappungen je Format (`divider` vs `levelup-card-0/1`), inside=false |
| 0 fraktionale Skalen im Panel (Titel 2x, Icon 3x, Rest 1x — bereits ganzzahlig) | before.json fractionalScales=[] |
| Fokus-Kontrast gewähltes Angebot (Selekt-Rahmen ffd77a auf nightMid) 11.9:1 — Kriterium ≥3:1 bereits erfüllt | before.json focus.ratioSelected |
| Angebots-Snapshot je Seed 3 Angebote (seed 101: Glutfunke STUFE 2, Wetzstein NEU, Arkanes Buch NEU) | before.json seedSnapshots |
| 0 JS-Fehler in allen Läufen | before.json jsErrors |

## Fixes

1. **K2 (58723ee8)** — `src/scenes/UI.ts` createLevelUpUI: Divider
   `setOrigin(0, 0.5)` — linke Kante = `textX`, inset 4 px beidseitig
   (Kartenbreite − 8). Eine Zeile, keine Layout-Verschiebung.
2. **K3 (48b3da1a)** — Hover-Guard nach options-touch-focus-Muster:
   `showOffers()` merkt `levelOpenPointer` (activePointer beim Öffnen),
   `pointerover` der Karten blockt den stationären Zeiger via
   `hoverRowAllowed()` (exportiert aus src/ui/options-menu.ts), Reset in
   `onLevelUpClosed()`. Startfokus bleibt Karte 0 je Eingabeart.

## Nachher (K4-Messung + Sichtprüfung)

| Kriterium | Beleg |
|---|---|
| 0 Überlappungen zwischen Karten/Titel/Untertitel in allen 3 Formaten | after.json: overlaps=[] je Format, ok=true |
| 0 fraktionale Skalen; alle Anker ganzzahlig | after.json fractionalScales=[]; Test levelup-panel-crisp "ganzzahlige Anker" |
| Trennlinie vollständig in eigener Karte (inset 4 px) | after.json + Test "Trennlinie liegt vollständig in der eigenen Karte" |
| Fokus-Kontrast ≥ 3:1 | 11.9:1 gemessen (Selekt ffd77a vs nightMid), alle 3 Formate |
| Fokusgleichheit: Tastatur-Öffnung selected=0; parkende Maus Vorher 2 → Nachher 0; echte Bewegung wählt Karte 2 (Hover wirkt) | after.json focusCases |
| Angebotslogik bitgleich | tests/levelup-panel-crisp.test.ts, Snapshot 3 Seeds == K1-Vorher; levelup.ts/LevelUpSystem.ts vom Lane-Diff unberührt |
| npm test grün, tsc rc=0, 0 JS-Fehler in Probe-Läufen | 1709/1709 Tests (2× bestätigt), build ok |

Sichtprüfung: after-640/960 (2x nearest) zeigen saubere Trennlinien innerhalb der
Karten, crisp Texte/Icons, gelber Fokus-Rahmen klar erkennbar.

## Abweichungen / Notizen

- Probe-Skript-Edits: 3 Korrekturen am Prüf-Kriterium (kein Werte-Tuning):
  (1) Slot-Erkennung `lineWidth ?? strokeWidth`, (2) Divider-vs-Karten-Paare
  ergänzt, (3) Divider-vs-eigene-Karte auf Voll-Einschluss korrigiert (Deko-Linie
  liegt gewollt AUF dem Karten-Hintergrund); Phase C als neue K3-Messung +
  Bugfix im Pick-Loop (giveXp(200) = ~7 Level-Ups, Loop brach sonst ab und das
  Panel war beim Maus-Parken noch offen → falscher „Leak").
- 960x540@1 nutzt den dokumentierten Fit-Fallback 1.5x (src/logic/view.ts,
  M10-view-fill); die Lane misst @2 (ganzzahlig 3x), wie im Briefing formatiert.
- Erster voller Testlauf nach K4 hatte 1 flaky Failure: `tests/fx-mixel.test.ts`
  (Paletten-Scan von Sprites; Lane hat keine Assets geändert; einzeln 17/17 grün,
  Folgelauf 1709/1709 grün — Last-Flake durch parallele Lanes, nicht
  lane-bedingt). Die K4-Testdatei selbst lief konstant 11/11.
- claims.json-Disponent: nur claimed Dateien angefasst (UI.ts, Probe-Skript,
  Test, Lane-Doku, .lane-done, board.json); shots/m10-passive-math-*.json wurden
  vom Testlauf mit Timestamp-Churn berührt und revertet.

## Kontrolleure

- **art-director: PASS 4,5/5** — Crispness in allen 3 Formaten (780@3 ebenso sauber
  wie @2, keine fraktionale Skalierung sichtbar), Trennlinien voll in eigenen Karten
  (Vorher/Nachher-Vergleich belegt), Fokus unmissverständlich (11.9:1), keine
  Artefakte. Minor (nicht blockierend, außerhalb der Karte): „WÄHLE" rendert als
  „WAHLE" — kein Ä im Pixel-Font, ggf. eigenes Font-Ticket.
- **reviewer: PASS** — Diff nur in claimed Dateien; levelup.ts/LevelUpSystem.ts/
  Run.ts/gen-ui.ts/font.ts unberührt (leerer Diff, Angebotslogik bitgleich);
  Hover-Guard/Divider-Fix ohne Seiteneffekte auf chest/pause/options; Test prüft
  alle Abnahmekriterien, Snapshot gegen Vorher-JSON verifiziert; tsc rc=0,
  1709/1709. Sollte-Punkte umgesetzt: K4-Test committet, fremde Shot-JSONs revertet.

## Offene Punkte

- Keine aus der Lane. Beobachtung (nicht beantragt): unselektierter
  Kartenrahmen nightSlate auf nightMid ≈ 1.1:1 — bewusst leise, das
  Abnahmekriterium betrifft nur den gewählten Fokus.
