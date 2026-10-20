/*
 * Toda tabela que o código consulta precisa ser criada pelo próprio backend.
 *
 * A de confirmação de e-mail (`verifications`) existia só no SQLite: os
 * testes rodam em SQLite e passavam, e em produção, no Postgres, o cadastro
 * por e-mail caía no INSERT e a faxina diária no DELETE — de 21/08 a 20/10.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

function semComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/--[^\n]*/g, '');
}

function tabelas(arquivo) {
  const s = semComentarios(fs.readFileSync(path.join(__dirname, '..', 'server', arquivo), 'utf8'));
  const criadas = new Set([...s.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]));
  const usadas = new Set([...s.matchAll(/\b(?:INSERT INTO|UPDATE|DELETE FROM|FROM|JOIN)\s+(\w+)/g)].map((m) => m[1]));
  for (const palavra of ['SET']) usadas.delete(palavra); // ON CONFLICT … DO UPDATE SET
  return { criadas, usadas };
}

for (const arquivo of ['db-postgres.js', 'db-sqlite.js']) {
  test(arquivo + ': toda tabela usada é criada no init', () => {
    const { criadas, usadas } = tabelas(arquivo);
    assert.ok(criadas.size > 10, 'não achou os CREATE TABLE');
    assert.deepStrictEqual([...usadas].filter((t) => !criadas.has(t)), []);
  });
}

test('a confirmação de e-mail existe nos dois bancos', () => {
  for (const arquivo of ['db-postgres.js', 'db-sqlite.js']) assert.ok(tabelas(arquivo).criadas.has('verifications'), arquivo);
});
