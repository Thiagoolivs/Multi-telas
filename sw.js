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
const SHELL_CACHE = 'mt-shell-v93';
const MEDIA_CACHE = 'mt-media-v1';

/*
 * A LIMPEZA DA MÍDIA. O cache da mídia guardava toda foto e vídeo que a TV
 * já mostrou e nunca apagava: a conta que troca o vídeo toda semana enchia o
 * armazenamento de um box de 8 GB em meses (docs/CAPACIDADE-E-TVBOX.md §6.2,
 * item 5). Agora o player conta ao worker, a cada programação aplicada, o que
 * está nela (js/player.js, precacheMedia), e o worker, no máximo a cada 6 h:
 *   - apaga o que não está na programação e não foi visto há 14 dias;
 *   - passando do teto (1 GB, ou metade da cota do navegador se ela for
 *     menor), apaga também o mais antigo que não está na programação, até
 *     caber — mas nunca o visto nas últimas 24 h (a tela que acabou de sair
 *     da programação ainda pode estar no ar, na transição).
 * O que está na programação NUNCA sai, nem acima do teto: é ele que toca
 * sem rede. "Visto" é estar na programação ou ser servido daqui (a foto do
 * aniversariante e a do mural não vêm na programação).
 * A lista do que existe e de quando foi visto mora numa entrada do próprio
 * cache da mídia (INDICE_DA_MIDIA), que o worker nunca serve.
 */
const MIDIA_IDADE_MS = 14 * 24 * 60 * 60 * 1000;
const MIDIA_RECENTE_MS = 24 * 60 * 60 * 1000;
const MIDIA_TETO_BYTES = 1024 * 1024 * 1024;
const MIDIA_ENTRE_LIMPEZAS_MS = 6 * 60 * 60 * 1000;
const INDICE_DA_MIDIA = '/__mt/indice-da-midia.json';

// Shell do player: pré-cacheado no install para a TV subir mesmo se a rede já
// estiver fora na primeira recarga.
//
// Esta lista tem que casar com os <script> do player.html. Quando não casa, o
// arquivo que falta some só na queda de rede — o pior lugar para descobrir.
// (js/cor.js estava de fora desde que nasceu; sem rede, o player ficava sem a
// conta de cor inteira.)
const SHELL_ASSETS = [
  '/player.html', '/css/player.css', '/css/animacao.css', '/js/compat.js', '/js/perf.js',
  /*
   * Os scripts do corpo do player.html chegam num pacote só
   * (server/pacote-tv.js): o player.html SERVIDO carrega este arquivo, e é ele
   * que precisa estar aqui. O teste confere que todo script do corpo está
   * dentro do pacote e que todo arquivo que a página servida pede está aqui.
   */
  '/js/tv.pacote.js',
  // Instalável: sem o manifesto e o ícone no cache, uma TV que reiniciasse
  // sem rede abriria como página comum, sem a identidade do app instalado.
  '/player.webmanifest', '/icons/icone-192.png', '/icons/icone-512.png',
  /*
   * A folha das fontes entra no shell; os .woff2 NÃO.
   *
   * A folha é indispensável e barata (~45 KB): sem as declarações @font-face,
   * uma TV que suba sem rede desenha tudo na fonte de sistema — que é mais
   * larga que Anton ou Oswald e estoura o texto que o compositor mediu. Já os
   * arquivos das 14 famílias somam 1,5 MB, e nenhuma tela usa mais que duas.
   * Eles entram no cache sozinhos, na primeira vez que aparecem na peça.
   */
  '/fonts/fontes.css',
  /*
   * A letra da marca (Outfit) da tela de pareamento e do aviso de navegador
   * antigo: 3 arquivos de ~14 KB. Sem eles, a TV que sobe sem rede mostra o
   * código na letra do sistema — fora da marca justamente no primeiro
   * contato (QA de lançamento, 03/11).
   */
  '/fonts/marca/outfit-400-normal-latin.woff2', '/fonts/marca/outfit-600-normal-latin.woff2', '/fonts/marca/outfit-700-normal-latin.woff2',
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
  /*
   * A bancada e os arquivos das peças-ouro também não. Servidos daqui, com
   * "o guardado primeiro", o dono via a peça de UMA edição atrás — e
   * aprovaria na bancada uma versão que já não existe (visto ao montar o
   * lote 1). A TV não busca esses arquivos: a peça chega dentro da config.
   * As FOTOS das peças vão para a TV, e essas continuam no cache.
   */
  if (url.pathname === '/bancada.html' || url.pathname === '/js/bancada.js' || url.pathname === '/js/peca-conferir.js'
    || url.pathname === '/js/regras-composicao.js'
    || url.pathname === '/experimento.html' || url.pathname === '/js/experimento.js'
    || /^\/pecas-ouro\/[^/]+\.(html|json)$/.test(url.pathname)
    // O índice do banco de fotos dos espaços de imagem muda quando entra foto nova: não é foto, não fica guardado.
    || url.pathname === '/pecas-ouro/fotos/banco.json') return;
  // O mesmo para o índice do banco de vídeos da FOTO VIVA.
  if (url.pathname === '/pecas-ouro/videos/banco.json') return;
  /*
   * FOTO VIVA: os vídeos curtos do banco (pecas-ouro/videos/, até ~4 MB
   * cada) e os do cliente (/media/, até 30 MB antes de comprimir) entram no
   * mesmo cache das fotos, com o poster ao lado — offline, a TV toca o que já
   * guardou e mostra o poster do resto.
   */
  if (url.pathname.startsWith('/media/') || url.pathname.startsWith('/pecas-ouro/fotos/') || url.pathname.startsWith('/pecas-ouro/videos/')) {
    event.respondWith(cacheFirst(req, MEDIA_CACHE));
    return;
  }
  /*
   * Arquivo de fonte é imutável: o nome carrega peso, estilo e alfabeto, e
   * conteúdo novo vira nome novo (tools/baixar-fontes.mjs). Cache primeiro,
   * sem revalidar — a TV não gasta rede perguntando por algo que não muda.
   * A Outfit da marca (fonts/marca/) segue a mesma regra de nome.
   */
  if (url.pathname.startsWith('/fonts/arquivos/') || url.pathname.startsWith('/fonts/marca/')) {
    event.respondWith(cacheFirst(req, SHELL_CACHE));
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
    /*
     * `/tv` é o endereço que se digita na TV e o que o app Android abre ao
     * ligar. O servidor só redireciona para o player; sem rede, esse
     * redirecionamento não existia e a TV mostrava a página de erro do
     * navegador — no boot depois de uma queda de energia, quando o box sobe
     * antes do roteador. Aqui o redirecionamento acontece mesmo sem rede, e o
     * player sobe do cache com a última programação.
     */
    if (url.pathname === '/tv' || url.pathname === '/tv/') {
      // Erro 5xx conta como "sem servidor": durante um deploy o Railway
      // responde 502 por alguns segundos, e a TV que recarregasse nessa hora
      // ficaria na página de erro dele em vez da programação guardada.
      const paraOPlayer = () => Response.redirect('/player.html?cloud=1', 302);
      event.respondWith(fetch(req).then((res) => (res && res.status >= 500 ? paraOPlayer() : res)).catch(paraOPlayer));
      return;
    }
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
    // Servidor de pé mas com erro (deploy, 502): a cópia guardada é melhor
    // que a página de erro na parede do cliente.
    if (res && res.status >= 500) {
      const guardado = (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/player.html'));
      if (guardado) return guardado;
    }
    return res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true })) || (await cache.match('/player.html')) || Response.error();
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (cacheName === MEDIA_CACHE) visto(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return hit || Response.error();
  }
}

/* ---------------- A limpeza da mídia ---------------- */

// O que foi servido do cache da mídia desde a última limpeza (memória; vai para o índice na próxima).
const vistosAgora = new Map();
function visto(req) {
  try { vistosAgora.set(new URL(req.url).pathname, Date.now()); } catch (e) { /* endereço estranho: ignora */ }
}

/*
 * A decisão, pura (o teste chama direto). `itens`: [{ chave, caminho, visto,
 * bytes }]; `emUso`: os caminhos da programação. Devolve as chaves a apagar.
 */
function planejarLimpezaDaMidia(itens, emUso, agora, teto) {
  const apagar = new Set();
  let total = 0;
  for (const it of itens) total += it.bytes || 0;
  const podeSair = itens.filter((it) => !emUso.has(it.caminho) && agora - it.visto >= MIDIA_RECENTE_MS);
  for (const it of podeSair) {
    if (agora - it.visto >= MIDIA_IDADE_MS) { apagar.add(it.chave); total -= it.bytes || 0; }
  }
  // Acima do teto: o mais antigo primeiro, até caber.
  const pelaIdade = podeSair.filter((it) => !apagar.has(it.chave)).sort((a, b) => a.visto - b.visto);
  for (const it of pelaIdade) {
    if (total <= teto) break;
    apagar.add(it.chave);
    total -= it.bytes || 0;
  }
  return [...apagar];
}

async function tamanhoDe(res) {
  if (!res) return 0;
  const n = Number(res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-length') : 0);
  if (n > 0) return n;
  try { return (await res.blob()).size || 0; } catch (e) { return 0; }
}

async function tetoDaMidia() {
  try {
    const e = self.navigator && self.navigator.storage && self.navigator.storage.estimate ? await self.navigator.storage.estimate() : null;
    if (e && e.quota > 0) return Math.min(MIDIA_TETO_BYTES, e.quota / 2);
  } catch (e) { /* sem a conta da cota: o teto fixo */ }
  return MIDIA_TETO_BYTES;
}

async function limparMidia(urls, agora) {
  const t = agora || Date.now();
  const cache = await caches.open(MEDIA_CACHE);
  let indice = null;
  try { const r = await cache.match(INDICE_DA_MIDIA); indice = r ? await r.json() : null; } catch (e) { indice = null; }
  if (!indice || typeof indice !== 'object' || typeof indice.itens !== 'object' || !indice.itens) indice = { feitaEm: 0, itens: {} };
  const emUso = new Set();
  for (const u of urls) {
    try { emUso.add(new URL(u, self.location.origin).pathname); } catch (e) { /* ignora */ }
  }
  const vistos = new Map(vistosAgora);
  vistosAgora.clear();
  const marcar = (it, caminho) => {
    if (emUso.has(caminho)) it.visto = t;
    const v = vistos.get(caminho);
    if (v && v > it.visto) it.visto = v;
  };
  const limpar = t - (Number(indice.feitaEm) || 0) >= MIDIA_ENTRE_LIMPEZAS_MS;
  if (!limpar) {
    // Fora da hora da limpeza: só anota o que foi visto.
    for (const chave of Object.keys(indice.itens)) marcar(indice.itens[chave], indice.itens[chave].caminho);
  } else {
    // A lista de verdade é a do cache: o índice só guarda quando cada coisa foi vista e quanto pesa.
    const itens = [];
    const novo = {};
    for (const req of await cache.keys()) {
      let caminho;
      try { caminho = new URL(req.url).pathname; } catch (e) { continue; }
      if (caminho === INDICE_DA_MIDIA) continue;
      // O que já estava guardado antes do índice começa a contar agora (14 dias de folga).
      const it = indice.itens[req.url] || { caminho, visto: t, bytes: await tamanhoDe(await cache.match(req)) };
      it.caminho = caminho;
      marcar(it, caminho);
      novo[req.url] = it;
      itens.push({ chave: req.url, caminho, visto: it.visto, bytes: it.bytes, req });
    }
    const apagar = new Set(planejarLimpezaDaMidia(itens, emUso, t, await tetoDaMidia()));
    for (const it of itens) {
      if (!apagar.has(it.chave)) continue;
      await cache.delete(it.req);
      delete novo[it.chave];
    }
    indice = { feitaEm: t, itens: novo };
  }
  await cache.put(INDICE_DA_MIDIA, new Response(JSON.stringify(indice), { headers: { 'content-type': 'application/json' } }));
}

// Uma limpeza de cada vez: duas programações seguidas não limpam juntas.
let limpezaNaFila = Promise.resolve();
self.addEventListener('message', (e) => {
  const d = e && e.data;
  if (!d || d.tipo !== 'mt:midia-em-uso' || !Array.isArray(d.urls)) return;
  const urls = d.urls.filter((u) => typeof u === 'string').slice(0, 5000);
  limpezaNaFila = limpezaNaFila.then(() => limparMidia(urls)).catch(() => { /* a limpeza falhou: tenta na próxima */ });
  if (e.waitUntil) e.waitUntil(limpezaNaFila);
});

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  const fetching = fetch(req)
    .then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => hit);
  return hit || fetching;
}
