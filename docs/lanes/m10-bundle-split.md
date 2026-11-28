# Lane m10-bundle-split — Befund E-3 (Nachabnahme E): Chunk-Größenwarnung Build

**Status: erledigt (K1–K4).** Befund E-3, docs/lanes/m10-acceptance-refresh-e.md, Severity low.

## Ausgangslage bei Lane-Start (wichtig, ehrlich)

Die **Größenwarnung selbst war beim Lane-Start bereits weg**: die Lane
`m10-bundle-chunk-fix` (Karte #9987, Commit `cfee454b`) hatte sie bereits mit
`advancedChunks` (phaser/sprites/gfx) und `chunkSizeWarningLimit: 1250` behoben.

Übrig war die **Deprecation-WARN** des Builds:

```
WARN  advancedChunks option is deprecated, please use codeSplitting instead.
```

Diese API (`codeSplitting`) ist genau der Hebel, den Nachabnahme E in E-3
empfiehlt (`build.rolldownOptions.output.codeSplitting`). Diese Lane hat die
Migration ausgeführt und den Beleg vorher/nachher erbracht.

## Was getan wurde

- **K1 (#11658):** Audit-Skript `scripts/m10-bundle-audit.mjs` (von der
  Chunk-Fix-Lane) um stdout+stderr-Erfassung erweitert — Vite-Warnungen liegen
  auf stderr und wurden zuvor nicht gezählt. Plus Deprecation-Erkennung
  (`deprecation_warning`). Vorher-Report: `~/games/.evidence/m10-bundle-split/before.json`.
- **K2 (#11659):** `vite.config.ts`: `advancedChunks` → `codeSplitting`
  migriert. Gleiche Gruppen (phaser prio 2, gfx prio 1, sprites prio 3),
  gleiche Semantik. **Keine Änderung an `src/**` oder `index.html`** (beide
  fremd geclaimed).
- **K3 (#11660):** Nachher-Report `~/games/.evidence/m10-bundle-split/after.json`
  + Smoke (dist über statischen Server, Titel-Szene lädt, JS-Fehler gezählt)
  + `npm test` (197 Dateien / 2202 Tests grün).

## Vorher / Nachher

| Kennzahl | vorher (before.json) | nachher (after.json) |
|---|---|---|
| `npm run build` rc | 0 | 0 |
| Chunk-Größenwarnung (> 500 kB) | **nein** (bereits durch m10-bundle-chunk-fix) | **nein** |
| Deprecation-WARN (`advancedChunks`) | **ja** | **nein** |
| Build-Zeit Vite | ~400 ms | ~400–670 ms |
| Chunks | phaser 1166 kB / sprites 414 kB / index 258 kB / gfx 88 kB / terrainWorker 10 kB / runtime 0,6 kB | identische Aufteilung (Hashes bis auf index unverändert) |
| GZip (aus Build-Log) | phaser 318 kB / sprites 41 kB / index 82 kB / gfx 27 kB | identisch |
| Smoke (dist, Playwright) | Szene lädt, 0 JS-Fehler | Szene lädt, 0 JS-Fehler |
| Tests | – | 2202/2202 grün |

Abnahme-Kriterium „Build rc=0 ohne Chunk-Größenwarnung ODER begründeter
Entfall" ist erfüllt — **ohne** Entfall: der Build ist jetzt komplett warnfrei
(weder Größen- noch Deprecation-WARN).

## Kaltladezeit: Empfehlung (keine eigene Messung, gehört zu m10-loading-screen)

Die Aufteilung ist **kein** Ladezeit-Gewinn im ersten Load: `phaser` (1,19 MB,
gzip 318 kB) wird weiterhin **upfront** statisch importiert (`main.ts`) — die
Gesamtbytes und die kritische Kette index→phaser→main bleiben gleich; es gibt
nur einen Request mehr (der aber cache-stabler ist: der Vendor-Chunk-Hash ändert
sich bei Spielcode-Änderungen nicht, das hilft Wiederhol-Besuchen und dem
APK-Preview-Pfad deutlich).

Echter Ladezeit-Hebel wäre **dynamisches `import()` für Phaser oder
Late-Szene-Code** — das würde `src/main.ts`/Szenen anfassen. `main.ts` ist durch
`m10-loading-screen` belegt und war für diese Lane gesperrt; ein solcher Split
ist deshalb hier nicht umgesetzt worden.

**Bedarfsmeldung** an `/home/ai/games/.dispatch/requests.md`: Ladezeit-Messung
(Requests/Benefit eines dynamischen Phaser-Imports) gehört zum laufenden
`m10-loading-screen`-Thema — dort als Hebel aufnehmen, nicht doppelt messen.

## Belege

- `~/games/.evidence/m10-bundle-split/before.json` (K1, mit Deprecation-WARN)
- `~/games/.evidence/m10-bundle-split/after.json` (K3, warnfrei)
- `~/tmp/m10-bundle-split-k3-audit.log` (Audit-Lauf K3)
- Commits: `c6df267d` (#11658), `f7772232` (#11659), `292d2b56` (#11660), K4 (#11661)

## Review

`reviewer` (2026-11-28): **PASS** — Migration semantisch äquivalent (identische
Chunk-Hashes bis auf index, `__LF_BUILD__`-Zeitstempel), Scope sauber (kein
src/**, kein index.html, kein GAME.md), Tests 2202/2202 grün. Umgesetzte
Review-Fixes: Audit-Skript bricht jetzt mit rc=1 bei Build-Fehlschlag ab
(kein Smoke gegen veraltete dist-Artefakte mehr), `spawnSync`-Error wird
abgefangen, toter `execFileSync`-Import entfernt.
