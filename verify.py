"""Smoke-tests for all remixkit modules (v2).

Run with the remix conda env python (see CLAUDE.md for the full path).
Uses spike/test_assets/test_mix.wav as the synthetic test clip.
"""
import inspect
import os, sys, time
import numpy as np

ROOT = os.path.dirname(os.path.abspath(__file__))
TEST_WAV = os.path.join(ROOT, "spike", "test_assets", "test_mix.wav")
OUT = os.path.join(ROOT, "output")
os.makedirs(OUT, exist_ok=True)

sys.path.insert(0, ROOT)

def ok(msg): print(f"  [OK]  {msg}")
def fail(msg): print(f"  [FAIL] {msg}"); sys.exit(1)
def section(title): print(f"\n{'='*60}\n  {title}\n{'='*60}")


# ---------------------------------------------------------------- io_bounce
section("1/8  io_bounce")
from remixkit.io_bounce import load, save, bounce, to_chanmajor, to_framemajor, name_output

audio_fm, sr, subtype = load(TEST_WAV)
assert audio_fm.ndim == 2, "load: expected 2D (frames, channels)"
assert audio_fm.dtype == np.float32
ok(f"load -> shape={audio_fm.shape}, sr={sr}, subtype={subtype}")

rt_path = os.path.join(OUT, "verify_roundtrip.wav")
save(audio_fm, sr, rt_path, subtype)
assert os.path.exists(rt_path)
ok(f"save -> {rt_path}")

rt_audio, rt_sr, _ = load(rt_path)
assert rt_audio.shape == audio_fm.shape, "round-trip shape mismatch"
assert abs(rt_sr - sr) < 1
ok("round-trip shape & sr match")

assert name_output("MySong", "A minor", 120.5, "lofi", "mix") == "MySong_A_minor_121_lofi_mix.wav"
assert name_output("Track", "C# major", 90, "raw", "vocals") == "Track_C#_major_90_raw_vocals.wav"
ok("name_output strings correct")

# 4-stem bounce
stems_test = {
    "a": np.random.randn(2, 1000).astype(np.float32),
    "b": np.random.randn(2, 1200).astype(np.float32),
}
mix = bounce(stems_test, sr=44100)
assert mix.shape == (2, 1000), f"bounce shape wrong: {mix.shape}"
assert np.max(np.abs(mix)) <= 0.91
ok(f"bounce -> shape={mix.shape}, peak={np.max(np.abs(mix)):.3f}")

# stem-agnostic 6-stem bounce
stems_test6 = {k: np.random.randn(2, 1000).astype(np.float32)
               for k in ["drums", "bass", "other", "vocals", "guitar", "piano"]}
mix6 = bounce(stems_test6, sr=44100)
assert mix6.shape == (2, 1000)
ok(f"stem-agnostic bounce (6 stems) -> {mix6.shape}, peak={np.max(np.abs(mix6)):.3f}")

# bounce with limit_db
hot = {"a": np.ones((2, sr), dtype=np.float32) * 1.5,
       "b": np.ones((2, sr), dtype=np.float32) * 1.5}
mix_lim = bounce(hot, sr=sr, limit_db=-1.0)
assert np.max(np.abs(mix_lim)) <= 1.02, \
    f"bounce(limit_db): peak {np.max(np.abs(mix_lim)):.4f} > 1.0 (hot sum was 3.0)"
ok(f"bounce(limit_db=-1) -> peak {np.max(np.abs(mix_lim)):.4f} (reduced from hot sum=3.0)")

# default normalize is unchanged
norm_stems = {"a": np.ones((2, 1000), dtype=np.float32), "b": np.ones((2, 1000), dtype=np.float32)}
mix_norm = bounce(norm_stems, sr=44100)
assert abs(np.max(np.abs(mix_norm)) - 0.9) < 0.01, \
    f"default normalize: peak {np.max(np.abs(mix_norm)):.4f}"
ok(f"bounce(default normalize) -> peak {np.max(np.abs(mix_norm)):.4f} (expected 0.9)")


# ---------------------------------------------------------------- separate
section("2/8  separate")
from remixkit.separate import separate, _fingerprint

fp1 = _fingerprint(TEST_WAV)
fp2 = _fingerprint(TEST_WAV)
assert fp1 == fp2, "fingerprint not stable across calls"
assert len(fp1) == 8, f"expected 8 hex chars, got {len(fp1)}"
ok(f"_fingerprint stable: {fp1}")

CACHE = os.path.join(ROOT, "stems_cache")
t0 = time.time()
stems = separate(TEST_WAV, model_name="htdemucs", cache_dir=CACHE)
t1 = time.time()
assert len(stems) == 4, f"expected 4 stems (htdemucs), got {len(stems)}"
for name, path in stems.items():
    assert os.path.exists(path), f"missing stem: {path}"
ok(f"first call -> {list(stems.keys())} in {t1-t0:.1f}s")

t0 = time.time()
stems2 = separate(TEST_WAV, model_name="htdemucs", cache_dir=CACHE)
t1 = time.time()
assert t1 - t0 < 2.0, f"cache hit took {t1-t0:.1f}s (expected < 2s)"
ok(f"second call (cache hit) in {t1-t0:.2f}s")

cache_entries = [d for d in os.listdir(CACHE) if d.startswith(f"test_mix_{fp1}_")]
assert len(cache_entries) >= 1
ok(f"fingerprint+model cache folder: {cache_entries[0]}")


# ---------------------------------------------------------------- analyze
section("3/8  analyze")
from remixkit.analyze import detect_bpm, detect_key

bpm = detect_bpm(TEST_WAV)
assert 40 < bpm < 300, f"BPM {bpm} out of plausible range"
ok(f"detect_bpm -> {bpm:.1f}")

key = detect_key(TEST_WAV)
assert "major" in key or "minor" in key, f"unexpected key string: {key!r}"
ok(f"detect_key -> {key!r}")


# ---------------------------------------------------------------- pitch_time
section("4/8  pitch_time")
from remixkit.pitch_time import pitch_shift, time_stretch, global_shift

audio_fc = to_chanmajor(audio_fm)
shifted = pitch_shift(audio_fc, sr, -2)
assert shifted.shape[0] == audio_fc.shape[0], "pitch_shift: channel count changed"
dur_ratio = shifted.shape[1] / audio_fc.shape[1]
assert 0.95 < dur_ratio < 1.05, f"pitch_shift changed duration by {dur_ratio:.2%}"
ok(f"pitch_shift -2st -> in={audio_fc.shape[1]} out={shifted.shape[1]} frames (ratio {dur_ratio:.3f})")

save(to_framemajor(shifted), sr, os.path.join(OUT, "verify_pitch_-2st.wav"), subtype)
ok("wrote verify_pitch_-2st.wav")

stretched = time_stretch(audio_fc, sr, 0.8)
expected = int(audio_fc.shape[1] * 0.8)
actual = stretched.shape[1]
assert abs(actual - expected) < 500, f"time_stretch 0.8 wrong length: {actual} vs {expected}"
ok(f"time_stretch 0.8 -> in={audio_fc.shape[1]} out={actual} (expected ~{expected})")

save(to_framemajor(stretched), sr, os.path.join(OUT, "verify_stretch_0.8x.wav"), subtype)
ok("wrote verify_stretch_0.8x.wav")

# global_shift: pitch-only leaves duration unchanged
shifted_dir = os.path.join(OUT, "_shifted_test")
gs_path = global_shift(TEST_WAV, semitones=-2, out_dir=shifted_dir)
assert os.path.exists(gs_path)
gs_fm, gs_sr, _ = load(gs_path)
gs_dur_ratio = gs_fm.shape[0] / audio_fm.shape[0]
assert 0.95 < gs_dur_ratio < 1.05, f"pitch-only global_shift changed duration by {gs_dur_ratio:.3f}"
ok(f"global_shift(-2st, pitch-only): {audio_fm.shape[0]} -> {gs_fm.shape[0]} frames (ratio {gs_dur_ratio:.3f})")

# global_shift: BPM shift changes duration
gs_bpm_path = global_shift(TEST_WAV, src_bpm=120.0, tgt_bpm=96.0, out_dir=shifted_dir)
gs_bpm_fm, _, _ = load(gs_bpm_path)
expected_ratio = 120.0 / 96.0  # slower -> longer
actual_ratio = gs_bpm_fm.shape[0] / audio_fm.shape[0]
assert abs(actual_ratio - expected_ratio) < 0.05, \
    f"BPM shift ratio {actual_ratio:.3f} != expected {expected_ratio:.3f}"
ok(f"global_shift(120->96bpm): ratio {actual_ratio:.3f} (expected {expected_ratio:.3f})")


# ---------------------------------------------------------------- effects
section("5/8  effects")
from remixkit import effects

audio_fc_short = audio_fc[:, :sr * 2]  # 2-second clip for speed

rms = lambda a: float(np.sqrt(np.mean(a ** 2)))

def assert_changes(name, original, processed, tol=0.001):
    d = abs(rms(original) - rms(processed))
    assert d > tol or processed.shape != original.shape, \
        f"{name}: audio unchanged (RMS delta={d:.6f})"
    ok(f"{name} -> RMS {rms(original):.4f} -> {rms(processed):.4f}")

assert_changes("eq(hpf=200)",   audio_fc_short, effects.eq(audio_fc_short, sr, hpf=200))
assert_changes("compress",      audio_fc_short, effects.compress(audio_fc_short, sr))
assert_changes("saturate",      audio_fc_short, effects.saturate(audio_fc_short, sr))
assert_changes("soft_clip",     audio_fc_short, effects.soft_clip(audio_fc_short, sr, threshold_db=-20.0))
assert_changes("reverb",        audio_fc_short, effects.reverb(audio_fc_short, sr))
assert_changes("delay",         audio_fc_short, effects.delay(audio_fc_short, sr))
assert_changes("chorus",        audio_fc_short, effects.chorus(audio_fc_short, sr))

g = effects.gain(audio_fc_short, db=6.0)
assert abs(rms(g) / rms(audio_fc_short) - 2.0) < 0.05
ok(f"gain(+6dB) -> ratio {rms(g)/rms(audio_fc_short):.3f} (expected ~2.0)")

muted = effects.mute(audio_fc_short)
assert np.all(muted == 0)
ok("mute -> all zeros")

soloed = effects.solo({"a": audio_fc_short, "b": audio_fc_short.copy()}, keep="a")
assert np.all(soloed["b"] == 0) and np.any(soloed["a"] != 0)
ok("solo(keep='a') -> b is zeros, a unchanged")

# limiter reduces hot signal to ~0 dBFS
hot_sig = np.ones((2, sr), dtype=np.float32) * 2.0
limited = effects.limiter(hot_sig, sr, threshold_db=-1.0)
assert np.max(np.abs(limited)) <= 1.02, \
    f"limiter: peak {np.max(np.abs(limited)):.4f} > 1.0"
assert np.max(np.abs(limited)) < 2.0, "limiter: signal unchanged"
ok(f"limiter(-1dB) -> peak {np.max(np.abs(limited)):.4f} (reduced from 2.0)")


# ---------------------------------------------------------------- layer
section("6/8  layer")
from remixkit.layer import tile_to_length, layer, replace_stem

loop = np.random.randn(2, 500).astype(np.float32)
tiled = tile_to_length(loop, 3)
assert tiled.shape == (2, 1500)
ok(f"tile_to_length(3) -> {tiled.shape}")

base = np.random.randn(2, 1000).astype(np.float32)
addition = np.random.randn(2, 800).astype(np.float32)
result = layer(base, addition, gain_db=-6)
assert result.shape == base.shape
ok(f"layer -> shape {result.shape}, peak {np.max(np.abs(result)):.3f}")

stems_d = {"drums": base, "bass": addition}
replaced = replace_stem(stems_d, "drums", tiled[:, :1000])
assert replaced["drums"].shape == (2, 1000) and "bass" in replaced
ok("replace_stem -> drums swapped, bass intact")


# ---------------------------------------------------------------- presets
section("7/8  presets")
from remixkit.presets import load_preset, list_presets, apply_preset
from remixkit.io_bounce import load as _load, to_chanmajor as _cm

names = list_presets()
assert len(names) >= 3, f"expected >=3 presets, got {names}"
ok(f"list_presets -> {names}")

vocal_fm, vsr, _ = _load(stems["vocals"])
bass_fm, bsr, _ = _load(stems["bass"])
other_fm, osr, _ = _load(stems["other"])
vocal_fc = _cm(vocal_fm)
bass_fc = _cm(bass_fm)
other_fc = _cm(other_fm)

for preset_name, audio_fc_p, stem_sr in [
    ("intimate_rnb_vocal", vocal_fc, vsr),
    ("trapsoul_sub_bass",  bass_fc,  bsr),
    ("lofi_sample_texture", other_fc, osr),
]:
    preset = load_preset(preset_name)
    result = apply_preset(audio_fc_p[:, :stem_sr * 5], stem_sr, preset)
    assert result.shape[0] == audio_fc_p.shape[0], f"{preset_name}: channel count changed"
    ok(f"{preset_name} -> applied, out shape {result.shape}")


# ---------------------------------------------------------------- audition
section("8/8  audition")
from remixkit.audition import preview

sig = inspect.signature(preview)
assert "start_sec" in sig.parameters, "preview missing start_sec param"
assert "duration" in sig.parameters, "preview missing duration param"
ok("preview importable, signature has start_sec + duration params")
ok("(audio playback not forced in smoke run — do a manual listen check)")


# ---------------------------------------------------------------- summary
section("ALL DONE")
print(f"  output files in {OUT}")
print(f"  stems cached in {os.path.join(ROOT, 'stems_cache')}")
print()
print("  Next: drop a real track in input/ and run a recipe.")
