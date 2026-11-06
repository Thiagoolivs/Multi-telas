/*
 * js/precos.js — a tabela de preços, lida do jeito que o dono escreve.
 *
 * O cardápio de uma padaria tem trinta itens e muda toda semana. Um modelo
 * de arte com oito linhas fixas não aguenta isso: cada item novo é duplicar
 * três elementos no editor. Aqui o dono COLA a lista — do WhatsApp, da
 * planilha, do caderno — uma linha por item, e a TV organiza.
 *
 * O que se aceita numa linha, porque é o que as pessoas escrevem:
 *   "Café expresso ; 6,00"      "Pão de queijo - R$ 4,50"
 *   "Misto quente .... 12"      "Suco natural	10,00" (tab, vindo da planilha)
 * Linha sem preço no fim vira título de seção ("BEBIDAS").
 *
 * Módulo duplo como peca.js: `require()` nos testes, `window.MTPrecos` na TV e
 * no painel — a mesma leitura nos três lugares.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPrecos = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Preço no FIM da linha: "R$ 12,00", "12,00", "12.5", "12". O que vem antes,
  // menos separadores (; : - — . tab), é o nome.
  var PRECO_NO_FIM = /^(.*?)[\s;:|\t.·…_–—-]*(R\$\s*)?(\d{1,5}(?:[.,]\d{1,2})?)\s*$/;

  function formatarPreco(bruto) {
    var n = String(bruto).replace(',', '.');
    var v = Number(n);
    if (!isFinite(v)) return 'R$ ' + bruto;
    // "12" e "12,5" viram "12,00" e "12,50": tabela com casas desiguais lê torta.
    return 'R$ ' + v.toFixed(2).replace('.', ',');
  }

  /* Texto colado → [{ tipo: 'item', nome, preco } | { tipo: 'secao', nome }] */
  function ler(texto) {
    return String(texto || '').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (linha) {
      var m = PRECO_NO_FIM.exec(linha);
      if (m && m[1].trim()) return { tipo: 'item', nome: m[1].trim(), preco: formatarPreco(m[3]) };
      return { tipo: 'secao', nome: linha.replace(/[:;\s]+$/, '') };
    });
  }

  /*
   * Colunas e corpo: o arranjo que dá a MAIOR letra.
   *
   * Limites fixos ("até 7 itens, uma coluna") erravam dos dois lados: três
   * colunas com nomes compridos saíam com letra miúda e meia tela vazia. Aqui
   * cada arranjo (1, 2 ou 3 colunas) é medido pela altura (linhas por coluna)
   * e pela largura (a linha mais comprida precisa caber na coluna), e fica o
   * que deixa a letra maior. `alturaPorLargura` é a proporção da zona: ~0,6
   * deitada, ~1,7 em pé. O corpo sai em cqh e cqw, e o CSS usa o menor dos
   * dois — então vale para o tamanho real da zona, seja ele qual for.
   */
  function medidas(linhas, cols) {
    var n = Math.max(1, linhas.length);
    var porColuna = Math.ceil(n / cols);
    var maior = linhas.reduce(function (m, l) {
      return Math.max(m, l.tipo === 'item' ? l.nome.length + l.preco.length + 2 : l.nome.length * 0.8);
    }, 8);
    var larguraColuna = (88 - 5 * (cols - 1)) / cols;
    return {
      cols: cols,
      cqh: 68 / (porColuna * 1.7),
      // Teto: três itens não viram cartaz; o título é que é o destaque.
      cqw: Math.min(5.5, larguraColuna / (maior * 0.56)),
    };
  }

  function layout(linhas, alturaPorLargura, pedido) {
    var p = Number(pedido);
    var opcoes = (p >= 1 && p <= 3) ? [p] : [1, 2, 3];
    var melhor = null;
    opcoes.forEach(function (c) {
      var m = medidas(linhas || [], c);
      m.efetivo = Math.min(m.cqh * alturaPorLargura, m.cqw);
      // Empate (5% ou menos) fica com menos colunas: lê melhor.
      if (!melhor || m.efetivo > melhor.efetivo * 1.05) melhor = m;
    });
    return melhor;
  }

  /* ---------------- Preço vindo da planilha (fase 11) ----------------
   *
   * O servidor lê a planilha (server/planilha.js) e manda os itens prontos:
   *   { item, preco (número ou null), texto ("Consulte"), secao, descricao }
   * Aqui eles viram as linhas da tabela e os campos das peças de cardápio.
   * O mesmo código na TV, no painel e no teste.
   */
  var semAcento = function (s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); };
  function daSecao(itens, secao) {
    var lista = Array.isArray(itens) ? itens.filter(function (i) { return i && i.item; }) : [];
    if (!secao) return lista;
    var alvo = semAcento(secao);
    return lista.filter(function (i) { return semAcento(i.secao) === alvo; });
  }
  // As seções na ordem em que aparecem, com os itens de cada uma.
  function secoesDe(itens) {
    var saida = [];
    daSecao(itens).forEach(function (i) {
      var nome = i.secao || '';
      var s = saida.filter(function (x) { return x.nome === nome; })[0];
      if (!s) { s = { nome: nome, itens: [] }; saida.push(s); }
      s.itens.push(i);
    });
    return saida;
  }
  function precoDoItem(i) {
    if (i && typeof i.preco === 'number' && isFinite(i.preco)) return formatarPreco(String(i.preco));
    return i && i.texto ? String(i.texto) : '';
  }
  // "16,90" → { inteiro: '16', centavos: ',90' }: as peças com o "R$" e os centavos à parte.
  function partesDoPreco(i) {
    if (!(i && typeof i.preco === 'number' && isFinite(i.preco))) return { inteiro: i && i.texto ? String(i.texto) : '', centavos: '' };
    var t = i.preco.toFixed(2).split('.');
    // O milhar com ponto, à mão: o toLocaleString de TV antiga pode não ter o pt-BR.
    return { inteiro: t[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.'), centavos: ',' + t[1] };
  }
  // Sem o "R$" (a peça já escreve): "24" quando é redondo, "24,90" quando não.
  function precoCurto(i) {
    var p = partesDoPreco(i);
    return p.centavos && p.centavos !== ',00' ? p.inteiro + p.centavos : p.inteiro;
  }

  /*
   * Os itens → as linhas da tabela de preços. A seção vira o título dela
   * (só quando a tabela mostra a planilha inteira); `secao` filtra uma só.
   */
  function daPlanilha(itens, secao) {
    var saida = [];
    var atual = null;
    daSecao(itens, secao).forEach(function (i) {
      if (!secao && i.secao && i.secao !== atual) { saida.push({ tipo: 'secao', nome: i.secao }); atual = i.secao; }
      saida.push({ tipo: 'item', nome: i.item, preco: precoDoItem(i) });
    });
    return saida;
  }
  /*
   * As linhas em texto, como a pessoa digitaria ("Café ; 6,00"): a cópia
   * guardada no item, para a TV que liga sem rede. O item com preço em
   * palavras ("Consulte") fica de fora da cópia: no texto ele viraria um
   * título de seção.
   */
  function textoDaPlanilha(itens, secao) {
    return daPlanilha(itens, secao).filter(function (l) { return l.tipo === 'secao' || /\d/.test(l.preco); }).map(function (l) {
      return l.tipo === 'secao' ? l.nome.toUpperCase() : l.nome.replace(/;/g, ',') + ' ; ' + l.preco.replace(/^R\$\s*/, '');
    }).join('\n');
  }

  /*
   * Os itens → os campos de uma peça de cardápio (pecas-ouro/cardapio-*.html).
   * `nomes`: os campos que a peça declara. Dois desenhos:
   *   item1-nome, item1-preco, item1-centavos, item1-medida | item1-detalhe
   *     (a lista: o 1º item da planilha no item1, o 2º no item2…);
   *   grupo1, g1-item1, g1-preco1, g1-det1
   *     (por seção: a 1ª seção no grupo1, com os itens dela).
   * Devolve { campos, esconder, mostrar, vazias }: o campo sem valor some
   * (esconder), o que tem aparece (mostrar), e `vazias` são os nomes das
   * linhas sem item da planilha — a TV esconde a linha inteira (o <li>,
   * com os pontinhos e o "R$"). A peça não fica com o "Pão francês" do
   * exemplo nem com um buraco no meio.
   */
  function camposDaPeca(nomes, itens, secao) {
    var tem = {};
    (nomes || []).forEach(function (n) { tem[n] = true; });
    var campos = {};
    var esconder = [];
    var mostrar = [];
    var vazias = [];
    var por = function (nome, valor) {
      if (!tem[nome]) return;
      if (valor) { campos[nome] = String(valor); mostrar.push(nome); } else { campos[nome] = ''; esconder.push(nome); }
    };
    var lista = daSecao(itens, secao);
    for (var n = 1; n <= 30; n++) {
      var base = 'item' + n + '-';
      if (!tem[base + 'nome']) continue;
      var i = lista[n - 1];
      if (!i) vazias.push(base + 'nome');
      if (tem[base + 'centavos']) {
        var p = partesDoPreco(i);
        por(base + 'nome', i && i.item);
        por(base + 'preco', i && p.inteiro);
        por(base + 'centavos', i && p.centavos);
      } else {
        por(base + 'nome', i && i.item);
        por(base + 'preco', i && precoCurto(i));
      }
      por(base + 'medida', i && i.descricao);
      por(base + 'detalhe', i && i.descricao);
    }
    var secoes = secao ? [{ nome: secao, itens: lista }] : secoesDe(itens);
    for (var g = 1; g <= 12; g++) {
      if (!tem['grupo' + g]) continue;
      var s = secoes[g - 1];
      por('grupo' + g, s && s.nome);
      for (var k = 1; k <= 20; k++) {
        if (!tem['g' + g + '-item' + k]) continue;
        var it = s && s.itens[k - 1];
        if (!it) vazias.push('g' + g + '-item' + k);
        por('g' + g + '-item' + k, it && it.item);
        por('g' + g + '-preco' + k, it && precoCurto(it));
        por('g' + g + '-det' + k, it && it.descricao);
      }
    }
    return { campos: campos, esconder: esconder, mostrar: mostrar, vazias: vazias };
  }

  // A hora da última leitura boa, para o "Atualizado às 14:05" da TV.
  function hora(ms) {
    var d = new Date(Number(ms) || 0);
    if (!(Number(ms) > 0) || isNaN(d.getTime())) return '';
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  return {
    ler: ler, layout: layout, medidas: medidas, formatarPreco: formatarPreco,
    daPlanilha: daPlanilha, textoDaPlanilha: textoDaPlanilha, camposDaPeca: camposDaPeca, secoesDe: secoesDe, precoCurto: precoCurto, hora: hora,
  };
});
