import os
from pathlib import Path

ACCESS_KEY = os.environ.get("REMIX_ACCESS_KEY", "dev-key")
PORT = int(os.environ.get("REMIXWEB_PORT", "8080"))
ALLOWED_ORIGIN = os.environ.get("REMIX_ALLOWED_ORIGIN", "*")
WORK_DIR = Path(os.environ.get("REMIXWEB_WORK", str(Path.home() / "remixweb-data"))).expanduser()
MAX_DURATION_SEC = 480          # 8 minutes
MAX_UPLOAD_BYTES = 60 * 1024 * 1024
RETENTION_HOURS = 24
COOKIES_FILE = WORK_DIR / "cookies.txt"  # optional; used if present (yt-dlp bot-check workaround)

WORK_DIR.mkdir(parents=True, exist_ok=True)
