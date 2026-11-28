# Balance-Abnahmekriterium geändert: Endlevel 25–40 (statt „Level 47“)

Datum: 2026-11-28 · Lane: `m10-acceptance-balance-criterion` · Typ: Doku-only (kein Code, kein Messen)

## Entscheidung

Das Balance-Abnahmekriterium lautet ab sofort:

> **Endlevel 25–40, 6/6 Läufe, Boss 20–60 s, kein Tod vor Minute 15**

Der frühere A5-Befund „Kael/Seed 101 erreicht Level 47 in 30 min“ ist **widerlegt** und als
aktives Kriterium gestrichen; er bleibt nur noch als widerlegte historische Aussage dokumentiert.

## Zustimmung (zitierfähig)

- **Frage (Lead, 2026-11-26 23:35**, `~/games/coding-brain/Lead/Fragen an Dom.md`, Abschnitt
  „Balance-Abnahme: Level 47 oder Korridor?“): Acht Reproduktionsläufe widerlegen Level 47
  (Ist: Level 28 bei Kael/101). **Empfehlung:** Abnahmekriterium auf „Endlevel 25–40, 6/6 Läufe,
  Boss 20–60 s, kein Tod vor Minute 15“ ändern und die 47 als widerlegt streichen.
- **Antwort (Claude im Auftrag von Dom, 2026-11-28 06:00Z):** *„Zugestimmt. Kriterium wird
  ‘Endlevel 25–40, 6/6 Läufe, Boss 20–60 s, kein Tod vor Minute 15’; die 47 als widerlegt streichen.“*

## Exakte Änderungen (diff, Lane-Branch `m10-acceptance-balance-criterion`, Commit `dce1bef`)

Zwei Stellen in `ACCEPTANCE.md`, sonst nichts:

1. **A5-Tabelle (Z. 151)** — vorher:

   > | balance Hauptläufe | A5-Befund „Kael/Seed 101 Level 47“ ist **widerlegt**: … ; nach Fix `7629b2f` (Merge `e4d7fba`) und QA-Merge `4c04404`: **6/6 im Korridor Level 25–40**, kein Tod vor Minute 15; **formale Kriteriumsänderung offen (Frage an Dom 23:35)** | … |

   nachher:

   > | balance Hauptläufe | Kriterium (Dom-Zustimmung 2026-11-28 06:00Z, `docs/qa/balance-criterion-2026-11-28.md`): **Endlevel 25–40, 6/6 Läufe, Boss 20–60 s, kein Tod vor Minute 15**. Historischer A5-Befund „Kael/Seed 101 Level 47“ ist **widerlegt**: … 6/6 im Korridor Level 25–40 | … |

2. **Offene Punkte / Restmängel (Z. 245)** — „formale Kriteriumsänderung offen (Frage an Dom 23:35)“
   entfernt; stattdessen steht das neue Kriterium mit Zustimmungs-Datum und Verweis auf diese Doku;
   „Level 47“ bleibt nur als „widerlegt“ im Satz.

## Begründung (Belege)

- **Level 47 widerlegt:** 8 Repro-Läufe erreichten Level 28 bei Kael/Seed 101
  (`shots/m10-balance-kael-repro.json`); XP-Budget-Analyse zeigt als Ursache die M8-Gegnerdichte
  (Gem-Sammelquote 28,4 %, 8.438 statt 11.689 Kills), nicht allein die XP-Kurve
  (`shots/m10-balance-kael-xp-budget.json`).
- **Korridor erreicht:** nach XP-Kurven-Fix `7629b2f` (Merge `e4d7fba`) und QA-Merge `4c04404`
  liegen 6/6 Läufe (mira/kael × Seed 101/202/404) im Korridor Level 25–40 (Ist: Level 27–30),
  Boss-Dauern 23–51 s, kein Tod vor Minute 15 (`shots/m10-balance-kael-final.json`).
- **Kosten-Nutzen:** Level 47 erzwingen hätte mehr XP/Killrate nötig gemacht und das Spielgefühl
  geändert, ohne Produktgewinn (Empfehlungsteil der Frage 23:35).

## Prüfung (Abnahmekriterien der Lane)

- `git diff main` enthält Änderungen **nur** an `ACCEPTANCE.md` (Z. 151, Z. 245) + dieser Doku; 0 Code-/Test-Dateien.
- `grep "Level 47" ACCEPTANCE.md`: nur noch im Sinne „widerlegt/historisch“ (2 Treffer, beide mit **widerlegt** markiert).
- `grep "25–40" ACCEPTANCE.md`: neues Kriterium an beiden betroffenen Stellen.
- Markdown-Tabellen intakt (A5-Tabelle bleibt 3-spaltig, Zeilen 148–153).
