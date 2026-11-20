/* Decide Better service worker (hand-written, no build step).
 * - Precaches the app's pages and every /_next/static asset they reference.
 * - /_next/static (content-hashed): cache-first.
 * - Page navigations: network-first, falling back to the cached page, then to "/".
 * - Never touches /api (AI requests must always go to the network).
 * The page also posts the URLs it loaded so lazily-fetched chunks (the simulation
 * worker, fonts) are available offline after the first visit.
 */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `decide-better-${VERSION}`;
const PAGES = ['/', '/memo', '/compare', '/view'];
const ASSETS = ['/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

const sameOrigin = (url) => url.origin === self.location.origin;
const isStatic = (url) => url.pathname.startsWith('/_next/static/');

async function precache() {
  const cache = await caches.open(CACHE);
  const found = new Set(ASSETS);
  for (const page of PAGES) {
    try {
      const res = await fetch(page, { cache: 'no-store' });
      if (!res.ok) continue;
      const html = await res.clone().text();
      await cache.put(page, res);
      for (const m of html.matchAll(/["'(](\/_next\/static\/[^"'()\s]+)["')]/g)) found.add(m[1].replace(/&amp;/g, '&'));
    } catch {
      /* offline during install: cache what we can */
    }
  }
  await Promise.all([...found].map((u) => cache.add(u).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('decide-better-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'cache-urls' && Array.isArray(data.urls)) {
    event.waitUntil(
      caches.open(CACHE).then((cache) =>
        Promise.all(
          data.urls
            .map((u) => new URL(u, self.location.origin))
            .filter((u) => sameOrigin(u) && (isStatic(u) || ASSETS.includes(u.pathname)))
            .map((u) => cache.match(u.href).then((hit) => hit || cache.add(u.href).catch(() => undefined))),
        ),
      ),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!sameOrigin(url) || url.pathname.startsWith('/api/')) return;

  if (isStatic(url)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(req, { ignoreSearch: false });
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok && PAGES.includes(url.pathname)) cache.put(url.pathname, res.clone());
          return res;
        } catch {
          return (await cache.match(url.pathname)) || (await cache.match('/')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Other same-origin GETs (icons, manifest): stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || net;
    }),
  );
});
