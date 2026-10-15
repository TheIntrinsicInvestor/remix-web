const BASE = process.env.NEXT_PUBLIC_API_BASE || "";
let KEY = "";
export function setKey(k: string) { KEY = k; if (typeof window !== "undefined") sessionStorage.setItem("rk", k); }
export function getKey() { if (!KEY && typeof window !== "undefined") KEY = sessionStorage.getItem("rk") || ""; return KEY; }

function headers(json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Bearer ${getKey()}` };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

// Validates a candidate key against the backend before it is stored, so a wrong
// password fails at the gate instead of at the first real request.
export async function checkKey(candidate: string) {
  let r: Response;
  try {
    r = await fetch(`${BASE}/auth-check`, { headers: { Authorization: `Bearer ${candidate}` } });
  } catch (e) {
    // A header value outside ISO-8859-1 (e.g. an iOS curly apostrophe) makes fetch
    // throw before any request is sent: that's a bad password, not a dead server.
    const sendable = [...candidate].every(c => c.codePointAt(0)! <= 0xff);
    if (e instanceof TypeError && !sendable) return false;
    throw e;
  }
  if (r.status === 401) return false;
  if (!r.ok) throw new Error("unreachable");
  return true;
}

export async function resolveSpotify(spotify_url: string) {
  const r = await fetch(`${BASE}/resolve-spotify`, { method: "POST", headers: headers(true), body: JSON.stringify({ spotify_url }) });
  if (!r.ok) throw new Error((await r.json()).detail || "resolve failed");
  return r.json();
}

export async function youtubeMetadata(youtube_url: string) {
  const r = await fetch(`${BASE}/youtube-metadata`, { method: "POST", headers: headers(true), body: JSON.stringify({ youtube_url }) });
  if (!r.ok) throw new Error((await r.json()).detail || "lookup failed");
  return r.json() as Promise<{ title: string; channel: string; duration_sec: number; thumbnail: string; webpage_url: string }>;
}

export async function createJob(form: FormData) {
  const r = await fetch(`${BASE}/jobs`, { method: "POST", headers: headers(false), body: form });
  if (!r.ok) throw new Error((await r.json()).detail || "job failed");
  return r.json() as Promise<{ job_id: string }>;
}

export async function getJob(id: string) {
  const r = await fetch(`${BASE}/jobs/${id}`, { headers: headers(false) });
  if (r.status === 401) throw new Error("Wrong password");
  if (!r.ok) throw new Error("status failed");
  return r.json() as Promise<{ status: string; stage: string; result_files: string[]; error: string | null }>;
}

export async function downloadFile(id: string, name: string) {
  const r = await fetch(`${BASE}/jobs/${id}/files/${encodeURIComponent(name)}`, { headers: headers(false) });
  if (!r.ok) throw new Error("download failed");
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function previewFileUrl(id: string, name: string): string {
  return `${BASE}/jobs/${id}/files/${encodeURIComponent(name)}?key=${encodeURIComponent(getKey())}`;
}
