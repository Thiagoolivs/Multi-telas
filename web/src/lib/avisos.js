/*
 * Central de avisos.
 *
 * Existe por causa de uma coisa concreta: gerar uma imagem com IA leva de dez
 * a sessenta segundos. Hoje isso trava um diálogo, e quem espera fica olhando
 * um botão escrito "Gerando…" sem poder fazer mais nada. Se sair da página,
 * perde o trabalho e o crédito junto.
 *
 * O aviso resolve os dois lados: o trabalho continua em segundo plano, e
 * quando termina o resultado VEM ATRÁS da pessoa, onde quer que ela esteja no
 * painel — em vez de esperar que ela volte e descubra sozinha.
 *
 * É um emissor mínimo de propósito. Um `useState` numa página não serve: o
 * aviso precisa sobreviver à navegação, e é justamente sair da página que a
 * pessoa vai querer fazer enquanto espera.
 */

let seq = 1;
let avisos = [];
const ouvintes = new Set();

function avisar() {
  const copia = avisos.slice();
  ouvintes.forEach((f) => f(copia));
}

export function inscrever(fn) {
  ouvintes.add(fn);
  fn(avisos.slice());
  return () => ouvintes.delete(fn);
}

export function listar() {
  return avisos.slice();
}

/*
 * `tom` decide a cor e, mais importante, quanto tempo fica:
 *
 *   trabalho  em andamento — fica até ser trocado ou fechado
 *   pronto    terminou bem — fica, porque quase sempre traz uma AÇÃO
 *   erro      fica, porque some antes de ser lido é o mesmo que não avisar
 *   ok        recado curto, some sozinho
 *
 * Só `ok` some sozinho. Aviso com botão que evapora em quatro segundos é pior
 * do que não ter botão: a pessoa vê que havia algo a fazer e não alcança.
 */
const SOME_SOZINHO = { ok: 4500 };

export function emitir(aviso) {
  const id = aviso.id || 'a' + (seq++);
  const item = { ...aviso, id, tom: aviso.tom || 'ok', em: Date.now() };
  const i = avisos.findIndex((a) => a.id === id);
  if (i >= 0) avisos = [...avisos.slice(0, i), item, ...avisos.slice(i + 1)];
  else avisos = [...avisos, item];
  avisar();

  const vida = SOME_SOZINHO[item.tom];
  if (vida) setTimeout(() => fechar(id), vida);
  return id;
}

export function fechar(id) {
  const antes = avisos.length;
  avisos = avisos.filter((a) => a.id !== id);
  if (avisos.length !== antes) avisar();
}

export function limpar() {
  avisos = [];
  avisar();
}

/* Atalhos, para o chamador não ter que lembrar do formato. */
export const aviso = {
  trabalho: (id, texto, detalhe) => emitir({ id, tom: 'trabalho', texto, detalhe }),
  pronto: (id, texto, detalhe, acao) => emitir({ id, tom: 'pronto', texto, detalhe, acao }),
  erro: (id, texto, detalhe) => emitir({ id, tom: 'erro', texto, detalhe }),
  ok: (texto) => emitir({ tom: 'ok', texto }),
  fechar,
};
