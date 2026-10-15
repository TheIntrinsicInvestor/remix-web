"""IO and bounce helpers. All internal audio is float32.

Channel-major convention (channels, frames) is used throughout the library.
soundfile uses frame-major (frames, channels) — convert at the IO boundary
using to_chanmajor / to_framemajor.
"""
import os
import numpy as np
import soundfile as sf


def load(path):
    """Read audio file. Returns (audio_fm, sr, subtype) in frame-major (frames, channels)."""
    info = sf.info(path)
    data, sr = sf.read(path, dtype="float32")
    if data.ndim == 1:
        data = data[:, None]
    return data, sr, info.subtype


def to_chanmajor(a):
    """(frames, channels) -> (channels, frames). Required before pedalboard / pitch calls."""
    return a.T


def to_framemajor(a):
    """(channels, frames) -> (frames, channels). Required before save()."""
    return a.T


def save(audio_fm, sr, path, subtype=None):
    """Write audio_fm (frame-major) to WAV. subtype defaults to PCM_24."""
    if subtype is None:
        subtype = "PCM_24"
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    sf.write(path, audio_fm, sr, subtype=subtype)


def bounce(stems: dict, sr, normalize=True, limit_db=None, release_ms=100.0) -> np.ndarray:
    """Sum channel-major stem arrays, length-align, peak-normalize to 0.9.

    Pass limit_db (e.g. -1.0) to engage a master limiter instead of peak-normalize.
    Returns channel-major ndarray. Call to_framemajor() before save().
    """
    arrays = list(stems.values())
    length = min(a.shape[1] for a in arrays)
    mix = sum(a[:, :length] for a in arrays)
    if limit_db is not None:
        from remixkit.effects import limiter
        mix = limiter(mix, sr, threshold_db=limit_db, release_ms=release_ms)
    elif normalize:
        peak = np.max(np.abs(mix))
        if peak > 0:
            mix = mix / peak * 0.9
    return mix


def name_output(song, key, bpm, tag, kind) -> str:
    """Build output filename per PRD §8 convention.

    name_output('MySong', 'A minor', 120.5, 'lofi', 'mix') -> 'MySong_A_minor_121_lofi_mix.wav'
    """
    key_str = key.replace(" ", "_")
    bpm_str = str(int(float(bpm) + 0.5))  # traditional round-half-up, not Python banker's rounding
    return f"{song}_{key_str}_{bpm_str}_{tag}_{kind}.wav"
