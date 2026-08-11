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
const plans = require('./plans');

const MES = 30 * 24 * 60 * 60 * 1000;

/*
 * Repõe a franquia quando o ciclo virou.
 *
 * A franquia é POR TELA, e o número de telas muda: a reposição usa a
 * contagem do dia da virada, que é o que o cliente tem de fato agora. Contas
 * novas caem aqui na primeira chamada e recebem os créditos de boas-vindas.
 */
async function garantirCiclo(db, tenant) {
  const atual = (await db.getCreditos(tenant.id)) || { franquiaRestante: 0, creditosComprados: 0, cicloEm: 0 };
  const agora = Date.now();
  if (atual.cicloEm && agora - atual.cicloEm < MES) return atual;

  const telas = await db.countDevices(tenant.id);
  const franquia = plans.franquiaCreditos(tenant.plan, Math.max(1, telas));

  // Primeira vez da conta: o punhado de boas-vindas entra como crédito
  // comprado, porque ele não deve sumir na primeira virada de ciclo.
  const boasVindas = atual.cicloEm ? 0 : plans.CREDITOS_BOAS_VINDAS;

  const novo = {
    franquiaRestante: franquia,
    creditosComprados: atual.creditosComprados + boasVindas,
    cicloEm: agora,
  };
  await db.setCreditos(tenant.id, novo);
  return novo;
}

/*
 * Dá para fazer esta operação? Devolve { ok } ou { ok: false, resposta },
 * onde `resposta` já é o corpo pronto para o cliente — com a primeira linha
 * dizendo que as telas continuam no ar.
 */
async function conferir(db, tenant, tipo, quantidade) {
  const precisa = cred.creditosDe(tipo, quantidade);
  if (precisa === 0) return { ok: true, precisa: 0 };

  const conta = await garantirCiclo(db, tenant);
  const s = cred.saldo(conta);
  if (s.total < precisa) return { ok: false, precisa, resposta: cred.semSaldo(precisa, s.total) };
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
  const custoCentavos = op ? op.custoCentavos * n : 0;

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
    await db.registrarUsoIA(tenant.id, { userId, tipo, creditos, custoCentavos, referencia });
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

  return { creditos, custoCentavos };
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

module.exports = { garantirCiclo, conferir, cobrar, tetoTextoOk, panorama, MES };
