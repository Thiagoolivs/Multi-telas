/*
 * Postar nas redes (EXECUTOR D38, a parte de "agora").
 *
 * O dono: "já deixa no esquema, ou pelo menos direciona para o link de
 * postagem das redes". No celular, o Compartilhar já abre o app com a imagem
 * e o texto. No computador, "Abrir o <rede>" abre a página de postar (o
 * WhatsApp com o texto escrito), baixa a imagem e copia o texto num clique.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = fs.readFileSync(path.join(__dirname, '..', 'web/src/components/content/RedesSociais.jsx'), 'utf8');

test('cada rede tem a página de postar; o WhatsApp vai com o texto escrito', () => {
  for (const rede of ['instagram', 'whatsapp', 'facebook', 'google']) {
    assert.match(R, new RegExp('\\n  ' + rede + ": \\{ nome: '"), rede + ' sem página de postar');
    assert.match(R, new RegExp('rede="' + rede + '" />'), rede + ': o botão não chega à aba');
  }
  assert.match(R, /url: \(t\) => 'https:\/\/wa\.me\/\?text=' \+ encodeURIComponent\(t \|\| ''\)/);
  // Só endereços oficiais das redes, em https.
  for (const m of R.matchAll(/url: \([^)]*\) => '([^']+)'/g)) assert.match(m[1], /^https:\/\/(www\.instagram\.com|wa\.me|business\.facebook\.com|business\.google\.com)\//);
});

test('um clique: a janela abre ainda no clique (senão o navegador bloqueia), depois baixa a imagem e copia o texto', () => {
  const i = R.indexOf('const abrirRede = () => {');
  const corpo = R.slice(i, R.indexOf('};', i));
  assert.ok(corpo.indexOf("window.open(postar.url(texto), '_blank', 'noopener')") >= 0);
  assert.ok(corpo.indexOf('window.open(') < corpo.indexOf('baixar(blob'), 'baixou antes de abrir: o navegador bloqueia a janela');
  assert.ok(corpo.indexOf('baixar(blob') < corpo.indexOf('navigator.clipboard.writeText(texto)'));
  assert.match(R, /\{postar && <Button variant="secondary" icon=\{ExternalLink\} onClick=\{abrirRede\}>Abrir o \{postar\.nome\}<\/Button>\}/);
});
