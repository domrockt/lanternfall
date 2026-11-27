# Lane m10-lod-min-restore — VFX-Minimal-LOD-Rücknahme Stufe 1 (2026-11-27)

Bedarf: /home/ai/games/.dispatch/requests.md, m10-vfx-restore (2026-11-27): Restmangel
„VFX-Minimal-LOD bewusst stark gedämpft" — `fxAlphaFor("minimal")` 0,5 → 0,65.
Vorläufer: Lane m10-vfx-restore hatte den Wert provisorisch als Run.ts-Override
(`Run.setFxRestore(1)` + `Run.FX_RESTORE_ALPHA` = 0,65) umgesetzt, weil lod.ts durch
merge-m10-prop-density-lod belegt war. Stufe 2 (dpr-Alpha, gen-fx.ts/FxSystem.ts)
läuft separat als `m10-vfx-restore-st2`.

## K1 — Fix: fxAlphaFor("minimal") 0,5 → 0,65

- `src/logic/lod.ts`: minimal 0,5 → **0,65**; reduced 0,72 und full 1 unverändert.
- Stufen-Kette bleibt **monoton**: 0,65 (minimal) < 0,72 (reduced) < 1 (full) —
  m5-jucie-Assertion `minimal < reduced` bleibt grün (31 Tests in m5-jucie +
  prop-density-lod, `npx tsc --noEmit` rc=0).
- Damit greift der Wert automatisch an allen drei Hebelstellen ohne Run.ts-Änderung:
  - `src/scenes/Run.ts:544` (FX-/Partikel-Pool `setAlphaScale`, Laternenlicht),
  - `src/scenes/Run.ts:1463` (Hit-FX-Pfad),
  - `src/systems/CombatSystem.ts:165` (`fxDamping`-Ziel-Alpha).

## Befund: Run.ts-Override `setFxRestore(1)` / `FX_RESTORE_ALPHA` entbehrlich

**Ja, er kann entfallen** (Verhalten identisch, Beleg durch Codevergleich):

- `applyFxRestore()` (Run.ts:542-548): `active ? 0.65 : fxDamping ? fxAlphaFor(level) : 1`.
  Für `level === "minimal"` liefern beide Zweige jetzt denselben Wert 0,65 — der Override
  ist wertidentisch zum Default. Für reduced/full war er ohnehin nie aktiv
  (`active` verlangt `this.lod.level === "minimal"`).
- Run.ts:1463: dieselbe Ternär-Kette, gleicher Schluss: `fxAlphaFor("minimal")` = 0,65 =
  `FX_RESTORE_ALPHA` → Bedingung `this.fxRestore > 0` ist wirkungslos.
- Einzige Abhängigkeit: `scripts/m10-vfx-restore.mjs` (241-245) erwartet
  `setFxRestore()` bei `--stage > 0` und die Baseline/After-JSONs der Lane
  m10-vfx-restore (docs/lanes/m10-vfx-restore.md K2/K3, Nachher-Messung
  `--stage 1`) verwenden Stufe 1 als Messhebel.

**Empfehlung:** Override erst entfernen, wenn die Stufe-2-Messung
(m10-vfx-restore-st2) gegen die Nachher-Baselines gelaufen ist; die Skripte
nutzen `setFxRestore(1)` als reproduzierbaren Messhebel. Danach: `setFxRestore`,
`fxRestore`, `FX_RESTORE_ALPHA` und die zwei Ternär-Ketten (Run.ts:544, :1463)
löschen — Verhaltensänderung null, da wertidentisch. Run.ts wurde von dieser
Lane **nicht** angefasst (Tabu-Datei, Claim anderswo).

## K2 — Test + Sichtprobe

siehe unten (nach Ausführung ergänzt).
