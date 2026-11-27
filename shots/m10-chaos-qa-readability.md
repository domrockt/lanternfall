# m10-chaos-qa – Lesbarkeits-Matrix (Karte #2299)

Messung: 6 Standbilder aus dem Endgame-Lauf (`shots/m10-chaos-qa.json`, Snapshot `3f93f8f`),
Canvas 640×360 bzw. 780×360, Screenshot-Pixel = 3× logischer Pixel (`@dpr3`).
Regionen (logische Pixel): Spieler 56×56 um `playerScreen`, Truhe 32×32 um `chestScreen`,
HUD 0–44 px oben volle Breite. Luminanz = 0.2126·R + 0.7152·G + 0.0722·B.
Gegnerschuss-Kontrast: weiße Kerne (R,G,B ≥ 230) im 240×180-Fenster um den Spieler,
`contrast = Kern-Luminanz − Ring-Luminanz` (Ring = 1-px-Nachbarschaft).

Rohzahlen: `shots/m10-chaos-qa-contrast.json`.

## Tabelle

| Bild | Gegner | Gegnerschüsse | Spieler min/max/mean/std | Weiß-Anteil Spieler-Crop | Truhe min/max/mean/std | HUD min/max/mean/std | Schuss-Kontrast (Top-5) | Spieler-Silhouette | Gegnerschüsse | HUD | Truhe/Pfeil |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `m25-640` | 528 | 63 | 40/255/142/48 | 6,6 % | 20/255/119/54 | 2/248/49/52 | 142/141/135/135/131 | FAIL – im weißen AoE-Blühen | PASS | PASS | PASS (Sprite sichtbar) |
| `m27-640` | 575 | 108 | 40/255/128/40 | 2,6 % | 20/254/108/43 | 2/248/50/53 | 179/172/160/150/150 | FAIL – im weißen AoE-Blühen | PASS | PASS | PASS |
| `m29-640` | 583 | 116 | 40/255/130/52 | 3,7 % | 23/253/114/45 | 6/248/47/49 | 181/175/150/146/139 | FAIL – im weißen AoE-Blühen | PASS | PASS | PASS |
| `m25-780` | 574 | 56 | 36/241/124/41 | 1,1 % | 18/229/116/39 | 6/248/40/42 | 103/99/96/80/80 | FAIL – kein klarer Umriss, Hintergrund gleich hell | MARGINAL – min. Kern-Kontrast 80 | PASS | PASS |
| `m27-780` | 580 | 72 | 37/241/116/35 | 1,0 % | 21/236/110/47 | 6/248/43/44 | 131/98/87/82/45 | FAIL – kein klarer Umriss | MARGINAL – ein Kern-Kontrast 45 | PASS | PASS |
| `m29-780` | 575 | 79 | 36/241/116/39 | 2,2 % | 21/227/115/37 | 2/248/37/39 | 127/107/105/105/97 | FAIL – kein klarer Umriss | MARGINAL – min. 97 | PASS | PASS |

## Urteile je Bild

- **m25-640 – Spieler FAIL.** 6,6 % der Spieler-Region sind reinweiß (≥ 250);
  der Spieler steht exakt im Zentrum des additiven Waffen-Blühens und ist nicht als Silhouette zu erkennen.
  Gegnerschüsse (63) heben sich mit Kern-Kontrast ≥ 131 klar vom dunklen Moor ab. HUD (HP, LV, Zeit, KILL,
  Waffen-/Passiv-Leiste) und Boss-HP-Balken lesbar, keine Überdeckung. Truhe als goldener Sprite sichtbar.
- **m27-640 – Spieler FAIL.** 2,6 % Weiß im Spieler-Crop; auch hier liegt der AoE-Kern auf der Spielerposition.
  108 Gegnerschüsse, Kern-Kontrast ≥ 150. HUD + Hexenzirkel-Balken lesbar. Truhe sichtbar.
- **m29-640 – Spieler FAIL.** 3,7 % Weiß; Spieler im Blühen nicht unterscheidbar. 116 Gegnerschüsse, Kontrast ≥ 139.
  HUD lesbar. Zwei Truhen-Sprites sichtbar.
- **m25-780 – Spieler FAIL.** Nur 1,1 % Weiß, aber der Spieler hebt sich farblich kaum vom braun-gelben
  AoE-Boden ab (Crop-std 41). Gegnerschüsse: hellste Kerne 240–246, geringster Kern-Kontrast 80 → noch lesbar,
  aber deutlich schwächer als bei 640. HUD/Boss-Balken/Truhe PASS.
- **m27-780 – Spieler FAIL.** Banner „HEXENZIRKEL BESIEGT / EINE TRUHE ERSCHEINT“ lesbar und mittig;
  Spieler-Crop std 35, kein Umriss. Ein Gegnerschuss-Kern nur 45 Kontrast über Ring → MARGINAL.
- **m29-780 – Spieler FAIL.** 2,2 % Weiß; Spieler im gelb-braunen Blühen nicht zu identifizieren.
  Gegnerschüsse min. 97, HUD/Truhen PASS.

## Wiederkehrender Befund (→ Mängelliste, Karte #2300)

Über alle 6 Bilder: **die Spieler-Silhouette ist bei 528–583 Gegnern und 6 Evolutions-Waffen auf Stufe 8
nicht lesbar**, weil die eigenen additiven AoE-Effekte (Phönix/Thorn-Storm/Thunder-Seal/Soul-Beacon) genau
auf der Spielerposition einen near-white Bloom erzeugen. Gegnerschüsse, HUD/Boss-Balken und Truhen bleiben
lesbar; im 780-View sinkt der Schuss-Kontrast (min. 45) stärker als im 640-View, bleibt aber überwiegend lesbar.
