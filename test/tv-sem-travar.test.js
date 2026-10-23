/*
 * A TV atravessa o expediente sem travar (EXECUTOR D0.6).
 *
 * Fora do horário os vídeos eram pausados e NUNCA retomados: a zona com um
 * vídeo só ficava congelada o dia inteiro depois que a loja abria. Vídeo que
 * entrava com a loja fechada tocava com som atrás da tela preta, e o sino de
 * "urgente" tocava de madrugada. E refazer a zona não chamava a saída do
 * slide no ar: cada publicação deixava timers rodando.
 *
 * Roda o trecho de verdade do player (aplicarExpediente/conferirExpediente)
 * numa página de mentira.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FONTE = fs.readFileSync(path.join(__dirname, '..', 'js', 'player.js'), 'utf8');

function video() {
  const attrs = {};
  return {
    paused: false, plays: 0,
    pause() { this.paused = true; },
    play() { this.paused = false; this.plays++; return Promise.resolve(); },
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
  };
}

function montar() {
  const i = FONTE.indexOf('  let expediente = null;');
  const ini = FONTE.indexOf('function conferirExpediente()');
  const m = /\r?\n {2}\}\r?\n/.exec(FONTE.slice(ini));
  const f = m ? ini + m.index + m[0].length : -1;
  assert.ok(i > 0 && f > i, 'o trecho do expediente sumiu do player');
  const videos = [];
  const classes = new Set();
  const ctx = {
    estado: 'normal',
    videos,
    setInterval: () => 1,
    global: {},
    trilha: { estado: () => ({ tocando: false }), comando() {} },
    document: {
      documentElement: { classList: { toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)), contains: (c) => classes.has(c) } },
      querySelectorAll: (sel) => (sel === 'video[data-pausado-pelo-horario]' ? videos.filter((v) => v.hasAttribute('data-pausado-pelo-horario')) : sel === 'video' ? videos : []),
      createElement: () => {
        const el = { className: '', innerHTML: '', textContent: '', style: { setProperty() {} }, classList: { toggle() {} }, remove() {} };
        el.querySelector = () => ({ textContent: '', style: { setProperty() {} } });
        return el;
      },
      body: { appendChild() {} },
    },
  };
  ctx.global.MTExpediente = { estadoDaTela: () => ctx.estado, normalizar: () => ({ fuso: 'America/Sao_Paulo' }) };
  vm.createContext(ctx);
  vm.runInContext(FONTE.slice(i, f) + '\nthis.aplicar = aplicarExpediente; this.conferir = conferirExpediente;', ctx);
  return ctx;
}

test('a loja fecha: o vídeo para; abre: o vídeo volta sozinho', () => {
  const c = montar();
  const v = video();
  c.videos.push(v);
  c.aplicar({ settings: { expediente: {} } });
  assert.equal(v.paused, false);
  c.estado = 'preta';
  c.conferir();
  assert.equal(v.paused, true, 'fora do horário o vídeo para');
  c.estado = 'normal';
  c.conferir();
  assert.equal(v.paused, false, 'a loja abriu e o vídeo continua congelado');
  assert.equal(v.plays, 1);
});

test('vídeo que entra com a loja fechada também para, e volta na abertura', () => {
  const c = montar();
  c.aplicar({ settings: { expediente: {} } });
  c.estado = 'relogio';
  c.conferir();
  const novo = video();
  c.videos.push(novo); // a playlist trouxe um vídeo novo com a loja fechada
  c.conferir();        // a próxima volta de 20 s
  assert.equal(novo.paused, true, 'o vídeo novo tocava com som atrás da tela preta');
  c.estado = 'normal';
  c.conferir();
  assert.equal(novo.paused, false);
});

test('vídeo que o DONO pausou não é religado pela abertura', () => {
  const c = montar();
  const doDono = video();
  doDono.paused = true; // parado antes de a loja fechar, por outro motivo
  c.videos.push(doDono);
  c.aplicar({ settings: { expediente: {} } });
  c.estado = 'preta'; c.conferir();
  c.estado = 'normal'; c.conferir();
  assert.equal(doDono.plays, 0);
});

test('o sino de urgente não toca com a loja fechada', () => {
  const i = FONTE.indexOf("if (level === 'urgente') {");
  const bloco = FONTE.slice(i, i + 900);
  assert.match(bloco, /const lojaFechada = document\.documentElement\.classList\.contains\('mt-fora-do-horario'\);/);
  assert.match(bloco, /if \(!lojaFechada && /);
});

test('refazer a zona chama a saída do slide no ar (timers não acumulam)', () => {
  const i = FONTE.indexOf('stop: () => {', FONTE.indexOf('function startPlaylist('));
  const bloco = FONTE.slice(i, i + 1200);
  assert.match(bloco, /currentSlide\.onLeave\(\)/);
});

test('mexeu no player: a versão do cache da TV subiu', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const v = Number((sw.match(/mt-shell-v(\d+)/) || [])[1]);
  assert.ok(v >= 44, 'sem subir o SHELL_CACHE a TV continua com o player velho');
});
