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
 *
 * A marca que nasce aqui nasce também com o CLIMA do ramo (lote de 06/11,
 * js/paletas.js climaDoRamo): a clínica no claro limpo, o restaurante no
 * escuro elegante, o varejo na cor da marca forte. A conta de antes, que
 * já tinha cor, fica sem clima até a pessoa escolher um na Marca: a TV
 * dela continua no escuro e as peças prontas na cor da marca, como eram —
 * só a conta da cor melhorou.
 */
async function garantir(db, tenantId) {
  const kit = await db.getBrandKit(tenantId);
  if (!kit || (Array.isArray(kit.cores) && kit.cores.length)) return kit;
  const textos = await textosDaConta(db, tenantId, kit);
  const cores = P.inicial(textos);
  await db.saveBrandKit(tenantId, {
    nome: kit.nome, cores, fonteTitulo: kit.fonteTitulo, fonteApoio: kit.fonteApoio,
    direcao: kit.direcao, tom: kit.tom, observacoes: kit.observacoes,
  });
  const clima = kit.clima || P.climaDoRamo(P.detectarRamo(textos));
  if (!kit.clima && kit.id && db.salvarClimaDaMarca) await db.salvarClimaDaMarca(kit.id, tenantId, clima);
  return Object.assign({}, kit, { cores, clima });
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
/*
 * O clima da marca vai junto (lote de 06/11): a TV sai no Escuro elegante,
 * no Claro limpo ou na Cor da marca forte, o mesmo das peças. Marca sem
 * clima (a de antes) deixa o tema sem clima — escuro, como sempre foi.
 */
function temaDaTv(theme, kit) {
  const cores = (kit && Array.isArray(kit.cores) ? kit.cores : []).filter(Boolean);
  if (!kit || kit.nasTvs === false || !cores.length) return null;
  const t = theme && typeof theme === 'object' ? theme : {};
  if (escolheuTema(t)) return null;
  const clima = P.ehClima(kit.clima) ? kit.clima : '';
  if (t.preset === 'marca' && JSON.stringify(t.marca || []) === JSON.stringify(cores) && (t.clima || '') === clima) return null;
  // Os ajustes herdados saem junto: eles pintariam a TV de roxo por cima da marca.
  const overrides = Object.assign({}, t.overrides || {});
  Object.keys(HERDADO).forEach((k) => { if (String(overrides[k] || '').toLowerCase() === HERDADO[k]) delete overrides[k]; });
  const novo = Object.assign({}, t, { preset: 'marca', marca: cores, overrides });
  if (clima) novo.clima = clima; else delete novo.clima;
  return novo;
}

/*
 * A ARTE DO MODO AMBIENTE ACOMPANHA A MARCA (lote de 06/11). A peça-ouro
 * escolhida em Ajustes da TV › Aparência vai inteira para a config
 * (settings.ambiente.peca), com as cores, as fontes e o nome da marca do
 * momento: a TV desenha sem internet e precisa do item inteiro
 * (js/rodizio.js, pecaDeAmbiente). Só que, mudada a Marca, a TV seguia com
 * as cores e o nome velhos. Como o tema (temaDaTv), a peça sai daqui com a
 * marca de AGORA — para a TV e para o painel (o que o painel gravar já vai
 * com ela). O desenho, a frase e o resto ficam; só a marca troca. Vale para
 * a peça-ouro no modo da marca (a escolhida no painel, lib/arteDoAmbiente.js).
 *
 * `empresa`: o nome da conta, quando a marca não tem nome próprio. Sem nome
 * nenhum, o lugar do nome fica vazio e escondido (nunca o nome de exemplo).
 * A peça nova passa pela mesma porta da TV (js/peca-html.js; `opcoes` =
 * { hostsMidia }, as da gravação); se não passar, fica a gravada. Devolve
 * o ambiente novo, ou null para manter.
 */
let pecaHtml = null;
const marcaIgual = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
function ambienteDaMarca(ambiente, kit, empresa, opcoes) {
  const p = ambiente && typeof ambiente === 'object' ? ambiente.peca : null;
  if (!kit || !p || typeof p !== 'object' || p.type !== 'peca-html') return null;
  // O modo da marca é o clima dela (lote de 06/11): a peça em qualquer um dos três segue o clima de agora.
  if (!p.origem || p.origem.motor !== 'ouro' || (p.modo && !P.ehClima(p.modo))) return null;
  pecaHtml = pecaHtml || require('../js/peca-html.js');
  const nome = String((kit.nome && kit.nome !== 'Marca principal' ? kit.nome : empresa) || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const campos = Object.assign({}, p.campos || {});
  let ocultos = Array.isArray(p.ocultos) ? p.ocultos.slice() : [];
  if (/data-campo="marca"/.test(String(p.html || ''))) {
    campos.marca = nome;
    ocultos = ocultos.filter((x) => x !== 'marca').concat(nome ? [] : ['marca']);
  }
  const novo = Object.assign({}, p, { campos, marca: { cores: Array.isArray(kit.cores) ? kit.cores : [], fonteTitulo: kit.fonteTitulo || '', fonteApoio: kit.fonteApoio || '' } });
  if (P.ehClima(kit.clima)) novo.modo = kit.clima;
  if (ocultos.length) novo.ocultos = ocultos; else delete novo.ocultos;
  const v = pecaHtml.validarItem(novo, opcoes || {});
  if (!v.ok) return null;
  const pronta = Object.assign({}, novo, v.item);
  const antes = pecaHtml.validarItem(p, opcoes || {}).item;
  if (marcaIgual(antes.marca, pronta.marca) && marcaIgual(antes.campos, pronta.campos) && marcaIgual(antes.ocultos, pronta.ocultos) && antes.modo === pronta.modo) return null;
  return Object.assign({}, ambiente, { peca: pronta });
}

module.exports = { garantir, ramoDaConta, perfilDaConta, logoDaConta, temaDaTv, escolheuTema, ambienteDaMarca };
