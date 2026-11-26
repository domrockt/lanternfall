/** Stimmen-Pool fuer SFX: erst freie Stimme, dann bis maxVoices neu anlegen. */
export interface VoiceSlot {
  busy: boolean;
}

/**
 * Liefert eine freie Stimme oder legt eine neue an, solange weniger als
 * `max` existieren. `create` darf null liefern (Audio nicht verfuegbar).
 */
export function acquireVoiceSlot<T extends VoiceSlot>(
  slots: T[],
  max: number,
  create: () => T | null,
): T | null {
  for (const slot of slots) if (!slot.busy) return slot;
  if (slots.length >= max) return null;
  const slot = create();
  if (slot) slots.push(slot);
  return slot;
}

/** Zaehlt belegte Stimmen (Diagnose/Tests). */
export function busyVoiceCount(slots: readonly VoiceSlot[]): number {
  let n = 0;
  for (const slot of slots) if (slot.busy) n += 1;
  return n;
}
