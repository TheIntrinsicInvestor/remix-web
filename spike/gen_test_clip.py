"""Generate a tiny synthetic stereo 'song' so the spike can prove the pipeline
runs end-to-end. Uses only numpy + the stdlib wave module so it can run in the
base interpreter while the remix env finishes installing.

Output: spike/test_assets/test_mix.wav  (44.1kHz, 16-bit, stereo)
The clip is a crude mix of a bassline, a sustained chord, and noise-burst
'drums' on the beat -- enough material for Demucs to split into stems.
"""
import os
import wave
import numpy as np

SR = 44100
DUR = 6.0
N = int(SR * DUR)
t = np.arange(N) / SR

# --- bassline: a few low notes ---
bass = np.zeros(N)
bass_freqs = [55.0, 55.0, 73.42, 65.41]  # A1, A1, D2, C2
seg = N // len(bass_freqs)
for i, f in enumerate(bass_freqs):
    s = i * seg
    e = (i + 1) * seg if i < len(bass_freqs) - 1 else N
    bass[s:e] = 0.30 * np.sin(2 * np.pi * f * t[s:e])

# --- chord: sustained C-major triad (the 'other' content) ---
chord = sum(0.12 * np.sin(2 * np.pi * f * t) for f in (261.63, 329.63, 392.00))

# --- drums: short decaying noise bursts on each beat ---
drums = np.zeros(N)
bpm = 100
beat_samples = int((60.0 / bpm) * SR)
rng = np.random.default_rng(0)
for b in range(int(DUR / (60.0 / bpm))):
    start = b * beat_samples
    L = min(int(0.05 * SR), N - start)
    if L <= 0:
        continue
    env = np.exp(-np.linspace(0, 8, L))
    drums[start:start + L] += rng.standard_normal(L) * env * 0.4

mix = bass + chord + drums
mix = mix / np.max(np.abs(mix)) * 0.9
stereo = np.stack([mix, mix], axis=1)  # mono content duplicated to stereo

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_assets")
os.makedirs(out_dir, exist_ok=True)
out_path = os.path.join(out_dir, "test_mix.wav")

data = (stereo * 32767).astype("<i2")
with wave.open(out_path, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(data.tobytes())

print(f"wrote {out_path}  shape={stereo.shape}  sr={SR}")
