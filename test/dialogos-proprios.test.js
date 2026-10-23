/*
 * Sem caixas do navegador (EXECUTOR D2).
 *
 * window.confirm e window.prompt quebravam a experiência no pior momento
 * (apagar, descartar, renomear): cara de sistema operacional, "OK" que não
 * diz o que faz, e no app instalado do celular às vezes nem aparecem. O
 * painel pergunta com o próprio diálogo (lib/confirmar.js + PedidosHost).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? arquivos(p) : /\.(jsx?|mjs)$/.test(d.name) ? [p] : [];
  });
}

test('nenhuma tela do painel usa window.confirm, window.prompt ou alert', () => {
  const achados = [];
  for (const f of arquivos(path.join(RAIZ, 'web', 'src'))) {
    const s = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/window\.(confirm|prompt|alert)\(|(^|[^.\w])alert\(/m.test(s)) achados.push(path.relative(RAIZ, f));
  }
  assert.deepEqual(achados, []);
});

test('confirmar e perguntar: um pedido por vez, na ordem, e a resposta volta para quem pediu', async () => {
  const C = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/confirmar.js')).href);
  const vistos = [];
  const sair = C.inscrever((p) => { if (p) vistos.push(p.titulo); });
  const a = C.confirmar({ titulo: 'Apagar?' });
  const b = C.perguntar({ titulo: 'Nome?', valor: 'velho' });
  assert.deepEqual(vistos, ['Apagar?'], 'o segundo espera o primeiro');
  C.responder(true);
  assert.equal(await a, true);
  assert.deepEqual(vistos, ['Apagar?', 'Nome?']);
  C.responder(null);
  assert.equal(await b, null, 'cancelar o perguntar devolve null');
  sair();
});

test('o host está montado no painel, e a Equipe confirma antes de remover', () => {
  assert.match(fs.readFileSync(path.join(RAIZ, 'web/src/components/layout/AppShell.jsx'), 'utf8'), /<PedidosHost \/>/);
  const team = fs.readFileSync(path.join(RAIZ, 'web/src/pages/TeamPage.jsx'), 'utf8');
  const remover = team.slice(team.indexOf('async function removeMember'), team.indexOf('async function removeMember') + 900);
  assert.ok(remover.indexOf('confirmar(') < remover.indexOf('team.remove('), 'remove sem perguntar');
  assert.match(remover, /catch \(e\) \{ aviso\.erro\(/, 'a recusa do servidor some');
});
