/*
 * Colar no editor.
 *
 * A pergunta que originou isto foi "dá pra eu copiar algo no Canva e colar
 * dentro do meu editor?". A resposta tem duas metades, e estes testes guardam
 * as duas: do Canva vem imagem (ele não publica formato editável), do Figma
 * vem SVG e daí saem camadas de verdade.
 *
 * O que roda aqui é a decisão e a matemática de escala — a parte que deforma
 * tudo se estiver errada. A leitura do SVG em si precisa de DOM e é conferida
 * no teste de navegador.
 */
const test = require('node:test');
const assert = require('node:assert');

const carregar = () => import('../web/src/lib/colar.js');

test('imagem na área de transferência ganha de tudo', async () => {
  // É o caso do Canva: junto do PNG ele manda texto solto, e colar o texto em
  // vez da arte seria o oposto do que a pessoa pediu.
  const C = await carregar();
  const r = C.decidirColagem({ arquivoImagem: { name: 'a.png' }, textoPlano: 'Sem título' });
  assert.equal(r.acao, 'imagem');
});

test('texto vira bloco de texto, com as quebras', async () => {
  const C = await carregar();
  const r = C.decidirColagem({ textoPlano: '  PROMOÇÃO\nde inverno  ' });
  assert.equal(r.acao, 'elementos');
  assert.equal(r.elementos[0].tipo, 'texto');
  assert.equal(r.elementos[0].text, 'PROMOÇÃO\nde inverno');
});

test('texto vazio ou só espaço não cria elemento fantasma', async () => {
  const C = await carregar();
  assert.equal(C.textoParaElemento('   \n  '), null);
  assert.equal(C.decidirColagem({ textoPlano: '' }).acao, 'nada');
});

test('reconhece SVG mesmo com declaração XML ou comentário na frente', async () => {
  const C = await carregar();
  assert.ok(C.pareceSvg('<?xml version="1.0"?>\n<svg viewBox="0 0 10 10"></svg>'));
  assert.ok(C.pareceSvg('<!-- Generator: Figma -->\n<svg width="10">'));
  assert.ok(!C.pareceSvg('svg é um formato de imagem'), 'a palavra solta não é SVG');
  assert.ok(!C.pareceSvg('<svgado>'), 'tag parecida não é SVG');
});

test('o Figma cola o SVG embrulhado em HTML; o embrulho sai', async () => {
  const C = await carregar();
  const html = '<meta charset="utf-8"><svg viewBox="0 0 4 4"><rect/></svg><span></span>';
  const svg = C.extrairSvg(html);
  assert.ok(svg.startsWith('<svg'), svg.slice(0, 20));
  assert.ok(svg.endsWith('</svg>'));
});

/* ---------------- A régua ---------------- */

test('o desenho entra centralizado na peça', async () => {
  const C = await carregar();
  const { px, py, pw } = C.escalar({ x: 0, y: 0, w: 100, h: 100 }, 60);
  assert.equal(pw(100), 60, 'não ocupou os 60% pedidos');
  assert.equal(px(0), 20, 'a margem da esquerda deveria ser (100−60)/2');
  assert.equal(px(100), 80);
  assert.equal(py(50), 50, 'o meio do desenho tem que cair no meio da peça');
});

test('SVG deitado não estica: os dois eixos usam a MESMA escala', async () => {
  /*
   * O defeito clássico de quem escala por eixo: um círculo colado de um SVG
   * 200x100 vira elipse. Uma escala só, ditada pelo lado maior, preserva a
   * proporção — e o resultado é o que a pessoa viu no Figma.
   */
  const C = await carregar();
  const { pw, ph } = C.escalar({ x: 0, y: 0, w: 200, h: 100 }, 60);
  assert.equal(pw(50), ph(50), 'o mesmo número deu tamanhos diferentes nos dois eixos');
  assert.equal(pw(200), 60, 'o lado maior é que define a ocupação');
  assert.equal(ph(100), 30);
});

test('SVG em pé também não estica', async () => {
  const C = await carregar();
  const { pw, ph } = C.escalar({ x: 0, y: 0, w: 100, h: 400 }, 60);
  assert.equal(pw(100), ph(100));
  assert.equal(ph(400), 60);
});

test('viewBox com deslocamento é respeitado', async () => {
  // O Figma exporta viewBox começando longe de zero com frequência. Ignorar o
  // deslocamento joga o desenho para fora da peça.
  const C = await carregar();
  const { px, py } = C.escalar({ x: 40, y: 80, w: 100, h: 100 }, 60);
  assert.equal(px(40), 20, 'o canto do viewBox deveria virar a margem');
  assert.equal(py(80), 20);
});

test('círculo colado continua círculo numa peça deitada', async () => {
  /*
   * O defeito que o teste de navegador pegou: um círculo de um SVG quadrado
   * saía 296 por 166 pixels. x e w são % da LARGURA, y e h são % da ALTURA —
   * numa peça 16/9 a mesma porcentagem nos dois eixos desenha um oval.
   */
  const C = await carregar();
  const R = 16 / 9;
  const { pw, ph } = C.escalar({ x: 0, y: 0, w: 200, h: 200 }, 60, R);
  const W = 1600;
  assert.ok(
    Math.abs((pw(80) / 100) * W - (ph(80) / 100) * (W / R)) < 0.01,
    'o círculo virou elipse: ' + pw(80).toFixed(2) + '% de largura por ' + ph(80).toFixed(2) + '% de altura',
  );
});

test('e o desenho inteiro continua cabendo na peça deitada', async () => {
  const C = await carregar();
  const { px, py, ph } = C.escalar({ x: 0, y: 0, w: 200, h: 200 }, 60, 16 / 9);
  assert.ok(px(0) >= 0 && px(200) <= 100, 'vazou na horizontal');
  assert.ok(py(0) >= 0 && py(200) <= 100, 'vazou na vertical');
  assert.ok(ph(200) <= 60.001, 'o lado limitante deveria ser a altura, em 60%');
});

test('nada estoura a peça', async () => {
  const C = await carregar();
  for (const caixa of [{ x: 0, y: 0, w: 1000, h: 3 }, { x: 0, y: 0, w: 3, h: 1000 }, { x: -50, y: -50, w: 100, h: 100 }]) {
    const { px, py, pw, ph } = C.escalar(caixa, 60);
    assert.ok(px(caixa.x) >= 0 && px(caixa.x) + pw(caixa.w) <= 100, 'saiu pela horizontal: ' + JSON.stringify(caixa));
    assert.ok(py(caixa.y) >= 0 && py(caixa.y) + ph(caixa.h) <= 100, 'saiu pela vertical: ' + JSON.stringify(caixa));
  }
});

/* ---------------- Medir o SVG ---------------- */

// Um nó de mentira, só com o que medirSvg olha.
const noFalso = (attrs) => ({ getAttribute: (k) => (k in attrs ? attrs[k] : null) });

test('o viewBox manda; sem ele valem largura e altura', async () => {
  const C = await carregar();
  assert.deepEqual(C.medirSvg(noFalso({ viewBox: '0 0 24 24', width: '999' })), { x: 0, y: 0, w: 24, h: 24 });
  assert.deepEqual(C.medirSvg(noFalso({ width: '300', height: '150' })), { x: 0, y: 0, w: 300, h: 150 });
  assert.deepEqual(C.medirSvg(noFalso({ width: '300px', height: '150px' })), { x: 0, y: 0, w: 300, h: 150 });
});

test('viewBox separado por vírgula também conta', async () => {
  const C = await carregar();
  assert.deepEqual(C.medirSvg(noFalso({ viewBox: '10,20,30,40' })), { x: 10, y: 20, w: 30, h: 40 });
});

test('sem medida nenhuma, não se chuta', async () => {
  // Chutar aqui deforma tudo o que for colado. Melhor devolver nulo e o
  // editor colar como imagem.
  const C = await carregar();
  assert.equal(C.medirSvg(noFalso({})), null);
  assert.equal(C.medirSvg(noFalso({ viewBox: '0 0 0 0' })), null);
  assert.equal(C.medirSvg(noFalso({ viewBox: 'a b c d' })), null);
});
