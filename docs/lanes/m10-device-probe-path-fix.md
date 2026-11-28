# Lane m10-device-probe-path-fix

**Grund:** Das Einmal-Geräteprobe-Skript `scripts/m10-tablet-fx-device-probe.mjs` (aus Lane m10-tablet-fx-hotspot) importierte `harness.mjs` über den Lane-Worktree-Pfad `/home/ai/games/lf-lanes/m10-tablet-fx-hotspot/...` — bricht nach `git worktree remove` (Merge-Schritt 4). Da das Skript das Werkzeug für Doms Wunsch „Gerätemessung nach jedem Perf-Merge" ist, wurde der Import auf den dauerhaften Repo-Pfad `/home/ai/games/lanternfall/scripts/harness.mjs` umgestellt (1 Zeile, Commit `M10-m10-device-probe-path-fix: #11368 …`, siehe `git log -1`).

**Verifikation:**
- `node --check scripts/m10-tablet-fx-device-probe.mjs` → rc=0.
- `grep -n "lf-lanes/" scripts/m10-tablet-fx-device-probe.mjs` → keine Treffer (rc=1).
- Keine weiteren Änderungen am Skript; Tests/Build unverändert grün (Skript nicht in Tests eingebunden).

**Board:** Karte #11368. Hinweis: `board_move` auf `done` wurde vom Plugin verweigert, weil im geteilten main-Repo 49 fremde, uncommittete Merge-Pipeline-Dateien liegen (`M shots/m10-passive-math-*.json`, `?? shots/merge-*-check-*.png` — nicht Teil dieser Lane). Die Arbeit ist mit Commit `80302cac` (Message referenziert `#11368`) vollständig abgeschlossen; die Karte verbleibt bis zum Freilauf des main-Repos in `doing` und ist vom Board-Hygiene-Job bzw. Disponenten auf `done` zu ziehen.
