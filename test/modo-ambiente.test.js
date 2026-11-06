/*
 * Modo ambiente (fase 9, "para valer o preço"): a arte calma da marca entre
 * os avisos.
 *
 *   - Ajustes da TV › Aparência: liga, de quantos em quantos avisos, quanto
 *     tempo fica e se mostra a hora e a data ou uma frase (settings.ambiente).
 *   - O respiro entra DEPOIS do rodízio (js/rodizio.js, comAmbiente): a cada
 *     N peças, ou uma vez por volta na lista curta. Os tetos do urgente (25%)
 *     e da Alta (40%) continuam valendo — medido aqui na semana simulada.
 *   - O desenho de reserva é da TV (js/ambiente.js, nas cores do tema); a
 *     peça-ouro de ambiente escolhida entra no lugar, pela porta das peças.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/rodizio.js');
const I = require('../js/importancia.js');
const ST = require('../js/storage.js');
const P = require('../js/peca-html.js');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const peca = (id, titulo, extra) => Object.assign({ type: 'announce', id, titulo, corpo: 'Venha conferir com a gente.', duracao: 12 }, extra || {});
const amb = (extra) => ST.normalizeAmbiente(Object.assign({ ativo: true }, extra || {}));
const tipo = (it) => (it._automatico === 'ambiente' ? 'A' : it.id);

test('os ajustes: desligado por padrão, com limites, e a frase curta', () => {
  assert.deepEqual(ST.normalizeAmbiente(undefined), { ativo: false, cada: 4, segundos: 10, mostrar: 'relogio', frase: '' });
  const a = ST.normalizeAmbiente({ ativo: true, cada: 50, segundos: 2, mostrar: 'frase', frase: '  Respire   fundo. ' + 'x'.repeat(200) });
  assert.equal(a.cada, 12);
  assert.equal(a.segundos, 6);
  assert.equal(a.mostrar, 'frase');
  assert.ok(a.frase.startsWith('Respire fundo.') && a.frase.length === 90);
  assert.equal(ST.normalizeAmbiente({ ativo: 'sim' }).ativo, false, 'só liga com true');
  assert.equal(ST.normalizeAmbiente({ ativo: true, peca: { type: 'image', src: 'x' } }).peca, undefined, 'a arte escolhida é uma peça em HTML');
  // Passa pelo normalizador da config (o servidor grava normalizado), e só quando vem.
  assert.equal(ST.normalize({ settings: { ambiente: { ativo: true, cada: 3 } } }).settings.ambiente.cada, 3);
  assert.equal('ambiente' in ST.normalize({}).settings, false);
});

test('onde o respiro entra: a cada N peças; na volta curta, uma vez; nunca dois seguidos', () => {
  const lista = (n) => Array.from({ length: n }, (_, i) => peca('p' + (i + 1), 'Peça ' + (i + 1)));
  const seq = (n, cada) => R.comAmbiente(lista(n), amb({ cada })).map(tipo).join(' ');
  assert.equal(seq(1, 4), 'p1 A', 'a peça única alterna com o respiro');
  assert.equal(seq(3, 4), 'p1 p2 p3 A', 'lista curta: uma vez por volta');
  assert.equal(seq(8, 4), 'p1 p2 p3 p4 A p5 p6 p7 p8 A');
  assert.equal(seq(10, 4), 'p1 p2 p3 p4 A p5 p6 p7 p8 A p9 p10 A', 'sobra grande no fim ganha mais um');
  assert.equal(seq(5, 4), 'p1 p2 p3 p4 A p5', 'sobra pequena não');
  // Desligado, ou zona vazia: nada muda.
  assert.deepEqual(R.comAmbiente(lista(3), ST.normalizeAmbiente({})).length, 3);
  assert.deepEqual(R.comAmbiente([], amb()), []);
  // Só vídeo ao vivo (ou tela capturada, página): sem respiro — recarregar a transmissão seria pior.
  const live = [{ type: 'youtube', url: 'x' }];
  assert.strictEqual(R.comAmbiente(live, amb()), live);
  // O respiro: o tempo escolhido vale (não o de leitura) e nunca toma a tela.
  const r = R.pecaDeAmbiente(amb({ segundos: 15, mostrar: 'frase', frase: 'Já é a sua vez.' }));
  assert.equal(R.duracaoDe(r, r.duracao), 15);
  assert.equal(r.type, 'ambiente');
  assert.equal(r.frase, 'Já é a sua vez.');
  assert.equal(R.nivelDe(r, {}), 'normal');
  // A peça-ouro de ambiente escolhida entra no lugar, com o tempo do ambiente e sem prioridade.
  const escolhida = R.pecaDeAmbiente(amb({ peca: { type: 'peca-html', html: '<section class="mt-peca"></section>', css: '', meta: { prioridade: 'urgente' } } }));
  assert.equal(escolhida.type, 'peca-html');
  assert.equal(escolhida.duracao, 10);
  assert.equal(escolhida.meta.prioridade, undefined, 'a arte calma nunca é urgente');
});

/*
 * A semana simulada com o respiro (o método de test/semana-simulada.test.js):
 * a volta como a TV roda (distribuir e, depois, comAmbiente) não passa dos
 * tetos e não repete a mesma peça seguida.
 */
function medirVolta(itens, a) {
  const ctx = { agoraMs: new Date(2026, 10, 5, 10, 0).getTime(), hoje: '2026-11-05' };
  const dur = (it) => R.duracaoDe(it, it.duracao || 12);
  const seq = R.comAmbiente(R.distribuir(itens, ctx, dur), a);
  const tempo = { urgente: 0, alta: 0, normal: 0 };
  seq.forEach((it) => { tempo[R.nivelDe(it, ctx)] += dur(it); });
  const total = tempo.urgente + tempo.alta + tempo.normal;
  let seguidas = 0;
  for (let i = 0; i < seq.length; i++) if (seq.length > 2 && seq[i] === seq[(i + 1) % seq.length]) seguidas++;
  return { seq, urgente: tempo.urgente / total, alta: tempo.alta / total, seguidas, respiros: seq.filter((x) => x._automatico === 'ambiente').length };
}

test('na semana simulada, com o respiro: urgente até 25%, Alta até 40%, nada seguido', () => {
  const u1 = I.comImportancia(peca('u1', 'Acabou o pão de queijo!', { corpo: 'Urgente: nova fornada às 16h.' }));
  const u2 = I.comImportancia(peca('u2', 'Cuidado: piso molhado na entrada'));
  const camp = (c, n) => Object.assign(peca(c + n, 'Campanha ' + c + ' ' + n), { _campanha: c });
  const alta = peca('o', 'Leve 3, pague 2', { meta: { prioridade: 'alta' } });
  const cenarios = {
    'dois urgentes e duas campanhas': [u1, u2, camp('X', 1), camp('X', 2), camp('X', 3), camp('Y', 1), camp('Y', 2), peca('n', 'Cardápio')],
    'oferta Alta com três normais': [alta, peca('n1', 'Nossa história'), peca('n2', 'Pão de fermentação natural'), peca('n3', 'Siga a gente')],
    'sala de espera com seis dicas': Array.from({ length: 6 }, (_, i) => peca('s' + i, 'Dica de saúde ' + (i + 1))),
    'uma peça só': [peca('so', 'Bem-vindo à Clínica Vida')],
    'urgente sozinho com uma normal': [I.comImportancia(peca('f', 'Urgente: o sistema está fora do ar')), peca('c', 'Reunião geral')],
  };
  for (const [nome, itens] of Object.entries(cenarios)) {
    for (const cada of [2, 3, 4, 6]) {
      const sem = medirVolta(itens, ST.normalizeAmbiente({}));
      const com = medirVolta(itens, amb({ cada, segundos: 10 }));
      assert.ok(com.respiros >= 1, nome + ' (a cada ' + cada + '): o respiro não entrou');
      assert.ok(com.urgente <= R.TETO.urgente + 0.01, nome + ': urgente com ' + Math.round(com.urgente * 100) + '%');
      assert.ok(com.alta <= R.TETO.alta + 0.01, nome + ': Alta com ' + Math.round(com.alta * 100) + '%');
      assert.ok(com.urgente <= sem.urgente + 1e-9 && com.alta <= sem.alta + 1e-9, nome + ': o respiro aumentou a fatia de quem tem teto');
      assert.equal(com.seguidas, 0, nome + ' (a cada ' + cada + '): peça repetida em seguida — ' + com.seq.map(tipo).join(' '));
    }
  }
});

test('a TV: o respiro só na zona principal, depois do rodízio e dos automáticos; o desenhista é registrado', () => {
  const p = ler('js/player.js');
  assert.match(p, /const ativos = comAutomaticos\(distribuir\(/, 'primeiro o rodízio');
  assert.match(p, /return comAmbiente\(automaticosNaVolta\(lista, cfg, zonaId, agora\), ambienteDaZona\(cfg, zonaId\)\);/, 'o respiro entra por último');
  assert.match(p, /return a && a\.ativo === true && zonaId === zonaPrincipal\(cfg\) \? a : null;/);
  assert.match(p, /const estatica = single && comAmbiente\(items, ambienteDaZona\(cfg, zonaId\)\)\.length === items\.length;/, 'a peça única alterna com o respiro');
  assert.match(p, /if \(atual && atual\.item && atual\.item\._automatico === 'ambiente'\) atual = \{ relogio: true \};/, '"Ver a tela agora" não acusa programação antiga');
  assert.match(ler('js/render.js'), /function registrar\(tipo, fn\) \{\s+if \(typeof fn === 'function' && !conhece\(tipo\)\) RENDERERS\[tipo\] = fn;/);
  const a = ler('js/ambiente.js');
  assert.match(a, /global\.MTRender\.registrar\('ambiente', renderAmbiente\)/);
  // As cores são as do tema da TV (as variáveis de js/theme.js), e a letra respeita o piso da zona.
  for (const v of ['var(--brand)', 'var(--brand-2)', 'var(--accent)', 'var(--bg)', 'var(--text)']) assert.ok(a.includes(v), v);
  assert.match(a, /max\(var\(--mt-piso,0px\),min\(5\.4cqw,7cqh\)\)/, 'a data no piso da zona');
  assert.doesNotMatch(a.replace(/\/\*[\s\S]*?\*\//g, ''), /(^|[;{'])inset\s*:/, 'sem inset (Chromium < 87)');
  assert.match(a, /\.mt-perf \.mt-ambiente \*\{animation:none!important\}/, 'a TV fraca fica parada');
  // Ajustes da TV: um componente à parte, uma linha no formulário.
  const sf = ler('web/src/components/content/SettingsForm.jsx');
  assert.match(sf, /<AmbienteESenha settings=\{s\} onChange=\{set\} \/>/);
  assert.match(ler('web/src/components/content/AmbienteESenha.jsx'), /label="Pôr a arte calma entre os avisos"/);
});

// As funções do player, extraídas de verdade (como em test/automaticos.test.js).
test('no player: o respiro entra na zona principal, depois dos automáticos; desligado, nada muda', () => {
  const vm = require('node:vm');
  const PLAYER = ler('js/player.js');
  const ini = PLAYER.indexOf('  function zonaPrincipal(cfg) {');
  const fim = PLAYER.indexOf('  function startPlaylist(');
  const ctx = { global: { MTRodizio: R, MT_BIRTHDAYS: [], MT_getLayout: () => ({ zones: [{ id: 'principal', type: 'playlist' }, { id: 'lateral', type: 'playlist' }] }) }, module: {} };
  ctx.MT_getLayout = ctx.global.MT_getLayout;
  vm.createContext(ctx);
  vm.runInContext(PLAYER.slice(ini, fim) + '\nmodule.exports = { comAutomaticos };', ctx);
  const { comAutomaticos } = ctx.module.exports;
  const pecas = Array.from({ length: 6 }, (_, i) => peca('p' + i, 'Peça ' + i));
  const cfg = (a) => ({ settings: { layoutId: 'x', ambiente: a } });
  const tipos = (l) => l.map((x) => (x._automatico === 'ambiente' ? 'A' : '.')).join('');
  assert.equal(tipos(comAutomaticos(pecas, cfg(amb({ cada: 3 })), 'principal')), '...A...A');
  assert.equal(tipos(comAutomaticos(pecas, cfg(amb({ cada: 3 })), 'lateral')), '......', 'só a principal');
  assert.equal(tipos(comAutomaticos(pecas, cfg(undefined), 'principal')), '......', 'desligado');
});

test('a arte escolhida passa pela mesma porta das peças no servidor', () => {
  const ruim = { settings: { ambiente: { ativo: true, peca: { type: 'peca-html', html: '<section class="mt-peca"><script>alert(1)</script></section>', css: '' } } }, zonas: {} };
  const r = P.conferirConfig(ruim, { hostsMidia: [] });
  assert.ok(r.problemas.some((x) => /^modo ambiente: /.test(x)), JSON.stringify(r.problemas));
});
