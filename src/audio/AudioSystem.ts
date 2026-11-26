import Phaser from "phaser";
import { getSettings, setSettings } from "./settings";
import {
  canPlay, effectiveVolume, newMixerState, notePlayed, releaseVoice, PRIORITY,
  type MixerState, type SoundRequest,
} from "./mixing";
import type { WeaponAnyId } from "../data/types";
import { acquireVoiceSlot } from "../logic/voice-pool";

/** Eine wiederverwendete SFX-Stimme. `token` schuetzt vor Doppel-Freigabe. */
interface Voice {
  sound: Phaser.Sound.BaseSound;
  busy: boolean;
  token: number;
}

/** Alle prozedural erzeugten WAVs (scripts/gen_sfx.py). */
export const SFX_KEYS = {
  ember: "sfx_ember", flail: "sfx_flail", frost: "sfx_frost", thorn: "sfx_thorn",
  storm: "sfx_storm", lantern: "sfx_lantern", phoenix: "sfx_phoenix",
  wrath_pendulum: "sfx_wrath", eternal_winter: "sfx_winter", thorn_storm: "sfx_thornstorm",
  thunder_seal: "sfx_seal", soul_beacon: "sfx_soul",
  hit: "sfx_hit", kill: "sfx_kill", xp: "sfx_xp", levelup: "sfx_levelup",
  chest: "sfx_chest", evolution: "sfx_evolution", bossWarn: "sfx_boss_warn",
  bossDeath: "sfx_boss_death", victory: "sfx_victory", defeat: "sfx_defeat",
} as const;

export const MUSIC_KEYS = { run: "music_run", boss: "music_boss" } as const;

type SfxId = keyof typeof SFX_KEYS;

interface SfxConfig {
  priority: number;
  cooldown: number;
  maxVoices: number;
  volume: number;
}

const CONFIG: Record<SfxId, SfxConfig> = {
  ember: { priority: PRIORITY.weapon, cooldown: 0.09, maxVoices: 3, volume: 0.55 },
  flail: { priority: PRIORITY.weapon, cooldown: 0.12, maxVoices: 2, volume: 0.55 },
  frost: { priority: PRIORITY.weapon, cooldown: 0.22, maxVoices: 2, volume: 0.5 },
  thorn: { priority: PRIORITY.weapon, cooldown: 0.12, maxVoices: 2, volume: 0.45 },
  storm: { priority: PRIORITY.weapon, cooldown: 0.16, maxVoices: 2, volume: 0.6 },
  lantern: { priority: PRIORITY.weapon, cooldown: 0.3, maxVoices: 1, volume: 0.4 },
  phoenix: { priority: PRIORITY.weapon, cooldown: 0.2, maxVoices: 2, volume: 0.55 },
  wrath_pendulum: { priority: PRIORITY.weapon, cooldown: 0.16, maxVoices: 2, volume: 0.6 },
  eternal_winter: { priority: PRIORITY.weapon, cooldown: 0.4, maxVoices: 1, volume: 0.4 },
  thorn_storm: { priority: PRIORITY.weapon, cooldown: 0.2, maxVoices: 2, volume: 0.5 },
  thunder_seal: { priority: PRIORITY.weapon, cooldown: 0.2, maxVoices: 2, volume: 0.55 },
  soul_beacon: { priority: PRIORITY.weapon, cooldown: 0.35, maxVoices: 1, volume: 0.45 },
  hit: { priority: PRIORITY.hit, cooldown: 0.05, maxVoices: 4, volume: 0.45 },
  kill: { priority: PRIORITY.hit, cooldown: 0.04, maxVoices: 4, volume: 0.35 },
  xp: { priority: PRIORITY.weapon, cooldown: 0.05, maxVoices: 3, volume: 0.25 },
  levelup: { priority: PRIORITY.boss, cooldown: 0.5, maxVoices: 1, volume: 0.7 },
  chest: { priority: PRIORITY.boss, cooldown: 0.6, maxVoices: 1, volume: 0.65 },
  evolution: { priority: PRIORITY.crit, cooldown: 0.8, maxVoices: 1, volume: 0.85 },
  bossWarn: { priority: PRIORITY.warning, cooldown: 1.2, maxVoices: 1, volume: 0.9 },
  bossDeath: { priority: PRIORITY.warning, cooldown: 1.4, maxVoices: 1, volume: 0.95 },
  victory: { priority: PRIORITY.boss, cooldown: 2, maxVoices: 1, volume: 0.85 },
  defeat: { priority: PRIORITY.boss, cooldown: 2, maxVoices: 1, volume: 0.8 },
};

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

  /** Spielt einen SFX mit Priorität/Cooldown/Stimmenlimit. */
  play(id: SfxId): boolean {
    if (this.muted || this.failed) return false;
    const cfg = CONFIG[id];
    const settings = getSettings();
    if (settings.sfx <= 0) return false;
    this.mixer.now = performance.now() / 1000;
    const req: SoundRequest = {
      id, priority: cfg.priority, cooldown: cfg.cooldown,
      maxVoices: cfg.maxVoices, volume: cfg.volume,
    };
    if (!canPlay(this.mixer, req)) return false;
    const voice = this.acquireVoice(id, cfg.maxVoices);
    if (!voice) return false;
    try {
      voice.busy = true;
      voice.token += 1;
      const token = voice.token;
      (voice.sound as unknown as { setVolume(v: number): void }).setVolume(effectiveVolume(settings.sfx, req));
      notePlayed(this.mixer, req);
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
        return { sound, busy: false, token: 0 };
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
