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
async function cobrar(db, tenant, { tipo, quantidade, userId, referencia }) {
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
  const medido = motores.consumirMedicao();
  const estimado = op ? op.custoCentavos * n : 0;
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

  if (creditos > 0) {
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
      await db.setCreditos(tenant.id, {
        franquiaRestante: conta.franquiaRestante - daFranquia,
        creditosComprados: conta.creditosComprados - doComprado,
        cicloEm: conta.cicloEm,
      });
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

module.exports = { garantirCiclo, renovarCiclo, conferir, cobrar, tetoTextoOk, panorama, MES };
