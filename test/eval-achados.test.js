/*
 * Os defeitos que o eval achou na primeira execução.
 *
 * O eval informa: mostra que 3 de 10 casos tinham problema. O teste é que
 * BLOQUEIA — e por isso cada achado vira um teste aqui, com o caso que o
 * revelou escrito junto. Sem isso o eval seria um relatório que ninguém lê
 * duas vezes.
 */
const test = require('node:test');
const assert = require('node:assert');
const director = require('../server/ai-director.js');

const IDENTIDADE = { brand: '#1e3a8a', brand2: '#0ea5e9', estilo: 'vibrante', direcao: 'chapado' };
const peca = (formato, headline, extra) => ({
  formato, headline, kicker: 'NOVIDADE', sub: 'Passe no balcão.', cta: 'Saiba mais',
  precisaImagem: false, promptImagem: '', ...(extra || {}),
});

test('o CTA não nasce fora da peça quando o título é alto', () => {
  /*
   * Caso `aviso-piso`: a pílula do CTA nascia em y=107 — inteiramente fora do
   * quadro. E o estrago não era só ela sumir: `separarTextos` puxava o TEXTO
   * de volta para dentro e deixava a FORMA para trás, porque ele só mexe em
   * `tipo === 'texto'`. Na tela, o CTA aparecia sem o fundo dele.
   */
  const ds = require('../server/design-system.js');
  const pal = ds.buildPalette('#1e3a8a', '#0ea5e9', 'vibrante', 'marca');
  const r = director.layoutReserva(
    peca('16/9', 'CUIDADO, PISO MOLHADO NESTA ÁREA INTEIRA'), pal, '16/9', 'chapado', {});
  const fora = r.elementos.filter((e) => e.y > 100 || e.y + e.h > 112);
  assert.deepStrictEqual(fora.map((e) => e.papel), [], 'elemento nasceu fora da peça');

  // E a pílula tem que ficar COM o rótulo, no mesmo y.
  const pilula = r.elementos.find((e) => e.papel === 'destaque');
  const rotulo = r.elementos.find((e) => e.papel === 'cta');
  if (pilula && rotulo) {
    assert.equal(pilula.y, rotulo.y, 'a pílula do CTA se separou do rótulo');
  }
});

test('pedir dois formatos entrega os dois', () => {
  /*
   * Caso `rh-vaga`: pedido de duas peças em ['16/9','9/16'] devolvia duas
   * peças 16/9 e nada vertical. Duas causas somadas — a conversão só mexia
   * em peça de formato NÃO pedido, e o corte pelo teto levava as duas
   * primeiras da lista, que eram as horizontais.
   *
   * Quem marcou dois formatos marcou porque quer os dois. Receber só um, sem
   * nenhum aviso, é pior que receber uma peça a menos.
   */
  const p = director.normalizarPlano(
    { identidade: IDENTIDADE, pecas: [peca('16/9', 'Estamos contratando'), peca('16/9', 'Venha fazer parte')] },
    { pedido: { formatos: ['16/9', '9/16'], quantidade: 2, imagens: 'nenhuma' } });
  const formatos = new Set(p.pecas.map((x) => x.formato));
  assert.ok(formatos.has('16/9') && formatos.has('9/16'),
    'faltou formato: veio ' + [...formatos].join(', '));
  assert.equal(p.pecas.length, 2, 'o teto deixou de ser respeitado');
});

test('o CORTE pelo teto também preserva os formatos pedidos', () => {
  /*
   * Este caso existe porque o teste acima NÃO cobria o corte: com duas peças
   * na entrada, a cobertura da conversão já resolvia, e desligar a lógica do
   * corte não fazia teste nenhum falhar. Código que nenhum teste exercita é
   * código que ninguém sabe se serve.
   *
   * Medido: com seis peças e teto de duas, sem a cobertura no corte voltam
   * duas 16/9 — porque a ordenação põe as sem-imagem na frente, e as duas
   * primeiras são do mesmo formato.
   */
  const seis = [
    peca('16/9', 'A'), peca('16/9', 'B'),
    peca('9/16', 'C', { precisaImagem: true, promptImagem: 'foto' }),
    peca('9/16', 'D', { precisaImagem: true, promptImagem: 'foto' }),
    peca('1/1', 'E'), peca('1/1', 'F'),
  ];
  const p = director.normalizarPlano({ identidade: IDENTIDADE, pecas: seis },
    { pedido: { formatos: ['16/9', '9/16'], quantidade: 2, imagens: 'gerar' } });
  assert.equal(p.pecas.length, 2, 'o teto deixou de ser respeitado');
  const formatos = new Set(p.pecas.map((x) => x.formato));
  assert.equal(formatos.size, 2, 'o corte entregou os dois no mesmo formato: '
    + p.pecas.map((x) => x.formato).join(', '));
});

test('converter formato não cria duas peças com a mesma manchete', () => {
  /*
   * Caso `otica-desconto`: a peça movida ia para um formato que JÁ tinha
   * aquele título — e duas peças de manchete idêntica na mesma TV é a
   * campanha piscando a mesma arte.
   *
   * A primeira tentativa de conserto consultava a lista ORIGINAL para saber
   * o que estava ocupado, e por isso não enxergava as peças que ela própria
   * acabara de mover. Passou no caso simples e falhou neste.
   */
  const p = director.normalizarPlano(
    { identidade: IDENTIDADE, pecas: [
      peca('16/9', 'Óculos de sol com 30%'),
      peca('9/16', 'Óculos de sol com 30%'),
      peca('1/1', 'Óculos de sol com 30%'),
    ] },
    { pedido: { formatos: ['16/9', '1/1'], quantidade: 3, imagens: 'nenhuma' } });

  const vistas = new Set();
  for (const x of p.pecas) {
    const chave = x.formato + '|' + String(x.headline).toLowerCase().trim();
    assert.ok(!vistas.has(chave), 'manchete repetida no mesmo formato: ' + x.headline + ' (' + x.formato + ')');
    vistas.add(chave);
  }
});

test('com uma peça só, dois formatos pedidos não viram peça extra', () => {
  // O contrário do teste acima: garantir cobertura não pode furar o teto.
  const p = director.normalizarPlano(
    { identidade: IDENTIDADE, pecas: [peca('16/9', 'Aviso')] },
    { pedido: { formatos: ['16/9', '9/16'], quantidade: 1, imagens: 'nenhuma' } });
  assert.equal(p.pecas.length, 1, 'a cobertura de formato furou o teto');
});

test('o eval existe, roda no CI e falha quando algo quebra', () => {
  /*
   * Um eval que ninguém roda é um relatório. Ele entra no CI porque estas
   * conferências são determinísticas — a parte que precisa de olho é a folha
   * de contato com Gemini, que roda à mão e não bloqueia.
   */
  const fs = require('node:fs'); const path = require('node:path');
  const raiz = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.eval, 'node tools/eval.mjs', 'sumiu o comando do eval');
  assert.match(fs.readFileSync(path.join(raiz, '.github', 'workflows', 'ci.yml'), 'utf8'),
    /npm run eval/, 'o eval saiu do CI');
  const fonte = fs.readFileSync(path.join(raiz, 'tools', 'eval.mjs'), 'utf8');
  assert.match(fonte, /process\.exit\(totalFalhas \? 1 : 0\)/, 'o eval deixou de falhar quando encontra problema');
  // Entradas fixas é o ponto inteiro: sem isso não há comparação.
  assert.ok((fonte.match(/id: '[a-z-]+', brief:/g) || []).length >= 10, 'o eval perdeu casos');
});
