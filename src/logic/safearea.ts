/**
 * M10-hud-notch-safearea (#1020): Geraete-Safe-Area (Notch/Rundung) als
 * HUD-Marge. Die Geometrie ist reine Mathematik ohne DOM/Phaser (in
 * tests/hud-safearea.test.ts geprueft); das Auslesen der Insets liegt
 * getrennt in readDeviceSafeAreaInsets (body-Padding spiegelt
 * env(safe-area-inset-*, index.html) — Muster der m10-display-qa-Messung).
 */

export interface SafeAreaInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Null-Insets (Profile ohne Notch — Verhalten bleibt bitgleich). */
export const NO_INSETS: SafeAreaInsets = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Inset-Anteil, der UEBER dem Canvas liegt: index.html legt das body-Padding
 * (env(safe-area-inset-*)) an, das den Canvas bei Geraeten mit funktionierendem
 * Layout bereits in die Safe-Area rueckt (z. B. Pixel 7: Canvas x≈28 bei
 * Inset 12). Nur der Rest darf als HUD-Marge wirken, sonst wuerde ein
 * bereits sicheres Profil verschoben. Alle Werte in CSS-Px.
 */
export function insetsOverCanvas(
  insetsCss: SafeAreaInsets,
  rect: { x: number; y: number; width: number; height: number } | undefined | null,
  screenW: number,
  screenH: number,
): SafeAreaInsets {
  const g = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 0);
  if (!rect) return { ...NO_INSETS };
  const rightGap = Math.max(0, screenW - rect.x - rect.width);
  const bottomGap = Math.max(0, screenH - rect.y - rect.height);
  return {
    left: Math.max(0, g(insetsCss.left) - g(rect.x)),
    right: Math.max(0, g(insetsCss.right) - rightGap),
    top: Math.max(0, g(insetsCss.top) - g(rect.y)),
    bottom: Math.max(0, g(insetsCss.bottom) - bottomGap),
  };
}

/**
 * CSS-Insets in Spielpixel umrechnen: Spielpixel = CSS-Px * (viewWidth /
 * cssWidth). Es wird aufgerunden (nie in die Notch-Zone ragen) und negatives/
 * NaN auf 0 gesetzt. cssWidth <= 0 -> Faktor 1.
 */
export function insetsToGamePx(
  viewWidth: number,
  cssWidth: number,
  insets: SafeAreaInsets,
): SafeAreaInsets {
  const k = cssWidth > 0 && Number.isFinite(cssWidth) ? viewWidth / cssWidth : 1;
  const game = (v: number): number =>
    Number.isFinite(v) && v > 0 ? Math.ceil(v * k) : 0;
  return { left: game(insets.left), right: game(insets.right), top: game(insets.top), bottom: game(insets.bottom) };
}

/**
 * Effektive seitliche HUD-Marge: HUD-Konvention plus Geraete-Inset, gedeckelt
 * auf ein Drittel der Viewbreite, damit schmale Views nicht kollabieren.
 * inset = 0 -> exakt die HUD-Konvention (bitgleich).
 */
export function hudSideMargin(base: number, inset: number, width: number): number {
  const cap = Math.max(0, Math.floor(width / 3));
  return Math.max(0, Math.min(base + inset, cap));
}

/**
 * Effektive obere HUD-Marge: mindestens die HUD-Konvention, sonst das
 * Geraete-Inset, falls es groesser ist.
 */
export function hudTopMargin(base: number, inset: number): number {
  return Math.max(base, inset);
}

/**
 * Insets aus dem DOM lesen (body-Padding = env(safe-area-inset-*)). Ohne DOM
 * (Vitest/Worker) oder ohne body: 0.
 */
export function readDeviceSafeAreaInsets(
  doc: Document | undefined = typeof document !== "undefined" ? document : undefined,
): SafeAreaInsets {
  const style = doc?.defaultView && doc.body
    ? doc.defaultView.getComputedStyle(doc.body)
    : undefined;
  if (!style) return { ...NO_INSETS };
  const px = (v: string): number => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  return {
    left: px(style.paddingLeft),
    right: px(style.paddingRight),
    top: px(style.paddingTop),
    bottom: px(style.paddingBottom),
  };
}
