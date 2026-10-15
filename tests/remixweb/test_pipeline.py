from pathlib import Path
import soundfile as sf
from remixweb.pipeline import JobParams, build_outputs

CLIP = str(Path(__file__).parent / "assets" / "clip.wav")

def test_builds_instrumental_and_transposed_full_mix(tmp_path):
    params = JobParams(source_type="upload", source_ref=CLIP,
                       model="htdemucs", outputs=["instrumental", "full_mix"],
                       transpose_semitones=-2, transpose_targets=["full_mix"])
    files = build_outputs(CLIP, params, tmp_path)
    names = [f.name for f in files]
    # Exact {tag}_{kind} convention — parsed by labelFor() in web/app/studio/page.tsx.
    assert any(n.endswith("_instrumental_mix.wav") for n in names)
    assert any(n.endswith("_full_shift-2_mix.wav") for n in names)
    assert not any(n.endswith("_wav.wav") for n in names)
    for f in files:
        assert Path(f).exists() and sf.info(str(f)).frames > 0

def test_stem_and_acapella_filenames(tmp_path):
    params = JobParams(source_type="upload", source_ref=CLIP,
                       model="htdemucs", outputs=["stems", "acapella"])
    files = build_outputs(CLIP, params, tmp_path)
    names = {f.name for f in files}
    for stem in ("vocals", "drums", "bass", "other"):
        assert any(n.endswith(f"_stems_{stem}.wav") for n in names)
    assert any(n.endswith("_acapella_vocals.wav") for n in names)
