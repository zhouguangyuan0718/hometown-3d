// CacheStorage is separate from the browser's short-lived HTTP cache.
// A content hash identifies the model; cached bytes are checked before use.
export async function loadModelBytes({ url, sha256, byteLength, onStatus = () => {} }) {
  const started = performance.now();
  const modelURL = new URL(url, location.href);
  modelURL.searchParams.set('v', sha256);
  const cacheName = `hometown-3d-models-v1:${new URL('./', modelURL).pathname}`;
  let cache;
  try { cache = await caches.open(cacheName); } catch { /* Storage may be disabled or full. */ }

  async function valid(data) {
    if (data.byteLength !== byteLength || data.byteLength < 20) return false;
    const header = new DataView(data);
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== data.byteLength) return false;
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') === sha256;
  }

  if (cache) {
    try {
      const saved = await cache.match(modelURL.href);
      if (saved) {
        onStatus({ phase: 'cached' });
        const data = await saved.arrayBuffer();
        if (await valid(data)) return { data, source: 'local-cache', readMs: performance.now() - started, cacheWrite: Promise.resolve(true) };
        await cache.delete(modelURL.href);
      }
    } catch { /* A failed cache read must not prevent a network fallback. */ }
  }

  onStatus({ phase: 'download', loaded: 0, total: byteLength });
  const response = await fetch(modelURL.href);
  if (!response.ok) throw new Error(`Model download returned HTTP ${response.status}`);
  let data;
  if (response.body) {
    const reader = response.body.getReader();
    const buffer = new Uint8Array(byteLength);
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (loaded + value.byteLength > byteLength) { await reader.cancel(); throw new Error('Unexpected model size'); }
      buffer.set(value, loaded); loaded += value.byteLength;
      onStatus({ phase: 'download', loaded, total: byteLength });
    }
    data = loaded === byteLength ? buffer.buffer : buffer.slice(0, loaded).buffer;
  } else {
    data = await response.arrayBuffer();
  }
  if (!await valid(data)) throw new Error('Model integrity check failed');

  // Write in parallel with model parsing. Cache failure never blocks viewing.
  const cacheWrite = (async () => {
    if (!cache) return false;
    try {
      await cache.put(modelURL.href, new Response(data, { headers: { 'Content-Type': 'model/gltf-binary' } }));
      // Only remove older versions of this model, after the new version is saved.
      for (const key of await cache.keys()) {
        const oldURL = new URL(key.url);
        if (oldURL.origin === modelURL.origin && oldURL.pathname === modelURL.pathname && oldURL.href !== modelURL.href) await cache.delete(key);
      }
      return true;
    } catch { return false; }
  })();
  return { data, source: 'network', readMs: performance.now() - started, cacheWrite };
}
