/*
 * A peça feita pela IA segue o CLIMA da marca (lote de 06/11): o Escuro
 * elegante, o Claro limpo ou a Cor da marca forte (marcas.clima;
 * js/paletas.js, CLIMAS). Antes o modo saía da direção de arte do plano, e
 * a conta de clima escuro recebia a campanha clara. Sem clima (a conta de
 * antes), o modo continua saindo da direção.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../js/peca-html.js');
const cor = require('../js/cor.js');
const director = require('../server/ai-director.js');
const eco = require('../server/ecossistema.js');

const RAIZ = path.join(__dirname, '..');
const PECAS = [
  { formato: '16/9', headline: 'Óculos de sol com 30% de desconto', kicker: 'Semana do Sol', sub: 'Até sábado.', cta: 'Passe na loja' },
  { formato: '9/16', headline: 'Garantia de 2 anos', sub: 'Em toda armação.', cta: '' },
];
const plano = (direcao) => ({ identidade: { brand: '#1b3a5c', brand2: '#e9c46a', estilo: 'elegante', direcao }, pecas: PECAS });
const marca = (clima) => ({ cores: ['#1b3a5c', '#e9c46a'], clima });

async function campanha(direcao, clima, extra) {
  return director.dirigir('óculos de sol 30%', Object.assign({ empresa: 'Ótica Central', motorHtml: true,
    planoAprovado: plano(direcao), marca: clima === undefined ? undefined : marca(clima) }, extra || {}), {});
}

test('com clima, a peça da IA sai no modo do clima, e a direção que não combina vira a do clima', async () => {
  const casos = [
    // [direção do plano, clima da marca, modo da peça, direção da campanha]
    ['suave', 'escuro', 'escuro', 'contraste'],
    ['chapado', 'claro', 'claro', 'suave'],
    ['cartaz', 'marca', 'marca', 'chapado'],
    ['suave', 'marca', 'marca', 'chapado'],
    // A direção que já combina com o clima fica: o cartaz e o contraste no escuro.
    ['cartaz', 'escuro', 'escuro', 'cartaz'],
    ['contraste', 'escuro', 'escuro', 'contraste'],
    ['suave', 'claro', 'claro', 'suave'],
  ];
  for (const [direcao, clima, modo, direcaoFinal] of casos) {
    const r = await campanha(direcao, clima);
    assert.ok(r.pecas.length >= 2);
    for (const p of r.pecas) {
      assert.equal(p.item.modo, modo, direcao + ' no clima ' + clima + ': ' + p.label);
      assert.deepEqual(P.validarItem(p.item).problemas, [], p.label);
    }
    assert.equal(r.identidade.direcao, direcaoFinal, direcao + ' no clima ' + clima);
    assert.equal(r.paleta.direcao, direcaoFinal);
  }
});

test('a paleta da campanha acompanha o clima: escuro no escuro, a cor da marca no forte', async () => {
  const lum = (h) => cor.luminancia(h);
  const escuro = await campanha('suave', 'escuro');
  assert.ok(lum(escuro.paleta.bg) < 0.05, 'fundo quase preto no Escuro elegante: ' + escuro.paleta.bg);
  const forte = await campanha('suave', 'marca');
  assert.equal(forte.paleta.bg.toLowerCase(), '#1b3a5c', 'a marca em cheio na Cor da marca forte');
  const claro = await campanha('chapado', 'claro');
  assert.notEqual(claro.paleta.bg.toLowerCase(), '#1b3a5c', 'o Claro limpo não pinta o fundo de marca');
});

test('o rascunho do plano já sai no clima da marca', async () => {
  const r = await director.dirigir('óculos de sol 30%', { empresa: 'Ótica Central', motorHtml: true, planoAprovado: plano('chapado'), marca: marca('claro') }, { pararNoPlano: true });
  assert.ok(r.rascunhos.length);
  for (const it of r.rascunhos) assert.equal(it.modo, 'claro');
  assert.equal(r.plano.identidade.direcao, 'suave');
});

test('sem clima (a conta de antes), o modo sai da direção, como sempre', async () => {
  for (const [direcao, modo] of [['suave', 'claro'], ['chapado', 'marca'], ['cartaz', 'escuro'], ['contraste', 'escuro']]) {
    for (const clima of [undefined, '', 'roxo']) {
      const r = await campanha(direcao, clima);
      for (const p of r.pecas) assert.equal(p.item.modo, modo, direcao + ' sem clima (' + clima + ')');
      assert.equal(r.identidade.direcao, direcao);
    }
  }
  assert.equal(director.modoDaPeca('', {}), 'escuro', 'sem direção e sem clima: o escuro de sempre');
});

test('o ecossistema e o ajuste da campanha usam o mesmo clima (identidadeDe)', () => {
  const comClima = eco.identidadeDe(marca('claro'), 'chapado', 'vibrante');
  assert.equal(comClima.modo, 'claro');
  assert.equal(comClima.identidade.direcao, 'suave');
  const forte = eco.identidadeDe(marca('marca'), 'contraste', 'vibrante');
  assert.equal(forte.modo, 'marca');
  const semClima = eco.identidadeDe({ cores: ['#1b3a5c'] }, 'suave', 'vibrante');
  assert.equal(semClima.modo, 'claro');
  assert.equal(semClima.identidade.direcao, 'suave');
});

test('o servidor leva o clima da marca à IA: na campanha, no ecossistema e na tela inteira', () => {
  const server = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  const marcaDaConta = server.slice(server.indexOf('async function marcaDaConta'), server.indexOf('function fotoDaConta'));
  assert.match(marcaDaConta, /clima: k\.clima \|\| ''/);
  assert.match(server, /comporTelaInteira\(\{[\s\S]{0,300}modo: director\.modoDaPeca\('', k\)/);
});
