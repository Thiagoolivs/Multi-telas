/*
 * Copiar formatação — o pincel.
 *
 * O que estes testes protegem não é a existência do recurso, é a regra que
 * decide se ele ajuda ou atrapalha: o pincel NÃO pode mover, NÃO pode
 * redimensionar, NÃO pode trocar o conteúdo — e não pode deixar resíduo do
 * que havia antes no destino.
 *
 * O caso perigoso tem nome: `peso`. No texto é a espessura da FONTE (100–900),
 * no ícone é a espessura do TRAÇO (1–3). Copiar de um para o outro deixa o
 * ícone com traço 800, e o SVG some da tela. É o tipo de defeito que passa
 * despercebido em revisão porque a propriedade se chama igual nos dois.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const carregar = () => import('../web/src/lib/formato.js');

const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const EDITOR = semComentarios(fs.readFileSync(
  path.join(__dirname, '..', 'web', 'src', 'components', 'content', 'CompositionEditor.jsx'), 'utf8'));

const TEXTO = {
  id: 'a', tipo: 'texto', text: 'PROMOÇÃO', x: 10, y: 20, w: 40, h: 15, rot: 12,
  cor: '#ff0000', fonte: 'condensada', peso: 900, tamanho: 8, align: 'left',
  italico: true, caixaAlta: true, espacamento: 0.05, entrelinha: 1.1,
  opacidade: 0.8, sombra: { cor: '#000', desf: 3, x: 1, y: 2 }, radius: 4,
};

test('o pincel não mexe em posição, tamanho nem rotação', async () => {
  const F = await carregar();
  const destino = { id: 'b', tipo: 'texto', text: 'outro', x: 70, y: 5, w: 20, h: 8, rot: 0 };
  const p = F.aplicarFormato(destino, F.lerFormato(TEXTO));
  ['x', 'y', 'w', 'h', 'rot'].forEach((k) => {
    assert.ok(!(k in p), 'o pincel mexeu em ' + k + ', e mover não é formatar');
  });
});

test('o pincel não troca o conteúdo do elemento', async () => {
  const F = await carregar();
  const destino = { id: 'b', tipo: 'texto', text: 'outro' };
  const p = F.aplicarFormato(destino, F.lerFormato(TEXTO));
  assert.ok(!('text' in p), 'o texto do destino foi substituído');

  const forma = { id: 'c', tipo: 'forma', shape: 'ellipse', fill: '#000' };
  const q = F.aplicarFormato(forma, F.lerFormato({ id: 'd', tipo: 'forma', shape: 'rect', fill: '#0f0' }));
  assert.ok(!('shape' in q), 'a elipse virou retângulo — o pincel trocou o desenho');
  assert.equal(q.fill, '#0f0');
});

test('entre texto e ícone, `peso` NÃO atravessa', async () => {
  const F = await carregar();
  // peso 900 num ícone é traço 900: o SVG vira uma mancha sólida.
  const icone = { id: 'i', tipo: 'icone', name: 'star', peso: 1.6, cor: '#fff' };
  const p = F.aplicarFormato(icone, F.lerFormato(TEXTO));
  assert.ok(!('peso' in p), 'a espessura da fonte vazou para o traço do ícone');
  assert.ok(!('fonte' in p), 'ícone não tem fonte');
});

test('entre elementos do mesmo tipo, tudo o que é estilo atravessa', async () => {
  const F = await carregar();
  const destino = { id: 'b', tipo: 'texto', text: 'outro', cor: '#000', peso: 400 };
  const p = F.aplicarFormato(destino, F.lerFormato(TEXTO));
  assert.equal(p.cor, '#ff0000');
  assert.equal(p.peso, 900);
  assert.equal(p.fonte, 'condensada');
  assert.equal(p.italico, true);
  assert.equal(p.entrelinha, 1.1);
  assert.equal(p.align, 'left');
});

test('o que atravessa entre tipos diferentes é o que significa a mesma coisa', async () => {
  const F = await carregar();
  const forma = { id: 'f', tipo: 'forma', fill: '#123456', opacidade: 1 };
  const p = F.aplicarFormato(forma, F.lerFormato(TEXTO));
  assert.equal(p.opacidade, 0.8);
  assert.equal(p.radius, 4);
  assert.deepEqual(p.sombra, TEXTO.sombra);
  assert.ok(!('fill' in p), 'o preenchimento da forma foi apagado por um molde de texto');
});

test('propriedade ausente na origem é APAGADA no destino', async () => {
  const F = await carregar();
  // Sem isto o pincel deixa resíduo: o destino fica com a sombra antiga e o
  // resultado não é igual ao que se apontou, que é a única promessa dele.
  const semSombra = { id: 'x', tipo: 'texto', cor: '#fff' };
  const destino = { id: 'y', tipo: 'texto', cor: '#000', sombra: { cor: '#000', desf: 9 } };
  const p = F.aplicarFormato(destino, F.lerFormato(semSombra));
  assert.ok('sombra' in p, 'a sombra nem foi considerada');
  assert.equal(p.sombra, undefined, 'sobrou a sombra antiga do destino');
});

test('o molde é uma cópia — mexer no original depois não muda o pincel', async () => {
  const F = await carregar();
  const origem = { id: 'a', tipo: 'texto', sombra: { cor: '#000', desf: 3 } };
  const molde = F.lerFormato(origem);
  origem.sombra.desf = 99;
  const p = F.aplicarFormato({ id: 'b', tipo: 'texto' }, molde);
  assert.equal(p.sombra.desf, 3, 'o molde guardou referência, não cópia');
});

test('não pinta o próprio elemento de onde o molde saiu', async () => {
  const F = await carregar();
  const molde = F.lerFormato(TEXTO);
  assert.equal(molde.id, 'a');
  assert.equal(F.podeAplicar(TEXTO, molde), false);
  assert.equal(F.podeAplicar({ id: 'b', tipo: 'texto' }, molde), true);
});

/* ---- e a ligação no editor, que é onde isto vira gesto ---- */

test('o editor arma o pincel e pinta no clique', () => {
  assert.match(EDITOR, /const \[pincel, setPincel\]/, 'sumiu o estado do pincel');
  assert.match(EDITOR, /pegarFormato/, 'sumiu a função que pega o molde');
  assert.match(EDITOR, /if \(pincel && pintarFormato\(e\.id, ev\.altKey\)\) return;/,
    'o clique no palco deixou de pintar com o pincel armado');
});

test('Alt mantém o pincel armado para pintar vários', () => {
  assert.match(EDITOR, /if \(!manter\) setPincel\(null\);/,
    'o pincel deixou de continuar armado com Alt');
});

test('Esc desarma o pincel antes de qualquer outra coisa', () => {
  const i = EDITOR.indexOf("ev.key === 'Escape'");
  assert.ok(i > 0, 'sumiu o tratamento do Esc');
  const bloco = EDITOR.slice(i, i + 300);
  assert.match(bloco, /if \(pincel\) \{ setPincel\(null\); return; \}/,
    'Esc deixou de desarmar o pincel');
});

test('Alt+arrastar duplica, e o botão diz isso', () => {
  assert.match(EDITOR, /duplicar:' \+ alvo\.id/, 'sumiu a duplicação por Alt+arrastar');
  assert.match(EDITOR, /Duplicar \(Ctrl\+D, ou Alt\+arrastar\)/, 'o atalho não está anunciado');
});

test('as réguas e a margem de segurança têm botão', () => {
  assert.match(EDITOR, /const \[guiasFixas, setGuiasFixas\]/, 'sumiu o estado das guias');
  assert.match(EDITOR, /setGuiasFixas\(\(g\) => !g\)/, 'as guias ficaram sem botão para ligar');
  assert.match(EDITOR, /left: '5%', top: '5%', right: '5%', bottom: '5%'/,
    'sumiu a margem de segurança de 5% (overscan)');
});

test('não sobrou código de depuração no editor', () => {
  // Já aconteceu: um `window.__dbg` foi mergeado e ficou rodando em produção.
  assert.ok(!/window\.__dbg/.test(EDITOR), 'voltou código de depuração');
  assert.ok(!/console\.log/.test(EDITOR), 'sobrou console.log');
});
