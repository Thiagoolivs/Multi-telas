/*
 * O aniversariante na semana dele, sozinho, convivendo com as datas (EXECUTOR D32).
 *
 * Antes: um cartão com a LISTA dos próximos 7 dias — quem fez aniversário
 * ontem sumia, e ninguém tinha o próprio momento na tela. Agora cada pessoa
 * tem o próprio cartão (a foto grande do D31) na semana do aniversário, de
 * segunda a domingo, um de cada vez; no dia, só os de hoje, em dobro. A
 * cadência do D15 (1 a cada 4; no dia, 1 a cada 2) e as datas sazonais
 * continuam como estavam.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const PLAYER = ler('js/player.js');

function doPlayer(birthdays) {
  const ini = PLAYER.indexOf('  function zonaPrincipal(cfg) {');
  const fim = PLAYER.indexOf('  function startPlaylist(');
  const ctx = { global: { MT_BIRTHDAYS: birthdays, MT_getLayout: () => ({ zones: [{ id: 'principal', type: 'playlist' }] }) }, module: {} };
  ctx.MT_getLayout = ctx.global.MT_getLayout;
  vm.createContext(ctx);
  vm.runInContext(PLAYER.slice(ini, fim) + '\nmodule.exports = { comAutomaticos, aniversariosDaSemana };', ctx);
  return ctx.module.exports;
}
const nomes = (l) => l.map((p) => p.nome);
const cfg = { settings: { automaticos: { aniversarios: true, mural: '' } } };
const pecas = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ type: 'peca-html', id: i }));

test('a semana dele é de segunda a domingo: quem fez ontem continua; a próxima segunda é da semana que vem', () => {
  const terca = new Date(2026, 9, 20, 10, 0); // terça, 20/10
  const P = doPlayer([
    { nome: 'Seg', dia: 19, mes: 10 }, { nome: 'Sab', dia: 24, mes: 10 }, { nome: 'Dom', dia: 25, mes: 10 },
    { nome: 'ProxSeg', dia: 26, mes: 10 }, { nome: 'Hoje', dia: 20, mes: 10 },
  ]);
  const s = P.aniversariosDaSemana(terca);
  assert.deepEqual(nomes(s.pessoas), ['Seg', 'Hoje', 'Sab', 'Dom'], 'na ordem dos dias');
  assert.deepEqual(nomes(s.deHoje), ['Hoje']);
  // Fim de ano: a semana de 29/12 a 3/1 pega quem faz no dia 2.
  const virada = doPlayer([{ nome: 'Ano novo', dia: 2, mes: 1 }]).aniversariosDaSemana(new Date(2026, 11, 31));
  assert.deepEqual(nomes(virada.pessoas), ['Ano novo']);
});

test('cada um tem o próprio cartão, um de cada vez; vários na semana: a lista entra na roda; no dia, só os de hoje', () => {
  const terca = new Date(2026, 9, 20, 10, 0);
  const um = doPlayer([{ nome: 'Ana', dia: 23, mes: 10, foto: '/media/t/ana.jpg' }]).comAutomaticos(pecas, cfg, 'principal', terca);
  const bs = um.filter((x) => x.type === 'birthdayauto');
  assert.equal(bs.length, 2, 'a cadência do D15 mudou');
  assert.deepEqual(bs.map((x) => [x.modo, x.pessoa && x.pessoa.nome]), [['pessoa', 'Ana'], ['pessoa', 'Ana']]);

  const tres = doPlayer([{ nome: 'Ana', dia: 23, mes: 10 }, { nome: 'Bia', dia: 21, mes: 10 }, { nome: 'Caio', dia: 24, mes: 10 }]);
  const vagas = (agora) => tres.comAutomaticos(pecas, cfg, 'principal', agora).filter((x) => x.type === 'birthdayauto').map((x) => (x.modo === 'semana' ? 'lista' : x.pessoa.nome));
  const v1 = vagas(terca);
  assert.equal(v1.length, 2);
  assert.notEqual(v1[0], v1[1], 'a mesma pessoa nas duas vagas da volta');
  // A roda gira com o minuto: em quatro minutos seguidos, todos (e a lista) passam.
  const vistos = new Set();
  for (let m = 0; m < 4; m++) vagas(new Date(terca.getTime() + m * 60000)).forEach((x) => vistos.add(x));
  assert.deepEqual([...vistos].sort(), ['Ana', 'Bia', 'Caio', 'lista']);

  // No dia de alguém: só ele (em dobro), mesmo com outros na semana.
  const dia = doPlayer([{ nome: 'Ana', dia: 20, mes: 10 }, { nome: 'Bia', dia: 22, mes: 10 }]).comAutomaticos(pecas, cfg, 'principal', terca);
  const doDia = dia.filter((x) => x.type === 'birthdayauto');
  assert.equal(doDia.length, 4, 'no dia, 1 a cada 2');
  assert.ok(doDia.every((x) => x.modo === 'pessoa' && x.pessoa.nome === 'Ana'));
  // A data sazonal convive: as peças dela continuam todas.
  const natal = [{ type: 'peca-html', _campanha: 'Natal' }, { type: 'peca-html', _campanha: 'Natal' }];
  assert.equal(tres.comAutomaticos(natal, cfg, 'principal', terca).filter((x) => x._campanha === 'Natal').length, 2);
});

test('o cartão: foto grande, nome, cargo e quando (hoje, amanhã, o dia da semana, ou "foi"); a TV recebe a semana inteira', () => {
  const R = ler('js/render.js');
  assert.match(R, /if \(item\.modo === 'pessoa' && item\.pessoa\) return renderAniversariante\(item\);/);
  assert.match(R, /el\.appendChild\(bdayAvatar\(p, 'bc-avatar-xl'\)\);/);
  for (const t of ["'Hoje!'", "'Amanhã, '", "'Foi ontem, '", "'Foi ' + dds"]) assert.ok(R.includes(t), 'falta ' + t);
  assert.match(R, /const isToday = order\[mmdd2\(\+p\.mes, \+p\.dia\)\] === hojeNaSemana;/, 'a lista da semana marca o hoje errado');
  assert.match(ler('css/player.css'), /\.mt-bday\.mt-bday-pessoa \{ flex-direction: row;/);
  assert.match(ler('server/routes/telas.js'), /if \(d >= -7 && d <= 9\) return true;/, 'a TV não tem quem fez aniversário na segunda');
  assert.match(ler('sw.js'), /mt-shell-v(5[7-9]|[6-9]\d)/);
});
