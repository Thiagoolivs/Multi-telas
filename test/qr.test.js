/*
 * Testes do gerador de QR.
 *
 * O desenho foi conferido fora daqui, decodificando as imagens com um leitor
 * independente (jsQR) nas dez versões suportadas — inclusive nas fronteiras de
 * 122/152/180/213 bytes, onde a estrutura de blocos muda. Este arquivo guarda
 * o resultado daquela conferência: os hashes abaixo são de matrizes que
 * comprovadamente leram certo. Se alguém mexer na aritmética e o hash mudar,
 * o QR parou de ser o mesmo — e um QR "quase certo" não abre.
 */
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const qr = require('../server/qr');

const hash = (m) => crypto.createHash('sha256').update(m.map((l) => l.join('')).join('')).digest('hex').slice(0, 16);

test('QR conhecido continua idêntico (lido por decodificador real)', () => {
  const a = qr.desenhar('https://multitelas.app/m/AB7K9Z');
  assert.equal(a.versao, 3);
  assert.equal(a.tamanho, 29);
  assert.equal(hash(a.modulos), '191c378a13da4316');

  const b = qr.desenhar('MULTITELAS');
  assert.equal(b.versao, 1);
  assert.equal(b.tamanho, 21);
  assert.equal(hash(b.modulos), '57700016481e07d0');
});

test('escolhe a menor versão que cabe', () => {
  const casos = [[10, 1], [20, 2], [40, 3], [60, 4], [100, 6], [130, 8], [170, 9], [213, 10]];
  for (const [n, esperado] of casos) {
    assert.equal(qr.desenhar('x'.repeat(n)).versao, esperado, n + ' bytes');
  }
});

test('texto grande demais falha em vez de gerar QR ilegível', () => {
  assert.equal(qr.MAX_BYTES, 213);
  assert.throws(() => qr.desenhar('x'.repeat(214)), /longo demais/);
});

test('os três alvos de canto estão no lugar', () => {
  const { modulos: m, tamanho: n } = qr.desenhar('https://exemplo.com/m/ABC123');
  for (const [l0, c0] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let dl = 0; dl < 7; dl++) {
      for (let dc = 0; dc < 7; dc++) {
        const anel = Math.max(Math.abs(dl - 3), Math.abs(dc - 3));
        assert.equal(m[l0 + dl][c0 + dc], anel === 2 ? 0 : 1, 'alvo em ' + l0 + ',' + c0);
      }
    }
  }
  // Régua de sincronismo: alterna preto/branco entre os alvos.
  for (let i = 8; i < n - 8; i++) {
    assert.equal(m[6][i], i % 2 === 0 ? 1 : 0);
    assert.equal(m[i][6], i % 2 === 0 ? 1 : 0);
  }
  assert.equal(m[n - 8][8], 1, 'módulo sempre escuro');
});

test('acentos entram como UTF-8 e mudam o desenho', () => {
  const a = qr.desenhar('coração');
  const b = qr.desenhar('coracao');
  assert.notEqual(hash(a.modulos), hash(b.modulos));
});

test('svg tem zona quieta e um caminho só', () => {
  const s = qr.svg('https://multitelas.app/m/AB7K9Z');
  // 29 módulos + 4 de margem de cada lado.
  assert.match(s, /viewBox="0 0 37 37"/);
  assert.equal((s.match(/<path/g) || []).length, 1);
  assert.match(s, /shape-rendering="crispEdges"/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(s.replace(/ d="[^"]*"/, '')), 'não depende de servidor externo');
});

test('svg aceita cores próprias', () => {
  const s = qr.svg('teste', { escuro: '#123456', claro: '#fedcba', margem: 2 });
  assert.match(s, /fill="#123456"/);
  assert.match(s, /fill="#fedcba"/);
  assert.match(s, /viewBox="0 0 25 25"/);
});
