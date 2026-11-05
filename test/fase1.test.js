/*
 * Fase 1 do plano de ação (docs/qa-total/PLANO-DE-ACAO.md): limpar antes de
 * construir, pela lista aprovada em 05/11 (docs/qa-total/O-QUE-FALTA.md,
 * parte C). O que sai do catálogo continua rodando nas TVs que já o usam.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// contentTypes.js importa os ícones do React; para testar as listas, os imports viram um esboço.
async function tipos() {
  let s = ler('web/src/lib/contentTypes.js');
  s = s.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, (m) => {
    const nomes = ((m.match(/\{([^}]*)\}/) || [, ''])[1]).split(',').map((x) => x.trim().split(' as ').pop()).filter(Boolean);
    return nomes.length ? 'const {' + nomes.join(',') + '} = ESBOCO;' : '';
  });
  const arq = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mt-tipos-')), 'tipos.mjs');
  fs.writeFileSync(arq, 'const ESBOCO = new Proxy({}, { get: () => (() => null) });\n' + s);
  return import(pathToFileURL(arq).href);
}

test('o "Adicionar" por frente: sem os tipos que saíram, o raro em "Avançado"', async () => {
  const T = await tipos();
  const todos = (f) => { const c = T.catalogoDaFrente(f); return c.principais.concat(c.avancados); };
  for (const f of ['comercio', 'saude', 'empresa']) {
    for (const sai of ['text', 'poster', 'quote', 'web', 'screen']) assert.ok(!todos(f).includes(sai), f + ' ainda oferece ' + sai);
    assert.deepEqual(T.catalogoDaFrente(f).avancados, ['composicao', 'pptx', 'youtube', 'livesource']);
    for (const fica of ['announce', 'image', 'video', 'qrcode', 'social', 'mural', 'weatherpro', 'birthdayauto', 'kpi']) assert.ok(T.catalogoDaFrente(f).principais.includes(fica), f + ' perdeu ' + fica);
  }
  assert.ok(todos('comercio').includes('promo') && todos('comercio').includes('precos') && !todos('comercio').includes('quiz'));
  assert.ok(todos('saude').includes('promo') && !todos('saude').includes('quiz'));
  assert.ok(todos('empresa').includes('quiz') && !todos('empresa').includes('promo') && !todos('empresa').includes('precos'));
  // O tipo que saiu continua existindo: a TV que usa segue mostrando e o editor segue abrindo.
  for (const t of ['text', 'poster', 'quote', 'web', 'screen']) assert.ok(T.CONTENT_TYPES[t], t + ' sumiu do editor');
  assert.equal(T.CONTENT_TYPES.announce.label, 'Aviso');
  // O seletor usa o catálogo da frente, e os atalhos e entradas respeitam a frente.
  const picker = ler('web/src/components/content/TypePicker.jsx');
  assert.match(picker, /const catalogo = catalogoDaFrente\(frente\);/);
  assert.match(picker, /groups\['Avançado'\] = avancados;/);
  assert.match(picker, /tipoNaFrente\(e\.id, frente\)/);
});

test('os layouts: 9 no seletor, o novo Dois quadrados, e os 5 que saíram seguem valendo para quem usa', async () => {
  const S = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/screenConfig.js')).href);
  const visiveis = S.LAYOUTS.filter((l) => !l.oculto).map((l) => l.id);
  assert.deepEqual(visiveis.sort(), ['corporate', 'dashboard', 'duo', 'full', 'full-ticker', 'header-main-ticker', 'portrait-duo', 'portrait-hero', 'sidebar-right', 'square-hero'].sort());
  const saem = S.LAYOUTS.filter((l) => l.oculto).map((l) => l.id).sort();
  assert.deepEqual(saem, ['portrait-stack', 'quad', 'square-header', 'square-split', 'video-dynamic']);
  // A TV que usa um layout que saiu continua com ele, e o seletor o mostra para ela.
  for (const id of saem) assert.equal(S.getLayout(id).id, id);
  assert.match(ler('web/src/components/content/SettingsForm.jsx'), /\(!l\.oculto \|\| \(s\.layoutId \|\| 'dashboard'\) === l\.id\)/);
  // O Dois quadrados: duas metades iguais, na TV e no painel.
  global.window = global;
  require('../js/templates.js');
  const duo = global.MT_getLayout('duo');
  assert.equal(duo.id, 'duo');
  assert.equal(duo.grid.columns, '1fr 1fr');
  assert.deepEqual(duo.zones.map((z) => z.id), ['principal', 'secundaria']);
  // Pedir "mosaico" ou "duas metades" à IA leva aos Dois quadrados.
  const A = require('../server/ajuste-tela');
  const regra = (texto) => A.completar(...Object.values(A.semIA(texto, { layoutId: 'dashboard' })), { layoutId: 'dashboard' }).mudancas;
  assert.deepEqual(regra('quero a tela em duas metades'), { layoutId: 'duo' });
  assert.deepEqual(regra('faz um mosaico 2x2'), { layoutId: 'duo' });
});

test('o motor antigo da IA (coordenadas) saiu: só o HTML', () => {
  const s = ler('server.js');
  assert.doesNotMatch(s, /process\.env\.MT_MOTOR_CAMPANHA/);
  assert.match(s, /motorHtml: true,/);
});
