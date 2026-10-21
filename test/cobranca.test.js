/*
 * O que o dinheiro muda na conta (server/cobranca.js e a regra de atraso em
 * server/plans.js).
 *
 * Os três defeitos que este arquivo guarda deixavam o cliente usar mais do
 * que pagava sem ninguém ter feito nada de errado: a assinatura cobrando as
 * telas do dia do checkout para sempre, o atraso sem consequência nenhuma, e
 * o estorno que devolvia o dinheiro e deixava o plano.
 */
const test = require('node:test');
const assert = require('node:assert');

const C = require('../server/cobranca.js');
const plans = require('../server/plans.js');
const usoIA = require('../server/uso-ia.js');

const DIA = 24 * 60 * 60 * 1000;
const AGORA = 1700000000000;

/* ---------------- Um banco e um Asaas de mentira ---------------- */

function banco(tenants, telasPorConta) {
  const t = {};
  for (const x of tenants) t[x.id] = { ...x };
  return {
    t,
    async getTenant(id) { return t[id] ? { ...t[id] } : null; },
    async countDevices(id) { return telasPorConta[id] || 0; },
    async setTenantBilling(id, f) {
      const map = { plan: 'plan', status: 'plan_status', telasCobradas: 'plan_telas', atrasoDesde: 'atraso_desde', subscriptionId: 'stripe_subscription_id' };
      for (const k of Object.keys(f)) if (map[k] && f[k] !== undefined) t[id][map[k]] = f[k];
    },
    async contasParaConciliar() {
      return Object.values(t).filter((x) => x.stripe_subscription_id
        && (x.plan_telas == null ? -1 : x.plan_telas) !== (telasPorConta[x.id] || 0));
    },
  };
}

function asaas(modo, falhar) {
  const chamadas = [];
  return {
    chamadas,
    mode: () => modo || 'asaas',
    async atualizarValor(sub, plano, valor) {
      if (falhar) throw new Error('Asaas fora do ar');
      chamadas.push({ sub, plano, valor });
    },
  };
}

/* ---------------- 1 · A assinatura acompanha as telas ---------------- */

test('parear mais telas sobe o valor da assinatura', async () => {
  const db = banco([{ id: 'a', plan: 'pro', plan_status: 'active', stripe_subscription_id: 'sub_1', plan_telas: 1 }], { a: 5 });
  const b = asaas();
  const r = await C.sincronizarTelas(db, b, 'a');
  assert.equal(r.mudou, true);
  assert.equal(b.chamadas.length, 1);
  // 5 telas no Pro: 4 cheias + 1 com 10% de desconto — a tabela de plans.js.
  assert.equal(b.chamadas[0].valor, plans.mensalidadeCents('pro', 5) / 100);
  assert.equal(db.t.a.plan_telas, 5);
});

test('conta já em dia não chama o Asaas', async () => {
  const db = banco([{ id: 'a', plan: 'pro', stripe_subscription_id: 'sub_1', plan_telas: 3 }], { a: 3 });
  const b = asaas();
  await C.sincronizarTelas(db, b, 'a');
  assert.equal(b.chamadas.length, 0);
});

test('remover todas as telas cobra uma, não zero', async () => {
  // Assinatura de R$ 0,00 no Asaas é assinatura quebrada: a porta fica aberta
  // e ninguém paga nada.
  const db = banco([{ id: 'a', plan: 'pro', stripe_subscription_id: 'sub_1', plan_telas: 2 }], { a: 0 });
  const b = asaas();
  await C.sincronizarTelas(db, b, 'a');
  assert.equal(b.chamadas[0].valor, plans.mensalidadeCents('pro', 1) / 100);
});

test('assinatura aberta e ainda não paga não é anotada como em dia', async () => {
  // O defeito: anotar aqui fazia a tela pareada entre o checkout e o
  // pagamento nunca entrar na cobrança — a conciliação acharia a conta certa.
  const db = banco([{ id: 'a', plan: 'free', stripe_subscription_id: 'sub_1', plan_telas: 1 }], { a: 2 });
  const b = asaas();
  const r = await C.sincronizarTelas(db, b, 'a');
  assert.equal(r.mudou, false);
  assert.equal(db.t.a.plan_telas, 1, 'continua divergente para a conciliação pegar depois do pagamento');
  assert.equal(b.chamadas.length, 0);
});

test('Enterprise não tem tabela: anota as telas e não mexe no valor', async () => {
  const db = banco([{ id: 'a', plan: 'enterprise', stripe_subscription_id: 'sub_1', plan_telas: 10 }], { a: 30 });
  const b = asaas();
  await C.sincronizarTelas(db, b, 'a');
  assert.equal(b.chamadas.length, 0);
  assert.equal(db.t.a.plan_telas, 30);
});

test('a conciliação acerta o que ficou para trás quando o Asaas falhou', async () => {
  const db = banco([
    { id: 'a', plan: 'pro', stripe_subscription_id: 'sub_a', plan_telas: 1 },
    { id: 'b', plan: 'pro', stripe_subscription_id: 'sub_b', plan_telas: 4 },
    { id: 'c', plan: 'pro', stripe_subscription_id: null, plan_telas: null },
  ], { a: 3, b: 4, c: 9 });

  // Primeira rodada com o Asaas fora: nada é anotado, e o erro é registrado.
  const erros = [];
  const r1 = await C.conciliar(db, asaas('asaas', true), (e) => erros.push(e));
  assert.equal(r1.acertadas, 0);
  assert.equal(erros.length, 1);
  assert.equal(db.t.a.plan_telas, 1, 'falha não pode marcar como acertado');

  // Segunda rodada, com o Asaas de pé: acerta só quem estava errado.
  const b = asaas();
  const r2 = await C.conciliar(db, b, () => {});
  assert.equal(r2.acertadas, 1);
  assert.deepEqual(b.chamadas.map((x) => x.sub), ['sub_a']);
});

test('em modo simulado a conciliação anota sem chamar ninguém', async () => {
  const db = banco([{ id: 'a', plan: 'pro', stripe_subscription_id: 'sub_1', plan_telas: 1 }], { a: 2 });
  const b = asaas('dev');
  await C.sincronizarTelas(db, b, 'a');
  assert.equal(db.t.a.plan_telas, 2);
});

/* ---------------- 2 · Eventos do Asaas ---------------- */

test('pagamento recebido libera o plano e encerra o atraso', () => {
  const p = C.efeitoDoEvento('PAYMENT_RECEIVED', { tenant: { atraso_desde: AGORA - DIA }, planId: 'pro', subId: 's', customerId: 'c' }, AGORA);
  assert.equal(p.plan, 'pro');
  assert.equal(p.status, 'active');
  assert.strictEqual(p.atrasoDesde, null);
});

test('o relógio do atraso começa no primeiro aviso e não anda nas reentregas', () => {
  const primeiro = C.efeitoDoEvento('PAYMENT_OVERDUE', { tenant: { plan: 'pro' } }, AGORA);
  assert.equal(primeiro.atrasoDesde, AGORA);
  // O Asaas reentrega. Se cada reentrega zerasse a data, a carência nunca venceria.
  const reenvio = C.efeitoDoEvento('PAYMENT_OVERDUE', { tenant: { plan: 'pro', atraso_desde: AGORA } }, AGORA + 5 * DIA);
  assert.equal(reenvio.atrasoDesde, AGORA);
});

test('estorno e chargeback tiram o plano', () => {
  for (const ev of ['PAYMENT_REFUNDED', 'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE']) {
    const p = C.efeitoDoEvento(ev, { tenant: { plan: 'pro' } }, AGORA);
    assert.equal(p.plan, 'free', ev);
  }
});

test('assinatura criada não concede plano', () => {
  const p = C.efeitoDoEvento('SUBSCRIPTION_CREATED', { tenant: {}, planId: 'pro', subId: 's', customerId: 'c' }, AGORA);
  assert.equal(p.plan, undefined);
});

test('evento desconhecido não mexe em nada', () => {
  assert.equal(C.efeitoDoEvento('PAYMENT_CREATED', { tenant: {} }, AGORA), null);
});

/* ---------------- 3 · Atraso: aviso em 3 dias, selo em 10, suspensão em 20 (PLANO §6.6) ---------------- */

const atrasada = (dias) => ({ id: 't', plan: 'pro', plan_status: 'past_due', atraso_desde: AGORA - dias * DIA, created_at: AGORA - 90 * DIA });

test('antes da suspensão nada que custe a loja muda', () => {
  for (const dias of [1, 3, 10, 19]) {
    assert.equal(plans.podeParear(atrasada(dias), 1, AGORA).ok, true, dias + ' dias');
    assert.equal(plans.situacaoAtraso(atrasada(dias), AGORA).bloqueado, false, dias + ' dias');
  }
  const s = plans.situacaoAtraso(atrasada(3), AGORA);
  assert.equal(s.diasAteBloquear, 17);
  assert.equal(s.diasAteSelo, 7);
  assert.equal(s.diasEmAtraso, 3);
});

test('a régua: aviso em 3 dias, selo em 10, suspensão em 20', () => {
  const em = (dias) => plans.situacaoAtraso(atrasada(dias), AGORA);
  assert.deepStrictEqual([em(2).aviso, em(3).aviso], [false, true]);
  assert.deepStrictEqual([em(9).selo, em(10).selo], [false, true]);
  assert.deepStrictEqual([em(19).bloqueado, em(20).bloqueado], [false, true]);
  assert.equal(plans.CARENCIA_ATRASO_DIAS, 20);
});

test('passada a suspensão, tela nova não pareia', () => {
  const v = plans.podeParear(atrasada(21), 1, AGORA);
  assert.equal(v.ok, false);
  assert.equal(v.motivo, 'atraso');
});

test('o selo do atraso diz só "MultiTelas" — a TV nunca apaga, e a loja não é exposta', () => {
  assert.equal(plans.textoDoSelo(atrasada(9), AGORA), '');
  assert.equal(plans.textoDoSelo(atrasada(10), AGORA), 'MultiTelas', 'com 10 dias, o selo entra');
  assert.equal(plans.textoDoSelo(atrasada(40), AGORA), 'MultiTelas', '"versão gratuita" seria mentira para quem paga');
  assert.equal(plans.exibeSelo(atrasada(10), AGORA), true);
  assert.equal(plans.textoDoSelo({ ...atrasada(40), plan_status: 'active', atraso_desde: null }, AGORA), '', 'pagou, o selo sai');
  // O teste acabado continua com o selo de sempre.
  assert.equal(plans.textoDoSelo({ plan: 'free', created_at: AGORA - 30 * DIA }, AGORA), 'MultiTelas · versão gratuita');
});

test('a TV recebe o texto do selo no pulso, e a TV antiga continua entendendo o booleano', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const ler = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
  assert.match(ler('server/routes/telas.js'), /selo: !!seloTexto, seloTexto,/);
  assert.match(ler('js/cloud.js'), /detail: r\.selo \? \(r\.seloTexto \|\| 'MultiTelas · versão gratuita'\) : false/);
  assert.match(ler('js/player.js'), /const texto = typeof ev\.detail === 'string' \? ev\.detail : 'MultiTelas · versão gratuita';/);
});

test('o e-mail de aviso sai com 3 dias, uma vez por atraso', () => {
  const lemb = require('../server/lembretes.js');
  const conta = (dias, aviso) => ({ ...atrasada(dias), email: 'dono@loja.com', aviso_atraso: aviso || 0 });
  assert.equal(lemb.decidirAtraso(conta(2), AGORA), false, 'antes de 3 dias, só o painel avisa');
  assert.equal(lemb.decidirAtraso(conta(3), AGORA), true);
  assert.equal(lemb.decidirAtraso(conta(5, AGORA - 5 * DIA), AGORA), false, 'o mesmo atraso não avisa duas vezes');
  assert.equal(lemb.decidirAtraso(conta(5, AGORA - 90 * DIA), AGORA), true, 'um atraso NOVO avisa de novo');
  assert.equal(lemb.decidirAtraso({ ...conta(5), email: '' }, AGORA), false);
  const m = lemb.mensagemAtraso(conta(3), 'https://app.exemplo', AGORA);
  assert.match(m.subject, /continuam no ar/);
  assert.match(m.text, /Nunca desligamos uma tela por causa de fatura/);
  assert.match(m.text, /em 7 dias as TVs passam a mostrar um pequeno selo/);
  assert.match(m.text, /em 17 dias criar com IA e ligar telas novas ficam pausados/);
  assert.match(m.text, /https:\/\/app\.exemplo\/app\/\?ir=billing/);
});

test('a varredura manda o aviso e marca, e falha de envio não marca', async () => {
  const lemb = require('../server/lembretes.js');
  const contas = [{ ...atrasada(4), id: 'a', email: 'a@x.com', aviso_atraso: 0 }, { ...atrasada(4), id: 'b', email: 'b@x.com', aviso_atraso: 0 }];
  const marcadas = [];
  const db = {
    async contasEmTeste() { return []; },
    async contasEmAtraso() { return contas; },
    async marcarAvisoAtraso(id, desde) { marcadas.push([id, desde]); },
  };
  const mail = { async send({ to }) { if (to === 'b@x.com') throw new Error('provedor fora'); } };
  const r = await lemb.varrer({ db, mail, appUrl: '', agora: AGORA });
  assert.equal(r.atrasos, 1);
  assert.deepStrictEqual(marcadas, [['a', AGORA - 4 * DIA]]);
});

test('conta marcada atrasada sem data não é cortada no chute', () => {
  const t = { ...atrasada(30), atraso_desde: null };
  assert.equal(plans.bloqueioPorAtraso(t, AGORA), null);
  assert.equal(plans.textoDoSelo(t, AGORA), '', 'nem ganha selo');
});

test('conta em dia não tem atraso', () => {
  assert.equal(plans.situacaoAtraso({ plan: 'pro', plan_status: 'active', atraso_desde: AGORA - 30 * DIA }, AGORA), null);
});

function bancoDeCreditos(conta) {
  let c = conta;
  return {
    async getCreditos() { return c; },
    async setCreditos(_, n) { c = n; },
    async countDevices() { return 4; },
    get conta() { return c; },
  };
}

test('passada a suspensão, IA que custa criação é recusada com a mensagem certa', async () => {
  const db = bancoDeCreditos({ franquiaRestante: 100, creditosComprados: 0, cicloEm: Date.now() - DIA });
  const t = { ...atrasada(21), atraso_desde: Date.now() - 21 * DIA };
  const r = await usoIA.conferir(db, t, 'gerar-imagem', 1);
  assert.equal(r.ok, false);
  assert.equal(r.resposta.erro, 'pagamento_atrasado');
  assert.match(r.resposta.mensagem, /continuam no ar/);
  // Com 19 dias ainda cria.
  const antes = await usoIA.conferir(db, { ...t, atraso_desde: Date.now() - 19 * DIA }, 'gerar-imagem', 1);
  assert.equal(antes.ok, true);
});

test('passada a suspensão, as criações não repõem na virada do mês', async () => {
  const velho = Date.now() - 40 * DIA;
  const db = bancoDeCreditos({ franquiaRestante: 0, creditosComprados: 0, cicloEm: velho });
  const t = { ...atrasada(21), atraso_desde: Date.now() - 21 * DIA };
  await usoIA.garantirCiclo(db, t);
  assert.equal(db.conta.franquiaRestante, 0);
  assert.equal(db.conta.cicloEm, velho, 'o ciclo não anda: repõe quando pagar');

  // Pagou: repõe na próxima chamada.
  await usoIA.garantirCiclo(db, { ...t, plan_status: 'active', atraso_desde: null });
  assert.equal(db.conta.franquiaRestante, plans.franquiaCreditos('pro', 4));
});

/* ---------------- O teste com 20 criações, e a assinatura no meio dele ---------------- */

test('conta nova no teste ganha 20 criações, que vencem com o teste', async () => {
  const agora = Date.now();
  const db = bancoDeCreditos(null);
  const nova = { id: 'n', plan: 'free', created_at: agora - DIA };
  await usoIA.garantirCiclo(db, nova);
  assert.equal(db.conta.franquiaRestante, plans.CRIACOES_DO_TESTE);
  assert.equal(db.conta.creditosComprados, 0, 'as do teste vencem: não vão para o balde que não vence');

  // O teste acabou sem assinatura: zeram, e a IA para (a tela segue com o selo).
  await db.setCreditos('n', { ...db.conta, franquiaRestante: 7 });
  const vencida = { ...nova, created_at: agora - 15 * DIA };
  await usoIA.garantirCiclo(db, vencida);
  assert.equal(db.conta.franquiaRestante, 0);
  const r = await usoIA.conferir(db, vencida, 'gerar-imagem', 1);
  assert.equal(r.ok, false);
  assert.equal(r.resposta.erro, 'teste_acabou');
  assert.match(r.resposta.mensagem, /continuam no ar/);
});

test('o que foi comprado continua valendo depois do teste', async () => {
  const agora = Date.now();
  const db = bancoDeCreditos({ franquiaRestante: 5, creditosComprados: 25, cicloEm: agora - DIA });
  const vencida = { id: 'v', plan: 'free', created_at: agora - 20 * DIA };
  const r = await usoIA.conferir(db, vencida, 'gerar-imagem', 1);
  assert.equal(r.ok, true);
  assert.equal(db.conta.franquiaRestante, 0);
  assert.equal(db.conta.creditosComprados, 25);
});

test('assinou no meio do teste: as criações do plano começam no dia', async () => {
  const agora = Date.now();
  const db = bancoDeCreditos({ franquiaRestante: 12, creditosComprados: 0, cicloEm: agora - 5 * DIA });
  await usoIA.renovarCiclo(db, 't');
  await usoIA.garantirCiclo(db, { id: 't', plan: 'pro', plan_status: 'active', created_at: agora - 5 * DIA });
  assert.equal(db.conta.franquiaRestante, plans.franquiaCreditos('pro', 4), 'esperava até o dia 30 sem criação nenhuma');
  assert.ok(agora - db.conta.cicloEm < 60 * 1000, 'o ciclo recomeça hoje');
  // E o pagamento de verdade chama a renovação na virada de grátis para pago.
  const fs = require('node:fs');
  const rotas = fs.readFileSync(require('node:path').join(__dirname, '..', 'server', 'routes', 'billing.js'), 'utf8');
  assert.match(rotas, /if \(patch\.plan && plans\.isPaid\(patch\.plan\) && !plans\.isPaid\(tenant\.plan\)\) await usoIA\.renovarCiclo\(db, tenant\.id\);/);
});

test('checkout abandonado não vira atraso de quem nunca pagou', () => {
  // Assinou, não pagou, o Asaas mandou OVERDUE. A conta segue no grátis.
  assert.equal(C.efeitoDoEvento('PAYMENT_OVERDUE', { tenant: { plan: 'free' } }, AGORA), null);
  const t = { plan: 'free', plan_status: 'past_due', atraso_desde: AGORA - 30 * DIA, created_at: AGORA - 3 * DIA };
  assert.equal(plans.situacaoAtraso(t, AGORA), null);
});

test('pagar a fatura nova com a velha ainda vencida não zera o atraso', () => {
  const p = C.efeitoDoEvento('PAYMENT_RECEIVED', { tenant: { plan: 'pro', atraso_desde: AGORA - 20 * DIA }, planId: 'pro', outrasVencidas: 1 }, AGORA);
  assert.equal(p.status, 'past_due');
  assert.ok(!('atrasoDesde' in p), 'a data do atraso tem que continuar a mesma');
});
