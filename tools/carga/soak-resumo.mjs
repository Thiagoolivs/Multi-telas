/*
 * tools/carga/soak-resumo.mjs — o resumo de um soak, a partir de um trecho.
 *
 *   node tools/carga/soak-resumo.mjs <amostras.jsonl> [min-inicial] [min-final] [rss.jsonl]
 *
 * Inclinação por hora (regressão linear) de heap, nós, ouvintes, vídeos,
 * imagens, timers e RSS; médias de quadros e tarefas longas; trocas de peça.
 * O trecho existe porque a página pode ter sido recarregada no meio (deploy):
 * a inclinação se mede dentro de UMA vida da página.
 */
import fs from 'node:fs';

const [arq, de, ate, rssArq] = process.argv.slice(2);
const todas = fs.readFileSync(arq, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const l = todas.filter((a) => a.min >= Number(de || 0) && a.min <= Number(ate || 1e9));
function inclinacao(xs, ys) {
  const n = xs.length; if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  return den ? num / den : 0;
}
const h = l.map((a) => a.min / 60);
const serie = (f) => l.map(f).filter((v) => v != null);
const r = {
  amostras: l.length, deMin: l[0] && l[0].min, ateMin: l[l.length - 1] && l[l.length - 1].min,
  trocasNoTrecho: l.length ? l[l.length - 1].swaps - l[0].swaps : 0,
  porHora: {}, faixa: {},
};
const campos = {
  heapMB: (a) => a.heapUsado / 1048576, nos: (a) => a.nos, ouvintes: (a) => a.ouvintes, documentos: (a) => a.documentos,
  video: (a) => a.video, img: (a) => a.img, intervals: (a) => a.timers && a.timers.intervals, timeouts: (a) => a.timers && a.timers.timeouts,
  rssNavegadorMB: (a) => a.rssNavegador / 1048576, rssRenderizadorMB: (a) => (a.rssRenderizador ? a.rssRenderizador / 1048576 : null),
  localStorageKB: (a) => a.localStorageBytes / 1024,
};
for (const [k, f] of Object.entries(campos)) {
  const ys = serie(f);
  if (ys.length !== l.length) continue;
  r.porHora[k] = +inclinacao(h, ys).toFixed(3);
  r.faixa[k] = [+Math.min(...ys).toFixed(2), +Math.max(...ys).toFixed(2), +ys[0].toFixed(2), +ys[ys.length - 1].toFixed(2)];
}
const fps = serie((a) => (a.fps != null && a.fps > 0 ? a.fps : null));
r.fpsMedio = fps.length ? +(fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1) : null;
r.piorQuadroMs = Math.max(...serie((a) => a.piorQuadro));
if (l.length > 1) {
  const dt = (l[l.length - 1].t - l[0].t) / 60000;
  r.tarefasLongasPorMin = +((l[l.length - 1].longTasks - l[0].longTasks) / dt).toFixed(1);
  r.msEmTarefaLongaPorMin = Math.round((l[l.length - 1].longMs - l[0].longMs) / dt);
  r.trocasPorMin = +(r.trocasNoTrecho / dt).toFixed(1);
}
r.videoTocandoVisto = l.filter((a) => a.videoTocando > 0).length;
r.leve = l.length ? l[l.length - 1].leve : null;
r.errosPagina = l.length ? l[l.length - 1].errosPagina : null;
if (rssArq) {
  const t0 = l[0].t, t1 = l[l.length - 1].t;
  const rs = fs.readFileSync(rssArq, 'utf8').trim().split('\n').map((x) => JSON.parse(x)).filter((x) => x.t >= t0 && x.t <= t1);
  const ren = rs.map((x) => Object.entries(x).filter(([k]) => k.startsWith('renderer')).reduce((a, [, v]) => a + v, 0));
  const gpu = rs.map((x) => Object.entries(x).filter(([k]) => k.startsWith('gpu')).reduce((a, [, v]) => a + v, 0));
  const hh = rs.map((x) => x.t / 3600000);
  r.renderizadorMB = { min: Math.min(...ren), max: Math.max(...ren), porHora: +inclinacao(hh, ren).toFixed(1) };
  r.gpuMB = { min: Math.min(...gpu), max: Math.max(...gpu), porHora: +inclinacao(hh, gpu).toFixed(1) };
}
console.log(JSON.stringify(r, null, 1));
