/*
 * server/creditos.js — o que custa crédito, e como o saldo é gasto.
 *
 * O princípio que decide tudo aqui, e que está em docs/BILLING.md:
 *
 *     A TELA NUNCA PARA.
 *
 * Crédito acabado, cartão recusado, fatura vencida — nada disso apaga a
 * parede de uma recepção. O que a cobrança controla é a CRIAÇÃO assistida por
 * IA, e só ela: o editor manual, o upload, o publicar e todas as telas
 * continuam inteiros. Um cliente sem crédito não fica sem produto, fica sem o
 * atalho.
 *
 * Um crédito ≈ uma imagem gerada, porque a imagem é a única coisa da IA que
 * custa dinheiro de verdade (~R$ 0,35). Uma campanha inteira de TEXTO custa
 * cerca de cinco centavos — menos que a taxa fixa do Stripe na transação que
 * cobraria por ela. Medir o texto adicionaria contabilidade, tela de saldo,
 * mensagem de bloqueio e suporte para recuperar um valor que não paga o
 * próprio processamento. Por isso texto é livre, com teto por hora só para
 * não virar buraco.
 */

'use strict';

/*
 * Custo estimado em centavos de real por chamada, para o extrato mostrar
 * dinheiro e não só contagem. São estimativas até a medição real acumular —
 * a fatia 1 da proposta existe justamente para trocar estes números por
 * dados.
 *
 * A imagem estava em 20 e o valor observado em produção é 35. A diferença
 * não muda a margem — o Pro dá 25 créditos por tela, e 25 imagens a
 * R$ 0,35 são R$ 8,75 contra R$ 149 cobrados. O que ela estragava era o
 * EXTRATO: o painel dizia ao cliente, e a nós, um número quase pela metade
 * do gasto. Decidir preço com contabilidade errada é o jeito silencioso de
 * descobrir tarde.
 */
const CUSTO_IMAGEM_CENTAVOS = 35;
const CUSTO_TEXTO_CENTAVOS = 5;

/*
 * O que cada operação cobra.
 *
 * `creditos` é quanto sai do saldo; `custoCentavos` é o que ela nos custa, e
 * serve só para o extrato e para conferir a margem depois.
 */
const OPERACOES = {
  'gerar-imagem': { creditos: 1, custoCentavos: CUSTO_IMAGEM_CENTAVOS, rotulo: 'Imagem gerada' },
  'campanha-peca': { creditos: 1, custoCentavos: CUSTO_IMAGEM_CENTAVOS, rotulo: 'Peça de campanha' },

  // Tudo abaixo é texto: livre, medido, nunca cobrado.
  briefing: { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Briefing' },
  'gerar-conteudo': { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Conteúdo por IA' },
  'gerar-campanha': { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Plano de campanha' },
  'gerar-composicao': { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Composição por IA' },
  'gerar-kit': { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Kit de marca' },
  'gerar-sazonal': { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Pacote de data' },
  'gerar-faixas': { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Faixas do dia' },
  reescrever: { creditos: 0, custoCentavos: 1, rotulo: 'Reescrita de texto' },
  diagnosticar: { creditos: 0, custoCentavos: 2, rotulo: 'Diagnóstico de tela' },
  /*
   * Visão custa mais que texto e menos que gerar imagem: LÊ um bitmap em vez
   * de produzir um. Zero crédito pelo mesmo critério do resto do texto — o
   * valor não paga a contabilidade de cobrá-lo —, mas MEDIDO, que é o que
   * faltava: a rota nasceu fora deste catálogo e por isso não aparecia em
   * lugar nenhum, nem no extrato nem no teto por hora.
   */
  'analise-visual': { creditos: 0, custoCentavos: 3, rotulo: 'Análise de peça (visão)' },
  /*
   * O guia é UMA chamada de texto por campanha começada — o mais barato do
   * catálogo, e o que mais muda o resultado, porque é onde a pessoa decide o
   * que pedir. Zero crédito pelo mesmo critério do resto do texto, mas medido:
   * se um dia ele passar a ser chamado a cada tecla, é aqui que aparece.
   */
  guia: { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Sugestões do guia' },
  diretor: { creditos: 0, custoCentavos: CUSTO_TEXTO_CENTAVOS, rotulo: 'Diretor de arte' },
};

function operacao(tipo) { return OPERACOES[tipo] || null; }
function custaCredito(tipo) { const o = operacao(tipo); return !!o && o.creditos > 0; }
function creditosDe(tipo, quantidade) {
  const o = operacao(tipo);
  if (!o) return 0;
  return o.creditos * Math.max(1, Math.floor(Number(quantidade) || 1));
}

/*
 * O saldo tem duas partes, e a ordem em que elas são gastas importa.
 *
 *   - FRANQUIA: vem do plano, por tela, e expira no fim do ciclo. É o que faz
 *     a assinatura valer a pena todo mês.
 *   - COMPRADO: pacote avulso, e NUNCA expira. Foi pago; expirar gera revolta,
 *     chamado de suporte e reembolso — custa mais do que o crédito vale.
 *
 * Gasta-se primeiro a franquia. Assim o crédito que expira é sempre o
 * primeiro a sair, e ninguém perde o que pagou.
 */
function saldo(conta) {
  const franquia = Math.max(0, Number(conta.franquiaRestante) || 0);
  const comprado = Math.max(0, Number(conta.creditosComprados) || 0);
  return { franquia, comprado, total: franquia + comprado };
}

/*
 * Debita `n` créditos. Devolve de onde saiu, para o extrato poder mostrar, ou
 * null quando não há saldo — e aí quem chama NÃO gera nada, em vez de gerar e
 * ficar devendo.
 */
function debitar(conta, n) {
  const quanto = Math.max(0, Math.floor(Number(n) || 0));
  const s = saldo(conta);
  if (quanto === 0) return { daFranquia: 0, doComprado: 0 };
  if (s.total < quanto) return null;

  const daFranquia = Math.min(s.franquia, quanto);
  const doComprado = quanto - daFranquia;
  return { daFranquia, doComprado };
}

/*
 * A resposta quando o saldo acabou. Não é só um erro: é a tela que o cliente
 * vê, e ela precisa dizer, na primeira linha, que a operação dele continua
 * de pé. Foi para isso que este arquivo existe.
 */
function semSaldo(precisa, tem) {
  return {
    erro: 'creditos_insuficientes',
    precisa,
    tem,
    titulo: 'Seus créditos acabaram',
    mensagem: 'Suas telas continuam no ar, e o editor continua inteiro. '
      + 'O que precisa de crédito é gerar imagem nova.',
    saidas: ['comprar-pacote', 'mudar-plano', 'usar-biblioteca'],
  };
}

/*
 * Teto de segurança do texto livre: não é preço, é proteção contra laço
 * infinito no cliente. Uma conta que estoure isto num dia está com defeito,
 * não com pressa.
 */
const TETO_TEXTO_DIA = 400;
const TETO_TEXTO_HORA = 80;

/*
 * Quanto a franquia repõe no começo do ciclo. Fica aqui, e não no plans.js,
 * porque depende do número de telas ATIVAS no dia da virada — e é o servidor
 * que sabe isso.
 */
function franquiaDoCiclo(plans, planId, telas) {
  return plans.franquiaCreditos(planId, telas);
}

module.exports = {
  OPERACOES, CUSTO_IMAGEM_CENTAVOS, CUSTO_TEXTO_CENTAVOS,
  TETO_TEXTO_DIA, TETO_TEXTO_HORA,
  operacao, custaCredito, creditosDe, saldo, debitar, semSaldo, franquiaDoCiclo,
};
