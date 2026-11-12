/*
 * js/peca-conferir.js — a peça cabe? (PLANO §4.8, a régua: "nada pode sair da
 * peça nem ficar por cima de outro texto").
 *
 * UM detector para todo lugar que olha uma peça desenhada: a bancada (onde
 * nasceu), o editor de textos do painel e a revisão da campanha. Se cada um
 * medisse do seu jeito, a bancada aprovaria o que o painel acusa.
 *
 * Mede a peça já montada por js/peca-render.js, num contêiner do TAMANHO REAL
 * da TV — reduzida, ela cairia em outro layout (@container).
 *
 * Módulo duplo: no Node exporta as partes puras, para teste; no navegador,
 * `MTPecaConferir.conferir(host)`.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPecaConferir = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /*
   * Texto em cima de texto: a chamada do cabeçalho em pé passava por baixo
   * da hora ("DOBR04:12") e nada saía da peça — a medida de vazamento não
   * via. Conta como defeito quando um campo cobre mais de um quinto do
   * outro.
   *
   * A medida é a do TEXTO, linha por linha, e não a do elemento: um título em
   * bloco ocupa a largura toda da coluna, e o carimbo ao lado dele seria
   * acusado sem encostar em letra nenhuma. E cada linha vale a altura da
   * LINHA, não a da fonte: com letra enorme e entrelinha justa ("R$ 14" a
   * .78) a caixa da fonte passa por cima do "Tudo por" sem a tinta encostar.
   * Imagem e campo vazio ficam com a caixa do elemento.
   */
  function linhasDoTexto(el, r, escala) {
    if (!el.textContent.trim()) return [r];
    const lh = parseFloat(getComputedStyle(el).lineHeight) * escala;
    const faixa = document.createRange();
    faixa.selectNodeContents(el);
    const linhas = [...faixa.getClientRects()].filter((x) => x.width && x.height).map((x) => {
      const meio = (x.top + x.bottom) / 2;
      const meia = lh && x.height > lh ? lh / 2 : x.height / 2;
      return { left: x.left, right: x.right, top: meio - meia, bottom: meio + meia };
    });
    return linhas.length ? linhas : [r];
  }

  /*
   * Duas linhas de texto se cobrem quando a área em comum passa de um quinto
   * da menor — OU quando uma entra na outra mais de 30% da altura da linha
   * menor, ao longo de mais de uma letra (reteste 2, 09/11). Só a área
   * deixava passar a chamada do rodapé por cima do WhatsApp: as duas linhas
   * compridas, deslocadas meia linha, cobriam 17% uma da outra, e na parede
   * era texto sobre texto. A mesma regra mora em js/peca-render.js (encaixe).
   */
  const cobre = (a, b) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    const area = (x) => (x.right - x.left) * (x.bottom - x.top);
    const linha = Math.min(a.bottom - a.top, b.bottom - b.top);
    return w > 0 && h > 0 && (w * h > Math.min(area(a), area(b)) / 5 || (h > linha * 0.3 && w > linha * 0.8));
  };

  function sobrepostos(caixas) {
    const pares = [];
    for (let i = 0; i < caixas.length; i++) {
      for (let j = i + 1; j < caixas.length; j++) {
        const a = caixas[i], b = caixas[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        if (a.linhas.some((x) => b.linhas.some((y) => cobre(x, y)))) pares.push(a.nome + ' × ' + b.nome);
      }
    }
    return pares;
  }

  /*
   * TEXTO CORTADO DENTRO DA PEÇA (reteste 2, 09/11). O que sai da peça é
   * "fora"; o que uma caixa de DENTRO dela corta passava calado: a data do
   * cabeçalho em reticências ("SEGUNDA · 9 …"), o nome da marca sem o "A"
   * ("PADARI∧ SOL") e o acento e a perna do "g" cortados pela entrelinha
   * justa com `overflow: hidden` ("COMUNICAÇAO", "VOCE"), em 13 telas
   * prontas. Nenhuma medida via: a caixa do campo continuava dentro da peça.
   *
   * Mede cada linha do texto (a caixa da FONTE, que tem o acento e a perna)
   * contra cada caixa que corta, do campo até a peça (sem ela). Passou da
   * borda dos lados: trunca. Passou em cima ou embaixo: corta a letra (ou
   * a linha que o line-clamp escondeu). Folga de 4% da letra (o
   * arredondamento e a borda da caixa).
   */
  /*
   * O campo que uma caixa de dentro da peça esconde INTEIRO saiu de
   * propósito (a lista que mostra só o que cabe numa linha, com
   * `flex-wrap` e `overflow: hidden`): não está cortado, nem sobre nada, nem
   * fora. Cortado é o que aparece pela metade. A mesma regra do piso
   * (js/peca-render.js, escondidoNaCaixa).
   */
  function escondidoNaCaixa(el, peca) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    for (let q = el.parentElement; q && q !== peca; q = q.parentElement) {
      const cs = getComputedStyle(q);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const b = q.getBoundingClientRect();
      if (r.top >= b.bottom - 1 || r.bottom <= b.top + 1 || r.left >= b.right - 1 || r.right <= b.left + 1) return true;
    }
    return false;
  }

  function cortados(sr, peca, escala) {
    const out = [];
    sr.querySelectorAll('[data-campo], [data-vivo]:not([data-vivo="mensagens"])').forEach((el) => {
      if (el.tagName === 'IMG' || el.closest('[aria-hidden="true"]') || escondidoNaCaixa(el, peca)) return;
      const nome = el.getAttribute('data-campo') || el.getAttribute('data-vivo');
      const caixas = [];
      for (let q = el; q && q !== peca; q = q.parentElement) {
        const cs = getComputedStyle(q);
        const x = cs.overflowX !== 'visible', y = cs.overflowY !== 'visible';
        if (x || y) caixas.push({ x, y, r: q.getBoundingClientRect() });
      }
      if (!caixas.length) return;
      let defeito = '';
      for (const { pai, linhas } of pedacos(el)) {
        const cs = getComputedStyle(pai);
        if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        const tol = Math.max(1, parseFloat(cs.fontSize) * escala * 0.04);
        for (const c of caixas) {
          if (c.x && linhas.some((l) => l.left < c.r.left - tol || l.right > c.r.right + tol)) { defeito = 'trunca'; break; }
          if (c.y && linhas.some((l) => l.top < c.r.top - tol || l.bottom > c.r.bottom + tol)) defeito = defeito || 'corta a letra';
        }
        if (defeito === 'trunca') break;
      }
      if (defeito) out.push(nome + ' (' + defeito + ')');
    });
    return out;
  }

  /*
   * Texto que sai da peça é o defeito que mais aparece e o que menos se vê
   * numa miniatura: um centímetro de manchete cortado na borda. Mede depois
   * que as fontes chegam e que as entradas animadas terminam (elas começam
   * deslocadas de propósito). `esperar`: quanto dar às entradas antes de
   * adiantá-las — a bancada anima; o painel desenha parado (`leve`).
   */
  async function conferir(host, opts) {
    const o = opts || {};
    if (document.fonts) await document.fonts.ready;
    if (o.esperar) await new Promise((r) => setTimeout(r, o.esperar));
    const sr = host.shadowRoot;
    const peca = sr && sr.querySelector('.mt-peca');
    if (!peca) return { fora: [], juntos: [], cortados: [], regras: [] };
    /*
     * As entradas são ADIANTADAS até o fim antes de medir. Com a aba em
     * segundo plano o navegador não anda as animações, e o que entra pela
     * direita era medido ainda fora do lugar — e acusado como vazamento
     * (visto na primeira rodada do lote 1). As infinitas (movimento
     * contínuo, rolagem do rodapé) não terminam e ficam como estão.
     */
    (sr.getAnimations ? sr.getAnimations() : []).forEach((a) => {
      try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* segue */ }
    });
    /*
     * E o movimento de cinema também no repouso, já (js/peca-render.js,
     * coreografia): o número no valor final, as máscaras da "revelar" e a
     * luz do "reflexo" tiradas. Elas terminam pelo evento do fim da
     * animação, que só chega depois — e a medida é agora.
     */
    try { host.dispatchEvent(new CustomEvent('mt:repouso')); } catch (e) { /* segue */ }
    const p = peca.getBoundingClientRect();
    const fora = [];
    const caixas = [];
    // Campos e os vivos parados (hora, data, clima). As mensagens rolam por baixo da máscara do trilho de propósito.
    const passa = (x) => x.left < p.left - 1 || x.right > p.right + 1 || x.top < p.top - 1 || x.bottom > p.bottom + 1;
    sr.querySelectorAll('[data-campo], [data-vivo]:not([data-vivo="mensagens"])').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || escondidoNaCaixa(el, peca)) return;
      const nome = el.getAttribute('data-campo') || el.getAttribute('data-vivo');
      const linhas = linhasDoTexto(el, r, p.width / peca.offsetWidth);
      /*
       * As LINHAS do texto, não a caixa: uma palavra longa que não quebra
       * transborda a própria caixa, e a caixa continua dentro da peça (visto
       * no editor: "ANTICONSTITU…" cortado e o detector dizendo que cabia).
       * E a caixa de um número enorme é a da fonte, não a da tinta: o "10"
       * do parcelado em pé era acusado 2px acima da peça sem nada sair.
       * Campo sem texto (foto, vazio) fica com a caixa — é o que linhasDoTexto devolve.
       */
      if (linhas.some(passa)) fora.push(nome);
      // Desenho de fundo (aria-hidden) pode ficar atrás do texto de propósito.
      if (!el.closest('[aria-hidden="true"]')) caixas.push({ el, linhas, nome });
    });
    // As regras vêm de js/regras-composicao.js (carregado antes); sem ele, mede só vazamento e sobreposição.
    const R = (typeof globalThis !== 'undefined' && globalThis.MTRegras) || null;
    const papel = o.papel || papelPeloTamanho(peca.offsetWidth, peca.offsetHeight);
    const medidas = R ? medir(R, sr, peca, papel) : null;
    const saida = { fora, juntos: sobrepostos(caixas), cortados: cortados(sr, peca, p.width / peca.offsetWidth || 1), regras: medidas ? R.avaliar(medidas) : [] };
    if (o.medidas) saida.medidas = medidas;
    return saida;
  }

  /* ---------------- D44: as regras de composição na peça montada ----------------
   *
   * As regras moram em js/regras-composicao.js (o gerador recebe o texto
   * delas); aqui só se MEDE: a letra de cada pedaço de texto, a distância
   * dele até a borda, o contraste com o que está atrás e o tamanho do QR.
   */

  // Sem o papel dito, o tamanho decide: faixa baixa é cabeçalho/rodapé (as regras são as mesmas), estreita é lateral.
  function papelPeloTamanho(w, h) {
    if (h <= 220) return 'cabecalho';
    return w <= 700 ? 'lateral' : 'destaque';
  }

  /*
   * A cor de qualquer texto de CSS (rgb, color(srgb …), oklch, nome) em
   * {r,g,b,a}: um pixel pintado num canvas. Cor que o canvas não entende
   * deixa o fillStyle como estava — o sentinela diz que não era cor (a
   * forma "circle at center" de um radial, por exemplo).
   */
  let tinta = null;
  const cores = new Map();
  function lerCor(s) {
    if (cores.has(s)) return cores.get(s);
    if (!tinta) {
      const c = document.createElement('canvas');
      c.width = c.height = 1;
      tinta = c.getContext('2d', { willReadFrequently: true });
    }
    const SENTINELA = '#010203';
    tinta.fillStyle = SENTINELA;
    tinta.fillStyle = s;
    let cor = null;
    if (String(tinta.fillStyle).toLowerCase() !== SENTINELA || String(s).toLowerCase() === SENTINELA) {
      tinta.clearRect(0, 0, 1, 1);
      tinta.fillRect(0, 0, 1, 1);
      const d = tinta.getImageData(0, 0, 1, 1).data;
      cor = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    }
    cores.set(s, cor);
    return cor;
  }

  /*
   * O que fica ATRÁS de um texto num ponto: os ancestrais dele e o que vem
   * antes na árvore (a foto, o véu, o cartão), na ordem em que o navegador
   * pinta — que nas peças, todas em posição absoluta, é a ordem da árvore.
   * Foto zera o que estava por baixo dela (ela cobre a caixa toda) e marca
   * que o fundo depende da foto. O ::after de quem vem antes entra depois
   * dos filhos dele: é o véu sobre a foto da <figure>.
   */
  function atras(R, peca, alvo, x, y, estilo) {
    let camadas = [];
    let foto = false;
    const noPonto = (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    const camada = (el, cs) => {
      const r = el.getBoundingClientRect();
      let cor = lerCor(cs.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 };
      const gs = R.lerGradientes(cs.backgroundImage, lerCor);
      // A primeira imagem da lista é a de cima: pinta de trás para frente, sobre a cor de fundo.
      for (let i = gs.length - 1; i >= 0; i--) {
        if (gs[i]) cor = R.sobre(R.corNoGradiente(gs[i], r.width, r.height, (x - r.left) / r.width, (y - r.top) / r.height), cor);
      }
      const op = parseFloat(cs.opacity);
      if (op < 1) cor = Object.assign({}, cor, { a: cor.a * op });
      if (cor.a > 0.003) camadas.push(cor);
    };
    // Pseudo-elemento só conta quando cobre a caixa do dono (o véu com inset: 0); o filete do kicker, não.
    const pseudo = (el, qual) => {
      const cs = estilo(el, qual);
      if (!cs || cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') return;
      const r = el.getBoundingClientRect();
      if (parseFloat(cs.width) < el.offsetWidth * 0.9 || parseFloat(cs.height) < el.offsetHeight * 0.9) return;
      if (noPonto(r)) camada(el, cs);
    };
    const andar = (el) => {
      const cs = estilo(el);
      const r = el.getBoundingClientRect();
      const visivel = cs.visibility !== 'hidden' && cs.display !== 'none' && r.width && r.height && noPonto(r);
      if (visivel) {
        if (el.tagName === 'IMG') {
          if (!el.hasAttribute('data-sem-foto')) { camadas = []; foto = true; }
        } else {
          camada(el, cs);
          pseudo(el, '::before');
        }
      }
      if (el === alvo) return true;
      for (const filho of el.children) if (andar(filho)) return true;
      if (visivel && el.tagName !== 'IMG') pseudo(el, '::after');
      return false;
    };
    andar(peca);
    return { camadas, foto };
  }

  // Os pedaços de texto de um campo: cada nó de texto, com o elemento que dá a letra e a cor dele.
  function pedacos(el) {
    const out = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const faixa = document.createRange();
      faixa.selectNodeContents(n);
      const linhas = [...faixa.getClientRects()].filter((r) => r.width && r.height);
      if (linhas.length) out.push({ pai: n.parentElement, linhas });
    }
    return out;
  }

  function medir(R, sr, peca, papel) {
    const p = peca.getBoundingClientRect();
    const escala = p.width / peca.offsetWidth || 1;
    const rel = (r) => ({ left: (r.left - p.left) / escala, top: (r.top - p.top) / escala, right: (r.right - p.left) / escala, bottom: (r.bottom - p.top) / escala });
    // Um getComputedStyle por elemento (e por pseudo) na medição toda: a peça é pequena, os pontos são muitos.
    const guardados = new Map();
    const estilo = (el, qual) => {
      const k = qual || '';
      let m = guardados.get(el);
      if (!m) guardados.set(el, (m = {}));
      if (!(k in m)) m[k] = getComputedStyle(el, qual || null);
      return m[k];
    };
    const textos = [];
    sr.querySelectorAll('[data-campo], [data-vivo]:not([data-vivo="mensagens"])').forEach((el) => {
      // Desenho de fundo (aria-hidden) é enfeite, não texto para ler; o que uma caixa esconde inteiro saiu de propósito.
      if (el.closest('[aria-hidden="true"]') || escondidoNaCaixa(el, peca)) return;
      const nome = el.getAttribute('data-campo') || el.getAttribute('data-vivo');
      for (const { pai, linhas } of pedacos(el)) {
        const cs = estilo(pai);
        if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
        const px = parseFloat(cs.fontSize);
        const corDoTexto = lerCor(cs.color);
        // Texto pintado pelo fundo (background-clip: text) ou transparente: sem cor própria para medir.
        const semCor = !corDoTexto || corDoTexto.a < 0.1 || /rgba\(.*,\s*0\)$/.test(cs.webkitTextFillColor || '');
        let pior = null;
        let sobreFoto = false;
        if (!semCor) {
          for (const l of linhas) {
            const a = atras(R, peca, pai, (l.left + l.right) / 2, (l.top + l.bottom) / 2, estilo);
            // Sombra no texto sobre a foto é proteção de propósito: não se cobra o véu.
            if (a.foto && cs.textShadow && cs.textShadow !== 'none') { sobreFoto = true; continue; }
            sobreFoto = sobreFoto || a.foto;
            const c = R.piorContraste(corDoTexto, R.fundos(a.camadas, a.foto));
            pior = pior == null ? c : Math.min(pior, c);
          }
        }
        textos.push({ nome, px, linhas: linhas.map(rel), contraste: pior, sobreFoto });
      }
    });
    const qrs = [];
    sr.querySelectorAll('img[data-campo-qr]').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || el.hasAttribute('data-sem-foto') || estilo(el).visibility === 'hidden') return;
      qrs.push({ nome: el.getAttribute('data-campo-qr'), lado: Math.min(r.width, r.height) / escala, caixa: rel(r) });
    });
    return { papel, w: peca.offsetWidth, h: peca.offsetHeight, textos, qrs };
  }

  return { conferir, cobre, linhasDoTexto, sobrepostos, papelPeloTamanho };
});
