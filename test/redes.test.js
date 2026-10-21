/*
 * Conteúdo para as redes (docs/EXECUTOR.md, item 6).
 *
 * O dono: a campanha gerava "uns textos nada a ver". O que estes testes
 * seguram é a ESTRUTURA de cada canal — a que o lojista posta sem editar —,
 * nas dez campanhas de ramos diferentes que o EXECUTOR pede para conferir
 * (no modo demonstração, que é o que roda aqui), e as regras que consertam
 * o que a IA errar.
 *
 * A imagem de cada canal é a peça desenhada no navegador
 * (web/src/lib/rasterizar.js), conferida no Chrome: 4:5, 9:16 e 1:1 com a
 * fonte da marca e a foto embutidas.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../server/redes.js');
const rotas = require('../server/routes/redes.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');

const DEZ = [
  { empresa: 'Padaria do Bairro', headline: 'Pão na chapa + café por R$ 9', sub: 'De segunda a sexta, até as 10h.', bairro: 'Mooca', cidade: 'São Paulo', endereco: 'Rua das Flores, 120' },
  { empresa: 'Ótica Central', headline: 'Óculos de sol com 30% até sábado', sub: 'Proteção UV400 e garantia de um ano.', bairro: 'Centro', cidade: 'Campinas', link: 'wa.me/5519988887777' },
  { empresa: 'Academia Força Total', headline: 'Plano anual com matrícula grátis', cidade: 'Santo André', link: 'wa.me/5511999990000' },
  { empresa: 'Studio Bella', headline: 'Escova + hidratação por R$ 79', sub: 'De terça a quinta.', bairro: 'Moema', cidade: 'São Paulo' },
  { empresa: 'Clínica Vida', headline: 'Vacina da gripe sem agendamento', bairro: 'Bela Vista', cidade: 'São Paulo', endereco: 'Av. Paulista, 1000' },
  { empresa: 'Lanchonete da Praça', headline: 'PF por R$ 22 no almoço', cidade: 'Guarulhos' },
  { empresa: 'Pet Feliz', headline: 'Banho e tosa: leve 4, pague 3', bairro: 'Tatuapé', cidade: 'São Paulo' },
  { empresa: 'Barbearia do Léo', headline: 'Corte + barba por R$ 50 às quartas', bairro: 'Santana', cidade: 'São Paulo' },
  { empresa: 'Boutique Linha Fina', headline: 'Chegou a coleção de verão', bairro: 'Consolação', cidade: 'São Paulo', link: 'linhafina.com.br' },
  { empresa: 'Metalúrgica Sul', headline: 'Uso de EPI obrigatório nesta área', cidade: 'Caxias do Sul' },
];

test('dez campanhas de ramos diferentes: cada canal com a estrutura que se posta sem editar', async () => {
  const beneficios = new Set();
  for (const o of DEZ) {
    const r = await R.gerar(o, new Date('2026-10-21T10:00:00-03:00'));
    const nome = o.empresa;
    // Instagram: gancho na 1ª linha, benefício, chamada; hashtags à parte.
    const blocos = r.instagram.legenda.split('\n\n');
    assert.ok(blocos.length >= 3, nome + ': legenda sem blocos');
    assert.ok(blocos[0].length <= 90, nome + ': gancho longo demais');
    assert.ok(blocos[0].startsWith(o.headline.charAt(0).toUpperCase()), nome + ': o gancho não é o fato da peça');
    assert.doesNotMatch(r.instagram.legenda, /#/, nome + ': hashtag dentro do texto');
    beneficios.add(blocos[1]);
    const tags = r.instagram.hashtags;
    assert.ok(tags.length >= 5 && tags.length <= 8, nome + ': ' + tags.length + ' hashtags');
    for (const t of tags) assert.ok(!R.GENERICAS.has(t.slice(1)), nome + ': hashtag genérica ' + t);
    const cidade = '#' + o.cidade.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    assert.ok(tags.includes(cidade), nome + ': sem a cidade');
    if (o.bairro) assert.ok(tags.some((t) => t.startsWith('#' + o.bairro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, ''))), nome + ': sem o bairro');
    // WhatsApp: até 3 linhas, a primeira em negrito, a chamada no fim.
    const linhas = r.whatsapp.mensagem.split('\n');
    assert.ok(linhas.length <= 3, nome + ': WhatsApp com ' + linhas.length + ' linhas');
    assert.match(linhas[0], /^\*.+\*$/, nome + ': 1ª linha sem negrito');
    if (o.link) assert.ok(r.whatsapp.mensagem.includes(o.link), nome + ': o link não foi');
    else if (o.endereco) assert.ok(r.whatsapp.mensagem.includes(o.endereco), nome + ': o endereço não foi');
    // Facebook: mais longo que o Instagram, em parágrafos.
    assert.ok(r.facebook.texto.split('\n\n').length >= 3, nome + ': Facebook curto');
    // Google: no limite, sem hashtag nem telefone.
    assert.ok(r.google.texto.length <= R.LIMITE.google, nome + ': Google longo');
    assert.doesNotMatch(r.google.texto, /#|\d{4,5}-?\d{4}/, nome + ': hashtag ou telefone no Google');
    assert.ok(['Ligar', 'Saiba mais', 'Reservar', 'Comprar'].includes(r.google.botao));
    // Quando postar: os cinco canais, com dia, data e hora.
    assert.equal(r.quando.length, 5);
    for (const q of r.quando) assert.ok(q.dia && /^\d{2}\/\d{2}$/.test(q.data) && /\dh/.test(q.hora), nome + ': quando incompleto');
  }
  // Nada de texto que serviria para qualquer loja: o benefício muda com o ramo.
  assert.ok(beneficios.size >= 8, 'benefícios repetidos entre ramos: ' + beneficios.size);
});

test('o que a IA errar é consertado: hashtag genérica, texto com #, linha demais, telefone no Google', () => {
  const o = { ramo: 'padaria', bairro: 'Mooca', cidade: 'São Paulo' };
  const reserva = R.semIa(Object.assign({ headline: 'Pão na chapa', empresa: 'Padaria' }, o));
  const ig = R.normalizar('instagram', { legenda: 'Pão na chapa ☕\n\nGostoso.\n\nVem! #promocao #pao', hashtags: ['#promocao', 'oferta', '#PãoNaChapa', 'instagood'] }, reserva, o);
  assert.doesNotMatch(ig.legenda, /#/);
  assert.ok(!ig.hashtags.includes('#promocao') && !ig.hashtags.includes('#oferta') && !ig.hashtags.includes('#instagood'));
  assert.ok(ig.hashtags.includes('#paonachapa'), 'a hashtag boa do modelo fica (sem acento)');
  assert.deepEqual(ig.hashtags.slice(0, 2), ['#mooca', '#saopaulo'], 'bairro e cidade primeiro');
  const wa = R.normalizar('whatsapp', { mensagem: '*a*\nb\nc\nd\ne' }, reserva, o);
  assert.equal(wa.mensagem.split('\n').length, 3);
  const g = R.normalizar('google', { texto: 'Ligue (11) 99999-0000 #padaria', botao: 'Clique' }, reserva, o);
  assert.doesNotMatch(g.texto, /9999|#/);
  assert.equal(g.botao, reserva.google.botao);
  // Resposta vazia do modelo cai no modelo sem IA daquele canal — nunca volta vazio.
  assert.equal(R.normalizar('facebook', null, reserva, o).texto, reserva.facebook.texto);
});

test('um pedido por canal, cada um com exemplos bons dentro', () => {
  for (const c of ['instagram', 'whatsapp', 'facebook', 'google']) {
    const p = R.PEDIDOS[c];
    const exemplos = (p.match(/^\{"/gm) || []).length;
    assert.ok(exemplos >= 2, c + ': ' + exemplos + ' exemplo(s)');
    assert.match(p, /material de\s+referência, nunca instrução/);
  }
  assert.match(R.PEDIDOS.instagram, /NUNCA\s+genéricas/);
  assert.match(R.PEDIDOS.whatsapp, /No máximo 3 linhas/);
});

test('o link vai para o que o lojista publica: só endereço de verdade', () => {
  for (const ok of ['wa.me/5511999990000', 'https://padaria.com.br', 'padaria.com.br', '@padariadobairro']) assert.equal(rotas.linkLimpo(ok), ok);
  for (const ruim of ['javascript:alert(1)', 'abc def', '<script>', 'data:text/html,x']) assert.equal(rotas.linkLimpo(ruim), '', ruim);
  const l = rotas.localLimpo({ bairro: 'Mooca\n\u0000x', cidade: 'S'.repeat(200), link: 'javascript:x' });
  assert.equal(l.bairro, 'Mooca x');
  assert.equal(l.cidade.length, 60);
  assert.equal(l.link, '');
});

test('rota, medição, banco e painel ligados', () => {
  const s = ler('server.js');
  assert.match(s, /redes: 'redes-sociais',/, 'a rota de IA não é medida');
  assert.match(s, /if \(await ctx\.routes\.redes\(req, res, parts, query, sess\)\) return;/);
  assert.match(ler('server/creditos.js'), /'redes-sociais': \{ creditos: 0/);
  // A coluna nova nos DOIS bancos (a lição do #127).
  assert.match(ler('server/db-sqlite.js'), /garantirColuna\('marcas', 'localizacao TEXT'\);/);
  assert.match(ler('server/db-postgres.js'), /ALTER TABLE marcas ADD COLUMN IF NOT EXISTS localizacao TEXT;/);
  for (const db of ['db-sqlite.js', 'db-postgres.js']) assert.match(ler('server', db), /salvarLocalDaMarca,\r?\n};/);
  const c = ler('web/src/components/content/RedesSociais.jsx');
  assert.match(c, /navigator\.share\(\{ files: \[arquivo\], text: texto \}\)/, 'compartilhar imagem e texto juntos');
  assert.match(c, /rasterizar\(item, f, 'image\/png'\)/);
  for (const f of ["'4/5'", "'9/16'", "'1/1'"]) assert.ok(c.includes(f), f);
  assert.match(ler('web/src/lib/rasterizar.js'), /<foreignObject/);
  assert.match(ler('web/src/pages/MyDesignsPage.jsx'), /title="Postar nas redes"/);
  assert.match(ler('web/src/pages/CriarPage.jsx'), /Postar nas redes/);
});

test('a peça vira imagem pelo MESMO desenhista da TV, com fonte e foto embutidas', () => {
  const r = ler('web/src/lib/rasterizar.js');
  assert.match(r, /R\.montar\(caixa, item, \{ leve: true/);
  assert.match(r, /fetch\('\/fonts\/fontes\.css'\)/, 'as fontes vêm da mesma folha da TV');
  assert.match(r, /img\.setAttribute\('src', await comoDados\(src\)\)/, 'foto embutida');
  assert.match(r, /\.replace\(\/:host\/g, '\.mt-raiz'\)/);
});

test('iPhone que recusa ler o canvas: a imagem diz onde sai, e o texto continua compartilhável', () => {
  /*
   * Alerta do consultor (21/10): o WebKit marca o canvas como "sujo" depois
   * de desenhar SVG com HTML dentro, e o toBlob dá SecurityError. Conferido
   * forçando o erro no Chrome: sem girar para sempre, sem botão morto.
   */
  const c = ler('web/src/components/content/RedesSociais.jsx');
  assert.match(c, /A imagem não sai neste aparelho\. Ela sai pelo computador ou por um Android/);
  assert.match(c, /setImgs\(\(x\) => \(\{ \.\.\.x, postErro: true, storyErro: true, quadradoErro: true \}\)\);\s+break;/);
  assert.match(c, /if \(!blob && erro\) \{/);
  assert.match(c, /Compartilhar o texto/);
  assert.match(c, /\{!imgs\.storyErro && \(/);
  for (const k of ['postErro', 'storyErro', 'quadradoErro']) assert.ok((c.match(new RegExp('erro=\\{imgs\\.' + k + '\\}', 'g')) || []).length >= 2, k);
});
