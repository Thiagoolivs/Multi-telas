/*
 * server/plans.js — catálogo de planos (fonte única da verdade).
 *
 * A cobrança é POR TELA, por mês. É como o cliente pensa ("tenho quatro
 * telas") e é como a receita acompanha o crescimento dele sem renegociação.
 * A versão anterior cobrava por faixa — Pro até 5 telas, Business até 25 —,
 * e R$ 499 para 25 telas dão R$ 20 por tela, abaixo de qualquer concorrente
 * de signage no Brasil. Não estava barato: estava errado.
 *
 * Três números por plano importam, e os três são POR TELA: o preço, a
 * franquia mensal de crédito de IA e a cota de armazenamento. Manter os três
 * por tela é o que segura a margem estável em qualquer tamanho de conta —
 * ver docs/BILLING.md, que traz a conta aberta.
 *
 * Preços em centavos de BRL.
 */

const PLANS = {
  free: {
    id: 'free', name: 'Grátis',
    precoTelaCents: 0, telasMax: 1,
    creditosPorTela: 0,       // ganha um punhado uma vez só, ver CREDITOS_BOAS_VINDAS
    gbPorTela: 0.5,
    blurb: 'Para experimentar em uma tela.',
    recursos: ['player', 'editor', 'agendamento', 'datas'],
    stripePrice: null,
  },
  pro: {
    id: 'pro', name: 'Pro',
    precoTelaCents: 14900, telasMax: 49,
    creditosPorTela: 25,
    gbPorTela: 10,
    blurb: 'Marca própria, equipe e relatório.',
    recursos: ['player', 'editor', 'agendamento', 'datas', 'ia', 'mural', 'som', 'marca', 'equipe', 'relatorio'],
    stripePrice: process.env.STRIPE_PRICE_PRO || null,
  },
  /*
   * Enterprise não tem preço de tabela de propósito: ele é cotado pela
   * fórmula de docs/BILLING.md (piso de conta + faixa por tela + adicionais).
   * Os limites de uma conta Enterprise são gravados na própria conta, porque
   * cada contrato é um contrato.
   */
  enterprise: {
    id: 'enterprise', name: 'Enterprise',
    precoTelaCents: null, telasMax: 100000,
    creditosPorTela: 15,
    gbPorTela: 25,
    blurb: 'Contrato, SLA e o que mais a operação precisar.',
    recursos: ['player', 'editor', 'agendamento', 'datas', 'ia', 'mural', 'som', 'marca', 'equipe', 'relatorio', 'sso', 'marca-branca'],
    sobConsulta: true,
    stripePrice: null,
  },
};

/*
 * A ordem de exibição — e, por tabela, o catálogo inteiro: o painel, a
 * calculadora da landing e a simulação de preço leem daqui.
 *
 * O Essencial saiu. Dois planos pagos com a mesma lista de recursos menos
 * três itens obrigavam o cliente a comparar features para decidir, e quem
 * compara acaba adiando. Um plano pago só, com tudo, decide na hora — e o
 * grátis continua sendo a porta de entrada, que é o que trazia gente para o
 * Essencial de qualquer jeito.
 */
const ORDER = ['free', 'pro', 'enterprise'];

/*
 * Desconto por volume, POR FAIXA — como imposto de renda, e não como cupom.
 *
 * As primeiras 4 telas custam cheio, da 5ª à 9ª saem 10% mais baratas, e
 * assim por diante. Só as telas DAQUELA faixa recebem o desconto dela.
 *
 * A primeira versão aplicava o desconto da faixa a TODAS as telas, e isso
 * tinha um defeito que o teste pegou antes de virar tabela de preço: com
 * 79 reais por tela, 19 telas a −18% davam R$ 1.230 e 20 telas a −25% davam
 * R$ 1.185. Vinte telas custariam MENOS que dezenove — o cliente teria
 * vantagem em desligar uma tela, e a receita cairia quando a conta crescesse.
 *
 * Por faixa, cada tela a mais custa sempre um valor positivo, e o preço médio
 * por tela cai suavemente em vez de dar saltos.
 */
const FAIXAS = [
  { ate: 4, desconto: 0 },
  { ate: 9, desconto: 0.10 },
  { ate: 19, desconto: 0.18 },
  { ate: Infinity, desconto: 0.25 },
];

/* O desconto da faixa em que a PRÓXIMA tela cai. */
function descontoVolume(telas) {
  const n = Math.max(1, Math.floor(Number(telas) || 1));
  for (const f of FAIXAS) if (n <= f.ate) return f.desconto;
  return FAIXAS[FAIXAS.length - 1].desconto;
}

function plan(id) { return PLANS[id] || PLANS.free; }

/* Quanto custa a conta com N telas, em centavos. Enterprise não tem tabela. */
function mensalidadeCents(planId, telas) {
  const p = plan(planId);
  if (p.precoTelaCents == null) return null;
  const n = Math.max(1, Math.floor(Number(telas) || 1));

  let total = 0;
  let restam = n;
  let jaCobradas = 0;
  for (const f of FAIXAS) {
    if (restam <= 0) break;
    const cabem = Math.min(restam, f.ate - jaCobradas);
    if (cabem <= 0) continue;
    total += Math.round(p.precoTelaCents * (1 - f.desconto)) * cabem;
    jaCobradas += cabem;
    restam -= cabem;
  }
  return total;
}

/* Quanto custa ACRESCENTAR a próxima tela — o número que a pessoa quer ver
   antes de parear mais uma. */
function precoProximaTelaCents(planId, telasAtuais) {
  const p = plan(planId);
  if (p.precoTelaCents == null) return null;
  const n = Math.max(0, Math.floor(Number(telasAtuais) || 0));
  return mensalidadeCents(planId, n + 1) - (n === 0 ? 0 : mensalidadeCents(planId, n));
}

/* Preço médio por tela com N telas — para a vitrine mostrar "sai por X cada". */
function precoTelaCents(planId, telas) {
  const p = plan(planId);
  if (p.precoTelaCents == null) return null;
  const n = Math.max(1, Math.floor(Number(telas) || 1));
  return Math.round(mensalidadeCents(planId, n) / n);
}

function screenLimit(id) { return plan(id).telasMax; }
function isPaid(id) { const p = plan(id); return p.precoTelaCents > 0 || p.sobConsulta === true; }
function temRecurso(id, recurso) { return plan(id).recursos.indexOf(recurso) >= 0; }

/*
 * Cota de armazenamento da conta: por tela, somada. Cinco telas no Pro dão
 * 50 GB no total, e não 10 GB isolados por tela — cota isolada obrigaria o
 * cliente a fazer contabilidade de qual arquivo mora em qual tela.
 */
function cotaBytes(planId, telas) {
  const n = Math.max(1, Math.floor(Number(telas) || 1));
  return Math.round(plan(planId).gbPorTela * n * 1024 * 1024 * 1024);
}

/* Franquia mensal de crédito da conta, também por tela. */
function franquiaCreditos(planId, telas) {
  const n = Math.max(1, Math.floor(Number(telas) || 1));
  return plan(planId).creditosPorTela * n;
}

// Conta nova ganha um punhado para provar a IA sem cartão. É uma vez só: sem
// cartão na frente, o limite tem que ser baixo mesmo.
const CREDITOS_BOAS_VINDAS = 5;

/* ---------------- O teste de 14 dias ----------------
 *
 * O plano grátis dava UMA TELA PARA SEMPRE. Virou teste com prazo, e a
 * diferença não é de preço: é de qual pergunta o produto responde.
 *
 * "Uma tela para sempre" responde "dá para usar de graça?" — e a resposta faz
 * a conta parar no grátis. O teste com prazo responde outra: "isto funciona na
 * minha parede?". Ela só pode ser respondida com a TV ligada na recepção, e é
 * respondida sozinha em duas semanas. Quem viu funcionando decide com o que
 * viu; quem nunca ligou não tinha o que decidir.
 *
 * O prazo conta do NASCIMENTO da conta, e não do primeiro pareamento. Contar
 * do pareamento premiaria quem enrola para começar, e é justamente quem enrola
 * que nunca vai começar.
 *
 * A regra é uma só, e mora aqui: quem decide se a conta pode parear é
 * `podeParear`. Espalhar essa decisão pelo código seria garantir que um dia
 * um caminho novo esquece de perguntar.
 */
const DIAS_DE_TESTE = 14;
const MS_DO_TESTE = DIAS_DE_TESTE * 24 * 60 * 60 * 1000;

/* Quando o teste desta conta termina. */
function fimDoTeste(tenant) {
  const nasceu = Number(tenant && tenant.created_at) || 0;
  return nasceu ? nasceu + MS_DO_TESTE : 0;
}

/*
 * Quantos dias faltam — arredondando PARA CIMA, porque é assim que a pessoa
 * conta. Faltando 30 horas ela diz "tenho dois dias", não "tenho 1,25".
 */
function diasDeTesteRestantes(tenant, agora) {
  const fim = fimDoTeste(tenant);
  if (!fim) return 0;
  return Math.max(0, Math.ceil((fim - (agora || Date.now())) / (24 * 60 * 60 * 1000)));
}

function testeAtivo(tenant, agora) {
  return fimDoTeste(tenant) > (agora || Date.now());
}

/*
 * A conta pode ligar mais uma tela?
 *
 * Devolve o motivo junto, porque um "não" sem motivo obriga quem chama a
 * adivinhar o que dizer — e foi assim que mensagens de erro passaram a mentir
 * em outros produtos ("limite atingido" quando o caso era teste vencido).
 */
function podeParear(tenant, telasEmUso, agora) {
  const id = (tenant && tenant.plan) || 'free';
  const limite = screenLimit(id);
  const usadas = Math.max(0, Number(telasEmUso) || 0);

  if (isPaid(id)) {
    if (usadas >= limite) return { ok: false, motivo: 'limite', limite };
    return { ok: true };
  }

  // Plano grátis: é o período de teste.
  if (!testeAtivo(tenant, agora)) {
    return { ok: false, motivo: 'teste_vencido', dias: DIAS_DE_TESTE };
  }
  if (usadas >= limite) return { ok: false, motivo: 'limite', limite };
  return { ok: true, dias: diasDeTesteRestantes(tenant, agora) };
}

// Catálogo público (para o painel), na ordem de exibição.
function catalog() { return ORDER.map((id) => PLANS[id]); }

module.exports = {
  PLANS, ORDER, FAIXAS, CREDITOS_BOAS_VINDAS,
  DIAS_DE_TESTE, fimDoTeste, diasDeTesteRestantes, testeAtivo, podeParear,
  plan, catalog, screenLimit, isPaid, temRecurso,
  descontoVolume, mensalidadeCents, precoTelaCents, precoProximaTelaCents, cotaBytes, franquiaCreditos,
};
