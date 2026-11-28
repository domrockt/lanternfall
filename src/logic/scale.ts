/**
 * M10-android-scale-floor-r2 (K2): Renderpuffer nie unter logische
 * Aufloesung. RENDER_SCALE war ein ganzzahliger TEILER der internen
 * Renderbuffer-Kanten (1 = voll, 2/3 = Viertel/Neuntel der Pixel). Der
 * adaptive Regler aus m10-dpr-budget-cap senkte den Buffer bei Ruckeln auf
 * 320x180 — 1-px-Pixelschrift und Sprites verlieren Zeilen (Dom-Foto:
 * Level-Up-Text als Strichreste, Repro
 * ~/games/.evidence/m10-android-scale-floor-r2/android-tabS4-levelup-rb2-before.png).
 *
 * Seit K2 ist der Teiler HART auf 1 festgesetzt: kein Codepfad rendert unter
 * 640x360 logisch (Android-Praxisregel 1: Last reduzieren statt Aufloesung).
 * Die Laststeuerung uebernimmt die Qualitaetsstufe src/logic/quality.ts (K3).
 * Das ?rbscale-Override bleibt als Debug-Messwerkzeug, Werte > 1 werden auf 1
 * geklemmt (applyRenderScaleOverride).
 */
export const RENDER_SCALE_MIN = 1;
export const RENDER_SCALE_MAX = 1;

/** Hysterese-Schwellen (FPS) und -zeiten (ms) fuer den Einbau. */
export const SCALE_LOW_FPS = 45;
export const SCALE_HIGH_FPS = 57;
export const SCALE_LOW_MS = 2000;
export const SCALE_HIGH_MS = 4000;

/**
 * M10-scale-osc-guard: Pump-Schutz. Unter alternierender Last (Lastspitze/
 * Entlastung im Wechsel) pendelte der Regler zwischen Stufen (Beleg
 * shots/m10-scale-osc-before.json: 49 Wechsel/240 s bei 5-s-Epochen).
 * Zwei Deckel:
 *  - SCALE_MIN_STEP_MS: mindestens so viel Zeit zwischen ZWEI beliebigen
 *    Stufenwechseln (max 1 Wechsel je ~480 Frames bei 60 FPS).
 *  - SCALE_RECOVER_MS: Abbau (Teiler -1) braucht 12 s AM STUECK >= 57 FPS
 *    (belowMs-Zone setzt aboveMs zurueck -> alternierende Epochen von
 *    <= 12 s koennen den Abbau nie ausloesen). Erstwechsel (noch nie
 *    gewechselt) bleibt bei SCALE_HIGH_MS, damit der Kaltstart unter Last
 *    nicht verzoegert wird.
 */
export const SCALE_MIN_STEP_MS = 8000;
export const SCALE_RECOVER_MS = 12000;

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

/**
 * Maximale Sinnvolle Teilerstufe aus dpr und View: Bei dpr 1 gibt es kein
 * Geraete-Pixel-Budget einzusparen (Canvas = Bildschirmreferenz), bei dpr 3
 * bis zu 3x; der Renderbuffer faellt nie unter 320x180.
 */
export function maxRenderScale(width: number, height: number, dpr: number): number {
  if (!(width > 0) || !(height > 0)) return RENDER_SCALE_MIN;
  const dprCap = Math.floor(Math.max(1, Number.isFinite(dpr) ? dpr : 1));
  const sizeCap = Math.floor(Math.min(width / 320, height / 180));
  return Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, dprCap, sizeCap));
}

/**
 * Sofort-Ziel als reine Funktion: ganzzahliger Teiler in [1, maxRenderScale].
 * fpsEwma unter dem Frame-Budget (1000/budgetMs) erhoehen den Teiler so, dass
 * die gerenderte Pixelmenge (Teiler^2) die Luecke schliesst; unbekanntes/-
 * epsilon-FPS bleibt bei 1 (nicht schrumpfen ohne Beleg).
 */
export function chooseRenderScale(
  dpr: number,
  width: number,
  height: number,
  fpsEwma: number,
  budgetMs: number,
): number {
  if (!Number.isFinite(fpsEwma) || fpsEwma <= 0) return RENDER_SCALE_MIN;
  const budget = Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : 1000 / 60;
  const targetFps = 1000 / budget;
  if (fpsEwma >= targetFps) return RENDER_SCALE_MIN;
  const need = Math.ceil(targetFps / fpsEwma);
  return clampInt(need, RENDER_SCALE_MIN, maxRenderScale(width, height, dpr));
}

/** Zustand des Hysterese-Reglers (rein, ohne Uhr/Google). */
export interface RenderScaleState {
  /** Aktueller ganzzahliger Teiler. */
  scale: number;
  /** Verweilzeit unter SCALE_LOW_FPS (ms). */
  belowMs: number;
  /** Verweilzeit ab SCALE_HIGH_FPS (ms). */
  aboveMs: number;
  /**
   * Ms seit dem letzten Stufenwechsel (Pump-Deckel). Optional: undefined =
   * noch nie gewechselt — der Erstschriftweg verhaelt sich wie vor dem Guard
   * (src/config.ts legt den State ohne dieses Feld an).
   */
  sinceChangeMs?: number;
}

/**
 * Ein Regler-Schritt: unter 45 FPS fuer 2 s senken nicht moeglich -> Teiler
 * erhoehen (bis cap); ab 57 FPS fuer 4 s heben -> Teiler senken. Zwischen den
 * Schwellen (totale Zone) bleiben beide Timer EINGEFROREN (Fortschritt bleibt):
 * Bei Last-Jitter um 45 FPS wuerde ein Reset den 2-s-Timer nie voll laufen
 * lassen (Probe 2026-11-27: FPS pendelt 41,6-53, Buffer blieb Teiler 1).
 *
 * M10-scale-osc-guard (Pump-Deckel): ein Wechsel ist zusaetzlich nur zulässig,
 * wenn seit dem letzten Wechsel >= SCALE_MIN_STEP_MS vergangen sind; der Abbau
 * (Teiler -1) braucht zudem SCALE_RECOVER_MS am Stueck >= 57 FPS. Alternierende
 * Lastserien fuehren damit nach dem Einschwingen zu 0 Wechseln
 * (tests/scale-osc.test.ts, shots/m10-scale-osc-after.json).
 */
export function stepRenderScale(
  state: RenderScaleState,
  fpsEwma: number,
  dtMs: number,
  cap: number,
): RenderScaleState {
  const dt = Number.isFinite(dtMs) && dtMs > 0 ? dtMs : 0;
  const upperCap = Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, Math.round(cap)));
  let { scale, belowMs, aboveMs } = state;
  let sinceChangeMs = state.sinceChangeMs;
  if (sinceChangeMs !== undefined) sinceChangeMs += dt;
  const canChange = sinceChangeMs === undefined || sinceChangeMs >= SCALE_MIN_STEP_MS;
  if (Number.isFinite(fpsEwma) && fpsEwma > 0 && fpsEwma < SCALE_LOW_FPS) {
    belowMs += dt;
    aboveMs = 0;
    if (belowMs >= SCALE_LOW_MS && scale < upperCap && canChange) {
      scale += 1;
      belowMs = 0;
      aboveMs = 0;
      sinceChangeMs = 0;
    }
  } else if (Number.isFinite(fpsEwma) && fpsEwma >= SCALE_HIGH_FPS) {
    aboveMs += dt;
    belowMs = 0;
    // Abbau: Erstwechsel (noch nie gewechselt) am alten Schwellwert, danach
    // erst nach SCALE_RECOVER_MS am Stueck (belowMs-Zone setzt aboveMs
    // zurueck, "am Stueck" ist damit abgedeckt).
    const downNeed = sinceChangeMs === undefined ? SCALE_HIGH_MS : Math.max(SCALE_HIGH_MS, SCALE_RECOVER_MS);
    if (aboveMs >= downNeed && scale > RENDER_SCALE_MIN && canChange) {
      scale -= 1;
      belowMs = 0;
      aboveMs = 0;
      sinceChangeMs = 0;
    }
  }
  // Totzone: beide Timer einfrieren (kein Zweig greift).
  scale = Math.max(RENDER_SCALE_MIN, Math.min(upperCap, scale));
  return { scale, belowMs, aboveMs, sinceChangeMs };
}

/**
 * URL-Override fuer Messungen parsen: fehlender Parameter -> null (Regler
 * aktiv), 0 -> aus (Voller Renderbuffer), 1..3 -> fester Teiler. Achtung:
 * Number(null) ist 0 — deshalb wird der Parameter explizit auf null geprueft.
 */
export function parseRenderScaleOverride(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded >= RENDER_SCALE_MIN && rounded <= RENDER_SCALE_MAX) return rounded;
  return rounded === 0 ? 0 : null;
}

/**
 * M10-android-scale-floor-r2 (K2): Wirkt einen ?rbscale-Override auf den
 * Soll-Teiler. Ein gesetzter Override (0 = aus = voller Buffer, 1 = voller
 * Buffer) hat Vorrang vor dem Regler-Zustand; Werte > 1 werden auf 1
 * GEKLEMMT — das Override bleibt nur ein Debug-Werkzeug und kann den Text
 * nicht mehr zerstoeren (K4-Abnahme). null laesst den Regler gelten (der
 * kann seit K2 ebenfalls nicht mehr unter 1). 0 darf NICHT auf 1 geklemmt
 * werden (bedeutungstraegender Wert "Regler aus", Verdrahtung src/config.ts).
 */
export function applyRenderScaleOverride(
  override: number | null,
  controllerScale: number,
): number {
  if (override === null) {
    return Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, Math.round(controllerScale)));
  }
  if (override === 0) return 0;
  return Math.max(RENDER_SCALE_MIN, Math.min(RENDER_SCALE_MAX, Math.round(override)));
}

/** Ganzzahlige Canvas-Skalierung: nie weiche Bruchteile, nie < 1. */
export function integerScale(
  innerWidth: number,
  innerHeight: number,
  baseWidth: number,
  baseHeight: number,
): number {
  if (!(innerWidth > 0) || !(innerHeight > 0) || !(baseWidth > 0) || !(baseHeight > 0)) return 1;
  return Math.max(1, Math.floor(Math.min(innerWidth / baseWidth, innerHeight / baseHeight)));
}
