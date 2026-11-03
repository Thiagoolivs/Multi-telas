/*
 * Cookies e Google tag (QA de lançamento, 03/11, item G1 de
 * docs/qa/13-20-landing-juridico.md).
 *
 * O que estava errado: o consentimento do GA4/Ads começava CONCEDIDO antes de
 * qualquer clique, o painel carregava a tag sem aviso nenhum, o aviso não
 * dizia "Google" nem tinha link para a política, e a política dizia que não
 * havia cookie de análise. O que estes testes seguram:
 *   - ga-init.js começa RECUSADO, e só começa aceito para quem já aceitou;
 *   - o aviso diz o que é, leva à política, e "Aceitar"/"Recusar" atualizam o
 *     consentimento;
 *   - a tag fica só na landing (o painel e a TV não carregam).
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ler = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

// Roda landing/ga-init.js num "navegador" mínimo e devolve o que foi para o dataLayer.
function rodarGaInit(escolha) {
  const window = { localStorage: { getItem: (k) => (k === 'mt_cookies' ? escolha : null) } };
  const document = { currentScript: { getAttribute: (k) => (k === 'data-id' ? 'G-TESTE123' : null) } };
  vm.runInNewContext(ler('landing', 'ga-init.js'), { window, document, Date });
  return window.dataLayer.map((args) => Array.from(args));
}

test('o consentimento começa RECUSADO até a pessoa aceitar', () => {
  for (const escolha of [null, 'recusado', 'qualquer coisa']) {
    const consent = rodarGaInit(escolha).find((a) => a[0] === 'consent' && a[1] === 'default');
    assert.ok(consent, 'sem consent default');
    for (const k of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) {
      assert.equal(consent[2][k], 'denied', k + ' começou ' + consent[2][k] + ' com a escolha ' + escolha);
    }
  }
  // Quem já clicou "Aceitar" numa visita anterior começa aceito — menos o remarketing.
  const aceito = rodarGaInit('aceito').find((a) => a[0] === 'consent' && a[1] === 'default')[2];
  assert.equal(aceito.analytics_storage, 'granted');
  assert.equal(aceito.ad_storage, 'granted');
  assert.equal(aceito.ad_personalization, 'denied');
});

test('o aviso fala do Google, leva à política e os dois botões atualizam o consentimento', () => {
  const a = ler('landing', 'analytics.js');
  assert.match(a, /Google Analytics e do Google Ads/);
  assert.match(a, /saiba\.href = '\/privacidade#cookies'/);
  assert.match(a, /botao\('Recusar', false\)/);
  assert.match(a, /botao\('Aceitar', true\)/);
  assert.match(a, /window\.gtag\('consent', 'update', \{ analytics_storage: 'granted', ad_storage: 'granted', ad_user_data: 'granted' \}\);\s*guardar\('aceito'\);/);
  assert.match(a, /window\.gtag\('consent', 'update', \{ analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied' \}\);\s*guardar\('recusado'\);/);
  // O link "Cookies" do rodapé reabre a escolha (e só aparece com a medição ligada).
  assert.match(a, /closest\('\[data-cookies\]'\)/);
  assert.match(ler('landing', 'index.html'), /<a href="\/privacidade#cookies" data-cookies hidden/);
  // A política tem a âncora que o aviso e o rodapé usam.
  assert.match(require('../server/legal.js').privacidadeHtml({}), /<h2 id="cookies">/);
});

test('a Google tag fica só na landing: o painel não carrega (não tinha aviso)', () => {
  const s = ler('server.js');
  const painel = s.slice(s.indexOf('function serveAppIndex'), s.indexOf('/* ---------------- Arquivos estáticos'));
  assert.ok(painel.length > 50, 'não achei serveAppIndex');
  assert.doesNotMatch(painel.replace(/\/\*[\s\S]*?\*\//g, ''), /comGoogleTag/, 'o painel voltou a carregar a Google tag');
  // A landing continua com a tag e o aviso, e a TV nunca.
  assert.match(s, /comGoogleTag\(req, res, pagina, '<script src="\/analytics\.js" defer><\/script>\\n'\)/);
  assert.match(s, /hostDoPedido\(req\)\.startsWith\('tv\.'\)/);
});
