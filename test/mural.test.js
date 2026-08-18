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

test('o código chega ao script por atributo, e escapado', () => {
  /*
   * O script saiu de dentro do HTML: a CSP do servidor é `script-src 'self'`,
   * e inline ele simplesmente não executava — a página abria bonita e o botão
   * de enviar não fazia nada. Ninguém descobre isso num teste local; descobre
   * na confraternização, com trinta pessoas tentando mandar foto.
   *
   * Com o código num `data-`, o arquivo é o mesmo para todos os murais. O que
   * este teste guarda é que ele continua chegando lá, e escapado.
   */
  const html = mural.pagina({ codigo: 'AB7K9Z', titulo: 'Mural' }, {});
  assert.ok(html.includes('data-codigo="AB7K9Z"'), 'o código não chegou ao atributo');
  assert.ok(html.includes('src="/js/mural.js"'), 'a página não carrega o script externo');
  assert.ok(!/<script>/.test(html), 'voltou a ter script inline — a CSP bloqueia');
});

test('o seletor de foto aceita a galeria, e não só a câmera', () => {
  /*
   * O atributo `capture` forçava a câmera traseira e sumia com a galeria no
   * celular — enquanto o próprio botão promete "tirar OU escolher". Numa
   * confraternização a foto boa foi tirada vinte minutos antes e está salva.
   */
  const html = mural.pagina({ codigo: 'AB7K9Z', titulo: 'Mural' }, {});
  assert.ok(!/capture=/.test(html), 'o seletor voltou a forçar a câmera');
  assert.ok(html.includes('accept="image/*"'), 'perdeu o filtro de imagem');
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

test('o limite de tamanho chega ao script pelo mesmo lugar que o servidor usa', () => {
  /*
   * O limite era escrito duas vezes: uma na conta de bytes do script e outra
   * na mensagem de erro. Agora o script vive num arquivo e recebe o número por
   * atributo — a fonte passa a ser uma só, que é o que este teste guarda.
   */
  const html = mural.pagina({ codigo: 'AB7K9Z', titulo: 'M' }, {});
  assert.equal(mural.MAX_MB, 12);
  assert.ok(html.includes('data-max-mb="' + mural.MAX_MB + '"'),
    'o script não recebe o limite que o servidor aplica');
});
