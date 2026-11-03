/*
 * As criações depois do QA de lançamento (03/11, docs/qa/01-06-criacoes-
 * simuladas-e-custos.md). Cada teste é um achado do relatório:
 *
 *   - as redes recebem a regra da frente e saem sem a promessa de cura;
 *   - a porta da peça recusa texto proibido e letra pequena, e pede de novo;
 *   - a campanha com bloqueio não fica "pronta"; preço e data inventados
 *     viram aviso;
 *   - "troca a foto" mantém kicker, apoio, chamada e preço;
 *   - "deixa o preço maior" chega a quem desenha, ou a resposta diz que não deu;
 *   - "Pode gerar a foto" não abre o esboço;
 *   - a estimativa de custo segue o tamanho real do prompt.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/peca-html.js');
const E = require('../js/escopo.js');
const ai = require('../server/ai.js');
const motores = require('../server/motores.js');
const compositor = require('../server/compositor.js');
const eco = require('../server/ecossistema.js');
const redes = require('../server/redes.js');
const A = require('../server/ajuste.js');
const edicao = require('../server/edicao.js');
const ajustePeca = require('../server/ajuste-peca.js');
const conversa = require('../server/ai-conversa.js');
const conferencia = require('../server/conferencia.js');
const creditos = require('../server/creditos.js');

const RAIZ = path.join(__dirname, '..');
const ouro = (id) => fs.readFileSync(path.join(RAIZ, 'pecas-ouro', id + '.html'), 'utf8');

function provedor(t, p) {
  const antes = { p: process.env.AI_PROVIDER, llm: ai.callLLM, chamar: motores.chamar };
  process.env.AI_PROVIDER = p;
  t.after(() => {
    if (antes.p === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = antes.p;
    ai.callLLM = antes.llm; motores.chamar = antes.chamar;
  });
}

// A peça da IA como ela é guardada: os textos no HTML, os campos só com a foto.
function pecaDaIA(id, campos) {
  const a = P.doArquivo(ouro(id));
  const v = P.validarItem({ type: 'peca-html', versao: 1, papel: 'destaque', html: a.html, css: a.css, campos: campos || {}, modo: 'escuro' });
  assert.deepEqual(v.problemas, []);
  return v.item;
}
function campanhaCom(pecas, extra) {
  const resultado = {
    nome: 'Teste', telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: pecas, lateral: [], cabecalho: { pecas: [], mensagens: [] }, rodape: { pecas: [], mensagens: [] } } }],
    social: null, ...(extra || {}),
  };
  const escopo = E.normalizar({ nome: 'Teste', objetivo: 'vitrine da semana', imagens: 'gerar', telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: pecas.length } } }] });
  return { resultado, escopo };
}
const vaga = (i, item, label) => ({ vaga: 't0-principal-' + i, zona: 'principal', papel: 'destaque', formato: '16/9', label, item, motor: 'html', comFoto: !!item.campos.foto });

/* ---------------- Item 1: as redes e a Saúde ---------------- */

test('redes: a regra da frente vai em cada canal, e o objetivo com promessa não vira "Pedido do lojista"', async (t) => {
  provedor(t, 'anthropic');
  const pedidos = [];
  ai.callLLM = async (sistema, usuario) => {
    pedidos.push({ sistema, usuario });
    return JSON.stringify({ legenda: 'Alívio para os sintomas da gripe 💊\n\nFale com o farmacêutico.', hashtags: ['farmacia'], mensagem: '*Alívio para a gripe*', texto: 'Alívio para os sintomas da gripe.', botao: 'Ligar' });
  };
  const out = await redes.gerar({ headline: 'Alívio para a gripe', pedido: 'remédio X que cura gripe em 1 dia', empresa: 'Farmácia Bem', perfil: 'saude' });
  assert.equal(pedidos.length, 4);
  for (const p of pedidos) {
    assert.match(p.sistema, /REGRA DESTE TIPO DE NEGÓCIO[\s\S]*PROIBIDO[\s\S]*"cura"/);
    assert.doesNotMatch(p.usuario, /cura gripe/, 'o objetivo com a promessa não vai à IA');
  }
  assert.ok(out.conteudo.bloqueios.some((b) => b.trecho === 'cura'), 'a pessoa fica sabendo do que foi tirado');
});

test('redes: o modelo que insiste na promessa é pedido de novo com o motivo e, se insistir, sai a versão sem IA', async (t) => {
  provedor(t, 'anthropic');
  const pedidos = [];
  ai.callLLM = async (sistema, usuario) => {
    pedidos.push(usuario);
    return JSON.stringify({ legenda: 'Remédio X: cura a gripe em 1 dia 💊', hashtags: ['curagripe'], mensagem: '*Cura a gripe*', texto: 'Cura a gripe em 1 dia.', botao: 'Ligar' });
  };
  const out = await redes.gerar({ headline: 'Remédio X', pedido: 'divulgar o remédio X', empresa: 'Farmácia Bem', perfil: 'saude' });
  assert.equal(pedidos.length, 8, 'quatro canais, cada um pedido de novo uma vez');
  assert.ok(pedidos.slice(4).every((u) => /RECUSADA pela regra de conteúdo/.test(u)));
  for (const c of ['instagram', 'whatsapp', 'facebook', 'google']) {
    assert.deepEqual(require('../js/regras-de-conteudo.js').conferir(redes.textoDoCanal(c, out[c]), { perfil: 'saude' }).bloqueios, [], c + ' saiu com a promessa');
  }
  assert.deepEqual(out.conteudo.trocados.sort(), ['facebook', 'google', 'instagram', 'whatsapp']);
});

/* ---------------- Itens 1 e 6: a porta da peça ---------------- */

test('a porta da peça recusa "Cura a gripe" em conta Saúde e pede de novo com o motivo', async (t) => {
  const chamadas = [];
  const RUIM = ouro('servico-alerta').replace('Com sintomas de gripe?', 'Cura a gripe em 1 dia');
  const BOA = ouro('servico-alerta');
  const antes = motores.chamar;
  t.after(() => { motores.chamar = antes; });
  motores.chamar = async (o) => { chamadas.push(o.usuario); return { texto: chamadas.length === 1 ? RUIM : BOA, uso: { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0 } }; };
  const r = await compositor.comporPeca({ motor: 'dev', papel: 'destaque', pedido: 'gripe', perfil: 'saude' });
  assert.equal(r.ok, true);
  assert.equal(r.tentativas, 2);
  assert.match(chamadas[1], /texto proibido: "Cura" promete cura/);
});

test('a porta da peça recusa a letra abaixo do mínimo (lida no CSS, sem navegador)', async (t) => {
  const chamadas = [];
  const PEQUENA = ouro('servico-alerta').replace('</style>', '.mt-peca p { font-size: .62cqw; }\n</style>');
  const antes = motores.chamar;
  motores.chamar = async (o) => { chamadas.push(o.usuario); return { texto: chamadas.length === 1 ? PEQUENA : ouro('servico-alerta'), uso: { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0 } }; };
  t.after(() => { motores.chamar = antes; });
  const r = await compositor.comporPeca({ motor: 'dev', papel: 'destaque', pedido: 'aviso' });
  assert.equal(r.tentativas, 2);
  assert.match(chamadas[1], /letra pequena demais: "p" fica com 8\.7px na TV deitada/);
});

test('a biblioteca-ouro vai sem os comentários: o mesmo código, menos tokens', () => {
  const fixo = compositor.fixo('destaque');
  assert.doesNotMatch(fixo, /<!--/);
  const bruto = 155000;
  assert.ok(fixo.length < bruto * 0.9, 'o destaque ainda leva ' + fixo.length + ' caracteres');
  assert.match(fixo, /font: 400 6\.6cqw\/1 var\(--mt-fonte-titulo\)/, 'o CSS das peças continua inteiro');
});

/* ---------------- Itens 1 e 5: a conferência da campanha ---------------- */

test('campanha Saúde com "cura" fica "revisar", com o motivo e a sugestão; as redes saem limpas', async (t) => {
  provedor(t, 'dev');
  const escopo = {
    nome: 'Remédio X', objetivo: 'remédio X que cura gripe em 1 dia', imagens: 'nenhuma',
    telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 1 } } }], redes: { instagramPost: true },
  };
  const r = await eco.gerar(escopo, { perfil: 'saude', empresa: 'Farmácia Bem', falas: ['remédio X cura gripe em 1 dia'] }, { agora: new Date(2026, 10, 3) });
  assert.ok(r.conferencia.bloqueios.length, JSON.stringify(r.conferencia));
  const b = r.conferencia.bloqueios.find((x) => x.onde === 'peça 1');
  assert.ok(b && b.sugestao, 'diz onde e o que pôr no lugar');
  assert.equal(conferencia.estadoDepois('pronta', r.conferencia), 'revisar');
  assert.match(conferencia.porQueNaoRoda(r.conferencia), /^Antes de pôr no ar, troque o texto da peça 1: "cura" promete cura/i);
  assert.ok(!r.conferencia.bloqueios.some((x) => x.onde === 'textos das redes'), 'a legenda já sai sem a promessa');
  assert.doesNotMatch(r.social.textos.instagram.legenda, /\bcura\b/i);
});

test('conferência: preço e data que não estavam no pedido viram aviso; o que foi dito, não', () => {
  const item = pecaDaIA('oferta-foto', { foto: '/media/t/a.jpg' });
  const { resultado, escopo } = campanhaCom([vaga(0, item, 'Óculos de sol')]);
  const permitidos = conferencia.permitidosDe(escopo, { falas: ['vitrine da semana, três armações com preço'] });
  const c = conferencia.conferirCampanha(resultado, { permitidos, perfil: 'comercio', hoje: new Date(2026, 10, 3) });
  assert.deepEqual(c.bloqueios, []);
  assert.ok(c.avisos.some((a) => a.onde === 'peça 1' && /o preço R\$ 189,90 não estava no seu pedido/.test(a.motivo)), JSON.stringify(c.avisos));
  assert.ok(c.avisos.some((a) => /parcelamento 10×/.test(a.motivo)));
  assert.equal(conferencia.estadoDepois('pronta', c), 'pronta', 'aviso não bloqueia');
  // Depois que a pessoa diz o preço (numa edição), ele passa a valer.
  const depois = conferencia.reconferir({ ...resultado, conferencia: c }, { perfil: 'comercio', hoje: new Date(2026, 10, 3) }, ['o aviador é R$ 189,90']);
  assert.ok(!depois.avisos.some((a) => a.tipo === 'preco' && /189,90/.test(a.trecho)));
});

/* ---------------- Item 3: "troca a foto" mantém os textos ---------------- */

test('"troca a foto" numa peça da IA troca só a foto: kicker, apoio, chamada e preço ficam', async (t) => {
  provedor(t, 'dev');
  const item = pecaDaIA('oferta-foto', { foto: '/media/t/a.jpg' });
  const c = campanhaCom([vaga(0, item, 'Óculos de sol')]);
  const antes = A.textosDe({ item });
  assert.equal(antes.preco, '189');
  const r = await A.aplicar(c, [{ tipo: 'refazer', peca: 1, foto: 'trocar', texto: '' }], {}, { onImagem: async () => '/media/t/b.jpg' });
  const nova = r.resultado.telas[0].zonas.principal[0];
  assert.equal(nova.item.campos.foto, '/media/t/b.jpg');
  assert.equal(nova.item.html, item.html, 'o desenho aprovado continua o mesmo');
  assert.deepEqual(A.textosDe(nova), antes);
  assert.equal(r.fotosGeradas, 1);
});

test('"troca a foto" numa peça que precisa ser refeita leva os textos de antes (o preço inclusive)', async (t) => {
  provedor(t, 'dev');
  // A peça sem lugar de foto: a troca refaz a peça, e a reserva recebe os textos lidos do HTML.
  const item = pecaDaIA('oferta-selo');
  const c = campanhaCom([vaga(0, item, 'Coloração')]);
  c.escopo.imagens = 'gerar';
  const r = await A.aplicar(c, [{ tipo: 'refazer', peca: 1, foto: 'tirar', texto: '' }], {});
  const t2 = A.textosDe(r.resultado.telas[0].zonas.principal[0]);
  const tudo = Object.values(t2).join(' ');
  for (const pedaco of ['Toda terça-feira', 'Coloração', 'com desconto', 'Agende o seu horário']) assert.ok(tudo.includes(pedaco), pedaco + ' sumiu: ' + tudo);
  assert.deepEqual(A.textosDaVaga({ titulo: 'Pão de queijo', titulo2: 'em dobro', preco: '0', centavos: ',90', kicker: 'Só à tarde' }, 'x'),
    { kicker: 'Só à tarde', titulo: 'Pão de queijo em dobro', apoio: 'R$ 0,90', cta: '' });
});

test('a IA da edição vê os textos que moram no HTML da peça', () => {
  const item = pecaDaIA('oferta-foto', { foto: '/media/t/a.jpg' });
  const { resultado } = campanhaCom([vaga(0, item, 'Óculos de sol')]);
  const lista = edicao.pecasParaIA(resultado);
  assert.match(lista, /preco: "189"/);
  assert.match(lista, /centavos: ",90"/);
  assert.ok(A.camposDeTexto({ item }).includes('preco'));
});

/* ---------------- Item 4: "deixa o preço maior" ---------------- */

test('"deixa o preço maior" no Editar com a IA vira pedido de DESENHO, e a confirmação diz isso', () => {
  const item = pecaDaIA('oferta-foto', { foto: '/media/t/a.jpg' });
  const { resultado } = campanhaCom([vaga(0, item, 'Óculos de sol'), vaga(1, pecaDaIA('servico-alerta'), 'Aviso')]);
  const r = edicao.semIA('deixa o preço maior', [], resultado);
  assert.equal(r.acao, 'fazer');
  assert.deepEqual(r.mudancas.map((m) => [m.tipo, m.peca, m.desenho]), [['refazer', 1, 'deixa o preço maior']], 'a única peça com preço');
  assert.equal(A.descreverMudanca(r.mudancas[0]), 'redesenhar a peça 1 (deixa o preço maior)');
  // O modelo que pôs o pedido em "texto": o código passa para "desenho".
  const lidas = A.lerMudancas([{ tipo: 'refazer', peca: 1, texto: 'deixa o preço maior', foto: 'manter' }], resultado);
  assert.equal(lidas[0].desenho, 'deixa o preço maior');
  assert.equal(lidas[0].texto, '');
});

test('o pedido de desenho chega ao compositor com o desenho anterior e sem "não repita" o próprio título', async (t) => {
  provedor(t, 'anthropic');
  const item = pecaDaIA('oferta-foto', { foto: '/media/t/a.jpg' });
  const c = campanhaCom([vaga(0, item, 'Óculos de sol')]);
  const pedidos = [];
  const antes = motores.chamar;
  motores.chamar = async (o) => { pedidos.push(o.usuario); return { texto: ouro('oferta-foto'), uso: { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0 } }; };
  t.after(() => { motores.chamar = antes; });
  const r = await A.aplicar(c, [{ tipo: 'refazer', peca: 1, foto: 'manter', texto: '', desenho: 'deixa o preço maior' }], {});
  assert.equal(r.naoFeito.length, 0);
  assert.match(pedidos[0], /O CLIENTE PEDIU ESTA MUDANÇA NO DESENHO[^\n]*"deixa o preço maior"/);
  assert.match(pedidos[0], /A peça atual era:/);
  assert.match(pedidos[0], /preco "189"/, 'os textos vão campo a campo');
  assert.doesNotMatch(pedidos[0], /Não repita nenhum desses textos/, 'a peça não é proibida de repetir o próprio título');
});

test('sem a IA de desenho, "deixa o preço maior" diz que não deu e não mexe na peça', async (t) => {
  provedor(t, 'dev');
  const item = pecaDaIA('oferta-foto', { foto: '/media/t/a.jpg' });
  const c = campanhaCom([vaga(0, item, 'Óculos de sol')]);
  const r = await A.aplicar(c, [{ tipo: 'refazer', peca: 1, foto: 'manter', texto: '', desenho: 'deixa o preço maior' }], {});
  assert.match(r.naoFeito[0], /Não consegui redesenhar a peça 1/);
  assert.equal(r.resultado.telas[0].zonas.principal[0].item.html, item.html);
});

test('o pedido à IA dentro da peça não diz "Deixei maior" quando nada mudou', async (t) => {
  provedor(t, 'anthropic');
  ai.callLLM = async () => JSON.stringify({ resposta: 'Deixei o preço maior e mais chamativo.', campos: {} });
  const item = pecaDaIA('oferta-foto', { foto: '/media/t/a.jpg' });
  const r = await ajustePeca.ajustar(item, 'deixa o preço maior', []);
  assert.deepEqual(r.mudou, []);
  assert.doesNotMatch(r.resposta, /Deixei/);
  assert.match(r.resposta, /Não mudei nada[\s\S]*tamanho[\s\S]*Editar com a IA/);
  ai.callLLM = async () => JSON.stringify({ resposta: 'Pronto, ficou ótimo!', campos: {} });
  const r2 = await ajustePeca.ajustar(item, 'deixa mais bonito', []);
  assert.doesNotMatch(r2.resposta || r2.pergunta, /Pronto, ficou/);
});

/* ---------------- Item 7: "Pode gerar a foto" ---------------- */

test('"Pode gerar a foto" é a escolha da foto, não a ordem de gerar', () => {
  for (const s of ['Pode gerar a foto', 'isso, das 15h às 18h. Pode gerar a foto. E posta no Instagram', 'sim, pode gerar a foto', 'pode criar uma imagem'])
    assert.equal(conversa.pediuParaGerar(s), false, s);
  for (const s of ['Pode gerar as fotos, pode começar', 'Pode gerar!', 'Pode gerar com as minhas fotos'])
    assert.equal(conversa.pediuParaGerar(s), true, s);
});

/* ---------------- Item 8: o custo estimado ---------------- */

test('a estimativa da composição segue o tamanho real do prompt', () => {
  assert.equal(creditos.operacao('gerar-composicao').custoCentavos, creditos.CUSTO_PECA_CENTAVOS);
  // ~39 mil tokens de entrada + 1,5 mil de saída no Gemini Flash, US$ 1 = R$ 5,50.
  const conta = Math.round((39000 * 0.3 + 1500 * 2.5) / 1e6 * 5.5 * 100);
  assert.ok(Math.abs(creditos.CUSTO_PECA_CENTAVOS - conta) <= 1, conta + ' centavos');
  assert.doesNotMatch(fs.readFileSync(path.join(RAIZ, 'server', 'creditos.js'), 'utf8'), /campanha inteira de TEXTO custa\s+\*?\s*cerca de cinco centavos/);
});
