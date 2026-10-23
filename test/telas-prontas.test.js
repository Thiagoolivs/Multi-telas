/*
 * Telas prontas, lote 1 (EXECUTOR D18).
 *
 * O dono pediu 80 telas prontas que se adaptam à empresa, em lotes de 20
 * aprovados por ele na bancada. Uma tela é uma combinação de peças-ouro já
 * aprovadas (layout + peças por zona + mensagens do rodapé), escrita para um
 * perfil (Comércio, Empresa, Saúde) e uma das doze estruturas. Entra como
 * 'proposta' e só vira 'aprovada' depois que o dono olha na bancada.
 *
 * As regras de montagem (papel da zona, QR numa zona só, texto que não se
 * repete, ≥3 mensagens) valem para toda tela e moram em peca-render.test.js.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pecas-ouro/manifesto.json'), 'utf8'));
const { PERFIS } = require('../js/perfil.js');
const lote1 = M.telas.filter((t) => t.lote === 1);

test('lote 1: vinte telas, os três perfis e as doze estruturas', () => {
  assert.equal(lote1.length, 20);
  for (const t of lote1) {
    assert.ok(PERFIS[t.perfil], t.id + ': perfil ' + t.perfil);
    assert.match(t.estrutura, /^E(\d|1[0-2]) /, t.id + ': estrutura');
    assert.ok(['proposta', 'aprovada'].includes(t.estado), t.id + ': estado ' + t.estado);
    assert.ok(t.sobre && t.nome, t.id + ': nome e sobre');
  }
  assert.deepEqual([...new Set(lote1.map((t) => t.perfil))].sort(), ['comercio', 'empresa', 'saude']);
  assert.equal(new Set(lote1.map((t) => t.estrutura.split(' ')[0])).size, 12);
  assert.equal(new Set(M.telas.map((t) => t.id)).size, M.telas.length, 'id repetido');
});

test('só peças aprovadas; o nome da marca vem da tela, não da peça de exemplo', () => {
  // Visto na bancada: a tela da Rota Sul com "ÓTICA CENTRAL" no cabeçalho.
  const aprovadas = new Set(M.pecas.filter((p) => p.estado === 'aprovada').map((p) => p.id));
  for (const t of lote1) {
    for (const z of Object.values(t.zonas)) {
      for (const p of z.pecas) {
        assert.ok(aprovadas.has(p.id), t.id + ': ' + p.id + ' não está aprovada');
        const temMarca = /data-campo="marca"/.test(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', p.id + '.html'), 'utf8'));
        if (temMarca) assert.ok(p.campos && p.campos.marca, t.id + ': ' + p.id + ' sem o nome da marca');
      }
    }
  }
});

test('foto de exemplo só onde ela faz sentido', () => {
  // As duas fotos de exemplo são da ótica e de um prato: uma clínica com óculos de sol não vai para a bancada.
  const FOTO_DA_MARCA = { otica: 'otica-sol', lanchonete: 'prato-do-dia', padaria: 'prato-do-dia', salao: 'otica-sol' };
  for (const t of lote1) {
    for (const z of Object.values(t.zonas)) {
      for (const p of z.pecas) {
        const def = M.pecas.find((d) => d.id === p.id);
        const foto = (p.campos && p.campos.foto) || (def.campos && def.campos.foto);
        if (!foto) continue;
        assert.ok(FOTO_DA_MARCA[t.marca] && foto.includes(FOTO_DA_MARCA[t.marca]), t.id + ': foto ' + foto + ' na marca ' + t.marca);
      }
    }
  }
});

test('a bancada confere a tela inteira e agrupa por lote e perfil', () => {
  const b = fs.readFileSync(path.join(RAIZ, 'js/bancada.js'), 'utf8');
  // Cada peça de cada zona, no tamanho real da zona — girando, só se via uma por vez.
  assert.match(b, /medir\.flatMap\(\(\{ caixa, grupo, papel, nome \}\) => grupo\.pecas\.map\(entradaDe\)/);
  assert.match(b, /host\.style\.width = caixa\.offsetWidth \+ 'px';/);
  assert.match(b, /lista\('Não coube:', achados\.filter\(Boolean\), 'problemas'\)/);
  assert.match(b, /'Lote ' \+ t\.lote \+ ' · ' \+ \(NOME_DO_PERFIL\[t\.perfil\] \|\| t\.perfil\)/);
});

test('o painel não mostra tela que o dono ainda não aprovou', () => {
  const s = fs.readFileSync(path.join(RAIZ, 'web/src/lib/modelosOuro.js'), 'utf8');
  assert.ok(!/\.telas\b/.test(s) || /estado === 'aprovada'/.test(s));
});
