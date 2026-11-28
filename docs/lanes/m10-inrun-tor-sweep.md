# Lane m10-inrun-tor-sweep — In-run-Heap-Tor in Abnahme-Dokus absichern (2026-11-28)

**Anlass:** Befund B2 der Nachabnahme G (`docs/qa/acceptance-refresh-g-2026-11-28.md`):
das In-run-Feld (Heap-Wachstum Minute 1 → 29 im Lauf) ist lauf-streuentransparent
instabil (GC-Sägezahn; +10,7 %/+14,9 % bei identischem Code) und darf in Abnahme-Dokus
nie wieder als Tor zitiert werden. Das Tor ist **retained Heap über Szenen-Teardown**
(endMB nach Results + GC vs. startMB nach Boot + GC, strikt < +15 %).

**Ziel:** Mechanische Verhinderung, dass künftige Abnahme-Dokus das instabile In-run-Feld
wieder als Tor ausweisen. Historische QA-Dokumente wurden **nicht** umgeschrieben
(Zeitzeugen) — nur der Lint-Bericht zählt.

**Karten:** #13451–#13454. Lane-Typ: Doku-/Prüf-Lane (eine von max. 2 Prüf-Lanes),
keine src-/tests-Produktcode-Änderungen.

## K1 — Lint-Skript `scripts/m10-acceptance-doc-lint.mjs`

Heuristik (2 Regeln, je Zeile von `docs/qa/*.md`):

| Regel | Bedingung | Bedeutung |
|---|---|---|
| `in-run-as-gate` | In-run-Marker (`In-run`, `Minute 1 → 29`, `m1→m29`, `Min 1→29`) + Wachstum `+NN %` + Tor-/Urteils-Kontext (±3 Zeilen: Tor/Gate/HARD/Urteil/PASS/FAIL/≤ +15/grün) | In-run-Feld als Tor-/Urteils-Basis zitiert |
| `heap-tor-pct-judgment` | „Heap-Tor“ + `+NN %` + PASS/FAIL **ohne** „retained“-Einordnung | Heap-Tor ohne retained-Attribution mit Prozentwert und Urteil |

Whitelist (Zeile wird nie gemeldet): `Beobachtung`, `nur Info`/`| Info |`,
„nie wieder als Tor“, historische Referenz („altes … Tor“), `historisch`.
(`retained` schützt zusätzlich Regel B: eine „Heap-Tor“-Zeile mit retained-Einordnung
wird nicht gemeldet; Regel A greift bei retained-Zeilen mit In-run-Marker weiter —
bewusst, denn eine retained-Zeile ist dann bereits korrekt als neues Tor ausgewiesen.)

Bericht: `shots/m10-doc-lint-2026-11-28.json` (git-ignored, kein Deliverable) +
Beleg-Kopie `~/games/.evidence/m10-inrun-tor-sweep/m10-doc-lint-2026-11-28.json`.
`--fail-on-findings` für harte Nutzung (Exit 1 bei Funden); Default Exit 0 + Bericht.

## K2 — Tests `tests/acceptance-doc-lint.test.ts`

14 Heuristik-Tests: Positiv-/Negativ-Beispiele aus echten QA-Dokumenten
(Nachabnahme F, Nachabnahme 27.11./C, Nachabnahme G als Whitelist-Fälle), Whitelist-Fälle,
Zeilennummern-Scan. Stand: **14/14 grün**, `npx tsc --noEmit` rc=0,
`npm test` **2529/2529** (233 Dateien), `npm run build` rc=0.

## K3 — Lint über den Ist-Bestand

`node scripts/m10-acceptance-doc-lint.mjs` über `docs/qa/` (11 Dateien) — **7 Funde**,
alle in Historien-Dokumenten vor der Tor-Entzerrung (F und früher). Das G-Dokument selbst
ist sauber (Whitelist greift: Beobachtungs-/Info-/altes-Tor-Zeilen). **Keine Änderung an
historischen QA-Dokumenten** (`git diff docs/qa` bleibt leer).

| # | Fund | Regel | Einordnung |
|---|---|---|---|
| 1 | `docs/qa/acceptance-refresh-f-2026-11-28.md:78` | heap-tor-pct-judgment | „Heap-Tor +18,2 % > +15 %“ als Urteil (altes In-run-Tor) |
| 2 | `docs/qa/acceptance-refresh-f-2026-11-28.md:79` | heap-tor-pct-judgment | Wiederholungslauf, „Heap-Tor +20,8 %“ + FAIL (altes Tor) |
| 3 | `docs/qa/acceptance-refresh-f-2026-11-28.md:82` | in-run-as-gate | Heap-Detail „Minute 1 → Minute 29 … (+18,2 %)“ neben FAIL |
| 4 | `docs/qa/reacceptance-2026-11-27.md:176` | in-run-as-gate | „Heap-Tor … im Lauf selbst FAIL — +21 % (Minute 1→29 …)“ |
| 5 | `docs/qa/reacceptance-c-2026-11-27.md:151` | in-run-as-gate | „Heap (hard) | Minute 1 → 29 … +21 % … FAIL“ |
| 6 | `docs/qa/reacceptance-c-2026-11-27.md:153` | heap-tor-pct-judgment | „Urteil K7 … Heap-Tor FAIL (+21 % > 15 %)“ |
| 7 | `docs/qa/reacceptance-c-2026-11-27.md:175` | heap-tor-pct-judgment | „Heap-Tor ≤ 15 % | FAIL (+21 % …)“ |

Alle 7 Funde sind korrekt: sie zitieren genau das später entzerrte In-run-Tor.
Bekannte Grenzen der Heuristik (bewusst konservativ gehalten): Zusammenfassungszeilen
ohne In-run-Marker und ohne „Heap-Tor“-Wort (z. B. „Heap 1× PASS / 1× knapp FAIL“ in
`reacceptance-2026-11-27.md:141/230`, Tabellenkopf `:126`) werden nicht gemeldet;
die verbindlichen Tor-Zeilen derselben Dokumente werden erfasst.

## K4 — Verfahrensanmerkung (künftige Abnahme-Dokus)

Siehe Folge-Commit (#13454) — Verfahrensanmerkung wird mit dem Lane-Abschluss ergänzt.

## Belege

- `~/games/.evidence/m10-inrun-tor-sweep/m10-doc-lint-2026-11-28.json` (11 Dateien, 7 Funde)
- `shots/m10-doc-lint-2026-11-28.json` (gleicher Inhalt, lokal)
- `npx vitest run tests/acceptance-doc-lint.test.ts` → 14/14; `npm test` → 2529/2529;
  `npx tsc --noEmit` rc=0; `npm run build` rc=0.
