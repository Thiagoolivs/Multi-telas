/*
 * server/pacote-tv.js — os scripts do player num pacote só.
 *
 * O QA de 26/10 mediu a primeira carga de uma TV nova: 36 requisições, 25
 * delas scripts separados. Numa rede de loja, cada ida e volta custa — e a
 * primeira carga é justamente a que acontece na frente do cliente que acabou
 * de parear.
 *
 * O desenho, e por quê:
 *
 *   - O player.html CONTINUA A FONTE. A ordem dos <script> do corpo é a do
 *     pacote; quem mexe no player mexe só no HTML, como sempre, e a bancada e
 *     os testes seguem lendo os arquivos soltos.
 *   - O SERVIDOR TROCA na hora de servir: o HTML que sai tem um <script>
 *     só, para /js/tv.pacote.js. O perf.js fica no <head>, sozinho: ele
 *     decide o modo leve antes da primeira pintura.
 *   - CADA ARQUIVO NO SEU try. Em <script> separados, um arquivo que quebra
 *     ao carregar não impede os outros; num pacote, impediria. O try segura
 *     e relança fora da pilha (setTimeout), para o window.onerror continuar
 *     vendo — o mesmo comportamento de antes. Funciona porque todos os
 *     arquivos do player são uma função que se chama (IIFE), sem nada solto
 *     no topo: o teste confere.
 *   - SE ALGO FALHAR ao montar (arquivo faltando), sai o player.html de
 *     sempre. O pacote é ganho, nunca motivo para a TV não abrir.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const URL_PACOTE = '/js/tv.pacote.js';
const TAG = /<script src="([^"]+)"><\/script>/g;

let guardado = null; // { chave, html, js }

/* Os scripts do CORPO do player.html, na ordem (o <head> fica como está). */
function scriptsDoCorpo(html) {
  const corpo = html.slice(html.indexOf('<body'));
  return [...corpo.matchAll(TAG)].map((m) => m[1].replace(/^\//, ''));
}

function montarJs(raiz, lista) {
  const partes = ['/* MultiTelas · pacote do player (server/pacote-tv.js). A fonte é o player.html. */'];
  for (const s of lista) {
    const src = fs.readFileSync(path.join(raiz, s), 'utf8');
    partes.push('/* ==== ' + s + ' ==== */\ntry {\n' + src + '\n} catch (e) { setTimeout(function () { throw e; }); }');
  }
  return partes.join('\n');
}

function montarHtml(html, lista) {
  const inicio = html.indexOf('<body');
  let primeiro = true;
  const corpo = html.slice(inicio).replace(TAG, (tag, src) => {
    if (!lista.includes(src.replace(/^\//, ''))) return tag;
    if (primeiro) { primeiro = false; return '<script src="' + URL_PACOTE.slice(1) + '"></script>'; }
    return '';
  }).replace(/\n\s*\n(\s*<\/body>)/, '\n$1').replace(/(<script src="js\/tv\.pacote\.js"><\/script>)(\s*\n)+/, '$1\n');
  return html.slice(0, inicio) + corpo;
}

/*
 * O par { html, js } para a versão atual dos arquivos. A chave é o tamanho e a
 * data de cada um: no Railway nada muda sem deploy, e em desenvolvimento quem
 * edita um script vê a mudança no próximo F5.
 */
function pacote(raiz) {
  try {
    const htmlPath = path.join(raiz, 'player.html');
    const html = fs.readFileSync(htmlPath, 'utf8');
    const lista = scriptsDoCorpo(html);
    if (!lista.length) return null;
    const chave = [htmlPath].concat(lista.map((s) => path.join(raiz, s)))
      .map((f) => { const st = fs.statSync(f); return st.size + ':' + st.mtimeMs; }).join('|');
    if (guardado && guardado.chave === chave) return guardado;
    guardado = { chave, html: montarHtml(html, lista), js: montarJs(raiz, lista), lista };
    return guardado;
  } catch (e) {
    return null;
  }
}

module.exports = { pacote, scriptsDoCorpo, montarHtml, montarJs, URL_PACOTE };
