/*
 * Excluir conversa com a IA (pedido do dono, 24/10: "tem que ter confirmação
 * para não apagar sem querer").
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

test('o painel só exclui depois da confirmação, com o nome da conversa e o aviso de que não dá para desfazer', () => {
  const l = ler('web', 'src', 'components', 'criar', 'ListaDeConversas.jsx');
  const excluir = l.slice(l.indexOf('async function excluir(c)'), l.indexOf('async function arquivar('));
  assert.ok(excluir.indexOf('await confirmar(') >= 0 && excluir.indexOf('await confirmar(') < excluir.indexOf('criar.excluirConversa('), 'exclui sem perguntar');
  assert.match(excluir, /if \(!ok\) return;/);
  assert.match(excluir, /Não dá para desfazer\./);
  assert.match(excluir, /botao: 'Excluir', perigo: true/);
  assert.match(excluir, /A campanha que ela criou continua em Criados\./);
  assert.match(l, /aria-label=\{'Excluir ' \+ \(c\.titulo \|\| 'a conversa'\)\}/);
  // A conversa aberta que foi excluída: o Criar volta para uma nova.
  assert.match(ler('web', 'src', 'pages', 'CriarPage.jsx'), /onExcluiu=\{\(id\) => \{ if \(conversa && conversa\.id === id\) nova\(\); \}\}/);
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) assert.match(ler(f), /async function removerConversa\(tenantId, id\)/, f);
});

const PORTA = 8600 + Math.floor(Math.random() * 9);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (x) => { corpo += x; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(JSON.stringify(o.body));
    req.end();
  });
}
const jarra = (lista) => lista.map((x) => x.split(';')[0]).filter((kv) => kv.split('=')[1]).join('; ');

test('a rota: exclui a conversa da conta (some da lista e da leitura); de outra conta, não', async (t) => {
  const marca = Date.now();
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'mt-excluir-')), AI_PROVIDER: 'dev' },
  });
  t.after(() => servidor.kill());
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const conta = async (n) => jarra((await pedir('/api/auth/signup', { method: 'POST', body: { email: 'excluir' + n + marca + '@teste.local', password: 'senha-de-teste-123', name: 'Loja ' + n, aceite: true } })).cookies);
  const a = await conta('a');
  const b = await conta('b');

  const conv = await pedir('/api/ai/conversa', { method: 'POST', cookie: a, body: { texto: 'Aviso: a loja fecha às 14h na sexta' } });
  assert.equal(conv.status, 200);
  const id = conv.json.conversa.id;
  assert.ok((await pedir('/api/conversas', { cookie: a })).json.conversas.some((c) => c.id === id));

  // Outra conta não exclui (nem descobre que a conversa existe).
  assert.equal((await pedir('/api/conversas/' + id, { method: 'DELETE', cookie: b })).status, 404);
  assert.equal((await pedir('/api/conversas/' + id, { cookie: a })).status, 200);

  assert.equal((await pedir('/api/conversas/' + id, { method: 'DELETE', cookie: a })).status, 200);
  assert.equal((await pedir('/api/conversas/' + id, { cookie: a })).status, 404);
  assert.ok(!(await pedir('/api/conversas', { cookie: a })).json.conversas.some((c) => c.id === id));
});
