/*
 * sw.js — service worker do player (offline-first).
 *
 * Signage não pode apagar quando a rede cai. Estratégia:
 *   - /media/*  → cache-first (arquivos imutáveis: uma vez baixados, tocam
 *     offline para sempre).
 *   - shell (html/js/css) → stale-while-revalidate (abre na hora do cache e
 *     atualiza em segundo plano).
 *   - /api/*    → passa direto (rede). A config é cacheada pelo player em
 *     localStorage; o SSE precisa da rede viva.
 *
 * Registrado só pelo player.html (o painel/admin não precisa de offline).
 */
const SHELL_CACHE = 'mt-shell-v1';
const MEDIA_CACHE = 'mt-media-v1';

// Shell do player: pré-cacheado no install para a TV subir mesmo se a rede já
// estiver fora na primeira recarga.
const SHELL_ASSETS = [
  '/player.html', '/css/player.css', '/js/vendor/gsap.min.js',
  '/js/templates.js', '/js/theme.js', '/js/seasons.js', '/js/adaptive.js',
  '/js/storage.js', '/js/news.js', '/js/render.js', '/js/cloud.js', '/js/player.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: deixa passar
  if (url.pathname.startsWith('/api/')) return;     // API/SSE: rede
  if (url.pathname.startsWith('/media/')) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE));
    return;
  }
  // Navegação (player.html?cloud=1): ignora a query ao casar com o cache.
  if (req.mode === 'navigate') {
    event.respondWith(navigation(req));
    return;
  }
  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

async function navigation(req) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put('/player.html', res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/player.html')) || Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return hit || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetching = fetch(req)
    .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => hit);
  return hit || fetching;
}
