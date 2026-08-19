/*
 * A bandeja: o que ficou pronto e ainda não foi guardado.
 *
 * Existe por causa de um defeito concreto do aviso de "sua imagem ficou
 * pronta". O aviso vive no shell e atravessa a navegação — de propósito, é
 * para isso que ele serve. Mas o botão dele mandava a peça para um `useState`
 * de "Meus Designs", e quem clicasse estando em Marca ou em Telas caía num
 * componente DESMONTADO: o clique não fazia absolutamente nada, e o resultado
 * de um trabalho já cobrado ficava inalcançável.
 *
 * Aqui o que está pendente mora fora de qualquer página. O aviso deposita na
 * bandeja e manda navegar; a página pega o que houver, tanto ao montar quanto
 * enquanto já está montada.
 *
 * Cabe UMA coisa de propósito. Duas peças esperando ao mesmo tempo abririam
 * dois diálogos por cima um do outro, e a pessoa não saberia qual está
 * respondendo.
 */

let esperando = null;
const ouvintes = new Set();

function avisar() {
  ouvintes.forEach((f) => f(esperando));
}

export function guardar(coisa) {
  esperando = coisa;
  avisar();
}

/*
 * Chamada na inscrição com o que já estiver lá — é isso que faz funcionar
 * quando a página só monta DEPOIS do depósito (o caso de quem estava noutra
 * tela quando a IA terminou).
 */
export function inscrever(fn) {
  ouvintes.add(fn);
  fn(esperando);
  return () => ouvintes.delete(fn);
}

export function limpar() {
  if (esperando === null) return;
  esperando = null;
  avisar();
}

export function espiar() {
  return esperando;
}
