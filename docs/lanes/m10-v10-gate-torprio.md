# Lane m10-v10-gate-torprio — Endabnahme-/v10-Host-Gate: FPS avg + rAF-p95 primär, gfxinfo-janky Beobachtung

**Datum:** 2026-11-28 · **Worktree:** `/home/ai/games/lf-lanes/m10-v10-gate-torprio` (Branch `m10-v10-gate-torprio`) · **Karten:** #13519 (K1), #13520 (K2), #13521 (K3)

## Auftrag

K4-Befund 3 der Mess-Lane m10-janky-remeasure (requests.md 17:10Z, `docs/lanes/m10-janky-remeasure.md` K4):
**gfxinfo-janky ist als alleinige Tor-Metrik unbrauchbar** — 0 % janky bei FPS avg 50,1 < 60 und
rAF-p95 33,4 ms (identisch bei Cap 60 und MAX, Build 0ce7164a mit stackfix, Panel 60 Hz, Thermal 0,
0 JS-Fehler). Das Endabnahme-/v10-Host-Gate muss FPS avg + rAF-p95 als PRIMÄRE Tore führen;
gfxinfo-janky sekundär/beobachtend. Kein src/-Touch, reine Host-Skript-Änderung.

## K1: `scripts/m10-v10-gate.mjs` — Urteilsreihenfolge umgestellt (Commit 7dc48827)

Neue Tor-Reihenfolge (Pflichttor Renderer bleibt Tor 0, unangetastet):

| # | Tor | Schwelle | Quelle |
|---|-----|----------|--------|
| 1 | `fps-avg` | **>= 57 FPS** (unteres Ende des K4-Fixkorridors 57–60) | Host-Harness-rAF-dt, Minute-25-Worst-Case |
| 2 | `frame-p95` | **<= 16 ms** (rAF-Frame-Zeit, unverändert) | Host-Harness-rAF-dt |
| 3+ | content-counts, js-errors-0, fullrun-inhalt, heap-retained | unverändert | wie bisher |

- **gfxinfo-janky ist Beobachtung, kein Tor:** wird es als `perf.gfxinfoJankyPct` eingespeist
  (z. B. aus einem Geräte-Lauf via dumpsys gfxinfo), erzeugt `>= 10 %` nur eine **Warnung** —
  nie allein ein FAIL. Nicht eingespeist = kein Einfluss (der Host-Lauf misst kein gfxinfo).
- **Rückweg per Flag:** `node scripts/m10-v10-gate.mjs --janky-as-gate ...` stellt die alte
  strenge janky-geführte Lesart wieder her (gfxinfo-janky hartes Tor `< 10 %`, nicht messbar = FAIL).
  Falls Dom die Tor-Definition anders entscheidet (siehe unten), ist das der Flip.
- Renderer-String-Pflicht unangetastet (Regel 6, 28.11.: SwiftShader-Belege ungültig → Exit 2).
- Report-JSON führt neu `gateOrder` („fps-avg+raf-p95-primary“ vs. „legacy-janky-gate“) und
  `observation.gfxinfoJanky { pct, source, role }`.

## K2: `tests/v10-gate.test.ts` — Urteilslogik gepinnt (Commit c53ed533)

24 Tests grün (`npx vitest run tests/v10-gate.test.ts`), u. a.:

- **FAIL nur bei FPS/p95-Verletzung:** K4-Gerätebeleg als Fixture (bimodales 2-Vsync-Raster:
  fpsAvg 49,9 — K4 gemessen 50,1 — / rAF-p95 33,4 ms / janky 0 %) → `FAIL(['fps-avg','frame-p95'])`,
  `gfxinfo-janky` nicht in failures.
- **janky-ohne-FPS-FAIL ist kein FAIL:** janky 25 % bei grünem FPS/p95 → Urteil bleibt PASS, nur Warning.
- **`--janky-as-gate`:** janky 25 % → FAIL; janky nicht einspeisbar → FAIL (kein stillschweigendes Grün).
- Helfer `fpsAvg` (1000/Mittelwert, entartet → null) und `gfxinfoJankyPct` (nur endliche, nichtnegative
  Werte) unit-gepinnt.

## K3: Vorher/Nachher-Urteil am vorhandenen Gate-JSON (Belege in `~/games/.evidence/m10-v10-gate-torprio/`)

Basis = vorhandener Gate-Beleg `~/games/.evidence/m10-v10-gate-guard/gate-final-run3.json`
(Gate-Lauf 28.11. 15:57Z, iGPU `Mesa Intel(R) Graphics (RPL-S)`): aufgezeichnet **FAIL,
failures ['frame-p95']** — der historische FAIL(frame-p95-only), ohne jedes FPS-Tor.

Zwei Szenarien, beide mit **bitgleich identischem Input** durch alte (Commit 489e7682 extrahiert)
und neue Logik:

| Szenario | Input | Vorher (alt) | Nachher (neu) |
|---|---|---|---|
| A: gate-final-run3 | p95 16,8 ms, fpsAvg 97,4 (rekonstruiert aus frames=975/10-s-Fenster) | `FAIL ['frame-p95']` — reproduziert die Aufzeichnung exakt (faithful: true) | `FAIL ['frame-p95']` — aber Tor 1 `fps-avg` (97,4 ≥ 57, ok) wird jetzt mitbewertet; Urteil von der rAF-p95-Verletzung geführt |
| B: K4-Gerätebefund | fpsAvg 49,9 / p95 33,4 ms (bimodales 2-Vsync-Raster 80×16,7 + 20×33,4) / **janky 0 %** | `FAIL ['frame-p95']` — janky 0 % im Host-Gate unsichtbar | `FAIL ['fps-avg','frame-p95']` — die Pacing-Verletzung steht im Urteil; janky 0 % bleibt Beobachtung (`--janky-as-gate` würde die alte strenge Lesart zurückdrehen) |

Belege: `~/games/.evidence/m10-v10-gate-torprio/m10-v10-gate-torprio-vorher.json` und
`…-nachher.json` (nicht in git — `shots/*` ist ignoriert, Belege liegen außerhalb des Repos).
Methodikhinweis (steht auch in beiden JSONs): das Gate-Skript persistiert `frameDtsMs` im Out-JSON
nicht (nur Percentile + Samplezahl), deshalb sind die dt-Samples aus den aufgezeichneten Werten
rekonstruiert — identisch in alt und neu, der Vergleich bleibt gültig. Szenario A reproduziert das
aufgezeichnete Urteil fehlerfrei (faithful-Check im Vorher-JSON).

## Querverweis: offene Dom-Frage zur Tor-Definition

Die Umstellung trägt den K4-Befund in das Gate ein, ändert aber NICHT die fachliche Frage:
**Tor-Definition an realer Last** (`coding-brain/Lead/Fragen an Dom.md`, Abschnitt „Tor-Definition an
realer Last“ + Ergänzung 17:0xZ von Dora) — dort hängen Host-`frame-p95` (strukturell nicht erfüllbar
solange der Render-Loop mit fps {target:60, limit:60} drosselt: worst 16,9 ms = 0 % janky, p95 16,8 ms
= FAIL) und Geräte-janky an derselben offenen Entscheidung. Der Gate-Nachlauf m10-v10-gate-rerun
wertet frame-p95 solange nicht als FAIL. **Entscheidet Dom anders als hier angenommen, ist der Rückweg
das Flag `--janky-as-gate` (bzw. eine Anpassung von `FPS_AVG_TARGET`/`FRAME_P95_TARGET_MS`).**

## Abnahme

- Gate-Urteil am selben Eingabe-JSON wechselt nachvollziehbar: Vorher FAIL(frame-p95-only, fps unsichtbar,
  janky unsichtbar) → Nachher FPS-avg/rAF-p95 als Tor 1/2, janky nie allein FAIL. ✓ (Belege oben)
- Tests beweisen die Urteilslogik (K4-Beleg als Fixture, Legacy-Flag, Janky-nur-Warnung). ✓ 24 grün.
- Kein src/-Touch: `git diff --stat 489e7682..HEAD` = nur scripts/m10-v10-gate.mjs + tests/v10-gate.test.ts
  (+ Doku). Keine Spieländerung. ✓
- Renderer-String-Pflicht unangetastet (R1 zuerst, Exit-2-Semantik unverändert). ✓

## Status

K1 ✓ (7dc48827) · K2 ✓ (c53ed533) · K3 ✓ (dieser Commit) — Lane abgeschlossen (.lane-done).
