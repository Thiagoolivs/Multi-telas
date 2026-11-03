/*
 * "Este script do player roda sem rede?" — ajuda dos testes.
 *
 * Desde o pacote (server/pacote-tv.js) os scripts do corpo do player.html
 * chegam num arquivo só, e é ele que o service worker guarda. Um script está
 * offline se o sw.js o guarda direto, ou se está no pacote e o pacote está
 * no sw.js.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const RAIZ = path.join(__dirname, '..');

function guardadoOffline(arquivo) {
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  const lista = sw.slice(sw.indexOf('SHELL_ASSETS = ['), sw.indexOf('];', sw.indexOf('SHELL_ASSETS = [')));
  const a = '/' + arquivo.replace(/^\//, '');
  if (lista.includes("'" + a + "'")) return true;
  const P = require('../server/pacote-tv.js');
  const html = fs.readFileSync(path.join(RAIZ, 'player.html'), 'utf8');
  return lista.includes("'" + P.URL_PACOTE + "'") && P.scriptsDoCorpo(html).includes(a.slice(1));
}

module.exports = { guardadoOffline };
