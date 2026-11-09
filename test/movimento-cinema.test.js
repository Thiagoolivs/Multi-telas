/*
 * O movimento de cinema (09/11): a peça "mais premium e animada".
 *
 * A peça DECLARA (data-entrada, data-continua, data-ordem, data-atraso,
 * data-origem) e o player EXECUTA (js/peca-render.js, coreografia). O que
 * estes testes guardam:
 *
 *   1. o vocabulário é um contrato: os nomes existem, têm rótulo de gente e
 *      a porta (js/peca-html.js) aceita só eles;
 *   2. o número que conta termina no texto ORIGINAL, letra por letra, e no
 *      caminho só os algarismos andam;
 *   3. só transform e opacity se animam, e tudo termina em repouso;
 *   4. a TV fraca e quem pediu menos movimento ganham o esmaecer simples;
 *   5. as trocas entre peças (dissolver, varredura): curtas, só transform e
 *      opacity, esmaecer na TV fraca, e a TV nova nasce com o dissolver.
 *
 * O desenho foi conferido no Chromium, em vídeo (tools/gravar-peca.mjs).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const A = require('../js/animacao.js');
const P = require('../js/peca-html.js');
const R = require('../js/peca-render.js');
const S = require('../js/storage.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const peca = (corpo) => '<section class="mt-peca">' + corpo + '</section>';

/* ---------------- 1. O vocabulário ---------------- */

const NOVAS = { revelar: 'Revelar por linha', varrer: 'Varrer', desenhar: 'Desenhar', contar: 'Contar até o número', aproximar: 'Aproximar' };
const CONTINUAS_NOVAS = { kenburns: 'Câmera lenta na foto', reflexo: 'Reflexo' };

test('o vocabulário de cinema existe, com o nome de gente, e só na peça em HTML', () => {
  for (const [id, label] of Object.entries(NOVAS)) {
    const e = A.ENTRADAS.find((x) => x.id === id);
    assert.ok(e, 'falta a entrada ' + id);
    assert.equal(e.label, label);
    assert.equal(e.soNaPeca, true, id + ' apareceria no editor de composição, que não sabe executá-la');
    assert.ok(e.dica && e.dica.length > 20, id + ' sem dica para quem escolhe');
  }
  for (const [id, label] of Object.entries(CONTINUAS_NOVAS)) {
    const c = A.CONTINUAS.find((x) => x.id === id);
    assert.ok(c, 'falta a contínua ' + id);
    assert.equal(c.label, label);
    assert.equal(c.soNaPeca, true);
  }
  assert.deepEqual(A.ORIGENS, ['esquerda', 'direita', 'cima', 'baixo']);
  // O editor de composição não oferece o que não executa.
  assert.match(ler('web/src/components/content/CompositionEditor.jsx'), /ENTRADAS\.filter\(\(x\) => !x\.soNaPeca\)/);
  assert.match(ler('web/src/components/content/CompositionEditor.jsx'), /CONTINUAS\.filter\(\(x\) => !x\.soNaPeca\)/);
  // E na peça, ela anima de verdade: keyframes para cada nome.
  for (const id of Object.keys(NOVAS)) assert.ok(R.ENTRADAS[id], 'sem keyframes: ' + id);
  for (const id of Object.keys(CONTINUAS_NOVAS)) assert.ok(R.CONTINUAS[id], 'sem keyframes: ' + id);
  // A IA que escreve a peça conhece os nomes (o compositor).
  const regras = ler('server/compositor.js');
  for (const id of Object.keys(NOVAS).concat(Object.keys(CONTINUAS_NOVAS))) assert.ok(regras.includes(id), 'o compositor não conhece ' + id);
  assert.match(regras, /data-origem="esquerda\|direita\|cima\|baixo"/);
});

test('a porta aceita o vocabulário novo e recusa o que não existe', () => {
  const ok = P.higienizar({ html: peca('<h1 data-campo="t" data-entrada="revelar" data-ordem="2" data-atraso="0.4">Oi</h1>'
    + '<div data-entrada="varrer" data-origem="direita"><i aria-hidden="true" data-entrada="desenhar" data-origem="cima"></i></div>'
    + '<p data-campo="p" data-entrada="contar" data-continua="reflexo">R$ 9,90</p>'
    + '<img data-campo-img="foto" alt="" data-entrada="aproximar" data-continua="kenburns" data-atraso="6">'), css: '' });
  assert.deepEqual(ok.problemas, []);
  for (const a of ['data-entrada="revelar"', 'data-origem="direita"', 'data-entrada="desenhar"', 'data-origem="cima"', 'data-entrada="contar"',
    'data-continua="reflexo"', 'data-continua="kenburns"', 'data-atraso="0.4"', 'data-atraso="6"']) {
    assert.ok(ok.html.includes(a), 'a porta tirou ' + a);
  }
  const ruins = [['data-entrada', 'revelar-palavra'], ['data-entrada', 'zoom'], ['data-continua', 'parallax'], ['data-continua', 'Kenburns'],
    ['data-origem', 'lado'], ['data-origem', ''], ['data-atraso', '7'], ['data-atraso', '-1'], ['data-atraso', '0.125'], ['data-atraso', 'logo'], ['data-atraso', '1e1']];
  for (const [attr, v] of ruins) {
    const r = P.higienizar({ html: peca('<p data-campo="t" ' + attr + '="' + v + '">x</p>'), css: '' });
    assert.ok(r.problemas.some((p) => p.includes(attr)), attr + '="' + v + '" passou pela porta');
    assert.ok(!r.html.includes(attr + '="' + v + '"'), attr + '="' + v + '" ficou na peça');
  }
  // Animar pelo CSS da peça continua proibido: quem anima é o player.
  const css = P.higienizar({ html: peca('<p data-campo="t">x</p>'), css: '.mt-peca p{animation:x 1s}' });
  assert.ok(css.problemas.some((p) => /data-entrada/.test(p)));
});

/* ---------------- 2. O número que conta ---------------- */

const NUMEROS = ['R$ 1.299,90', 'R$ 24,90', ',90', ',00', '389', '18.450', '30% OFF', '2d 04:15:09', 'Até as 15h', 'ou 10× de R$ 38,90', '1.000.000', '0', 'Desde 1987', 'sem número'];

test('contar: o fim é o texto original, letra por letra', () => {
  for (const s of NUMEROS) {
    assert.equal(R.contarTexto(s, 1), s);
    assert.equal(R.contarTexto(s, 7), s, 'passou do fim');
    assert.deepEqual(R.contarPartes(['R$', s, ' a unidade'], 1), ['R$', s, ' a unidade']);
  }
});

test('contar: no caminho só os algarismos andam (o resto do texto fica)', () => {
  const esqueleto = (t) => t.replace(/\d/g, '#').replace(/#+/g, '#');
  for (const s of NUMEROS) {
    for (const p of [0, 0.1, 0.37, 0.5, 0.93, 0.999]) {
      const t = R.contarTexto(s, p);
      assert.equal(t.replace(/[\d.]/g, ''), s.replace(/[\d.]/g, ''), s + ' em ' + p + ' virou ' + t);
      if (!/\.\d{3}/.test(s)) assert.equal(esqueleto(t), esqueleto(s), s + ' em ' + p + ': ' + t);
    }
  }
  assert.equal(R.contarTexto('R$ 1.299,90', 0), 'R$ 0,00');
  assert.equal(R.contarTexto('R$ 1.299,90', 0.5), 'R$ 649,95');
  // O milhar continua com ponto quando chega lá; os centavos, os minutos e o zero da frente guardam o zero.
  assert.match(R.contarTexto('R$ 1.299,90', 0.9), /^R\$ 1\.\d{3},\d{2}$/);
  assert.equal(R.contarTexto('2d 04:15:09', 0), '0d 00:00:00');
  assert.equal(R.contarTexto(',90', 0.05), ',04');
});

test('contar: o número sobe sem voltar e só chega no fim', () => {
  const valor = (t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
  for (const s of ['R$ 1.299,90', 'R$ 24,90', '18.450', '389']) {
    let antes = -1;
    for (let i = 0; i <= 100; i++) {
      const v = valor(R.contarTexto(s, i / 100));
      assert.ok(v >= antes, s + ' voltou em ' + i + '%');
      if (i < 100) assert.ok(v < valor(s), s + ' chegou antes do fim (' + i + '%)');
      antes = v;
    }
  }
});

test('contar: o preço em pedaços ("R$" · "24" · ",90") anda como UM número', () => {
  // Contados à parte, o 24 parava no 23 esperando o fim enquanto os centavos andavam (visto no vídeo).
  assert.deepEqual(R.contarPartes(['R$', '24', ',90'], 0), ['R$', '0', ',00']);
  assert.deepEqual(R.contarPartes(['R$', '24', ',90'], 0.5), ['R$', '12', ',45']);
  assert.deepEqual(R.contarPartes(['R$', '24', ',90'], 0.99), ['R$', '24', ',65']);
  assert.deepEqual(R.contarPartes(['R$ ', '1.299', ',90', ' à vista'], 0.5), ['R$ ', '649', ',95', ' à vista']);
  // Os pedaços sem número ficam como estão em qualquer passo.
  for (let i = 0; i <= 10; i++) {
    const t = R.contarPartes(['Leve ', '3', ' por R$ ', '10'], i / 10);
    assert.equal(t[0], 'Leve ');
    assert.equal(t[2], ' por R$ ');
  }
});

test('contar: toda peça-ouro que conta termina idêntica', () => {
  const arquivos = fs.readdirSync(path.join(RAIZ, 'pecas-ouro')).filter((f) => f.endsWith('.html'));
  let contam = 0;
  for (const f of arquivos) {
    const html = P.doArquivo(ler('pecas-ouro', f)).html;
    for (const m of html.matchAll(/<(\w+)[^>]*data-entrada="contar"[^>]*>([\s\S]*?)<\/\1>/g)) {
      contam++;
      const partes = m[2].replace(/<[^>]+>/g, '\u0000').split('\u0000').filter((x) => x !== '');
      assert.deepEqual(R.contarPartes(partes, 1), partes, f);
      assert.ok(/\d/.test(R.contarPartes(partes, 0).join('')), f + ': o número sumiu no começo');
    }
  }
  assert.ok(contam >= 5, 'as peças do lote 4 deixaram de contar: ' + contam);
});

/* ---------------- 3. Só transform e opacity, e o repouso ---------------- */

function blocos(css) {
  const out = {};
  for (const m of css.matchAll(/@keyframes ([\w-]+)\{((?:[^{}]*\{[^}]*\})*)\}/g)) out[m[1]] = m[2];
  return out;
}

test('as keyframes da peça só mexem em transform, opacity e nas propriedades individuais de movimento', () => {
  const k = blocos(R.keyframes());
  assert.ok(Object.keys(k).length >= 23, Object.keys(k).join(' '));
  for (const [nome, corpo] of Object.entries(k)) {
    const props = [...corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const p of props) assert.ok(['opacity', 'transform', 'translate', 'scale', 'rotate'].includes(p), nome + ' anima ' + p);
    assert.doesNotMatch(corpo, /filter|clip-path|blur|width|height|top|left/, nome);
  }
});

test('toda entrada de cinema termina em repouso', () => {
  const k = blocos(R.keyframes());
  for (const id of Object.keys(NOVAS)) {
    const corpo = k['mt-pe-' + id];
    assert.ok(corpo, id);
    // Só o "from": o fim é o estado da peça (sem deslocamento, sem transparência).
    assert.match(corpo, /^from\{[^}]*\}$/, id + ' declara um fim que não é o repouso: ' + corpo);
  }
  assert.match(k['mt-px-varrer-v'], /^from\{scale:1 0\}$/);
  assert.match(k['mt-px-desenhar-v'], /^from\{scale:1 0\}$/);
  // A linha da "revelar" (o elemento do player, não da peça): começa escondida abaixo da máscara e termina em none.
  assert.match(k['mt-px-linha'], /^from\{transform:translateY\(10\d%\)\}to\{transform:none\}$/);
  // A luz do reflexo atravessa e SAI (é tirada no fim); a câmera lenta vai e volta (contínua, como flutuar).
  assert.match(k['mt-pc-reflexo'], /translateX\(-\d+%\)[^}]*\}to\{transform:translateX\(\d{3}%\)/);
  assert.match(k['mt-pc-kenburns'], /^from\{transform:none\}to\{transform:scale\(1\.08\)\}$/);
});

/* ---------------- O que cada elemento ganha ---------------- */

const anim = (a, modo, espera, m) => R.animacaoDoElemento(a, modo || 'completo', espera || 0, m || {});

test('cada entrada de cinema vira a animação certa, na vez dela', () => {
  assert.match(anim({ entrada: 'aproximar' }).animacao, /^mt-pe-aproximar 1\.2s cubic-bezier\([^)]+\) 0\.15s both$/);
  assert.equal(anim({ entrada: 'subir', ordem: '2' }).inicio.toFixed(2), '0.45');
  // data-atraso soma à vez do data-ordem; a espera da transição também.
  assert.equal(anim({ entrada: 'subir', ordem: '2', atraso: '0.4' }).inicio.toFixed(2), '0.85');
  assert.equal(anim({ entrada: 'subir', ordem: '2', atraso: '0.4' }, 'completo', 0.35).inicio.toFixed(2), '1.20');
  assert.equal(anim({ entrada: 'subir', atraso: '99' }).inicio.toFixed(2), '6.15', 'o atraso tem teto');
  // A varrer abre da borda pedida; sem pedido, da esquerda. Cima e baixo trocam o eixo.
  assert.deepEqual([anim({ entrada: 'varrer' }).origem, anim({ entrada: 'varrer', origem: 'direita' }).origem], ['0% 50%', '100% 50%']);
  assert.match(anim({ entrada: 'varrer', origem: 'baixo' }).animacao, /^mt-px-varrer-v /);
  assert.equal(anim({ entrada: 'varrer', origem: 'baixo' }).origem, '50% 100%');
  // A desenhar segue o traço: o filete em pé (medido) desce de cima.
  assert.match(anim({ entrada: 'desenhar' }, 'completo', 0, { vertical: true }).animacao, /^mt-px-desenhar-v /);
  assert.equal(anim({ entrada: 'desenhar' }, 'completo', 0, { vertical: true }).origem, '50% 0%');
  assert.match(anim({ entrada: 'desenhar', origem: 'direita' }, 'completo', 0, { vertical: true }).animacao, /^mt-pe-desenhar /);
  // Revelada em linhas, quem anima são as máscaras: o elemento fica parado; sem medida, a reserva.
  assert.equal(anim({ entrada: 'revelar' }, 'completo', 0, { linhas: 3 }).animacao, '');
  assert.equal(anim({ entrada: 'revelar' }, 'completo', 0, { linhas: 3 }).fim.toFixed(2), (0.15 + 0.95 + 2 * 0.09).toFixed(2));
  assert.match(anim({ entrada: 'revelar' }).animacao, /^mt-pe-revelar /);
  // A contar esmaece rápido e termina quando o número chega.
  assert.match(anim({ entrada: 'contar' }).animacao, /^mt-pe-contar 0\.45s /);
  assert.equal(anim({ entrada: 'contar' }).fim.toFixed(2), '1.65');
});

test('as contínuas: a de sempre depois da entrada; a câmera lenta só com a foto medida; o reflexo não é animação do elemento', () => {
  const f = anim({ entrada: 'contar', continua: 'pulsar', ordem: '1' });
  assert.match(f.animacao, /mt-pc-pulsar 3\.6s ease-in-out 1\.8s infinite$/, 'a contínua começou antes de o número chegar');
  assert.equal(anim({ continua: 'kenburns' }).animacao, '', 'sem saber para onde a foto pode crescer, ela fica parada');
  assert.match(anim({ entrada: 'aproximar', continua: 'kenburns' }, 'completo', 0, { kenburns: { duracao: 12 } }).animacao,
    /^mt-pe-aproximar 1\.2s cubic-bezier\([^)]+\) 0\.15s both,mt-pc-kenburns 12s cubic-bezier\([^)]+\) 0\.15s infinite alternate both$/);
  assert.equal(anim({ entrada: 'aparecer', continua: 'reflexo' }).animacao.indexOf('reflexo'), -1);
});

/* ---------------- 4. A TV fraca e quem pediu menos movimento ---------------- */

test('modo leve: toda entrada vira esmaecer, e nada contínuo nem de cinema', () => {
  for (const entrada of Object.keys(R.ENTRADAS)) {
    const r = anim({ entrada, continua: 'kenburns', ordem: '3' }, 'simples', 0, { kenburns: { duracao: 12 }, linhas: 2, vertical: true });
    assert.equal(r.animacao, 'mt-pe-aparecer 0.6s ease-out 0.6s both', entrada);
    assert.equal(r.origem, null);
  }
  for (const continua of Object.keys(R.CONTINUAS)) assert.equal(anim({ continua }, 'simples').animacao, '', continua + ' roda na TV fraca');
  // Parado (a miniatura do painel): nada.
  assert.equal(anim({ entrada: 'revelar', continua: 'flutuar' }, 'parado').animacao, '');
});

test('quem decide o jeito: a TV fraca pede o simples; quem pediu menos movimento também; a miniatura fica parada', () => {
  assert.equal(R.movimentoDe({}), 'completo');
  assert.equal(R.movimentoDe({ movimento: 'simples' }), 'simples');
  assert.equal(R.movimentoDe({ leve: true }), 'parado', 'o painel pede `leve` e espera a peça parada');
  assert.equal(R.movimentoDe({ leve: true, movimento: 'simples' }), 'simples');
  assert.equal(R.movimentoDe({}, true), 'simples', 'prefers-reduced-motion');
  assert.equal(R.movimentoDe({ leve: true }, true), 'parado');
  // A TV passa o simples no modo leve (js/render.js); o painel continua com `leve`.
  assert.match(ler('js/render.js'), /movimento: document\.documentElement\.classList\.contains\('mt-perf'\) \? 'simples' : 'completo'/);
  assert.match(ler('web/src/lib/rasterizar.js'), /leve: true/);
  // E o montar respeita o pedido do sistema.
  assert.match(ler('js/peca-render.js'), /movimentoDe\(o, pedeMenosMovimento\(/);
  assert.match(ler('js/peca-render.js'), /\(prefers-reduced-motion: reduce\)/);
});

/* ---------------- A foto que cresce ---------------- */

test('a câmera lenta só cresce para o lado em que a foto é cortada, e em direção ao foco', () => {
  const todos = { esquerda: true, direita: true, cima: true, baixo: true };
  assert.deepEqual(R.origemDaFoto(todos, null), { x: 0.5, y: 0.5 });
  assert.deepEqual(R.origemDaFoto(todos, { x: 0.2, y: 0.8 }), { x: 0.2, y: 0.8 });
  // Encostada só na borda da esquerda: a borda da direita (o texto ao lado) fica presa.
  assert.deepEqual(R.origemDaFoto({ esquerda: true, cima: true, baixo: true }, { x: 0.2, y: 0.3 }), { x: 1, y: 0.3 });
  assert.deepEqual(R.origemDaFoto({ direita: true, cima: true, baixo: true }), { x: 0, y: 0.5 });
  assert.deepEqual(R.origemDaFoto({ esquerda: true, direita: true, baixo: true }), { x: 0.5, y: 0 });
  // Num cartão solto, não cresce.
  assert.equal(R.origemDaFoto({ cima: true, baixo: true }), null);
  assert.equal(R.origemDaFoto({}), null);
});

test('o número anda num relógio de 50 ms, e não a cada quadro', () => {
  /*
   * Um requestAnimationFrame vivo obriga a linha principal a montar um
   * quadro a cada 16 ms (estilo, pintura, envio ao compositor) — medido com
   * a CPU 4× mais lenta, era o que fazia a entrada perder quadros. As
   * entradas andam no compositor; o número troca 20 vezes por segundo.
   */
  const src = ler('js/peca-render.js');
  const coreo = src.slice(src.indexOf('function coreografia('), src.indexOf('function montar(')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(coreo, /requestAnimationFrame/);
  assert.match(coreo, /andando = setTimeout\(andar, /);
  assert.equal(R.CINEMA.passo, 0.05);
});

test('as camadas do player não entram na conta do piso nem do detector da bancada', () => {
  const src = ler('js/peca-render.js');
  assert.match(src, /const CAMADAS = 'mt-revelar,mt-luz';/);
  assert.match(src, /querySelectorAll\('\[data-campo\],\[data-vivo\],\[data-campo-qr\]'\), \(el\) => !camadaDoPlayer\(el\)\)/);
  assert.match(src, /if \(camadaDoPlayer\(el\)\) continue;/);
  // O detector adianta tudo para o repouso antes de medir.
  assert.match(ler('js/peca-conferir.js'), /host\.dispatchEvent\(new CustomEvent\('mt:repouso'\)\)/);
  assert.match(src, /host\.addEventListener\('mt:repouso', repousar\)/);
  // As máscaras são de enfeite para o leitor de tela; o original fica no lugar (visibility), não sai do layout.
  assert.match(src, /camada\.setAttribute\('aria-hidden', 'true'\);/);
  assert.match(src, /por\(el, 'visibility', 'hidden'\);/);
  assert.doesNotMatch(src.slice(src.indexOf('function coreografia(')), /display:\s*none|removeChild\(el\)/);
});

/* ---------------- 5. A troca entre peças ---------------- */

const PLAYER = ler('js/player.js');
function trecho(inicio) {
  const i = PLAYER.indexOf(inicio);
  assert.ok(i >= 0, 'sumiu do player: ' + inicio);
  return PLAYER.slice(i, PLAYER.indexOf('\n  }', i) + 4);
}

test('dissolver e varredura: curtas como a régua pede, e só transform e opacity', () => {
  const dur = vm.runInNewContext('(' + /const TRANS_DUR = (\{[^}]*\})/.exec(PLAYER)[1] + ')');
  for (const [k, v] of Object.entries(dur)) if (k !== 'none') assert.ok(v >= 0.4 && v <= 0.7, k + ': ' + v + ' s');
  assert.equal(dur.dissolver, 0.7);
  assert.match(PLAYER, /dissolver: \{ opacity: 0, scale: 1\.03 \}/);
  const v = trecho('function varredura(');
  assert.doesNotMatch(v.replace(/\/\*[\s\S]*?\*\//g, ''), /width|height|left|top|filter|clipPath|clip-path/, 'a varredura anima o que não é transform/opacity');
  assert.match(v, /xPercent: -101/);
  assert.match(v, /duration: 0\.28[^\n]*stagger: 0\.05/);
  assert.match(v, /duration: 0\.32[^\n]*stagger: 0\.05/);
  // As faixas na cor da marca, por cima do slide, cortadas pela zona.
  const css = ler('css/player.css');
  assert.match(css, /\.mt-varredura \{[^}]*z-index: 5;[^}]*background: var\(--brand, #5b2eff\);/);
  assert.match(css, /\.mt-varredura-2 \{ background: var\(--brand-2/);
  assert.match(css, /\.mt-trans-dissolver \{[^}]*transform: scale\(1\.03\);/);
});

test('na TV fraca e para quem pediu menos movimento, toda troca vira esmaecer ("nenhuma" continua seca)', () => {
  const rodar = (classe, menos, tipo) => vm.runInNewContext(trecho('function transicaoNaTela(') + '\ntransicaoNaTela(' + JSON.stringify(tipo) + ');', {
    document: { documentElement: { classList: { contains: (c) => c === classe } } },
    window: { matchMedia: () => ({ matches: menos }) },
  });
  for (const t of ['dissolver', 'varredura', 'cinematic', 'slide', 'zoom', 'fade']) {
    assert.equal(rodar('mt-perf', false, t), 'fade', t + ' na TV fraca');
    assert.equal(rodar('', true, t), 'fade', t + ' com menos movimento');
    assert.equal(rodar('', false, t), t);
  }
  assert.equal(rodar('mt-perf', false, 'none'), 'none');
  assert.equal(rodar('', false, undefined), 'fade');
});

test('a peça pronta passa pelo dissolver e pela varredura, e as entradas dela esperam a troca', () => {
  const entrar = trecho('function enterSlide(');
  assert.match(entrar, /if \(type === 'dissolver' \|\| type === 'varredura'\) entrarPeca\(el, transicaoNaTela\(type\)\);/);
  const ep = trecho('function entrarPeca(');
  assert.match(ep, /el\.setAttribute\('data-mt-espera', String\(TRANSICOES_DA_PECA\[tipo\] \|\| 0\)\);/);
  assert.match(PLAYER, /const TRANSICOES_DA_PECA = \{ dissolver: 0\.35, varredura: 0\.4, fade: 0 \};/);
  // A peça lê a espera no slide (o ancestral) e soma à vez de cada elemento.
  assert.match(ler('js/peca-render.js'), /host\.closest\('\[data-mt-espera\]'\)/);
  // O que sai: na varredura, fica até as faixas cobrirem; no dissolver, cede no fim.
  const sai = trecho('function leaveSlide(');
  assert.match(sai, /if \(tipo === 'varredura'\) \{ setTimeout\(\(\) => prev\.el\.remove\(\), 360\); return; \}/);
  assert.match(sai, /ease: 'power1\.in'/);
  assert.match(PLAYER, /if \(prev\) leaveSlide\(prev, transition\);/);
});

test('a TV nova nasce com o dissolver; a de antes continua com a que tinha', () => {
  assert.match(ler('web/src/lib/contentTypes.js'), /transicao: 'dissolver',/);
  // A config velha sem transição (normalize) não muda sozinha.
  assert.equal(S.settingsPadrao().transicao, 'cinematic');
  assert.equal(S.normalize({ settings: { transicao: 'fade' } }).settings.transicao, 'fade');
  assert.equal(S.normalize({ settings: {} }).settings.transicao, 'cinematic');
  // O painel oferece as duas, com nome de gente, na Aparência, com a miniatura.
  const sc = ler('web/src/lib/screenConfig.js');
  assert.match(sc, /\{ value: 'dissolver', label: 'Dissolver',/);
  assert.match(sc, /\{ value: 'varredura', label: 'Varredura',/);
  const form = ler('web/src/components/content/SettingsForm.jsx');
  const aparencia = form.slice(form.indexOf("{aba === 'aparencia' && ("), form.indexOf("{aba === 'encaixe' && ("));
  assert.match(aparencia, /<TransicaoDaTela valor=\{s\.transicao\} onChange=\{\(v\) => set\(\{ transicao: v \}\)\}/);
  assert.doesNotMatch(form.slice(form.indexOf("{aba === 'avancado' && (")), /transicao/, 'a transição ficou duplicada no Avançado');
  const previa = ler('web/src/components/content/TransicaoDaTela.jsx');
  for (const m of previa.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\}\n/g)) assert.doesNotMatch(m[1], /width|height|left|top|filter|clip/, 'a miniatura anima layout');
  assert.match(previa, /prefers-reduced-motion: reduce/);
});

/* ---------------- As peças coreografadas ---------------- */

test('as seis peças do lote 4 usam o movimento de cinema e passam pela porta', () => {
  const usa = (html, a) => html.includes(a);
  const pecas = {
    'capa-produto': ['data-entrada="aproximar" data-continua="kenburns"', 'data-entrada="varrer" data-origem="direita"', 'data-entrada="desenhar"', 'data-entrada="revelar"', 'data-entrada="contar" data-continua="reflexo"'],
    'capa-casa': ['data-continua="kenburns"', 'data-entrada="varrer" data-origem="esquerda"', 'data-entrada="desenhar"', 'data-entrada="revelar"'],
    'numero-preco': ['data-continua="kenburns"', 'data-entrada="revelar"', 'data-entrada="contar" data-continua="reflexo"'],
    'diptico-oferta': ['data-continua="kenburns"', 'data-entrada="revelar"', 'data-entrada="contar" data-continua="reflexo"'],
    'editorial-citacao': ['data-continua="kenburns"', 'data-entrada="revelar"'],
    'cardapio-trio': ['data-entrada="revelar"', 'data-entrada="contar"', 'data-entrada="aproximar"'],
  };
  for (const [id, attrs] of Object.entries(pecas)) {
    const arq = P.doArquivo(ler('pecas-ouro', id + '.html'));
    const r = P.higienizar(arq);
    assert.deepEqual(r.problemas, [], id);
    for (const a of attrs) assert.ok(usa(r.html, a), id + ' sem ' + a);
  }
});

test('a ferramenta de gravação existe e fala a língua da bancada', () => {
  const g = ler('tools/gravar-peca.mjs');
  for (const op of ['--peca', '--marca', '--formato', '--local', '--saida', '--quadros', '--cpu', '--de']) assert.ok(g.includes(op), op);
  assert.match(g, /Performance\.getMetrics/);
  assert.match(g, /recordVideo/);
  assert.match(g, /'libx264'/);
  assert.match(g, /Emulation\.setCPUThrottlingRate/);
  // Os mesmos scripts da bancada e da TV para desenhar a peça.
  assert.match(g, /\['cor', 'fontes', 'animacao', 'templates', 'tokens', 'peca-html', 'peca-render'\]/);
});
