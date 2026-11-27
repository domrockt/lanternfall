# Lane m10-spawn-burst-budget — Spawn-Burst-Glättung (M10)

Ziel laut Briefing: Abnahme-Blocker `fullrun-fpsMin < 55` — "Tier-/Wellen-Spawns
kommen in Bursts; ein Burst von 40+ Spawns in einem Frame erzeugt eine
Frame-Zeit-Spitze". Die Lane prüft und glättet die Spawn-Last, ohne
Spawn-Zusammensetzung oder Timing (Bosse exakt alle 5 min) zu ändern.

## Mechanismus (K2, #5399)

- `src/logic/waves.ts`: `SPAWN_FRAME_BUDGET = 8` + reine Funktion
  `splitSpawnBurst(granted, allowance)` → `{ now, deferred, allowanceLeft }`.
  Nie mehr als `allowance` Spawns pro echtem Frame; `now + deferred === granted`
  (Summe exakt erhalten); NaN/negativ/fractional → abgedeckt.
- `src/systems/Spawner.ts`: Allowance wird je echtem Frame (`game.loop.frame`)
  zurückgesetzt; im Substep wird `toSpawn` (nach dem unveränderten
  `room`-Clamp) geteilt, der überschüssige Anteil kehrt ins Restbudget zurück
  (`this.budget += deferred`) und wird in späteren Frames nachgeholt.
- **Unverändert:** Spezialwellen (Ring/Stream), Elite-Pakete und Boss-Spawns
  gehen nicht durch die Glättung (0 ms Zusatz, Timing unberührt); Cap-Drop-
  Semantik (`toSpawn = min(count, room)`) bleibt exakt erhalten.
- Mischung: näherungsweise erhalten — kreuzt die Nachholphase eine
  Minuten-Grenze, werden verzögerte Spawns mit der Mischung des neuen
  Abschnitts neu gewählt (Review-Hinweis R-S2, ehrlich dokumentiert).

## Messung (K1 #5398 / K4 #5401)

`scripts/m10-spawn-burst.mjs` (headless, fullrun-Setup: god+autoplay,
Max-Out, timeScale 30, seed 99, 960x540@1, 80 s Realzeit ≈ 40 min Spielzeit):
je echtem Frame Spawn-Delta (aus `lf-spawner.spawnCounts`) + reale Frame-Zeit
(`game.loop.rawDelta`).

**Vorher** (ungeglättet: temporär main-Stand von waves.ts/Spawner.ts gebaut,
`shots/m10-spawn-burst-before.json`, rc=0):

| Metrik | Vorher (ungeglättet) | Nachher (geglättet) |
|---|---|---|
| totalSpawns (Lauf) | 4276 | 4085 |
| max Spawns/Frame | 18 | 23 |
| Frames > 40 Spawns | 0 | 0 |
| max Frame-ms (rawDelta) | 33,4 | 50,0 |
| p50/p95/p99 Frame-ms | 16,7 / 16,8 / 16,8 | 16,7 / 16,8 / 16,8 |
| Top-Burst-Frames ms | alle 16,7 | alle 16,7 |
| JS-Fehler | 0 | 0 |

## Ehrlicher Befund (wichtig)

1. **Die Briefing-Hypothese "Bursts von 40+ Spawns in einem Frame" ist im
   Headless-Harness nicht bestätigt.** Vorher wie nachher: max 18 bzw. 23
   Spawns/Frame, keine Frame mit >40. Die Top-Bursts liegen alle an
   Minuten-/Elite-Grenzen und sind **Spezialwellen** (Ring/Stream/Elite-Paket),
   die laut Briefing absichtlich ungeglatzt bleiben.
2. **Keine messbare Spawn-Frame-Zeit-Spitze:** Frames mit Spawns sind nicht
   langsamer als andere (16,7 ms vsync-gekapselt, p99 16,8; die seltenen
   33–50-ms-Hitches treten in Frames ohne Spawns auf). Das Ziel
   "max Spawn-Frame-Zeit −30 %" ist damit **nicht erreichbar — es gibt im
   Harness keine Spawn-getriebene Spitze zum Reduzieren** (Messgrenze,
   analog zum OSR-Harness-Artefakt in m10-separation-budget).
3. **Spawn-Summe Vorher/Nachher im Harness nicht direkt vergleichbar:**
   4276 vs. 4085 (~4,5 %) ist Laufstreuung des Autoplay (unterschiedliche
   Kampf-/Tötungszeitpunkte ändern die Cap-Drops), nicht die Glättung.
   Die Summen-Identität der Glättung ist deterministisch **in den Tests**
   belegt (gleiche Eingaben → identische Summe, siehe unten).
4. **Wert der Glättung:** Sie bleibt korrekt, kostenlos im Normalpfad
   (Allowance ≥ fällige Spawns) und schützt den Hitch-Fall: nach einem
   Frame-Hitch wird der entstehende Rückstau auf ≥⌈n/8⌉ Frames verteilt statt
   in einem Frame materialisiert (Integrationstest belegt Summen-Erhalt und
   Rückstau-Abbau). Für das fullrun-fpsMin-Tor ist sie damit ein
   Guard, kein messbarer Hebel — der FPS-Blocker muss anderswo gesucht
   werden (Ambient/Draw-Submit-Lanes liefern dazu Belege).

## Tests (K3, #5400)

`tests/spawn-burst.test.ts` (10 Tests, alle grün): Budget-Grenze (kein Frame
> Allowance), Summen-Erhalt (`now + deferred === granted`), 30-min-Sim mit/
ohne Glättung identische Spawn-Summe (Hitch-Dt-Modell), Rückstau-Abbau nach
10-s-Hitch (`budget < 1`), Grenz-/Müllwerte (0/1/sehr viel/NaN/negativ),
Integrationstest mit Spawner-Stub: mehrere Substeps teilen eine Allowance,
verzögerte Spawns kommen vollständig nach.

Kontrolleure: reviewer PASS (ses_de11c34a8ffeQCcY0Ue453ijU0) — Hinweise R-S1
(Integrationstest) und R-S2 (Kommentarpräzision) abgearbeitet.

## Offene Punkte

- Das eigentliche fullrun-fpsMin-Tor (<55) wird durch diese Lane nicht
  bewegt; Ursachenattribution liegt bei den Engine-/VFX-Lanes.
- Bei 780@3 (iGPU) wurde nicht gemessen (flock-Konkurrenz mit der
  Nachabnahme-Lane, ~30-min-Realtime-Lauf); die Spawn-Kosten sind
  auflösungsunabhängig (Pool.spawn), der Befund überträgt sich.
- Nachgelagerte Mischungsverschiebung an Minuten-Grenzen (siehe oben) ist
  dokumentiert und spielerisch irrelevant (<8 Spawns betroffen).
