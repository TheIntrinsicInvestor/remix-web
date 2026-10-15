"""Key and BPM detection via librosa.

Functions accept either a file path or a channel-major ndarray (channels, frames).
When passing an ndarray, provide sr explicitly.
"""
import os
import numpy as np
import librosa


# Krumhansl-Schmuckler tonal hierarchy profiles
_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def _load_mono(audio_or_path, sr=None):
    if isinstance(audio_or_path, (str, os.PathLike)):
        return librosa.load(audio_or_path, sr=sr, mono=True)
    audio = np.asarray(audio_or_path, dtype="float32")
    if audio.ndim == 2:  # channel-major (channels, frames) — take mean across channels
        audio = audio.mean(axis=0)
    return audio, sr


def detect_bpm(audio_or_path, sr=None) -> float:
    """Estimate BPM. Returns float."""
    audio, sr = _load_mono(audio_or_path, sr)
    tempo, _ = librosa.beat.beat_track(y=audio, sr=sr)
    return float(np.atleast_1d(tempo)[0])


def detect_key(audio_or_path, sr=None) -> str:
    """Estimate key via Krumhansl-Schmuckler profile correlation.

    Returns e.g. 'A minor' or 'C# major'. Informs the user; user decides shifts.
    """
    audio, sr = _load_mono(audio_or_path, sr)
    chroma = librosa.feature.chroma_cqt(y=audio, sr=sr).mean(axis=1)

    best_score, best_key = -np.inf, "C major"
    for i in range(12):
        rotated = np.roll(chroma, -i)
        maj = np.corrcoef(rotated, _MAJOR)[0, 1]
        min_ = np.corrcoef(rotated, _MINOR)[0, 1]
        if maj > best_score:
            best_score, best_key = maj, f"{_NOTES[i]} major"
        if min_ > best_score:
            best_score, best_key = min_, f"{_NOTES[i]} minor"
    return best_key
