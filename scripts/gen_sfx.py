#!/usr/bin/env python3
"""Lanternfall M5 — prozedurale 8-Bit-SFX und Chiptune-Loops.

Nur Python-Standardlib (wave/struct/math/random). Keine Downloads, keine
externen Samples: alle Wellenformen und Noise-Envelopes entstehen hier.
Ausgabe: public/sfx/*.wav (22050 Hz, mono, 16 bit) — reproduzierbar per Seed.

Aufruf: python3 scripts/gen_sfx.py
"""
from __future__ import annotations

import math
import os
import random
import struct
import wave

SR = 22050
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", "sfx")
rng = random.Random(0x1A57)


def clamp(v: float) -> float:
    return max(-1.0, min(1.0, v))


def square(phase: float, duty: float = 0.5) -> float:
    return 1.0 if (phase % 1.0) < duty else -1.0


def triangle(phase: float) -> float:
    p = phase % 1.0
    return 4.0 * abs(p - 0.5) - 1.0


def saw(phase: float) -> float:
    return 2.0 * (phase % 1.0) - 1.0


def noise() -> float:
    return rng.uniform(-1.0, 1.0)


def env(t: float, dur: float, attack: float = 0.005, decay: float = 0.08, sustain: float = 0.5, release: float = 0.1) -> float:
    if t < attack:
        return t / max(1e-4, attack)
    if t < attack + decay:
        k = (t - attack) / max(1e-4, decay)
        return 1.0 - k * (1.0 - sustain)
    if t > dur - release:
        k = (t - (dur - release)) / max(1e-4, release)
        return sustain * (1.0 - k)
    return sustain


def tone(freq0: float, freq1: float | None, dur: float, wave_fn=square, vol: float = 0.35,
         duty: float = 0.5, attack: float = 0.004, decay: float = 0.06,
         sustain: float = 0.35, release: float = 0.05, vibrato: float = 0.0) -> list[float]:
    n = int(dur * SR)
    out = []
    phase = 0.0
    for i in range(n):
        t = i / SR
        freq = freq0 if freq1 is None else freq0 + (freq1 - freq0) * (t / max(1e-5, dur))
        if vibrato:
            freq *= 1.0 + math.sin(2 * math.pi * 6.0 * t) * vibrato
        phase += freq / SR
        s = wave_fn(phase, duty) if wave_fn is square else wave_fn(phase)
        out.append(s * vol * env(t, dur, attack, decay, sustain, release))
    return out


def noise_burst(dur: float, vol: float = 0.3, decay: float = 0.05, lowpass: float = 0.0) -> list[float]:
    n = int(dur * SR)
    out = []
    last = 0.0
    for i in range(n):
        t = i / SR
        v = noise()
        if lowpass > 0:
            last = last + (v - last) * lowpass
            v = last
        out.append(v * vol * env(t, dur, 0.001, decay, 0.2, dur * 0.4))
    return out


def mix(*tracks: list[float]) -> list[float]:
    n = max((len(t) for t in tracks), default=0)
    out = [0.0] * n
    for tr in tracks:
        for i, v in enumerate(tr):
            out[i] += v
    return [clamp(v) for v in out]


def concat(*parts: list[float]) -> list[float]:
    out: list[float] = []
    for p in parts:
        out.extend(p)
    return out


def silence(dur: float) -> list[float]:
    return [0.0] * int(dur * SR)


def write_wav(name: str, samples: list[float]) -> None:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        data = b"".join(struct.pack("<h", int(clamp(s) * 32760)) for s in samples)
        w.writeframes(data)
    print(f"{name:24s} {len(samples)/SR:5.2f}s {os.path.getsize(path)//1024:4d} KiB")


def sfx() -> None:
    # Waffen: Glutfunke (warmes Zischen mit Pitch-Down)
    write_wav("sfx_ember.wav", mix(
        tone(880, 220, 0.20, square, 0.18, 0.35, vibrato=0.05),
        noise_burst(0.18, 0.15, 0.06, 0.35),
    ))
    # Kettenflegel: metallischer Schwung (triangular + noise)
    write_wav("sfx_flail.wav", mix(
        tone(300, 160, 0.24, triangle, 0.30, attack=0.01, release=0.1),
        noise_burst(0.24, 0.18, 0.09, 0.5),
    ))
    # Frostnova: gläserner Aufwärts-Sweep
    write_wav("sfx_frost.wav", mix(
        tone(520, 1320, 0.32, triangle, 0.22, attack=0.01, release=0.16),
        tone(1040, 1660, 0.28, square, 0.10, duty=0.25),
    ))
    # Dornensalve: kurze gezackte Salve
    write_wav("sfx_thorn.wav", concat(
        mix(tone(460, 300, 0.06, square, 0.18, duty=0.2), noise_burst(0.06, 0.12, 0.02)),
        mix(tone(380, 250, 0.06, square, 0.16, duty=0.2), noise_burst(0.06, 0.10, 0.02)),
    ))
    # Sturmrune: Donnerknall + gezackter Nachhall
    write_wav("sfx_storm.wav", concat(
        mix(noise_burst(0.12, 0.42, 0.02, 0.15), tone(120, 60, 0.12, saw, 0.18)),
        mix(noise_burst(0.22, 0.22, 0.08, 0.05), tone(90, 40, 0.20, triangle, 0.14)),
    ))
    # Geisterlaterne: schwebender Glockenklang
    write_wav("sfx_lantern.wav", mix(
        tone(740, 700, 0.34, triangle, 0.20, release=0.22, vibrato=0.02),
        tone(1480, 1400, 0.30, square, 0.06, duty=0.125, release=0.2),
    ))
    # Phönixschwarm: Flügelschlag + Feuer
    write_wav("sfx_phoenix.wav", concat(
        mix(noise_burst(0.10, 0.30, 0.04, 0.2), tone(600, 900, 0.10, square, 0.14, duty=0.3)),
        mix(noise_burst(0.16, 0.18, 0.08, 0.08), tone(1400, 500, 0.16, triangle, 0.12)),
    ))
    # Zornpendel: tiefer Metallschwung
    write_wav("sfx_wrath.wav", mix(
        tone(180, 90, 0.34, saw, 0.24, attack=0.02, release=0.14),
        noise_burst(0.30, 0.18, 0.12, 0.7),
    ))
    # Ewiger Winter: langer eisiger Akkord
    write_wav("sfx_winter.wav", mix(
        tone(392, 392, 0.55, triangle, 0.12, sustain=0.28, release=0.25),
        tone(587, 587, 0.55, square, 0.06, duty=0.25, sustain=0.2, release=0.25),
        tone(880, 880, 0.55, triangle, 0.05, sustain=0.15, release=0.25),
    ))
    # Dornensturm: Wirbel
    write_wav("sfx_thornstorm.wav", concat(
        mix(tone(300, 900, 0.16, saw, 0.16), noise_burst(0.16, 0.12, 0.05)),
        mix(tone(900, 340, 0.18, saw, 0.14), noise_burst(0.18, 0.10, 0.06)),
    ))
    # Gewittersiegel: aufgeladener Summ-Ton
    write_wav("sfx_seal.wav", mix(
        tone(220, 440, 0.30, square, 0.14, duty=0.125, vibrato=0.08),
        tone(660, 880, 0.30, triangle, 0.10, vibrato=0.05),
    ))
    # Seelenleuchtfeuer: warmes Seelen-Glühen
    write_wav("sfx_soul.wav", mix(
        tone(520, 780, 0.36, triangle, 0.16, release=0.2, vibrato=0.03),
        tone(260, 390, 0.36, square, 0.08, duty=0.25, release=0.2),
    ))
    # Treffer: kurzer harter Klick
    write_wav("sfx_hit.wav", mix(
        tone(320, 180, 0.07, square, 0.26, duty=0.3, decay=0.02, release=0.02),
        noise_burst(0.06, 0.20, 0.015, 0.4),
    ))
    # Gegnertod: kleine Abwärts-Percussion
    write_wav("sfx_kill.wav", mix(
        tone(240, 80, 0.16, triangle, 0.22, decay=0.05, release=0.06),
        noise_burst(0.12, 0.14, 0.04, 0.3),
    ))
    # XP: heller Zwei-Ton-Ping
    write_wav("sfx_xp.wav", concat(
        tone(1320, 1320, 0.05, square, 0.12, duty=0.25, release=0.03),
        tone(1760, 1760, 0.07, square, 0.10, duty=0.25, release=0.04),
    ))
    # Level-up: aufsteigende Fanfare
    write_wav("sfx_levelup.wav", concat(
        tone(523, 523, 0.10, square, 0.18, duty=0.5, release=0.04),
        tone(659, 659, 0.10, square, 0.18, duty=0.5, release=0.04),
        tone(784, 784, 0.12, square, 0.18, duty=0.5, release=0.04),
        mix(tone(1046, 1046, 0.30, square, 0.20, duty=0.35, release=0.18),
            tone(523, 523, 0.30, triangle, 0.12, release=0.18)),
    ))
    # Truhe: Schloss-Klick + Münz-Glitzer
    write_wav("sfx_chest.wav", concat(
        mix(tone(180, 140, 0.05, square, 0.20, duty=0.2, release=0.02), noise_burst(0.05, 0.18, 0.015)),
        silence(0.03),
        tone(1046, 1568, 0.06, square, 0.12, duty=0.25, release=0.03),
        tone(1568, 2093, 0.10, square, 0.12, duty=0.25, release=0.06),
    ))
    # Evolution: große Sechs-Ton-Aufstieg mit Glow
    write_wav("sfx_evolution.wav", concat(
        tone(392, 392, 0.10, square, 0.16, duty=0.5, release=0.04),
        tone(523, 523, 0.10, square, 0.16, duty=0.5, release=0.04),
        tone(659, 659, 0.10, square, 0.16, duty=0.5, release=0.04),
        tone(784, 784, 0.10, square, 0.16, duty=0.5, release=0.04),
        mix(tone(1046, 1046, 0.55, triangle, 0.20, sustain=0.4, release=0.3),
            tone(1568, 1568, 0.55, square, 0.08, duty=0.125, sustain=0.3, release=0.3),
            noise_burst(0.35, 0.06, 0.2, 0.2)),
    ))
    # Boss-Warnung: tiefes Horn + dissonanter Alarm
    write_wav("sfx_boss_warn.wav", concat(
        mix(tone(110, 104, 0.28, saw, 0.30, attack=0.03, sustain=0.5, release=0.08),
            tone(116, 110, 0.28, square, 0.18, duty=0.5, sustain=0.4, release=0.08)),
        silence(0.06),
        mix(tone(110, 110, 0.35, saw, 0.26, sustain=0.4, release=0.1),
            tone(155, 155, 0.35, square, 0.14, duty=0.3, sustain=0.3, release=0.1)),
    ))
    # Boss-Tod: große Explosion mit langem Abfall
    write_wav("sfx_boss_death.wav", concat(
        mix(noise_burst(0.45, 0.48, 0.10, 0.10), tone(90, 38, 0.45, saw, 0.30, decay=0.1, release=0.15)),
        mix(noise_burst(0.6, 0.22, 0.25, 0.03), tone(55, 30, 0.5, triangle, 0.18, release=0.25)),
    ))
    # Sieg: lange helle Fanfare
    write_wav("sfx_victory.wav", concat(
        tone(523, 523, 0.12, square, 0.16, duty=0.5, release=0.04),
        tone(659, 659, 0.12, square, 0.16, duty=0.5, release=0.04),
        tone(784, 784, 0.12, square, 0.16, duty=0.5, release=0.04),
        mix(tone(1046, 1046, 0.8, triangle, 0.22, sustain=0.35, release=0.4),
            tone(784, 784, 0.8, square, 0.10, duty=0.25, sustain=0.25, release=0.4),
            tone(523, 523, 0.8, square, 0.08, duty=0.5, sustain=0.2, release=0.4)),
    ))
    # Niederlage: fallender Minor-Seufzer
    write_wav("sfx_defeat.wav", concat(
        tone(392, 392, 0.18, triangle, 0.20, release=0.06),
        tone(311, 311, 0.18, triangle, 0.20, release=0.06),
        tone(233, 196, 0.55, saw, 0.16, sustain=0.3, release=0.3),
    ))


# ── Musik: einfache Chiptune-Schleifen ──────────────────────────────────────
def note(name: str, octave: int) -> float:
    semis = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6,
             "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    midi = 12 * (octave + 1) + semis[name]
    return 440.0 * 2 ** ((midi - 69) / 12)


def music(path_name: str, bpm: int, bars: int, lead: list[tuple[str, int]], bass: list[tuple[str, int]],
          dark: bool = False) -> None:
    beat = 60.0 / bpm
    step = beat / 2  # Achtelnoten
    lead_track: list[float] = []
    bass_track: list[float] = []
    hat_track: list[float] = []
    n_steps = bars * 8
    for i in range(n_steps):
        lname, loct = lead[i % len(lead)]
        bname, boct = bass[i % len(bass)]
        lead_track.extend(tone(note(lname, loct), None, step, square if dark else triangle,
                               0.10 if dark else 0.08, duty=0.25 if dark else 0.5,
                               attack=0.005, decay=0.03, sustain=0.45, release=0.03))
        bass_track.extend(tone(note(bname, boct), None, step, square if dark else triangle,
                               0.13 if dark else 0.12, duty=0.5 if dark else 0.5,
                               attack=0.004, decay=0.02, sustain=0.55, release=0.02))
        # Hi-Hat auf jedem zweiten Schritt
        if i % 2 == 0:
            hat_track.extend(noise_burst(step * 0.35, 0.035, 0.02, 0.6))
        else:
            hat_track.extend(silence(step))
    # Endlosschleife: Ende weich ausblenden, Anfang einblenden ist bei Loop okay.
    total = int(n_steps * step * SR)
    out = [0.0] * total
    for tr, vol in ((lead_track, 1.0), (bass_track, 1.0), (hat_track, 1.0)):
        for i, v in enumerate(tr[:total]):
            out[i] += v * vol
    # sanfte Lautstärke-Automation über den Loop (kein Klick am Loop-Punkt)
    fade = int(0.25 * SR)
    for i in range(min(fade, total)):
        out[i] *= i / fade
        out[total - 1 - i] *= i / fade
    write_wav(path_name, [clamp(v) for v in out])


def music_tracks() -> None:
    # Moor-Nacht: a-Moll, ruhig, 100 BPM, 8 Takte ≈ 19 s
    lead = [("E", 5), ("G", 5), ("A", 5), ("C", 6), ("B", 5), ("G", 5), ("E", 5), ("D", 5)]
    bass = [("A", 3), ("A", 3), ("F", 3), ("F", 3), ("C", 4), ("C", 4), ("G", 3), ("G", 3)]
    music("music_run.wav", 100, 8, lead, bass)
    # Boss: tiefer, triolisch/ dissonant, 132 BPM
    lead = [("C", 5), ("D#", 5), ("F#", 5), ("G", 5), ("F#", 5), ("D#", 5), ("C", 5), ("B", 4)]
    bass = [("C", 3), ("C", 3), ("F#", 2), ("F#", 2), ("G", 2), ("G", 2), ("D#", 2), ("D#", 2)]
    music("music_boss.wav", 132, 8, lead, bass, dark=True)


if __name__ == "__main__":
    sfx()
    music_tracks()
    print("Fertig: public/sfx/*.wav")
