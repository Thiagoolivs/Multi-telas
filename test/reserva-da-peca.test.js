/*
 * A peça-ouro no lugar da peça que não coube (server/reserva-da-peca.js,
 * POST /api/pecas/reserva): o último passo do encaixe automático do Criar e
 * da Criação rápida. Só quando a reserva leva TODOS os textos — nenhum
 * preço some, nenhum título é cortado.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/peca-html.js');
const C = require('../server/compositor.js');
const R = require('../server/reserva-da-peca.js');

// Uma peça "da IA" mínima, com os campos que a gente escolher.
function pecaDaIA(campos, o) {
  const x = o || {};
  const corpo = Object.entries(campos).map(([k, v]) => (k === 'foto' ? '<img data-campo-img="foto" alt="">' : '<p data-campo="' + k + '">' + v + '</p>')).join('');
  const h = P.higienizar({ html: '<section class="mt-peca">' + corpo + '</section>', css: '.mt-peca { color: var(--mt-texto); }' });
  assert.deepEqual(h.problemas, []);
  return { type: 'peca-html', versao: 1, papel: x.papel || 'destaque', html: h.html, css: h.css, campos: campos.foto ? { foto: campos.foto } : {},
    marca: { cores: ['#1b2a4a'] }, modo: 'escuro', formato: x.formato || '16/9', origem: { motor: 'gemini', pedido: 'café da manhã' }, ...(x.espacos ? { espacos: x.espacos } : {}) };
}
const textos = (item) => Object.values(C.textosDaPeca(item)).join(' | ');

test('destaque sem foto: entra a peça-ouro aprovada com os mesmos textos, e ela passa pela porta da TV', () => {
  const ia = pecaDaIA({ kicker: 'Hoje', titulo: 'Café da manhã completo', apoio: 'Pão na chapa, suco e café', cta: 'Peça no balcão' });
  const r = R.daPeca(ia, { empresa: 'Padaria Quixabeira' });
  assert.ok(r, 'sem reserva');
  assert.equal(r.origem.motor, 'ouro');
  assert.equal(r.formato, '16/9');
  assert.deepEqual(P.validarItem(r).problemas, []);
  const t = textos(r);
  for (const x of ['Hoje', 'Café da manhã', 'completo', 'Pão na chapa, suco e café', 'Peça no balcão', 'Padaria Quixabeira']) assert.ok(t.includes(x), x + ' não está na reserva: ' + t);
  // O modelo é um dos aprovados no manifesto.
  const m = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pecas-ouro', 'manifesto.json'), 'utf8'));
  const base = m.pecas.find((p) => p.id === r.origem.base);
  assert.ok(base && (!base.estado || base.estado === 'aprovada'), r.origem.base + ' não é uma peça aprovada');
});

test('sem kicker, o carimbo "Novidade" que ninguém escreveu fica escondido', () => {
  const r = R.daPeca(pecaDaIA({ titulo: 'Aberto no feriado', apoio: 'Das 8h às 14h' }), { empresa: 'Ótica Xilofone' });
  assert.ok(r);
  if (r.campos.selo === 'Novidade') assert.deepEqual(r.ocultos, ['selo']);
  assert.deepEqual(P.validarItem(r).problemas, []);
});

test('com foto: a reserva com foto, a mesma foto, com o ponto que importa', () => {
  const espacos = { foto: { papel: 'produto', foco: { x: 0.3, y: 0.6 } } };
  const r = R.daPeca(pecaDaIA({ titulo: 'Bolo de cenoura', apoio: 'Com cobertura de chocolate', foto: '/media/t1/abc.jpg' }, { espacos }), { empresa: 'Padaria' });
  assert.ok(r);
  assert.equal(r.campos.foto, '/media/t1/abc.jpg');
  assert.deepEqual(r.espacos, espacos);
  assert.deepEqual(P.validarItem(r).problemas, []);
});

test('o cabeçalho: a chamada é o texto principal da faixa', () => {
  const r = R.daPeca(pecaDaIA({ marca: 'Padaria', chamada: 'Café completo hoje' }, { papel: 'cabecalho' }), { empresa: 'Padaria Quixabeira' });
  assert.ok(r);
  assert.equal(r.papel, 'cabecalho');
  assert.ok(textos(r).includes('Café completo hoje'));
});

test('sem reserva quando algo se perderia: preço, lista, título cortado na faixa, e a peça que já é a reserva', () => {
  assert.equal(R.daPeca(pecaDaIA({ titulo: 'Café completo', preco: 'R$ 19', centavos: ',90' })), null, 'o preço sumiria');
  assert.equal(R.daPeca(pecaDaIA({ titulo: 'Cardápio', item1: 'Feijoada', item2: 'Lasanha' })), null, 'a lista sumiria');
  assert.equal(R.daPeca(pecaDaIA({ apoio: 'só apoio, sem título' })), null, 'sem título não há peça');
  // A lateral corta o título comprido na palavra: a reserva diria menos que a peça.
  const comprido = 'Semana do cliente com vinte por cento de desconto em todas as armações';
  assert.equal(R.daPeca(pecaDaIA({ titulo: comprido }, { papel: 'lateral' })), null);
  const ouro = C.preencherPapel({ papel: 'destaque', textos: { titulo: 'Café' }, empresa: 'X' });
  assert.equal(R.daPeca(ouro), null, 'a reserva não tem outra reserva');
  assert.equal(R.daPeca({ type: 'composicao' }), null);
});

test('a rota: só com sessão, fora de /api/ai (não chama a IA), confere a peça na entrada e na saída', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const i = s.indexOf("parts[1] === 'pecas' && parts[2] === 'reserva'");
  assert.ok(i > 0, 'a rota não existe');
  const bloco = s.slice(i, i + 1800);
  assert.match(bloco, /if \(!sess\) return sendJson\(res, 401/);
  assert.match(bloco, /rateLimit\('pecas:reserva:'/);
  assert.match(bloco, /P\.validarItem\(b && b\.item\)[\s\S]*reservaDaPeca\.daPeca\([\s\S]*P\.validarItem\(item\)/);
  assert.doesNotMatch(bloco, /motores\.|compositor\.comporPeca|ai\.generate/);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'web', 'src', 'api.js'), 'utf8'), /reserva: \(item\) => api\('POST', '\/api\/pecas\/reserva', \{ item \}\)/);
});
