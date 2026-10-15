from pathlib import Path
from remixweb import inputs
from remixweb.pipeline import build_outputs

def make_runner(job_dir_root: Path):
    def runner(job):
        job_dir = Path(job_dir_root) / job.id
        job_dir.mkdir(parents=True, exist_ok=True)
        p = job.params
        if p.source_type == "upload":
            wav = p.source_ref  # already staged to disk by the route; nothing to download
        elif p.source_type == "youtube":
            job.stage = "downloading"
            wav = str(inputs.from_youtube(p.source_ref, job_dir))
        elif p.source_type == "spotify_confirmed":
            job.stage = "downloading"
            wav = str(inputs.from_youtube(p.source_ref, job_dir))  # confirmed YT url
        else:
            raise ValueError(f"Unknown source_type {p.source_type}")
        out_dir = job_dir / "out"
        files = build_outputs(wav, p, out_dir, on_stage=lambda s: setattr(job, "stage", s))
        job.result_files = [f.name for f in files]
    return runner
