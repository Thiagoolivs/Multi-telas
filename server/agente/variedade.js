/*
 * server/agente/variedade.js — pedir de novo não devolve a mesma peça.
 *
 * O que já está no ar e as últimas campanhas são os NEGATIVOS: o título novo
 * não pode ser igual (nem quase igual) a nenhum deles. Com IA, eles vão no
 * pedido dos textos ("não repita: …") e, se mesmo assim repetir, o texto é
 * escrito de novo uma vez. Sem IA (testes, IA fora), cada tema tem uma lista
 * de títulos e o agente pega o primeiro que não está no ar.
 */
'use strict';

const { plano } = require('./guarda');

const palavras = (t) => plano(t).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter((p) => p.length > 2);

// Igual ou quase: as mesmas palavras (Jaccard de 0,8 ou mais), ou um contém o outro inteiro.
function parecido(a, b) {
  const x = palavras(a);
  const y = palavras(b);
  if (!x.length || !y.length) return false;
  const jx = x.join(' ');
  const jy = y.join(' ');
  if (jx === jy) return true;
  if ((jx.length >= 10 && jy.includes(jx)) || (jy.length >= 10 && jx.includes(jy))) return true;
  const sx = new Set(x);
  const sy = new Set(y);
  const inter = [...sx].filter((p) => sy.has(p)).length;
  return inter / new Set([...sx, ...sy]).size >= 0.8;
}

function repete(texto, negativos) {
  return (negativos || []).find((n) => parecido(texto, n)) || '';
}

function negativosDe(ctx) {
  const c = ctx || {};
  return [].concat(c.noAr || [], c.recentes || []).filter(Boolean).slice(0, 50);
}

/*
 * Sem IA: os títulos de cada tema, na voz de cada frente. O primeiro que não
 * repete o que está no ar é o escolhido; todos repetem, volta o primeiro e
 * o agente avisa.
 */
const TITULOS = {
  aniversariantes: ['Parabéns, aniversariantes!', 'Feliz aniversário!', 'Os aniversariantes do mês', 'Um viva aos aniversariantes'],
  cardapio: ['Cardápio da semana', 'O almoço desta semana', 'Menu da semana', 'O que tem no almoço'],
  seguranca: ['Segurança em primeiro lugar', 'Use o EPI certo', 'Cuidar de você é rotina', 'Segurança é de todos'],
  metas: ['Metas do mês', 'Rumo à meta', 'Nosso resultado do mês', 'Juntos pela meta'],
  promocao: ['Promoção da semana', 'Oferta especial', 'Aproveite hoje', 'Preço bom de verdade'],
  'boas-vindas': ['Seja bem-vindo!', 'Boas-vindas ao time', 'Que bom ter você aqui'],
  peca: [],
};

function tituloSemIA(tema, base, negativos) {
  const lista = (TITULOS[tema] || []).concat(base ? [base] : []);
  if (!lista.length) return { titulo: base || 'Confira', repetiu: false };
  const livre = lista.find((t) => !repete(t, negativos));
  return livre ? { titulo: livre, repetiu: false } : { titulo: lista[0], repetiu: true };
}

module.exports = { parecido, repete, negativosDe, tituloSemIA, TITULOS };
