import { describe, expect, it } from "vitest";
import { escToggleAllowed, type EscToggleEvent } from "../src/input/InputState";

// Lane m10-esc-pause-fix, Karte #3: Unit-Tests fuer die ESC-Toggle-Dedup-Logik
// (escToggleAllowed, rein in src/input/InputState.ts), die der verify-input-
// Regression "ESC setzt Pause nicht fort" (27/28, Beleg shots/m10-esc-pause-
// before*.json) entgegenwirkt.
//
// Beobachtete Pathologie (emit-Protokoll im before-Beleg): ein physischer
// ESC-Press loest mehrere togglePause-Aufrufe aus — Doppel-Dispatch desselben
// Keydowns im selben Game-Step (Keyboard-Queue wird pro Step mehrfach
// abgearbeitet, Single-Slot-Dedupe greift nicht) und keyup-getriebene Replays.
// Ohne Dedup ist die Anzahl der Toggles pro Press gerade -> Netto kein
// Umschalten -> "ESC setzt fort" FAIL.
//
// Modell der Szenarien (Run.togglePause reicht window.event bzw. null):
//  - Grundpfad verify-input: ESC pausiert (kd A), ESC setzt fort (kd B),
//  - Doppel-Dispatch desselben Keydowns (gleicher timeStamp) -> genau 1 Toggle,
//  - keyup-Dispatch (pathologisch oder real) -> nie togglen,
//  - OS-Key-Repeat (repeat=true) -> nie togglen,
//  - Queue-Replay eines alten Keydowns im Dispatch des naechsten Presses ->
//    neues Keydown togglet, alte TimeStamps machen den neueren nicht ungültig,
//  - Touch/Gamepad/Frame-Pfad (ev=null) -> immer togglen, Zustand unberührt,
//  - fremde DOM-Events (z. B. resize fuer Portrait-Autopause) -> immer togglen.

const kd = (ts: number, repeat = false): EscToggleEvent =>
  ({ key: "Escape", type: "keydown", timeStamp: ts, repeat });
const ku = (ts: number): EscToggleEvent =>
  ({ key: "Escape", type: "keyup", timeStamp: ts, repeat: false });

describe("escToggleAllowed – ESC-Pause-Toggle-Dedup (m10-esc-pause-fix)", () => {
  it("Grundpfad: erster Keydown togglet (ESC pausiert)", () => {
    expect(escToggleAllowed(kd(1000), null)).toEqual({ allowed: true, lastAcceptedTs: 1000 });
  });

  it("Grundpfad: zweiter Keydown mit neuem timeStamp togglet (ESC setzt fort)", () => {
    const first = escToggleAllowed(kd(1000), null);
    expect(escToggleAllowed(kd(1004), first.lastAcceptedTs)).toEqual({
      allowed: true,
      lastAcceptedTs: 1004,
    });
  });

  it("Doppel-Dispatch desselben Keydowns (gleicher timeStamp) togglet genau einmal", () => {
    const first = escToggleAllowed(kd(2000), null);
    expect(first.allowed).toBe(true);
    // zweiter bis vierter Aufruf im selben Dispatch (Queue-Replay) -> abgelehnt
    for (let i = 0; i < 3; i++) {
      expect(escToggleAllowed(kd(2000), first.lastAcceptedTs).allowed).toBe(false);
    }
  });

  it("keyup-Dispatch togglet nie (auch bei Replay im selben Press)", () => {
    const first = escToggleAllowed(kd(3000), null);
    expect(escToggleAllowed(ku(3002), first.lastAcceptedTs).allowed).toBe(false);
    // und das keyup-Urteil aendert den Merker nicht:
    const rejected = escToggleAllowed(ku(3002), first.lastAcceptedTs);
    expect(rejected.lastAcceptedTs).toBe(first.lastAcceptedTs);
  });

  it("OS-Key-Repeat (repeat=true) togglet nie", () => {
    const first = escToggleAllowed(kd(4000), null);
    for (const ts of [4030, 4060, 4090]) {
      expect(escToggleAllowed(kd(ts, true), first.lastAcceptedTs).allowed).toBe(false);
    }
  });

  it("Queue-Replay: altes Keydown im Dispatch des naechsten Presses zerstoert den neuen Toggle nicht", () => {
    // Press 1 (kd ts=5000) wird im Dispatch von Press 2 (kd ts=5010) nochmal
    // durchgereicht; window.event ist aber immer der CURRENT Dispatch (5010):
    const first = escToggleAllowed(kd(5000), null);
    // Dispatch 2: mehrere Aufrufe, window.event identisch (kd 5010)
    const second = escToggleAllowed(kd(5010), first.lastAcceptedTs);
    expect(second.allowed).toBe(true);
    expect(escToggleAllowed(kd(5010), second.lastAcceptedTs).allowed).toBe(false);
  });

  it("Touch/Gamepad/Frame-Pfad (ev=null) togglet immer und berührt den Merker nicht", () => {
    const first = escToggleAllowed(kd(6000), null);
    expect(first.allowed).toBe(true);
    // sofortiger Touch-Pause direkt nach ESC-Pause bleibt wirksam:
    expect(escToggleAllowed(null, first.lastAcceptedTs)).toEqual({
      allowed: true,
      lastAcceptedTs: 6000,
    });
    expect(escToggleAllowed(null, null)).toEqual({ allowed: true, lastAcceptedTs: null });
  });

  it("Fremde DOM-Events (z. B. resize/Portrait-Autopause) togglen immer", () => {
    const resize = { key: "", type: "resize", timeStamp: 7000, repeat: false };
    const pointer = { key: "a", type: "keydown", timeStamp: 7001, repeat: false };
    for (const ev of [resize, pointer]) {
      expect(escToggleAllowed(ev, 1234).allowed).toBe(true);
    }
    // Merker bleibt unberührt:
    expect(escToggleAllowed(resize, 1234).lastAcceptedTs).toBe(1234);
  });

  it("Submenue-Pfad: nach keyup (Optionen zu) setzt der naechste Keydown fort", () => {
    // ESC kd pausiert -> 'o' oeffnet Optionen (kein togglePause) -> ESC ku/keydown
    // schliesst Optionen im UI-Handler (kein togglePause) -> ESC setzt fort:
    const pause = escToggleAllowed(kd(8000), null);
    expect(pause.allowed).toBe(true);
    expect(escToggleAllowed(ku(8002), pause.lastAcceptedTs).allowed).toBe(false);
    const resume = escToggleAllowed(kd(8050), pause.lastAcceptedTs);
    expect(resume.allowed).toBe(true);
    expect(resume.lastAcceptedTs).toBe(8050);
  });

  it("Reihenfolge egal: keyup vor keydown desselben Presses blockiert nicht", () => {
    // Phantom-Sequenz: ku-Zerstoerung kommt nie vor dem kd an; aber auch ein
    // ku mit gleichem ts direkt zuerst darf den spaeteren kd nicht blockieren:
    const kuFirst = escToggleAllowed(ku(9000), null);
    expect(kuFirst.allowed).toBe(false);
    expect(kuFirst.lastAcceptedTs).toBeNull();
    expect(escToggleAllowed(kd(9000), kuFirst.lastAcceptedTs).allowed).toBe(true);
  });
});
