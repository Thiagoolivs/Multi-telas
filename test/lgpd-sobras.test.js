/*
 * LGPD sem sobras (EXECUTOR D0.7).
 *
 * - Excluir a conta deixava para trás tudo o que nasceu depois da primeira
 *   lista: conversas do Criar, campanhas, marcas, trabalhos, eventos,
 *   chamados, acessos do suporte, uso de IA. A exportação também.
 * - Apagar um mural apagava só o mural: as fotos (com o IP de quem mandou),
 *   as linhas de mídia e os arquivos ficavam.
 * - A TV recebia a lista INTEIRA de aniversariantes, com matrícula.
 * - Apagar uma mídia em uso (TV, logo, campanha) não perguntava nada.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lgpd-'));
const db = require('../server/db-sqlite.js');
const { DatabaseSync } = require('node:sqlite');
const RAIZ = path.join(__dirname, '..');

test('excluir a conta não deixa linha nenhuma dela, em NENHUMA tabela com tenant_id', async () => {
  const { tenantId, userId } = await db.createAccount('sobra' + Date.now() + '@teste.local', 'x', 'Loja Sobra', 'Dono');
  // Uma linha em cada tabela que nasceu depois da primeira versão da exclusão.
  await db.criarMarca(tenantId, 'Marca 2');
  await db.criarConversa(tenantId, userId, { titulo: 'oi', mensagens: [{ papel: 'pessoa', texto: 'aviso' }] });
  await db.criarCampanha(tenantId, userId, { nome: 'Campanha', resultado: { telas: [] } });
  await db.registrarEvento(tenantId, userId, 'teste');
  await db.registrarUsoIA(tenantId, { tipo: 'conversa', creditos: 0, custoCentavos: 1 });
  await db.criarMural(tenantId, 'SOBRA' + Date.now().toString(36).slice(-3).toUpperCase(), 'Mural');
  await db.apagarTenant(tenantId);

  const arquivo = fs.readdirSync(process.env.DATA_DIR).find((f) => f.endsWith('.db'));
  const s = new DatabaseSync(path.join(process.env.DATA_DIR, arquivo), { readOnly: true });
  const tabelas = s.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  const sobras = [];
  for (const t of tabelas) {
    const cols = s.prepare('PRAGMA table_info(' + t + ')').all().map((c) => c.name);
    if (!cols.includes('tenant_id') || t === 'banco') continue; // o banco de imagens aprovado perde o tenant, por regra
    const n = s.prepare('SELECT COUNT(*) AS n FROM ' + t + ' WHERE tenant_id = ?').get(tenantId).n;
    if (n) sobras.push(t + ': ' + n);
  }
  assert.deepEqual(sobras, [], 'sobrou dado da conta apagada');
  assert.equal(s.prepare('SELECT COUNT(*) AS n FROM tenants WHERE id = ?').get(tenantId).n, 0);
});

test('a exportação leva também marcas, memória, conversas, campanhas, uso da IA e chamados', async () => {
  const { tenantId, userId } = await db.createAccount('exporta' + Date.now() + '@teste.local', 'x', 'Loja Exporta', 'Dono');
  await db.criarConversa(tenantId, userId, { titulo: 'oi' });
  const d = await db.dadosDoTenant(tenantId);
  for (const k of ['marcas', 'memoriaDaIA', 'conversas', 'campanhas', 'usoDaIA', 'chamados', 'acessosDoSuporte']) {
    assert.ok(k in d, 'a exportação não tem ' + k);
  }
  assert.equal(d.conversas.length, 1);
  const pg = fs.readFileSync(path.join(RAIZ, 'server/db-postgres.js'), 'utf8');
  for (const k of ['marcas:', 'memoriaDaIA:', 'conversas:', 'campanhas:', 'usoDaIA:', 'chamados:', 'acessosDoSuporte:']) {
    assert.ok(pg.includes(k), 'o Postgres exporta diferente do SQLite: falta ' + k);
  }
});

test('apagar o mural apaga as fotos, o IP e a mídia, e devolve as chaves dos arquivos', async () => {
  const { tenantId } = await db.createAccount('mural' + Date.now() + '@teste.local', 'x', 'Loja Mural', 'Dono');
  const m = await db.criarMural(tenantId, 'MUR' + Date.now().toString(36).slice(-3).toUpperCase(), 'Festa');
  await db.createMedia({ id: 'med_mural_' + Date.now(), tenantId, name: 'foto', mime: 'image/jpeg', size: 10, key: 'chave/foto1.jpg', url: '/media/x/foto1.jpg', origem: 'mural' });
  await db.addFotoMural(m.id, tenantId, { url: '/media/x/foto1.jpg', chave: 'chave/foto1.jpg', autor: 'Ana', ip: '10.0.0.1' });
  const chaves = await db.removerMural(m.id, tenantId);
  assert.deepEqual(chaves, ['chave/foto1.jpg'], 'quem chamou apaga o arquivo com estas chaves');
  assert.equal((await db.listarFotosMural(m.id)).length, 0, 'a foto (com o IP) ficou');
  assert.ok(!(await db.listMedia(tenantId)).some((x) => x.url === '/media/x/foto1.jpg'), 'a linha da mídia ficou');
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 5400 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    if (o.raw) req.write(o.raw);
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('a TV recebe só os aniversariantes da semana, sem matrícula; mídia em uso pede confirmação', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-lgpd-srv-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'lgpd' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }));
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  const daTv = { 'x-device-token': tv.deviceToken };
  await pedir('/api/devices/' + tv.id + '/config', { headers: daTv });
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);

  // Aniversariantes: amanhã (entra) e daqui a 3 meses (não entra).
  const d = (n) => { const x = new Date(Date.now() + n * 864e5); return String(x.getDate()).padStart(2, '0') + '/' + String(x.getMonth() + 1).padStart(2, '0'); };
  const imp = await pedir('/api/birthdays/import', { method: 'POST', cookie: c, json: { rows: [
    { nome: 'Ana Amanhã', matricula: '1001', nascimento: d(1), cargo: 'RH' },
    { nome: 'Bruno Longe', matricula: '1002', nascimento: d(90), cargo: 'Produção' },
  ] } });
  assert.equal(imp.status, 200, JSON.stringify(imp.json));
  const naTv = (await pedir('/api/devices/' + tv.id + '/birthdays', { headers: daTv })).json.birthdays;
  assert.deepEqual(naTv.map((p) => p.nome), ['Ana Amanhã'], 'só a semana vai para a TV');
  assert.ok(!('matricula' in naTv[0]), 'a matrícula não sai do servidor');

  // Uma foto subida e posta na TV.
  const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');
  const up = await pedir('/api/media?name=foto.png&mime=image/png', { method: 'POST', cookie: c, raw: png, headers: { 'Content-Type': 'image/png' } });
  assert.equal(up.status, 201, JSON.stringify(up.json));
  const cfg = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'image', url: up.json.url }] } } };
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: c, json: cfg })).status, 200);

  const sem = await pedir('/api/media/' + up.json.id, { method: 'DELETE', cookie: c });
  assert.equal(sem.status, 409);
  assert.equal(sem.json.code, 'midia-em-uso');
  assert.ok(sem.json.usos.some((u) => /na TV/.test(u)), JSON.stringify(sem.json.usos));
  const com = await pedir('/api/media/' + up.json.id + '?forcar=1', { method: 'DELETE', cookie: c });
  assert.equal(com.status, 200, 'confirmado, apaga');
});
