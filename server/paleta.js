/*
 * A paleta com que a conta nasce, e o ramo dela.
 *
 * "Conta nova nasce com uma paleta sugerida pelo segmento: nunca fica sem
 * marca" (docs/EXECUTOR.md, item 2). Antes a marca nascia com `cores: []`,
 * e tudo caía no azul de reserva (`MARCA_PADRAO` em js/tokens.js): a ótica, a
 * padaria e a academia abriam o painel com a mesma peça azul.
 *
 * O ramo sai dos textos que a conta já tem — o nome que a pessoa digitou no
 * cadastro, o nome da marca, o ramo que a memória deduziu conversando e o
 * resumo do site lido. As paletas e a detecção moram em js/paletas.js, o
 * mesmo arquivo que o painel usa para sugerir: um lugar só decide.
 */
const P = require('../js/paletas.js');
const Perfil = require('../js/perfil.js');

async function textosDaConta(db, tenantId, kit) {
  const [tenant, mem] = await Promise.all([
    db.getTenant(tenantId).catch(() => null),
    db.getMemoria ? db.getMemoria(tenantId).catch(() => null) : null,
  ]);
  const k = kit || {};
  return [tenant && tenant.name, k.nome, mem && mem.segmento, k.siteResumo].filter(Boolean);
}

async function ramoDaConta(db, tenantId, kit) {
  return P.detectarRamo(await textosDaConta(db, tenantId, kit));
}

/*
 * Garante que a marca ativa tenha cores. Se já tem, não mexe — a cor que a
 * pessoa escolheu nunca é trocada por sugestão. Devolve a marca (atualizada,
 * se precisou).
 */
async function garantir(db, tenantId) {
  const kit = await db.getBrandKit(tenantId);
  if (!kit || (Array.isArray(kit.cores) && kit.cores.length)) return kit;
  const cores = P.inicial(await textosDaConta(db, tenantId, kit));
  await db.saveBrandKit(tenantId, {
    nome: kit.nome, cores, fonteTitulo: kit.fonteTitulo, fonteApoio: kit.fonteApoio,
    direcao: kit.direcao, tom: kit.tom, observacoes: kit.observacoes,
  });
  return Object.assign({}, kit, { cores });
}

/*
 * Empresa, Comércio ou Saúde (js/perfil.js). O que a pessoa escolheu vale;
 * sem escolha (contas de antes do D4, Google), sai do ramo — a metalúrgica
 * vira Empresa sem precisar perguntar.
 */
async function perfilDaConta(db, tenantId, tenant) {
  const t = tenant || await db.getTenant(tenantId).catch(() => null);
  if (t && Perfil.tem(t.perfil)) return t.perfil;
  return Perfil.deduzir(await ramoDaConta(db, tenantId));
}

/*
 * A logo da marca ativa, nas três versões (D7): a original, a branca (para
 * fundo escuro) e a escura (para fundo claro). Quem desenha escolhe pelo
 * fundo; sem versão, vai a original. Null quando não há logo.
 */
async function logoDaConta(db, tenantId) {
  const assets = await db.listBrandAssets(tenantId).catch(() => []);
  const de = (k) => ((assets || []).find((a) => a.kind === k) || {}).url || '';
  const url = de('logo');
  return url ? { url, clara: de('logo-clara'), escura: de('logo-escura') } : null;
}

/*
 * Fase 4: a marca entra sozinha na TV. Com "Usar nas minhas TVs" ligado na
 * Marca (padrão) e a marca com cores, a TV que não escolheu outro tema sai
 * com o tema da marca — e a cor acompanha a marca quando ela muda. Escolheu
 * outro tema é: marcou um tema pronto no painel (escolhido), um tema que
 * não é o padrão, a marca só nos destaques ou ajustes de cor à mão — essa
 * escolha nunca é desfeita aqui. Devolve o tema novo, ou null para manter.
 */
// O que toda config nova herda (js/storage.js, settingsPadrao: cor e fundo legados, migrados para overrides): não é escolha de ninguém.
const HERDADO = { brand: '#5b2eff', bg: '#0e0b1f' };
function escolheuTema(t) {
  const ov = (t && t.overrides) || {};
  const mexeu = (k) => ov[k] !== undefined && ov[k] !== null && ov[k] !== '' && String(ov[k]).toLowerCase() !== HERDADO[k];
  return !!t && (t.escolhido === true || t.aplicarMarca === true
    || (!!t.preset && t.preset !== 'dark-premium' && t.preset !== 'marca')
    || Object.keys(ov).some(mexeu));
}
function temaDaTv(theme, kit) {
  const cores = (kit && Array.isArray(kit.cores) ? kit.cores : []).filter(Boolean);
  if (!kit || kit.nasTvs === false || !cores.length) return null;
  const t = theme && typeof theme === 'object' ? theme : {};
  if (escolheuTema(t)) return null;
  if (t.preset === 'marca' && JSON.stringify(t.marca || []) === JSON.stringify(cores)) return null;
  // Os ajustes herdados saem junto: eles pintariam a TV de roxo por cima da marca.
  const overrides = Object.assign({}, t.overrides || {});
  Object.keys(HERDADO).forEach((k) => { if (String(overrides[k] || '').toLowerCase() === HERDADO[k]) delete overrides[k]; });
  return Object.assign({}, t, { preset: 'marca', marca: cores, overrides });
}

module.exports = { garantir, ramoDaConta, perfilDaConta, logoDaConta, temaDaTv, escolheuTema };
