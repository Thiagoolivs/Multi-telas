/*
 * tools/carga/republicar.mjs — o RH publicando ao longo do dia, na TV do soak.
 *
 *   REP_BASE=http://127.0.0.1:6091 REP_EMAIL=<dono> REP_TV=<dev_...> REP_MIN=10 node tools/carga/republicar.mjs
 *
 * A cada REP_MIN minutos grava de novo a programação de RH na TV, alternando
 * a transição e a ordem das peças: o player recebe o aviso pelo SSE, busca a
 * config e REFAZ o palco inteiro (todas as zonas param e sobem de novo). É
 * o caminho em que timers, ouvintes e vídeos de zona velha mais escapam.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const req = createRequire(import.meta.url);
const { montarProgramaRh } = req('./programa-rh.cjs');
const BASE = process.env.REP_BASE || 'http://127.0.0.1:6091';
const MIN = Number(process.env.REP_MIN) || 10;
const PECA_S = Number(process.env.REP_PECA) || 6;
const LOG = process.env.REP_LOG || 'republicar.log';
const anotar = (s) => fs.appendFileSync(LOG, new Date().toISOString() + ' ' + s + '\n');

let cookie = '';
async function api(metodo, caminho, corpo) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: Object.assign({ Origin: BASE }, corpo !== undefined ? { 'Content-Type': 'application/json' } : {}, cookie ? { Cookie: cookie } : {}),
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  return { status: r.status, json: await r.json().catch(() => null) };
}

await api('POST', '/api/auth/login', { email: process.env.REP_EMAIL, password: 'senha-de-teste-123' });
let n = 0;
for (;;) {
  await new Promise((r) => setTimeout(r, MIN * 60000));
  n++;
  const cfg = montarProgramaRh({ duracao: PECA_S, duracaoLateral: Math.max(4, PECA_S - 1), transicao: n % 2 ? 'fade' : 'cinematic' });
  // A ordem muda: a primeira peça de cada publicação é outra.
  const p = cfg.zonas.principal.items;
  for (let i = 0; i < n % p.length; i++) p.push(p.shift());
  const r = await api('PUT', '/api/devices/' + process.env.REP_TV + '/config', cfg);
  anotar('publicação ' + n + ': ' + r.status + ' ' + JSON.stringify(r.json));
}
