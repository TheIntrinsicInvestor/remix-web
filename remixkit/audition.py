"""Audition/preview helpers for quick in-session listening checks.

sounddevice is lazy-imported so a missing PortAudio installation doesn't
break `import remixkit` on machines without audio output.
"""


def preview(source, sr=None, start_sec=0, duration=10):
    """Play a slice of audio. Blocks until playback finishes.

    source: path str, channel-major ndarray (requires sr), or stems dict (requires sr).
    start_sec/duration: clip the playback window in seconds.
    """
    import sounddevice as sd
    from remixkit.io_bounce import load, bounce, to_framemajor

    if isinstance(source, str):
        audio_fm, sr, _ = load(source)
        audio_fc = audio_fm.T
    elif isinstance(source, dict):
        if sr is None:
            raise ValueError("sr required when source is a stems dict")
        audio_fc = bounce(source, sr)
    else:
        if sr is None:
            raise ValueError("sr required when source is an ndarray")
        audio_fc = source

    start = int(start_sec * sr)
    end = start + int(duration * sr)
    slice_fc = audio_fc[:, start:min(end, audio_fc.shape[1])]
    sd.play(to_framemajor(slice_fc), sr)
    sd.wait()
