/*
 * O NOME DAS FOTOS E VÍDEOS QUE JÁ ESTAVAM NA TV (sem React, para testar).
 *
 * Desde o lote de 06/11, a foto que sobe leva o nome do arquivo (`nome`,
 * lib/subir.js itemDaMidia) e a fila e a semana mostram "Foto vitrine 2".
 * As que foram para a TV antes só têm o endereço do armazenamento
 * (/media/<conta>/<código>.jpg) e apareciam como "Foto". A biblioteca da
 * conta (GET /api/media) guarda o nome original de cada arquivo: aqui o
 * endereço vira esse nome — só para mostrar. A programação gravada não muda.
 *
 * Quem carrega a lista (uma vez, guardada) é lib/useNomesDasMidias.js.
 */

// A chave de um arquivo nosso: o que vem depois de /media/ ("<conta>/<código>.jpg"), com ou sem o domínio do armazenamento na frente.
export function chaveDaMidia(url) {
  const s = String(url || '').split(/[?#]/)[0];
  const i = s.lastIndexOf('/media/');
  if (i < 0) return '';
  let k = s.slice(i + '/media/'.length);
  try { k = decodeURIComponent(k); } catch (e) { /* fica como veio */ }
  return k;
}

// A lista das Mídias → { chave: nome original }. Sem nome (ou com o "arquivo" que o servidor põe quando não veio nome), não entra.
export function mapaDeNomes(itens) {
  const mapa = {};
  for (const m of Array.isArray(itens) ? itens : []) {
    const k = m ? chaveDaMidia(m.url) : '';
    const n = m && typeof m.name === 'string' ? m.name.trim() : '';
    if (k && n && n.toLowerCase() !== 'arquivo') mapa[k] = n;
  }
  return mapa;
}

// O nome original do arquivo de um item ('' sem mapa, sem endereço nosso ou sem nome guardado).
export function nomeGuardado(item, nomes) {
  if (!nomes || !item || typeof item.src !== 'string') return '';
  const k = chaveDaMidia(item.src);
  return (k && Object.prototype.hasOwnProperty.call(nomes, k) && nomes[k]) || '';
}

/*
 * Só a foto ou o vídeo de antes pede a lista: do nosso armazenamento, sem
 * título, legenda nem `nome`. A TV só com peças, avisos e fotos novas não
 * gasta pedido nenhum.
 */
const DE_MIDIA = { image: 1, imagem: 1, video: 1 };
const temTexto = (v) => typeof v === 'string' && v.trim() !== '';
export function faltaNome(item) {
  const i = item || {};
  return !!DE_MIDIA[i.type] && typeof i.src === 'string' && !!chaveDaMidia(i.src)
    && ![i.titulo, i.legenda, i.caption, i.nome].some(temTexto);
}

// Alguma peça desta programação (de uma TV) é foto ou vídeo de antes?
export function precisaDeNomes(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  return Object.values(cfg.zonas || {}).some((z) => z && Array.isArray(z.items) && z.items.some(faltaNome));
}
