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
// Suba a versão do shell ao mexer em player.html/js/css: o cache novo nasce
// vazio, então a TV baixa tudo de novo em vez de servir a versão velha.
const SHELL_CACHE = 'mt-shell-v9';
const MEDIA_CACHE = 'mt-media-v1';

// Shell do player: pré-cacheado no install para a TV subir mesmo se a rede já
// estiver fora na primeira recarga.
//
// Esta lista tem que casar com os <script> do player.html. Quando não casa, o
// arquivo que falta some só na queda de rede — o pior lugar para descobrir.
// (js/cor.js estava de fora desde que nasceu; sem rede, o player ficava sem a
// conta de cor inteira.)
const SHELL_ASSETS = [
  '/player.html', '/css/player.css', '/js/vendor/gsap.min.js',
  '/css/animacao.css', '/js/perf.js', '/js/cor.js', '/js/fontes.js', '/js/peca.js', '/js/animacao.js', '/js/datas-br.js',
  '/js/templates.js', '/js/theme.js', '/js/seasons.js', '/js/adaptive.js',
  '/js/storage.js', '/js/news.js', '/js/render.js', '/js/cloud.js', '/js/player.js',
  '/js/boot.js',
  // Instalável: sem o manifesto e o ícone no cache, uma TV que reiniciasse
  // sem rede abriria como página comum, sem a identidade do app instalado.
  '/player.webmanifest', '/icons/icone-192.png', '/icons/icone-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});
// Ativação: descarta shells de versões antigas e assume as abas abertas.
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keep = [SHELL_CACHE, MEDIA_CACHE];
  const names = await caches.keys();
  await Promise.all(names.filter((n) => n.startsWith('mt-') && !keep.includes(n)).map((n) => caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: deixa passar
  if (url.pathname.startsWith('/api/')) return;     // API/SSE: rede
  /*
   * O painel tem o worker DELE (/app/sw.js). Este aqui não encosta.
   *
   * O escopo deste registro é "/", então ele enxerga as requisições de
   * qualquer aba do mesmo navegador — inclusive as do painel, enquanto o
   * worker de lá ainda não assumiu. Sem esta linha, os pacotes do painel iam
   * parar no cache do player, que existe para caber a mídia de uma TV.
   */
  if (url.pathname.startsWith('/app/')) return;
  if (url.pathname.startsWith('/media/')) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE));
    return;
  }
  // Navegação (player.html?cloud=1): ignora a query ao casar com o cache.
  if (req.mode === 'navigate') {
    /*
     * SÓ a navegação do player, e o teste é o caminho — não "é uma
     * navegação qualquer".
     *
     * A versão anterior gravava a resposta de QUALQUER navegação sob a chave
     * '/player.html'. Como o escopo deste worker é "/", bastava abrir a
     * landing ou o painel numa aba do mesmo navegador para o HTML deles virar
     * o casco salvo do player. O estrago só aparecia depois, na queda de rede:
     * a TV subia mostrando a página de login em vez do conteúdo da parede — e
     * não havia nada na TV que explicasse por quê.
     */
    if (url.pathname !== '/player.html') return;
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
