/*
 * tools/carga/tabela.mjs — a tabela do relatório a partir dos degraus.
 *
 *   node tools/carga/tabela.mjs <pasta-da-carga> [maquina.jsonl]
 *
 * Lê degrau-N.json (carga-tvs.mjs) e, se houver, a CPU do Postgres de
 * maquina.jsonl (maquina.mjs) na mesma janela. Sai em Markdown.
 */
import fs from 'node:fs';
import path from 'node:path';

const pasta = process.argv[2];
const maq = process.argv[3] ? fs.readFileSync(process.argv[3], 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
const degraus = fs.readdirSync(pasta).filter((f) => /^degrau-\d+\.json$/.test(f))
  .map((f) => JSON.parse(fs.readFileSync(path.join(pasta, f), 'utf8'))).sort((a, b) => a.tvs - b.tvs);
const p = (r, k) => (r.rotas[k] ? r.rotas[k].p50 + ' / ' + r.rotas[k].p95 + ' / ' + r.rotas[k].p99 : '–');
// A janela de cada degrau termina quando o arquivo foi escrito; começa janelaS antes.
function pgNaJanela(r, fim) {
  const ini = fim - r.janelaS * 1000;
  const l = maq.filter((m) => m.t >= ini && m.t <= fim);
  return l.length ? (l.reduce((a, m) => a + m.pgCpu, 0) / l.length).toFixed(0) + '%' : '–';
}
console.log('| TVs | pedidos/s | pulso p50/p95/p99 (ms) | senha p50/p95/p99 | config pelo SSE p50/p95/p99 | erros | CPU do Node (média / pico) | CPU do Postgres | RSS (MB) | heap (MB) | event loop p99 média / pior (ms) | sockets | SSE abertos |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of degraus) {
  const s = r.servidor || {};
  const arq = path.join(pasta, 'degrau-' + r.tvs + '.json');
  const fim = fs.statSync(arq).mtimeMs;
  console.log('| ' + [r.tvs, r.rps, p(r, 'tv:pulso'), p(r, 'tv:senha'), p(r, 'tv:config(sse)'), r.taxaErro + '%',
    (s.cpuMedia ?? '–') + '% / ' + (s.cpuMax ?? '–') + '%', pgNaJanela(r, fim), s.rssMb ?? '–', s.heapMb ?? '–',
    (s.elP99Media ?? '–') + ' / ' + (s.elMax ?? '–'), s.sockets ?? '–', r.sse.abertos].join(' | ') + ' |');
}
console.log('');
console.log('| TVs | Telas da conta grande (`?agora=1`) p50/p95 | aviso em 20 TVs (lote) p50/p95 | publicar 1 TV p50/p95 | programação de 25 TVs p50/p95 |');
console.log('|---|---|---|---|---|');
const q = (r, k) => (r.rotas[k] ? r.rotas[k].p50 + ' / ' + r.rotas[k].p95 : '–');
for (const r of degraus) console.log('| ' + [r.tvs, q(r, 'painel:telas(agora=1)'), q(r, 'painel:aviso-lote(20)'), q(r, 'painel:publicar-1'), q(r, 'painel:configs(25)')].join(' | ') + ' |');
