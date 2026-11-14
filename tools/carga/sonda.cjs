/*
 * tools/carga/sonda.cjs — o medidor DENTRO do servidor, sem mexer nele.
 *
 *   node --require ./tools/carga/sonda.cjs server.js
 *   SONDA_ARQ=/caminho/sonda.jsonl  (padrão: ./sonda.jsonl)
 *
 * A cada SONDA_MS (5 s) grava uma linha JSON com: atraso do event loop
 * (p50/p99/máx, em ms), CPU do processo (% de UM núcleo), RSS e heap, e os
 * recursos abertos (sockets TCP, timers). O atraso do event loop é o
 * primeiro sinal de que o processo único não dá conta: tudo o que a TV pede
 * espera na mesma fila.
 */
'use strict';
const fs = require('fs');
const { monitorEventLoopDelay } = require('perf_hooks');

const ARQ = process.env.SONDA_ARQ || 'sonda.jsonl';
const MS = Number(process.env.SONDA_MS) || 5000;
const RES = 10;
const h = monitorEventLoopDelay({ resolution: RES });
// O histograma mede o intervalo entre os disparos do relógio de RES ms: o atraso é o que passa disso.
const atraso = (ns) => Math.max(0, +(ns / 1e6 - RES).toFixed(2));
h.enable();
let cpuAntes = process.cpuUsage();
let tAntes = process.hrtime.bigint();

function contar() {
  const r = { TCPSocketWrap: 0, Timeout: 0, outros: 0 };
  try {
    for (const k of process.getActiveResourcesInfo()) {
      if (k in r) r[k]++; else r.outros++;
    }
  } catch (e) { /* Node sem getActiveResourcesInfo */ }
  return r;
}

const t = setInterval(() => {
  const agora = process.hrtime.bigint();
  const dtUs = Number(agora - tAntes) / 1000;
  const c = process.cpuUsage(cpuAntes);
  cpuAntes = process.cpuUsage();
  tAntes = agora;
  const m = process.memoryUsage();
  const rec = contar();
  const linha = {
    t: Date.now(),
    elP50: atraso(h.percentile(50)),
    elP99: atraso(h.percentile(99)),
    elMax: atraso(h.max),
    cpu: +(((c.user + c.system) / dtUs) * 100).toFixed(1),
    rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external,
    sockets: rec.TCPSocketWrap, timers: rec.Timeout,
  };
  h.reset();
  try { fs.appendFileSync(ARQ, JSON.stringify(linha) + '\n'); } catch (e) { /* disco cheio: segue */ }
}, MS);
t.unref();
