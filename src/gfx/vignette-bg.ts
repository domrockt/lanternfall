import type Phaser from "phaser";

/**
 * Lane m10-menubg-crisp-rest: Menue-Hintergrund-Overlay ("vignette") pixelgenau.
 *
 * Befund (F1-Klasse aus m10-menu-art-crisp, Beleg shots/m10-menubg-before.json):
 * Die Vignette-Textur wird beim Boot in der aktuellen View-Groesse erzeugt und
 * vom Texture-Manager global geteilt. Nach einem Live-Resize bleibt sie auf der
 * alten Groesse, die Szene restartet und stretcht sie per setDisplaySize
 * fraktional (640 -> 780 = 1.21875x) — Mixel-Verstoss "eine Pixelgroesse".
 *
 * Fix (Muster m10-title-bg-crisp #6739): ganzzahliger Texel-Scale, Restflaeche
 * schliessen echte Rand-Texel (1px-Kanten-Texturen, einmalig erzeugt).
 * Alle Teile haben ganzzahlige Texel-Skalierung und kacheln die View
 * lueckenlos: left + texW*scale + right = gameW (Fuellung deckt die View).
 * Bei zu grosser Textur (Resize nach unten) faellt der Kern in den Crop
 * (x <= 0) und deckt die View ohne Fuellstreifen ab.
 *
 * Licht-Glows (light_radius, ADD-Blend) sind bewusst NICHT Teil davon:
 * weiche radialen Gluehen, kein Hintergrund/Panel (wie in m10-menu-art-crisp).
 */

export interface VignetteBgLayout {
  /** Ganzzahliger Texel-Scale des Kernbilds (nie fraktional). */
  scale: number;
  /** Position des Kernbilds (Origin 0,0), ganzzahlig (im Crop-Fall negativ). */
  x: number;
  y: number;
  /** Randbreiten in px, die die Kanten-Fuellung schliesst (>= 0 im Normalfall). */
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function vignetteBgLayout(
  gameW: number,
  gameH: number,
  texW: number,
  texH: number,
): VignetteBgLayout {
  const scale = Math.max(1, Math.floor(Math.min(gameW / texW, gameH / texH)));
  const x = Math.round((gameW - texW * scale) / 2);
  const y = Math.round((gameH - texH * scale) / 2);
  return {
    scale,
    x,
    y,
    left: x,
    top: y,
    right: gameW - (x + texW * scale),
    bottom: gameH - (y + texH * scale),
  };
}

/**
 * Prueft den Layout-Vertrag: Kern + Fuellung kacheln die View lueckenlos.
 * Identitaet left + texW*scale + right = gameW (dito senkrecht), alles
 * ganzzahlig, Scale >= 1; im Crop-Fall (Texur groesser als View) muss der
 * Kern allein die View abdecken.
 */
export function vignetteBgCoversView(
  l: VignetteBgLayout,
  gameW: number,
  gameH: number,
  texW: number,
  texH: number,
): boolean {
  const coreW = l.x + texW * l.scale;
  const coreH = l.y + texH * l.scale;
  const cropX = l.x <= 0 && coreW >= gameW;
  const cropY = l.y <= 0 && coreH >= gameH;
  return Number.isInteger(l.scale) && l.scale >= 1
    && Number.isInteger(l.x) && Number.isInteger(l.y)
    && Number.isInteger(l.left) && Number.isInteger(l.top)
    && Number.isInteger(l.right) && Number.isInteger(l.bottom)
    && l.left + texW * l.scale + l.right === gameW
    && l.top + texH * l.scale + l.bottom === gameH
    && ((l.left >= 0 && l.right >= 0) || cropX)
    && ((l.top >= 0 && l.bottom >= 0) || cropY);
}

/**
 * Zeichnet das Vignette-Overlay pixelgenau ueber die ganze View (depth -1,
 * wie bisher). Erzeugt einmalig 1px-Kanten-Texturen aus echten Rand-Texeln
 * (setCrop samplet hier unzuverlaessig — Erfahrung aus #6739).
 */
export function addVignetteBg(
  scene: Phaser.Scene,
  gameW: number,
  gameH: number,
  key = "vignette",
  depth = -1,
): void {
  const source = scene.textures.get(key).getSourceImage() as
    { width: number; height: number };
  const texW = source.width;
  const texH = source.height;
  const l = vignetteBgLayout(gameW, gameH, texW, texH);

  const mk = (ekey: string, sx: number, sy: number, w: number, h: number): void => {
    const existing = scene.textures.exists(ekey)
      ? (scene.textures.get(ekey).getSourceImage() as { width: number; height: number } | null)
      : null;
    // Reviewer-Nit #6939: falls die Basistextur kuenftig in anderer Groesse
    // neu erzeugt wird, dürfen keine veralteten Kanten-Baender weiterleben.
    if (existing && existing.width === w && existing.height === h) return;
    if (existing) scene.textures.remove(ekey);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(
      scene.textures.get(key).getSourceImage() as unknown as CanvasImageSource,
      sx, sy, w, h, 0, 0, w, h,
    );
    scene.textures.addCanvas(ekey, canvas);
  };
  mk(`${key}_col_l`, 0, 0, 1, texH);
  mk(`${key}_col_r`, texW - 1, 0, 1, texH);
  mk(`${key}_row_t`, 0, 0, texW, 1);
  mk(`${key}_row_b`, 0, texH - 1, texW, 1);
  mk(`${key}_px_tl`, 0, 0, 1, 1);
  mk(`${key}_px_tr`, texW - 1, 0, 1, 1);
  mk(`${key}_px_bl`, 0, texH - 1, 1, 1);
  mk(`${key}_px_br`, texW - 1, texH - 1, 1, 1);

  const band = (tex: string, sx: number, sy: number, px: number, py: number): void => {
    if (sx <= 0 || sy <= 0) return; // Crop-Fall: kein Rand zu fuellen
    scene.add.image(px, py, tex).setOrigin(0, 0).setDepth(depth).setScale(sx, sy);
  };
  const s = l.scale;
  const bx = l.x + texW * s;
  const by = l.y + texH * s;
  if (l.top > 0) band(`${key}_row_t`, s, l.top, l.x, 0);
  if (l.bottom > 0) band(`${key}_row_b`, s, l.bottom, l.x, by);
  if (l.left > 0) band(`${key}_col_l`, l.left, s, 0, l.y);
  if (l.right > 0) band(`${key}_col_r`, l.right, s, bx, l.y);
  if (l.top > 0 && l.left > 0) band(`${key}_px_tl`, l.left, l.top, 0, 0);
  if (l.top > 0 && l.right > 0) band(`${key}_px_tr`, l.right, l.top, bx, 0);
  if (l.bottom > 0 && l.left > 0) band(`${key}_px_bl`, l.left, l.bottom, 0, by);
  if (l.bottom > 0 && l.right > 0) band(`${key}_px_br`, l.right, l.bottom, bx, by);
  scene.add.image(l.x, l.y, key).setOrigin(0, 0).setDepth(depth).setScale(s);
}
