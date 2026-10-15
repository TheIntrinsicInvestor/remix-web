// mobile/src/api.ts — mirrors web/lib/api.ts, with the key in the iOS Keychain.
// BASE is resolved at runtime (never hardcoded): the backend sits behind a
// rotating cloudflared tunnel, and baking its host into a compiled app would
// mean an EAS rebuild + App Store resubmit every rotation. The web domain is
// permanent, so the app asks it what the current backend host is instead.
import * as SecureStore from 'expo-secure-store';

export const DISCOVERY_URL = 'https://your-frontend.example.com/api/backend-url';

let BASE = '';
export async function resolveBase(): Promise<string> {
  if (BASE) return BASE;
  const r = await fetch(DISCOVERY_URL);
  if (!r.ok) throw new Error('Could not reach the discovery service.');
  const data = await r.json();
  if (!data.api_base) throw new Error('Discovery service returned no api_base.');
  BASE = data.api_base;
  return BASE;
}
export function clearBaseCache(): void { BASE = ''; }  // tests only

let KEY = '';
export async function loadKey(): Promise<string> {
  if (!KEY) KEY = (await SecureStore.getItemAsync('rk')) ?? '';
  return KEY;
}
export async function storeKey(k: string): Promise<void> { KEY = k; await SecureStore.setItemAsync('rk', k); }
export async function clearKey(): Promise<void> { KEY = ''; await SecureStore.deleteItemAsync('rk'); }
export function clearKeyCache(): void { KEY = ''; }  // tests only

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${KEY}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

export async function checkKey(candidate: string): Promise<boolean> {
  const r = await fetch(`${BASE}/auth-check`, { headers: { Authorization: `Bearer ${candidate}` } });
  if (r.status === 401) return false;
  if (!r.ok) throw new Error('unreachable');
  return true;
}

export type Meta = { title: string; channel: string; duration_sec: number; thumbnail: string; webpage_url: string };

export async function youtubeMetadata(youtube_url: string): Promise<Meta> {
  const r = await fetch(`${BASE}/youtube-metadata`, { method: 'POST', headers: headers(true), body: JSON.stringify({ youtube_url }) });
  if (!r.ok) throw new Error((await r.json()).detail || 'lookup failed');
  return r.json();
}

export async function resolveSpotify(spotify_url: string): Promise<{ query: string; candidate: Meta }> {
  const r = await fetch(`${BASE}/resolve-spotify`, { method: 'POST', headers: headers(true), body: JSON.stringify({ spotify_url }) });
  if (!r.ok) throw new Error((await r.json()).detail || 'resolve failed');
  return r.json();
}

export async function createJob(form: FormData): Promise<{ job_id: string }> {
  const r = await fetch(`${BASE}/jobs`, { method: 'POST', headers: headers(false), body: form });
  if (!r.ok) throw new Error((await r.json()).detail || 'job failed');
  return r.json();
}

export type JobState = { status: string; stage: string; result_files: string[]; error: string | null };

export async function getJob(id: string): Promise<JobState> {
  const r = await fetch(`${BASE}/jobs/${id}`, { headers: headers(false) });
  if (r.status === 401) throw new Error('Wrong password');
  if (!r.ok) throw new Error('status failed');
  return r.json();
}

// Streaming/download URL; ?key= because native players can't send headers.
// `name` is always the WAV filename; format=m4a asks for the small AAC
// preview (~8x smaller), which is what makes loading every stem for synced
// playback practical. Saving uses the default WAV.
export function fileUrl(id: string, name: string, format: 'wav' | 'm4a' = 'wav'): string {
  const fmt = format === 'm4a' ? '&format=m4a' : '';
  return `${BASE}/jobs/${id}/files/${encodeURIComponent(name)}?key=${encodeURIComponent(KEY)}${fmt}`;
}
