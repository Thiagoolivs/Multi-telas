/*
 * Testes do validador de composição (node --test test/composer.test.js).
 *
 * A premissa do motor é que o modelo ERRA e o código conserta. Estes testes
 * alimentam justamente os erros típicos de um LLM — texto fora da tela, cor
 * ilegível, camada invertida, texto que não cabe — e provam que o que sai é
 * exibível.
 */
const test = require('node:test');
const assert = require('node:assert');
const ds = require('../server/design-system');
const { validarComposicao } = require('../server/composer');

const palette = ds.buildPalette('#1e3a8a', '#0ea5e9', 'escuro');
const acha = (item, papel) => item.elementos.find((e) => e.papel === papel);

/* ---------------- Design system ---------------- */

test('contraste: preto sobre branco é o máximo da escala', () => {
  assert.ok(ds.contrast('#000000', '#ffffff') > 20);
  assert.ok(ds.contrast('#777777', '#777777') < 1.01);
});

test('textOn escolhe a cor legível para o fundo', () => {
  assert.strictEqual(ds.textOn('#0b1120'), '#ffffff');
  assert.strictEqual(ds.textOn('#ffffff'), '#0b1120');
});

test('paleta derivada sempre dá texto legível sobre o fundo', () => {
  for (const marca of ['#1e3a8a', '#f5b301', '#ffffff', '#000000', '#22c55e', '#ec4899']) {
    const p = ds.buildPalette(marca, null, 'escuro');
    assert.ok(ds.contrast(p.texto, p.bg) >= 4.5, `contraste insuficiente para ${marca}`);
    assert.ok(ds.contrast(p.textoNoAcento, p.acento) >= 4.5, `CTA ilegível para ${marca}`);
  }
});

test('cor de marca inválida cai no padrão sem quebrar', () => {
  const p = ds.buildPalette('não é cor', undefined, 'escuro');
  assert.match(p.brand, /^#[0-9a-f]{6}$/);
});

test('área segura é menor que a peça e centrada', () => {
  const s = ds.safeArea('16/9');
  assert.ok(s.x > 0 && s.y > 0);
  assert.strictEqual(s.x + s.w + s.x, 100);
});

/* ---------------- Reparos ---------------- */

test('texto fora da tela é trazido para a área segura', () => {
  const { item, correcoes } = validarComposicao({
    elementos: [{ tipo: 'texto', papel: 'headline', text: 'Promoção', x: 88, y: 95, w: 40, h: 20, tamanho: 6, cor: '#ffffff' }],
  }, { formato: '16/9', palette });

  const s = ds.safeArea('16/9');
  const el = acha(item, 'headline');
  assert.ok(el.x >= s.x && el.x + el.w <= s.x + s.w + 0.01, 'saiu na horizontal');
  assert.ok(el.y >= s.y && el.y + el.h <= s.y + s.h + 0.01, 'saiu na vertical');
  assert.ok(correcoes.some((c) => /área segura/.test(c)));
});

test('forma de fundo PODE sangrar para fora — é intencional', () => {
  const { item } = validarComposicao({
    elementos: [{ tipo: 'forma', papel: 'fundo', shape: 'ellipse', x: -15, y: -20, w: 80, h: 70, fill: '#1e3a8a' }],
  }, { formato: '16/9', palette });

  const forma = acha(item, 'fundo');
  assert.ok(forma.x < 0, 'a forma foi indevidamente puxada para dentro');
});

test('texto ilegível sobre o bloco atrás dele é recolorido', () => {
  const { item, correcoes } = validarComposicao({
    elementos: [
      // Bloco amarelo claro cobrindo a peça...
      { tipo: 'forma', papel: 'fundo', shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill: '#fde047', z: 0 },
      // ...com texto branco por cima: ilegível.
      { tipo: 'texto', papel: 'headline', text: 'Oferta', x: 10, y: 40, w: 60, h: 15, tamanho: 6, cor: '#ffffff' },
    ],
  }, { formato: '16/9', palette });

  const titulo = acha(item, 'headline');
  assert.ok(ds.contrast(titulo.cor, '#fde047') >= ds.MIN_CONTRAST_TITULO,
    `contraste final ${ds.contrast(titulo.cor, '#fde047').toFixed(2)} ainda insuficiente`);
  assert.ok(correcoes.some((c) => /contraste/.test(c)));
});

test('texto longo demais tem o corpo reduzido para caber', () => {
  const longo = 'Promoção especial de inverno com descontos progressivos em toda a linha de produtos selecionados';
  const { item, correcoes } = validarComposicao({
    elementos: [{ tipo: 'texto', papel: 'headline', text: longo, x: 6, y: 30, w: 40, h: 10, tamanho: 9, cor: '#ffffff' }],
  }, { formato: '16/9', palette });

  const el = acha(item, 'headline');
  assert.ok(el.tamanho < 9, 'o corpo não foi reduzido');
  assert.ok(correcoes.some((c) => /não cabia/.test(c)));
});

test('camadas: o texto sempre fica acima do fundo', () => {
  const { item } = validarComposicao({
    elementos: [
      // O modelo inverteu: deu z alto para o fundo e z baixo para o título.
      { tipo: 'forma', papel: 'fundo', shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill: '#1e3a8a', z: 9 },
      { tipo: 'texto', papel: 'headline', text: 'Título', x: 10, y: 40, w: 50, h: 12, tamanho: 6, cor: '#ffffff', z: 0 },
    ],
  }, { formato: '16/9', palette });

  assert.ok(acha(item, 'headline').z > acha(item, 'fundo').z, 'o título ficou enterrado');
});

test('textos que colidem são separados', () => {
  const { item } = validarComposicao({
    elementos: [
      { tipo: 'texto', papel: 'headline', text: 'Título', x: 6, y: 30, w: 50, h: 14, tamanho: 6, cor: '#ffffff' },
      { tipo: 'texto', papel: 'sub', text: 'Subtítulo', x: 6, y: 32, w: 50, h: 10, tamanho: 3, cor: '#ffffff' },
    ],
  }, { formato: '16/9', palette });

  const a = acha(item, 'headline');
  const b = acha(item, 'sub');
  assert.ok(!ds.sobrepoe(a, b), 'os dois textos continuam sobrepostos');
});

/* ---------------- Robustez ---------------- */

test('lixo do modelo não quebra o validador', () => {
  const casos = [null, undefined, {}, { elementos: null }, { elementos: 'texto' },
    { elementos: [null, 42, 'x', {}] }];
  for (const caso of casos) {
    const { item } = validarComposicao(caso, { formato: '16/9', palette });
    assert.strictEqual(item.type, 'composicao');
    assert.ok(Array.isArray(item.elementos));
  }
});

test('valores absurdos são limitados', () => {
  const { item } = validarComposicao({
    elementos: [{ tipo: 'texto', papel: 'headline', text: 'X', x: 1e9, y: -1e9, w: 1e6, h: NaN, tamanho: 999, rot: 900, cor: 'roxo' }],
  }, { formato: '16/9', palette });

  const el = item.elementos[0];
  for (const k of ['x', 'y', 'w', 'h', 'tamanho', 'rot']) {
    assert.ok(Number.isFinite(el[k]), `${k} não é número finito`);
  }
  assert.match(el.cor, /^#[0-9a-f]{6}$/);
});

test('imagem sem src é descartada', () => {
  const { item } = validarComposicao({
    elementos: [{ tipo: 'imagem', papel: 'imagem', x: 10, y: 10, w: 30, h: 30 }],
  }, { formato: '16/9', palette });
  assert.strictEqual(item.elementos.length, 0);
});

test('fundo padrão é gradiente da paleta quando a IA não define', () => {
  const { item } = validarComposicao({ elementos: [] }, { formato: '16/9', palette });
  assert.strictEqual(item.bg.kind, 'cor');
  assert.match(item.bg.cor, /linear-gradient/);
});

test('todos os formatos produzem peça válida', () => {
  for (const formato of ['16/9', '9/16', '1/1', '21/9']) {
    const { item } = validarComposicao({
      elementos: [{ tipo: 'texto', papel: 'headline', text: 'Bom dia equipe', x: 6, y: 40, w: 60, h: 16, tamanho: 7, cor: '#ffffff' }],
    }, { formato, palette });
    assert.strictEqual(item.formato, formato);
    const s = ds.safeArea(formato);
    const el = item.elementos[0];
    assert.ok(el.x >= s.x && el.y >= s.y, `${formato}: texto fora da área segura`);
  }
});

test('forma semitransparente não engana o cálculo de contraste', () => {
  // Halo claro com opacidade baixa sobre fundo escuro: o resultado visual
  // continua escuro, então o texto deve continuar CLARO.
  const { item } = validarComposicao({
    elementos: [
      { tipo: 'forma', papel: 'fundo', shape: 'ellipse', x: 0, y: 0, w: 100, h: 100,
        fill: { grad: 'radial', cores: ['#0ea5e9', '#0b1120'] }, opacidade: 0.4, z: 0 },
      { tipo: 'texto', papel: 'kicker', text: 'NOVIDADE', x: 8, y: 20, w: 40, h: 8, tamanho: 2.2, cor: '#ffffff' },
    ],
  }, { formato: '9/16', palette });

  const kicker = acha(item, 'kicker');
  assert.ok(ds.luminance(kicker.cor) > 0.5, `kicker ficou escuro (${kicker.cor}) sobre fundo escuro`);
});

test('forma opaca e clara faz o texto virar escuro', () => {
  const { item } = validarComposicao({
    elementos: [
      { tipo: 'forma', papel: 'fundo', shape: 'rect', x: 0, y: 0, w: 100, h: 100, fill: '#ffffff', opacidade: 1, z: 0 },
      { tipo: 'texto', papel: 'headline', text: 'Oferta', x: 8, y: 40, w: 50, h: 14, tamanho: 6, cor: '#ffffff' },
    ],
  }, { formato: '16/9', palette });

  const t = acha(item, 'headline');
  assert.ok(ds.contrast(t.cor, '#ffffff') >= ds.MIN_CONTRAST_TITULO, 'texto continua ilegível sobre branco');
});
