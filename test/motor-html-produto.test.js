/*
 * O motor HTML dentro da campanha (PLANO §4.14, PR 13): o plano aprovado vira
 * peça em HTML com os textos que o cliente aprovou, e quando a IA falha a
 * peça-ouro preenchida entra no lugar — nunca tela vazia, nunca texto de
 * exemplo de outro negócio.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const P = require('../js/peca-html.js');
const compositor = require('../server/compositor.js');
const motores = require('../server/motores.js');
const director = require('../server/ai-director.js');

const RAIZ = path.join(__dirname, '..');
const IDENT = { brand: '#1b3a5c', brand2: '#e9c46a', estilo: 'elegante', direcao: 'suave' };
const TEXTOS = { kicker: 'Semana do Sol', titulo: 'Óculos de sol com 30% de desconto', apoio: 'Em todas as armações até sábado.', cta: 'Passe na loja' };

test('o pedido leva os textos aprovados, para a IA não reescrever', () => {
  const t = compositor.pedidoTexto({ pedido: 'óculos 30%', empresa: 'Ótica Central', textos: TEXTOS });
  assert.match(t, /Textos aprovados pelo cliente — use exatamente estes/);
  assert.match(t, /título "Óculos de sol com 30% de desconto"/);
  assert.match(t, /chamada "Passe na loja"/);
  assert.doesNotMatch(compositor.pedidoTexto({ pedido: 'x' }), /aprovados/, 'sem textos, sem a ordem');
});

test('título em duas linhas parecidas, quebrado entre palavras', () => {
  assert.deepEqual(compositor.partirTitulo('Óculos de sol com 30% de desconto'), ['Óculos de sol com', '30% de desconto']);
  assert.deepEqual(compositor.partirTitulo('Promoção'), ['Promoção', '']);
  assert.deepEqual(compositor.partirTitulo(''), ['', '']);
});

for (const foto of [null, '/media/conta1/foto.jpg']) {
  test('peça-ouro preenchida ' + (foto ? 'com' : 'sem') + ' foto: passa na porta e não sobra texto de exemplo', () => {
    const item = compositor.preencherOuro({ textos: TEXTOS, foto, empresa: 'Padaria do Bairro', marca: { cores: ['#1b3a5c'] }, modo: 'claro', pedido: 'p' });
    const v = P.validarItem(item);
    assert.deepEqual(v.problemas, []);
    // Todo campo de texto da peça recebe valor: nenhum exemplo ("Ótica Central") vaza.
    for (const c of v.campos.filter((x) => x.tipo === 'texto')) assert.ok(c.nome in item.campos, 'campo sem texto: ' + c.nome);
    assert.equal(item.campos.marca, 'Padaria do Bairro');
    assert.equal(item.origem.motor, 'ouro');
    assert.equal(item.origem.base, foto ? 'institucional-foto' : 'institucional-lancamento');
    if (foto) assert.equal(item.campos.foto, foto);
    assert.ok(Object.values(item.campos).includes('30% de desconto'));
  });
}

test('peça de reserva com título longo: o título encolhe e o carimbo nunca passa da metade dele', () => {
  /*
   * Visto na tela: "Só esta semana" passou por baixo do carimbo, e
   * "Superpromoção" em pé deixava o carimbo maior que o título. Conferido no
   * navegador em 240 casos (5 fontes, 8 títulos, 2 peças, 3 formatos); aqui
   * fica a regra.
   */
  const fonte = (css, bloco) => Number((css.match(new RegExp(bloco + '\\{font-size:([\\d.]+)cqw')) || [])[1]);
  for (const titulo of ['Superpromoção relâmpago', 'Óculos de sol com 30% de desconto até sábado', 'Pão']) {
    const inteiro = compositor.preencherOuro({ textos: { titulo, kicker: 'Semana do Sol' }, empresa: 'X' }).css;
    assert.match(inteiro, /\.mt-peca h1 span, ?\.mt-peca h1 em\{white-space:normal/);
    // Só o acréscimo da reserva: o CSS original da peça vem antes e fica como está.
    const css = inteiro.slice(inteiro.indexOf('.mt-peca h1 span'));
    const blocos = { deitada: css.split('@container')[0], empe: css.split('@container (aspect-ratio < 0.8)')[1].split('@container')[0], quadrada: css.split('@container (aspect-ratio >= 0.8) and (aspect-ratio < 1.25)')[1].split('@container')[0] };
    for (const [f, b] of Object.entries(blocos)) {
      const h1 = fonte(b, '\\.mt-peca h1'), carimbo = fonte(b, '\\.mt-peca \\.carimbo');
      assert.ok(h1 > 0 && carimbo > 0, f + ': ' + titulo);
      assert.ok(carimbo <= h1 * 0.5 + 0.01, f + ': carimbo ' + carimbo + ' > metade do título ' + h1);
    }
  }
  const curto = compositor.preencherOuro({ textos: { titulo: 'Pão' }, empresa: 'X' }).css;
  assert.match(curto, /\.mt-peca h1\{font-size:13\.00cqw\}/, 'título curto fica no tamanho da peça');
});

test('o painel desenha a peça com o mesmo arquivo da TV, em tamanho real', () => {
  const ler = (f) => fs.readFileSync(path.join(RAIZ, 'web', 'src', f), 'utf8');
  assert.match(ler('lib/pecaHtml.js'), /'\/js\/peca-render\.js'/, 'o painel precisa do desenhista da TV, não de uma cópia');
  assert.match(ler('components/content/DesignThumb.jsx'), /it\.type === 'peca-html'\) return <PecaHtml/);
  const peca = ler('components/content/PecaHtml.jsx');
  assert.match(peca, /containerType: 'size'/);
  assert.match(peca, /'scale\(' \+ escala/, 'desenhada pequena, a peça cairia no layout da lateral');
});

test('refazer: a peça volta para a IA com a medida, e os textos editados e a foto ficam', async () => {
  const chamar = motores.chamar;
  const nova = '<style>.mt-peca{background:var(--mt-fundo)}h1{font-size:6cqw;color:var(--mt-texto)}.f{width:40%}</style>'
    + '<section class="mt-peca"><img class="f" data-campo-img="foto" alt=""><h1 data-campo="titulo">Exemplo</h1><p data-campo="apoio">x</p></section>';
  let pedido = '';
  motores.chamar = async (o) => { pedido = o.usuario; return { texto: nova, uso: { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelo: 'x' } }; };
  try {
    const velha = compositor.preencherOuro({ textos: { titulo: 'Só esta semana', apoio: 'Até sábado' }, foto: '/media/c1/f.jpg', empresa: 'Ótica', marca: { cores: ['#123456'] }, modo: 'claro', pedido: 'óculos 30%' });
    velha.campos.titulo = 'Título que o cliente editou';
    const r = await compositor.refazerPeca({ item: velha, problemas: ['TV em pé: "Título" passa da borda'], motor: 'gemini' });
    assert.equal(r.ok, true);
    assert.match(pedido, /foi desenhada e MEDIDA na tela/);
    assert.match(pedido, /TV em pé: "Título" passa da borda/);
    assert.match(pedido, /titulo "Título que o cliente editou"/, 'a IA recebe o texto atual, não o do exemplo');
    assert.match(pedido, /A peça atual era:\n<style>/);
    assert.deepEqual(r.item.campos, { titulo: 'Título que o cliente editou', foto: '/media/c1/f.jpg' }, 'só os campos que a peça nova tem');
    assert.equal(r.item.modo, 'claro');
    assert.deepEqual(P.validarItem(r.item).problemas, []);
    await assert.rejects(compositor.refazerPeca({ item: { type: 'peca-html', html: '<script>x</script>', css: '' }, problemas: [] }), (e) => e.status === 400);
  } finally { motores.chamar = chamar; }
});

test('o refazer passa pela rota medida e o painel tenta sozinho uma vez só', () => {
  const server = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.match(server, /'refazer-peca': 'gerar-composicao'/, 'rota de IA fora do mapa não é medida nem tem teto');
  assert.match(server, /compositor\.refazerPeca\(\{ item: b\.item, problemas: b\.problemas/);
  const aviso = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'components', 'content', 'EditarPeca.jsx'), 'utf8');
  assert.match(aviso, /else if \(auto && onTrocar && !tentou\.current\) refazer\(avisos, vivo\)/);
  const tela = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'pages', 'MyDesignsPage.jsx'), 'utf8');
  assert.match(tela, /auto=\{gen\.pecas\.findIndex\(\(x\) => x\.item && x\.item\.html === p\.item\.html\) === i\}/, 'cópia em outro formato pediria o conserto de novo');
});

test('tela completa: cada zona do layout ganha o seu papel', () => {
  const T = require('../js/templates.js');
  const corp = T.getLayout('corporate').zones.map((z) => ({ id: z.id, type: z.type }));
  assert.deepEqual(compositor.papeisDaTela(corp).map((p) => p.zid + ':' + p.papel),
    ['cabecalho:cabecalho', 'principal:destaque', 'principal:destaque', 'lateral:lateral', 'rodape:rodape']);
  const quad = T.getLayout('quad').zones.map((z) => ({ id: z.id, type: z.type }));
  assert.deepEqual(compositor.papeisDaTela(quad).map((p) => p.papel), ['destaque', 'destaque', 'lateral', 'lateral', 'lateral']);
});

test('tela completa: peças por zona, sem repetir texto, e uma zona que falha não derruba a tela', async () => {
  const chamar = motores.chamar;
  const pedidos = [];
  let n = 0;
  motores.chamar = async (o) => {
    pedidos.push(o.usuario);
    if (o.json) return { texto: '["Aberto até 19h", "Pague com Pix"]', uso: { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelo: 'x' } };
    n++;
    // A lateral volta com <script>: a porta recusa as três tentativas.
    const lateral = /LATERAL/.test(o.usuario);
    const texto = lateral ? '<section class="mt-peca"><script>x</script></section>'
      : '<style>.mt-peca{background:var(--mt-fundo)}h1{font-size:6cqw;color:var(--mt-texto)}</style><section class="mt-peca"><h1 data-campo="titulo">Texto ' + n + '</h1></section>';
    return { texto, uso: { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelo: 'x' } };
  };
  try {
    const T = require('../js/templates.js');
    const zones = T.getLayout('corporate').zones.map((z) => ({ id: z.id, type: z.type }));
    const r = await compositor.comporTelaInteira({ answers: { objetivo: 'óculos 30%', oferta: '30% OFF' }, empresa: 'Ótica', zones, motor: 'gemini' });
    assert.equal(r.zonas.cabecalho.peca.type, 'peca-html');
    assert.equal(r.zonas.principal.items.length, 2, 'duas peças se revezam no destaque');
    assert.equal(r.zonas.rodape.peca.type, 'peca-html');
    assert.deepEqual(r.zonas.rodape.messages, ['Aberto até 19h', 'Pague com Pix']);
    assert.ok(!r.zonas.lateral, 'a zona que falhou fica como estava');
    assert.deepEqual(r.falhas, ['lateral']);
    // A segunda peça do destaque sabe o que a primeira disse.
    const segundo = pedidos.filter((p) => /DESTAQUE/.test(p))[1];
    assert.match(segundo, /já dizem: .*"Texto 2"/);
  } finally { motores.chamar = chamar; }
});

test('tela completa: o servidor usa o motor HTML e o painel aceita a peça no cabeçalho e no rodapé', () => {
  const server = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.match(server, /compositor\.comporTelaInteira\(\{/);
  assert.match(server, /process\.env\.MT_MOTOR_CAMPANHA !== 'coordenadas' && ai\.mode\(\) !== 'dev' && zones\.length/);
  const tela = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'pages', 'ContentEditorPage.jsx'), 'utf8');
  assert.match(tela, /if \(zdata\.peca\) next\.zonas\[zid\] = \{ \.\.\.\(next\.zonas\[zid\] \|\| \{\}\), peca: zdata\.peca \}/);
  // Desde o item 30 a faixa é uma lista (FaixaDaTela): tirar a última peça apaga `pecas` e `peca`.
  const lib = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'lib', 'tela.js'), 'utf8');
  assert.match(lib, /else { delete z.pecas; delete z.peca; }/, 'sem isto, a zona fica presa na peça');
  assert.match(tela, /<FaixaDaTela key=\{activeZone\.id\} tipo=\{activeZone\.type\} zona=\{cfg\.zonas\[activeZone\.id\]\}/);
});

test('campanha pronta: o resultado aparece, não o cardápio de ideias', () => {
  // Antes o rodapé dizia "Só salvar" e o corpo mostrava as ideias: salvava-se sem ver as peças.
  const tela = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'pages', 'MyDesignsPage.jsx'), 'utf8');
  assert.match(tela, /\) : guiando && !gen \? \(/);
});

test('compor com a IA: peça sem lugar para a foto já paga é recusada, não perde a foto', async () => {
  /*
   * Antes a peça passava e a foto era jogada fora (`camposQueExistem`): o
   * cliente pagava a foto e via só texto. EXECUTOR item 19: "nem imagens ele
   * colocou". Agora é recusa da porta, e o modelo tenta de novo.
   */
  const chamar = motores.chamar;
  const semFoto = '<style>.mt-peca{background:var(--mt-fundo)}h1{font-size:8cqw;color:var(--mt-texto)}</style><section class="mt-peca"><h1 data-campo="titulo">Óculos</h1></section>';
  const comFoto = '<style>.mt-peca{background:var(--mt-fundo)}img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}h1{font-size:8cqw;color:var(--mt-texto)}</style><section class="mt-peca"><img data-campo-img="foto" alt=""><h1 data-campo="titulo">Óculos</h1></section>';
  const pedidos = [];
  const uso = { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelo: 'x' };
  try {
    // Sempre sem foto: recusa nas três, e quem chama cai na peça-ouro com foto.
    motores.chamar = async (o) => { pedidos.push(o.usuario); return { texto: semFoto, uso }; };
    const r = await compositor.comporPeca({ pedido: 'óculos', foto: '/media/conta1/f.jpg', textos: TEXTOS, motor: 'gemini' });
    assert.equal(r.ok, false);
    assert.equal(pedidos.length, 3);
    assert.match(r.problemas.join(' '), /data-campo-img="foto"/);
    assert.match(pedidos[1], /não tem onde pô-la/, 'a segunda tentativa diz o que faltou');
    assert.match(pedidos[0], /Textos aprovados/);

    // Na segunda tentativa o modelo põe a foto: a peça passa, com a foto.
    let n = 0;
    motores.chamar = async () => ({ texto: ++n === 1 ? semFoto : comFoto, uso });
    const r2 = await compositor.comporPeca({ pedido: 'óculos', foto: '/media/conta1/f.jpg', textos: TEXTOS, motor: 'gemini' });
    assert.equal(r2.ok, true);
    assert.equal(r2.item.campos.foto, '/media/conta1/f.jpg');
    assert.deepEqual(P.validarItem(r2.item).problemas, []);

    // Sem foto no pedido, peça sem foto continua passando.
    motores.chamar = async () => ({ texto: semFoto, uso });
    const r3 = await compositor.comporPeca({ pedido: 'óculos', textos: TEXTOS, motor: 'gemini' });
    assert.equal(r3.ok, true);
    assert.deepEqual(r3.item.campos, {});
  } finally { motores.chamar = chamar; }
});

test('campanha com o motor HTML: plano aprovado vira peça em HTML que a TV aceita', async () => {
  // Sem chave (modo dev), a IA não roda: entra a peça-ouro preenchida — o mesmo caminho de quando ela falha.
  const r = await director.dirigir('óculos de sol 30%', {
    empresa: 'Ótica Central', motorHtml: true,
    planoAprovado: { identidade: IDENT, pecas: [
      { formato: '16/9', headline: 'Óculos de sol com 30% de desconto', kicker: 'Semana do Sol', sub: 'Até sábado.', cta: 'Passe na loja' },
      { formato: '9/16', headline: 'Óculos de sol com 30% de desconto', kicker: 'Semana do Sol', sub: 'Até sábado.', cta: 'Passe na loja' },
      { formato: '16/9', headline: 'Garantia de 2 anos', sub: 'Em toda armação.', cta: '' },
    ] },
  }, {});
  // O diretor completa duas peças por formato (garantirDuasPorFormato): pode vir uma cópia a mais.
  assert.ok(r.pecas.length >= 3);
  for (const p of r.pecas) {
    assert.equal(p.item.type, 'peca-html');
    assert.equal(p.motor, 'ouro');
    assert.equal(p.item.modo, 'claro', 'a direção "suave" vira o modo claro');
    assert.deepEqual(p.item.marca.cores, ['#1b3a5c', '#e9c46a']);
    assert.deepEqual(P.validarItem(p.item).problemas, [], p.label);
  }
  const sol = r.pecas.filter((p) => p.label.startsWith('Óculos'));
  assert.deepEqual(sol.map((p) => p.item.formato).sort(), ['16/9', '9/16']);
  assert.deepEqual(sol[0].item.campos, sol[1].item.campos, 'a mesma mensagem nos dois formatos é a mesma peça');
  const garantia = r.pecas.find((p) => p.label.startsWith('Garantia'));
  assert.equal(garantia.item.campos.titulo, 'Garantia', 'cada mensagem tem os próprios textos');
  assert.equal(garantia.item.campos.titulo2, 'de 2 anos');
});

test('sem a chave do servidor, a campanha segue no motor de coordenadas', async () => {
  const r = await director.dirigir('x', { empresa: 'X', planoAprovado: { identidade: IDENT, pecas: [{ formato: '16/9', headline: 'Só esta' }] } }, {});
  assert.equal(r.pecas[0].item.type, 'composicao');
});

test('o servidor liga o motor HTML na campanha, e dá para voltar sem deploy', () => {
  const server = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.match(server, /motorHtml: process\.env\.MT_MOTOR_CAMPANHA !== 'coordenadas'/);
});

test('plano com o motor HTML: cada peça vem com o rascunho, foto como silhueta, sem gastar', async () => {
  const r = await director.dirigir('óculos de sol 30%', {
    empresa: 'Ótica Central', motorHtml: true,
    planoAprovado: { identidade: IDENT, pecas: [
      { formato: '16/9', headline: 'Óculos de sol com 30% de desconto', kicker: 'Semana do Sol', sub: 'Até sábado.', cta: 'Passe na loja' },
      { formato: '9/16', headline: 'Garantia de 2 anos', precisaImagem: true, promptImagem: 'armação na vitrine' },
    ] },
  }, { pararNoPlano: true });
  assert.equal(r.etapa, 'plano');
  assert.equal(r.rascunhos.length, r.plano.pecas.length);
  for (const [i, it] of r.rascunhos.entries()) {
    assert.deepEqual(P.validarItem(it).problemas, [], 'rascunho ' + i);
    assert.equal(it.formato, r.plano.pecas[i].formato);
  }
  const comFoto = r.rascunhos[r.plano.pecas.findIndex((p) => p.promptImagem)];
  assert.equal(comFoto.origem.base, 'institucional-foto', 'peça que vai ter foto: o rascunho já reserva o lugar dela');
  assert.equal(r.rascunhos[0].origem.base, 'institucional-lancamento');
  const pagina = fs.readFileSync(path.join(RAIZ, 'web/src/pages/MyDesignsPage.jsx'), 'utf8');
  assert.match(pagina, /<PecaHtml item=\{rascunhos\[i\]\}[^>]*rascunho \/>/);
});

test('sem o motor HTML, o plano não traz rascunho', async () => {
  const r = await director.dirigir('x', { empresa: 'X', planoAprovado: { identidade: IDENT, pecas: [{ formato: '16/9', headline: 'Só esta' }] } }, { pararNoPlano: true });
  assert.equal(r.rascunhos, undefined);
});

test('editar a peça troca estilo e marca sem chamar a IA', () => {
  const ed = fs.readFileSync(path.join(RAIZ, 'web/src/components/content/EditarPeca.jsx'), 'utf8');
  // D19: o desenho (html/css) também pode trocar, e os elementos escondidos vão junto.
  // (#240: o campo escondido vai vazio e o texto dele em `guardados`.)
  assert.match(ed, /\{ \.\.\.resto, \.\.\.doDesenho, campos: gravados, modo, marca, \.\.\.\(ocultos\.length \? \{ ocultos \} : \{\}\)/);
  assert.match(ed, /brand\.marcas\(\)/);
  for (const m of ['escuro', 'claro', 'marca']) assert.match(ed, new RegExp("id: '" + m + "'"));
});

test('miniatura da peça sem filete escuro na borda: contorno por ring, não por border', () => {
  // A borda de 1px saía do clientWidth/clientHeight e a escala pela altura
  // deixava 1,5px do fundo escuro aparecendo à direita de toda miniatura.
  const c = fs.readFileSync(path.join(RAIZ, 'web/src/components/content/PecaHtml.jsx'), 'utf8');
  assert.match(c, /ring-1 ring-line bg-\[#0a1020\]/);
  assert.doesNotMatch(c, /rounded-md border border-line bg-\[#0a1020\]/);
});

test('plano no celular: o rascunho desce para baixo do texto, na largura toda', () => {
  const pagina = fs.readFileSync(path.join(RAIZ, 'web/src/pages/MyDesignsPage.jsx'), 'utf8');
  assert.match(pagina, /grid grid-cols-\[auto_1fr\][^']*sm:flex/);
  assert.match(pagina, /col-start-2 row-start-2 shrink-0/);
});
