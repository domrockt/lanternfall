# Lane m10-hero-idle-frames — Helden Idle-/Bob-Animation (M6, 28.11.2026)

**Ziel lt. Briefing:** 2-Frame-Idle-/Bob-Animation für Kael + Mira ergänzen, 4 Lauf-Frames auf
Rhythmik prüfen. **Abweichender Ist-Befund:** Beides existiert bereits seit `e778827` (M4-02)
auf main und ist in `src/scenes/Run.ts` verdrahtet (`idlePhase`, 2 fps, `frames.idle[walkDir]`).
Die Lane wurde daher ehrlich als **Verifikation + Absicherung** gefahren (Belege, Messung,
Regressionstest), nicht als Doppelaufbau. Kein Code-Pfad musste geändert werden.

## Karte #1 — Ist-Belege + Befundliste

Belege: `shots/m10-hero-idle-mira-sheets-{1x,4x}.png`, `shots/m10-hero-idle-kael-sheets-{1x,4x}.png`
(nearest skaliert; Reihen: Idle F0|F1, Walk down F0–F3, Walk up F0–F3, Walk side F0–F3),
`shots/m10-hero-idle-ist.json` (Maschinen-Befund).

### Befundliste

| Befund | Ist | Bewertung |
|---|---|---|
| Idle-Satz je Held/Richtung | 2 Frames (`player_<held>_<dir>_idle_0/1`), 6 Sätze je Held | ✅ vorhanden |
| Idle-Versatz-Pose (F0 vs F1) | 313–433 px Diff je Satz (Atem-Bob: Oberkörper 1 px runter, Laterne/Arme wandern mit) | ✅ echte Versatz-Pose, keine Dublette |
| Lauf-Dubletten | 0 in allen 6 Sätzen (2 Helden × 3 Richtungen × 4 Frames) | ✅ |
| Lauf-Rhythmik | down/up: Fußversatz −1/0/+1 px + Beinlift 2 px auf Schritt 1/3; side: 4 klare Phasen (Kontakt A/Durchschwung vor/Kontakt B/Durchschwung hinten, 2 px Vor/Zurück + 2 px Lift) | ✅ saubere Fußwechsel |
| Off-Palette-Pixel | 0 (nur Indizes 0–31, binäres Alpha) | ✅ |
| Idle F0 == Walk F0 (down/up) | Ruhepose = Kontaktpose — gängiger Pixel-Standard, kein Fehler | ℹ️ Design-Entscheidung |
| Laternen-Schwingen im Idle | Laterne hängt am Körper (`body_y + 8`), wandert mit dem Atem-Bob 1 px mit; seitliches Pendeln nur im Lauf (`swing`, side) | ✅ sparsam, kein Extra-Frame nötig |
| „Im Stand Standbild“ (Briefing-Prämisse) | veraltet: Idle läuft seit M4-02 im Spiel | ℹ️ siehe oben |

**„Wirkt steif“-Befund:** nichts — der Idle-Zyklus hat sichtbare Rhythmik (Bob-Frames
unterscheiden sich in ~10–40 % der Sprite-Pixel), der Lauf hat 4 distinkte Phasen.

Generator-Pfad bestätigt: `scripts/art/gen_chars.py` → `emit_ts("gen-chars.ts", …)`;
Idle-Zweig `fn(d, i, idle=True) for i in range(2)` (`gen_chars.py` build(), Zeile ~683).
`src/gfx/chars.ts` war **nicht** zu ändern — `PlayerFrameSet.idle` existiert bereits.
