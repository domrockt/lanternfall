import Phaser from "phaser";
import { getSettings, setSettings } from "./settings";
import {
  effectiveVolume, newMixerState, notePlayed, releaseVoice, planPlay,
  activeVolumeSum, limiterGain, pickupDampGain, audioBudgetFor, PRIORITY,
  PICKUP_SFX_IDS, EVOLUTION_SFX_IDS, SFX_CONFIG, SFX_KEYS, WEAPON_SFX_IDS,
  type MixerState, type NoteOptions, type SoundRequest,
} from "./mixing";
import { QUALITY } from "../config";
import type { WeaponAnyId } from "../data/types";
import { acquireVoiceSlot } from "../logic/voice-pool";

// Reine Datentabellen leben in mixing.ts (phaser-frei, für Tests/Messskripte);
// hier unverändert re-exportiert (bestehende Importe bleiben gültig).
export { SFX_CONFIG, SFX_KEYS, WEAPON_SFX_IDS, EVOLUTION_SFX_IDS };

/** Eine wiederverwendete SFX-Stimme. `token` schuetzt vor Doppel-Freigabe. */
interface Voice {
  sound: Phaser.Sound.BaseSound;
  busy: boolean;
  token: number;
  /** Aktuelle effektive Lautstärke (für Limiter-Rücknahme). */
  vol: number;
  /** Startzeitpunkt (Sekunden) — älteste Stimme wird verdrängt. */
  startedAt: number;
}

export const MUSIC_KEYS = { run: "music_run", boss: "music_boss" } as const;

/** Pickup-Klasse als Set: `has` statt Array.includes je Play (K2). */
const PICKUP_IDS = new Set<string>(PICKUP_SFX_IDS);

type SfxId = keyof typeof SFX_KEYS;


/** Audio-System: prozedurale SFX + zwei Chiptune-Loops mit Spam-Begrenzung. */
export class AudioSystem {
  readonly game: Phaser.Game;
  private mixer: MixerState = newMixerState();
  private sfxPlayed = 0;
  private music: Phaser.Sound.BaseSound | null = null;
  private musicTrack: "run" | "boss" | "none" = "none";
  private muted = false;
  private failed = false;
  /** Einmal pro Frame gesetzt (performance.now/1000). */
  private now = 0;
  /** Feste Stimmen-Pools je SFX: kein Sound-Objekt pro Treffer (Leak/GC). */
  private readonly voicePool = new Map<string, Voice[]>();
  /** Gecachte sfx-Einstellung (getSettings() spread't je Aufruf — K2: nicht
   * im Hot Path; updateSettings() wird bei jeder Änderung aufgerufen). */
  private sfxVolume = 0;
  /**
   * Wiederverwendete Play-Parameter (K2 m10-audio-alloc-fix): je Play nur
   * Felder mutiert statt Objekt-Literal alloziert. Alle Konsumenten
   * (effectiveVolume/pickupDampGain/planPlay/notePlayed) lesen synchron,
   * keine Retention über den Aufruf hinaus.
   */
  private readonly req: SoundRequest = {
    id: "kill", priority: 0, cooldown: 0, maxVoices: 0, volume: 0, pickup: false,
  };
  /** Wiederverwendete NoteOptions (notePlayed liest synchron, keine Retention). */
  private readonly noteOpts: NoteOptions = {};
  /** Einmal-Closures je SFX-ID für die Voice-Fabrik (K2: nicht je Play). */
  private readonly voiceFactories = new Map<SfxId, () => Voice | null>();

  constructor(game: Phaser.Game) {
    this.game = game;
    this.sfxVolume = getSettings().sfx;
  }

  tick(nowMs?: number): void {
    this.mixer.now = (nowMs ?? performance.now()) / 1000;
  }

  /** Spielt einen SFX mit Priorität/Cooldown/Stimmenlimit, Fairness und Limiter. */
  play(id: SfxId): boolean {
    if (this.muted || this.failed) return false;
    const cfg = SFX_CONFIG[id];
    const sfxVolume = this.sfxVolume;
    if (sfxVolume <= 0) return false;
    this.mixer.now = performance.now() / 1000;
    // Frühcheck (K2 m10-audio-alloc-fix): spiegelt exakt die ersten drei
    // planPlay-Prüfungen (priority/perSoundVoices/cooldown). Diese haben
    // KEINE Seiteneffekte und liegen in planPlay VOR pruneStarts/Filters —
    // d. h. für hier verworfene Requests wäre planPlay sowieso vor allen
    // Filter-/Set-Allokationen ausgestiegen. Verhalten bitgleich, Aufwand
    // verworfener Requests sinkt auf zwei Feldvergleiche.
    if (cfg.priority < 0) return false;
    if ((this.mixer.voices[id] ?? 0) >= cfg.maxVoices) return false;
    const last = this.mixer.lastPlayed[id];
    if (last !== undefined && this.mixer.now - last < cfg.cooldown) return false;
    // Wiederverwendetes Request-Objekt: Felder je Aufruf mutiert statt neu.
    const req = this.req;
    req.id = id;
    req.priority = cfg.priority;
    req.cooldown = cfg.cooldown;
    req.maxVoices = cfg.maxVoices;
    req.volume = cfg.volume;
    // Pickup-Klasse (m10-pickup-sfx-distinct): eigenes Band + Massen-Dämpfung.
    req.pickup = PICKUP_IDS.has(id);
    // Fairness: Prio >= 2 verdrängt bei vollem Budget die älteste niederpriorere
    // Stimme; Rate-Deckel und Voice-Budget bleiben harte Grenzen. Beide Deckel
    // folgen der Qualitaetsstufe (M10-audio-quality-budget): QUALITY wird vom
    // Laufzeit-Regler (config.ts) gesetzt; HIGH bleibt bitgleich zum alten Verhalten.
    const plan = planPlay(this.mixer, req, audioBudgetFor(QUALITY));
    if (!plan.allow) return false;
    if (plan.evict) this.evictVoice(plan.evict.id);
    const voice = this.acquireVoice(id, cfg.maxVoices);
    if (!voice) return false;
    try {
      voice.busy = true;
      voice.token += 1;
      let vol = effectiveVolume(sfxVolume, req);
      // Pickup-Massen-Dämpfung: viele Pickup-Starts/s -> gleichmäßige, hörbare
      // Rücknahme (nie stumm), bevor der Limiter die Gesamtsumme deckelt.
      if (req.pickup) vol *= pickupDampGain(this.mixer, req);
      // Limiter: Summe aller aktiven Stimmen <= -1 dBFS halten, indem alle
      // aktiven Stimmen gleichmäßig zurückgenommen werden (nie stumm).
      const scale = limiterGain(activeVolumeSum(this.mixer), vol);
      if (scale < 1) {
        for (const list of this.voicePool.values()) {
          for (const v of list) {
            if (!v.busy || v === voice) continue;
            v.vol *= scale;
            (v.sound as unknown as { setVolume(v: number): void }).setVolume(v.vol);
          }
        }
        vol *= scale;
      }
      voice.vol = vol;
      voice.startedAt = this.mixer.now;
      (voice.sound as unknown as { setVolume(v: number): void }).setVolume(vol);
      // Wiederverwendete NoteOptions statt Objekt-Literal je Play.
      const noteOpts = this.noteOpts;
      noteOpts.volume = vol;
      noteOpts.scaleExisting = scale;
      notePlayed(this.mixer, req, noteOpts);
      const started = voice.sound.play();
      if (!started) {
        voice.busy = false;
        releaseVoice(this.mixer, id);
        return false;
      }
      this.sfxPlayed += 1;
      // Freigabe läuft über die PERMANENTEN complete/stop-Listener der Stimme
      // (einmalig je Voice in der Fabrik registriert, siehe acquireVoice);
      // der busy-Guard ersetzt den früheren Token-Snapshot je Play.
      return true;
    } catch {
      voice.busy = false;
      releaseVoice(this.mixer, id);
      return false;
    }
  }

  /** Verdrängt die älteste laufende Stimme von `id` (Fairness, Prio >= 2). */
  private evictVoice(id: string): void {
    const list = this.voicePool.get(id);
    if (!list) return;
    let victim: Voice | null = null;
    for (const v of list) {
      if (v.busy && (victim === null || v.startedAt < victim.startedAt)) victim = v;
    }
    if (!victim) return;
    victim.busy = false;
    victim.token += 1; // ausstehende complete/stop-Listener ungültig machen
    try {
      victim.sound.stop();
    } catch { /* Sound bereits vorbei */ }
    releaseVoice(this.mixer, id);
  }

  /** Freie Stimme aus dem Pool, bis maxVoices Instanzen je SFX angelegt sind. */
  private acquireVoice(id: SfxId, maxVoices: number): Voice | null {
    let list = this.voicePool.get(id);
    if (!list) {
      list = [];
      this.voicePool.set(id, list);
    }
    // Fabrik-Closure je SFX-ID cachen (K2): nicht bei jedem Play neu allozieren.
    let factory = this.voiceFactories.get(id);
    if (!factory) {
      factory = () => {
        try {
          const sound = this.game.sound.add(SFX_KEYS[id], { volume: 0 });
          const voice: Voice = { sound, busy: false, token: 0, vol: 0, startedAt: 0 };
          // Listener-Batching (K2): complete/stop EINMALIG je Stimme statt
          // 2x once je Play (EventEmitter3 alloziert je once einen Wrapper).
          // Der busy-Guard ersetzt den Token-Snapshot: Eine Stimme ist nur
          // frei (nicht busy), wenn ihr Playback beendet/verdrängt wurde,
          // und Phaser emittiert COMPLETE nur beim echten Ende des aktuellen
          // Buffers — complete/stop-Doppel-Feuern wird vom busy-Guard
          // abgefangen, Verdrängung setzt busy vor dem stop() auf false.
          const release = () => {
            if (!voice.busy) return;
            voice.busy = false;
            releaseVoice(this.mixer, id);
          };
          sound.on("complete", release);
          sound.on("stop", release);
          return voice;
        } catch {
          return null;
        }
      };
      this.voiceFactories.set(id, factory);
    }
    return acquireVoiceSlot(list, maxVoices, factory);
  }

  playWeapon(id: WeaponAnyId | string): void {
    if (id in SFX_KEYS) this.play(id as SfxId);
  }

  /** Musik-Track wechseln (run/boss/none). */
  setMusic(track: "run" | "boss" | "none"): void {
    if (this.musicTrack === track) {
      this.applyVolumes();
      return;
    }
    // Alter Voice wird GESTOPPT, bevor der neue startet (kein Dopplerton).
    this.stopMusic();
    // Master-Mute/Load-Fail: gar keine Musik anlegen und musicTrack ehrlich auf
    // "none" lassen — sonst behauptet der State eine Stufe, die nicht klingt,
    // und nach dem Unmute startet der Wiederhol-Aufruf nicht mehr (No-op).
    if (track === "none" || this.muted || this.failed) return;
    this.musicTrack = track;
    const settings = getSettings();
    try {
      const key = track === "boss" ? MUSIC_KEYS.boss : MUSIC_KEYS.run;
      const sound = this.game.sound.add(key, { loop: true, volume: settings.music * 0.55 });
      sound.play();
      this.music = sound;
    } catch {
      this.music = null;
      this.musicTrack = "none"; // fehlgeschlagener Start fälscht keinen Zustand
    }
  }

  stopMusic(): void {
    try {
      this.music?.stop();
      this.music?.destroy();
    } catch { /* ignore */ }
    this.music = null;
    this.musicTrack = "none";
  }

  applyVolumes(): void {
    const settings = getSettings();
    try {
      if (this.music) (this.music as unknown as { volume: number }).volume = settings.music * 0.55;
    } catch { /* ignore */ }
  }

  /** Optionen aus dem Menue/Debug anwenden. */
  updateSettings(): void {
    // K2: sfx-Wert cachen (getSettings() spread't je Aufruf); alle Änderungen
    // laufen über applyOptions -> updateSettings, der Cache ist damit aktuell.
    this.sfxVolume = getSettings().sfx;
    this.applyVolumes();
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (value) this.stopMusic();
  }

  /** Debug-API: window.__lf.audio(). */
  debugState(): {
    sfxPlayed: number; voices: number; musicTrack: string; muted: boolean;
    sfxVolume: number; musicVolume: number; loaded: boolean;
  } {
    const settings = getSettings();
    return {
      sfxPlayed: this.sfxPlayed,
      voices: this.mixer.totalVoices,
      musicTrack: this.musicTrack,
      muted: this.muted,
      sfxVolume: settings.sfx,
      musicVolume: settings.music,
      loaded: !this.failed,
    };
  }

  /** Einmal beim Boot: alle WAVs laden. */
  static preload(scene: Phaser.Scene): void {
    for (const key of Object.values(SFX_KEYS)) {
      if (!scene.cache.audio.exists(key)) scene.load.audio(key, `sfx/${key}.wav`);
    }
    for (const key of Object.values(MUSIC_KEYS)) {
      if (!scene.cache.audio.exists(key)) scene.load.audio(key, `sfx/${key}.wav`);
    }
  }
}

let instance: AudioSystem | null = null;

export function initAudio(game: Phaser.Game): AudioSystem {
  instance = new AudioSystem(game);
  // Persistierter Master-Mute gilt sofort nach dem Laden.
  instance.setMuted(getSettings().muted);
  return instance;
}

/** No-op-Fallback, falls Audio vor Boot gefragt wird. */
const NOOP = {
  play: () => false,
  playWeapon: () => {},
  setMusic: () => {},
  stopMusic: () => {},
  applyVolumes: () => {},
  updateSettings: () => {},
  setMuted: () => {},
  debugState: () => ({ sfxPlayed: 0, voices: 0, musicTrack: "none", muted: true, sfxVolume: 0, musicVolume: 0, loaded: false }),
} as unknown as AudioSystem;

export function getAudio(): AudioSystem {
  return instance ?? NOOP;
}

/** Optionen setzen und Audio sofort anwenden (UI/Debug). */
export function applyOptions(next: ReturnType<typeof getSettings>): void {
  setSettings(next);
  // Master-Mute hat Vorrang: setMuted stoppt Musik und blockt alle SFX.
  getAudio().setMuted(next.muted);
  getAudio().updateSettings();
}
