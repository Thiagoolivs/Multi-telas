/*
 * A página que o público abre pelo QR.
 *
 * É o único lugar do sistema aberto a quem não tem conta, e o que entra nela
 * vem de fora: título escolhido pelo cliente, nome da empresa. Por isso o teste
 * insiste em duas coisas — que nada disso escape como HTML, e que a página
 * fechada seja de fato uma página fechada, sem formulário que finge funcionar.
 */
const test = require('node:test');
const assert = require('node:assert');
const mural = require('../server/mural');

test('código é fácil de ditar: sem 0/O/1/I e sempre maiúsculo', () => {
  for (let i = 0; i < 300; i++) {
    const c = mural.novoCodigo(6);
    assert.equal(c.length, 6);
    assert.match(c, /^[A-HJ-NP-Z2-9]+$/, c + ' tem caractere ambíguo');
  }
});

test('códigos não se repetem na prática', () => {
  const vistos = new Set();
  for (let i = 0; i < 500; i++) vistos.add(mural.novoCodigo(6));
  assert.ok(vistos.size > 495, 'gerou repetido demais: ' + vistos.size);
});

test('título e empresa entram escapados', () => {
  const html = mural.pagina(
    { codigo: 'AB7K9Z', titulo: '<img src=x onerror=alert(1)>' },
    { empresa: '"><script>roubar()</script>' }
  );
  assert.ok(!html.includes('<img src=x'), 'título injetou HTML');
  assert.ok(!html.includes('<script>roubar'), 'nome da empresa injetou HTML');
  assert.ok(html.includes('&lt;img src=x'));
});

test('o código vai para o script como string JSON, não concatenado', () => {
  const html = mural.pagina({ codigo: 'AB7K9Z', titulo: 'Mural' }, {});
  assert.ok(html.includes('const CODIGO = "AB7K9Z"'));
  assert.ok(html.includes('/api/mural/'));
});

test('a página avisa sobre foto de terceiros e de criança', () => {
  const html = mural.pagina({ codigo: 'AB7K9Z', titulo: 'Mural' }, { empresa: 'Acme' });
  assert.match(html, /sem a autorização dela/i);
  assert.match(html, /criança/i);
  assert.match(html, /exibida publicamente/i);
});

test('não indexa: é a página de um evento, não conteúdo de busca', () => {
  assert.match(mural.pagina({ codigo: 'AB7K9Z', titulo: 'M' }, {}), /name="robots" content="noindex"/);
  assert.match(mural.paginaFechada('M', 'motivo'), /name="robots" content="noindex"/);
});

test('mural fechado não mostra formulário nenhum', () => {
  const html = mural.paginaFechada('Festa da Acme', 'Este mural está fechado no momento.');
  assert.ok(!html.includes('<input'), 'página fechada ainda tem campo');
  assert.ok(!html.includes('<button'), 'página fechada ainda tem botão');
  assert.ok(html.includes('Festa da Acme'));
});

test('página fechada escapa o que recebe', () => {
  const html = mural.paginaFechada('<b>x</b>', '<i>y</i>');
  assert.ok(!html.includes('<b>x</b>'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

test('o limite de tamanho é o mesmo no aviso e na checagem', () => {
  const html = mural.pagina({ codigo: 'AB7K9Z', titulo: 'M' }, {});
  assert.equal(mural.MAX_MB, 12);
  // O número aparece na conta de bytes e na mensagem de erro — se um mudar sem
  // o outro, o usuário lê um limite e esbarra em outro.
  assert.ok(html.includes(mural.MAX_MB + ' * 1024 * 1024'));
  assert.ok(html.includes('mais de ' + mural.MAX_MB + ' MB'));
});
