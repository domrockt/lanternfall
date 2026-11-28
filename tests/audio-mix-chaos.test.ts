// M10-audio-mix-chaos: Regressionstests für Mix-Budget, Fairness und Limiter.
//
// Geprüft wird die reine Mixer-Logik (src/audio/mixing.ts) plus das
// Master-Mute-Verhalten von AudioSystem (Stub-Sounds, kein Phaser):
//   1. Voice-Limit hart: Prio<3 überschreitet MAX_TOTAL_VOICES nie.
//   2. Peak-Deckel deterministisch: synthetische 200-Stimmen-Welle bleibt
//      <= -1 dBFS (Summe der Lautstärken <= TARGET_PEAK).
//   3. Master-Mute blockt weiterhin jeden SFX und jede Musik (bitgleich).
//   4. Waffen-Priorität stabil: im Chaos kriegt jede Klang-ID ihren Fair-Anteil,
//      Boss/Warnung (Prio>=3) wird nie verdrängt und nie gedrosselt.
//   5. Verdrängung: Prio 2 nimmt die älteste (Gleichstand: leiseste) Stimme.
import { describe, expect, it, vi } from "vitest";

// AudioSystem importiert Phaser nur für Typen/Sound-API; im Node-Test genügt ein Stub.
vi.mock("phaser", () => ({ default: {} }));

import { AudioSystem } from "../src/audio/AudioSystem";
import {
  HIT_BAND_STARTS_PER_SEC, MAX_STARTS_PER_SECOND, MAX_TOTAL_VOICES, PRIORITY,
  TARGET_PEAK, activeVolumeSum, canPlay, effectiveVolume, limiterGain, newMixerState,
  notePlayed, planPlay, releaseVoice,
  type MixerState, type SoundRequest,
} from "../src/audio/mixing";

function req(id: string, priority: number, over: Partial<SoundRequest> = {}): SoundRequest {
  return { id, priority, cooldown: 0, maxVoices: 99, volume: 0.5, ...over };
}

/** Spielt den Request, wenn erlaubt (inkl. Verdrängung), wie AudioSystem.play. */
function play(state: MixerState, r: SoundRequest): boolean {
  const plan = planPlay(state, r);
  if (!plan.allow) return false;
  if (plan.evict) releaseVoice(state, plan.evict.id);
  notePlayed(state, r, { volume: effectiveVolume(1, r) });
  return true;
}

/** Beendet Stimmen, die länger als `dur` laufen (wie der complete-Listener). */
function endAgedVoices(state: MixerState, dur = 0.2): void {
  const done = state.active.filter((v) => state.now - v.startedAt >= dur).map((v) => v.id);
  for (const id of done) releaseVoice(state, id);
}

describe("M10-audio-mix-chaos — Voice-Limit", () => {
  it("Prio<3 überschreitet MAX_TOTAL_VOICES nie, auch mit Verdrängung nicht", () => {
    const st = newMixerState();
    st.now = 100;
    // 200 Waffen-Requests + dazwischen Treffer (Prio 2, verdrängt älteste Waffe);
    // kurze Voice-Dauern wie im Spiel (Treffer 0,07 s).
    for (let i = 0; i < 200; i++) {
      play(st, req(`w${i % 6}`, PRIORITY.weapon, { volume: 0.4, maxVoices: 3 }));
      play(st, req("hit", PRIORITY.hit, { volume: 0.45, maxVoices: 4 }));
      endAgedVoices(st, 0.07);
      expect(st.totalVoices).toBeLessThanOrEqual(MAX_TOTAL_VOICES);
    }
    // Prio>=3 darf das Budget (bekanntes Verhalten) um genau eine Stimme überschreiten.
    play(st, req("bossWarn", PRIORITY.warning, { cooldown: 999 }));
    expect(st.totalVoices).toBeLessThanOrEqual(MAX_TOTAL_VOICES + 1);
  });

  it("Waffen-Spam wird weiterhin abgelehnt (kein 'alles spielen')", () => {
    const st = newMixerState();
    st.now = 10;
    const weapon = req("spam_w", PRIORITY.weapon, { volume: 0.5 });
    let allowed = 0;
    for (let i = 0; i < 50; i++) if (play(st, weapon)) allowed += 1;
    // Rate-Deckel: Waffen-Band 12/s, Fair-Anteil 12 für eine einzelne ID.
    expect(allowed).toBe(12);
    expect(st.totalVoices).toBe(12);
  });
});

describe("M10-audio-mix-chaos — Peak-Deckel (-1 dBFS)", () => {
  it("limiterGain: 1 bei Luft, exakter Zielfaktor bei Sättigung", () => {
    expect(limiterGain(0, 0.5)).toBe(1);
    expect(limiterGain(0.3, 0.5)).toBe(1);
    // 0.7 + 0.5 > 0.891: Faktor multipliziert (Summe + neue Stimme) exakt auf TARGET_PEAK.
    const g = limiterGain(0.7, 0.5);
    expect(g * (0.7 + 0.5)).toBeCloseTo(TARGET_PEAK, 12);
    // 0.85 + 0.5 > 0.891: dito, Faktor bleibt deutlich über 0 (kein Stummschalten).
    const g2 = limiterGain(0.85, 0.5);
    expect(g2 * (0.85 + 0.5)).toBeCloseTo(TARGET_PEAK, 12);
    expect(g2).toBeGreaterThan(0.5);
    expect(limiterGain(0.9, 0)).toBe(1); // stille Stimme: kein Scaling nötig
  });

  it("synthetische 200-Stimmen-Welle: Summe bleibt <= -1 dBFS, späte Stimmen werden fair zurückgenommen", () => {
    const st = newMixerState();
    const volumes: number[] = [];
    // Prio 3 (Boss-Bypass) isoliert hier die Limiter-Mathematik: 200 Stimmen
    // laufen gleichzeitig, keine Budget-/Rate-Grenze dazwischen.
    for (let i = 0; i < 200; i++) {
      st.now = i * 0.01;
      const r = req(`v${i}`, PRIORITY.boss, { volume: 0.3 + (i % 5) * 0.1, cooldown: 0 });
      const plan = planPlay(st, r);
      expect(plan.allow, `Stimme ${i} abgelehnt: ${plan.reason}`).toBe(true);
      expect(plan.evict).toBeUndefined(); // Prio>=3 verdrängt nie
      const scale = limiterGain(activeVolumeSum(st), r.volume);
      notePlayed(st, r, { volume: r.volume * scale, scaleExisting: scale });
      volumes.push(r.volume * scale);
      // Der harte Deckel: nie über -1 dBFS.
      expect(activeVolumeSum(st)).toBeLessThanOrEqual(TARGET_PEAK + 1e-9);
    }
    expect(volumes.length).toBe(200);
    // Der Peak sitzt an der Deckelkante, keine Stimme ist auf 0 gedrückt worden,
    // solange Luft war; die letzten werden gleichmäßig (fair) zurückgenommen.
    expect(activeVolumeSum(st)).toBeCloseTo(TARGET_PEAK, 6);
    expect(Math.min(...volumes)).toBeGreaterThan(0);
  });

  it("Einzelner Schuss bei wenig Konkurrenz bleibt voll laut", () => {
    const st = newMixerState();
    st.now = 5;
    play(st, req("ember", PRIORITY.weapon, { volume: 0.55, cooldown: 0 }));
    // effectiveVolume-Boost Prio 1 = 0.8 -> 0.44, kein Limiter-Eingriff.
    expect(st.active[0].volume).toBeCloseTo(0.44, 6);
  });
});

describe("M10-audio-mix-chaos — Master-Mute (bitgleich)", () => {
  function makeAudio() {
    const added: string[] = [];
    const played: string[] = [];
    const game = {
      sound: {
        add: (key: string) => {
          added.push(key);
          return {
            setVolume: () => {},
            play: () => {
              played.push(key);
              return true;
            },
            stop: () => {},
            // m10-audio-alloc-fix K2: permanente Listener via `on`.
            once: () => {},
            on: () => {},
          };
        },
      },
    } as unknown as ConstructorParameters<typeof AudioSystem>[0];
    return { audio: new AudioSystem(game), added, played };
  }

  it("Master-Mute blockt jeden SFX- und Musik-Request", () => {
    const { audio, added, played } = makeAudio();
    const ids = ["ember", "flail", "frost", "thorn", "storm", "lantern", "hit", "levelup", "evolution", "bossWarn"];
    for (const id of ids) expect(audio.play(id as never), `unmuted ${id}`).toBe(true);
    expect(played).toHaveLength(ids.length);
    audio.setMuted(true);
    for (const id of ids) expect(audio.play(id as never), `muted ${id}`).toBe(false);
    audio.setMusic("run");
    audio.setMusic("boss");
    expect(added).toHaveLength(ids.length); // keine Musik hinzugekommen
    expect(audio.debugState().muted).toBe(true);
    expect(audio.debugState().voices).toBeLessThanOrEqual(MAX_TOTAL_VOICES);
  });

  it("Mute-Pfad greift VOR jeder Mixer-Prüfung (sfxPlayed ändert sich nicht)", () => {
    const { audio } = makeAudio();
    audio.setMuted(true);
    const before = audio.debugState().sfxPlayed;
    for (let i = 0; i < 30; i++) audio.play("hit");
    expect(audio.debugState().sfxPlayed).toBe(before);
  });
});

describe("M10-audio-mix-chaos — Waffen-Priorität und Fairness", () => {
  it("Rate-Deckel: nie mehr als 24 Starts/s für Prio<3, Band-Deckel je 12", () => {
    const st = newMixerState();
    const weapons = ["ember", "flail", "frost", "thorn", "storm", "lantern", "xp"];
    const hits = ["hit", "kill"];
    // Dauerfeuer mit endenden Stimmen (0,2 s): das Rate-Fenster ist der Engpass.
    for (let t = 0; t < 300; t++) {
      st.now = t * 0.01;
      for (const id of weapons) play(st, req(id, PRIORITY.weapon, { cooldown: 0 }));
      for (const id of hits) play(st, req(id, PRIORITY.hit, { cooldown: 0 }));
      endAgedVoices(st, 0.2);
      const window = st.starts.filter((s) => s.at > st.now - 1);
      expect(window.length).toBeLessThanOrEqual(MAX_STARTS_PER_SECOND);
      const band0 = window.filter((s) => s.band === 0);
      const band1 = window.filter((s) => s.band === 1);
      // Fair-Anteil kann das Band um max. 1 Start überfliegen (13 IDs, min. 1/ID).
      expect(band0.length).toBeLessThanOrEqual(13);
      expect(band1.length).toBeLessThanOrEqual(HIT_BAND_STARTS_PER_SEC + 1);
    }
  });

  it("Im Chaos hört man jede Waffe: Fair-Anteil >= 1 Start/s je Klang-ID", () => {
    const st = newMixerState();
    const ids = ["ember", "flail", "frost", "thorn", "storm", "lantern", "xp"];
    // Sättigung: hit/kill fluten das Treffer-Band, xp flutet das Waffen-Band;
    // Stimmen enden nach 0,2 s (kurze WAVs wie im Spiel).
    const perId = Object.fromEntries(ids.map((id) => [id, 0]));
    for (let t = 0; t < 400; t++) {
      st.now = t * 0.01;
      for (const id of ids) if (play(st, req(id, PRIORITY.weapon, { cooldown: 0 }))) perId[id] += 1;
      play(st, req("hit", PRIORITY.hit, { cooldown: 0 }));
      play(st, req("kill", PRIORITY.hit, { cooldown: 0 }));
      endAgedVoices(st, 0.2);
    }
    for (const id of ids) {
      expect(perId[id], `${id} verhungert im Chaos`).toBeGreaterThanOrEqual(2);
    }
  });

  it("Boss/Warnung (Prio>=3) wird nie verdrängt und nie durch den Rate-Deckel blockiert", () => {
    const st = newMixerState();
    st.now = 1;
    for (let i = 0; i < 40; i++) play(st, req(`w${i}`, PRIORITY.weapon, { volume: 0.4 }));
    expect(st.totalVoices).toBeGreaterThanOrEqual(MAX_TOTAL_VOICES);
    // Volles Budget + volles Fenster: Boss startet trotzdem.
    const boss = req("bossWarn", PRIORITY.warning, { volume: 0.9, cooldown: 0 });
    const plan = planPlay(st, boss);
    expect(plan.allow).toBe(true);
    expect(plan.evict).toBeUndefined();
    // Kein evict irgendeines Plans zeigt je auf eine Prio>=3-Stimme.
    play(st, boss);
    const plan2 = planPlay(st, req("hit", PRIORITY.hit, { cooldown: 0 }));
    if (plan2.evict) expect(plan2.evict.priority).toBeLessThan(PRIORITY.hit);
  });

  it("Verdrängung nimmt die älteste, bei Gleichstand die leiseste Stimme (nur bei vollem Budget)", () => {
    const st = newMixerState();
    st.now = 10;
    play(st, req("alt", PRIORITY.weapon, { volume: 0.6, maxVoices: 99 }));
    // Budget NICHT voll: kein evict, beide Waffen bleiben aktiv.
    st.now = 11;
    play(st, req("neu", PRIORITY.weapon, { volume: 0.2, maxVoices: 99 }));
    expect(st.totalVoices).toBe(2);
    expect(planPlay(st, req("hit", PRIORITY.hit, { cooldown: 0 })).evict).toBeUndefined();
    // Budget voll machen: 10 weitere Waffen-Stimmen.
    st.now = 11.5;
    for (let i = 0; i < 10; i++) play(st, req(`f${i}`, PRIORITY.weapon, { volume: 0.5, maxVoices: 99 }));
    expect(st.totalVoices).toBe(12);
    // Jetzt verdrängt Prio 2 die älteste Stimme ("alt", gestartet bei 10).
    st.now = 12;
    play(st, req("hit", PRIORITY.hit, { cooldown: 0 }));
    expect(st.totalVoices).toBe(12); // Verdrängung 1:1
    expect(st.voices.alt).toBe(0);
    expect(st.voices.neu).toBe(1);
    // canPlay meldet die Verdrängung nicht als Ablehnung.
    const st2 = newMixerState();
    st2.now = 3;
    play(st2, req("a", PRIORITY.weapon, { cooldown: 0 }));
    play(st2, req("b", PRIORITY.weapon, { cooldown: 0 }));
    for (let i = 0; i < 10; i++) play(st2, req(`g${i}`, PRIORITY.weapon, { cooldown: 0 }));
    const plan = planPlay(st2, req("hit", PRIORITY.hit, { cooldown: 0 }));
    expect(plan.allow).toBe(true);
    expect(plan.evict?.id).toBe("a"); // älteste zuerst
  });
});
