/*
 * A conta grande de RH, depois do teste de carga (16/11 —
 * docs/CAPACIDADE-E-TVBOX.md, §3.5 e §4): a página Telas leve, os limites de
 * quem instala 300 TVs, o aviso rápido feito pelo servidor e a 2ª TV do
 * plano grátis dizendo por que não entrou.
 *
 * As contas grandes são montadas direto no banco (a TV nasce pelo
 * POST /api/devices, o vínculo e a programação de RH vão por SQL): montar
 * pelo painel gastaria o freio da conta, que é uma das coisas medidas aqui.
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
const PH = require('../js/peca-html.js');
// O catálogo de layouts no global (MT_getLayout), como no painel.
require('../js/aviso.js');
// MT_TESTE_PORTA_GRANDE: a máquina que só pode usar certas portas escolhe qual.
const PORTA = Number(process.env.MT_TESTE_PORTA_GRANDE) || 9300 + Math.floor(Math.random() * 90);

/* ---------------- O servidor de verdade, um para o arquivo ---------------- */

let servidor = null;
let dados = '';
let banco = null;
before(async () => {
  dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conta-grande-'));
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    // TRUST_PROXY=1: cada escritório (IP) vem no X-Forwarded-For, como atrás do proxy do Railway.
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
        resolve({ status: res.statusCode, json, headers: res.headers, bytes: Buffer.byteLength(txt), enviados: corpo ? corpo.length : 0, cookies: [].concat(res.headers['set-cookie'] || []) });
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
const emailNovo = () => 'cg' + (++seq) + '-' + Date.now() + '@teste.local';
// `email`: o do convite, para entrar como membro (com `extra.inviteCode`).
async function cadastro(extra, emailDoConvite) {
  const email = emailDoConvite || emailNovo();
  const r = await pedir('/api/auth/signup', { method: 'POST', ip: '10.90.0.' + (seq % 250), json: { email, password: 'senha-de-teste-123', name: 'Metalúrgica ' + seq, aceite: true, perfil: 'empresa', ...(extra || {}) } });
  assert.equal(r.status, 201, 'o cadastro falhou: ' + JSON.stringify(r.json));
  return { cookie: cookieDe(r), email };
}
const tenantDe = (email) => banco.prepare('SELECT tenant_id FROM users WHERE email = ?').get(email).tenant_id;
// TVs novas (sem dono), de um IP só por chamada.
async function tvsNovas(n, ip) {
  const tvs = [];
  for (let i = 0; i < n; i += 10) {
    const parte = await Promise.all(Array.from({ length: Math.min(10, n - i) }, () => pedir('/api/devices', { method: 'POST', ip })));
    for (const r of parte) { assert.equal(r.status, 201, 'TV nova recusada: ' + JSON.stringify(r.json)); tvs.push(r.json); }
  }
  return tvs;
}
// Põe as TVs na conta, com a programação de RH (~96 KB) e o grupo de cada uma.
const PROGRAMA = montarProgramaRh({});
function naConta(tenantId, tvs, grupoDe, programa) {
  const agora = Date.now();
  tvs.forEach((tv, i) => {
    const c = programa === null ? null : JSON.stringify(programa || PROGRAMA);
    banco.prepare('UPDATE devices SET tenant_id = ?, name = ?, config = ?, updated_at = ?, last_seen = ?, grupo = ? WHERE id = ?')
      .run(tenantId, 'TV ' + (i + 1), c, agora - i, agora, grupoDe ? grupoDe(i) : null, tv.id);
  });
}
const configDe = (id) => { const r = banco.prepare('SELECT config, updated_at FROM devices WHERE id = ?').get(id); return { cfg: r.config ? JSON.parse(r.config) : null, versao: Number(r.updated_at) }; };
const primeiroDaPrincipal = (id) => { const c = configDe(id).cfg; return c && c.zonas && c.zonas.principal && c.zonas.principal.items[0]; };

/* ---------------- 1. A página Telas da conta grande ---------------- */

test('Telas da conta grande: a lista vem sem a programação; a conta pequena segue num pedido só', async () => {
  const grande = await cadastro();
  const tvs = await tvsNovas(14, '10.91.0.1');
  naConta(tenantDe(grande.email), tvs, (i) => (i % 2 ? 'Loja Norte' : 'Loja Sul'));
  const r = await pedir('/api/devices?agora=1', { cookie: grande.cookie });
  assert.equal(r.status, 200);
  assert.equal(r.json.devices.length, 14);
  for (const d of r.json.devices) {
    assert.ok(!('programacao' in d), 'a lista da conta grande trouxe a programação da ' + d.name);
    assert.equal(d.hasConfig, true);
    assert.deepEqual(d.agora, { em: 0, estado: null, online: false }, 'o cartão perdeu a última resposta da TV');
    assert.ok(d.grupo && d.updatedAt && d.lastSeen, 'o cartão perdeu o resumo de que precisa');
  }
  const programacoes = 14 * JSON.stringify(PROGRAMA).length;
  assert.ok(r.bytes < programacoes / 50, 'a lista leve tem ' + r.bytes + ' bytes');

  // A miniatura que aparece pede a sua, em grupo: a mesma programação de antes, como o painel vê.
  const ids = r.json.devices.slice(0, 3).map((d) => d.id);
  const lote = await pedir('/api/devices/configs?ids=' + ids.join(','), { cookie: grande.cookie });
  assert.deepEqual(Object.keys(lote.json.configs).sort(), ids.slice().sort());
  for (const id of ids) {
    assert.equal(lote.json.configs[id].config.settings.layoutId, 'corporate');
    assert.ok(lote.json.configs[id].config.settings.theme, 'sem o tema da marca');
  }

  // A conta pequena (até 12 TVs): a programação continua vindo junto, e a página abre num pedido.
  const pequena = await cadastro();
  const poucas = await tvsNovas(3, '10.91.0.2');
  naConta(tenantDe(pequena.email), poucas);
  const p = await pedir('/api/devices?agora=1', { cookie: pequena.cookie });
  assert.equal(p.json.devices.length, 3);
  for (const d of p.json.devices) assert.equal(d.programacao.settings.layoutId, 'corporate', 'a conta pequena ficou sem a programação na lista');
  // A lista de sempre (sem ?agora=1) continua leve.
  assert.ok(!('programacao' in (await pedir('/api/devices', { cookie: pequena.cookie })).json.devices[0]));
});

test('o painel: a miniatura pede a programação só quando aparece e há o que desenhar; de 25 em 25, 2 pedidos no ar', async () => {
  const m = ler('web/src/components/tela/MiniaturaDaTela.jsx');
  assert.match(m, /new IntersectionObserver\(\(v\) => \{ if \(v\.some\(\(x\) => x\.isIntersecting\)\) setPerto\(true\); \}, \{ rootMargin: '200px' \}\)/);
  assert.match(m, /if \(cfg \|\| vazia \|\| !perto \|\| !temImagem\) return undefined;\s*let vivo = true;\s*lerProgramacao\(d\.id, d\.updatedAt \|\| 0\)/, 'a miniatura lê a programação sem aparecer na tela');
  assert.equal((m.match(/ref=\{setCaixa\}/g) || []).length, 2, 'as duas caras da miniatura precisam ser observadas');
  assert.match(ler('server/routes/telas.js'), /if \(list\.length <= PROGRAMACAO_NA_LISTA\) \{/);

  // O junta-junta de verdade, com o fetch de mentira: 60 miniaturas no mesmo instante.
  const pedidos = [];
  const fetchAntes = globalThis.fetch;
  const windowAntes = globalThis.window;
  globalThis.window = { dispatchEvent: () => true, addEventListener: () => {} };
  globalThis.fetch = (url) => new Promise((ok) => {
    const ids = decodeURIComponent(String(url).split('ids=')[1] || '').split(',');
    pedidos.push({ ids, responder: () => ok({ status: 200, ok: true, headers: new Map(), json: async () => ({ configs: Object.fromEntries(ids.map((id) => [id, { config: { id }, versao: 1 }])) }) }) });
  });
  try {
    const api = await import(pathToFileURL(path.join(RAIZ, 'web/src/api.js')).href);
    const todas = Array.from({ length: 60 }, (_, i) => 'dev_' + i);
    const lidas = todas.map((id) => api.deviceConfig.doPainel(id));
    const esperar = () => new Promise((r) => setTimeout(r, 60));
    await esperar();
    assert.equal(pedidos.length, 2, 'mais de 2 pedidos pesados no ar de uma vez');
    assert.ok(pedidos.every((p) => p.ids.length <= 25), 'pedido com mais de 25 programações');
    pedidos[0].responder();
    await esperar();
    assert.equal(pedidos.length, 3, 'a fila não andou quando um pedido voltou');
    pedidos[1].responder(); pedidos[2].responder();
    await esperar();
    assert.deepEqual(pedidos.map((p) => p.ids.length), [25, 25, 10]);
    const r = await Promise.all(lidas);
    assert.deepEqual(r.map((c) => c.id), todas, 'cada miniatura recebe a sua');
  } finally { globalThis.fetch = fetchAntes; globalThis.window = windowAntes; }
});

/* ---------------- 2. Os limites de quem instala ---------------- */

test('TV nova por IP: 300 por hora (a instalação de uma conta grande), e a 301ª espera, dizendo quanto', async () => {
  const ip = '10.92.0.1';
  const tvs = await tvsNovas(300, ip);
  assert.equal(tvs.length, 300);
  const mais = await pedir('/api/devices', { method: 'POST', ip });
  assert.equal(mais.status, 429, 'um laço segue enchendo a tabela');
  assert.ok(Number(mais.headers['retry-after']) > 0, 'o 429 não diz quanto esperar');
  // Outro escritório não paga pelo primeiro.
  assert.equal((await pedir('/api/devices', { method: 'POST', ip: '10.92.0.2' })).status, 201);
  // A proteção que fica: a TV sem dono some na faxina de 7 dias (nos dois bancos).
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) assert.match(ler(f), /DELETE FROM devices WHERE tenant_id IS NULL AND COALESCE\(last_seen, created_at, 0\) < /, f);
});

test('o freio do painel cresce com a conta: max(600, 3 × TVs), com a contagem guardada', async () => {
  const limites = require('../server/limites.js');
  assert.equal(limites.tetoDe('painel', 0), 600);
  assert.equal(limites.tetoDe('painel', 150), 600, 'a conta pequena ganhou teto maior');
  assert.equal(limites.tetoDe('painel', 300), 900);
  assert.equal(limites.tetoDe('upload', 300), 120, 'o upload não cresce com as TVs');
  assert.equal(limites.tetoDe('tela', 300), 150, 'o medidor do player é por TV, e não muda');
  limites.zerar();
  for (let i = 0; i < 900; i++) assert.equal(limites.permitir('painel', 'ten_rh', undefined, 300).ok, true, 'freou a conta de 300 TVs em ' + i);
  const v = limites.permitir('painel', 'ten_rh', undefined, 300);
  assert.equal(v.ok, false, 'a conta grande em laço passou do teto');
  assert.ok(v.retryAfter > 0);
  // Sem o número de TVs, o teto mínimo de sempre.
  for (let i = 0; i < 600; i++) limites.permitir('painel', 'ten_x');
  assert.equal(limites.permitir('painel', 'ten_x').ok, false);
  limites.zerar();
  const s = ler('server.js');
  assert.match(s, /limites\.permitir\(classe, sess\.tenant_id, undefined, classe === 'painel' \? await telasDaConta\(sess\.tenant_id\) : undefined\)/);
  assert.match(s, /if \(c && Date\.now\(\) - c\.em < 5 \* 60 \* 1000\) return c\.n;/, 'a contagem de TVs não fica guardada');
  assert.match(s, /function esquecerSelo\(tenantId\) \{ seloCache\.delete\(tenantId\); telasCache\.delete\(tenantId\); \}/, 'parear e remover não recalculam o freio');

  // No servidor: a conta de 220 TVs passa dos 600 (teto 660), e para no 661º.
  const conta = await cadastro();
  naConta(tenantDe(conta.email), await tvsNovas(220, '10.93.0.1'), null, null);
  let n = 0;
  let r;
  do { r = await pedir('/api/auth/me', { cookie: conta.cookie }); if (r.status === 200) n++; } while (r.status === 200 && n < 700);
  assert.equal(r.status, 429, 'a conta não foi freada');
  assert.equal(n, 660, 'o freio da conta de 220 TVs não é 3 × TVs');
  assert.ok(Number(r.headers['retry-after']) > 0);
});

/* ---------------- 3. O aviso rápido, feito pelo servidor ---------------- */

let avisoPronto = null;
async function oAviso() {
  if (avisoPronto) return avisoPronto;
  const L = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/aviso.js')).href);
  const M = JSON.parse(ler('pecas-ouro', 'manifesto.json'));
  const modelos = new Map(M.pecas.map((p) => [p.id, { ...p, arq: PH.doArquivo(ler('pecas-ouro', p.id + '.html')) }]));
  const aviso = { titulo: 'Refeitório fecha às 14h', detalhe: 'Use o da unidade 2', ate: '', prioridade: 'alta' };
  avisoPronto = { aviso, item: L.pecaDoAviso(aviso, modelos, { nome: 'Metalúrgica Alfa', cores: ['#23395d', '#f4a261'] }) };
  return avisoPronto;
}
const hojeIso = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

test('o aviso para a conta toda: um pedido pequeno, o servidor põe em cada TV, e o Desfazer tira só o aviso', async () => {
  const { aviso, item } = await oAviso();
  const dono = await cadastro();
  const tenantId = tenantDe(dono.email);
  const tvs = await tvsNovas(25, '10.94.0.1');
  naConta(tenantId, tvs);
  const ids = tvs.map((t) => t.id);
  // Pelo caminho de antes, 25 TVs de RH eram ~2,5 MB num corpo só: recusado (413).
  assert.ok(25 * JSON.stringify(PROGRAMA).length > 2e6);

  const r = await pedir('/api/lote/aviso', { method: 'POST', cookie: dono.cookie, json: { telas: ids, item, aviso, hoje: hojeIso() } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(r.enviados < 20e3, 'o pedido do aviso tem ' + r.enviados + ' bytes');
  assert.match(r.json.lote, /^lot_/);
  assert.match(r.json.aviso, /^avs_/);
  assert.equal(r.json.telas.length, 25);
  for (const id of ids) {
    const it = primeiroDaPrincipal(id);
    assert.equal(it._aviso, r.json.aviso, 'a TV ficou sem o aviso na frente da principal');
    assert.deepEqual(it.meta, { tipo: 'aviso', prioridade: 'alta' });
    assert.equal(it.campos.titulo, 'Refeitório fecha às 14h');
    // O resto da programação ficou: as 8 peças da principal, a lateral, o cabeçalho e o rodapé.
    const c = configDe(id).cfg;
    assert.equal(c.zonas.principal.items.length, 9);
    assert.equal(c.zonas.lateral.items.length, 3);
    assert.ok(c.zonas.cabecalho.peca && c.zonas.rodape.messages.length === 4);
  }
  // A TV lê a programação nova com o aviso (o player confere a peça de novo).
  const naTv = await pedir('/api/devices/' + ids[0] + '/config', { headers: { 'x-device-token': tvs[0].deviceToken } });
  assert.equal(naTv.json.zonas.principal.items[0]._aviso, r.json.aviso);
  // O Desfazer guarda o id do aviso, e não ~2,4 MB de "antes".
  const guardado = banco.prepare('SELECT telas FROM lotes WHERE id = ?').get(r.json.lote).telas;
  assert.ok(guardado.length < 10e3, 'o Desfazer guardou ' + guardado.length + ' bytes');
  assert.ok(JSON.parse(guardado).every((t) => t.tirarAviso === r.json.aviso && !('antes' in t)));
  assert.equal((await pedir('/api/lote', { cookie: dono.cookie })).json.lotes[0].descricao, 'Aviso: Refeitório fecha às 14h');

  // Alguém mexe numa TV depois do aviso: o Desfazer tira o aviso e deixa o que a pessoa fez.
  const mexida = configDe(ids[3]).cfg;
  mexida.zonas.lateral.items.push({ type: 'text', titulo: 'Posto depois', duracao: 10 });
  banco.prepare('UPDATE devices SET config = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(mexida), Date.now() + 5, ids[3]);
  const d = await pedir('/api/lote/' + r.json.lote + '/desfazer', { method: 'POST', cookie: dono.cookie });
  assert.equal(d.status, 200);
  assert.equal(d.json.voltaram.length, 25);
  assert.deepEqual(d.json.mudaram, []);
  for (const id of ids) {
    const c = configDe(id).cfg;
    assert.ok(!c.zonas.principal.items.some((it) => it && it._aviso), 'o aviso ficou na TV depois do Desfazer');
    assert.equal(c.zonas.principal.items.length, 8);
  }
  assert.equal(configDe(ids[3]).cfg.zonas.lateral.items.pop().titulo, 'Posto depois', 'o Desfazer apagou o que foi feito depois');
  assert.equal((await pedir('/api/lote/' + r.json.lote + '/desfazer', { method: 'POST', cookie: dono.cookie })).json.code, 'ja-desfeito');

  // A TV sem programação recebe a da TV nova (a do painel) com o aviso; o Desfazer a deixa sem nada de novo.
  const vazia = (await tvsNovas(1, '10.94.0.2'))[0];
  naConta(tenantId, [vazia], null, null);
  const urgente = await pedir('/api/lote/aviso', { method: 'POST', cookie: dono.cookie, json: { telas: [vazia.id], item, aviso: { ...aviso, prioridade: 'urgente', ate: '' }, hoje: hojeIso() } });
  assert.equal(urgente.status, 200, JSON.stringify(urgente.json));
  const nova = configDe(vazia.id).cfg;
  assert.equal(nova.settings.layoutId, 'dashboard');
  assert.equal(nova.zonas.principal.items[0].meta.prioridade, 'urgente');
  assert.ok(nova.zonas.principal.items[0].meta.expiraEm > Date.now() + 60 * 60 * 1000, 'o urgente sem data não tem fim');
  assert.equal((await pedir('/api/lote/' + urgente.json.lote + '/desfazer', { method: 'POST', cookie: dono.cookie })).status, 200);
  assert.equal(configDe(vazia.id).cfg, null, 'a TV vazia não voltou a ficar vazia');

  // Com data: começa no dia de quem mandou, e não no do relógio do servidor (UTC).
  const ontem = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const comData = await pedir('/api/lote/aviso', { method: 'POST', cookie: dono.cookie, json: { telas: [ids[0]], item, aviso: { ...aviso, ate: '2099-01-31' }, hoje: ontem } });
  assert.equal(comData.status, 200);
  assert.deepEqual(primeiroDaPrincipal(ids[0]).agendamento, { ativo: true, dias: [], dataInicio: ontem, dataFim: '2099-01-31' });
  // Um "hoje" de mentira (longe do relógio) não vale: fica o dia de São Paulo.
  await pedir('/api/lote/aviso', { method: 'POST', cookie: dono.cookie, json: { telas: [ids[1]], item, aviso: { ...aviso, ate: '2099-01-31' }, hoje: '2001-01-01' } });
  const sp = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
  assert.equal(primeiroDaPrincipal(ids[1]).agendamento.dataInicio, sp);
});

test('o aviso recusa inteiro o que o lote recusa: TV repetida, de outra conta, aviso sem peça e envio grande demais', async () => {
  const { aviso, item } = await oAviso();
  const dono = await cadastro();
  const tvs = await tvsNovas(3, '10.95.0.1');
  naConta(tenantDe(dono.email), tvs);
  const ids = tvs.map((t) => t.id);
  const antes = ids.map((id) => configDe(id).versao);
  const envio = (json) => pedir('/api/lote/aviso', { method: 'POST', cookie: dono.cookie, json });
  assert.equal((await pedir('/api/lote/aviso', { method: 'POST', json: { telas: ids, item, aviso } })).status, 401);
  assert.match((await envio({ telas: [], item, aviso })).json.error, /pelo menos uma TV/);
  assert.equal((await envio({ telas: [ids[0], ids[0]], item, aviso })).json.code, 'tv-repetida');
  assert.equal((await envio({ telas: ids, aviso })).json.code, 'aviso-invalido');
  assert.equal((await envio({ telas: ids, item: { ...item, html: 'x'.repeat(120e3) }, aviso })).json.code, 'aviso-invalido');
  const grande = await envio({ telas: Array.from({ length: 1001 }, (_, i) => 'dev_' + i), item, aviso });
  assert.equal(grande.status, 400);
  assert.equal(grande.json.code, 'lote-grande');
  assert.equal(grande.json.max, 1000);
  // A TV de outra conta, no meio: nada vai, nem para as nossas.
  const outra = await cadastro();
  const deFora = (await tvsNovas(1, '10.95.0.2'))[0];
  naConta(tenantDe(outra.email), [deFora]);
  const misturado = await envio({ telas: [ids[0], deFora.id], item, aviso });
  assert.equal(misturado.status, 400);
  assert.match(misturado.json.error, /não encontrada nesta conta/);
  // A peça passa pela porta: HTML com script não vai para TV nenhuma.
  const ruim = await envio({ telas: ids, item: { ...item, html: item.html + '<script>alert(1)</script>' }, aviso });
  assert.equal(ruim.status, 400);
  assert.match(ruim.json.error, /peça em HTML recusada|Nada foi enviado/);
  assert.deepEqual(ids.map((id) => configDe(id).versao), antes, 'uma TV mudou com o envio recusado');
  assert.ok(!primeiroDaPrincipal(deFora.id)._aviso, 'a TV de outra conta recebeu o aviso');
});

test('o aviso respeita a loja de cada membro e, com a aprovação ligada, vira pedido que o dono aprova', async () => {
  const { aviso, item } = await oAviso();
  const dono = await cadastro();
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono.cookie, json: { plan: 'pro' } })).status, 200);
  const emailDoMembro = emailNovo();
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono.cookie, json: { email: emailDoMembro, role: 'member' } });
  assert.equal(convite.status, 201);
  const membro = await cadastro({ inviteCode: convite.json.code, name: 'Gerente Sul' }, emailDoMembro);
  const me = (await pedir('/api/auth/me', { cookie: membro.cookie })).json;
  assert.equal(me.user.role, 'member');
  const tenantId = me.tenant.id;
  const tvs = await tvsNovas(6, '10.96.0.1');
  naConta(tenantId, tvs, (i) => (i < 4 ? 'Loja Sul' : 'Loja Norte'));
  const sul = tvs.slice(0, 4).map((t) => t.id);
  const norte = tvs.slice(4).map((t) => t.id);
  assert.equal((await pedir('/api/lojas/' + me.user.id, { method: 'PUT', cookie: dono.cookie, json: { grupos: ['Loja Sul'] } })).status, 200);
  const versoes = () => sul.concat(norte).map((id) => configDe(id).versao);
  const antes = versoes();

  // Lista misturada: recusada inteira, sem dizer o nome da TV que ele não alcança.
  const misturado = await pedir('/api/lote/aviso', { method: 'POST', cookie: membro.cookie, json: { telas: sul.concat(norte[0]), item, aviso } });
  assert.equal(misturado.status, 403);
  assert.equal(misturado.json.code, 'loja');
  assert.doesNotMatch(misturado.json.error, /TV 5|TV 6/);
  assert.deepEqual(versoes(), antes, 'uma TV mudou com o envio recusado');
  // Só as dele: vai.
  const dele = await pedir('/api/lote/aviso', { method: 'POST', cookie: membro.cookie, json: { telas: sul, item, aviso } });
  assert.equal(dele.status, 200, JSON.stringify(dele.json));
  for (const id of sul) assert.equal(primeiroDaPrincipal(id)._aviso, dele.json.aviso);
  for (const id of norte) assert.ok(!primeiroDaPrincipal(id)._aviso);
  assert.equal((await pedir('/api/lote/' + dele.json.lote + '/desfazer', { method: 'POST', cookie: membro.cookie })).status, 200);

  // A aprovação ligada: o aviso do membro vira pedido (202), e nada muda nas TVs até o dono aprovar.
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono.cookie, json: { ligada: true } })).status, 200);
  const antesDoPedido = versoes();
  const pedido = await pedir('/api/lote/aviso', { method: 'POST', cookie: membro.cookie, json: { telas: sul, item, aviso } });
  assert.equal(pedido.status, 202, JSON.stringify(pedido.json));
  assert.equal(pedido.json.pendente, true);
  assert.deepEqual(pedido.json.aprovacao.telas.map((t) => t.id).sort(), sul.slice().sort());
  assert.match(pedido.json.aprovacao.descricao, /Aviso: Refeitório fecha às 14h/);
  assert.deepEqual(versoes(), antesDoPedido, 'o aviso do membro foi para a TV sem aprovação');
  // O membro com aprovação: até 200 TVs, o que o revisor vê TV por TV.
  const muitas = await pedir('/api/lote/aviso', { method: 'POST', cookie: membro.cookie, json: { telas: Array.from({ length: 201 }, (_, i) => 'dev_' + i), item, aviso } });
  assert.equal(muitas.json.code, 'lote-grande');
  assert.equal(muitas.json.max, 200);
  // O membro não aprova; o dono aprova e o aviso vai ao ar, pelo mesmo caminho do lote.
  assert.equal((await pedir('/api/aprovacoes/' + pedido.json.aprovacao.id + '/aprovar', { method: 'POST', cookie: membro.cookie })).status, 403);
  const ok = await pedir('/api/aprovacoes/' + pedido.json.aprovacao.id + '/aprovar', { method: 'POST', cookie: dono.cookie });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  for (const id of sul) assert.ok(primeiroDaPrincipal(id)._aviso, 'aprovado e o aviso não foi para a TV');
  for (const id of norte) assert.ok(!primeiroDaPrincipal(id)._aviso);
  // Com a aprovação ligada, desfazer é do dono.
  assert.equal((await pedir('/api/lote/' + ok.json.lote + '/desfazer', { method: 'POST', cookie: membro.cookie })).json.code, 'aprovacao');
});

/*
 * As versões e o conflito, sem servidor: a rota com um banco de mentira em
 * que alguém grava numa TV no instante do envio (a gravação com versão volta
 * null). O envio desfaz o que já gravou, lê de novo e põe outra vez.
 */
function rotaComBanco(telas, opcoes) {
  const o = opcoes || {};
  const gravacoes = [];
  const lotes = [];
  let corrida = o.corridas || 0;
  const db = {
    rid: (n) => 'x'.repeat(n),
    getDevice: async (id) => { const t = telas.get(id); return t ? { ...t } : null; },
    getTenant: async () => ({ id: 'ten_rh', name: 'Metalúrgica Alfa' }),
    getBrandKit: async () => null,
    setDeviceConfig: async (id, config, name, versao) => {
      const t = telas.get(id);
      // Na corrida, outra pessoa grava nesta TV agora: a versão muda e a gravação com a de antes não vale.
      if (versao != null && id === o.tvDaCorrida && corrida > 0) {
        corrida--;
        const c = JSON.parse(t.config);
        c.zonas.principal.items.push({ type: 'text', titulo: 'Mexida no meio' });
        t.config = JSON.stringify(c); t.updated_at += 1;
        return null;
      }
      if (versao != null && Number(t.updated_at) !== Number(versao)) return null;
      t.config = config; t.updated_at += 10;
      gravacoes.push(id);
      return t.updated_at;
    },
    salvarLote: async (tenantId, l) => { lotes.push(l); return 'lot_teste'; },
    registrarEvento: async () => {},
  };
  const respostas = [];
  const ctx = {
    db, storage: { publicUrl: () => 'https://midia.exemplo/x' }, schema: require('../js/storage.js'), vigia: require('../server/vigia.js'),
    sendJson: (res, status, corpo) => { respostas.push({ status, corpo }); },
    readBody: (req, res, cb) => cb(req.corpo), broadcast: () => {}, subscribers: {}, rateLimit: () => ({ ok: true }),
    security: {}, limites: { permitir: () => ({ ok: true }) }, plans: require('../server/plans.js'),
  };
  const rota = require('../server/routes/telas.js')(ctx);
  const sess = { tenant_id: 'ten_rh', user_id: 'usr_1', role: 'owner', lojas: null, precisaAprovar: false };
  const enviar = async (corpo) => {
    await rota({ method: 'POST', headers: {}, corpo }, {}, ['api', 'lote', 'aviso'], {}, sess);
    for (let i = 0; i < 200 && !respostas.length; i++) await new Promise((r) => setImmediate(r));
    return respostas.shift();
  };
  return { enviar, gravacoes, lotes };
}
function telasDeMentira(n, layoutId) {
  const m = new Map();
  for (let i = 0; i < n; i++) m.set('dev_' + i, { id: 'dev_' + i, tenant_id: 'ten_rh', name: 'TV ' + (i + 1), grupo: null, expediente: null, updated_at: 1000 + i, config: JSON.stringify({ settings: { layoutId: layoutId || 'full', nome: 'TV' }, zonas: { principal: { items: [{ type: 'text', titulo: 'Antes ' + i }] } } }) });
  return m;
}

test('o aviso no meio de uma gravação: desfaz o que já foi, lê de novo e põe por cima do que a outra pessoa fez', async () => {
  const { aviso, item } = await oAviso();
  const telas = telasDeMentira(23);
  const { enviar, gravacoes, lotes } = rotaComBanco(telas, { tvDaCorrida: 'dev_17', corridas: 1 });
  const r = await enviar({ telas: [...telas.keys()], item, aviso, hoje: hojeIso() });
  assert.equal(r.status, 200, JSON.stringify(r.corpo));
  assert.equal(lotes.length, 1, 'o envio com corrida virou dois lotes');
  for (const t of telas.values()) {
    const c = JSON.parse(t.config);
    assert.equal(c.zonas.principal.items[0]._aviso, r.corpo.aviso);
    assert.equal(c.zonas.principal.items.filter((it) => it._aviso).length, 1, 'o aviso entrou duas vezes na ' + t.name);
  }
  assert.equal(JSON.parse(telas.get('dev_17').config).zonas.principal.items.pop().titulo, 'Mexida no meio', 'o envio apagou o que a outra pessoa gravou no meio');
  // As 17 primeiras foram gravadas, voltaram ao que eram e foram gravadas de novo.
  assert.equal(gravacoes.filter((id) => id === 'dev_0').length, 3);

  // Quem grava toda hora na mesma TV: três tentativas, e nada vai.
  const outras = telasDeMentira(5);
  const teimosa = rotaComBanco(outras, { tvDaCorrida: 'dev_4', corridas: 99 });
  const n = await teimosa.enviar({ telas: [...outras.keys()], item, aviso });
  assert.equal(n.status, 409);
  assert.equal(n.corpo.code, 'config-mudou');
  assert.equal(teimosa.lotes.length, 0);
  for (const t of outras.values()) assert.ok(!JSON.parse(t.config).zonas.principal.items.some((it) => it._aviso), 'o envio recusado deixou o aviso numa TV');
});

test('a TV sem lugar para o aviso barra o envio inteiro, dizendo qual', async () => {
  const { aviso, item } = await oAviso();
  const telas = telasDeMentira(3);
  const real = globalThis.MT_getLayout;
  globalThis.MT_getLayout = (id) => (id === 'so-faixas'
    ? { zones: [{ id: 'topo', type: 'header', area: 'topo' }, { id: 'pe', type: 'ticker', area: 'pe' }], grid: { columns: '1fr', rows: '1fr 10vh', areas: ['topo', 'pe'] } }
    : real(id));
  try {
    const t = telas.get('dev_1');
    t.config = JSON.stringify({ settings: { layoutId: 'so-faixas' }, zonas: {} });
    const { enviar, gravacoes, lotes } = rotaComBanco(telas);
    const r = await enviar({ telas: [...telas.keys()], item, aviso });
    assert.equal(r.status, 400);
    assert.equal(r.corpo.code, 'sem-lugar');
    assert.equal(r.corpo.error, 'TV 2: esta TV não tem onde mostrar o aviso. Nada foi enviado.');
    assert.deepEqual(gravacoes, []);
    assert.equal(lotes.length, 0);
  } finally { globalThis.MT_getLayout = real; }
});

test('js/aviso.js: a mesma regra no painel e no servidor, e a TV nova é a do painel', async () => {
  const A = require('../js/aviso.js');
  const L = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/aviso.js')).href);
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };
  let C = null;
  try { C = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/contentTypes.js')).href); } catch (e) { C = null; }
  if (C) assert.deepEqual(A.configDaTvNova('Recepção'), C.defaultConfig('Recepção'), 'a TV nova do servidor não é a do painel');
  else assert.match(ler('web/src/lib/contentTypes.js'), /layoutId: 'dashboard',\s*theme: \{ preset: 'dark-premium', font: 'system', overrides: \{\} \},/);
  assert.equal(L.URGENTE_DURA_MS, A.URGENTE_DURA_MS);
  const cfg = { settings: { layoutId: 'corporate' }, zonas: { principal: { items: [{ type: 'text', titulo: 'a' }] }, lateral: { items: [{ _aviso: 'avs_1', type: 'text' }] } } };
  const item = { type: 'text', titulo: 'Aviso' };
  const doPainel = L.aplicarAviso(cfg, item, { prioridade: 'alta', ate: '2099-01-02' }, 'avs_1');
  const doServidor = A.porAviso(JSON.parse(JSON.stringify(cfg)), item, { prioridade: 'alta', ate: '2099-01-02' }, 'avs_1', { hoje: L.hojeDoAviso() });
  assert.deepEqual(doServidor, doPainel);
  assert.equal(cfg.zonas.principal.items.length, 1, 'o painel mexeu na programação recebida');
  // Tirar: só o aviso, de todas as zonas.
  const tirado = JSON.parse(JSON.stringify(doServidor));
  assert.equal(A.tirarAviso(tirado, 'avs_1'), 2);
  assert.deepEqual(tirado.zonas.principal.items, [{ type: 'text', titulo: 'a' }]);
  assert.deepEqual(tirado.zonas.lateral.items, []);
  assert.equal(A.tirarAviso(tirado, 'avs_1'), 0);
});

test('a porta das peças lembra o HTML já conferido só no servidor, e o resultado é o mesmo', () => {
  const P = require('../js/peca-html.js');
  const cfg = () => JSON.parse(JSON.stringify(PROGRAMA));
  // Neste processo a rota de mentira (lá em cima) ligou a memória: a conta de referência é sem ela.
  P.lembrarConferidas(0);
  const sem = cfg();
  const r1 = P.conferirConfig(sem, { hostsMidia: [] });
  P.lembrarConferidas(50);
  try {
    const com1 = cfg(); const com2 = cfg();
    assert.deepEqual(P.conferirConfig(com1, { hostsMidia: [] }), r1);
    assert.deepEqual(P.conferirConfig(com2, { hostsMidia: [] }), r1);
    assert.deepEqual(com2, sem, 'a peça lembrada saiu diferente da conferida');
    // Uma peça com problema continua recusada da segunda vez em diante.
    const ruim = { type: 'peca-html', html: '<section class="mt-peca"><script>x()</script></section>', css: '' };
    const a = P.validarItem(ruim, {});
    const b = P.validarItem(ruim, {});
    assert.equal(a.ok, false);
    assert.deepEqual(b.problemas, a.problemas);
    b.problemas.push('mexido');
    assert.deepEqual(P.validarItem(ruim, {}).problemas, a.problemas, 'quem recebe estraga a lembrada');
  } finally { P.lembrarConferidas(0); }
  // Ligada pelo servidor; a TV e o painel conferem sempre.
  assert.match(ler('server/routes/telas.js'), /pecaHtml\.lembrarConferidas\(300\);/);
  assert.doesNotMatch(ler('js/player.js') + ler('js/render.js') + ler('js/peca-render.js'), /lembrarConferidas/);
});

/* ---------------- 4. A 2ª TV do plano grátis diz por quê ---------------- */

test('a 2ª TV no plano grátis: a TV diz que o grátis tem 1 TV e onde se resolve (e o código fica)', async () => {
  const conta = await cadastro();
  const ip = '10.97.0.1';
  const primeira = (await pedir('/api/devices', { method: 'POST', ip })).json;
  assert.equal((await pedir('/api/pair', { method: 'POST', cookie: conta.cookie, ip, json: { code: primeira.code, nova: true } })).status, 200);
  const segunda = (await pedir('/api/devices', { method: 'POST', ip })).json;
  // A TV com o código na tela, com o tempo real aberto; parear pelo painel enquanto ela escuta.
  const evento = await new Promise((resolve, reject) => {
    let respondeu = null;
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: '/api/devices/' + segunda.id + '/events', headers: { 'x-device-token': segunda.deviceToken } }, (res) => {
      let txt = '';
      res.on('data', (c) => {
        txt += c;
        if (/event: ready/.test(txt) && !respondeu) {
          respondeu = pedir('/api/pair', { method: 'POST', cookie: conta.cookie, ip, json: { code: segunda.code, nova: true } });
          respondeu.catch(reject);
        }
        const m = /event: recusada\ndata: (.*)\n/.exec(txt);
        if (m) { req.destroy(); respondeu.then((painel) => resolve({ painel, tv: JSON.parse(m[1]) })); }
      });
    });
    req.on('error', (e) => { if (!/socket hang up|aborted/.test(e.message)) reject(e); });
    setTimeout(() => { req.destroy(); reject(new Error('a TV não recebeu o motivo')); }, 8000);
    req.end();
  });
  assert.equal(evento.painel.status, 402);
  assert.equal(evento.painel.json.code, 'plan_limit');
  assert.equal(evento.tv.titulo, 'O plano grátis tem 1 TV');
  assert.match(evento.tv.texto, /^Esta conta já está usando a TV do plano grátis\. Para ligar mais TVs, o dono da conta escolhe um plano no painel do MultiTelas \(app\.multitelas\.net\.br\), em Plano\. Depois, é só digitar este código de novo\./);
  // A TV segue sem dono, com o mesmo código (é ele que vale depois do plano).
  const r = banco.prepare('SELECT tenant_id, code FROM devices WHERE id = ?').get(segunda.id);
  assert.equal(r.tenant_id, null);
  assert.equal(r.code, segunda.code);
});

test('o motivo na TV para cada recusa do pareamento, em português de gente', () => {
  const plans = require('../server/plans.js');
  assert.equal(plans.recusaNaTv({ ok: true }, {}), null);
  const gratis = plans.recusaNaTv({ ok: false, motivo: 'limite', limite: 1 }, { plan: 'free' }, { reconectar: true });
  assert.equal(gratis.titulo, 'O plano grátis tem 1 TV');
  assert.match(gratis.texto, /Se esta TV já era da conta e voltou com um código, use Reconectar no painel/);
  const pago = plans.recusaNaTv({ ok: false, motivo: 'limite', limite: 5 }, { plan: 'pro' });
  assert.equal(pago.titulo, 'O plano desta conta tem 5 TVs');
  assert.match(pago.texto, /^Todas já estão em uso\. Para ligar esta, o dono da conta aumenta o plano no painel do MultiTelas \(app\.multitelas\.net\.br\), em Plano, ou remove uma TV que não usa mais\./);
  assert.equal(plans.recusaNaTv({ ok: false, motivo: 'teste_vencido', dias: 14 }, { plan: 'free' }).titulo, 'O teste grátis desta conta terminou');
  assert.match(plans.recusaNaTv({ ok: false, motivo: 'atraso', dias: 20 }, { plan: 'pro' }).texto, /fatura em atraso\. As TVs que já estão na conta continuam no ar/);
  // Sem recado técnico na tela da TV.
  for (const r of [gratis, pago]) assert.doesNotMatch(r.titulo + r.texto, /402|plan_limit|limite do plano atingido|upgrade/i);
});

test('o player mostra o motivo na tela do código, e a TV recebe o player novo', () => {
  const cloud = ler('js/cloud.js');
  assert.match(cloud, /es\.addEventListener\('recusada', \(ev\) => \{[\s\S]{0,200}document\.dispatchEvent\(new CustomEvent\('mt:pareamento-recusado', \{ detail: dados \}\)\);/);
  const player = ler('js/player.js');
  assert.match(player, /document\.addEventListener\('mt:pareamento-recusado', function \(e\) \{ showRecusada\(e && e\.detail\); \}\);/);
  const f = player.slice(player.indexOf('function showRecusada('), player.indexOf('function showSemConexao('));
  assert.match(f, /el\.classList\.contains\('hidden'\)/, 'o motivo apareceria sobre o conteúdo');
  assert.match(f, /titulo\.textContent = String\(dados\.titulo\)/);
  assert.match(f, /dica\.textContent = String\(dados\.texto\)/, 'o texto do servidor entraria como HTML');
  assert.doesNotMatch(f, /mt-pairing-code|qr\.hidden = true/, 'o código e o QR precisam ficar na tela');
  // ES2017 na TV.
  assert.ok(!/\?\.|\?\?/.test(f));
  assert.match(ler('sw.js'), /const SHELL_CACHE = 'mt-shell-v(9[2-9]|\d{3})';/);
});
