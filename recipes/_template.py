r"""
[Song name] -- [description]
Recipe: [brief description of the transformation].

Edit the PARAMS block, then: python  (inside the `remix` conda env) recipes\_template.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root
from remixkit import *

# ─── PARAMS ──────────────────────────────────────────────────────────────────
SRC         = r"input/your_song.wav"
SRC_BPM     = 120.0   # detected or known original BPM
TGT_BPM     = 100.0   # target BPM; set None to skip tempo shift
VOCAL_PITCH = 0       # semitones (0 = no shift)
BASS_PITCH  = 0
OTHER_PITCH = 0
LIMIT_DB    = None    # e.g. -1.0 for master limiter; None = peak-normalize to 0.9
OUTPUT_TAG  = "v1"   # appears in output filename as: Song_Key_bpm_TAG_mix.wav
# ─────────────────────────────────────────────────────────────────────────────

print("=== Separating stems ===")
# Default is htdemucs_6s (6-stem). Add model_name="htdemucs" for faster 4-stem.
stems_paths = separate(SRC)
key = detect_key(SRC)
bpm = detect_bpm(SRC)
print(f"Key: {key}  BPM: {bpm}")

print("\n=== Loading all stems ===")
stems = {}
sr, sub = None, "PCM_24"
for name, path in stems_paths.items():
    audio_fm, _sr, _sub = load(path)
    if sr is None:
        sr, sub = _sr, _sub
    stems[name] = to_chanmajor(audio_fm)
print(f"sr={sr}  stems={list(stems)}")

# ─── Tempo shift (all stems together) ────────────────────────────────────────
if TGT_BPM is not None:
    print(f"\n=== Tempo shift {SRC_BPM} -> {TGT_BPM} BPM ===")
    stems = {n: target_bpm(a, sr, SRC_BPM, TGT_BPM) for n, a in stems.items()}

# ─── Per-stem processing ──────────────────────────────────────────────────────
# Stems not listed here pass through clean into the bounce.

print("\n=== Processing vocals ===")
if VOCAL_PITCH:
    stems["vocals"] = pitch_shift(stems["vocals"], sr, VOCAL_PITCH)
stems["vocals"] = apply_preset(stems["vocals"], sr, "intimate_rnb_vocal")

print("\n=== Processing bass ===")
if BASS_PITCH:
    stems["bass"] = pitch_shift(stems["bass"], sr, BASS_PITCH)
stems["bass"] = apply_preset(stems["bass"], sr, "trapsoul_sub_bass")

print("\n=== Processing other ===")
if OTHER_PITCH:
    stems["other"] = pitch_shift(stems["other"], sr, OTHER_PITCH)
stems["other"] = apply_preset(stems["other"], sr, "lofi_sample_texture")

# drums: uncomment to add processing, or leave as clean pass-through
# stems["drums"] = compress(stems["drums"], sr, threshold_db=-18, ratio=5, attack_ms=5, release_ms=300)

# guitar / piano (6s only): add processing or leave as clean pass-through
# if "guitar" in stems: stems["guitar"] = ...
# if "piano"  in stems: stems["piano"]  = ...

# ─── Bounce + save ───────────────────────────────────────────────────────────
print("\n=== Bouncing mix ===")
mix_cm = bounce(stems, sr, limit_db=LIMIT_DB)
fname = name_output("SongName", key, TGT_BPM or bpm, OUTPUT_TAG, "mix")
save(to_framemajor(mix_cm), sr, f"output/{fname}", sub)
print(f"\nSaved: output/{fname}")
# preview(mix_cm, sr, start_sec=60, duration=10)  # uncomment to audition
