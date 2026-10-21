/*
 * A página da TV, sem React (EXECUTOR §2c, itens 30 e 31): o que a faixa
 * tem, as campanhas que estão na TV e a grade da miniatura. Separado dos
 * componentes para dar para testar no Node (test/painel-coerente.test.js).
 */

/* As peças de uma faixa: a lista que gira (`pecas`) ou a peça única de antes. */
export function pecasDaFaixa(zona) {
  const z = zona || {};
  return Array.isArray(z.pecas) && z.pecas.length ? z.pecas : (z.peca ? [z.peca] : []);
}

/*
 * A faixa com uma lista nova. `peca` é sempre a primeira — é a que a TV com
 * o JS antigo no cache mostra. Lista vazia apaga as duas, e a faixa volta ao
 * automático (cabeçalho) ou ao letreiro (rodapé).
 */
export function comPecas(zona, lista) {
  const z = { ...(zona || {}) };
  if (lista.length) { z.pecas = lista; z.peca = lista[0]; } else { delete z.pecas; delete z.peca; }
  return z;
}

/* As campanhas na config, pela marca `_campanha` nos itens e nas peças das faixas. */
export function campanhasDaConfig(cfg) {
  const conta = new Map();
  for (const z of Object.values((cfg && cfg.zonas) || {})) {
    if (!z || typeof z !== 'object') continue;
    const marcas = [].concat(Array.isArray(z.items) ? z.items : []).concat(pecasDaFaixa(z));
    for (const it of marcas) if (it && it._campanha) conta.set(it._campanha, (conta.get(it._campanha) || 0) + 1);
  }
  return [...conta.entries()].map(([nome, pecas]) => ({ nome, pecas }));
}

/* A config sem o que veio de uma campanha. O que não é dela fica. */
export function semCampanha(cfg, nome) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  for (const z of Object.values(next.zonas || {})) {
    if (!z || typeof z !== 'object') continue;
    if (Array.isArray(z.items)) z.items = z.items.filter((i) => !(i && i._campanha === nome));
    const restam = pecasDaFaixa(z).filter((p) => !(p && p._campanha === nome));
    if (z.pecas || z.peca) Object.assign(z, comPecas(z, restam));
    if (!restam.length) { delete z.pecas; delete z.peca; }
  }
  return next;
}

/*
 * A grade da miniatura. O player mistura `fr` e `vh` ("12vh 1fr 11vh"); aqui
 * tudo vira `fr` na mesma proporção: 12vh de uma TV são 12 de 100 partes.
 */
export function emFr(trilha) {
  const partes = String(trilha || '1fr').trim().split(/\s+/);
  const fixos = partes.map((p) => (/(vh|vw)$/.test(p) ? parseFloat(p) : 0));
  const somaFixa = fixos.reduce((a, b) => a + b, 0);
  const frs = partes.map((p) => (/fr$/.test(p) ? parseFloat(p) : 0));
  const somaFr = frs.reduce((a, b) => a + b, 0) || 1;
  const sobra = Math.max(10, 100 - somaFixa);
  // A faixa fina (cabeçalho, rodapé) não fica menor que o texto dela na miniatura do celular.
  return partes.map((p, i) => (fixos[i] ? 'minmax(2.1rem, ' + fixos[i].toFixed(2) + 'fr)' : ((frs[i] / somaFr) * sobra).toFixed(2) + 'fr')).join(' ');
}

export function gradeDaMiniatura(layout) {
  const g = (layout && layout.grid) || {};
  return {
    gridTemplateColumns: emFr(g.columns),
    gridTemplateRows: emFr(g.rows),
    gridTemplateAreas: (g.areas || []).map((a) => '"' + a + '"').join(' ') || undefined,
  };
}

export function proporcaoDoLayout(layout) {
  const o = (layout && layout.orientation) || 'landscape';
  return o === 'portrait' ? '9 / 16' : o === 'square' ? '1 / 1' : '16 / 9';
}

/*
 * O papel de uma zona da TV, na língua do escopo e das peças (item 32):
 * cabeçalho, rodapé, principal ou lateral. Em pé, a "secundaria" faz o papel
 * da lateral.
 */
export function papelDaZona(zona) {
  if (!zona) return 'principal';
  if (zona.type === 'header') return 'cabecalho';
  if (zona.type === 'ticker') return 'rodape';
  return /^(principal|video|z1)$/.test(zona.id) ? 'principal' : 'lateral';
}

/*
 * Quanto uma peça pronta cabe numa zona: 0 não cabe, 1 cabe, 2 é a cara dela.
 * Peça de faixa só vai para a faixa do mesmo papel; peça de zona grande nunca
 * vai para a faixa (ficaria espremida em 130 px). Entre as zonas grandes, a
 * orientação desempata: em pé na lateral, deitada na principal.
 */
export function cabeNaZona(peca, zona) {
  const p = peca || {};
  const item = p.item || {};
  const papel = p.papel || item.papel || '';
  const alvo = papelDaZona(zona);
  const faixa = (x) => x === 'cabecalho' || x === 'rodape';
  if (faixa(alvo)) return papel === alvo ? 2 : 0;
  if (faixa(papel)) return 0;
  const emPe = String(p.formato || item.formato || '').startsWith('9/');
  const zonaEmPe = (zona && zona.formato === 'retrato') || alvo === 'lateral';
  return emPe === zonaEmPe ? 2 : 1;
}
