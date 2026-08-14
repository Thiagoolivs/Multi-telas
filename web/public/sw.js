/*
 * web/public/sw.js — service worker do PAINEL (/app).
 *
 * Não confundir com /sw.js, que é o do player: aquele guarda mídia para a TV
 * continuar tocando dias sem rede. Este aqui tem um trabalho diferente e bem
 * mais modesto.
 *
 * ---- A regra que decide tudo ----
 *
 *     O CASCO ABRE DO CACHE. O CONTEÚDO, NUNCA.
 *
 * Quer dizer: HTML, JavaScript, CSS e fontes podem sair do cache, porque são
 * a mesma coisa hoje e amanhã. Já `/api/*` passa DIRETO para a rede, sempre,
 * sem cópia e sem tentativa de adivinhar.
 *
 * Isso não é preciosismo. Um painel de sinalização é um lugar onde a pessoa
 * publica coisas, e servir resposta velha de API teria duas consequências que
 * ninguém perdoaria:
 *
 *   1. Ela veria uma peça no painel que não é a que está na parede.
 *   2. Um "publicar" respondido pelo cache pareceria ter dado certo sem ter
 *      saído do celular.
 *
 * Entre "abrir rápido" e "nunca mentir sobre o que está no ar", este arquivo
 * escolhe o segundo. Sem rede, o app abre inteiro e diz que está sem conexão
 * — que é a verdade — em vez de mostrar um retrato antigo com cara de atual.
 */

const CASCO = 'mt-app-v1';

// A única página do SPA. Todo caminho de cliente (/app/qualquer-coisa) é
// servido por ela.
const INDICE = '/app/';

/*
 * Instalação: guarda o índice E os arquivos que ele referencia.
 *
 * Os nomes dos pacotes do Vite têm hash (index-BZNqdKTy.js), então não dá para
 * escrevê-los aqui — eles mudam a cada build. A saída é ler o próprio HTML no
 * momento da instalação e tirar dali os `<script src>` e `<link href>`.
 *
 * Sem isto o app só abriria offline na SEGUNDA visita: na primeira, a página
 * já baixou os pacotes antes de o worker existir, então eles não passariam por
 * aqui. "Instalei e não abre sem internet" é exatamente a decepção que a
 * instalação promete evitar.
 */
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CASCO);
    await cache.add(new Request(INDICE, { cache: 'reload' }));

    const html = await (await cache.match(INDICE)).text();
    const refs = new Set();
    const re = /(?:src|href)="([^"]+)"/g;
    let m;
    while ((m = re.exec(html))) {
      const u = m[1];
      // Só o que é nosso e é casco: pacote, folha de estilo, fonte, ícone.
      if (/^\/(app\/assets|icons)\//.test(u) || /\.(js|css|woff2?)$/.test(u)) refs.add(u);
    }

    /*
     * E os pacotes que a página AINDA não pediu.
     *
     * O editor entra por `import()` e só é baixado quando alguém abre uma
     * peça. Guardar apenas o que o HTML referencia deixaria justamente a tela
     * mais pesada de fora — e, offline, um `import()` que falha rejeita e o
     * React desmonta a árvore: o app inteiro apagava ao tocar em "Editar".
     *
     * `ativos.json` é a lista que o próprio Vite escreve no build. Se ela
     * faltar, a instalação segue com o que deu — ficar sem worker seria pior
     * do que ficar com um worker incompleto.
     */
    try {
      const lista = await (await fetch('/app/ativos.json', { cache: 'reload' })).json();
      for (const item of Object.values(lista)) {
        if (item.file) refs.add('/app/' + item.file);
        for (const css of item.css || []) refs.add('/app/' + css);
        for (const ativo of item.assets || []) refs.add('/app/' + ativo);
      }
    } catch (_) { /* segue sem a lista */ }
    // `allSettled`: um arquivo que falhe não pode abortar a instalação inteira
    // e deixar o app sem worker nenhum.
    await Promise.allSettled([...refs].map((u) => cache.add(new Request(u, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const nomes = await caches.keys();
  await Promise.all(nomes.filter((n) => n.startsWith('mt-app-') && n !== CASCO).map((n) => caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /*
   * A API e as mídias passam direto, sem cache e sem fallback.
   *
   * `/media/*` fica de fora porque são os arquivos da empresa — vídeo e imagem
   * grandes, que encheriam o armazenamento do celular sem que ninguém tivesse
   * pedido. Quem precisa deles offline é a TV, e a TV tem o worker dela.
   */
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;

  // Navegação (abrir o app, recarregar, voltar): o casco responde na hora e
  // se atualiza por trás.
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(CASCO);
      const guardado = await cache.match(INDICE);
      const rede = fetch(req)
        .then((r) => { if (r.ok) cache.put(INDICE, r.clone()); return r; })
        .catch(() => null);
      return guardado || (await rede) || respostaSemRede();
    })());
    return;
  }

  /*
   * Pacote do Vite: cache primeiro, e ponto. O nome tem hash — se o conteúdo
   * mudasse, o nome mudaria junto. Revalidar seria pedir à rede uma resposta
   * que já se sabe qual é.
   */
  if (/^\/(app\/assets|icons)\//.test(url.pathname) || /\.(woff2?)$/.test(url.pathname)) {
    e.respondWith((async () => {
      const cache = await caches.open(CASCO);
      const guardado = await cache.match(req);
      if (guardado) return guardado;
      const r = await fetch(req);
      if (r.ok) cache.put(req, r.clone());
      return r;
    })());
    return;
  }
});

/*
 * O último recurso: sem rede e sem casco guardado (alguém instalou e limpou o
 * armazenamento, ou abriu pela primeira vez já offline).
 *
 * Uma página honesta, escrita à mão aqui dentro para não depender de baixar
 * nada — que é justamente o que não está funcionando.
 */
function respostaSemRede() {
  return new Response(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sem conexão — MultiTelas</title>
<style>
  body { margin:0; min-height:100svh; display:grid; place-items:center; background:#F7F8FA; color:#141821;
         font-family: system-ui, -apple-system, "Segoe UI", sans-serif; padding:24px; }
  .caixa { max-width:26rem; text-align:center; }
  h1 { font-size:1.35rem; margin:0 0 .6rem; }
  p { margin:0 0 1.4rem; line-height:1.6; color:#5b6478; }
  button { border:0; border-radius:.75rem; background:#2f6feb; color:#fff; font-weight:700;
           padding:.8rem 1.5rem; font-size:1rem; cursor:pointer; }
  @media (prefers-color-scheme: dark) { body { background:#0C0E12; color:#eef1f7; } p { color:#98a2b8; } }
</style></head><body>
  <div class="caixa">
    <h1>Sem conexão</h1>
    <p>O painel precisa de internet para mostrar o que está no ar.
       <strong>As suas telas continuam exibindo normalmente</strong> — elas não dependem deste aparelho.</p>
    <button onclick="location.reload()">Tentar de novo</button>
  </div>
</body></html>`,
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
