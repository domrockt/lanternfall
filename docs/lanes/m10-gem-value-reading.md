# Lane m10-gem-value-reading — XP-Gems im Chaos lesbar (3 Wertstufen)

Ziel: XP-Gems im 300–500er-Chaos in 3 Wertstufen (klein/mittel/groß) ohne Hover
lesbar machen — Farb-Rampe + Größenstufe aus der Nacht-/Gold-Palette.
gem-magnet / gem-drawcap sind gemergt: Cap (MAX_VISIBLE_GEMS = 120),
Merge-Überschuss, Tween je Gem und XP-Erhalt (<= 1 %) bleiben **bitgleich**;
diese Lane ändert nur Darstellung/Stufe-Zuordnung, nicht die XP-Wirtschaft.

Karten: #10177 Ist-Messung · #10178 Farbrampe · #10179 Guard-Test · #10180 Nachher + Abnahme.

## Karte #10177 — Ist-Messung (BEVOR der Fix)

Skript: `scripts/m10-gem-reading.mjs` (Chaos via Spawn-Automat: 500 Gegner
 aufgefüllt, autoPlay, god, Seed 1; Gem-Drops laufen über den echten
 Kill→drop()-Pfad; Zeit eingefroren; Klassifikation aus den Gem-Texturen +
 Screenshot-Pixeln).

Belege (nicht in git, Dom-Regel 27.11.):
- `/home/ai/games/.evidence/m10-gem-value-reading/gem-reading-before.json`
- `/home/ai/games/.evidence/m10-gem-value-reading/chaos-before-960.png` / `-640.png`

### Vorher-Zahlen (960x540, 305 Gem-Drops, 108 Gems im Feld bei Cap 120)

| Stufe | Kernfarbe (Dominanz ohne Ink) | px-Fläche (opak) |
|---|---|---|
| small | 0x6f9b58 marshLight | 31 |
| medium | 0xffb84d amber | 57 |
| large | 0xb8303f crimson | 81 |

- Paarweise RGB-Delta: small–medium 147,3 · medium–large 154,1 · small–large 131,9
- Größenordnung monoton: 31 < 57 < 81 ✔
- Off-Palette-Pixel in den Gem-Texturen: **0** ✔
- Chaos-Kollision (Anteil Frame-Pixel <= 60 RGB-Distanz zur Kernfarbe):
  **small 7,43 %** · medium 1,94 % · large 1,37 %

### Befund

Die kleinen Gems sind **marshLight-Grün** — genau die Farbe der Bog-Horde
(7,43 % des Chaos-Frames liegen nahe dieser Farbe; Kandidaten-Sweep, ein Lauf:
marsh 42,5 %, marshLight 7,43 %, fogBlue 0,01 %, mist 0,21 %, paleMist 0,13 %,
glow 0,2 %). Grün ist im Moor-Chaos verbrannt; Blau/Grau-Blau und die warmen
Akzente sind praktisch frei. medium/large (amber/crimson) sind bereits sauber.

### Entscheidung (datengestützt, verfolgt über 3 Iterationen)

Rampe Silber → Gold → Rubin (Edelstein-Semantik, alle Farben aus der Palette):

| Stufe | Kern | Highlight (+Sparkle) | Chaos-Kollision | Verwerfungen |
|---|---|---|---|---|
| small | bone (10) | candleWhite (12) + lanternWhite (13) | **2,24 %** | r1 mist (8): exakte Bog-Rat-Flankenfarbe (art-director FAIL, sharpenEnemyGrid hebt Rat-Midtone auf PAL 8); r2 fogBlue (6): **29,45 % Boden-Kollision** (RGB-Dist zum marsh-Boden nur 39,6) |
| medium | amber (20) | lantern (21) + 3 px lanternWhite (13) | 2,10 % | art-director r1: auf Glow-/Brand-Decals Kontrast ~0 → heller Kern |
| large | crimson (25) | hotRed (26) | 1,57 % | ok |

Zusätzlich (art-director r1): LOD-Dim der Gems 0,55 → **0,8** (`GEM_DIM_ALPHA`
in PickupSystem.ts) — 0,55 machte alle Rampenfarben zu Matsch (gemessener
Large-Kern (143,71,62) statt crimson). Nur Darstellung, keine XP-Wirtschaft.

Lektion zum Kandidaten-Sweep: die frame-weite Kollisionsmetrik mit „first
match wins" hat einen Order-Bias bei engen Farbpaaren (marsh klaut fogBlue
die Pixel: Sweep sagte 0,01 %, ehrliche Ist-Kollision 29,45 %). Verbindlich
ist die je-Stufe-Messung gegen die 3 Gem-Kernfarben.

Hinweis: Gem-Drops werden über Kills erzeugt; bei gemergtem Draw-Cap (120)
liegen nie 300 Gems gleichzeitig im Feld — gemessen werden >= 300 Drops
(305/309) plus der volle Feldstand. Das Chaos-Bild ist das echte Spielmaximum.

## Karte #10178/#10179 — Fix + Guard-Test

Umsetzung:
- `src/logic/xp.ts`: `GEMS.color` korrekt gegen die Texturen + exportierte
  `GEM_VALUE_RAMP` (core/highlight/sparkle je Stufe) + `gemStageForValue(value)`
  als EIN deterministisches Wert→Stufe-Mapping.
- `src/systems/PickupSystem.ts`: `mergeGemValues` nutzt `gemStageForValue`
  (Schwellen identisch → Merge-Semantik bitgleich); Drop-Pfad unverändert
  (`gem_${size}`-Texturen, Cap/Magnet/XP-Erhalt unberührt); LOD-Dim 0,8.
- `src/gfx/textures.ts`: gem_small/gem_medium malen die Rampe (Char-Mapping:
  a→10 bone, c→12 candleWhite, d→13 lanternWhite, k→20 amber, l→21 lantern,
  p→25 crimson, q→26 hotRed, 0→ink).
- `tests/gem-value-reading.test.ts`: 10 Tests — GEMS.color == Rampen-Kern,
  paarweise Deltas 137,4/154,1/197,7 >= 120, Fläche 31 < 57 < 81 und
  49 < 81 < 121, XP 2 < 6 < 18, Gem-Texturen malen NUR Ink+Kern+Highlight+
  Sparkle (0 Off-Palette, direkt gegen PAL geprüft), MAX_VISIBLE_GEMS == 120,
  GEM_DIM_ALPHA >= 0.8, `mergeGemValues` XP-Erhalt exakt (value + credited ==
  Summe).

Commits: 7937d48b (#10178), 17b52c0a (#10179), 27a1837e (#10180-Fix r2),
r3 siehe Karte #10180.

## Karte #10180 — Nachher-Messung + Abnahme (r3)

Belege:
- `/home/ai/games/.evidence/m10-gem-value-reading/gem-reading-after.json`
- `/home/ai/games/.evidence/m10-gem-value-reading/chaos-after-960.png` / `-640.png`
- 3x-nearest-Zoom: `~/tmp/m10-gem-value-reading/zoom3-after-960.png` (Vergleich: zoom3-before)
- Abnahme-Bilder (git): `shots/abnahme/m10-gem-value-reading-960.png`, `-640.png`

### Nachher-Zahlen r3 (960x540, Gem-Drops >= 300, 0 JS-Fehler)

Kontrolleure (28.11.):
- art-director Runde 2: **PASS 4,5/5** (Bone-Rampe) — 3 Stufen sofort
  unterscheidbar (Farbe + Groesse), bone-Gems vor Moor-Boden und neben der
  Knochen-Familie sauber getrennt, Sparkles wirken, 0 off-palette, LOD-Dim 0.8
  ok. Nicht blockierende Empfehlungen (backlog-wuerdig): large-Gem dunklere
  Schattenstufe unten-rechts, small-Konturton vereinheitlichen. Beleg: echtes
  3x-nearest-Zoom `~/tmp/m10-gem-value-reading/zoom3-after-960.png` (2880x1620;
  das erste zoom3-File war fälschlich 1x — vom Kontrolleur ersetzt).
- reviewer: **PASS** — Cap/Merge-Semantik bitgleich (mergeGemValues über
  gemStageForValue mit identischen Schwellen, Drop-Pfad/Magnet/XP-Erhalt
  unberührt), Test-Assertions mit nachgerechneten Deltas, 18/18 grün.
  Bereinigt: Code-Kommentare auf die verbindliche je-Stufe-Kollision 2,24 %
  (statt Sweep-Zahl 2,03 %) angeglichen.


| Stufe | Kernfarbe | px-Fläche | Δ zur nächsten Stufe | Chaos-Kollision |
|---|---|---|---|---|
| small | 0xb8c4c2 bone | 31 | 137,4 (zu amber) | **2,24 %** (vorher grün 7,43 %) |
| medium | 0xffb84d amber | 57 | 154,1 (zu crimson) | 2,10 % (vorher 1,94 %) |
| large | 0xb8303f crimson | 81 | 197,7 (small↔large) | 1,57 % (vorher 1,37 %) |

Verlauf der small-Kollision über die Iterationen: marshLight 7,43 % →
mist 2,59 % (aber exakte Rat-Flankenfarbe, art-director FAIL) → fogBlue
29,45 % (Boden, verworfen) → **bone 2,24 %** ohne exakten Gegner-Farbtreffer.

- Paarweise Deltas 137,4 / 154,1 / 197,7 — alle >= 120 ✔
- Größenordnung monoton: 31 < 57 < 81 (opake px) ✔
- Off-Palette-Pixel in den Gem-Texturen: **0** ✔
- gem-draw-cap + pickup-gems Tests unverändert grün; Guard-Test 10/10 ✔
- `npm run build` rc=0; 0 pageerror/console.error (960 + 640) ✔
- 640x360-Lauf: ebenfalls 300+ Drops, 0 JS-Fehler (siehe after-JSON).

Restkollision 2,24 % bei small stammt aus der Knochen-Familie im Frame
(Steine/Ripple, 2,05 % im Kandidaten-Sweep); die 1-px-Ink-Kontur, die
candleWhite-/lanternWhite-Glanzpixel und die Luminanz (bone ~193 vs Boden
~31–81) tragen die Ablesbarkeit. art-director r2 (Bone-Rampe): PASS 4,5/5.

## Abnahme-Kriterien (Ergebnis)

| Kriterium | Ergebnis |
|---|---|
| 3 Wertstufen paarweise farb-distant (Delta >= 120, Zahl im JSON) | ✔ 137,4 / 154,1 / 197,7 |
| Größenordnung monoton | ✔ 31 < 57 < 81 |
| XP-Erhalt + Cap/Merge bitgleich, npm test grün | ✔ Guard 10/10, gem-draw-cap unverändert |
| 0 Off-Palette-Pixel (Gem-Texturen) | ✔ 0 |
| art-director >= 4/5 auf dem Chaos-Frame | ✔ r2: **4,5/5 PASS** (r1 3/5 FAIL → Bone-Rampe-Fix) |
| npm run build rc=0, 0 JS-Fehler im Probe-Lauf | ✔ rc=0 (28.11. erneut), 0 pageerror/console.error (960+640), Suite 1773/1773 |

## Commit-Status (28.11. 09:15Z, Versuch 3)

Die Lane ist inhaltlich abnahme-reif, aber der #10180-Endcommit blockiert am pre-commit-Claimcheck:
`src/gfx/textures.ts` ist aktuell von der Lane `m10-fx-bakes-evo-r2` geclaimed (aktiv seit 08:59, legitim).
Drei Commit-Versuche (08:57, 09:08, 09:15) scheiterten an derselben Stelle → Retry-Loop gestoppt.

- Bereit im Worktree (staged, verzahnt — ein Split wurde geprüft und verworfen: Guard-Test prüft
  Sprite-Rows aus textures.ts gegen die Rampen-Konstanten in xp.ts, ein Commit ohne textures.ts
  wäre rot): `src/gfx/textures.ts` (nur gem_small/gem_medium-Rows + Kommentare), `src/logic/xp.ts`,
  `tests/gem-value-reading.test.ts`.
- Exakter Patch: `git diff HEAD -- src/gfx/textures.ts` (gem-Rows r3 Silber/Gold/Rubin, Konflikt-frei
  zu den fx-Blöcken). Antrag in `/home/ai/games/.dispatch/requests.md` (09:05Z): Freigabe nach dem
  fx-bakes-evo-r2-Merge oder disjunkter Mini-Job (Präzedenz m10-powerup-sfx-wire).
- Nächster Versuch: nur die drei gestagten Code-Dateien committen (`#10180`), dann .lane-done.


## Run-Fortsetzung (28.11. 09:18–09:20Z, Versuch 4)

- Sanity: `npx tsc --noEmit` clean, `npx vitest run tests/gem-value-reading.test.ts` 10/10 grün, Diff unverändert gestaget (textures.ts 20 Z, xp.ts 24 Z, Test 8 Z).
- Commit-Versuch 09:18Z: erneut am pre-commit-Claimcheck gescheitert (`src/gfx/textures.ts -> m10-fx-bakes-evo-r2`). Kein Retry-Loop, Karte #10180 bleibt `blocked` mit aktueller Notiz.
- Alternativen geprüft und verworfen: (a) Split ohne textures.ts — Guard-Test importiert `SPRITE_GRIDS`, wäre rot; (b) Draw-Time-Tint in PickupSystem statt Textur-Farben — Verschlechterung, art-director-Abnahme galt der Textur-Rampe; (c) Umgehung des Hooks — verboten.
- Wartet unverändert auf Disponent: Mini-Job `m10-gem-rows-texture` (exakter Patch: `git diff HEAD -- src/gfx/textures.ts`) oder Claim-Freigabe nach fx-bakes-evo-r2-Merge. Danach: 3 Dateien committen (`#10180`) + `.lane-done`.

## Run-Fortsetzung (28.11. 09:26–09:32Z, Versuch 3 / Run 5)

- Claim-Lage neu geprüft: `src/gfx/textures.ts` weiterhin bei `m10-fx-bakes-evo-r2`
  (claims.json mtime 09:22Z; Lane aktiv, Commit 8eab0388 09:21:32Z, Worktree dirty —
  legitime Nutzung, kein Eingriff). Dora-Mini-Job `m10-gem-rows-texture` noch nicht
  gestartet (kein Worktree/Branch, Queue hinter m10-chest-arrow-texture-r2).
- Ready-Zustand frisch verifiziert (09:27–09:31Z): `npx tsc --noEmit` clean,
  Guard-Test 10/10, **Full-Suite 167 Files / 1773 Tests grün (rc=0)**,
  `npm run build` rc=0 (Log: `~/tmp/m10-gem-value-reading-build.log`).
- Kein weiterer Commit-Retry im Loop (4 Fehlversuche belegt); stattdessen
  Automation geplant: alle 45 min Prüfung, ob der Claim frei ist bzw. die
  gem-Rows über den Mini-Job in main gelandet sind → dann Endcommit (#10180),
  Board auf done, `.lane-done`. Automation wird nach Lane-Abschluss gelöscht.
- Bedarf an den Disponent UNVERÄNDERT: gem_small/gem_medium-Row-Schnitt
  (Mini-Job `m10-gem-rows-texture`) oder Freigabe nach fx-bakes-evo-r2-Merge.

## Run-Fortsetzung (28.11. 09:35–09:38Z, Versuch 1 / Run 6)

- Endcommit-Versuch nach scheinbar freiem Claim: **vom pre-commit-Hook korrekt blockiert**
  (`src/gfx/textures.ts -> m10-fx-bakes-evo-r2`). Ursache war ein Fehler im eigenen
  Re-Check: `'textures.ts' in v.get('globs',[])` ist Listen-Membership und meldet für
  `'src/gfx/textures.ts'` fälschlich „nicht geclaimed" — Substring-Check über `str(v)`
  zeigt: **Claim weiterhin aktiv** (claims.json mtime 09:33Z). Hook hat den Fehlgriff
  abgefangen, kein Schaden; falscher Re-Check nicht wiederholt.
- Alte Automation `aut_22169de2d…` gelöscht — ihr Prompt enthielt exakt denselben
  fehlerhaften Check und hätte einen sinnlosen Commit-Versuch ausgelöst. Ersetzt durch
  `aut_22182edd40017Enkrgc9rUIIUZ` (alle 25 min, läuft 10:00/10:25/10:50Z, Ablauf 10:55Z)
  mit korrigiertem Substring-Check; bei freiem Claim: Endcommit (#10180), Board done/review,
  `.lane-done`, Automation löschen.
- Ready-Zustand unverändert: r3-Patch gestaget (textures.ts 20 Z, xp.ts 24 Z, Test 8 Z),
  Guard-Test 10/10 grün (09:35Z), Full-Suite + Build grün (09:27–09:31Z, s. Run 5).
- Bedarf UNVERÄNDERT: gem_small/gem_medium-Row-Schnitt in textures.ts via Mini-Job
  `m10-gem-rows-texture` oder Freigabe nach fx-bakes-evo-r2-Merge.

## Run-Fortsetzung (28.11. 09:37–09:40Z, Versuch 2 / Run 7)

- Ready-Zustand frisch verifiziert (09:37Z): `npx tsc --noEmit` clean,
  `npx vitest run tests/gem-value-reading.test.ts` 10/10 grün, r3-Patch gestaget
  (textures.ts 20 Z, xp.ts 24 Z, Test 8 Z) — unverändert zu Run 6.
- Claim-Lage (Substring-Check 09:37Z): `src/gfx/textures.ts` weiterhin bei
  `m10-fx-bakes-evo-r2` (Lane aktiv: K3-Commit 20a79970, kein `.lane-done`).
  Mini-Job `m10-gem-rows-texture` noch nicht gestartet (Queue hinter
  m10-chest-arrow-texture-r2). Kein Commit-Retry im Loop.
- Doppel-Automation bereinigt: die beiden aktiven Rechecks feuerten fast
  gleichzeitig (v2 10:00:58Z, #2 10:01:34Z) — einmaliger Recheck #2
  (aut_221837c…) gelöscht, wiederkehrende v2 (aut_22182edd…, alle 25 min bis
  10:55Z) bleibt aktiv.
- Board: #10180-Notiz Run 7 gesetzt. #10177-#10179 konnten nicht auf `done`
  gezogen werden — das Board-Plugin verweigert `done`-Moves bei uncommittetem
  Worktree (r3-Patch wartet auf den Claim); sie bleiben korrekt in `review`,
  Commit-Belege (186d0f57/7937d48b/17b52c0a) + reviewer-PASS stehen in der Doku.
- Kein voller Build/Suite erneut gefahren (Tempo-Regel; Belege Run 5: Suite
  1773 grün, Build rc=0, 0 JS-Fehler).
- Bedarf UNVERÄNDERT: gem_small/gem_medium-Row-Schnitt via Mini-Job
  `m10-gem-rows-texture` oder Freigabe nach fx-bakes-evo-r2-Merge.

## Run-Fortsetzung (28.11. 09:41–09:45Z, Versuch 3 / Run 8)

- Ready-Zustand frisch verifiziert (09:41Z): `npx tsc --noEmit` clean,
  `npx vitest run tests/gem-value-reading.test.ts` 10/10 grün, r3-Patch gestaget
  (textures.ts 20 Z, xp.ts 24 Z, Test 8 Z) — unverändert zu Run 6/7.
- **Neu (Dora-Beschluss in requests.md):** Mini-Job `m10-gem-rows-texture` ist
  offiziell eingereiht — gem_small/gem_medium-Row-Schnitt, **after
  m10-chest-arrow-texture-r2** in der textures.ts-Queue; K1 des Mini-Jobs prüft,
  ob diese Lane den Patch selbst committet (dann Job obsolet).
- Queue-Stand 09:43Z: `m10-chest-arrow-texture-r2` noch nicht gestartet
  (kein Worktree, keine .lane-done). Claim `src/gfx/textures.ts` weiterhin
  bei `m10-fx-bakes-evo-r2` (Substring-Check 09:41Z).
- Kein Commit-Retry (4 dokumentierte Fehlversuche); Automation v2
  (aut_22182edd…) aktiv, nächster Recheck 10:00:58Z. Bedarf UNVERÄNDERT:
  gem-Rows via Mini-Job oder Freigabe — danach 3 Dateien committen (#10180),
  Board done, `.lane-done`.

## Run-Fortsetzung (28.11. 09:48–09:52Z, Versuch 4 / Run 9)

- Ready-Zustand frisch verifiziert (09:49Z): `npx tsc --noEmit` clean,
  `npx vitest run tests/gem-value-reading.test.ts` 10/10 grün, r3-Patch gestaget
  (textures.ts 20 Z, xp.ts 24 Z, Test 8 Z) — unverändert zu Run 6/7/8.
- Claim-Lage (Substring-Check 09:48Z): `src/gfx/textures.ts` weiterhin bei
  `m10-fx-bakes-evo-r2`. Lane aktiv und NICHT gemergt (`git merge-base
  --is-ancestor m10-fx-bakes-evo-r2 main` → NOT-MERGED; K3-Commit 20a79970
  08:59). Mini-Jobs `m10-chest-arrow-texture-r2` / `m10-gem-rows-texture`
  nicht gestartet (keine Worktrees). Kein Commit-Retry (4 dokumentierte
  Fehlversuche).
- **Done-Moves #10177–#10179 versucht (09:49Z)**: vom Board-Plugin korrekt
  verweigert („5 uncommitted change(s)… Commit this card's work first“) —
  die Karten bleiben in `review`, bis der r3-Endcommit (#10180) durch ist;
  dann bewegt die Automation v2 sie zusammen mit #10180.
- Worktree-Hygiene: spuriously regenerierte `shots/m10-passive-math-*.json`
  (nur `generatedAt`, 09:28) zurückgesetzt; board.json-Plugin-Churn
  (Re-Escapes, next 10565→10728) bewusst uncommittet gelassen.
- Automation v2 (aut_22182edd…) aktiv, nächster Recheck 10:00:58Z, läuft bis
  10:55Z. Bedarf UNVERÄNDERT: gem_small/gem_medium-Row-Schnitt via Mini-Job
  oder Freigabe nach fx-bakes-evo-r2-Merge — danach 3 Dateien committen
  (#10180), Board #10177–#10180 done/review→done, `.lane-done`.

## Run-Fortsetzung (28.11. 09:55–09:58Z, Versuch 2 / Run 10)

- **Session-Fix:** Resume lief als NEUE Session (ses_dde6c8fdeffetvq5zty5AqB0vY);
  beide Recheck-Automations (v2 + Backup) zeigten noch auf die alte Session
  (ses_dde9a0acdf…) — bei freiem Claim wäre der Commit-Prompt ins Leere gelaufen.
  Beide gelöscht und als **v3** (aut_221953ff6001…, alle 25 min bis 10:57Z,
  erster Recheck 10:20:59Z) und **Backup** (aut_221953ff9001…, einmalig 11:10Z)
  auf die aktuelle Session neu angelegt; Prompt um „zuerst fertig?-Check +
  Commit nur die 3 gestageten Dateien + npm test/build 1x" ergänzt.
- Claim-Lage (Substring-Check 09:54Z): `src/gfx/textures.ts` weiterhin bei
  `m10-fx-bakes-evo-r2`, NOT-MERGED (merge-base-Check 09:54Z). Mini-Jobs
  `m10-chest-arrow-texture-r2` / `m10-gem-rows-texture` nicht gestartet
  (kein Worktree). Kein Commit-Retry (4 dokumentierte Fehlversuche).
- Ready-Zustand unverändert zu Run 9 (frisch verifiziert 09:49Z): tsc clean,
  Guard 10/10, r3-Patch gestaget (textures.ts 20 Z, xp.ts 24 Z, Test 8 Z);
  Kontrolleure beide PASS (art-director r2 4,5/5, reviewer bitgleich 18/18).
- Bedarf UNVERÄNDERT: gem-Rows-Freigabe oder fx-Merge; danach macht v3 den
  Endcommit + Board-Moves + `.lane-done` automatisch.

## Run-Fortsetzung (28.11. 10:00–10:06Z, Versuch 3 / Run 11)

- **Wendepunkt:** `m10-fx-bakes-evo-r2` ist **lane-done** (Commit 49b3879a,
  10:02:08Z). Der Disponent hat `src/gfx/textures.ts` sofort an den nächsten
  in der textures.ts-Queue rotiert: **`m10-chest-arrow-texture-r2`** (Worktree
  frisch auf main 20395582, noch keine eigenen Commits). Damit ist der Claim
  NICHT frei — die Warteschlange läuft weiter.
- **Recheck v4 (session-unabhängig):** beide Session-Automations (v3 +
  Backup, Zeiger auf tote Session ses_dde6c8fdef…) gelöscht. Neu:
  Shell-Automation (`~/tmp/m10-gem-value-reading/recheck-v4.sh`, alle 15 min
  bis 14:00Z) — prüft Claim über Substring, und falls frei: Staged-Guard
  (exakt die 3 Dateien), tsc + Guard-Test + Build, Endcommit mit
  Pfad-Parametern, Board-Moves #10177–#10180 → done, `.lane-done` + Commit.
  Log: `~/tmp/m10-gem-value-reading/recheck-v4.log`. Erster Lauf 10:03:38Z:
  WAIT (Claim bei m10-chest-arrow-texture-r2) — korrektes Verhalten.
- Ready frisch verifiziert (10:02Z): tsc clean, Guard 10/10, r3-Patch
  gestaget — unverändert zu Run 6–10.
- **Antrag an den Disponenten (requests.md 10:05Z):** da diese Lane
  abnahme-reif ist (Kontrolleure PASS, Patch gestaget) und der gem-Rows-
  Schnitt ohnehin IHRE r3-Rows sind: textures.ts-Slot bitte direkt nach
  `m10-chest-arrow-texture-r2` dieser Lane geben (dann committet die v4-
  Automation binnen 15 min) statt einen eigenen Mini-Job zu starten.
- Kein Commit-Retry (4 dokumentierte Fehlversuche); keine sleeps.

## Run-Abschluss (28.11. 12:36–12:41Z, Versuch 1 Fortsetzung / Run 12 — LANE FERTIG)

- **Claim-Rotation eingetreten:** claims.json (12:3xZ) hält `src/gfx/textures.ts`
  jetzt bei `m10-gem-value-reading` (fx-bakes-evo-r2, chest-arrow-texture-r2 und
  texture-glow-swap-r2 sind durch). Der ausstehende r3-Patch lag als unstaged
  Diff im Worktree vor (Run 6–11 haben ihn korrekt NICHT committed).
- **Endcommit 906637a8** (`#10180`, nur src/gfx/textures.ts, 10 Zeilen):
  gem_small-Row r3 = bone (PAL 10) + candleWhite-Glanz (12) + lanternWhite-
  Sparkle (13) — Silber-Ende der Rampe, 2,24 % Moor-Boden-Kollision statt
  29,45 % (fogBlue r2). xp.ts + Guard-Test waren bereits in cce20452.
- **Ready frisch verifiziert 12:36Z:** tsc clean, Guard-Test 10/10,
  `npm run build` rc=0 (446 ms), volle Suite **1773/1773** (167 Dateien).
- Kontrolleure (Vorversuch 09:05Z, unverändert gültig): art-director r2
  **4,5/5** auf shots/abnahme/m10-gem-value-reading-{960,640}.png,
  reviewer PASS (Merge-Semantik bitgleich 18/18).
- Recheck-Automation v4 (aut_2219d80db…) nach manuellem Endcommit **gelöscht**;
  Board #10177–#10180 → **done** (zwei spuriously regenerierte
  shots/m10-passive-math-*.json zuvor via checkout zurückgesetzt).
- Belege: ~/games/.evidence/m10-gem-value-reading/ (gem-reading-before/after.json,
  Chaos-Frames); Abnahme-Bilder in shots/abnahme/ (bereits committed).
- Offene Punkte: keine. `.lane-done` folgt imselben Commit.
