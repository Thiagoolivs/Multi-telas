/*
 * As fontes moram no nosso domínio — e este teste é o que impede que voltem
 * a morar na Google sem ninguém perceber.
 *
 * O defeito que ele existe para pegar não aparece em desenvolvimento nenhum:
 * numa máquina com internet aberta, a fonte chega da Google e tudo parece
 * certo. Ele aparece na TV do cliente, cuja rede corporativa bloqueia domínio
 * de terceiro — aí o navegador cai na fonte de sistema, que é mais larga que
 * Anton ou Oswald, e o título que o compositor calculou que cabia estoura a
 * peça. Sem erro no console, sem log, sem nada. Só na parede.
 *
 * Três coisas são verificadas, e cada uma corresponde a um jeito real de
 * quebrar isto:
 *
 *   1. família nova no catálogo sem rodar tools/baixar-fontes.mjs
 *   2. arquivo citado na folha que não existe na pasta (rename, git parcial)
 *   3. alguém apontando de volta para fonts.gstatic.com
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const CSS = path.join(RAIZ, 'fonts', 'fontes.css');
const { FAMILIAS } = require(path.join(RAIZ, 'js', 'fontes.js'));

const css = fs.readFileSync(CSS, 'utf8');

/* Os nomes de família que a folha declara, como o navegador os enxerga. */
function familiasDeclaradas() {
  const nomes = new Set();
  for (const m of css.matchAll(/font-family:\s*'([^']+)'/g)) nomes.add(m[1]);
  return nomes;
}

/* O primeiro nome entre aspas da pilha CSS é a família que a peça quer. */
function familiaPedida(cssStack) {
  return /'([^']+)'/.exec(cssStack)?.[1] || null;
}

test('toda família do catálogo tem fonte servida por nós', () => {
  const declaradas = familiasDeclaradas();
  const faltando = [];
  for (const [id, f] of Object.entries(FAMILIAS)) {
    if (!f.google) continue; // fonte de sistema: não precisa de arquivo
    const nome = familiaPedida(f.css);
    if (nome && !declaradas.has(nome)) faltando.push(`${id} (${nome})`);
  }
  assert.deepStrictEqual(
    faltando, [],
    'família no catálogo sem fonte no pacote — rode `node tools/baixar-fontes.mjs`'
  );
});

test('todo arquivo citado na folha existe de verdade', () => {
  const refs = [...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/['"]/g, ''));
  assert.ok(refs.length > 0, 'a folha não referencia arquivo nenhum');
  const sumidos = refs.filter((r) => !fs.existsSync(path.join(RAIZ, 'fonts', r)));
  assert.deepStrictEqual(sumidos, [], 'a folha aponta para arquivo que não está no repositório');
});

test('nenhuma referência sobrou apontando para a Google', () => {
  assert.ok(!/fonts\.gstatic\.com|fonts\.googleapis\.com/.test(css), 'a folha ainda busca da Google');

  /*
   * Os dois carregadores — o da TV e o do painel — também não podem citar a
   * Google. São arquivos diferentes que fazem a mesma coisa, e já divergiram
   * antes; por isso os dois são conferidos, e não só um.
   */
  for (const rel of ['js/theme.js', 'web/src/lib/fontes.js']) {
    const src = fs.readFileSync(path.join(RAIZ, rel), 'utf8');
    // Fora de comentário: o porquê da mudança está escrito no código, e citar
    // o domínio ao explicar não é o mesmo que buscar dele.
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.ok(
      !/fonts\.(gstatic|googleapis)\.com/.test(codigo),
      rel + ' voltou a carregar fonte da Google'
    );
    assert.ok(codigo.includes('/fonts/fontes.css'), rel + ' não carrega a folha própria');
  }
});

test('a licença acompanha cada fonte redistribuída', () => {
  /*
   * A OFL permite servir do próprio domínio com uma condição: a licença e o
   * copyright vão junto. Baixar a fonte e esquecer a licença é o jeito fácil
   * de errar, e é irreversível depois de publicado.
   */
  const dir = path.join(RAIZ, 'fonts', 'licencas');
  const licencas = fs.readdirSync(dir);
  const chave = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  const semLicenca = [...familiasDeclaradas()].filter((n) => !licencas.includes(chave(n) + '.txt'));
  assert.deepStrictEqual(semLicenca, [], 'fonte redistribuída sem a licença junto');

  for (const arq of licencas) {
    const txt = fs.readFileSync(path.join(dir, arq), 'utf8');
    assert.ok(/SIL OPEN FONT LICENSE/i.test(txt), arq + ' não é uma OFL');
    assert.ok(/^Copyright/m.test(txt), arq + ' está sem aviso de copyright');
  }
});

test('o player leva a folha no cache do shell', () => {
  /*
   * Sem a folha pré-cacheada, uma TV que reinicie sem rede volta desenhando
   * na fonte de sistema — exatamente o defeito que auto-hospedar veio matar,
   * de novo, pela porta do offline.
   */
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  assert.ok(sw.includes("'/fonts/fontes.css'"), 'sw.js não pré-cacheia a folha das fontes');
});

test('o servidor sabe servir woff2', () => {
  /*
   * Sem o tipo certo, o arquivo sai como application/octet-stream e o
   * `nosniff` que protege o resto do sistema faz o navegador RECUSAR a fonte.
   * Os dois cabeçalhos estão certos separadamente e errados juntos.
   */
  const srv = fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8');
  assert.ok(/'\.woff2':\s*'font\/woff2'/.test(srv), 'server.js não conhece .woff2');
  assert.ok(srv.includes("'/fonts/'"), '/fonts/ não está entre as pastas públicas');
});
