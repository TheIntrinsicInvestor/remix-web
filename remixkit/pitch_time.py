"""Independent pitch shifting and time stretching.

Primary engine: python-stretch (Signalsmith Stretch 0.3.1).
Fallback for pitch_shift only: librosa.

All functions operate on channel-major arrays (channels, frames) and return
channel-major arrays. Duration is unchanged by pitch_shift; pitch is unchanged
by time_stretch.
"""
import numpy as np


def pitch_shift(audio_fc, sr, semitones) -> np.ndarray:
    """Shift pitch by `semitones` without changing duration.

    Returns channel-major array, same shape as input.
    Reports which engine was used.
    """
    try:
        import python_stretch as ps
        st = ps.Signalsmith.Stretch()
        st.preset(audio_fc.shape[0], sr)
        st.setTransposeSemitones(semitones)
        result = st.process(np.ascontiguousarray(audio_fc))
        print(f"[pitch_time] pitch_shift via python-stretch")
        return result
    except Exception as e:
        import librosa
        print(f"[pitch_time] python-stretch unavailable ({type(e).__name__}: {e}); falling back to librosa")
        fm = audio_fc.T  # (frames, channels)
        chans = [
            librosa.effects.pitch_shift(np.ascontiguousarray(fm[:, c]), sr=sr, n_steps=semitones)
            for c in range(fm.shape[1])
        ]
        return np.stack(chans, axis=0)


def time_stretch(audio_fc, sr, factor) -> np.ndarray:
    """Stretch time by `factor` (output_length / input_length).

    factor > 1  ->  longer output (slower)
    factor < 1  ->  shorter output (faster)

    Pitch is unchanged. Uses python-stretch.

    Note: python_stretch's setTimeFactor is a *speed* factor (inverse of our convention),
    so we pass 1/factor to the library.
    """
    import python_stretch as ps
    st = ps.Signalsmith.Stretch()
    st.preset(audio_fc.shape[0], sr)
    st.setTimeFactor(1.0 / factor)  # speed = 1/stretch; 0.8 length → 1.25 speed
    result = st.process(np.ascontiguousarray(audio_fc))
    print(f"[pitch_time] time_stretch factor={factor:.3f} "
          f"({audio_fc.shape[1]} -> {result.shape[1]} frames, "
          f"ratio {result.shape[1]/audio_fc.shape[1]:.3f})")
    return result


def target_bpm(audio_fc, sr, src_bpm, tgt_bpm) -> np.ndarray:
    """Stretch audio so its tempo matches tgt_bpm.

    Derived from time_stretch: factor = src_bpm / tgt_bpm.
    src_bpm=120, tgt_bpm=90  ->  factor 1.33 (slower/longer)
    src_bpm=90,  tgt_bpm=120 ->  factor 0.75 (faster/shorter)
    """
    return time_stretch(audio_fc, sr, src_bpm / tgt_bpm)


def global_shift(src_path, semitones=0, src_bpm=None, tgt_bpm=None,
                 out_dir="input/_shifted") -> str:
    """Pitch/tempo-shift the whole mix before separation. Returns path to derived WAV.

    Feed the returned path into separate() for mutually-aligned stems and a single
    stretch pass. Each unique (semitones, tgt_bpm) target creates a distinct cache entry.
    Tradeoff: use this for uniform whole-song shifts; use per-stem pitch_shift/target_bpm
    when you want independent per-stem control (reuses the original separated cache).
    """
    import os
    from remixkit.io_bounce import load, save, to_chanmajor, to_framemajor
    audio_fm, sr, sub = load(src_path)
    audio_fc = to_chanmajor(audio_fm)
    if semitones:
        audio_fc = pitch_shift(audio_fc, sr, semitones)
    if src_bpm is not None and tgt_bpm is not None:
        audio_fc = target_bpm(audio_fc, sr, src_bpm, tgt_bpm)
    os.makedirs(out_dir, exist_ok=True)
    song = os.path.splitext(os.path.basename(src_path))[0]
    bpm_tag = f"{int(tgt_bpm)}bpm" if tgt_bpm is not None else "xbpm"
    out_path = os.path.join(out_dir, f"{song}__{semitones}st_{bpm_tag}.wav")
    save(to_framemajor(audio_fc), sr, out_path, sub)
    print(f"[pitch_time] global_shift -> {out_path}")
    return out_path
