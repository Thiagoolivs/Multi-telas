/*
 * server/ver-tela.js — "Ver a tela agora" (EXECUTOR, item 9).
 *
 * A TV responde ao comando "estado" com o que está no ar, zona por zona
 * (js/player.js, coletarEstado), e o painel desenha. Quem fala aqui é a TV,
 * com o token dela: o que ela manda NÃO vai direto para o painel do dono.
 * Cada item é conferido contra a programação salva no banco — se bate, vai o
 * item do banco (que já passou pela porta ao salvar); se não bate, a TV está
 * com uma programação antiga no cache, e o painel diz isso em vez de
 * desenhar algo que ninguém salvou.
 */

const LIMITE_ZONAS = 24;
const LIMITE_MENSAGENS = 20;

// O mesmo item, escrito do mesmo jeito: a TV recebe a config como JSON e
// devolve o objeto sem mexer (o player não altera itens).
const igual = (a, b) => {
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
};

const texto = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const inteiro = (v, max) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(max, Math.round(Number(v)))) : 0);

function conferirEstado(bruto, configTexto) {
  let cfg = null;
  try { cfg = configTexto ? JSON.parse(configTexto) : null; } catch (e) { cfg = null; }
  const zonasSalvas = (cfg && cfg.zonas) || {};
  const e = bruto && typeof bruto === 'object' && !Array.isArray(bruto) ? bruto : {};
  const zonas = {};
  const entradas = e.zonas && typeof e.zonas === 'object' ? Object.keys(e.zonas).slice(0, LIMITE_ZONAS) : [];
  for (const id of entradas) {
    if (!/^[\w-]{1,40}$/.test(id)) continue;
    const z = e.zonas[id] || {};
    const salva = zonasSalvas[id] || {};
    const saida = {};
    if (z.relogio) saida.relogio = true;
    // Zona sem conteúdo, preta e pulsando (EXECUTOR §2d, item 39).
    if (z.esperando) saida.esperando = true;
    // Cabeçalho e rodapé desenhados por peça (PLANO §4.7).
    if (z.peca && salva.peca) saida.peca = salva.peca;
    // As mensagens do letreiro: só as que estão salvas.
    if (Array.isArray(z.mensagens) && Array.isArray(salva.messages)) {
      saida.mensagens = z.mensagens.filter((m) => salva.messages.some((s) => igual(s, m))).slice(0, LIMITE_MENSAGENS);
    }
    if (z.item && typeof z.item === 'object') {
      const doBanco = (Array.isArray(salva.items) ? salva.items : []).find((s) => igual(s, z.item));
      if (doBanco) saida.item = doBanco;
      else saida.antigo = true;
      saida.posicao = inteiro(z.posicao, 999);
      saida.total = inteiro(z.total, 999);
    }
    zonas[id] = saida;
  }
  const fora = e.foraDoHorario === 'preta' || e.foraDoHorario === 'relogio' ? e.foraDoHorario : '';
  const tela = e.tela && typeof e.tela === 'object' ? { w: inteiro(e.tela.w, 10000), h: inteiro(e.tela.h, 10000) } : { w: 0, h: 0 };
  return {
    layoutId: texto(e.layoutId, 60) || 'dashboard',
    nome: texto(e.nome, 120),
    tela,
    foraDoHorario: fora,
    margem: Math.min(5, Math.max(0, Number(e.margem) || 0)),
    zonas,
  };
}

module.exports = { conferirEstado };
