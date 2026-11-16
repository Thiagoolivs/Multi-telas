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
import '../../../js/importancia.js';
import '../../../js/lote-tv.js';
import { deviceConfig, lote as loteApi } from '../api.js';
import { aviso, emitir } from './avisos.js';
import { defaultConfig } from './contentTypes.js';

/*
 * As regras de cada TV (as zonas pelo papel, a campanha, a peça, o "Quando")
 * moram em js/lote-tv.js desde o teste de carga (16/11): o servidor aplica a
 * campanha e a peça em cada TV com as mesmas funções (POST
 * /api/lote/operacao), e o painel as usa para uma TV só (a TV nova, a
 * prévia). Uma regra, dois lados.
 */
const L = globalThis.MTLoteTv;

// O layout com as quatro zonas, deitado e em pé.
export const LAYOUT_COMPLETO = L.LAYOUT_COMPLETO;

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
export const zonasPorPapel = (cfg) => L.zonasPorPapel(cfg);

// O que a entrada pede e a TV, no layout de hoje, não tem onde pôr.
export const zonasQueFaltam = (cfg, entrada) => L.zonasQueFaltam(cfg, entrada);

export const layoutPara = (cfg) => L.layoutPara(cfg);
// O nome que a pessoa lê ("Grande + coluna + faixas"), não o do catálogo da TV ("Corporativo Completo").
export { nomeDoLayout } from './nomesDosLayouts.js';

// Fase 5: cada peça entra com a importância pela natureza dela, e o porquê (js/importancia.js) — no relógio da pessoa.
const imp = (it) => (globalThis.MTImportancia ? globalThis.MTImportancia.comImportancia(it) : it);

/*
 * A config nova de uma TV com a campanha. Não modifica a recebida.
 * `trocarLayout`: troca para o layout das quatro zonas quando falta zona.
 */
export function aplicarCampanha(cfg, entrada, nome, { trocarLayout } = {}) {
  return L.aplicarCampanha(cfg, entrada, nome, { trocarLayout, imp });
}

/*
 * Tira a campanha de uma TV: os itens dela nas playlists, as peças dela no
 * cabeçalho e no rodapé, as frases dela no letreiro e a contagem. O que não
 * é dela fica.
 */
export const tirarCampanha = (cfg, entrada, nome) => L.tirarCampanha(cfg, entrada, nome);

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
  // Uma TV só uma vez (o servidor recusa a repetida).
  const lista = (telas || []).filter((tv, i, todas) => tv && todas.findIndex((x) => x && x.id === tv.id) === i);
  if (!lista.length) return { lote: null, ids: [] };
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const lidas = await Promise.all(lista.map((tv) => lerDaTela(tv)));
    const itens = lista.map((tv, i) => ({ id: tv.id, config: fazer(lidas[i].cfg, tv), versao: lidas[i].versao }));
    try {
      const r = await loteApi.enviar(itens, descricao);
      // Com a aprovação ligada, o envio do membro virou pedido (202): quem chama pode dizer "espera o dono".
      return { lote: (r && r.lote) || null, ids: lista.map((tv) => tv.id), ...(r && r.pendente ? { pendente: true, mensagem: r.mensagem || '' } : {}) };
    } catch (e) {
      if (e.codigo !== 'config-mudou') throw e;
    }
  }
  throw new Error('A programação dessas TVs está mudando agora. Nada foi enviado; tente de novo em instantes.');
}

/*
 * Desfaz um envio em lote e conta o que aconteceu: volta cada TV ao que
 * era — menos a que alguém mudou depois, que fica como está (e o aviso diz).
 * Do aviso de 9 s e da lista "Últimos envios" da Programação. Devolve true
 * se desfez.
 */
export async function desfazerLote(idLote) {
  try {
    const r = await loteApi.desfazer(idLote);
    const mudaram = (r && r.mudaram) || [];
    aviso.ok(mudaram.length
      ? 'Desfeito. ' + mudaram.map((t) => t.nome || 'Uma TV').join(', ') + (mudaram.length === 1 ? ' foi mudada' : ' foram mudadas') + ' depois e ficou como está.'
      : 'Desfeito: as TVs voltaram ao que eram.');
    return true;
  } catch (e) { aviso.erro('lote', 'Não deu para desfazer.', e.message || ''); return false; }
}

// O aviso de "foi para a TV" com o Desfazer do lote.
export function avisarComDesfazer(texto, idLote) {
  if (!idLote) { aviso.ok(texto); return; }
  emitir({
    tom: 'desfazer', texto,
    acao: { rotulo: 'Desfazer', on: () => desfazerLote(idLote) },
  });
}

/*
 * A OPERAÇÃO NO SERVIDOR (teste de carga, 16/11). A campanha e a peça
 * pronta em muitas TVs liam a programação de cada TV aqui e mandavam todas
 * de volta (gravarEmLote): numa conta de RH, acima de ~19 TVs o envio
 * passava de 2 MB e era recusado, e 300 TVs eram 300 leituras (metade do
 * freio da conta). Agora vai a operação — "esta campanha nestas TVs" — num
 * pedido de poucos KB, e o servidor aplica em cada TV com as mesmas regras
 * (js/lote-tv.js), tudo ou nada, com a loja de cada TV, a aprovação, a
 * versão e o Desfazer. Devolve { lote, ids } como o gravarEmLote.
 * `hoje`: o dia de quem manda (as datas das peças começam nele).
 */
export function hojeLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
export async function enviarOperacao(operacao, telas) {
  const vistas = new Set();
  const lista = (telas || []).filter((t) => t && t.id && !vistas.has(t.id) && vistas.add(t.id));
  if (!lista.length) return { lote: null, ids: [] };
  const r = await loteApi.operacao({ operacao, telas: lista.map((t) => (t.entrada != null ? { id: t.id, entrada: t.entrada } : t.id)), hoje: hojeLocal() });
  // Com a aprovação ligada, o envio do membro virou pedido (202): quem chama pode dizer "espera o dono".
  return { lote: (r && r.lote) || null, ids: lista.map((t) => t.id), ...(r && r.pendente ? { pendente: true, mensagem: r.mensagem || '' } : {}),
    ...(r && Array.isArray(r.marcadas) ? { marcadas: r.marcadas } : {}) };
}

/*
 * A campanha como vai para o servidor: as entradas distintas (cada TV aponta
 * para a sua) só com as zonas, e as peças que giram já com a importância.
 */
function campanhaParaOServidor(alvos) {
  const indices = [];
  const entradas = [];
  const telas = alvos.map((a) => {
    let k = indices.indexOf(a.indice);
    if (k < 0) {
      k = indices.length;
      indices.push(a.indice);
      const z = (a.entrada && a.entrada.zonas) || {};
      const pecas = (l, comImp) => (l || []).map((p) => ({ item: comImp ? imp(p.item) : p.item }));
      const faixa = (f) => ({ pecas: pecas(f && f.pecas), mensagens: (f && f.mensagens) || [] });
      const rodape = faixa(z.rodape);
      if (z.rodape && z.rodape.contagem) rodape.contagem = z.rodape.contagem;
      entradas.push({ zonas: { principal: pecas(z.principal, true), lateral: pecas(z.lateral, true), cabecalho: faixa(z.cabecalho), rodape } });
    }
    return { id: a.tela.id, entrada: k };
  });
  return { entradas, telas };
}

// O plano antes de rodar: que TV recebe, e quais trocariam de layout — o servidor confere cada TV sem a programação vir para cá.
export async function planoDeRodar(resultado, telas) {
  const alvos = alvosDaCampanha(resultado, telas);
  if (!alvos.length) return [];
  const { entradas, telas: lista } = campanhaParaOServidor(alvos);
  const r = await loteApi.operacao({ operacao: { tipo: 'campanha', nome: (resultado && resultado.nome) || 'Campanha', entradas, trocarLayout: true }, telas: lista, simular: true });
  const porId = new Map(((r && r.telas) || []).map((t) => [t.id, t]));
  return alvos.map((a) => {
    const t = porId.get(a.tela.id) || {};
    return { ...a, faltam: t.faltam || [], layoutAtual: t.layoutAtual || '', layoutNovo: t.layoutNovo || '' };
  });
}

/*
 * O "QUANDO" DA CAMPANHA (reteste 2): a campanha da IA ia ao ar sem a
 * pergunta que todo outro caminho faz. A escolha (sempre, só hoje, até um
 * dia, numa hora do dia) vale para as peças da campanha que giram no meio e
 * no lado; as faixas de cima e de baixo não têm horário na TV e ficam até
 * pausar. O que não é da campanha não muda.
 */
export const quandoNaCampanha = (cfg, nome, escolha) => L.quandoNaCampanha(cfg, nome, escolha);

// `quando`: a escolha do "Quando" (lib/quando.js); sem ela, sempre. Devolve os ids, com `.lote` para o Desfazer.
export async function rodarCampanha(plano, nome, { trocarLayout, quando } = {}) {
  const { entradas, telas } = campanhaParaOServidor(plano);
  const r = await enviarOperacao({ tipo: 'campanha', nome, entradas, trocarLayout: !!trocarLayout, quando: quando || null }, telas);
  const ids = r.ids.slice();
  ids.lote = r.lote;
  if (r.pendente) ids.pendente = true;
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
  if (!alvos.length) return null;
  const { entradas, telas: lista } = campanhaParaOServidor(alvos);
  const r = await enviarOperacao({ tipo: 'pausar-campanha', nome, entradas }, lista);
  return r.lote;
}

/*
 * UMA PEÇA PRONTA EM VÁRIAS TVS (EXECUTOR §2c, item 34): Mídias › Peças
 * prontas. A zona sai do papel da peça — faixa no cabeçalho ou no rodapé,
 * em pé na lateral, deitada na principal — e, sem a zona certa, ela vai para
 * a principal. Entra no fim da zona, sem tirar nada do que já está lá.
 */
export const aplicarPeca = (cfg, peca) => L.aplicarPeca(cfg, peca);

// Todas de uma vez, pelo servidor (a operação 'peca'); devolve { lote, ids } para o Desfazer.
export async function porPecaNasTelas(peca, ids, telas) {
  const p = peca || {};
  return enviarOperacao({ tipo: 'peca', peca: { item: p.item, campanha: p.campanha || '', papel: p.papel || '', formato: p.formato || '', label: p.label || '' } },
    ids.map((id) => ({ id })));
}
