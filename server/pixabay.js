/*
 * server/pixabay.js — o banco de imagens externo (EXECUTOR D37, decisão do
 * dono: Pixabay), com o crédito automático.
 *
 *   - A busca passa pelo servidor: a chave (PIXABAY_API_KEY) nunca vai ao
 *     navegador nem ao log. Sem a chave, o painel não mostra a aba.
 *   - A Pixabay pede cache de 24 h das buscas e não deixa usar a imagem
 *     direto do servidor dela: "Usar" BAIXA a foto (por server/site.js) para
 *     as Mídias da conta — e a TV, que funciona offline, nunca depende de
 *     host de terceiros.
 *   - O crédito ("Foto: Fulano / Pixabay") vai no nome da mídia e no item da
 *     TV, que mostra discreto no canto.
 */
// A rede: o site.js de sempre; o teste troca por uma falsa (nada de chamar a Pixabay de verdade).
let rede = require('./site');

const CACHE_MS = 24 * 60 * 60 * 1000;
const POR_PAGINA = 30;
const cache = new Map();   // busca (sem a chave) -> { expira, dados }
const TETO_CACHE = 500;

const chave = () => String(process.env.PIXABAY_API_KEY || '').trim();
function configurado() { return !!chave(); }

function endereco(params) {
  const q = new URLSearchParams(Object.assign({ key: chave() }, params));
  return 'https://pixabay.com/api/?' + q.toString();
}
const foto = (h) => ({
  id: h.id, previa: h.webformatURL, largura: h.imageWidth, altura: h.imageHeight,
  autor: String(h.user || '').slice(0, 60), pagina: h.pageURL, tags: String(h.tags || '').slice(0, 120),
});
const credito = (autor) => 'Foto: ' + (autor || 'Pixabay') + ' / Pixabay';

async function buscar(termo, opcoes) {
  const o = opcoes || {};
  const params = {
    q: String(termo || '').replace(/\s+/g, ' ').trim().slice(0, 100), lang: 'pt', safesearch: 'true', per_page: String(POR_PAGINA),
    image_type: o.tipo === 'ilustracao' ? 'illustration' : 'photo',
    orientation: o.orientacao === 'vertical' ? 'vertical' : o.orientacao === 'horizontal' ? 'horizontal' : 'all',
    page: String(Math.max(1, Math.min(10, Number(o.pagina) || 1))),
  };
  const k = JSON.stringify(params);
  const c = cache.get(k);
  if (c && c.expira > Date.now()) return c.dados;
  const r = await rede.buscarJson(endereco(params));
  // O erro sai sem o endereço (a chave mora nele).
  if (r.erro) return { erro: 'o banco de imagens não respondeu agora' };
  const dados = { total: Number(r.json.totalHits) || 0, fotos: (r.json.hits || []).map(foto) };
  if (cache.size >= TETO_CACHE) cache.delete(cache.keys().next().value);
  cache.set(k, { expira: Date.now() + CACHE_MS, dados });
  return dados;
}

// A foto pelo id, já baixada: { bytes, mime, credito, autor, pagina } ou { erro }.
async function baixar(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return { erro: 'foto inválida' };
  const r = await rede.buscarJson(endereco({ id: String(n) }));
  const h = !r.erro && r.json && r.json.hits && r.json.hits[0];
  if (!h) return { erro: 'a foto não está mais no banco de imagens' };
  // A grande (1280 px) quando cabe no limite do site.js; senão a de 640 px, que ainda serve numa zona.
  let img = await rede.baixarImagem(h.largeImageURL || h.webformatURL);
  if (img.erro && h.webformatURL) img = await rede.baixarImagem(h.webformatURL);
  if (img.erro) return { erro: 'não deu para baixar a foto agora' };
  return { bytes: img.bytes, mime: img.mime, credito: credito(h.user), autor: String(h.user || ''), pagina: h.pageURL };
}

module.exports = { configurado, buscar, baixar, credito, POR_PAGINA, CACHE_MS, _limpar: () => cache.clear(), _trocarRede: (r) => { rede = r; } };
