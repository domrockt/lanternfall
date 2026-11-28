// M10-audio-music-dawn: Guard-Tests für die Musik-Stufenübergänge
// (Titel -> Run -> Boss -> Morgendaemmerung/Sieg) x Master-Mute x Reload.
//
// Geprüft wird AudioSystem (Stub-Sounds, kein Phaser):
//   1. Uebergangs-Matrix: bei jedem Wechsel läuft nie mehr als ein Musik-Sound;
//      der alte Voice ist gestoppt/destroyed, BEVOR der neue startet (kein
//      Dopplerton, kein Knackser).
//   2. Wiederhol-Start derselben Stufe ist ein No-op (kein Neuanlage/Retrigger).
//   3. Master-Mute blockt Musik bitgleich: 0 add/play, SFX geblockt, sfxPlayed
//      eingefroren, musicTrack bleibt ehrlich "none" (A7-Kriterien).
//   4. Reload mit persistiertem Mute: keine Phantom-Stufe; nach Unmute startet
//      der nächste setMusic-Aufruf sauber (kein eingefrorener Zustand).
//   5. SFX-/Musik-Budget-Trennung: Musik frisst kein Mixer-Voice-Budget und
//      startet auch bei vollem SFX-Budget.
//   6. Fehlgeschlagener Musik-Start (add wirft) fälscht keinen Zustand.
import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({ default: {} }));

import { AudioSystem, MUSIC_KEYS } from "../src/audio/AudioSystem";
import { MAX_TOTAL_VOICES, PRIORITY, SFX_CONFIG } from "../src/audio/mixing";

type Ev = { ev: "add" | "play" | "stop" | "destroy"; key: string };

function makeAudio() {
  const events: Ev[] = [];
  let failNextAdd = false;
  const game = {
    sound: {
      add: (key: string) => {
        if (failNextAdd) {
          failNextAdd = false;
          throw new Error("decode failed");
        }
        events.push({ ev: "add", key });
        return {
          setVolume: () => {},
          play: () => {
            events.push({ ev: "play", key });
            return true;
          },
          stop: () => events.push({ ev: "stop", key }),
          destroy: () => events.push({ ev: "destroy", key }),
          once: () => {},
        };
      },
    },
  };
  const audio = new AudioSystem(game as unknown as ConstructorParameters<typeof AudioSystem>[0]);
  return {
    audio,
    events,
    failNextAdd: () => {
      failNextAdd = true;
    },
  };
}

const isMusic = (e: Ev) => Object.values(MUSIC_KEYS).includes(e.key as never);

/** Anzahl der Musik-Sounds, die nach dem Ablauf der Events noch leben. */
function liveMusic(events: Ev[]): number {
  const live = new Set<string>();
  for (const e of events) {
    if (!isMusic(e)) continue;
    if (e.ev === "play") live.add(e.key);
    if (e.ev === "destroy") live.delete(e.key);
  }
  return live.size;
}

/** Nie mehr als ein Musik-Sound lebt; jeder add wird vor dem nächsten play gestoppt. */
function expectNoDoubleVoice(events: Ev[]): void {
  const live = new Set<string>();
  for (const e of events) {
    if (!isMusic(e)) continue;
    if (e.ev === "play") {
      expect(live.size, `neuer Musik-Start, während noch ${[...live].join(",")} läuft (Dopplerton)`).toBe(0);
      live.add(e.key);
    }
    if (e.ev === "destroy") live.delete(e.key);
  }
}

describe("M10-audio-music-dawn — Uebergangs-Matrix (kein Dopplerton)", () => {
  it("Titel -> Run -> Boss -> Run -> Sieg: max. 1 Musik-Sound, Stop VOR Start", () => {
    const { audio, events } = makeAudio();
    audio.setMusic("run"); // Run beginnt
    audio.setMusic("boss"); // Boss 1-4 spawn
    audio.setMusic("run"); // Boss besiegt, zurueck zum Run-Track
    audio.play("victory"); // Morgendaemmerung/Sieg-Stinger
    audio.stopMusic(); // Run-Ende
    expectNoDoubleVoice(events);
    expect(liveMusic(events)).toBe(0);
    // Reihenfolge: der Boss-Sound ist destroyed, bevor der (zweite) Run-Sound startet.
    const bossDestroy = events.findIndex((e) => e.key === MUSIC_KEYS.boss && e.ev === "destroy");
    const runPlays = events.map((e, i) => (e.key === MUSIC_KEYS.run && e.ev === "play" ? i : -1)).filter((i) => i >= 0);
    expect(bossDestroy).toBeGreaterThanOrEqual(0);
    expect(bossDestroy).toBeLessThan(runPlays[1]); // zweiter Run-Start nach Boss-Stop
    // Exakt die erwarteten Musik-Starts: run, boss, run.
    expect(runPlays).toHaveLength(2); // run, boss, run => 2 Run-Starts
    expect(events.filter((e) => isMusic(e) && e.ev === "play")).toHaveLength(3);
    expect(audio.debugState().musicTrack).toBe("none");
  });

  it("Wiederhol-Start derselben Stufe ist No-op (kein Neuanlage, kein Retrigger)", () => {
    const { audio, events } = makeAudio();
    audio.setMusic("run");
    const afterFirst = events.length;
    audio.setMusic("run");
    audio.setMusic("run");
    expect(events.length).toBe(afterFirst); // 2x setMusic("run"): nichts passiert
    audio.setMusic("boss");
    const afterBoss = events.length;
    audio.setMusic("boss");
    audio.setMusic("boss");
    expect(events.length).toBe(afterBoss); // 2x setMusic("boss"): nichts passiert
    expectNoDoubleVoice(events);
    expect(liveMusic(events)).toBe(1);
    expect(audio.debugState().musicTrack).toBe("boss");
  });
});

describe("M10-audio-music-dawn — Master-Mute (bitgleich, A7)", () => {
  it("Mute blockt Musik und SFX: 0 add/play, sfxPlayed eingefroren, voices im Budget", () => {
    const { audio, events } = makeAudio();
    audio.setMuted(true);
    const before = audio.debugState();
    audio.setMusic("run");
    audio.setMusic("boss");
    audio.setMusic("none");
    for (const id of ["ember", "frost", "hit", "levelup", "victory"] as const) {
      expect(audio.play(id), `muted ${id}`).toBe(false);
    }
    const after = audio.debugState();
    expect(events.filter((e) => isMusic(e))).toHaveLength(0); // keine Musik angefasst
    expect(after.sfxPlayed).toBe(before.sfxPlayed);
    expect(after.voices).toBeLessThanOrEqual(MAX_TOTAL_VOICES);
    expect(after.muted).toBe(true);
  });

  it("Mute hinterlaesst keine Phantom-Stufe: musicTrack bleibt ehrlich 'none'", () => {
    const { audio, events } = makeAudio();
    audio.setMusic("run");
    audio.setMuted(true); // stoppt Musik, Track cleared
    expect(audio.debugState().musicTrack).toBe("none");
    audio.setMusic("boss"); // wuergt ab: KEIN Track-Eintrag ohne Sound
    expect(audio.debugState().musicTrack).toBe("none");
    expect(liveMusic(events)).toBe(0);
    // Nach Unmute startet der naechste echte Stufenwechsel sauber (kein No-op-Stuck).
    audio.setMuted(false);
    audio.setMusic("boss");
    expect(audio.debugState().musicTrack).toBe("boss");
    expect(liveMusic(events)).toBe(1);
    expectNoDoubleVoice(events);
  });

  it("Reload mit persistiertem Mute (initAudio-Pfad): keine Musik, danach saubere recovery", () => {
    const { audio, events } = makeAudio();
    audio.setMuted(true); // initAudio: setMuted(getSettings().muted)
    audio.setMusic("run");
    expect(audio.debugState()).toMatchObject({ muted: true, musicTrack: "none" });
    audio.setMuted(false);
    expect(audio.debugState().musicTrack).toBe("none");
    expect(liveMusic(events)).toBe(0);
    audio.setMusic("run"); // Run-Szene startet neu
    expect(audio.debugState().musicTrack).toBe("run");
    expect(liveMusic(events)).toBe(1);
  });
});

describe("M10-audio-music-dawn — SFX-/Musik-Budget-Trennung", () => {
  it("Bei vollem SFX-Mixer-Budget startet Musik trotzdem (Budget getrennt)", () => {
    const { audio, events } = makeAudio();
    // SFX-Budget fuellen: 12 kurze Voices (Prio 1/2), Mixer am Limit.
    for (let i = 0; i < 40; i++) audio.play(i % 2 === 0 ? "ember" : "hit");
    expect(audio.debugState().voices).toBeLessThanOrEqual(MAX_TOTAL_VOICES);
    expect(audio.debugState().voices).toBeGreaterThan(0); // Budget wirklich gefuellt
    audio.setMusic("run"); // Musik ist NICHT Teil des Mixer-Budgets
    audio.setMusic("boss");
    expectNoDoubleVoice(events);
    expect(liveMusic(events)).toBe(1);
    expect(audio.debugState().musicTrack).toBe("boss");
    // Mixer haelt Musik nicht als Voice fest: keine Musik-IDs in SFX_CONFIG.
    for (const key of Object.values(MUSIC_KEYS)) expect(key in SFX_CONFIG).toBe(false);
    expect(PRIORITY.weapon).toBeLessThan(PRIORITY.hit); // Band-Grenzen unangetastet
  });
});

describe("M10-audio-music-dawn — Fehlgeschlagener Start", () => {
  it("add() wirft: musicTrack bleibt 'none', Retry beim naechsten setMusic", () => {
    const { audio, failNextAdd, events } = makeAudio();
    failNextAdd();
    audio.setMusic("boss");
    expect(audio.debugState().musicTrack).toBe("none"); // kein Phantom-Track
    expect(liveMusic(events)).toBe(0);
    audio.setMusic("boss"); // Retry laeuft
    expect(audio.debugState().musicTrack).toBe("boss");
    expect(liveMusic(events)).toBe(1);
  });
});
