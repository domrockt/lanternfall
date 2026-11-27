import { newAiState, type AiRng, type AiState } from "./enemy-ai";

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
}

/** Recycelt einen vorhandenen KI-Zustand oder legt beim ersten Spawn einen an. */
export function ensureAiState(previous: AiState | undefined, rng: AiRng): AiState {
  if (previous) {
    resetAiState(previous, rng);
    return previous;
  }
  return newAiState(rng);
}
