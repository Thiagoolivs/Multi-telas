/*
 * A landing (docs/EXECUTOR.md, item 14; PLANO §7.3 e §6.7).
 *
 * Três regras que ela tem que segurar ao longo do tempo:
 *   1. menos de 500 KB e nada de terceiros (cada domínio a mais é DNS e TLS
 *      antes da primeira letra; a versão anterior carregava 1,3 MB de
 *      bibliotecas);
 *   2. os números são os do plano (server/plans.js) — o HTML já traz os de
 *      hoje para quem abre sem JavaScript, e um preço novo tem que derrubar
 *      este teste até a página acompanhar;
 *   3. nenhuma promessa sem código por trás: cada recurso citado aponta para
 *      onde ele mora.
 *
 * Medido no navegador (celular, 4G de 4 Mbps com 170 ms, CPU 4× mais lenta):
 * 189 KB transferidos, a maior pintura em ~1,2 s.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const plans = require('../server/plans.js');

const RAIZ = path.join(__dirname, '..');
const LAND = path.join(RAIZ, 'landing');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const html = ler('landing', 'index.html');
const js = ler('landing', 'landing.js');

test('menos de 500 KB, contando tudo o que a página pede', () => {
  const pedidos = new Set();
  const re = /(?:src|href|data-src)="([^"#][^"]*)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    if (/^(https?:|mailto:|\/app|\/termos|\/privacidade|#)/.test(u) || u === '/') continue;
    pedidos.add(u);
  }
  // As imagens que as abas trocam (landing.js) também contam.
  for (const ramo of ['otica', 'padaria', 'salao', 'clinica', 'lanchonete', 'empresa']) pedidos.add('vendor/galeria/' + ramo + '.webp');
  let total = Buffer.byteLength(html) + Buffer.byteLength(js);
  for (const u of pedidos) {
    const arq = u.startsWith('/icons/') ? path.join(RAIZ, u) : path.join(LAND, u.replace(/^\//, ''));
    assert.ok(fs.existsSync(arq), 'a página pede ' + u + ', que não existe');
    total += fs.statSync(arq).size;
  }
  // As fontes da folha de fontes.
  const fontes = ler('landing', 'vendor', 'fontes', 'fontes.css').match(/url\('\.\/([^']+)'\)/g).map((x) => x.slice(7, -2));
  for (const f of fontes) total += fs.statSync(path.join(LAND, 'vendor', 'fontes', f)).size;
  assert.ok(total < 500 * 1024, 'a landing pesa ' + Math.round(total / 1024) + ' KB');
});

test('nada de terceiros, nada de biblioteca pesada, nada de script embutido', () => {
  assert.doesNotMatch(html, /<(script|link)[^>]+(src|href)="https?:\/\//, 'a página pede arquivo de outro domínio');
  for (const velho of ['three.min.js', 'gsap', 'ScrollTrigger', 'fa/all.min.css', 'fa-solid']) {
    assert.ok(!html.includes(velho), 'voltou ' + velho);
    assert.ok(!fs.existsSync(path.join(LAND, 'vendor', velho)) || velho === 'gsap', velho + ' voltou para a pasta');
  }
  assert.ok(!fs.existsSync(path.join(LAND, 'vendor', 'three.min.js')));
  assert.equal((html.match(/<script(?![^>]*\ssrc=)[^>]*>/gi) || []).length, 0);
  // Sem JavaScript a página aparece inteira: só esconde para animar quando o script está de pé.
  assert.match(html, /\.js \.surge \{ opacity: 0;/);
  assert.match(js, /document\.documentElement\.classList\.add\('js'\)/);
});

test('os números do HTML são os do plano, e o script confirma com /api/planos', () => {
  const real = (c) => 'R$ ' + (c / 100).toLocaleString('pt-BR');
  assert.ok(html.includes(real(plans.PLANS.pro.precoTelaCents)), 'o mensal do HTML não é o do plano');
  for (const f of plans.faixasAnual().filter((x) => !x.negociado)) {
    assert.ok(html.includes(real(f.precoTelaCents)), 'faixa do anual fora do HTML: ' + real(f.precoTelaCents));
  }
  assert.ok(html.includes('>' + plans.DIAS_DE_TESTE + '<'), 'os dias de teste');
  assert.ok(html.includes('>' + plans.CRIACOES_DO_TESTE + '<'), 'as criações do teste');
  assert.ok(html.includes('>' + plans.franquiaCreditos('pro', 3) + '<'), 'as criações do plano');
  assert.ok(html.includes('>' + plans.franquiaCreditos('pro', 1000) + '<'), 'o teto de criações');
  assert.match(js, /fetch\('\/api\/planos'/);
  assert.match(js, /dados\.faixasAnual/);
  assert.match(js, /linha\[c\]/, 'o simulador usa a tabela pronta do servidor (mensal e anual)');
});

test('nenhuma promessa sem código por trás', () => {
  const existe = (...p) => fs.existsSync(path.join(RAIZ, ...p));
  const PROMESSAS = [
    ['Funciona sem internet', () => /SHELL_CACHE/.test(ler('sw.js'))],
    ['Horário da loja', () => existe('js', 'expediente.js')],
    ['Ver a tela agora', () => existe('server', 'ver-tela.js')],
    ['Foto e vídeo do celular', () => /share_target/.test(ler('web', 'public', 'manifest.webmanifest'))],
    ['A mesma peça nas redes', () => existe('server', 'redes.js')],
    ['TV deitada ou em pé', () => /mt-moldura/.test(ler('css', 'player.css'))],
    ['Mural de fotos por QR', () => existe('server', 'mural.js') && /ocultarFoto/.test(ler('web', 'src', 'pages', 'MuralPage.jsx'))],
    ['Aniversariantes', () => existe('web', 'src', 'pages', 'BirthdaysPage.jsx')],
    ['Relatório de exibição', () => existe('server', 'routes', 'relatorio.js')],
    ['Nunca desligamos sua tela por causa de fatura', () => plans.textoDoSelo({ plan: 'pro', plan_status: 'past_due', atraso_desde: Date.now() - 400 * 864e5 }) === 'MultiTelas'],
    ['Cancela quando quiser, pelo próprio painel', () => /Cancelar assinatura/.test(ler('web', 'src', 'pages', 'BillingPage.jsx'))],
    ['você baixa tudo ou pede a exclusão', () => /parts\[2\] === 'exportar'/.test(ler('server.js'))],
  ];
  for (const [frase, prova] of PROMESSAS) {
    assert.ok(html.includes(frase), 'a frase sumiu da página (ou mudou): ' + frase);
    assert.ok(prova(), 'a página promete "' + frase + '" e o código não tem');
  }
  // O que não existe não aparece.
  // Palavra inteira: 'SLA' mora dentro de 'translateY' no CSS.
  for (const nao of [/instalamos tudo/i, /\bSLA\b/, /marca branca/i, /domínio próprio/i]) {
    assert.ok(!nao.test(html), 'promessa sem código: ' + nao);
  }
});

test('o que falta está marcado: foto real de TV e o número de WhatsApp', () => {
  assert.match(html, /data-falta="foto-real-tv-instalada"/);
  assert.match(html, /data-falta="whatsapp-se-sem-variavel"/);
  // Sem número, nada de link quebrado: o WhatsApp só aparece quando o servidor manda.
  assert.match(js, /if \(c\.whatsapp\) \{/);
  assert.match(html, /id="whats-flutuante"[^>]*class="[^"]*\bhidden\b/);
});
