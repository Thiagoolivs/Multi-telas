/*
 * A foto sabe onde o texto vai ficar.
 *
 * A peça é montada em duas etapas: a IA gera uma foto, e o compositor escreve
 * o texto por cima com a fonte de verdade. A foto era pedida sem nenhuma
 * noção da segunda etapa — "descrição da foto" e mais nada —, então o modelo
 * preenchia o quadro inteiro e o texto caía onde desse, resolvido no fim com
 * um véu escuro por cima da imagem.
 *
 * O que as peças boas desse mercado fazem é o contrário, e dá para ver
 * olhando várias lado a lado: o sujeito ocupa UM lado e o outro fica limpo. O
 * texto não disputa espaço porque a foto foi feita para ceder espaço.
 */
const test = require('node:test');
const assert = require('node:assert');
const arte = require('../server/direcao-arte.js');
const director = require('../server/ai-director.js');
const ds = require('../server/design-system.js');
const fm = require('../server/font-metrics.js');

const PALETA = ds.buildPalette({ brand: '#F5B301', brand2: '#1B4DB1', direcao: 'chapado' });
const PECA = {
  kicker: 'JULHO AMARELO',
  headline: 'Sua saúde pede atitude',
  sub: 'Teste-se contra as hepatites.',
  cta: 'Procure a unidade mais próxima',
  bgImagem: '/media/x.jpg',
};

/* ---------------- O prompt da foto ---------------- */

test('o prompt PROÍBE texto na imagem', () => {
  /*
   * O guia antigo pedia só "sem marcas d'água". Modelo de imagem adora
   * escrever — em português, com acento torto e kerning quebrado —, e cada
   * palavra que ele desenha fica POR BAIXO do texto de verdade, que o
   * compositor escreve depois com a fonte certa. Não sai mais.
   */
  const p = arte.promptDeFoto('um padeiro', { formato: '16/9' });
  assert.match(p, /NENHUM TEXTO/);
  assert.match(p, /LOGOTIPO|MARCA D'ÁGUA/);
});

test('o prompt diz QUAL lado fica vazio, e por quê', () => {
  const p = arte.promptDeFoto('uma atendente', { formato: '16/9' });
  assert.match(p, /metade esquerda/i);
  assert.match(p, /VAZIA/);
  assert.match(p, /receber texto/i, 'não explica para que serve o espaço');
  // E o sujeito precisa ser mandado para o outro lado, senão ele ocupa tudo.
  assert.match(p, /lado oposto/i);
});

test('cada formato reserva o lado que faz sentido nele', () => {
  /*
   * Vertical reserva EM CIMA, e não ao lado: numa peça 9/16 dividir a largura
   * ao meio deixa duas colunas magras, e nenhuma comporta manchete.
   */
  assert.equal(arte.reservaDe('16/9').lado, 'esquerdo');
  assert.equal(arte.reservaDe('21/9').lado, 'esquerdo');
  assert.equal(arte.reservaDe('9/16').lado, 'superior');
  assert.equal(arte.reservaDe('1/1').lado, 'inferior');
  // Formato desconhecido não pode derrubar a geração.
  assert.equal(arte.reservaDe('nada disso').lado, 'esquerdo');
});

test('a monocromia entra com a cor da marca', () => {
  /*
   * É o movimento que mais aproxima a peça das referências: fundo e roupa na
   * mesma família de cor. Sem isso a foto de banco de imagens briga com a
   * identidade do cliente, e a peça vira foto genérica com legenda.
   */
  const p = arte.promptDeFoto('um casal', { formato: '16/9', brand: '#7C3AED' });
  assert.match(p, /MONOCROMIA/);
  assert.match(p, /#7C3AED/);
});

/* ---------------- O layout usa o espaço reservado ---------------- */

test('sobre foto NOSSA o texto vai no espaço limpo, SEM véu', () => {
  /*
   * `layoutCartaz` sempre escurece o rodapé para garantir leitura sobre uma
   * foto desconhecida. Aqui isso apagaria justamente o espaço que mandamos
   * reservar — e o véu é o que denuncia que o texto foi colado depois.
   */
  const r = director.layoutReserva({ ...PECA, formato: '16/9', ladoLimpo: 'esquerdo' },
    PALETA, '16/9', 'chapado', {});
  const veu = r.elementos.filter((e) => e.tipo === 'forma');
  assert.deepStrictEqual(veu, [], 'voltou a pôr véu sobre a foto que reservou espaço');

  // E o texto tem que ficar do lado reservado, não espalhado.
  const textos = r.elementos.filter((e) => e.tipo === 'texto');
  assert.ok(textos.length >= 3);
  for (const t of textos) {
    assert.ok(t.x + t.w <= 55, t.papel + ' invadiu o lado da foto (x+w=' + (t.x + t.w) + ')');
  }
});

test('sobre foto do ACERVO o véu continua — ali não há espaço reservado', () => {
  // A foto do cliente não reservou nada: sem véu não há como garantir leitura,
  // porque ninguém sabe o que tem atrás.
  const r = director.layoutReserva({ ...PECA, formato: '16/9' }, PALETA, '16/9', 'chapado', {});
  assert.ok(r.elementos.some((e) => e.tipo === 'forma'), 'sumiu o véu da foto sem reserva');
});

test('nenhum elemento nasce fora da peça, em nenhum formato', () => {
  /*
   * A primeira versão empilhava alturas a partir do tamanho da fonte, e o
   * `cta` saía em y=104 — fora da peça. O erro é fácil de cometer e difícil
   * de ver: a fonte é medida em % da LARGURA, e numa peça 16/9 cada ponto de
   * fonte vale 1,78 ponto de altura.
   */
  for (const [f, lado] of [['16/9', 'esquerdo'], ['9/16', 'superior'], ['1/1', 'inferior']]) {
    const r = director.layoutReserva({ ...PECA, formato: f, ladoLimpo: lado }, PALETA, f, 'chapado', {});
    for (const e of r.elementos) {
      assert.ok(e.y >= -0.5 && e.y + e.h <= 100.5, `${f}: ${e.papel} sai da peça (y=${e.y} h=${e.h})`);
      assert.ok(e.x >= -0.5 && e.x + e.w <= 100.5, `${f}: ${e.papel} sai pela lateral`);
    }
  }
});

test('todo texto CABE na própria caixa, medido com a fonte de verdade', () => {
  /*
   * Não basta a caixa estar dentro da peça: o texto tem que caber nela. A
   * primeira versão limitava o tamanho pela altura e ignorava a largura — numa
   * coluna de 40% quem manda é a largura, e o título transbordava.
   *
   * E uma passada só não converge: `sugestaoCqw` aproxima. No formato
   * quadrado a primeira sugestão ainda devolvia `cabe: false`.
   */
  for (const [f, lado] of [['16/9', 'esquerdo'], ['9/16', 'superior'], ['1/1', 'inferior']]) {
    const r = director.layoutReserva({ ...PECA, formato: f, ladoLimpo: lado }, PALETA, f, 'chapado', {});
    for (const e of r.elementos) {
      const m = fm.cabeNaCaixaReal(e.text, { w: e.w, h: e.h }, e.tamanho, f, e.fonte, e.peso, false);
      assert.ok(m.cabe, `${f}: ${e.papel} não cabe (${m.linhas} linhas numa caixa de ${m.linhasCabem})`);
    }
  }
});

test('a faixa que o layout escreve é a MESMA que a foto prometeu deixar limpa', () => {
  /*
   * As duas saem de `reservaDe` de propósito. Prometer um terço ao modelo e
   * escrever em 40% seria escrever em cima do sujeito — e o quadrado precisou
   * mesmo de 40%, porque em um terço não cabem kicker, manchete, apoio e CTA.
   */
  const fonte = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'server', 'ai-director.js'), 'utf8');
  assert.match(fonte, /direcaoArte\.reservaDe\(formato\)\.altura/,
    'o layout voltou a usar uma fração própria em vez da que a foto prometeu');
  assert.equal(arte.reservaDe('1/1').altura, 0.40);
});
