/*
 * Foto a partir do produto REAL do cliente (PLANO §4.11): o plano guarda a
 * foto escolhida, o gerador recebe a imagem e a ordem de fidelidade, e o
 * servidor só aceita mídia da própria conta (test/campanha-custo.test.js).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const director = require('../server/ai-director.js');
const direcaoArte = require('../server/direcao-arte.js');

const RAIZ = path.join(__dirname, '..');
const IDENT = { brand: '#7a1f3d', brand2: '#e9c46a', estilo: 'elegante', direcao: 'suave' };
const MIDIA = '/media/conta1/abc123def456.jpg';

function plano(pecas, ctx) {
  return director.normalizarPlano({ identidade: IDENT, pecas }, Object.assign({ empresa: 'Loja' }, ctx || {})).pecas;
}

test('o plano guarda a foto do produto, e ela liga a geração da foto', () => {
  const [p] = plano([{ formato: '16/9', headline: 'Vestido de linho', referenciaProduto: MIDIA }]);
  assert.equal(p.referenciaProduto, MIDIA);
  assert.equal(p.precisaImagem, true, 'escolher o produto é pedir a foto');
  assert.match(p.promptImagem, /produto da foto.*Vestido de linho/, 'sem descrição, a foto ganha uma padrão');

  const [q] = plano([{ formato: '16/9', headline: 'X', referenciaProduto: MIDIA, promptImagem: 'mulher de 30 anos usando o vestido' }]);
  assert.equal(q.promptImagem, 'mulher de 30 anos usando o vestido', 'a descrição da pessoa vence a padrão');
});

test('o plano recusa endereço que não é mídia nossa', () => {
  for (const ruim of ['https://outro.site/foto.jpg', '/media/../etc/passwd', '/media/conta1/x.jpg?y=1', 123, '/media/' + 'a'.repeat(600)]) {
    const [p] = plano([{ formato: '16/9', headline: 'X', referenciaProduto: ruim }]);
    assert.equal(p.referenciaProduto, '', String(ruim).slice(0, 40));
    assert.equal(p.precisaImagem, false);
  }
});

test('"sem foto" no pedido não apaga a foto do produto escolhida na revisão', () => {
  /*
   * Achado olhando a tela: o formulário estava em "Sem foto", a pessoa
   * escolheu o produto na revisão, e a peça saiu sem foto nenhuma. A escolha
   * na revisão é a mais recente, com o custo à vista — vale para a peça dela.
   */
  for (const imagens of ['nenhuma', 'acervo']) {
    const pecas = plano([
      { formato: '16/9', headline: 'Com produto', referenciaProduto: MIDIA },
      { formato: '16/9', headline: 'Outra', precisaImagem: true, promptImagem: 'cena' },
    ], { pedido: { imagens } });
    assert.equal(pecas[0].precisaImagem, true, imagens);
    assert.equal(pecas[0].referenciaProduto, MIDIA);
    assert.equal(pecas[1].precisaImagem, false, 'as outras peças seguem o pedido: ' + imagens);
  }
});

test('foto do acervo usada como está vence: não gera, não guarda referência', () => {
  const ctx = { marca: { bases: [{ url: '/media/conta1/loja.jpg', label: 'fachada' }] } };
  const [p] = plano([{ formato: '16/9', headline: 'X', imagemBase: 0, referenciaProduto: MIDIA, precisaImagem: true }], ctx);
  assert.equal(p.bgImagem, '/media/conta1/loja.jpg');
  assert.equal(p.precisaImagem, false);
  assert.equal(p.referenciaProduto, '');
});

test('a campanha passa a foto do produto ao gerador de imagem', async () => {
  const chamadas = [];
  await director.dirigir('vestido novo', {
    empresa: 'Loja',
    planoAprovado: { identidade: IDENT, pecas: [
      { formato: '16/9', headline: 'Com produto', referenciaProduto: MIDIA, promptImagem: 'cena' },
      { formato: '16/9', headline: 'Sem produto', precisaImagem: true, promptImagem: 'outra cena' },
    ] },
  }, { onImagem: async (prompt, formato, arte) => { chamadas.push({ prompt, arte }); return '/media/conta1/gerada.png'; } });
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].arte.referencia, MIDIA);
  assert.equal(chamadas[1].arte.referencia, '');
});

test('direção de arte com produto: fidelidade, e o produto não é tingido', () => {
  const com = direcaoArte.promptDeFoto('mulher usando o vestido', { formato: '9/16', brand: '#7a1f3d', produto: true });
  assert.match(com, /PRODUTO REAL DO CLIENTE/);
  assert.match(com, /mantém as cores reais/);
  assert.doesNotMatch(com, /MONOCROMIA/, 'tingir o produto na cor da marca seria inventar outro');
  assert.match(com, /impresso no próprio produto/);
  assert.match(com, /NENHUM TEXTO/);
  assert.ok(com.indexOf('PRODUTO REAL') < com.indexOf('DIREÇÃO DE ARTE'), 'a fidelidade vem antes da direção');

  const sem = direcaoArte.promptDeFoto('padeiro', { formato: '16/9', brand: '#7a1f3d' });
  assert.match(sem, /MONOCROMIA/);
  assert.doesNotMatch(sem, /PRODUTO REAL/);
});

test('o gerador manda a foto do produto antes do texto, como imagem', () => {
  // Processo à parte: a chave do Gemini é lida quando o módulo carrega.
  const script = `
    const ai = require(${JSON.stringify(path.join(RAIZ, 'server', 'ai.js'))});
    const corpos = [];
    globalThis.fetch = async (url, o) => {
      corpos.push(JSON.parse(o.body));
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] }) };
    };
    (async () => {
      const r = await ai.generateImage('mulher usando o vestido', { formato: '9/16', referencias: [{ mime: 'image/jpeg', data: 'Zm90bw==' }] });
      await ai.generateImage('padeiro', { formato: '16/9' });
      console.log(JSON.stringify({ mime: r.mime, corpos }));
    })();
  `;
  const r = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', env: Object.assign({}, process.env, { GEMINI_API_KEY: 'teste', AI_PROVIDER: 'gemini' }) });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(out.mime, 'image/png');
  assert.equal(out.corpos.length, 2);
  const com = out.corpos[0].contents[0].parts;
  assert.deepEqual(com[0], { inline_data: { mime_type: 'image/jpeg', data: 'Zm90bw==' } });
  assert.match(com[1].text, /PRODUTO REAL DO CLIENTE/);
  const sem = out.corpos[1].contents[0].parts;
  assert.equal(sem.length, 1, 'sem referência, só o texto');
  assert.doesNotMatch(sem[0].text, /PRODUTO REAL/);
});

test('a revisão do plano oferece a foto do produto, sem gerar nada', () => {
  const tela = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'pages', 'MyDesignsPage.jsx'), 'utf8');
  assert.match(tela, /Usar a foto do meu produto/);
  assert.match(tela, /referenciaProduto: url, precisaImagem: true/);
  assert.match(tela, /Como a foto deve ser/, 'a descrição da foto precisa ser editável antes de gastar');
  const seletor = fs.readFileSync(path.join(RAIZ, 'web', 'src', 'components', 'content', 'FotoDoProduto.jsx'), 'utf8');
  assert.match(seletor, /m\.origem !== 'ia'/, 'imagem gerada não é foto de produto');
  assert.match(seletor, /5 \* 1024 \* 1024/, 'o teto da foto é o mesmo que o servidor lê');
});
