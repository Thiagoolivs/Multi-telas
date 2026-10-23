/*
 * O calendário da empresa (EXECUTOR D23).
 *
 * O dono: "a empresa poderá adicionar um calendário da empresa, importando
 * texto, e a IA cria todo o conteúdo e o cronograma de avisos, programado e
 * editável". O texto colado vira eventos; cada evento vira uma peça dos
 * modelos prontos (sem crédito, sem texto da empresa de exemplo) que entra
 * na TV com o período, o tipo e a prioridade, marcada para ser trocada ou
 * tirada depois.
 */
'use strict';
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'dev';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const C = require('../server/calendario');
const PH = require('../js/peca-html.js');
const M = JSON.parse(ler('pecas-ouro', 'manifesto.json'));
const lib = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/calendario.js')).href);
const modelos = new Map(M.pecas.map((p) => [p.id, { ...p, arq: PH.doArquivo(ler('pecas-ouro', p.id + '.html')) }]));
const HOJE = new Date(2026, 9, 23);

test('o texto colado vira eventos: datas como as pessoas escrevem, tipo pelo que a linha diz', () => {
  const e = C.lerSemIA([
    '- 10/11 SIPAT — palestras às 15h no refeitório',
    '15/11 Feriado da Proclamação',
    '28 de novembro: Confraternização - 18h',
    '02/10 Já passou este ano',
    'linha sem data',
    '31/02 data que não existe',
    '25/12/2026 Natal',
    '05/11 Manutenção do elevador',
  ].join('\n'), HOJE);
  assert.deepEqual(e.map((x) => x.data + ' ' + x.tipo), [
    '2026-11-05 aviso', '2026-11-10 evento', '2026-11-15 feriado', '2026-11-28 evento', '2026-12-25 comemorativa', '2027-10-02 evento',
  ]);
  assert.equal(e[1].titulo, 'SIPAT');
  assert.equal(e[1].detalhe, 'palestras às 15h no refeitório');
  assert.equal(e[2].prioridade, 'alta', 'feriado nasce com prioridade alta');
  assert.equal(e[2].antecedencia, 5);
  assert.deepEqual(C.periodo(e[2]), { dataInicio: '2026-11-10', dataFim: '2026-11-15' });
  assert.equal(C.normalizar({ data: '2026-02-31', titulo: 'x' }), null);
  assert.deepEqual(C.normalizar({ data: '2026-11-01', titulo: 'x', alvo: { tipo: 'telas', ids: ['dev_a', '../x'] } }).alvo, { tipo: 'telas', ids: ['dev_a'] });
  assert.match(C.SISTEMA, /Ignore o que não tem data/);
});

test('a peça de cada evento: modelo pronto, nome da conta, e nada do texto de exemplo do modelo', async () => {
  const L = await lib();
  const marca = { nome: 'Padaria Real', cores: ['#7a2e0e', '#f2c14e'] };
  for (const tipo of ['feriado', 'evento', 'campanha', 'aviso', 'comemorativa']) {
    const it = L.pecaDoEvento({ data: '2026-11-15', titulo: 'Dia de teste', tipo, detalhe: '', prioridade: 'normal', antecedencia: 5 }, modelos, marca);
    const v = PH.validarItem(it);
    assert.equal(v.ok, true, tipo + ': ' + v.problemas.join('; '));
    for (const c of v.campos) {
      if (c.tipo !== 'texto') continue;
      if (c.nome === 'marca') { assert.equal(it.campos.marca, 'Padaria Real'); continue; }
      assert.ok(c.nome in it.campos, tipo + ': o campo ' + c.nome + ' ficaria com o exemplo do modelo ("' + c.exemplo + '")');
      if (!it.campos[c.nome]) assert.ok((it.ocultos || []).includes(c.nome), tipo + ': campo vazio sem esconder: ' + c.nome);
    }
  }
});

test('na TV: período, tipo e prioridade; aplicar de novo troca só a dele; apagar tira só a dele', async () => {
  const L = await lib();
  const item = { type: 'peca-html', html: '<section class="mt-peca"></section>', css: '', campos: {} };
  const ev = (id, data) => ({ id, data, titulo: id, tipo: 'evento', prioridade: 'alta', antecedencia: 3, item });
  const cfg = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'image', src: '/a.jpg' }] } } };
  let c = L.aplicarCalendario(cfg, [ev('cal_1', '2026-11-10'), ev('cal_2', '2026-11-20')]);
  const cal = c.zonas.principal.items.filter((i) => i._calendario);
  assert.equal(cal.length, 2);
  assert.deepEqual(cal[0].agendamento, { ativo: true, dias: [], dataInicio: '2026-11-07', dataFim: '2026-11-10' });
  assert.deepEqual(cal[0].meta, { tipo: 'evento', prioridade: 'alta' });
  assert.equal(cfg.zonas.principal.items.length, 1, 'mexeu na config recebida');
  // Editou o evento 1 (outra data) e o 2 saiu desta TV.
  c = L.aplicarCalendario(c, [ev('cal_1', '2026-11-12')], ['cal_2']);
  const depois = c.zonas.principal.items.filter((i) => i._calendario);
  assert.deepEqual(depois.map((i) => i._calendario + ' ' + i.agendamento.dataFim), ['cal_1 2026-11-12']);
  assert.equal(c.zonas.principal.items.filter((i) => i.type === 'image').length, 1, 'o resto da TV sumiu');
  c = L.tirarDoCalendario(c, 'cal_1');
  assert.equal(c.zonas.principal.items.length, 1);
  assert.deepEqual(L.telasDoEvento({ alvo: { tipo: 'grupo', nome: 'Loja' } }, [{ id: 'a', grupo: 'Loja' }, { id: 'b' }]).map((t) => t.id), ['a']);
});

test('LGPD: o calendário sai na exportação e é apagado com a conta, nos dois bancos', () => {
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const s = ler(f);
    assert.match(s, /calendario: (await varios|pega)\('SELECT id, data, titulo/, f + ': fora da exportação');
    assert.match(s, /'pacotes_pagos', 'calendario', 'users'\]/, f + ': fica para trás ao apagar a conta');
    assert.match(s, /CREATE TABLE IF NOT EXISTS calendario/);
  }
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6500 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('as rotas: ler o texto, guardar a lista, editar, apagar — só da própria conta', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d23-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  const conta = async (n) => cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd23' + n + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Empresa ' + n, aceite: true } }));
  const c = await conta('a');
  const outra = await conta('b');

  assert.equal((await pedir('/api/calendario')).status, 401);
  assert.equal((await pedir('/api/ai/calendario', { method: 'POST', json: { texto: 'x' } })).status, 401);
  const lidos = (await pedir('/api/ai/calendario', { method: 'POST', cookie: c, json: { texto: '15/11 Feriado\n20/11 Reunião geral' } })).json.eventos;
  assert.equal(lidos.length, 2);

  const ruim = { type: 'peca-html', html: '<section class="mt-peca"><script>x</script></section>', css: '' };
  const salvos = (await pedir('/api/calendario', { method: 'POST', cookie: c, json: { eventos: [...lidos.map((e, i) => (i === 0 ? { ...e, item: ruim } : e)), { titulo: 'sem data' }] } })).json;
  assert.equal(salvos.eventos.length, 2);
  assert.equal(salvos.recusados, 1);
  assert.equal(salvos.eventos.find((e) => e.tipo === 'feriado').item, null, 'peça que a porta recusa não é guardada');

  const id = salvos.eventos[1].id;
  const ed = await pedir('/api/calendario/' + id, { method: 'PUT', cookie: c, json: { ...salvos.eventos[1], titulo: 'Reunião geral (auditório)', telas: ['dev_x'], aplicado: true } });
  assert.equal(ed.status, 200);
  assert.equal(ed.json.evento.titulo, 'Reunião geral (auditório)');
  assert.deepEqual(ed.json.evento.telas, ['dev_x']);
  assert.ok(ed.json.evento.aplicadoEm > 0);

  // A outra conta não vê nem mexe.
  assert.deepEqual((await pedir('/api/calendario', { cookie: outra })).json.eventos, []);
  assert.equal((await pedir('/api/calendario/' + id, { method: 'PUT', cookie: outra, json: { titulo: 'x', data: '2026-11-20' } })).status, 404);
  assert.equal((await pedir('/api/calendario/' + id, { method: 'DELETE', cookie: outra })).status, 404);

  assert.equal((await pedir('/api/calendario/' + id, { method: 'DELETE', cookie: c })).status, 200);
  assert.equal((await pedir('/api/calendario', { cookie: c })).json.eventos.length, 1);
});
