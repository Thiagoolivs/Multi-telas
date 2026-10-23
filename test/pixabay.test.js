/*
 * O banco de imagens externo: Pixabay, com o crédito automático (EXECUTOR D37).
 *
 * A busca passa pelo servidor (a chave nunca vai ao navegador nem à resposta),
 * com cache de 24 h como a Pixabay pede; "usar" baixa a foto para as Mídias
 * da conta (a TV não depende de host de terceiros) e o crédito vai junto —
 * no nome da mídia, na peça e, discreto, no canto da TV. Nenhum teste chama a
 * Pixabay de verdade: a rede é trocada por uma falsa.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const PX = require('../server/pixabay');

test('a busca: pelo servidor, com a chave só no pedido à Pixabay, cache de 24 h; usar baixa a grande (ou a menor) com o crédito', async () => {
  const antes = process.env.PIXABAY_API_KEY;
  process.env.PIXABAY_API_KEY = 'chave-de-teste-que-nao-pode-vazar';
  const pedidos = [];
  PX._limpar();
  PX._trocarRede({
    buscarJson: async (url) => {
      pedidos.push(url);
      const u = new URL(url);
      if (u.searchParams.get('id')) return { json: { hits: [{ id: 7, user: 'Ana Foto', pageURL: 'https://pixabay.com/x-7', largeImageURL: 'https://cdn.pixabay.com/grande.jpg', webformatURL: 'https://cdn.pixabay.com/media.jpg' }] } };
      return { json: { totalHits: 2, hits: [{ id: 7, user: 'Ana Foto', webformatURL: 'https://cdn.pixabay.com/media.jpg', imageWidth: 1920, imageHeight: 1280, tags: 'café, xícara', pageURL: 'https://pixabay.com/x-7' }] } };
    },
    baixarImagem: async (url) => (url.includes('grande') ? { erro: 'a imagem do site é grande demais' } : { bytes: Buffer.from('jpg'), mime: 'image/jpeg' }),
  });
  try {
    assert.equal(PX.configurado(), true);
    const r = await PX.buscar('  café ', { orientacao: 'vertical' });
    assert.deepEqual(r.fotos[0], { id: 7, previa: 'https://cdn.pixabay.com/media.jpg', largura: 1920, altura: 1280, autor: 'Ana Foto', pagina: 'https://pixabay.com/x-7', tags: 'café, xícara' });
    assert.ok(!JSON.stringify(r).includes('chave-de-teste'), 'a chave foi para a resposta');
    const u = new URL(pedidos[0]);
    assert.deepEqual([u.origin, u.searchParams.get('key'), u.searchParams.get('q'), u.searchParams.get('safesearch'), u.searchParams.get('orientation'), u.searchParams.get('lang')],
      ['https://pixabay.com', 'chave-de-teste-que-nao-pode-vazar', 'café', 'true', 'vertical', 'pt']);
    await PX.buscar('café', { orientacao: 'vertical' });
    assert.equal(pedidos.length, 1, 'a mesma busca foi à Pixabay de novo (pede cache de 24 h)');
    const f = await PX.baixar(7);
    assert.deepEqual([f.mime, f.credito, f.pagina], ['image/jpeg', 'Foto: Ana Foto / Pixabay', 'https://pixabay.com/x-7'], 'a grande falhou e não caiu para a menor');
    assert.deepEqual(await PX.baixar('abc'), { erro: 'foto inválida' });
  } finally {
    PX._trocarRede(require('../server/site'));
    if (antes === undefined) delete process.env.PIXABAY_API_KEY; else process.env.PIXABAY_API_KEY = antes;
  }
});

/* ---------------- servidor de verdade (sem chave: a rota se fecha) ---------------- */

const PORTA = 7500 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}

test('a rota: só com sessão; sem a chave no servidor, o painel esconde a aba e a busca responde 503', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d37-'));
  const env = { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' };
  delete env.PIXABAY_API_KEY;
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  assert.equal((await pedir('/api/pixabay?q=cafe')).status, 401);
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd37' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  assert.deepEqual((await pedir('/api/pixabay/estado', { cookie: c })).json, { configurado: false });
  assert.equal((await pedir('/api/pixabay?q=cafe', { cookie: c })).status, 503);
  assert.equal((await pedir('/api/pixabay/usar', { method: 'POST', cookie: c, json: { id: 1 } })).status, 503);
});

test('o painel e a TV: a aba só fora da foto de produto, o crédito por campo na peça e no canto da TV', () => {
  const F = ler('web/src/components/content/FotoDoProduto.jsx');
  assert.match(F, /\{incluirIa && bancoLigado && \(/, 'o banco de imagens apareceu para a foto de PRODUTO (que tem de ser o de verdade)');
  assert.match(F, /onEscolher\(r\.url, \{ credito: r\.credito \}\)/);
  const E = ler('web/src/components/content/EditarPeca.jsx');
  assert.match(E, /const vivos = Object\.fromEntries\(Object\.entries\(creditos\)\.filter\(\(\[n\]\) => gravados\[n\]\)\);/, 'crédito de foto que saiu continua na TV');
  const R = ler('js/render.js');
  assert.match(R, /comCredito\(el, item\.creditos\);/);
  assert.match(R, /c\.textContent = textos/, 'o crédito precisa entrar como texto');
  assert.match(ler('css/player.css'), /\.mt-credito \{ position: absolute; right: 1\.2cqh; bottom: 1cqh;/);
  assert.doesNotMatch(ler('web/src/api.js'), /pixabay\.com\/api/, 'o navegador chamando a Pixabay direto (com a chave)');
  assert.match(ler('sw.js'), /mt-shell-v(6\d)/);
});

test('a chave vai na query da Pixabay: nenhum log do caminho grava a URL (nota do consultor no D37)', () => {
  // pixabay.js e site.js não registram nada; os erros de site.js são frases fixas, sem a URL.
  for (const f of ['server/pixabay.js', 'server/site.js']) {
    assert.doesNotMatch(ler(f), /\b(erros\.registrar|log\.(aviso|info|erro)|console\.(log|warn|error))\(/, f + ' passou a registrar algo');
  }
  for (const m of ler('server/site.js').matchAll(/\{ erro: ([^}]+) \}/g)) assert.doesNotMatch(m[1].replace(/'[^']*'/g, ''), /\b(url|u|alvo|destino|href)\b/, 'erro com a URL: ' + m[1]);
  // A rota só registra a falha ao guardar (sem a URL) e nunca devolve a chave.
  const R = ler('server/routes/pixabay.js');
  assert.deepEqual([...R.matchAll(/erros\.registrar\(([^)]*)\)/g)].map((m) => m[1]), ["e, { onde: 'banco de imagens' }"]);
  assert.doesNotMatch(R, /PIXABAY_API_KEY|\.key\b/);
});
