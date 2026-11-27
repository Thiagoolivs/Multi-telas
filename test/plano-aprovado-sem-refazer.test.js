/*
 * A segunda chamada da campanha (o plano aprovado) não refaz o que o plano
 * já fez (26/11). Antes, com `planoAprovado`, o diretor lia as referências
 * de novo, catalogava o acervo de novo e deduzia o briefing de novo — uma
 * chamada de texto e duas de visão pagas outra vez, antes do ramo que não
 * replaneja. Agora o briefing vem dentro do plano aprovado.
 *
 * Os testes contam as chamadas na camada mais baixa (motores.chamar, por
 * onde passa toda chamada de modelo) e nos ganchos de visão, com um
 * provedor de mentira: nada sai da máquina.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ai = require('../server/ai.js');
const motores = require('../server/motores.js');
const director = require('../server/ai-director.js');

const RAIZ = path.join(__dirname, '..');
const PECA = fs.readFileSync(path.join(RAIZ, 'pecas-ouro', 'servico-alerta.html'), 'utf8');
const USO = { entrada: 1, saida: 1, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelo: 'teste' };

const BRIEF = { objetivo: 'Encher a loja na semana do sol', publico: 'quem passa na calçada', argumento: '30% em toda a linha solar',
  urgencia: 'até sábado', provas: ['30% de desconto'], evitar: [], formatos: ['16/9'], quantidade: 2 };
const PLANO = {
  campanha: 'Semana do Sol', identidade: { brand: '#1b3a5c', brand2: '#e9c46a', estilo: 'elegante', direcao: 'suave' },
  pecas: [
    { formato: '16/9', canal: 'TV', faixa: 'tarde', kicker: 'Semana do Sol', headline: 'Óculos de sol com 30%', sub: 'Até sábado.', cta: 'Passe na loja' },
    { formato: '16/9', canal: 'TV', faixa: 'saida', kicker: 'Garantia', headline: 'Dois anos de garantia', sub: 'Em toda armação.', cta: '' },
  ],
  social: { instagram: 'x', whatsapp: 'x', linkedin: 'x' }, agenda: [],
};

// Um provedor de mentira: responde pelo sistema de cada chamada e conta todas.
function provedor(t) {
  const antes = { p: process.env.AI_PROVIDER, chamar: motores.chamar };
  process.env.AI_PROVIDER = 'anthropic';
  const chamadas = [];
  motores.chamar = async (o) => {
    const s = String(o.sistema || '');
    const tipo = /planner de comunicação/.test(s) ? 'briefing' : /diretor de arte sênior/.test(s) ? 'plano' : /Escreva a peça pedida/.test(s) ? 'peca' : 'outra';
    chamadas.push(tipo);
    const texto = tipo === 'briefing' ? JSON.stringify(BRIEF) : tipo === 'plano' ? JSON.stringify(PLANO) : PECA;
    return { texto, uso: USO };
  };
  t.after(() => {
    if (antes.p === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = antes.p;
    motores.chamar = antes.chamar;
  });
  return chamadas;
}

const marca = () => ({
  cores: ['#1b3a5c', '#e9c46a'],
  referencias: ['/media/conta1/ref1.jpg'],
  bases: [{ url: '/media/conta1/loja.jpg', label: '' }],
});

function ganchos(contas) {
  return {
    onLerReferencias: async () => { contas.referencias++; return 'fundo claro, muito respiro'; },
    onCatalogar: async (urls) => { contas.catalogo++; return urls.map(() => 'fachada da loja'); },
    onProgresso: (etapa) => contas.etapas.push(etapa),
  };
}

test('o plano novo faz o caminho inteiro: referências, acervo, briefing e plano — e o briefing vai dentro do plano', async (t) => {
  const chamadas = provedor(t);
  const contas = { referencias: 0, catalogo: 0, etapas: [] };
  const r = await director.dirigir('óculos de sol 30% até sábado', { empresa: 'Ótica Central', marca: marca(), motorHtml: true, pedido: { imagens: 'nenhuma' } },
    Object.assign(ganchos(contas), { pararNoPlano: true }));
  assert.equal(r.etapa, 'plano');
  assert.deepEqual(chamadas, ['briefing', 'plano'], 'uma chamada para o briefing e uma para o plano');
  assert.equal(contas.referencias, 1);
  assert.equal(contas.catalogo, 1);
  assert.equal(r.plano.briefing.objetivo, BRIEF.objetivo, 'o briefing volta dentro do plano, para a aprovação o devolver');
  assert.deepEqual(r.plano.briefing.provas, BRIEF.provas);
});

test('o plano aprovado não refaz nada: só as peças chamam a IA, e o briefing é o do plano', async (t) => {
  const chamadas = provedor(t);
  const primeiro = { referencias: 0, catalogo: 0, etapas: [] };
  const ctx = () => ({ empresa: 'Ótica Central', marca: marca(), motorHtml: true, pedido: { imagens: 'nenhuma' } });
  const r1 = await director.dirigir('óculos de sol 30% até sábado', ctx(), Object.assign(ganchos(primeiro), { pararNoPlano: true }));
  chamadas.length = 0;

  // O painel devolve o plano como recebeu (MyDesignsPage, CriacaoRapidaPage: `planoAprovado: plano.plano`).
  const aprovado = JSON.parse(JSON.stringify(r1.plano));
  const contas = { referencias: 0, catalogo: 0, etapas: [] };
  const r2 = await director.dirigir('óculos de sol 30% até sábado', Object.assign(ctx(), { planoAprovado: aprovado }), ganchos(contas));
  assert.equal(contas.referencias, 0, 'as referências não são lidas de novo');
  assert.equal(contas.catalogo, 0, 'o acervo não é catalogado de novo');
  assert.ok(!chamadas.includes('briefing'), 'o briefing não é deduzido de novo');
  assert.ok(!chamadas.includes('plano'), 'o plano não é refeito');
  assert.deepEqual(chamadas, r2.pecas.map(() => 'peca'), 'uma chamada por peça, e só');
  assert.ok(!contas.etapas.some((e) => /referências|suas fotos|briefing/.test(e)), contas.etapas.join(' · '));
  assert.equal(r2.briefing.objetivo, BRIEF.objetivo, 'o resultado mostra o briefing que a pessoa viu');
  assert.deepEqual(r2.pecas.map((p) => p.label), r1.plano.pecas.map((p) => p.headline.slice(0, 40)), 'as peças são as do plano aprovado');
  for (const p of r2.pecas) assert.equal(p.motor, 'html');
});

test('plano aprovado sem briefing dentro: vale o da conversa, senão nenhum — e nenhuma chamada a mais', async (t) => {
  const chamadas = provedor(t);
  const aprovado = { identidade: PLANO.identidade, pecas: [PLANO.pecas[0]] };
  const conversa = { objetivo: 'Vender a linha solar', publico: 'clientes da loja', briefing: 'semana do sol' };
  const r = await director.dirigir('x', { empresa: 'Ótica Central', marca: marca(), motorHtml: true, planoAprovado: aprovado, briefingPronto: conversa }, ganchos({ referencias: 0, catalogo: 0, etapas: [] }));
  assert.equal(r.briefing.objetivo, 'Vender a linha solar');
  const r2 = await director.dirigir('x', { empresa: 'Ótica Central', marca: marca(), motorHtml: true, planoAprovado: aprovado }, {});
  assert.equal(r2.briefing, null);
  assert.ok(chamadas.every((c) => c === 'peca'), chamadas.join(', '));
  // O briefing que volta do painel passa pelos limites de sempre: vem de fora.
  const longo = await director.dirigir('x', { empresa: 'X', planoAprovado: Object.assign({}, aprovado, { briefing: { objetivo: 'a'.repeat(900), provas: 'não é lista' } }) }, { pararNoPlano: true });
  assert.equal(longo.plano.briefing.objetivo.length, 220);
  assert.deepEqual(longo.plano.briefing.provas, []);
});

test('sem o plano aprovado, o caminho é o de antes (o briefing da conversa dispensa a dedução)', async (t) => {
  const chamadas = provedor(t);
  const contas = { referencias: 0, catalogo: 0, etapas: [] };
  const r = await director.dirigir('x', { empresa: 'Ótica Central', marca: marca(), briefingPronto: { objetivo: 'Vender a linha solar', briefing: 'b' } },
    Object.assign(ganchos(contas), { pararNoPlano: true }));
  assert.deepEqual(chamadas, ['plano']);
  assert.equal(contas.referencias, 1);
  assert.equal(contas.catalogo, 1);
  assert.equal(r.plano.briefing.objetivo, 'Vender a linha solar');
  assert.ok(ai.mode() !== 'dev');
});
