/*
 * O Postgres de verdade (produção no Railway), pelo HTTP, de ponta a ponta.
 *
 * As fases 11, 12 e 13 nasceram testadas só no SQLite: planilha de preços,
 * aprovação antes de ir ao ar, lojas por membro, a chamada de senha, a
 * exportação e a exclusão da conta. Aqui o servidor sobe com DATABASE_URL e
 * cada caminho roda contra um Postgres de verdade.
 *
 * Só roda com TEST_DATABASE_URL (um banco que pode ser sujado; ex.:
 * postgres://mt@localhost:5439/multitelas). Sem ele, pula: o `npm test` do
 * dia a dia e o CI continuam sem precisar de Postgres.
 *
 *   TEST_DATABASE_URL=postgres://mt@localhost:5439/multitelas node --test test/postgres.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const URL_PG = process.env.TEST_DATABASE_URL || '';
const RAIZ = path.join(__dirname, '..');
const PORTA = Number(process.env.TEST_PORT) || 5995;

function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.json !== undefined ? JSON.stringify(o.json) : null;
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(corpo ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, texto: txt, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('Postgres de verdade: lojas, aprovação, planilha, senha, exportar e excluir a conta', { skip: URL_PG ? false : 'sem TEST_DATABASE_URL' }, async (t) => {
  const { Pool } = require('pg');
  const pg = new Pool({ connectionString: URL_PG, ssl: false });
  t.after(() => pg.end());
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-pg-'));
  let saida = '';
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: URL_PG, PGSSL: 'disable', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  // O erro do Postgres aparece no log do servidor (a rota responde só "erro interno").
  for (const s of [servidor.stdout, servidor.stderr]) s.on('data', (c) => { saida = (saida + c).slice(-20000); });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* segue */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor não subiu com o Postgres:\n' + saida);
  // Nenhuma linha de nível "erro" no log (server/log.js) e nenhum stack solto.
  const semErro = () => assert.doesNotMatch(saida.replace(/\x1b\[[0-9;]*m/g, ''), /\d\d:\d\d:\d\d erro\b|erro interno|Error:/, 'o servidor registrou erro:\n' + saida);

  const n = Date.now();
  const cadastro = async (email, extra) => pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Pessoa', aceite: true, ...extra } });
  const emailDono = 'pg-dono' + n + '@teste.local';
  const dono = cookieDe(await cadastro(emailDono, { name: 'Clínica Rede', perfil: 'saude' }));
  assert.ok(dono, 'o cadastro não devolveu sessão');
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono, json: { plan: 'pro' } })).status, 200);
  const meDono = (await pedir('/api/auth/me', { cookie: dono })).json;
  const tenantId = meDono.tenant.id;
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'pg-gerente' + n + '@teste.local', role: 'member' } });
  assert.equal(convite.status, 201);
  const membro = cookieDe(await cadastro('pg-gerente' + n + '@teste.local', { inviteCode: convite.json.code, name: 'Gerente Centro' }));
  const meMembro = (await pedir('/api/auth/me', { cookie: membro })).json;
  assert.equal(meMembro.user.role, 'member');
  assert.equal(meMembro.tenant.id, tenantId);
  const outra = cookieDe(await cadastro('pg-fora' + n + '@teste.local', { name: 'Outra conta' }));

  /* ---- TVs, grupos ---- */
  const novaTv = async (grupo) => {
    const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
    assert.ok((await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: tv.code, nova: true } })).status < 300);
    if (grupo) assert.equal((await pedir('/api/devices/' + tv.id + '/grupo', { method: 'POST', cookie: dono, json: { grupo } })).status, 200);
    return tv;
  };
  const centro = await novaTv('Loja Centro');
  const norte = await novaTv('Loja Norte');
  const cfg = (titulo) => ({ settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo }] } } });
  const titulo = async (tv) => {
    const r = (await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } })).json;
    return r && r.zonas && r.zonas.principal.items[0] && r.zonas.principal.items[0].titulo;
  };
  const versao = async (tv, cookie) => Number((await pedir('/api/devices/' + tv.id + '/config', { cookie: cookie || dono })).headers['x-config-versao']) || 0;
  assert.equal((await pedir('/api/devices/' + centro.id + '/config', { method: 'PUT', cookie: dono, json: cfg('Centro antes') })).status, 200);
  assert.equal((await pedir('/api/devices/' + norte.id + '/config', { method: 'PUT', cookie: dono, json: cfg('Norte antes') })).status, 200);
  assert.equal(await titulo(centro), 'Centro antes');

  /* ---- lojas do membro (acesso_lojas) ---- */
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: dono, json: { grupos: ['Loja Centro'] } })).status, 200);
  // De novo, com outra lista: o ON CONFLICT troca a linha.
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: dono, json: { grupos: ['Loja Centro', 'Loja Norte'] } })).status, 200);
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: dono, json: { grupos: ['Loja Centro'] } })).status, 200);
  assert.deepEqual((await pedir('/api/lojas', { cookie: dono })).json.membros[meMembro.user.id], ['Loja Centro']);
  assert.deepEqual((await pedir('/api/devices', { cookie: membro })).json.devices.map((d) => d.id), [centro.id]);
  assert.equal((await pedir('/api/devices/' + norte.id + '/config', { method: 'PUT', cookie: membro, json: cfg('invadida') })).status >= 403, true);
  assert.equal(await titulo(norte), 'Norte antes');
  // Renomear a loja leva junto a permissão do membro.
  assert.equal((await pedir('/api/grupos/renomear', { method: 'POST', cookie: dono, json: { de: 'Loja Centro', para: 'Loja do Centro' } })).status, 200);
  assert.deepEqual((await pedir('/api/lojas', { cookie: dono })).json.membros[meMembro.user.id], ['Loja do Centro']);
  assert.deepEqual((await pedir('/api/devices', { cookie: membro })).json.devices.map((d) => d.id), [centro.id]);

  /* ---- a Agenda do membro de uma loja (calendario, alvo em JSON) ---- */
  const cal = (cookie, eventos) => pedir('/api/calendario', { method: 'POST', cookie, json: { eventos } });
  const evConta = (await cal(dono, [{ data: '2030-11-27', titulo: 'Black Friday', alvo: { tipo: 'todas' }, telas: [centro.id, norte.id] }])).json.eventos[0];
  const evMembro = await cal(membro, [{ data: '2030-12-01', titulo: 'Dia do pão', alvo: { tipo: 'todas' } }]);
  assert.equal(evMembro.status, 200, evMembro.texto);
  assert.deepEqual(evMembro.json.eventos[0].alvo, { tipo: 'grupos', nomes: ['Loja do Centro'] });
  assert.equal((await cal(membro, [{ data: '2030-12-01', titulo: 'x', alvo: { tipo: 'grupo', nome: 'Loja Norte' } }])).status, 403);
  assert.equal((await pedir('/api/calendario/' + evConta.id, { method: 'DELETE', cookie: membro })).status, 403);
  assert.deepEqual((await pedir('/api/calendario', { cookie: membro })).json.eventos.map((e) => [e.titulo, e.podeMudar, e.telas]),
    [['Black Friday', false, [centro.id]], ['Dia do pão', true, []]]);

  /* ---- aprovação (tenants.aprovacao, aprovacoes) ---- */
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono, json: { ligada: true } })).json.ligada, true);
  const [{ aprovacao: col }] = (await pg.query('SELECT aprovacao FROM tenants WHERE id = $1', [tenantId])).rows;
  assert.equal(col, 1);
  // A campanha que o membro põe "no ar" espera junto (a coluna `extra`, JSON).
  const campId = 'camp_pg' + n;
  await pg.query("INSERT INTO campanhas (id, tenant_id, user_id, nome, conversa_id, escopo, resultado, estado, telas, criado_em, atualizado_em, capa) VALUES ($1,$2,$3,'Pão quentinho','','null','{\"telas\":[]}','pronta','[]',$4,$4,'null')",
    [campId, tenantId, meDono.user.id, n]);
  const v1 = await versao(centro, membro);
  const pelaTela = await pedir('/api/devices/' + centro.id + '/config?versao=' + v1, { method: 'PUT', cookie: membro, json: cfg('Centro pedido 1') });
  assert.equal(pelaTela.status, 202, JSON.stringify(pelaTela.json));
  assert.equal(await titulo(centro), 'Centro antes');
  const peloLote = await pedir('/api/lote', { method: 'POST', cookie: membro, json: { itens: [{ id: centro.id, config: cfg('Centro pedido 2'), versao: v1 }], descricao: 'Oferta do dia' } });
  assert.equal(peloLote.status, 202);
  const pedidoId = peloLote.json.aprovacao.id;
  const campDentro = await pedir('/api/campanhas/' + campId, { method: 'PUT', cookie: membro, json: { estado: 'no_ar', telas: [centro.id] } });
  assert.equal(campDentro.status, 202, JSON.stringify(campDentro.json));
  // O pedido do lote trocou o da tela; a campanha vai junto no mesmo pedido (a coluna `extra`).
  assert.equal((await pedir('/api/aprovacoes/contagem', { cookie: dono })).json.n, 1);
  const fila = (await pedir('/api/aprovacoes', { cookie: dono })).json;
  assert.deepEqual(fila.pendentes.map((p) => p.id), [pedidoId]);
  assert.equal(JSON.parse((await pg.query('SELECT extra FROM aprovacoes WHERE id = $1', [pedidoId])).rows[0].extra).campanha.id, campId);
  assert.equal(typeof fila.pendentes[0].criadoEm, 'number');
  const aberto = (await pedir('/api/aprovacoes/' + pedidoId, { cookie: dono })).json;
  assert.equal(aberto.telas[0].antes.zonas.principal.items[0].titulo, 'Centro antes');
  assert.equal(aberto.telas[0].depois.zonas.principal.items[0].titulo, 'Centro pedido 2');
  assert.equal((await pedir('/api/aprovacoes/' + pedidoId, { cookie: outra })).status, 404);
  const aprovado = await pedir('/api/aprovacoes/' + pedidoId + '/aprovar', { method: 'POST', cookie: dono });
  assert.equal(aprovado.status, 200, JSON.stringify(aprovado.json));
  assert.equal(await titulo(centro), 'Centro pedido 2');
  assert.equal((await pedir('/api/aprovacoes/' + pedidoId + '/aprovar', { method: 'POST', cookie: dono })).status, 409);
  // A campanha foi junto: aprovada, fica no ar.
  assert.equal((await pg.query('SELECT estado FROM campanhas WHERE id = $1', [campId])).rows[0].estado, 'no_ar');
  // Recusar: o membro vê o porquê, e o sino dele conta até ele ver.
  const v2 = await versao(centro, membro);
  const p3 = (await pedir('/api/devices/' + centro.id + '/config?versao=' + v2, { method: 'PUT', cookie: membro, json: cfg('Preço errado') })).json.aprovacao.id;
  assert.equal((await pedir('/api/aprovacoes/' + p3 + '/recusar', { method: 'POST', cookie: dono, json: { motivo: 'O preço do pão está errado' } })).status, 200);
  const recusado = (await pedir('/api/aprovacoes', { cookie: membro })).json.minhas.find((p) => p.id === p3);
  assert.equal(recusado.estado, 'recusada');
  assert.equal(recusado.motivo, 'O preço do pão está errado');
  assert.ok((await pedir('/api/aprovacoes/contagem', { cookie: membro })).json.n >= 1);
  assert.equal((await pedir('/api/aprovacoes/vistas', { method: 'POST', cookie: membro })).status, 200);
  assert.equal((await pedir('/api/aprovacoes/contagem', { cookie: membro })).json.n, 0);
  // Dois revisores (o dono e um admin) aprovando AO MESMO TEMPO: no Postgres as
  // duas rotas correm de verdade em paralelo; só uma pode pôr no ar.
  const conviteAdm = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'pg-adm' + n + '@teste.local', role: 'admin' } });
  const adm = cookieDe(await cadastro('pg-adm' + n + '@teste.local', { inviteCode: conviteAdm.json.code, name: 'Admin' }));
  const vPar = await versao(centro, membro);
  const pPar = (await pedir('/api/devices/' + centro.id + '/config?versao=' + vPar, { method: 'PUT', cookie: membro, json: cfg('Centro em paralelo') })).json.aprovacao.id;
  const juntos = await Promise.all([dono, adm, dono].map((c) => pedir('/api/aprovacoes/' + pPar + '/aprovar', { method: 'POST', cookie: c })));
  assert.deepEqual(juntos.map((r) => r.status).sort(), [200, 409, 409], 'aprovação dupla: ' + juntos.map((r) => r.status));
  assert.equal(await titulo(centro), 'Centro em paralelo');
  assert.equal((await pg.query("SELECT COUNT(*)::int AS n FROM lotes WHERE tenant_id = $1 AND descricao LIKE 'Aprovado:%'", [tenantId])).rows[0].n, 2, 'o pedido foi ao ar duas vezes');
  // Desistir.
  const v3 = await versao(centro, membro);
  const p4 = (await pedir('/api/devices/' + centro.id + '/config?versao=' + v3, { method: 'PUT', cookie: membro, json: cfg('Mudei de ideia') })).json.aprovacao.id;
  assert.equal((await pedir('/api/aprovacoes/' + p4, { method: 'DELETE', cookie: membro })).status, 200);
  assert.equal((await pedir('/api/aprovacoes/contagem', { cookie: dono })).json.n, 0);
  // Desligada: o membro volta a pôr direto.
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono, json: { ligada: false } })).json.ligada, false);
  assert.equal((await pedir('/api/devices/' + centro.id + '/config', { method: 'PUT', cookie: membro, json: cfg('Centro direto') })).status, 200);
  assert.equal(await titulo(centro), 'Centro direto');

  /* ---- campanha de formato velho (reteste da fase 10) e todas as TVs de uma vez ---- */
  await pg.query("INSERT INTO campanhas (id, tenant_id, user_id, nome, conversa_id, escopo, resultado, estado, telas, criado_em, atualizado_em, capa, arquivada) VALUES ($1,$2,'',NULL,'','{}','{\"telas\":\"x\"}','estado-velho','\"x\"',$3,$3,'{}',NULL), ($4,$2,'','Corrompida','','nao-json','nao-json','pronta','nao-json',$3,$3,'nao-json',0)",
    ['camp_pgvelha1' + n, tenantId, n - 6e7, 'camp_pgvelha2' + n]);
  const listaCamp = await pedir('/api/campanhas', { cookie: dono });
  assert.equal(listaCamp.status, 200, listaCamp.texto);
  assert.equal(listaCamp.json.campanhas.length, 3);
  const velha = (await pedir('/api/campanhas/camp_pgvelha1' + n, { cookie: dono })).json.campanha;
  assert.deepEqual([velha.telas, velha.resultado.telas], [[], []]);
  assert.deepEqual(Object.keys((await pedir('/api/devices/configs', { cookie: membro })).json.configs), [centro.id], 'o membro leu a programação da outra loja');
  assert.deepEqual(Object.keys((await pedir('/api/devices/estados', { cookie: membro })).json.estados), [centro.id]);

  /* ---- planilha de preços (CSV enviado, sem internet) ---- */
  const csv = 'Item;Preço\nCafé;5,00\nPão de queijo;4,50\nBolo de cenoura;12';
  const criada = await pedir('/api/planilhas', { method: 'POST', cookie: dono, json: { nome: 'Cardápio', csv } });
  assert.equal(criada.status, 200, JSON.stringify(criada.json));
  assert.equal(criada.json.erro, undefined);
  assert.deepEqual(criada.json.planilha.itens.map((i) => [i.item, i.preco]), [['Café', 5], ['Pão de queijo', 4.5], ['Bolo de cenoura', 12]]);
  assert.equal(typeof criada.json.planilha.ultimoOk, 'number');
  const plId = criada.json.planilha.id;
  const daTv = (await pedir('/api/devices/' + norte.id + '/planilhas', { headers: { 'x-device-token': norte.deviceToken } })).json;
  assert.equal(daTv.planilhas.length, 1);
  assert.equal(daTv.planilhas[0].itens[1].item, 'Pão de queijo');
  const trocada = await pedir('/api/planilhas/' + plId, { method: 'PUT', cookie: dono, json: { nome: 'Cardápio do dia', csv: 'Café;6' } });
  assert.equal(trocada.status, 200, JSON.stringify(trocada.json));
  assert.equal(trocada.json.planilha.nome, 'Cardápio do dia');
  assert.deepEqual(trocada.json.planilha.itens.map((i) => i.preco), [6]);
  assert.equal((await pedir('/api/planilhas/' + plId + '/atualizar', { method: 'POST', cookie: dono })).status, 200);
  assert.equal((await pedir('/api/planilhas', { cookie: membro })).json.planilhas.length, 1, 'o membro lê');
  assert.equal((await pedir('/api/planilhas/' + plId, { cookie: outra, method: 'PUT', json: { nome: 'x' } })).status, 404);
  // Uma segunda, para a exclusão da conta levar.
  assert.equal((await pedir('/api/planilhas', { method: 'POST', cookie: dono, json: { nome: 'Bebidas', csv: 'Suco;7\nÁgua;3' } })).status, 200);

  /* ---- indicadores (push), com o anterior ---- */
  const con = await pedir('/api/kpis/conectores', { method: 'POST', cookie: dono, json: { nome: 'ERP', modo: 'push' } });
  assert.ok(con.status < 300, JSON.stringify(con.json));
  const entrada = (v) => pedir('/api/kpis/entrada', { method: 'POST', headers: { Authorization: 'Bearer ' + con.json.token }, json: { indicadores: [{ chave: 'vendas', nome: 'Vendas', valor: v, unidade: 'R$', meta: 1000 }] } });
  assert.equal((await entrada(800)).status, 200);
  assert.equal((await entrada(900.5)).status, 200);
  const ind = (await pedir('/api/devices/' + centro.id + '/kpis', { headers: { 'x-device-token': centro.deviceToken } })).json.indicadores[0];
  assert.deepEqual([ind.valor, ind.anterior, ind.meta], [900.5, 800, 1000]);

  /* ---- a chamada de senha (senha_filas, senha_chamadas) ---- */
  const local = { tipo: 'guiche', numero: 2 };
  const s1 = await pedir('/api/senha/proxima', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte', prefixo: 'A', local } });
  assert.equal(s1.status, 200, JSON.stringify(s1.json));
  const s2 = await pedir('/api/senha/proxima', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte', prefixo: 'A', local } });
  assert.equal(s2.status, 200);
  assert.equal(s2.json.proximos.A, 3, 'a fila não andou: ' + JSON.stringify(s2.json));
  const atualDe = (r) => r.json.atual || r.json.chamada || (r.json.chamadas && r.json.chamadas[0]);
  assert.ok(JSON.stringify(atualDe(s2)).includes('2'), JSON.stringify(s2.json));
  // Outra letra e outra fila (sem grupo = todas as TVs) andam separadas.
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte', prefixo: 'P', local } })).json.proximos.P, 2);
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: dono, json: { grupo: '', prefixo: '', local } })).json.proximos[''], 2);
  const escolhido = await pedir('/api/senha/chamar', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte', prefixo: 'A', numero: 42, local: { tipo: 'consultorio', numero: 5 } } });
  assert.equal(escolhido.status, 200, JSON.stringify(escolhido.json));
  assert.equal(escolhido.json.proximos.A, 3, 'chamar um número escolhido não anda a fila');
  const re = await pedir('/api/senha/rechamar', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte' } });
  assert.equal(re.status, 200, JSON.stringify(re.json));
  const naTv = (await pedir('/api/devices/' + norte.id + '/senha', { headers: { 'x-device-token': norte.deviceToken } })).json;
  assert.ok(JSON.stringify(naTv).includes('42'), 'a TV da loja não vê a chamada: ' + JSON.stringify(naTv));
  const lidas = (await pg.query('SELECT numero, local_num, em, tipo FROM senha_chamadas WHERE tenant_id = $1 ORDER BY em', [tenantId])).rows;
  assert.equal(lidas.length, 6);
  assert.deepEqual(lidas.slice(-2).map((l) => [l.numero, l.local_num, l.tipo]), [[42, 5, 'numero'], [42, 5, 'rechamada']]);
  // O membro (agora só na Loja do Centro) não chama a fila da outra loja.
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: membro, json: { grupo: 'Loja Norte', local } })).status, 403);
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: membro, json: { grupo: 'Loja do Centro', local } })).status, 200);
  const zerada = await pedir('/api/senha/zerar', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte' } });
  assert.equal(zerada.status, 200);
  assert.equal(zerada.json.proximos.A, undefined);
  assert.equal((await pg.query("SELECT COUNT(*)::int AS n FROM senha_chamadas WHERE tenant_id = $1 AND grupo = 'Loja Norte'", [tenantId])).rows[0].n, 0);
  assert.equal((await pg.query("SELECT COUNT(*)::int AS n FROM senha_filas WHERE tenant_id = $1 AND grupo = ''", [tenantId])).rows[0].n, 1, 'zerou a fila de outra loja');
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte', prefixo: 'A', local } })).json.proximos.A, 2, 'depois de zerar, volta a 1');
  // Duas recepções apertando "Chamar a próxima" juntas: cada uma leva um número, sem repetir.
  const rajada = await Promise.all(Array.from({ length: 12 }, () => pedir('/api/senha/proxima', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte', prefixo: 'C', local } })));
  assert.ok(rajada.every((r) => r.status === 200), rajada.map((r) => r.status).join());
  const numeros = (await pg.query("SELECT numero FROM senha_chamadas WHERE tenant_id = $1 AND prefixo = 'C' ORDER BY numero", [tenantId])).rows.map((r) => r.numero);
  assert.deepEqual(numeros, Array.from({ length: 12 }, (_, i) => i + 1), 'número repetido ou pulado');

  /* ---- relatório por loja (exibicoes, device_id = ANY) ---- */
  const hora = Date.now() - 3600 * 1000;
  for (const [tv, vezes] of [[centro, 3], [norte, 5]]) {
    const ex = await pedir('/api/devices/' + tv.id + '/exibicoes', { method: 'POST', headers: { 'x-device-token': tv.deviceToken }, json: { lote: 'lote' + tv.id.slice(-8), itens: [{ hora, zona: 'principal', chave: 'pao', rotulo: 'Pão', tipo: 'text', vezes, segundos: vezes * 10 }] } });
    assert.equal(ex.status, 200);
  }
  assert.equal((await pedir('/api/relatorio', { cookie: dono })).json.totais.vezes, 8);
  assert.equal((await pedir('/api/relatorio', { cookie: membro })).json.totais.vezes, 3, 'o membro viu a outra loja');
  assert.equal((await pedir('/api/relatorio?grupo=' + encodeURIComponent('Loja Norte'), { cookie: membro })).json.totais.vezes, 0);
  assert.equal((await pedir('/api/relatorio?grupo=' + encodeURIComponent('loja norte'), { cookie: dono })).json.totais.vezes, 5);

  /* ---- exportar (LGPD) ---- */
  assert.equal((await pedir('/api/privacidade/exportar', { cookie: membro })).status, 403);
  const exp = await pedir('/api/privacidade/exportar', { cookie: dono });
  assert.equal(exp.status, 200);
  const d = exp.json.dados;
  assert.equal(d.conta.id, tenantId);
  assert.equal(d.usuarios.length, 3);
  assert.equal(d.telas.length, 2);
  assert.equal(d.planilhas.length, 2);
  assert.ok(d.pedidosDeAprovacao.length >= 4);
  assert.deepEqual(d.lojasDaEquipe.map((l) => JSON.parse(l.grupos)), [['Loja do Centro']]);
  assert.ok(d.chamadasDeSenha.length >= 3);
  assert.equal(typeof d.chamadasDeSenha[0].em, 'number', 'o BIGINT saiu como texto');
  assert.ok(d.indicadores.length === 1 && d.conectoresDeIndicadores.length === 1);
  assert.doesNotMatch(JSON.stringify(d), /pass_hash|senha-de-teste/);
  semErro();

  /* ---- excluir a conta: nenhuma linha dela em tabela nenhuma ---- */
  assert.equal((await pedir('/api/privacidade/conta', { method: 'DELETE', cookie: dono, json: { confirmacao: 'outro@teste.local' } })).status, 400);
  const fora = await pedir('/api/privacidade/conta', { method: 'DELETE', cookie: dono, json: { confirmacao: emailDono } });
  assert.equal(fora.status, 200, fora.texto + '\n' + saida.slice(-3000));
  const tabelas = (await pg.query("SELECT table_name FROM information_schema.columns WHERE column_name = 'tenant_id' AND table_schema = current_schema()")).rows.map((r) => r.table_name);
  assert.ok(tabelas.includes('senha_chamadas') && tabelas.includes('aprovacoes') && tabelas.includes('planilhas'));
  const sobras = [];
  for (const tab of tabelas) {
    // Fica de propósito: o banco de imagens aprovado perde o tenant; o registro de acesso do suporte é prova (LGPD art. 37).
    if (tab === 'banco' || tab === 'acessos_suporte') continue;
    const { rows: [{ n: q }] } = await pg.query('SELECT COUNT(*)::int AS n FROM ' + tab + ' WHERE tenant_id = $1', [tenantId]);
    if (q) sobras.push(tab + ': ' + q);
  }
  assert.deepEqual(sobras, [], 'sobrou dado da conta apagada');
  assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM tenants WHERE id = $1', [tenantId])).rows[0].n, 0);
  assert.equal((await pg.query('SELECT COUNT(*)::int AS n FROM acesso_lojas WHERE user_id = $1', [meMembro.user.id])).rows[0].n, 0);
  assert.equal((await pedir('/api/auth/me', { cookie: membro })).status, 401, 'a sessão do membro sobreviveu à conta');
  // A outra conta segue de pé.
  assert.equal((await pedir('/api/auth/me', { cookie: outra })).status, 200);
  semErro();
});
