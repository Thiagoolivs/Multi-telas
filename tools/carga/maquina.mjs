/*
 * tools/carga/maquina.mjs — a máquina por fora, a cada 10 s, numa linha JSON:
 * CPU do Postgres (todos os processos dele, inclusive os que já saíram —
 * cutime/cstime do postmaster), carga da máquina e memória livre.
 *
 *   node tools/carga/maquina.mjs > maquina.jsonl
 */
import fs from 'node:fs';

const HZ = 100;
function tiquesDoPostgres() {
  let t = 0;
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const s = fs.readFileSync('/proc/' + d + '/stat', 'utf8');
      if (!s.includes('(postgres)')) continue;
      const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
      t += Number(f[11]) + Number(f[12]) + Number(f[13]) + Number(f[14]);
    } catch (e) { /* sumiu */ }
  }
  return t;
}
let antes = { t: Date.now(), pg: tiquesDoPostgres() };
setInterval(() => {
  const agora = { t: Date.now(), pg: tiquesDoPostgres() };
  const mem = fs.readFileSync('/proc/meminfo', 'utf8');
  const livre = Number((/MemAvailable:\s+(\d+)/.exec(mem) || [])[1]) / 1024;
  const carga = fs.readFileSync('/proc/loadavg', 'utf8').split(' ').slice(0, 3).map(Number);
  console.log(JSON.stringify({ t: agora.t, pgCpu: +(((agora.pg - antes.pg) / HZ) / ((agora.t - antes.t) / 1000) * 100).toFixed(1), carga, livreMb: Math.round(livre) }));
  antes = agora;
}, 10000);
