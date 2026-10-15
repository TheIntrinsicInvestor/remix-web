from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from remixweb import config
from remixweb.auth import require_auth

app = FastAPI(title="Remix Web")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[config.ALLOWED_ORIGIN] if config.ALLOWED_ORIGIN != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/auth-check")
def auth_check(_=Depends(require_auth)):
    return {"status": "ok"}

from fastapi import UploadFile, File, Form
from fastapi.responses import FileResponse
from pydantic import BaseModel
from pathlib import Path
from remixweb import inputs, jobs
from remixweb.pipeline import JobParams
from remixweb.runner import make_runner

_JOB_ROOT = config.WORK_DIR / "jobs"
_JOB_ROOT.mkdir(parents=True, exist_ok=True)
_runner = make_runner(_JOB_ROOT)

class SpotifyReq(BaseModel):
    spotify_url: str

@app.post("/resolve-spotify")
def resolve_spotify(req: SpotifyReq, _=Depends(require_auth)):
    try:
        return inputs.resolve_spotify(req.spotify_url)
    except inputs.InputError as e:
        raise HTTPException(status_code=400, detail=str(e))

class YoutubeMetaReq(BaseModel):
    youtube_url: str

@app.post("/youtube-metadata")
def youtube_metadata_route(req: YoutubeMetaReq, _=Depends(require_auth)):
    try:
        return inputs.youtube_metadata(req.youtube_url)
    except inputs.InputError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/jobs")
async def create_job(
    source_type: str = Form(...),
    model: str = Form("htdemucs"),
    outputs: str = Form(""),
    transpose_semitones: int = Form(0),
    transpose_targets: str = Form(""),
    source_ref: str = Form(""),
    file: UploadFile | None = File(None),
    _=Depends(require_auth),
):
    out_list = [x for x in outputs.split(",") if x]
    tgt_list = [x for x in transpose_targets.split(",") if x]
    if not out_list:
        raise HTTPException(status_code=400, detail="No outputs requested.")
    if model != "htdemucs":
        raise HTTPException(status_code=400, detail="Unsupported model.")
    params = JobParams(source_type=source_type, source_ref=source_ref, model=model,
                       outputs=out_list, transpose_semitones=transpose_semitones,
                       transpose_targets=tgt_list)
    if source_type == "upload":
        if file is None:
            raise HTTPException(status_code=400, detail="No file uploaded.")
        data = await file.read()
        stage_dir = _JOB_ROOT / "_staging"
        try:
            wav = inputs.from_upload(data, file.filename or "upload.bin", stage_dir)
        except inputs.InputError as e:
            raise HTTPException(status_code=400, detail=str(e))
        params.source_ref = str(wav)
    job_id = jobs.submit(params, _runner)
    return {"job_id": job_id}

@app.get("/jobs/{job_id}")
def get_job(job_id: str, _=Depends(require_auth)):
    j = jobs.get(job_id)
    if not j:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": j.id, "status": j.status, "stage": j.stage,
            "result_files": j.result_files, "error": j.error}

@app.get("/jobs/{job_id}/files/{name}")
def download(job_id: str, name: str, format: str = "wav", _=Depends(require_auth)):
    safe = Path(name).name  # prevent path traversal
    path = _JOB_ROOT / job_id / "out" / safe
    # ?format=m4a serves the small AAC preview the app plays. `name` stays the
    # WAV filename either way, so result_files (and the label parsing that
    # reads it) is unchanged. Falls back to the WAV if no preview was encoded.
    if format == "m4a":
        preview = path.with_suffix(".m4a")
        if preview.exists():
            return FileResponse(str(preview), filename=preview.name, media_type="audio/mp4")
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(path), filename=safe, media_type="audio/wav")
