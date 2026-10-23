/*
 * server/esboco.js — SÓ GERA COM O ESBOÇO APROVADO (EXECUTOR D42).
 *
 * O dono: "só pode gerar depois que os wireframes forem aprovados". O esboço
 * é a planta da TV (EsbocoDaTela, D13) com o que vai em cada parte, as redes,
 * os horários e as fotos — o escopo inteiro, desenhado. Aprovar grava a
 * CHAVE do escopo aprovado na conversa; o gerador só roda se a chave do que
 * ele vai gerar for a mesma. Mudou qualquer coisa depois (na conversa ou no
 * cartão), a chave muda e é preciso aprovar de novo.
 */
const crypto = require('crypto');
const E = require('../js/escopo.js');

// A chave do esboço: o escopo normalizado, inteiro. Igual = é o que foi aprovado.
function chave(escopo) {
  return crypto.createHash('sha256').update(JSON.stringify(E.normalizar(escopo))).digest('hex').slice(0, 32);
}

// O esboço que a conversa guarda vale para ESTE escopo? (null quando não há, ou mudou.)
function valeParaEste(esboco, escopo) {
  return !!(esboco && esboco.chave && esboco.chave === chave(escopo));
}

// O que fica na conversa ao aprovar.
function aprovar(escopo, agora) {
  return { chave: chave(escopo), em: agora || Date.now() };
}

/*
 * Na edição (D50) o "esboço" é a lista do que vai mudar: só as mudanças que
 * GERAM (redesenhar a peça, foto nova, peça nova) esperam o "pode fazer".
 * Trocar um texto, tirar uma peça, ligar uma rede e o letreiro são diretos.
 */
const QUE_GERAM = ['refazer', 'acrescentar'];
const geraAlgo = (mudancas) => (Array.isArray(mudancas) ? mudancas : []).some((m) => m && QUE_GERAM.includes(m.tipo));

// "pode fazer", "sim", "ok, pode" — a resposta ao "Posso?" da edição.
function confirmou(texto) {
  const t = String(texto || '').toLowerCase().replace(/\s+/g, ' ').trim();
  // Pergunta ou pedido novo ("pode trocar a cor?") não é o "pode".
  if (/\?\s*$/.test(t) || /\b(n[aã]o|espera|deixa como est|cancela)\b/.test(t)) return false;
  if (/^pode( fazer| sim| ser| mandar| seguir)?[.! ]*$/.test(t)) return true;
  return /^(sim|ok|isso|manda|fechado|beleza|bora|faz|fa[cç]a)\b/.test(t);
}
function recusou(texto) {
  return /^(n[aã]o|deixa como est|cancela|melhor n[aã]o|espera)\b/.test(String(texto || '').toLowerCase().trim());
}

/*
 * O esboço da IMAGEM de Meus Designs (D42b, proposta do consultor): o que
 * gasta criação só sai aprovado. O esboço é a descrição, o formato e o
 * estilo — a pessoa vê o quadro no formato com "foto: <descrição>" e aprova.
 */
const limpa = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
function chaveDaImagem({ prompt, formato, estilo } = {}) {
  return crypto.createHash('sha256').update(JSON.stringify([limpa(prompt).slice(0, 1000), limpa(formato) || '16/9', limpa(estilo)])).digest('hex').slice(0, 32);
}

module.exports = { chave, valeParaEste, aprovar, geraAlgo, confirmou, recusou, chaveDaImagem, QUE_GERAM };
