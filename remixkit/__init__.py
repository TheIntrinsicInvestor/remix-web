"""remixkit — conversational backing-track restyler."""

from remixkit.io_bounce import load, save, bounce, to_chanmajor, to_framemajor, name_output
from remixkit.separate import separate
from remixkit.analyze import detect_bpm, detect_key
from remixkit.pitch_time import pitch_shift, time_stretch, target_bpm, global_shift
from remixkit.effects import (
    eq, compress, limiter, saturate, soft_clip,
    reverb, delay, chorus,
    apply_chain, mute, solo, gain, lowpass_to,
)
from remixkit.layer import load_sample, match_bpm, tile_to_length, layer, replace_stem
from remixkit.presets import load_preset, list_presets, apply_preset
from remixkit.audition import preview
