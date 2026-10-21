/*
 * A Equipe no celular (docs/EXECUTOR.md, item 17 — varredura a 360 px).
 *
 * A tabela de membros tinha três colunas e "Ações" ficava para fora do card:
 * o "Remover" só aparecia rolando a tabela de lado, e quem não sabe disso
 * não acha. Abaixo de `sm` o papel e a ação descem para baixo do nome e as
 * outras colunas somem; na tela larga a tabela continua igual.
 *
 * Conferido no navegador a 360 px e a 1280 px (ver o PR).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const p = fs.readFileSync(path.join(__dirname, '..', 'web/src/pages/TeamPage.jsx'), 'utf8');

test('no celular, papel e ação ficam embaixo do nome; as colunas só existem na tela larga', () => {
  assert.match(p, /const SO_LARGA = 'hidden sm:table-cell';/);
  for (const col of ['Papel', 'Ações', 'Código']) {
    assert.match(p, new RegExp('<TH className=\{SO_LARGA\}[^>]*>' + col + '</TH>'), 'a coluna ' + col + ' aparece no celular');
  }
  assert.match(p, /<div className="mt-2 flex flex-wrap items-center gap-2 sm:hidden">\{papel\(m\)\}\{acao\(m\)\}<\/div>/);
  assert.match(p, /<TD className=\{SO_LARGA\}>\{papel\(m\)\}<\/TD>/);
  assert.match(p, /<TD className=\{SO_LARGA\} align="right">\{acao\(m\)\}<\/TD>/);
  // O convite pendente também: revogar sem rolar de lado.
  assert.equal((p.match(/onClick=\{\(\) => revogar\(inv\)\}/g) || []).length, 2);
});

test('o texto quebra no celular em vez de empurrar a tabela', () => {
  // `cn` só junta classes: `whitespace-normal` perderia para o `whitespace-nowrap` do TD.
  // O variante `max-sm:` vem depois no CSS e ganha.
  assert.match(p, /<TD className="max-sm:whitespace-normal">/);
  assert.match(p, /className="break-all text-xs text-ink-3">\{m\.email\}/);
});
