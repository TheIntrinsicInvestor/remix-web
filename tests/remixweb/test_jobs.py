import time
from remixweb import jobs
from remixweb.pipeline import JobParams

def _params():
    return JobParams(source_type="upload", source_ref="x", model="htdemucs",
                     outputs=["full_mix"], transpose_semitones=0, transpose_targets=[])

def test_job_runs_to_done():
    def runner(job):
        job.stage = "separating"
        job.result_files = ["a.wav"]
    jid = jobs.submit(_params(), runner)
    for _ in range(50):
        if jobs.get(jid).status == "done":
            break
        time.sleep(0.05)
    j = jobs.get(jid)
    assert j.status == "done" and j.result_files == ["a.wav"]

def test_error_is_captured():
    def runner(job):
        raise RuntimeError("boom")
    jid = jobs.submit(_params(), runner)
    for _ in range(50):
        if jobs.get(jid).status == "error":
            break
        time.sleep(0.05)
    assert "boom" in jobs.get(jid).error

def test_single_job_at_a_time():
    order = []
    def slow(job):
        order.append(("start", job.id)); time.sleep(0.3); order.append(("end", job.id))
    a = jobs.submit(_params(), slow)
    b = jobs.submit(_params(), slow)
    for _ in range(100):
        if jobs.get(b).status == "done":
            break
        time.sleep(0.05)
    # b must not start until a ends
    starts = [x for x in order if x[0] == "start"]
    ends = [x for x in order if x[0] == "end"]
    assert order.index(("start", b)) > order.index(("end", a))
