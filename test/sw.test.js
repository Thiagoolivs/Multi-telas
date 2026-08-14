/*
 * Os dois service workers, rodando de verdade.
 *
 * São dois, com trabalhos opostos, no mesmo domínio:
 *
 *   /sw.js       — o da TV. Guarda mídia para a parede não apagar sem rede.
 *   /app/sw.js   — o do painel. Guarda só o casco, e NUNCA a API.
 *
 * Worker é o tipo de código que ninguém testa e que falha calado: o estrago
 * aparece dias depois, offline, na recepção de um cliente, e sem nada na tela
 * que explique. Por isso estes testes carregam os ARQUIVOS DE VERDADE dentro
 * de um ambiente de mentira, como test/perf.test.js faz — uma cópia da lógica
 * aqui concordaria comigo enquanto o arquivo que embarca faz outra coisa.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');

/* ---------------- Um navegador de mentira ---------------- */

class RespostaFalsa {
  constructor(corpo, init) {
    this.corpo = corpo == null ? '' : String(corpo);
    this.status = (init && init.status) || 200;
    this.headers = (init && init.headers) || {};
  }
  get ok() { return this.status >= 200 && this.status < 300; }
  clone() { return new RespostaFalsa(this.corpo, { status: this.status }); }
  async text() { return this.corpo; }
  async json() { return JSON.parse(this.corpo); }
}

class PedidoFalso {
  constructor(url, init) {
    this.url = typeof url === 'string' ? new URL(url, 'https://telas.exemplo').href : url.url;
    this.method = (init && init.method) || 'GET';
    this.mode = (init && init.mode) || 'no-cors';
  }
}

/*
 * CacheStorage de mentira. Guarda por caminho (sem query), que é o suficiente
 * para o que os dois workers fazem — e `ignoreSearch` do de verdade também
 * casa assim.
 */
function fabricarCaches() {
  const caixas = new Map();
  function chave(req) {
    const u = typeof req === 'string' ? req : req.url;
    return new URL(u, 'https://telas.exemplo').pathname;
  }
  function abrir(nome) {
    if (!caixas.has(nome)) caixas.set(nome, new Map());
    const m = caixas.get(nome);
    return {
      async match(req) { return m.get(chave(req)) || undefined; },
      async put(req, res) { m.set(chave(req), res); },
      async add(req) {
        const res = await api.fetch(req);
        if (!res.ok) throw new Error('falhou ' + chave(req));
        m.set(chave(req), res);
      },
      async addAll(lista) { for (const r of lista) await this.add(r); },
      async keys() { return [...m.keys()].map((k) => new PedidoFalso('https://telas.exemplo' + k)); },
    };
  }
  const api = {
    caixas,
    fetch: null, // preenchido pelo teste
    caches: {
      async open(nome) { return abrir(nome); },
      async keys() { return [...caixas.keys()]; },
      async delete(nome) { return caixas.delete(nome); },
      async match(req) {
        for (const nome of caixas.keys()) {
          const hit = await abrir(nome).match(req);
          if (hit) return hit;
        }
        return undefined;
      },
    },
  };
  return api;
}

/* Carrega um worker de verdade e devolve como falar com ele. */
function carregar(arquivo, servidor) {
  const mundo = fabricarCaches();
  const ouvintes = {};
  const rede = [];

  mundo.fetch = async (req) => {
    const caminho = new URL(typeof req === 'string' ? req : req.url, 'https://telas.exemplo').pathname;
    rede.push(caminho);
    const r = servidor(caminho);
    if (r == null) throw new TypeError('Failed to fetch');
    return new RespostaFalsa(r);
  };

  const self_ = {
    addEventListener: (tipo, fn) => { (ouvintes[tipo] = ouvintes[tipo] || []).push(fn); },
    location: { origin: 'https://telas.exemplo' },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: {},
  };

  const contexto = {
    self: self_,
    caches: mundo.caches,
    fetch: mundo.fetch,
    Request: PedidoFalso,
    Response: RespostaFalsa,
    URL,
    TypeError,
    Promise,
    console: { warn() {}, log() {} },
  };
  contexto.globalThis = contexto;
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'), contexto, { filename: arquivo });

  async function disparar(tipo, evento) {
    for (const fn of ouvintes[tipo] || []) await fn(evento);
  }

  return {
    caixas: mundo.caixas,
    rede,
    async instalar() {
      const esperas = [];
      await disparar('install', { waitUntil: (p) => esperas.push(p) });
      await Promise.all(esperas);
    },
    async ativar() {
      const esperas = [];
      await disparar('activate', { waitUntil: (p) => esperas.push(p) });
      await Promise.all(esperas);
    },
    /* Devolve a resposta se o worker interceptou, ou null se deixou passar. */
    async pedir(caminho, init) {
      const req = new PedidoFalso('https://telas.exemplo' + caminho, init);
      let promessa = null;
      await disparar('fetch', { request: req, respondWith: (p) => { promessa = p; } });
      return promessa ? await promessa : null;
    },
  };
}

/* Um servidor de mentira: caminho → corpo, ou null para "caiu a rede". */
function servidorPadrao(caminho) {
  if (caminho === '/app/') {
    return '<!doctype html><script type="module" src="/app/assets/index-abc.js"></script>'
      + '<link rel="stylesheet" href="/app/assets/index-abc.css">'
      + '<link rel="icon" href="/icons/icone.svg">';
  }
  if (caminho === '/app/ativos.json') {
    return JSON.stringify({
      'index.html': { file: 'assets/index-abc.js', css: ['assets/index-abc.css'] },
      'CompositionEditor.jsx': { file: 'assets/CompositionEditor-xyz.js' },
    });
  }
  return 'conteudo de ' + caminho;
}

/* ---------------- O worker do PAINEL ---------------- */

test('painel: a API nunca passa pelo cache', async () => {
  /*
   * A regra que sustenta o resto. Resposta de API vinda do cache teria duas
   * consequências que ninguém perdoaria: a pessoa veria no painel uma peça
   * que não é a que está na parede, e um "publicar" respondido do cache
   * pareceria ter dado certo sem nunca ter saído do celular.
   */
  const w = carregar('web/public/sw.js', servidorPadrao);
  await w.instalar();
  assert.equal(await w.pedir('/api/devices'), null, 'o worker interceptou uma chamada de API');
  assert.equal(await w.pedir('/api/auth/me'), null);
});

test('painel: mídia da empresa não vai para o celular', async () => {
  // Vídeo e imagem grandes encheriam o armazenamento de quem só queria abrir
  // o painel. Quem precisa de mídia offline é a TV, e a TV tem o worker dela.
  const w = carregar('web/public/sw.js', servidorPadrao);
  await w.instalar();
  assert.equal(await w.pedir('/media/video-institucional.mp4'), null);
});

test('painel: a instalação guarda até o pacote que a página ainda não pediu', async () => {
  /*
   * O editor entra por `import()` e vira um pacote à parte, com hash no nome.
   * Guardar só o que o HTML referencia deixaria justamente a tela mais pesada
   * de fora — e, offline, um `import()` que falha rejeita e o React desmonta a
   * árvore: o app inteiro apagava ao tocar em "Editar".
   */
  const w = carregar('web/public/sw.js', servidorPadrao);
  await w.instalar();
  const guardados = [...w.caixas.get('mt-app-v1').keys()];
  assert.ok(guardados.includes('/app/'), 'sem o casco');
  assert.ok(guardados.includes('/app/assets/index-abc.js'), 'sem o pacote principal');
  assert.ok(guardados.includes('/app/assets/CompositionEditor-xyz.js'), 'sem o pacote do editor');
});

test('painel: sem a lista de ativos, a instalação ainda acontece', async () => {
  // Ficar sem worker nenhum é pior do que ficar com um worker incompleto.
  const w = carregar('web/public/sw.js', (c) => (c === '/app/ativos.json' ? null : servidorPadrao(c)));
  await w.instalar();
  assert.ok([...w.caixas.get('mt-app-v1').keys()].includes('/app/'), 'a instalação abortou por causa da lista');
});

test('painel: sem rede, o app abre do cache', async () => {
  const w = carregar('web/public/sw.js', servidorPadrao);
  await w.instalar();

  const caiu = carregarNoMesmoCache(w, () => null);
  const res = await caiu.pedir('/app/', { mode: 'navigate' });
  assert.ok(res, 'não respondeu à navegação');
  assert.match(await res.text(), /index-abc\.js/, 'não veio o casco guardado');
});

test('painel: sem rede e sem casco, a página diz o que está acontecendo', async () => {
  /*
   * O último recurso, e ele tem uma frase que a maioria destes avisos esquece:
   * as telas da empresa continuam exibindo. Sem isso, "sem conexão" no painel
   * parece "a recepção está com a tela apagada".
   */
  const w = carregar('web/public/sw.js', () => null);
  const res = await w.pedir('/app/', { mode: 'navigate' });
  assert.equal(res.status, 503);
  const html = await res.text();
  assert.match(html, /Sem conexão/);
  assert.match(html, /continuam exibindo/);
});

/* Reabre o mesmo worker com outro servidor, preservando o que já foi cacheado. */
function carregarNoMesmoCache(anterior, servidor) {
  const novo = carregar('web/public/sw.js', servidor);
  for (const [nome, caixa] of anterior.caixas) novo.caixas.set(nome, caixa);
  return novo;
}

/* ---------------- O worker da TV ---------------- */

test('TV: navegar para o painel não vira o casco do player', async () => {
  /*
   * O defeito que este teste guarda é o mais caro do arquivo.
   *
   * O escopo deste worker é "/", então ele enxerga a navegação de qualquer
   * aba do mesmo navegador. A versão anterior gravava a resposta de QUALQUER
   * navegação sob a chave '/player.html' — bastava abrir a landing ou o painel
   * uma vez para o HTML deles virar o casco salvo da TV. O estrago só aparecia
   * depois, na queda de rede: a parede subia mostrando a tela de login.
   */
  const w = carregar('sw.js', servidorPadrao);
  await w.instalar();

  assert.equal(await w.pedir('/app/', { mode: 'navigate' }), null, 'interceptou a navegação do painel');
  assert.equal(await w.pedir('/', { mode: 'navigate' }), null, 'interceptou a navegação da landing');

  const casco = await w.caixas.get('mt-shell-v9').get('/player.html');
  assert.match(await casco.text(), /player\.html/, 'o casco do player foi sobrescrito');
});

test('TV: a navegação do player continua sendo guardada', async () => {
  const w = carregar('sw.js', servidorPadrao);
  await w.instalar();
  const res = await w.pedir('/player.html', { mode: 'navigate' });
  assert.ok(res, 'deixou passar a navegação do próprio player');
});

test('TV: sem rede, o player sobe do cache', async () => {
  const w = carregar('sw.js', servidorPadrao);
  await w.instalar();

  const caiu = carregar('sw.js', () => null);
  for (const [nome, caixa] of w.caixas) caiu.caixas.set(nome, caixa);
  const res = await caiu.pedir('/player.html?cloud=1', { mode: 'navigate' });
  assert.ok(res, 'a TV ficaria sem página');
  assert.match(await res.text(), /player\.html/);
});

test('TV: os pacotes do painel não entram no cache da TV', async () => {
  // O cache da TV existe para caber a mídia de uma parede. Encher com os
  // pacotes do painel é gastar o disco do aparelho com o que ele nunca abre.
  const w = carregar('sw.js', servidorPadrao);
  await w.instalar();
  assert.equal(await w.pedir('/app/assets/index-abc.js'), null);
});

test('TV: o casco declarado é o que o player.html carrega de verdade', async () => {
  /*
   * A lista de SHELL_ASSETS tem que casar com os <script> da página. Quando
   * não casa, o arquivo que falta some só na queda de rede — o pior lugar
   * para descobrir. (js/cor.js já ficou de fora desde que nasceu.)
   */
  const fonte = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const lista = fonte.slice(fonte.indexOf('SHELL_ASSETS = ['), fonte.indexOf('];', fonte.indexOf('SHELL_ASSETS = [')));
  const html = fs.readFileSync(path.join(RAIZ, 'player.html'), 'utf8');

  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  for (const s of scripts) {
    assert.ok(lista.includes("'/" + s.replace(/^\//, '') + "'"), 'player.html carrega ' + s + ' e o casco não guarda');
  }
});
