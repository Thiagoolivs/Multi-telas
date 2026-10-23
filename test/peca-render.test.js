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

/* ---------------- Cabeçalho e rodapé com peça (PLANO §4.7) ---------------- */

const CAB = P.doArquivo(ler('pecas-ouro', 'cabecalho-classico.html'));
const ROD = P.doArquivo(ler('pecas-ouro', 'rodape-selo.html'));
const pecaFixa = (a, extra) => Object.assign({ type: 'peca-html', html: a.html, css: a.css }, extra);

test('a peça fixa do cabeçalho e do rodapé passa pela mesma porta da playlist', () => {
  const cfg = {
    zonas: {
      cabecalho: { header: true, peca: pecaFixa(CAB, { css: CAB.css + '.y{color:#fff}', modo: 'escuro' }) },
      rodape: { messages: ['oi'], peca: pecaFixa(ROD) },
    },
  };
  const r = P.conferirConfig(cfg, { hostsMidia: [] });
  // Problema com a zona e "(peça fixa)" — o painel diz ONDE está a peça ruim.
  assert.ok(r.problemas.some((p) => /^cabecalho \(peça fixa\): .*cor só por token/.test(p)), r.problemas.join('\n'));
  assert.ok(!r.problemas.some((p) => /^rodape/.test(p)), r.problemas.join('\n'));
  // A porta limpa a peça e não mexe no resto da zona.
  assert.ok(!cfg.zonas.cabecalho.peca.css.includes('#fff'), 'o CSS ruim ficou');
  assert.equal(cfg.zonas.cabecalho.peca.modo, 'escuro');
  assert.equal(cfg.zonas.cabecalho.header, true);
  assert.deepEqual(cfg.zonas.rodape.messages, ['oi']);
  // Peça de outro tipo na zona fixa não entra: só peca-html tem desenhista lá.
  const outra = P.conferirConfig({ zonas: { rodape: { peca: { type: 'composicao', elementos: [] } } } });
  assert.deepEqual(outra.problemas.filter((p) => /type precisa/.test(p)), ['rodape (peça fixa): type precisa ser "peca-html"']);
  // Config sem peça fixa continua sem problema.
  assert.deepEqual(P.conferirConfig({ zonas: { cabecalho: { header: true }, rodape: { messages: [] } } }).problemas, []);
});

test('a peça fixa sobrevive à normalização do painel até a TV', () => {
  /*
   * normalize() reconstrói a zona campo a campo. Sem esta linha, a peça
   * gravada no cabeçalho some calada e a TV mostra o desenho padrão.
   */
  const S = require('../js/storage.js');
  const peca = pecaFixa(CAB);
  const out = S.normalize({
    settings: { layoutId: 'header-main-ticker' },
    zonas: { cabecalho: { header: true, peca }, rodape: { messages: ['oi'], peca: pecaFixa(ROD) } },
  });
  assert.deepEqual(out.zonas.cabecalho.peca, peca);
  assert.equal(out.zonas.rodape.peca.html, ROD.html);
  assert.deepEqual(out.zonas.rodape.messages, ['oi']);
  // Quem não tem peça não ganha uma.
  const sem = S.normalize({ settings: { layoutId: 'header-main-ticker' }, zonas: {} });
  assert.ok(!('peca' in sem.zonas.cabecalho) && !('peca' in sem.zonas.rodape));
});

test('o player desenha a peça fixa com o mesmo contexto da playlist', () => {
  const p = semComentarios(ler('js', 'player.js'));
  const zona = p.slice(p.indexOf('function iniciarZona('), p.indexOf('function temPecaFixa('));
  // A peça vem ANTES do desenho padrão do cabeçalho e do letreiro.
  const fixa = zona.indexOf('temPecaFixa(zone, data)');
  assert.ok(fixa > 0 && fixa < zona.indexOf("zone.type === 'ticker'") && fixa < zona.indexOf("zone.type === 'header'"));
  const tem = p.slice(p.indexOf('function temPecaFixa('), p.indexOf('function startPecaFixa('));
  assert.match(tem, /zone\.type !== 'header' && zone\.type !== 'ticker'/, 'peça fixa só em cabeçalho e rodapé');
  /*
   * Desde o item 22 a faixa tem uma LISTA que gira (`pecas`), e `peca`
   * continua valendo sozinha. A regra de quem entra mora em pecasDaFaixa.
   */
  const faixa = p.slice(p.indexOf('function pecasDaFaixa('), p.indexOf('function temPecaFixa('));
  assert.match(faixa, /Array\.isArray\(data\.pecas\) && data\.pecas\.length \? data\.pecas : \(data\.peca \? \[data\.peca\] : \[\]\)/);
  assert.match(faixa, /\.filter\(\(p\) => p && p\.type === 'peca-html'\)/);
  assert.match(tem, /return pecasDaFaixa\(zone, data\)\.length > 0/);
  // Rodapé sem mensagem nenhuma fica no letreiro padrão…
  assert.match(faixa, /Array\.isArray\(data\.messages\) && data\.messages\.some\(/);
  // …a não ser que a peça não mostre mensagem (a faixa fixa com chamada e contato).
  assert.match(faixa, /temMensagem \|\| !\/data-vivo="mensagens"\/\.test\(p\.html \|\| ''\)/);
  for (const id of ['rodape-selo', 'rodape-pagamento']) assert.match(ler('pecas-ouro', id + '.html'), /data-vivo="mensagens"/, id);
  assert.doesNotMatch(ler('pecas-ouro', 'rodape-faixa.html'), /data-vivo="mensagens"/);
  const start = p.slice(p.indexOf('function startPecaFixa('), p.indexOf('const CFG_CACHE_KEY'));
  assert.match(start, /MTRender\.opcoesDaPeca\(\{/);
  assert.match(start, /marcaNaTela: false/, 'a peça do cabeçalho é a marca: não pode esconder o nome');
  assert.match(start, /mensagens: Array\.isArray\(data\.messages\) \? data\.messages : \[\]/);
  assert.match(start, /contagem: data\.contagem \|\| ''/);
  assert.match(start, /stop\(\) \{ parada = true; clearTimeout\(espera\); if \(ctl\) ctl\.parar\(\); \}/, 'o relógio e o giro ficam rodando depois que a zona sai');
  // E a playlist pede o contexto do mesmo lugar.
  const r = semComentarios(ler('js', 'render.js'));
  // Desenhada no tamanho de 1080p e escalada para a tela (item 7 do EXECUTOR: hostDaPeca).
  assert.match(r, /MTPecaRender\.montar\(hostDaPeca\(el\), item, opcoesDaPeca\(\)\)/);
  assert.match(r, /global\.MTRender = \{[^}]*opcoesDaPeca[^}]*\}/);
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
    ['Clínica Vida', 'Distribuidora Rota Sul', 'Lanchonete da Praça', 'Padaria do Bairro', 'Studio Bella', 'Ótica Central'].sort());
});

test('toda peça diz em que marca nasceu, e a bancada abre nela', () => {
  /*
   * O texto de exemplo de uma peça é da marca em que ela nasceu ("Pães da
   * casa" é da padaria). Abrir a peça em outra marca mostraria a padaria
   * com as cores da ótica — e o dono aprovaria a combinação errada.
   */
  for (const def of MANIFESTO.pecas) {
    assert.ok(MANIFESTO.marcas.some((m) => m.id === def.marca), def.id + ': marca ' + def.marca);
  }
  const b = semComentarios(ler('js', 'bancada.js'));
  assert.match(b, /if \(k === 'peca' && defDe\(\$\('peca'\)\.value\)\.marca\) \$\('marca'\)\.value = /);
  assert.match(b, /if \(k === 'tela'\) \$\('layout'\)\.value = /);
});

test('as mensagens do rodapé são de cada tela, não da biblioteca', () => {
  // A padaria passando "Exame de vista com hora marcada" no rodapé foi o que motivou isto.
  assert.ok(!('mensagens' in MANIFESTO), 'mensagens soltas no manifesto valem para toda tela');
  const b = semComentarios(ler('js', 'bancada.js'));
  assert.match(b, /mensagens: tela\.mensagens \|\| \[\]/);
  assert.match(b, /mensagens: mensagensDaMarca\(marca\.id\)/);
  assert.doesNotMatch(b, /manifesto\.mensagens/);
});

test('a bancada acusa texto sobre texto, não só texto fora da peça', () => {
  /*
   * A chamada do cabeçalho em pé passava por baixo da hora ("DOBR04:12")
   * sem sair da peça — a medida de vazamento não via. A hora é data-vivo,
   * então os vivos parados entram na conta; a rolagem do rodapé, não.
   */
  // O detector é um só (js/peca-conferir.js): a bancada e o painel medem igual.
  const c = semComentarios(ler('js', 'peca-conferir.js'));
  assert.match(c, /querySelectorAll\('\[data-campo\], \[data-vivo\]:not\(\[data-vivo="mensagens"\]\)'\)/);
  assert.match(c, /function sobrepostos\(caixas\)/);
  assert.match(c, /if \(a\.el\.contains\(b\.el\) \|\| b\.el\.contains\(a\.el\)\) continue/);
  const b = semComentarios(ler('js', 'bancada.js'));
  // D44: com o papel, a bancada mede também as regras de composição.
  assert.match(b, /MTPecaConferir\.conferir\(host, \{ esperar: 2500, papel \}\)/);
  assert.match(b, /' · SOBREPÕE: '/);
  assert.match(ler('bancada.html'), /<script src="\/js\/peca-conferir\.js"><\/script>\s*<script src="\/js\/bancada\.js">/);
});

test('detector: "passa da borda" mede também as linhas do texto, não só a caixa', () => {
  /*
   * Uma palavra longa que não quebra transborda a própria caixa, e a caixa
   * continua dentro da peça: o editor mostrava "ANTICONSTITU…" cortado e o
   * detector dizia que cabia. Com a medida certa, a varredura de 948
   * combinações achou "DE COSTELA" vazando 91px no lançamento em pé.
   */
  const c = semComentarios(ler('js', 'peca-conferir.js'));
  assert.match(c, /if \(linhas\.some\(passa\)\) fora\.push\(nome\)/);
  assert.match(c, /if \(!el\.textContent\.trim\(\)\) return \[r\]/, 'campo sem texto (foto) continua medido pela caixa');
  const lanc = ler('pecas-ouro', 'institucional-lancamento.html');
  assert.doesNotMatch(lanc, /h1 span, h1 em \{[^}]*nowrap/, 'título sem quebra vaza com fonte larga');
});

test('detector: linhas se cobrem só acima de um quinto da menor', () => {
  const { cobre } = require('../js/peca-conferir.js');
  const r = (left, top, right, bottom) => ({ left, top, right, bottom });
  assert.equal(cobre(r(0, 0, 100, 10), r(50, 5, 150, 15)), true);
  assert.equal(cobre(r(0, 0, 100, 10), r(0, 9, 100, 19)), false, 'encostar um décimo não é sobrepor');
  assert.equal(cobre(r(0, 0, 100, 10), r(100, 0, 200, 10)), false, 'lado a lado não é sobrepor');
});

test('a bancada não desenha a tela com largura zero quando abre escondida', () => {
  // Aberta numa aba em segundo plano, innerWidth é 0: a escala ficava negativa e a tela sumia.
  assert.match(semComentarios(ler('js', 'bancada.js')), /Math\.min\(1400, Math\.max\(640, innerWidth - 40\)\)/);
});

test('a bancada roda sob a CSP: nenhum script embutido', () => {
  const html = ler('bancada.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'script embutido não roda com script-src self');
  assert.match(html, /<meta name="robots" content="noindex"/);
});

/* ---------------- Lote 1: o que a tela montada mostrou ---------------- */

test('os padrões da sombra não pesam nada: o espaçamento da peça sempre vence', () => {
  /*
   * A primeira versão usava `.mt-peca :is(h1,p…){margin:0}`, que pesa mais
   * que o `h1 {…}` da peça — e zerava calado todo espaçamento desenhado.
   * O título encostava no apoio e parecia defeito de entrelinha.
   */
  assert.match(R.BASE, /:where\(\.mt-peca\) :where\(h1,/);
  assert.doesNotMatch(R.BASE, /\.mt-peca :is\(/);
  for (const regra of R.BASE.split('}')) {
    if (/margin:0[;}]?$|display:block$|box-sizing/.test(regra) && !/!important/.test(regra)) {
      assert.match(regra, /^:where\(/, 'padrão com peso: ' + regra);
    }
  }
});

test('número na peça é sempre algarismo alinhado, em qualquer fonte da marca', () => {
  /*
   * A Playfair (serifada) usa algarismos antigos: o 9 de "R$ 89" descia
   * da linha. O `font:` abreviado das peças zera o que vem herdado, por
   * isso a regra vai em todo elemento e com !important.
   */
  assert.ok(R.BASE.includes('.mt-peca,.mt-peca *{font-variant-numeric:lining-nums!important}'));
});

test('o rodapé rola só com translate, em volta sem emenda', () => {
  assert.equal(R.ROLAR, 'from{translate:0 0}to{translate:-50% 0}');
  assert.ok(R.keyframes().includes('@keyframes mt-pr-rolar{' + R.ROLAR + '}'));
  const fonte = semComentarios(ler('js', 'peca-render.js'));
  // A linha vai duas vezes: andando metade, a segunda cópia está onde a primeira começou.
  assert.match(fonte, /el\.textContent = linha \+ linha/);
  assert.match(R.BASE, /\[data-vivo="mensagens"\]\{display:inline-block;white-space:nowrap\}/);
});

test('o QR é desenhado pelo nosso servidor, a partir do texto do campo', () => {
  const fonte = semComentarios(ler('js', 'peca-render.js'));
  assert.match(fonte, /'\/api\/qr\.svg\?d=' \+ encodeURIComponent\(valor\)/);
});

test('numa tela com cabeçalho, a peça não repete a marca — no player e na bancada', () => {
  assert.match(R.BASE, /\.mt-peca\[data-marca-na-tela\] \[data-repete="marca"\]\{display:none!important\}/);
  assert.match(semComentarios(ler('js', 'render.js')), /marcaNaTela: !!global\.MT_MARCA_NA_TELA/);
  assert.match(semComentarios(ler('js', 'player.js')), /MT_MARCA_NA_TELA = !!\(layout && layout\.zones\.some\(\(z\) => z\.type === 'header'\)\)/);
  // Toda peça de destaque que mostra o nome da marca marca esse nome como repetível.
  for (const def of MANIFESTO.pecas.filter((p) => p.papeis.includes('destaque'))) {
    const html = ler('pecas-ouro', def.id + '.html');
    if (/class="marca-nome"/.test(html)) assert.match(html, /class="marca-nome"[^>]*data-repete="marca"/, def.id);
  }
});

/* ---------------- As telas completas ---------------- */

const { getLayout } = require('../js/templates.js');
const PAPEL_DO_GRUPO = { cabecalho: 'cabecalho', principal: 'destaque', lateral: 'lateral', rodape: 'rodape' };
const entrada = (e) => (typeof e === 'string' ? { id: e, campos: {} } : { id: e.id, campos: e.campos || {} });

test('toda tela completa do manifesto é montável: marca, layout, modos e peças no papel certo', () => {
  assert.ok((MANIFESTO.telas || []).length >= 1);
  for (const tela of MANIFESTO.telas) {
    assert.ok(MANIFESTO.marcas.some((m) => m.id === tela.marca), tela.id + ': marca');
    assert.equal(getLayout(tela.layout).id, tela.layout, tela.id + ': layout');
    for (const [grupo, z] of Object.entries(tela.zonas)) {
      assert.ok(PAPEL_DO_GRUPO[grupo], tela.id + ': zona ' + grupo);
      assert.ok(T.MODOS.includes(z.modo), tela.id + ': modo ' + z.modo);
      for (const e of z.pecas.map(entrada)) {
        const def = MANIFESTO.pecas.find((p) => p.id === e.id);
        assert.ok(def, tela.id + ': peça ' + e.id);
        assert.ok(def.papeis.includes(PAPEL_DO_GRUPO[grupo]), `${tela.id}: ${e.id} não serve em ${grupo}`);
        const nomes = P.higienizar(P.doArquivo(ler('pecas-ouro', e.id + '.html'))).campos.map((c) => c.nome);
        for (const k of Object.keys(e.campos)) assert.ok(nomes.includes(k), `${tela.id}: ${e.id} não tem o campo ${k}`);
      }
    }
  }
});

test('numa tela completa, QR só numa zona — dois QRs juntos, o cliente não sabe qual ler', () => {
  // Visto na tela do salão: o QR de agendar no destaque e o do Instagram na lateral, lado a lado.
  for (const tela of MANIFESTO.telas) {
    const comQr = Object.entries(tela.zonas)
      .filter(([, z]) => z.pecas.map(entrada).some((e) => /data-campo-qr=/.test(ler('pecas-ouro', e.id + '.html'))))
      .map(([grupo]) => grupo);
    assert.ok(comQr.length <= 1, `${tela.id}: QR em ${comQr.join(' e ')}`);
  }
});

test('numa tela completa, nenhum texto aparece em duas zonas', () => {
  /*
   * PLANO §4.7: cada zona tem um papel. Na primeira montagem da ótica,
   * "até sábado" estava no cabeçalho, no destaque e na lateral ao mesmo
   * tempo, e o nome da marca, três vezes. O nome da marca nas peças é
   * escondido pelo renderizador (data-repete); o resto, a tela precisa
   * escrever diferente.
   */
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  for (const tela of MANIFESTO.telas) {
    const porZona = {};
    for (const [grupo, z] of Object.entries(tela.zonas)) {
      porZona[grupo] = new Set();
      for (const e of z.pecas.map(entrada)) {
        const def = MANIFESTO.pecas.find((p) => p.id === e.id);
        const campos = P.higienizar(P.doArquivo(ler('pecas-ouro', e.id + '.html'))).campos;
        for (const c of campos) {
          if (c.tipo !== 'texto' || c.nome === 'marca') continue;
          const v = e.campos[c.nome] != null ? e.campos[c.nome] : (def.campos || {})[c.nome] != null ? def.campos[c.nome] : c.exemplo;
          // Número sozinho (preço, centavos) pode coincidir: R$ 22 da batata e R$ 22 do suco não são a mesma mensagem.
          if (norm(v) && !/^[\d\s.,%×]+$/.test(norm(v))) porZona[grupo].add(norm(v));
        }
      }
    }
    // As mensagens do rodapé são da tela — cada campanha tem as suas.
    assert.ok(Array.isArray(tela.mensagens) && tela.mensagens.length >= 3, tela.id + ': mensagens do rodapé');
    porZona.mensagens = new Set(tela.mensagens.map(norm));
    const grupos = Object.keys(porZona);
    for (let a = 0; a < grupos.length; a++) {
      for (let b = a + 1; b < grupos.length; b++) {
        const repetidos = [...porZona[grupos[a]]].filter((t) => porZona[grupos[b]].has(t));
        assert.deepEqual(repetidos, [], `${tela.id}: "${repetidos[0]}" em ${grupos[a]} e ${grupos[b]}`);
      }
    }
  }
});
