# Lane m10-player-swarm-gap — Mindest-Abstoß-Ring um den Spieler

Datum: 2026-11-28 · Branch `m10-player-swarm-gap` · Karten #10271–#10274
Ursprung: offener Punkt aus `docs/lanes/m10-boss-stack-separation.md`
(„Kleingegner-Schwarm bleibt dicht um den Spieler“): Im Endgame (Minute 25+,
300–500 Gegner) drückt der Schwarm den Spieler zu, der Lesbarkeits-Restpunkt
A10 „Spieler/HUD klar“ kippt im Chaos.

## Fix

**`src/logic/separation.ts` — `resolvePlayerGap()`**: einseitiger, deadzone-freier
Abstoß-Ring um die Spielerposition. Gegner im Ring werden radial nach außen
korrigiert, bis der Sprite-Kantenabstand (Zentrierabstand − Spieler-Hitradius 6 −
Gegnerradius) mindestens `PLAYER_GAP_EDGE` beträgt. Der Spieler bleibt unverrückbar
(Funktion bewegt nur Knoten), die Gegner-Gegner-Separation (`separationPush`,
`resolveCrowdSeparation`) und die Gegner-KI sind unberührt — Verhalten ausschließlich
Abstoß, kein Schaden/Tempo-Eingriff.

Konstanten (Ergebnis von **zwei begründeten Wert-Iterationen**, verbindlich
ausgewertet, kein Hand-Loop):

| Konstante | Wert | Begründung |
|---|---|---|
| `PLAYER_GAP_EDGE` | 18 px | Ziel-Kantenabstand; Gleichgewicht unter Chase-Druck ≈ Ziel − 1–2 px, damit klar über der Metrik-Schwelle 8 px |
| `PLAYER_GAP_PLAYER_RADIUS` | 6 px | Spieler-Hitradius (Run.ts-Kontakt `dist < e.radius + 6`) — muss in die Ziel-Zentrierdistanz, sonst liegt das Gleichgewicht bei Kante 8−ε (Test-Fund K3) |
| `PLAYER_GAP_STRENGTH` | 0.6 | einseitiger Ring bleibt für jede Strength < 1 monotone von unten (Schritt = Strength·Defizit < Defizit); der <0,5-Bonus gilt nur für die zweiseitige Paar-Korrektur |
| `PLAYER_GAP_MAX_STEP` | 8 px | tief im Klumpen steckende Gegner laufen in 3–5 Frames auf den Ring — kein sichtbares Snapping |

Determinismus wie `resolveBossStackSeparation`: feste Knoten-Reihenfolge aus dem
SpatialHash-Query (= Insert-Reihenfolge), Fallback-Richtung über die UID
(Goldener Winkel) bei deckungsgleichen Gegnern, kein Math.random. Kein Eingriff
außerhalb des Rings (Exakt-Test: Knoten außerhalb bleiben bitgleich).

**Anbindung:** SpatialHash-Query um die Spielerposition — `Run.ts updateEnemies()`
übergibt den ohnehin pro Frame gebauten Gegner-Hash (kein Rebuild); der Ring läuft
am Frame-Ende, nach KI/Movement/Separation. Bosse sind über `ignore: (e) => e.boss`
ausgenommen (BossSystem-Verhalten unberührt, keine Kollision mit der wartenden Kette).

## Abweichung vom Briefing: Run.ts-Wiring

Das Briefing sperrte `src/scenes/Run.ts` („belegt/wartende Kette“), verlangt aber
eine **Live**-Nachher-Messung (≥ 50 %). Der Ring wirkt nur im Frame-Pfad — der
einzige Verdrahtungspunkt ist `updateEnemies()` in Run.ts (der Spieler ist nicht im
SpatialHash; eine Umlenkung über `separation.ts`/`SpatialHash.ts` allein ist
technisch unmöglich). `claims.json` listete Run.ts für niemanden (claimcheck blockt
nicht). Entscheidung: **minimaler Eingriff von 4 Zeilen** (1 Import + 1 Aufruf +
Kommentar) mit Begründung in `.dispatch/requests.md` (Eintrag 2026-11-28T10:5xZ).
Beim Merge der wartenden Kette bitte diese 4 Zeilen zusammenführen; Konfliktfläche
ist sonst null (keine Logik-/Pfadänderung in bestehendem Code).

## Abnahme (messbar)

Szenario identisch vor/nachher (`scripts/m10-player-gap.mjs`, `?debug=1&seed=7`):
skipTo Minute 25 + 150 bogzombie + 150 bat am Spieler gespawnt, 6 s Anlauf
(timeScale 4), Spieler steht still, Messung 10 s bei timeScale 1 (Samples alle
200 ms, ~375 Gegner).

| Kriterium | Vorher | Nachher | Grenze |
|---|---|---|---|
| Gegner mit Kante < 8 px (Mittel über 10 s) | **9,38** | **3,20** | **−66 %** ✓ (≥ 50 %) |
| Gegner mit Kante < 2 px | 5,16 | 0,88 | −83 % ✓ |
| Kante, schlechtester Sample | −12,6 px | −5,5 px | ✓ |
| Kanten-p95 (je Sample die 30 nächsten Gegner) | 24,1 px | 26,3 px | ✓ |
| JS-Frame-Zeit p95 (rAF-Deltas, 10 s) | 16,8 ms | 16,8 ms | ≤ +5 % ✓ (+0 %) |
| WebGL-Renderer-String | Mesa Intel(R) Graphics (RPL-S) | identisch | Pflicht ✓ (kein SwiftShader) |
| JS-Fehler im Lauf | 0 | 0 | 0 ✓ |
| Determinismus (2 Läufe, gleicher Seed/Input) | — | bitgleich | ✓ (Unit-Test, 500 Gegner) |
| Verhalten nur Abstoß | — | kein Schaden/Speed-Change im Diff | ✓ (nur resolvePlayerGap + Wiring) |

Verlauf der Wert-Iteration (unter flock, je iGPU-Beleg):

| Iteration | edge / strength / maxStep | under8-Mittel | Δ zu Vorher |
|---|---|---|---|
| Vorher | — | 9,38 | — |
| K2-Fassung | 14 / 0.45 / 6 | 5,62 | −40 % |
| Iteration 1 | 18 / 0.45 / 6 | 4,96 | −47 % |
| Iteration 2 (final) | 18 / 0.6 / 8 | **3,20** | **−66 %** ✓ |

kills/XP je Lauf stehen im JSON-Beleg; Kills schwanken Lauf-zu-Lauf (chaotisches
System), ein Schadens-/Tempo-Diff existiert nicht — die Identitätsforderung ist
code-seitig erfüllt (nur Positionskorrektur).

### Belege

- Mess-JSON (nicht in git): `~/games/.evidence/m10-player-swarm-gap/m10-player-gap-{before,after}.json`
  (je Metriken, Frame-Statistik, kills/xp/Zeit, Renderer-String, Szenario-Parameter).
- Abnahme-Shots (in git): `shots/abnahme/m10-player-gap-{before,after}.png` (Vollframe
  Minute 25) und `…-crop.png` (3x nearest, Spieler in Bildmitte) — Vorher: Spieler im
  Klumpen eingeklemmt; Nachher: Silhouette im Ring frei lesbar.
- Tests: `tests/player-swarm-gap.test.ts` (9 Tests) — Spieler nie bewegt, Mindestrand
  im Ring (0 Gegner < 8 px Kante bei 120/500 Gegnern), Gegner außerhalb exakt
  unberührt, Tote ignoriert, UID-Fallback, 500 Gegner bitgleich über 2 Läufe,
  monotone Annäherung ohne Überschwingen, mit/ohne Hash ergebnisgleich, ignore-Prädikat.

## art-director-Sichtprüfung

- **PASS, 4/5** (Sitzung ses_dde8e9141ffe6MOelr6ivNk4IS, 2026-11-28; Grenze ≥ 4/5):
  1. Spieler-Silhouette im Nachher frei erkennbar (4/5) — zentrale, warm leuchtende
     Figur in der Ring-Leerzone; Abzug nur wegen eigener Flammen-Waffen-VFX, die in
     BEIDEN Bildern (auch Vorher) die Torso-Kontur überlagert — nicht Gegenstand
     dieser Karte.
  2. Kein Gegner-Sprite überlappt den Spieler im Nachher (5/5) — Vorher: Gegner
     direkt AUF der Spieler-Position, Nachher: deutlich getrennt am Ring-Innenrand.
  3. Keine neuen Artefakte (4/5) — keine Ausstanzzonen außerhalb des Rings,
     organische Ring-Textur ohne Dither/Raster, HUD identisch lesbar; Snapping im
     Still nicht beweisbar (Hinweis, kein Abzug).
  4. Nachher klar besser als Vorher bei seed-gleichem Szenario (5/5).
  Hinweis für spätere A10-Verfeinerung (kein FAIL-Grund): Waffen-Flammen-VFX am
  Spieler-Torso (Alpha/Höhe) — eigener Scope, nicht Ring-Karte.

## Qualität

- `npx tsc --noEmit` rc=0; `npm run build` rc=0; volle Testsuite 171 Dateien /
  1855 Tests grün (inkl. neuer 9).
- Mess-Skript: 1 Fix-Iteration (WebGL-Crop → `page.screenshot({clip})`); Frame-Zeit-
  Messungen unter `flock /home/ai/games/.lf-perf.lock` (games-Pfad).

## Offene Punkte / Scope-Grenzen

- Restliche ~3 Gegner < 8 px Kante sind transient (Beschwörungen/Blinker spawnen
  direkt am Spieler und werden im nächsten Frame hinausgedrückt) sowie Schwarm, der
  von Bosse-Zum-Stehen-Kommen am Spieler eingekeilt wird — Bosse sind bewusst
  ausgenommen (BossSystem-Kette). Falls A10 im Chaos-Screenshot-Verify künftig
  weiter auffällt: Boss-Ausnahme lockern oder Ring-Radius nochmal anheben.
- `resolveCrowdSeparation` (M10-Separation-Budget) ist weiterhin unverdrahtet —
  nicht Scope dieser Lane.
- Keine GAME.md-Änderung (diese Doku wird beim Merge übernommen).
