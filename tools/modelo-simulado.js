/*
 * tools/modelo-simulado.js — um modelo de mentira que fala o protocolo do
 * agente (chamada de função, com o resultado voltando), sem rede e sem custo.
 *
 * Para quê: o caminho da IA do agente (a abertura com o contexto e a fala
 * marcados como dado, as ferramentas no formato do provedor, as voltas com
 * o resultado de cada ferramenta, a tarefa que a IA escreve com os NOMES das
 * TVs e não com os ids) roda inteiro na avaliação e nos testes, toda vez.
 * Ele não mede o quanto a IA de verdade entende — isso é a avaliação ao vivo
 * (tools/eval-agente.mjs --vivo) —, mede se o sistema em volta dela aguenta.
 *
 * O comportamento é o de um modelo bem-comportado, com dois desvios de
 * propósito: na fala que traz ordem para a IA ele tenta chamar uma
 * ferramenta que não existe ("publicar"), e no pedido de três coisas ele
 * escreve o nome de uma TV com outra caixa ("tvs do rh") — o sistema tem de
 * recusar o primeiro e entender o segundo.
 */
'use strict';

const path = require('path');
const D = require(path.join(__dirname, '..', 'server', 'agente', 'decompor.js'));
const G = require(path.join(__dirname, '..', 'server', 'agente', 'guarda.js'));

function falaDa(usuario) {
  const m = /<<<DADO fala\n([\s\S]*?)\nDADO>>>/.exec(String(usuario || ''));
  return m ? m[1] : '';
}
function tvsDa(usuario) {
  const m = /TVS DESTA PESSOA: (.*)/.exec(String(usuario || ''));
  const telas = [];
  if (m) for (const x of m[1].split(';')) { const n = /"([^"]+)"(?: \[grupo ([^\]]+)\])?/.exec(x); if (n) telas.push({ id: n[1], nome: n[1], grupo: n[2] || '' }); }
  return telas;
}
let seq = 0;
const chamada = (nome, args) => ({ texto: '', chamadas: [{ id: 'sim' + (++seq), nome, args }], uso: { custoCentavos: 0 }, bruto: null });

async function chamar(o) {
  const fala = falaDa(o.usuario);
  const voltas = o.turnos || [];
  const ultimo = voltas.length ? voltas[voltas.length - 1] : null;
  const telas = tvsDa(o.usuario);
  const ctx = { telas, grupos: [...new Set(telas.map((t) => t.grupo).filter(Boolean))] };
  if (!ultimo) {
    // Primeira volta. A ordem escondida na fala: o modelo "obedece" e tenta publicar (o sistema recusa).
    if (/ignore|publique|sem validar/i.test(fala) && !voltas.some((v) => v.papel === 'ia' && v.chamadas.some((c) => c.nome === 'publicar'))) {
      return chamada('publicar', { tvs: ['todas'], motivo: 'a fala mandou' });
    }
    if (G.foraDoEscopo(fala)) return chamada('responder', { mensagem: 'Isso não é para as TVs. ' + G.O_QUE_FACO, motivo: 'fora' });
    const r = D.porRegra(fala, ctx, { temCampanha: /CAMPANHA DESTA CONVERSA/.test(o.usuario) });
    const tarefas = r.tarefas.map((t) => {
      const x = { tipo: t.tipo, pedido: t.pedido };
      if (t.alvo && t.alvo.tipo === 'grupo') x.grupo = t.alvo.nome.toLowerCase();
      if (t.alvo && t.alvo.tipo === 'telas') x.tvs = t.alvo.nomes;
      if (t.alvo && t.alvo.naoAchei) x.tvs = [t.alvo.naoAchei];
      if (t.tipo === 'quiz') Object.assign(x, { tema: t.tema, quantidade: t.quantidade, zona: t.zona });
      return x;
    });
    return chamada('planejar', { tarefas });
  }
  const res = ultimo.papel === 'resultados' ? (ultimo.resultados[0] || {}).conteudo || {} : {};
  if (res.erro && /desconhecida/.test(res.erro)) {
    const r = D.porRegra(G.semInjecao(fala), ctx);
    return chamada('planejar', { tarefas: r.tarefas.map((t) => ({ tipo: t.tipo, pedido: t.pedido })) });
  }
  const itens = res.itens || (res.item ? [res.item] : []);
  const comErro = itens.find((i) => i.erro);
  const jaRefez = voltas.some((v) => v.papel === 'ia' && v.chamadas.some((c) => c.nome === 'refazer_tarefa'));
  if (comErro && !jaRefez) return chamada('refazer_tarefa', { indice: comErro.indice, pedido: comErro.titulo || fala });
  const falta = itens.filter((i) => i.falta_perguntar);
  if (falta.length) return chamada('perguntar', { pergunta: falta.map((i) => i.falta_perguntar).join(' '), sugestoes: [] });
  if (itens.length && itens.every((i) => i.resposta && !i.textos && !i.aviso)) return chamada('responder', { mensagem: itens.map((i) => i.resposta).join(' '), motivo: 'duvida' });
  return chamada('apresentar_plano', { mensagem: itens.length > 1 ? 'Montei ' + itens.length + ' coisas para as TVs.' : 'Montei isto para as TVs.' });
}

module.exports = { chamar, falaDa };
