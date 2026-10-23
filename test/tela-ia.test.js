/*
 * A IA troca layout e tema, sempre com prévia (EXECUTOR D28).
 *
 * "Lateral do outro lado", "tema claro", "fundo azul marinho", "tira o
 * relógio e o clima", "clima de Curitiba": o servidor entende e confere
 * contra o que existe (layouts que cabem nesta TV, temas, fontes); o painel
 * aplica numa cópia, mostra antes e depois e só muda o rascunho com o ok.
 * A TV ganhou o relógio e o clima do cabeçalho com liga/desliga, e três
 * temas novos.
 */
'use strict';
process.env.AI_PROVIDER = process.env.AI_PROVIDER || 'dev';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const A = require('../server/ajuste-tela');
const T = require('../js/theme.js');
const S = require('../js/storage.js');

const regra = (texto, layoutId, orientacao) => A.completar(...Object.values(A.semIA(texto, { layoutId })), { layoutId, orientacao }).mudancas;

test('a frase vira mudanças: lado da lateral, cabeçalho, tela cheia, tema, fundo, destaque, fonte', () => {
  assert.deepEqual(regra('Lateral do outro lado', 'dashboard'), { layoutId: 'sidebar-right' });
  assert.deepEqual(regra('quero a lateral na direita', 'dashboard'), { layoutId: 'sidebar-right' });
  assert.deepEqual(regra('lateral à esquerda', 'sidebar-right'), { layoutId: 'dashboard' });
  assert.deepEqual(A.semIA('lateral à esquerda', { layoutId: 'dashboard' }).notas, ['A lateral já está desse lado.']);
  assert.deepEqual(regra('põe um cabeçalho', 'dashboard'), { layoutId: 'corporate' });
  assert.deepEqual(regra('sem cabeçalho', 'portrait-stack', 'portrait'), { layoutId: 'portrait-duo' });
  assert.deepEqual(regra('tela cheia com rodapé', 'dashboard'), { layoutId: 'full-ticker' });
  assert.deepEqual(regra('tema claro e tira o relógio', 'corporate'), { fundo: 'claro', relogio: false });
  assert.deepEqual(regra('tema escuro', 'dashboard'), { fundo: 'escuro' });
  assert.deepEqual(regra('fundo azul marinho, destaque laranja', 'dashboard'), { fundo: 'cor', fundoCor: '#0b1f44', destaque: '#f97316' });
  assert.deepEqual(regra('tema de clínica', 'dashboard'), { tema: 'clinica-suave' });
  assert.deepEqual(regra('usa as cores da minha marca', 'dashboard'), { tema: 'marca' });
  assert.deepEqual(regra('fonte Montserrat e tema dourado', 'dashboard'), { tema: 'luxury-gold', fonte: 'montserrat' });
});

test('relógio e clima: um verbo, duas coisas; a cidade com acento; clima sem cabeçalho ganha um (e diz)', () => {
  assert.deepEqual(regra('tira o relógio e o clima', 'corporate'), { relogio: false, clima: false });
  assert.deepEqual(regra('sem relógio e sem clima', 'corporate'), { relogio: false, clima: false });
  assert.deepEqual(regra('volta o relógio e tira o clima', 'corporate'), { relogio: true, clima: false });
  assert.deepEqual(regra('clima de São Paulo', 'corporate'), { cidadeClima: 'São Paulo', clima: true });
  // Nota do consultor no #253: acento, espaço, hífen e apóstrofo.
  for (const [pedido, cidade] of [['clima de embu-guaçu', 'Embu-Guaçu'], ["previsão do tempo de santa bárbara d'oeste", "Santa Bárbara d'Oeste"], ['clima em são joão del-rei', 'São João del-Rei'], ['clima de pau dos ferros', 'Pau dos Ferros']]) {
    assert.equal(regra(pedido, 'corporate').cidadeClima, cidade, pedido);
    assert.equal(A.normalizar({ cidadeClima: cidade }, { orientacao: 'landscape' }).cidadeClima, cidade, 'a IA não pode devolver ' + cidade);
  }
  const r = A.completar({ clima: true }, [], { layoutId: 'full-ticker' });
  assert.equal(r.mudancas.layoutId, 'header-main-ticker');
  assert.deepEqual(r.notas, ['O clima aparece no cabeçalho: a tela ganha um.']);
  assert.deepEqual(A.completar({ clima: false }, [], { layoutId: 'full' }), { mudancas: {}, notas: ['Esta tela não mostra o clima.'] });
});

test('o que a IA devolve é conferido: layout que não cabe na TV, tema e fonte que não existem, cor torta', () => {
  const r = A.normalizar({ layoutId: 'sidebar-right', tema: 'tema-inventado', fundo: 'cor', fundoCor: 'azul', destaque: '#FF0000', fonte: 'comic', relogio: 'sim', cidadeClima: 'Rua 123' }, { orientacao: 'portrait' });
  assert.deepEqual(r, { destaque: '#ff0000' }, 'passou o que não existe');
  assert.deepEqual(A.normalizar({ layoutId: 'portrait-duo', tema: 'varejo-quente', fundo: 'claro', relogio: false, cidadeClima: 'Curitiba' }, { orientacao: 'portrait' }),
    { layoutId: 'portrait-duo', tema: 'varejo-quente', fundo: 'claro', relogio: false, cidadeClima: 'Curitiba', clima: true });
  assert.match(A.SISTEMA, /Não invente o que o pedido não disse/);
});

test('três temas novos (dois claros), legíveis, e o painel lista todos os temas da TV', () => {
  for (const id of ['clinica-suave', 'corporativo-claro', 'varejo-quente']) {
    const t = T.resolve({ preset: id });
    assert.ok(T.contraste(t.bg, t.text) >= 4.5, id + ': texto');
    assert.ok(T.contraste(t.bg, t.accent) >= 3.5, id + ': destaque');
  }
  const painel = ler('web/src/lib/screenConfig.js');
  for (const id of Object.keys(T.PRESETS)) assert.match(painel, new RegExp("value: '" + id + "'"), 'o painel não oferece o tema ' + id);
  assert.match(ler('js/theme.js'), /\}\)\(typeof window !== 'undefined' \? window : globalThis\);/, 'theme.js deixou de rodar na TV antiga');
});

test('a TV: relógio e clima do cabeçalho saem com a chave false, e o relógio do rodapé volta', () => {
  const cfg = S.normalize({ settings: { layoutId: 'corporate' }, zonas: { cabecalho: { relogio: false, clima: false, lixo: 1 } } });
  assert.deepEqual(cfg.zonas.cabecalho, { header: true, relogio: false, clima: false });
  assert.deepEqual(S.normalize({ settings: { layoutId: 'corporate' }, zonas: { cabecalho: { relogio: true } } }).zonas.cabecalho, { header: true });
  const P = ler('js/player.js');
  assert.match(P, /if \(zone\.type === 'header'\) return startHeader\(zoneEl, cfg, data\);/);
  assert.match(P, /if \(d\.clima !== false\) right\.appendChild\(weather\);/);
  assert.match(P, /if \(d\.relogio !== false\) right\.appendChild\(clock\);/);
  assert.match(P, /if \(d\.clima !== false\) updateHeaderWeather\(/, 'busca o clima sem mostrar');
  const i = P.indexOf('function relogioNoCabecalho(cfg, layout)');
  const ctx = { module: {} };
  vm.createContext(ctx);
  vm.runInContext(P.slice(i, P.indexOf('\n  }', i) + 4) + '\nmodule.exports = relogioNoCabecalho;', ctx);
  const comCabecalho = { zones: [{ id: 'cabecalho', type: 'header' }, { id: 'rodape', type: 'ticker' }] };
  assert.equal(ctx.module.exports({ zonas: { cabecalho: { relogio: false } } }, comCabecalho), false, 'sem relógio em cima, o de baixo some também');
  assert.match(ler('sw.js'), /mt-shell-v(5[4-9]|[6-9]\d)/, 'a TV não recebe o player novo');
});

test('o painel: aplica numa cópia (o fundo pintado à mão sai, o relógio sai dos dois lugares), descreve e mostra antes e depois', async () => {
  const L = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/ajusteTela.js')).href);
  const cfg = {
    settings: { layoutId: 'dashboard', theme: { preset: 'dark-premium', overrides: { bg: '#123456', bg2: '#000000', accent: '#ffffff' } } },
    zonas: { lateral: { items: [{ type: 'image', src: '/a.jpg' }] }, principal: { items: [] }, rodape: { messages: ['oi'] } },
  };
  const antes = JSON.stringify(cfg);
  const d = L.aplicarMudancas(cfg, { layoutId: 'corporate', fundo: 'cor', fundoCor: '#0b1f44', relogio: false, clima: false, cidadeClima: 'Curitiba' });
  assert.equal(JSON.stringify(cfg), antes, 'mexeu na config de agora');
  assert.equal(d.settings.layoutId, 'corporate');
  assert.equal(d.settings.theme.fundo, 'cor');
  assert.equal(d.settings.theme.overrides.bg, undefined, 'o fundo pintado à mão ficou por cima');
  assert.deepEqual(d.zonas.cabecalho, { header: true, relogio: false, clima: false });
  assert.equal(d.zonas.rodape.mostrarRelogio, false);
  assert.equal(d.settings.cidadeClima, 'Curitiba');
  assert.deepEqual(L.aplicarMudancas(d, { relogio: true, clima: true }).zonas.cabecalho, { header: true });
  // Tema da marca sem cores cadastradas não muda nada, e a descrição avisa.
  assert.equal(L.aplicarMudancas(cfg, { tema: 'marca' }).settings.theme.preset, 'dark-premium');
  assert.deepEqual(L.descrever(cfg, { tema: 'marca' }), [{ aviso: true, texto: 'Para usar as cores da marca, cadastre-as em Marca.' }]);
  // O destaque no tom que se lê sobre o fundo.
  const c = L.aplicarMudancas(cfg, { fundo: 'claro', destaque: '#facc15' });
  const t = T.resolve(c.settings.theme, {});
  assert.ok(T.contraste(t.bg, c.settings.theme.overrides.accent) >= 3.5, 'amarelo ilegível no fundo claro');
  // A zona que sai é dita.
  const linhas = L.descrever({ settings: { layoutId: 'corporate' }, zonas: { lateral: { items: [{ type: 'image' }] } } }, { layoutId: 'full-ticker' });
  assert.ok(linhas.some((l) => l.aviso && /Lateral sai da tela; o que está nela fica guardado/.test(l.texto)), JSON.stringify(linhas));

  const M = ler('web/src/components/tela/MudarComIA.jsx');
  assert.match(M, /<PreviaDaTela cfg=\{cfg\} rotulo="Agora" \/>/);
  assert.match(M, /<PreviaDaTela cfg=\{proposta\.depois\} rotulo="Como fica" \/>/);
  assert.match(M, /onAplicar\(proposta\.depois\);/);
  assert.match(M, /acao: \{ rotulo: 'Desfazer', on: \(\) => onAplicar\(antes\) \}/);
  assert.match(ler('web/src/pages/ContentEditorPage.jsx'), /<MudarComIA cfg=\{cfg\} onAplicar=\{\(novo\) => \{ setCfg\(novo\); setDirty\(true\); \}\} \/>/, 'não muda só o rascunho');
  assert.match(ler('web/src/components/tela/PreviaDaTela.jsx'), /gradeDaMiniatura\(layout, \{ minimo: false \}\)/, 'a prévia distorce as faixas');
  assert.match(ler('web/src/components/tela/FaixaDaTela.jsx'), /<Checkbox label="Relógio" checked=\{z\.relogio !== false\}/);
  const srv = ler('server.js');
  assert.match(srv, /tela: 'ajuste-tela',/);
  assert.match(srv, /rateLimit\('ai:tela:' \+ sess\.tenant_id, 60, 60 \* 60 \* 1000\)/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6800 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}

test('a rota: só com sessão; devolve as mudanças conferidas para esta TV', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d28-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  assert.equal((await pedir('/api/ai/tela', { method: 'POST', json: { texto: 'x' } })).status, 401);
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd28' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Loja', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const r = await pedir('/api/ai/tela', { method: 'POST', cookie: c, json: { texto: 'lateral do outro lado e sem relógio', layoutId: 'dashboard', orientacao: 'landscape' } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.mudancas, { layoutId: 'sidebar-right', relogio: false });
  const emPe = await pedir('/api/ai/tela', { method: 'POST', cookie: c, json: { texto: 'tela cheia', layoutId: 'portrait-stack', orientacao: 'portrait' } });
  assert.deepEqual(emPe.json.mudancas, { layoutId: 'full' }, 'tela cheia serve em pé');
  assert.equal((await pedir('/api/ai/tela', { method: 'POST', cookie: c, json: { texto: '  ' } })).status, 400);
});
