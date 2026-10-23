/*
 * server/uso-ia.js — o caminho único por onde uso de IA é medido e cobrado.
 *
 * Existe um só para que nenhum endpoint novo apareça sem medição. Toda
 * chamada de IA registra; só a que gera imagem debita.
 *
 * A ordem importa e é sempre a mesma:
 *
 *   1. conferir()  ANTES de chamar a IA — sem saldo, não se gera nada. Gerar
 *      primeiro e cobrar depois deixaria a conta devendo, e recusar depois de
 *      a imagem existir é pior ainda.
 *   2. a chamada acontece.
 *   3. cobrar()    DEPOIS, e SÓ se deu certo. Geração que voltou vazia,
 *      recusada ou com erro não desconta: cobrar por imagem que não veio é o
 *      jeito mais rápido de perder a confiança no medidor inteiro.
 *
 * E o princípio que manda em tudo (docs/BILLING.md): a tela nunca para. O que
 * pode ser bloqueado aqui é criar imagem nova, e nada além disso.
 */

'use strict';

const cred = require('./creditos');
const motores = require('./motores');
const plans = require('./plans');

const MES = 30 * 24 * 60 * 60 * 1000;

/*
 * Repõe a franquia quando o ciclo virou.
 *
 * O teto é POR CONTA, mas cresce com as telas (PLANO §6.5): a reposição usa
 * a contagem do dia da virada, que é o que o cliente tem de fato agora.
 *
 * Conta nova cai aqui na primeira chamada. No teste, ganha as criações do
 * teste (plans.CRIACOES_DO_TESTE) — na FRANQUIA, que expira, porque elas só
 * valem durante os 14 dias. Acabou o teste sem assinatura: zeram, e a tela
 * segue com o selo e sem IA (PLANO §6.4). Crédito comprado nunca é tocado.
 */
async function garantirCiclo(db, tenant) {
  const atual = (await db.getCreditos(tenant.id)) || { franquiaRestante: 0, creditosComprados: 0, cicloEm: 0 };
  const agora = Date.now();
  const noTeste = !plans.isPaid(tenant.plan) && plans.testeAtivo(tenant, agora);
  if (atual.cicloEm && !plans.isPaid(tenant.plan) && !noTeste && atual.franquiaRestante > 0) {
    const vencido = { ...atual, franquiaRestante: 0 };
    await db.setCreditos(tenant.id, vencido);
    return vencido;
  }
  if (atual.cicloEm && agora - atual.cicloEm < MES) return atual;
  /*
   * Atraso além da carência: a franquia NÃO repõe. Sem isto, quem parou de
   * pagar recebia crédito novo todo mês, para sempre. O ciclo não anda, então
   * no dia em que pagar a reposição acontece na próxima chamada.
   */
  if (atual.cicloEm && plans.bloqueioPorAtraso(tenant, agora)) return atual;

  const telas = await db.countDevices(tenant.id);
  // As do teste só na PRIMEIRA vez: uma virada de ciclo no meio do teste não
  // dá mais 20.
  const franquia = plans.franquiaCreditos(tenant.plan, Math.max(1, telas))
    + (!atual.cicloEm && noTeste ? plans.CRIACOES_DO_TESTE : 0);

  const novo = {
    franquiaRestante: franquia,
    creditosComprados: atual.creditosComprados,
    cicloEm: agora,
  };
  await db.setCreditos(tenant.id, novo);
  return novo;
}

/*
 * A conta acabou de passar a pagar: o ciclo recomeça HOJE, com o teto do
 * plano. Sem isto, quem assinava no 5º dia do teste ficava até o fim do
 * ciclo (30 dias desde a criação da conta) sem nenhuma criação do plano
 * pago. `cicloEm: 1` é "ciclo vencido, mas não é conta nova": a próxima
 * chamada repõe, sem as criações do teste.
 */
async function renovarCiclo(db, tenantId) {
  const atual = (await db.getCreditos(tenantId)) || { franquiaRestante: 0, creditosComprados: 0, cicloEm: 0 };
  await db.setCreditos(tenantId, { ...atual, cicloEm: 1 });
}

/*
 * Dá para fazer esta operação? Devolve { ok } ou { ok: false, resposta },
 * onde `resposta` já é o corpo pronto para o cliente — com a primeira linha
 * dizendo que as telas continuam no ar.
 */
async function conferir(db, tenant, tipo, quantidade) {
  const precisa = cred.creditosDe(tipo, quantidade);
  if (precisa === 0) return { ok: true, precisa: 0 };
  if (plans.bloqueioPorAtraso(tenant)) return { ok: false, precisa, resposta: cred.pagamentoAtrasado() };

  const conta = await garantirCiclo(db, tenant);
  const s = cred.saldo(conta);
  if (s.total < precisa) {
    const testeVencido = !plans.isPaid(tenant.plan) && !plans.testeAtivo(tenant);
    return { ok: false, precisa, resposta: testeVencido ? cred.testeAcabou() : cred.semSaldo(precisa, s.total) };
  }
  return { ok: true, precisa, conta };
}

/*
 * Registra o que aconteceu e debita, se for o caso. Chamado DEPOIS do
 * sucesso.
 *
 * Registrar sempre, inclusive o que não cobra, é o que permite trocar as
 * estimativas de custo desta proposta por medição de verdade — e é o que
 * mostra, no fim do mês, se a franquia está calibrada.
 */
async function cobrar(db, tenant, { tipo, quantidade, userId, referencia, medicao, reserva }) {
  const op = cred.operacao(tipo);
  const n = Math.max(1, Math.floor(Number(quantidade) || 1));
  const creditos = cred.creditosDe(tipo, n);
  /*
   * O custo é MEDIDO quando a requisição chamou a IA de texto pela camada
   * nova (server/motores.js soma os tokens da requisição inteira). Aí a
   * estimativa fixa do texto sai e entra o que foi gasto de verdade. A
   * imagem continua estimada — o provedor de imagem não devolve tokens — e
   * soma o texto medido da mesma requisição.
   */
  // `medicao`: o caderno guardado na entrada da rota, lido quando ela termina (server.js).
  const medido = medicao ? motores.consumirDe(medicao) : motores.consumirMedicao();
  const estimado = op ? op.custoCentavos * n : 0;
  /*
   * Sem chamada medida, fica a estimativa do catálogo, e nunca zero: um
   * caminho que escapasse da medição escaparia também do teto da conta
   * (revisão do consultor, D0.4). O trabalho em segundo plano soma a linha
   * medida dele no fim (jobs.aoMedir); a sobra de alguns centavos erra para
   * o lado seguro.
   */
  const custoCentavos = medido.chamadas
    ? Math.round((creditos > 0 ? estimado : 0) + medido.custoCentavos)
    : estimado;

  /*
   * REGISTRA ANTES DE DEBITAR, e a ordem não é gosto.
   *
   * A primeira versão debitava e depois registrava. Um id duplicado fez o
   * registro estourar depois do débito: o cliente recebeu erro 502, a imagem
   * não veio, e o crédito sumiu sem deixar rastro — o pior dos dois mundos.
   *
   * Registrando primeiro, uma falha no meio deixa a linha no extrato sem
   * cobrar. Erra a favor do cliente e ainda deixa o rastro para conferir
   * depois, que é a direção certa de errar quando o assunto é dinheiro.
   */
  try {
    await db.registrarUsoIA(tenant.id, { userId, tipo, creditos, custoCentavos, referencia, tokens: medido.chamadas ? medido : null });
  } catch (e) {
    /*
     * Contabilidade não pode derrubar o produto. A imagem já foi gerada e
     * guardada; transformar uma falha de registro em erro para quem pediu
     * seria jogar fora o trabalho por causa do livro-caixa.
     */
    console.warn('[uso-ia] não consegui registrar o uso:', e.message);
  }

  // Já reservado antes de gerar (reservar): o crédito saiu lá, não sai de novo.
  if (creditos > 0 && !reserva) {
    try {
      const conta = await garantirCiclo(db, tenant);
      const parte = cred.debitar(conta, creditos);
      /*
       * Chegou aqui sem saldo: o conferir() passou e alguma coisa gastou o
       * saldo no meio do caminho (outra aba, outra pessoa da equipe). A
       * imagem já existe — cobrar o que dá e seguir é mais honesto do que
       * apagar o trabalho dela.
       */
      const daFranquia = parte ? parte.daFranquia : Math.min(conta.franquiaRestante, creditos);
      const doComprado = parte ? parte.doComprado : Math.min(conta.creditosComprados, creditos - daFranquia);
      // Subtração no banco (db.debitarCreditos): um pacote pago ou outro
      // trabalho da conta no meio do caminho não é sobrescrito.
      await db.debitarCreditos(tenant.id, daFranquia, doComprado);
    } catch (e) {
      console.warn('[uso-ia] não consegui debitar:', e.message);
    }
  }

  return { creditos, custoCentavos, medido };
}

/*
 * Teto do texto livre. Não é preço: é a defesa contra um laço no cliente
 * chamando geração sem parar. Uma conta que estoure isto num dia está com
 * defeito, não com pressa.
 */
async function tetoTextoOk(db, tenant) {
  const dia = await db.contarUsoIA(tenant.id, Date.now() - 24 * 60 * 60 * 1000);
  if (dia >= cred.TETO_TEXTO_DIA) return false;
  const hora = await db.contarUsoIA(tenant.id, Date.now() - 60 * 60 * 1000);
  return hora < cred.TETO_TEXTO_HORA;
}

/* O que o painel mostra: saldo, franquia do plano e consumo do ciclo. */
async function panorama(db, tenant) {
  const conta = await garantirCiclo(db, tenant);
  const telas = await db.countDevices(tenant.id);
  const s = cred.saldo(conta);
  const uso = await db.resumoUsoIA(tenant.id, conta.cicloEm);
  return {
    saldo: s,
    franquiaDoPlano: plans.franquiaCreditos(tenant.plan, Math.max(1, telas)),
    telas,
    cicloEm: conta.cicloEm,
    renovaEm: conta.cicloEm + MES,
    usoDoCiclo: uso,
  };
}

/*
 * Reserva o crédito ANTES de gerar (D0.4b). O conferir só lia o saldo: duas
 * fotos pedidas ao mesmo tempo, com saldo para uma, passavam as duas, e a
 * segunda saía de graça (o débito depois não deixava ficar negativo).
 * Agora o saldo sai no mesmo UPDATE que confere. Devolve { ok, reserva } ou
 * { ok: false, resposta } como o conferir; quem reservou chama devolver se a
 * geração falhar e passa a reserva ao cobrar.
 */
async function reservar(db, tenant, tipo, quantidade) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const pode = await conferir(db, tenant, tipo, quantidade);
    if (!pode.ok || !pode.precisa) return { ...pode, reserva: null };
    const parte = cred.debitar(pode.conta, pode.precisa);
    if (!parte) break;
    if (await db.reservarCreditos(tenant.id, parte.daFranquia, parte.doComprado)) {
      return { ok: true, precisa: pode.precisa, reserva: { daFranquia: parte.daFranquia, doComprado: parte.doComprado } };
    }
    // Outro pedido gastou no meio: lê o saldo de novo uma vez.
  }
  const conta = await garantirCiclo(db, tenant);
  return { ok: false, precisa: cred.creditosDe(tipo, quantidade), resposta: cred.semSaldo(cred.creditosDe(tipo, quantidade), cred.saldo(conta).total) };
}
async function devolver(db, tenant, reserva) {
  if (!reserva) return;
  try { await db.devolverCreditos(tenant.id, reserva.daFranquia, reserva.doComprado); }
  catch (e) { require('./erros.js').registrar(e, { onde: 'devolver crédito reservado', tenant: tenant.id }); }
}

/*
 * Uma reserva acaba de UM jeito só: cobrada ou devolvida (D0.4c).
 *
 * O consultor achou o furo do D0.4b: a falha da IA devolvia, mas se a foto
 * saía e o guardarBuffer falhava depois (cota cheia, storage fora), a
 * exceção passava sem devolver — o crédito sumia sem linha no uso_ia. Com
 * este controle, quem gera chama `fechar()` num finally: devolve se
 * ninguém cobrou nem devolveu, e não faz nada (nem devolve duas vezes) se
 * já acabou.
 */
function controleDaReserva(db, tenant, reserva) {
  let acabou = false;
  return {
    async devolver() { if (acabou) return; acabou = true; await devolver(db, tenant, reserva); },
    // Marca ANTES de cobrar: a imagem existe e foi guardada; se o registro
    // falhar, o crédito foi gasto de verdade e não volta.
    cobrada() { acabou = true; },
    fechar() { return this.devolver(); },
  };
}

/*
 * O que um trabalho em segundo plano gastou de texto (jobs.aoMedir), numa
 * linha própria do uso_ia. Sem crédito: texto não consome criação.
 */
async function registrarMedicao(db, tenantId, { tipo, userId, referencia }, medido) {
  if (!medido || !medido.chamadas) return null;
  return db.registrarUsoIA(tenantId, {
    userId: userId || '', tipo: tipo || 'trabalho', creditos: 0,
    custoCentavos: Math.round(medido.custoCentavos), referencia: referencia || '', tokens: medido,
  });
}

/* ---------------- O teto em reais (EXECUTOR D0.4) ---------------- */

/*
 * O único teto do texto era a CONTAGEM de chamadas (400/dia, 80/h), e uma
 * "chamada" de campanha faz dezenas de composições de 8 mil tokens. Não havia
 * teto em reais, nem por conta nem no total, nem alarme — e o Gemini bateu o
 * teto de gasto do mês sem ninguém ver antes (23/10).
 *
 * Por conta, por ciclo: as criações do plano (plans.tetoIaCents, que já paga
 * as imagens) mais uma margem para o texto. No teste, um valor fixo. Global,
 * por dia: MT_TETO_IA_DIA_CENTAVOS, a última rede antes da fatura do provedor.
 * Passou: a IA para com uma frase que diz que as telas continuam no ar, e o
 * operador vê o alarme em Erros, no painel da plataforma.
 */
const MARGEM_TEXTO_CENTS = 2000;
const TETO_TESTE_CENTS = 1500;
const tetoGlobalDia = () => Number(process.env.MT_TETO_IA_DIA_CENTAVOS) || 30000;

function tetoDaConta(tenant, telas) {
  return plans.isPaid(tenant.plan) ? plans.tetoIaCents(telas) + MARGEM_TEXTO_CENTS : TETO_TESTE_CENTS;
}

const avisados = new Map(); // chave → até quando não avisar de novo
function alarme(chave, mensagem, contexto, porMs) {
  const agora = Date.now();
  if ((avisados.get(chave) || 0) > agora) return;
  avisados.set(chave, agora + porMs);
  require('./erros.js').registrar(new Error(mensagem), contexto);
}

// Um minuto de cache por banco: a soma de todas as contas não roda a cada mensagem do chat.
const cacheGlobal = new WeakMap();
async function gastoGlobal(db) {
  const c = cacheGlobal.get(db);
  if (c && Date.now() - c.em < 60 * 1000) return c.centavos;
  const centavos = typeof db.gastoIAGlobal === 'function' ? await db.gastoIAGlobal(Date.now() - 24 * 60 * 60 * 1000) : 0;
  cacheGlobal.set(db, { em: Date.now(), centavos });
  return centavos;
}

function dataCurta(ms) {
  const d = new Date(ms);
  return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
}

/*
 * Pode chamar a IA de texto agora? { ok } ou { ok: false, status, corpo }.
 * A ordem é a do que a pessoa consegue resolver: pagar, assinar, esperar.
 */
async function podeUsarTexto(db, tenant) {
  if (plans.bloqueioPorAtraso(tenant)) return { ok: false, status: 402, corpo: cred.pagamentoAtrasado() };
  if (!plans.isPaid(tenant.plan) && !plans.testeAtivo(tenant)) return { ok: false, status: 402, corpo: cred.testeAcabou() };
  if (!(await tetoTextoOk(db, tenant))) {
    return { ok: false, status: 429, corpo: { error: 'Muitas chamadas de IA nesta conta hoje. Tente de novo mais tarde.' } };
  }
  const global = await gastoGlobal(db);
  if (global >= tetoGlobalDia()) {
    alarme('global', 'IA: teto global do dia atingido', { gastoCentavos: global, teto: tetoGlobalDia() }, 60 * 60 * 1000);
    return { ok: false, status: 503, corpo: { error: 'A IA está em pausa por um tempo. O que você já fez está salvo, e as suas telas continuam no ar.' } };
  }
  const conta = await garantirCiclo(db, tenant);
  const telas = await db.countDevices(tenant.id);
  const gasto = (await db.resumoUsoIA(tenant.id, conta.cicloEm)).custoCentavos;
  const teto = tetoDaConta(tenant, Math.max(1, telas));
  if (gasto >= teto) {
    alarme('conta:' + tenant.id + ':' + conta.cicloEm, 'IA: conta passou do teto de gasto do ciclo', { tenant: tenant.id, gastoCentavos: gasto, teto }, MES);
    return {
      ok: false, status: 402,
      corpo: {
        erro: 'teto_ia', titulo: 'A IA desta conta chegou ao limite do mês',
        mensagem: 'Suas telas continuam no ar, e os modelos prontos e as suas fotos seguem liberados. '
          + 'A IA volta em ' + dataCurta(conta.cicloEm + MES) + '. Precisa antes? Fale com a gente pelo Suporte.',
        saidas: ['usar-biblioteca'],
      },
    };
  }
  return { ok: true, gasto, teto };
}

module.exports = { garantirCiclo, renovarCiclo, conferir, reservar, devolver, controleDaReserva, cobrar, registrarMedicao, podeUsarTexto, tetoDaConta, tetoTextoOk, panorama, MES, MARGEM_TEXTO_CENTS, TETO_TESTE_CENTS };
