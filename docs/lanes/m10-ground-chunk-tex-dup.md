# Lane m10-ground-chunk-tex-dup — GroundRenderer-Spam „Texture key already in use: chunk_*"

Regression seit Chunk-Budget-Merge (`m10-ground-chunk-budget`, Merge 39d1efe8):
Phaser `createCanvas` auf belegtem Key `chunk_<x>_<y>` loggt „Texture key already in use"
und liefert `null`. Die Mess-Skripte zählen die Zeile als JS-Fehler → Balance-JSONs
`accepted:false`. Fix: vor dem Anlegen `textures.exists()` prüfen und existierende
Canvas-Textur wiederverwenden (an beiden Stellen: Async-Install `buildChunkTexture`
und Sync-Fallback `createChunk`). Kein Umbau am Chunk-Streaming/Pooling selbst.

Board-Karte: **#13283** (reservierter Block #13263–#13282 war bei Buchung bereits
durch das Board vergeben — automatische nächste ID).

## K1 Vorher-Messung (Baseline, vor dem Fix)

Lauf: `node scripts/m10-mira-hp-check.mjs` (volle Matrix mira×101/202/404 + kael×101,
scale 30, ohne flock — Balance mit festen Substeps). Stand: Fix noch NICHT eingebaut.

| Lauf | JSON | Spam-Zeilen (`chunk_*`) | sonstige JS-Fehler | accepted |
|---|---|---|---|---|
| Vorher (2026-11-28T16:37Z) | `~/games/.evidence/m10-mira-hp-balance-check/m10-mira-hp-2026-11-28T16-37-55-504Z.json` | **166** (mira/101: 14, mira/202: 72, mira/404: 40, kael/101: 40) | 0 | **false** |
| Referenz früherer Lauf (16:12Z, gleicher Stand) | `…/m10-mira-hp-2026-11-28T16-12-00-987Z.json` | 178 | 0 | false |

Alle jsErrors des Vorher-Laufs sind `Texture key already in use: chunk_*` — d. h. nach
dem Fix ist `accepted:true` erwarten (falls keine anderen Fehler).

## K2 Fix

`src/gfx/GroundRenderer.ts`:
- Neue testbare Helfer `acquireChunkCanvas(reg, key, frames, dropPooled?)`:
  existiert der Key bereits, wird die Canvas-Textur **wiederverwendet**
  (neu gemalt) statt `createCanvas` (→ Warnung + `null`). Nur bei Klassen-Wechsel
  (Stufenzahl anders) oder Nicht-Canvas wird nach `remove()` neu angelegt.
- Beim Wiederverwenden wird ein etwaiger Pool-Eintrag des Keys entfernt
  (`poolDrop`), damit `poolPick` die aktive Textur nicht doppelt vergibt.
- Verwendet von beiden Stellen: Async-Install (`buildChunkTexture`) und
  Sync-Fallback (`createChunk`). Chunk-Culling/Streaming/Pool-Caps unangetastet.

## K3 Guard-Test

`tests/ground-chunk-tex-dup.test.ts`: Fake-Registry mit Phaser-Mimik
(`createCanvas` auf belegtem Key warnt + `null`). Wiederaufbau derselben Chunks
(Async- wie Sync-Pfad-Nachbildung, 50× Loop) → 0 Warnungen, Textur-Identität
erhalten; Klassen-Wechsel/Fremd-Key → Neuanlage ohne Warnung; Pool-Drop geleert.

## K4 Nachher-Messung

Gleicher Lauf wie K1 (`node scripts/m10-mira-hp-check.mjs`, volle Matrix, Stand mit Fix,
Commit 63836a90):

| Lauf | JSON | Spam-Zeilen (`chunk_*`) | sonstige JS-Fehler | accepted | Violations |
|---|---|---|---|---|---|
| Vorher | `…/m10-mira-hp-2026-11-28T16-37-55-504Z.json` | **166** | 0 | false | 5 (kaelDurationDelta) |
| **Nachher** | `…/m10-mira-hp-2026-11-28T17-42-59-349Z.json` | **0** | **0** | false | 6 (identische kaelDurationDelta + mira/101 Glockenturm-Golem 17.1 s < 20) |

**Kern-Ergebnis: „Texture key already in use: chunk_*" 166 → 0, jsErrors gesamt 166 → 0.**
Die Messkette ist wieder belastbar (Spam zaehlt nicht mehr als JS-Fehler).

**Offener Punkt (nicht diese Lane):** `accepted:false` bleibt wegen Balance-Korridor-
Violations, die im Vorher-Lauf **wortgleich identisch** auftreten (deterministische
kael-Dauern vs. committete Referenz `shots/m10-balance-corridor-full.json`: Moorkönigin
32.2 s vs. 28.3 s usw., plus mira/101 Glockenturm-Golem 17.1 s) — die Abweichungen
existierten VOR dem Fix in gleicher Höhe und sind der Lane m10-mira-hp-balance-check /
einer Balance-Karte zuzuordnen (vermutlich veraltete Referenz nach den letzten Merges),
nicht dem Texture-Fix. Dessen Routing/Logik wurde nicht beruehrt.

Zusatz-Beleg (In-Game, ohne Korridor): `scripts/probe-tex-dup.mjs` — 100 s Autoplay bei
Zeitskala 30 im gemessenen Run: 0 „already in use", 0 pageerrors, 0 „No texture found".
Vorher brachen die Mess-Laeufe zudem mit Renderer-Tab-Crashes (geleakte ImageBitmaps).

## Verlauf/Hindernisse

- Reservierter Kartenblock #13263–#13282 war vergeben; Karte lief als **#13283**.
- 2 Mess-Laeufe + 1 K4-Anlauf starben mit Infrastruktur-Fehlern (Browser-Crash durch
  geleakte ImageBitmaps BEVOR der Adapter-Bug gefixt war; danach 1× Port-Konflikt der
  Parallel-Lanes). Kein Loop: jede Auswertung vor dem naechsten Versuch.
- Fix-Iterationen (alle belegt durch Probe-Pageerrors, nicht blind):
  1. Wrapper statt Textur zurueckgegeben → `getContext is not a function` → `ref`-Feld.
  2. Klassenerkennung via `frameTotal-1` falsch bei wiederverwendeten Canvases mit
     Stale-Frames → aktive Images verloren ihre Textur (`null glTexture`) → Erkennung
     ueber Canvas-Hoehe + Stale-Frame-Pruning.
  3. Rennfall Sync/Async poolte die aktive Textur → `No texture found` beim Destroy →
     Aktive-Key-Sperre (`textureKeyInUse`) + Bitmap-Verwerfen + destroy-Guard.
