/*
 * parceiros/visitor/ferramentas/gerar-imagens.mjs — refaz as imagens de
 * parceiros/visitor/img/ a partir das peças-ouro (pecas-ouro/), com o mesmo
 * desenhista da TV (js/peca-render.js), do jeito de tools/gravar-peca.mjs.
 *
 *   1. Suba o servidor numa porta livre, com um banco de teste:
 *        PORT=6095 SKIP_VERIFY=1 AI_PROVIDER=dev DATA_DIR=/tmp/mt MEDIA_DIR=/tmp/mt \
 *        STORAGE=local DATABASE_URL= NODE_ENV=test node server.js
 *   2. Na raiz do repositório:
 *        node parceiros/visitor/ferramentas/gerar-imagens.mjs [--base http://127.0.0.1:6095] [--so comunicado,epi]
 *
 * Precisa do Playwright com o Chromium (local ou global) e do ImageMagick
 * (`convert`, com WebP) no PATH. Não é para subir no site: é só a receita.
 */
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function playwright() {
  try { return createRequire(import.meta.url)('playwright'); } catch (e) { /* tenta o global */ }
  const global = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' }).stdout.trim();
  return createRequire(path.join(global, 'noop.js'))('playwright');
}
const { chromium } = playwright();

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMG = path.join(PASTA, 'img');
const arg = (nome) => { const i = process.argv.indexOf('--' + nome); return i > 0 ? process.argv[i + 1] : ''; };
const BASE = (arg('base') || 'http://127.0.0.1:6095').replace(/\/$/, '');
const SO = arg('so').split(',').filter(Boolean);
const quer = (nome) => !SO.length || SO.includes(nome);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'visitor-img-'));

/* ---------------- O que desenhar ---------------- */

// Peças (1920×1080, papel destaque). `campos` sobrepõe os textos da frente Empresa do manifesto.
const PECAS = [
  { nome: 'comunicado', peca: 'gente-comunicado', modo: 'escuro', campos: {
    rotulo: 'Comunicado', de: 'De: Recursos Humanos', para: 'Para: toda a equipe',
    assunto: 'Vacinação contra a gripe na sexta, aqui na empresa',
    texto: 'A equipe de saúde atende no refeitório das 9h às 16h. Traga um documento com foto e a carteira de vacinação, se tiver.',
    assinatura: 'Equipe de RH', data: 'publicado nesta semana' } },
  { nome: 'aniversariantes', peca: 'gente-mes', modo: 'escuro' },
  { nome: 'boas-vindas', peca: 'gente-boas-vindas', modo: 'claro' },
  { nome: 'epi', peca: 'servico-epi', modo: 'escuro' },
  { nome: 'agenda', peca: 'servico-semana', modo: 'escuro' },
  { nome: 'indicadores', peca: 'indicador-turno', modo: 'escuro' },
  { nome: 'cardapio', peca: 'cardapio-semana', marca: 'rotasul', modo: 'claro' },
  { nome: 'ramais', peca: 'servico-ramais', modo: 'escuro' },
  { nome: 'campanha', peca: 'social-campanha', marca: 'escritorio', modo: 'escuro' },
];
// Telas completas do manifesto (layout com cabeçalho, lateral e faixa de avisos), como a bancada monta.
const TELAS = [
  { nome: 'tela-mural', tela: 'l1-empresa-mural' },
  { nome: 'tela-industria', tela: 'l3-industria-deitada' },
  { nome: 'tela-escritorio', tela: 'l3-escritorio-deitada' },
];

const PALCO = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<link rel="stylesheet" href="/fonts/fontes.css">'
  + '<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#tv{position:fixed;left:0;top:0;width:100vw;height:100vh}</style>'
  + '</head><body><div id="tv"></div>'
  + ['cor', 'fontes', 'animacao', 'templates', 'tokens', 'peca-html', 'peca-render'].map((s) => '<script src="/js/' + s + '.js"></script>').join('')
  + '</body></html>';

// Roda na página: monta a peça com a marca do manifesto e os textos da frente Empresa.
async function montarNaPagina(o) {
  const manifesto = await (await fetch('/pecas-ouro/manifesto.json', { cache: 'no-store' })).json();
  const lerBanco = (url) => fetch(url).then((r) => (r.ok ? r.json() : [])).then((b) => (Array.isArray(b) ? b : [])).catch(() => []);
  const banco = (await lerBanco('/pecas-ouro/fotos/banco.json')).concat(await lerBanco('/pecas-ouro/videos/banco.json'));
  document.documentElement.style.setProperty('--mt-piso-tv', '0.03'); // local "escritório"
  const def = manifesto.pecas.find((p) => p.id === o.peca);
  if (!def) throw new Error('peça não está no manifesto: ' + o.peca);
  const marca = manifesto.marcas.find((m) => m.id === (o.marca || def.marca)) || manifesto.marcas[0];
  const arq = MTPecaHtml.doArquivo(await (await fetch('/pecas-ouro/' + def.id + '.html', { cache: 'no-store' })).text());
  const espacos = {};
  Object.keys(def.fotos || {}).forEach((n) => {
    const b = banco.find((x) => x.arquivo === (def.campos || {})[n]);
    espacos[n] = b && b.foco ? { papel: def.fotos[n], foco: b.foco } : { papel: def.fotos[n] };
  });
  const campos = Object.assign({}, def.campos || {}, (def.textos && def.textos.empresa) || {}, o.campos || {});
  if (/data-campo="marca"/.test(arq.html) && !(o.campos || {}).marca) campos.marca = marca.nome;
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
  document.getElementById('tv').appendChild(host);
  MTPecaRender.montar(host, { type: 'peca-html', papel: 'destaque', html: arq.html, css: arq.css, campos, espacos, modo: o.modo,
    marca: { cores: marca.cores, fonteTitulo: marca.fonteTitulo, fonteApoio: marca.fonteApoio } },
  { leve: false, clima: () => Promise.resolve('27°'), mensagens: [] });
  await document.fonts.ready;
}

const SO_A_TV = 'header,#info,#problemas{display:none!important}main{padding:0!important}'
  + '#palco .moldura{position:fixed!important;left:0;top:0;border-radius:0!important}html,body{overflow:hidden!important}';

function webp(png, nome, largura) {
  const r = spawnSync('convert', [png, '-resize', largura + 'x', '-quality', largura > 1200 ? '82' : '80', '-define', 'webp:method=6', path.join(IMG, nome + '.webp')], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('o convert falhou em ' + nome);
}

/* ---------------- A imagem de compartilhamento (og.jpg) ---------------- */

const OG = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@font-face{font-family:Outfit;font-weight:500;src:url(fonts/outfit-500-normal-latin.woff2) format('woff2')}
@font-face{font-family:Outfit;font-weight:700;src:url(fonts/outfit-700-normal-latin.woff2) format('woff2')}
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
body{font-family:Outfit,sans-serif;background:#0E0B1F;color:#fff;position:relative}
body::before{content:'';position:absolute;inset:0;background:radial-gradient(55% 75% at 100% 0%,rgba(91,46,255,.45),transparent 70%),radial-gradient(40% 60% at 0% 100%,rgba(91,46,255,.22),transparent 70%)}
.c{position:relative;display:grid;grid-template-columns:470px 1fr;gap:40px;align-items:center;height:100%;padding:0 56px 0 64px;box-sizing:border-box}
.marca{display:flex;align-items:center;gap:14px}.marca b{display:block;font-size:30px;letter-spacing:-.01em}
.marca span{display:block;font-size:18px;color:rgba(255,255,255,.72);font-weight:500}
h1{margin:44px 0 0;font-size:50px;line-height:1.06;letter-spacing:-.03em;font-weight:700}h1 em{font-style:normal;color:#C6F432}
p{margin:26px 0 0;font-size:21px;color:rgba(255,255,255,.75);font-weight:500}
.tv{background:#08070D;border-radius:14px;padding:10px;box-shadow:0 0 0 1px #2a2740,0 40px 80px -20px rgba(0,0,0,.8)}.tv img{display:block;width:100%;border-radius:3px}
</style></head><body><div class="c"><div>
<div class="marca"><svg width="58" height="58" viewBox="0 0 100 100"><rect width="100" height="100" rx="23" fill="#fff" fill-opacity=".08"/><g transform="translate(21.5 21.5) scale(0.4191)"><rect width="88" height="88" rx="12" fill="#fff"/><rect x="96" width="40" height="88" rx="12" fill="#C6F432"/><rect y="96" width="136" height="40" rx="12" fill="#86858F"/></g></svg><div><b>MultiTelas RH</b><span>oferecido por Visitor</span></div></div>
<h1>O recado do RH na tela que <em>toda a equipe vê.</em></h1><p>Comunicação interna nas TVs da empresa, de um painel na web.</p>
</div><div class="tv"><img src="img/tela-mural.webp"></div></div></body></html>`;

/* ---------------- Rodar ---------------- */

const nav = await chromium.launch();
try {
  // Um contexto por vez (a máquina de teste é pequena). Relógio de expediente: terça, 9h41, em São Paulo.
  const ctx = await nav.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, timezoneId: 'America/Sao_Paulo', locale: 'pt-BR' });
  await ctx.addInitScript(() => {
    const delta = Date.parse('2026-11-10T09:41:00-03:00') - Date.now();
    const D0 = Date;
    class D extends D0 { constructor(...a) { if (a.length === 0) super(D0.now() + delta); else super(...a); } static now() { return D0.now() + delta; } }
    window.Date = D;
  });
  const p = await ctx.newPage();
  await p.route(BASE + '/__palco.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PALCO }));
  for (const o of PECAS) {
    if (!quer(o.nome)) continue;
    await p.goto(BASE + '/__palco.html');
    await p.evaluate(montarNaPagina, o);
    await p.waitForTimeout(4200); // a entrada inteira
    const png = path.join(TMP, o.nome + '.png');
    await p.screenshot({ path: png });
    webp(png, o.nome, 1200);
    console.log('peça', o.nome);
  }
  for (const t of TELAS) {
    if (!quer(t.nome)) continue;
    await p.goto(BASE + '/bancada.html?ver=tela&tela=' + encodeURIComponent(t.tela) + '&tamanho=real&local=escritorio');
    await p.addStyleTag({ content: SO_A_TV });
    await p.waitForFunction(() => document.body.dataset.conferida === 'sim', null, { timeout: 60000 }).catch(() => {});
    await p.evaluate(() => document.fonts.ready);
    await p.click('#rodar', { force: true }).catch(() => p.evaluate(() => document.getElementById('rodar').click()));
    await p.waitForTimeout(4500);
    const png = path.join(TMP, t.nome + '.png');
    await p.screenshot({ path: png });
    webp(png, t.nome, 1600);
    console.log('tela', t.nome);
  }
  if (quer('pareamento')) {
    // A tela de pareamento da TV, aberta "como se" estivesse no endereço de verdade: o QR leva ao app, não ao localhost.
    const REAL = 'https://app.multitelas.net.br';
    await p.route(REAL + '/**', async (r) => {
      if (r.request().resourceType() === 'eventsource') return r.abort();
      try { await r.fulfill({ response: await r.fetch({ url: r.request().url().replace(REAL, BASE), timeout: 8000 }) }); } catch (e) { await r.abort().catch(() => {}); }
    });
    await p.goto(REAL + '/player.html?cloud=1');
    await p.waitForTimeout(6000);
    const png = path.join(TMP, 'pareamento.png');
    await p.screenshot({ path: png });
    webp(png, 'pareamento', 1200);
    console.log('tela de pareamento');
  }
  await ctx.close();

  if (quer('og')) {
    const og = await nav.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
    await og.route('https://og.teste/**', (r) => {
      const rel = new URL(r.request().url()).pathname.slice(1);
      if (rel === 'og.html') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: OG });
      const arq = path.join(PASTA, rel);
      if (!arq.startsWith(PASTA) || !fs.existsSync(arq)) return r.abort();
      return r.fulfill({ body: fs.readFileSync(arq), contentType: rel.endsWith('.woff2') ? 'font/woff2' : 'image/webp' });
    });
    const q = await og.newPage();
    await q.goto('https://og.teste/og.html');
    await q.evaluate(() => document.fonts.ready);
    await q.waitForTimeout(300);
    await q.screenshot({ path: path.join(IMG, 'og.jpg'), type: 'jpeg', quality: 86 });
    await og.close();
    console.log('og.jpg');
  }
} finally {
  await nav.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}
