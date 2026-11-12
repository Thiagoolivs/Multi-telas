/*
 * A BUSCA EM TELAS (reteste 2): com 25 TVs, não havia como achar a
 * "Vitrine" sem rolar a lista inteira. Com mais de 8 TVs, a página Telas
 * mostra um campo que acha pelo nome da TV ou da loja (o grupo), sem acento
 * e sem maiúscula: "vitrine", "loja sul", "recepcao". Cada palavra digitada
 * tem que aparecer.
 */
export const TVS_PARA_BUSCA = 8;

const semAcento = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function casaComBusca(d, busca) {
  const q = semAcento(busca).trim();
  if (!q) return true;
  const onde = semAcento(((d && d.name) || '') + ' ' + ((d && d.grupo) || ''));
  return q.split(/\s+/).every((p) => onde.includes(p));
}
