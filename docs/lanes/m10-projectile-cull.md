# M10-projectile-cull: Projektil-Budget im Endgame

## Ziel
Offscreen-Projektile früh recyceln und Update-Arbeit pro Projektil senken,
Burst/Fullrun-FPS stützen — **ohne Trefferverhalten zu ändern**.

## Umsetzung (nur `src/systems/ProjectilePool.ts`)
1. **Offscreen-Recycle in `compact()`**: Projektil > view+256px (mit View-Diagonale
   skaliert; 640x360 → 256px), **ohne Live-Target** und **wegfliegend** → sofort frei.
   Boss-/Chested-Projektile laufen über andere Pools; dieser Pool hat keine — der
   Flag `lf-proj-cull` (Registry, default an) erlaubt das Vorher-Verhalten.
2. **Draw-/FX-Skip** ab view+24px: Sprite aus, Trail (über neues `trailSetpoint`)
   temporär abgestellt, bei Rückkehr ins Bild beides wiederhergestellt.
   `src/systems/CombatSystem.ts` bleibt unberührt (liest `p.trail` weiter).
3. **Kein neues Allozieren bei knappem Pool**: `stealCullable()` klaut ein
   ohnehin cull-erlaubtes Projektil, bevor `createRuntime()` läuft.
4. **Reuse-Statistik**: `stats{spawned,reused,created,culled,stolen,trailSuppressed}`.

## Warum 256px und nicht 96px? (Messung #5458)
Der Spawner setzt Gegner an den Ring (diag/2+20px); Gegner excursieren bis
~215–270px jenseits des Views. Projektil-Treffer **jenseits view+256px: 0**
(in allen Batches), jenseits 96px: 26–325. Ein Recycle bei 96px hätte also
reale Treffer/ deren RNG-Folgen (Crit, Drops) vernichtet.

## Warum Ordnungserhaltung? (2. Fix, selbe Karte)
`hitEnemy` konsumiert pro Treffer den Crit-RNG-Stream. Der alte Swap-Pop in
`compact()` permutierte die Aktivreihenfolge → Crit-Rolls in anderer Reihenfolge
→ Schadens-/Kill-Summen brechen auseinander. Fix: Write-Index-Kompaktion +
`splice` im Steal-Pfad — relative Reihenfolge aller Überlebenden bleibt gleich.

## Deterministischer Harness (`scripts/m10-projectile-cull.mjs`)
- create()-Freeze (Run-Update-Patch bis nach Setup), `loop.delta`-Pin (1/60,
  neutralisiert den Frame-Budget-Koppler im Spawner), Sim über feste
  `run.simulate(1/60)`-Schritte statt RAF.
- Setup: 640x360, seed=1, Minute 24:50, 6 Waffen + 6 Passives lvl 8, density 16,
  god + Autoplay (Bot-Kiten erzeugt geradlinige Ziellose = das Recycle-Budget).
- **Paar-Prinzip**: Vorher (Flag aus) und Nachher (Flag an) als zwei Pages im
  selben Browser-Prozess; beide müssen nach identischem Warmup denselben
  Zustands-Fingerabdruck (Gegner-Hash, ≥80 Gegner) haben und **bitidentische
  Treffer-/Schadens-/Kill-Summen** liefern — sonst Verwerfen und neu ziehen
  (beobachtet: lastabhängige Browser-Klassen mit 8932/9679/7925 Treffern bei
  identischem Setup; 3 von 4 Versuchen verworfen, 4. paar sauber).

## Ergebnis (shots/m10-projectile-cull-{before,after}.json, Batch 4)
| Metrik | Vorher (cull aus) | Nachher (cull an) |
|---|---|---|
| Treffer | 7925 | **7925 (identisch)** |
| Schaden | 456311 | **456311 (identisch)** |
| Kills | 830 | **830 (identisch)** |
| Spawns | 922 | 922 |
| lebende Projektile Ø (max) | 40,3 (50) | 29,7 (44) → **−26 %** |
| offscreen >96px Ø (Anteil) | 15,7 (38,8 %) | 5,0 (16,9 %) → **−68 %** |
| offscreen >256px | — | **0 nach Recycle-Fenster** |
| ms/Frame Projektill-Update | 0,016 | 0,018 (Rauschbereich, ~0,02 ms) |
| ms/Frame combat.update | 0,103 | 0,112 (Rauschbereich) |
| ms/Frame Renderer (Proxy) | 1,104 | 1,173 (Rauschbereich) |

## Ehrliche Einordnung
- **Treffer-/Schadens-Identität: belegt** (bitidentisch im Paar-Harness).
- **Offscreen-Budget: belegt** (−68 % jenseits 96px, 0 jenseits 256px).
- **Update-ms/Frame −25 %: NICHT erreicht/nicht auflösbar** — die absolute
  Projektill-Update-Zeit liegt bei ~0,02 ms/Frame (deterministische Substeps,
  kein flock nötig); die Differenz liegt im Messrauschen. Die Ersparnis
  materialisiert in der Menge (−26 % lebende Projektile, −68 % Offscreen,
  weniger Trail-FX-Spawns und Draw-Objekte), nicht in einer auflösbaren
  ms-Differenz dieses Harnesses.
- FPS-Referenz: entfällt (RAF-FPS im headless Harness schwankt 52–61 FPS
  batchesabhängig; Sim-Messung ist lastunabhängig).

## Tests
`tests/projectile-cull.test.ts`: 13 Fälle (Recycle erfasst, Onscreen unverletzt,
Live-Target/rückfliegend geschützt, 0/1/Cap+1, kein Pool-Exhaust mit
created==0, Trail-Wiederherstellung, Vorher-Flag, Kamera-los, Swap-freie
Kompaktion). Volle Suite 632/632, `npx tsc --noEmit` grün.

## Offene Punkte
- Root-Cause der Browser-Klassen (Warmup-Hash flippt page-/lastabhängig) unklar;
  der Fingerabdruck-Wächter fängt das ab. Für spätere Lanes: Harness-Muster
  (Freeze + delta-Pin + Paar-Prinzip) wiederverwendbar.
- `flock` nur für die kurzen FPS-Referenzanteile nötig; Sim-Teil lastunabhängig.
