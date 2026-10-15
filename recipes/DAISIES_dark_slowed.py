r"""
DAISIES (Justin Bieber) -- dark slowed remix
Recipe: slow to 100 BPM, drop everything 3-4 semitones, heavy reverb/delay on vocals.

Run: python  (inside the `remix` conda env) recipes\DAISIES_dark_slowed.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root
from remixkit import *

# ─── PARAMS ──────────────────────────────────────────────────────────────────
SRC         = r"input/Justin Bieber - DAISIES (Audio).wav"
SRC_BPM     = 110.0
TGT_BPM     = 100.0
VOCAL_PITCH = -4     # semitones
BASS_PITCH  = -3
OTHER_PITCH = -4
LIMIT_DB    = None   # None = peak-normalize to 0.9
OUTPUT_TAG  = "dark_100"
# ─────────────────────────────────────────────────────────────────────────────

print("=== Separating stems ===")
stems_paths = separate(SRC)
key = detect_key(SRC)

print("\n=== Loading all stems ===")
stems = {}
sr, sub = None, "PCM_24"
for name, path in stems_paths.items():
    audio_fm, _sr, _sub = load(path)
    if sr is None:
        sr, sub = _sr, _sub
    stems[name] = to_chanmajor(audio_fm)
print(f"sr={sr}  stems={list(stems)}")

print(f"\n=== Tempo shift {SRC_BPM} -> {TGT_BPM} BPM ===")
stems = {n: target_bpm(a, sr, SRC_BPM, TGT_BPM) for n, a in stems.items()}

print("\n=== Processing vocals ===")
stems["vocals"] = pitch_shift(stems["vocals"], sr, VOCAL_PITCH)
stems["vocals"] = reverb(stems["vocals"], sr, room_size=0.8, wet_level=0.4, dry_level=0.6, damping=0.4, width=1.0)
stems["vocals"] = delay(stems["vocals"], sr, seconds=0.25, feedback=0.3, mix=0.15)
stems["vocals"] = compress(stems["vocals"], sr, threshold_db=-20, ratio=3, attack_ms=10, release_ms=200)

print("\n=== Processing bass ===")
stems["bass"] = pitch_shift(stems["bass"], sr, BASS_PITCH)
stems["bass"] = lowpass_to(stems["bass"], sr, 150)
stems["bass"] = gain(stems["bass"], db=2)

print("\n=== Processing other ===")
stems["other"] = pitch_shift(stems["other"], sr, OTHER_PITCH)
stems["other"] = eq(stems["other"], sr, hpf=80, bands=[[3000, -4, 1]])
stems["other"] = reverb(stems["other"], sr, room_size=0.75, wet_level=0.35, dry_level=0.65, damping=0.5, width=1.0)

print("\n=== Processing drums ===")
stems["drums"] = compress(stems["drums"], sr, threshold_db=-18, ratio=5, attack_ms=5, release_ms=300)
stems["drums"] = saturate(stems["drums"], sr, drive_db=3)

# guitar / piano pass through clean (6s only; no-ops if 4-stem model was used)

print("\n=== Bouncing mix ===")
mix_cm = bounce(stems, sr, limit_db=LIMIT_DB)
fname = name_output("DAISIES", key, TGT_BPM, OUTPUT_TAG, "mix")
save(to_framemajor(mix_cm), sr, f"output/{fname}", sub)
print(f"\nSaved: output/{fname}")
# preview(mix_cm, sr, start_sec=60, duration=10)  # uncomment to audition
