/*
 * Perfil da conta: Empresa, Comércio ou Saúde (EXECUTOR D4).
 *
 * No teste de uso de 23/10 uma metalúrgica abriu o painel e viu "Promoção
 * com preço", "pão de queijo", "Onde fica a loja" e uma amostra de paleta
 * escrita "Campanha com desconto". O perfil decide os começos, os exemplos,
 * o nome do lugar e o que a IA ouve sobre o negócio.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const Perfil = require('../js/perfil.js');
const P = require('../js/paletas.js');
const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('o perfil sai do ramo: metalúrgica é Empresa, clínica é Saúde, padaria é Comércio', () => {
  assert.equal(Perfil.deduzir(P.detectarRamo(['Metalúrgica Silva'])), 'empresa');
  assert.equal(Perfil.deduzir(P.detectarRamo(['Clínica Vida'])), 'saude');
  assert.equal(Perfil.deduzir(P.detectarRamo(['Padaria do Bairro'])), 'comercio');
  assert.equal(Perfil.deduzir(P.detectarRamo(['Fulano'])), 'comercio', 'sem pista, Comércio');
  assert.equal(Perfil.normalizar('qualquer'), 'comercio');
});

test('chave do protótipo não é perfil: constructor, __proto__ e toString caem no Comércio', () => {
  for (const p of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(Perfil.tem(p), false, p);
    assert.equal(Perfil.normalizar(p), 'comercio', p);
    assert.equal(Perfil.de(p).paraIA, Perfil.PERFIS.comercio.paraIA, p);
    assert.equal(Perfil.deduzir(p), 'comercio', p);
  }
  assert.equal(Perfil.tem('saude'), true);
  assert.equal(Perfil.normalizar(['saude']), 'comercio', 'array virou chave');
});

test('cada perfil tem de 10 a 12 começos, todos existentes, e a Empresa não vê promoção nem foto de produto', () => {
  const src = ler('web/src/pages/CriacaoRapidaPage.jsx');
  for (const id of Perfil.IDS) {
    const p = Perfil.PERFIS[id];
    // D17: o dono pediu pelo menos 10 começos rápidos.
    assert.ok(p.opcoes.length >= 10 && p.opcoes.length <= 12, id + ' tem ' + p.opcoes.length + ' começos');
    assert.equal(new Set(p.opcoes).size, p.opcoes.length, id + ' repete começo');
    for (const o of p.opcoes) assert.match(src, new RegExp("\\{ id: '" + o + "'"), id + ': o começo "' + o + '" não existe em OPCOES');
    for (const k of ['nome', 'descricao', 'lugar', 'lugarDe', 'exemplo', 'paraIA']) assert.ok(p[k], id + ' sem ' + k);
  }
  assert.ok(!Perfil.PERFIS.empresa.opcoes.includes('promocao'));
  assert.ok(!Perfil.PERFIS.empresa.opcoes.includes('foto'));
  assert.ok(!/pão de queijo/.test(Perfil.PERFIS.empresa.exemplo));
});

test('o painel lê o perfil em vez de texto de loja fixo', () => {
  const criar = ler('web/src/pages/CriarPage.jsx');
  assert.ok(!/OPCOES\.map/.test(criar), 'o Criar ainda lista os começos de loja para todo mundo');
  assert.ok(!/pão de queijo/.test(criar), 'o exemplo da caixa ainda é de padaria');
  assert.match(criar, /perfil\.exemplo/);
  assert.match(ler('web/src/pages/CriacaoRapidaPage.jsx'), /opcoesDoPerfil\(perfil\.id\)/);
  assert.match(ler('web/src/pages/BrandPage.jsx'), /'Onde fica a ' \+ perfil\.lugar/);
  assert.match(ler('web/src/components/content/PaletasSugeridas.jsx'), /empresa: 'gente-comunicado'/);
  assert.match(ler('web/src/App.jsx'), /definirPerfil\(me\.tenant\.perfil\)/);
});

test('a IA ouve o tipo de negócio, e o guia sem chave não oferece promoção à Empresa', () => {
  const conversa = require('../server/ai-conversa.js');
  assert.match(conversa.contexto({ perfil: 'empresa' }), /Tipo de negócio: Empresa: comunicação interna/);
  assert.ok(!/Tipo de negócio/.test(conversa.contexto({})), 'sem perfil, nada inventado');
  const src = ler('server/ai-guia.js');
  assert.match(src, /ideiasSemIA\(ctx && ctx\.perfil/);
});

test('a coluna perfil existe nos dois bancos', () => {
  assert.match(ler('server/db-postgres.js'), /ALTER TABLE tenants ADD COLUMN IF NOT EXISTS perfil TEXT/);
  assert.match(ler('server/db-sqlite.js'), /'perfil TEXT'/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 5500 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('cadastro grava o perfil, /me devolve (escolhido ou deduzido), Ajustes troca e confere', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-perfil-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const cadastrar = (name, perfil) => pedir('/api/auth/signup', { method: 'POST', json: { email: 'perfil' + Date.now() + Math.random().toString(36).slice(2, 6) + '@teste.local', password: 'senha-de-teste-123', name, aceite: true, perfil } });

  // Escolhido no cadastro: vale, mesmo contra o nome.
  const a = cookieDe(await cadastrar('Padaria Pão Bom', 'saude'));
  let me = (await pedir('/api/auth/me', { cookie: a })).json;
  assert.equal(me.tenant.perfil, 'saude');
  assert.equal(me.tenant.perfilEscolhido, true);

  // Sem escolha (ou inválido): deduzido do nome, e não gravado.
  const b = cookieDe(await cadastrar('Metalúrgica Silva', 'hacker'));
  me = (await pedir('/api/auth/me', { cookie: b })).json;
  assert.equal(me.tenant.perfil, 'empresa');
  assert.equal(me.tenant.perfilEscolhido, false);

  // Ajustes: inválido não grava NADA (nem o nome que veio junto).
  const ruim = await pedir('/api/auth/profile', { method: 'POST', cookie: b, json: { name: 'Novo Nome', perfil: 'nada' } });
  assert.equal(ruim.status, 400);
  me = (await pedir('/api/auth/me', { cookie: b })).json;
  assert.notEqual(me.user.name, 'Novo Nome', 'gravou metade antes de recusar');

  // Chave do protótipo não é perfil (nota do consultor no #218): 400, e nada gravado.
  for (const p of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    assert.equal((await pedir('/api/auth/profile', { method: 'POST', cookie: b, json: { perfil: p } })).status, 400, p + ' passou');
  }
  me = (await pedir('/api/auth/me', { cookie: b })).json;
  assert.equal(me.tenant.perfil, 'empresa');

  assert.equal((await pedir('/api/auth/profile', { method: 'POST', cookie: b, json: { perfil: 'comercio' } })).status, 200);
  me = (await pedir('/api/auth/me', { cookie: b })).json;
  assert.equal(me.tenant.perfil, 'comercio');
  assert.equal(me.tenant.perfilEscolhido, true);

  // O guia sem chave segue o perfil.
  assert.equal((await pedir('/api/auth/profile', { method: 'POST', cookie: b, json: { perfil: 'empresa' } })).status, 200);
  const g = await pedir('/api/ai/guia', { method: 'POST', cookie: b, json: {} });
  assert.equal(g.status, 200);
  const titulos = g.json.sugestoes.map((s) => s.titulo).join(' | ');
  assert.ok(!/Promoção/.test(titulos), 'a Empresa recebeu promoção: ' + titulos);
});

test('a campanha sem IA não diz "Peça no balcão" para clínica nem fábrica; a IA recebe o tipo', async () => {
  const eco = require('../server/ecossistema.js');
  const E = require('../js/escopo.js');
  const escopo = E.normalizar({ nome: 'Vacina', objetivo: 'vacina da gripe chegou', imagens: 'nenhuma', telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 1 } } }] });
  const de = async (perfil) => JSON.stringify(await eco.gerar(escopo, { perfil, marca: {}, telas: [] }, {}));
  assert.ok(!/balcão/i.test(await de('saude')));
  assert.match(await de('saude'), /Fale com a recepção/);
  assert.ok(!/balcão/i.test(await de('empresa')));
  assert.match(await de('comercio'), /Peça no balcão/);
  assert.match(ler('server/ecossistema.js'), /ctx\.perfil \? 'Tipo de negócio: ' \+ Perfil\.de\(ctx\.perfil\)\.paraIA : ''/);
  assert.match(ler('server/routes/campanhas.js'), /perfil: await paleta\.perfilDaConta\(db, tenantId, tenant\),/);
});
