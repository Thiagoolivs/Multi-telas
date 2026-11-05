/*
 * server/plans.js — catálogo de planos (fonte única da verdade).
 *
 * A cobrança é POR TELA, por mês. É como o cliente pensa ("tenho quatro
 * telas") e é como a receita acompanha o crescimento dele sem renegociação.
 * A versão anterior cobrava por faixa — Pro até 5 telas, Business até 25 —,
 * e R$ 499 para 25 telas dão R$ 20 por tela, abaixo de qualquer concorrente
 * de signage no Brasil. Não estava barato: estava errado.
 *
 * O preço e a cota de armazenamento são POR TELA. A IA não é mais: o teto
 * de criações é POR CONTA (PLANO §6.5), porque quem tem cinco telas não cria
 * cinco vezes mais — repete o mesmo conteúdo nelas.
 *
 * Os números são os do PLANO §6 (EXECUTOR, item 11). docs/BILLING.md traz a
 * conta aberta da versão anterior.
 *
 * Preços em centavos de BRL.
 */

const { CUSTO_IMAGEM_CENTAVOS } = require('./creditos');
const Perfil = require('../js/perfil.js');

/*
 * PREÇO POR FRENTE (QA de lançamento, 03/11 — decisão do dono).
 *
 * R$ 149 por tela era o topo do mercado PME no Brasil e o mesmo número para
 * a padaria de uma TV e para a indústria com o RH comprando por proposta
 * (docs/qa/regras-de-negocio-e-mercado.md, §1.3 e §2). Agora cada frente
 * tem o seu preço por TV no Essencial: Comércio R$ 79, Saúde R$ 139,
 * Empresas R$ 159. Sem mínimo por conta.
 *
 * A frente é a da CONTA (tenants.perfil, ou deduzida como em
 * server/paleta.js perfilDaConta). Sem frente — a landing geral, um teste
 * antigo — vale a de Comércio, que é também a mais barata.
 *
 * Cada conta vê só o preço da sua frente: o catálogo é montado por frente
 * (catalog(frente)) e nunca traz as três lado a lado.
 */
const PRECO_DA_FRENTE_CENTS = { comercio: 7900, saude: 13900, empresa: 15900 };
const FRENTE_PADRAO = 'comercio';
const FRENTES = Object.keys(PRECO_DA_FRENTE_CENTS);
// O id ('empresa') ou o endereço da landing ('empresas'); o resto vira Comércio.
function frenteDe(f) {
  const v = String(f || '').trim().toLowerCase();
  if (Perfil.tem(v)) return v;
  const doSlug = Perfil.doSlug(v);
  return doSlug ? doSlug.id : FRENTE_PADRAO;
}

const PLANS = {
  free: {
    id: 'free', name: 'Grátis',
    precoTelaCents: 0, telasMax: 1,
    gbPorTela: 0.5,             // e as criações do teste, ver CRIACOES_DO_TESTE
    blurb: 'Para experimentar em uma tela.',
    recursos: ['player', 'editor', 'agendamento', 'datas'],
    stripePrice: null,
  },
  pro: {
    /*
     * D22: o plano pago de hoje se chama ESSENCIAL — a IA básica (a franquia
     * de criações, os textos, o ajuste da peça, o quiz) com as telas e peças
     * prontas. O id continua 'pro': as assinaturas no Asaas guardam
     * "conta|pro" e a cortesia e o webhook usam esse id. Trocar o id seria
     * migrar dinheiro; trocar o nome não é.
     *
     * 'pro' = Essencial (id histórico, não renomear: Asaas e cortesias).
     */
    id: 'pro', name: 'Essencial',
    /*
     * O preço do MENSAL, sem contrato, da frente PADRÃO (Comércio). Cada
     * frente tem o seu (PRECO_DA_FRENTE_CENTS): quem precisa do preço de uma
     * conta pede planoDaFrente/mensalidadeCents com a frente. O anual sai das
     * faixas, na mesma proporção.
     */
    precoTelaCents: PRECO_DA_FRENTE_CENTS[FRENTE_PADRAO], telasMax: 49,
    gbPorTela: 10,
    blurb: 'IA com a sua marca, telas e peças prontas, relatório de exibição, mural, som e equipe.',
    /*
     * Só o que EXISTE. 'sso' e 'marca-branca' já estiveram no Enterprise e a
     * landing os anunciava sem nenhuma linha de código por trás — vender
     * recurso que não existe é problema de CDC, não de roadmap. 'relatorio'
     * saiu pelo mesmo motivo e voltou quando o relatório de exibição passou
     * a existir (server/routes/relatorio.js).
     */
    recursos: ['player', 'editor', 'agendamento', 'datas', 'ia', 'mural', 'som', 'marca', 'equipe', 'relatorio'],
    stripePrice: process.env.STRIPE_PRICE_PRO || null,
  },
  /*
   * D22: o PRO é a IA integrada em tudo (decisão do dono: R$ 179 por tela),
   * e só pode ser vendido quando existir — "nada vendido antes de existir".
   * Até a Fase 3 (programação inteligente) ele aparece como EM BREVE: o
   * painel e a landing mostram o que vem, e o checkout recusa. Ninguém tem
   * este plano; quando ele abrir, sai o `emBreve` e entra o preço no anual.
   */
  integrada: {
    id: 'integrada', name: 'Pro',
    /*
     * Era R$ 179 contra R$ 149 do Essencial. Com o preço por frente, o Pro
     * mantém a MESMA proporção sobre o Essencial de cada frente (×179/149,
     * em reais inteiros): Comércio R$ 95, Saúde R$ 167, Empresas R$ 191.
     * Aqui, o da frente padrão; ver planoDaFrente.
     */
    precoTelaCents: 9500, telasMax: 49,
    proporcaoDoEssencial: 17900 / 14900,
    gbPorTela: 10,
    blurb: 'IA integrada em tudo: a programação se monta sozinha, com o calendário da empresa.',
    recursos: ['player', 'editor', 'agendamento', 'datas', 'ia', 'mural', 'som', 'marca', 'equipe', 'relatorio', 'ia-integrada'],
    emBreve: true,
    vem: [
      'Programação inteligente: prioridade, validade e TVs em cada peça',
      'O calendário da empresa em texto vira conteúdo e cronograma prontos',
      'IA em todo lugar, com mais criações por tela',
    ],
    stripePrice: null,
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
    gbPorTela: 25,
    blurb: 'Contrato, SLA e o que mais a operação precisar.',
    recursos: ['player', 'editor', 'agendamento', 'datas', 'ia', 'mural', 'som', 'marca', 'equipe', 'relatorio'],
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
const ORDER = ['free', 'pro', 'integrada', 'enterprise'];

/*
 * MENSAL E ANUAL (PLANO §6.1).
 *
 * Mensal: o preço da frente por tela, sem contrato e SEM desconto por
 * volume. Anual (contrato de 12 meses, pago mês a mês): o preço cai por
 * FAIXA, e o desconto por volume mora só aqui — é ele que puxa o cliente
 * para o contrato.
 *
 * Por faixa, como imposto de renda: só as telas DAQUELA faixa pagam o preço
 * dela. Cinco telas no anual = 3 × faixa1 + 2 × faixa2. A primeira versão
 * do desconto (no mensal) aplicava a faixa a TODAS as telas, e o teste pegou
 * vinte telas custando menos que dezenove — o cliente teria vantagem em
 * desligar uma. Por faixa, cada tela a mais custa sempre um valor positivo.
 *
 * Da 26ª em diante o preço é NEGOCIADO, com piso. Até alguém negociar, a
 * conta segue o preço da faixa anterior: é o que sai sem conversa, e nunca
 * abaixo do piso.
 *
 * FAIXAS_ANUAL é a tabela de REFERÊNCIA, escrita sobre os R$ 149 de antes
 * (120/108/96, piso 90). QA de lançamento, 03/11: com o preço por frente,
 * cada frente aplica a MESMA razão ao seu mensal e arredonda para reais
 * inteiros — Comércio (R$ 79): 64/57/51, piso 48; Saúde (R$ 139):
 * 112/101/90, piso 84; Empresas (R$ 159): 128/115/102, piso 96.
 */
const CONTRATOS = ['mensal', 'anual'];
const REFERENCIA_CENTS = 14900;
const FAIXAS_ANUAL = [
  { ate: 3, precoTelaCents: 12000 },
  { ate: 10, precoTelaCents: 10800 },
  { ate: 25, precoTelaCents: 9600 },
  { ate: Infinity, precoTelaCents: 9600, negociado: true },
];
const PISO_NEGOCIADO_CENTS = 9000;
const MESES_DO_CONTRATO = 12;

const contratoDe = (c) => (c === 'anual' ? 'anual' : 'mensal');
const telasDe = (telas) => Math.max(1, Math.floor(Number(telas) || 1));
const emReais = (cents) => Math.round(cents / 100) * 100;
// A mesma razão da referência, sobre o mensal da frente, em reais inteiros.
const naProporcao = (refCents, mensalCents) => emReais(mensalCents * refCents / REFERENCIA_CENTS);

function plan(id) { return PLANS[id] || PLANS.free; }

/*
 * O preço por tela do MENSAL deste plano nesta frente (null sem tabela;
 * 0 no grátis).
 */
function precoMensalCents(planId, frente) {
  const p = plan(planId);
  if (p.precoTelaCents == null || !p.precoTelaCents) return p.precoTelaCents;
  const essencial = PRECO_DA_FRENTE_CENTS[frenteDe(frente)];
  if (p.id === 'pro') return essencial;
  if (p.proporcaoDoEssencial) return emReais(essencial * p.proporcaoDoEssencial);
  return p.precoTelaCents;
}

/* As faixas do anual deste plano nesta frente (cada uma em reais inteiros). */
function faixasDe(planId, frente) {
  const mensal = precoMensalCents(planId, frente);
  return FAIXAS_ANUAL.map((f) => ({ ...f, precoTelaCents: naProporcao(f.precoTelaCents, mensal) }));
}
function pisoNegociadoCents(frente) {
  return naProporcao(PISO_NEGOCIADO_CENTS, precoMensalCents('pro', frente));
}

/* O plano como a conta daquela frente o vê: o mesmo objeto, com o preço dela. */
function planoDaFrente(id, frente) {
  const p = plan(id);
  const preco = precoMensalCents(p.id, frente);
  return preco === p.precoTelaCents ? p : { ...p, precoTelaCents: preco };
}

/*
 * Quanto custa a conta com N telas, por mês, em centavos. Enterprise não tem
 * tabela (null). O anual só existe para quem tem preço de tabela.
 */
function mensalidadeCents(planId, telas, contrato, frente) {
  const mensal = precoMensalCents(planId, frente);
  if (mensal == null) return null;
  const n = telasDe(telas);
  if (!mensal || contratoDe(contrato) === 'mensal') return mensal * n;

  let total = 0;
  let cobradas = 0;
  for (const f of faixasDe(planId, frente)) {
    if (cobradas >= n) break;
    const cabem = Math.min(n, f.ate) - cobradas;
    if (cabem <= 0) continue;
    total += f.precoTelaCents * cabem;
    cobradas += cabem;
  }
  return total;
}

/* Quanto custa ACRESCENTAR a próxima tela — o número que a pessoa quer ver
   antes de parear mais uma. */
function precoProximaTelaCents(planId, telasAtuais, contrato, frente) {
  if (precoMensalCents(planId, frente) == null) return null;
  const n = Math.max(0, Math.floor(Number(telasAtuais) || 0));
  return mensalidadeCents(planId, n + 1, contrato, frente) - (n === 0 ? 0 : mensalidadeCents(planId, n, contrato, frente));
}

/* Preço médio por tela com N telas — para a vitrine mostrar "sai por X cada". */
function precoTelaCents(planId, telas, contrato, frente) {
  if (precoMensalCents(planId, frente) == null) return null;
  const n = telasDe(telas);
  return Math.round(mensalidadeCents(planId, n, contrato, frente) / n);
}

/* A partir de quantas telas o anual passa a ser negociado (26). */
const TELAS_NEGOCIADAS = FAIXAS_ANUAL[FAIXAS_ANUAL.length - 2].ate + 1;

/*
 * MULTA DE CANCELAMENTO DO ANUAL (PLANO §6.3).
 *
 * Era o MAIOR entre (a) 30% das mensalidades que faltam e (b) o desconto do
 * anual devolvido [(mensal − anual) × meses usados] + visita + aparelho. A
 * parte (b) CRESCIA com o tempo de uso: 5 telas pagavam R$ 1.382 no 4º mês,
 * R$ 1.859 no 11º e R$ 2.028 com o contrato cumprido (issue #135). QA de
 * lançamento, 03/11 (decisão do dono): multa que cresce perto do fim é
 * desproporcional (CDC art. 51) e cobrar de quem cumpriu os 12 meses não
 * tem base.
 *
 * Agora: 30% das mensalidades que FALTAM, e só isso. Cai mês a mês e é zero
 * com os 12 meses cumpridos. A visita de retirada (R$ 150) e o aparelho
 * nosso não devolvido (R$ 210 cada) não são multa: são custo, e vêm à parte
 * (`custosCents`), só quando existem.
 *
 * Pura: quem cobra decide depois. A cobrança automática da multa ainda não
 * existe: o cancelamento registra o valor num evento da conta
 * ('plano.multa.<centavos>') para o operador cobrar.
 */
const MULTA = { fracaoDoQueFalta: 0.3, visitaRetiradaCents: 15000, aparelhoCents: 21000 };
function multaCancelamentoCents(o) {
  const x = o || {};
  const n = telasDe(x.telas);
  const usados = Math.max(0, Math.min(MESES_DO_CONTRATO, Math.floor(Number(x.mesesUsados) || 0)));
  const faltam = MESES_DO_CONTRATO - usados;
  const anual = mensalidadeCents('pro', n, 'anual', x.frente);
  const cents = Math.round(MULTA.fracaoDoQueFalta * anual * faltam);
  const aparelhos = Math.max(0, Math.floor(Number(x.aparelhosNaoDevolvidos) || 0));
  const custosCents = (x.visitaRetirada ? MULTA.visitaRetiradaCents : 0) + aparelhos * MULTA.aparelhoCents;
  // `a` fica pelo nome antigo (a parte "30% do que falta"), que o painel do operador lê.
  return { cents, a: cents, faltam, custosCents };
}

function screenLimit(id) { return plan(id).telasMax; }
function isPaid(id) { const p = plan(id); return p.precoTelaCents > 0 || p.sobConsulta === true; }
// Plano que ainda não existe de verdade (D22): aparece, não se assina.
function assinavel(id) { const p = PLANS[id]; return !!p && p.precoTelaCents > 0 && !p.emBreve; }
function temRecurso(id, recurso) { return plan(id).recursos.indexOf(recurso) >= 0; }

/*
 * Cota de armazenamento da conta: por tela, somada. Cinco telas no Pro dão
 * 50 GB no total, e não 10 GB isolados por tela — cota isolada obrigaria o
 * cliente a fazer contabilidade de qual arquivo mora em qual tela.
 */
function cotaBytes(planId, telas) {
  return Math.round(plan(planId).gbPorTela * telasDe(telas) * 1024 * 1024 * 1024);
}

/*
 * TETO DE IA, POR CONTA (PLANO §6.5): R$ 30 por mês até 3 telas, + R$ 3 por
 * tela a mais, nunca acima de R$ 80. Em criações (uma criação = uma imagem
 * gerada, ~R$ 0,35 — server/creditos.js): 85 até 3 telas, ~8 por tela a
 * mais, 228 no máximo.
 *
 * Era por tela (25 cada), e quem tem cinco telas não cria cinco vezes mais:
 * repete o mesmo conteúdo nelas. Acabou o teto, a conta segue com as peças
 * prontas, o banco de imagens e o upload — nunca bloqueia a tela.
 */
const TETO_IA = { baseCents: 3000, ateTelas: 3, porTelaCents: 300, maxCents: 8000 };
function tetoIaCents(telas) {
  const n = telasDe(telas);
  return Math.min(TETO_IA.maxCents, TETO_IA.baseCents + TETO_IA.porTelaCents * Math.max(0, n - TETO_IA.ateTelas));
}

/* Criações por mês do plano. O grátis não tem: tem as do teste. */
function franquiaCreditos(planId, telas) {
  if (!isPaid(planId)) return 0;
  return Math.floor(tetoIaCents(telas) / CUSTO_IMAGEM_CENTAVOS);
}

/*
 * As criações do TESTE de 14 dias (PLANO §6.4): o bastante para impressionar
 * (20 ≈ R$ 7 de custo, que é custo de aquisição). Valem só durante o teste —
 * depois dele, a tela segue com o selo e sem IA (server/uso-ia.js).
 */
const CRIACOES_DO_TESTE = 20;

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

/*
 * Quando o teste desta conta termina. O operador pode ESTENDER (EXECUTOR item
 * 13, "estender teste"): `teste_ate` só vale se for depois do prazo normal —
 * estender nunca encurta.
 */
function fimDoTeste(tenant) {
  const nasceu = Number(tenant && tenant.created_at) || 0;
  const normal = nasceu ? nasceu + MS_DO_TESTE : 0;
  return Math.max(normal, Number(tenant && tenant.teste_ate) || 0);
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

/* ---------------- Pagamento atrasado ----------------
 *
 * Atraso tinha zero consequência: o webhook marcava `past_due` e nada olhava
 * para isso. A franquia de IA renovava todo mês e o pareamento seguia aberto.
 *
 * A régua (PLANO §6.6), contada do primeiro aviso de atraso:
 *
 *   3 dias   AVISO: e-mail ao dono (server/lembretes.js). O painel já avisa
 *            desde o primeiro dia.
 *   10 dias  SELO: as TVs mostram a marca do MultiTelas num canto discreto.
 *   20 dias  SUSPENSÃO da IA e de telas novas. Só isso.
 *
 * NUNCA TELA PRETA: nada aqui apaga parede de cliente. Pagou, tudo volta na
 * hora.
 *
 * `atraso_desde` é gravado no PRIMEIRO aviso de atraso (server/cobranca.js).
 * Conta marcada `past_due` antes desta regra existir não tem a data e não é
 * bloqueada: sem saber desde quando, cortar seria chutar.
 */
const ATRASO = { avisoDias: 3, seloDias: 10, suspensaoDias: 20 };
// A carência é até a suspensão: o nome antigo continua, com o número novo.
const CARENCIA_ATRASO_DIAS = ATRASO.suspensaoDias;
const MS_DIA = 24 * 60 * 60 * 1000;

/* Situação do atraso da conta, ou null se ela está em dia. */
function situacaoAtraso(tenant, agora) {
  if (!tenant || tenant.plan_status !== 'past_due') return null;
  // Só existe atraso de quem assinou: a fatura vencida de um checkout
  // abandonado não é dívida de quem nunca teve plano pago.
  if (!isPaid(tenant.plan || 'free')) return null;
  const desde = Number(tenant.atraso_desde) || 0;
  if (!desde) return null;
  const t = agora || Date.now();
  const marco = (dias) => desde + dias * MS_DIA;
  const faltam = (dias) => Math.max(0, Math.ceil((marco(dias) - t) / MS_DIA));
  return {
    desde,
    diasEmAtraso: Math.max(0, Math.floor((t - desde) / MS_DIA)),
    aviso: t >= marco(ATRASO.avisoDias),
    selo: t >= marco(ATRASO.seloDias),
    seloEm: marco(ATRASO.seloDias),
    diasAteSelo: faltam(ATRASO.seloDias),
    bloqueiaEm: marco(ATRASO.suspensaoDias),
    bloqueado: t >= marco(ATRASO.suspensaoDias),
    diasAteBloquear: faltam(ATRASO.suspensaoDias),
    dias: CARENCIA_ATRASO_DIAS,
  };
}

/* O atraso já chegou à suspensão? Devolve a situação, ou null. */
function bloqueioPorAtraso(tenant, agora) {
  const s = situacaoAtraso(tenant, agora);
  return s && s.bloqueado ? s : null;
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
    const atraso = bloqueioPorAtraso(tenant, agora);
    if (atraso) return { ok: false, motivo: 'atraso', dias: atraso.dias };
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

/*
 * O selo no canto da TV — o TEXTO dele, ou '' sem selo.
 *
 * Teste acabado sem assinatura: "MultiTelas · versão gratuita". Decisão do
 * dono do produto: a tela NÃO apaga — continua exibindo e publicando, com uma
 * marca discreta num canto.
 *
 * Fatura com 10 dias de atraso (PLANO §6.6): só "MultiTelas". "Versão
 * gratuita" seria mentira para quem paga, e o selo não expõe a loja para o
 * cliente dela — quem precisa saber do atraso é o dono, e o painel diz.
 *
 * Plano em dia (inclusive cortesia, que é Pro de verdade) nunca tem selo.
 */
const SELO = { teste: 'MultiTelas · versão gratuita', atraso: 'MultiTelas' };
function textoDoSelo(tenant, agora) {
  if (!tenant) return '';
  if (isPaid(tenant.plan || 'free')) {
    const s = situacaoAtraso(tenant, agora);
    return s && s.selo ? SELO.atraso : '';
  }
  return testeAtivo(tenant, agora) ? '' : SELO.teste;
}
function exibeSelo(tenant, agora) { return !!textoDoSelo(tenant, agora); }

/* ---------------- Cancelamento no fim do período pago ----------------
 *
 * QA de lançamento, 03/11 (decisão do dono): o painel, a landing e os Termos
 * prometem "suas telas continuam no ar até o fim do período já pago", e o
 * código rebaixava NA HORA — quem pagou o mês perdia a IA, o relatório e as
 * telas extras no dia do cancelamento.
 *
 * Agora o cancelamento (pelo painel, simulado, ou o SUBSCRIPTION_DELETED do
 * Asaas) só AGENDA: a conta fica no plano pago com o status 'cancelando' e
 * `plan_renews_at` = o fim do período pago. Passada a data, uma varredura
 * (server/cobranca.js, varrerCancelamentos) e a leitura do plano no painel
 * rebaixam para o grátis.
 */
const CANCELANDO = 'cancelando';
function cancelamentoVenceu(tenant, agora) {
  if (!tenant || tenant.plan_status !== CANCELANDO || !isPaid(tenant.plan || 'free')) return false;
  const fim = Number(tenant.plan_renews_at) || 0;
  return !fim || fim <= (agora || Date.now());
}

/*
 * QUANTAS TVs ficam no ar (null = todas). QA de lançamento, 03/11 (decisão
 * do dono): depois de cair para o grátis — cancelou, estornou, o teste
 * acabou — ou com a fatura atrasada além da suspensão (20 dias), só UMA TV
 * segue no ar, com o selo; as outras mostram "Esta TV está pausada". Antes
 * o grátis ficava com todas as TVs que a conta tinha pareado enquanto pagava
 * (assina um mês, pareia vinte, cancela: vinte TVs grátis para sempre).
 *
 * Nada é apagado e nada some do painel: reativando, as TVs voltam sozinhas
 * no pulso seguinte. Qual fica no ar: a mais antiga (server.js,
 * estadoDaConta), que é estável e é a que o cliente ligou primeiro.
 */
const PAUSA = { telasNoAr: 1, texto: 'Esta TV está pausada: reative o plano em app.multitelas.net.br' };
function telasNoAr(tenant, agora) {
  if (!tenant) return null;
  if (isPaid(tenant.plan || 'free')) {
    if (cancelamentoVenceu(tenant, agora)) return PAUSA.telasNoAr;
    return bloqueioPorAtraso(tenant, agora) ? PAUSA.telasNoAr : null;
  }
  return Math.min(PAUSA.telasNoAr, screenLimit('free'));
}

// Catálogo público (para o painel e a landing), na ordem de exibição, com o
// preço da frente pedida — uma frente por vez, nunca as três lado a lado.
function catalog(frente) { return ORDER.map((id) => planoDaFrente(id, frente)); }

/*
 * O menor preço por TV entre as frentes (o mensal, sem contrato): a landing
 * geral diz "a partir de", sem pôr as três tabelas lado a lado.
 */
function apartirDeCents() { return Math.min(...FRENTES.map((f) => precoMensalCents('pro', f))); }

/*
 * O que o painel e a landing precisam para mostrar o anual: as faixas, em
 * números prontos (a mesma conta não é escrita duas vezes).
 */
function faixasAnual(frente) {
  let de = 1;
  return faixasDe('pro', frente).map((f) => {
    const linha = { de, ate: f.ate === Infinity ? null : f.ate, precoTelaCents: f.precoTelaCents, negociado: !!f.negociado };
    de = f.ate + 1;
    return linha;
  });
}

module.exports = {
  PLANS, ORDER, CONTRATOS, FAIXAS_ANUAL, PISO_NEGOCIADO_CENTS, TELAS_NEGOCIADAS, MESES_DO_CONTRATO, MULTA, assinavel,
  PRECO_DA_FRENTE_CENTS, FRENTE_PADRAO, FRENTES, frenteDe, precoMensalCents, planoDaFrente, pisoNegociadoCents, apartirDeCents,
  TETO_IA, CRIACOES_DO_TESTE, ATRASO, SELO,
  DIAS_DE_TESTE, fimDoTeste, diasDeTesteRestantes, testeAtivo, podeParear,
  CARENCIA_ATRASO_DIAS, situacaoAtraso, bloqueioPorAtraso, textoDoSelo, exibeSelo,
  CANCELANDO, cancelamentoVenceu, PAUSA, telasNoAr,
  plan, catalog, faixasAnual, contratoDe, screenLimit, isPaid, temRecurso,
  mensalidadeCents, precoTelaCents, precoProximaTelaCents, multaCancelamentoCents,
  cotaBytes, tetoIaCents, franquiaCreditos,
};
