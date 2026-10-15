# PRD — Remix Covers Toolkit

A personal, single-user Python toolkit for restyling the backing tracks of songs I cover.
Driven conversationally through Claude — no GUI, no packaged app.

---

## 1. Overview & goal

I sing covers and want to restyle the **backing track** of a song before I sing over it
(e.g. turn a 2000s pop track into laid-back neo-soul R&B). This project is a library of
composable, well-documented Python functions plus a `CLAUDE.md` so that, in a later
session, I can prompt Claude with natural language — "drop this 2 semitones," "mute the
drums and lay in this neo-soul loop," "make the Rhodes lo-fi" — and it reliably calls the
right functions.

**The approach is to keep the original arrangement and restyle it** via stem editing,
effects, pitch/tempo changes, and layering in *my own* samples — **not** to regenerate
music with AI.

**Success criteria:** From a single source file I can, in one conversational session,
produce a re-keyed, restyled backing WAV (and/or processed stems) that I can sing over,
without touching a GUI and without re-separating stems each time I tweak an effect.

---

## 2. Who it's for & how I'll use it

- **User:** just me (single-user, personal project).
- **Interface:** conversational, in-session. I describe the target sound in plain language;
  Claude maps it to function calls. There is no UI to learn and nothing to package.
- **Use:** I sing covers over the output, for personal practice and possible publishing.
- **Constraint that shapes everything:** stem separation is the one slow step, so the
  workflow is **separate once → cache the stems → iterate on effects fast**.

---

## 3. Core capabilities / functions

| Capability | What it does | Library |
|---|---|---|
| **Separate** | Split source into stems and cache them. `htdemucs` 4-stem (vocals/drums/bass/other) by default; `htdemucs_6s` only when I need guitar/piano isolated. | Demucs |
| **Analyze** | Detect source **key + BPM** before I decide how much to shift. | librosa |
| **Re-key** | Pitch shift by semitones, independent of tempo. | pyrubberband |
| **Re-time** | Time-stretch (BPM / half-time feel), independent of pitch. | pyrubberband |
| **Per-stem effects** | EQ/filters, compression/dynamics, drive/saturation, reverb/delay/modulation. Can host free VST3 plugins. | pedalboard |
| **Stem control** | Mute / solo / filter individual stems (e.g. low-pass the original drums to ghost notes, or mute them entirely). | numpy / pedalboard |
| **Sample-layering** | Load my own drum loops / 808 / one-shots, time-stretch them to the detected BPM, and layer them in. No synthesis, no AI — I curate the sample folder. | soundfile / pyrubberband |
| **Synth sub-bass** *(stretch goal)* | Generate a sine/808-style sub that follows the detected bassline pitch. Least reliable on CPU; build last. | numpy / librosa |
| **Style presets** | Reusable, editable effect/layer recipes (e.g. "Intimate R&B Vocal"), grounded in the reference analysis. | config files |
| **Bounce / export** | Sum processed stems into a finished backing WAV, and/or dump the individual processed stems on request. | soundfile |
| **Batch** *(later, not v1)* | Apply one recipe across many songs. Functions are designed so this is easy to add. | — |

---

## 4. Target sounds / genre intentions

Genres I restyle into (mood-dependent): **R&B / neo-soul, pop / acoustic, lo-fi / chill,
ballad / cinematic.** The primary target is R&B / neo-soul.

These intentions are grounded in a per-stem analysis (via Gemini, which can listen to
audio) of five original→cover pairs. The recurring, reproducible moves below are the basis
for the preset library.

### Recurring per-stem moves → presets

- **Vocals — "close-mic intimacy":** HPF ~100Hz · +2dB ~250Hz (chest warmth) ·
  de-ess / cut harsh ~7kHz · fast 1176-style compression (≈4:1, 5–7dB GR) ·
  short ~1.2s plate reverb (~15%) + subtle 1/8 slap delay (~5%) · optional modern retune.
- **Drums — "lo-fi replacement":** mute the original kit, layer a swung neo-soul/trap loop ·
  tape saturation on kick · low-passed hats · boxy/dry snare or rimshot.
- **Bass — "sub / Reese foundation":** swap live bass for an 808/sub · soft-clip (~20%) for
  small-speaker translation · LPF ~120Hz.
- **Other — "tape warp" bed:** LPF + wow/flutter modulation + cassette saturation to turn
  guitars/strings into a sampled lo-fi texture; Rhodes/pads layered on top.
- **Global feel:** pitch down ~1–3 semitones (or up to shift register) · slow tempo ~8–19% ·
  half-time feel for sultrier grooves.

### Concrete starter presets (from the analysis)

- **"Intimate R&B Vocal":** EQ HPF 100Hz / +2dB 250Hz / −3dB 7kHz · fast comp 4:1, 5–7dB GR ·
  1.2s plate @15% + 1/8 slap @5% · medium retune speed.
- **"Trap-Soul Sub Bass":** sine/808 source · soft-clip/overdrive @20% · LPF 120Hz.
- **"Lo-Fi Sample Texture"** (apply to Demucs `other` stem): telephone EQ (HPF 300Hz / LPF
  4kHz) · vibrato/chorus ~0.5Hz for tape wow/flutter · cassette saturation.

### Song-specific moves (NOT general presets)

- Long shimmer/ambient reverb (3–4s) for a dark cinematic feel — a one-off, not a default.
- **3/4 → 4/4 re-gridding** — structural editing, done manually in Cakewalk (see Non-goals).

---

## 5. Architecture & project layout

A flat function library plus a few data folders. No classes-for-the-sake-of-it; functions
are composable and each does one thing.

```
Remix Covers/
├── CLAUDE.md            # project context so Claude can drive functions conversationally
├── PRD.md               # this document
├── remixkit/            # the function library
│   ├── separate.py      # Demucs wrapper + stem caching
│   ├── analyze.py       # key + BPM detection
│   ├── pitch_time.py    # pitch shift / time-stretch (independent)
│   ├── effects.py       # EQ, comp, drive, reverb/delay/mod; mute/solo/filter
│   ├── layer.py         # load + tempo-match + layer my samples; (stretch) synth sub
│   ├── presets.py       # load/apply editable preset recipes
│   └── io_bounce.py     # load source, sum stems, export WAV, naming
├── stems_cache/         # cached stems per song (separate once, iterate fast)
│   └── {song}/
├── presets/             # editable preset config files (one per style)
├── samples/             # my curated drum loops / 808s / one-shots
└── output/              # rendered backing mixes and/or processed stems
```

- **Stems cache:** keyed by source file; if stems exist, skip the slow Demucs step.
- **Presets:** human-readable, editable config files I can tweak and Claude can extend.

---

## 6. Tech stack & constraints

- **Free / open-source only.**
- **Windows, CPU-only** (Intel Iris Xe, no CUDA). Everything must run without a GPU.
- **Separation:** Demucs (`htdemucs` default, `htdemucs_6s` for guitar/piano). This is the
  one slow step — always cache its output. We drive it via the lower-level
  `demucs.pretrained.get_model` + `demucs.apply.apply_model` (loading audio ourselves with
  soundfile and passing a tensor), **not** the CLI/`torchaudio.load` — the installed
  `torchaudio` routes loading through `torchcodec`, which isn't reliable on Windows.
- **Effects:** Spotify `pedalboard` (can also host free VST3 plugins). Arrays are
  channel-major `(channels, samples)`.
- **Pitch/tempo:** `python-stretch` (Signalsmith Stretch bindings) for independent pitch
  shift + time-stretch — pip wheel, no external binary, permissive license. Fallbacks:
  the Rubber Band CLI via `pyrubberband` (download v4.0.0 Windows exe, rename
  `rubberband-r3.exe` → `rubberband.exe` into the env `Scripts\`), or `librosa`
  (phase vocoder, low quality) as a last resort.
- **Analysis / IO:** `librosa`, `numpy`, `soundfile`; `ffmpeg` (conda-forge) in the env.
- **Environment:** dedicated conda env `remix` (Python 3.11),
  defined in `environment.yml`. Validated end-to-end by `spike/` on 2026-06-15.
- All audio processing runs **locally in Python**, so it does not consume Claude usage.

---

## 7. Workflow

1. **Separate once** → cache stems in `stems_cache/{song}/` (4-stem, or 6-stem if I need
   guitar/piano). Re-runs reuse the cache.
2. **Analyze** → detect key + BPM; report them so I can decide shifts.
3. **Re-key / re-time** → pitch shift and/or time-stretch as needed (independent).
4. **Restyle conversationally** → per-stem effects, mute/filter, layer my samples,
   apply presets — iterating quickly on the cached stems.
5. **Bounce** → sum to a finished backing WAV, and/or export the processed stems.

The expensive step (1) happens once per song; steps 2–5 are fast and repeatable.

---

## 8. Outputs & formats

- **Format:** Cakewalk-friendly **WAV**, **matching the source file's sample rate / bit
  depth** where practical. (Note: Demucs operates at 44.1kHz, so resample on export when the
  source differs.)
- **What gets written:** by default a bounced backing mix; on request, also the individual
  processed stems.
- **Naming convention:**
  `{song}_{key}_{bpm}_{preset-or-tag}_{mix|stemname}.wav`
  e.g. `qilixiang_Am_85_neosoul_mix.wav`, `qilixiang_Am_85_neosoul_drums.wav`.

---

## 9. Licensing & publishing notes

- The **tools** (Demucs, pedalboard, python-stretch, librosa, etc.) are MIT/OSS — free to use.
- **Using the tools does not grant rights to the source music.** To publish a cover I still
  need the appropriate rights/clearances (e.g. mechanical/sync licenses); karaoke or
  "official instrumental" sources carry their own terms.
- **Personal practice** is lower-risk; **publishing** requires clearing the underlying song.
- Toolkit output ≠ permission to publish. Track which sources are cleared before releasing.

---

## 10. Non-goals / out of scope

- **No GUI and no packaged app.** Conversational, in-session use only.
- **No AI re-generation of music.** Restyle existing stems + layer *my own* samples; no
  generative model writing new parts.
- **No GPU / CUDA dependency.** CPU-only by design.
- **No batch runner in v1.** Functions are written so batch is easy to add later.
- **No automatic time-signature re-gridding** (e.g. 3/4 → 4/4). That's structural editing —
  done manually in Cakewalk if needed.

---

## 11. Open questions / future ideas

- **Synth sub-bass reliability** on CPU — how accurate is pitch-tracking the bassline before
  it's worth shipping beyond a stretch goal?
- **Retune / auto-tune:** is there a good free Python option, or leave modern retune to a
  free VST3 / Cakewalk?
- **Batch runner + recipe files** for applying one style across many songs.
- **Loudness normalization** option on bounce (e.g. target LUFS) for consistent practice
  levels.
- **Royalty-free drum-loop sources** to seed the `samples/` library for the neo-soul/trap
  presets.
- **Preset refinement loop:** re-run the Gemini per-stem analysis on new references over time
  and fold the results back into `presets/`.
