import subprocess, shutil, json
from pathlib import Path
import soundfile as sf
from remixweb import config

class InputError(Exception):
    pass

def probe_duration_wav(path: str) -> float:
    info = sf.info(path)
    return info.frames / float(info.samplerate)

def ffprobe_duration(path: str) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", path],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise InputError("Could not read media metadata.")
    return float(json.loads(out.stdout)["format"]["duration"])

def _to_wav(src: Path, dest: Path) -> Path:
    if src.suffix.lower() == ".wav":
        return src
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-ac", "2", "-ar", "44100", str(dest)],
        capture_output=True, check=True,
    )
    return dest

def from_upload(data: bytes, filename: str, dest_dir: Path) -> Path:
    if len(data) > config.MAX_UPLOAD_BYTES:
        raise InputError("File is larger than 60 MB.")
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    raw = dest_dir / f"upload{Path(filename).suffix.lower() or '.bin'}"
    raw.write_bytes(data)
    wav = _to_wav(raw, dest_dir / "input.wav")
    dur = probe_duration_wav(str(wav))
    if dur > config.MAX_DURATION_SEC:
        raise InputError(f"Song is {dur/60:.1f} min; the limit is 8 min.")
    return wav

def _ydl_opts_base():
    opts = {"quiet": True, "no_warnings": True, "noplaylist": True,
            "js_runtimes": {"node": {}}}  # yt-dlp needs node on the server
    if config.COOKIES_FILE.exists():
        opts["cookiefile"] = str(config.COOKIES_FILE)
    return opts

def youtube_metadata(url: str) -> dict:
    import yt_dlp
    try:
        with yt_dlp.YoutubeDL(_ydl_opts_base()) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        raise InputError(f"Could not read that YouTube link: {e}")
    return {
        "title": info.get("title", ""),
        "channel": info.get("uploader", info.get("channel", "")),
        "duration_sec": int(info.get("duration") or 0),
        "thumbnail": info.get("thumbnail", ""),
        "webpage_url": info.get("webpage_url", url),
    }

def _youtube_download(url: str, dest_dir: Path):
    import yt_dlp
    opts = _ydl_opts_base() | {
        "format": "bestaudio/best",
        "outtmpl": str(Path(dest_dir) / "input.%(ext)s"),
        "postprocessors": [{"key": "FFmpegExtractAudio",
                            "preferredcodec": "wav", "preferredquality": "0"}],
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])

def from_youtube(url: str, dest_dir: Path) -> Path:
    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    meta = youtube_metadata(url)
    dur = meta["duration_sec"]
    if dur and dur > config.MAX_DURATION_SEC:
        raise InputError(f"Video is {dur/60:.1f} min; the limit is 8 min.")
    _youtube_download(url, dest_dir)
    wav = dest_dir / "input.wav"
    if not wav.exists():
        raise InputError("Download failed to produce audio.")
    return wav

def _spotify_oembed_title(url: str) -> str:
    import httpx
    try:
        r = httpx.get("https://open.spotify.com/oembed",
                      params={"url": url}, timeout=10)
        r.raise_for_status()
        title = r.json().get("title", "").strip()
    except Exception as e:
        raise InputError(f"Could not read that Spotify link: {e}")
    if not title:
        raise InputError("Spotify link had no title; paste a YouTube link instead.")
    return title

def youtube_search(query: str) -> dict:
    import yt_dlp
    opts = _ydl_opts_base() | {"default_search": "ytsearch1"}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch1:{query}", download=False)
    entries = info.get("entries") or []
    if not entries:
        raise InputError(f"No YouTube result for '{query}'.")
    e = entries[0]
    return {
        "title": e.get("title", ""),
        "channel": e.get("uploader", e.get("channel", "")),
        "duration_sec": int(e.get("duration") or 0),
        "thumbnail": e.get("thumbnail", ""),
        "webpage_url": e.get("webpage_url", ""),
    }

def resolve_spotify(url: str) -> dict:
    query = _spotify_oembed_title(url)
    candidate = youtube_search(query)
    return {"query": query, "candidate": candidate}
