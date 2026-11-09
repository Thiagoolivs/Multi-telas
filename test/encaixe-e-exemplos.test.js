/*
 * O que sobrava da margem contra o corte e do Corporativo (09/11):
 *   - a margem de 4% a 5% (Ajustes da TV › Encaixe vai até 5%) também cabe,
 *     e a régua bloqueia a de 5%;
 *   - sem mensagem, o rodapé some e a principal cresce (1377×913): o
 *     destaque cabe, e a régua bloqueia;
 *   - as faixas antigas (rodape-relogio, cabecalho-status, cabecalho-centro)
 *     não encostam na borda com a letra do balcão;
 *   - os textos de exemplo não trazem data fixa, que envelhece na TV.
 * As medidas são do robô (tools/regua-tv.mjs, no CI) e da bancada; aqui, a
 * forma do que foi feito.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../js/templates.js');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const peca = (id) => ler('pecas-ouro/' + id + '.html');
const css = (id) => (peca(id).match(/<style>([\s\S]*)<\/style>/) || [])[1] || '';

test('a régua bloqueia a margem de 5% e o destaque sem mensagem no rodapé', () => {
  const robo = ler('tools/regua-tv.mjs');
  assert.match(robo, /const MARGENS_NA_TV = \[2, 3, 5\];/);
  assert.match(robo, /const SEM_RODAPE = \{ rodape: 'vazio', margem: 0 \};/);
  assert.match(robo, /semRodape = await conferirPecas\(navegador, 'balcao', \[DESTAQUE_NO_BALCAO\], Object\.assign\(\{ todasAsMarcas: true, soDestaque: true \}, SEM_RODAPE\)\);/);
  assert.match(robo, /for \(const x of semRodape\.filter\(\(y\) => y\.cedeu < 1\)\) \{ console\.log\(cedeuNaMarca\(x\)\); reprova = true; \}/);
  assert.match(robo, /\(x\.rodape \? '&rodape=' \+ x\.rodape : ''\)/);
  // O robô diz quanto demorou (a régua inteira cabe em uns 10 minutos).
  assert.match(robo, /console\.log\('\\nTempo: ' \+ Math\.round\(\(Date\.now\(\) - inicio\) \/ 1000\) \+ ' s'\);/);
});

test('a bancada desenha o Corporativo sem mensagem no rodapé, como a TV', () => {
  // Na TV, o rodapé sem mensagem sai da grade e a principal cresce (js/templates.js).
  const sem = T.juntarZonasVazias(T.getLayout('corporate'), ['rodape']);
  assert.equal(sem.grid.rows, '12vh 1fr');
  assert.deepEqual(sem.zones.map((z) => z.id), ['cabecalho', 'principal', 'lateral']);
  const B = ler('js/bancada.js');
  assert.match(B, /const layout = semRodape \? MT_juntarZonasVazias\(base, \['rodape'\]\) : base;/);
  assert.match(B, /opcao\(\$\('rodape'\), 'vazio', 'Sem mensagem \(some\)'\);/);
  assert.match(B, /const CHAVES = \[[^\]]*'margem', 'rodape'\];/);
  assert.match(ler('bancada.html'), /<select id="rodape"><\/select>/);
});

test('a margem de 4% a 5%: regras pela altura, só abaixo do que já cabia (3,5%), com o QR de 160 px', () => {
  const alturaDa = (id, re) => [...css(id).matchAll(re)].map((m) => Number(m[1]));
  // A lateral: 707 px é a de 3,5%, que já cabia (qr-foto e frase-faixa cediam ali e começam nela).
  for (const id of ['social-avaliacao', 'servico-agenda', 'lateral-prazo', 'indicador-meta', 'indicador-turno', 'servico-vacina',
    'oferta-relampago', 'social-delivery', 'oferta-foto', 'diptico-oferta', 'gente-retrato', 'horario-foto', 'vaga-foto']) {
    const alturas = alturaDa(id, /@container \(max-width: 700px\) and \(max-height: (\d+)px\)/g);
    assert.ok(alturas.some((h) => h < 707), id + ': a lateral com 4% ou mais');
  }
  for (const id of ['qr-foto', 'frase-faixa']) assert.match(css(id), /@container \(max-width: 700px\) and \(max-height: 715px\)/, id);
  // O destaque: a principal de 4% (696 px) para baixo.
  for (const id of ['servico-passos', 'social-data']) assert.match(css(id), /@container \(aspect-ratio >= 1\.74\) and \(min-height: 600px\) and \(max-height: 700px\)/, id);
  for (const id of ['institucional-valores', 'oferta-foto']) assert.match(css(id), /@container \(aspect-ratio >= 1\.25\) and \(min-height: 600px\) and \(max-height: 700px\)/, id);
  // O texto de apoio sai primeiro.
  assert.match(css('servico-passos'), /max-height: 700px\) \{\n  \.passos small \{ display: none; \}/);
  assert.match(css('institucional-valores'), /\.valores small \{ display: none; \}\n\}\n$/);
  // O QR fica com 160 px ou mais na lateral de 5% (452×674): 37% de 452 e 44% da caixa sem o padding (380).
  assert.match(css('qr-foto'), /--q: 37cqw;/);
  assert.ok(0.37 * 452 >= 160 && 0.44 * (452 - 2 * 0.08 * 452) >= 160);
  assert.match(css('servico-agenda'), /\.qr \{ width: 44cqmin; height: 44cqmin; \}/);
});

test('sem mensagem no rodapé (1377×913): o destaque usa o desenho do Corporativo, até 940 px de altura', () => {
  const NOVA = /@container \(\(aspect-ratio >= 1\.25\) and (?:\(min-height: 600px\) and \(max-height: 860px\)|\(max-height: 900px\))\) or \(\(aspect-ratio >= 1\.25\) and \(aspect-ratio < 1\.6\) and (?:\(min-height: 860px\) and )?\(max-height: 940px\)\) \{/;
  for (const id of ['oferta-foto', 'oferta-lista', 'cardapio-colunas', 'social-avaliacao', 'oferta-selo', 'oferta-parcelado', 'cardapio-categorias',
    'gente-boas-vindas', 'gente-comunicado', 'cardapio-dia-foto', 'servico-ramais', 'cardapio-destaque', 'diptico-oferta', 'qr-foto']) {
    assert.match(css(id), NOVA, id);
  }
  // 1377×913 tem proporção 1,51: dentro da faixa; a tela cheia (1,78) e a TV em pé ficam fora.
  assert.ok(1377 / 913 >= 1.25 && 1377 / 913 < 1.6 && 913 <= 940 && 1920 / 1080 >= 1.6);
  assert.match(css('gente-mes'), /@container \(max-width: 700px\) and \(min-height: 860px\) and \(max-height: 940px\) \{\n  h1 span, h1 em \{ display: inline; white-space: normal; \}/);
});

test('as faixas antigas com a letra do balcão: o vão encolhe com o piso, só na faixa deitada', () => {
  // Sem piso a conta dá o vão do desenho; com o piso, ele encolhe o quanto a letra cresceu (e nunca fica negativo).
  const vao = (g, f, piso) => Math.max(0, g - (Math.max(piso, f) - f));
  assert.equal(vao(6, 14, 0), 6);
  assert.equal(vao(6, 14, 48.6), 0);
  for (const id of ['rodape-relogio', 'cabecalho-status', 'cabecalho-centro']) {
    const c = css(id);
    const deitada = c.slice(c.indexOf('@container (aspect-ratio >= 9) {'));
    assert.ok(c.includes('@container (aspect-ratio >= 9) {'), id + ': só a faixa deitada');
    assert.match(deitada, /gap: max\(0cqh, calc\(\d+cqh - \(max\(var\(--mt-piso, 0cqw\), \d+cqh\) - \d+cqh\)\)\);/, id);
  }
  assert.match(css('rodape-relogio'), /\.data > span \{ line-height: min\(1em, 35cqh\); \}/);
  assert.match(css('cabecalho-status'), /\.hora \{ font-size: max\(var\(--mt-piso, 0cqw\), calc\(46cqh - \(max\(var\(--mt-piso, 0cqw\), 30cqh\) - 30cqh\)\)\); \}/);
});

test('os textos de exemplo não trazem data fixa (dia e mês, ano) que envelhece na TV', () => {
  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  const MES = '(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';
  const RUINS = [
    new RegExp('\\b\\d{1,2} de ' + MES, 'i'), // "20 de novembro"
    new RegExp('·\\s*' + MES + '\\b', 'i'), // "Sábado · junho"
    new RegExp('\\b(em|sobre|de) ' + MES + '\\b', 'i'), // "Destaque de outubro", "12% sobre outubro"
    new RegExp('^' + MES + ', ', 'i'), // "Novembro, até hoje"
    /\b(segunda|terça|quarta|quinta|sexta|sábado|domingo), \d{1,2}\b/i, // "A partir de segunda, 18"
  ];
  // Ano solto envelhece ("SIPAT 2026", "Verão 2027"); "desde 2010" e o número de ramal ("ramal 2040") não.
  const ANO = /(^|[^\w])20[2-3]\d\b/;
  const achados = [];
  const olhar = (onde, v) => {
    if (typeof v !== 'string') return;
    if (RUINS.some((r) => r.test(v)) || (ANO.test(v) && !/desde 20\d\d|ramal/i.test(v))) achados.push(onde + ': ' + v);
  };
  for (const p of m.pecas) {
    for (const [fr, t] of Object.entries(p.textos || {})) for (const [k, v] of Object.entries(t)) olhar(p.id + '/' + fr + '/' + k, v);
  }
  for (const t of m.telas || []) {
    (t.mensagens || []).forEach((v, i) => olhar(t.id + '/mensagens/' + i, v));
    for (const z of Object.values(t.zonas || {})) {
      for (const e of (z && z.pecas) || []) for (const [k, v] of Object.entries((e && e.campos) || {})) olhar(t.id + '/' + e.id + '/' + k, v);
    }
  }
  assert.deepEqual(achados, []);
  // O exemplo do HTML das propostas também (a bancada e a peça sem texto da frente).
  for (const [id, velho] of [['evento-foto', 'Sábado · junho'], ['aviso-faixa', 'Quinta, 20 de novembro'], ['capa-campanha', 'Até 30 de maio'],
    ['gente-destaque', 'Destaque de outubro'], ['indicador-meta', 'Linha 2 · novembro']]) {
    assert.ok(!peca(id).includes(velho), id + ': ' + velho);
  }
});
