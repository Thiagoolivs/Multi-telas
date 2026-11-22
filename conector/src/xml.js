'use strict';
/*
 * Um leitor de XML mínimo, para RSS e Atom.
 *
 * Mínimo de propósito: um parser completo de XML traz junto DTD e entidades
 * externas — o caminho clássico para "ler um arquivo da máquina" (XXE) ou
 * travar a memória com entidade que se expande (billion laughs). Aqui o
 * <!DOCTYPE> é pulado inteiro, só as 5 entidades do XML e as numéricas são
 * entendidas, e há teto de nós e de profundidade. Para feed de notícia da
 * intranet é o suficiente; feed malformado é lido como der, sem exceção.
 */

const ENTIDADES = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };

function decodificarEntidades(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTIDADES[e] != null ? ENTIDADES[e] : m;
    const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
  });
}

function lerAtributos(s) {
  const attrs = {};
  const re = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s))) attrs[m[1]] = decodificarEntidades(m[3] != null ? m[3] : m[4]);
  return attrs;
}

function lerXml(texto, op = {}) {
  const maxNos = op.maxNos || 50000;
  const maxProf = op.maxProfundidade || 64;
  const s = String(texto);
  // `conteudo` guarda texto e filhos na ordem em que vieram; `filhos` só os nós.
  const raiz = { nome: '#raiz', attrs: {}, filhos: [], conteudo: [] };
  const pilha = [raiz];
  let nos = 0;
  let i = 0;
  const topo = () => pilha[pilha.length - 1];
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { topo().conteudo.push(decodificarEntidades(s.slice(i))); break; }
    if (lt > i) topo().conteudo.push(decodificarEntidades(s.slice(i, lt)));
    if (s.startsWith('<!--', lt)) { const f = s.indexOf('-->', lt + 4); i = f < 0 ? s.length : f + 3; continue; }
    if (s.startsWith('<![CDATA[', lt)) {
      const f = s.indexOf(']]>', lt + 9);
      topo().conteudo.push(s.slice(lt + 9, f < 0 ? s.length : f));
      i = f < 0 ? s.length : f + 3;
      continue;
    }
    if (s.startsWith('<?', lt)) { const f = s.indexOf('?>', lt + 2); i = f < 0 ? s.length : f + 2; continue; }
    if (s.startsWith('<!', lt)) {
      // DOCTYPE (com ou sem [subconjunto interno]): pulado, nunca interpretado.
      let j = lt + 2;
      let colchetes = 0;
      while (j < s.length) {
        const c = s[j];
        if (c === '[') colchetes++;
        else if (c === ']') colchetes--;
        else if (c === '>' && colchetes <= 0) break;
        j++;
      }
      i = j + 1;
      continue;
    }
    // Fim da tag, respeitando aspas nos atributos.
    let j = lt + 1;
    let aspas = '';
    while (j < s.length) {
      const c = s[j];
      if (aspas) { if (c === aspas) aspas = ''; } else if (c === '"' || c === "'") aspas = c; else if (c === '>') break;
      j++;
    }
    const dentro = s.slice(lt + 1, j);
    i = j + 1;
    if (dentro[0] === '/') {
      const nome = dentro.slice(1).trim();
      // Fecha até a tag de mesmo nome (tolerante a HTML mal fechado no meio).
      for (let k = pilha.length - 1; k > 0; k--) {
        if (pilha[k].nome === nome) { pilha.length = k; break; }
      }
      continue;
    }
    const autoFecha = dentro.endsWith('/');
    const corpo = autoFecha ? dentro.slice(0, -1) : dentro;
    const m = /^([^\s/>]+)/.exec(corpo);
    if (!m) continue;
    if (++nos > maxNos) break;
    const no = { nome: m[1], attrs: lerAtributos(corpo.slice(m[1].length)), filhos: [], conteudo: [] };
    topo().filhos.push(no);
    topo().conteudo.push(no);
    if (!autoFecha && pilha.length <= maxProf) pilha.push(no);
  }
  return raiz;
}

// O nome sem prefixo de namespace: "atom:link" → "link".
const local = (nome) => { const i = nome.indexOf(':'); return i >= 0 ? nome.slice(i + 1) : nome; };

function textoDe(no) {
  if (!no) return '';
  return no.conteudo.map((c) => (typeof c === 'string' ? c : textoDe(c))).join('');
}

function filho(no, nome) { return no && no.filhos.find((f) => f.nome === nome); }
function filhoLocal(no, nome) { return no && no.filhos.find((f) => local(f.nome) === nome); }
function filhos(no, nome) { return no ? no.filhos.filter((f) => f.nome === nome) : []; }

// Todos os descendentes com este nome local, sem entrar dentro de um achado.
function buscar(no, nomeLocal, out = []) {
  for (const f of no.filhos) {
    if (local(f.nome) === nomeLocal) out.push(f);
    else buscar(f, nomeLocal, out);
  }
  return out;
}

module.exports = { lerXml, decodificarEntidades, textoDe, filho, filhoLocal, filhos, buscar, local };
