# Lanternfall

Ein eigener Pixel-Survivor im verfluchten Moor: Die letzte Laterne muss bis zur
Morgendämmerung überleben. Bewegst deine Heldin/deinen Helden mit Tastatur, Touch oder
Gamepad — die Waffen feuern automatisch. Sammle XP, stufe auf, kombiniere bis zu
6 Waffen mit 6 Powerups und verwandle sie in der Truhe eines Bosses in seine Evolution.

**Ein Run dauert 30 Minuten.** Alle 5 Minuten erscheint ein Boss — jeder Boss droppt eine
Truhe mit Upgrades. Bei 30:00 wartet der Endboss; sein Sieg bringt die Morgendämmerung.

## Spielprofil

- **Setting:** endlose Nacht im Moor, draufsichtige Pixel-Action (eigene interne Auflösung 480x270, ganzzahlig skaliert)
- **Run-Länge:** 30:00 Minuten, Bosse bei 5/10/15/20/25 min + Endboss
- **Inhalte:** 30 Gegnertypen, 6 Waffen, 6 Powerups, 6 Evolutionen, 2 Helden (Mira Ashwick und Bruder Kael), 6 Bosse + Endboss, jede Truhe mit Upgrade-Rollen
- **Steuerung:** WASD/Pfeile, Touch-Joystick, Gamepad; ESC = Pause; Level-up-Dialog per Tastatur oder Tap
- **Technik:** Phaser 3 + Vite + TypeScript, datengetriebene Inhalte (`src/data`), Spiellogik als reine Funktionen (`src/logic`) mit Vitest-Tests, seeded RNG für reproduzierbare Läufe (`?seed=123`)

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server
npm run build      # Typecheck + Produktions-Build
npm test           # Vitest-Suite
npm run verify     # Headless-Smoke-Checks gegen den gebauten Stand
```

Weitere Skripte (Inhaltszählung, Performance-, Sicht- und Eingabeverify-Läufe) finden sich
in `package.json` (`scripts`) und in `docs/qa/` dokumentiert.

## Assets & Lizenz

Alles in diesem Repo ist eigenständig entworfen: Figuren, Gegner, Bosse, Icons, Effekte,
Sounds und Texte stammen aus diesem Projekt und enthalten keine Inhalte aus anderen
Spielen. Code und Assets werden mit dem Projekt veröffentlicht; die endgültige Lizenz
wird bei der v1.0-Freigabe ergänzt.
