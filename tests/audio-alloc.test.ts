/**
 * m10-audio-alloc-fix K4 (#12132): Guard-Tests frieren die Allokations-Hebel
 * im AudioSystem-SFX-Pfad ein (Bedarf aus docs/lanes/m10-run-cpu-budget.md):
 *
 *   1. Keine neuen Play-Objekte pro Aufruf (req/noteOpts wiederverwendet)
 *   2. Listener-Batching: complete/stop einmalig je Stimme (`on`), nicht 2x
 *      `once` je Play; Voice-Pool bleibt auf maxVoices begrenzt
 *   3. planPlay-Frühcheck bitgleich: wenn der Frühcheck verwirft, würde auch
 *      planPlay (gleicher Staat) verwerfen — planPlay wird dann nicht gerufen
 *   4. Freigabe über permanente Listener (complete/stop), Verdrängung gibt die
 *      älteste niederpriorere Stimme frei
 *   5. sfxVolume-Cache folgt updateSettings()
 *
 * Messbelege (Vorher/Nachher-JSON): ~/games/.evidence/m10-audio-alloc-fix/,
 * Skript scripts/m10-audio-alloc.mjs, Doku docs/lanes/m10-audio-alloc-fix.md.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSystem } from "../src/audio/AudioSystem";
import {
  MAX_TOTAL_VOICES, SFX_CONFIG, planPlay, newMixerState,
  type MixerState, type SoundRequest,
} from "../src/audio/mixing";

// ---- Capture-Schicht: planPlay/notePlayed sehen ihre Argumente (Identität
// der wiederverwendeten Objekte + Feld-Snapshot je Aufruf), Verhalten bleibt
// exakt das Original.
const captured = vi.hoisted(() => ({
  planReqs: [] as SoundRequest[],
  planSnaps: [] as SoundRequest[],
  noteOpts: [] as unknown[],
  planPlayCalls: 0,
}));

vi.mock("../src/audio/mixing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/audio/mixing")>();
  return {
    ...actual,
    planPlay: (state: MixerState, req: SoundRequest, budget?: Parameters<typeof actual.planPlay>[2]) => {
      captured.planReqs.push(req);
      captured.planSnaps.push({ ...req });
      captured.planPlayCalls += 1;
      return actual.planPlay(state, req, budget);
    },
    notePlayed: (state: MixerState, req: SoundRequest, opts?: unknown) => {
      captured.noteOpts.push(opts);
      return actual.notePlayed(state, req, opts as never);
    },
  };
});

// ---- Fake-Sound: registrierte Listener sichtbar, complete/stop feuertests.
interface FakeSound {
  key: string;
  playCalls: number;
  stopCalls: number;
  listeners: Map<string, Array<() => void>>;
  fire(ev: string): void;
}

type AnyGame = ConstructorParameters<typeof AudioSystem>[0];

function makeGame() {
  const sounds: FakeSound[] = [];
  const addedKeys: string[] = [];
  const game = {
    sound: {
      add: (key: string) => {
        addedKeys.push(key);
        const listeners = new Map<string, Array<() => void>>();
        const sound: FakeSound = {
          key,
          playCalls: 0,
          stopCalls: 0,
          listeners,
          fire(ev: string) {
            for (const fn of listeners.get(ev) ?? []) fn();
          },
        };
        const reg = (ev: string, fn: () => void) => {
          const list = listeners.get(ev) ?? [];
          list.push(fn);
          listeners.set(ev, list);
        };
        const proxy = {
          setVolume: () => {},
          play: () => { sound.playCalls += 1; return true; },
          stop: () => { sound.stopCalls += 1; },
          once: (ev: string, fn: () => void) => reg(ev, fn),
          on: (ev: string, fn: () => void) => reg(ev, fn),
        };
        sounds.push(sound);
        return proxy;
      },
    },
  } as unknown as AnyGame;
  return { game, sounds, addedKeys };
}

/** plays zählen über die debugState-API (erlaubte Starts). */
const playsOf = (audio: AudioSystem) => audio.debugState().sfxPlayed;

let clock = 1000;

beforeEach(() => {
  captured.planReqs.length = 0;
  captured.planSnaps.length = 0;
  captured.noteOpts.length = 0;
  captured.planPlayCalls = 0;
  // Künstliche Uhr: je play()-Aufruf +1 s — Cooldowns/Rate-Fenster blockieren
  // nicht, damit die Hebel gezielt getrieben werden können.
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => (clock += 1000));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("m10-audio-alloc-fix — SFX-Pfad-Allokationen (Guard)", () => {
  it("keine neuen Play-Objekte pro Aufruf: planPlay/notePlayed sehen stets dieselben Objekte", () => {
    const { game } = makeGame();
    const audio = new AudioSystem(game);
    const ids = ["ember", "flail", "frost", "thorn", "storm", "lantern", "hit", "levelup", "evolution", "bossWarn", "xp", "powerup"];
    for (const id of ids) expect(audio.play(id as never)).toBe(true);
    expect(captured.planReqs.length).toBe(ids.length);
    expect(captured.noteOpts.length).toBe(ids.length);
    // Identität: genau EIN wiederverwendetes Objekt je Zweck (vorher: 2 Literale je Play).
    const firstReq = captured.planReqs[0];
    const firstOpts = captured.noteOpts[0];
    for (const req of captured.planReqs) expect(req).toBe(firstReq);
    for (const opts of captured.noteOpts) expect(opts).toBe(firstOpts);
    // Feld-Snapshots je Aufruf: korrekt gesetzt, kein verschleppter Zustand.
    for (let i = 0; i < ids.length; i++) {
      expect(captured.planSnaps[i].id).toBe(ids[i]);
      expect(captured.planSnaps[i].priority).toBe(SFX_CONFIG[ids[i]].priority);
    }
  });

  it("Listener-Batching: 2 permanente Listener je Stimme, Pool bleibt auf maxVoices begrenzt", () => {
    const { game, sounds, addedKeys } = makeGame();
    const audio = new AudioSystem(game);
    const maxVoices = SFX_CONFIG.ember.maxVoices;
    // maxVoices Plays hintereinander: alle Stimmen busy -> genau maxVoices Sounds.
    for (let i = 0; i < maxVoices; i++) expect(audio.play("ember")).toBe(true);
    expect(addedKeys).toHaveLength(maxVoices);
    for (const s of sounds) {
      expect(s.listeners.get("complete")?.length ?? 0).toBe(1);
      expect(s.listeners.get("stop")?.length ?? 0).toBe(1);
    }
    // Alle Enden feuern -> Wiederverwendung ohne neues add (Listener bleiben).
    for (const s of sounds) s.fire("complete");
    for (let i = 0; i < maxVoices; i++) expect(audio.play("ember")).toBe(true);
    expect(addedKeys).toHaveLength(maxVoices);
    expect(sounds[0].playCalls).toBe(2);
    for (const s of sounds) {
      expect(s.listeners.get("complete")?.length ?? 0).toBe(1);
      expect(s.listeners.get("stop")?.length ?? 0).toBe(1);
    }
    expect(playsOf(audio)).toBe(2 * maxVoices);
    // Voice-Limit ist hart: weiterer Play geht nicht über maxVoices hinaus.
    expect(audio.play("ember")).toBe(false);
    expect(addedKeys).toHaveLength(maxVoices);
  });

  it("Frühcheck bitgleich: verwirft der Frühcheck, verwirft planPlay denselben Staat ebenfalls (und wird nicht gerufen)", () => {
    const { game } = makeGame();
    const audio = new AudioSystem(game);
    const mixer = (audio as unknown as { mixer: MixerState }).mixer;
    const cfg = SFX_CONFIG.ember;
    const states: Array<{ voices: number; lastPlayed?: number }> = [
      { voices: 0 },
      { voices: cfg.maxVoices },
      { voices: cfg.maxVoices - 1 },
      { voices: 0, lastPlayed: 0 }, // Cooldown aktiv — lastPlayed wird je Iteration relativ gesetzt
      { voices: 0, lastPlayed: -1 }, // Grenze (=== cooldown: frei)
      { voices: 0, lastPlayed: -2 }, // abgelaufen
      { voices: cfg.maxVoices, lastPlayed: 0 },
    ];
    for (const st of states) {
      // Frisches System je Iteration: Mixer und Voice-Pool konsistent, nur die
      // geprüften Felder werden gezielt gesetzt.
      const { game } = makeGame();
      const audio = new AudioSystem(game);
      const mixer = (audio as unknown as { mixer: MixerState }).mixer;
      // play() setzt mixer.now = performance.now()/1000 (gespiegelte Uhr, +1 s
      // je Aufruf) — Referenzstaat und lastPlayed nutzen denselben Wert.
      const nowAtPlay = (clock + 1000) / 1000;
      const last =
        st.lastPlayed === undefined ? undefined
        : st.lastPlayed === 0 ? nowAtPlay                       // Cooldown aktiv (delta 0)
        : st.lastPlayed === -1 ? nowAtPlay - cfg.cooldown       // Grenze: delta === cooldown
        : nowAtPlay - cfg.cooldown - 0.01;                      // abgelaufen
      // Referenz-Urteil auf FRISCHEM Staat vor dem play() (play mutiert den Mixer).
      const ref = newMixerState();
      ref.now = nowAtPlay;
      ref.voices.ember = st.voices;
      if (last !== undefined) ref.lastPlayed.ember = last;
      const req: SoundRequest = {
        id: "ember", priority: cfg.priority, cooldown: cfg.cooldown,
        maxVoices: cfg.maxVoices, volume: cfg.volume, pickup: false,
      };
      const planPlayAllows = planPlay(ref, req).allow;

      mixer.voices.ember = st.voices;
      if (last === undefined) delete mixer.lastPlayed.ember;
      else mixer.lastPlayed.ember = last;
      mixer.now = nowAtPlay; // wird von play() ohnehin neu gesetzt (gleiche Uhr)
      captured.planPlayCalls = 0;
      const result = audio.play("ember");

      if (captured.planPlayCalls === 0) {
        // Frühcheck hat verworfen: planPlay darf denselben Staat NICHT erlauben.
        expect(result).toBe(false);
        expect(planPlayAllows).toBe(false);
      } else {
        // planPlay entschieden — play() übernimmt das Urteil unverändert.
        expect(result).toBe(planPlayAllows);
      }
    }
  });

  it("Freigabe über permanente Listener: complete gibt die Stimme frei, kein neuer Sound, kein Doppel-Release", () => {
    const { game, sounds, addedKeys } = makeGame();
    const audio = new AudioSystem(game);
    const mixer = (audio as unknown as { mixer: MixerState }).mixer;
    expect(audio.play("ember")).toBe(true);
    expect(addedKeys).toHaveLength(1);
    // Voice ist busy: zweiter Play gleicher ID geht auf die zweite Stimme.
    expect(audio.play("ember")).toBe(true);
    expect(addedKeys).toHaveLength(2);
    expect(mixer.voices.ember).toBe(2);
    // Ende des ersten Playbacks: Voice frei, Wiederverwendung ohne neues add.
    sounds[0].fire("complete");
    expect(mixer.voices.ember).toBe(1);
    expect(audio.play("ember")).toBe(true);
    expect(addedKeys).toHaveLength(2);
    expect(sounds[0].playCalls).toBe(2);
    // Doppel-Feuern (complete + stop) darf nicht doppelt freigeben.
    sounds[0].fire("complete");
    sounds[0].fire("stop");
    expect(mixer.voices.ember).toBe(1);
  });

  it("Verdrängung: älteste niederpriorere Stimme wird gestoppt und freigegeben", () => {
    const { game, sounds } = makeGame();
    const audio = new AudioSystem(game);
    const mixer = (audio as unknown as { mixer: MixerState }).mixer;
    // Echte weapon-Stimme (Prio 1) über den normalen Pfad anlegen ...
    expect(audio.play("ember")).toBe(true);
    // ... und das Gesamt-Budget künstlich an das Limit bringen.
    mixer.totalVoices = MAX_TOTAL_VOICES;
    expect(audio.play("hit")).toBe(true); // Prio 2 verdrängt bei vollem Budget
    expect(sounds[0].stopCalls).toBe(1); // Verdrängung stoppt den Opfer-Sound
    expect(mixer.voices.ember).toBe(0);
    expect(mixer.totalVoices).toBe(MAX_TOTAL_VOICES); // 1 frei, 1 neu
    expect(sounds[1].playCalls).toBe(1);
  });

  it("sfxVolume-Cache folgt updateSettings (kein getSettings()-Spread im Hot Path)", async () => {
    const { setSettings, getSettings } = await import("../src/audio/settings");
    const { game, sounds } = makeGame();
    const audio = new AudioSystem(game);
    expect(getSettings().sfx).toBeGreaterThan(0);
    expect(audio.play("ember")).toBe(true);
    expect(sounds[0].playCalls).toBe(1);
    setSettings({ ...getSettings(), sfx: 0 });
    audio.updateSettings();
    expect(audio.play("ember")).toBe(false); // geblockt, kein neuer Play
    expect(sounds[0].playCalls).toBe(1);
    setSettings({ ...getSettings(), sfx: 0.8 });
    audio.updateSettings();
    expect(audio.play("ember")).toBe(true);
    expect(playsOf(audio)).toBe(2);
  });
});
