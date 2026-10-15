import hmac
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Query, Request
from remixweb import config

# Failed-attempt limiter: 10 failures per window per client IP. Successes don't
# count. The backend only listens on 127.0.0.1 behind cloudflared and tailscale
# funnel, which both append the real client IP to X-Forwarded-For. Earlier
# entries are client-supplied and spoofable, so only the last one is trusted.
_FAILS: dict[str, deque] = defaultdict(deque)
_WINDOW_SEC = 900
_MAX_FAILS = 10

def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"

def require_auth(request: Request,
                 authorization: str = Header(default=""),
                 key: str = Query(default="")):
    ip = _client_ip(request)
    q = _FAILS[ip]
    now = time.monotonic()
    while q and now - q[0] > _WINDOW_SEC:
        q.popleft()
    if len(q) >= _MAX_FAILS:
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    expected = f"Bearer {config.ACCESS_KEY}"
    if authorization and hmac.compare_digest(authorization, expected):
        return True
    if key and hmac.compare_digest(key, config.ACCESS_KEY):
        return True
    q.append(now)
    raise HTTPException(status_code=401, detail="Unauthorized")
