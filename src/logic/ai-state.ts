import { newAiState, type AiRng, type AiState } from "./enemy-ai";
import { mulberry32 } from "./rng";

/**
 * m10-ai-stream-cadence-r2: Stream-Adressierung pro Gegner.
 *
 * Vor dieser Lane zogen ALLE Gegner aus EINEM gemeinsamen KI-Stream
 * (Run.attachAiRng verteilte dasselbe RNG-Objekt). Wie viele Ziehungen ein
 * Gegner beim KI-Zug konsumiert, haengt von seiner AI-Stagger-Kadenz ab
 * (volle Steps je Distanzring, in Frames gezaehlt) — mit gemeinsamem Stream
 * verschiebt jede Kadenz-Aenderung die Ziehungsfolge ALLER Gegner.
 *
 * Der Fix adressiert den Stream pro Gegner aus (Seed, UID): der i-te Ziehung
 * eines Gegners ist eine reine Funktion von (Seed, UID, i) — unabhaengig
 * davon, wann andere Gegner ziehen und an welcher Frame-Grenze ein voller
 * Step landet.
 */
export function enemyStreamSeed(seed: number, uid: number): number {
  let h = ((seed >>> 0) ^ 0x811c9dc5) >>> 0;
  h = Math.imul(h ^ (uid >>> 0), 0x9e3779b9) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Austauschbarer, umadressierbarer KI-RNG. Das Objekt bleibt pro
 * EnemyRuntime bestehen (Pooling-Vertrag: RNG-Objekt wird beim Recycle
 * nicht neu alloziert, tests/enemy-pool-reuse.test.ts) und wird beim Spawn
 * mit dem Stream des NEUEN (Seed, UID) neu gesaet — die Stream-Position
 * startet damit pro Inkarnation bei 0.
 */
export class EnemyAiRng implements AiRng {
  private fn: () => number = mulberry32(0);

  rekey(seed: number, uid: number): void {
    this.fn = mulberry32(enemyStreamSeed(seed, uid));
  }

  next(): number {
    return this.fn();
  }
}

/**
 * Weist einem Runtime-Objekt den Stream fuer (Seed, UID) zu. Ein vorhandenes
 * EnemyAiRng wird in-place umgesaet (kein Churn im Spawn-Hot-Path); ein
 * fremdes AiRng (z. B. Test-Stub) wird durch einen eigenen Stream ersetzt.
 */
export function attachEnemyAiStream(target: { aiRng: AiRng }, seed: number, uid: number): AiRng {
  const existing = target.aiRng;
  if (existing instanceof EnemyAiRng) {
    existing.rekey(seed, uid);
    return existing;
  }
  const rng = new EnemyAiRng();
  rng.rekey(seed, uid);
  target.aiRng = rng;
  return rng;
}

/**
 * Setzt einen vorhandenen KI-Zustand in-place zurück. EnemyPool recycelt
 * Runtime-Objekte; dadurch entsteht pro Spawn kein neues State-Objekt und
 * keine neue RNG-Closure (Retention/Churn im 30-min-Lauf).
 */
export function resetAiState(state: AiState, rng: AiRng): void {
  state.mode = "approach";
  state.timer = 1.2 + rng.next() * 1.4;
  state.cooldown = 0.8 + rng.next() * 1.8;
  state.aimX = 1;
  state.aimY = 0;
  state.orbitDir = rng.next() < 0.5 ? -1 : 1;
  state.fuse = 0;
  state.blinks = 0;
  state.attacks = 0;
  state.phase = 0;
  // Stagger-State neutralisieren: ein recycelter Gegner darf weder die
  // Step-Phase noch die Cache-Richtung/-Geschwindigkeit des Vorgängers erben
  // (sonst bewegt er sich bis zum ersten vollen Step fremd — Review-Befund).
  state.aiStepIn = undefined;
  state.aiMoveX = undefined;
  state.aiMoveY = undefined;
  state.aiSpeedMul = undefined;
}

/** Recycelt einen vorhandenen KI-Zustand oder legt beim ersten Spawn einen an. */
export function ensureAiState(previous: AiState | undefined, rng: AiRng): AiState {
  if (previous) {
    resetAiState(previous, rng);
    return previous;
  }
  return newAiState(rng);
}
