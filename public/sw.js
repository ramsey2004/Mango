/* Mango service worker — cache the shell so the app opens offline.
   User data never touches this cache; it lives in IndexedDB. */
const CACHE = 'mango-shell-v3';

const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

/**
 * The build emits hashed filenames, so the asset list cannot be hard-coded.
 * Read index.html instead and take the scripts and stylesheets it references.
 * Without this the entry chunks are only cached if they happen to be
 * re-requested after the worker takes control — which, on a first visit,
 * they are not, and the app then fails to open offline.
 */
/** Reads the build's asset list, falling back to scanning index.html. */
async function assetList() {
  const urls = new Set(SHELL);
  try {
    const res = await fetch('./assets.json', { cache: 'reload' });
    if (res.ok) {
      const { assets } = await res.json();
      for (const a of assets) urls.add(a);
    }
  } catch {
    /* fall through to the html scan */
  }
  try {
    const html = await (await fetch('./index.html', { cache: 'reload' })).text();
    for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const u = m[1];
      if (/^https?:|^data:/.test(u)) continue;
      if (/\.(js|css)$/.test(u)) urls.add(u);
    }
  } catch {
    /* offline — the fetch handler fills the cache instead */
  }
  return [...urls];
}

/**
 * Brings the cache in line with whatever is deployed right now.
 *
 * Install only fires when sw.js itself changes, so without this a redeploy
 * leaves a returning user with the previous build's chunks cached and no
 * offline coverage for anything new — and the old chunks would sit there
 * forever. This runs after the first navigation of each worker lifetime.
 */
let syncing = null;
function syncAssets() {
  if (syncing) return syncing;
  syncing = (async () => {
    const list = await assetList();
    if (list.length <= SHELL.length) return; // could not read the manifest; leave the cache alone
    const cache = await caches.open(CACHE);
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map((u) => cache.add(u).catch(() => undefined)));
    }
    // Drop assets from previous deployments so the cache cannot grow forever.
    const wanted = new Set(list.map((u) => new URL(u, self.location.href).href));
    for (const req of await cache.keys()) {
      const isAsset = /\/assets\/.*\.(js|css)$/.test(req.url);
      if (isAsset && !wanted.has(req.url)) await cache.delete(req);
    }
  })().catch(() => undefined);
  return syncing;
}

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL).catch(() => undefined);
  // Batched rather than all at once: a hundred parallel requests on a phone is
  // its own problem, and this runs in the background where latency does not show.
  const list = await assetList();
  for (let i = 0; i < list.length; i += 6) {
    await Promise.all(list.slice(i, i + 6).map((u) => cache.add(u).catch(() => undefined)));
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fonts and any configured endpoint go straight to the network

  // Navigation: network first, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          // A successful navigation means the network is there and we know what
          // is deployed; bring the cache in line with it in the background.
          event.waitUntil(syncAssets());
          return res;
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  // Static assets: cache first, and fill the cache on the way past.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
