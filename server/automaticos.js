/*
 * AUTOMÁTICOS NA TV (EXECUTOR D15).
 *
 * O dono: o aniversariante aparece na SEMANA do aniversário, sozinho, e
 * convive com as datas sazonais. Antes a lista ficava salva e a TV não
 * mostrava nada — só se alguém pusesse o item "Aniversariantes" numa zona. O
 * mural, idem: o painel dizia "1 na tela" sem ele estar em TV nenhuma.
 *
 * Aqui mora a escolha da conta ("mostrar nas TVs": todas, um grupo ou TVs
 * escolhidas) e a pergunta "esta TV recebe?". Quem encaixa o cartão no
 * rodízio, na semana certa, é o player (js/player.js, comAutomaticos).
 *
 * Forma guardada em tenants.automaticos (JSON):
 *   { aniversarios: { ligado, telas }, mural: { codigo, telas } | null }
 * `telas`: 'todas' | { grupo: 'Loja Centro' } | ['dev_x', 'dev_y']
 */

const VAZIO = { aniversarios: { ligado: false, telas: 'todas' }, mural: null };

function lerJson(t) {
  if (!t) return null;
  if (typeof t === 'object') return t;
  try { return JSON.parse(t); } catch (e) { return null; }
}

// O alvo, limpo: só o que existe nesta conta (ids das TVs dela, grupo com nome).
function telasLimpas(v, idsDaConta) {
  if (v === 'todas' || v == null) return 'todas';
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof v.grupo === 'string') {
    const g = v.grupo.replace(/\s+/g, ' ').trim().slice(0, 60);
    return g ? { grupo: g } : 'todas';
  }
  if (Array.isArray(v)) {
    const ok = new Set(idsDaConta || []);
    const lista = [...new Set(v.filter((x) => typeof x === 'string' && ok.has(x)))].slice(0, 50);
    return lista;
  }
  return 'todas';
}

function normalizar(bruto, { idsDaConta = [], codigosDeMural = [] } = {}) {
  const b = lerJson(bruto) || {};
  const a = b.aniversarios || {};
  const m = b.mural || null;
  const codigo = m && typeof m.codigo === 'string' ? m.codigo.toUpperCase().trim() : '';
  return {
    aniversarios: { ligado: a.ligado === true, telas: telasLimpas(a.telas, idsDaConta) },
    mural: codigo && codigosDeMural.includes(codigo) ? { codigo, telas: telasLimpas(m.telas, idsDaConta) } : null,
  };
}

function alcanca(telas, device) {
  if (telas === 'todas') return true;
  if (Array.isArray(telas)) return telas.includes(device.id);
  if (telas && telas.grupo) return String(device.grupo || '') === telas.grupo;
  return false;
}

// O que ESTA TV recebe: vai na config da TV, calculado na hora (como a logo, D8).
function paraATela(automaticos, device) {
  const a = lerJson(automaticos) || VAZIO;
  return {
    aniversarios: !!(a.aniversarios && a.aniversarios.ligado && alcanca(a.aniversarios.telas, device)),
    mural: a.mural && a.mural.codigo && alcanca(a.mural.telas, device) ? a.mural.codigo : '',
  };
}

module.exports = { VAZIO, normalizar, paraATela, alcanca, telasLimpas };
