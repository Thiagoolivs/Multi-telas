/*
 * server/ia-pergunta.js — OS AJUSTES CONVERSAM (EXECUTOR D51).
 *
 * O dono: "nos ajustes, ela conversar até entender o que tem que fazer". O
 * aviso rápido, o "Mudar com IA" da tela e o "Pedir à IA" da Programação
 * eram uma frase só: entendiam ou chutavam (ou diziam "não entendi" e
 * paravam). Agora, quando falta o essencial, a IA PERGUNTA — com respostas
 * prontas — e a resposta da pessoa completa o pedido de antes.
 *
 * O histórico vem do painel (as últimas falas desta mini-conversa); aqui ele
 * é limpo e limitado, e vira o pedido inteiro.
 */
const corta = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

const MAX_FALAS = 8;

// O histórico do painel, limpo: [{ papel: 'pessoa' | 'ia', texto }], as últimas.
function limparHistorico(h) {
  return (Array.isArray(h) ? h : []).filter((m) => m && (m.papel === 'pessoa' || m.papel === 'ia'))
    .map((m) => ({ papel: m.papel, texto: corta(m.texto, 300) })).filter((m) => m.texto).slice(-MAX_FALAS);
}

// O pedido inteiro: o que a pessoa disse antes nesta mini-conversa, mais a fala de agora.
function pedidoDaConversa(historico, texto, sep) {
  const ditas = limparHistorico(historico).filter((m) => m.papel === 'pessoa').map((m) => m.texto);
  return corta(ditas.concat(corta(texto, 400)).join(sep == null ? ' ' : sep), 600);
}

// Para a IA: a conversa em linhas.
function transcricao(historico, texto) {
  return limparHistorico(historico).map((m) => (m.papel === 'ia' ? 'Você' : 'Pessoa') + ': ' + m.texto)
    .concat('Pessoa: ' + corta(texto, 400)).join('\n');
}

// A pergunta que a IA devolveu, conferida (ou null).
function lerPergunta(r) {
  if (!r || typeof r !== 'object' || typeof r.pergunta !== 'string' || !r.pergunta.trim()) return null;
  return {
    pergunta: corta(r.pergunta, 200),
    sugestoes: (Array.isArray(r.sugestoes) ? r.sugestoes : []).map((s) => corta(s, 50)).filter(Boolean).slice(0, 4),
  };
}

const REGRA_DE_PERGUNTA = `
Se faltar o essencial para fazer bem (ou o pedido for ambíguo), NÃO chute:
devolva SÓ { "pergunta": "uma pergunta curta", "sugestoes": ["resposta pronta", "outra"] }
(2 a 4 sugestões curtas, na voz da pessoa). A CONVERSA abaixo mostra o que
ela já disse: junte tudo, não pergunte de novo o que ela respondeu.`;

module.exports = { limparHistorico, pedidoDaConversa, transcricao, lerPergunta, REGRA_DE_PERGUNTA, MAX_FALAS };
