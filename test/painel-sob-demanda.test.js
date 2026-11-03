/*
 * O painel carrega cada página quando a pessoa abre (QA de 26/10): o arquivo
 * único de 965 KB fazia o Início levar 5,7 s para pintar no celular em 4G.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'web/src/App.jsx'), 'utf8');

test('nenhuma página entra por import estático, só a tela de login', () => {
  const estaticos = [...APP.matchAll(/^import \{ (\w+) \} from '\.\/pages\/(\w+)\.jsx';/gm)].map((m) => m[1]);
  assert.deepEqual(estaticos, ['AuthScreen'], 'página voltou para o pacote principal: ' + estaticos.join(', '));
  const paginas = fs.readdirSync(path.join(__dirname, '..', 'web/src/pages')).filter((f) => /Page\.jsx$/.test(f));
  for (const f of paginas) {
    const nome = f.replace('.jsx', '');
    if (!new RegExp('<' + nome + '[\\s/>]').test(APP)) continue; // página que o App não abre
    assert.match(APP, new RegExp("const " + nome + " = pagina\\(\\(\\) => import\\('\\./pages/" + nome + "\\.jsx'\\), '" + nome + "'\\);"), nome);
  }
});

test('a página espera num Suspense dentro do limite de erro; pacote velho recarrega uma vez', () => {
  assert.match(APP, /<LimiteDeErro key=\{route\.name\}>\s*<Suspense fallback=/);
  assert.match(APP, /if \(!sessionStorage\.getItem\('mt\.recarregou'\)\) \{ sessionStorage\.setItem\('mt\.recarregou', '1'\); window\.location\.reload\(\); \}/);
  assert.match(APP, /sessionStorage\.removeItem\('mt\.recarregou'\)/, 'sem limpar, a segunda falha da sessão não recarrega');
});
