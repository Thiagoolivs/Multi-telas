/*
 * server/agente/orquestrador.js — o laço do agente: planejar → agir →
 * observar → conferir → corrigir.
 *
 * Antes (server/assistente.js) era UMA chamada que escolhia UMA ferramenta,
 * e o resultado dela nunca voltava para a IA: o "faz um aviso e um quiz"
 * fazia o aviso e prometia o quiz. Aqui o cérebro (server/agente/cerebro.js)
 * chama uma ferramenta, lê o que ela devolveu e decide o próximo passo, até
 * terminar (perguntar, apresentar o plano, responder) ou bater num teto:
 *
 *   passos     LIMITES.passos (8): cada passo é uma chamada do cérebro;
 *   tempo      LIMITES.prazoMs: passou, para (e quem chamou cai para o fluxo de antes);
 *   gasto      LIMITES.orcamentoPlanoCentavos: o texto desta fala, medido
 *              pelo caderno de server/motores.js;
 *   tarefas    até LIMITES.tarefas por fala; cada uma refeita no máximo uma vez.
 *
 * As tarefas de "planejar" rodam nos especialistas em paralelo (até
 * LIMITES.emParalelo de uma vez), cada um com o seu pedaço.
 */
'use strict';

const { LIMITES, gastoAteAgora } = require('./limites');
const D = require('./decompor');
const G = require('./guarda');
const S = require('./subagentes');
const { NOMES, FINAIS } = require('./cerebro');

async function emParalelo(lista, n, fn) {
  const saida = new Array(lista.length);
  let i = 0;
  const trabalhador = async () => { while (i < lista.length) { const k = i++; saida[k] = await fn(lista[k], k); } };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, trabalhador));
  return saida;
}

// Um resumo curto do que entrou e saiu de cada passo, para o registro do operador (sem texto longo).
function resumir(v, n) {
  try { const s = JSON.stringify(v); return s.length > (n || 400) ? s.slice(0, n || 400) + '…' : s; } catch (e) { return ''; }
}

/*
 * O que uma tarefa NÃO pode ser, conferido antes do especialista (sem gastar
 * nada): fora do escopo, privacidade, a regra da lei no próprio pedido. A
 * tarefa barrada vira um item de recusa no plano, e as outras seguem.
 */
function barrar(t, ctx) {
  const fora = G.foraDoEscopo(t.pedido);
  if (fora) return { regra: 'fora:' + fora.motivo, texto: fora.resposta };
  const priv = G.privacidade(t.pedido, ctx.perfil);
  if (priv) return { regra: 'privacidade:' + priv.motivo, texto: priv.resposta };
  const lei = G.conteudoDoPedido(t.pedido, ctx.perfil, [ctx.empresa, ctx.segmento].join(' '));
  if (lei) return { regra: lei.motivo, texto: lei.resposta, sugestao: lei.sugestao };
  return null;
}

/*
 * Roda o laço. `env`: { cerebro, ctx, sub (o que os especialistas precisam:
 * mensagens, escopo, decisoes, campanha), inicio, gasto0, tarefasAntes }.
 * Devolve o estado: itens, passos, o fim (a ferramenta que terminou) e por
 * que parou, se parou antes.
 */
async function rodar(env) {
  const { cerebro, ctx } = env;
  const inicio = env.inicio || Date.now();
  const gasto0 = env.gasto0 != null ? env.gasto0 : gastoAteAgora();
  const estado = { turnos: [], itens: [], planejado: false, replanos: 0, refeitas: new Set(), passos: [], fim: null, parou: '' };
  const maxPassos = LIMITES.passos();
  const prazo = inicio + LIMITES.prazoMs();
  const orcamento = LIMITES.orcamentoPlanoCentavos();

  for (let n = 1; n <= maxPassos; n++) {
    if (env.cancelado && env.cancelado()) { estado.parou = 'cancelado'; break; }
    if (Date.now() > prazo) { estado.parou = 'prazo'; break; }
    if (gastoAteAgora() - gasto0 > orcamento) { estado.parou = 'orcamento'; break; }
    const t0 = Date.now();
    const chamada = await cerebro.proximo(estado);
    if (!chamada || !chamada.nome) {
      estado.passos.push({ n, ferramenta: '', resultado: 'o cérebro não chamou ferramenta', ms: Date.now() - t0 });
      estado.parou = 'sem-ferramenta';
      break;
    }
    let resultado;
    let fim = null;
    if (!NOMES.includes(chamada.nome)) {
      // Ferramenta que não existe (ou que não é do plano, como publicar): recusada, e o laço segue.
      resultado = { erro: 'ferramenta desconhecida: "' + String(chamada.nome).slice(0, 40) + '". As que existem: ' + NOMES.join(', ') + '.' };
    } else if (FINAIS.includes(chamada.nome)) {
      fim = { nome: chamada.nome, args: chamada.args || {} };
      resultado = { ok: true };
    } else {
      resultado = await agir(chamada, estado, env);
    }
    estado.passos.push({ n, ferramenta: chamada.nome, args: resumir(chamada.args, 300), resultado: resumir(resultado, 500), ms: Date.now() - t0 });
    if (fim) { estado.fim = fim; break; }
    cerebro.devolver(estado, chamada, resultado);
    if (n === maxPassos) estado.parou = 'passos';
  }
  estado.gasto = Math.round((gastoAteAgora() - gasto0) * 1000) / 1000;
  estado.ms = Date.now() - inicio;
  return estado;
}

// As ferramentas que agem (as que terminam a volta são lidas por quem chamou).
async function agir(chamada, estado, env) {
  const ctx = env.ctx;
  const a = chamada.args || {};
  if (chamada.nome === 'ler_conta') {
    if (a.parte === 'no_ar') return { no_ar: (ctx.telas || []).map((t) => ({ tv: t.nome, textos: (t.noAr || []).slice(0, 10) })) };
    if (a.parte === 'recentes') return { recentes: ctx.recentes || [] };
    if (a.parte === 'aniversariantes') return { aniversariantes: ctx.aniversariantes || [], nota: (ctx.aniversariantes || []).length ? 'da planilha da empresa' : 'a empresa não importou a lista' };
    if (a.parte === 'tvs') return { tvs: (ctx.telas || []).map((t) => ({ nome: t.nome, grupo: t.grupo || '', zonas: t.zonas || [], em_pe: !!t.emPe })) };
    return { erro: 'parte desconhecida' };
  }
  if (chamada.nome === 'planejar') {
    if (estado.planejado && estado.replanos >= 1) return { erro: 'o plano já foi feito duas vezes: corrija uma tarefa com refazer_tarefa, pergunte ou apresente' };
    if (estado.planejado) estado.replanos++;
    const cruas = Array.isArray(a.tarefas) ? a.tarefas : [];
    const conferidas = cruas.slice(0, LIMITES.tarefas)
      .map((t) => D.conferirTarefa(Object.assign({}, t, { pedido: G.semInjecao(t && t.pedido) }), ctx, env.opcoesDaRegra))
      .filter(Boolean)
      .map((t, i) => Object.assign(t, (env.respostasPorTarefa && env.respostasPorTarefa[i]) || {}));
    if (!conferidas.length) return { erro: 'nenhuma tarefa válida: cada tarefa precisa de tipo e pedido' };
    estado.planejado = true;
    estado.sobra = cruas.length > LIMITES.tarefas ? cruas.slice(LIMITES.tarefas).map((t) => G.corta(t && t.pedido, 80)) : [];
    estado.tarefas = conferidas;
    estado.itens = await emParalelo(conferidas, LIMITES.emParalelo, (t, i) => {
      const b = barrar(t, ctx);
      if (b) return Promise.resolve({ indice: i, tipo: t.tipo, pedido: t.pedido, alvo: t.alvo, onde: D.nomeDoAlvo(t.alvo, ctx), recusa: b, problemas: [b], avisos: [] });
      return S.rodar(t, i, ctx, env.sub);
    });
    return { itens: estado.itens.map((it) => (it.recusa ? { indice: it.indice, tipo: it.tipo, recusado: it.recusa.texto } : S.resumoParaIA(it))), sobra: estado.sobra };
  }
  if (chamada.nome === 'refazer_tarefa') {
    const i = Math.round(Number(a.indice));
    const item = estado.itens[i];
    if (!item) return { erro: 'não há tarefa ' + a.indice };
    if (estado.refeitas.has(i)) return { erro: 'a tarefa ' + i + ' já foi refeita uma vez: pergunte ou apresente como está' };
    estado.refeitas.add(i);
    const pedido = G.semInjecao(a.pedido) || item.pedido;
    const t = Object.assign({}, estado.tarefas ? estado.tarefas[i] : { tipo: item.tipo, alvo: item.alvo }, { pedido, respostas: item.respostas || [] });
    const b = barrar(t, ctx);
    estado.itens[i] = b ? Object.assign({}, item, { recusa: b, problemas: [b] }) : await S.rodar(t, i, ctx, env.sub);
    return { item: estado.itens[i].recusa ? { indice: i, recusado: b.texto } : S.resumoParaIA(estado.itens[i]) };
  }
  return { erro: 'ferramenta sem ação' };
}

module.exports = { rodar, agir, barrar, emParalelo, resumir };
