/**
 * Pure input aggregation for M8-input.
 *
 * No Phaser / DOM imports, no side effects. Every frame the raw keyboard,
 * touch and gamepad snapshots are merged into a single movement vector
 * (length 0..1) and a set of actions. Actions reported by `InputState.update`
 * are edge-triggered (rising edge only).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface ActionState {
  pause: boolean;
  confirm: boolean;
  back: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface KeyboardSnapshot {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  pause?: boolean;
  confirm?: boolean;
  back?: boolean;
}

export interface TouchSnapshot {
  active: boolean;
  x: number;
  y: number;
  pause?: boolean;
}

export interface GamepadSnapshot {
  axes: readonly number[];
  buttons: readonly boolean[];
}

export interface InputSources {
  keyboard?: KeyboardSnapshot | null;
  touch?: TouchSnapshot | null;
  gamepad?: GamepadSnapshot | null;
}

export interface InputFrame {
  move: Vec2;
  actions: ActionState;
}

/** Touch-axis deadzone (12% of the stick radius). */
export const TOUCH_DEADZONE = 0.12;
/**
 * M10-touch-latency: Hysterese-Ausgangsschwelle. Ein einmal aktiver Stick
 * bleibt aktiv, bis der Rohvektor unter 75 % der Eingangsschwelle faellt.
 * Zwischen Aus- und Eingangsschwelle wird exakt 0 ausgegeben, damit ein
 * ruhender Finger am Totzonen-Rand kein Zittern erzeugt.
 */
export const TOUCH_RELEASE_DEADZONE = TOUCH_DEADZONE * 0.75;
/** Gamepad stick deadzone (18%). */
export const PAD_DEADZONE = 0.18;

export const MOVE_SOURCE_PRIORITY = ["touch", "gamepad", "keyboard"] as const;

export type MoveSource = (typeof MOVE_SOURCE_PRIORITY)[number];

const EPS = 1e-9;

/**
 * M10-touch-latency: Deadzone mit Hysterese.
 *
 * - `engaged === false`: Vektor wird erst oberhalb `TOUCH_DEADZONE` aktiv.
 * - `engaged === true`: Vektor bleibt bis unter `TOUCH_RELEASE_DEADZONE` aktiv;
 *   im Band dazwischen ist die Ausgabe exakt 0 (kein Zittern am Rand).
 * - Die Magnitude wird immer relativ zur Eingangsschwelle neu abgebildet, so
 *   dass der Übergang bei `TOUCH_DEADZONE` stetig bleibt.
 */
export function applyTouchDeadzoneHysteresis(
  x: number,
  y: number,
  engaged: boolean,
): { x: number; y: number; engaged: boolean } {
  const dx = num(x);
  const dy = num(y);
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len <= EPS) return { x: 0, y: 0, engaged: false };

  if (len <= TOUCH_RELEASE_DEADZONE) return { x: 0, y: 0, engaged: false };
  if (len <= TOUCH_DEADZONE) {
    // Im Hysterese-Band: Zustand halten, aber keine Bewegung ausgeben.
    return engaged ? { x: 0, y: 0, engaged: true } : { x: 0, y: 0, engaged: false };
  }

  const mag = clamp01((len - TOUCH_DEADZONE) / (1 - TOUCH_DEADZONE));
  return { x: (dx / len) * mag, y: (dy / len) * mag, engaged: true };
}

/** Defensive number: NaN / non-finite collapse to 0. */
function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

/** Defensive boolean read from a (possibly short) button array. */
function btn(buttons: readonly boolean[] | null | undefined, index: number): boolean {
  if (!buttons || index < 0 || index >= buttons.length) return false;
  return buttons[index] === true;
}

/** Defensive axis read from a (possibly short) axis array. */
function axis(axes: readonly number[] | null | undefined, index: number): number {
  if (!axes || index < 0 || index >= axes.length) return 0;
  return num(axes[index]);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

/** Normalize a vector to length 1; zero (or invalid) vectors return {0,0}. */
export function normalizeVector(dx: number, dy: number): Vec2 {
  const x = num(dx);
  const y = num(dy);
  const len = Math.hypot(x, y);
  if (!Number.isFinite(len) || len <= EPS) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

/**
 * Radial deadzone: inside the deadzone returns {0,0}; outside the direction
 * is normalized and the magnitude is linearly remapped from
 * [deadzone..1] onto [0..1] and clamped.
 */
export function applyDeadzone(x: number, y: number, deadzone: number): Vec2 {
  const dx = num(x);
  const dy = num(y);
  const dz = clamp01(num(deadzone));
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len <= EPS || len <= dz) return { x: 0, y: 0 };
  const mag = clamp01((len - dz) / (1 - dz));
  if (mag <= 0) return { x: 0, y: 0 };
  return { x: (dx / len) * mag, y: (dy / len) * mag };
}

function emptyActions(): ActionState {
  return {
    pause: false,
    confirm: false,
    back: false,
    up: false,
    down: false,
    left: false,
    right: false,
  };
}

/** Digital direction vector from four booleans, normalized for diagonals. */
function digitalVector(up: boolean, down: boolean, left: boolean, right: boolean): Vec2 {
  const dx = (right ? 1 : 0) - (left ? 1 : 0);
  const dy = (down ? 1 : 0) - (up ? 1 : 0);
  return normalizeVector(dx, dy);
}

/** Digital D-Pad vector from buttons 12 (up), 13 (down), 14 (left), 15 (right). */
function dpadVector(pad: GamepadSnapshot | null | undefined): Vec2 {
  if (!pad) return { x: 0, y: 0 };
  return digitalVector(
    btn(pad.buttons, 12),
    btn(pad.buttons, 13),
    btn(pad.buttons, 14),
    btn(pad.buttons, 15),
  );
}

/** Stick vector (axes 0/1) with PAD_DEADZONE, normalized and remapped. */
function stickVector(pad: GamepadSnapshot | null | undefined): Vec2 {
  if (!pad) return { x: 0, y: 0 };
  return applyDeadzone(axis(pad.axes, 0), axis(pad.axes, 1), PAD_DEADZONE);
}

function gamepadVector(pad: GamepadSnapshot | null | undefined): Vec2 {
  const dpad = dpadVector(pad);
  if (Math.hypot(dpad.x, dpad.y) > EPS) return dpad;
  return stickVector(pad);
}

function keyboardVector(kb: KeyboardSnapshot | null | undefined): Vec2 {
  if (!kb) return { x: 0, y: 0 };
  return digitalVector(kb.up === true, kb.down === true, kb.left === true, kb.right === true);
}

function touchVector(t: TouchSnapshot | null | undefined): Vec2 {
  if (!t || t.active !== true) return { x: 0, y: 0 };
  return applyDeadzone(t.x, t.y, TOUCH_DEADZONE);
}

/**
 * Merge movement sources with strict priority (touch > gamepad > keyboard).
 * The first source whose resulting vector has a non-zero length wins; vectors
 * are never mixed or added. Returns {0,0} when no source is active.
 */
export function mergeSources(sources: InputSources, touchMoveOverride?: Vec2 | null): Vec2 {
  const src = sources ?? {};
  for (const source of MOVE_SOURCE_PRIORITY) {
    const vector = source === "touch"
      ? (touchMoveOverride ?? touchVector(src.touch))
      : source === "gamepad"
        ? gamepadVector(src.gamepad)
        : keyboardVector(src.keyboard);
    if (Math.hypot(vector.x, vector.y) > EPS) return vector;
  }
  return { x: 0, y: 0 };
}

/** Actions contributed by a keyboard snapshot. */
export function readKeyboardActions(kb: KeyboardSnapshot | null | undefined): ActionState {
  const a = emptyActions();
  if (!kb) return a;
  a.pause = kb.pause === true;
  a.confirm = kb.confirm === true;
  a.back = kb.back === true;
  a.up = kb.up === true;
  a.down = kb.down === true;
  a.left = kb.left === true;
  a.right = kb.right === true;
  return a;
}

/** Actions contributed by a touch snapshot (only pause so far). */
export function readTouchActions(t: TouchSnapshot | null | undefined): ActionState {
  const a = emptyActions();
  if (!t) return a;
  a.pause = t.pause === true;
  return a;
}

/**
 * Actions contributed by a gamepad snapshot:
 * A (0) = confirm, B (1) = back, Start (9) = pause.
 * D-Pad 12/13/14/15 map to up/down/left/right; stick axes 0/1 with
 * PAD_DEADZONE additionally also act as directions.
 */
export function readGamepadMoveActions(
  pad: GamepadSnapshot | null | undefined,
): ActionState {
  const a = emptyActions();
  if (!pad) return a;

  a.confirm = btn(pad.buttons, 0);
  a.back = btn(pad.buttons, 1);
  a.pause = btn(pad.buttons, 9);

  const ax = axis(pad.axes, 0);
  const ay = axis(pad.axes, 1);

  a.up = btn(pad.buttons, 12) || ay < -PAD_DEADZONE;
  a.down = btn(pad.buttons, 13) || ay > PAD_DEADZONE;
  a.left = btn(pad.buttons, 14) || ax < -PAD_DEADZONE;
  a.right = btn(pad.buttons, 15) || ax > PAD_DEADZONE;
  return a;
}

/**
 * True wenn keine Aktion gehalten wird. Menue-Szenen nutzen das als
 * "Pad wieder scharf"-Gate nach einem Szenenwechsel (ein gehaltenes A darf den
 * naechsten Screen nicht sofort bestaetigen).
 */
export function allActionsReleased(a: ActionState): boolean {
  return !a.pause && !a.confirm && !a.back && !a.up && !a.down && !a.left && !a.right;
}

/** OR-combine any number of action states. */
export function mergeActions(...states: ActionState[]): ActionState {
  const out = emptyActions();
  for (const s of states) {
    if (!s) continue;
    out.pause = out.pause || s.pause === true;
    out.confirm = out.confirm || s.confirm === true;
    out.back = out.back || s.back === true;
    out.up = out.up || s.up === true;
    out.down = out.down || s.down === true;
    out.left = out.left || s.left === true;
    out.right = out.right || s.right === true;
  }
  return out;
}

/**
 * Stateful input aggregator. Pure `update` merges all sources per frame and
 * reports actions on their rising edge only. `reset` clears the edge history
 * (next update fires reports like the first frame).
 */
export class InputState {
  private previous: ActionState = emptyActions();
  /** M10-touch-latency: Hysterese-Gedächtnis des Touch-Sticks. */
  private touchEngaged = false;

  update(sources: InputSources): InputFrame {
    const touch = sources?.touch;
    let touchMove: Vec2 | null = null;
    if (touch?.active === true) {
      const h = applyTouchDeadzoneHysteresis(touch.x, touch.y, this.touchEngaged);
      touchMove = { x: h.x, y: h.y };
      this.touchEngaged = h.engaged;
    } else {
      this.touchEngaged = false;
    }

    const move = mergeSources(sources ?? {}, touchMove);
    const held = mergeActions(
      readKeyboardActions(sources?.keyboard),
      readTouchActions(sources?.touch),
      readGamepadMoveActions(sources?.gamepad),
    );

    const actions: ActionState = {
      pause: held.pause && !this.previous.pause,
      confirm: held.confirm && !this.previous.confirm,
      back: held.back && !this.previous.back,
      up: held.up && !this.previous.up,
      down: held.down && !this.previous.down,
      left: held.left && !this.previous.left,
      right: held.right && !this.previous.right,
    };

    this.previous = held;
    return { move, actions };
  }

  reset(): void {
    this.previous = emptyActions();
    this.touchEngaged = false;
  }
}
