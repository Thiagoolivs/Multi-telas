/*
 * Os textos de uma arte do editor livre, para o formulário simples
 * (components/content/TextosDaArte.jsx, fase 10): quais são, em que ordem,
 * com que nome, e a arte com um deles trocado.
 */

// Os textos da arte, de cima para baixo (e da esquerda para a direita na mesma altura).
export function textosDaArte(item) {
  return ((item && item.elementos) || [])
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e && e.tipo === 'texto')
    .sort((a, b) => (Number(a.e.y) || 0) - (Number(b.e.y) || 0) || (Number(a.e.x) || 0) - (Number(b.e.x) || 0));
}

/*
 * O nome de cada campo pelo papel do texto: número com vírgula ou "R$" é o
 * preço; o maior é o título; curto e em maiúsculas é a chamada; o resto,
 * texto. Nomes repetidos ganham número ("Texto 2").
 */
export function rotulosDaArte(item) {
  const lista = textosDaArte(item);
  const maior = lista.reduce((m, x) => ((Number(x.e.tamanho) || 0) > (Number((m && m.e.tamanho)) || 0) ? x : m), null);
  const contagem = {};
  return lista.map((x) => {
    const t = String(x.e.text || '');
    const nome = /R\$\s?\d|\d+,\d{2}\b/.test(t) ? 'Preço' : x === maior ? 'Título' : t.length <= 28 && t === t.toUpperCase() && /[A-ZÀ-Ú]/.test(t) ? 'Chamada' : 'Texto';
    contagem[nome] = (contagem[nome] || 0) + 1;
    return { indice: x.i, nome, n: contagem[nome], texto: t, longo: t.length > 40 || /\n/.test(t) };
  }).map((r, _, todos) => ({ ...r, rotulo: todos.filter((o) => o.nome === r.nome).length > 1 ? r.nome + ' ' + r.n : r.nome }));
}

// A arte com o texto `indice` trocado.
export function comTexto(item, indice, texto) {
  const elementos = (item.elementos || []).map((e, i) => (i === indice ? { ...e, text: texto } : e));
  return { ...item, elementos };
}
