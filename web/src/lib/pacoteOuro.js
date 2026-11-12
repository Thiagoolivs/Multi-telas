/*
 * O PACOTE DAS PEÇAS-OURO (reteste 2): o manifesto e o HTML de todas as
 * peças aprovadas num pedido só (GET /pecas-ouro/pacote.json, montado em
 * server/conteudoPronto.js). O "Prontos para você" levava 7,4 s no 4G lento
 * com o manifesto e mais 43 pedidos, um por peça.
 *
 * Um por sessão, dividido entre os modelos (lib/modelosOuro.js) e as telas
 * prontas (lib/telasProntas.js). Servidor sem o pacote (ou o pacote falhou):
 * o manifesto de sempre, e cada peça no seu arquivo.
 */
let pacote = null;

export function carregarPacote() {
  if (!pacote) {
    pacote = fetch('/pecas-ouro/pacote.json')
      .then((r) => { if (!r.ok) throw new Error('sem pacote'); return r.json(); })
      .then((p) => ({ manifesto: p.manifesto, html: p.html || {} }))
      .catch(() => fetch('/pecas-ouro/manifesto.json')
        .then((r) => { if (!r.ok) throw new Error('não deu para abrir os modelos'); return r.json(); })
        .then((manifesto) => ({ manifesto, html: {} })))
      .catch((e) => { pacote = null; throw e; });
  }
  return pacote;
}

// O manifesto (com as decisões da galeria do operador).
export const carregarManifesto = () => carregarPacote().then((p) => p.manifesto);

// O HTML de uma peça: do pacote, ou do arquivo dela.
export function htmlDaPeca(id) {
  return carregarPacote().then((p) => (p.html[id] != null ? p.html[id]
    : fetch('/pecas-ouro/' + id + '.html').then((r) => (r.ok ? r.text() : ''))));
}
