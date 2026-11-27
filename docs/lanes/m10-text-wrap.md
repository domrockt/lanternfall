# Lane m10-text-wrap — Wortumbruch/Ellipsis für einzeilige Banner

Fix aus dem Restpunkt „Wortumbruch text.ts (fremd)" der Lane m10-results-overlap
(K1-Befund: Banner mid-word abgeschnitten als „NEUER BESTWERT: ZEIT, LEVE").
Branch `m10-text-wrap`, Worktree `/home/ai/games/lf-lanes/m10-text-wrap`.

## Was umgesetzt wurde

- **Neu: `src/gfx/text.ts`** — `fitBanner(text, maxChars)` + `ELLIPSIS`.
  Bricht an Leerzeichen, nie mitten im Wort, hängt bei Kürzung eine Ellipsis
  ans ganze Wort an. Hinweis: die 5x7-Glyphentabelle (`src/gfx/glyphs.ts`,
  fremde Datei, nicht angefasst) hat keine U+2026-Glyphe — die Ellipsis wird
  deshalb als `".."` mit bestehenden Glyphen gerendert.
  (PixelText selbst liegt wie bisher unverändert in `src/gfx/font.ts`; das
  Briefing nannte fälschlich `text.ts` als Ablageort von PixelText. Die neue
  Datei `src/gfx/text.ts` ist die im Briefing vorgesehene Ablage.)
- **`src/scenes/Results.ts`** — Bestwert-Banner nutzt `fitBanner(..., 26)`;
  der alte Fallback „ganz oder gar nicht" (der die Labels wegwarf) ist ersetzt.
- **`tests/text-wrap.test.ts`** — 6 Unit-Tests: kurze Texte unverändert,
  Bruch an Wortgrenzen, alle 15 Label-Kombinationen der Bestwert-Banner
  passen in 26 Zeichen ohne Teilwort, Ellipsis-Größe, Hard-Cut-Fall.

## Belege (EIN Vorher-Lauf, EIN Nachher-Lauf, keine Messschleife)

Harness `scripts/m10-results-overlap.mjs` (Stress: 12 Waffennamen,
640×360 + 780×360@3, Victory + Defeat):

| Lauf | 640 victory | 640 defeat | 780 victory | 780 defeat | Summe |
|---|---|---|---|---|---|
| before (`shots/m10-results-overlap-before.json`) | 0/0 | 0/0 | 0/0 | 0/0 | overlaps=0 clipped=0 |
| after (`shots/m10-results-overlap-after.json`) | 0/0 | 0/0 | 0/0 | 0/0 | overlaps=0 clipped=0 |

- **Kein mid-word Cut in 4/4 Views:** Banner-Text nachher „NEUER BESTWERT:
  ZEIT,.." (Wortgrenze + Ellipsis, vorher Fallback „NEUER BESTWERT" ohne Labels).
- **0 neue Overlaps:** before 0 → after 0 (alle 4 Views), JS-Fehler 0/0.
- **Sichtcheck:** `shots/m10-text-wrap-banner-victory-640.png`,
  `shots/m10-text-wrap-banner-victory-780.png` — Banner komplett in der Box,
  Ellipsis lesbar; Waffennamen (DORNENSTURM, STURMRUNE, …) unangetastet.
- Suite: 48 Dateien / **505 Tests grün**, `npx tsc --noEmit` sauber.

## Offene Punkte

- Keine. Folge-Thema „Luftpuffer Ergebnisse-Screen" läuft als eigene Karte
  (#4382 m10-results-overlap-followup), nicht Teil dieser Lane.
