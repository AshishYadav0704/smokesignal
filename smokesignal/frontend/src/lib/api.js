// Where the forecast comes from:
// 1. VITE_API_URL set  -> the deployed AWS API (GET /latest)
// 2. otherwise         -> /local-latest.json (made by `npm run local` in backend/ with real data)
// 3. otherwise         -> /mock-latest.json (synthetic, shows a banner)
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export async function loadLatest() {
  if (API_URL) {
    const res = await fetch(`${API_URL}/latest`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || `The forecast service returned ${res.status}.`);
    return body;
  }
  for (const path of ['/local-latest.json', '/mock-latest.json']) {
    try {
      const res = await fetch(path);
      if (res.ok && (res.headers.get('content-type') || '').includes('json')) return await res.json();
    } catch {
      // try the next source
    }
  }
  throw new Error('No forecast found. Set VITE_API_URL or run the backend locally.');
}

export async function subscribe(email, city) {
  const res = await fetch(`${API_URL}/subscribe`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, city }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Could not subscribe. Try again.');
  return body;
}
