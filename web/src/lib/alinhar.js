/*
 * alinhar.js — encaixe, guias, alinhamento e distribuição.
 *
 * É o que separa "editor de caixinhas" de editor de verdade. Sem encaixe,
 * centralizar um título é um jogo de paciência com o mouse e o resultado fica
 * meio pixel torto — que numa TV de 55 polegadas é um centímetro torto.
 *
 * Todas as medidas aqui são em PORCENTO da peça, como o resto da composição:
 * x, y, w, h de 0 a 100. Assim a conta não depende do zoom nem do tamanho da
 * tela do editor, e o mesmo número vai para o player.
 */

// Quão perto precisa chegar para grudar, em % da peça. 1,2% de 1920px são
// ~23px no palco cheio — perto o bastante para parecer intencional, longe o
// bastante para não brigar com quem quer posicionar à mão.
export const TOLERANCIA = 1.2;

/* Bordas e centro de um elemento. */
export function limites(e) {
  const x = Number(e.x) || 0, y = Number(e.y) || 0;
  const w = Number(e.w) || 0, h = Number(e.h) || 0;
  return { esq: x, dir: x + w, cx: x + w / 2, topo: y, base: y + h, cy: y + h / 2, w, h };
}

/* Caixa que envolve vários elementos. */
export function envolvente(els) {
  if (!els.length) return null;
  let esq = Infinity, topo = Infinity, dir = -Infinity, base = -Infinity;
  for (const e of els) {
    const l = limites(e);
    if (l.esq < esq) esq = l.esq;
    if (l.topo < topo) topo = l.topo;
    if (l.dir > dir) dir = l.dir;
    if (l.base > base) base = l.base;
  }
  return { esq, topo, dir, base, cx: (esq + dir) / 2, cy: (topo + base) / 2, w: dir - esq, h: base - topo };
}

/*
 * Onde vale grudar: as bordas e o centro da peça, mais as bordas e o centro de
 * cada elemento que NÃO está sendo movido.
 *
 * Um elemento arrastado não pode se alinhar consigo mesmo — se pudesse, ele
 * grudaria na própria posição e nunca sairia do lugar.
 */
export function ancoras(outros) {
  const x = [{ v: 0, tipo: 'palco' }, { v: 50, tipo: 'palco' }, { v: 100, tipo: 'palco' }];
  const y = [{ v: 0, tipo: 'palco' }, { v: 50, tipo: 'palco' }, { v: 100, tipo: 'palco' }];
  for (const e of outros) {
    const l = limites(e);
    x.push({ v: l.esq, tipo: 'elemento' }, { v: l.cx, tipo: 'elemento' }, { v: l.dir, tipo: 'elemento' });
    y.push({ v: l.topo, tipo: 'elemento' }, { v: l.cy, tipo: 'elemento' }, { v: l.base, tipo: 'elemento' });
  }
  return { x, y };
}

/*
 * Encaixa uma caixa que está sendo movida.
 *
 * Testa as três linhas de cada eixo (início, meio, fim) contra todas as
 * âncoras e escolhe o menor deslocamento. Devolve a posição corrigida e as
 * guias a desenhar — o feedback visual não é enfeite: sem a linha aparecendo,
 * a pessoa não entende por que o elemento "pulou".
 */
export function encaixar(caixa, outros, tolerancia) {
  const tol = tolerancia != null ? tolerancia : TOLERANCIA;
  const a = ancoras(outros);
  const l = limites(caixa);

  const eixo = (linhas, lista) => {
    let melhor = null;
    for (const linha of linhas) {
      for (const anc of lista) {
        const d = anc.v - linha.pos;
        const dist = Math.abs(d);
        if (dist > tol) continue;
        if (!melhor || dist < melhor.dist) melhor = { desloc: d, dist, guia: anc.v };
      }
    }
    return melhor;
  };

  const emX = eixo(
    [{ pos: l.esq }, { pos: l.cx }, { pos: l.dir }],
    a.x,
  );
  const emY = eixo(
    [{ pos: l.topo }, { pos: l.cy }, { pos: l.base }],
    a.y,
  );

  return {
    x: l.esq + (emX ? emX.desloc : 0),
    y: l.topo + (emY ? emY.desloc : 0),
    guias: {
      x: emX ? emX.guia : null,
      y: emY ? emY.guia : null,
    },
  };
}

/*
 * Encaixa uma caixa que está sendo REDIMENSIONADA.
 *
 * É um problema diferente de arrastar, e por isso não dava para reaproveitar o
 * `encaixar` acima. Ao arrastar, a caixa inteira se desloca e as quatro bordas
 * andam juntas. Ao redimensionar, só as bordas que a alça puxa se movem — as
 * outras duas estão ancoradas e não podem sair do lugar, senão o elemento
 * "escorrega" enquanto cresce, que é exatamente a sensação de não saber para
 * que lado ele está indo.
 *
 * `direcao` é o par que o Moveable entrega: [-1, 0, 1] em cada eixo, dizendo
 * qual borda a pessoa pegou. [1, 1] é a alça de baixo à direita; [-1, 0] é a
 * do meio da esquerda.
 *
 * Sem isto, redimensionar era a única operação do editor sem encaixe nenhum:
 * dava para arrastar um título e ele grudava no vizinho, mas ao esticá-lo até
 * a mesma linha ele passava reto — nada indicava onde parar.
 */
export function encaixarRedimensionamento(caixa, outros, direcao, tolerancia) {
  const tol = tolerancia != null ? tolerancia : TOLERANCIA;
  const a = ancoras(outros);
  const l = limites(caixa);
  const [dx, dy] = direcao || [0, 0];

  // A borda móvel de um eixo, grudada na âncora mais próxima. Devolve o
  // deslocamento a aplicar e a linha a desenhar.
  const maisPerto = (pos, lista) => {
    let melhor = null;
    for (const anc of lista) {
      const dist = Math.abs(anc.v - pos);
      if (dist > tol) continue;
      if (!melhor || dist < melhor.dist) melhor = { desloc: anc.v - pos, dist, guia: anc.v };
    }
    return melhor;
  };

  let { esq, topo, w, h } = { esq: l.esq, topo: l.topo, w: l.w, h: l.h };
  const guias = { x: null, y: null };

  if (dx > 0) {
    const g = maisPerto(l.dir, a.x);
    if (g) { w += g.desloc; guias.x = g.guia; }
  } else if (dx < 0) {
    const g = maisPerto(l.esq, a.x);
    if (g) { esq += g.desloc; w -= g.desloc; guias.x = g.guia; }
  }

  if (dy > 0) {
    const g = maisPerto(l.base, a.y);
    if (g) { h += g.desloc; guias.y = g.guia; }
  } else if (dy < 0) {
    const g = maisPerto(l.topo, a.y);
    if (g) { topo += g.desloc; h -= g.desloc; guias.y = g.guia; }
  }

  return { x: esq, y: topo, w, h, guias };
}

/* ---------------- Alinhar ----------------
 *
 * Com um elemento só, alinha em relação à PEÇA. Com vários, em relação à caixa
 * que envolve a seleção — que é o que a pessoa espera quando escolheu vários e
 * pediu "alinhar à esquerda": encostar um no outro, não todos na parede.
 */
export const ALINHAMENTOS = ['esq', 'centroH', 'dir', 'topo', 'centroV', 'base'];

export function alinhar(els, como) {
  if (!els.length) return els;
  const ref = els.length === 1
    ? { esq: 0, dir: 100, cx: 50, topo: 0, base: 100, cy: 50 }
    : envolvente(els);

  return els.map((e) => {
    const l = limites(e);
    switch (como) {
      case 'esq': return { ...e, x: ref.esq };
      case 'dir': return { ...e, x: ref.dir - l.w };
      case 'centroH': return { ...e, x: ref.cx - l.w / 2 };
      case 'topo': return { ...e, y: ref.topo };
      case 'base': return { ...e, y: ref.base - l.h };
      case 'centroV': return { ...e, y: ref.cy - l.h / 2 };
      default: return e;
    }
  });
}

/*
 * Distribui o espaço entre os elementos, mantendo o primeiro e o último onde
 * estão. Com menos de três não há o que distribuir — o espaço entre dois já é
 * o único que existe.
 */
export function distribuir(els, eixo) {
  if (els.length < 3) return els;
  const horizontal = eixo === 'h';
  const chave = horizontal ? 'x' : 'y';
  const tam = horizontal ? 'w' : 'h';

  const ordem = [...els].sort((a, b) => (Number(a[chave]) || 0) - (Number(b[chave]) || 0));
  const primeiro = ordem[0];
  const ultimo = ordem[ordem.length - 1];
  const inicio = Number(primeiro[chave]) || 0;
  const fim = (Number(ultimo[chave]) || 0) + (Number(ultimo[tam]) || 0);

  const somaTam = ordem.reduce((s, e) => s + (Number(e[tam]) || 0), 0);
  const folga = (fim - inicio - somaTam) / (ordem.length - 1);

  const posicoes = new Map();
  let cursor = inicio;
  for (const e of ordem) {
    posicoes.set(e, cursor);
    cursor += (Number(e[tam]) || 0) + folga;
  }
  // Devolve na ordem em que chegou, para não embaralhar a pilha de camadas.
  return els.map((e) => ({ ...e, [chave]: posicoes.get(e) }));
}
