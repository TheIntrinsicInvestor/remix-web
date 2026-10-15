import shutil, time
from pathlib import Path
from remixweb import config

def purge_old(root, max_age_hours: float, now: float | None = None):
    root = Path(root)
    now = now if now is not None else time.time()
    cutoff = now - max_age_hours * 3600
    deleted = []
    if not root.exists():
        return deleted
    for child in root.iterdir():
        if child.is_dir() and child.stat().st_mtime < cutoff:
            shutil.rmtree(child, ignore_errors=True)
            deleted.append(child.name)
    return deleted

def main():
    root = config.WORK_DIR / "jobs"
    print("deleted:", purge_old(root, config.RETENTION_HOURS))

if __name__ == "__main__":
    main()
