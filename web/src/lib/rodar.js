/*
 * PÔR PRA RODAR (EXECUTOR §2b, item 25): a campanha do Criar vai para as
 * TVs, cada peça na zona que o escopo disse.
 *
 * O publicar de antes (lib/publicar.js) decide a zona pelo FORMATO — deitada
 * na principal, em pé na lateral — porque a peça não sabia de onde era. A
 * campanha do Criar sabe: o cliente disse "promoção na lateral, avisos no
 * rodapé". Aqui a zona é a do escopo, e o formato só desempata quando a TV
 * não tem aquela zona.
 *
 * Tudo entra marcado com `_campanha` (o mesmo de aplicarConteudo): publicar
 * de novo troca só o que é dela, e pausar tira só o que é dela.
 */
import { deviceConfig } from '../api.js';
import { defaultConfig } from './contentTypes.js';
import { aplicarConteudo, removerOrigem } from './aplicarConteudo.js';
import { zonesOf, getLayout } from './screenConfig.js';

// O layout com as quatro zonas, deitado e em pé.
export const LAYOUT_COMPLETO = { deitada: 'corporate', emPe: 'portrait-stack' };

const emPe = (cfg) => /^portrait/.test((cfg && cfg.settings && cfg.settings.layoutId) || '');

/*
 * As TVs de cada entrada do resultado. Uma TV citada pelo nome fica com a
 * entrada dela; "todas" vale para as outras; um grupo, para as TVs do grupo.
 */
export function alvosDaCampanha(resultado, telas) {
  const lista = (resultado && resultado.telas) || [];
  const disponiveis = telas || [];
  const citadas = new Set(lista.filter((t) => t.alvo && t.alvo.tipo === 'tela').map((t) => t.alvo.id));
  const saida = [];
  lista.forEach((t, i) => {
    const a = t.alvo || { tipo: 'todas' };
    let dela = [];
    if (a.tipo === 'tela') dela = disponiveis.filter((d) => d.id === a.id);
    else if (a.tipo === 'grupo') dela = disponiveis.filter((d) => d.grupo === a.nome && !citadas.has(d.id));
    else dela = disponiveis.filter((d) => !citadas.has(d.id));
    for (const d of dela) if (!saida.some((s) => s.tela.id === d.id)) saida.push({ tela: d, entrada: t, indice: i });
  });
  return saida;
}

/* As zonas de uma config pelo papel: cabeçalho, principal, lateral, rodapé. */
export function zonasPorPapel(cfg) {
  const zonas = zonesOf(cfg) || [];
  const listas = zonas.filter((z) => z.type === 'playlist');
  const principal = listas.find((z) => /^(principal|video|z1)$/.test(z.id)) || listas[0] || null;
  const outras = listas.filter((z) => z !== principal);
  const lateral = outras.find((z) => z.id === 'lateral') || outras.find((z) => z.id === 'secundaria') || outras[0] || null;
  return {
    cabecalho: (zonas.find((z) => z.type === 'header') || {}).id || null,
    principal: principal ? principal.id : null,
    lateral: lateral ? lateral.id : null,
    rodape: (zonas.find((z) => z.type === 'ticker') || {}).id || null,
  };
}

const temCabecalho = (e) => e.zonas.cabecalho.pecas.length > 0;
const temRodape = (e) => e.zonas.rodape.pecas.length > 0 || e.zonas.rodape.mensagens.length > 0;

// O que a entrada pede e a TV, no layout de hoje, não tem onde pôr.
export function zonasQueFaltam(cfg, entrada) {
  const z = zonasPorPapel(cfg);
  const faltam = [];
  if (entrada.zonas.lateral.length && !z.lateral) faltam.push('lateral');
  if (temCabecalho(entrada) && !z.cabecalho) faltam.push('cabeçalho');
  if (temRodape(entrada) && !z.rodape) faltam.push('rodapé');
  return faltam;
}

export function layoutPara(cfg) { return emPe(cfg) ? LAYOUT_COMPLETO.emPe : LAYOUT_COMPLETO.deitada; }
export function nomeDoLayout(id) { return (getLayout(id) || {}).name || id; }

const marcar = (p, nome) => ({ ...p.item, _campanha: nome });

/*
 * A config nova de uma TV com a campanha. Não modifica a recebida.
 * `trocarLayout`: troca para o layout das quatro zonas quando falta zona.
 */
export function aplicarCampanha(cfg, entrada, nome, { trocarLayout } = {}) {
  let next = JSON.parse(JSON.stringify(cfg || {}));
  if (trocarLayout && zonasQueFaltam(next, entrada).length) {
    next.settings = { ...(next.settings || {}), layoutId: layoutPara(next) };
  }
  const z = zonasPorPapel(next);
  const origem = { chave: '_campanha', valor: nome };
  // Sem lateral na TV, a lateral vai para a principal: nada do que foi pago se perde.
  const principal = entrada.zonas.principal.map((p) => p.item);
  const lateral = entrada.zonas.lateral.map((p) => p.item);
  const blocos = {};
  if (z.principal) blocos[z.principal] = z.lateral ? principal : principal.concat(lateral);
  if (z.lateral && lateral.length) blocos[z.lateral] = lateral;
  next = aplicarConteudo(next, blocos, origem, 'trocar');

  if (z.cabecalho && temCabecalho(entrada)) {
    const pecas = entrada.zonas.cabecalho.pecas.map((p) => marcar(p, nome));
    const antes = next.zonas[z.cabecalho] || {};
    next.zonas[z.cabecalho] = {
      ...antes, header: true, peca: pecas[0], pecas,
      ...(entrada.zonas.cabecalho.mensagens.length ? { messages: entrada.zonas.cabecalho.mensagens } : {}),
    };
  }
  if (z.rodape && temRodape(entrada)) {
    const pecas = entrada.zonas.rodape.pecas.map((p) => marcar(p, nome));
    const antes = next.zonas[z.rodape] || {};
    next.zonas[z.rodape] = {
      ...antes,
      ...(pecas.length ? { peca: pecas[0], pecas } : {}),
      ...(entrada.zonas.rodape.mensagens.length ? { messages: entrada.zonas.rodape.mensagens } : {}),
      ...(entrada.zonas.rodape.contagem ? { contagem: entrada.zonas.rodape.contagem } : {}),
    };
  }
  return next;
}

/*
 * Tira a campanha de uma TV: os itens dela nas playlists, as peças dela no
 * cabeçalho e no rodapé, as frases dela no letreiro e a contagem. O que não
 * é dela fica.
 */
export function tirarCampanha(cfg, entrada, nome) {
  const next = removerOrigem(cfg, { chave: '_campanha', valor: nome });
  const frases = new Set([...(entrada.zonas.rodape.mensagens || []), ...(entrada.zonas.cabecalho.mensagens || [])]);
  for (const zona of Object.values(next.zonas || {})) {
    if (!zona || typeof zona !== 'object') continue;
    if (Array.isArray(zona.pecas)) {
      zona.pecas = zona.pecas.filter((p) => !(p && p._campanha === nome));
      if (!zona.pecas.length) delete zona.pecas;
    }
    if (zona.peca && zona.peca._campanha === nome) {
      if (zona.pecas && zona.pecas.length) zona.peca = zona.pecas[0]; else delete zona.peca;
    }
    if (Array.isArray(zona.messages) && frases.size) zona.messages = zona.messages.filter((m) => !frases.has(m));
    if (zona.contagem && zona.contagem === entrada.zonas.rodape.contagem) delete zona.contagem;
  }
  return next;
}

async function configDa(tela) {
  try { const c = await deviceConfig.get(tela.id); if (c) return c; } catch (e) { /* tela sem config ainda */ }
  return defaultConfig(tela.name || 'Tela');
}

// O plano antes de rodar: que TV recebe, e quais trocariam de layout.
export async function planoDeRodar(resultado, telas) {
  const alvos = alvosDaCampanha(resultado, telas);
  const saida = [];
  for (const a of alvos) {
    const cfg = await configDa(a.tela);
    const faltam = zonasQueFaltam(cfg, a.entrada);
    saida.push({ ...a, cfg, faltam, layoutAtual: (cfg.settings && cfg.settings.layoutId) || '', layoutNovo: faltam.length ? layoutPara(cfg) : '' });
  }
  return saida;
}

export async function rodarCampanha(plano, nome, { trocarLayout } = {}) {
  const ids = [];
  for (const p of plano) {
    await deviceConfig.save(p.tela.id, aplicarCampanha(p.cfg, p.entrada, nome, { trocarLayout }));
    ids.push(p.tela.id);
  }
  return ids;
}

/*
 * Uma campanha inteira numa TV que ela ainda não conhece (EXECUTOR §2d, item
 * 38): a TV recém-pareada. Vale a entrada "todas as TVs", ou a primeira —
 * a TV para quem ela foi feita pode nem existir mais. Cabeçalho e rodapé
 * vão junto, e a TV nova (vazia) troca de layout para ter as zonas.
 */
export function entradaParaTvNova(resultado) {
  const lista = (resultado && resultado.telas) || [];
  return lista.find((t) => !t.alvo || t.alvo.tipo === 'todas') || lista[0] || null;
}

export async function porCampanhaNaTela(resultado, nome, tela) {
  const entrada = entradaParaTvNova(resultado);
  if (!entrada) throw new Error('Essa campanha não tem peças para TV.');
  const cfg = await configDa(tela);
  await deviceConfig.save(tela.id, aplicarCampanha(cfg, entrada, nome, { trocarLayout: true }));
}

export async function pausarCampanha(resultado, nome, telas, ids) {
  const alvos = alvosDaCampanha(resultado, telas).filter((a) => !ids || ids.includes(a.tela.id));
  for (const a of alvos) {
    const cfg = await configDa(a.tela);
    await deviceConfig.save(a.tela.id, tirarCampanha(cfg, a.entrada, nome));
  }
}

/*
 * UMA PEÇA PRONTA EM VÁRIAS TVS (EXECUTOR §2c, item 34): Mídias › Peças
 * prontas. A zona sai do papel da peça — faixa no cabeçalho ou no rodapé,
 * em pé na lateral, deitada na principal — e, sem a zona certa, ela vai para
 * a principal (nunca uma peça grande espremida numa faixa). Entra no fim da
 * zona, sem tirar nada do que já está lá.
 */
export function aplicarPeca(cfg, peca) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  if (!next.zonas) next.zonas = {};
  const z = zonasPorPapel(next);
  const item = { ...peca.item, ...(peca.campanha ? { _campanha: peca.campanha } : {}) };
  const papel = peca.papel || (peca.item && peca.item.papel) || '';
  if ((papel === 'cabecalho' || papel === 'rodape') && z[papel]) {
    const atual = next.zonas[z[papel]] || {};
    const lista = (Array.isArray(atual.pecas) && atual.pecas.length ? atual.pecas : (atual.peca ? [atual.peca] : [])).concat({ duracao: 20, ...item });
    next.zonas[z[papel]] = { ...atual, ...(papel === 'cabecalho' ? { header: true } : {}), pecas: lista, peca: lista[0] };
    return next;
  }
  if (papel === 'cabecalho' || papel === 'rodape') return next; // a TV não tem essa faixa: nada a fazer
  const emPe = String(peca.formato || item.formato || '').startsWith('9/');
  const zona = (emPe && z.lateral) ? z.lateral : (z.principal || z.lateral);
  if (!zona) return next;
  const atual = next.zonas[zona] || { items: [] };
  next.zonas[zona] = { ...atual, items: (Array.isArray(atual.items) ? atual.items : []).concat(item) };
  return next;
}

export async function porPecaNasTelas(peca, ids, telas) {
  for (const id of ids) {
    const tela = (telas || []).find((t) => t.id === id) || { id, name: 'Tela' };
    const cfg = await configDa(tela);
    await deviceConfig.save(id, aplicarPeca(cfg, peca));
  }
}
