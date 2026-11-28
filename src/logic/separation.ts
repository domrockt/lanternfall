/**
 * Reine Separation-/Ausweich-Helfer für Gegner.
 *
 * Deckungsgleiche Gegner haben keinen natürlichen Richtungsvektor; statt (0,0)
 * wird eine deterministische Richtung aus der Spawn-UID abgeleitet (goldener
 * Winkel). Damit bleiben Stapel nicht stehen und Runs sind seed-stabil.
 *
 * Massengewichtung (M10): Gegner mit größerem Radius (Tanks, Elite, Bosse)
 * drücken kleine Schwarmgegner stärker weg, werden selbst aber kaum bewegt.
 * Die Gewichte summieren sich pro Paar auf 2 (statt vorher 1+1 identisch),
 * damit die Gesamt-Separation gleich stark bleibt. Die Kopplung ist rein aus
 * den Radien abgeleitet und braucht keine Änderung an den Aufrufern.
 */
import { SpatialHash } from "../systems/SpatialHash";

export const GOLDEN_ANGLE = 2.399963;

export interface Vec2 {
  x: number;
  y: number;
}

/* ── Massengewichtung ─────────────────────────────────────────── */

/** Flächenproxy der Masse; mind. 1, damit Radius 0 nicht alles schluckt. */
function massOf(radius: number): number {
  const r = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  return Math.max(1, r * r);
}

/**
 * Anteil des Separationsschlupfs, den `self` übernehmen muss.
 * Gleich große Gegner: 1 (beide zusammen 2, wie vor M10).
 * Kleiner Gegner gegen Tank: > 1 (weicht stärker), Tank: < 1.
 * Geklemmt auf [0.25, 2], damit Extremradien nicht explodieren.
 */
export function separationWeight(selfRadius: number, otherRadius: number): number {
  const ms = massOf(selfRadius);
  const mo = massOf(otherRadius);
  const w = (2 * mo) / (ms + mo);
  return Math.min(2, Math.max(0.25, w));
}

/* ── Bestehende API (Signaturen unverändert) ──────────────────── */

/** Deterministische Ausweichrichtung für eine UID (kein Math.random). */
export function fallbackDir(uid: number): Vec2 {
  const id = Number.isFinite(uid) ? uid : 0;
  const angle = id * GOLDEN_ANGLE;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** Richtung zum Spieler; bei exakt gleicher Position UID-Fallback. */
export function directionToPlayer(dx: number, dy: number, uid: number): Vec2 {
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-6) return { x: dx / dist, y: dy / dist };
  return fallbackDir(uid);
}

/* ── Push-Ergebnis-Pool (M10-Budget) ──────────────────────────── */

/**
 * separationPush läuft im Minute-25-Chaos ~16k mal pro Frame; ~1.8k Treffer
 * allozieren sonst je ein Objekt (≈110k Objekte/s → Minor-GC-Spikes, sichtbar
 * als max/p95 in shots/m10-separation-budget-*.json). Der Ring-Pool macht den
 * Pfad im Satten allokationsfrei.
 *
 * Vertrag: Das Ergebnis ist NUR unmittelbar zu verbrauchen (in eine Summe
 * aufnehmen — genau so nutzen es Run.ts und resolveCrowdSeparation). Nach
 * genau 16 weiteren separationPush-Aufrufen wird dasselbe Objekt überschrieben.
 */
const PUSH_POOL: Vec2[] = [];
const PUSH_POOL_SIZE = 16;
let pushPoolCursor = 0;

function pooledVec2(x: number, y: number): Vec2 {
  const i = pushPoolCursor;
  pushPoolCursor = (i + 1) % PUSH_POOL_SIZE;
  let v = PUSH_POOL[i];
  if (v === undefined) {
    v = { x, y };
    PUSH_POOL[i] = v;
  } else {
    v.x = x;
    v.y = y;
  }
  return v;
}

/**
 * Push-Vektor, der `self` von `other` wegschiebt (null, wenn weit genug weg).
 * Bei (nahezu) identischer Position wird die UID-Richtung genutzt.
 * Der Betrag ist mit dem Massenanteil `separationWeight` gewichtet.
 *
 * Budget (M10): massOf/separationWeight sind hier inline — der Paar-Check ist
 * der heißeste Pfad im Spiel (15k+ Aufrufe/Frame im Minute-25-Chaos), jede
 * Hilfsfunktion/Standardsicherung kostet messbar. Semantik identisch:
 * nicht endliche Radien fallen auf die Masse 1 (Kein NaN/Infinity).
 * Rückgabe aus dem Ring-Pool (siehe PUSH_POOL): nur unmittelbar verbrauchen.
 */
export function separationPush(
  selfX: number,
  selfY: number,
  selfRadius: number,
  otherX: number,
  otherY: number,
  otherRadius: number,
  uid: number,
): Vec2 | null {
  const dx = selfX - otherX;
  const dy = selfY - otherY;
  const rr = selfRadius + otherRadius;
  const minDist = rr > 1e-3 ? rr : 1e-3;
  const d2 = dx * dx + dy * dy;
  if (!(d2 < minDist * minDist)) return null;
  // massOf inline: Flaeche = r*r, mind. 1. NaN/Infinity/negativ -> Masse 1
  // (genau wie Number.isFinite + Math.max(0, r) + Math.max(1, r*r) vorher).
  const ms = selfRadius > 1 ? selfRadius * selfRadius : 1;
  const mo = otherRadius > 1 ? otherRadius * otherRadius : 1;
  // separationWeight inline: 2*mo/(ms+mo), geklemmt auf [0.25, 2].
  let weight = (2 * mo) / (ms + mo);
  if (weight > 2) weight = 2;
  else if (weight < 0.25) weight = 0.25;
  if (d2 < 1e-8) {
    const dir = fallbackDir(uid);
    return pooledVec2(dir.x * weight, dir.y * weight);
  }
  const d = Math.sqrt(d2);
  const ratio = (minDist - d) / minDist;
  // M10: Grundverstaerkung + deterministischer Tangential-Anteil. Reiner
  // Radial-Push loescht sich in dichten Klumpen gegenseitig aus; die UID-
  // abhaengige Scherung faechert Horden auf, ohne Zufall und ohne Jitter.
  const radial = ratio * weight * 14.0;
  const ux = dx / d;
  const uy = dy / d;
  const swirl = ratio * (uid % 2 === 0 ? 1 : -1);
  return pooledVec2(ux * radial - uy * swirl, uy * radial + ux * swirl);
}

/* ── Boss-/Elite-Stapel-Trennung (M10-boss-stack-separation) ──── */

export interface StackNode {
  x: number;
  y: number;
  /**
   * Trennradius. Bosse nutzen die Sprite-Halbbreite (56/64/72/80/96/96 px
   * Frame ⇒ 28..48, Muster BossSystem.BOSS_SPRITE_SIZE), Elites den Hit-Radius
   * (Sprite ≈ 2r). Die Trefferfläche allein würde die sichtbare Stapelung
   * unterschätzen (Befund late-1920: Silhouetten unlesbar bei Hit-Distanz 12 px).
   */
  radius: number;
  uid: number;
  alive: boolean;
}

/**
 * Zielabstand als Anteil an (r1 + r2): danach bleibt die Sprite-Deckung
 * eines Paars ≤ 65 % — klar unter der Abnahmegrenze von 80 %.
 */
export const STACK_GAP_FACTOR = 0.35;
/**
 * Anteil des Defizits, der pro Paar und Frame korrigiert wird. < 0.5 heißt:
 * der Abstand nähert sich dem Ziel monoton an und überschwingt nie — kein
 * Vibrieren im Stand (Abnahme: ≤ 1 px/Frame nach Konvergenz).
 */
export const STACK_STRENGTH = 0.4;
/** Durchläufe je Frame (kleine N: Bosse ≤ 6, Elites im zweistelligen Bereich). */
export const STACK_MAX_ITERATIONS = 2;

export interface StackSeparationOptions {
  maxIterations?: number;
  strength?: number;
  gapFactor?: number;
}

export interface StackSeparationResult {
  pairChecks: number;
  /** Anzahl Knoten, die sich in diesem Aufruf bewegt haben. */
  moved: number;
}

/** Deckung eines Paars (1 = deckungsgleich, 0 = Berührung); Test-/Messhilfe. */
export function stackPairCoverage(
  dx: number,
  dy: number,
  radiusA: number,
  radiusB: number,
): number {
  const sum = radiusA + radiusB;
  if (!(sum > 0)) return 1;
  const d = Math.min(Math.hypot(dx, dy), sum);
  return 1 - d / sum;
}

/**
 * Leichter Abstoß zwischen Boss-/Elite-Entities (kein Positions-Snapping):
 * pro überlappendem Paar wird STACK_STRENGTH des Abstandsdefizits korrigiert,
 * massengewichtet über die Trennradien (schwerer Boss weicht kaum aus, der
 * kleinere Partner mehr). Ohne Überlappung exakt null Kraft — wer einmal
 * getrennt ist, steht still (Sprungfreiheit, kein Vibrieren).
 *
 * Deterministisch: feste Paar-Reihenfolge i<j, Fallback-Richtung über die
 * kleinere UID (Goldener Winkel), kein Math.random.
 */
export function resolveBossStackSeparation(
  nodes: StackNode[],
  count = nodes.length,
  options: StackSeparationOptions = {},
): StackSeparationResult {
  const maxIterations = Math.max(1, Math.min(4, Math.floor(options.maxIterations ?? STACK_MAX_ITERATIONS)));
  const strength = Math.max(0.05, Math.min(0.9, options.strength ?? STACK_STRENGTH));
  const gapFactor = Math.max(0.1, Math.min(0.9, options.gapFactor ?? STACK_GAP_FACTOR));

  let pairChecks = 0;
  let moved = 0;

  for (let it = 0; it < maxIterations; it++) {
    for (let i = 0; i < count; i++) {
      const a = nodes[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < count; j++) {
        const b = nodes[j];
        if (!b.alive) continue;
        pairChecks++;
        const sum = a.radius + b.radius;
        const minDist = sum * gapFactor;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist) continue; // Deadzone: keine Kraft im Stand
        let ux: number;
        let uy: number;
        let d: number;
        if (d2 < 1e-12) {
          const dir = fallbackDir(Math.min(a.uid, b.uid));
          ux = dir.x;
          uy = dir.y;
          d = 0;
        } else {
          d = Math.sqrt(d2);
          ux = dx / d;
          uy = dy / d;
        }
        const deficit = minDist - d;
        const correction = deficit * strength;
        // Massengewichtung: Anteil invers zur eigenen Fläche (r*r) — der
        // schwere Boss weicht kaum aus, der kleinere Partner mehr (Muster
        // separationWeight: Anteil ~ Masse des anderen). Summe beider = 1.
        const ma = a.radius > 0 ? a.radius * a.radius : 1;
        const mb = b.radius > 0 ? b.radius * b.radius : 1;
        const shareB = ma / (ma + mb);
        const shareA = 1 - shareB;
        a.x -= ux * correction * shareA;
        a.y -= uy * correction * shareA;
        b.x += ux * correction * shareB;
        b.y += uy * correction * shareB;
        moved++;
      }
    }
  }

  return { pairChecks, moved };
}

/* ── Mengen-Resolver mit Iterations- und Paar-Deckel (M10) ────── */

export interface CrowdNode extends Vec2 {
  radius: number;
  uid: number;
  /** Optional; false = ignorieren (tote/despawned Gegner). */
  alive?: boolean;
}

export interface CrowdSeparationOptions {
  /** Zellgröße des Uniform Grids; Default aus dem größten Radius abgeleitet. */
  cellSize?: number;
  /** Harte Obergrenze an Durchläufen pro Aufruf (Default 3). */
  maxIterations?: number;
  /** Harte Obergrenze an Nachbarprüfungen pro Durchlauf (Default 400k). */
  maxPairChecks?: number;
  /**
   * Harte Obergrenze an Nachbarprüfungen JE Gegner und Durchlauf (Default 32).
   * Im Minute-25-Chaos prüft ein Gegner im dichten Kern sonst 100+ Nachbarn;
   * der Deckel begrenzt die Arbeit pro Gegner, ohne die Trennung zu heben.
   */
  maxNeighborsPerEnemy?: number;
  /** Korrekturanteil pro Durchlauf (Default 0.5). */
  strength?: number;
}

export interface CrowdSeparationResult {
  iterations: number;
  pairChecks: number;
  /** true, wenn ein Durchlauf das Prüf-Budget erreicht hat (Deckel griff). */
  budgetExhausted: boolean;
  /** true, wenn der Nachbar-Deckel pro Gegner mindestens einmal griff. */
  neighborCapHit: boolean;
}

/**
 * Zellgröße so, dass ein Suchkreis (Radius + Puffer) in höchstens 2×2 Zellen
 * fällt und pro Gegner nur Nachbarzellen gelesen werden. Bei 500 Gegnern
 * bleibt der Aufwand linear zur Gegnerzahl mal konstanter Nachbarschaft.
 */
export function separationCellSize(maxRadius: number): number {
  return SpatialHash.recommendedCellSize(maxRadius);
}

/**
 * Entzerrt eine Gegnermenge in-place mit dem Spatial Hash: pro Durchlauf wird
 * für jeden lebenden Knoten nur der Suchkreis (Radius + 10 px Puffer) gelesen.
 * `maxIterations` und `maxPairChecks` deckeln den Aufwand hart; bei
 * identischen Positionen sorgt der Golden-Angle-Fallback für Auffächerung.
 *
 * Deterministisch: gleiche Eingabereihenfolge + gleiche uids ⇒ gleiches
 * Ergebnis. Keine Allokation pro Knoten ausser dem Scratch-Array.
 */
export function resolveCrowdSeparation(
  nodes: readonly CrowdNode[],
  options: CrowdSeparationOptions = {},
): CrowdSeparationResult {
  const maxIterations = Math.max(1, Math.min(8, Math.floor(options.maxIterations ?? 3)));
  const maxPairChecks = Math.max(1, Math.floor(options.maxPairChecks ?? 400_000));
  const maxNeighbors = Math.max(1, Math.floor(options.maxNeighborsPerEnemy ?? 32));
  const strength = Math.max(0.05, Math.min(1, options.strength ?? 0.5));

  let maxRadius = 0;
  for (const n of nodes) {
    if (n.alive === false) continue;
    maxRadius = Math.max(maxRadius, n.radius);
  }
  const cellSize = options.cellSize ?? separationCellSize(maxRadius);

  const hash = new SpatialHash<CrowdNode>(cellSize);
  const scratch: CrowdNode[] = [];
  let pairChecks = 0;
  let iterations = 0;
  let budgetExhausted = false;
  let neighborCapHit = false;

  for (let it = 0; it < maxIterations; it++) {
    iterations++;
    hash.rebuild(nodes.filter((n) => n.alive !== false));
    let exhausted = false;
    for (const self of nodes) {
      if (self.alive === false) continue;
      hash.queryCircle(self.x, self.y, self.radius + 10, scratch);
      let sx = 0;
      let sy = 0;
      let hit = false;
      let checked = 0;
      for (const other of scratch) {
        if (other === self || other.alive === false) continue;
        pairChecks++;
        checked++;
        if (pairChecks > maxPairChecks) {
          exhausted = true;
          break;
        }
        const push = separationPush(
          self.x, self.y, self.radius,
          other.x, other.y, other.radius,
          self.uid,
        );
        if (push) {
          sx += push.x;
          sy += push.y;
          hit = true;
        }
        if (checked >= maxNeighbors) {
          // Nachbar-Deckel: Weitere Nachbarn in dieser Iteration ignorieren.
          // Deterministisch, weil die Scratch-Reihenfolge deterministisch ist.
          neighborCapHit = true;
          break;
        }
      }
      if (hit) {
        // Korrektur begrenzen, damit dichte Stapel nicht explosionsartig
        // auseinanderfliegen (max. ein Gegnerradius pro Durchlauf).
        const len = Math.hypot(sx, sy);
        const maxStep = Math.max(1, self.radius * 2);
        const scale = len > maxStep ? maxStep / len : 1;
        self.x += sx * scale * strength;
        self.y += sy * scale * strength;
      }
      if (exhausted) break;
    }
    if (exhausted) {
      budgetExhausted = true;
      break;
    }
  }

  return { iterations, pairChecks, budgetExhausted, neighborCapHit };
}
