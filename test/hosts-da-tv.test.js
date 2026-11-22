/*
 * Os endereços de fora que a TV chama — e a folha que vai para a TI do cliente.
 *
 * O lançamento de dezembro (8 TVs numa empresa com rede interna) manda à TI
 * do cliente uma lista exata do que liberar (docs/implantacao/PARA-A-TI.md).
 * Uma lista dessas só presta enquanto for verdade: o dia em que o player
 * passar a chamar um host novo, a TV da empresa que só libera a lista para de
 * mostrar aquilo, e ninguém liga uma coisa à outra. Este teste lê os scripts
 * que o player carrega e o service worker, e falha quando aparece (ou some)
 * um host — e quando a folha da TI não fala dele.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (p) => fs.readFileSync(path.join(RAIZ, p), 'utf8');

// Os hosts que o código da TV nomeia hoje, e para quê (o porquê de cada um está na folha da TI).
const ESPERADOS = {
  'geocoding-api.open-meteo.com': 'clima (cabeçalho, painel do clima, mapa e trânsito acham a cidade)',
  'api.open-meteo.com': 'clima',
  'www.youtube.com': 'vídeo do YouTube',
  'view.officeapps.live.com': 'apresentação PPTX',
  'embed.waze.com': 'trânsito',
  'www.openstreetmap.org': 'mapa',
  // Barrado pela nossa CSP (script-src 'self'): a TV nunca chega a pedir. Fica listado para a TI não liberar à toa.
  'cdn.jsdelivr.net': 'hls.js do stream (barrado pela CSP)',
  // As notícias do rodapé (js/news.js): o feed direto e os dois conversores de reserva.
  'g1.globo.com': 'notícias', 'rss.uol.com.br': 'notícias', 'feeds.folha.uol.com.br': 'notícias',
  'www.cnnbrasil.com.br': 'notícias', 'feeds.bbci.co.uk': 'notícias', 'agenciabrasil.ebc.com.br': 'notícias',
  'exame.com': 'notícias', 'api.allorigins.win': 'notícias (reserva)', 'api.rss2json.com': 'notícias (reserva)',
};
// Aparecem no texto e não são chamados: o espaço de nomes do SVG e o link de um aviso do GSAP.
const SO_TEXTO = new Set(['www.w3.org', 'gsap.com']);

function scriptsDoPlayer() {
  const html = ler('player.html');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1].replace(/^\//, ''));
}

function hostsEm(texto) {
  return [...texto.matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)].map((m) => m[1].toLowerCase());
}

test('a TV só nomeia os hosts de fora que a folha da TI conhece', () => {
  const achados = new Map();
  for (const arq of [...scriptsDoPlayer(), 'sw.js']) {
    for (const h of hostsEm(ler(arq))) {
      if (SO_TEXTO.has(h)) continue;
      if (!achados.has(h)) achados.set(h, arq);
    }
  }
  const novos = [...achados.keys()].filter((h) => !(h in ESPERADOS));
  assert.deepEqual(novos, [], 'host novo no player (' + novos.map((h) => h + ' em ' + achados.get(h)).join(', ')
    + '): diga para quê em docs/implantacao/PARA-A-TI.md e acrescente aqui');
  const sumiram = Object.keys(ESPERADOS).filter((h) => !achados.has(h));
  assert.deepEqual(sumiram, [], 'host que o player não chama mais: tire da folha da TI e daqui');
});

test('a folha da TI fala de cada host de fora, do nosso e do que NÃO precisa ser liberado', () => {
  const folha = ler('docs/implantacao/PARA-A-TI.md');
  for (const h of Object.keys(ESPERADOS)) assert.ok(folha.includes(h), 'PARA-A-TI.md não fala de ' + h);
  assert.ok(folha.includes('tv.multitelas.net.br'), 'o host da TV');
  assert.ok(folha.includes('app.multitelas.net.br'), 'o host do painel');
  // O QR das redes saiu do serviço de fora (js/render.js, renderSocial): a folha não pede para liberá-lo.
  assert.ok(!folha.includes('api.qrserver.com'), 'o QR é nosso: a folha não manda liberar o serviço antigo');
});

test('o QR das redes sociais é desenhado pelo nosso servidor, como os outros QR da TV', () => {
  const render = ler('js/render.js');
  assert.ok(!/qrserver/i.test(render), 'nenhum QR da TV depende de serviço de fora');
  const social = render.slice(render.indexOf('function renderSocial'), render.indexOf('function renderPoster'));
  assert.match(social, /qr\.src = urlQr\(item\.url \|\| item\.handle\)/);
});

test('a CSP que a folha descreve é a que o servidor manda', () => {
  // A folha explica por que uma página http da intranet não abre na TV: frame-src sem http:.
  const { CSP } = require('../server/security.js');
  const frame = CSP.split('; ').find((d) => d.startsWith('frame-src'));
  assert.equal(frame, "frame-src 'self' https:");
  assert.ok(ler('docs/implantacao/PARA-A-TI.md').includes("frame-src 'self' https:"));
});
