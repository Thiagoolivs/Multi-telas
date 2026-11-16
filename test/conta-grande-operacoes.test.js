/*
 * A campanha, a peça pronta e a publicação para muitas TVs, feitas pelo
 * servidor (teste de carga, 16/11 — docs/CAPACIDADE-E-TVBOX.md, 3.5 e 4), a
 * Programação da conta grande e o motivo da recusa no pulso da TV.
 *
 * O painel de verdade (web/src/lib/rodar.js, publicar.js e api.js) fala com
 * o servidor de verdade: o fetch do painel vai para o servidor do teste com
 * o cookie da conta. Assim o que se confere é o pedido que o painel monta E
 * o que o servidor faz com ele.
 */
'use strict';
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'dev';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const { montarProgramaRh } = require('../tools/carga/programa-rh.cjs');
const L = require('../js/lote-tv.js');
// MT_TESTE_PORTA_OPERACOES: a máquina que só pode usar certas portas escolhe qual.
const PORTA = Number(process.env.MT_TESTE_PORTA_OPERACOES) || 9400 + Math.floor(Math.random() * 90);
const BASE = 'http://127.0.0.1:' + PORTA;

let servidor = null;
let dados = '';
let banco = null;
before(async () => {
  dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-operacoes-'));
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '1', RAILWAY_ENVIRONMENT: '', MT_APK_REPO: 'desligado' },
  });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { ok = (await pedir('/healthz')).status === 200; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const { DatabaseSync } = require('node:sqlite');
  banco = new DatabaseSync(path.join(dados, 'multitelas.db'));
  banco.exec('PRAGMA busy_timeout = 10000');
});
after(() => {
  try { banco && banco.close(); } catch (e) { /* já fechado */ }
  if (servidor) servidor.kill();
  try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ }
});

function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.json !== undefined ? Buffer.from(JSON.stringify(o.json)) : null;
    const headers = Object.assign({}, o.headers || {}, corpo ? { 'Content-Type': 'application/json', 'Content-Length': corpo.length } : {},
      o.cookie ? { Cookie: o.cookie } : {}, o.ip ? { 'X-Forwarded-For': o.ip } : {});
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET', headers }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(partes).toString('utf8');
        let json = null; try { json = JSON.parse(txt); } catch (e) { /* não é JSON */ }
        resolve({ status: res.statusCode, json, headers: res.headers, bytes: Buffer.byteLength(txt), cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
let seq = 0;
const emailNovo = () => 'op' + (++seq) + '-' + Date.now() + '@teste.local';
async function cadastro(extra, emailDoConvite) {
  const email = emailDoConvite || emailNovo();
  const r = await pedir('/api/auth/signup', { method: 'POST', ip: '10.80.0.' + (seq % 250), json: { email, password: 'senha-de-teste-123', name: 'Metalúrgica ' + seq, aceite: true, perfil: 'empresa', ...(extra || {}) } });
  assert.equal(r.status, 201, 'o cadastro falhou: ' + JSON.stringify(r.json));
  return { cookie: cookieDe(r), email, tenantId: banco.prepare('SELECT tenant_id FROM users WHERE email = ?').get(email).tenant_id };
}
async function tvsNovas(n, ip) {
  const tvs = [];
  for (let i = 0; i < n; i += 10) {
    const parte = await Promise.all(Array.from({ length: Math.min(10, n - i) }, () => pedir('/api/devices', { method: 'POST', ip })));
    for (const r of parte) { assert.equal(r.status, 201); tvs.push(r.json); }
  }
  return tvs;
}
const PROGRAMA = montarProgramaRh({});
function naConta(tenantId, tvs, grupoDe, programa) {
  const agora = Date.now();
  tvs.forEach((tv, i) => {
    banco.prepare('UPDATE devices SET tenant_id = ?, name = ?, config = ?, updated_at = ?, last_seen = ?, grupo = ? WHERE id = ?')
      .run(tenantId, 'TV ' + (i + 1), programa === null ? null : JSON.stringify(programa || PROGRAMA), agora - i, agora, grupoDe ? grupoDe(i) : null, tv.id);
  });
  return tvs.map((tv, i) => ({ id: tv.id, name: 'TV ' + (i + 1), grupo: grupoDe ? grupoDe(i) : '' }));
}
const configDe = (id) => { const r = banco.prepare('SELECT config, updated_at FROM devices WHERE id = ?').get(id); return { cfg: r.config ? JSON.parse(r.config) : null, versao: Number(r.updated_at) }; };

/*
 * O painel de verdade, falando com o servidor do teste: o fetch do painel
 * ganha o endereço e o cookie de quem está "logado" (`comoQuem`).
 */
let painel = null;
let quem = '';
const pedidosDoPainel = [];
async function oPainel() {
  if (painel) return painel;
  globalThis.window = globalThis.window || { dispatchEvent: () => true };
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };
  // No navegador o global é o window; aqui o window é de mentira, e a importância (js/importancia.js) iria para ele.
  globalThis.MTImportancia = require('../js/importancia.js');
  const fetchDeVerdade = globalThis.fetch;
  globalThis.fetch = (url, op = {}) => {
    pedidosDoPainel.push({ url: String(url), metodo: op.method || 'GET', bytes: op.body ? Buffer.byteLength(op.body) : 0 });
    return fetchDeVerdade(BASE + url, Object.assign({}, op, { headers: Object.assign({}, op.headers || {}, { Cookie: quem }) }));
  };
  painel = {
    R: await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/rodar.js')).href),
    P: await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/publicar.js')).href),
    api: await import(pathToFileURL(path.join(RAIZ, 'web/src/api.js')).href),
  };
  return painel;
}
const comoQuem = (cookie) => { quem = cookie; pedidosDoPainel.length = 0; };

// Uma campanha da IA com duas entradas: uma para a "Unidade Norte" (com lateral e faixas), outra para as demais.
const comCampos = (it, campos) => Object.assign({}, it, { campos: Object.assign({}, it.campos, campos) });
const CAMPANHA = {
  nome: 'Semana da Segurança',
  telas: [
    { alvo: { tipo: 'grupo', nome: 'Unidade Norte' }, zonas: {
      principal: [{ item: comCampos(PROGRAMA.zonas.principal.items[1], { assunto: 'SIPAT começa segunda' }) }],
      lateral: [{ item: PROGRAMA.zonas.lateral.items[1] }],
      cabecalho: { pecas: [{ item: PROGRAMA.zonas.cabecalho.peca }], mensagens: [] },
      rodape: { pecas: [], mensagens: ['SIPAT: palestras às 15h'] },
    } },
    { alvo: { tipo: 'todas' }, zonas: {
      principal: [{ item: comCampos(PROGRAMA.zonas.principal.items[2], { titulo: 'Dias sem acidente', numero: '130' }) }],
      lateral: [],
      cabecalho: { pecas: [], mensagens: [] },
      rodape: { pecas: [], mensagens: ['Use o EPI'] },
    } },
  ],
};
const deCampanha = (cfg) => Object.values(cfg.zonas || {}).reduce((n, z) => n + ((z && z.items) || []).filter((it) => it && it._campanha === CAMPANHA.nome).length, 0);

test('a campanha para a conta grande: o plano sem ler programação, um pedido para pôr, o Desfazer leve e exato, e a pausa', async () => {
  const { R } = await oPainel();
  const dono = await cadastro();
  const tvs = naConta(dono.tenantId, await tvsNovas(25, '10.81.0.1'), (i) => (i < 5 ? 'Unidade Norte' : 'Unidade Sul'));
  // Uma TV da Unidade Norte num layout sem lateral nem faixas: o plano diz que ela troca.
  const cheia = Object.assign({}, PROGRAMA, { settings: Object.assign({}, PROGRAMA.settings, { layoutId: 'full' }), zonas: { principal: PROGRAMA.zonas.principal } });
  banco.prepare('UPDATE devices SET config = ? WHERE id = ?').run(JSON.stringify(cheia), tvs[0].id);
  const antes = new Map(tvs.map((t) => [t.id, configDe(t.id)]));
  comoQuem(dono.cookie);

  const plano = await R.planoDeRodar(CAMPANHA, tvs);
  assert.equal(plano.length, 25);
  assert.deepEqual(pedidosDoPainel.map((p) => p.metodo + ' ' + p.url), ['POST /api/lote/operacao'], 'o plano leu a programação de cada TV');
  const p0 = plano.find((p) => p.tela.id === tvs[0].id);
  assert.deepEqual(p0.faltam, ['lateral', 'cabeçalho', 'rodapé']);
  assert.equal(p0.layoutAtual, 'full');
  assert.equal(p0.layoutNovo, 'corporate');
  assert.ok(plano.filter((p) => p.tela.id !== tvs[0].id).every((p) => !p.faltam.length && !p.layoutNovo), 'TV com todas as zonas trocaria de layout');
  assert.equal(plano.filter((p) => p.indice === 0).length, 5, 'a entrada da Unidade Norte não ficou com as TVs dela');

  comoQuem(dono.cookie);
  const ids = await R.rodarCampanha(plano, CAMPANHA.nome, { trocarLayout: true, quando: { quando: 'hoje' } });
  assert.equal(pedidosDoPainel.length, 1, 'pôr a campanha leu ou mandou TV por TV');
  assert.ok(pedidosDoPainel[0].bytes < 120e3, 'o pedido da campanha tem ' + pedidosDoPainel[0].bytes + ' bytes');
  assert.equal(ids.length, 25);
  assert.match(ids.lote, /^lot_/);
  const hoje = new Date();
  const hojeIso = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
  for (const t of tvs) {
    const c = configDe(t.id).cfg;
    const norte = t.grupo === 'Unidade Norte';
    assert.equal(deCampanha(c), norte ? 2 : 1, t.name + ' sem as peças da campanha');
    const primeira = c.zonas.principal.items[0];
    assert.equal(primeira._campanha, CAMPANHA.nome, 'a campanha não entrou na frente');
    // O "Quando" (só hoje) começa no dia de quem mandou, e só nas peças que giram.
    assert.equal(primeira.agendamento.dataInicio, hojeIso);
    assert.equal(primeira.agendamento.dataFim, hojeIso);
    assert.ok(primeira.meta && primeira.meta.porque, 'a peça entrou sem a importância');
    assert.ok(c.zonas.rodape.messages.includes(norte ? 'SIPAT: palestras às 15h' : 'Use o EPI'));
    if (norte) {
      assert.equal(c.zonas.cabecalho.pecas[0]._campanha, CAMPANHA.nome);
      assert.ok(!c.zonas.cabecalho.pecas[0].agendamento, 'a faixa de cima ganhou horário');
    }
  }
  assert.equal(configDe(tvs[0].id).cfg.settings.layoutId, 'corporate', 'a TV sem as zonas não trocou de layout');

  // O Desfazer guarda o antes em partes: as 25 TVs têm as mesmas zonas.
  const linha = JSON.parse(banco.prepare('SELECT telas FROM lotes WHERE id = ?').get(ids.lote).telas);
  assert.ok(Object.keys(linha.partes).length < 40, Object.keys(linha.partes).length + ' partes para 25 TVs');
  assert.ok(JSON.stringify(linha).length < 150e3, 'o Desfazer guardou ' + JSON.stringify(linha).length + ' bytes (25 programações inteiras seriam ~2,4 MB)');
  assert.ok(linha.telas.every((t) => t.antesPartes && !('antes' in t)));
  const lista = (await pedir('/api/lote', { cookie: dono.cookie })).json.lotes;
  assert.equal(lista[0].descricao, 'Campanha: ' + CAMPANHA.nome);
  assert.ok(lista[0].telas.every((t) => !('antesPartes' in t) && !('antes' in t)), 'a lista de envios trouxe o antes');
  const desfeito = await pedir('/api/lote/' + ids.lote + '/desfazer', { method: 'POST', cookie: dono.cookie });
  assert.equal(desfeito.status, 200);
  assert.equal(desfeito.json.voltaram.length, 25);
  for (const t of tvs) assert.deepEqual(configDe(t.id).cfg, antes.get(t.id).cfg, t.name + ' não voltou ao que era');

  // De novo no ar, e a pausa tira só o que é da campanha (o layout novo fica).
  comoQuem(dono.cookie);
  const deNovo = await R.rodarCampanha(await R.planoDeRodar(CAMPANHA, tvs), CAMPANHA.nome, { trocarLayout: true });
  assert.equal(deNovo.length, 25);
  comoQuem(dono.cookie);
  await R.pausarCampanha(CAMPANHA, CAMPANHA.nome, tvs, deNovo.slice());
  assert.equal(pedidosDoPainel.length, 1);
  for (const t of tvs) {
    const c = configDe(t.id).cfg;
    assert.equal(deCampanha(c), 0, t.name + ' ficou com peça da campanha');
    assert.equal(c.zonas.principal.items.length, 8, t.name + ': a pausa tirou o que não era da campanha');
    assert.ok(!(c.zonas.rodape.messages || []).some((m) => /SIPAT|Use o EPI/.test(m)), 'a frase da campanha ficou no letreiro');
  }
});

test('a peça pronta e a publicação para muitas TVs: um pedido, cada TV na zona certa, e o Desfazer', async () => {
  const { R, P } = await oPainel();
  const dono = await cadastro();
  const tvs = naConta(dono.tenantId, await tvsNovas(30, '10.82.0.1'));
  // Uma TV sem programação nenhuma: recebe a da TV nova, com a peça.
  naConta(dono.tenantId, [{ id: tvs[29].id }], null, null);
  const antes = new Map(tvs.map((t) => [t.id, configDe(t.id).cfg]));
  const peca = { item: comCampos(PROGRAMA.zonas.principal.items[1], { assunto: 'Vacinação na quinta' }), label: 'Vacinação', campanha: '' };

  comoQuem(dono.cookie);
  const r = await R.porPecaNasTelas(peca, tvs.map((t) => t.id), tvs);
  assert.equal(pedidosDoPainel.length, 1, 'a peça leu ou mandou TV por TV');
  assert.equal(r.ids.length, 30);
  for (const t of tvs.slice(0, 29)) {
    const itens = configDe(t.id).cfg.zonas.principal.items;
    assert.equal(itens.length, 9);
    assert.equal(itens[8].campos.assunto, 'Vacinação na quinta', 'a peça pronta não entrou no fim da principal');
  }
  assert.equal(configDe(tvs[29].id).cfg.settings.layoutId, 'dashboard', 'a TV vazia não recebeu a programação da TV nova');
  const desfeito = await pedir('/api/lote/' + r.lote + '/desfazer', { method: 'POST', cookie: dono.cookie });
  assert.equal(desfeito.json.voltaram.length, 30);
  for (const t of tvs) assert.deepEqual(configDe(t.id).cfg, antes.get(t.id), t.name + ' não voltou ao que era');

  // Publicar (Meus Designs): uma peça deitada, uma em pé e uma faixa de cabeçalho, de manhã, por 3 dias.
  const pecas = [
    { formato: '16/9', faixa: 'manha', item: comCampos(PROGRAMA.zonas.principal.items[2], { numero: '131' }) },
    { formato: '9/16', item: PROGRAMA.zonas.lateral.items[0] },
    { formato: '16/9', item: PROGRAMA.zonas.cabecalho.peca },
  ];
  comoQuem(dono.cookie);
  const pub = await P.publicarPecas({ alvos: tvs.map((t) => t.id), pecas, titulo: 'Bom dia', telas: tvs, dias: 3 });
  assert.equal(pedidosDoPainel.length, 1, 'a publicação leu ou mandou TV por TV');
  assert.equal(pub.ids.length, 30);
  // O mesmo que a regra de uma TV (js/lote-tv.js) daria, com o dia de hoje.
  const esperado = L.montarPublicacao(antes.get(tvs[0].id), { pecas, titulo: 'Bom dia', dias: 3 });
  const c = configDe(tvs[0].id).cfg;
  assert.equal(c.zonas.principal.items[0].campos.numero, '131');
  const so = (a) => [a.dataInicio, a.dataFim, a.horaInicio, a.horaFim].join(' ');
  assert.equal(so(c.zonas.principal.items[0].agendamento), so(esperado.zonas.principal.items[0].agendamento), 'a faixa de horário saiu diferente da regra do painel');
  assert.equal(c.zonas.principal.items[0].agendamento.horaInicio, '00:00', 'a manhã sozinha não cobriu o dia (fase 5)');
  assert.equal(c.zonas.principal.items[0]._campanha, 'Bom dia');
  assert.equal(c.zonas.lateral.items[0]._campanha, 'Bom dia', 'a peça em pé não foi para a lateral');
  assert.equal(c.zonas.lateral.items.length, 4);
  assert.equal(c.zonas.cabecalho.pecas.length, 2, 'a faixa não foi para o cabeçalho');
  assert.equal(c.zonas.cabecalho.pecas[1]._campanha, 'Bom dia');
  assert.equal((await pedir('/api/lote/' + pub.lote + '/desfazer', { method: 'POST', cookie: dono.cookie })).json.voltaram.length, 30);
  assert.deepEqual(configDe(tvs[0].id).cfg, antes.get(tvs[0].id));
});

test('a operação segue a loja de cada membro e a aprovação, e recusa o que não é dela', async () => {
  const { R } = await oPainel();
  const dono = await cadastro();
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono.cookie, json: { plan: 'pro' } })).status, 200);
  const emailDoMembro = emailNovo();
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono.cookie, json: { email: emailDoMembro, role: 'member' } });
  const membro = await cadastro({ inviteCode: convite.json.code, name: 'Gerente Sul' }, emailDoMembro);
  const me = (await pedir('/api/auth/me', { cookie: membro.cookie })).json;
  const tvs = naConta(dono.tenantId, await tvsNovas(6, '10.83.0.1'), (i) => (i < 4 ? 'Unidade Sul' : 'Unidade Norte'));
  assert.equal((await pedir('/api/lojas/' + me.user.id, { method: 'PUT', cookie: dono.cookie, json: { grupos: ['Unidade Sul'] } })).status, 200);
  const sul = tvs.slice(0, 4);
  const versoes = () => tvs.map((t) => configDe(t.id).versao);
  const antes = versoes();
  const peca = { item: PROGRAMA.zonas.principal.items[3], label: 'Segurança' };

  // A lista misturada: nada vai, nem o plano é feito.
  comoQuem(membro.cookie);
  await assert.rejects(R.porPecaNasTelas(peca, tvs.map((t) => t.id), tvs), /não é da sua loja/);
  await assert.rejects(R.planoDeRodar({ nome: 'X', telas: [CAMPANHA.telas[1]] }, tvs), /não é da sua loja/);
  assert.deepEqual(versoes(), antes, 'uma TV mudou com o envio recusado');

  // A aprovação ligada: vira pedido (202), nada muda até o dono aprovar.
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono.cookie, json: { ligada: true } })).status, 200);
  comoQuem(membro.cookie);
  const pedido = await R.porPecaNasTelas(peca, sul.map((t) => t.id), sul);
  assert.equal(pedido.pendente, true);
  assert.deepEqual(versoes(), antes, 'o envio do membro foi para a TV sem aprovação');
  const fila = (await pedir('/api/aprovacoes', { cookie: dono.cookie })).json.pendentes;
  assert.equal(fila.length, 1);
  assert.equal(fila[0].descricao, 'Peça: Segurança');
  const ok = await pedir('/api/aprovacoes/' + fila[0].id + '/aprovar', { method: 'POST', cookie: dono.cookie });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  for (const t of sul) assert.equal(configDe(t.id).cfg.zonas.principal.items.length, 9, t.name + ': aprovado e a peça não foi');
  for (const t of tvs.slice(4)) assert.equal(configDe(t.id).cfg.zonas.principal.items.length, 8);

  // O que o servidor recusa sem ler TV nenhuma.
  const op = (json) => pedir('/api/lote/operacao', { method: 'POST', cookie: dono.cookie, json });
  assert.equal((await op({ operacao: { tipo: 'apagar-tudo' }, telas: [tvs[0].id] })).json.code, 'operacao-invalida');
  assert.equal((await op({ operacao: { tipo: 'campanha', nome: 'X', entradas: [] }, telas: [tvs[0].id] })).json.code, 'operacao-invalida');
  assert.equal((await op({ operacao: { tipo: 'campanha', nome: 'X', entradas: [CAMPANHA.telas[1]] }, telas: [{ id: tvs[0].id, entrada: 3 }] })).json.code, 'operacao-invalida');
  assert.equal((await op({ operacao: { tipo: 'peca', peca: { item: { type: 'peca-html', html: 'x'.repeat(120e3) } } }, telas: [tvs[0].id] })).json.code, 'operacao-invalida');
  assert.equal((await op({ operacao: { tipo: 'peca', peca }, telas: [tvs[0].id, tvs[0].id] })).json.code, 'tv-repetida');
  const grande = await op({ operacao: { tipo: 'peca', peca }, telas: Array.from({ length: 1001 }, (_, i) => 'dev_' + i) });
  assert.equal(grande.json.code, 'lote-grande');
  assert.equal(grande.json.max, 1000);
  // A peça passa pela porta, em toda TV.
  const ruim = await op({ operacao: { tipo: 'peca', peca: { item: Object.assign({}, peca.item, { html: peca.item.html + '<script>x()</script>' }) } }, telas: [tvs[0].id] });
  assert.equal(ruim.status, 400);
  assert.match(ruim.json.error, /Nada foi enviado/);
});

test('o lote de antes (POST /api/lote) também guarda o antes em partes, e o Desfazer remonta igual', async () => {
  const dono = await cadastro();
  const tvs = naConta(dono.tenantId, await tvsNovas(3, '10.84.0.1'));
  const antes = tvs.map((t) => configDe(t.id));
  const itens = tvs.map((t, i) => {
    const c = JSON.parse(JSON.stringify(antes[i].cfg));
    c.zonas.principal.items.unshift({ type: 'text', titulo: 'Novo', duracao: 10 });
    return { id: t.id, config: c, versao: antes[i].versao };
  });
  const r = await pedir('/api/lote', { method: 'POST', cookie: dono.cookie, json: { itens, descricao: 'Texto novo' } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const linha = JSON.parse(banco.prepare('SELECT telas FROM lotes WHERE id = ?').get(r.json.lote).telas);
  assert.equal(linha.telas.length, 3);
  // As 3 TVs têm as mesmas zonas: 4 zonas + o resto de cada TV (o nome muda).
  assert.ok(Object.keys(linha.partes).length <= 4 + 3, Object.keys(linha.partes).length + ' partes');
  assert.equal((await pedir('/api/lote/' + r.json.lote + '/desfazer', { method: 'POST', cookie: dono.cookie })).json.voltaram.length, 3);
  tvs.forEach((t, i) => assert.deepEqual(configDe(t.id).cfg, antes[i].cfg));
});

/* ---------------- A Programação da conta grande ---------------- */

test('Programação: todas num pedido até 12 TVs; acima, a resposta diz "grande" e cada cartão pede a sua', async () => {
  const grande = await cadastro();
  const tvs = naConta(grande.tenantId, await tvsNovas(14, '10.85.0.1'));
  const g = await pedir('/api/devices/configs?ate=12', { cookie: grande.cookie });
  assert.equal(g.status, 200);
  assert.deepEqual(g.json, { configs: {}, grande: true, total: 14 });
  assert.ok(g.bytes < 200, 'a resposta da conta grande trouxe programação');
  // O cartão que aparece pede a sua, em grupo.
  const duas = await pedir('/api/devices/configs?ate=12&ids=' + tvs[0].id + ',' + tvs[1].id, { cookie: grande.cookie });
  assert.deepEqual(Object.keys(duas.json.configs).sort(), [tvs[0].id, tvs[1].id].sort());
  // Sem o `ate`, o de sempre (todas).
  assert.equal(Object.keys((await pedir('/api/devices/configs', { cookie: grande.cookie })).json.configs).length, 14);
  const pequena = await cadastro();
  naConta(pequena.tenantId, await tvsNovas(3, '10.85.0.2'));
  const p = await pedir('/api/devices/configs?ate=12', { cookie: pequena.cookie });
  assert.equal(Object.keys(p.json.configs).length, 3, 'a conta pequena deixou de abrir num pedido só');
  assert.ok(!p.json.grande);

  const pg = ler('web/src/pages/ProgramacaoPage.jsx');
  assert.match(pg, /const PROGRAMACAO_JUNTO = 12;/);
  assert.match(pg, /if \(t\.ok && t\.ok\.grande\) \{ setGrande\(true\); setCfgs\(\{\}\); return; \}/);
  assert.match(pg, /const \[ref, perto\] = usePerto\(grande && bruta === undefined\);/);
  assert.match(pg, /useEffect\(\(\) => \{ if \(grande && perto && bruta === undefined\) onLer\(d\.id\); \}/);
  assert.match(pg, /<div ref=\{ref\} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">/);
});

/* ---------------- A 2ª TV do grátis: o motivo também no pulso ---------------- */

test('a recusa do pareamento também vai no pulso da TV (sem o tempo real), e sai quando ela entra na conta', async () => {
  const conta = await cadastro();
  const ip = '10.86.0.1';
  const primeira = (await pedir('/api/devices', { method: 'POST', ip })).json;
  assert.equal((await pedir('/api/pair', { method: 'POST', cookie: conta.cookie, ip, json: { code: primeira.code, nova: true } })).status, 200);
  const segunda = (await pedir('/api/devices', { method: 'POST', ip })).json;
  const pulso = () => pedir('/api/devices/' + segunda.id + '/heartbeat', { method: 'POST', json: {}, headers: { 'x-device-token': segunda.deviceToken } });
  assert.ok(!('recusada' in (await pulso()).json), 'a TV que ninguém tentou parear recebeu recusa');
  assert.equal((await pedir('/api/pair', { method: 'POST', cookie: conta.cookie, ip, json: { code: segunda.code, nova: true } })).status, 402);
  const r = (await pulso()).json;
  assert.equal(r.recusada.titulo, 'O plano grátis tem 1 TV');
  assert.match(r.recusada.texto, /em Plano\. Depois, é só digitar este código de novo\./);
  // Com plano, o mesmo código entra — e o recado sai do pulso.
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: conta.cookie, json: { plan: 'pro' } })).status, 200);
  assert.equal((await pedir('/api/pair', { method: 'POST', cookie: conta.cookie, ip, json: { code: segunda.code, nova: true } })).status, 200);
  assert.ok(!('recusada' in (await pulso()).json));
  // A TV mostra o que vem no pulso pelo mesmo caminho do tempo real.
  assert.match(ler('js/cloud.js'), /if \(r && r\.recusada && typeof r\.recusada === 'object'\) \{\s*document\.dispatchEvent\(new CustomEvent\('mt:pareamento-recusado', \{ detail: r\.recusada \}\)\);/);
  // O player mudou (o recado no pulso): o shell da TV subiu de versão — v92 ou depois, para não prender a próxima mudança.
  assert.ok(Number((/const SHELL_CACHE = 'mt-shell-v(\d+)';/.exec(ler('sw.js')) || [])[1]) >= 92);
});

/* ---------------- A regra de uma TV, igual nos dois lados ---------------- */

test('js/lote-tv.js: o painel usa a mesma regra que o servidor (a campanha, a peça, o "Quando" e as datas)', async () => {
  const { R } = await oPainel();
  const A = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/aplicarConteudo.js')).href);
  const Q = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/quando.js')).href);
  const entrada = CAMPANHA.telas[0];
  // O painel aplica a importância; o servidor recebe a peça já com ela (rodar.js, campanhaParaOServidor).
  const imp = (it) => globalThis.MTImportancia.comImportancia(it);
  const comImp = { zonas: Object.assign({}, entrada.zonas, { principal: entrada.zonas.principal.map((p) => ({ item: imp(p.item) })), lateral: entrada.zonas.lateral.map((p) => ({ item: imp(p.item) })) }) };
  assert.deepEqual(L.aplicarCampanha(PROGRAMA, comImp, 'X', { trocarLayout: true }), R.aplicarCampanha(PROGRAMA, entrada, 'X', { trocarLayout: true }));
  assert.deepEqual(R.aplicarPeca(PROGRAMA, { item: { type: 'text', titulo: 'a' }, papel: 'rodape' }), L.aplicarPeca(PROGRAMA, { item: { type: 'text', titulo: 'a' }, papel: 'rodape' }));
  // As datas: com `agora`, o dia de referência; sem ele, o relógio de quem roda.
  const agora = new Date('2026-11-16T12:00:00');
  assert.deepEqual(L.agendarPeca({ id: 'a' }, 'tarde', 3, agora).agendamento, { ativo: true, dataInicio: '2026-11-16', dataFim: '2026-11-18', dias: [], horaInicio: '14:00', horaFim: '17:29' });
  assert.deepEqual(A.agendarPeca({ id: 'a' }, 'tarde', 3, agora), L.agendarPeca({ id: 'a' }, 'tarde', 3, agora));
  assert.equal(L.comQuando({ id: 'a' }, { quando: 'ate', ate: '2026-11-20' }, agora).agendamento.dataFim, '2026-11-20');
  assert.equal(Q.diasAte('2026-11-20', agora), 5);
  assert.equal(Q.comQuando({ id: 'a' }, { quando: 'hora', faixa: 'almoco' }).agendamento.escolhido, true);
  // Os nomes de sempre continuam no painel.
  for (const f of ['aplicarConteudo', 'removerOrigem', 'distribuirPorZona', 'cobrirODia', 'agendarPeca']) assert.equal(typeof A[f], 'function', f);
  for (const f of ['zonasPorPapel', 'zonasQueFaltam', 'layoutPara', 'aplicarCampanha', 'tirarCampanha', 'quandoNaCampanha', 'aplicarPeca', 'planoDeRodar', 'rodarCampanha', 'pausarCampanha', 'porPecaNasTelas']) assert.equal(typeof R[f], 'function', f);
});

/* ---------------- Os outros envios para muitas TVs (terceira leva) ---------------- */

test('a Agenda para a conta grande: as datas de cada TV num pedido, a data que muda de grupo sai das TVs de antes, e apagar tira de todas', async () => {
  await oPainel();
  const C = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/calendario.js')).href);
  const dono = await cadastro();
  const tvs = naConta(dono.tenantId, await tvsNovas(25, '10.87.0.1'), (i) => (i < 5 ? 'Unidade Norte' : 'Unidade Sul'));
  const item = (titulo) => comCampos(PROGRAMA.zonas.principal.items[1], { assunto: titulo });
  const salvos = [
    { id: 'cal_sipat', titulo: 'SIPAT', data: '2099-11-20', antecedencia: 5, tipo: 'evento', prioridade: 'alta', alvo: { tipo: 'todas' }, item: item('SIPAT') },
    { id: 'cal_vacina', titulo: 'Vacinação', data: '2099-11-25', antecedencia: 2, tipo: 'aviso', prioridade: 'urgente', alvo: { tipo: 'grupo', nome: 'Unidade Norte' }, item: item('Vacinação') },
  ];
  comoQuem(dono.cookie);
  const r = await C.porAgendaNasTelas(salvos, tvs);
  assert.equal(pedidosDoPainel.length, 1, 'a Agenda leu ou mandou TV por TV');
  assert.equal(r.ids.length, 25);
  const datas = (id) => configDe(id).cfg.zonas.principal.items.filter((it) => it._calendario).map((it) => it._calendario + ' ' + it.agendamento.dataInicio + '→' + it.agendamento.dataFim);
  for (const t of tvs) {
    assert.deepEqual(datas(t.id), t.grupo === 'Unidade Norte'
      ? ['cal_sipat 2099-11-15→2099-11-20', 'cal_vacina 2099-11-23→2099-11-25']
      : ['cal_sipat 2099-11-15→2099-11-20'], t.name);
    assert.equal(configDe(t.id).cfg.zonas.principal.items.length, 8 + (t.grupo === 'Unidade Norte' ? 2 : 1));
  }
  // A vacinação vai para a Unidade Sul: sai das 5 TVs da Norte (onde estava) e entra nas 20 da Sul.
  const mudou = salvos.map((e) => (e.id === 'cal_vacina' ? { ...e, alvo: { tipo: 'grupo', nome: 'Unidade Sul' }, telas: tvs.slice(0, 5).map((t) => t.id) } : { ...e, telas: tvs.map((t) => t.id) }));
  comoQuem(dono.cookie);
  await C.porAgendaNasTelas(mudou, tvs);
  assert.equal(pedidosDoPainel.length, 1);
  for (const t of tvs) assert.equal(datas(t.id).some((d) => d.startsWith('cal_vacina')), t.grupo === 'Unidade Sul', t.name);
  // Apagar a SIPAT: sai das 25.
  comoQuem(dono.cookie);
  const tirou = await C.tirarDaAgenda({ ...mudou[0], telas: tvs.map((t) => t.id) }, tvs);
  assert.equal(pedidosDoPainel.length, 1);
  for (const t of tvs) assert.ok(!datas(t.id).some((d) => d.startsWith('cal_sipat')), t.name);
  assert.equal((await pedir('/api/lote', { cookie: dono.cookie })).json.lotes[0].descricao, 'Tirar: SIPAT');
  assert.equal((await pedir('/api/lote/' + tirou.lote + '/desfazer', { method: 'POST', cookie: dono.cookie })).json.voltaram.length, 25);
  for (const t of tvs) assert.ok(datas(t.id).some((d) => d.startsWith('cal_sipat')), 'o Desfazer não devolveu a data à ' + t.name);
  // A data sem dia, ou a operação sem a data: nada vai.
  const op = (json) => pedir('/api/lote/operacao', { method: 'POST', cookie: dono.cookie, json });
  assert.equal((await op({ operacao: { tipo: 'calendario', eventos: [{ id: 'x', data: 'amanhã' }], entradas: [{ dela: [0], fora: [] }] }, telas: [{ id: tvs[0].id, entrada: 0 }] })).json.code, 'operacao-invalida');
  assert.equal((await op({ operacao: { tipo: 'tirar-calendario' }, telas: [tvs[0].id] })).json.code, 'operacao-invalida');
});

test('o indicador e a planilha na área principal de muitas TVs: um pedido, e pôr de novo troca, não duplica', async () => {
  const { R } = await oPainel();
  const dono = await cadastro();
  const tvs = naConta(dono.tenantId, await tvsNovas(25, '10.88.0.1'));
  const kpi = { type: 'kpi', indicador: 'acidentes', rotulo: 'Dias sem acidente', duracao: 12 };
  comoQuem(dono.cookie);
  const r = await R.enviarOperacao({ tipo: 'indicador', item: kpi }, tvs);
  assert.equal(pedidosDoPainel.length, 1);
  assert.equal(r.ids.length, 25);
  await R.enviarOperacao({ tipo: 'indicador', item: kpi }, tvs);
  for (const t of tvs) {
    const itens = configDe(t.id).cfg.zonas.principal.items;
    assert.equal(itens.filter((i) => i.type === 'kpi' && i.indicador === 'acidentes').length, 1, 'o indicador duplicou na ' + t.name);
    assert.equal(itens[itens.length - 1].type, 'kpi', 'o indicador não entrou no fim da principal');
  }
  assert.equal((await pedir('/api/lote', { cookie: dono.cookie })).json.lotes[0].descricao, 'Indicador: Dias sem acidente');

  const precos = (secao) => ({ type: 'precos', titulo: 'CARDÁPIO', colunas: 'auto', duracao: 20, rodape: '', linhas: 'Café;5', planilha: 'pla_1', ...(secao ? { planilhaSecao: secao } : {}) });
  comoQuem(dono.cookie);
  await R.enviarOperacao({ tipo: 'planilha', item: precos(''), nome: 'Cantina' }, tvs);
  await R.enviarOperacao({ tipo: 'planilha', item: precos(''), nome: 'Cantina' }, tvs);
  await R.enviarOperacao({ tipo: 'planilha', item: precos('Bebidas'), nome: 'Cantina' }, tvs);
  assert.equal(pedidosDoPainel.length, 3);
  for (const t of tvs) {
    const daPlanilha = configDe(t.id).cfg.zonas.principal.items.filter((i) => i.planilha === 'pla_1');
    assert.deepEqual(daPlanilha.map((i) => i.planilhaSecao || ''), ['', 'Bebidas'], 'a mesma planilha duplicou (ou a outra seção trocou a primeira) na ' + t.name);
  }
  const op = (json) => pedir('/api/lote/operacao', { method: 'POST', cookie: dono.cookie, json });
  assert.equal((await op({ operacao: { tipo: 'indicador', item: { type: 'text', titulo: 'x' } }, telas: [tvs[0].id] })).json.code, 'operacao-invalida');
  assert.equal((await op({ operacao: { tipo: 'planilha', item: { type: 'precos' } }, telas: [tvs[0].id] })).json.code, 'operacao-invalida');
  // A porta vale: a planilha em forma de peça com script não vai para TV nenhuma.
  const cardapio = PROGRAMA.zonas.principal.items[6];
  const ruim = await op({ operacao: { tipo: 'planilha', item: { ...cardapio, html: cardapio.html + '<script>x()</script>', planilha: 'pla_2' }, nome: 'X' }, telas: [tvs[0].id] });
  assert.equal(ruim.status, 400);
});

test('a tela pronta em muitas TVs: o layout e as peças dela em cada uma, o resto da TV fica, e o Desfazer devolve tudo', async () => {
  const { R } = await oPainel();
  const dono = await cadastro();
  const tvs = naConta(dono.tenantId, await tvsNovas(25, '10.89.0.1'));
  const antes = new Map(tvs.map((t) => [t.id, configDe(t.id).cfg]));
  const tela = {
    id: 'rh-boas-vindas', nome: 'Boas-vindas', layout: 'sidebar-right',
    grupos: {
      principal: [PROGRAMA.zonas.principal.items[0], { ...PROGRAMA.zonas.principal.items[2], _pendentes: ['telefone'] }],
      lateral: [PROGRAMA.zonas.lateral.items[0]],
      rodape: [],
    },
    mensagens: ['Bem-vindo à Metalúrgica Alfa'],
  };
  comoQuem(dono.cookie);
  const r = await R.enviarOperacao({ tipo: 'tela-pronta', tela }, tvs.map((t) => ({ id: t.id })));
  assert.equal(pedidosDoPainel.length, 1);
  assert.ok(pedidosDoPainel[0].bytes < 60e3, 'a tela pronta foi com ' + pedidosDoPainel[0].bytes + ' bytes');
  for (const t of tvs) {
    const c = configDe(t.id).cfg;
    assert.equal(c.settings.layoutId, 'sidebar-right');
    assert.equal(c.settings.transicao, PROGRAMA.settings.transicao, 'o resto da programação mudou');
    assert.equal(c.zonas.principal.items.length, 2);
    assert.ok(!c.zonas.principal.items.some((i) => '_pendentes' in i), 'o que é só do painel foi para a TV');
    assert.equal(c.zonas.principal.items[0].origem.pedido, 'tela pronta');
    assert.equal(c.zonas.lateral.items.length, 1);
    assert.deepEqual(c.zonas.rodape.messages, ['Bem-vindo à Metalúrgica Alfa']);
    assert.equal(c.zonas.rodape.movimento, 'manchetes', 'o rodapé perdeu o jeito dele (movimento)');
  }
  assert.equal((await pedir('/api/lote/' + r.lote + '/desfazer', { method: 'POST', cookie: dono.cookie })).json.voltaram.length, 25);
  for (const t of tvs) assert.deepEqual(configDe(t.id).cfg, antes.get(t.id));
  const op = (json) => pedir('/api/lote/operacao', { method: 'POST', cookie: dono.cookie, json });
  assert.equal((await op({ operacao: { tipo: 'tela-pronta', tela: { ...tela, layout: 'nao-existe' } }, telas: [tvs[0].id] })).json.code, 'operacao-invalida');
  assert.equal((await op({ operacao: { tipo: 'tela-pronta', tela: { ...tela, grupos: { principal: [{ type: 'text', html: 'x'.repeat(120e3) }] } } }, telas: [tvs[0].id] })).json.code, 'operacao-invalida');
});

test('o quiz do Criar em muitas TVs: um pedido, na lateral pedida (ou na principal, dizendo quais), conferido, sem duplicar', async () => {
  const { R } = await oPainel();
  const dono = await cadastro();
  const tvs = naConta(dono.tenantId, await tvsNovas(22, '10.90.1.1'));
  // Duas TVs num layout sem lateral: o quiz cai na principal delas.
  const cheia = Object.assign({}, PROGRAMA, { settings: Object.assign({}, PROGRAMA.settings, { layoutId: 'full' }), zonas: { principal: PROGRAMA.zonas.principal } });
  for (const t of tvs.slice(0, 2)) banco.prepare('UPDATE devices SET config = ? WHERE id = ?').run(JSON.stringify(cheia), t.id);
  const quiz = { titulo: 'Quiz da segurança', tempo: 10, revelar: 7, perguntas: [
    { pergunta: 'Onde fica o extintor?', alternativas: ['Na saída', 'No teto'], certa: 0, explicacao: '', revisada: false },
  ] };
  comoQuem(dono.cookie);
  const r = await R.enviarOperacao({ tipo: 'quiz', quiz, zona: 'lateral', id: 'conv1:4' }, tvs);
  assert.equal(pedidosDoPainel.length, 1);
  assert.deepEqual((r.marcadas || []).slice().sort(), tvs.slice(0, 2).map((t) => t.id).sort(), 'o painel não sabe em que TVs o quiz caiu na principal');
  await R.enviarOperacao({ tipo: 'quiz', quiz, zona: 'lateral', id: 'conv1:4' }, tvs);
  tvs.forEach((t, i) => {
    const c = configDe(t.id).cfg;
    const zona = i < 2 ? 'principal' : 'lateral';
    const q = c.zonas[zona].items.filter((it) => it.type === 'quiz');
    assert.equal(q.length, 1, t.name + ': o quiz não entrou na ' + zona + ' (ou duplicou)');
    assert.equal(q[0]._quiz, 'conv1:4');
    assert.ok(q[0].perguntas.every((p) => p.revisada), 'a TV recebeu pergunta não conferida');
  });
  assert.equal((await pedir('/api/lote/operacao', { method: 'POST', cookie: dono.cookie, json: { operacao: { tipo: 'quiz', quiz: { titulo: 'x', perguntas: [] }, zona: 'lateral', id: 'q' }, telas: [tvs[0].id] } })).json.code, 'operacao-invalida');
});

test('o pedido de aprovação grande: a lista vem leve e cada TV pede o antes e o depois dela; o pequeno, como antes', async () => {
  const { R } = await oPainel();
  const dono = await cadastro();
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono.cookie, json: { plan: 'pro' } })).status, 200);
  const emailDoMembro = emailNovo();
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono.cookie, json: { email: emailDoMembro, role: 'member' } });
  const membro = await cadastro({ inviteCode: convite.json.code, name: 'Gerente' }, emailDoMembro);
  const emailDoOutro = emailNovo();
  const convite2 = await pedir('/api/team/invites', { method: 'POST', cookie: dono.cookie, json: { email: emailDoOutro, role: 'member' } });
  const outro = await cadastro({ inviteCode: convite2.json.code, name: 'Outro' }, emailDoOutro);
  const tvs = naConta(dono.tenantId, await tvsNovas(16, '10.90.2.1'));
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono.cookie, json: { ligada: true } })).status, 200);
  const peca = { item: PROGRAMA.zonas.principal.items[3], label: 'Segurança' };
  comoQuem(membro.cookie);
  assert.equal((await R.porPecaNasTelas(peca, tvs.map((t) => t.id), tvs)).pendente, true);
  const grande = (await pedir('/api/aprovacoes', { cookie: dono.cookie })).json.pendentes[0];
  // Uma TV mudou depois do pedido: a lista leve já diz.
  banco.prepare('UPDATE devices SET updated_at = ? WHERE id = ?').run(Date.now() + 50, tvs[3].id);
  const lista = await pedir('/api/aprovacoes/' + grande.id, { cookie: dono.cookie });
  assert.equal(lista.status, 200);
  assert.equal(lista.json.telas.length, 16);
  assert.ok(lista.bytes < 10e3, 'o pedido grande veio com ' + lista.bytes + ' bytes (antes: o antes e o depois de cada TV, ~3 MB)');
  assert.ok(lista.json.telas.every((t) => t.sobDemanda && !('antes' in t) && !('depois' in t) && t.existe));
  assert.deepEqual(lista.json.telas.filter((t) => t.mudouDepois).map((t) => t.id), [tvs[3].id]);
  assert.equal(lista.json.pedido.estado, 'pendente');
  const uma = await pedir('/api/aprovacoes/' + grande.id + '/telas/' + tvs[5].id, { cookie: dono.cookie });
  assert.equal(uma.status, 200);
  assert.equal(uma.json.tela.antes.zonas.principal.items.length, 8);
  assert.equal(uma.json.tela.depois.zonas.principal.items.length, 9, 'o depois não tem a peça pedida');
  assert.ok(uma.json.tela.antes.settings.theme, 'o antes sem a marca, como a TV desenha');
  // Quem pediu vê; outro membro, não; TV fora do pedido, não.
  assert.equal((await pedir('/api/aprovacoes/' + grande.id + '/telas/' + tvs[5].id, { cookie: membro.cookie })).status, 200);
  assert.equal((await pedir('/api/aprovacoes/' + grande.id + '/telas/' + tvs[5].id, { cookie: outro.cookie })).status, 404);
  assert.equal((await pedir('/api/aprovacoes/' + grande.id + '/telas/dev_nao', { cookie: dono.cookie })).status, 404);
  // O pedido pequeno (até 12 TVs) segue com o antes e o depois juntos.
  await pedir('/api/aprovacoes/' + grande.id + '/recusar', { method: 'POST', cookie: dono.cookie, json: { motivo: 'teste' } });
  comoQuem(membro.cookie);
  await R.porPecaNasTelas(peca, tvs.slice(0, 3).map((t) => t.id), tvs);
  const pequeno = (await pedir('/api/aprovacoes', { cookie: dono.cookie })).json.pendentes[0];
  const p = await pedir('/api/aprovacoes/' + pequeno.id, { cookie: dono.cookie });
  assert.ok(p.json.telas.every((t) => t.antes && t.depois && !t.sobDemanda));
  const pg = ler('web/src/pages/AprovacoesPage.jsx');
  assert.match(pg, /\{telas\.map\(\(t\) => \(t\.sobDemanda\s*\? <TelaSobDemanda key=\{t\.id\} pedidoId=\{id\} t=\{t\} nomesDasMidias=\{nomesDasMidias\} \/>/);
  assert.match(pg, /const \[ref, perto\] = usePerto\(true\);/);
  assert.match(pg, /aprovacoes\.tela\(pedidoId, t\.id\)\.then/);
});
