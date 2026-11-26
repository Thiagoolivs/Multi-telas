/*
 * As decisões da galeria (Plataforma › Conteúdo pronto) valem também para a
 * IA (26/11). Antes, a biblioteca-ouro que vai de exemplo lia só o estado do
 * arquivo: a peça aprovada na galeria não ensinava a IA, e a recusada
 * continuava ensinando, até o próximo deploy. E a peça de reserva podia pôr
 * no ar uma peça recusada.
 *
 *   - a biblioteca segue o manifesto efetivo (arquivo + banco);
 *   - ela só é refeita quando uma decisão muda;
 *   - passou do teto do papel, vai uma amostra com variedade;
 *   - a reserva nunca usa a recusada (nem a que voltou para proposta).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../server/compositor.js');
const P = require('../js/peca-html.js');
const R = require('../js/regras-composicao.js');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const MANIFESTO = JSON.parse(ler('pecas-ouro/manifesto.json'));
const aprovadaNoArquivo = (p) => !p.estado || p.estado === 'aprovada';
const decisao = (id, estado) => ({ tipo: 'peca', id, estado, decidido_por: 'dono@x', decidido_em: Date.now() });
const TEXTOS = { kicker: 'Só hoje', titulo: 'Pão de queijo em dobro', apoio: 'Das 15h às 17h, saindo do forno.', cta: 'Peça no balcão' };

// Cada teste começa e termina sem decisão nenhuma (vale o arquivo).
test.beforeEach(() => C.definirDecisoes([]));
test.afterEach(() => C.definirDecisoes([]));

test('a aprovada na galeria vira exemplo da IA; a recusada na galeria sai', () => {
  const destaque = MANIFESTO.pecas.filter((p) => p.papeis.includes('destaque'));
  const noArquivo = destaque.find(aprovadaNoArquivo);
  const proposta = destaque.find((p) => !aprovadaNoArquivo(p));
  assert.ok(noArquivo && proposta, 'o manifesto tem uma de cada');
  const titulo = (p) => '### ' + p.nome + ' (' + p.familia + ')';
  const antes = C.fixo('destaque');
  assert.ok(antes.includes(titulo(noArquivo)) && !antes.includes(titulo(proposta)), 'sem decisão, vale o arquivo');

  assert.equal(C.definirDecisoes([decisao(noArquivo.id, 'recusada'), decisao(proposta.id, 'aprovada'), { tipo: 'tela', id: 't', estado: 'aprovada' }]), true);
  const depois = C.fixo('destaque');
  assert.ok(!depois.includes(titulo(noArquivo)), 'a recusada na galeria não ensina mais');
  assert.ok(depois.includes(titulo(proposta)), 'a aprovada na galeria ensina');
  // A que voltou para "proposta" na galeria também sai.
  C.definirDecisoes([decisao(noArquivo.id, 'proposta')]);
  assert.ok(!C.fixo('destaque').includes(titulo(noArquivo)));
});

test('a biblioteca guardada só é refeita quando uma decisão muda', (t) => {
  const antes = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  t.after(() => { if (antes === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = antes; });
  const p = MANIFESTO.pecas.find((x) => x.papeis.includes('lateral') && aprovadaNoArquivo(x));
  const titulo = '### ' + p.nome + ' (';
  const f1 = C.fixo('lateral');
  assert.equal(C.fixo('lateral'), f1, 'em produção, o mesmo texto (o cache do provedor vale)');
  assert.ok(f1.includes(titulo));
  // As mesmas decisões, em outra ordem ou com outra data: nada muda, nada é refeito.
  const lista = [decisao(p.id, 'recusada'), decisao('outra-qualquer', 'aprovada')];
  assert.equal(C.definirDecisoes(lista), true);
  assert.equal(C.definirDecisoes(lista.slice().reverse().map((d) => Object.assign({}, d, { decidido_em: 1 }))), false);
  assert.ok(!C.fixo('lateral').includes(titulo), 'a decisão nova chega mesmo com a biblioteca guardada');
  assert.equal(C.definirDecisoes([]), true);
  assert.equal(C.fixo('lateral'), f1);
});

test('o teto: com tudo aprovado, cada papel leva no máximo MAX_EXEMPLOS, com todas as famílias', () => {
  C.definirDecisoes(MANIFESTO.pecas.map((p) => decisao(p.id, 'aprovada')));
  for (const papel of ['destaque', 'lateral', 'cabecalho', 'rodape']) {
    const candidatas = MANIFESTO.pecas.filter((p) => p.papeis.includes(papel));
    const f = C.fixo(papel);
    const exemplos = f.match(/^### .*$/gm) || [];
    assert.equal(exemplos.length, Math.min(candidatas.length, C.MAX_EXEMPLOS[papel]), papel);
    for (const fam of new Set(candidatas.map((p) => p.familia))) assert.ok(exemplos.some((x) => x.endsWith('(' + fam + ')')), papel + ': falta a família ' + fam);
    assert.equal(C.fixo(papel), f, papel + ': a amostra é a mesma em todo pedido');
    for (const frente of ['comercio', 'saude', 'empresa']) assert.equal(C.fixo(papel, frente), C.fixo(papel, frente), papel + '/' + frente);
  }
  // O destaque não passa do tamanho de antes das aprovações (~155 mil caracteres com 32 peças).
  assert.ok(C.fixo('destaque').length < 160000, 'destaque com ' + C.fixo('destaque').length);
  assert.ok(C.fixo('lateral').length < 130000, 'lateral com ' + C.fixo('lateral').length);
  // A frente da conta pesa na amostra: a clínica vê mais exemplos de Saúde.
  const deSaude = (f) => (f.match(/^### .*$/gm) || []).filter((x) => MANIFESTO.pecas.some((p) => x === '### ' + p.nome + ' (' + p.familia + ')' && (p.frentes || []).includes('saude'))).length;
  assert.ok(deSaude(C.fixo('destaque', 'saude')) >= deSaude(C.fixo('destaque')));
  // Até o teto, a frente não muda nada: um prefixo só por papel.
  C.definirDecisoes([]);
  assert.equal(C.fixo('destaque', 'saude'), C.fixo('destaque'));
});

test('a amostra: uma de cada família por rodada, a frente da conta primeiro, em ordem de id', () => {
  const p = (id, familia, frentes) => ({ id, familia, frentes });
  const lista = [
    ...Array.from({ length: 10 }, (_, i) => p('a' + String(i).padStart(2, '0'), 'A', i === 7 || i === 9 ? ['saude'] : ['comercio'])),
    p('b1', 'B', ['comercio']), p('b2', 'B', ['empresa']), p('c1', 'C', ['saude']),
  ];
  assert.equal(C.escolherExemplos(lista, 20, ''), lista, 'até o teto, tudo');
  const seis = C.escolherExemplos(lista, 6, '');
  assert.equal(seis.length, 6);
  assert.deepEqual(seis.map((x) => x.id), seis.map((x) => x.id).slice().sort(), 'em ordem de id');
  assert.deepEqual(seis.filter((x) => x.familia !== 'A').map((x) => x.id), ['b1', 'b2', 'c1'], 'as famílias pequenas entram inteiras');
  const daClinica = C.escolherExemplos(lista, 6, 'saude').filter((x) => x.familia === 'A').map((x) => x.id);
  assert.ok(daClinica.includes('a07') && daClinica.includes('a09'), 'as de Saúde da família A entram primeiro: ' + daClinica);
});

test('hoje toda peça de reserva está aprovada no arquivo: a peça mínima não entra', () => {
  const ids = [C.OURO.comFoto.id, C.OURO.semFoto.id, ...Object.values(C.OURO_PAPEL).flat().map((x) => x.id), ...Object.values(C.OURO_VIVO).map((x) => x.id)];
  for (const id of ids) assert.equal(C.podeSerReserva(id), true, id);
  assert.equal(C.preencherOuro({ textos: TEXTOS, empresa: 'X' }).origem.base, 'institucional-lancamento');
});

test('a reserva do destaque nunca usa a recusada na galeria', () => {
  const foto = '/media/conta1/f.jpg';
  C.definirDecisoes([decisao('institucional-foto', 'recusada')]);
  const semAFoto = C.preencherOuro({ textos: TEXTOS, foto, empresa: 'Padaria' });
  assert.equal(semAFoto.origem.base, 'institucional-lancamento', 'a com foto recusada: entra a só tipografia');
  assert.equal(semAFoto.campos.foto, undefined, 'campo que a peça não tem não vai (a TV recusaria)');
  assert.deepEqual(P.validarItem(semAFoto).problemas, []);

  C.definirDecisoes([decisao('institucional-foto', 'recusada'), decisao('institucional-lancamento', 'recusada')]);
  const coluna = C.preencherOuro({ textos: TEXTOS, foto, empresa: 'Padaria' });
  assert.equal(coluna.origem.base, 'lateral-chamada');
  assert.equal(coluna.papel, 'destaque');
  assert.deepEqual(P.validarItem(coluna).problemas, []);

  C.definirDecisoes(['institucional-foto', 'institucional-lancamento', 'lateral-chamada'].map((id) => decisao(id, 'recusada')));
  for (const papel of ['destaque', 'lateral']) {
    const minima = C.preencherPapel({ papel, textos: TEXTOS, empresa: 'Padaria' });
    assert.equal(minima.origem.base, 'peca-minima', papel);
    assert.equal(minima.papel, papel);
    assert.deepEqual(P.validarItem(minima).problemas, [], papel);
    assert.deepEqual(R.letrasPequenas(minima.css, papel, minima.html), [], papel + ': letra abaixo do mínimo');
    assert.equal(minima.campos.titulo, 'Pão de queijo em dobro');
  }
});

test('a reserva das faixas e da lateral pula a recusada; todas recusadas, a peça mínima', () => {
  const base = { empresa: 'Padaria do Bairro', textos: TEXTOS };
  C.definirDecisoes([decisao('cabecalho-classico', 'recusada'), decisao('cabecalho-chamadas', 'proposta')]);
  assert.equal(C.preencherPapel({ ...base, papel: 'cabecalho' }).origem.base, 'cabecalho-chamada', 'a recusada sai do giro');
  assert.notEqual(C.preencherPapel({ ...base, papel: 'cabecalho', chamadas: ['Café na hora'] }).origem.base, 'cabecalho-chamadas', 'a que voltou para proposta também');

  C.definirDecisoes([decisao('lateral-chamada', 'recusada')]);
  const lateral = C.preencherPapel({ ...base, papel: 'lateral' });
  assert.equal(lateral.origem.base, 'institucional-lancamento', 'a lateral cai na reserva do destaque');
  assert.equal(lateral.papel, 'lateral');

  const todas = [...C.OURO_PAPEL.cabecalho, ...C.OURO_PAPEL.rodape, C.OURO_VIVO.cabecalho, C.OURO_VIVO.rodape].map((x) => decisao(x.id, 'recusada'));
  C.definirDecisoes(todas);
  for (const papel of ['cabecalho', 'rodape']) {
    for (const extra of [{}, { indice: 1 }, { contagem: '2026-12-03T18:00', chamadas: ['Café'] }]) {
      const it = C.preencherPapel({ ...base, ...extra, papel });
      assert.equal(it.origem.base, 'peca-minima', papel);
      assert.equal(it.duracao, 20);
      assert.deepEqual(P.validarItem(it).problemas, [], papel);
      assert.deepEqual(R.letrasPequenas(it.css, papel, it.html), [], papel + ': letra abaixo do mínimo');
    }
  }
  assert.match(C.preencherPapel({ ...base, papel: 'cabecalho' }).html, /data-vivo="relogio"/);
  assert.equal(C.preencherPapel({ ...base, papel: 'cabecalho' }).campos.kicker, 'Padaria do Bairro');
  assert.match(C.preencherPapel({ ...base, papel: 'rodape' }).html, /data-vivo="mensagens"/, 'as frases do rodapé continuam rolando');
});

test('o servidor entrega as decisões à IA no boot, depois de cada decisão e de tempos em tempos', () => {
  const s = ler('server.js');
  assert.match(s, /function ouroDaIA\(\) \{[\s\S]*?db\.decisoesDoConteudo\(\)[\s\S]*?compositor\.definirDecisoes\(decisoes\)/);
  assert.match(s, /db\.init\(\)\s*(\/\/[^\n]*\n\s*)?\.then\(\(\) => ouroDaIA\(\)\)\s*\.then\(\(\) => server\.listen\(/, 'antes do primeiro pedido');
  const lote = s.slice(s.indexOf("parts[3] === 'lote'"));
  assert.match(lote, /for \(const x of lote\.itens\) await db\.decidirConteudo[\s\S]*?await ouroDaIA\(\);\s*return sendJson\(res, 200, \{ ok: true, estado, decididos/, 'o lote');
  assert.match(s, /await ouroDaIA\(\);\s*return sendJson\(res, 200, \{ ok: true, tipo, id, estado, pecas \}\)/, 'o cartão');
  assert.match(s, /setInterval\(ouroDaIA, 5 \* 60 \* 1000\)\.unref\(\)/);
});
