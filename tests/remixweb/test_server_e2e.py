import shutil
import time
from pathlib import Path
from tests.remixweb.conftest import AUTH

CLIP = Path(__file__).parent / "assets" / "clip.wav"

def test_upload_job_end_to_end(client):
    files = {"file": ("clip.wav", CLIP.read_bytes(), "audio/wav")}
    data = {"source_type": "upload", "model": "htdemucs",
            "outputs": "full_mix,instrumental", "transpose_semitones": "0",
            "transpose_targets": ""}
    r = client.post("/jobs", data=data, files=files, headers=AUTH)
    assert r.status_code == 200
    jid = r.json()["job_id"]

    for _ in range(600):  # up to ~60s
        s = client.get(f"/jobs/{jid}", headers=AUTH).json()
        if s["status"] in ("done", "error"):
            break
        time.sleep(0.1)
    assert s["status"] == "done", s
    assert s["result_files"], "no outputs"

    name = s["result_files"][0]
    assert name.endswith(".wav"), "result_files must stay WAV names (label parsing reads them)"
    d = client.get(f"/jobs/{jid}/files/{name}", headers=AUTH)
    assert d.status_code == 200 and len(d.content) > 1000

    # The app plays ?format=m4a. It must serve something for the same WAV name,
    # falling back to the WAV itself when ffmpeg produced no preview.
    p = client.get(f"/jobs/{jid}/files/{name}", params={"format": "m4a"}, headers=AUTH)
    assert p.status_code == 200 and len(p.content) > 1000
    if shutil.which("ffmpeg"):
        assert p.headers["content-type"] == "audio/mp4"
        assert len(p.content) < len(d.content), "AAC preview should be smaller than the WAV"

def test_jobs_requires_auth(client):
    r = client.post("/jobs", data={"source_type": "upload"})
    assert r.status_code == 401

def test_jobs_rejects_empty_outputs(client):
    files = {"file": ("clip.wav", CLIP.read_bytes(), "audio/wav")}
    data = {"source_type": "upload", "outputs": "", "transpose_semitones": "0", "transpose_targets": ""}
    r = client.post("/jobs", data=data, files=files, headers=AUTH)
    assert r.status_code == 400

def test_jobs_rejects_unsupported_model(client):
    files = {"file": ("clip.wav", CLIP.read_bytes(), "audio/wav")}
    data = {"source_type": "upload", "model": "htdemucs_6s",
            "outputs": "full_mix", "transpose_semitones": "0", "transpose_targets": ""}
    r = client.post("/jobs", data=data, files=files, headers=AUTH)
    assert r.status_code == 400
