/*
 * Cabeçalhos de segurança.
 *
 * O teste que importa aqui não é "o cabeçalho existe" — é que a política
 * continue permitindo o que o produto PRECISA. Uma CSP apertada demais não
 * dá erro: ela simplesmente apaga a peça na parede do cliente, em silêncio,
 * e só um humano olhando a tela descobre.
 */
const test = require('node:test');
const assert = require('node:assert');

const seg = require('../server/security.js');

const politica = () => {
  const partes = {};
  for (const p of seg.CSP.split(';')) {
    const t = p.trim().split(/\s+/);
    if (t[0]) partes[t[0]] = t.slice(1);
  }
  return partes;
};

test('script embutido fica proibido', () => {
  /*
   * É a regra central. Foi por causa dela que o bloco embutido em player.html
   * virou js/boot.js: enquanto existisse um único script embutido, a política
   * teria de liberar todos — e é por essa porta que passa a injeção.
   */
  const p = politica();
  assert.deepEqual(p['script-src'], ["'self'"]);
  assert.ok(!seg.CSP.includes("script-src 'self' 'unsafe-inline'"));
});

test('estilo embutido continua liberado, porque a peça depende dele', () => {
  // O editor e o player escrevem posição, cor e sombra direto no elemento.
  // Sem isto a composição não desenha. Estilo não executa código.
  assert.ok(politica()['style-src'].includes("'unsafe-inline'"));
});

test('a mídia do cliente pode vir de outro domínio', () => {
  // Ela vive no R2, e o endereço muda por conta: amarrar num host quebraria
  // toda conta que usasse outro bucket.
  const p = politica();
  assert.ok(p['img-src'].includes('https:'), 'imagem de fora bloqueada');
  assert.ok(p['media-src'].includes('https:'), 'vídeo e áudio de fora bloqueados');
  assert.ok(p['connect-src'].includes('https:'), 'upload e SSE para fora bloqueados');
  assert.ok(p['img-src'].includes('data:'), 'ícone em data: bloqueado');
  assert.ok(p['img-src'].includes('blob:'), 'prévia de upload bloqueada');
});

test('a TV pode embutir YouTube, Office e a página do cliente', () => {
  assert.ok(politica()['frame-src'].includes('https:'));
});

test('a tipografia vem de casa, e a política proíbe voltar para a Google', () => {
  /*
   * Ao contrário: este teste falha se alguém reabrir o host de fonte externo.
   *
   * A política fechada é o que faz um retorno acidental à Google aparecer no
   * navegador do desenvolvedor — em vez de aparecer meses depois, numa TV de
   * cliente cuja rede bloqueia o domínio, como texto estourando a peça.
   */
  const p = politica();
  assert.ok(!p['style-src'].includes('fonts.googleapis.com'), 'style-src reabriu a Google');
  assert.ok(!p['font-src'].includes('fonts.gstatic.com'), 'font-src reabriu a Google');
  assert.ok(p['font-src'].includes("'self'"), 'a fonte do próprio domínio precisa passar');
});

test('o service worker continua podendo ser registrado', () => {
  // Sem worker-src, a TV perde o modo offline — que é o que a mantém no ar
  // quando a rede da recepção cai.
  assert.ok(politica()['worker-src'].includes("'self'"));
});

test('o que não tem uso fica fechado', () => {
  const p = politica();
  assert.deepEqual(p['object-src'], ["'none'"]);
  assert.deepEqual(p['base-uri'], ["'self'"]);
  assert.deepEqual(p['form-action'], ["'self'"]);
  assert.deepEqual(p['frame-ancestors'], ["'self'"]);
});

/* ---------------- HSTS ---------------- */

test('o HSTS só entra sob https', () => {
  /*
   * É uma promessa de um ano, e difícil de desfazer: ligada num ambiente que
   * ainda atende http, tranca o próprio dono para fora.
   */
  assert.ok(!('Strict-Transport-Security' in seg.cabecalhosSeguranca(false)));
  assert.match(seg.cabecalhosSeguranca(true)['Strict-Transport-Security'], /max-age=31536000/);
});

test('os demais cabeçalhos valem sempre', () => {
  const h = seg.cabecalhosSeguranca(false);
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'SAMEORIGIN');
  assert.match(h['Referrer-Policy'], /strict-origin/);
});

test('a câmera fica de fora da lista de bloqueio', () => {
  // O mural recebe foto tirada na hora pelo celular de quem está no corredor.
  const h = seg.cabecalhosSeguranca(false);
  assert.ok(!/camera/.test(h['Permissions-Policy']), 'bloquear a câmera quebraria o mural');
  assert.match(h['Permissions-Policy'], /geolocation=\(\)/);
});

/* ---------------- Nenhum script embutido sobrou ---------------- */

test('nenhuma página tem script embutido', async () => {
  /*
   * Este é o teste que segura a regra ao longo do tempo. No dia em que alguém
   * puser um `<script>` embutido numa página, ele não vai rodar — e sem este
   * teste a descoberta seria na tela do cliente, não aqui.
   */
  const fs = require('node:fs');
  const path = require('node:path');
  const raiz = path.join(__dirname, '..');
  for (const arquivo of ['player.html', 'index.html', 'web/index.html']) {
    const html = fs.readFileSync(path.join(raiz, arquivo), 'utf8');
    const embutidos = html.match(/<script(?![^>]*\ssrc=)[^>]*>/gi) || [];
    assert.equal(embutidos.length, 0, arquivo + ' tem script embutido: ' + embutidos.join(', '));
    assert.ok(!/\son(click|change|input|load|error|submit)=/i.test(html), arquivo + ' tem manipulador embutido no HTML');
  }
});
