"""Low-level pedalboard effect blocks + stem utility functions.

All audio parameters are channel-major (channels, frames) float32.
Each function returns a channel-major array of the same channel count.

The preset dispatch in presets.py calls fn(audio, sr, **params), so every
function here accepts (audio, sr=None, **kwargs) as its signature.
"""
import numpy as np
from pedalboard import (
    Pedalboard, HighpassFilter, LowpassFilter, PeakFilter,
    Compressor, Limiter, Reverb, Delay, Chorus, Distortion, Clipping, Gain,
)


# ----------------------------------------------------------------- EQ

def eq(audio, sr, *, hpf=None, lpf=None, bands=None):
    """EQ: optional HPF, LPF, and peak bands.

    bands: list of [freq_hz, gain_db, q]
    Example: eq(audio, sr, hpf=100, bands=[[7000, -3.0, 1.0]])
    """
    plugins = []
    if hpf is not None:
        plugins.append(HighpassFilter(cutoff_frequency_hz=hpf))
    if lpf is not None:
        plugins.append(LowpassFilter(cutoff_frequency_hz=lpf))
    for freq, gain_db, q in (bands or []):
        plugins.append(PeakFilter(cutoff_frequency_hz=freq, gain_db=gain_db, q=q))
    if not plugins:
        return audio
    return Pedalboard(plugins)(audio, sr)


def lowpass_to(audio, sr, hz):
    """Simple single-pole LPF convenience wrapper."""
    return Pedalboard([LowpassFilter(cutoff_frequency_hz=hz)])(audio, sr)


# -------------------------------------------------------------- DYNAMICS

def compress(audio, sr, threshold_db=-20.0, ratio=4.0, attack_ms=5.0, release_ms=100.0):
    return Pedalboard([
        Compressor(threshold_db=threshold_db, ratio=ratio,
                   attack_ms=attack_ms, release_ms=release_ms)
    ])(audio, sr)


def limiter(audio, sr, threshold_db=-1.0, release_ms=100.0):
    return Pedalboard([Limiter(threshold_db=threshold_db, release_ms=release_ms)])(audio, sr)


# --------------------------------------------------------------- DRIVE

def saturate(audio, sr, drive_db=12.0):
    return Pedalboard([Distortion(drive_db=drive_db)])(audio, sr)


def soft_clip(audio, sr, threshold_db=-1.0):
    return Pedalboard([Clipping(threshold_db=threshold_db)])(audio, sr)


# --------------------------------------------------------------- SPACE

def reverb(audio, sr, room_size=0.5, wet_level=0.15, dry_level=0.85,
           damping=0.5, width=1.0):
    return Pedalboard([
        Reverb(room_size=room_size, wet_level=wet_level, dry_level=dry_level,
               damping=damping, width=width)
    ])(audio, sr)


def delay(audio, sr, seconds=0.25, feedback=0.3, mix=0.3):
    return Pedalboard([Delay(delay_seconds=seconds, feedback=feedback, mix=mix)])(audio, sr)


def chorus(audio, sr, rate_hz=0.5, depth=0.25, mix=0.5):
    return Pedalboard([Chorus(rate_hz=rate_hz, depth=depth, mix=mix)])(audio, sr)


# ------------------------------------------------------- UTILITY / GAIN

def gain(audio, sr=None, db=0.0):
    """Scale amplitude by db decibels."""
    return audio * (10 ** (db / 20.0))


def mute(audio, sr=None):
    """Return silence (zeros) with the same shape."""
    return np.zeros_like(audio)


# --------------------------------------------------------- PROGRAMMATIC

def apply_chain(audio, sr, plugins: list):
    """Build and apply a Pedalboard from a list of plugin instances."""
    return Pedalboard(plugins)(audio, sr)


# ---------------------------------------------------- STEM-LEVEL UTILS
# (these operate on stem dicts, not single arrays — not for preset dispatch)

def solo(stems: dict, keep: str) -> dict:
    """Return a new stems dict with every stem except `keep` muted."""
    return {k: (v if k == keep else np.zeros_like(v)) for k, v in stems.items()}
