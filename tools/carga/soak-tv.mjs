/*
 * tools/carga/soak-tv.mjs — a TV ligada por horas, num "TV box" emulado.
 *
 *   SOAK_BASE=http://127.0.0.1:6091 SOAK_MIN=150 SOAK_CPU=6 SOAK_SAIDA=<pasta> \
 *     node tools/carga/soak-tv.mjs
 *
 * O player DE VERDADE (/tv, pareado como o cliente pareia), com a
 * programação de RH (programa-rh.cjs: Empresas, Corporativo, peças-ouro,
 * duas fotos vivas, transição, cabeçalho e rodapé), em 1920×1080 e com a CPU
 * freada pelo CDP (SOAK_CPU vezes mais lenta — um box barato). As peças
 * duram SOAK_PECA segundos (padrão 6) para o rodízio de dias caber em horas.
 *
 * A cada SOAK_AMOSTRA segundos (padrão 90): coleta de lixo forçada
 * (HeapProfiler.collectGarbage), heap do JS, contadores do DOM
 * (Memory.getDOMCounters: nós, ouvintes, documentos), quantos <video>/<img>,
 * timers vivos (setInterval/setTimeout embrulhados antes do player subir),
 * tarefas longas, quadros e quantas peças entraram. Uma linha JSON por
 * amostra em <SOAK_SAIDA>/amostras.jsonl; no fim, a inclinação (por hora).
 *
 * SOAK_LEVE=1 abre com ?perf=1 (o modo leve); sem ele, ?perf=0 (o completo,
 * o pior caso: o box com o app começa leve pelo nome do navegador).
 * Um navegador e um contexto só. Tudo o que não é o servidor local é
 * bloqueado (nada sai para a rede).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const req = createRequire(import.meta.url);
let playwright;
try { playwright = req('playwright'); } catch (e) { playwright = createRequire('/opt/node-tools/node_modules/')('playwright'); }
const { montarProgramaRh } = req('./programa-rh.cjs');

const BASE = process.env.SOAK_BASE || 'http://127.0.0.1:6091';
const MINUTOS = Number(process.env.SOAK_MIN) || 150;
const CPU = Number(process.env.SOAK_CPU) || 6;
const AMOSTRA_S = Number(process.env.SOAK_AMOSTRA) || 90;
const PECA_S = Number(process.env.SOAK_PECA) || 6;
const LEVE = process.env.SOAK_LEVE === '1';
// O RH publicando ao longo do dia: a cada SOAK_REPUBLICAR minutos a programação é gravada de novo (0 desliga).
const REPUBLICAR_MIN = Number(process.env.SOAK_REPUBLICAR ?? 10);
const SAIDA = process.env.SOAK_SAIDA || path.resolve('soak-' + Date.now());
fs.mkdirSync(SAIDA, { recursive: true });
const ARQ = path.join(SAIDA, 'amostras.jsonl');
const LOG = path.join(SAIDA, 'eventos.log');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const anotar = (s) => { const l = new Date().toISOString() + ' ' + s; fs.appendFileSync(LOG, l + '\n'); console.log(l); };

/* ---------- A conta (fetch com o cookie de sessão, fora do navegador) ---------- */
let cookie = '';
async function api(metodo, caminho, corpo) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: Object.assign({ Origin: BASE }, corpo !== undefined ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { /* não é JSON */ }
  if (r.status >= 400) throw new Error(metodo + ' ' + caminho + ' → ' + r.status + ' ' + t.slice(0, 200));
  return j;
}

/* ---------- Contadores dentro da página (antes de qualquer script do player) ---------- */
function instrumentar() {
  const S = window.__soak = { longTasks: 0, longMs: 0, frames: 0, piorQuadro: 0, swaps: 0, erros: 0 };
  const si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout;
  const ivs = new Set(), tos = new Set();
  window.setInterval = function (fn, ms, ...a) { const id = si.call(window, fn, ms, ...a); ivs.add(id); return id; };
  window.setTimeout = function (fn, ms, ...a) {
    let id;
    const w = typeof fn === 'function' ? function () { tos.delete(id); return fn.apply(this, arguments); } : fn;
    id = st.call(window, w, ms, ...a); tos.add(id); return id;
  };
  // Os dois apagam qualquer um dos dois (o navegador divide os números).
  window.clearInterval = function (id) { ivs.delete(id); tos.delete(id); return ci.call(window, id); };
  window.clearTimeout = function (id) { tos.delete(id); ivs.delete(id); return ct.call(window, id); };
  S.timers = () => ({ intervals: ivs.size, timeouts: tos.size });
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) { S.longTasks++; S.longMs += e.duration; } })
      .observe({ type: 'longtask', buffered: true });
  } catch (e) { /* sem longtask */ }
  let ant = 0;
  const quadro = (t) => { if (ant) { const d = t - ant; if (d > S.piorQuadro) S.piorQuadro = d; } ant = t; S.frames++; requestAnimationFrame(quadro); };
  requestAnimationFrame(quadro);
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('mt-slide')) S.swaps++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  window.addEventListener('error', () => { S.erros++; });
}

function lerPagina() {
  const S = window.__soak || {};
  // As peças desenham dentro de shadow roots (js/peca-render.js): a contagem desce nelas também.
  const todos = [];
  (function andar(r) { r.querySelectorAll('*').forEach((e) => { todos.push(e); if (e.shadowRoot) andar(e.shadowRoot); }); })(document);
  const v = todos.filter((e) => e.tagName === 'VIDEO');
  const r = {
    video: v.length,
    videoComSrc: v.filter((x) => x.currentSrc || x.src).length,
    videoTocando: v.filter((x) => !x.paused && !x.ended && x.readyState > 2).length,
    img: todos.filter((e) => e.tagName === 'IMG').length,
    iframe: todos.filter((e) => e.tagName === 'IFRAME').length,
    shadowRoots: todos.filter((e) => e.shadowRoot).length,
    slides: document.querySelectorAll('.mt-slide').length,
    nosNoDocumento: todos.length,
    leve: document.documentElement.classList.contains('mt-perf'),
    longTasks: S.longTasks || 0, longMs: Math.round(S.longMs || 0),
    frames: S.frames || 0, piorQuadro: Math.round(S.piorQuadro || 0), swaps: S.swaps || 0, erros: S.erros || 0,
    timers: S.timers ? S.timers() : null,
    // O vigia da página (js/vigia.js): quantas zonas vigia, quantas cutucou, quantas vezes recarregou.
    vigia: window.MTVigia && window.MTVigia.estado ? window.MTVigia.estado() : null,
    gsap: window.gsap && window.gsap.globalTimeline ? window.gsap.globalTimeline.getChildren(true, true, true).length : null,
    localStorageBytes: (() => { try { let n = 0; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } return n; } catch (e) { return null; } })(),
  };
  S.piorQuadro = 0; // o pior quadro é por janela de amostra
  return r;
}

/* RSS da árvore de processos do navegador (o renderizador é filho dele). */
function rssDaArvore(pid) {
  const filhos = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const s = fs.readFileSync('/proc/' + d + '/stat', 'utf8');
      const ppid = Number(s.slice(s.lastIndexOf(')') + 2).split(' ')[1]);
      if (!filhos.has(ppid)) filhos.set(ppid, []);
      filhos.get(ppid).push(Number(d));
    } catch (e) { /* processo sumiu */ }
  }
  let total = 0;
  let renderizador = 0;
  const fila = [pid];
  while (fila.length) {
    const p = fila.pop();
    try {
      const m = /VmRSS:\s+(\d+)/.exec(fs.readFileSync('/proc/' + p + '/status', 'utf8'));
      if (m) total += Number(m[1]) * 1024;
      // O renderizador (a página) separado: é ele que um box de 2 GB sente.
      if (m && fs.readFileSync('/proc/' + p + '/cmdline', 'utf8').includes('--type=renderer')) renderizador += Number(m[1]) * 1024;
    } catch (e) { /* sumiu */ }
    (filhos.get(p) || []).forEach((f) => fila.push(f));
  }
  rssDaArvore.renderizador = renderizador;
  return total;
}

function inclinacao(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : 0;
}

async function main() {
  anotar('início: ' + JSON.stringify({ BASE, MINUTOS, CPU, AMOSTRA_S, PECA_S, LEVE, SAIDA }));
  const email = 'soak-' + Date.now() + '@teste.local';
  await api('POST', '/api/auth/signup', { email, password: 'senha-de-teste-123', name: 'Metalúrgica Alfa', aceite: true, perfil: 'empresa' });
  await api('POST', '/api/billing/dev-activate', { plan: 'pro' });
  await api('PUT', '/api/brand', { nome: 'Metalúrgica Alfa', cores: ['#23395d', '#f4a261'] });

  const navegador = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  // O navegador é filho deste processo: a árvore de process.pid, menos este node.
  const pidNavegador = process.pid;
  const ctx = await navegador.newContext({ viewport: { width: 1920, height: 1080 } });
  // Só o servidor local: clima, notícias, fontes de fora — nada sai.
  await ctx.route((u) => !String(u).startsWith(BASE), (r) => r.abort());
  await ctx.addInitScript(instrumentar);
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => { erros.push(e.message); if (erros.length < 50) anotar('pageerror: ' + e.message); });
  p.on('console', (m) => { if (m.type() === 'error' && erros.length < 50) { erros.push(m.text()); anotar('console.error: ' + m.text().slice(0, 300)); } });
  p.on('crash', () => anotar('A PÁGINA CAIU (crash)'));
  let falhas = 0;
  p.on('requestfailed', (r) => { if (falhas++ < 30) anotar('pedido falhou: ' + r.url().slice(0, 160) + ' ' + ((r.failure() && r.failure().errorText) || '')); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Performance.enable');
  // Os players de mídia (cada <video> que tocou): criados × destruídos. Vídeo que sai da tela e não solta o player aparece aqui.
  const midia = { criados: 0, destruidos: 0 };
  cdp.on('Media.playersCreated', (e) => { midia.criados += (e.players || []).length; });
  cdp.on('Media.playerEventsAdded', (e) => { for (const ev of e.events || []) if (/Destroyed/i.test(String(ev.value))) midia.destruidos++; });
  await cdp.send('Media.enable').catch(() => anotar('sem o domínio Media no CDP'));
  await cdp.send('HeapProfiler.enable');
  const frear = () => cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }).catch(() => {});

  await p.goto(BASE + '/tv?perf=' + (LEVE ? '1' : '0'));
  let codigo = null;
  for (let i = 0; i < 60 && !codigo; i++) {
    await espera(500);
    codigo = await p.evaluate(() => { const m = document.body.innerText.match(/\b[A-Z0-9]{6}\b/); return m && m[0]; }).catch(() => null);
  }
  if (!codigo) throw new Error('a TV não mostrou o código');
  const par = await api('POST', '/api/pair', { code: codigo, name: 'TV Refeitório', nova: true });
  anotar('pareada: ' + par.id + ' código ' + codigo);
  const cfg = montarProgramaRh({ duracao: PECA_S, duracaoLateral: Math.max(4, PECA_S - 1) });
  await api('PUT', '/api/devices/' + par.id + '/config', cfg);
  anotar('programação publicada (' + JSON.stringify(cfg).length + ' bytes)');
  await frear();

  const inicio = Date.now();
  const fim = inicio + MINUTOS * 60 * 1000;
  let n = 0;
  let antes = null;
  let publicacoes = 0;
  let ultimaPub = Date.now();
  while (Date.now() < fim) {
    await espera(n === 0 ? 30000 : AMOSTRA_S * 1000);
    await frear();
    // Publicação nova: o player recebe pelo SSE e refaz o palco inteiro (o caminho onde mais escapa timer e vídeo).
    if (REPUBLICAR_MIN > 0 && Date.now() - ultimaPub > REPUBLICAR_MIN * 60000) {
      ultimaPub = Date.now();
      publicacoes++;
      const nova = montarProgramaRh({ duracao: PECA_S, duracaoLateral: Math.max(4, PECA_S - 1), transicao: publicacoes % 2 ? 'fade' : 'cinematic' });
      const lista = nova.zonas.principal.items;
      for (let i = 0; i < publicacoes % lista.length; i++) lista.push(lista.shift());
      await api('PUT', '/api/devices/' + par.id + '/config', nova).then(() => anotar('publicação ' + publicacoes), (e) => anotar('publicação falhou: ' + e.message));
    }
    try {
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.collectGarbage');
      const heap = await cdp.send('Runtime.getHeapUsage');
      const dom = await cdp.send('Memory.getDOMCounters');
      const met = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
      const pg = await p.evaluate(lerPagina);
      const a = {
        t: Date.now(), min: +((Date.now() - inicio) / 60000).toFixed(2),
        heapUsado: heap.usedSize, heapTotal: heap.totalSize,
        documentos: dom.documents, nos: dom.nodes, ouvintes: dom.jsEventListeners,
        layouts: met.LayoutCount, recalcEstilo: met.RecalcStyleCount, tarefaS: +(met.TaskDuration || 0).toFixed(1),
        rssNavegador: rssDaArvore(pidNavegador) - process.memoryUsage().rss,
        rssRenderizador: rssDaArvore.renderizador,
        playersCriados: midia.criados, playersDestruidos: midia.destruidos,
        ...pg,
        fps: antes ? +((pg.frames - antes.frames) / ((Date.now() - antes.t) / 1000)).toFixed(1) : null,
        errosPagina: erros.length,
      };
      antes = { frames: pg.frames, t: Date.now() };
      fs.appendFileSync(ARQ, JSON.stringify(a) + '\n');
      // A foto da tela no começo e de hora em hora: "não travou" também se vê.
      if (n === 0 || n % Math.max(1, Math.round(3600 / AMOSTRA_S)) === 0) await p.screenshot({ path: path.join(SAIDA, 'tela-' + Math.round(a.min) + 'min.png') }).catch(() => {});
      n++;
      console.log('[' + a.min + ' min] heap ' + (a.heapUsado / 1048576).toFixed(1) + ' MB, nós ' + a.nos + ', ouvintes ' + a.ouvintes
        + ', video ' + a.video + ', img ' + a.img + ', timers ' + JSON.stringify(a.timers) + ', trocas ' + a.swaps + ', fps ' + a.fps + ', rss ' + (a.rssNavegador / 1048576).toFixed(0) + ' MB');
    } catch (e) {
      anotar('amostra falhou: ' + e.message);
      if (p.isClosed()) break;
    }
  }

  // A inclinação depois do aquecimento (os primeiros 10 min ficam de fora).
  const linhas = fs.readFileSync(ARQ, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((a) => a.min >= 10);
  const h = linhas.map((a) => a.min / 60);
  const resumo = { amostras: linhas.length, horas: h.length ? +(h[h.length - 1] - h[0]).toFixed(2) : 0, trocas: linhas.length ? linhas[linhas.length - 1].swaps : 0, porHora: {} };
  for (const k of ['heapUsado', 'nos', 'ouvintes', 'documentos', 'video', 'img', 'rssNavegador', 'rssRenderizador']) {
    resumo.porHora[k] = +inclinacao(h, linhas.map((a) => a[k] || 0)).toFixed(1);
  }
  resumo.porHora.intervals = +inclinacao(h, linhas.map((a) => (a.timers ? a.timers.intervals : 0))).toFixed(2);
  resumo.porHora.timeouts = +inclinacao(h, linhas.map((a) => (a.timers ? a.timers.timeouts : 0))).toFixed(2);
  fs.writeFileSync(path.join(SAIDA, 'resumo.json'), JSON.stringify(resumo, null, 2));
  anotar('resumo: ' + JSON.stringify(resumo));
  /*
   * A memória do renderizador é cache ou é vazamento? O aviso de memória
   * crítica do sistema (o que o Android manda a um app em segundo plano
   * apertado) faz o Chromium soltar caches de imagem, de fonte e de
   * recursos. O que volta é cache; o que fica é o que a página segura.
   */
  try {
    await cdp.send('HeapProfiler.collectGarbage');
    rssDaArvore(pidNavegador);
    const antesDaPurga = rssDaArvore.renderizador;
    await cdp.send('Memory.simulatePressureNotification', { level: 'critical' });
    await espera(10000);
    await cdp.send('HeapProfiler.collectGarbage');
    rssDaArvore(pidNavegador);
    resumo.purga = { renderizadorAntesMb: Math.round(antesDaPurga / 1048576), renderizadorDepoisMb: Math.round(rssDaArvore.renderizador / 1048576) };
    resumo.midia = midia;
    fs.writeFileSync(path.join(SAIDA, 'resumo.json'), JSON.stringify(resumo, null, 2));
    anotar('purga de memória: ' + JSON.stringify(resumo.purga) + ' players ' + JSON.stringify(midia));
  } catch (e) { anotar('purga falhou: ' + e.message); }
  await navegador.close();
}

main().catch((e) => { anotar('FALHOU: ' + (e && e.stack || e)); process.exit(1); });
