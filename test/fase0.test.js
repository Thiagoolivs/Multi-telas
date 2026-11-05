/*
 * Fase 0 do plano de ação (docs/qa-total/PLANO-DE-ACAO.md): nada quebra,
 * nada mente. Cada teste é um achado do QA total de 05/11.
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
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('a programação estragada não derruba nada: lista, items em texto, item nulo, aviso numérico', () => {
  const S = require('../js/storage.js');
  // A programação inteira como lista (ou texto): vira tela vazia, nunca a empresa de exemplo.
  for (const lixo of [[], 'lixo', null, 42]) {
    const c = S.normalize(lixo);
    assert.equal(c.settings.nome, '', 'a TV mostrou a demonstração de outra empresa');
    assert.ok(Object.values(c.zonas).every((z) => !z.items || z.items.length === 0));
  }
  const c = S.normalize({
    settings: { layoutId: 'dashboard' },
    zonas: { principal: { items: [null, 'texto', { titulo: 'sem tipo' }, { type: 'text', titulo: 'ok' }] }, lateral: { items: 'texto' }, rodape: { messages: [1, 'Aberto até 18h', null, { x: 1 }, '  '] } },
  });
  assert.deepEqual(c.zonas.principal.items.map((i) => i.titulo), ['ok']);
  assert.deepEqual(c.zonas.lateral.items, []);
  assert.deepEqual(c.zonas.rodape.messages, ['1', 'Aberto até 18h'], 'o número no letreiro travava a TV em "Iniciando exibição"');
  // As configurações como texto também não quebram.
  assert.equal(S.normalize({ settings: 'x', zonas: [] }).settings.layoutId, 'dashboard');
});

test('a TV: tipo desconhecido não vai ao ar; agenda no fuso da loja; urgente com fim e som só na entrada', () => {
  const render = ler('js/render.js');
  assert.match(render, /if \(!fn\) throw new Error\('tipo de conteúdo desconhecido: '/);
  assert.doesNotMatch(render, /'Tipo de conteúdo desconhecido: '/, 'o texto interno saía na TV do cliente');
  const player = ler('js/player.js');
  assert.match(player, /const conhecidos = items\.filter\(\(it\) => it && \(!MTRender\.conhece \|\| MTRender\.conhece\(it\.type\)\)/);
  assert.match(player, /agoraMs > Number\(it\.meta\.expiraEm\)/, 'o urgente vencido continuava no ar');
  assert.match(player, /function agoraNaLoja\(\)/);
  assert.match(player, /const loja = agoraNaLoja\(\);/, 'o agendamento seguia o relógio da TV (UTC no box)');
  assert.match(player, /Date\.now\(\) - ultimo > 10 \* 60 \* 1000/, 'o sino tocava a cada volta');
});

test('o urgente sem data sai em 2 horas; com data, vale a data', async () => {
  const A = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/aviso.js')).href);
  const cfg = { settings: { layoutId: 'full' }, zonas: { principal: { items: [] } } };
  const antes = Date.now();
  const u = A.aplicarAviso(cfg, { type: 'text', titulo: 'Acabou o pão de queijo' }, { titulo: 'Acabou', prioridade: 'urgente' }, 'avs_1');
  const it = u.zonas.principal.items[0];
  assert.equal(it.meta.prioridade, 'urgente');
  assert.ok(it.meta.expiraEm >= antes + A.URGENTE_DURA_MS && it.meta.expiraEm <= Date.now() + A.URGENTE_DURA_MS);
  const comData = A.aplicarAviso(cfg, { type: 'text' }, { titulo: 'x', prioridade: 'urgente', ate: '2099-01-01' }, 'avs_2').zonas.principal.items[0];
  assert.equal(comData.meta.expiraEm, undefined);
  const alta = A.aplicarAviso(cfg, { type: 'text' }, { titulo: 'x', prioridade: 'alta' }, 'avs_3').zonas.principal.items[0];
  assert.equal(alta.meta.expiraEm, undefined);
});

test('o aviso rápido: "urgente" e "por cima de tudo" valem, e o cartaz não fica com sobra ("Aviso para :")', () => {
  const A = require('../server/aviso-rapido.js');
  const hoje = new Date();
  const a = A.semIA('aviso para todas as tvs: o refeitório fecha às 14h', hoje, []);
  assert.equal(a.titulo, 'O refeitório fecha às 14h');
  const b = A.semIA('acabou o pão de queijo, coloca por cima de tudo', hoje, []);
  assert.equal(b.titulo, 'Acabou o pão de queijo');
  assert.equal(b.detalhe, '');
  assert.equal(b.prioridade, 'urgente');
  assert.equal(A.semIA('URGENTE: acabou o pão de queijo', hoje, []).titulo, 'Acabou o pão de queijo');
  // A IA dizendo "alta" não vence as palavras do cliente.
  assert.equal(A.normalizar({ titulo: 'Acabou o pão de queijo', prioridade: 'alta' }, 'acabou o pão de queijo, urgente', hoje, []).prioridade, 'urgente');
});

test('a régua legal: "o mais barato da cidade" vira aviso; o resto passa', () => {
  const RC = require('../js/regras-de-conteudo.js');
  const avisos = (t) => RC.conferir(t, { perfil: 'comercio' }).avisos.filter((a) => a.regra === 'superlativo');
  assert.equal(avisos('O mercado mais barato da cidade.').length, 1);
  assert.equal(avisos('Menor preço da região!').length, 1);
  assert.equal(avisos('O melhor café do bairro').length, 1);
  assert.equal(avisos('Pão de queijo quentinho').length, 0);
  assert.equal(avisos('Mais barato que ontem').length, 0);
});

test('a IA recebe o nome da empresa e a frente da conta na Criação rápida e em Meus Designs', () => {
  const s = ler('server.js');
  assert.match(s, /const empresaDoPedido = String\(\(b && b\.empresa\) \|\| ''\)\.trim\(\) \|\| \(contaDoPedido && contaDoPedido\.name\) \|\| nomeDaMarca \|\| '';/);
  assert.match(s, /empresa: empresaDoPedido, segmento: \(b && b\.segmento\) \|\| '', perfil: perfilDoPedido,/);
  assert.match(ler('server/ai-director.js'), /perfil: ctx\.perfil \|\| '', marca: marcaDaPeca, modo,/);
});

test('o e-mail do fim do teste não promete "TV no ar" a quem nunca ligou uma', () => {
  const L = require('../server/lembretes.js');
  const sem = L.mensagem('fim', { telas: 0, frente: 'comercio', created_at: Date.now() - 20 * 864e5 }, 'https://app.multitelas.net.br', Date.now());
  assert.doesNotMatch(sem.subject + sem.text, /continua no ar/);
  assert.match(sem.subject, /antes de a TV ser ligada/);
  const com = L.mensagem('fim', { telas: 2, frente: 'comercio', created_at: Date.now() - 20 * 864e5 }, 'https://app.multitelas.net.br', Date.now());
  assert.match(com.subject, /a TV continua no ar/);
});

test('a campanha de formato antigo (sem cabeçalho e rodapé) não derruba a lista da conta', () => {
  const ajuste = require('../server/ajuste.js');
  const antiga = { telas: [{ zonas: { principal: [{ item: { type: 'peca-html' } }] } }, { zonas: null }, null] };
  assert.equal(ajuste.numerar(antiga).length, 1);
});

test('a tela pronta da ótica não oferece a oferta vencida ("até sábado, 25 de outubro")', () => {
  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  const t = m.telas.find((x) => x.id === 'otica-semana-do-sol');
  const pecas = Object.values(t.zonas).flatMap((z) => (z.pecas || []).map((p) => p.id));
  assert.ok(!pecas.includes('lateral-prazo'));
});

test('o painel recebe a programação limpa; a ilegível vira "TV sem programação" (204)', async (t) => {
  const porta = 7500 + Math.floor(Math.random() * 90);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-fase0-'));
  const env = { ...process.env, PORT: String(porta), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', ASAAS_API_KEY: '' };
  for (const k of ['RAILWAY_ENVIRONMENT', 'NODE_ENV']) delete env[k];
  const servidor = spawn(process.execPath, ['server.js'], { cwd: RAIZ, stdio: 'ignore', env });
  let banco = null;
  t.after(() => { try { if (banco) banco.close(); } catch (e) { /* já fechado */ } servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  const pedir = (caminho, o = {}) => new Promise((resolve, reject) => {
    const corpo = o.body ? JSON.stringify(o.body) : '';
    const headers = { ...(o.body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(corpo) } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) };
    const req = http.request({ host: '127.0.0.1', port: porta, path: caminho, method: o.method || 'GET', headers }, (res) => {
      let txt = ''; res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, txt, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject); if (corpo) req.write(corpo); req.end();
  });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const r = await pedir('/api/auth/signup', { method: 'POST', body: { email: 'f0' + Date.now() + '@t.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true, perfil: 'comercio' } });
  const cookie = r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
  const tv = (await pedir('/api/devices', { method: 'POST', body: {} })).json;
  await pedir('/api/devices/' + tv.id + '/heartbeat', { method: 'POST', body: {}, headers: { 'x-device-token': tv.deviceToken } });
  assert.equal((await pedir('/api/pair', { method: 'POST', cookie, body: { code: tv.code, name: 'Vitrine' } })).status, 200);
  const sql = () => { if (!banco) { banco = new DatabaseSync(path.join(dados, 'multitelas.db')); banco.exec('PRAGMA busy_timeout = 5000;'); } return banco; };
  // Uma programação de versão antiga, gravada direto no banco.
  sql().prepare('UPDATE devices SET config = ? WHERE id = ?').run(JSON.stringify({ settings: { layoutId: 'dashboard' }, zonas: { principal: { items: 'texto' }, lateral: { items: [null] }, rodape: { messages: [1, 2] } } }), tv.id);
  const g = await pedir('/api/devices/' + tv.id + '/config', { cookie });
  assert.equal(g.status, 200);
  assert.deepEqual(g.json.zonas.principal.items, []);
  assert.deepEqual(g.json.zonas.lateral.items, []);
  assert.deepEqual(g.json.zonas.rodape.messages, ['1', '2']);
  // A programação inteira como lista: o painel a vê como TV sem programação.
  sql().prepare('UPDATE devices SET config = ? WHERE id = ?').run('[]', tv.id);
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { cookie })).status, 204);
  sql().prepare('UPDATE devices SET config = ? WHERE id = ?').run('{quebrado', tv.id);
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { cookie })).status, 204);
});
