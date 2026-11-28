# Lane m10-powerup-sfx-wire — Powerup-Moment hörbar machen (2026-11-28)

Briefing: Dora 2026-11-28T07:3xZ (Bedarfsmeldung der Lane m10-pickup-sfx-distinct).
Lane-Karten im Board: **#9735 (K1), #9736 (K2), #9737 (K3), #9738 (K4)**.
Hinweis: Die im Briefing genannte Karte **#9585 existierte auf keinem Board**
(main + lane geprüft) — Lane-Karten wurden daher gemäß Briefing neu angelegt.

## Auftrag

`playPowerupMoment()` in `src/systems/PickupSystem.ts` erzeugte den
Aufnahme-Moment (Icon/Rim/Ring), aber **keinen Sound**. Ziel (K2 des
sfx-distinct-Briefings): ein unterscheidbarer Powerup-Sound.

**Claim-Grenzen eingehalten:** nur `src/systems/PickupSystem.ts` + eigener
Test/Skript/Doku. `src/audio/**` (AudioSystem.ts, mixing.ts), `scripts/gen_sfx.py`
und `public/sfx/**` sind von m10-pickup-sfx-distinct geclaimed — **0 Konflikte,
0 Änderungen** an diesen Dateien (`git diff` gegen die Merge-Basis prüft das).

## Umsetzung

1. **K1 — Vorher-Probe** (Commit `b1d4d54`): `scripts/m10-powerup-sfx-wire.mjs`
   lädt PickupSystem.ts per Vite-SSR (Stubs für phaser/gfx, zaehlender Audio-Stub;
   `src/audio` wird nicht geladen). Befund: **0 `getAudio().play`-Calls** bei
   `playPowerupMoment("boots"/"tome"/unbekannt)`.
   Beleg: `~/games/.evidence/m10-powerup-sfx-wire/before.json` (ok:false = Ist).
2. **K2 — Fix** (Commit `e82acac`): in `playPowerupMoment()` nach dem spec-Guard:
   ```ts
   if (POWERUP_SFX_ID in SFX_KEYS) getAudio().play(POWERUP_SFX_ID); // "powerup"
   ```
   + Import `{ getAudio, SFX_KEYS }` aus `../audio/AudioSystem` (re-exportiert
   SFX_KEYS aus mixing.ts). **Guard:** der Key "powerup" ist in diesem Worktree
   noch nicht in `SFX_KEYS`/`SFX_CONFIG` (liefert die sfx-distinct-Lane); der
   Guard verhindert einen TypeError in `play()` (SFX_CONFIG-Lookup), falls diese
   Lane vor jener gemergt wird — dann bleibt der Moment still statt zu crashen.
   `pickupMomentSpec`/Zeichnung/Positionen: bitgleich, nur Sound zusätzlich.
3. **K3 — Guard-Test** (Commit `6e2bbcc`): `tests/powerup-sfx-wire.test.ts`,
   5 Tests: genau 1 "powerup"-Call je gültigem Moment (Direktaufruf), Erkennungs-
   pfad (Level-up/Truhe via passives-Diff: 1 Call je Erwerb/Upgrade, 0 bei Frame
   ohne Erwerb → kein Doppel-Sound), unbekannte id → 0, Gem-/XP-Sammelpfad → 0,
   `clearMoments` → Historie unberührt.
4. **K4 — Nachher-Probe**: **0 → 1** Play-Call je Moment (boots: +1 "powerup",
   tome: +1 "powerup", unbekannte id: +0, `ok:true`).
   Beleg: `~/games/.evidence/m10-powerup-sfx-wire/after.json`.

## Messwerte

| Messung | Vorher | Nachher |
|---|---|---|
| play-Calls je gültigem Moment | 0 | 1 (`id="powerup"`) |
| play-Calls unbekannte id / Gem-Pfad / Frame ohne Erwerb | 0 | 0 |

## Verifikation

- `npx tsc --noEmit` rc=0; `npx vitest run tests/powerup-sfx-wire.test.ts` 5/5;
  `tests/pickup-moment.test.ts` + `tests/pickup-gems.test.ts` 22/22.
- Volle Runde einmal vor Abschluss: `npm run build` rc=0,
  `npm test` **157 Dateien / 1695 Tests grün**.

## Offene Punkte / Ehrliche Lücken

- **Sound selbst nicht hörbar geprüft:** die WAV (sfx_powerup) und die
  Mixing-Werte liegen in der geclaimten sfx-distinct-Lane; in diesem Worktree
  fehlt der Key in SFX_KEYS, deshalb schlägt der Guard an (Moment still, kein
  Crash). Hörbar/unterscheidbar wird der Sound erst nach dem Merge beider Lanes
  — Abnahme über die sfx-distinct-Karten (audio-check).
- Probe-Skript brauchte 3 Stub-Korrekturen (GFX-Stubs, graphics/destroy,
  SFX_KEYS-Export) statt der Regel-2 — jede war ein anderer Fehler bis zum
  ersten lauffähigen Beleg, kein Politur-Loop; after.json ist die einzige
  verbindliche Messung.
- Die Probe misst auf API-Ebene (`getAudio().play`-Calls), nicht im Browser;
  der Erkennungspfad (Run.ts → applyOffer → passives-Diff) ist im Guard-Test
  abgedeckt, nicht im Probe-Skript.
