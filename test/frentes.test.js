/*
 * As três frentes: MultiTelas Empresas, Saúde e Comércio (docs/FRENTES.md).
 * Um app só; o que muda mora no registro (js/perfil.js). A frente é
 * escolhida no cadastro e, depois, só o operador troca.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const P = require('../js/perfil.js');

test('o registro: as três frentes têm nome comercial, endereço, público, extras e se recebem anúncio', () => {
  assert.deepEqual(P.IDS, ['empresa', 'comercio', 'saude']);
  for (const id of P.IDS) {
    const f = P.PERFIS[id];
    for (const campo of ['marca', 'slug', 'publico', 'opcoes', 'exemplo', 'paraIA', 'lugar']) assert.ok(f[campo], id + ' sem ' + campo);
    assert.equal(typeof f.recebeAnuncios, 'boolean', id);
    assert.ok(f.extras && f.extras.rotulo && f.extras.depoisDe, id + ' sem extras');
    assert.match(f.marca, /^MultiTelas /);
    assert.equal(P.doSlug(f.slug).id, id);
  }
  assert.equal(P.PERFIS.empresa.recebeAnuncios, false, 'a TV da equipe não recebe anúncio de terceiros');
  assert.equal(P.doSlug('constructor'), null);
  assert.equal(P.doSlug(''), null);
});

test('o menu da frente: Empresas sobe Pessoas e indicadores; Saúde e Comércio deixam os extras no fim', async () => {
  const M = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/menu.js')).href);
  const labels = (f) => M.gruposDa(f).map((g) => g.label);
  assert.deepEqual(labels('empresa'), ['Início', 'Telas', 'Programação', 'Criar', 'Biblioteca', 'Pessoas e indicadores', 'Marca', 'Conta']);
  for (const f of ['saude', 'comercio']) assert.deepEqual(labels(f), ['Início', 'Telas', 'Programação', 'Criar', 'Biblioteca', 'Marca', 'Recursos extras', 'Conta']);
  // As mesmas páginas nas três: nada some, só muda de lugar e de nome.
  const paginas = (f) => M.gruposDa(f).flatMap((g) => g.paginas).sort();
  assert.deepEqual(paginas('empresa'), paginas('saude'));
  assert.deepEqual(paginas('empresa'), M.GRUPOS.flatMap((g) => g.paginas).sort());
  assert.match(ler('web/src/components/layout/Sidebar.jsx'), /gruposDa\(frente\)/);
  assert.match(ler('web/src/components/layout/Sidebar.jsx'), /\{frente\.marca\}/);
});

test('o painel: Ajustes mostra a frente e manda ao suporte; o cadastro vem marcado pela landing; o operador troca', () => {
  const s = ler('web/src/pages/SettingsPage.jsx');
  assert.match(s, /const jaEscolheu = !!tenant\.perfilEscolhido;/);
  assert.match(s, /Para trocar, fale com o suporte/);
  const a = ler('web/src/pages/AuthScreen.jsx');
  assert.match(a, /frenteDoSlug\(new URLSearchParams\(window\.location\.search\)\.get\('frente'\)\)/);
  assert.match(a, /Depois, a troca é pelo suporte\./);
  assert.match(ler('web/src/pages/PlatformPage.jsx'), /plataforma\.frente\(conta\.id, frente\)/);
  assert.match(ler('web/src/api.js'), /frente: \(id, frente\) => api\('POST', '\/api\/plataforma\/contas\/' \+ id \+ '\/frente', \{ frente \}\)/);
});

test('a landing de cada frente: título, canônico, herói, exemplo, cartão aceso e cadastro na frente', () => {
  const L = require('../server/landing-frentes.js');
  const html = ler('landing/index.html');
  assert.deepEqual(L.SLUGS, ['empresas', 'saude', 'comercio']);
  assert.equal(L.montar(html, 'nada'), null);
  for (const slug of L.SLUGS) {
    const s = L.montar(html, slug);
    const f = P.doSlug(slug);
    assert.match(s, new RegExp('<title>[^<]*' + f.marca + '</title>'));
    assert.match(s, new RegExp('<link rel="canonical" href="https://app\\.multitelas\\.net\\.br/' + slug + '" />'));
    assert.match(s, new RegExp('<body class="[^"]*" data-frente="' + slug + '" data-exemplo="[a-z]+">'));
    assert.match(s, new RegExp('data-frente-card="' + slug + '" aria-current="page"'));
    assert.doesNotMatch(s, /<a href="\/app" data-track="trial"/, slug + ': um "Testar grátis" não leva à frente');
    assert.match(s, new RegExp('<a href="/app/\\?frente=' + slug + '" data-track="trial"'));
    assert.match(s, /<!--frente:kicker-->[^<]*/);
  }
  const saude = L.montar(html, 'saude');
  assert.match(saude, /vendor\/galeria\/clinica\.webp" width="1200"/);
  assert.doesNotMatch(saude, /class="troca"/, 'a padaria e a lanchonete trocando na TV da clínica');
  assert.doesNotMatch(saude, /pão de queijo/);
  // A página principal continua a mesma, com os três caminhos.
  for (const slug of L.SLUGS) assert.match(html, new RegExp('<a href="/' + slug + '" data-frente-card="' + slug + '"'));
});

const PORTA = 7900 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, corpo, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('servidor: landings indexáveis e no sitemap; só o operador troca a frente, com registro', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-frentes-'));
  const op = 'op' + Date.now() + '@teste.local';
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', ADMIN_EMAILS: op, GOOGLE_CLIENT_ID: 'teste', GOOGLE_CLIENT_SECRET: 'teste' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* idem */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  for (const slug of ['empresas', 'saude', 'comercio']) {
    const r = await pedir('/' + slug);
    assert.equal(r.status, 200, '/' + slug);
    assert.equal(r.headers['x-robots-tag'], undefined, '/' + slug + ' fora do Google');
    assert.match(r.corpo, new RegExp('data-frente="' + slug + '"'));
    assert.equal((await pedir('/' + slug + '/')).status, 200);
  }
  assert.match((await pedir('/sitemap.xml')).corpo, /<loc>https:\/\/app\.multitelas\.net\.br\/saude<\/loc>/);
  assert.equal((await pedir('/healthz')).status, 200, 'a verificação do Railway mudou para /healthz');

  // Cadastro pelo Google: a frente escolhida atravessa o Google num cookie curto (só se for frente de verdade).
  const g = await pedir('/api/auth/google?frente=saude');
  assert.equal(g.status, 302);
  assert.ok(g.cookies.some((c) => /^mt_frente=saude;.*HttpOnly/.test(c)), 'a frente não foi junto para o Google');
  for (const ruim of ['constructor', 'x%3Bdomain%3Devil']) {
    const r = await pedir('/api/auth/google?frente=' + ruim);
    assert.ok(!r.cookies.some((c) => /^mt_frente=/.test(c)), ruim + ' virou cookie');
  }
  assert.match(ler('server/routes/auth.js'), /const frente = perfilValido\(\(\(req\.headers\.cookie \|\| ''\)\.match\(\/mt_frente=\(\[\^;\]\+\)\/\) \|\| \[\]\)\[1\]\);/);

  const cadastrar = (email, name, perfil) => pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name, aceite: true, perfil } });
  const cop = cookieDe(await cadastrar(op, 'Operação', 'comercio'));
  const cli = await cadastrar('cli' + Date.now() + '@teste.local', 'Clínica Bem', 'saude');
  const ccli = cookieDe(cli);
  const id = cli.json.tenant.id;

  // O cliente não troca sozinho, nem pela rota do operador (que nem existe para ele).
  assert.equal((await pedir('/api/auth/profile', { method: 'POST', cookie: ccli, json: { perfil: 'comercio' } })).status, 403);
  assert.equal((await pedir('/api/plataforma/contas/' + id + '/frente', { method: 'POST', cookie: ccli, json: { frente: 'comercio' } })).status, 404);

  // O operador troca, e a ficha mostra.
  assert.equal((await pedir('/api/plataforma/contas/' + id + '/frente', { method: 'POST', cookie: cop, json: { frente: 'xyz' } })).status, 400);
  assert.equal((await pedir('/api/plataforma/contas/' + id + '/frente', { method: 'POST', cookie: cop, json: { frente: 'constructor' } })).status, 400);
  const troca = await pedir('/api/plataforma/contas/' + id + '/frente', { method: 'POST', cookie: cop, json: { frente: 'empresa' } });
  assert.equal(troca.status, 200);
  assert.equal((await pedir('/api/plataforma/contas/' + id, { cookie: cop })).json.frente, 'empresa');
  const me = (await pedir('/api/auth/me', { cookie: ccli })).json;
  assert.equal(me.tenant.perfil, 'empresa');
});
