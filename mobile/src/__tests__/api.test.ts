jest.mock('expo-secure-store', () => {
  const store: Record<string, string> = {};
  return {
    getItemAsync: jest.fn(async (k: string) => store[k] ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => { store[k] = v; }),
    deleteItemAsync: jest.fn(async (k: string) => { delete store[k]; }),
  };
});

import { DISCOVERY_URL, resolveBase, checkKey, storeKey, loadKey, clearKey, fileUrl, clearKeyCache, clearBaseCache } from '../api';

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

beforeEach(() => { mockFetch.mockReset(); clearBaseCache(); });

test('resolveBase fetches from the discovery endpoint and caches it', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ api_base: 'https://example.trycloudflare.com' }) });
  expect(await resolveBase()).toBe('https://example.trycloudflare.com');
  expect(mockFetch).toHaveBeenCalledWith(DISCOVERY_URL);
  // second call is cached — no second fetch
  expect(await resolveBase()).toBe('https://example.trycloudflare.com');
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

test('resolveBase throws if the discovery endpoint is unreachable or empty', async () => {
  mockFetch.mockResolvedValueOnce({ ok: false });
  await expect(resolveBase()).rejects.toThrow();
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ api_base: '' }) });
  await expect(resolveBase()).rejects.toThrow();
});

test('checkKey: 401 is false, 200 is true, 500 throws', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ api_base: 'https://example.trycloudflare.com' }) });
  await resolveBase();
  mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
  expect(await checkKey('x')).toBe(false);
  mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
  expect(await checkKey('x')).toBe(true);
  mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
  await expect(checkKey('x')).rejects.toThrow('unreachable');
});

test('key round-trips through secure store and lands in fileUrl (using the resolved base)', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ api_base: 'https://example.trycloudflare.com' }) });
  await resolveBase();
  await storeKey('s3cret key');
  await clearKeyCache();
  expect(await loadKey()).toBe('s3cret key');
  expect(fileUrl('j1', 'a b.wav')).toBe('https://example.trycloudflare.com/jobs/j1/files/a%20b.wav?key=s3cret%20key');
  await clearKey();
});

test('fileUrl asks for the m4a preview without changing the filename', async () => {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ api_base: 'https://example.trycloudflare.com' }) });
  await resolveBase();
  await storeKey('k');
  // The name stays the WAV one — the backend swaps the extension — so the
  // label parsing that reads result_files keeps working.
  expect(fileUrl('j1', 'song_mix.wav', 'm4a'))
    .toBe('https://example.trycloudflare.com/jobs/j1/files/song_mix.wav?key=k&format=m4a');
  expect(fileUrl('j1', 'song_mix.wav', 'wav'))
    .toBe('https://example.trycloudflare.com/jobs/j1/files/song_mix.wav?key=k');
  await clearKey();
});
