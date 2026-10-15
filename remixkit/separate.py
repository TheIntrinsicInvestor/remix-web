"""Demucs stem separation with file-level caching.

Windows gotchas preserved from spike:
- No demucs.api — use get_model + apply_model directly.
- No torchaudio.load — load with soundfile, pass tensor.
- Mean/std normalize before apply_model, restore after.
"""
import hashlib
import os
import numpy as np
import soundfile as sf
import torch
from demucs.pretrained import get_model
from demucs.apply import apply_model


def _fingerprint(src_path) -> str:
    h = hashlib.blake2b(digest_size=4)
    with open(src_path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()  # 8 hex chars


def separate(src_path, model_name="htdemucs_6s", cache_dir="stems_cache", force=False) -> dict:
    """Separate src_path into stems. Returns {stem_name: wav_path}.

    Results are cached under cache_dir/{song}_{hash}_{model}/. Pass force=True to re-separate.
    Supports htdemucs (4-stem) and htdemucs_6s (6-stem: adds guitar, piano).
    Use model_name="htdemucs" for a faster, cleaner 4-stem run.
    """
    song = os.path.splitext(os.path.basename(src_path))[0]
    fp = _fingerprint(src_path)
    model_slug = model_name.replace("_", "")
    stem_dir = os.path.join(cache_dir, f"{song}_{fp}_{model_slug}")
    os.makedirs(stem_dir, exist_ok=True)

    model = get_model(model_name)
    stem_names = model.sources  # e.g. ['drums','bass','other','vocals']

    all_cached = all(os.path.exists(os.path.join(stem_dir, f"{n}.wav")) for n in stem_names)
    if all_cached and not force:
        print(f"[separate] cache hit -> {stem_dir}")
        return {n: os.path.join(stem_dir, f"{n}.wav") for n in stem_names}

    print(f"[separate] separating with {model_name} (CPU)...")
    model.eval()

    src, src_sr = sf.read(src_path, dtype="float32")  # (frames, channels)
    if src.ndim == 1:
        src = src[:, None]

    if src_sr != model.samplerate:
        import librosa
        print(f"[separate] resampling {src_sr} -> {model.samplerate}")
        src = librosa.resample(src.T, orig_sr=src_sr, target_sr=model.samplerate).T

    wav = torch.from_numpy(np.ascontiguousarray(src.T))  # (channels, frames)
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)

    ref = wav.mean(0)
    wav_n = (wav - ref.mean()) / (ref.std() + 1e-8)

    with torch.no_grad():
        out = apply_model(model, wav_n[None], device="cpu", progress=True,
                          split=True, overlap=0.25)[0]
    out = out * ref.std() + ref.mean()

    paths = {}
    for name, tens in zip(stem_names, out):
        path = os.path.join(stem_dir, f"{name}.wav")
        sf.write(path, tens.cpu().numpy().T, model.samplerate, subtype="PCM_24")
        paths[name] = path

    print(f"[separate] done -> {', '.join(stem_names)}")
    return paths
