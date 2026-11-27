import Phaser from "phaser";
import { getSettings, setSettings } from "./settings";
import {
  canPlay, effectiveVolume, newMixerState, notePlayed, releaseVoice, planPlay,
  activeVolumeSum, limiterGain, PRIORITY,
  EVOLUTION_SFX_IDS, SFX_CONFIG, SFX_KEYS, WEAPON_SFX_IDS,
  type MixerState, type SoundRequest,
} from "./mixing";
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

  constructor(game: Phaser.Game) {
    this.game = game;
  }

  tick(nowMs?: number): void {
    this.mixer.now = (nowMs ?? performance.now()) / 1000;
  }

  /** Spielt einen SFX mit Priorität/Cooldown/Stimmenlimit, Fairness und Limiter. */
  play(id: SfxId): boolean {
    if (this.muted || this.failed) return false;
    const cfg = SFX_CONFIG[id];
    const settings = getSettings();
    if (settings.sfx <= 0) return false;
    this.mixer.now = performance.now() / 1000;
    const req: SoundRequest = {
      id, priority: cfg.priority, cooldown: cfg.cooldown,
      maxVoices: cfg.maxVoices, volume: cfg.volume,
    };
    // Fairness: Prio >= 2 verdrängt bei vollem Budget die älteste niederpriorere
    // Stimme; Rate-Deckel (24/s) und Budget bleiben harte Grenzen.
    const plan = planPlay(this.mixer, req);
    if (!plan.allow) return false;
    if (plan.evict) this.evictVoice(plan.evict.id);
    const voice = this.acquireVoice(id, cfg.maxVoices);
    if (!voice) return false;
    try {
      voice.busy = true;
      voice.token += 1;
      const token = voice.token;
      let vol = effectiveVolume(settings.sfx, req);
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
      notePlayed(this.mixer, req, { volume: vol, scaleExisting: scale });
      const started = voice.sound.play();
      if (!started) {
        voice.busy = false;
        releaseVoice(this.mixer, id);
        return false;
      }
      this.sfxPlayed += 1;
      // Auch externe stop()-Aufrufe geben die Stimme frei; der Token verhindert
      // Doppel-Freigabe, wenn complete und stop beide feuern.
      const release = () => {
        if (!voice.busy || voice.token !== token) return;
        voice.busy = false;
        releaseVoice(this.mixer, id);
      };
      voice.sound.once("complete", release);
      voice.sound.once("stop", release);
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
    return acquireVoiceSlot(list, maxVoices, () => {
      try {
        const sound = this.game.sound.add(SFX_KEYS[id], { volume: 0 });
        return { sound, busy: false, token: 0, vol: 0, startedAt: 0 };
      } catch {
        return null;
      }
    });
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
    this.stopMusic();
    this.musicTrack = track;
    if (track === "none" || this.muted || this.failed) return;
    const settings = getSettings();
    try {
      const key = track === "boss" ? MUSIC_KEYS.boss : MUSIC_KEYS.run;
      const sound = this.game.sound.add(key, { loop: true, volume: settings.music * 0.55 });
      sound.play();
      this.music = sound;
    } catch {
      this.music = null;
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
