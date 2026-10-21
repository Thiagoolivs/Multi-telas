/*
 * O escopo (docs/EXECUTOR.md, item 20): o contrato entre o chat e o gerador.
 * O cartão "O que vou criar" promete o que `descrever` escreve, o gerador faz
 * o que `normalizar` deixa passar, e a cobrança conta o que `custo` diz. Se
 * os três divergirem, o cliente paga por uma coisa e recebe outra.
 */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/escopo.js');

const exemplo = () => ({
  nome: 'Semana do pão de queijo',
  objetivo: 'vender mais pão de queijo à tarde',
  imagens: 'gerar',
  telas: [
    {
      alvo: { tipo: 'tela', id: 'dev_balcao1' }, nome: 'TV do balcão', layout: 'corporate',
      zonas: {
        principal: { pecas: 3, pedido: 'imagem com chamada' },
        lateral: { pecas: 2, pedido: 'promoção com preço' },
        cabecalho: { pecas: 2, vivos: ['relogio', 'clima'] },
        rodape: { pecas: 1, mensagens: ['Pão de queijo em dobro das 15h às 17h', 'Aceitamos Pix'], contagem: '2026-10-25T18:00' },
      },
    },
    { alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 1 } } },
  ],
  redes: { instagramPost: true, whatsappMensagem: true },
  horarios: [{ faixa: 'manha', foco: 'café da manhã' }, { inicio: '15:00', fim: '17:00', foco: 'pão de queijo' }],
});

test('a forma: o que vem certo passa inteiro', () => {
  const e = E.normalizar(exemplo());
  assert.equal(e.versao, 1);
  assert.equal(e.imagens, 'gerar');
  assert.equal(e.telas.length, 2);
  assert.deepEqual(e.telas[0].alvo, { tipo: 'tela', id: 'dev_balcao1' });
  assert.equal(e.telas[0].layout, 'corporate');
  assert.equal(e.telas[0].zonas.principal.pecas, 3);
  assert.deepEqual(e.telas[0].zonas.rodape.vivos, ['contagem'], 'contagem com data entra nos campos vivos');
  assert.equal(e.telas[1].zonas.lateral.pecas, 0, 'zona que não veio fica vazia');
  assert.deepEqual(e.redes, { instagramPost: true, instagramStory: false, whatsappStatus: false, whatsappMensagem: true, facebook: false, google: false });
  assert.deepEqual(e.horarios[1], { faixa: '', inicio: '15:00', fim: '17:00', foco: 'pão de queijo' });
  assert.deepEqual(E.normalizar(e), e, 'normalizar duas vezes dá o mesmo');
});

test('o que vem errado é cortado, não corrigido', () => {
  const e = E.normalizar({
    nome: 'x'.repeat(500), imagens: 'todas', redes: { facebook: 'sim', google: 1 },
    periodo: { inicio: '25/10/2026', fim: '2026-10-30' },
    telas: [{
      alvo: { tipo: 'tela', id: '../../etc' }, layout: 'Layout <b>', zonas: {
        principal: { pecas: 999 }, lateral: { pecas: -3 }, cabecalho: { pecas: 2.6, vivos: ['relogio', 'relogio', 'script', 'contagem'] },
        rodape: { mensagens: ['ok', '', 42, 'y'.repeat(300)], contagem: 'amanhã' },
      },
    }, 'lixo', null],
    horarios: [{ faixa: 'madrugada' }, { inicio: '25:00', fim: '10:00' }, { faixa: 'tarde' }],
  });
  assert.equal(e.nome.length, 60);
  assert.equal(e.imagens, 'mistura', 'modo inventado cai no meio-termo');
  assert.equal(e.redes.facebook, false, 'só true liga');
  assert.equal(e.redes.google, false);
  assert.deepEqual(e.periodo, { inicio: '', fim: '2026-10-30' });
  assert.deepEqual(e.telas[0].alvo, { tipo: 'todas' }, 'id fora da forma vira "todas", nunca um id esquisito');
  assert.equal(e.telas[0].layout, '');
  assert.equal(e.telas[0].zonas.principal.pecas, 8, 'teto da zona');
  assert.equal(e.telas[0].zonas.lateral.pecas, 0);
  assert.equal(e.telas[0].zonas.cabecalho.pecas, 3);
  assert.deepEqual(e.telas[0].zonas.cabecalho.vivos, ['relogio'], 'contagem sem data não promete nada');
  assert.deepEqual(e.telas[0].zonas.rodape.mensagens, ['ok', '42', 'y'.repeat(120)]);
  assert.equal(e.telas.length, 3, 'tela que não é objeto vira tela vazia, sem quebrar');
  assert.deepEqual(e.horarios, [{ faixa: 'tarde', inicio: '', fim: '', foco: '' }]);
});

test('os tetos: 12 telas e 24 peças no escopo inteiro, cortando do fim', () => {
  const muitas = Array.from({ length: 20 }, () => ({ zonas: { principal: { pecas: 8 }, lateral: { pecas: 8 } } }));
  const e = E.normalizar({ telas: muitas });
  assert.equal(e.telas.length, 12);
  const total = e.telas.reduce((s, t) => s + E.ZONAS.reduce((a, z) => a + t.zonas[z].pecas, 0), 0);
  assert.equal(total, 24);
  assert.equal(e.telas[0].zonas.principal.pecas, 8, 'o que o cliente pôs primeiro fica');
  assert.equal(e.telas[2].zonas.lateral.pecas, 0);
});

test('o custo: foto só no principal e na lateral; redes usam a peça da TV', () => {
  assert.deepEqual(E.custo(exemplo()), { pecas: 9, fotos: 6, criacoes: 6, ate: false });
  assert.equal(E.custo({ ...exemplo(), imagens: 'mistura' }).ate, true, 'com as fotos do cliente, é teto');
  assert.equal(E.custo({ ...exemplo(), imagens: 'minhas' }).criacoes, 0);
  assert.equal(E.custo({ ...exemplo(), imagens: 'nenhuma' }).criacoes, 0);
  // Só redes: uma peça é feita para elas.
  assert.deepEqual(E.custo({ imagens: 'gerar', redes: { instagramPost: true } }), { pecas: 1, fotos: 1, criacoes: 1, ate: false });
  assert.deepEqual(E.custo({}), { pecas: 0, fotos: 0, criacoes: 0, ate: true });
});

test('tem o que gerar: vazio não acende o botão', () => {
  assert.equal(E.temOQueGerar(E.vazio()), false);
  assert.equal(E.temOQueGerar(E.padrao()), true);
  assert.equal(E.temOQueGerar({ telas: [{ zonas: { rodape: { mensagens: ['Aceitamos Pix'] } } }] }), true, 'só o letreiro já é pedido');
  assert.equal(E.temOQueGerar({ redes: { google: true } }), true);
});

test('descrever: em português de lojista, zona por zona, com o custo', () => {
  const linhas = E.descrever(exemplo());
  assert.deepEqual(linhas[0], {
    tipo: 'tela', titulo: 'TV do balcão',
    itens: [
      'Principal: 3 peças (imagem com chamada)',
      'Lateral: 2 peças (promoção com preço)',
      'Cabeçalho: 2 estilos girando, relógio e clima',
      'Rodapé: 1 peça, 2 avisos no letreiro, contagem regressiva até 25/10 18h',
    ],
  });
  assert.equal(linhas[1].titulo, 'Tela 2');
  assert.deepEqual(linhas[2], { tipo: 'redes', titulo: 'Redes', itens: ['post do Instagram e mensagem do WhatsApp'] });
  assert.deepEqual(linhas[3].itens, ['manhã: café da manhã', '15h às 17h: pão de queijo']);
  assert.deepEqual(linhas[4].itens, ['a IA gera as fotos · 6 criações']);
  assert.deepEqual(E.descrever({ imagens: 'mistura', telas: [{ zonas: { principal: { pecas: 1 } } }] }).pop().itens,
    ['as suas fotos primeiro, a IA completa · até 1 criação']);
  assert.deepEqual(E.descrever({ imagens: 'minhas' }).pop().itens, ['só as suas fotos · não gasta criação']);
  assert.deepEqual(E.descrever({ telas: [{}] })[0], { tipo: 'tela', titulo: 'Todas as TVs', itens: ['nada ainda'] });
});

test('os recortes: um toque muda o tamanho do pedido, sem mexer no original', () => {
  const base = E.normalizar(exemplo());
  const antes = JSON.stringify(base);
  const zonas = (e, i = 0) => E.ZONAS.map((z) => e.telas[i].zonas[z].pecas);

  assert.deepEqual(zonas(E.recortar(base, 'principal-lateral')), [3, 2, 0, 0]);
  const cr = E.recortar(base, 'cabecalho-rodape');
  assert.deepEqual(zonas(cr), [0, 0, 2, 1]);
  assert.deepEqual(cr.telas[0].zonas.rodape.mensagens.length, 2, 'o letreiro que o cliente escreveu fica');
  assert.deepEqual(zonas(E.recortar(base, 'tres-principal'), 1), [3, 0, 0, 0]);
  assert.deepEqual(zonas(E.recortar(base, 'dois-cabecalho'), 1), [1, 0, 2, 0]);
  const uma = E.recortar(base, 'uma-peca');
  assert.deepEqual(zonas(uma), [1, 0, 0, 0]);
  assert.ok(!Object.values(uma.redes).some(Boolean), 'uma peça só não vai para as redes');
  const redes = E.recortar(base, 'so-redes');
  assert.equal(redes.telas.length, 0);
  assert.equal(redes.redes.instagramStory, true);
  assert.ok(!Object.values(E.recortar(base, 'sem-redes').redes).some(Boolean));
  // Tudo, a partir do vazio: cria a tela e liga as quatro zonas.
  const tudo = E.recortar(E.vazio(), 'tudo');
  assert.deepEqual(zonas(tudo), [3, 2, 1, 1]);
  assert.equal(tudo.redes.whatsappStatus, true);
  assert.equal(JSON.stringify(base), antes, 'o recorte não muda o escopo de quem chamou');
  assert.deepEqual(E.recortar(base, 'nao-existe'), base);
  assert.deepEqual(E.RECORTES.map((r) => r.id), ['tudo', 'principal-lateral', 'cabecalho-rodape', 'tres-principal', 'dois-cabecalho', 'uma-peca', 'so-redes', 'sem-redes']);
});

test('no navegador é o mesmo arquivo (MTEscopo)', () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const ctx = { globalThis: {} };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(require.resolve('../js/escopo.js'), 'utf8'), ctx);
  assert.equal(typeof ctx.MTEscopo.normalizar, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.MTEscopo.custo(exemplo()))), E.custo(exemplo()));
});
