/*
 * O "QUANDO" DO PÔR NA TV (fase 7): o fim igual de todo caminho de criar
 * pergunta onde e quando, em palavras de quem tem loja, e vira o
 * `agendamento` que o player entende (o mesmo de lib/aplicarConteudo.js).
 *
 *   sempre        → fica até alguém tirar;
 *   hoje          → sai sozinha amanhã;
 *   ate (data)    → sai sozinha no dia seguinte à data;
 *   hora (faixa)  → todo dia, só de manhã, no almoço, à tarde ou no fim do dia.
 */
import { agendarPeca, FAIXAS } from './aplicarConteudo.js';

export const QUANDOS = [
  ['sempre', 'Sempre'],
  ['hoje', 'Só hoje'],
  ['ate', 'Até um dia'],
  ['hora', 'Numa hora do dia'],
];
export const FAIXAS_DO_DIA = ['manha', 'almoco', 'tarde', 'saida'].map((id) => [id, FAIXAS[id].rotulo, FAIXAS[id].hora]);

const dia = (iso) => { const [a, m, d] = String(iso).split('-').map(Number); return new Date(a, (m || 1) - 1, d || 1); };

// Quantos dias, contando hoje, até a data (no mínimo 1).
export function diasAte(iso, hoje = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return 0;
  const zero = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.max(1, Math.round((dia(iso) - zero) / 864e5) + 1);
}

export function comQuando(item, { quando, ate, faixa } = {}) {
  if (quando === 'hoje') return agendarPeca(item, 'dia', 1);
  if (quando === 'ate') { const n = diasAte(ate); return n ? agendarPeca(item, 'dia', n) : item; }
  if (quando === 'hora') {
    // `escolhido`: foi a pessoa que pôs nesta hora; o cobrirODia (fase 5) não estica pelo resto do dia.
    const com = agendarPeca(item, FAIXAS[faixa] ? faixa : 'manha', 0);
    return { ...com, agendamento: { ...com.agendamento, escolhido: true } };
  }
  return item;
}

// A frase do botão e do aviso: "Pôr na TV: até sábado".
export function frasesDoQuando({ quando, ate, faixa } = {}) {
  if (quando === 'hoje') return 'só hoje';
  if (quando === 'ate' && ate) return 'até ' + dia(ate).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  if (quando === 'hora') return 'todo dia, ' + ((FAIXAS[faixa] || FAIXAS.manha).rotulo).toLowerCase();
  return 'sempre';
}
