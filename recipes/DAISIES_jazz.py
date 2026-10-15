import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # repo root
from remixkit import *

# PARAMS
song_path = r"input/Justin Bieber - DAISIES (Audio).wav"
src_bpm = 110.3
tgt_bpm = 85.0
semitones = -1

print("Separating/fetching stems...")
# 1. Fetch stems from cache
stems_paths = separate(song_path, model_name="htdemucs_6s")

print("Loading stems...")
# 2. Load
stems = {}
sr, sub = None, "PCM_24"
for name, path in stems_paths.items():
    audio_fm, _sr, _sub = load(path)
    if sr is None:
        sr, sub = _sr, _sub
    stems[name] = to_chanmajor(audio_fm)

print("Processing stems...")
# 3. Processing
# Mute unwanted stems
stems["drums"] = mute(stems["drums"])
stems["other"] = mute(stems["other"])
stems["guitar"] = mute(stems["guitar"])

# Keep Vocals, Piano, and Bass
for name in ["vocals", "piano", "bass"]:
    # Pitch and time shift
    stems[name] = target_bpm(stems[name], sr, src_bpm, tgt_bpm)
    stems[name] = pitch_shift(stems[name], sr, semitones)

# Apply effects
print("Applying presets and effects...")
stems["vocals"] = apply_preset(stems["vocals"], sr, "intimate_rnb_vocal")
stems["bass"] = apply_preset(stems["bass"], sr, "trapsoul_sub_bass")
stems["piano"] = reverb(stems["piano"], sr, room_size=0.6, wet_level=0.25)

print("Bouncing mix...")
# 4. Bounce
mix = bounce(stems, sr, limit_db=-1.0)
fname = name_output("DAISIES", "G_major", int(tgt_bpm), "jazz", "mix")
out_path = os.path.join("output", fname)
save(to_framemajor(mix), sr, out_path, sub)

print(f"Done! Saved to {out_path}")
