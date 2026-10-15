import threading, queue, time, uuid, re
from dataclasses import dataclass, field

# yt-dlp colorizes its errors when stderr is a TTY (local dev), so the raw text
# reaches the console as escape codes.
_ANSI = re.compile(r"\x1b\[[0-9;]*m")

def strip_ansi(text: str) -> str:
    return _ANSI.sub("", text)

@dataclass
class Job:
    id: str
    params: object
    status: str = "queued"
    stage: str = "queued"
    result_files: list = field(default_factory=list)
    error: str | None = None
    created_at: float = field(default_factory=time.time)

_jobs: dict[str, Job] = {}
_queue: "queue.Queue[tuple[str, object]]" = queue.Queue()
_worker_started = False
_lock = threading.Lock()

def get(job_id: str) -> Job | None:
    return _jobs.get(job_id)

def _run_forever():
    while True:
        job_id, runner = _queue.get()
        job = _jobs[job_id]
        job.status = "running"
        try:
            runner(job)
            job.status = "done"
            job.stage = "done"
        except Exception as e:  # capture and continue to next job
            job.status = "error"
            job.error = strip_ansi(str(e))
        finally:
            _queue.task_done()

def start_worker(_runner=None):
    global _worker_started
    with _lock:
        if not _worker_started:
            threading.Thread(target=_run_forever, daemon=True).start()
            _worker_started = True

def submit(params, runner) -> str:
    start_worker()
    job_id = uuid.uuid4().hex[:12]
    _jobs[job_id] = Job(id=job_id, params=params)
    _queue.put((job_id, runner))
    return job_id
