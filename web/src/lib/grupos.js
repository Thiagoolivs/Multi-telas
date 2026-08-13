/*
 * grupos.js — vários elementos que se comportam como um.
 *
 * A DECISÃO QUE DEFINE TUDO AQUI: um grupo não é um elemento que contém
 * outros. É uma ETIQUETA (`grupo`) em cada elemento, e a lista continua plana.
 *
 * A alternativa seria aninhar — `{ tipo: 'grupo', filhos: [...] }` — e ela
 * custaria caro no lugar errado: o player, a miniatura, a prévia, a exportação
 * em PNG e o validador do servidor teriam todos de aprender a descer um nível,
 * e uma peça já publicada passaria a depender de código novo para desenhar
 * igual. Com a etiqueta, o player NÃO PRECISA SABER que grupos existem: ele
 * continua percorrendo a mesma lista plana e desenhando na mesma ordem.
 * Agrupar é conveniência de edição, e é só no editor que ela vive.
 *
 * Grupo dentro de grupo não existe de propósito. Cobre bem menos casos reais
 * do que parece, e cada nível a mais multiplica os cantos escuros de seleção,
 * ordem de camada e desfazer.
 */

let n = 0;
export function novoId() {
  n += 1;
  return 'g' + n + Math.random().toString(36).slice(2, 6);
}

export function grupoDe(els, id) {
  const e = (els || []).find((x) => x.id === id);
  return (e && e.grupo) || null;
}

export function membros(els, grupo) {
  return (els || []).filter((e) => e.grupo && e.grupo === grupo);
}

/*
 * Os ids que a seleção realmente alcança: tocar num membro é tocar no grupo
 * inteiro. É o que faz o grupo PARECER uma coisa só ao clicar.
 */
export function expandirSelecao(els, ids) {
  const alvo = new Set(ids || []);
  const grupos = new Set();
  for (const e of els || []) if (alvo.has(e.id) && e.grupo) grupos.add(e.grupo);
  if (!grupos.size) return [...alvo];
  const fora = [];
  for (const e of els || []) {
    if (alvo.has(e.id) || (e.grupo && grupos.has(e.grupo))) fora.push(e.id);
  }
  return fora;
}

export function podeAgrupar(els, ids) {
  const sel = expandirSelecao(els, ids);
  if (sel.length < 2) return false;
  // Já é exatamente um grupo inteiro e nada mais: agrupar de novo não faria nada.
  const gs = new Set(sel.map((id) => grupoDe(els, id)));
  return !(gs.size === 1 && !gs.has(null));
}

export function podeDesagrupar(els, ids) {
  return (ids || []).some((id) => !!grupoDe(els, id));
}

/*
 * Agrupar junta as camadas.
 *
 * Os membros passam a ocupar posições VIZINHAS na pilha, no lugar do que
 * estava mais à frente. Sem isso, um grupo com um elemento no fundo e outro na
 * frente teria alguém de fora no meio dele — e mandar "o grupo para trás"
 * viraria uma pergunta sem resposta certa. É também o que o Canva faz, e pelo
 * mesmo motivo.
 */
export function agrupar(els, ids) {
  const sel = new Set(expandirSelecao(els, ids));
  if (sel.size < 2) return els;
  const g = novoId();

  const dentro = [];
  const fora = [];
  for (const e of els) {
    if (sel.has(e.id)) dentro.push({ ...e, grupo: g });
    else fora.push(e);
  }
  // Posição do membro mais à frente, contada entre os que ficam de fora.
  let corte = 0;
  let vistos = 0;
  for (const e of els) {
    if (sel.has(e.id)) corte = vistos;
    else vistos += 1;
  }
  return [...fora.slice(0, corte), ...dentro, ...fora.slice(corte)];
}

/* Desagrupar tira a etiqueta e não mexe em posição nem em camada. */
export function desagrupar(els, ids) {
  const gs = new Set((ids || []).map((id) => grupoDe(els, id)).filter(Boolean));
  if (!gs.size) return els;
  return els.map((e) => {
    if (!e.grupo || !gs.has(e.grupo)) return e;
    const { grupo, ...resto } = e;
    return resto;
  });
}

/*
 * As UNIDADES de uma seleção: cada grupo conta como uma, cada solto conta como
 * uma. É o que alinhar e distribuir precisam saber.
 *
 * Sem isto, alinhar à esquerda uma seleção com um logotipo agrupado
 * empilharia as partes do logotipo umas sobre as outras — cada pedaço iria
 * para a esquerda por conta própria, e o desenho que a pessoa montou seria
 * desmontado por um botão de alinhar.
 */
export function unidades(els, ids) {
  const sel = expandirSelecao(els, ids);
  const porId = new Map(els.map((e) => [e.id, e]));
  const vistos = new Set();
  const fora = [];
  for (const id of sel) {
    const e = porId.get(id);
    if (!e || vistos.has(id)) continue;
    if (e.grupo) {
      const m = membros(els, e.grupo);
      m.forEach((x) => vistos.add(x.id));
      fora.push({ grupo: e.grupo, els: m });
    } else {
      vistos.add(id);
      fora.push({ grupo: null, els: [e] });
    }
  }
  return fora;
}

/* Caixa que envolve um conjunto de elementos, em % da peça. */
export function caixaDe(els) {
  const xs = els.map((e) => Number(e.x) || 0);
  const ys = els.map((e) => Number(e.y) || 0);
  const x2 = els.map((e) => (Number(e.x) || 0) + (Number(e.w) || 0));
  const y2 = els.map((e) => (Number(e.y) || 0) + (Number(e.h) || 0));
  const esq = Math.min(...xs);
  const topo = Math.min(...ys);
  const dir = Math.max(...x2);
  const base = Math.max(...y2);
  return { esq, topo, dir, base, w: dir - esq, h: base - topo, cx: (esq + dir) / 2, cy: (topo + base) / 2 };
}

/*
 * Nome de exibição do grupo. Não guarda nome próprio: um "Grupo (3)" que a
 * pessoa nunca batizou é mais honesto do que um nome inventado que ela vai
 * ter de decifrar depois.
 */
export function rotuloGrupo(els, grupo) {
  return 'Grupo (' + membros(els, grupo).length + ')';
}

/*
 * A lista de camadas, com cada grupo virando UMA linha. O painel desenha isto
 * de trás para frente (o topo da tela é o fim do array, que é quem desenha por
 * cima).
 */
export function linhasDeCamada(els) {
  const linhas = [];
  const vistos = new Set();
  els.forEach((e, i) => {
    if (vistos.has(e.id)) return;
    if (e.grupo) {
      const m = membros(els, e.grupo);
      m.forEach((x) => vistos.add(x.id));
      linhas.push({ tipo: 'grupo', grupo: e.grupo, els: m, indice: i, rotulo: rotuloGrupo(els, e.grupo) });
    } else {
      vistos.add(e.id);
      linhas.push({ tipo: 'el', el: e, indice: i });
    }
  });
  return linhas;
}

/*
 * Reordenar por LINHA da lista de camadas: um grupo se move inteiro, como um
 * bloco, e nunca deixa um estranho no meio dele.
 *
 * Trabalhar em linhas — e não em índices do array — é o que permite a mesma
 * função servir para arrastar um elemento solto e para arrastar um grupo de
 * quatro. Quem chama não precisa saber qual dos dois está arrastando.
 */
export function reordenarLinhas(els, de, para) {
  const linhas = linhasDeCamada(els);
  if (de === para) return els;
  if (de < 0 || para < 0 || de >= linhas.length || para >= linhas.length) return els;
  const blocos = linhas.map((l) => (l.tipo === 'grupo' ? l.els : [l.el]));
  const [bloco] = blocos.splice(de, 1);
  blocos.splice(para, 0, bloco);
  return blocos.flat();
}

/* Em que linha da pilha está um elemento (para os atalhos de camada). */
export function linhaDe(els, id) {
  return linhasDeCamada(els).findIndex((l) => (l.tipo === 'grupo' ? l.els.some((e) => e.id === id) : l.el.id === id));
}
