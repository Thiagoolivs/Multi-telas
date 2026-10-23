/*
 * Campanhas em pastas (EXECUTOR D10).
 *
 * - A lista cortava calada em 20: a 21ª sumia. Agora vem em páginas, com
 *   "mais", busca pelo nome e as arquivadas à parte.
 * - Renomear, arquivar e excluir pela própria lista; excluir a que está no
 *   ar pergunta antes (as peças continuam nas TVs).
 * - O cartão diz quantas peças a pasta tem (capa.n), sem abrir.
 * - "Campanha" com um sentido só: em Meus Designs o agrupamento é "pasta".
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

test('Meus Designs chama o agrupamento de pasta; Campanha é só a do Criar', () => {
  const m = ler('web/src/pages/MyDesignsPage.jsx');
  assert.match(m, /<PanelHeader title="Suas pastas"/);
  assert.match(m, /<Rocket size=\{12\} \/> Publicar pasta/);
  assert.ok(!/title="Excluir campanha"|Suas campanhas/.test(m));
  const p = ler('web/src/pages/CampanhasPage.jsx');
  for (const s of ['titulo="Renomear"', 'titulo="Arquivar"', 'titulo="Desarquivar"', 'titulo="Excluir"', 'Ver mais campanhas', 'Buscar pelo nome']) assert.ok(p.includes(s), 'falta ' + s);
  assert.match(p, /e\.codigo !== 'campanha-no-ar'/, 'excluir a do ar não pergunta');
});

const PORTA = 6000 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('lista sem corte calado, busca, arquivar, renomear e excluir', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d10-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const email = 'd10' + Date.now() + '@teste.local';
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));
  const tenantId = (await pedir('/api/auth/me', { cookie: c })).json.tenant.id;

  // 33 campanhas direto no banco do servidor de teste (gerar 33 pela IA seria lento).
  process.env.DATA_DIR = dados;
  const db = require('../server/db-sqlite.js');
  const ids = [];
  for (let i = 0; i < 33; i++) ids.push((await db.criarCampanha(tenantId, '', { nome: (i === 7 ? 'Natal_especial ' : 'Promo ') + i })).id);

  const p1 = (await pedir('/api/campanhas', { cookie: c })).json;
  assert.equal(p1.campanhas.length, 30);
  assert.equal(p1.mais, true, 'a 31ª sumiria calada');
  const p2 = (await pedir('/api/campanhas?pular=30', { cookie: c })).json;
  assert.equal(p2.campanhas.length, 3);
  assert.equal(p2.mais, false);

  const achou = (await pedir('/api/campanhas?q=' + encodeURIComponent('natal_'), { cookie: c })).json.campanhas;
  assert.deepEqual(achou.map((x) => x.nome), ['Natal_especial 7']);

  // Arquivar tira da lista e põe nas arquivadas; desarquivar devolve.
  assert.equal((await pedir('/api/campanhas/' + ids[0], { method: 'PUT', cookie: c, json: { arquivada: true } })).status, 200);
  assert.ok(!(await pedir('/api/campanhas?q=Promo%200', { cookie: c })).json.campanhas.some((x) => x.id === ids[0]));
  const arq = (await pedir('/api/campanhas?arquivadas=1', { cookie: c })).json.campanhas;
  assert.deepEqual(arq.map((x) => x.id), [ids[0]]);

  // Renomear: só o nome muda.
  const r = (await pedir('/api/campanhas/' + ids[1], { method: 'PUT', cookie: c, json: { nome: '  Dia dos Pais  ' } })).json;
  assert.equal(r.campanha.nome, 'Dia dos Pais');
  assert.equal(r.campanha.estado, 'pronta');
  assert.equal((await pedir('/api/campanhas/' + ids[1], { method: 'PUT', cookie: c, json: { nome: '   ' } })).status, 400);

  // Excluir: a do ar pergunta (409); com forcar, sai.
  await pedir('/api/campanhas/' + ids[2], { method: 'PUT', cookie: c, json: { estado: 'no_ar', telas: [] } });
  const no = await pedir('/api/campanhas/' + ids[2], { method: 'DELETE', cookie: c });
  assert.equal(no.status, 409);
  assert.equal(no.json.code, 'campanha-no-ar');
  assert.equal((await pedir('/api/campanhas/' + ids[2] + '?forcar=1', { method: 'DELETE', cookie: c })).status, 200);
  assert.equal((await pedir('/api/campanhas/' + ids[3], { method: 'DELETE', cookie: c })).status, 200);
  assert.equal((await pedir('/api/campanhas/' + ids[3], { cookie: c })).status, 404);

  // Outra conta não mexe nas campanhas desta.
  const outra = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'x' + email, password: 'senha-de-teste-123', name: 'Outra', aceite: true } }));
  assert.equal((await pedir('/api/campanhas/' + ids[4], { method: 'DELETE', cookie: outra })).status, 404);
  assert.equal((await pedir('/api/campanhas/' + ids[4], { method: 'PUT', cookie: outra, json: { nome: 'roubada' } })).status, 404);
});
