import numpy as np, soundfile as sf, pytest
from pathlib import Path
from remixweb.inputs import from_upload, probe_duration_wav, InputError

def _wav_bytes(seconds, sr=44100):
    import io
    buf = io.BytesIO()
    x = np.zeros((int(seconds * sr), 2), dtype=np.float32)
    sf.write(buf, x, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()

def test_accepts_short_wav(tmp_path):
    out = from_upload(_wav_bytes(3), "clip.wav", tmp_path)
    assert Path(out).exists()
    assert abs(probe_duration_wav(str(out)) - 3) < 0.2

def test_rejects_oversize(tmp_path):
    big = b"\x00" * (61 * 1024 * 1024)
    with pytest.raises(InputError):
        from_upload(big, "big.wav", tmp_path)

def test_rejects_too_long(tmp_path):
    with pytest.raises(InputError):
        from_upload(_wav_bytes(9 * 60), "long.wav", tmp_path)
