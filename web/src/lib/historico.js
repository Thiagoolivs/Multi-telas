/*
 * historico.js — desfazer e refazer.
 *
 * O editor tinha um botão de lixeira e nenhuma volta. Um clique errado depois
 * de vinte minutos de trabalho apagava os vinte minutos, e a única saída era
 * fechar sem salvar — que joga fora o resto junto.
 *
 * A pilha guarda o DOCUMENTO inteiro a cada passo (fundo, elementos, formato,
 * duração). Copiar o documento parece caro e não é: uma peça tem dezenas de
 * elementos, não milhares, e a alternativa — guardar a operação inversa de cada
 * ação — erra em silêncio no dia em que alguém esquece de escrever a inversa de
 * uma ação nova.
 *
 * O ponto delicado é o ARRASTO. Mover um elemento dispara dezenas de
 * atualizações por segundo; se cada uma virasse um passo, um Ctrl+Z andaria
 * meio pixel e a pilha estouraria em segundos. Por isso `aplicar` aceita uma
 * etiqueta de fusão: passos seguidos com a mesma etiqueta viram um só, e o
 * arrasto inteiro desfaz de uma vez.
 */

const LIMITE = 80;   // passos guardados; acima disso o mais antigo cai fora

export function criarHistorico(inicial) {
  return { passos: [inicial], i: 0, etiqueta: null };
}

export function agora(h) { return h.passos[h.i]; }
export function podeDesfazer(h) { return h.i > 0; }
export function podeRefazer(h) { return h.i < h.passos.length - 1; }

/*
 * Empilha um estado novo.
 *
 * `etiqueta` funde este passo com o anterior quando as duas são iguais e não
 * nulas — é o que transforma um arrasto inteiro num único desfazer. Use uma
 * etiqueta que identifique a INTERAÇÃO, não a ação: 'mover:e3' funde o arrasto
 * de um elemento e não se mistura com o do vizinho.
 */
export function empilhar(h, estado, etiqueta) {
  if (estado === agora(h)) return h;                 // nada mudou de fato

  const fundir = etiqueta != null && etiqueta === h.etiqueta && h.i >= 0;
  if (fundir) {
    const passos = h.passos.slice(0, h.i + 1);
    passos[h.i] = estado;
    return { passos, i: h.i, etiqueta };
  }

  // Empilhar depois de desfazer descarta o futuro — é o comportamento que
  // todo editor tem e que todo mundo espera.
  const passos = h.passos.slice(0, h.i + 1);
  passos.push(estado);
  const excesso = Math.max(0, passos.length - LIMITE);
  return { passos: passos.slice(excesso), i: passos.length - 1 - excesso, etiqueta: etiqueta || null };
}

export function desfazer(h) {
  if (!podeDesfazer(h)) return h;
  // Zera a etiqueta: depois de desfazer, a próxima edição começa passo novo
  // em vez de se fundir com o que sobrou.
  return { passos: h.passos, i: h.i - 1, etiqueta: null };
}

export function refazer(h) {
  if (!podeRefazer(h)) return h;
  return { passos: h.passos, i: h.i + 1, etiqueta: null };
}

/*
 * Fecha o passo atual sem mexer no conteúdo: a próxima edição, mesmo com a
 * mesma etiqueta, começa um passo novo. É o que se chama ao soltar o mouse.
 */
export function selar(h) {
  return h.etiqueta == null ? h : { passos: h.passos, i: h.i, etiqueta: null };
}
