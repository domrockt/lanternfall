# Lane m10-chaos-fix-dmg-overlap — B4 Fix: Damage-Number-Overlap, Kürzung, Anker

Datum: 2026-11-28 · Branch `m10-chaos-fix-dmg-overlap` · Basis: main `942af93`

## Auftrag

Befund **B4 (Minor)** aus der Audit-Lane `m10-chaos-legibility-audit`
(`docs/lanes/m10-chaos-legibility.md`, Beleg `shots/m10-chaos-leg-780-360-3-m25-2.png`):
`184526!` überlappt `4577`; Damage-calm-Cap greift (wenige Labels), aber es gibt
keine Überlappungsvermeidung, und 6-stellige Werte dominieren den Bildraum.

Fix in `src/systems/DamageNumbers.ts`, rein darstellerisch — Trefferverhalten
und Damage-Berechnung bitgleich (`report()` / `addDamage()` / `planLabels()`
unberührt, Summen-Erhalt bleibt).

## Karten

| # | Inhalt | Commit |
|---|--------|--------|
| #7058 | Vorher-Messung `scripts/m10-chaos-fix-dmg.mjs` + `shots/m10-chaos-fix-dmg-before-*` | `fc23dd0` |
| #7059 | Fix: Grid-Offset + Kürzung + Anker unterhalb | `d3661ce` |
| #7060 | Tests `tests/damage-grid.test.ts` (12 → 14) | `b77a477` |
| #7061 | Grid-Spirale nie nach oben (dy ≥ 0) + Nachher-Messung + Doku | `05b6af7` + finaler Commit |

## Messaufbau (`scripts/m10-chaos-fix-dmg.mjs`)

- View 780×360@3 (wie der Audit-Beleg), Seed fest, god+autoPlay, 6 Evolutionen Lv8.
- Szenarien: **m25** (Minute-25-Chaos via `skipTo(1490)`, auf 300 Gegnern
  nachgespawnt) und **stress500** (auf 500 nachgespawnt, zähere `knight`, da
  bog_rats am 6-Evo-Build schneller sterben als der Spawner nachlegt).
- 3 Frames je Szenario; Metriken werden **aus dem Lauf gelesen** (Label-Rects
  aus den gepoolten PixelText-Views, Glyphenraster 6×7 px, Scale, Kamera-Scroll)
  und nach jedem Frame ins JSON geflusht (Supervisor-Anforderung); Screenshots
  `shots/m10-chaos-fix-dmg-<tag>-<szene>-f<N>.png`.
- Keine FPS-Messung → kein flock.

## Vorher (Baseline, `fc23dd0`)

- Overlap-Paare: 0–2 je Frame (stochastisch; Audit-Shot zeigt `184526!` über
  `4577`; in einem Zwischenlauf `23040!`/`13405!` + `11610!`/`104`).
- 7-Zeichen-Label `101266!` bzw. `112050!` (6-stellig, ungekürzt) in je einem
  Stress-Frame; max. Breite 66 px (Scale 1,6).
- Verdeckte Sprite-Zentren: 11–16 je Stress-Frame (Anker lag ÜBER dem Gegner).
- Gegnerzahlen: 300 (m25) / 494–503 (stress500). JS-Fehler: 0.

## Fix (3 Hebel, alle in `src/systems/DamageNumbers.ts`)

1. **Grid-Offset bei Kollision** — `pickGridSlot()`: freier Grid-Slot
   (Zellen 64×22→24 px); natürliche Position bleibt, wenn die Zelle frei ist;
   sonst deterministische Spirale um ganze Zellen (Radius 3), zusätzlich
   Rechteck-Check gegen platzierte Labels inkl. Sink-Reserve (der Cluster-Test
   deckte die Lücke „Zelle frei, aber Rects überlappen“ auf). **Spirale nur
   dy ≥ 0** — ein Versatz nach oben würde wieder über das Anker-Sprite
   rutschen (After-Lauf ohne diese Sperre: occl 10–16).
2. **Kürzung** — `formatDamageLabel()`: ≥ 100.000 → `184,5k` (deutsches Komma,
   `,0` entfällt), max. 6 Zeichen inkl. `!`; Krit-Fallback ganze k (`185k!`),
   Extremfall ≥ 1e9: Ziffern absehen. Wert im Eintrag bleibt exakt.
3. **Anker unterhalb** — Label startet 12 px unter dem Gegner-Zentrum und
   sinkt um 12 px nach unten weg (statt aufsteigend über das Sprite).

## Nachher (`shots/m10-chaos-fix-dmg-after-*`)

| Metrik | Vorher | Nachher | Abnahme |
|---|---|---|---|
| Überlappende Label-Paare (6 Frames) | 0–2 (Audit: belegt) | **0 / 0 / 0 je Frame** | ✓ |
| Max. Labelzeichen (inkl. `!`) | 7 (`101266!`) | **6** (Format-Tests decken ≥ 100.000 ab: `184,5k`) | ✓ |
| Anker-Gegner verdeckt (ownCovered, Probe) | ja (Anker über Gegner) | **0 von 4+6+6 Labels in allen Frames** | ✓ |
| JS-Fehler | 0 | 0 | ✓ |

- Rest-`occludedSprites` 2–16 in der JSON-Kontextmetrik = **fremde** Nachbarn:
  in der 500er-Dichte liegen unweigerlich andere Gegner unter einem Label-Rect.
  Die Probe (`ownCovered`) belegt, dass der **Anker**-Gegner nie verdeckt wird —
  strukturell garantiert (Spirale nie dy < 0, Label beginnt ≥ 12 px unter dem
  Zentrum und sinkt weiter weg; Unit-Tests `nie dy<0` / `y nie < Basis`).
- Sichtprüfung After-Shot: Labels sitzen unterhalb, getrennt, kein Stapel.

## Tests

- `tests/damage-grid.test.ts` (14 Tests): Kürzung (`184,5k`, ≤ 6 Zeichen über
  Wertebereich inkl. 1e12/1.5e15, Krit-Fallback, NaN/Inf-Guard), Grid
  (deterministisch, nie dy<0, Cluster-Repro 12 Labels/3 Trauben 0 Überlappe,
  Sättigungsfall), Anker (unterhalb, Nachbarzeile bei Sink frei).
- Gesamtsuite: **93 Dateien / 986 Tests grün**, `npx tsc --noEmit` grün,
  `npm run build` grün.

## Offene Punkte / Hinweise

- Die Kürzungsschwelle (≥ 100.000) wurde im In-Game-Repro nicht getroffen
  (größter Fold-Wert 71.651) — Format ist per Unit-Test + Isolation-Probe
  (`100572 → 101k!`) belegt.
- Supervisor-Hinweis (Timeout) geprüft: Läufe liefen nicht in den 570-s-Timeout;
  JSON wird dennoch je Frame inkrementell geflusht.
- Temp-/Probe-Dateien liegen unter `~/tmp/m10-chaos-fix-dmg/`, nicht im Worktree.
