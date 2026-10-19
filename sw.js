// JopenBox Service Worker: haelt die App offline verfuegbar. Build: 2026-10-19 18:25:51
const SHELL_CACHE = 'jopenbox-shell';
const FONT_CACHE = 'jopenbox-fonts';
const SHELL = ['index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Figtree:wght@400;500;600&family=Instrument+Serif&display=swap';

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await c.addAll(SHELL);
    await self.skipWaiting();
    try { await warmFonts(); } catch (err) { /* offline oder blockiert: dann Ersatzschriften */ }
  })());
});

// Schriften einmal laden und ablegen, damit die App auch ohne Netz gleich aussieht.
async function warmFonts() {
  const fc = await caches.open(FONT_CACHE);
  const res = await fetch(FONT_CSS, { mode: 'cors' });
  if (!res.ok) return;
  const css = await res.clone().text();
  await fc.put(FONT_CSS, res);
  const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))];
  await Promise.all(urls.map(async u => { try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await fc.put(u, r); } catch (err) { /* egal */ } }));
}

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = [SHELL_CACHE, FONT_CACHE];
    for (const k of await caches.keys()) if (!keep.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req) {
  const c = await caches.open(SHELL_CACHE);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500))]);
    if (res && res.ok) c.put('index.html', res.clone());
    return res;
  } catch (err) {
    return (await c.match('index.html')) || Response.error();
  }
}
async function fontFirst(req) {
  const fc = await caches.open(FONT_CACHE);
  const hit = await fc.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) fc.put(req.url, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req)));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(fontFirst(req));
});
