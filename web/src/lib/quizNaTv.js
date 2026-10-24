/*
 * O QUIZ DO ASSISTENTE NA TV (24/10).
 *
 * O Criar monta o quiz ("quiz de 3 perguntas sobre café na lateral") e a
 * pessoa confere as perguntas antes. Aqui ele entra na zona pedida, como um
 * item de quiz da playlist, marcado com `_quiz`: pôr o mesmo quiz de novo
 * troca o de antes, e o resto da zona fica. Sem lateral na TV, vai para a
 * principal — e quem chama avisa.
 */
import { aplicarConteudo } from './aplicarConteudo.js';
import { zonasPorPapel } from './rodar.js';

// O item da playlist: as perguntas já conferidas por quem pôs (a TV só mostra as conferidas).
export function itemDoQuiz(quiz) {
  const tempo = Number(quiz.tempo) || 10;
  const revelar = Number(quiz.revelar) || 7;
  const perguntas = (quiz.perguntas || []).map((p) => ({ ...p, revisada: true }));
  return { type: 'quiz', titulo: quiz.titulo || 'Quiz', tempo, revelar, perguntas, duracao: Math.max(4, perguntas.length * (tempo + revelar)) };
}

// A zona onde o quiz entra nesta TV: a pedida, ou a principal se a TV não tem a pedida.
export function zonaDoQuiz(cfg, zona) {
  const z = zonasPorPapel(cfg);
  const id = z[zona] || z.principal || z.lateral;
  return { id, caiu: !!id && id !== z[zona] };
}

// A config nova da TV com o quiz. Não modifica a recebida.
export function aplicarQuiz(cfg, quiz, zona, id) {
  const { id: zonaId } = zonaDoQuiz(cfg, zona);
  if (!zonaId) return cfg;
  return aplicarConteudo(cfg, { [zonaId]: [itemDoQuiz(quiz)] }, { chave: '_quiz', valor: id }, 'trocar');
}
