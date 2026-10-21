/*
 * Rodada 3: o painel coerente com o Criar (docs/EXECUTOR.md, §2c).
 *
 * O dono, testando a rodada 2: "está tudo bom até eu clicar em Conteúdo".
 * A página da TV, as Mídias e Meus Designs ainda falavam a língua de antes
 * do Criar conversando. Cada teste aqui segura um item da rodada.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
// Só o que aparece: comentário não é botão.
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

test('item 28: um caminho de IA só — a TV leva ao Criar, sem o formulário antigo', () => {
  const tv = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.doesNotMatch(tv, />Campanha com IA</, 'o botão do formulário antigo voltou');
  assert.doesNotMatch(tv, /A IA monta tudo/);
  assert.doesNotMatch(tv, /setCampOpen\(true\)/, 'nenhum botão abre o formulário antigo');
  assert.match(tv, /onClick=\{onCriar\}>Criar para esta TV</);
  assert.match(tv, /onClick=\{\(\) => onCriar && onCriar\(\)\}/, 'a tela vazia começa pelo Criar');
  // Esconder antes de apagar: o diálogo fica no código, sem botão.
  assert.match(tv, /function CampaignDialog\(/);
  const md = semComentarios(ler('web/src/pages/MyDesignsPage.jsx'));
  assert.doesNotMatch(md, /title: 'Campanha completa com IA'/);
  // A campanha antiga que ainda estava gerando volta sozinha.
  assert.match(md, /ai\.jobPendente\(\)/);
});
