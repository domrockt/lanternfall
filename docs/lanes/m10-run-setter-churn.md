# Lane m10-run-setter-churn (M10, 2026-11-28)

Ziel: dokumentierter Restbefund aus m10-run-cpu-budget ("Offene Bedarfe": p95-Rest
"Phaser-Setter/FX") und v10-Geräteabnahme K3 Hebel B (worstFrame 33–34 ms,
Allokationen/Setter im Frame): Phaser-Setter-Churn und per-Frame-Allokationen im
**Run.ts-eigenen Frame-Pfad** messen und die Top-Quelle fixen. Der FX-Teil läuft
separat als m10-fx-alloc-trim (FxSystem.ts) — Run.ts wurde dort nicht berührt.
Keine Verhaltensänderung: Sim-Ergebnisse bitgleich (Golden-Frame als Invariante).

- Mess-Skript: `scripts/m10-run-setter-churn.mjs` (Chaos-Setup identisch zu
  m10-fx-alloc.mjs: Seed 1, skipTo(1500), 6 Evolutionen + 6 Passives St. 5,
  Gegner-Top-up, god/autoplay, 20 s Fenster, Viewport 640x360). Misst je Frame:
  Phaser-Setter-Aufrufe (Accessor- + set*-Wraps auf Sprite/Image/Rectangle/
  Container/Text/BitmapText/Graphics, szene-attribuiert), Allokationen per CDP
  Sampling-Heap-Profiler (512 B) attribuiert auf die Run.ts-Spanne im
  unminifizierten Bundle, jsFrameCpuMs + worstFrame, Renderer-String.
  Läuft OHNE flock (kein FPS-/Echtzeit-Kriterium).

## K1 — Vorher-Messung (#12704, Commit 635b27d6)

Belege: `~/games/.evidence/m10-run-setter-churn/m10-run-setter-churn-before.json`
(2 Edit-Iterationen am Skript, dann verbindlich; clean run rc=0).

| Metrik | Wert |
|---|---|
| Renderer | `ANGLE (Intel, Mesa Intel(R) Graphics (RPL-S), OpenGL ES 3.2)` |
| Frames gemessen / Ø Gegner / Kills | 2398 / 191 / 7383 (20 s, ~120 fps headless) |
| Setter-Aufrufe Run-Szene | **123,5 / Frame**, davon **94,3 % No-ops** (Wert ändert sich nicht) |
| Top-Quellen | setPosition 45,4/f · setActive 20,2/f · setTexture 9,2/f · setTint 6,7/f · setVisible 6,5/f · clearTint 6,3/f · setAlpha 3,6/f · setScale+setDepth je 3,1/f |
| Run.ts-eigene Allokationen | **0 B/Frame (gesampelt, Intervall 512 B)** — der Alloc-Teil des Restbefunds ist durch das K3-Hoisting der m10-run-cpu-budget-Lane abgeräumt; 78 % der Rest-Allokationen (4221 B/f gesamt) stammen aus dem Mess-Harness (`queueEnemyWave`), der Rest aus Phaser (setTint/setAlpha/batchQuad/sortByDepth) |
| jsFrameCpuMs p95 / max | 14,3 / 35,7 ms (1 Frame > 33 ms → v10-K3-Klasse sichtbar) |

Attribution-Hinweis: der Szenen-Bucket "run" mischt Run.ts mit Pool-Systemen
(Fx-/Damage-/Pickup-Sprites leben in derselben Szene). `setActive`/`setTexture`
stammen überwiegend aus diesen fremden Dateien (Run.ts ruft setActive nur bei
Kills) — für die Scope-Abgrenzung relevant, siehe K3.

## K2 — Fix der Top-Quelle (#12705, Commit aa45d15e)

Muster **compare-then-set** in `src/scenes/Run.ts` (einzige geänderte Datei):
Setter laufen nur, wenn sich der Wert wirklich ändert — Vergleich gegen die
direkte Property (keine Caches, keine Allokationen, recycling-sicher, bitgleich
by construction, da nur identische Werte übersprungen werden):

- Elite-Aura-Block (vorher JEDEM Frame je Elite): setBlendMode/setTintFill/
  setAlpha/setScale/setPosition/setDepth/setVisible nur bei Änderung.
- playerBody: kein je-Frame `clearTint()`/`setAlpha(1)` mehr (Tint-Vergleich
  gegen `tintTopLeft`, Alpha-Vergleich).
- hpBar: Sichtbarkeits-Sync nur bei Wechsel, Position/Scale nur im sichtbaren
  Zustand (unsichtbare Setter sind No-ops mit vollem Aufrufpreis).
- Positionen player/shadow/light, enemy-sprite, aura: skip bei unveränderter
  (gerundeter) Position — `setPosition` war die gemessene Top-Quelle.

tsc + build grün, run-cpu-budget-Vertragstests 13/13.

## K3 — Guard + Nachher (#12706, Commit a78bde25)

Guard: `tests/run-setter-churn.test.ts` 7/7 — Quell-Kontrakt (die Guards bleiben
verdrahtet, keine unbedingten Aura-/playerBody-Setter mehr) + Emulation des
compare-then-set-Musters über 3 Seeds × 1200 Frames: Endzustand immer identisch
zum naiven Setter (bitgleich), 0 No-op-Setter im Guard. Suite 2414/2414, tsc grün.

Nachher (vergleichbares Protokoll: Ø 194,7 Gegner / 7445 Kills vs. 191 / 7383),
Beleg `~/games/.evidence/m10-run-setter-churn/m10-run-setter-churn-after.json`:

| Metrik | Vorher | Nachher | Δ |
|---|---|---|---|
| Setter-Aufrufe Run-Szene / Frame | 123,5 | **96,9** | **−21,5 %** |
| setPosition / Frame | 45,4 | **18,4** | **−59 %** |
| jsFrameCpuMs p95 / max | 14,3 / 35,7 ms | **11,6 / 28,0 ms** | −19 % / −22 % |
| Frames > 33 ms (v10-K3-Klasse) | 1 | **0** | |
| Run.ts-eigene Allokationen | 0 B/f | 0 B/f | = (schon vorher unter Messgranularität) |

### Einordnung des 50 %-Tors

Der Briefing-Tor "Allokationen/Setter im Run.ts-Frame-Pfad <= 50 % des Vorher-
Werts" ist auf die **Summe** des Szenen-Buckets mit Run.ts allein nicht
erreichbar: der verbleibende Churn (setActive 19,9/f, setTexture 8,5/f, Rest-
setPosition aus Pickup-/Shot-Pools) stammt aus fremden Dateien
(FxSystem/DamageNumbers/PickupSystem — Claim m10-fx-alloc-trim bzw. deren
Owner). Die **fixbaren Run.ts-eigenen Quellen** sind entfernt: Top-Quelle
setPosition −59 %, Aura-Konstant-Setter/playerBody/hpBar → ~0. Ehrliches
Gesamtergebnis: −21,5 % Setter, −19 % p95, worstFrame-Klasse >33 ms im
Messfenster beseitigt.

### Golden-Frame / Bitgleichheit

- Lauf mit Fix: 3 Seeds × 2 Läufe, `deterministic: true`, 0 JS-Fehler,
  Hash je Seed stabil (`b4555df0be113816` für Seed 202).
- **Parent-Commit (vor K2) liefert den identischen Hash** → der Fix ist
  sim-bitgleich. Beleg: `~/games/.evidence/m10-run-setter-churn/m10-rsc-parent-golden.log`.
- Die committete Baseline (`shots/m10-golden-frame-baseline.json`, Stand
  ab50197b, m10-golden-frame-guard) ist **vor dieser Lane** divergiert: seit
  der Baseline änderten 40 Dateien/4136 Zeilen in src/ (u. a. Spawner,
  ProjectilePool, Hazards). Gemäß Anleitung in `tests/golden-frame.test.ts`
  ("Divergenz durch laufende Lane-Merges: Befund dokumentieren, nicht
  rebaseln") wurde der committete Verdict wiederhergestellt und das divergierende
  Verdict als Beleg gesichert:
  `~/games/.evidence/m10-run-setter-churn/m10-golden-frame-verdict-divergent-vs-stale-baseline.json`.
  **Bedarf:** Rebaseline der Golden-Frame-Baseline durch die Owner-Lane /
  den Disponenten (gewollte Verhaltensänderung der gemergten Lanes, nicht
  durch diese Lane).

## K4 — Doku + Abschluss (#12707)

- Diese Datei; Belege ausschließlich `~/games/.evidence/m10-run-setter-churn/`.
- `git status --ignored` geprüft: keine eigenen Reste im Worktree
  (Mess-JSONs liegen außerhalb, shots/* unverändert außer den wiederhergestellten
  committeten Artefakten).

## Lane-Abschluss

- Commits: 635b27d6 (#12704 K1), aa45d15e (#12705 K2), a78bde25 (#12706 K3),
  <K4-Commit> (#12707).
- Offene Punkte: (1) Golden-Frame-Rebaseline (Owner: m10-golden-frame-guard /
  Disponent), (2) Rest-Setter-Churn aus FX-/Damage-/Pickup-Pools (Claim
  m10-fx-alloc-trim bzw. Systems-Owner), (3) x/y-Accessor-Churn war im Mess-
  Skript nicht sichtbar (eigene Accessor-Definitionen der Pool-Klassen
  schatten die Phaser-Prototypen) — Methoden-Ebene ist die handlungsrelevante
  Granularität, Auswirkung auf Befund/Fix: keiner.
