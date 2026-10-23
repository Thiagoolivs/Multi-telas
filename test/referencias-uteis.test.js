/*
 * Referência de estilo útil (EXECUTOR D9).
 *
 * - O Criar lê as imagens de referência da Marca (antes só o diretor antigo
 *   lia): a frase de direção vai para os textos, as peças e as fotos.
 * - A leitura do site baixa as folhas de estilo (as cores moram no .css, não
 *   no HTML) e entende rgb(); as cores lidas viram a paleta "Do seu site".
 * - A og:image é BAIXADA para Mídias e entra no acervo e nas referências
 *   (antes ficava como endereço de fora, que a TV recusa).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const site = require('../server/site.js');
const eco = require('../server/ecossistema.js');
const E = require('../js/escopo.js');
const P = require('../js/paletas.js');
const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

test('o Criar lê as referências: a frase chega à foto (e ao pedido dos textos)', async () => {
  let pedidoDaFoto = '';
  let lidas = null;
  const escopo = E.normalizar({ nome: 'Teste', objetivo: 'pão de queijo', imagens: 'gerar',
    telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 1, pedido: 'pão de queijo quentinho' } } }] });
  await eco.gerar(escopo, { empresa: 'Padaria', marca: { cores: ['#7c2d12'], referencias: ['/media/x/a.png', '/media/x/b.png'] }, telas: [] }, {
    onLerReferencias: async (urls) => { lidas = urls; return 'tipografia condensada, cores quentes'; },
    onImagem: async (p) => { pedidoDaFoto = p; return '/media/x/f.png'; },
  });
  assert.deepEqual(lidas, ['/media/x/a.png', '/media/x/b.png']);
  assert.match(pedidoDaFoto, /Clima visual: tipografia condensada, cores quentes/);
  assert.match(ler('server/ecossistema.js'), /ctx\.estiloRef \? `Estilo das referências que o cliente gosta: \$\{ctx\.estiloRef\}` : ''/);
  assert.match(ler('server/compositor.js'), /o\.estiloRef \? 'Direção visual das referências do cliente/);
  // A rota do Criar passa o leitor (com memória, para não pagar a mesma leitura).
  assert.match(ler('server/routes/campanhas.js'), /onLerReferencias: estiloDasReferencias \}/);
  assert.match(ler('server.js'), /if \(estilosLidos\.has\(chave\)\) return estilosLidos\.get\(chave\);/);
});

test('sem referências (ou com a leitura falhando), a campanha sai igual', async () => {
  const escopo = E.normalizar({ nome: 'T', imagens: 'nenhuma', telas: [{ alvo: { tipo: 'todas' }, zonas: { principal: { pecas: 1 } } }] });
  let chamou = false;
  const r = await eco.gerar(escopo, { marca: { referencias: [] }, telas: [] }, { onLerReferencias: async () => { chamou = true; return 'x'; } });
  assert.equal(chamou, false);
  assert.ok(r);
  const r2 = await eco.gerar(escopo, { marca: { referencias: ['/media/x/a.png'] }, telas: [] }, { onLerReferencias: async () => { throw new Error('caiu'); } });
  assert.ok(r2, 'a leitura que falhou derrubou a campanha');
});

test('site: folhas de estilo, rgb() e o tipo da imagem pelos bytes', () => {
  assert.deepEqual(site.folhasDe('<link rel="stylesheet" href="/css/a.css"><link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet"><link rel="preload" href="x.js"><link rel=stylesheet href="b.css">', 'https://loja.com.br/p/'),
    ['https://loja.com.br/css/a.css', 'https://loja.com.br/p/b.css']);
  assert.deepEqual(site.coresDe('a{color:rgb(200, 30, 40)} b{background:rgb(200 30 40 / .5)} c{color:#1e3a8a} d{color:rgb(250,250,250)}'), ['#c81e28', '#1e3a8a']);
  assert.equal(site.tipoDaImagem(Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 0])), 'image/png');
  assert.equal(site.tipoDaImagem(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(site.tipoDaImagem(Buffer.from('<svg><script>alert(1)</script></svg>')), '', 'SVG disfarçado de imagem passou');
  // A imagem do site entra baixada, no acervo e nas referências; ler de novo troca a anterior.
  const s = ler('server.js');
  assert.match(s, /const img = await site\.baixarImagem\(dados\.imagem\)/);
  assert.match(s, /await db\.addBrandAsset\(sess\.tenant_id, 'base', salvo\.url, rotulo, parts\[3\]\);/);
});

test('as cores do site viram a paleta "Do seu site"', () => {
  const r = P.sugerir({ ramo: 'padaria', cores: [], doSite: ['#c81e28'] });
  const doSite = r.paletas.find((p) => p.origem === 'site');
  assert.ok(doSite, 'sem paleta do site');
  assert.equal(doSite.nome, 'Do seu site');
  assert.match(ler('web/src/components/content/PaletasSugeridas.jsx'), /sugerir\(\{ ramo, cores: daEmpresa, doSite \}\)/);
});

test('a imagem do site anterior sai pela ORIGEM (não pelo rótulo) e com o arquivo (revisão do consultor)', () => {
  const s = ler('server.js');
  assert.match(s, /const antigas = \(await db\.listMedia\(sess\.tenant_id\)\)\.filter\(\(x\) => x\.origem === 'site'\);/);
  // Desde o #227: apaga o arquivo antigo só se ninguém mais usa (teste abaixo).
  assert.match(s, /for \(const x of antigas\) \{/);
  assert.ok(!/\/\^Do site: \/\.test\(a\.label/.test(s), 'voltou a apagar pelo rótulo');
  // Só a imagem do site DA MARCA vira mídia da conta: a rota é a do site da marca, e só ela chama baixarImagem.
  assert.equal((s.match(/site\.baixarImagem\(/g) || []).length, 1);
});

test('imagem do site: a nova é guardada antes de a antiga sair, e a antiga em uso fica (revisão do #227)', () => {
  const s = ler('server.js');
  const i = s.indexOf("const antigas = (await db.listMedia(sess.tenant_id)).filter((x) => x.origem === 'site');");
  const bloco = s.slice(i, i + 2500);
  assert.ok(bloco.indexOf('midia.guardarBuffer(') < bloco.indexOf('db.removeBrandAsset('), 'apaga a antiga antes de guardar a nova');
  assert.ok(bloco.includes('if (!(await ondeEstaEmUso(sess.tenant_id, x.url)).length) await midia.apagar('), 'apaga a antiga mesmo em uso');
});
