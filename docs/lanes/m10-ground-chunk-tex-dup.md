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

(nach dem Fix ergänzt)
