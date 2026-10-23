/*
 * Imagem de verdade (docs/EXECUTOR.md, item 19).
 *
 * O dono gerou uma campanha e "nem imagens ele colocou". Cada teste abaixo é
 * um dos caminhos em que a foto sumia, achados em 21/10:
 *   - o Criar mandava `imagens: 'acervo'` fixo;
 *   - o plano dizia que "a maioria resolve com formas";
 *   - a cor da marca vinha de `plano.paleta`, que não existe;
 *   - o compositor jogava fora a foto já paga (ver motor-html-produto.test.js);
 *   - sem a chave de imagem, um degradê com o prompt escrito ia para a peça
 *     como foto, e era cobrado.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const director = require('../server/ai-director.js');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const IDENT = { brand: '#1b3a5c', brand2: '#e9c46a', estilo: 'elegante', direcao: 'suave' };

test('destaque sem foto passa a pedir foto; banner, foto da empresa e cópia ficam como estão', () => {
  const f = director.comFotoDeDestaque;
  const tv = f({ formato: '16/9', headline: 'Pão de queijo quentinho', objetivo: 'vender à tarde' });
  assert.equal(tv.precisaImagem, true);
  assert.match(tv.promptImagem, /Pão de queijo quentinho — vender à tarde/);
  for (const formato of ['9/16', '1/1']) assert.equal(f({ formato, headline: 'X' }).precisaImagem, true, formato);
  assert.equal(f({ formato: '21/9', headline: 'X' }).precisaImagem, undefined, 'banner fino não pede foto');
  assert.equal(f({ formato: '16/9', headline: 'X', imagemBase: 0 }).precisaImagem, undefined, 'a foto da empresa vence');
  assert.equal(f({ formato: '16/9', headline: 'X', reusaImagemDe: 'Y' }).precisaImagem, undefined, 'a cópia reusa, não paga de novo');
  const ja = { formato: '16/9', headline: 'X', precisaImagem: true, promptImagem: 'padeiro tirando pão do forno' };
  assert.equal(f(ja).promptImagem, 'padeiro tirando pão do forno', 'o pedido de foto do modelo fica');
});

test('só com imagens pedidas, e o custo mostrado acompanha', () => {
  const base = { pecas: [{ formato: '16/9', headline: 'A' }, { formato: '21/9', headline: 'B' }], imagensAGerar: 0 };
  const gerar = director.comFotoNoDestaque({ ...base, pedido: { imagens: 'gerar' } });
  assert.equal(gerar.imagensAGerar, 1, 'o número que a tela mostra antes de gastar');
  for (const imagens of ['acervo', 'nenhuma']) {
    const r = director.comFotoNoDestaque({ ...base, pedido: { imagens } });
    assert.equal(r.imagensAGerar, 0, imagens);
    assert.ok(!r.pecas[0].precisaImagem, imagens);
  }
});

test('o plano novo sai com foto no destaque (modo demonstração)', async () => {
  const p = await director.planejar('Pão de queijo em dobro à tarde', {
    empresa: 'Padaria do Bairro', pedido: { formatos: ['16/9'], quantidade: 2, imagens: 'gerar' },
  });
  assert.ok(p.pecas.length >= 1);
  for (const x of p.pecas) assert.equal(x.precisaImagem, true, x.headline);
  assert.equal(p.imagensAGerar, p.pecas.length);
});

test('o plano aprovado não ganha foto que o cliente tirou', async () => {
  const r = await director.dirigir('pão', {
    pedido: { imagens: 'gerar' },
    planoAprovado: { identidade: IDENT, pecas: [{ formato: '16/9', headline: 'Sem foto, por escolha' }] },
  }, { pararNoPlano: true });
  assert.equal(r.plano.pecas[0].precisaImagem, false);
  assert.equal(r.orcamento.creditos, 0);
});

test('a cor e a direção da marca chegam ao pedido da foto', async () => {
  let arte = null;
  await director.dirigir('pão', {
    planoAprovado: { identidade: IDENT, pecas: [{ formato: '16/9', headline: 'Pão', precisaImagem: true, promptImagem: 'pão na chapa' }] },
  }, { onImagem: async (prompt, formato, a) => { arte = a; return '/media/t/f.png'; } });
  assert.ok(arte, 'a foto não foi pedida');
  assert.equal(arte.brand, '#1b3a5c');
  assert.equal(arte.direcao, 'suave');
  assert.equal(arte.estilo, 'elegante');
  assert.doesNotMatch(ler('server/ai-director.js'), /plano\.paleta/, '`plano.paleta` não existe');
});

function gerarImagem(env) {
  const script = `
    const ai = require(${JSON.stringify(path.join(RAIZ, 'server', 'ai.js'))});
    ai.generateImage('padeiro tirando pão do forno', { formato: '16/9', brand: '#1b3a5c' })
      .then((r) => console.log(JSON.stringify({ ok: true, reserva: !!r.reserva, svg: Buffer.from(r.data, 'base64').toString('utf8') })))
      .catch((e) => console.log(JSON.stringify({ ok: false, status: e.status, msg: e.message })));
  `;
  const limpo = Object.assign({}, process.env);
  for (const k of ['GEMINI_API_KEY', 'GOOGLE_API_KEY', 'GROQ_API_KEY', 'ANTHROPIC_API_KEY', 'AI_PROVIDER']) delete limpo[k];
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: Object.assign(limpo, env) });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

test('modo demonstração: a foto de reserva não tem texto e é marcada como reserva', () => {
  const r = gerarImagem({});
  assert.equal(r.ok, true);
  assert.equal(r.reserva, true);
  assert.doesNotMatch(r.svg, /<text/, 'foto não tem texto desenhado');
  assert.doesNotMatch(r.svg, /padeiro/, 'o prompt não vai escrito na imagem');
  assert.match(r.svg, /#1b3a5c/, 'a reserva usa a cor da marca');
});

test('IA de texto sem a chave de imagem: erro com motivo, não um degradê cobrado', () => {
  const r = gerarImagem({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'teste' });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
  assert.match(r.msg, /gerador de fotos/);
});

test('foto de reserva não se cobra, nem na campanha nem na imagem solta', () => {
  const s = ler('server.js');
  // Desde o D0.4c a cobrança marca a reserva antes (reserva.cobrada()), num bloco.
  assert.equal((s.match(/if \(!img\.reserva\) \{\s*reserva\.cobrada\(\);\s*await usoIA\.cobrar\(/g) || []).length, 2);
});

test('o Criar deixa escolher a foto, e o padrão é a IA gerar', () => {
  // A escolha da foto em Ajustar mora na Criação rápida (no chat, ela está no cartão).
  const c = ler('web/src/pages/CriacaoRapidaPage.jsx');
  assert.doesNotMatch(c, /imagens: 'acervo'/, 'a foto voltou a ser fixa');
  assert.match(c, /pedido: \{ formatos: onde, quantidade: quantas, imagens: fotos \}/);
  assert.match(c, /const \[fotos, setFotos\] = useState\('gerar'\)/);
  for (const nome of ['A IA gera', 'Só as minhas', 'Sem foto']) assert.ok(c.includes("nome: '" + nome + "'"), nome);
});
