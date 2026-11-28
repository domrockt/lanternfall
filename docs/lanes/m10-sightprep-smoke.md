# Lane m10-sightprep-smoke — Nur-Mess-Sanity vor Doms Sichtabnahme

**Zweck:** Ein unabhängiges Sanity-Urteil auf aktuellem main vor Doms Sichtabgang (Wunsch 08:15Z, Referenz main `45c198d`,
dahinter ~15 Merges). KEINE Spielcode-Änderung, keine Fix-Jobs in dieser Lane — Ergebnis ist die Befundliste
(Severity + Belegpfad + Datei-/Hebel-Pointer), daraus schneidet Dora Fix-Jobs.

## K1 — Basis pinnen + Gates (#10197)

- **PIN-Commit:** `7bf95e54a033ad71abcc3ec035beb025fe932473` (`7bf95e54` merge-merge-m10-verify-outputs-hygiene,
  Stand 28.11., 80 Commits nach Referenz `45c198d`)
- **Renderer-Pflicht:** Belege gelten nur mit iGPU-Renderer-String
  `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)`. SwiftShader-Belege sind ungültig.
  String je Lauf in `~/games/.evidence/m10-sightprep-smoke/renderer.txt` (K2/K3 ergänzen je Lauf).

| Gate | Ergebnis | Beleg |
|---|---|---|
| `npx tsc --noEmit` | OK (rc=0) | `~/games/.evidence/m10-sightprep-smoke/gates.log` |
| `npm run build` | OK | gates.log |
| `npm test` | **1763/1763 PASS** (1. Lauf); Kontroll-Lauf: 1 Timeout-Flake (`tests/fx-mixel.test.ts`, 5 s-Limit unter Last) — isoliert 2/2 grün → Befund B2 (Minor) | gates.log |
| `npm run acceptance` | **OK** (`"ok": true`; 30/6/6/6/6/2 erfüllt) | acceptance.log |
| `npm run verify:final` | **7/7 PASS** | verify-final.log |
| `npm run verify:input` | **FAIL — 11/12** (2× reproduziert, identischer Punkt) | verify-input.log, verify-input-retry.log |

### Befund B1 (Major, Gate-FAIL): Gamepad-Start aus CharSelect wirft zurück zum Titel

- **Repro:** `npm run verify:input` → Suite "Gamepad: D-Pad + A waehlt Kael und startet": `waitForScene("run")`
  Timeout 8 s → gesamt FAIL 11/12. 2/2 Läufe am selben Schritt (verify-input.log + verify-input-retry.log).
- **Unabhängiger Repro-Probe** (`~/tmp/m10-sightprep-smoke/gp-probe.mjs`, Beleg `~/games/.evidence/m10-sightprep-smoke/b1-probe.txt`):
  boot→title OK, A@title→charselect OK, d-right OK, **A@charselect → Szene `title`** (statt `run`), 0 JS-Fehler, deterministisch.
- **Ursache (Datei-/Hebel-Pointer):** `src/scenes/CharSelect.ts` — Pad-Startfokus ist Knopfreihe:
  `padRow = 1` (create(), Z. 89) + `buttonFocus.setIndex(1)` (Z. 154) auf `footerButtons = [backButton, start]` (Z. 150).
  D-Pad-rechts (Button 15) wrappt in Reihe 1 `1 → 0` = **ZURÜCK**; A (confirm, `buttonIndex === 0`) → `action "back"` → Titel
  (`charSelectPadNav`, Z. 55: `st.buttonIndex === 0 ? "back" : "start"`).
  Erwartung des Harness `scripts/verify-input.mjs` (runGamepadSuite, Z. ~364–370): d-right soll **Kael wählen** (Reihe 0),
  A soll Run starten.
- **Abgrenzung Regression vs. alt:** `git diff 45c198d..HEAD -- scripts/verify-input.mjs scripts/harness.mjs src/input/ src/ui/ src/scenes/CharSelect.ts`
  = leer → der Befund existiert vermutlich schon **vor** den ~15 Merges (nicht frisch reingerutscht), blockiert aber
  den verify-input-Gate auf dem PIN und damit Doms Abnahme-Basis.
- **Fix-Hebel (für Dora):** entweder CharSelect-Startfokus auf Reihe 0 (`padRow = 0` + Panel-Fokus) oder Harness-Druckfolge
  anpassen — Entscheidung beim Fix-Job, NICHT hier.

### Befund B2 (Minor): Test-Flake — fx-mixel Timeout unter Volllast

- **Beobachtung:** Kontroll-Lauf `npm test` (gleicher PIN): `tests/fx-mixel.test.ts > nur Palettenfarben oder transparent …`
  bricht mit `TestTimeoutError` nach 5000 ms ab (1762/1763). Isoliert `npx vitest run tests/fx-mixel.test.ts` 2/2 grün (17/17).
- **Einordnung:** Last-Timeout unter 166 parallelen Worker-Dateien, kein Funktionsfehler. Beide Signale in
  `~/games/.evidence/m10-sightprep-smoke/gates.log`.
- **Fix-Hebel (für Dora):** `tests/fx-mixel.test.ts` — Timeout für den Pixel-Loop-Test erhöhen (z. B. 15000 ms) oder
  Testdatei serialisieren.
