/*
 * Fase 13 do plano de ação: equipe e redes.
 *
 *   A. Aprovação antes de ir ao ar: com a chave ligada, o que o MEMBRO põe
 *      na TV vira pedido; o dono aprova (vai ao ar sozinho, com a versão
 *      conferida) ou recusa (o membro vê o porquê).
 *   B. Permissão por loja: o membro de uma loja só vê e muda as TVs dela —
 *      e quem barra é o SERVIDOR, em toda rota de TV.
 *
 * "Pronto quando: um membro sem permissão não publica nem mexe em outra
 * loja (403/404), e a peça aprovada vai ao ar sozinha." Os testes de baixo
 * tentam os caminhos proibidos direto na API, sem o painel.
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
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

/* ---------------- as regras, sem servidor ---------------- */

test('permissões: sem regra vê tudo; com lojas, só as TVs delas (sem grupo, nenhuma)', () => {
  const P = require('../server/permissoes.js');
  const centro = { id: 'a', grupo: 'Loja Centro' };
  const norte = { id: 'b', grupo: 'Loja Norte' };
  const solta = { id: 'c', grupo: '' };
  const dono = { role: 'owner', lojas: null };
  const gerente = { role: 'member', lojas: ['loja  centro '] };
  assert.equal(P.podeTela(dono, norte), true);
  assert.equal(P.podeTela(gerente, centro), true, 'o grupo compara aparado e sem caixa');
  assert.equal(P.podeTela(gerente, norte), false);
  assert.equal(P.podeTela(gerente, solta), false, 'TV sem grupo não é de loja nenhuma');
  assert.equal(P.podeTela(null, centro), false);
  assert.deepEqual(P.filtrar(gerente, [centro, norte, solta]).map((d) => d.id), ['a']);
  assert.equal(P.podeGrupo(gerente, 'Loja Norte'), false);
  assert.equal(P.podeGrupo(gerente, ''), false, 'tirar do grupo tiraria a TV do alcance dele');
  assert.deepEqual(P.limparGrupos([' Centro ', 'centro', '', null, 'Norte']), ['Centro', 'Norte']);
  assert.equal(P.limparGrupos('Centro'), null);
});

test('o acesso de suporte não aprova nem escolhe lojas (é decisão do dono)', () => {
  const S = require('../server/suporte.js');
  assert.ok(S.bloqueio(['api', 'aprovacoes', 'apr_x', 'aprovar'], 'POST'));
  assert.ok(S.bloqueio(['api', 'aprovacoes', 'regra'], 'PUT'));
  assert.ok(S.bloqueio(['api', 'lojas', 'usr_x'], 'PUT'));
  assert.equal(S.bloqueio(['api', 'aprovacoes'], 'GET'), '', 'ver a fila pode');
});

test('a sessão: dono e admin não pagam consulta; o membro leva as lojas e a aprovação da conta', async () => {
  const P = require('../server/permissoes.js');
  let consultas = 0;
  const db = {
    lojasDoUsuario: async () => { consultas++; return ['Centro']; },
    getTenant: async () => { consultas++; return { aprovacao: 1 }; },
  };
  const dono = await P.completarSessao(db, { role: 'owner', tenant_id: 't', user_id: 'u' });
  assert.equal(dono.lojas, null);
  assert.equal(dono.precisaAprovar, false, 'dono e admin põem direto');
  assert.equal(consultas, 0);
  const membro = await P.completarSessao(db, { role: 'member', tenant_id: 't', user_id: 'm' });
  assert.deepEqual(membro.lojas, ['Centro']);
  assert.equal(membro.precisaAprovar, true);
  assert.equal(await P.completarSessao(db, null), null);
});

test('renomear a loja leva junto a permissão de quem só via aquela loja', async () => {
  const P = require('../server/permissoes.js');
  const guardado = { m1: ['Centro', 'Norte'], m2: ['Sul'] };
  const db = { lojasDaConta: async () => guardado, salvarLojasDoUsuario: async (t, u, g) => { guardado[u] = g; } };
  await P.renomearNasLojas(db, 't', 'centro', 'Loja do Centro');
  assert.deepEqual(guardado.m1, ['Loja do Centro', 'Norte']);
  assert.deepEqual(guardado.m2, ['Sul']);
});

test('as tabelas novas existem nos dois bancos, com migração segura e saem com a conta', () => {
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const s = ler(f);
    assert.match(s, /CREATE TABLE IF NOT EXISTS aprovacoes/, f);
    assert.match(s, /CREATE TABLE IF NOT EXISTS acesso_lojas/, f);
    assert.match(s, /for \(const tabela of \['aprovacoes', 'acesso_lojas',/, f + ': a exclusão da conta deixa os pedidos para trás');
    assert.match(s, /pedidosDeAprovacao:/, f + ': a exportação (LGPD) não leva os pedidos');
  }
  assert.match(ler('server/db-sqlite.js'), /'aprovacao INTEGER'\]\) \{\s*garantirColuna\('tenants', col\);/);
  assert.match(ler('server/db-postgres.js'), /ALTER TABLE tenants ADD COLUMN IF NOT EXISTS aprovacao INTEGER;/);
});

test('o painel: o sino no topo, a página de aprovações, a chave e as lojas na Equipe, o relatório por loja', () => {
  assert.match(ler('web/src/components/layout/Topbar.jsx'), /<SinoAprovacoes onNavigate=\{onNavigate\}/);
  assert.match(ler('web/src/App.jsx'), /case 'aprovacoes': return <AprovacoesPage/);
  const team = ler('web/src/pages/TeamPage.jsx');
  assert.match(team, /<ChaveAprovacao podeMudar=\{canManage\} \/>/);
  assert.match(team, /<LojasDoMembro membro=\{m\}/);
  assert.match(ler('web/src/components/equipe/AprovacaoELojas.jsx'), /role="switch" aria-checked=\{ligada\}/);
  // Um violeta por tela: o switch é verde, e na página só o pedido aberto tem o Aprovar violeta.
  assert.doesNotMatch(ler('web/src/components/equipe/AprovacaoELojas.jsx'), /ligada \? 'border-transparent bg-accent/);
  const pagina = ler('web/src/pages/AprovacoesPage.jsx');
  assert.equal((pagina.match(/variant="primary"/g) || []).length, 2, 'Aprovar (normal ou por cima): um só aparece por vez');
  assert.match(pagina, /aberto === p\.id/);
  // O 202 vira "mandado para aprovação" no lugar do "foi para a TV".
  assert.match(ler('web/src/api.js'), /res\.status === 202 && data && data\.pendente/);
  assert.match(ler('web/src/lib/avisos.js'), /Mandado para aprovação\./);
  assert.match(ler('web/src/api.js'), /grupo=/);
  assert.match(ler('web/src/pages/RelatorioPage.jsx'), /<optgroup label="Por loja">/);
});

test('o aviso de "foi para a TV" logo depois de um pedido vira o aviso do pedido (e o Desfazer some)', async () => {
  const { pathToFileURL } = require('node:url');
  const A = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/avisos.js')).href);
  A.limpar();
  A.avisarPedidoDeAprovacao();
  A.aviso.ok('Pronto: está na TV.');
  A.emitir({ tom: 'desfazer', texto: 'Na TV.', acao: { rotulo: 'Desfazer', on() {} } });
  A.aviso.erro('x', 'Não deu.');
  const lista = A.listar();
  assert.deepEqual(lista.map((a) => a.texto), ['Mandado para aprovação.', 'Não deu.'], 'o erro continua aparecendo');
  A.limpar();
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6700 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('servidor: o membro de uma loja não alcança outra, e o que ele põe na TV espera o dono', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-f13-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const n = Date.now();
  const cadastro = async (email, extra) => pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Pessoa', aceite: true, ...extra } });
  const dono = cookieDe(await cadastro('dono' + n + '@teste.local', { name: 'Padaria Rede', perfil: 'comercio' }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono, json: { plan: 'pro' } })).status, 200);
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'gerente' + n + '@teste.local', role: 'member' } });
  assert.equal(convite.status, 201);
  const membro = cookieDe(await cadastro('gerente' + n + '@teste.local', { inviteCode: convite.json.code, name: 'Gerente Centro' }));
  const meMembro = (await pedir('/api/auth/me', { cookie: membro })).json;
  assert.equal(meMembro.user.role, 'member');
  const tenantId = meMembro.tenant.id;
  // Uma conta de fora, para a fila dela não ver a nossa.
  const outra = cookieDe(await cadastro('fora' + n + '@teste.local', { name: 'Outra loja' }));

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

  /* ---- B. permissão por loja ---- */
  // Só o dono escolhe as lojas; e só de quem é membro.
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: membro, json: { grupos: ['Loja Norte'] } })).status, 403, 'o membro deu loja a si mesmo');
  const meDono = (await pedir('/api/auth/me', { cookie: dono })).json;
  assert.equal((await pedir('/api/lojas/' + meDono.user.id, { method: 'PUT', cookie: dono, json: { grupos: ['Loja Centro'] } })).status, 400, 'dono não tem loja');
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: dono, json: { grupos: [] } })).status, 400);
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: outra, json: { grupos: ['Loja Centro'] } })).status, 404, 'outra conta mexeu na nossa equipe');
  const salvo = await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: dono, json: { grupos: ['Loja Centro'] } });
  assert.equal(salvo.status, 200);
  assert.deepEqual((await pedir('/api/lojas', { cookie: dono })).json.membros[meMembro.user.id], ['Loja Centro']);

  // A lista: só as TVs da loja dele.
  assert.deepEqual((await pedir('/api/devices', { cookie: membro })).json.devices.map((d) => d.id), [centro.id]);
  assert.equal((await pedir('/api/devices', { cookie: dono })).json.devices.length, 2, 'o dono continua vendo todas');
  // A programação de todas as TVs de uma vez e o "o que está passando": também só as dele.
  assert.deepEqual(Object.keys((await pedir('/api/devices/configs', { cookie: membro })).json.configs), [centro.id], 'o membro leu a programação da outra loja');
  assert.deepEqual(Object.keys((await pedir('/api/devices/estados?ids=' + norte.id + ',' + centro.id, { cookie: membro })).json.estados), [centro.id]);
  assert.equal(Object.keys((await pedir('/api/devices/configs', { cookie: dono })).json.configs).length, 2);
  // A TV de outra loja, pelo endereço direto: nada.
  for (const [metodo, sub, corpo] of [['GET', '/config'], ['PUT', '/config', cfg('invadida')], ['GET', ''], ['POST', '/comando', { acao: 'recarregar' }],
    ['POST', '/rename', { name: 'X' }], ['POST', '/expediente', {}], ['POST', '/audio', { acao: 'pausar' }], ['GET', '/estado'], ['POST', '/grupo', { grupo: 'Loja Centro' }]]) {
    const r = await pedir('/api/devices/' + norte.id + sub, { method: metodo, cookie: membro, json: corpo });
    assert.ok(r.status === 403 || r.status === 404, metodo + ' ' + sub + ' na TV de outra loja respondeu ' + r.status);
  }
  assert.equal(await titulo(norte), 'Norte antes', 'a TV da outra loja mudou');
  // Lote misturado (uma dele, uma de fora): recusado inteiro, nada muda.
  const misturado = await pedir('/api/lote', { method: 'POST', cookie: membro, json: { itens: [
    { id: centro.id, config: cfg('Centro novo'), versao: await versao(centro, membro) }, { id: norte.id, config: cfg('Norte invadida') }] } });
  assert.equal(misturado.status, 403);
  assert.equal(misturado.json.code, 'loja');
  assert.equal(await titulo(centro), 'Centro antes', 'a TV dele mudou mesmo com o lote recusado');
  assert.equal(await titulo(norte), 'Norte antes');
  // Mover a TV dele para a outra loja, ou renomear a loja da conta: não.
  assert.equal((await pedir('/api/devices/' + centro.id + '/grupo', { method: 'POST', cookie: membro, json: { grupo: 'Loja Norte' } })).status, 403);
  assert.equal((await pedir('/api/grupos/renomear', { method: 'POST', cookie: membro, json: { de: 'Loja Norte', para: 'Minha' } })).status, 403);
  // A senha (fase 12): o membro de uma loja não chama na fila de outra, nem na de "todas as TVs".
  const local = { tipo: 'guiche', numero: 1 };
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: membro, json: { grupo: 'Loja Norte', local } })).status, 403, 'chamou senha na outra loja');
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: membro, json: { grupo: '', local } })).status, 403, 'chamou senha em todas as TVs');
  assert.equal((await pedir('/api/senha/zerar', { method: 'POST', cookie: membro, json: { grupo: 'Loja Norte' } })).status, 403, 'zerou a fila da outra loja');
  const filaDele = await pedir('/api/senha?grupo=Loja%20Norte', { cookie: membro });
  assert.equal(filaDele.json.grupo, 'Loja Centro', 'a fila que ele vê é a da loja dele');
  assert.deepEqual(filaDele.json.grupos, ['Loja Centro']);
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: membro, json: { grupo: 'Loja Centro', local } })).status, 200, 'na loja dele, chama');
  // A planilha de preços vale para a conta inteira: o membro de uma loja não troca.
  assert.equal((await pedir('/api/planilhas', { method: 'POST', cookie: membro, json: { nome: 'X', csv: 'Café;5' } })).status, 403);
  assert.equal((await pedir('/api/automaticos', { method: 'PUT', cookie: membro, json: { aniversarios: { ligado: true } } })).status, 403);
  assert.deepEqual((await pedir('/api/automaticos', { cookie: membro })).json.telas.map((x) => x.id), [centro.id]);
  // Relatório: a TV de fora é 404; a loja de fora vem vazia; sem filtro, só as dele.
  const hora = Date.now() - 3600 * 1000;
  for (const [tv, vezes] of [[centro, 3], [norte, 5]]) {
    const ex = await pedir('/api/devices/' + tv.id + '/exibicoes', { method: 'POST', headers: { 'x-device-token': tv.deviceToken }, json: { lote: 'lote' + tv.id.slice(-8), itens: [{ hora, zona: 'principal', chave: 'pao', rotulo: 'Pão', tipo: 'text', vezes, segundos: vezes * 10 }] } });
    assert.equal(ex.status, 200);
  }
  assert.equal((await pedir('/api/relatorio?tela=' + norte.id, { cookie: membro })).status, 404);
  const relNorte = await pedir('/api/relatorio?grupo=' + encodeURIComponent('Loja Norte'), { cookie: membro });
  assert.equal(relNorte.status, 200);
  assert.equal(relNorte.json.totais.vezes, 0, 'o membro leu o relatório da outra loja');
  assert.equal((await pedir('/api/relatorio', { cookie: membro })).json.totais.vezes, 3, 'sem filtro, o membro vê só a loja dele');
  assert.equal((await pedir('/api/relatorio', { cookie: dono })).json.totais.vezes, 8);
  const porLoja = await pedir('/api/relatorio?grupo=' + encodeURIComponent('loja norte'), { cookie: dono });
  assert.equal(porLoja.json.totais.vezes, 5, 'o relatório por loja do dono');
  assert.deepEqual(porLoja.json.porTela.map((x) => x.id), [norte.id]);
  // Campanha mirando a TV de fora: 403.
  process.env.DATA_DIR = dados;
  const db = require('../server/db-sqlite.js');
  const camp = await db.criarCampanha(tenantId, meDono.user.id, { nome: 'Pão quentinho', resultado: { telas: [] } });
  const campFora = await pedir('/api/campanhas/' + camp.id, { method: 'PUT', cookie: membro, json: { estado: 'no_ar', telas: [norte.id] } });
  assert.equal(campFora.status, 403, 'campanha posta na TV de outra loja');
  assert.equal((await db.lerCampanha(tenantId, camp.id)).estado, 'pronta');
  // A Agenda: a data do membro fica nas lojas dele; a da conta inteira e a de outra loja ele não muda.
  const data = (titulo, extra) => ({ data: '2030-11-27', titulo, tipo: 'campanha', antecedencia: 7, ...extra });
  const salvarCal = (cookie, eventos) => pedir('/api/calendario', { method: 'POST', cookie, json: { eventos } });
  const daConta = (await salvarCal(dono, [data('Black Friday', { alvo: { tipo: 'todas' }, telas: [centro.id, norte.id] })])).json.eventos[0];
  const doNorte = (await salvarCal(dono, [data('Feira do Norte', { alvo: { tipo: 'grupo', nome: 'Loja Norte' }, telas: [norte.id] })])).json.eventos[0];
  const vista = (await pedir('/api/calendario', { cookie: membro })).json;
  assert.deepEqual(vista.lojas, ['Loja Centro']);
  assert.deepEqual(vista.eventos.map((e) => [e.titulo, e.podeMudar, e.telas]), [['Black Friday', false, [centro.id]]], 'o membro viu a data da outra loja (ou as TVs dela)');
  assert.equal((await pedir('/api/calendario', { cookie: dono })).json.eventos.length, 2);
  for (const [ev, esperado] of [[daConta, 403], [doNorte, 404]]) {
    assert.equal((await pedir('/api/calendario/' + ev.id, { method: 'PUT', cookie: membro, json: { ...ev, titulo: 'Mudei', telas: [centro.id] } })).status, esperado);
    assert.equal((await pedir('/api/calendario/' + ev.id, { method: 'DELETE', cookie: membro })).status, esperado);
    assert.equal((await salvarCal(membro, [{ ...ev, titulo: 'Mudei pelo POST' }])).status, 403);
  }
  // Pôr na programação: o "todas as TVs" dele vira as lojas dele; outra loja, nem pelo alvo nem pelas TVs.
  for (const extra of [{ alvo: { tipo: 'grupo', nome: 'Loja Norte' } }, { alvo: { tipo: 'telas', ids: [norte.id] } }, { telas: [norte.id] }, { alvo: { tipo: 'grupos', nomes: ['Loja Centro', 'Loja Norte'] } }]) {
    assert.equal((await salvarCal(membro, [data('Ok', { alvo: { tipo: 'todas' } }), data('Invasão', extra)])).status, 403, JSON.stringify(extra));
  }
  assert.equal((await pedir('/api/calendario', { cookie: dono })).json.eventos.length, 2, 'a lista recusada gravou alguma data');
  const minha = (await salvarCal(membro, [data('Dia do pão', { alvo: { tipo: 'todas' } })])).json.eventos[0];
  assert.deepEqual(minha.alvo, { tipo: 'grupos', nomes: ['Loja Centro'] });
  assert.equal((await pedir('/api/calendario/' + minha.id, { method: 'PUT', cookie: membro, json: { ...minha, telas: [centro.id], aplicado: true } })).status, 200);
  assert.equal((await pedir('/api/calendario/' + minha.id, { method: 'PUT', cookie: membro, json: { ...minha, telas: [centro.id, norte.id] } })).status, 403);
  assert.equal((await pedir('/api/calendario', { cookie: membro })).json.eventos.find((e) => e.id === minha.id).podeMudar, true);
  assert.equal((await pedir('/api/calendario/' + minha.id, { method: 'DELETE', cookie: membro })).status, 200);
  assert.equal((await pedir('/api/calendario', { cookie: dono })).json.eventos.length, 2);
  // Na loja dele, sem aprovação, vai direto.
  const direto = await pedir('/api/lote', { method: 'POST', cookie: membro, json: { itens: [{ id: centro.id, config: cfg('Centro direto'), versao: await versao(centro, membro) }] } });
  assert.equal(direto.status, 200);
  assert.equal(await titulo(centro), 'Centro direto');
  // Os envios que ele vê: só os que ficaram nas TVs dele.
  assert.ok((await pedir('/api/lote', { cookie: membro })).json.lotes.every((l) => l.telas.every((x) => x.id === centro.id)));

  /* ---- A. aprovação antes de ir ao ar ---- */
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: membro, json: { ligada: true } })).status, 403, 'o membro desligaria a própria aprovação');
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono, json: { ligada: true } })).json.ligada, true);

  // Uma TV pelo editor: 202, a TV não muda.
  const v1 = await versao(centro, membro);
  const pelaTela = await pedir('/api/devices/' + centro.id + '/config?versao=' + v1, { method: 'PUT', cookie: membro, json: cfg('Centro pedido 1') });
  assert.equal(pelaTela.status, 202);
  assert.equal(pelaTela.json.pendente, true);
  assert.equal(await titulo(centro), 'Centro direto', 'foi para a TV sem aprovação');
  // De novo, pelo lote ("Pôr na TV"): o pedido novo troca o de antes.
  const peloLote = await pedir('/api/lote', { method: 'POST', cookie: membro, json: { itens: [{ id: centro.id, config: cfg('Centro pedido 2'), versao: v1 }], descricao: 'Oferta do dia' } });
  assert.equal(peloLote.status, 202);
  assert.equal(await titulo(centro), 'Centro direto');
  const pedidoId = peloLote.json.aprovacao.id;
  // A campanha "no ar" espera junto com o pedido.
  const campDentro = await pedir('/api/campanhas/' + camp.id, { method: 'PUT', cookie: membro, json: { estado: 'no_ar', telas: [centro.id] } });
  assert.equal(campDentro.status, 202);
  assert.equal((await db.lerCampanha(tenantId, camp.id)).estado, 'pronta', 'a campanha disse "no ar" antes da aprovação');
  // Mesmo com o lote misturado, a loja continua valendo com a aprovação ligada.
  assert.equal((await pedir('/api/lote', { method: 'POST', cookie: membro, json: { itens: [{ id: norte.id, config: cfg('x') }] } })).status, 403);
  // O membro não aprova (nem o próprio), não desfaz e não vê o pedido de outro jeito.
  assert.equal((await pedir('/api/aprovacoes/' + pedidoId + '/aprovar', { method: 'POST', cookie: membro })).status, 403);
  assert.equal((await pedir('/api/aprovacoes/' + pedidoId + '/recusar', { method: 'POST', cookie: membro, json: { motivo: 'x' } })).status, 403);
  assert.equal((await pedir('/api/lote/' + direto.json.lote + '/desfazer', { method: 'POST', cookie: membro })).status, 403);
  // Outra conta não vê nem aprova.
  assert.equal((await pedir('/api/aprovacoes/' + pedidoId, { cookie: outra })).status, 404);
  assert.equal((await pedir('/api/aprovacoes/' + pedidoId + '/aprovar', { method: 'POST', cookie: outra })).status, 404);

  // O dono: o sino conta um (o primeiro pedido foi trocado pelo segundo), e o antes e o depois.
  assert.equal((await pedir('/api/aprovacoes/contagem', { cookie: dono })).json.n, 1);
  const fila = (await pedir('/api/aprovacoes', { cookie: dono })).json;
  assert.deepEqual(fila.pendentes.map((p) => p.id), [pedidoId]);
  const aberto = (await pedir('/api/aprovacoes/' + pedidoId, { cookie: dono })).json;
  assert.equal(aberto.telas[0].antes.zonas.principal.items[0].titulo, 'Centro direto');
  assert.equal(aberto.telas[0].depois.zonas.principal.items[0].titulo, 'Centro pedido 2');
  assert.equal(aberto.telas[0].mudouDepois, false);
  // Aprovado: vai ao ar sozinho, e a campanha fica no ar.
  const aprovado = await pedir('/api/aprovacoes/' + pedidoId + '/aprovar', { method: 'POST', cookie: dono });
  assert.equal(aprovado.status, 200);
  assert.ok(aprovado.json.lote, 'a aprovação não deixou o envio para desfazer');
  assert.equal(await titulo(centro), 'Centro pedido 2', 'a peça aprovada não foi ao ar');
  assert.equal((await db.lerCampanha(tenantId, camp.id)).estado, 'no_ar');
  assert.equal((await pedir('/api/aprovacoes/' + pedidoId + '/aprovar', { method: 'POST', cookie: dono })).status, 409, 'aprovou duas vezes');

  // Conflito: a TV mudou depois do pedido. Nada é atropelado; "por cima" é escolha do dono.
  const v2 = await versao(centro, membro);
  const p3 = (await pedir('/api/devices/' + centro.id + '/config?versao=' + v2, { method: 'PUT', cookie: membro, json: cfg('Centro pedido 3') })).json.aprovacao.id;
  assert.equal((await pedir('/api/devices/' + centro.id + '/config', { method: 'PUT', cookie: dono, json: cfg('Centro do dono') })).status, 200, 'o dono publica direto');
  assert.equal((await pedir('/api/aprovacoes/' + p3, { cookie: dono })).json.telas[0].mudouDepois, true);
  const conflito = await pedir('/api/aprovacoes/' + p3 + '/aprovar', { method: 'POST', cookie: dono });
  assert.equal(conflito.status, 409);
  assert.equal(conflito.json.code, 'config-mudou');
  assert.equal(await titulo(centro), 'Centro do dono', 'a aprovação atropelou o que mudou depois');
  assert.equal((await pedir('/api/aprovacoes/contagem', { cookie: dono })).json.n, 1, 'o pedido saiu da fila com o conflito');
  assert.equal((await pedir('/api/aprovacoes/' + p3 + '/aprovar?porCima=1', { method: 'POST', cookie: dono })).status, 200);
  assert.equal(await titulo(centro), 'Centro pedido 3');

  // Recusado: o membro vê o porquê, e o sino dele conta até ele ver.
  const v3 = await versao(centro, membro);
  const p4 = (await pedir('/api/devices/' + centro.id + '/config?versao=' + v3, { method: 'PUT', cookie: membro, json: cfg('Preço errado') })).json.aprovacao.id;
  assert.equal((await pedir('/api/aprovacoes/' + p4 + '/recusar', { method: 'POST', cookie: dono, json: { motivo: 'O preço do pão está errado' } })).status, 200);
  assert.equal(await titulo(centro), 'Centro pedido 3');
  const minhas = (await pedir('/api/aprovacoes', { cookie: membro })).json.minhas;
  const recusado = minhas.find((p) => p.id === p4);
  assert.equal(recusado.estado, 'recusada');
  assert.equal(recusado.motivo, 'O preço do pão está errado');
  assert.ok((await pedir('/api/aprovacoes/contagem', { cookie: membro })).json.n >= 1);
  assert.equal((await pedir('/api/aprovacoes/vistas', { method: 'POST', cookie: membro })).status, 200);
  assert.equal((await pedir('/api/aprovacoes/contagem', { cookie: membro })).json.n, 0);
  assert.equal((await pedir('/api/aprovacoes/' + p4 + '/aprovar', { method: 'POST', cookie: dono })).status, 409, 'aprovou o recusado');

  // Desistir: só quem pediu.
  const v4 = await versao(centro, membro);
  const p5 = (await pedir('/api/devices/' + centro.id + '/config?versao=' + v4, { method: 'PUT', cookie: membro, json: cfg('Mudei de ideia') })).json.aprovacao.id;
  assert.equal((await pedir('/api/aprovacoes/' + p5, { method: 'DELETE', cookie: dono })).status, 404);
  assert.equal((await pedir('/api/aprovacoes/' + p5, { method: 'DELETE', cookie: membro })).status, 200);
  assert.equal((await pedir('/api/aprovacoes/contagem', { cookie: dono })).json.n, 0);

  // Sem loja (todas as TVs) e sem aprovação: volta a ser como antes.
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: dono, json: { grupos: null } })).status, 200);
  assert.equal((await pedir('/api/devices', { cookie: membro })).json.devices.length, 2);
  await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono, json: { ligada: false } });
  assert.equal((await pedir('/api/devices/' + norte.id + '/config', { method: 'PUT', cookie: membro, json: cfg('Norte pelo membro') })).status, 200);
  assert.equal(await titulo(norte), 'Norte pelo membro');
});
