/*
 * As AÇÕES do operador (PLANO §7.2, EXECUTOR item 13): recarregar uma TV,
 * estender o teste, registrar o contrato anual e ENTRAR COMO O CLIENTE.
 *
 * Entrar como o cliente é a ação perigosa, e por isso é provada aqui com o
 * servidor de verdade, por HTTP: só operador entra; só com motivo; a sessão é
 * marcada, curta e registrada; lá dentro, cobrança, equipe, senha e dados
 * pessoais ficam com o dono; e a volta devolve a sessão do operador.
 * Conferido também no navegador (painel do operador → ficha → Entrar →
 * faixa de suporte → Voltar).
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const S = require('../server/suporte.js');
const plans = require('../server/plans.js');

const RAIZ = path.join(__dirname, '..');
const DIA = 864e5;

test('a regra: o que é do dono não se faz pela sessão de suporte', () => {
  // Como o servidor parte o caminho: ['api', 'billing', ...].
  const p = (c) => c.split('/').filter(Boolean);
  for (const [m, c] of [['POST', '/api/billing/checkout'], ['DELETE', '/api/billing/assinatura'], ['POST', '/api/billing/pacote'],
    ['POST', '/api/team/invites'], ['DELETE', '/api/team/members/x'], ['POST', '/api/auth/password'], ['POST', '/api/auth/profile'],
    ['GET', '/api/privacidade/exportar'], ['POST', '/api/privacidade/excluir']]) {
    assert.ok(S.bloqueio(p(c), m), m + ' ' + c + ' passou no acesso de suporte');
  }
  for (const [m, c] of [['GET', '/api/billing'], ['GET', '/api/devices'], ['PUT', '/api/devices/x/config'],
    ['POST', '/api/ai/campanha'], ['POST', '/api/media'], ['POST', '/api/auth/voltar'], ['GET', '/api/team']]) {
    assert.equal(S.bloqueio(p(c), m), '', m + ' ' + c + ' foi bloqueado, e é justamente para isso que o suporte entra');
  }
});

test('motivo obrigatório, dono certo, e o teste estendido nunca encurta', () => {
  assert.equal(S.motivoValido('  oi  '), '');
  assert.equal(S.motivoValido('cliente ligou:   TV não atualiza'), 'cliente ligou: TV não atualiza');
  assert.equal(S.motivoValido('x'.repeat(500)).length, S.MOTIVO.max);
  assert.equal(S.donoDa([{ id: 'm', role: 'member', created_at: 1 }, { id: 'b', role: 'owner', created_at: 5 }, { id: 'a', role: 'owner', created_at: 2 }]).id, 'a');
  assert.equal(S.donoDa([{ id: 'm', role: 'member' }]), null);
  assert.equal(S.TTL_MS, 60 * 60 * 1000);
  const nasceu = Date.parse('2026-10-01T12:00:00Z');
  const t = { created_at: nasceu };
  assert.equal(plans.fimDoTeste(t), nasceu + 14 * DIA);
  assert.equal(plans.fimDoTeste({ ...t, teste_ate: nasceu + 21 * DIA }), nasceu + 21 * DIA, 'estendido');
  assert.equal(plans.fimDoTeste({ ...t, teste_ate: nasceu + 3 * DIA }), nasceu + 14 * DIA, 'estender nunca encurta');
});

/* ---------- de ponta a ponta, com o servidor de verdade ---------- */

const PORTA = 4030 + Math.floor(Math.random() * 9);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(JSON.stringify(o.body));
    req.end();
  });
}
// Junta os Set-Cookie num cabeçalho Cookie (o que tem valor vazio sai).
function jarra(...listas) {
  const mapa = {};
  for (const l of listas) for (const c of l) { const [kv] = c.split(';'); const i = kv.indexOf('='); mapa[kv.slice(0, i)] = kv.slice(i + 1); }
  return Object.entries(mapa).filter(([, v]) => v).map(([k, v]) => k + '=' + v).join('; ');
}

test('entrar como cliente: só operador, só com motivo, marcado, limitado, registrado e com volta', async (t) => {
  const marca = Date.now();
  const opEmail = 'op' + marca + '@teste.local';
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', ADMIN_EMAILS: opEmail },
  });
  t.after(() => servidor.kill());
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const conta = (email, name) => pedir('/api/auth/signup', { method: 'POST', body: { email, password: 'senha-de-teste-123', name, aceite: true } });
  const op = await conta(opEmail, 'Operação');
  const cli = await conta('cliente' + marca + '@teste.local', 'Loja do Teste');
  assert.equal(op.status, 201); assert.equal(cli.status, 201);
  const cOp = jarra(op.cookies);
  const cCli = jarra(cli.cookies);
  const idCliente = cli.json.tenant.id;

  // Cliente não é operador: a porta nem existe para ele.
  assert.equal((await pedir('/api/plataforma/contas/' + idCliente + '/entrar', { method: 'POST', cookie: cCli, body: { motivo: 'quero ver a conta dos outros' } })).status, 404);
  // Operador sem motivo não entra.
  assert.equal((await pedir('/api/plataforma/contas/' + idCliente + '/entrar', { method: 'POST', cookie: cOp, body: { motivo: 'oi' } })).status, 400);

  const entrou = await pedir('/api/plataforma/contas/' + idCliente + '/entrar', { method: 'POST', cookie: cOp, body: { motivo: 'cliente ligou: a TV da vitrine não atualiza' } });
  assert.equal(entrou.status, 200);
  const sessaoSuporte = entrou.cookies.find((c) => c.startsWith('mt_session='));
  assert.match(sessaoSuporte, /Max-Age=3600/, 'a sessão de suporte vale uma hora');
  assert.match(sessaoSuporte, /HttpOnly/);
  const cSup = jarra(op.cookies, entrou.cookies);

  const me = await pedir('/api/auth/me', { cookie: cSup });
  assert.equal(me.json.tenant.id, idCliente, 'entrou na conta do cliente');
  assert.equal(me.json.user.role, 'owner');
  assert.equal(me.json.suporte.operador, opEmail, 'a sessão é MARCADA');
  assert.equal(me.json.operador, false, 'lá dentro não há menu de operador');

  // O que é do dono fica com o dono; o resto funciona.
  assert.equal((await pedir('/api/billing/checkout', { method: 'POST', cookie: cSup, body: { plan: 'pro' } })).status, 403);
  assert.equal((await pedir('/api/auth/password', { method: 'POST', cookie: cSup, body: { atual: 'senha-de-teste-123', nova: 'outra-senha-123' } })).status, 403);
  assert.equal((await pedir('/api/privacidade/exportar', { cookie: cSup })).status, 403);
  assert.equal((await pedir('/api/plataforma/metricas', { cookie: cSup })).status, 404);
  assert.equal((await pedir('/api/devices', { cookie: cSup })).status, 200);

  // O registro: quem, onde e por quê.
  const ficha = await pedir('/api/plataforma/contas/' + idCliente, { cookie: cOp });
  assert.equal(ficha.json.acessos[0].operador, opEmail);
  assert.match(ficha.json.acessos[0].motivo, /TV da vitrine/);

  // A volta devolve a sessão do operador, e a de suporte morre.
  const volta = await pedir('/api/auth/voltar', { method: 'POST', cookie: cSup });
  assert.equal(volta.status, 200);
  assert.equal(volta.json.voltou, true);
  const cDepois = jarra(op.cookies, entrou.cookies, volta.cookies);
  const eu = await pedir('/api/auth/me', { cookie: cDepois });
  assert.equal(eu.json.user.email, opEmail);
  assert.equal(eu.json.suporte, null);
  assert.equal((await pedir('/api/auth/me', { cookie: cSup.replace(/mt_volta=[^;]+;?\s*/, '') })).status, 401, 'a sessão de suporte continuou valendo depois da volta');

  // Estender o teste do cliente: até 30 dias, nunca encurta.
  assert.equal((await pedir('/api/plataforma/contas/' + idCliente + '/estender', { method: 'POST', cookie: cOp, body: { dias: 90 } })).status, 400);
  const est = await pedir('/api/plataforma/contas/' + idCliente + '/estender', { method: 'POST', cookie: cOp, body: { dias: 7 } });
  assert.equal(est.status, 200);
  assert.ok(est.json.terminaEm > Date.now() + 20 * DIA);
});
