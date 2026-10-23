/*
 * Toda rota de IA passa pelo portão (nota do consultor no #282).
 *
 * O #281 ficou alguns minutos no ar com /api/ai/editar FORA do mapa TIPO_IA
 * do server.js — sem o teto de texto da conta, sem o teto global e sem
 * medição — até o #282. É o mapa que decide quem é medido: rota de IA que
 * não estiver nele passa despercebida. Este teste acha TODAS as rotas
 * /api/ai/* (server.js e server/routes/) e exige que cada uma esteja no mapa
 * ou numa lista de exceções, com o motivo. Rota nova fora do portão quebra o
 * npm test.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

// Fora do mapa, cada uma com o porquê — e o teste confere o porquê quando dá.
const EXCECOES = {
  job: 'só lê o andamento de um trabalho (GET), não chama a IA',
  jobs: 'só lista os trabalhos da conta (GET), não chama a IA',
  'generate-image': 'imagem cobra criação: reserva e cobra dentro da própria rota (usoIA.reservar)',
};

function rotasDeIA() {
  const arquivos = ['server.js'].concat(fs.readdirSync(path.join(RAIZ, 'server/routes')).filter((f) => f.endsWith('.js')).map((f) => 'server/routes/' + f));
  const nomes = new Map();
  for (const f of arquivos) {
    for (const m of ler(f).matchAll(/parts\[1\] === 'ai' && parts\[2\] === '([a-z0-9-]+)'/g)) nomes.set(m[1], f);
  }
  return nomes;
}

function chavesDoMapa() {
  const s = ler('server.js');
  const ini = s.indexOf('const TIPO_IA = {');
  const bloco = s.slice(ini, s.indexOf('\n  };', ini));
  // Sem os comentários: um nome citado num comentário não conta como entrada.
  const codigo = bloco.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  return new Set([...codigo.matchAll(/(?:^|[\s,{])'?([a-z][a-z0-9-]*)'?\s*:\s*'/g)].map((m) => m[1]));
}

test('toda rota /api/ai/* está no mapa TIPO_IA (o portão da medição) ou é exceção com motivo', () => {
  const rotas = rotasDeIA();
  const mapa = chavesDoMapa();
  assert.ok(rotas.size >= 20, 'o teste não achou as rotas (o padrão do código mudou?): ' + [...rotas.keys()].join(', '));
  assert.ok(mapa.has('editar') && mapa.has('conversa'), 'o teste não leu o mapa');
  const fora = [...rotas.keys()].filter((r) => !mapa.has(r) && !EXCECOES[r]);
  assert.deepEqual(fora, [], 'rota de IA fora do portão (sem teto e sem medição): ' + fora.map((r) => r + ' em ' + rotas.get(r)).join(', '));
  // Entrada morta no mapa (rota que não existe mais) também é erro: o mapa diz a verdade.
  const mortas = [...mapa].filter((k) => !rotas.has(k));
  assert.deepEqual(mortas, [], 'TIPO_IA com rota que não existe: ' + mortas.join(', '));
  // A exceção da imagem cobra por dentro; as de leitura não são POST de IA.
  // (Desde o D42b a rota confere o esboço antes de reservar: a janela é maior.)
  assert.match(ler('server.js'), /parts\[2\] === 'generate-image'[\s\S]{0,3200}usoIA\.reservar\(/);
  for (const k of Object.keys(EXCECOES)) assert.ok(!mapa.has(k), k + ' é exceção E está no mapa');
});
