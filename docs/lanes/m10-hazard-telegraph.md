# Lane m10-hazard-telegraph — Boss-Angriffe mit fairer Vorwarnung

Basis-SHA: `252fd98` (main-Merge m10-qa-numbers). Branch `m10-hazard-telegraph`.
Ziel laut Briefing: jeder Boss-Angriff und jede Gefahrenzone hat eine sichtbare
Vorwarnung vor dem Treffer, kein Treffer ohne Telegraph. `src/systems/BossSystem.ts`
ist Claim der Lane m9-art-polish und wurde **nicht** angefasst.

## 1. Audit (Ist-Stand)

Quelle: `src/logic/bosses.ts` (`BOSS_ATTACKS`), 6 Bosse, 18 Angriffs-Einträge.
Maschinenlesbarer Beleg: `shots/m10-hazard-telegraph-audit.json`.

Trefferzeitpunkt im Code (`src/systems/Hazards.ts`, `update`):
`warn -= dt; if (warn > 0) continue;` — erst danach werden `onTrigger`,
`containsPlayer` und `onPlayerHit` ausgelöst. Schaden fällt also ausschließlich
am **Ende** der Warnphase (`hitAtMs == telegraphMs`). Bei `linger <= 0` wird die
Hazard-Instanz nach genau einem Treffer entfernt (keine Doppel-Treffer).

### Angriffe mit Warnzeit < 600 ms (FAIL vor Fix)

| Boss | Phase | Angriff | Warnzeit | Form | Schaden |
|---|---|---|---|---|---|
| 1 Knochenfürst | 1 | bone_boomerang | 550 ms | Linie | 0.8× Kontakt |
| 4 Hexenzirkel | 1 | teleport | 350 ms | Kreis | 0 (nur Bewegung) |
| 5 Hohler König | 1 | bone_boomerang | 500 ms | Linie | 0.7× Kontakt |

Alle übrigen 15 Einträge lagen bereits ≥ 600 ms (650–1200 ms). Der Teleport
verteilt keinen Schaden, bleibt aber ein angekündigter Boss-Angriff und wird
deshalb ebenfalls auf ≥ 600 ms angehoben.

## 2. Test zuerst — RED vor dem Fix

`tests/hazard-telegraph.test.ts` prüft für jeden der 18 Angriffe:
`warnMs >= 600`, Trefferzeit == Warnzeit (± 1 Frame bei 60 Hz), Hazard-Radius
endlich und > 0, Strahlwinkel/-länge endlich, und genau **einen** Treffer pro
Hazard-Instanz (linger 0).

RED-Lauf vor dem Fix (`npx vitest run tests/hazard-telegraph.test.ts`):

```
× jeder Angriff hat warnMs >= 600
  [
    "Boss 1 P1 bone_boomerang: 550 ms",
    "Boss 4 P1 teleport: 350 ms",
    "Boss 5 P1 bone_boomerang: 500 ms",
  ]
Tests  1 failed | 5 passed (6)
```

Die übrigen 5 Tests waren schon grün: die Hazard-Umsetzung trifft korrekt erst
nach Ablauf der Warnung und genau einmal pro Instanz. Der Fehler lag allein in
den zu kurzen Angriffsdaten.

## 3. Fix — Vorher/Nachher der Warnzeiten

Nur `src/logic/bosses.ts` (Angriffsdaten) geändert. `interval`, `damageMul`,
Boss-HP und Spawnzeiten blieben unverändert; kein DPS-Ausgleich über Schaden.
`src/systems/Hazards.ts` war bereits korrekt (Zeichnung der Warnfläche + Treffer
erst nach `warn <= 0`) und wurde durch den Test bestätigt, daher keine Änderung.

| Boss | Phase | Angriff | Warnzeit vorher | Warnzeit nachher |
|---|---|---|---|---|
| 1 Knochenfürst | 1 | bone_boomerang | 550 ms | **600 ms** |
| 4 Hexenzirkel | 1 | teleport | 350 ms | **600 ms** |
| 5 Hohler König | 1 | bone_boomerang | 500 ms | **600 ms** |

Ergebnis: alle 18 Angriffe ≥ 600 ms; `npx vitest run tests/hazard-telegraph.test.ts`
→ 6/6 grün.

## 4. Beleg + Abnahme (26.11.)

- `npm run build` → **grün** (`tsc --noEmit` + Vite, `✓ built`).
- `npx vitest run` → **13 Testdateien, 198/198 Tests grün** (inkl. 6 neue Hazard-Telegraph-Tests).
- `node scripts/verify-bosses.mjs` (ohne flock) → **keine JS-Fehler**, alle 6 Bosse spawnen
  und zeigen Warnflächen (Warnflächen 1–8 je Boss). Urteil des Skripts: **5/6 OK**.
  `hollow_king` FAIL allein wegen `Truhe nein` im Skript-Kriterium; derselbe FAIL
  tritt auch auf Basis-SHA `252fd98` ohne unseren Fix auf (Endboss/Truhen-Zählung,
  nicht Telegraph). Nicht durch diese Lane verursacht, Boss bleibt spielbar
  (HP min 0 %, Phasen 1/2/3, Warnflächen 8).
- Warnphasen-Screenshots je Boss (mit lebenden Gegnern im Bild, 50 ms nach
  Sichtbarwerden der ersten Warnfläche aufgenommen):
  `shots/m10-hazard-warn-moor_queen.png`, `m10-hazard-warn-bone_lord.png`,
  `m10-hazard-warn-pale_shepherd.png`, `m10-hazard-warn-bell_golem.png`,
  `shots/m10-hazard-warn-coven.png`, `m10-hazard-warn-hollow_king.png`.
  Aufnahme-Skript: `~/tmp/m10-hazard-telegraph/warn-shots.mjs` (nicht im Repo,
  Belege sind die PNGs).

### Messwerte vorher/nachher

| Kennzahl | vorher | nachher |
|---|---|---|
| Angriffe mit warnMs < 600 | 3 von 18 | **0 von 18** |
| kleinste Warnzeit | 350 ms (teleport) | **600 ms** |
| Vitest gesamt | – | 198/198 grün |
| verify-bosses OK | 5/6 (hollow_king Truhe) | 5/6 (unverändert, pre-existing) |
| JS-Fehler in verify-bosses | 0 | **0** |

