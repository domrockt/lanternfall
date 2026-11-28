# Lane m10-board-cleanup-killed-lanes-r2 — Board-Cleanup der getöteten Lane-Jobs (Opferliste r2)

Wiedereinreihung (Argus 06:58Z): Das Original `m10-board-cleanup-killed-lanes` (mode main) wurde
28.11. 06:47:12 selbst Opfer des Disponent-Bugs („nur Doku-Area → Lane statt main-Slot", danach
fälschlich „bereits in main" beendet, **0 Agent-Läufe**). Guard-Fix: ops `77c84cd`.
Kill-Fenster der Opfer: 28.11. 06:22–06:52 — Lane-Jobs wurden als „bereits in main
(merge-base ancestor) → fertig" beendet, ohne dass ein Agent lief. Ihre Karten hingen evtl. in
doing/review und erzeugten fortlaufend falsche stuck-Alarme der Supervision (belegt:
Supervisor-Entscheidungen 05:39–05:58 zu #8598/#8606 und Karte #9196).

**Diese Lane fasst KEINEN Code an.** Nur Board-Buchung + Doku.

Hinweis: `lf-runs/lanes/common.md` ist im Repo (Stand 28.11.) nicht auffindbar (kein Treffer
unter `~/games/lf-runs/` und `lanternfall/lf-runs/`) — die Lane-Regeln aus dem Briefing gelten
unverändert weiter (gleicher Befund wie in m10-gamepad-nav-scenes-r2).

---

## K1 — Audit: Opferkarten auf dem main-Board (Karte #9472)

**Basis:** main-HEAD-Snapshot `f71c3be` (2026-11-28T07:01:41Z), Board `.opencode/board.json`:
783 Karten — done 745, backlog 17, todo 12, blocked 8, **doing 1, review 0**.

### 1. Opfer-Lanes gegen doing/review geprüft

Methode: vollständiger Scan über Titel **und** Beschreibung **und** Notizen aller 783 Karten
auf jeden der 18 Opfer-Lane-Namen (nicht nur Titel-Präfix):

| # | Opfer-Lane | Karten auf main-Board (irgendein Feld) | davon doing/review | Aktion |
|---|---|---|---|---|
| 1 | m10-fx-bakes-evo | 0 | 0 | — |
| 2 | m10-vfx-restore-st2 | 0 | 0 | — |
| 3 | m10-texture-glow-swap | 0 | 0 | — |
| 4 | m10-chest-arrow-texture | 0 | 0 | — |
| 5 | m10-combat-winter-rests | 0 | 0 | — |
| 6 | m10-enemy-idle-anim | 0 | 0 | — |
| 7 | m10-verify-menu-scale-fix | 0 | 0 | — |
| 8 | m10-fxrestore-cleanup | 0 | 0 | — |
| 9 | m10-heap-tail-doc-fix | 0 | 0 | — |
| 10 | m10-pad-start-pause | 0 | 0 | — |
| 11 | m10-postwave-smoke | 0 | 0 | — |
| 12 | m10-title-flame-glow | 0 | 0 | — |
| 13 | m10-gamepad-nav-scenes | 0 | 0 | — (Thema läuft weiter als m10-gamepad-nav-scenes-r2) |
| 14 | m10-chest-spawn-cell-fair | 0 | 0 | — |
| 15 | m10-ai-stream-cadence | 0 | 0 | — |
| 16 | m10-boss-portrait-w2 | 0 | 0 | — |
| 17 | m10-dom-sight-package | 0 | 0 | — (erledigt als -r2) |
| 18 | m10-board-cleanup-killed-lanes (Original) | 0 | 0 | — |

**Ergebnis: 0 Opferkarten in doing/review.** Der Disponent hat im Kill-Fenster für die
Opfer-Lanes **keine Karten auf dem main-Board angelegt** (0 Agent-Läufe — die Karten-Erstellung
des Dispatch-Schritts ist ebenfalls nie gelaufen); einzelne in der Opferliste genannte Themen
(m10-evo-fx-dornensturm #8877–#8881, m10-icons-consistency #9187–#9190) stehen bereits auf
`done`. Es gab daher **keine Karte zu verschieben** — weder nach `cancelled` (Spalte existiert
auf dem Board nicht, 0 Karten) noch nach `backlog`. Ein Verschieben der fälschlich auf `done`
stehenden Opferkarten ist bewusst NICHT erfolgt: nicht Teil des Auftrags („Karten finden, die
NICHT auf done sind"), die Zuordnung Opferkarte ↔ Ersatzarbeit läuft über Veras
Sammel-Re-Queue.

### 2. Dokumentierte Ausnahmen (Karten NICHT verschoben)

| Karte | Status | Lane/Thema | Grund für Nichtverschiebung |
|---|---|---|---|
| **#9196** | doing | m10-props-wiring K4 (art-director-Urteil ≥ 4/5 + Lane-Doku + .lane-done) | **Nicht opferbetroffen** (Supervisor-Entscheid): m10-props-wiring steht nicht auf der Opferliste, Regel 3 → unangetastet lassen. Karte gehört zum laufenden Job (K4-Start belegt, Note 2026-11-28T05:45:00Z „todo → doing: K4 startet"). Der stuck-Alarm darauf ist bekanntes Fehlalarm-Rauschen. **An Vera für die Sammel-Re-Queue bzw. den laufenden Owner gemeldet: Karte #9196 hängt solange in doing, bis der m10-props-wiring-Job regulär abschließt.** |
| **#9101** | done | m10-gamepad-menu-nav K5 (After-Belege + Lane-Doku + Abschluss) | Notiz: „doing → done (2026-11-28T06:52:03Z): lane m10-gamepad-menu-nav gemergt: Merge 29c310e (ancestor rc=0)". Die Lane **hat tatsächlich gelaufen und ist gemergt** (`git merge-base --is-ancestor 29c310e HEAD` → rc=0, Merge-Commit 29c310e 06:50:57Z, Lane-Doku `docs/lanes/m10-gamepad-menu-nav.md` in main). Keine Opferkarte, kein Handlungsbedarf. |

### 3. Abnahme (messbar)

- **„Nach dem Commit enthält KEIN Swimlane der 18 Opfer-Lanes noch Karten in doing/review":**
  erfüllt — 18/18 Opfer-Lanes mit 0 doing/review-Karten (Tabelle oben, Stand `f71c3be`).
  Board-weit ist die einzige doing/review-Karte #9196 (dokumentierte Ausnahme, nicht
  opferbetroffen).
- **„Nur .opencode/board.json + die Doku geändert":** erfüllt — `git diff` gegen Basis
  `f71c3be` enthält ausschließlich `.opencode/board.json` (Karte #9472 dieser Lane: doing →
  done) und `docs/lanes/m10-board-cleanup-killed-lanes-r2.md`. Kein Spielcode, keine
  shots/, keine sonstigen Dateien.
- **`cancelled`-Spalte:** vom Board-Plugin nicht vorgesehen (Spalten: backlog/todo/doing/
  review/done/blocked); da es keine zu verschiebenden Opferkarten gab, war der
  Rückfallwert `backlog` nicht nötig.
- **Beleg:** `/home/ai/games/.evidence/m10-board-cleanup-killed-lanes-r2/audit-9472.json`
  (maschinenlesbarer Scan: Opferliste × Board, doing/review-Liste).

### 4. Offene Punkte (Meldungen, nicht selbst repariert)

1. **Sammel-Re-Queue (Vera):** Die im Kill-Fenster fälschlich auf `done` gebuchten Opferkarten
   (z. B. m10-evo-fx-dornensturm #8877–#8881, m10-icons-consistency #9187–#9190 — je nach
   tatsächlichem Ausführungsstatus) und die Themen der Opfer-Lanes ohne Karten bedürfen der
   Sammel-Re-Queue; diese Lane verschiebt sie nicht (Auftragsgrenze „NICHT auf done", Regel 3).
2. **Fehlalarm-Rauschen #9196:** stuck-Alarm bleibt sichtbar, bis m10-props-wiring K4
   regulär abschließt; siehe Ausnahmetabelle.
3. **`lf-runs/lanes/common.md` fehlt im Repo** — Briefing-Referenz toter Link (auch
   m10-gamepad-nav-scenes-r2 hatte das schon bemerkt).

## 5. Merge nach main (28.11., ~07:20Z)

- **Rebase (Pflicht):** Lane auf main `268f3a3` gerebased; board.json-Konflikte konsequent
  mit der main-Version gelöst (`checkout --ours`), Lane-Karte #9472 nicht per Diff, sondern
  nach dem Merge einmalig per `board_add` neu angelegt → main-**#9684** (`lane #9472`).
  Lane-Commit `76ae824` (nur board.json) thereby skipped — Inhalt über #9684 abgedeckt.
- **Merge:** `git merge --no-ff` → Merge-Commit **f339995** auf main;
  `git merge-base --is-ancestor m10-board-cleanup-killed-lanes-r2 main` = rc 0.
- **.lane-done:** nach dem Merge `git rm` — bewusst NICHT nach main übernommen.
- **Kontroll-Screenshots (Abbruchkriterium „reines Schwarz im Spielfeld-Canvas"):**
  - `shots/merge-m10-board-cleanup-killed-lanes-r2-check-960.png` (960×540)
  - `shots/merge-m10-board-cleanup-killed-lanes-r2-check-1280.png` (1280×720)
  Beide sauber: Terrain, Spieler, HUD, Laternenlicht sichtbar — **Merge gilt**.
- **Build/Tests:** `npm run build` grün (443 ms), `npm test` 153 Dateien / **1655 Tests bestanden**.
- **Review-Karten dieser Lane:** keine offen (0 Karten in `review`); #9684 direkt `done`.
