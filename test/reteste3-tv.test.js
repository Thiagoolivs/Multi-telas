/*
 * Reteste 3 (14/11), a frente da TV: o QR sem link, a faixa do pagamento, a
 * data duas vezes, a letra fora das zonas grandes e a logo do cabeçalho. O
 * desenho foi conferido no player (TVs de verdade, deitada, em pé e
 * quadrada) e a régua (tools/regua-tv.mjs) mede o resto; aqui ficam as
 * partes puras e o que impede de voltar.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const P = require('../js/peca-html.js');
const manifesto = () => JSON.parse(ler('pecas-ouro', 'manifesto.json'));
const daPeca = (id) => P.doArquivo(ler('pecas-ouro', id + '.html'));
const item = (id, campos, ocultos) => {
  const a = daPeca(id);
  return Object.assign({ type: 'peca-html', html: P.higienizar(a).html, css: a.css, campos: campos || {} }, ocultos ? { ocultos } : {});
};
const embrulhar = (h) => '<section class="mt-peca">' + h + '</section>';

/* ---------------- 1. O QR sem link ---------------- */

test('a peça que só existe pelo QR diz isso na raiz; a que se sustenta sem ele, só no bloco do QR', () => {
  // Sem o link, não vão ao ar: o convite para avaliar, o cardápio no celular, o mural, a pesquisa, a agenda pelo QR.
  for (const id of ['cena-qr', 'qr-foto', 'social-avaliacao', 'social-mural', 'social-pesquisa', 'diptico-agenda']) {
    const h = P.higienizar(daPeca(id));
    assert.equal(h.ok, true, id + ': ' + h.problemas.join(' | '));
    assert.deepEqual(h.precisaDeLink, ['link'], id + ' só existe pelo QR');
  }
  // Sem o link, o QR e a instrução saem e o resto fica: a vaga, o serviço com o preço, o @, o WhatsApp escrito, a rede e a senha.
  for (const id of ['cena-vaga', 'vaga-foto', 'servico-agenda', 'gente-vaga', 'lateral-qr', 'social-delivery', 'social-instagram', 'social-wifi']) {
    const h = P.higienizar(daPeca(id));
    assert.equal(h.ok, true, id + ': ' + h.problemas.join(' | '));
    assert.deepEqual(h.precisaDeLink, [], id + ' se sustenta sem o QR');
  }
  // O que aponta para o QR leva a marca: some junto com ele (a cena-qr ia ao ar só com a foto; o qr-foto, com o convite sem QR).
  assert.match(ler('pecas-ouro', 'cena-qr.html'), /<section class="mt-peca cena-qr" data-com-qr="link">/);
  assert.match(ler('pecas-ouro', 'cena-qr.html'), /<p class="instrucao" data-com-qr="link"/);
  assert.match(ler('pecas-ouro', 'qr-foto.html'), /<div class="qr" data-com-qr="link"/);
  assert.match(ler('pecas-ouro', 'social-wifi.html'), /<div class="conectar" data-com-qr="wifi"/);
});

test('a peça da IA, sem marca: some a moldura do QR; se o QR está na peça ou no bloco do título, ela não vai ao ar', () => {
  assert.deepEqual(P.precisaDeLink(embrulhar('<h1 data-campo="titulo">Avalie</h1><img data-campo-qr="link" alt="">')), ['link'], 'QR solto na peça');
  assert.deepEqual(P.precisaDeLink(embrulhar('<div class="cartao"><h1 data-campo="titulo">Avalie</h1><img data-campo-qr="link" alt=""></div>')), ['link'], 'o pai do QR é o cartão do título');
  assert.deepEqual(P.precisaDeLink(embrulhar('<h1 data-campo="titulo">Avalie</h1><figure><img data-campo-qr="link" alt=""></figure>')), [], 'o pai é só a moldura');
  // A porta aceita a marca só com o nome de um campo.
  assert.equal(P.higienizar({ html: embrulhar('<p data-campo="t" data-com-qr="link">x</p><img data-campo-qr="link" alt="">') }).ok, true);
  const ruim = P.higienizar({ html: embrulhar('<p data-campo="t" data-com-qr="Link Errado">x</p>') });
  assert.equal(ruim.ok, false);
  assert.ok(!ruim.html.includes('data-com-qr'));
});

test('vaiAoAr: sem o link (vazio ou escondido) a peça do QR fica fora da volta; com ele, entra', () => {
  assert.equal(P.vaiAoAr(item('cena-qr', { link: '' })), false);
  assert.equal(P.vaiAoAr(item('cena-qr', { link: '   ' })), false, 'espaço não é link');
  assert.equal(P.vaiAoAr(item('cena-qr', {})), false);
  assert.equal(P.vaiAoAr(item('cena-qr', { link: 'https://padariasol.com.br' })), true);
  assert.equal(P.vaiAoAr(item('cena-qr', { link: 'https://padariasol.com.br' }, ['link'])), false, 'a pessoa escondeu o QR');
  assert.equal(P.vaiAoAr(item('cena-vaga', { link: '' })), true, 'a vaga se sustenta sem o QR');
  assert.equal(P.vaiAoAr({ type: 'announce', titulo: 'x' }), true, 'só a peça em HTML tem QR');
  assert.equal(P.vaiAoAr(null), true);
  // A volta da TV pergunta a cada troca; o render repassa à porta.
  assert.match(ler('js', 'player.js'), /const conhecidos = items\.filter\(\(it\) => it && !ehExemplo\(it\)[\s\S]{0,400}&& \(!MTRender\.vaiAoAr \|\| MTRender\.vaiAoAr\(it\)\)/);
  assert.match(ler('js', 'render.js'), /return !P \|\| typeof P\.vaiAoAr !== 'function' \|\| P\.vaiAoAr\(item\);/);
  // E o desenhista: o QR vazio ou que não carregou leva o que aponta para ele (o :has() do CSS saiu; a TV antiga não o lia).
  const r = ler('js', 'peca-render.js');
  assert.match(r, /const marcados = Array\.prototype\.filter\.call\(sombra\.querySelectorAll\('\[data-com-qr\]'\), \(el\) => el !== peca && el\.getAttribute\('data-com-qr'\) === campo\);/);
  assert.match(r, /el\.onerror = \(\) => \{ el\.setAttribute\('data-sem-foto', ''\); if \(foto\) encaixarFoto\(el, foto\.esp\); if \(qr && peca\) qrSemLink\(sombra, peca, el\); \};/);
  // A IA aprende a marcar.
  assert.match(ler('server', 'compositor.js'), /leva data-com-qr="link": sem o link, some junto/);
});

test('o link do QR é um contato de verdade da conta, nunca o da empresa de exemplo nem um inventado', async () => {
  globalThis.MTPecaHtml = globalThis.MTPecaHtml || P;
  const M = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/modelosOuro.js')).href);
  assert.equal(M.linkDaConta({ site: 'https://padariasol.com.br/' }), 'https://padariasol.com.br/');
  assert.equal(M.linkDaConta({ site: 'padariasol.com.br' }), 'https://padariasol.com.br', 'o celular precisa do https://');
  assert.equal(M.linkDaConta({ contato: 'wa.me/5511999990000' }), 'https://wa.me/5511999990000', 'o WhatsApp de Onde fica');
  assert.equal(M.linkDaConta({ site: 'https://sol.com.br', contato: 'wa.me/55' }), 'https://sol.com.br', 'o site primeiro');
  assert.equal(M.linkDaConta({ contato: '@padariasol' }), '', 'o @ sozinho não é endereço');
  assert.equal(M.linkDaConta({ contato: 'javascript:alert(1)' }), '');
  assert.equal(M.linkDaConta({}), '');
  assert.equal(M.linkDaConta(null), '');

  const man = manifesto();
  const modelo = (id) => Object.assign({}, man.pecas.find((p) => p.id === id), { arq: daPeca(id) });
  // O modelo pronto leva o contato no QR; sem contato, a peça que só existe pelo QR não aparece nos Prontos.
  assert.equal(M.itemDoModelo(modelo('cena-qr'), { site: 'padariasol.com.br' }).campos.link, 'https://padariasol.com.br');
  assert.equal(M.itemDoModelo(modelo('cena-qr'), {}).campos.link, undefined, 'sem contato, nada de link');
  assert.equal(M.itemDoModelo(modelo('social-wifi'), { site: 'padariasol.com.br' }).campos.wifi, undefined, 'o QR do Wi-Fi não é o site');
  assert.equal(M.faltaLinkParaOQr(modelo('cena-qr'), {}), true);
  assert.equal(M.faltaLinkParaOQr(modelo('cena-qr'), { contato: 'wa.me/5511999990000' }), false);
  assert.equal(M.faltaLinkParaOQr(modelo('cena-vaga'), {}), false, 'a vaga aparece sem contato');
  assert.equal(M.faltaLinkParaOQr(modelo('oferta-foto'), {}), false);

  const T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/telasProntas.js')).href);
  const ex = T.nomesDeExemplo(man.marcas);
  // A tela que deixou o QR vazio: o contato da conta; sem contato, a pessoa completa (e a TV não mostra a peça até lá).
  const comSite = T.itemDaTela(modelo('cena-qr'), { campos: { link: '' } }, 'marca', 'destaque', { nome: 'Padaria Sol', site: 'padariasol.com.br' }, ex);
  assert.equal(comSite.campos.link, 'https://padariasol.com.br');
  assert.equal(comSite._pendentes, undefined);
  const semNada = T.itemDaTela(modelo('cena-qr'), { campos: { link: '' } }, 'marca', 'destaque', { nome: 'Padaria Sol' }, ex);
  assert.equal(semNada.campos.link, '');
  assert.deepEqual(semNada._pendentes, ['link']);
  assert.equal(P.vaiAoAr(semNada), false);
  // O Wi-Fi da empresa de exemplo não vai para a TV do cliente (a rede é a dela).
  assert.equal(T.limparDoExemplo('WIFI:T:WPA;S:Clientes;P:paoquente;;', { nome: 'wifi', tipo: 'qr' }, { site: 'sol.com.br' }, ex), '');
  const wifi = T.itemDaTela(modelo('social-wifi'), { campos: { wifi: 'WIFI:T:WPA;S:Clientes;P:paoquente;;' } }, 'marca', 'destaque', { nome: 'Padaria Sol', site: 'sol.com.br' }, ex);
  assert.equal(wifi.campos.wifi, '');
  assert.deepEqual(wifi._pendentes, ['wifi']);
});

test('a prévia da tela pronta mostra o que a TV mostra: pula a peça do QR sem link', async () => {
  globalThis.MTPecaHtml = globalThis.MTPecaHtml || P;
  const T = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/telasProntas.js')).href);
  const semLink = item('cena-qr', { link: '' });
  const foto = item('oferta-foto', {});
  const e = T.estadoDaPrevia({ layout: 'full', grupos: { principal: [semLink, foto] }, mensagens: [] });
  assert.equal(e.zonas.principal.item, foto);
  const so = T.estadoDaPrevia({ layout: 'full', grupos: { principal: [semLink] }, mensagens: [] });
  assert.equal(so.zonas.principal, undefined, 'na TV, a zona mostra o relógio');
  // O editor avisa, no campo do QR, que sem o endereço a peça não vai ao ar.
  assert.match(ler('web', 'src', 'components', 'content', 'EditarPeca.jsx'), /'Sem o endereço, esta peça não vai ao ar: ela só existe por causa do QR\.'/);
});

/* ---------------- 2. A faixa do pagamento e a data duas vezes ---------------- */

test('o rodapé de pagamento deixa metade da faixa para os avisos, sem o rótulo, e a forma que não cabe sai', () => {
  const html = ler('pecas-ouro', 'rodape-pagamento.html');
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.ok(!/\.pagar \{[^}]*flex: none/.test(css), 'o bloco do pagamento não é mais `flex: none`');
  assert.match(css, /\.pagar \{ flex: 0 1 auto; min-width: 0; max-width: 50%;/);
  assert.match(css, /\.rotulo \{ display: none; \}/);
  assert.match(css, /\.formas \{[^}]*flex-wrap: wrap;[^}]*overflow: hidden; \}/);
  assert.match(css, /\.formas span \{ position: relative; height: 100%;/, 'cada forma tem a altura da faixa: a que desce some inteira');
  assert.match(css, /\.trilho \{ position: relative; flex: 1 1 0; min-width: 0;/);
  // O espaço entre as letras não cresce com a letra do piso (em em, o rótulo espaçado tomava meia faixa).
  assert.ok(!/letter-spacing: \.32em/.test(css));
  const h = P.higienizar(daPeca('rodape-pagamento'));
  assert.equal(h.ok, true, h.problemas.join(' | '));
  // O campo do rótulo fica: as telas prontas o preenchem.
  assert.ok(h.campos.some((c) => c.nome === 'rotulo'));
});

test('o rodapé não repete a hora, a data e o clima que o cabeçalho já mostra', () => {
  const p = ler('js', 'player.js');
  assert.match(p, /global\.MT_JA_NO_CABECALHO = jaNoCabecalho\(cfg, layout\);/);
  assert.match(p, /if \(!pecas\.length\) return \(d\.relogio !== false \? \['relogio', 'data'\] : \[\]\)\.concat\(d\.clima !== false \? \['clima'\] : \[\]\);/);
  assert.match(p, /return \['relogio', 'data', 'clima'\]\.filter\(\(v\) => pecas\.some\(\(p\) => String\(p\.html \|\| ''\)\.indexOf\('data-vivo="' \+ v \+ '"'\) >= 0\)\);/);
  assert.match(p, /jaNoCabecalho: zone\.type === 'ticker' \? \(global\.MT_JA_NO_CABECALHO \|\| \[\]\) : \[\],/);
  const r = ler('js', 'peca-render.js');
  assert.match(r, /if \(peca && Array\.isArray\(o\.jaNoCabecalho\) && o\.jaNoCabecalho\.length\) semRepetirOCabecalho\(peca, o\.jaNoCabecalho\);/);
  // O bloco que fica sem nada visível sai junto (o bloco colorido da hora no rodape-relogio).
  assert.match(r, /for \(let pai = el\.parentElement; pai && pai !== peca && vazio\(pai\); pai = pai\.parentElement\) pai\.setAttribute\('data-oculto', ''\);/);
  // Os cabeçalhos das telas dos lotes 2 e 3 mostram a data: o rodape-relogio embaixo deles a repetia.
  const man = manifesto();
  const comData = (id) => /data-vivo="data"/.test(ler('pecas-ouro', id + '.html'));
  const ids = (z) => ((z && z.pecas) || []).map((e) => (typeof e === 'string' ? e : e.id));
  const repetiam = man.telas.filter((t) => ids(t.zonas.rodape).includes('rodape-relogio') && ids(t.zonas.cabecalho).some(comData));
  assert.ok(repetiam.length >= 10, 'as telas que repetiam a data continuam no manifesto: ' + repetiam.length);
});

/* ---------------- 3. A letra fora das zonas grandes ---------------- */

test('a letra mínima é 4,5% em todo local, e a zona pequena se recompõe antes de encolher', () => {
  const p = ler('js', 'player.js');
  assert.match(p, /const LOCAIS = \{ balcao: 0\.045, recepcao: 0\.045, escritorio: 0\.045 \};/);
  // 6. o título desce até 1,25× o piso, e só depois a caixa encolhe.
  assert.match(p, /e\.style\.fontSize = Math\.max\(piso \* 1\.25, atual \* Math\.max\(0\.85, Math\.sqrt\(esc\)\)\)\.toFixed\(1\) \+ 'px';/);
  assert.ok(p.indexOf('piso * 1.25') < p.indexOf("miolo.style.transform = 'scale('"), 'antes da escala');
  assert.match(ler('css', 'player.css'), /\.mt-ann\.mt-compacto \.ann-body \{ line-height: 1\.32; \}/);
  // A bancada e a régua medem com o mesmo piso.
  assert.match(ler('js', 'bancada.js'), /const LOCAIS = \{ balcao: 0\.045, recepcao: 0\.045, escritorio: 0\.045 \};/);
  assert.match(ler('tools', 'regua-tv.mjs'), /const PISO_DA_FRENTE = \{ comercio: 4\.5, saude: 4\.5, empresa: 4\.5 \};/);
});

test('os cardápios cabem com a letra inteira na zona de verdade da TV (1896×1056, 1038×1878, 1056×1056)', () => {
  /*
   * A bancada desenha a tela cheia no tamanho de referência; a TV tem a
   * fresta do palco, e a letra do balcão ocupa 2% a 4% a mais da zona. Na
   * varredura do reteste 3 (306 peças × TV) cediam: o prato do dia deitado
   * (81%), as bebidas (94%) e as categorias (97%) em pé, a lista de ofertas e
   * o comunicado na quadrada (97%). Os ajustes que os fazem caber:
   */
  const dia = ler('pecas-ouro', 'cardapio-dia-foto.html');
  assert.match(dia, /\.bloco \{ position: absolute; left: 6cqw; top: 11\.5cqh; bottom: 5cqh; width: 36cqw;/);
  assert.match(dia, /\.quando \{ font: 600 max\(var\(--mt-piso, 0cqw\), 1\.15cqw\)\/1\.2 var\(--mt-fonte-texto\); letter-spacing: \.08em;/);
  assert.match(ler('pecas-ouro', 'cardapio-bebidas.html'), /\.topo span \{ font-size: max\(var\(--mt-piso, 0cqw\), 2\.2cqw\); letter-spacing: \.06em; line-height: 1\.05; text-wrap: balance; \}/);
  assert.match(ler('pecas-ouro', 'cardapio-categorias.html'), /\.nota \{ font-size: max\(var\(--mt-piso, 0cqw\), 2cqw\); letter-spacing: \.02em; \}/);
  assert.match(ler('pecas-ouro', 'oferta-lista.html'), /\.valor small \{ vertical-align: top; \}/);
  assert.match(ler('pecas-ouro', 'cardapio-colunas.html'), /padding: 1\.2cqw 0 1\.1cqw; \}/);
  assert.match(ler('pecas-ouro', 'gente-comunicado.html'), /\.assina \{ flex-wrap: wrap;/);
  for (const id of ['cardapio-dia-foto', 'cardapio-bebidas', 'cardapio-categorias', 'oferta-lista', 'cardapio-colunas', 'gente-comunicado']) {
    const h = P.higienizar(daPeca(id));
    assert.equal(h.ok, true, id + ': ' + h.problemas.join(' | '));
  }
});

/* ---------------- 4. A logo do cabeçalho ---------------- */

test('a logo do cabeçalho: sem a margem vazia e maior, no cabeçalho padrão e nas seis peças', () => {
  const r = ler('js', 'peca-render.js');
  assert.match(r, /function logoAparada\(url, pronta\) \{/);
  // Pela nossa origem (/media/ é servido de qualquer armazenamento): o canvas só lê pixel da mesma origem.
  assert.match(r, /const daOrigem = s\.charAt\(0\) === '\/' \? s : \(i >= 0 \? s\.slice\(i\) : ''\);/);
  // Margem pequena, ou logo de fundo cheio: fica a original.
  assert.match(r, /if \(\(w - \(x1 - x0 \+ 1\)\) \/ w < 0\.06 && \(h - \(y1 - y0 \+ 1\)\) \/ h < 0\.06\) return '';/);
  assert.match(r, /if \(campo === 'logo' && !qr && valor && !o\.rascunho\) \{/);
  assert.match(r, /logoAparada,/);
  assert.match(ler('css', 'player.css'), /\.mt-header-logo \{ height: 72cqh; width: auto; max-width: 30cqw; object-fit: contain; \}/);
  const altura = (id) => Number(/\.logo \{ height: (\d+)cqh;/.exec(ler('pecas-ouro', 'cabecalho-' + id + '.html'))[1]);
  for (const id of ['centro', 'status', 'classico', 'minimo', 'chamada', 'chamadas']) assert.ok(altura(id) >= 70, id + ': a logo com ' + altura(id) + '% da faixa');
  // Com a logo, a linha empilhada embaixo dela sai na faixa deitada: as duas na letra do balcão não cabiam (o piso cedia a 69% e 88%).
  assert.match(ler('pecas-ouro', 'cabecalho-centro.html'), /\.logo:not\(\[data-sem-foto\]\) ~ \.sub \{ display: none; \}/);
  assert.match(ler('pecas-ouro', 'cabecalho-status.html'), /\.logo:not\(\[data-sem-foto\]\) ~ \.desde \{ display: none; \}/);
  for (const id of ['centro', 'status', 'classico', 'minimo', 'chamada', 'chamadas']) {
    const h = P.higienizar(daPeca('cabecalho-' + id));
    assert.equal(h.ok, true, id + ': ' + h.problemas.join(' | '));
  }
});

test('a TV baixa o player de novo (cache do shell novo)', () => {
  assert.ok(Number(/const SHELL_CACHE = 'mt-shell-v(\d+)';/.exec(ler('sw.js'))[1]) >= 92);
});
