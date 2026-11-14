/*
 * tools/carga/carga-tvs.mjs — N TVs de mentira falando o protocolo DE VERDADE.
 *
 *   CARGA_BASE=http://127.0.0.1:6090 CARGA_SAIDA=<pasta> \
 *   CARGA_DEGRAUS=100,250,500,1000,2000 CARGA_RAMPA_S=60 CARGA_FIRME_S=240 \
 *   CARGA_PSQL='-h /sock -U mt -d multitelas' node tools/carga/carga-tvs.mjs
 *
 * Cada TV faz o que js/player.js + js/cloud.js + js/senha.js fazem
 * (bootCloud): lê a si mesma e a config, troca o token por um passe e abre o
 * SSE (reabre como o player: 2 s se durou mais de 1 min, 15 s se não; e o
 * corte do proxy do Railway aos 15 min), pulsa e conta o som a cada 30 s,
 * pergunta a senha a cada 60 s, indicadores e planilha a cada 5 min,
 * aniversariantes no começo, o lote de exibições a cada 5 min — e reage ao
 * SSE: `config` busca a config, `comando: estado` responde o "Ver a tela".
 *
 * As contas: a primeira é a de RH grande (300 TVs, plano Enterprise), as
 * outras de 100. O pareamento é o de verdade: POST /api/devices (de um IP de
 * escritório, X-Forwarded-For), o primeiro pulso e POST /api/pair do dono. A
 * programação é a de RH (programa-rh.cjs, ~96 KB).
 *
 * Gente no painel: CARGA_PAINEL pessoas na conta grande, cada uma a cada
 * ~15 s faz uma coisa normal (Telas, programação de 25 TVs, "Ver a tela
 * agora", editar uma TV) e, de tempos em tempos, o aviso rápido em 20 TVs
 * (POST /api/lote). Mede quanto o aviso leva para chegar pelo SSE.
 *
 * Por degrau: p50/p95/p99 por rota, erros, CPU/RSS/event loop/sockets do
 * servidor (tools/carga/sonda.cjs), CPU do Postgres e do próprio gerador.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const req = createRequire(import.meta.url);
const { montarProgramaRh } = req('./programa-rh.cjs');

const BASE = new URL(process.env.CARGA_BASE || 'http://127.0.0.1:6090');
const SAIDA = process.env.CARGA_SAIDA || path.resolve('carga-' + Date.now());
const DEGRAUS = (process.env.CARGA_DEGRAUS || '100,250,500,1000,2000').split(',').map(Number);
const RAMPA_S = Number(process.env.CARGA_RAMPA_S) || 60;
const FIRME_S = Number(process.env.CARGA_FIRME_S) || 240;
const PAINEL = Number(process.env.CARGA_PAINEL ?? 3);
const PSQL = (process.env.CARGA_PSQL || '').split(' ').filter(Boolean);
const SONDA = process.env.CARGA_SONDA || '';
const MIN_LIVRE_MB = Number(process.env.CARGA_MIN_LIVRE_MB) || 3000;
const CONTA_GRANDE = 300;
const CONTA = 100;
fs.mkdirSync(SAIDA, { recursive: true });
const FROTA = path.join(SAIDA, 'frota.json');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const LOG = path.join(SAIDA, 'carga.log');
const anotar = (s) => { const l = new Date().toISOString().slice(11, 19) + ' ' + s; fs.appendFileSync(LOG, l + '\n'); console.log(l); };

/* ---------------- HTTP ---------------- */
// O "proxy da borda": um pool de conexões mantidas, como o Railway faz com o app.
const pool = new http.Agent({ keepAlive: true, maxSockets: 256, maxFreeSockets: 256 });
const est = new Map(); // rótulo -> { ms: [], erros, s4xx, s429, s5xx, rede }
function stat(r) { let s = est.get(r); if (!s) { s = { ms: [], erros: 0, s4xx: 0, s429: 0, s5xx: 0, rede: 0 }; est.set(r, s); } return s; }

function pedir(metodo, caminho, o) {
  const op = o || {};
  const corpo = op.corpo !== undefined ? Buffer.from(typeof op.corpo === 'string' ? op.corpo : JSON.stringify(op.corpo)) : null;
  const headers = Object.assign({}, op.headers || {});
  if (corpo) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = corpo.length; }
  if (op.ip) headers['X-Forwarded-For'] = op.ip;
  if (op.cookie) { headers.Cookie = op.cookie; headers.Origin = BASE.origin; }
  const t0 = performance.now();
  return new Promise((resolve) => {
    const r = http.request({ host: BASE.hostname, port: BASE.port, path: caminho, method: metodo, headers, agent: op.agent === undefined ? pool : op.agent }, (res) => {
      const partes = [];
      res.on('data', (c) => { if (op.ler !== false) partes.push(c); });
      res.on('end', () => {
        const ms = performance.now() - t0;
        if (op.rotulo) {
          const s = stat(op.rotulo);
          s.ms.push(ms);
          if (res.statusCode === 429) s.s429++;
          else if (res.statusCode >= 500) { s.s5xx++; s.erros++; }
          else if (res.statusCode >= 400 && !(op.esperado || []).includes(res.statusCode)) { s.s4xx++; s.erros++; }
        }
        const txt = op.ler === false ? '' : Buffer.concat(partes).toString('utf8');
        let json = null; try { json = txt ? JSON.parse(txt) : null; } catch (e) { /* não é JSON */ }
        resolve({ status: res.statusCode, ms, json, headers: res.headers, bytes: txt.length });
      });
      res.on('error', () => { if (op.rotulo) { const s = stat(op.rotulo); s.rede++; s.erros++; } resolve({ status: 0, ms: performance.now() - t0 }); });
    });
    r.on('error', (e) => { if (op.rotulo) { const s = stat(op.rotulo); s.rede++; s.erros++; } resolve({ status: 0, ms: performance.now() - t0, erro: e.code || e.message }); });
    r.setTimeout(op.prazo || 30000, () => r.destroy(new Error('prazo')));
    if (corpo) r.write(corpo);
    r.end();
  });
}

/* ---------------- A frota: contas e TVs (persistida, para retomar) ---------------- */
let frota = { contas: [], tvs: [] };
try { frota = JSON.parse(fs.readFileSync(FROTA, 'utf8')); } catch (e) { /* frota nova */ }
const guardarFrota = () => fs.writeFileSync(FROTA, JSON.stringify(frota));

async function criarConta(i) {
  const email = 'carga-' + i + '-' + Date.now() + '@teste.local';
  const nome = 'Carga RH ' + i + ' ' + Date.now().toString(36);
  let cookie = '';
  const r = await pedir('POST', '/api/auth/signup', { corpo: { email, password: 'senha-de-teste-123', name: nome, aceite: true, perfil: 'empresa' }, ip: '10.200.' + i + '.9', headers: { Origin: BASE.origin } });
  const sc = r.headers && r.headers['set-cookie'];
  if (r.status >= 300 || !sc) throw new Error('cadastro ' + i + ': ' + r.status + ' ' + JSON.stringify(r.json));
  cookie = sc.map((c) => c.split(';')[0]).join('; ');
  // Mais de 49 TVs é Enterprise (server/plans.js), que não se ativa pelo painel: o operador grava no banco.
  if (PSQL.length) execFileSync('psql', [...PSQL, '-qc', "UPDATE tenants SET plan='enterprise', plan_status='active', plan_renews_at=" + (Date.now() + 30 * 864e5) + " WHERE name='" + nome + "'"]);
  await pedir('PUT', '/api/brand', { corpo: { nome: 'Metalúrgica Alfa', cores: ['#23395d', '#f4a261'] }, cookie });
  return { i, email, nome, cookie };
}

function infoDaTela() {
  return { ua: 'Mozilla/5.0 (Linux; Android 9; TV box) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 MultiTelasTV/1.0.60', w: 1920, h: 1080, dpr: 1, versao: 'carga', app: '1.0.60', appCodigo: 60 };
}

async function provisionar(alvo) {
  const cfg = montarProgramaRh({});
  while (frota.tvs.length < alvo) {
    const n = frota.tvs.length;
    const ci = n < CONTA_GRANDE ? 0 : 1 + Math.floor((n - CONTA_GRANDE) / CONTA);
    if (!frota.contas[ci]) { frota.contas[ci] = await criarConta(ci); guardarFrota(); anotar('conta ' + ci + ' criada'); }
    const conta = frota.contas[ci];
    // Um IP de escritório para cada 50 TVs (o limite é 60 TVs novas por hora por IP).
    const naConta = ci === 0 ? n : (n - CONTA_GRANDE) % CONTA;
    const ip = '10.' + (10 + ci) + '.' + Math.floor(naConta / 50) + '.1';
    const lote = [];
    for (let k = 0; k < 25 && frota.tvs.length + lote.length < alvo; k++) lote.push(k);
    const novas = await Promise.all(lote.map(async (k) => {
      const ipk = '10.' + (10 + ci) + '.' + Math.floor((naConta + k) / 50) + '.1';
      const d = await pedir('POST', '/api/devices', { ip: ipk, rotulo: 'prov:criar' });
      if (d.status !== 201) throw new Error('criar TV: ' + d.status + ' ' + JSON.stringify(d.json));
      await pedir('POST', '/api/devices/' + d.json.id + '/heartbeat', { corpo: infoDaTela(), headers: { 'x-device-token': d.json.deviceToken }, rotulo: 'prov:pulso' });
      const p = await pedir('POST', '/api/pair', { corpo: { code: d.json.code, name: 'TV ' + (naConta + k + 1), nova: true }, cookie: conta.cookie, ip: ipk, rotulo: 'prov:parear' });
      if (p.status !== 200) throw new Error('parear: ' + p.status + ' ' + JSON.stringify(p.json));
      const put = await pedir('PUT', '/api/devices/' + d.json.id + '/config', { corpo: cfg, cookie: conta.cookie, rotulo: 'prov:publicar' });
      if (put.status !== 200) throw new Error('publicar: ' + put.status + ' ' + JSON.stringify(put.json));
      return { id: d.json.id, token: d.json.deviceToken, conta: ci, ip };
    }));
    frota.tvs.push(...novas);
    guardarFrota();
    if (frota.tvs.length % 100 === 0) anotar('frota: ' + frota.tvs.length + ' TVs');
  }
}

/* ---------------- Uma TV ---------------- */
const tvsVivas = [];
const sse = { abertos: 0, aberturas: 0, quedas: 0, recusas: 0, entregas: [] };
const publicacoes = new Map(); // updatedAt -> instante do envio (para medir a entrega pelo SSE)

function aleatorio(a, b) { return a + Math.random() * (b - a); }

class Tv {
  constructor(t) { this.t = t; this.h = { 'x-device-token': t.token }; this.timers = []; this.parada = false; this.es = null; }
  api(metodo, sub, rotulo, corpo, extra) {
    return pedir(metodo, '/api/devices/' + this.t.id + (sub ? '/' + sub : ''), Object.assign({ headers: this.h, rotulo, corpo }, extra || {}));
  }
  cada(ms, fn, primeiro) {
    const t0 = setTimeout(() => { if (this.parada) return; fn(); this.timers.push(setInterval(() => { if (!this.parada) fn(); }, ms)); }, primeiro);
    this.timers.push(t0);
  }
  async ligar() {
    await this.api('GET', '', 'tv:meta');
    await this.api('GET', 'config', 'tv:config');
    this.abrirSse();
    // Ligadas em horas diferentes: cada TV tem a sua fase dentro do intervalo.
    this.cada(30000, () => this.api('POST', 'heartbeat', 'tv:pulso', infoDaTela()), aleatorio(0, 30000));
    this.cada(30000, () => this.api('POST', 'audio-estado', 'tv:audio-estado', { ativo: false, tocando: false, faixa: '', volume: 60 }), aleatorio(0, 30000));
    this.cada(60000, () => this.api('GET', 'senha', 'tv:senha'), aleatorio(0, 60000));
    this.cada(300000, () => this.api('GET', 'kpis', 'tv:kpis'), aleatorio(0, 300000));
    this.cada(300000, () => this.api('GET', 'planilhas', 'tv:planilhas'), aleatorio(0, 300000));
    this.cada(300000, () => this.api('POST', 'exibicoes', 'tv:exibicoes', this.loteExibicoes()), aleatorio(30000, 90000));
    this.api('GET', 'birthdays', 'tv:aniversarios');
  }
  loteExibicoes() {
    const hora = Math.floor(Date.now() / 3600000) * 3600000;
    return { lote: 'l' + Math.random().toString(36).slice(2, 14), itens: Array.from({ length: 16 }, (_, k) => ({ hora, zona: k < 8 ? 'principal' : 'lateral', chave: 'peca-' + k, rotulo: 'Peça ' + k, tipo: 'peca-html', vezes: 3, segundos: 60 })) };
  }
  async abrirSse() {
    if (this.parada) return;
    const p = await this.api('POST', 'passe', 'tv:passe');
    if (!p.json || !p.json.passe) { this.timers.push(setTimeout(() => this.abrirSse(), 15000)); return; }
    const t0 = performance.now();
    const abertoEm = Date.now();
    let aberto = false;
    let fechou = false;
    const reabrir = () => {
      if (fechou) return; fechou = true;
      if (aberto) { sse.abertos--; sse.quedas++; }
      if (this.parada) return;
      const durou = Date.now() - abertoEm;
      this.timers.push(setTimeout(() => this.abrirSse(), durou > 60000 ? 2000 : 15000));
    };
    const r = http.get({ host: BASE.hostname, port: BASE.port, path: '/api/devices/' + this.t.id + '/events?passe=' + encodeURIComponent(p.json.passe), headers: { Accept: 'text/event-stream' }, agent: false }, (res) => {
      if (res.statusCode !== 200) { sse.recusas++; stat('tv:sse-abrir').s5xx += res.statusCode >= 500 ? 1 : 0; stat('tv:sse-abrir').erros++; res.resume(); res.on('end', reabrir); return; }
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (/^event: (.*)$/m.exec(bloco) || [])[1];
          const dado = (/^data: (.*)$/m.exec(bloco) || [])[1];
          if (ev === 'ready' && !aberto) { aberto = true; sse.abertos++; sse.aberturas++; stat('tv:sse-abrir').ms.push(performance.now() - t0); }
          else if (ev) this.evento(ev, dado);
        }
      });
      res.on('end', reabrir);
      res.on('error', reabrir);
    });
    r.on('error', () => { stat('tv:sse-abrir').rede++; reabrir(); });
    this.es = r;
    // O proxy do Railway corta a conexão aos 15 min (js/cloud.js).
    this.timers.push(setTimeout(() => { try { r.destroy(); } catch (e) { /* já foi */ } }, 15 * 60000 + aleatorio(-30000, 30000)));
  }
  evento(ev, dado) {
    let d = {}; try { d = JSON.parse(dado || '{}'); } catch (e) { /* vazio */ }
    if (ev === 'config') {
      const enviado = publicacoes.get(d.updatedAt);
      if (enviado) sse.entregas.push(Date.now() - enviado);
      this.api('GET', 'config', 'tv:config(sse)');
    } else if (ev === 'comando' && d.acao === 'estado') {
      this.api('POST', 'estado', 'tv:estado', { layoutId: 'corporate', tela: { w: 1920, h: 1080 }, zonas: { principal: { item: { type: 'peca-html', origem: { base: 'gente-comunicado' } } } } });
    }
  }
  parar() { this.parada = true; this.timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); if (this.es) try { this.es.destroy(); } catch (e) { /* já foi */ } }
}

/* ---------------- Gente no painel (conta grande) ---------------- */
const painel = { publicou: 0, falhouLote: [] };
function pessoaNoPainel(k) {
  const conta = frota.contas[0];
  const minhas = () => frota.tvs.filter((t) => t.conta === 0 && tvsVivas.some((v) => v.t.id === t.id));
  const cfg = montarProgramaRh({});
  let parar = false;
  (async () => {
    await espera(aleatorio(0, 15000));
    let n = 0;
    while (!parar) {
      const tvs = minhas();
      if (!tvs.length) { await espera(5000); continue; }
      const ids = tvs.slice(0, 25).map((t) => t.id).join(',');
      const acao = n++ % 6;
      if (acao === 0) await pedir('GET', '/api/devices?agora=1', { cookie: conta.cookie, rotulo: 'painel:telas(agora=1)', prazo: 120000 });
      else if (acao === 1) await pedir('GET', '/api/devices/configs?ids=' + ids, { cookie: conta.cookie, rotulo: 'painel:configs(25)' });
      else if (acao === 2) await pedir('GET', '/api/devices/estados?ids=' + ids, { cookie: conta.cookie, rotulo: 'painel:estados(25)' });
      else if (acao === 3) {
        const tv = tvs[Math.floor(Math.random() * tvs.length)];
        await pedir('POST', '/api/devices/' + tv.id + '/comando', { corpo: { acao: 'estado' }, cookie: conta.cookie, rotulo: 'painel:ver-a-tela' });
      } else if (acao === 4) {
        const tv = tvs[Math.floor(Math.random() * tvs.length)];
        const r = await pedir('PUT', '/api/devices/' + tv.id + '/config', { corpo: cfg, cookie: conta.cookie, rotulo: 'painel:publicar-1' });
        if (r.json && r.json.updatedAt) publicacoes.set(r.json.updatedAt, Date.now());
      } else {
        // O aviso rápido em 20 TVs: o envio em lote (o corpo leva a programação de cada uma).
        const alvo = tvs.slice(0, 20);
        const r = await pedir('POST', '/api/lote', { corpo: { itens: alvo.map((t) => ({ id: t.id, config: cfg })), descricao: 'Aviso: carga' }, cookie: conta.cookie, rotulo: 'painel:aviso-lote(20)', prazo: 120000 });
        if (r.json && r.json.telas) { const agora = Date.now(); r.json.telas.forEach((t) => publicacoes.set(t.updatedAt, agora)); painel.publicou++; }
        else painel.falhouLote.push(r.status);
      }
      await espera(aleatorio(10000, 20000));
    }
  })();
  return () => { parar = true; };
}

/* ---------------- Medidas do degrau ---------------- */
function pct(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))].toFixed(1); }
function cpuDoPostgres() {
  let tiques = 0;
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const s = fs.readFileSync('/proc/' + d + '/stat', 'utf8');
      if (!s.includes('(postgres)')) continue;
      const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
      tiques += Number(f[11]) + Number(f[12]);
    } catch (e) { /* sumiu */ }
  }
  return tiques; // em 1/100 s
}
function memLivreMb() { const m = /MemAvailable:\s+(\d+)/.exec(fs.readFileSync('/proc/meminfo', 'utf8')); return m ? Math.round(Number(m[1]) / 1024) : 0; }
function sondaNoIntervalo(de, ate) {
  if (!SONDA) return null;
  let linhas = [];
  try { linhas = fs.readFileSync(SONDA, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((l) => l.t >= de && l.t <= ate); } catch (e) { return null; }
  if (!linhas.length) return null;
  const media = (k) => +(linhas.reduce((a, l) => a + l[k], 0) / linhas.length).toFixed(1);
  const max = (k) => Math.max(...linhas.map((l) => l[k]));
  return {
    cpuMedia: media('cpu'), cpuMax: max('cpu'), elP50: media('elP50'), elP99Media: media('elP99'), elP99Max: max('elP99'), elMax: max('elMax'),
    rssMb: +(max('rss') / 1048576).toFixed(0), heapMb: +(max('heapUsed') / 1048576).toFixed(0), sockets: max('sockets'), timers: max('timers'),
  };
}
const elGerador = monitorEventLoopDelay({ resolution: 10 }); elGerador.enable();

function fecharDegrau(n, de, pgAntes, cpuGerAntes) {
  const ate = Date.now();
  const rotas = {};
  for (const [r, s] of est) {
    if (r.startsWith('prov:')) continue;
    rotas[r] = { n: s.ms.length, rps: +(s.ms.length / ((ate - de) / 1000)).toFixed(1), p50: pct(s.ms, 50), p95: pct(s.ms, 95), p99: pct(s.ms, 99), max: s.ms.length ? +Math.max(...s.ms).toFixed(0) : null, erros: s.erros, s429: s.s429, s5xx: s.s5xx, rede: s.rede, s4xx: s.s4xx };
  }
  const total = Object.values(rotas).reduce((a, r) => a + r.n, 0);
  const erros = Object.values(rotas).reduce((a, r) => a + r.erros, 0);
  const cg = process.cpuUsage(cpuGerAntes);
  const r = {
    tvs: n, janelaS: Math.round((ate - de) / 1000), pedidos: total, rps: +(total / ((ate - de) / 1000)).toFixed(1), taxaErro: total ? +(100 * erros / total).toFixed(3) : 0,
    sse: { abertos: sse.abertos, aberturas: sse.aberturas, quedas: sse.quedas, recusas: sse.recusas, entregaP50: pct(sse.entregas, 50), entregaP95: pct(sse.entregas, 95), entregas: sse.entregas.length },
    servidor: sondaNoIntervalo(de, ate),
    postgresCpu: +((cpuDoPostgres() - pgAntes) / ((ate - de) / 1000)).toFixed(1), // % de um núcleo
    gerador: { cpu: +(((cg.user + cg.system) / 1000) / (ate - de) * 100).toFixed(1), elP99: Math.max(0, +(elGerador.percentile(99) / 1e6 - 10).toFixed(1)) },
    memLivreMb: memLivreMb(),
    painel: { avisosEnviados: painel.publicou, avisosFalhos: painel.falhouLote.slice() },
    rotas,
  };
  if (r.servidor) r.servidor.kbPorTv = n ? +(((r.servidor.rssMb - (base.rssMb || 0)) * 1024) / n).toFixed(0) : null;
  return r;
}
const base = {};

function zerarJanela() { est.clear(); sse.entregas = []; sse.quedas = 0; sse.recusas = 0; sse.aberturas = 0; painel.publicou = 0; painel.falhouLote = []; elGerador.reset(); }

async function main() {
  anotar('início: ' + JSON.stringify({ BASE: BASE.href, DEGRAUS, RAMPA_S, FIRME_S, PAINEL, SAIDA }));
  const s0 = sondaNoIntervalo(Date.now() - 20000, Date.now());
  if (s0) Object.assign(base, s0);
  anotar('servidor parado: ' + JSON.stringify(base));
  await provisionar(Math.max(...DEGRAUS));
  anotar('frota pronta: ' + frota.tvs.length + ' TVs em ' + frota.contas.length + ' contas');
  est.clear();
  const pararPainel = [];
  const resultados = [];
  for (const n of DEGRAUS) {
    if (memLivreMb() < MIN_LIVRE_MB) { anotar('memória livre baixa (' + memLivreMb() + ' MB): paro antes de ' + n); break; }
    const novas = frota.tvs.slice(tvsVivas.length, n);
    anotar('degrau ' + n + ': ligando ' + novas.length + ' TVs em ' + RAMPA_S + ' s');
    for (let i = 0; i < novas.length; i++) {
      const tv = new Tv(novas[i]);
      tvsVivas.push(tv);
      setTimeout(() => tv.ligar(), (i / novas.length) * RAMPA_S * 1000);
    }
    if (!pararPainel.length) for (let k = 0; k < PAINEL; k++) pararPainel.push(pessoaNoPainel(k));
    await espera(RAMPA_S * 1000 + 15000);
    zerarJanela();
    const de = Date.now();
    const pg = cpuDoPostgres();
    const cg = process.cpuUsage();
    await espera(FIRME_S * 1000);
    const r = fecharDegrau(n, de, pg, cg);
    resultados.push(r);
    fs.writeFileSync(path.join(SAIDA, 'degrau-' + n + '.json'), JSON.stringify(r, null, 2));
    const pr = (k) => r.rotas[k] ? r.rotas[k].p50 + '/' + r.rotas[k].p95 + '/' + r.rotas[k].p99 : '-';
    anotar('degrau ' + n + ': ' + r.rps + ' req/s, erro ' + r.taxaErro + '%, pulso ' + pr('tv:pulso') + ' ms, senha ' + pr('tv:senha') + ', config ' + pr('tv:config(sse)')
      + ' | servidor ' + JSON.stringify(r.servidor) + ' | pg ' + r.postgresCpu + '% | sse ' + JSON.stringify(r.sse) + ' | gerador ' + JSON.stringify(r.gerador) + ' | livre ' + r.memLivreMb + ' MB');
  }
  fs.writeFileSync(path.join(SAIDA, 'resultados.json'), JSON.stringify(resultados, null, 2));
  pararPainel.forEach((f) => f());
  tvsVivas.forEach((t) => t.parar());
  anotar('fim');
  setTimeout(() => process.exit(0), 2000);
}

main().catch((e) => { anotar('FALHOU: ' + (e && e.stack || e)); process.exit(1); });
