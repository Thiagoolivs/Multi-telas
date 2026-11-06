/*
 * A Agenda com a aprovação ligada (lote de 06/11, parte 2).
 *
 * Com a aprovação ligada (fase 13), a data que o MEMBRO põe pela Agenda vira
 * pedido — e a Agenda dizia "Na TV" do mesmo jeito (o painel marcava a data
 * logo depois do envio). Agora o servidor diz a verdade:
 *
 *   - enquanto o pedido espera: "Esperando aprovação", com o link para Aprovações;
 *   - aprovado: na TV (a aprovação marca a data como posta);
 *   - recusado: fora da TV, com o motivo.
 *
 * O "aplicado" do membro não marca nada sozinho: só o pedido que LEVA a
 * peça da data conta.
 *
 * Apagar também espera: a data que está numa TV fica "saindo" no pedido que
 * TIRA a peça, e só sai da Agenda quando o dono aprova. Recusado, ela fica
 * como estava (na TV); sem pedido que tire a peça, nada é apagado. A data
 * que não está em TV nenhuma sai na hora.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* ---------------- as regras, sem servidor ---------------- */

test('o estado de cada data vem do último pedido que a levou, se ele for mais novo que a última ida à TV', () => {
  const A = require('../server/aprovacao.js');
  const pedido = (id, estado, criadoEm, calendario, extra) => ({ id, estado, criadoEm, autorId: 'm', motivo: estado === 'recusada' ? 'Preço errado' : '', extra: { calendario, ...extra } });
  const pedidos = [ // os mais novos primeiro, como db.listarAprovacoes
    pedido('apr_5', 'pendente', 500, ['cal_a']),
    pedido('apr_4', 'recusada', 400, ['cal_b', 'cal_a']),
    pedido('apr_3', 'aprovada', 300, ['cal_c']),
    pedido('apr_2', 'cancelada', 200, ['cal_d']),
    pedido('apr_1', 'aplicando', 100, ['cal_e']),
    { id: 'apr_0', estado: 'pendente', criadoEm: 50, extra: null },
  ];
  const ev = (id, aplicadoEm) => ({ id, titulo: id, aplicadoEm });
  const [a, b, c, d, e, f, g] = A.situacaoDasDatas([ev('cal_a'), ev('cal_b'), ev('cal_c', 310), ev('cal_d', 250), ev('cal_e'), ev('cal_f'), ev('cal_b2')], pedidos, () => true);
  assert.deepEqual(a.aprovacao, { id: 'apr_5', estado: 'pendente' }, 'vale o pedido mais novo que levou a data');
  assert.deepEqual(b.aprovacao, { id: 'apr_4', estado: 'recusada', motivo: 'Preço errado' });
  assert.equal(c.aprovacao, undefined, 'aprovado: a data está na TV');
  assert.equal(d.aprovacao, undefined, 'o dono pôs direto depois do pedido: vale o que ele pôs');
  assert.deepEqual(e.aprovacao, { id: 'apr_1', estado: 'pendente' }, 'o instante da aprovação ainda é "esperando"');
  assert.equal(f.aprovacao, undefined, 'data sem pedido sai como antes');
  assert.equal(g.aprovacao, undefined);
  // O pedido que TIRA a data: "saindo" (e, recusado, a data fica como estava).
  const tirando = [
    { id: 'apr_9', estado: 'pendente', criadoEm: 900, extra: { calendarioApagar: ['cal_x'] } },
    { id: 'apr_8', estado: 'recusada', criadoEm: 800, motivo: 'Fica', extra: { calendarioApagar: ['cal_y'], calendario: [] } },
    { id: 'apr_7', estado: 'pendente', criadoEm: 700, extra: { calendario: ['cal_x', 'cal_y'] } },
  ];
  const [x, y] = A.situacaoDasDatas([ev('cal_x', 600), ev('cal_y', 600)], tirando, () => true);
  assert.deepEqual(x.aprovacao, { id: 'apr_9', estado: 'pendente', saindo: true }, 'vale o pedido mais novo, o que tira');
  assert.deepEqual(y.aprovacao, { id: 'apr_8', estado: 'recusada', saindo: true, motivo: 'Fica' });
  // Juntar os pedidos: o que veio em cada um vai junto (as datas postas e tiradas, as campanhas); a mais nova decide.
  assert.deepEqual(A.juntarExtras([
    { calendario: ['cal_a', 'cal_b'], campanha: { id: 'c1', estado: 'no_ar' } },
    { calendarioApagar: ['cal_b', 'cal_c'], campanhas: [{ id: 'c2', estado: 'no_ar' }], campanha: { id: 'c2', estado: 'no_ar' } },
    null,
  ]), { campanhas: [{ id: 'c1', estado: 'no_ar' }, { id: 'c2', estado: 'no_ar' }], campanha: { id: 'c2', estado: 'no_ar' }, calendario: ['cal_a'], calendarioApagar: ['cal_b', 'cal_c'] });
  assert.equal(A.juntarExtras([null, {}]), null);
  // A versão: com pedido esperando, a do pedido (e a base fica a do pedido); sem, a da TV.
  const tvV = { updated_at: 100, config: '{}' };
  const meu = { pedido: { id: 'apr_m', criadoEm: 555 }, item: { versao: 90 } };
  assert.deepEqual(A.conferirVersao(meu, tvV, 555), { ok: true, base: 90 });
  assert.equal(A.conferirVersao(meu, tvV, 100).ok, false, 'em cima da TV de agora, com pedido esperando');
  assert.deepEqual(A.conferirVersao(null, tvV, 100), { ok: true, base: 100 });
  assert.equal(A.conferirVersao(null, tvV, 90).ok, false);
  assert.deepEqual(A.conferirVersao(null, { updated_at: 7, config: null }, 0), { ok: true, base: 7 }, 'TV vazia lida vazia');
  // O motivo da recusa é de quem pediu e do dono.
  assert.equal(A.situacaoDasDatas([ev('cal_b')], pedidos, () => false)[0].aprovacao.motivo, undefined);
  // O pedido leva a data só se a peça dela (o item `_calendario`) está em alguma TV dele.
  const leva = { itens: [{ id: 'tv1', config: { zonas: { principal: { items: [{ type: 'announce', _calendario: 'cal_a' }] }, rodape: { messages: [] } } } }] };
  assert.equal(A.levaAData(leva, 'cal_a'), true);
  assert.equal(A.levaAData(leva, 'cal_b'), false);
  assert.equal(A.levaAData({ itens: [{ id: 'tv1', config: null }] }, 'cal_a'), false);
  assert.equal(A.temAData(leva.itens[0].config, 'cal_a'), true);
  assert.equal(A.temAData(null, 'cal_a'), false);
});

test('a Agenda em palavras: esperando, na TV ou fora com o porquê', async () => {
  const L = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/calendario.js')).href);
  const ev = { id: 'cal_a', data: '2030-11-27', antecedencia: 7, telas: ['tv1'] };
  assert.deepEqual(L.situacaoDaData(ev), { estado: 'na-tv', texto: 'Na TV de 20/11 a 27/11 · 1 TV' });
  assert.deepEqual(L.situacaoDaData({ ...ev, telas: [] }), { estado: 'fora', texto: 'Fora da TV' });
  const esperando = L.situacaoDaData({ ...ev, aprovacao: { id: 'apr_1', estado: 'pendente' } });
  assert.equal(esperando.estado, 'esperando');
  assert.equal(esperando.texto, 'Entra na TV de 20/11 a 27/11 quando aprovarem');
  assert.equal(esperando.pedido, 'apr_1', 'o link para Aprovações');
  const recusada = L.situacaoDaData({ ...ev, aprovacao: { id: 'apr_1', estado: 'recusada', motivo: 'O preço está errado' } });
  assert.deepEqual(recusada, { estado: 'fora', texto: 'Fora da TV', nota: 'O pedido foi recusado: O preço está errado' });
  assert.equal(L.situacaoDaData({ ...ev, aprovacao: { id: 'apr_1', estado: 'recusada' } }).nota, 'O pedido foi recusado.');
  assert.equal(L.situacaoDaData({ ...ev, aprovacao: { id: 'apr_1', estado: 'cancelada' } }).nota, 'O pedido foi cancelado.');
  // A data que já estava na TV: a versão de antes continua lá; a mudança é que espera (ou não foi).
  const mudanca = L.situacaoDaData({ ...ev, aplicadoEm: 1, aprovacao: { id: 'apr_2', estado: 'pendente' } });
  assert.deepEqual(mudanca, { estado: 'na-tv', texto: 'Na TV de 20/11 a 27/11 · 1 TV', nota: 'A mudança espera aprovação.', pedido: 'apr_2' });
  assert.equal(L.situacaoDaData({ ...ev, aplicadoEm: 1, aprovacao: { id: 'apr_2', estado: 'recusada', motivo: 'Não' } }).nota, 'A mudança não foi. O pedido foi recusado: Não');
  // Apagada com aprovação: "Saindo da TV" até aprovarem; recusado ou cancelado, continua na TV, com o porquê.
  assert.deepEqual(L.situacaoDaData({ ...ev, aplicadoEm: 1, aprovacao: { id: 'apr_3', estado: 'pendente', saindo: true } }),
    { estado: 'saindo', texto: 'Saindo da TV · espera aprovação', pedido: 'apr_3' });
  assert.deepEqual(L.situacaoDaData({ ...ev, aplicadoEm: 1, aprovacao: { id: 'apr_3', estado: 'recusada', motivo: 'Fica até o dia', saindo: true } }),
    { estado: 'na-tv', texto: 'Na TV de 20/11 a 27/11 · 1 TV', nota: 'Não saiu da TV. O pedido foi recusado: Fica até o dia' });
  assert.equal(L.situacaoDaData({ ...ev, aplicadoEm: 1, aprovacao: { id: 'apr_3', estado: 'cancelada', saindo: true } }).nota, 'Não saiu da TV. O pedido foi cancelado.');
});

test('o painel mostra o estado do servidor e o link para Aprovações', () => {
  const c = ler('web/src/pages/CalendarioPage.jsx');
  assert.match(c, /const sit = situacaoDaData\(ev\);/);
  assert.match(c, /\{sit\.estado === 'esperando' && <Badge tone="warn">Esperando aprovação<\/Badge>\}/);
  assert.match(c, /onClick=\{\(\) => onIr\('aprovacoes'\)\}[^>]*>Ver em Aprovações<\/button>/);
  assert.doesNotMatch(c, /'Na TV de ' \+/, 'a frase de antes ("Na TV" pela lista de TVs) voltou');
  // O aviso: com a data esperando, "Mandado para aprovação", e não "está na programação".
  assert.match(c, /if \(esperando\) avisarPedidoDeAprovacao\(\);/);
  // Apagar com aprovação: o aviso do pedido, e a data saindo sem o "Tirar" de novo.
  assert.match(c, /const r = await calendario\.apagar\(ev\.id\);\s*if \(r && r\.esperandoAprovacao\) avisarPedidoDeAprovacao\(\);/);
  assert.match(c, /\{sit\.estado !== 'saindo' && <button type="button" onClick=\{\(\) => apagar\(ev\)\}/);
  assert.match(c, /sit\.estado === 'saindo' \? <span className="font-medium text-warn">\{sit\.texto\}<\/span>/);
  // A página da TV e o "Pôr na TV" dizem ao membro o que ele tem esperando, e que a mudança nova vai junto.
  const tvPage = ler('web/src/pages/ContentEditorPage.jsx');
  assert.match(tvPage, /Você tem uma mudança esperando aprovação nesta TV\. O que você mudar agora vai junto, no mesmo pedido\./);
  assert.match(tvPage, /if \(r\.versao\) versao\.current = r\.versao;/, 'a próxima gravação do editor não vai em cima do pedido');
  assert.match(ler('web/src/components/tela/PorNaTV.jsx'), /A nova vai junto, no mesmo pedido\./);
  assert.match(ler('web/src/api.js'), /meuPedido: r\.headers\.get\('X-Meu-Pedido'\) \|\| ''/);
  // Um violeta por tela: o link é texto, não botão violeta.
  assert.doesNotMatch(c, /variant="primary"[^>]*>\s*Ver em Aprovações/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 8800 + Math.floor(Math.random() * 90);
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

test('servidor: a data do membro espera a aprovação, vai para a TV quando aprovada e volta com o motivo quando recusada', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-agenda-apr-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const n = Date.now();
  const cadastro = (email, extra) => pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Pessoa', aceite: true, ...extra } });
  const dono = cookieDe(await cadastro('dono' + n + '@teste.local', { name: 'Padaria Agenda', perfil: 'comercio' }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono, json: { plan: 'pro' } })).status, 200);
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'equipe' + n + '@teste.local', role: 'member' } });
  assert.equal(convite.status, 201);
  const membro = cookieDe(await cadastro('equipe' + n + '@teste.local', { inviteCode: convite.json.code, name: 'Equipe' }));

  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: tv.code, nova: true } })).status < 300);
  const base = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo: 'Bom dia' }] } } };
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: dono, json: base })).status, 200);
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono, json: { ligada: true } })).json.ligada, true);

  const versaoDe = async (alvo, cookie) => Number((await pedir('/api/devices/' + alvo.id + '/config', { cookie })).headers['x-config-versao']) || 0;
  const versao = () => versaoDe(tv, membro);
  const naTv = async (alvo = tv) => {
    const c = (await pedir('/api/devices/' + alvo.id + '/config', { headers: { 'x-device-token': alvo.deviceToken } })).json;
    return ((c && c.zonas && c.zonas.principal.items) || []).filter((it) => it._calendario).map((it) => it.titulo);
  };
  const agenda = async (cookie) => (await pedir('/api/calendario', { cookie })).json.eventos;
  const daAgenda = async (cookie, id) => (await agenda(cookie)).find((e) => e.id === id);
  // O caminho do painel: guarda a data, põe a peça na TV pelo lote, marca a data como posta.
  const porNaAgenda = async (cookie, titulo, evAntes) => {
    const ev = evAntes || (await pedir('/api/calendario', { method: 'POST', cookie, json: { eventos: [{ data: '2030-11-27', titulo, tipo: 'campanha', antecedencia: 7 }] } })).json.eventos[0];
    const atual = (await pedir('/api/devices/' + tv.id + '/config', { cookie })).json;
    const items = atual.zonas.principal.items.filter((it) => it._calendario !== ev.id);
    const cfg = { ...atual, zonas: { ...atual.zonas, principal: { ...atual.zonas.principal, items: [{ type: 'announce', titulo, _calendario: ev.id }].concat(items) } } };
    const lote = await pedir('/api/lote', { method: 'POST', cookie, json: { itens: [{ id: tv.id, config: cfg, versao: await versao() }], descricao: 'Calendário' } });
    const marcar = await pedir('/api/calendario/' + ev.id, { method: 'PUT', cookie, json: { ...ev, titulo, telas: [tv.id], aplicado: true } });
    return { ev, lote, marcar };
  };

  /* ---- 1. o membro põe uma data: espera ---- */
  const bf = await porNaAgenda(membro, 'Black Friday');
  assert.equal(bf.lote.status, 202, 'o envio do membro não virou pedido');
  const pedidoBf = bf.lote.json.aprovacao.id;
  assert.equal(bf.marcar.status, 202);
  assert.equal(bf.marcar.json.esperandoAprovacao, true);
  assert.deepEqual(bf.marcar.json.aprovacao, { id: pedidoBf, estado: 'pendente' }, 'a data entrou em outro pedido');
  assert.equal(bf.marcar.json.evento.aplicadoEm, null, 'o servidor marcou como posta a data que só foi pedida');
  assert.deepEqual(await naTv(), [], 'foi para a TV sem aprovação');
  for (const quem of [membro, dono]) {
    const e = await daAgenda(quem, bf.ev.id);
    assert.deepEqual(e.aprovacao, { id: pedidoBf, estado: 'pendente' }, 'a Agenda não diz "Esperando aprovação"');
    assert.equal(e.aplicadoEm, null);
  }

  /* ---- 2. aprovado: na TV ---- */
  assert.equal((await pedir('/api/aprovacoes/' + pedidoBf + '/aprovar', { method: 'POST', cookie: dono })).status, 200);
  assert.deepEqual(await naTv(), ['Black Friday']);
  const aprovada = await daAgenda(membro, bf.ev.id);
  assert.equal(aprovada.aprovacao, undefined, 'aprovada, a data ainda diz que espera');
  assert.ok(aprovada.aplicadoEm > 0, 'a aprovação não marcou a data como posta');

  /* ---- 3. recusado: fora da TV, com o motivo ---- */
  const natal = await porNaAgenda(membro, 'Natal');
  assert.equal(natal.marcar.status, 202);
  const pedidoNatal = natal.lote.json.aprovacao.id;
  assert.equal((await pedir('/api/aprovacoes/' + pedidoNatal + '/recusar', { method: 'POST', cookie: dono, json: { motivo: 'A data está errada' } })).status, 200);
  assert.deepEqual(await naTv(), ['Black Friday'], 'a data recusada foi para a TV');
  for (const quem of [membro, dono]) {
    const e = await daAgenda(quem, natal.ev.id);
    assert.deepEqual(e.aprovacao, { id: pedidoNatal, estado: 'recusada', motivo: 'A data está errada' });
    assert.equal(e.aplicadoEm, null);
  }
  // A data aprovada antes não muda com a recusa da outra.
  assert.equal((await daAgenda(membro, bf.ev.id)).aprovacao, undefined);

  /* ---- 4. a mudança numa data que já está na TV: espera, e desistir não tira a de antes ---- */
  const mudar = await porNaAgenda(membro, 'Black Friday: tudo 30%', aprovada);
  assert.equal(mudar.marcar.status, 202);
  const mudanca = await daAgenda(membro, bf.ev.id);
  assert.equal(mudanca.aprovacao.estado, 'pendente');
  assert.ok(mudanca.aplicadoEm > 0, 'a versão de antes continua na TV');
  assert.deepEqual(await naTv(), ['Black Friday']);
  assert.equal((await pedir('/api/aprovacoes/' + mudar.lote.json.aprovacao.id, { method: 'DELETE', cookie: membro })).status, 200);
  assert.equal((await daAgenda(membro, bf.ev.id)).aprovacao.estado, 'cancelada');

  /* ---- 5. o servidor decide: "aplicado" sem pedido que leve a data não marca nada ---- */
  const solta = (await pedir('/api/calendario', { method: 'POST', cookie: membro, json: { eventos: [{ data: '2030-12-24', titulo: 'Véspera', tipo: 'evento', antecedencia: 3, aplicado: true }] } })).json.eventos[0];
  assert.equal(solta.aplicadoEm, null, 'o POST marcou como posta');
  const semPedido = await pedir('/api/calendario/' + solta.id, { method: 'PUT', cookie: membro, json: { ...solta, telas: [tv.id], aplicado: true } });
  assert.equal(semPedido.status, 200);
  assert.equal(semPedido.json.evento.aplicadoEm, null, 'o membro com aprovação marcou a data como posta sem pedido');
  assert.equal(semPedido.json.esperandoAprovacao, undefined);

  /* ---- 6. o dono põe direto a data recusada: vale o que ele pôs ---- */
  const peloDono = await porNaAgenda(dono, 'Natal', natal.ev);
  assert.equal(peloDono.lote.status, 200);
  assert.equal(peloDono.marcar.status, 200);
  assert.ok(peloDono.marcar.json.evento.aplicadoEm > 0);
  assert.equal((await daAgenda(dono, natal.ev.id)).aprovacao, undefined, 'a recusa velha continua valendo depois do dono pôr');
  assert.deepEqual((await naTv()).sort(), ['Black Friday', 'Natal']);

  /* ---- 7. o membro apaga a data que está na TV: ela fica, "saindo", até o dono aprovar ---- */
  // O caminho do painel: tira a peça das TVs pelo lote e apaga a data.
  const tirar = async (cookie, ev, tvs = [tv]) => {
    const itens = [];
    for (const alvo of tvs) {
      const atual = (await pedir('/api/devices/' + alvo.id + '/config', { cookie })).json;
      const items = atual.zonas.principal.items.filter((it) => it._calendario !== ev.id);
      itens.push({ id: alvo.id, config: { ...atual, zonas: { ...atual.zonas, principal: { ...atual.zonas.principal, items } } }, versao: await versaoDe(alvo, cookie) });
    }
    const lote = await pedir('/api/lote', { method: 'POST', cookie, json: { itens, descricao: 'Tirar: ' + ev.titulo } });
    const apagar = await pedir('/api/calendario/' + ev.id, { method: 'DELETE', cookie });
    return { lote, apagar };
  };
  const saiBf = await tirar(membro, aprovada);
  assert.equal(saiBf.lote.status, 202);
  const pedidoSaiBf = saiBf.lote.json.aprovacao.id;
  assert.equal(saiBf.apagar.status, 202, 'a data sumiu da Agenda antes da aprovação');
  assert.equal(saiBf.apagar.json.esperandoAprovacao, true);
  assert.deepEqual(saiBf.apagar.json.aprovacao, { id: pedidoSaiBf, estado: 'pendente', saindo: true });
  for (const quem of [membro, dono]) {
    assert.deepEqual((await daAgenda(quem, bf.ev.id)).aprovacao, { id: pedidoSaiBf, estado: 'pendente', saindo: true }, 'a Agenda não diz "Saindo da TV"');
  }
  assert.deepEqual((await naTv()).sort(), ['Black Friday', 'Natal'], 'saiu da TV sem aprovação');
  // Aprovado: a peça sai da TV e a data sai da Agenda.
  assert.equal((await pedir('/api/aprovacoes/' + pedidoSaiBf + '/aprovar', { method: 'POST', cookie: dono })).status, 200);
  assert.deepEqual(await naTv(), ['Natal']);
  assert.equal(await daAgenda(dono, bf.ev.id), undefined, 'aprovada a saída, a data continua na Agenda');
  assert.equal(await daAgenda(membro, bf.ev.id), undefined);

  /* ---- 8. de novo, recusado (ou cancelado): a data fica como estava, na TV, com o porquê ---- */
  const natalAgora = await daAgenda(membro, natal.ev.id);
  const saiNatal = await tirar(membro, natalAgora);
  assert.equal(saiNatal.apagar.status, 202);
  const pedidoSaiNatal = saiNatal.lote.json.aprovacao.id;
  assert.equal((await pedir('/api/aprovacoes/' + pedidoSaiNatal + '/recusar', { method: 'POST', cookie: dono, json: { motivo: 'O Natal continua até o dia 25' } })).status, 200);
  for (const quem of [membro, dono]) {
    const e = await daAgenda(quem, natal.ev.id);
    assert.ok(e, 'a recusa apagou a data');
    assert.deepEqual(e.aprovacao, { id: pedidoSaiNatal, estado: 'recusada', saindo: true, motivo: 'O Natal continua até o dia 25' });
    assert.ok(e.aplicadoEm > 0, 'a data recusada para sair deixou de estar na TV');
  }
  assert.deepEqual(await naTv(), ['Natal'], 'a peça saiu da TV com a saída recusada');
  // Quem pediu desiste: também fica.
  const desiste = await tirar(membro, natalAgora);
  assert.equal(desiste.apagar.status, 202);
  assert.equal((await pedir('/api/aprovacoes/' + desiste.lote.json.aprovacao.id, { method: 'DELETE', cookie: membro })).status, 200);
  assert.deepEqual((await daAgenda(membro, natal.ev.id)).aprovacao, { id: desiste.lote.json.aprovacao.id, estado: 'cancelada', saindo: true });
  assert.deepEqual(await naTv(), ['Natal']);

  /* ---- 9. sem o pedido que tira a peça, nada é apagado; a data fora da TV sai direto; o dono apaga direto ---- */
  const semTirar = await pedir('/api/calendario/' + natal.ev.id, { method: 'DELETE', cookie: membro });
  assert.equal(semTirar.status, 409, 'apagou a data que está na TV sem pedido para tirar a peça');
  assert.equal(semTirar.json.code, 'sem-pedido');
  assert.match(semTirar.json.error, /Nada foi apagado/);
  assert.ok(await daAgenda(dono, natal.ev.id));
  // Um pedido que muda OUTRA coisa (a peça continua nele) também não serve.
  const igual = (await pedir('/api/devices/' + tv.id + '/config', { cookie: membro })).json;
  const outraCoisa = await pedir('/api/lote', { method: 'POST', cookie: membro, json: { itens: [{ id: tv.id, config: igual, versao: await versao() }], descricao: 'Nada' } });
  assert.equal(outraCoisa.status, 202);
  assert.equal((await pedir('/api/calendario/' + natal.ev.id, { method: 'DELETE', cookie: membro })).status, 409);
  assert.equal((await pedir('/api/aprovacoes/' + outraCoisa.json.aprovacao.id, { method: 'DELETE', cookie: membro })).status, 200);
  // A data que não está em TV nenhuma (nunca foi) sai na hora.
  const fora = await pedir('/api/calendario/' + solta.id, { method: 'DELETE', cookie: membro });
  assert.equal(fora.status, 200);
  assert.equal(fora.json.esperandoAprovacao, undefined);
  assert.equal(await daAgenda(dono, solta.id), undefined);
  // O dono: tira da TV e apaga na hora, como sempre.
  const peloDonoSai = await tirar(dono, natalAgora);
  assert.equal(peloDonoSai.lote.status, 200);
  assert.equal(peloDonoSai.apagar.status, 200);
  assert.equal(await daAgenda(dono, natal.ev.id), undefined);
  assert.deepEqual(await naTv(), []);

  /* ---- 10. o membro de uma loja: as regras da loja continuam valendo com a aprovação ---- */
  const meMembro = (await pedir('/api/auth/me', { cookie: membro })).json;
  const norte = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: norte.code, nova: true } })).status < 300);
  assert.equal((await pedir('/api/devices/' + norte.id + '/config', { method: 'PUT', cookie: dono, json: base })).status, 200);
  assert.equal((await pedir('/api/devices/' + tv.id + '/grupo', { method: 'POST', cookie: dono, json: { grupo: 'Loja Centro' } })).status, 200);
  assert.equal((await pedir('/api/devices/' + norte.id + '/grupo', { method: 'POST', cookie: dono, json: { grupo: 'Loja Norte' } })).status, 200);
  assert.equal((await pedir('/api/lojas/' + meMembro.user.id, { method: 'PUT', cookie: dono, json: { grupos: ['Loja Centro'] } })).status, 200);
  // O dono põe a data direto (na lista e na TV).
  const donoPoe = async (titulo, alvo, tvs) => {
    const ev = (await pedir('/api/calendario', { method: 'POST', cookie: dono, json: { eventos: [{ data: '2030-11-27', titulo, tipo: 'evento', antecedencia: 7, alvo, telas: tvs.map((x) => x.id), aplicado: true }] } })).json.eventos[0];
    for (const alvoTv of tvs) {
      const atual = (await pedir('/api/devices/' + alvoTv.id + '/config', { cookie: dono })).json;
      const cfg = { ...atual, zonas: { ...atual.zonas, principal: { ...atual.zonas.principal, items: [{ type: 'announce', titulo, _calendario: ev.id }].concat(atual.zonas.principal.items) } } };
      assert.equal((await pedir('/api/devices/' + alvoTv.id + '/config', { method: 'PUT', cookie: dono, json: cfg })).status, 200);
    }
    return ev;
  };
  const doNorte = await donoPoe('Feira do Norte', { tipo: 'grupo', nome: 'Loja Norte' }, [norte]);
  const daRede = await donoPoe('Aniversário da rede', { tipo: 'todas' }, [tv, norte]);
  const doCentro = await donoPoe('Feira do Centro', { tipo: 'grupo', nome: 'Loja Centro' }, [tv]);
  assert.equal((await pedir('/api/calendario/' + doNorte.id, { method: 'DELETE', cookie: membro })).status, 404, 'a data da outra loja');
  assert.equal((await pedir('/api/calendario/' + daRede.id, { method: 'DELETE', cookie: membro })).status, 403, 'a data da rede inteira');
  assert.ok(await daAgenda(dono, doNorte.id));
  assert.ok(await daAgenda(dono, daRede.id));
  // A da loja dele: fica saindo até o dono aprovar, como sem loja.
  const saiCentro = await tirar(membro, doCentro);
  assert.equal(saiCentro.lote.status, 202);
  assert.equal(saiCentro.apagar.status, 202);
  assert.equal((await daAgenda(membro, doCentro.id)).aprovacao.saindo, true);
  assert.equal((await pedir('/api/aprovacoes/' + saiCentro.lote.json.aprovacao.id + '/aprovar', { method: 'POST', cookie: dono })).status, 200);
  assert.equal(await daAgenda(dono, doCentro.id), undefined);
  assert.deepEqual(await naTv(), ['Aniversário da rede']);
  assert.deepEqual((await naTv(norte)).sort(), ['Aniversário da rede', 'Feira do Norte'], 'mexeu na TV da outra loja');

  /* ---- 11. as mudanças do membro vão JUNTAS: põe uma data e apaga outra → um pedido só, com as duas ---- */
  const pedidosDoMembro = async () => (await pedir('/api/aprovacoes', { cookie: dono })).json.pendentes.filter((p) => p.autorId === meMembro.user.id);
  const feira = await donoPoe('Feira de verão', { tipo: 'grupo', nome: 'Loja Centro' }, [tv]);
  const diaA = await porNaAgenda(membro, 'Dia do cliente');
  assert.equal(diaA.marcar.status, 202);
  const pedidoA = diaA.lote.json.aprovacao.id;
  // O membro lê a TV com o que ele mesmo pediu (e a versão do pedido).
  const lidaA = await pedir('/api/devices/' + tv.id + '/config', { cookie: membro });
  assert.equal(lidaA.headers['x-meu-pedido'], pedidoA);
  assert.ok(lidaA.json.zonas.principal.items.some((it) => it._calendario === diaA.ev.id), 'a data posta não aparece para quem a pôs');
  assert.deepEqual((await pedir('/api/devices', { cookie: membro })).json.devices.find((d) => d.id === tv.id).meuPedido, pedidoA);
  const saiFeira = await tirar(membro, feira);
  assert.equal(saiFeira.lote.status, 202);
  assert.equal(saiFeira.lote.json.aprovacao.junto, true, 'o pedido novo não juntou o de antes');
  const juntos = saiFeira.lote.json.aprovacao.id;
  assert.equal(saiFeira.apagar.status, 202);
  assert.deepEqual((await pedidosDoMembro()).map((p) => p.id), [juntos], 'ficaram dois pedidos (ou nenhum) na fila');
  for (const quem of [membro, dono]) {
    assert.deepEqual((await daAgenda(quem, diaA.ev.id)).aprovacao, { id: juntos, estado: 'pendente' }, 'a data posta antes virou "um pedido mais novo tomou o lugar"');
    assert.deepEqual((await daAgenda(quem, feira.id)).aprovacao, { id: juntos, estado: 'pendente', saindo: true });
  }
  // O dono vê as duas mudanças no mesmo pedido.
  const depoisJuntos = (await pedir('/api/aprovacoes/' + juntos, { cookie: dono })).json.telas[0].depois.zonas.principal.items.map((it) => it.titulo);
  assert.ok(depoisJuntos.includes('Dia do cliente') && !depoisJuntos.includes('Feira de verão'), JSON.stringify(depoisJuntos));
  assert.equal((await pedir('/api/aprovacoes/' + pedidoA + '/aprovar', { method: 'POST', cookie: dono })).status, 409, 'o pedido de dentro aprovava sozinho');
  // Aprovado: a data posta vai para a TV e a apagada sai.
  assert.equal((await pedir('/api/aprovacoes/' + juntos + '/aprovar', { method: 'POST', cookie: dono })).status, 200);
  assert.deepEqual((await naTv()).sort(), ['Aniversário da rede', 'Dia do cliente']);
  const aprovadoA = await daAgenda(dono, diaA.ev.id);
  assert.equal(aprovadoA.aprovacao, undefined);
  assert.ok(aprovadoA.aplicadoEm > 0, 'a aprovação do pedido juntado não marcou a data posta');
  assert.equal(await daAgenda(dono, feira.id), undefined, 'a data apagada continua na Agenda');

  // De novo, recusado: nem uma nem outra.
  const feira2 = await donoPoe('Feira de inverno', { tipo: 'grupo', nome: 'Loja Centro' }, [tv]);
  const diaC = await porNaAgenda(membro, 'Dia da família');
  assert.equal(diaC.marcar.status, 202);
  const saiFeira2 = await tirar(membro, feira2);
  assert.equal(saiFeira2.apagar.status, 202);
  const juntos2 = saiFeira2.lote.json.aprovacao.id;
  assert.equal((await pedir('/api/aprovacoes/' + juntos2 + '/recusar', { method: 'POST', cookie: dono, json: { motivo: 'Agora não' } })).status, 200);
  assert.deepEqual((await naTv()).sort(), ['Aniversário da rede', 'Dia do cliente', 'Feira de inverno']);
  assert.deepEqual((await daAgenda(membro, diaC.ev.id)).aprovacao, { id: juntos2, estado: 'recusada', motivo: 'Agora não' });
  assert.equal((await daAgenda(membro, diaC.ev.id)).aplicadoEm, null);
  const ficou = await daAgenda(membro, feira2.id);
  assert.deepEqual(ficou.aprovacao, { id: juntos2, estado: 'recusada', saindo: true, motivo: 'Agora não' });
  assert.ok(ficou.aplicadoEm > 0, 'a data que não saiu deixou de estar na TV');
  assert.deepEqual(await pedidosDoMembro(), []);

  // Outra conta não vê nada disso.
  const outra = cookieDe(await cadastro('fora' + n + '@teste.local', { name: 'Outra' }));
  assert.deepEqual(await agenda(outra), []);
});
