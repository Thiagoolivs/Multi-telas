/*
 * O teto de gasto da IA (EXECUTOR D0.4).
 *
 * O único teto do texto era a contagem de chamadas; o custo do texto era
 * gravado na ENTRADA da rota (5 centavos fixos, antes de qualquer chamada);
 * o trabalho em segundo plano anotava num caderno que ninguém lia; e o
 * débito de créditos lia, calculava e gravava o saldo inteiro, perdendo
 * pacote pago no meio do caminho. Em 23/10 o Gemini bateu o teto de gasto do
 * mês sem nenhum alarme antes.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-teto-ia-'));
const usoIA = require('../server/uso-ia.js');
const plans = require('../server/plans.js');
const motores = require('../server/motores.js');
const jobs = require('../server/jobs.js');

const RAIZ = path.join(__dirname, '..');
const DIA = 24 * 60 * 60 * 1000;

// Um banco de mentira com o que podeUsarTexto lê.
function dbFalso({ gastoConta = 0, gastoGlobal = 0, chamadasHoje = 0, telas = 1 } = {}) {
  return {
    contarUsoIA: async () => chamadasHoje,
    gastoIAGlobal: async () => gastoGlobal,
    countDevices: async () => telas,
    resumoUsoIA: async () => ({ creditos: 0, custoCentavos: gastoConta, chamadas: 0 }),
    getCreditos: async () => ({ franquiaRestante: 10, creditosComprados: 0, cicloEm: Date.now() - DIA }),
    setCreditos: async () => {},
  };
}
const PAGANTE = { id: 't_pago', plan: 'pro', plan_status: 'active', created_at: Date.now() - 60 * DIA };
const EM_TESTE = { id: 't_teste', plan: 'free', created_at: Date.now() - DIA };
const TESTE_VENCIDO = { id: 't_vencido', plan: 'free', created_at: Date.now() - 40 * DIA };

test('conta pagante dentro do teto: a IA segue', async () => {
  const r = await usoIA.podeUsarTexto(dbFalso({ gastoConta: 100 }), PAGANTE);
  assert.equal(r.ok, true);
  assert.equal(r.teto, plans.tetoIaCents(1) + usoIA.MARGEM_TEXTO_CENTS);
});

test('conta que passou do teto do ciclo: para, diz que as telas continuam e quando volta', async () => {
  const teto = usoIA.tetoDaConta(PAGANTE, 1);
  const r = await usoIA.podeUsarTexto(dbFalso({ gastoConta: teto }), PAGANTE);
  assert.equal(r.ok, false);
  assert.equal(r.status, 402);
  assert.equal(r.corpo.erro, 'teto_ia');
  assert.match(r.corpo.mensagem, /telas continuam no ar/);
  assert.match(r.corpo.mensagem, /volta em \d\d\/\d\d/);
});

test('o teto cresce com as telas e o teste tem um teto próprio, menor', () => {
  assert.ok(usoIA.tetoDaConta(PAGANTE, 10) > usoIA.tetoDaConta(PAGANTE, 1));
  assert.equal(usoIA.tetoDaConta(EM_TESTE, 1), usoIA.TETO_TESTE_CENTS);
  assert.ok(usoIA.TETO_TESTE_CENTS < usoIA.tetoDaConta(PAGANTE, 1));
});

test('teste vencido no plano grátis: a IA de texto também para (antes, só a foto parava)', async () => {
  const r = await usoIA.podeUsarTexto(dbFalso(), TESTE_VENCIDO);
  assert.equal(r.ok, false);
  assert.equal(r.status, 402);
  assert.equal(r.corpo.erro, 'teste_acabou');
  assert.equal((await usoIA.podeUsarTexto(dbFalso(), EM_TESTE)).ok, true, 'no teste, segue');
});

test('teto global do dia: todo mundo pausa, com frase de pausa e não de erro', async (t) => {
  const antes = process.env.MT_TETO_IA_DIA_CENTAVOS;
  process.env.MT_TETO_IA_DIA_CENTAVOS = '1000';
  t.after(() => { if (antes === undefined) delete process.env.MT_TETO_IA_DIA_CENTAVOS; else process.env.MT_TETO_IA_DIA_CENTAVOS = antes; });
  // O cache do gasto global é por banco: um banco novo lê de novo.
  const r = await usoIA.podeUsarTexto(dbFalso({ gastoGlobal: 5000 }), { ...PAGANTE, id: 't_global' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.match(r.corpo.error, /pausa/);
  assert.match(r.corpo.error, /telas continuam no ar/);
  assert.equal((await usoIA.podeUsarTexto(dbFalso({ gastoGlobal: 999 }), PAGANTE)).ok, true, 'abaixo do teto global, segue');
});

test('a regra global lê o banco de todas as contas, com cache, e alarma o operador', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'server/uso-ia.js'), 'utf8');
  assert.match(fonte, /db\.gastoIAGlobal\(/);
  assert.match(fonte, /alarme\('global'/);
  assert.match(fonte, /alarme\('conta:'/);
  assert.match(fonte, /MT_TETO_IA_DIA_CENTAVOS/);
});

test('o débito é subtração no banco: um pacote pago no meio do caminho não some', async () => {
  const db = require('../server/db-sqlite.js');
  const { tenantId: id } = await db.createAccount('debito' + Date.now() + '@teste.local', 'x', 'Loja do débito', 'Dono');
  await db.setCreditos(id, { franquiaRestante: 10, creditosComprados: 5, cicloEm: Date.now() });
  // Outro processo credita um pacote enquanto este debita.
  await db.creditarPacote('pay_teste_debito', id, 'p25', 25);
  await db.debitarCreditos(id, 2, 1);
  const c = await db.getCreditos(id);
  assert.equal(c.franquiaRestante, 8);
  assert.equal(c.creditosComprados, 29, 'os 25 do pacote ficaram');
});

test('o cobrar debita por subtração, nunca gravando o saldo calculado', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'server/uso-ia.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(fonte, /db\.debitarCreditos\(tenant\.id, daFranquia, doComprado\)/);
  const cobrar = fonte.slice(fonte.indexOf('async function cobrar'), fonte.indexOf('async function tetoTextoOk'));
  assert.ok(!/setCreditos/.test(cobrar), 'o cobrar voltou a gravar o saldo inteiro');
  for (const arq of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    assert.match(fs.readFileSync(path.join(RAIZ, arq), 'utf8'), /async function debitarCreditos/, arq);
  }
});

test('o trabalho em segundo plano mede o próprio gasto e entrega no fim', async (t) => {
  const recebidos = [];
  const antes = { aoMedir: jobs.aoMedir, chamar: motores.chamar };
  t.after(() => { jobs.aoMedir = antes.aoMedir; });
  jobs.aoMedir = (job, medido) => { recebidos.push({ job, medido }); };
  const j = jobs.criar('ten_medido', async () => {
    // Uma "chamada" medida, como a que o motor anota.
    const s = motores.medicaoAtual();
    assert.ok(s, 'o trabalho roda dentro de um caderno próprio');
    s.chamadas.push({ motor: 'gemini', modelo: 'gemini-3.8-flash', entrada: 1000, saida: 500, cacheLida: 0, cacheEscrita: 0, custoCentavos: 3.2 });
    return { ok: true };
  }, { tipo: 'ecossistema', userId: 'u1' });
  await j.pronto;
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0].job.tipo, 'ecossistema');
  assert.equal(recebidos[0].medido.chamadas, 1);
  assert.equal(recebidos[0].medido.custoCentavos, 3.2);
});

test('a rota de IA registra quando TERMINA, com o caderno guardado na entrada', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.match(s, /const caderno = motores\.medicaoAtual\(\);/);
  assert.match(s, /res\.once\('finish', registrar\)/);
  assert.match(s, /usoIA\.podeUsarTexto\(db, tenantTexto\)/);
  assert.match(s, /jobs\.aoMedir = /);
});

test('resposta vazia do Gemini também entra na conta', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'server/motores.js'), 'utf8');
  assert.match(s, /vazia: true/);
});

test('o corpo do pedido é lido DENTRO da medição da requisição', async () => {
  /*
   * O 'end' do stream roda no contexto do socket. Sem o bind, toda rota que
   * lê o corpo (todas as de IA) chamava a IA fora do caderno: o uso_ia gravou
   * zero chamadas desde que a medição existe. Aqui, a mesma montagem do
   * readBody: com o bind a chamada é anotada; sem ele, some.
   */
  const s = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  const corpo = s.slice(s.indexOf('function readBody('), s.indexOf('function readBody(') + 600);
  assert.match(corpo, /req\.on\('end', AsyncResource\.bind\(/);

  const http = require('node:http');
  const { AsyncResource } = require('node:async_hooks');
  const medir = (ligar) => new Promise((resolve) => {
    const srv = http.createServer((req, res) => motores.medir(() => {
      const fim = () => { motores.medicaoAtual() && motores.medicaoAtual().chamadas.push({ custoCentavos: 1, entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, modelo: 'x' }); res.end(String(motores.consumirMedicao().chamadas)); };
      req.on('data', () => {});
      req.on('end', ligar ? AsyncResource.bind(fim) : fim);
    }));
    srv.listen(0, () => {
      const r = http.request({ port: srv.address().port, method: 'POST' }, (res) => {
        let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { srv.close(); resolve(Number(d)); });
      });
      r.end('{"a":1}');
    });
  });
  assert.equal(await medir(true), 1, 'com o bind, a chamada entra no caderno da requisição');
});

test('D0.4b: duas fotos ao mesmo tempo com saldo para uma — uma sai, a outra não; a falha devolve', async () => {
  const db = require('../server/db-sqlite.js');
  const { tenantId: id } = await db.createAccount('reserva' + Date.now() + '@teste.local', 'x', 'Loja da reserva', 'Dono');
  const tenant = { ...(await db.getTenant(id)), plan: 'pro', plan_status: 'active' };
  await db.setCreditos(id, { franquiaRestante: 1, creditosComprados: 0, cicloEm: Date.now() });
  const [a, b] = await Promise.all([usoIA.reservar(db, tenant, 'gerar-imagem', 1), usoIA.reservar(db, tenant, 'gerar-imagem', 1)]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1, 'só uma passa');
  const quem = a.ok ? a : b;
  assert.equal((await db.getCreditos(id)).franquiaRestante, 0);
  // A geração falhou: o crédito volta.
  await usoIA.devolver(db, tenant, quem.reserva);
  assert.equal((await db.getCreditos(id)).franquiaRestante, 1);
  // Reservou e deu certo: o cobrar registra e NÃO debita de novo.
  const r = await usoIA.reservar(db, tenant, 'gerar-imagem', 1);
  assert.ok(r.ok);
  await usoIA.cobrar(db, tenant, { tipo: 'gerar-imagem', quantidade: 1, userId: 'u', referencia: 'x', reserva: r.reserva });
  assert.equal((await db.getCreditos(id)).franquiaRestante, 0, 'debitou duas vezes');
});

test('D0.4b: as duas portas de foto reservam antes e devolvem na falha', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.equal((s.match(/usoIA\.reservar\(db, /g) || []).length, 2);
  assert.ok(!/usoIA\.conferir\(db, (contaIA|tenantIA)/.test(s), 'voltou a só conferir o saldo');
  // Desde o D0.4c a devolução é do controle da reserva, fechado num finally.
  assert.equal((s.match(/usoIA\.controleDaReserva\(db, /g) || []).length, 2);
  assert.equal((s.match(/\} finally \{ await reserva\.fechar\(\); \}/g) || []).length, 2);
});

test('D0.4c: a foto saiu mas guardar falhou (cota cheia) — o crédito volta, uma vez só', async () => {
  const db = require('../server/db-sqlite.js');
  const { tenantId: id } = await db.createAccount('guardar' + Date.now() + '@teste.local', 'x', 'Loja do guardar', 'Dono');
  const tenant = { ...(await db.getTenant(id)), plan: 'pro', plan_status: 'active' };
  await db.setCreditos(id, { franquiaRestante: 2, creditosComprados: 0, cicloEm: Date.now() });
  const saldo = async () => (await db.getCreditos(id)).franquiaRestante;

  // O mesmo desenho das duas portas de foto em server.js.
  async function gerar(guardar) {
    const pode = await usoIA.reservar(db, tenant, 'gerar-imagem', 1);
    const reserva = usoIA.controleDaReserva(db, tenant, pode.reserva);
    try {
      const salvo = await guardar();
      reserva.cobrada();
      await usoIA.cobrar(db, tenant, { tipo: 'gerar-imagem', quantidade: 1, userId: 'u', referencia: salvo, reserva: pode.reserva });
    } finally { await reserva.fechar(); }
  }

  await assert.rejects(gerar(async () => { throw new Error('cota de armazenamento cheia'); }), /cota/);
  assert.equal(await saldo(), 2, 'o crédito sumiu quando guardar falhou');

  await gerar(async () => 'midia-1');
  assert.equal(await saldo(), 1, 'cobrou e o finally devolveu mesmo assim');

  // Devolver e depois fechar não devolve duas vezes.
  const pode = await usoIA.reservar(db, tenant, 'gerar-imagem', 1);
  const r = usoIA.controleDaReserva(db, tenant, pode.reserva);
  await r.devolver(); await r.fechar(); await r.devolver();
  assert.equal(await saldo(), 1, 'devolveu mais de uma vez');
});
