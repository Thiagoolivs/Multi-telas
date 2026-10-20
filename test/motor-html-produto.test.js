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

test('campanha pronta: o resultado aparece, não o cardápio de ideias', () => {
  // Antes o rodapé dizia "Só salvar" e o corpo mostrava as ideias: salvava-se sem ver as peças.
  const tela = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'pages', 'MyDesignsPage.jsx'), 'utf8');
  assert.match(tela, /\) : guiando && !gen \? \(/);
});

test('compor com a IA: a foto só entra se a peça tem onde pô-la', async () => {
  const chamar = motores.chamar;
  const semFoto = '<style>.mt-peca{background:var(--mt-fundo)}h1{font-size:8cqw;color:var(--mt-texto)}</style><section class="mt-peca"><h1 data-campo="titulo">Óculos</h1></section>';
  let pedido = '';
  motores.chamar = async (o) => { pedido = o.usuario; return { texto: semFoto, uso: { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelo: 'x' } }; };
  try {
    const r = await compositor.comporPeca({ pedido: 'óculos', foto: '/media/conta1/f.jpg', textos: TEXTOS, motor: 'gemini' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.item.campos, {}, 'campo "foto" que a peça não tem faria a TV recusar');
    assert.deepEqual(P.validarItem(r.item).problemas, []);
    assert.match(pedido, /Textos aprovados/);
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
