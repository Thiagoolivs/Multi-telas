/*
 * tools/carga/rss-arvore.mjs — a memória de cada processo do navegador do
 * soak, separada (renderizador, GPU, rede...), a cada RSS_S segundos.
 *
 *   node tools/carga/rss-arvore.mjs <pid-raiz> > rss.jsonl
 *
 * O heap do JS e os nós do DOM dizem o que a página segura; o RSS por
 * processo diz o que o navegador segura por fora (vídeo decodificado,
 * texturas, cache de imagem).
 */
import fs from 'node:fs';

const RAIZ = Number(process.argv[2]);
const S = Number(process.env.RSS_S) || 60;
function arvore() {
  const filhos = new Map();
  const info = new Map();
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const st = fs.readFileSync('/proc/' + d + '/stat', 'utf8');
      const ppid = Number(st.slice(st.lastIndexOf(')') + 2).split(' ')[1]);
      if (!filhos.has(ppid)) filhos.set(ppid, []);
      filhos.get(ppid).push(Number(d));
      const cmd = fs.readFileSync('/proc/' + d + '/cmdline', 'utf8');
      const tipo = (/--type=([a-z-]+)/.exec(cmd) || [])[1] || (/--utility-sub-type=([\w.]+)/.exec(cmd) || [])[1] || (cmd.includes('chrome') ? 'browser' : 'outro');
      const sub = (/--utility-sub-type=([\w.]+)/.exec(cmd) || [])[1];
      const rss = Number((/VmRSS:\s+(\d+)/.exec(fs.readFileSync('/proc/' + d + '/status', 'utf8')) || [])[1] || 0) * 1024;
      info.set(Number(d), { tipo: sub ? tipo + ':' + sub.split('.').pop() : tipo, rss });
    } catch (e) { /* sumiu */ }
  }
  const saida = {};
  const fila = [RAIZ];
  while (fila.length) {
    const p = fila.pop();
    const i = info.get(p);
    if (i && p !== RAIZ) saida[i.tipo + ':' + p] = Math.round(i.rss / 1048576);
    (filhos.get(p) || []).forEach((f) => fila.push(f));
  }
  return saida;
}
const linha = () => console.log(JSON.stringify(Object.assign({ t: Date.now() }, arvore())));
linha();
setInterval(linha, S * 1000);
