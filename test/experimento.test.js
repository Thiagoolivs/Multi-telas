/*
 * O experimento do PLANO §4.4: os 20 pedidos, o motor HTML que compõe a
 * peça, o rodador e a conta da página de notas às cegas.
 *
 * Nada aqui chama a rede: o compositor roda com o fetch trocado, e o
 * rodador no modo --simular. O que se confere é o caminho — se o motor
 * recebe o exemplo em cache, se a recusa da porta volta para ele corrigir,
 * se a nota às cegas soma do jeito que o critério do plano pede.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const T = require('../js/tokens.js');
const F = require('../js/fontes.js');
const P = require('../js/peca-html.js');
const C = require('../server/compositor.js');
const E = require('../js/experimento.js');

const BANCO = JSON.parse(ler('tools', 'banco-avaliacao.json'));

/* ---------------- Os 20 pedidos ---------------- */

test('o banco tem os 20 pedidos do plano, e os 10 primeiros são os do eval', () => {
  assert.deepEqual(BANCO.pedidos.map((p) => p.n), Array.from({ length: 20 }, (_, i) => i + 1));
  const doEval = [...ler('tools', 'eval.mjs').matchAll(/brief: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(doEval.length, 10);
  assert.deepEqual(BANCO.pedidos.slice(0, 10).map((p) => p.pedido), doEval, 'continuidade com tools/eval.mjs');
  // Os casos 3, 11, 15 e 19 rodam também como tela completa.
  assert.deepEqual(BANCO.pedidos.filter((p) => p.tela).map((p) => p.n), [3, 11, 15, 19]);
  for (const p of BANCO.pedidos) assert.ok(['gerar', 'acervo', 'nenhuma', null].includes(p.foto), p.id + ': foto ' + p.foto);
});

test('toda empresa do banco tem marca válida nos 4 modos', () => {
  for (const p of BANCO.pedidos) assert.ok(BANCO.empresas[p.empresa], p.empresa + ' sem marca');
  for (const [nome, e] of Object.entries(BANCO.empresas)) {
    assert.ok(F.FAMILIAS[e.marca.fonteTitulo] && F.FAMILIAS[e.marca.fonteApoio], nome + ': fonte fora do catálogo');
    for (const modo of T.MODOS) assert.deepEqual(T.conferir(T.daMarca(e.marca, modo)), [], nome + ' ' + modo);
  }
});

/* ---------------- O compositor ---------------- */

function comFetch(respostas, fn) {
  const antes = globalThis.fetch;
  const pedidos = [];
  globalThis.fetch = async (url, op) => {
    const corpo = JSON.parse(op.body);
    pedidos.push({ url, corpo });
    const texto = respostas[Math.min(pedidos.length - 1, respostas.length - 1)];
    return { ok: true, status: 200, json: async () => ({ model: corpo.model, content: [{ type: 'text', text: texto }], usage: { input_tokens: 100, output_tokens: 900, cache_read_input_tokens: 40000 } }) };
  };
  return Promise.resolve(fn(pedidos)).finally(() => { globalThis.fetch = antes; });
}
function comEnv(vars, fn) {
  const antes = {};
  for (const k of Object.keys(vars)) { antes[k] = process.env[k]; process.env[k] = vars[k]; }
  return Promise.resolve(fn()).finally(() => { for (const k of Object.keys(vars)) { if (antes[k] == null) delete process.env[k]; else process.env[k] = antes[k]; } });
}

const BOA = ler('pecas-ouro', 'oferta-lista.html');
const RUIM = BOA.replace('color: var(--mt-texto);', 'color: #ff0000;');

test('o exemplo fixo é a biblioteca inteira do papel, igual em todo pedido — é o que deixa o cache valer', () => {
  const f = C.fixo('destaque');
  assert.equal(f, C.fixo('destaque'), 'o fixo mudou entre duas chamadas');
  const m = JSON.parse(ler('pecas-ouro', 'manifesto.json'));
  for (const p of m.pecas.filter((x) => x.papeis.includes('destaque'))) assert.ok(f.includes('### ' + p.nome), p.id + ' fora dos exemplos');
  assert.ok(!f.includes('Faixa fixa com chamada'), 'peça de rodapé nos exemplos de destaque');
  // O pedido do cliente nunca entra no fixo.
  assert.ok(!f.includes('Padaria do Bairro"') && !/Pedido do cliente/.test(f));
});

test('a peça recusada pela porta volta ao motor com o motivo, e a segunda passa', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k' }, () => comFetch([RUIM, BOA], async (pedidos) => {
    const r = await C.comporPeca({ motor: 'claude-sonnet', pedido: 'óculos de sol 30% off', empresa: 'Ótica Central', marca: { cores: ['#1b2a4a'] } });
    assert.equal(r.ok, true);
    assert.equal(r.tentativas, 2);
    assert.equal(r.passouDePrimeira, false);
    assert.equal(pedidos.length, 2);
    const segunda = pedidos[1].corpo.messages[0].content.at(-1).text;
    assert.match(segunda, /RECUSADA pela porta/);
    assert.match(segunda, /cor só por token/);
    // O exemplo vai em cache nas duas, e o pedido do cliente fica fora dele.
    for (const p of pedidos) {
      assert.equal(p.corpo.system[0].cache_control.type, 'ephemeral');
      assert.ok(!p.corpo.system[0].text.includes('óculos de sol 30% off'));
    }
    assert.equal(r.uso.chamadas, 2);
    assert.equal(r.uso.cacheLida, 80000);
    // O item sai pronto para a TV, já limpo pela porta.
    assert.equal(r.item.type, 'peca-html');
    assert.deepEqual(P.validarItem(r.item).problemas, []);
  })));

test('três recusas seguidas: o motor não entregou, e o motivo fica', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k' }, () => comFetch([RUIM], async (pedidos) => {
    const r = await C.comporPeca({ motor: 'claude-sonnet', pedido: 'x', tentativas: 3 });
    assert.equal(r.ok, false);
    assert.equal(pedidos.length, 3);
    assert.ok(r.problemas.some((p) => /cor só por token/.test(p)));
  })));

test('a resposta embrulhada em cerca de código é desembrulhada', () => {
  assert.equal(C.limparResposta('Aqui está:\n```html\n<style></style><section class="mt-peca"></section>\n```'), '<style></style><section class="mt-peca"></section>');
  assert.equal(C.limparResposta('  <style></style>  '), '<style></style>');
});

test('tela completa: cada zona sabe o que as anteriores disseram', () =>
  comEnv({ ANTHROPIC_API_KEY: 'k' }, () => comFetch([BOA], async (pedidos) => {
    const r = await C.comporTela({ motor: 'claude-sonnet', pedido: 'óculos', empresa: 'Ótica Central' });
    assert.deepEqual(Object.keys(r), ['cabecalho', 'destaque', 'lateral', 'rodape']);
    const usuario = (i) => pedidos[i].corpo.messages[0].content.at(-1).text;
    assert.doesNotMatch(usuario(0), /já dizem/);
    // A lateral (3ª chamada) recebe os textos do cabeçalho e do destaque para não repetir.
    assert.match(usuario(2), /As outras zonas da tela já dizem: .*"Escolha o seu par"/);
    assert.match(usuario(2), /Não repita nenhum desses textos/);
    // Cada zona recebe os exemplos do papel dela.
    assert.match(pedidos[0].corpo.system[0].text, /papel: cabecalho/);
    assert.match(pedidos[3].corpo.system[0].text, /papel: rodape/);
  })));

/* ---------------- A conta das notas ---------------- */

const DADOS = {
  motores: { atual: 'Atual', 'html-sonnet': 'HTML + Sonnet' },
  pedidos: [{ n: 1, pedido: 'a' }, { n: 3, pedido: 'b', tela: true }],
  pecas: [
    { chave: 'a1', n: 1, motor: 'atual', peca: { ok: true, itens: { '16/9': {} }, uso: { custoCentavos: 10 }, ms: 1000, passouDePrimeira: true } },
    { chave: 's1', n: 1, motor: 'html-sonnet', peca: { ok: true, item: {}, uso: { custoCentavos: 60 }, ms: 3000, passouDePrimeira: false } },
    { chave: 'a3', n: 3, motor: 'atual', peca: { ok: true, itens: { '16/9': {} }, uso: { custoCentavos: 10 }, ms: 1000, passouDePrimeira: true }, tela: { zonas: {} } },
    { chave: 's3', n: 3, motor: 'html-sonnet', erro: 'rede caiu' },
  ],
};

test('a ordem é embaralhada, mas a mesma toda vez que o arquivo reabre', () => {
  const lista = Array.from({ length: 30 }, (_, i) => i);
  const a = E.embaralhar(lista, 'arquivo-1');
  assert.deepEqual(a, E.embaralhar(lista, 'arquivo-1'));
  assert.notDeepEqual(a, lista, 'não embaralhou');
  assert.deepEqual(a.slice().sort((x, y) => x - y), lista, 'perdeu ou duplicou peça');
  assert.notDeepEqual(a, E.embaralhar(lista, 'arquivo-2'));
});

test('tela só entra nos pedidos de tela; o que o motor não entregou vem marcado', () => {
  const av = E.avaliacoes(DADOS);
  assert.deepEqual(av.map((a) => a.id), ['a1:peca', 's1:peca', 'a3:peca', 'a3:tela', 's3:peca', 's3:tela']);
  assert.deepEqual(av.filter((a) => a.falhou).map((a) => a.id), ['s3:peca', 's3:tela']);
});

test('o resumo conta o que falhou como 1, e o critério do plano sai da média, do atual e do custo', () => {
  const notas = { 'a1:peca': 3, 's1:peca': 5, 'a3:peca': 3, 'a3:tela': 4 };
  const r = Object.fromEntries(E.resumo(DADOS, notas).map((l) => [l.motor, l]));
  assert.equal(r.atual.notaPeca, 3);
  assert.equal(r.atual.notaTela, 4);
  assert.equal(r['html-sonnet'].notaPeca, 3, '5 e o 1 de quem não entregou');
  assert.equal(r['html-sonnet'].falhas, 1);
  assert.equal(r['html-sonnet'].deprimeira, 0);
  assert.ok(Math.abs(r['html-sonnet'].custoMedioReais - 0.6) < 1e-9);
  const [c] = E.criterio(Object.values(r));
  assert.deepEqual([c.media4, c.acima, c.custo, c.passa], [false, false, true, false]);
  // Com nota 5 nas duas, passaria: média ≥ 4, 2 pontos acima do atual, R$ 0,60.
  const bom = E.criterio([{ motor: 'atual', notaPeca: 3 }, { motor: 'x', rotulo: 'x', notaPeca: 5, custoMedioReais: 0.6 }]);
  assert.equal(bom[0].passa, true);
  const caro = E.criterio([{ motor: 'atual', notaPeca: 3 }, { motor: 'x', rotulo: 'x', notaPeca: 5, custoMedioReais: 1.2 }]);
  assert.equal(caro[0].passa, false);
});

/* ---------------- O rodador e a página ---------------- */

test('o rodador simulado percorre os motores e grava o que a página abre', () => {
  const saida = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mt-exp-')), 'r.json');
  const r = spawnSync(process.execPath, ['tools/experimento.mjs', '--simular', '--pedidos=3,7', '--saida=' + saida], { cwd: RAIZ, encoding: 'utf8', env: Object.assign({}, process.env, { DATA_DIR: path.dirname(saida) }) });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const d = JSON.parse(fs.readFileSync(saida, 'utf8'));
  assert.equal(d.simulado, true);
  assert.deepEqual(Object.keys(d.motores), ['atual', 'html-gemini', 'html-sonnet', 'html-opus']);
  assert.equal(d.pecas.length, 8);
  const av = E.avaliacoes(d);
  assert.equal(av.filter((a) => a.tipo === 'tela').length, 4, 'o pedido 3 roda como tela nos 4 motores');
  assert.equal(av.filter((a) => a.falhou).length, 0);
  // A mesma foto para todos os motores do pedido 3.
  assert.equal(new Set(d.pecas.filter((p) => p.n === 3).map((p) => p.foto)).size, 1);
  // E o marcador da simulação fica na pasta dele: a rodada de verdade não pode achá-lo.
  assert.match(d.pecas.find((p) => p.n === 3).foto, /^\/pecas-ouro\/fotos\/experimento\/simulado\/[\w-]+\.svg$/);
});

test('a rodada de verdade não reaproveita o marcador cinza como foto', () => {
  const fonte = ler('tools/experimento.mjs');
  assert.match(fonte, /SIMULAR \? \['simulado'\]/);
  assert.match(fonte, /SIMULAR \|\| !f\.endsWith\('\.svg'\)/);
  assert.match(fonte, /!SIMULAR && \/svg\/\.test\(img\.mime\)\) throw/);
});

test('a página roda sob a CSP e o resultado do experimento não vai para o git', () => {
  const html = ler('experimento.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'script embutido não roda com script-src self');
  assert.match(html, /<meta name="robots" content="noindex"/);
  assert.match(html, /src="\/js\/experimento\.js"/);
  const gi = ler('.gitignore');
  assert.match(gi, /^experimento\/$/m);
  assert.match(gi, /^pecas-ouro\/fotos\/experimento\/$/m);
});
