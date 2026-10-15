import shutil
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # project root
from remixkit import (separate, load, save, to_chanmajor, to_framemajor,
                      bounce, pitch_shift, detect_key, detect_bpm, name_output)

@dataclass
class JobParams:
    source_type: str
    source_ref: str
    model: str = "htdemucs"
    outputs: list = field(default_factory=list)
    transpose_semitones: int = 0
    transpose_targets: list = field(default_factory=list)

def _load_stems(stem_paths):
    stems, sr, sub = {}, None, "PCM_24"
    for name, p in stem_paths.items():
        fm, _sr, _sub = load(p)
        if sr is None:
            sr, sub = _sr, _sub
        stems[name] = to_chanmajor(fm)
    return stems, sr, sub

def write_preview(wav_path: Path) -> Path | None:
    """Encode a 256k AAC sibling next to a rendered WAV.

    The app streams these for playback: a 4-minute WAV is ~64 MB, the .m4a
    ~7.7 MB, which is what makes loading several stems at once practical.
    WAV stays the download format. Best-effort — if ffmpeg is missing or
    fails, the job still succeeds and playback falls back to the WAV.
    """
    if not shutil.which("ffmpeg"):
        return None
    preview = wav_path.with_suffix(".m4a")
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
             "-c:a", "aac", "-b:a", "256k", str(preview)],
            check=True, capture_output=True,
        )
    except (subprocess.CalledProcessError, OSError):
        return None
    return preview if preview.exists() else None

def build_outputs(wav_path, params: JobParams, out_dir, on_stage=lambda s: None):
    out_dir = Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    on_stage("separating")
    stem_paths = separate(wav_path, model_name=params.model)
    stems, sr, sub = _load_stems(stem_paths)

    on_stage("rendering")
    key = detect_key(wav_path)
    bpm = detect_bpm(wav_path)
    song = Path(wav_path).parent.name or "song"

    # Assemble requested outputs as {kind: channel-major audio}
    assembled = {}
    if "full_mix" in params.outputs:
        assembled["full_mix"] = bounce(stems, sr)
    if "instrumental" in params.outputs:
        no_vox = {k: v for k, v in stems.items() if k != "vocals"}
        assembled["instrumental"] = bounce(no_vox, sr)
    if "acapella" in params.outputs and "vocals" in stems:
        assembled["acapella"] = stems["vocals"]
    if "stems" in params.outputs:
        for name, audio in stems.items():
            assembled[f"stem_{name}"] = audio

    written = []
    n = params.transpose_semitones
    for kind, audio_cm in assembled.items():
        is_stem = kind.startswith("stem_")
        base_kind = "stems" if is_stem else kind
        # kind slot per the naming convention: "mix" or a stem name.
        if is_stem:
            tag, out_kind = "stems", kind[len("stem_"):]
        elif kind == "acapella":
            tag, out_kind = "acapella", "vocals"
        elif kind == "full_mix":
            tag, out_kind = "full", "mix"
        else:
            tag, out_kind = kind, "mix"
        if n != 0 and base_kind in params.transpose_targets:
            audio_cm = pitch_shift(audio_cm, sr, n)
            tag = f"{tag}_shift{n:+d}"
        path = out_dir / name_output(song, key, bpm, tag, out_kind)
        save(to_framemajor(audio_cm), sr, str(path), sub)
        write_preview(path)
        written.append(path)
    on_stage("done")
    return written
