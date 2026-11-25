/*
 * MARCAR POR LISTA (reteste 4, 22/11): a galeria do operador
 * (components/platform/ConteudoPronto.jsx) recebe a lista recomendada de
 * docs/qa-total/galeria-para-aprovar/ colada como texto. Aceita "tela:id",
 * "peca:id" ou o id solto (procurado nas telas e depois nas peças),
 * separados por espaço, vírgula, ponto e vírgula ou linha. Devolve as chaves
 * achadas ("tela:id") e o que não existe no manifesto, para dizer à pessoa.
 */
export function idsDaLista(texto, m) {
  const telas = new Set(((m && m.telas) || []).map((t) => t.id));
  const pecas = new Set(((m && m.pecas) || []).map((p) => p.id));
  const achados = [];
  const sobras = [];
  for (const bruto of String(texto || '').split(/[\s,;]+/).filter(Boolean)) {
    const [a, b] = bruto.includes(':') ? bruto.split(':') : ['', bruto];
    const tipo = a === 'tela' || a === 'peca' ? a : telas.has(b) ? 'tela' : pecas.has(b) ? 'peca' : '';
    if (tipo && (tipo === 'tela' ? telas : pecas).has(b)) achados.push(tipo + ':' + b);
    else sobras.push(bruto);
  }
  return { achados: [...new Set(achados)], sobras };
}
