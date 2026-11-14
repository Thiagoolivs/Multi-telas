/*
 * tools/carga/tempestade.mjs — N TVs ligando ao mesmo tempo (volta da
 * energia na sede, ou o deploy que troca o service worker de todas).
 *
 *   TEMP_BASE=http://127.0.0.1:6090 TEMP_FROTA=<frota.json> TEMP_N=300 TEMP_MIDIA=1 node tools/carga/tempestade.mjs
 *
 * Cada TV faz o boot do navegador: /tv → player.html → o pacote de scripts
 * e as folhas (o service worker revalida em segundo plano mesmo com cache,
 * stale-while-revalidate em sw.js) → a si mesma e a programação. Com
 * TEMP_MIDIA=1, baixa também as fotos e os vídeos da programação (a
 * primeira instalação, ou uma programação nova com vídeo do banco — os
 * vídeos de pecas-ouro/ saem do próprio servidor, não do R2).
 */
import http from 'node:http';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);
const P = req('../../js/peca-html.js');
const BASE = new URL(process.env.TEMP_BASE || 'http://127.0.0.1:6090');
const frota = JSON.parse(fs.readFileSync(process.env.TEMP_FROTA, 'utf8'));
const N = Number(process.env.TEMP_N) || 300;
const MIDIA = process.env.TEMP_MIDIA === '1';
const JANELA_S = Number(process.env.TEMP_JANELA_S) || 5;
const SONDA = process.env.TEMP_SONDA || '';
// TEMP_LENTO_KBPS: a TV lê a mídia nesta velocidade (o link da loja dividido entre as TVs), para ver quanto o servidor segura enquanto isso.
const LENTO_KBPS = Number(process.env.TEMP_LENTO_KBPS) || 0;

const agente = new http.Agent({ keepAlive: true, maxSockets: 512 });
function pegar(caminho, headers) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const r = http.get({ host: BASE.hostname, port: BASE.port, path: caminho, agent: agente, headers: Object.assign({ 'Accept-Encoding': 'gzip, br' }, headers || {}) }, (res) => {
      let bytes = 0;
      const partes = [];
      res.on('data', (c) => {
        bytes += c.length;
        if (headers && headers['x-device-token']) partes.push(c);
        else if (LENTO_KBPS && /\/pecas-ouro\/|\/media\//.test(caminho)) { res.pause(); setTimeout(() => res.resume(), (c.length * 8) / LENTO_KBPS); }
      });
      res.on('end', () => {
        let corpo = partes.length ? Buffer.concat(partes) : null;
        const enc = res.headers['content-encoding'];
        try { if (corpo && enc === 'br') corpo = zlib.brotliDecompressSync(corpo); else if (corpo && enc === 'gzip') corpo = zlib.gunzipSync(corpo); } catch (e) { corpo = null; }
        resolve({ status: res.statusCode, ms: performance.now() - t0, bytes, corpo: corpo ? corpo.toString('utf8') : '' });
      });
    });
    r.on('error', (e) => resolve({ status: 0, ms: performance.now() - t0, bytes: 0, erro: e.code }));
    r.setTimeout(120000, () => r.destroy(new Error('prazo')));
  });
}

async function bootar(tv) {
  const t0 = performance.now();
  let bytes = 0;
  let erros = 0;
  const conta = (r) => { bytes += r.bytes; if (r.status === 0 || r.status >= 400) erros++; return r; };
  conta(await pegar('/tv'));
  conta(await pegar('/player.html?cloud=1'));
  await Promise.all(['/js/compat.js', '/js/perf.js', '/js/tv.pacote.js', '/css/player.css', '/css/animacao.css', '/fonts/fontes.css'].map((u) => pegar(u).then(conta)));
  const h = { 'x-device-token': tv.token };
  conta(await pegar('/api/devices/' + tv.id, h));
  const cfg = conta(await pegar('/api/devices/' + tv.id + '/config', h));
  const pronto = performance.now() - t0;
  if (MIDIA && cfg.corpo) {
    let c = null; try { c = JSON.parse(cfg.corpo); } catch (e) { /* sem programação */ }
    const urls = new Set();
    for (const z of Object.values((c && c.zonas) || {})) {
      for (const it of [].concat(z.items || [], z.pecas || [])) {
        if (it && it.type === 'peca-html') { P.fotosDoItem(it, []).forEach((u) => urls.add(u)); (P.videosDoItem(it, []) || []).forEach((u) => urls.add(u)); }
      }
    }
    await Promise.all([...urls].map((u) => pegar(u).then(conta)));
  }
  return { pronto, total: performance.now() - t0, bytes, erros };
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]); };
const tvs = frota.tvs.slice(0, N);
const inicio = Date.now();
const res = await Promise.all(tvs.map((tv, i) => new Promise((r) => setTimeout(() => bootar(tv).then(r), (i / tvs.length) * JANELA_S * 1000))));
const fim = Date.now();
const prontos = res.map((r) => r.pronto);
const totais = res.map((r) => r.total);
const saida = {
  tvs: N, midia: MIDIA, janelaS: JANELA_S, duracaoS: +((fim - inicio) / 1000).toFixed(1),
  ateAProgramacao: { p50: pct(prontos, 50), p95: pct(prontos, 95), max: pct(prontos, 100) },
  bootCompleto: { p50: pct(totais, 50), p95: pct(totais, 95), max: pct(totais, 100) },
  mbBaixados: +(res.reduce((a, r) => a + r.bytes, 0) / 1048576).toFixed(0),
  erros: res.reduce((a, r) => a + r.erros, 0),
};
if (SONDA) {
  const l = fs.readFileSync(SONDA, 'utf8').trim().split('\n').map((x) => JSON.parse(x)).filter((x) => x.t >= inicio && x.t <= fim + 5000);
  if (l.length) saida.servidor = { cpuMax: Math.max(...l.map((x) => x.cpu)), elMax: Math.max(...l.map((x) => x.elMax)), rssMaxMb: Math.round(Math.max(...l.map((x) => x.rss)) / 1048576), heapMaxMb: Math.round(Math.max(...l.map((x) => x.heapUsed)) / 1048576) };
}
console.log(JSON.stringify(saida));
setTimeout(() => process.exit(0), 500);
