/*
 * O desenhista da peça em HTML (js/peca-render.js) e o caminho dela até a TV.
 *
 * O desenho em si foi conferido no navegador — bancada e player lado a lado,
 * e foi assim que apareceu a fonte que não carregava no player. O que fica
 * aqui é o que dá para garantir sem tela: as animações batem com a
 * biblioteca, o servidor recusa peça ruim antes de gravar, o player carrega
 * os arquivos na ordem certa, e toda peça da biblioteca-ouro passa pela porta.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = require('../js/peca-render.js');
const P = require('../js/peca-html.js');
const A = require('../js/animacao.js');
const T = require('../js/tokens.js');
const F = require('../js/fontes.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ---------------- Animação ---------------- */

test('toda entrada e todo movimento da biblioteca têm animação na peça em HTML', () => {
  /*
   * A IA escolhe em `data-entrada` os mesmos nomes do editor (js/animacao.js).
   * Um nome que existe lá e falta aqui passaria pela porta e não animaria
   * nada na TV — sem erro nenhum.
   */
  const entradas = A.ENTRADAS.map((e) => e.id).filter(Boolean).sort();
  const continuas = A.CONTINUAS.map((e) => e.id).filter(Boolean).sort();
  assert.deepEqual(Object.keys(R.ENTRADAS).sort(), entradas);
  assert.deepEqual(Object.keys(R.CONTINUAS).sort(), continuas);
});

test('as animações mexem só em opacidade e nas propriedades individuais de movimento', () => {
  /*
   * Nunca `transform`: a peça usa transform para se posicionar, e a animação
   * apagaria isso (o bloco entraria e terminaria fora do lugar). E nada que
   * refaça layout — no box barato é o que trava.
   */
  const props = new Set();
  for (const k of Object.values(R.ENTRADAS).concat(Object.values(R.CONTINUAS))) {
    for (const m of k.matchAll(/([a-z-]+)\s*:/g)) props.add(m[1]);
  }
  assert.deepEqual([...props].sort(), ['opacity', 'rotate', 'scale', 'translate']);
});

test('o CSS da sombra traz estrutura, tokens da marca, animações e a peça — nessa ordem', () => {
  const tokens = T.gerar({ marca: '#1b2a4a', marca2: '#c8a96e', modo: 'escuro', fonteTitulo: 'condensada' });
  const css = R.cssCompleto('.x{color:var(--mt-texto)}', tokens);
  const i = (s) => css.indexOf(s);
  assert.ok(i(':host{') === 0, 'a estrutura vem primeiro');
  assert.ok(i('--mt-destaque:' + tokens.cores.destaque) > 0, 'faltou o token');
  assert.ok(i(F.FAMILIAS.condensada.css) > 0, 'faltou a fonte da marca');
  assert.ok(i('@keyframes mt-pe-subir') > i('--mt-fundo:'));
  assert.ok(i('.x{color:var(--mt-texto)}') > i('@keyframes'), 'a peça vem por último');
  // A raiz da peça não sai do lugar, mesmo que a peça tente.
  assert.match(R.BASE, /\.mt-palco>\.mt-peca\{position:absolute!important;inset:0!important/);
});

test('relógio e data dos campos vivos: formato da TV, e nada quando o relógio do box não é confiável', () => {
  const d = new Date(2026, 9, 20, 9, 5);
  assert.equal(R.vivo('relogio', d), '09:05');
  assert.equal(R.vivo('data', d), 'Terça · 20 out');
  // Box sem internet nasce em 1970: hora errada na parede é pior que nenhuma.
  assert.equal(R.vivo('relogio', new Date(0)), '');
  assert.equal(R.vivo('data', new Date(2000, 0, 1)), '');
});

test('o renderizador escreve campo como TEXTO, nunca como HTML', () => {
  // O que o cliente digita não pode virar tag na TV.
  const fonte = semComentarios(ler('js', 'peca-render.js'));
  assert.match(fonte, /el\.textContent = valor/);
  assert.doesNotMatch(fonte, /innerHTML\s*=\s*valor|insertAdjacentHTML/);
  // E a porta roda de novo antes de desenhar: a TV não confia em quem mandou.
  assert.match(fonte, /P\.validarItem\(item/);
});

/* ---------------- O item e a config ---------------- */

const BOA = P.doArquivo(ler('pecas-ouro', 'oferta-foto.html'));

test('a marca vai junto no item, saneada: só hex e fontes do catálogo', () => {
  const r = P.validarItem({ type: 'peca-html', html: BOA.html, css: BOA.css, duracao: 999,
    marca: { cores: ['#1B2A4A', 'azul', '#c8a96e', '#000000', '#ffffff'], fonteTitulo: 'condensada', fonteApoio: 'comic' } });
  assert.deepEqual(r.item.marca, { cores: ['#1b2a4a', '#c8a96e', '#000000'], fonteTitulo: 'condensada', fonteApoio: '' });
  assert.equal(r.item.duracao, 120);
  assert.equal(P.validarItem({ type: 'peca-html', html: BOA.html, css: BOA.css, marca: { cores: ['x'] } }).item.marca, null);
  assert.equal(P.validarItem({ type: 'peca-html', html: BOA.html, css: BOA.css, duracao: 2 }).item.duracao, 12);
});

test('conferirConfig: limpa as peças, recusa as ruins e não mexe no resto da config', () => {
  const cfg = {
    settings: {},
    zonas: {
      principal: { items: [
        { type: 'composicao', elementos: [], duracao: 10 },
        { type: 'peca-html', html: BOA.html, css: BOA.css + '.y{color:#fff}', modo: 'claro',
          agendamento: { ativo: true, horaInicio: '06:00' }, _campanha: 'Semana do Sol', id: 'it_1' },
      ] },
      lateral: { items: [{ type: 'peca-html', html: BOA.html, css: BOA.css, campos: { foto: 'https://x.com/a.jpg' } }] },
      rodape: { messages: ['oi'] },
    },
  };
  const r = P.conferirConfig(cfg, { hostsMidia: [] });
  // As duas ruins aparecem, com zona e posição — é o que o painel mostra.
  assert.ok(r.problemas.some((p) => /^principal #2: .*cor só por token/.test(p)), r.problemas.join('\n'));
  assert.ok(r.problemas.some((p) => /^lateral #1: .*foto/.test(p)));
  // O que é de playlist passa intacto; o item de outro tipo também.
  const peca = cfg.zonas.principal.items[1];
  assert.deepEqual(peca.agendamento, { ativo: true, horaInicio: '06:00' });
  assert.equal(peca._campanha, 'Semana do Sol');
  assert.equal(peca.id, 'it_1');
  assert.ok(!peca.css.includes('#fff'), 'o CSS ruim ficou');
  assert.deepEqual(cfg.zonas.principal.items[0], { type: 'composicao', elementos: [], duracao: 10 });
  assert.deepEqual(cfg.zonas.rodape, { messages: ['oi'] });
  // Config limpa não tem problema.
  const limpa = { zonas: { principal: { items: [{ type: 'peca-html', html: BOA.html, css: BOA.css }] } } };
  assert.deepEqual(P.conferirConfig(limpa).problemas, []);
});

test('o servidor confere a peça ANTES de gravar e declara de onde a TV aceita foto', () => {
  const rota = semComentarios(ler('server', 'routes', 'telas.js'));
  const conferir = rota.indexOf('pecaHtml.conferirConfig(cfg');
  const gravar = rota.indexOf('db.setDeviceConfig(id, JSON.stringify(cfg)');
  assert.ok(conferir > 0 && gravar > conferir, 'a config é gravada antes de passar pela porta');
  assert.match(rota.slice(conferir, gravar), /sendJson\(res, 400/);
  assert.match(rota.slice(conferir, gravar), /cfg\.settings\.hostsMidia = hostsMidia/);
});

/* ---------------- No player ---------------- */

test('o player carrega tokens, porta e desenhista depois das dependências e antes do render', () => {
  const html = ler('player.html');
  const pos = (f) => html.indexOf('src="js/' + f + '"');
  for (const f of ['tokens.js', 'peca-html.js', 'peca-render.js']) assert.ok(pos(f) > 0, f + ' não está no player.html');
  for (const dep of ['cor.js', 'fontes.js', 'animacao.js']) assert.ok(pos(dep) < pos('tokens.js'), dep + ' depois de tokens.js');
  assert.ok(pos('tokens.js') < pos('peca-html.js') && pos('peca-html.js') < pos('peca-render.js'));
  assert.ok(pos('peca-render.js') < pos('render.js'));
});

test('render.js desenha peca-html com o contexto da tela, e solta o relógio ao sair', () => {
  const r = semComentarios(ler('js', 'render.js'));
  assert.match(r, /RENDERERS\['peca-html'\] = renderPecaHtml/);
  assert.match(r, /hostsMidia: global\.MT_HOSTS_MIDIA/);
  assert.match(r, /leve: document\.documentElement\.classList\.contains\('mt-perf'\)/);
  assert.match(r, /onLeave: ctl\.parar/);
  const p = semComentarios(ler('js', 'player.js'));
  assert.ok((p.match(/contextoDaPeca\(cfg\)/g) || []).length >= 2, 'o contexto da peça não é atualizado nos dois caminhos do palco');
});

/* ---------------- A biblioteca-ouro ---------------- */

const MANIFESTO = JSON.parse(ler('pecas-ouro', 'manifesto.json'));

test('toda peça da biblioteca-ouro passa pela porta sem nenhum problema', () => {
  /*
   * A biblioteca é o exemplo que a IA imita e o modelo que o cliente
   * preenche à mão. Peça-ouro recusada pela porta ensinaria a IA a errar.
   */
  assert.ok(MANIFESTO.pecas.length >= 1);
  for (const def of MANIFESTO.pecas) {
    const arq = P.doArquivo(ler('pecas-ouro', def.id + '.html'));
    const r = P.higienizar(arq);
    assert.deepEqual(r.problemas, [], def.id);
    assert.deepEqual(r.avisos, [], def.id);
    // Os campos de exemplo do manifesto existem na peça.
    const nomes = r.campos.map((c) => c.nome);
    for (const k of Object.keys(def.campos || {})) assert.ok(nomes.includes(k), def.id + ': campo ' + k);
    const v = P.validarItem({ type: 'peca-html', html: arq.html, css: arq.css, campos: def.campos || {} });
    assert.deepEqual(v.problemas, [], def.id);
    for (const papel of def.papeis) assert.ok(P.PAPEIS.includes(papel), def.id + ': papel ' + papel);
    assert.ok(['rascunho', 'aprovada'].includes(def.estado), def.id + ': estado ' + def.estado);
  }
});

test('as marcas de teste da bancada são válidas e todas fictícias', () => {
  for (const m of MANIFESTO.marcas) {
    for (const c of m.cores) assert.match(c, /^#[0-9a-f]{6}$/, m.nome);
    assert.ok(F.FAMILIAS[m.fonteTitulo] && F.FAMILIAS[m.fonteApoio], m.nome + ': fonte fora do catálogo');
    for (const modo of T.MODOS) assert.deepEqual(T.conferir(T.daMarca(m, modo)), [], m.nome + ' ' + modo);
  }
  assert.deepEqual(MANIFESTO.marcas.map((m) => m.nome).sort(),
    ['Clínica Vida', 'Padaria do Bairro', 'Studio Bella', 'Ótica Central'].sort());
});

test('a bancada roda sob a CSP: nenhum script embutido', () => {
  const html = ler('bancada.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'script embutido não roda com script-src self');
  assert.match(html, /<meta name="robots" content="noindex"/);
});
