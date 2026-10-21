/*
 * O painel do operador: o negócio inteiro (PLANO §7.2, EXECUTOR item 13).
 *
 * As contas moram em server/admin.js e são puras: cada bloco da tela
 * (frota, clientes, receita, funil, custo de IA, backup) é provado aqui com
 * linhas como as do banco. A rota só busca e guarda por um minuto.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../server/admin.js');
const plans = require('../server/plans.js');
const B = require('../server/backup.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const DIA = 864e5;
const AGORA = Date.parse('2026-10-21T15:00:00-03:00'); // quarta, 15h em São Paulo
const VIVA = 3 * 60 * 1000;

test('frota: a apagada há mais tempo primeiro; no ar por último; fora do expediente marcada', () => {
  const linhas = [
    { id: 'no-ar', name: 'Caixa', tenant_id: 't1', conta: 'Padaria', last_seen: AGORA - 30 * 1000, info: '{"w":1920,"h":1080,"ua":"Mozilla (Linux; Android 9)"}' },
    { id: 'ontem', name: 'Vitrine', tenant_id: 't1', conta: 'Padaria', last_seen: AGORA - DIA },
    { id: 'mes', name: 'Recepção', tenant_id: 't2', conta: 'Ótica', last_seen: AGORA - 30 * DIA },
    { id: 'nunca', name: '', tenant_id: 't3', conta: 'Salão', last_seen: null },
    // Loja que fecha às 14h às quartas: às 15h a TV apagada é a escolha do dono.
    { id: 'dormindo', name: 'Balcão', tenant_id: 't4', conta: 'Bar', last_seen: AGORA - 40 * DIA,
      expediente: JSON.stringify({ dias: [3], inicio: '08:00', fim: '14:00' }) },
  ];
  const f = A.frota(linhas, AGORA, VIVA);
  // A que dorme no horário do dono vai depois das apagadas, mesmo dormindo há mais tempo.
  assert.deepStrictEqual(f.map((t) => t.id), ['nunca', 'mes', 'ontem', 'dormindo', 'no-ar']);
  assert.equal(f.find((t) => t.id === 'dormindo').foraDoExpediente, true);
  assert.equal(f.find((t) => t.id === 'ontem').foraDoExpediente, false, 'sem horário cadastrado, apagada é apagada');
  assert.equal(f.find((t) => t.id === 'no-ar').online, true);
  assert.equal(f.find((t) => t.id === 'no-ar').aparelho, '1920×1080 · Android');
  assert.equal(f.find((t) => t.id === 'mes').offlineHa, 30 * DIA);
  assert.equal(f.find((t) => t.id === 'nunca').nome, 'Tela sem nome');
});

const conta = (x) => ({ id: x.id, name: x.id, plan: 'pro', plan_status: 'active', telas: 1, ...x });

test('clientes: contrato, fidelidade, multa de hoje e pagamento em uma linha', () => {
  const [anual, atrasada, cortesia] = A.clientes([
    conta({ id: 'anual', telas: 5, plan_contrato: 'anual', contrato_desde: AGORA - 4 * 30 * DIA - DIA, plan_renews_at: AGORA + 3 * DIA }),
    conta({ id: 'atrasada', plan_status: 'past_due', atraso_desde: AGORA - 12 * DIA }),
    conta({ id: 'cortesia', plan_status: 'cortesia' }),
  ], AGORA, 'cortesia');
  assert.equal(anual.contrato, 'anual');
  assert.equal(anual.mensalidadeCents, 57600, '5 telas no anual = R$ 576 (PLANO §6.1)');
  assert.equal(anual.fidelidadeAte, anual.contratoDesde + 12 * 30 * DIA);
  assert.equal(anual.multaHojeCents, plans.multaCancelamentoCents({ telas: 5, mesesUsados: 4 }).cents);
  assert.deepStrictEqual(atrasada.atraso, { dias: 12, selo: true, bloqueado: false });
  assert.equal(cortesia.cortesia, true);
  assert.equal(cortesia.mensalidadeCents, 0, 'cortesia não é receita');
});

test('receita: MRR de quem paga, inadimplentes, cancelamentos e o que vence na semana', () => {
  const lista = A.clientes([
    conta({ id: 'a', telas: 2, plan_renews_at: AGORA + 2 * DIA }),
    conta({ id: 'b', telas: 5, plan_contrato: 'anual', contrato_desde: AGORA - 60 * DIA }),
    conta({ id: 'c', plan_status: 'past_due', atraso_desde: AGORA - 25 * DIA }),
    conta({ id: 'd', plan_status: 'past_due', atraso_desde: AGORA - 5 * DIA }),
    conta({ id: 'e', plan_status: 'cortesia' }),
    conta({ id: 'f', plan: 'enterprise' }),
    conta({ id: 'g', plan_status: 'canceled' }),
    conta({ id: 'h', plan_renews_at: AGORA + 20 * DIA }),
  ], AGORA, 'cortesia');
  const r = A.receita(lista, AGORA, 3);
  assert.equal(r.mrrCents, 2 * 14900 + 57600 + 14900 + 14900 + 14900);
  assert.equal(r.pagantes, 6, 'ativos e em atraso; sem cortesia nem cancelado');
  assert.equal(r.enterprise, 1);
  assert.equal(r.cortesias, 1);
  assert.equal(r.anuais, 1);
  assert.deepStrictEqual(r.inadimplentes.map((x) => [x.id, x.dias]), [['c', 25], ['d', 5]], 'o atraso mais velho primeiro');
  assert.equal(r.devendoCents, 2 * 14900);
  assert.equal(r.cancelamentos, 3);
  assert.deepStrictEqual(r.proximosVencimentos.map((x) => x.id), ['a']);
});

test('funil por semana: cadastrou → ligou a TV → paga; a conversão do teste é sobre quem ligou', () => {
  const seg = Date.parse('2026-10-19T12:00:00Z'); // segunda
  const f = A.funil([
    { id: '1', created_at: seg, plan: 'free', pareou: 0 },
    { id: '2', created_at: seg + DIA, plan: 'free', pareou: 2 },
    { id: '3', created_at: seg + 2 * DIA, plan: 'pro', plan_status: 'active', pareou: 1 },
    { id: '4', created_at: seg - 3 * DIA, plan: 'pro', plan_status: 'cortesia', pareou: 1 },
  ], 'cortesia');
  assert.equal(f.porSemana.length, 2);
  assert.deepStrictEqual(f.porSemana[0], { semana: A.inicioDaSemana(seg), cadastros: 3, ligaramTela: 2, pagos: 1 });
  assert.equal(f.porSemana[1].pagos, 0, 'cortesia não é cliente pagante');
  assert.deepStrictEqual(f.total, { cadastros: 4, ligaramTela: 3, pagos: 1 });
  assert.equal(Math.round(f.conversaoDoTeste * 100), 33);
});

test('custo de IA por conta contra o que ela paga, com o teto do plano', () => {
  const [pro, gratis] = A.custoIa([
    { tenant_id: 'p', name: 'Padaria', plan: 'pro', plan_status: 'active', centavos: 1200, criacoes: 30, chamadas: 80, telas: 2 },
    { tenant_id: 'g', name: 'Teste', plan: 'free', centavos: '90', criacoes: '5', chamadas: '12', telas: 1 },
  ], 'cortesia');
  assert.equal(pro.margemCents, 2 * 14900 - 1200);
  assert.equal(pro.tetoCents, 3000);
  assert.equal(gratis.mensalidadeCents, 0);
  assert.equal(gratis.custoCents, 90, 'número do Postgres vem como texto');
});

test('último backup: sem as variáveis, diz que não sabe; com elas, lê o manifesto mais novo', async () => {
  const sem = await A.ultimoBackup({}, null, B);
  assert.equal(sem.disponivel, false);
  const env = { BACKUP_S3_ENDPOINT: 'https://x', BACKUP_S3_BUCKET: 'b', BACKUP_S3_ACCESS_KEY_ID: 'k', BACKUP_S3_SECRET_ACCESS_KEY: 's' };
  const pedidos = [];
  const S3 = {
    criar: () => ({
      listar: async () => [{ chave: 'postgres/2026-10-19.json' }, { chave: 'postgres/2026-10-21.dump.enc' }, { chave: 'postgres/2026-10-21.json' }],
      baixar: async (k) => { pedidos.push(k); return { json: async () => ({ ok: true, fim: '2026-10-21T06:03:00Z', bytes: 1234, restauracao: { ok: true } }) }; },
    }),
  };
  const r = await A.ultimoBackup(env, S3, B);
  assert.deepStrictEqual(pedidos, ['postgres/2026-10-21.json']);
  assert.equal(r.dia, '2026-10-21');
  assert.equal(r.ok, true);
  assert.equal(r.restaurado, true);
});

test('a rota é só do operador, com memória de um minuto, e o painel tem outra cor', () => {
  const s = ler('server.js');
  const porta = s.indexOf("if (parts[1] === 'plataforma') {");
  const negocio = s.indexOf("parts[2] === 'negocio'");
  const checagem = s.indexOf('const quem = await operadores.permissao(db, sess);', porta);
  assert.ok(porta > 0 && checagem > porta && negocio > checagem, 'a rota do negócio ficou fora da porta do operador');
  assert.match(s.slice(negocio, negocio + 600), /if \(guardado && agora - guardado\.em < 60 \* 1000\) return sendJson\(res, 200, guardado\.dados\);/);
  // As consultas existem nos DOIS bancos.
  for (const f of ['db-sqlite.js', 'db-postgres.js']) {
    const d = ler('server', f);
    for (const fn of ['frotaDaPlataforma', 'contasPagas', 'cadastrosDesde', 'custoIaPorConta']) {
      assert.match(d, new RegExp('async function ' + fn + '\\('), f + ' sem ' + fn);
    }
  }
  assert.match(ler('web/src/components/layout/AppShell.jsx'), /data-modo=\{active === 'platform' \? 'operador' : undefined\}/);
  assert.match(ler('web/src/index.css'), /\[data-modo='operador'\] \{\s+--c-accent:/);
  assert.match(ler('web/src/pages/PlatformPage.jsx'), /<Negocio dias=\{dias\} \/>/);
});

test('o aparelho é descrito do mesmo jeito no cartão da tela e na frota', () => {
  const Ap = require('../js/aparelho.js');
  assert.equal(Ap.descrever({ w: 1280, h: 720, app: '1.4' }), '1280×720 · App 1.4');
  assert.equal(Ap.descrever('{"w":3840,"h":2160,"ua":"Tizen 6"}'), '3840×2160 · Samsung');
  assert.equal(Ap.descrever(null), '');
  assert.match(ler('web/src/pages/ScreensPage.jsx'), /globalThis\.MTAparelho\.descrever\(info\)/);
  assert.match(ler('server/admin.js'), /A\.descrever\(d\.info\)/);
});
