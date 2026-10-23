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
import { deviceConfig, lote as loteApi } from '../api.js';
import { aviso, emitir } from './avisos.js';
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

/*
 * A programação da TV, com a versão (D0.5). Falha ao ler ESTOURA: antes ela
 * virava "TV sem programação" e a campanha era gravada sobre o padrão,
 * apagando o que a TV tinha. Só a TV que de fato não tem programação
 * (config null) começa do padrão.
 */
async function lerDaTela(tela) {
  const { config, versao } = await deviceConfig.ler(tela.id);
  return { cfg: config || defaultConfig(tela.name || 'Tela'), versao };
}

/*
 * Grava a mudança `fazer(cfg)` na TV sem passar por cima de ninguém. Se a
 * TV mudou depois da leitura (409 'config-mudou'), relê e aplica de novo a
 * mesma mudança — ela é uma função da programação, então reaplicar sobre a
 * versão nova preserva o que a outra pessoa fez.
 */
export async function gravarNaTela(tela, fazer, lida) {
  let atual = lida || await lerDaTela(tela);
  for (let i = 0; i < 3; i++) {
    try { return await deviceConfig.save(tela.id, fazer(atual.cfg), atual.versao); }
    catch (e) {
      if (e.codigo !== 'config-mudou') throw e;
      atual = await lerDaTela(tela);
    }
  }
  throw new Error('A programação desta TV está mudando agora. Tente de novo em instantes.');
}

/*
 * ENVIO EM LOTE (EXECUTOR D26): a mesma mudança em várias TVs, gravada pelo
 * SERVIDOR de uma vez — tudo ou nada. Antes era um laço aqui, TV por TV: a
 * terceira falhava, as duas primeiras ficavam mudadas e o aviso dizia que
 * tinha dado certo.
 *
 * `fazer(cfg, tela)` devolve a programação nova de cada TV (a mudança como
 * função, igual ao gravarNaTela). Se alguma TV mudou no meio, relê todas e
 * reaplica — até três vezes. Devolve { lote, ids }: o lote é o que o
 * "Desfazer" desfaz.
 */
export async function gravarEmLote(telas, fazer, descricao) {
  const lista = (telas || []).filter(Boolean);
  if (!lista.length) return { lote: null, ids: [] };
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const lidas = await Promise.all(lista.map((tv) => lerDaTela(tv)));
    const itens = lista.map((tv, i) => ({ id: tv.id, config: fazer(lidas[i].cfg, tv), versao: lidas[i].versao }));
    try {
      const r = await loteApi.enviar(itens, descricao);
      return { lote: (r && r.lote) || null, ids: lista.map((tv) => tv.id) };
    } catch (e) {
      if (e.codigo !== 'config-mudou') throw e;
    }
  }
  throw new Error('A programação dessas TVs está mudando agora. Nada foi enviado; tente de novo em instantes.');
}

/*
 * O aviso de "foi para a TV" com o Desfazer do lote: volta cada TV ao que
 * era — menos a que alguém mudou depois, que fica como está (e o aviso diz).
 */
export function avisarComDesfazer(texto, idLote) {
  if (!idLote) { aviso.ok(texto); return; }
  emitir({
    tom: 'desfazer', texto,
    acao: {
      rotulo: 'Desfazer',
      on: async () => {
        try {
          const r = await loteApi.desfazer(idLote);
          const mudaram = (r && r.mudaram) || [];
          aviso.ok(mudaram.length
            ? 'Desfeito. ' + mudaram.map((t) => t.nome || 'Uma TV').join(', ') + (mudaram.length === 1 ? ' foi mudada' : ' foram mudadas') + ' depois e ficou como está.'
            : 'Desfeito: as TVs voltaram ao que eram.');
        } catch (e) { aviso.erro('lote', e.message || 'Não deu para desfazer.'); }
      },
    },
  });
}

// O plano antes de rodar: que TV recebe, e quais trocariam de layout.
export async function planoDeRodar(resultado, telas) {
  const alvos = alvosDaCampanha(resultado, telas);
  const saida = [];
  for (const a of alvos) {
    const lida = await lerDaTela(a.tela);
    const cfg = lida.cfg;
    const faltam = zonasQueFaltam(cfg, a.entrada);
    saida.push({ ...a, cfg, versao: lida.versao, faltam, layoutAtual: (cfg.settings && cfg.settings.layoutId) || '', layoutNovo: faltam.length ? layoutPara(cfg) : '' });
  }
  return saida;
}

// D26: todas as TVs do plano de uma vez (tudo ou nada). Devolve os ids; `ids.lote` é o envio.
export async function rodarCampanha(plano, nome, { trocarLayout } = {}) {
  const r = await gravarEmLote(plano.map((p) => p.tela),
    (cfg, tv) => aplicarCampanha(cfg, plano.find((p) => p.tela.id === tv.id).entrada, nome, { trocarLayout }), 'Campanha: ' + nome);
  const ids = r.ids.slice();
  ids.lote = r.lote;
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
  await gravarNaTela(tela, (cfg) => aplicarCampanha(cfg, entrada, nome, { trocarLayout: true }));
}

export async function pausarCampanha(resultado, nome, telas, ids) {
  const alvos = alvosDaCampanha(resultado, telas).filter((a) => !ids || ids.includes(a.tela.id));
  const r = await gravarEmLote(alvos.map((a) => a.tela),
    (cfg, tv) => tirarCampanha(cfg, alvos.find((a) => a.tela.id === tv.id).entrada, nome), 'Pausar: ' + nome);
  return r.lote;
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

// D26: todas de uma vez; devolve { lote, ids } para o Desfazer.
export async function porPecaNasTelas(peca, ids, telas) {
  const tvs = ids.map((id) => (telas || []).find((t) => t.id === id) || { id, name: 'Tela' });
  return gravarEmLote(tvs, (cfg) => aplicarPeca(cfg, peca), 'Peça: ' + ((peca && peca.label) || 'peça pronta'));
}
