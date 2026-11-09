/*
 * tools/gravar-peca.mjs — grava uma peça-ouro se mexendo, para o dono VER.
 *
 *   node tools/gravar-peca.mjs --peca capa-produto --marca padaria --formato 16x9 --local balcao
 *   node tools/gravar-peca.mjs --peca capa-produto,numero-preco --saida /tmp/videos
 *   node tools/gravar-peca.mjs --peca capa-produto,numero-preco --quadros --cpu 4
 *
 * A foto parada da bancada não mostra o que separa uma peça de propaganda de
 * um slide: o movimento. Este robô abre o desenhista da bancada (os mesmos
 * scripts dela, js/peca-render.js, numa página só com a peça no tamanho da
 * TV), toca a entrada uma vez e mais uns segundos de peça no ar, e salva um
 * MP4 (H.264, que abre em qualquer celular) na pasta pedida.
 *
 * Com --quadros, em vez de gravar, MEDE: liga o freio de CPU do Chrome
 * (DevTools Protocol, 4× por padrão, a CPU de um box de TV), toca as peças e
 * conta o intervalo entre quadros (requestAnimationFrame). Sai o p95, o pior
 * quadro, os quadros longos (> 50 ms) e os perdidos. A gravação de vídeo
 * pesa na máquina e mentiria na conta: as duas coisas nunca vão juntas.
 *
 * Opções:
 *   --peca <id[,id…]>        peças do pecas-ouro/manifesto.json (obrigatório)
 *   --marca <id>             marca do manifesto (padrão: a marca da peça)
 *   --modo <claro|escuro|marca>  (padrão: o da marca, escuro)
 *   --formato 16x9|9x16|1x1  tamanho da TV (1920×1080, 1080×1920, 1080×1080)
 *   --local balcao|recepcao|escritorio   a letra mínima do local (como a bancada)
 *   --segundos <n>           quanto da peça no ar depois da entrada (padrão 4)
 *   --saida <pasta>          onde salvar os MP4 (padrão: ./videos-pecas)
 *   --leve                   o modo leve da TV (box fraco): entradas só esmaecem
 *   --quadros                mede os quadros em vez de gravar
 *   --cpu <n>                o freio de CPU do --quadros (padrão 4)
 *   --base <url>             servidor já de pé (padrão: sobe um na porta 6022)
 *   --de <pasta>             os scripts e as peças de OUTRA cópia do projeto (ex.: o main),
 *                            servidos por cima do servidor: o antes e o depois na mesma máquina
 *
 * Precisa do Playwright com o Chromium e, para o MP4, do ffmpeg no PATH.
 */
import { createRequire } from 'node:module';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function argumentos(lista) {
  const a = {};
  for (let i = 0; i < lista.length; i++) {
    const k = lista[i];
    if (!k.startsWith('--')) continue;
    const nome = k.slice(2);
    const prox = lista[i + 1];
    if (prox == null || prox.startsWith('--')) a[nome] = true;
    else { a[nome] = prox; i++; }
  }
  return a;
}
const A = argumentos(process.argv.slice(2));
const FORMATOS = { '16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080] };
const formato = FORMATOS[A.formato || '16x9'];
if (!A.peca || !formato) {
  console.error('uso: node tools/gravar-peca.mjs --peca <id[,id…]> [--marca <id>] [--formato 16x9|9x16|1x1] [--local balcao] [--saida <pasta>] [--quadros]');
  process.exit(2);
}
const PECAS = String(A.peca).split(',').map((s) => s.trim()).filter(Boolean);
const SEGUNDOS = Number(A.segundos) > 0 ? Number(A.segundos) : 4;
const CPU = Number(A.cpu) > 0 ? Number(A.cpu) : 4;
const PORTA = Number(process.env.PORTA_GRAVAR) || 6022;
const BASE = String(A.base || 'http://127.0.0.1:' + PORTA).replace(/\/$/, '');
const SAIDA = path.resolve(A.saida || path.join(RAIZ, 'videos-pecas'));
const DE = A.de ? path.resolve(String(A.de)) : '';

// Com --de, a página pega js/ e pecas-ouro/ daquela pasta (o resto, fotos e fontes, vem do servidor).
async function deOutraCopia(p) {
  if (!DE) return;
  await p.route(/\/(js\/[\w.-]+\.js|pecas-ouro\/[\w.-]+\.(html|json))(\?.*)?$/, (r) => {
    const rel = new URL(r.request().url()).pathname.replace(/^\//, '');
    const arq = path.join(DE, rel);
    if (!arq.startsWith(DE + path.sep) || !fs.existsSync(arq)) return r.continue();
    const tipo = arq.endsWith('.js') ? 'text/javascript' : arq.endsWith('.json') ? 'application/json' : 'text/html';
    return r.fulfill({ contentType: tipo + '; charset=utf-8', body: fs.readFileSync(arq, 'utf8') });
  });
}

/* ---------------- O servidor ---------------- */

async function noAr() {
  try { return (await fetch(BASE + '/bancada.html')).ok; } catch (e) { return false; }
}

// Usa o servidor que já estiver de pé; se não houver, sobe um num banco de teste e derruba no fim.
async function servidor() {
  if (await noAr()) return () => {};
  if (A.base) throw new Error('nada respondendo em ' + BASE);
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-gravar-'));
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), SKIP_VERIFY: '1', AI_PROVIDER: 'dev', DATA_DIR: dados, MEDIA_DIR: dados, STORAGE: 'local', DATABASE_URL: '', NODE_ENV: 'test' },
  });
  const parar = () => { proc.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* segue */ } };
  for (let i = 0; i < 160; i++) {
    if (await noAr()) return parar;
    await espera(250);
  }
  parar();
  throw new Error('o servidor não subiu na porta ' + PORTA);
}

/* ---------------- A página ---------------- */

/*
 * O palco: os scripts da bancada (os mesmos da TV para desenhar a peça) e
 * uma caixa do tamanho da tela. Servida pela própria rota do Playwright, no
 * mesmo endereço do servidor, para a peça, o manifesto e as fotos virem dele.
 */
const PALCO = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
  + '<link rel="stylesheet" href="/fonts/fontes.css">'
  + '<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#tv{position:fixed;left:0;top:0;width:100vw;height:100vh}</style>'
  + '</head><body><div id="tv"></div>'
  + ['cor', 'fontes', 'animacao', 'templates', 'tokens', 'peca-html', 'peca-render'].map((s) => '<script src="/js/' + s + '.js"></script>').join('')
  + '</body></html>';

// Roda na página: lê a peça e os dados dela, e deixa pronto um "tocar()" que monta do zero.
async function prepararNaPagina(o) {
  const manifesto = await (await fetch('/pecas-ouro/manifesto.json', { cache: 'no-store' })).json();
  const banco = await fetch('/pecas-ouro/fotos/banco.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const LOCAIS = { balcao: 0.045, recepcao: 0.035, escritorio: 0.03 };
  if (LOCAIS[o.local]) document.documentElement.style.setProperty('--mt-piso-tv', String(LOCAIS[o.local]));
  const def = manifesto.pecas.find((p) => p.id === o.peca);
  if (!def) throw new Error('peça não está no manifesto: ' + o.peca);
  const marca = manifesto.marcas.find((m) => m.id === (o.marca || def.marca)) || manifesto.marcas[0];
  const arq = MTPecaHtml.doArquivo(await (await fetch('/pecas-ouro/' + def.id + '.html', { cache: 'no-store' })).text());
  // O foco de cada foto, como a bancada (js/bancada.js, espacosDe): a foto do banco leva o foco de lá.
  const espacos = {};
  Object.keys(def.fotos || {}).forEach((n) => {
    const doBanco = (Array.isArray(banco) ? banco : []).filter((b) => b.arquivo === (def.campos || {})[n]);
    const b = doBanco.find((x) => x.papel === def.fotos[n]) || doBanco[0];
    espacos[n] = b && b.foco ? { papel: def.fotos[n], foco: b.foco } : { papel: def.fotos[n] };
  });
  const item = {
    type: 'peca-html', papel: 'destaque', html: arq.html, css: arq.css, campos: Object.assign({}, def.campos || {}),
    espacos, modo: o.modo || undefined, marca: { cores: marca.cores, fonteTitulo: marca.fonteTitulo, fonteApoio: marca.fonteApoio },
  };
  const tv = document.getElementById('tv');
  let ctl = null;
  // Tela preta, como a TV entre uma peça e outra sem transição: a gravação começa dela.
  window.MT_LIMPAR = () => {
    if (ctl) ctl.parar();
    ctl = null;
    tv.textContent = '';
  };
  window.MT_TOCAR = (escondida) => {
    window.MT_LIMPAR();
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%' + (escondida ? ';visibility:hidden' : '');
    tv.appendChild(host);
    ctl = MTPecaRender.montar(host, item, { leve: false, movimento: o.leve ? 'simples' : undefined, clima: () => Promise.resolve('27°'), mensagens: [] });
    return { duracao: ctl.duracao };
  };
  // Uma vez escondida, para as fontes e as fotos chegarem e ficarem no cache (a gravação não a vê).
  window.MT_TOCAR(true);
  await document.fonts.ready;
  const imgs = [];
  tv.querySelectorAll('div').forEach((h) => { if (h.shadowRoot) h.shadowRoot.querySelectorAll('img').forEach((i) => imgs.push(i)); });
  await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; setTimeout(r, 8000); }))));
  await document.fonts.ready;
  window.MT_LIMPAR();
  return { nome: def.nome, marca: marca.id };
}

// Roda na página: toca a peça e anota o intervalo de cada quadro por `ms` milissegundos.
function tocarEMedir(ms) {
  return new Promise((pronto) => {
    const deltas = [];
    let antes = 0;
    const ini = performance.now();
    window.MT_TOCAR();
    const passo = (t) => {
      if (antes) deltas.push({ t: t - ini, d: t - antes });
      antes = t;
      if (t - ini < ms) requestAnimationFrame(passo);
      else pronto(deltas);
    };
    requestAnimationFrame(passo);
  });
}

/* ---------------- Gravar ---------------- */

/*
 * Onde a peça começa no vídeo. O relógio da gravação e o daqui não batem ao
 * milésimo (ela começa com a página, e os quadros chegam quando a tela
 * muda), então quem diz é o próprio vídeo: a tela fica PRETA (#000) até a
 * peça entrar, e o fim do último trecho preto antes da estimativa é o
 * começo. O fundo da peça, por mais escuro, não é preto puro.
 */
function inicioNoVideo(webm, estimado) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', webm, '-vf', 'blackdetect=d=0.08:pix_th=0.02', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  const fins = [...String(r.stderr || '').matchAll(/black_end:([\d.]+)/g)].map((m) => Number(m[1]));
  const antes = fins.filter((t) => t <= estimado + 1.5);
  return antes.length ? antes[antes.length - 1] : Math.max(0, estimado - 0.5);
}

function paraMp4(webm, mp4, inicio, duracao) {
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', inicio.toFixed(2), '-i', webm, '-t', duracao.toFixed(2),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('o ffmpeg não converteu ' + webm);
}

async function gravar(navegador, peca, [w, h]) {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-video-'));
  const ctx = await navegador.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, recordVideo: { dir: pasta, size: { width: w, height: h } } });
  const comecou = Date.now();
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.route(BASE + '/__gravar.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PALCO }));
  await deOutraCopia(p);
  await p.goto(BASE + '/__gravar.html');
  const info = await p.evaluate(prepararNaPagina, { peca, marca: A.marca, modo: A.modo, local: A.local || '', leve: !!A.leve });
  await p.evaluate(() => window.MT_LIMPAR());
  await espera(1200);
  const tocou = Date.now();
  await p.evaluate(() => window.MT_TOCAR());
  // A entrada inteira (a última entra perto de 2,5 s) e mais os segundos pedidos de peça no ar.
  const total = 3 + SEGUNDOS;
  await espera(total * 1000 + 300);
  const video = p.video();
  await ctx.close();
  const webm = await video.path();
  fs.mkdirSync(SAIDA, { recursive: true });
  const nome = peca + '-' + (A.marca || info.marca) + '-' + (A.formato || '16x9') + (A.leve ? '-leve' : '') + '.mp4';
  const mp4 = path.join(SAIDA, nome);
  // Do fim da tela preta (com 0,2 s dela, como a TV entre uma peça e outra) até a peça ter ficado no ar o pedido.
  const inicio = Math.max(0, inicioNoVideo(webm, (tocou - comecou) / 1000) - 0.2);
  paraMp4(webm, mp4, inicio, total + 0.2);
  fs.rmSync(pasta, { recursive: true, force: true });
  if (erros.length) console.warn('  erros na página: ' + erros.join(' | '));
  return mp4;
}

/* ---------------- Medir os quadros ---------------- */

const pct = (v, q) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };
function resumo(deltas) {
  const ds = deltas.map((x) => x.d);
  // Quadro perdido: cada 16,7 ms a mais que o intervalo de uma tela de 60 Hz.
  const perdidos = ds.reduce((s, d) => s + Math.max(0, Math.round(d / (1000 / 60)) - 1), 0);
  return {
    quadros: ds.length,
    p50: +pct(ds, 0.5).toFixed(1),
    p95: +pct(ds, 0.95).toFixed(1),
    pior: +Math.max(0, ...ds).toFixed(1),
    longos: ds.filter((d) => d > 50).length,
    perdidos,
  };
}

async function medir(navegador, pecas, [w, h]) {
  const p = await navegador.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.route(BASE + '/__gravar.html', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: PALCO }));
  await deOutraCopia(p);
  const cdp = await p.context().newCDPSession(p);
  await cdp.send('Performance.enable');
  /*
   * O TRABALHO da linha principal (Performance.getMetrics), além dos
   * quadros: o intervalo entre quadros depende da carga da máquina (outros
   * processos disputando a CPU); o tempo que a página gastou em script,
   * estilo e layout, bem menos. Em ms, já com o freio.
   */
  const METRICAS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
  const metricas = async () => {
    const m = {};
    (await cdp.send('Performance.getMetrics')).metrics.forEach((x) => { if (METRICAS.includes(x.name)) m[x.name] = x.value * 1000; });
    return m;
  };
  const trabalhoTotal = { TaskDuration: 0, ScriptDuration: 0, LayoutDuration: 0, RecalcStyleDuration: 0 };
  const todos = [], entradas = [], montagens = [];
  const linhas = [];
  for (const peca of pecas) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await p.goto(BASE + '/__gravar.html');
    await p.evaluate(prepararNaPagina, { peca, marca: A.marca, modo: A.modo, local: A.local || '', leve: !!A.leve });
    await espera(800);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    const antes = await metricas();
    // A peça no ar do jeito que a TV mostra: a entrada (≈ 2,5 s) e mais os segundos pedidos.
    const deltas = await p.evaluate(tocarEMedir, (3 + SEGUNDOS) * 1000);
    const depois = await metricas();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const trabalho = {};
    METRICAS.forEach((k) => { trabalho[k] = Math.round(depois[k] - antes[k]); trabalhoTotal[k] += trabalho[k]; });
    /*
     * Os primeiros 300 ms são a MONTAGEM (o primeiro desenho da peça, o
     * piso da régua, as medidas da coreografia — e, com o freio de CPU, o
     * tempo que o Chrome segura a página para "pagar" esse trabalho): contam
     * à parte. Na TV, a montagem acontece debaixo da troca. A entrada é o
     * que vem depois, até 3 s; "no ar", tudo.
     */
    const montagem = deltas.filter((x) => x.t < 300);
    const daEntrada = deltas.filter((x) => x.t >= 300 && x.t <= 3000);
    todos.push(...deltas);
    entradas.push(...daEntrada);
    montagens.push(...montagem);
    linhas.push({ peca, montagem: resumo(montagem), tudo: resumo(deltas), entrada: resumo(daEntrada), trabalho });
  }
  await p.close();
  if (erros.length) console.warn('erros na página: ' + erros.join(' | '));
  return { linhas, tudo: resumo(todos), entrada: resumo(entradas), montagem: resumo(montagens), trabalho: trabalhoTotal };
}

/* ---------------- Rodar ---------------- */

const parar = await servidor();
const navegador = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  if (A.quadros) {
    const r = await medir(navegador, PECAS, formato);
    const fmt = (x) => 'p95 ' + x.p95 + ' ms · p50 ' + x.p50 + ' ms · pior ' + x.pior + ' ms · ' + x.longos + ' quadros > 50 ms · ' + x.perdidos + ' perdidos em ' + x.quadros;
    console.log('Quadros com a CPU ' + CPU + '× mais lenta, ' + formato.join('×') + (A.leve ? ', modo leve' : '') + ':');
    const tr = (t) => 'linha principal ' + t.TaskDuration + ' ms (script ' + t.ScriptDuration + ', layout ' + t.LayoutDuration + ', estilo ' + t.RecalcStyleDuration + ')';
    for (const l of r.linhas) {
      console.log('  ' + l.peca.padEnd(22) + ' ' + tr(l.trabalho) + '\n'
        + '  ' + ''.padEnd(22) + ' montagem: pior ' + l.montagem.pior + ' ms\n'
        + '  ' + ''.padEnd(22) + ' entrada:  ' + fmt(l.entrada) + '\n  ' + ''.padEnd(22) + ' no ar:    ' + fmt(l.tudo));
    }
    console.log('  TODAS · ' + tr(r.trabalho));
    console.log('  TODAS · montagem: pior ' + r.montagem.pior + ' ms');
    console.log('  TODAS · entrada:  ' + fmt(r.entrada));
    console.log('  TODAS · no ar:    ' + fmt(r.tudo));
    if (A.json) fs.writeFileSync(path.resolve(String(A.json)), JSON.stringify(r, null, 2));
  } else {
    for (const peca of PECAS) {
      const mp4 = await gravar(navegador, peca, formato);
      console.log(mp4);
    }
  }
} finally {
  await navegador.close();
  parar();
}
