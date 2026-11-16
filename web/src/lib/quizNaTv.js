/*
 * O QUIZ DO ASSISTENTE NA TV (24/10).
 *
 * O Criar monta o quiz ("quiz de 3 perguntas sobre café na lateral") e a
 * pessoa confere as perguntas antes. Aqui ele entra na zona pedida, como um
 * item de quiz da playlist, marcado com `_quiz`: pôr o mesmo quiz de novo
 * troca o de antes, e o resto da zona fica. Sem lateral na TV, vai para a
 * principal — e quem chama avisa.
 */
/*
 * A regra mora em js/lote-tv.js desde o teste de carga (16/11): o servidor
 * põe o quiz em muitas TVs com a mesma (POST /api/lote/operacao, tipo 'quiz').
 */
import '../../../js/lote-tv.js';

const L = globalThis.MTLoteTv;

// O item da playlist: as perguntas já conferidas por quem pôs (a TV só mostra as conferidas).
export const itemDoQuiz = (quiz) => L.itemDoQuiz(quiz);

// A zona onde o quiz entra nesta TV: a pedida, ou a principal se a TV não tem a pedida.
export const zonaDoQuiz = (cfg, zona) => L.zonaDoQuiz(cfg, zona);

// A config nova da TV com o quiz. Não modifica a recebida.
export const aplicarQuiz = (cfg, quiz, zona, id) => L.aplicarQuiz(cfg, quiz, zona, id);
