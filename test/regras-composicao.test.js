/*
 * As regras de composição por tipo (D44): js/regras-composicao.js.
 *
 * As partes puras — a cor de um gradiente num ponto, o contraste no pior
 * caso da foto, a régua aplicada às medidas — testadas aqui. A medição na
 * peça montada (js/peca-conferir.js) roda no navegador: a bancada e o
 * painel.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/regras-composicao.js');

const ler = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
// No teste, a cor vem só em rgb()/rgba() — no navegador é um pixel de canvas.
const lerCor = (s) => {
  const m = /^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/.exec(s);
  return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null;
};
const PRETO = { r: 0, g: 0, b: 0, a: 1 };
const BRANCO = { r: 255, g: 255, b: 255, a: 1 };
const perto = (a, b, tol) => Math.abs(a - b) <= (tol || 1.5);

test('contraste é o da WCAG: preto no branco 21:1, igual com igual 1:1', () => {
  assert.equal(Math.round(R.contraste(PRETO, BRANCO)), 21);
  assert.equal(R.contraste(BRANCO, BRANCO), 1);
  // Meio cinza (#777) no branco: 4,48 — o limite clássico.
  assert.ok(perto(R.contraste({ r: 119, g: 119, b: 119, a: 1 }, BRANCO), 4.48, 0.02));
});

test('camada translúcida sobre outra: a mistura do alfa', () => {
  const meio = R.sobre({ r: 0, g: 0, b: 0, a: 0.5 }, BRANCO);
  assert.ok(perto(meio.r, 127.5) && meio.a === 1);
  assert.deepEqual(R.sobre({ r: 9, g: 9, b: 9, a: 0 }, BRANCO), BRANCO);
});

test('lerGradientes: camadas, direção e paradas do valor calculado', () => {
  const gs = R.lerGradientes('linear-gradient(90deg, rgb(10, 10, 10) 40%, rgba(10, 10, 10, 0) 68%), radial-gradient(120% 100% at 0% 0%, rgb(1, 2, 3), rgb(4, 5, 6) 62%)', lerCor);
  assert.equal(gs.length, 2);
  assert.equal(gs[0].tipo, 'linear');
  assert.equal(gs[0].dir.graus, 90);
  assert.deepEqual(gs[0].paradas.map((p) => p.pos), [0.4, 0.68]);
  // A forma do radial não é cor: fica de fora.
  assert.equal(gs[1].tipo, 'media');
  assert.equal(gs[1].paradas.length, 2);
  assert.deepEqual(R.lerGradientes('none', lerCor), []);
  assert.deepEqual(R.lerGradientes('url("x.png")', lerCor), [null]);
  assert.deepEqual(R.lerGradientes('linear-gradient(to top right, rgb(0, 0, 0), rgb(255, 255, 255))', lerCor)[0].dir, { canto: [1, -1] });
});

test('corNoGradiente: a geometria do CSS (o véu da oferta com foto)', () => {
  const veu = R.lerGradientes('linear-gradient(90deg, rgb(10, 10, 10) 40%, rgba(10, 10, 10, 0) 68%)', lerCor)[0];
  // Antes de 40% da largura, o véu é cheio; depois de 68%, some; no meio, metade.
  assert.equal(R.corNoGradiente(veu, 1000, 500, 0.2, 0.5).a, 1);
  assert.equal(R.corNoGradiente(veu, 1000, 500, 0.9, 0.5).a, 0);
  assert.ok(perto(R.corNoGradiente(veu, 1000, 500, 0.54, 0.1).a, 0.5, 0.01));
  // 0deg é de baixo para cima: em cima é a última parada.
  const sobe = R.lerGradientes('linear-gradient(0deg, rgb(0, 0, 0), rgb(255, 255, 255))', lerCor)[0];
  assert.ok(perto(R.corNoGradiente(sobe, 100, 100, 0.5, 0).r, 255));
  assert.ok(perto(R.corNoGradiente(sobe, 100, 100, 0.5, 1).r, 0));
  // Sem direção, para baixo; sem posição, as paradas se espalham por igual.
  const tres = R.lerGradientes('linear-gradient(rgb(0, 0, 0), rgb(100, 100, 100), rgb(200, 200, 200))', lerCor)[0];
  assert.ok(perto(R.corNoGradiente(tres, 100, 100, 0.5, 0.5).r, 100));
  assert.ok(perto(R.corNoGradiente(tres, 100, 100, 0.5, 0.75).r, 150));
  // Posição em px vira fração do comprimento da linha.
  const px = R.lerGradientes('linear-gradient(90deg, rgb(0, 0, 0) 50px, rgb(255, 255, 255) 50px)', lerCor)[0];
  assert.equal(R.corNoGradiente(px, 200, 100, 0.2, 0.5).r, 0);
  assert.equal(R.corNoGradiente(px, 200, 100, 0.3, 0.5).r, 255);
  // Canto: "to bottom right" numa caixa quadrada vai de um canto ao outro.
  const canto = R.lerGradientes('linear-gradient(to bottom right, rgb(0, 0, 0), rgb(255, 255, 255))', lerCor)[0];
  assert.ok(perto(R.corNoGradiente(canto, 100, 100, 0, 0).r, 0) && perto(R.corNoGradiente(canto, 100, 100, 1, 1).r, 255));
});

test('texto sobre foto: o pior caso (foto preta e foto branca) com e sem véu', () => {
  const texto = BRANCO;
  // Sem véu, o pior caso é a foto branca: branco no branco.
  assert.equal(R.piorContraste(texto, R.fundos([], true)), 1);
  // Véu escuro a 85%: mesmo com a foto toda branca, o texto branco se lê.
  const veu = { r: 15, g: 15, b: 20, a: 0.85 };
  assert.ok(R.piorContraste(texto, R.fundos([veu], true)) > 7);
  // Véu fraco (35%): não basta.
  assert.ok(R.piorContraste(texto, R.fundos([{ r: 15, g: 15, b: 20, a: 0.35 }], true)) < 3);
  // Sem foto, um caso só (a TV apagada por baixo).
  assert.equal(R.fundos([BRANCO], false).length, 1);
});

const PECA = { papel: 'destaque', w: 1405, h: 832 };
const linha = (left, top, right, bottom) => ({ left, top, right, bottom });

test('avaliar: letra mínima, margem e contraste', () => {
  const ok = { nome: 'titulo', px: 80, linhas: [linha(84, 200, 700, 290)], contraste: 12, sobreFoto: false };
  assert.deepEqual(R.avaliar(Object.assign({}, PECA, { textos: [ok], qrs: [] })), []);

  const achados = R.avaliar(Object.assign({}, PECA, { textos: [
    { nome: 'de', px: 11, linhas: [linha(84, 600, 200, 612)], contraste: 9 },
    { nome: 'cta', px: 20, linhas: [linha(10, 780, 300, 800)], contraste: 9 },
    // Abaixo de 3:1 é o par de cores errado (os tokens garantem 3:1 ou mais).
    { nome: 'apoio', px: 20, linhas: [linha(84, 400, 600, 420)], contraste: 2.1 },
    { nome: 'preco', px: 120, linhas: [linha(84, 450, 600, 570)], contraste: 3.4 },
    { nome: 'kicker', px: 18, linhas: [linha(84, 100, 400, 118)], contraste: 1.4, sobreFoto: true },
    // Fora da peça é vazamento (outra régua): a margem não acusa de novo.
    { nome: 'vazou', px: 30, linhas: [linha(-20, 300, 200, 330)], contraste: 9 },
  ], qrs: [] }));
  assert.deepEqual(achados.map((a) => a.regra + ':' + a.campo), ['letra:de', 'margem:cta', 'contraste:apoio', 'foto:kicker']);
  assert.match(achados[0].texto, /11px \(o mínimo é 14px\)/);
  assert.match(achados[1].texto, /encostado na borda \(10px dela\)/);
  assert.match(achados[3].texto, /sobre a foto sem véu/);
  // Faixa: em cima e embaixo o piso é menor (6px), dos lados é o mesmo.
  const faixa = (l) => R.avaliar({ papel: 'cabecalho', w: 1920, h: 130, textos: [{ nome: 'chamada', px: 40, linhas: [l], contraste: 9 }], qrs: [] }).map((a) => a.regra);
  assert.deepEqual(faixa(linha(40, 8, 900, 122)), []);
  assert.deepEqual(faixa(linha(40, 3, 900, 60)), ['margem']);
});

test('avaliar: o número da oferta é o maior texto (empate vale)', () => {
  const peca = (textos) => R.avaliar(Object.assign({}, PECA, { textos, qrs: [] })).filter((a) => a.regra === 'hierarquia');
  const t = (nome, px) => ({ nome, px, linhas: [linha(84, 300, 600, 300 + px)], contraste: 9 });
  assert.deepEqual(peca([t('titulo', 84), t('preco', 120), t('centavos', 40)]), []);
  assert.deepEqual(peca([t('titulo', 84), t('preco', 84)]), []);
  // O "30% OFF" grande e o preço menor: o número da oferta é o "oferta" — vale.
  assert.deepEqual(peca([t('oferta', 160), t('preco', 87), t('titulo', 62)]), []);
  const ruim = peca([t('titulo', 130), t('preco', 90)]);
  assert.equal(ruim.length, 1);
  assert.match(ruim[0].texto, /o número da oferta \(90px\) é menor que "titulo" \(130px\)/);
  // Sem número na peça, a regra não se aplica.
  assert.deepEqual(peca([t('titulo', 130), t('apoio', 30)]), []);
});

test('avaliar: QR pequeno, cortado ou numa faixa; um achado por regra e campo', () => {
  const qr = (lado, caixa) => ({ nome: 'link', lado, caixa: caixa || linha(100, 100, 100 + lado, 100 + lado) });
  const em = (papel, w, h, qrs, textos) => R.avaliar({ papel, w, h, textos: textos || [], qrs }).map((a) => a.regra);
  assert.deepEqual(em('lateral', 515, 832, [qr(180)]), []);
  assert.deepEqual(em('lateral', 515, 832, [qr(140)]), ['qr-pequeno']);
  assert.deepEqual(em('destaque', 1405, 832, [qr(260, linha(1300, 100, 1560, 360))]), ['qr-cortado']);
  assert.deepEqual(em('cabecalho', 1920, 130, [qr(110, linha(10, 10, 120, 120))]), ['qr-faixa']);
  const duas = [{ nome: 'apoio', px: 10, linhas: [linha(84, 100, 300, 110)] }, { nome: 'apoio', px: 9, linhas: [linha(84, 120, 300, 130)] }];
  assert.deepEqual(em('destaque', 1405, 832, [], duas), ['letra']);
});

test('paraIA: as regras chegam ao gerador em cq, por papel', () => {
  const d = R.paraIA('destaque');
  assert.match(d, /Letra mínima: 1cqw \(14px na TV\)/);
  assert.match(d, /QR \(data-campo-qr\) com lado de pelo menos 19\.2cqmin \(160px na TV\)/);
  assert.match(d, /o número é o MAIOR texto da peça/);
  assert.match(R.paraIA('lateral'), /Letra mínima: 2\.7cqw/);
  assert.match(R.paraIA('lateral'), /3\.1cqw das laterais/);
  const cab = R.paraIA('cabecalho');
  assert.match(cab, /Sem QR nesta faixa/);
  assert.doesNotMatch(cab, /sobre foto|MAIOR texto/);
  assert.match(R.paraIA('rodape'), /5cqh do topo e da base/);
});

test('o detector e a bancada usam as regras; o painel carrega o módulo antes do detector', () => {
  const c = ler('js', 'peca-conferir.js');
  assert.match(c, /globalThis\.MTRegras/);
  assert.match(c, /R\.avaliar\(medidas\)/);
  assert.match(ler('bancada.html'), /<script src="\/js\/regras-composicao\.js"><\/script>\s*<script src="\/js\/peca-conferir\.js">/);
  assert.match(ler('web', 'src', 'lib', 'pecaHtml.js'), /'\/js\/regras-composicao\.js', '\/js\/peca-conferir\.js'/);
  assert.match(ler('js', 'bancada.js'), /MTPecaConferir\.conferir\(host, \{ esperar: 2500, papel \}\)/);
  // Sem spread de objeto: o módulo é do mesmo estilo dos que rodam em TV antiga.
  assert.doesNotMatch(ler('js', 'regras-composicao.js'), /\{\s*\.\.\./);
});

test('o gerador recebe as regras do papel no fixo (o mesmo texto a cada chamada, para o cache valer)', () => {
  const C = require('../server/compositor.js');
  for (const papel of ['destaque', 'lateral', 'cabecalho', 'rodape']) {
    const f = C.fixo(papel);
    assert.ok(f.includes(R.paraIA(papel)), papel + ': as regras não foram para o prompt');
    assert.equal(f, C.fixo(papel));
  }
});

test('reserva do cabeçalho: o nome cabe (palavras inteiras, até 18) e o "quando" só entra inteiro', () => {
  const C = require('../server/compositor.js');
  assert.equal(C.cortarNome('Padaria do Bairro', 18), 'Padaria do Bairro');
  // Sem conector pendurado no fim.
  assert.equal(C.cortarNome('Ótica e Relojoaria São Bento', 18), 'Ótica e Relojoaria');
  assert.equal(C.cortarNome('Casa de Carnes e Frios Ltda', 18), 'Casa de Carnes');
  assert.equal(C.cortarNome('Padaria Pão Quente da Vila Mariana', 18), 'Padaria Pão Quente');
  const textos = { titulo: 'Semana do cliente com vinte por cento de desconto', apoio: 'Proteção UV400 e garantia de um ano em todas as armações', cta: 'Reserve pelo WhatsApp' };
  const pecas = [0, 1, 2].map((indice) => C.preencherPapel({ papel: 'cabecalho', indice, empresa: 'Ótica e Relojoaria São Bento', textos }));
  assert.deepEqual(pecas.map((p) => p.origem.base), ['cabecalho-classico', 'cabecalho-chamada', 'cabecalho-centro']);
  for (const p of pecas) assert.equal(p.campos.marca, 'Ótica e Relojoaria');
  // O apoio inteiro (90 letras) ia para a letrinha ao lado da chamada e passava por cima do relógio.
  assert.equal(pecas[1].campos.quando, '');
  assert.equal(C.preencherPapel({ papel: 'cabecalho', indice: 1, empresa: 'Studio Bella', textos: { titulo: 'Terça do burger', cta: 'só hoje' } }).campos.quando, 'só hoje');
  // O rodapé segue com o teto de antes.
  assert.equal(C.preencherPapel({ papel: 'rodape', indice: 1, empresa: 'Ótica e Relojoaria São Bento', textos: {} }).campos.rotulo, 'Ótica e Relojoaria São Bento');
  assert.match(R.paraIA('cabecalho'), /o nome da marca com até 18 letras numa linha e a chamada com até 38/);
});

test('o quiz encaixa na zona: a letra encolhe junto (--qz) até caber, sem passar do piso', () => {
  const css = ler('css', 'player.css');
  const ini = css.indexOf('.mt-quiz { ');
  const bloco = css.slice(ini, css.indexOf('@keyframes mt-quiz-tempo', ini));
  // Toda letra do quiz escala; a margem de fora, não.
  for (const m of bloco.matchAll(/font-size:\s*([^;]+);/g)) assert.match(m[1], /var\(--qz, 1\)/, 'letra do quiz fora da escala: ' + m[1]);
  assert.match(bloco, /padding: 5cqh 5cqw;/);
  const r = ler('js', 'render.js');
  assert.match(r, /function encaixar\(vezes\)/);
  assert.match(r, /el\.scrollHeight > el\.clientHeight \+ 1 && qz > 0\.55/);
  assert.match(r, /explica\.textContent = p\.explicacao \? '✔ ' \+ p\.explicacao : '';\s*encaixar\(0\);/);
  // Na lateral, a alternativa (5cqw de 515px) no mínimo da escala fica no piso das regras.
  assert.ok(5 * 5.15 * 0.55 >= R.REGRAS.letraMin);
  // Arquivo da TV mudou: o cache da TV sobe de versão.
  assert.match(ler('sw.js'), /const SHELL_CACHE = 'mt-shell-v6[4-9]'/);
});

test('o painel mostra (e manda ao refazer) o que as regras acharam; a bancada confere a biblioteca inteira', () => {
  assert.match(ler('web', 'src', 'components', 'content', 'EditarPeca.jsx'), /\(r\.regras \|\| \[\]\)\.map\(\(a\) => \(NOME_DO_FORMATO\[f\] \|\| f\) \+ ': "' \+ rotulo\(a\.campo\) \+ '" ' \+ a\.texto\)/);
  assert.match(ler('bancada.html'), /<button id="biblioteca" type="button">Conferir a biblioteca<\/button>/);
  const b = ler('js', 'bancada.js');
  assert.match(b, /async function conferirBiblioteca\(\)/);
  assert.match(b, /for \(const modo of \['claro', 'escuro'\]\) tarefas\.push/);
  assert.match(b, /MTPecaConferir\.conferir\(host, \{ papel: t\.papel \}\)/);
  assert.match(ler('server', 'compositor.js'), /nem quebrar as REGRAS DE COMPOSIÇÃO/);
});
