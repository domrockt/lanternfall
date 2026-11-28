# Lane m10-apk-splash-sight (NUR-MESS, P6, Start 2026-11-28 ~15:45Z)

Ziel: offener Sichtbeleg Dom 13:25Z Punkt 2 (Wünsche von Dom.md, Argus-Stand 14:52Z): Vera hat
Starting-Window/Theme der APK auf Ladescreen-Ton #0a0d14 + Laterne gesetzt (lf-apk ea37f3e,
aapt-Gegenprobe OK) — der Sichtbeleg am echten Kaltstart fehlte. Diese Lane liefert ihn.

Keine Spiel-/APK-Änderung (APK gehört Vera). Kein flock nötig (kein FPS). Karten: #12945 K1
(APK-Beleg nur lesend), #12946 K2 (Kaltstart-Beleg am Gerät), #12947 K3 (Urteil + Doku).

## K1 — APK-Beleg (nur lesend) — #12945

Beleg: `~/games/.evidence/m10-apk-splash-sight/k1-apk-theme.json` (volle Kette).

- APK: `dist/lanternfall-latest.apk` == `lanternfall-20261128-1519-a911d59.apk`
  (md5 `fb1489cd6feeceddbfbaec06710619a8`, 2 601 527 B, gebaut 15:19; versionName
  `20261128-1519-a911d59`, versionCode 26112815, package `de.domrockt.lanternfall`).
  Das ist derselbe Fallback-Pfad, den device-bridge installiert.
- Methode: kein aapt2/apktool/java auf dem Rig (geprüft) → NUR LESEND entpackt und
  `resources.arsc` + binäre AXMLs mit einem eigenen Chunk-Parser gedeutet; Manifest und
  attr-ID gegen pyaxmlparser gegenlesen. Kette:
  1. Manifest: `<application android:theme="@7F030000">` (Activity erbt).
  2. `0x7f030000` = **style/LfTheme** (parent = framework Material-Theme `0x0103022f`).
  3. LfTheme setzt `android:windowBackground` (attr `0x01010054`, gegengeprüft) = `@7F020001`.
  4. `0x7f020001` = **drawable/lf_splash** → `res/drawable/lf_splash.xml` =
     `<layer-list><item android:drawable="@7F040000"/><item><bitmap android:gravity="0x11"
     (CENTER) android:src="@7F020000"/></item></layer-list>`.
  5. `0x7f040000` = **color/lf_bg = #0a0d14** (dataType `0x1d` INT_COLOR_RGB8, data
     `0xff0a0d14`; exakt 1 Fundstelle in der ganzen arsc).
  6. `0x7f020000` = drawable/ic = `ic.png` (192×192): **Laterne** auf dunklem Grund, zentriert.
- Urteil K1: APK-Inhalt belegt statisch Theme #0a0d14 + zentrierte Laterne für das
  Starting-Window. Lebender Kaltstart-Beleg → K2.

## K2 — Kaltstart-Beleg am Gerät — #12946 (Stand: WIP)

Mess-Skript: `scripts/m10-apk-splash.mjs` (device-bridge `http://172.17.0.1:5181`:
`POST /launch` = force-stop + Kaltstart, `POST /screenshot` = adb screencap 2560×1600;
screenrecord liefert auf dem Redmi Pad nur Stümpfe → Screencaps).

- 15:45Z Probe-Launch + 1 Screencap (Bridge legte das PNG nach
  `~/games/.evidence/device/screen-20261128-154518.png`, archiviert nach
  `~/games/.evidence/m10-apk-splash-sight/coldstart-run1/`): zeigt die WebView-Boot-Phase
  „LADE MOOR …" — davon FARBMESSUNG (Pillow): Boot-BG `#0a0e16` (Ziel `#0a0d14`, ΔRGB ≤ 4/255,
  sehr nah — vermutlich Display-/PNG-Pipeline), Letterbox-Balken oben/unten `#06070c`
  (dunkler als der Boot-BG → sichtbarer Ton-Rand, Befund, Severity low), Text `#6b7c86`.
- 15:50Z: Spieler-Sperre aktiv (`dom_playing=true`, `user_idle_s=25`) → alle 3 Starts des
  ersten Skriptlaufs korrekt übersprungen (`coldstart-run1/manifest.json`). Kein Launch
  gegen die Sperre.
- Geplant: EIN verspäteter Retry (Briefing: „bei 409 später erneut versuchen, ein Versuch pro
  Karte") als Automation `aut_222d6287c001NnxHGjSYpIN42s` um 16:01:30Z — prüft `/status` und
  läuft nur, wenn die Sperre aufgehoben ist; sonst Befund notieren.
- 15:54Z (Versuch 2, Resume): Session übernommen. Die zugehörige Auswertungs-Automation zeigte
  auf die tote Session des Versuchs 1 → gelöscht; Ersatz `aut_222ddd4b2001CFPUw5YAaaD9vS`
  pingt diese Session um 16:07:30Z. Messwerkzeug `~/tmp/m10-apk-splash-sight/measure.py`
  (Boot-BG-Median zentral, Letterbox-Streifen, Laterne/Text-Anteil >90 Helligkeit) steht bereit.

## K3 — Urteil + Doku — #12947 (Gerüst, wird nach K2 gefüllt)

- Belege: `~/games/.evidence/m10-apk-splash-sight/coldstart-run{1,2}/` (manifest + PNGs),
  Farb-JSONs je Start.
- Zu beantworten: Zeigt der echte Kaltstart das Starting-Window in #0a0d14 mit zentrierter
  Laterne? Wirkt der Start wie „hängt" oder wie Ladescreen?
- Urteil erfolgt nach K2-Daten; art-Direkt-Urteil (>= 4/5 oder Befundliste mit Severity).
