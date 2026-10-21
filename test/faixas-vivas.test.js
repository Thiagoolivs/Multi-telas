/*
 * Cabeçalho e rodapé vivos (docs/EXECUTOR.md, item 22).
 *
 * O dono pediu animação no cabeçalho e no rodapé: letreiro, relógio, clima e
 * data, logo e chamadas animadas, contagem regressiva. O que segura:
 *   - a contagem regressiva (`data-vivo="contagem"`) conta certo e passa pela porta;
 *   - a faixa aceita VÁRIAS peças girando, sem quebrar a TV com o JS antigo;
 *   - cada peça da lista passa pela mesma porta da peça única;
 *   - as peças-ouro novas (rodapé com contagem, cabeçalho com chamadas)
 *     entram quando a faixa tem o que só elas mostram.
 *
 * Conferido no player (1080p e em pé) e na bancada: prints no PR.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../js/peca-render.js');
const P = require('../js/peca-html.js');
const S = require('../js/storage.js');
const compositor = require('../server/compositor.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const ouro = (id) => P.doArquivo(ler('pecas-ouro', id + '.html'));
const peca = (id, extra) => Object.assign({ type: 'peca-html', versao: 1, html: ouro(id).html, css: ouro(id).css, campos: {} }, extra);

test('a contagem regressiva conta certo, e nunca para o negativo', () => {
  const agora = new Date(2026, 9, 25, 13, 44, 51);
  assert.equal(R.contagem('2026-10-27T18:00', agora), '2d 04:15:09');
  assert.equal(R.contagem('2026-10-25T18:00', agora), '04:15:09', 'no último dia, só as horas');
  assert.equal(R.contagem('2026-10-25T13:45', agora), '00:00:09');
  assert.equal(R.contagem('2026-10-25T13:00', agora), '00:00:00', 'passou do alvo: zera');
  assert.equal(R.contagem('amanhã', agora), '');
  assert.equal(R.contagem('', agora), '');
  assert.equal(R.contagem('2026-10-27T18:00', new Date(0)), '', 'relógio da TV errado: nada, como o relógio');
});

test('a contagem passa pela porta; campo vivo inventado continua barrado', () => {
  assert.ok(P.VIVOS.includes('contagem'));
  const ok = P.higienizar({ html: '<section class="mt-peca"><span data-vivo="contagem">2d</span></section>', css: '' });
  assert.deepEqual(ok.problemas, []);
  const ruim = P.higienizar({ html: '<section class="mt-peca"><span data-vivo="cronometro">2d</span></section>', css: '' });
  assert.match(ruim.problemas.join(' '), /data-vivo="cronometro" não existe/);
});

test('o desenhista: a contagem anda de segundo em segundo, inclusive na TV fraca', () => {
  const r = ler('js', 'peca-render.js');
  assert.match(r, /else if \(nome === 'contagem'\) el\.textContent = contagem\(o\.contagem, agora\(\)\);/);
  assert.match(r, /setInterval\(tick, temContagem \? 1000 : 20000\)/);
  // O tique não depende do modo leve: é troca de texto, não animação.
  const tique = r.slice(r.indexOf('const temContagem'), r.indexOf('const temContagem') + 300);
  assert.doesNotMatch(tique, /o\.leve/);
});

test('a config leva a lista de peças e a data da contagem até a TV', () => {
  const cab = peca('cabecalho-classico');
  const cab2 = peca('cabecalho-chamadas');
  const rod = peca('rodape-contagem');
  const cfg = S.normalize({
    settings: { layoutId: 'corporate' },
    zonas: {
      cabecalho: { pecas: [cab, cab2, { type: 'text', titulo: 'x' }, cab, cab, cab], messages: ['Pão quentinho', 'Café na hora'], contagem: 'amanhã' },
      rodape: { pecas: [rod], messages: ['Aceitamos Pix'], contagem: '2026-10-27T18:00' },
    },
  });
  assert.equal(cfg.zonas.cabecalho.pecas.length, 4, 'até 4 peças girando, só peça em HTML');
  assert.ok(cfg.zonas.cabecalho.pecas.every((p) => p.type === 'peca-html'));
  assert.equal(cfg.zonas.cabecalho.peca, cab, 'a TV com o JS antigo mostra a primeira');
  assert.deepEqual(cfg.zonas.cabecalho.messages, ['Pão quentinho', 'Café na hora'], 'as chamadas do cabeçalho sobrevivem');
  assert.equal(cfg.zonas.cabecalho.contagem, undefined, 'data fora da forma não passa');
  assert.equal(cfg.zonas.rodape.contagem, '2026-10-27T18:00');
  assert.equal(cfg.zonas.rodape.pecas.length, 1);
  // Sem lista, tudo como antes.
  const antigo = S.normalize({ settings: { layoutId: 'corporate' }, zonas: { cabecalho: { peca: cab } } });
  assert.equal(antigo.zonas.cabecalho.peca, cab);
  assert.equal(antigo.zonas.cabecalho.pecas, undefined);
});

test('cada peça do giro passa pela porta do servidor', () => {
  const boa = peca('cabecalho-classico');
  const cfg = { zonas: { cabecalho: { pecas: [boa, Object.assign({}, boa, { html: '<section class="mt-peca"><script>alert(1)</script></section>' }), { type: 'text' }] } } };
  const r = P.conferirConfig(cfg);
  assert.ok(r.problemas.some((p) => /cabecalho \(peça 2 do giro\)/.test(p)), 'a peça com script passou');
  assert.ok(r.problemas.some((p) => /cabecalho \(peça 3 do giro\): type precisa ser "peca-html"/.test(p)));
  assert.ok(!r.problemas.some((p) => /peça 1 do giro/.test(p)), 'a peça-ouro foi recusada');
});

test('o player: a faixa com várias peças gira, e a TV fraca troca seco', () => {
  const p = ler('js', 'player.js');
  const start = p.slice(p.indexOf('function startPecaFixa('), p.indexOf('const CFG_CACHE_KEY'));
  assert.match(start, /const lista = pecasDaFaixa\(zone, data\);/);
  assert.match(start, /if \(lista\.length > 1\) \{/);
  assert.match(start, /const segundos = Math\.max\(6, Number\(lista\[i\]\.duracao\) \|\| 20\);/, 'giro de no mínimo 6 s: menos que isso ninguém lê');
  assert.match(start, /i = \(i \+ 1\) % lista\.length; mostrar\(\);/);
  // A troca remonta a peça; a transição é a entrada dela, que o modo leve já desliga (opcoesDaPeca).
  assert.match(ler('js', 'render.js'), /leve: document\.documentElement\.classList\.contains\('mt-perf'\)/);
});

test('as peças-ouro novas passam pela porta e entram quando a faixa pede', () => {
  for (const id of ['rodape-contagem', 'cabecalho-chamadas']) {
    const h = P.higienizar(ouro(id));
    assert.deepEqual(h.problemas, [], id);
    assert.deepEqual(h.avisos, [], id);
  }
  assert.match(ouro('rodape-contagem').html, /data-vivo="contagem"/);
  assert.match(ouro('rodape-contagem').html, /data-vivo="mensagens"/);
  assert.match(ouro('cabecalho-chamadas').html, /data-vivo="mensagens"/);
  const m = JSON.parse(ler('pecas-ouro', 'manifesto.json'));
  for (const id of ['rodape-contagem', 'cabecalho-chamadas']) {
    const def = m.pecas.find((x) => x.id === id);
    assert.ok(def, id + ' fora do manifesto');
    assert.equal(def.estado, 'rascunho', id + ': só o dono aprova');
  }
  const base = { textos: { kicker: 'HOJE', titulo: 'Pão de queijo em dobro' }, empresa: 'Padaria do Bairro' };
  assert.equal(compositor.preencherPapel({ ...base, papel: 'rodape', contagem: '2026-10-27T18:00' }).origem.base, 'rodape-contagem');
  assert.equal(compositor.preencherPapel({ ...base, papel: 'rodape', contagem: '2026-10-27T18:00', indice: 1 }).origem.base, 'rodape-relogio', 'o segundo estilo gira com outra peça');
  assert.equal(compositor.preencherPapel({ ...base, papel: 'rodape' }).origem.base, 'rodape-selo');
  const chamadas = compositor.preencherPapel({ ...base, papel: 'cabecalho', chamadas: ['Café na hora'] });
  assert.equal(chamadas.origem.base, 'cabecalho-chamadas');
  assert.equal(chamadas.campos.marca, 'Padaria do Bairro');
  assert.equal(compositor.preencherPapel({ ...base, papel: 'cabecalho' }).origem.base, 'cabecalho-classico');
  // A IA aprende que a contagem existe.
  assert.match(compositor.regras(), /contagem regressiva só por data-vivo="contagem"/);
});

test('a lateral sem foto da reserva é uma chamada, não um aviso de atenção', () => {
  // Item 27: a reserva usava a peça de alerta (triângulo com "!") até para a promoção da tarde.
  const p = compositor.preencherPapel({ papel: 'lateral', textos: { kicker: 'Só à tarde', titulo: 'Pão de queijo em dobro', apoio: 'Das 15h às 17h.', cta: 'Peça no balcão' } });
  assert.equal(p.origem.base, 'lateral-chamada');
  assert.deepEqual(p.campos, { kicker: 'Só à tarde', titulo: 'Pão de queijo em dobro', apoio: 'Das 15h às 17h.', cta: 'Peça no balcão' });
  assert.deepEqual(P.validarItem(p).problemas, []);
  assert.doesNotMatch(p.html, /sinal/, 'nada de ícone de alerta');
  assert.match(ouro('lateral-chamada').css, /\.cta:empty \{ display: none; \}/, 'sem chamada, sem o sublinhado sozinho');
});
