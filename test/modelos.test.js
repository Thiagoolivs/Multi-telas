/*
 * Peças de partida.
 *
 * O que estes testes guardam não é "o modelo existe" — é que ele CABE. Uma
 * peça de partida com texto fora da tela, ou encostado na borda onde a TV
 * corta, é pior do que a tela em branco: dá a impressão de que o produto
 * entrega arte torta, e o defeito só aparece na parede.
 */
const test = require('node:test');
const assert = require('node:assert');

const M = require('../js/modelos.js');
const P = require('../js/peca.js');
const F = require('../js/fontes.js');

const FORMATOS = ['16/9', '9/16', '1/1', '21/9'];
const CORES = ['#2f6feb', '#56ccf2'];

test('todo modelo monta em todo formato', () => {
  for (const { id } of M.listar()) {
    for (const f of FORMATOS) {
      const peca = M.montar(id, f, CORES);
      assert.ok(peca, id + ' não montou em ' + f);
      assert.ok(peca.elementos.length >= 2, id + '/' + f + ': peça vazia demais para ser um começo');
      assert.equal(peca.formato, f);
    }
  }
});

test('nada nasce fora da tela', () => {
  /*
   * `x` e `w` são % da LARGURA; `y` e `h` são % da ALTURA. Um modelo pensado
   * em 16/9 e copiado para 9/16 escorrega para fora por baixo — é o erro mais
   * fácil de cometer aqui, e o mais difícil de notar sem abrir os quatro
   * formatos.
   */
  for (const { id } of M.listar()) {
    for (const f of FORMATOS) {
      for (const e of M.montar(id, f, CORES).elementos) {
        const onde = id + '/' + f + ' (' + (e.text || e.tipo) + ')';
        assert.ok(e.x >= 0, onde + ': começa antes da borda esquerda');
        assert.ok(e.y >= 0, onde + ': começa acima do topo');
        assert.ok(e.x + e.w <= 100.01, onde + ': passa da borda direita');
        assert.ok(e.y + e.h <= 100.01, onde + ': passa da base');
      }
    }
  }
});

test('texto não encosta na borda, onde a TV corta', () => {
  // Overscan: uma parte das telas come alguns por cento de cada lado, e é
  // justamente nelas que ninguém vai conferir.
  for (const { id } of M.listar()) {
    for (const f of FORMATOS) {
      for (const e of M.montar(id, f, CORES).elementos) {
        if (e.tipo !== 'texto') continue;
        const onde = id + '/' + f + ' ("' + String(e.text).slice(0, 18) + '")';
        assert.ok(e.x >= 3, onde + ': colado na esquerda');
        assert.ok(e.x + e.w <= 97.01, onde + ': colado na direita');
      }
    }
  }
});

test('a peça em pé não sai com letra tímida', () => {
  /*
   * O corpo é medido em cqw — % da largura. Numa peça 9/16 a largura é
   * pequena, então o MESMO número desenha uma letra bem menor. Sem o fator de
   * formato, o título de uma peça vertical sai com cara de legenda.
   */
  const deitada = M.montar('aviso', '16/9', CORES).elementos.find((e) => e.tipo === 'texto' && e.peso === 900);
  const emPe = M.montar('aviso', '9/16', CORES).elementos.find((e) => e.tipo === 'texto' && e.peso === 900);
  assert.ok(emPe.tamanho > deitada.tamanho * 1.3, 'a vertical devia pedir corpo maior: ' + emPe.tamanho + ' vs ' + deitada.tamanho);
});

test('a lista muda de arranjo conforme o formato', () => {
  // Três itens lado a lado numa peça em pé ficariam com 28% de largura cada
  // numa tela estreita: ilegível. Em pé eles empilham.
  const deitada = M.montar('lista', '16/9', CORES).elementos.filter((e) => e.tipo === 'texto' && e.align === 'left');
  const emPe = M.montar('lista', '9/16', CORES).elementos.filter((e) => e.tipo === 'texto' && e.align === 'left');
  const mesmasLinhas = (els) => new Set(els.map((e) => Math.round(e.y))).size;
  assert.equal(mesmasLinhas(deitada), 1, 'deitada: os três na mesma linha');
  assert.equal(mesmasLinhas(emPe), 3, 'em pé: um embaixo do outro');
});

/* ---------------- A cor da empresa ---------------- */

test('o modelo nasce na cor da marca', () => {
  /*
   * Modelo genérico é lindo na galeria e some no primeiro uso: a primeira
   * coisa que a pessoa faz é trocar tudo de cor, e trocar seis elementos à mão
   * é onde ela desiste.
   */
  const azul = JSON.stringify(M.montar('promocao', '16/9', ['#2f6feb']));
  const vermelho = JSON.stringify(M.montar('promocao', '16/9', ['#e11d48']));
  assert.ok(azul.includes('#2f6feb'), 'a cor da marca não apareceu na peça');
  assert.ok(vermelho.includes('#e11d48'));
  assert.notEqual(azul, vermelho, 'trocar a marca não mudou nada');
});

test('sem marca declarada, ainda sai uma peça inteira', () => {
  const peca = M.montar('aviso', '16/9', null);
  assert.ok(peca.elementos.every((e) => e.tipo !== 'texto' || /^#[0-9a-f]{6}$/i.test(e.cor)), 'cor de texto inválida');
});

test('sobre a cor da marca o texto não é branco puro', () => {
  // Branco puro "vibra" em fundo saturado numa tela grande; um creme lê melhor.
  const peca = M.montar('promocao', '16/9', ['#2f6feb']);
  const preco = peca.elementos.find((e) => String(e.text).startsWith('R$'));
  assert.notEqual(preco.cor.toLowerCase(), '#ffffff');
});

test('marca clara ganha texto escuro em cima', () => {
  const peca = M.montar('promocao', '16/9', ['#f5d67b']);
  const preco = peca.elementos.find((e) => String(e.text).startsWith('R$'));
  assert.ok(!/^#f/i.test(preco.cor), 'texto claro sobre marca clara: ' + preco.cor);
});

/* ---------------- Compatível com o resto ---------------- */

test('o texto do modelo ensina o que escrever ali', () => {
  // "Texto" não ensina nada; "SEGUNDA A SEXTA, 8h ÀS 18h" ensina o que aquele
  // bloco é e por que está naquele tamanho.
  for (const { id } of M.listar()) {
    for (const e of M.montar(id, '16/9', CORES).elementos) {
      if (e.tipo !== 'texto') continue;
      assert.notEqual(String(e.text).trim(), 'Texto', id + ': texto de exemplo genérico');
      assert.ok(String(e.text).trim().length > 0, id + ': texto vazio');
    }
  }
});

test('o que o modelo produz é desenhável pelo player', () => {
  // Mesma checagem que o desenho da peça faz: família de fonte conhecida,
  // camada em ordem, tipo válido.
  const validos = ['texto', 'forma', 'icone', 'imagem'];
  for (const { id } of M.listar()) {
    const peca = M.montar(id, '16/9', CORES);
    assert.ok(peca.bg && peca.bg.kind, id + ': sem fundo');
    peca.elementos.forEach((e, i) => {
      assert.ok(validos.includes(e.tipo), id + ': tipo desconhecido ' + e.tipo);
      assert.equal(typeof e.z, 'number');
      if (e.tipo === 'texto') {
        assert.ok(P.sombraCss(e) === 'none' || P.sombraCss(e).length > 0);
        assert.ok(e.tamanho > 0, id + ': corpo de texto zerado');
      }
      if (i > 0) assert.ok(e.z > peca.elementos[i - 1].z, id + ': camadas fora de ordem');
    });
  }
});

test('modelo desconhecido devolve nulo em vez de peça quebrada', () => {
  assert.equal(M.montar('não-existe', '16/9', CORES), null);
});

/* ---------------- O texto cabe na caixa ---------------- */

test('nenhum texto estoura a própria caixa, em nenhum formato', () => {
  /*
   * Este teste nasceu de uma medição no navegador: 22 dos textos dos modelos
   * saíam CORTADOS pela altura da própria caixa. O corpo é medido em cqw (%
   * da largura) e a caixa em % da altura — em 21/9 a mesma linha ocupa mais
   * que o dobro da altura que ocupa em 9/16, e escrever os dois à mão para
   * quatro formatos é errar em pelo menos um.
   */
  for (const { id } of M.listar()) {
    for (const f of FORMATOS) {
      const R = M.razao(f);
      for (const e of M.montar(id, f, CORES).elementos) {
        if (e.tipo !== 'texto') continue;
        // A mesma entrelinha que o player aplica: uma condensada de cartaz usa
        // 0.96, e cobrar 1.1 dela acusaria estouro onde não há.
        const el = F.dados(e.fonte).entrelinha;
        const alto = M.linhasDe(e.text, e.w, e.tamanho, e.fonte) * e.tamanho * R * el;
        assert.ok(
          alto <= e.h + 0.01,
          id + '/' + f + ' ("' + String(e.text).slice(0, 18) + '"): precisa de ' + alto.toFixed(1) + '% de altura e tem ' + e.h + '%',
        );
      }
    }
  }
});

test('o ajuste encolhe o texto, e não a caixa', () => {
  // Crescer a caixa passaria por cima do elemento de baixo, e dois textos
  // sobrepostos são piores que um título um pouco menor.
  const grande = { tipo: 'texto', text: 'PALAVRA MUITO COMPRIDA AQUI', x: 10, y: 10, w: 30, h: 4, tamanho: 20, fonte: 'sans' };
  const [saida] = M.ajustarTextos([grande], '16/9');
  assert.ok(saida.tamanho < grande.tamanho, 'não encolheu');
  assert.equal(saida.h, grande.h, 'mexeu na caixa');
  assert.equal(saida.y, grande.y);
});

test('texto que já cabe fica exatamente como estava', () => {
  const ok = { tipo: 'texto', text: 'oi', x: 10, y: 10, w: 60, h: 30, tamanho: 4, fonte: 'sans' };
  assert.strictEqual(M.ajustarTextos([ok], '16/9')[0], ok);
});
