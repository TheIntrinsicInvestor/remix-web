"""Sample loading, BPM matching, tiling, and layering.

Samples come from the samples/ directory (user-curated loops/one-shots).
All arrays are channel-major (channels, frames) float32.
"""
import numpy as np
from remixkit.io_bounce import load, to_chanmajor
from remixkit.pitch_time import time_stretch


def load_sample(path):
    """Load a sample file. Returns (audio_fc, sr) — channel-major float32."""
    audio_fm, sr, _ = load(path)
    return to_chanmajor(audio_fm), sr


def match_bpm(loop, sr, src_bpm, tgt_bpm):
    """Time-stretch a loop from src_bpm to tgt_bpm without changing pitch."""
    factor = src_bpm / tgt_bpm
    return time_stretch(loop, sr, factor)


def tile_to_length(loop, n):
    """Tile loop n times along the frames axis (channel-major)."""
    return np.tile(loop, (1, n))


def layer(base, addition, gain_db=0.0):
    """Add `addition` onto `base` (channel-major), aligning to the shorter length.

    gain_db adjusts addition level before summing. Returns same length as base.
    """
    out = base.copy()
    if gain_db != 0.0:
        addition = addition * (10 ** (gain_db / 20.0))
    length = min(base.shape[1], addition.shape[1])
    out[:, :length] += addition[:, :length]
    return out


def replace_stem(stems: dict, stem_name: str, new_audio) -> dict:
    """Return a new stems dict with stem_name swapped for new_audio."""
    return {**stems, stem_name: new_audio}
