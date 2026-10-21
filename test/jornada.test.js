/*
 * Primeira peça na TV em menos de 10 minutos (docs/EXECUTOR.md, item 16;
 * PLANO §5.3).
 *
 * Do cadastro à TV, guiado: cadastro → marca → primeira peça → parear a TV,
 * e cada passo diz o próximo. Os passos são deduzidos do estado real
 * (web/src/lib/jornada.js) — testados aqui com as respostas da API.
 *
 * Cronometrado no navegador (localhost, celular de 360 px, player num
 * navegador comum): 36 s do "Criar conta" à peça na TV, 22 s deles
 * esperando o link do e-mail chegar.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const jornada = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/jornada.js')).href);

// A API de mentira: cada caminho devolve o JSON dado.
function api(respostas) {
  globalThis.window = globalThis.window || { dispatchEvent() {} };
  globalThis.fetch = async (url) => {
    const chave = Object.keys(respostas).find((k) => String(url).startsWith(k));
    const corpo = chave ? respostas[chave] : {};
    return { ok: true, status: 200, json: async () => corpo, text: async () => JSON.stringify(corpo) };
  };
}
const PADARIA = { ramo: 'padaria', kit: { cores: ['#6b3a1e', '#e8b04b', '#f6ead7'] }, assets: [] };

test('a marca conta quando a pessoa disse quem é a empresa, não quando a conta nasceu com cor', async () => {
  const J = await jornada();
  assert.equal(J.marcaFeita(PADARIA), false, 'a paleta automática do ramo não é escolha');
  assert.equal(J.marcaFeita({ ...PADARIA, kit: { cores: ['#a94a2a', '#f3d9a4', '#5f6b3a'] } }), true, 'escolheu outra paleta');
  assert.equal(J.marcaFeita({ ...PADARIA, kit: { ...PADARIA.kit, site: 'https://padaria.com.br' } }), true, 'leu o site');
  assert.equal(J.marcaFeita({ ...PADARIA, assets: [{ id: 'logo' }] }), true, 'mandou o logo');
  assert.equal(J.marcaFeita(null), false);
});

test('o próximo passo segue a ordem: marca → peça → TV no ar com a peça', async () => {
  const J = await jornada();
  assert.deepStrictEqual(J.ORDEM, ['marca', 'peca', 'tela']);
  api({ '/api/brand': PADARIA, '/api/library': { items: [] }, '/api/devices': { devices: [] } });
  assert.equal((await J.lerJornada()).proximo, 'marca');
  const comMarca = { ...PADARIA, kit: { cores: ['#a94a2a', '#f3d9a4', '#5f6b3a'] } };
  api({ '/api/brand': comMarca, '/api/library': { items: [] }, '/api/devices': { devices: [] } });
  assert.equal((await J.lerJornada()).proximo, 'peca');
  api({ '/api/brand': comMarca, '/api/library': { items: [{ id: 'p1', item: { type: 'peca-html' } }] }, '/api/devices': { devices: [] } });
  const semTv = await J.lerJornada();
  assert.equal(semTv.proximo, 'tela');
  assert.equal(semTv.ultimaPeca.id, 'p1', 'a peça que vai para a TV no pareamento');
  // Pareada e vazia não é "no ar": a TV precisa ter dado sinal E ter o que mostrar.
  api({ '/api/brand': comMarca, '/api/library': { items: [{ id: 'p1' }] }, '/api/devices': { devices: [{ id: 't', lastSeen: Date.now(), hasConfig: false }] } });
  assert.equal((await J.lerJornada()).proximo, 'tela');
  api({ '/api/brand': comMarca, '/api/library': { items: [{ id: 'p1' }] }, '/api/devices': { devices: [{ id: 't', lastSeen: Date.now(), hasConfig: true }] } });
  assert.equal((await J.lerJornada()).proximo, null, 'pronto: o "Comece por aqui" some');
});

test('cada passo diz o próximo: Marca → Criar → Ligar a TV → a peça vai para a TV', () => {
  const pp = ler('web/src/components/dashboard/PrimeirosPassos.jsx');
  const ordem = ['marca', 'peca', 'tela'].map((id) => pp.indexOf("id: '" + id + "'"));
  assert.ok(ordem.every((i) => i > 0) && ordem[0] < ordem[1] && ordem[1] < ordem[2], 'a ordem dos passos mudou');
  assert.match(pp, /const agora = jornada\.proximo === p\.id;/, 'o próximo passo fica em destaque');
  // A Marca: feita, aponta para a primeira peça.
  const marca = ler('web/src/pages/BrandPage.jsx');
  assert.match(marca, /<ProximoPasso feito="A IA já usa a sua marca\." proximo="criar a primeira peça\." acao="Criar a primeira peça" onIr=\{\(\) => onIr\('criar'\)\} \/>/);
  assert.match(marca, /setProximo\(j\.marca && !j\.peca\)/);
  // O Criar: peça pronta sem TV, aponta para ligar a TV, com o pareamento já aberto.
  assert.match(ler('web/src/pages/CriarPage.jsx'), /onIr\('screens', \{ abrirParear: true \}\)/);
  assert.match(ler('web/src/App.jsx'), /abrirParear=\{!!route\.abrirParear\}/);
  // O pareamento: a peça que a conta fez vai para a TV com um toque.
  const telas = ler('web/src/pages/ScreensPage.jsx');
  assert.match(telas, /useState\(!!parear \|\| !!abrirParear\)/);
  assert.match(telas, /await publicarPecas\(\{ alvos: \[pareada\.id\], pecas: \[\{ formato: peca\.formato \|\| '16\/9', item: peca\.item \}\]/);
  // No Início, o caminho vem antes de tudo.
  const inicio = ler('web/src/pages/DashboardPage.jsx');
  assert.ok(inicio.indexOf('<PrimeirosPassos') > 0 && inicio.indexOf('<PrimeirosPassos') < inicio.indexOf('<OpcoesDeCriar'),
    'o "Comece por aqui" ficou abaixo das opções e saiu da tela no celular');
});
