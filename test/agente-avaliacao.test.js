/*
 * A avaliação do agente (tools/eval-agente.mjs) roda no CI, sem custo, nos
 * dois modos que não chamam IA de verdade: o cérebro por regra e o caminho
 * inteiro da IA com o modelo simulado (tools/modelo-simulado.js). Os ~50
 * casos — frentes, várias coisas numa fala, ambíguos, ajustes, variedade e
 * uso errado — têm de passar todos.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
function rodar(modo) {
  const env = { ...process.env, AI_PROVIDER: 'dev' };
  delete env.GEMINI_API_KEY; delete env.GOOGLE_API_KEY; delete env.ANTHROPIC_API_KEY; delete env.GROQ_API_KEY;
  const saida = execFileSync(process.execPath, [path.join(RAIZ, 'tools', 'eval-agente.mjs'), '--json'].concat(modo ? [modo] : []), { cwd: RAIZ, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 });
  return JSON.parse(saida.slice(saida.indexOf('{')));
}

for (const [nome, modo] of [['sem IA', ''], ['IA simulada', '--simulado']]) {
  test('avaliação do agente (' + nome + '): todos os casos passam, sem gastar', () => {
    const r = rodar(modo);
    assert.ok(r.casos >= 40, 'a avaliação tem menos de 40 casos: ' + r.casos);
    const falhas = r.resultados.filter((x) => !x.passou).map((x) => x.id + ': ' + x.falhas.join('; '));
    assert.deepEqual(falhas, []);
    assert.equal(r.gastoCentavos, 0);
    for (const g of ['empresa', 'varias', 'ambiguo', 'ajuste', 'variedade', 'comercio', 'saude', 'mau-uso']) assert.ok(r.porGrupo[g], 'sem casos de ' + g);
  });
}
