/*
 * screenDigest.js — a tela se explicando.
 *
 * A queixa que isto resolve: "o sistema não está se entendendo como um todo,
 * as ações se sobrepõem, os temas se sobrepõem". Dá para vestir a tela com uma
 * data, publicar uma campanha por cima e ainda mexer no tema à mão — e nada no
 * painel diz quem venceu nem o que a TV está exibindo agora.
 *
 * Aqui a configuração vira um resumo em português: de onde veio cada coisa,
 * quanto tempo o ciclo dura e o que está errado. Nenhuma decisão é tomada por
 * este arquivo; ele só descreve. Consertar continua sendo escolha do usuário.
 */
import { zonesOf, getLayout } from './screenConfig.js';
import { typeLabel } from './contentTypes.js';

// Duração de um item na tela. 0 significa "fica fixo" — para efeito de ciclo,
// um item fixo prende a zona e a rotação deixa de existir.
export function duracaoDe(item) {
  const d = Number(item && item.duracao);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

export function formatarTempo(seg) {
  if (!seg) return '—';
  if (seg < 60) return Math.round(seg) + 's';
  const m = Math.floor(seg / 60), s = Math.round(seg % 60);
  return s ? `${m}min ${s}s` : `${m}min`;
}

/*
 * De onde veio o conteúdo. `_season` e `_campanha` são gravados por quem
 * aplica; o resto é manual. Saber a origem é o que permite dizer "a data
 * colocou isto" em vez de deixar o usuário achar que apareceu sozinho.
 */
export function origemDe(item) {
  if (!item) return 'manual';
  if (item._season) return 'data';
  if (item._campanha) return 'campanha';
  return 'manual';
}

const ROTULO_ORIGEM = { data: 'data comemorativa', campanha: 'campanha', manual: 'você' };

// De onde veio o tema atual.
export function origemDoTema(settings) {
  const t = (settings && settings.theme) || {};
  const ov = t.overrides || {};
  const mexeuAMao = Object.keys(ov).length > 0;
  if (t.preset === 'marca') return { chave: 'marca', texto: 'as cores da sua Marca', mexeuAMao };
  if (t.aplicarMarca) return { chave: 'marca-tingida', texto: `o tema ${t.preset} com as cores da sua Marca`, mexeuAMao };
  return { chave: 'preset', texto: `o tema ${t.preset || 'padrão'}`, mexeuAMao };
}

/*
 * Problemas que fazem a tela parecer amadora e que o usuário não vê no painel
 * — só na TV, depois de instalada. Cada um existe por causa de um jeito
 * concreto de a tela decepcionar.
 */
function problemasDaZona(zona, itens, ciclo) {
  const p = [];
  if (!itens.length) {
    p.push({ nivel: 'aviso', texto: `${zona.name} está vazia — a TV mostra "Sem conteúdo" nesse espaço` });
    return p;
  }
  const fixo = itens.find((i) => duracaoDe(i) === 0);
  if (fixo && itens.length > 1) {
    p.push({ nivel: 'aviso', texto: `${zona.name}: "${typeLabel(fixo.type)}" está com duração 0 (fica fixo) e trava os outros ${itens.length - 1}` });
  } else if (!fixo && ciclo > 0 && ciclo < 45) {
    p.push({ nivel: 'dica', texto: `${zona.name} repete a cada ${formatarTempo(ciclo)} — quem passa duas vezes vê o mesmo` });
  }
  /*
   * Peça composta para um formato muito diferente do da zona não distorce mais,
   * mas sobra fundo dos dois lados. Vale avisar: quem escolhe uma peça vertical
   * para uma faixa deitada quase sempre pegou a peça errada.
   */
  const razaoZona = zona.ratio || null;
  if (razaoZona) {
    itens.forEach((i) => {
      if (i.type !== 'composicao' || !i.formato) return;
      const [w, h] = String(i.formato).split('/').map(Number);
      if (!w || !h) return;
      const r = w / h;
      const desvio = Math.max(r / razaoZona, razaoZona / r);
      if (desvio > 2.2) {
        p.push({ nivel: 'dica', texto: `${zona.name}: uma peça ${i.formato} nesta zona sobra muito fundo — o formato mais próximo renderia melhor` });
      }
    });
  }
  return p;
}

/*
 * digest — recebe a config da tela e devolve o que ela é.
 * `ratios` é opcional: as proporções medidas de cada zona, quando a prévia já
 * as conhece. Sem elas, o aviso de formato incompatível simplesmente não sai.
 */
export function digest(cfg, ratios) {
  if (!cfg) return null;
  const settings = cfg.settings || {};
  const zonas = zonesOf(cfg).map((z) => ({ ...z, ratio: (ratios && ratios[z.id]) || null }));
  const layout = getLayout(settings.layoutId);

  const porZona = [];
  const problemas = [];
  const origens = { data: 0, campanha: 0, manual: 0 };

  zonas.forEach((z) => {
    const dados = (cfg.zonas && cfg.zonas[z.id]) || {};
    if (z.type === 'ticker') {
      const msgs = (dados.messages || []).filter(Boolean).length;
      const feeds = (dados.fontes || []).length;
      porZona.push({
        id: z.id, nome: z.name, tipo: 'ticker',
        resumo: feeds
          ? `${feeds} fonte(s) de notícia` + (msgs ? ` + ${msgs} aviso(s) fixo(s)` : '')
          : `${msgs} aviso(s) fixo(s)`,
        ciclo: 0, itens: msgs, origens: {},
      });
      if (!feeds && !msgs) problemas.push({ nivel: 'aviso', texto: `${z.name} não tem nem notícia nem aviso` });
      return;
    }
    if (z.type === 'header') {
      porZona.push({ id: z.id, nome: z.name, tipo: 'header', resumo: 'logo, relógio e clima automáticos', ciclo: 0, itens: 0, origens: {} });
      return;
    }
    const itens = (dados.items || []).filter(Boolean);
    const ciclo = itens.reduce((s, i) => s + duracaoDe(i), 0);
    const daZona = { data: 0, campanha: 0, manual: 0 };
    itens.forEach((i) => { const o = origemDe(i); daZona[o]++; origens[o]++; });
    porZona.push({
      id: z.id, nome: z.name, tipo: 'playlist',
      resumo: `${itens.length} conteúdo(s)`,
      ciclo, itens: itens.length, origens: daZona,
    });
    problemasDaZona(z, itens, ciclo).forEach((p) => problemas.push(p));
  });

  const tema = origemDoTema(settings);
  const decoracao = settings.decoracao && settings.decoracao !== 'none' ? settings.decoracao : null;

  /*
   * Sobreposição de decisões: o caso concreto que gera insegurança é o tema
   * ter vindo de uma data comemorativa e depois alguém mexer nas cores à mão.
   * Aí o painel mostra "tema da data" e a tela mostra outra coisa.
   */
  const temDaData = origens.data > 0;
  if (temDaData && tema.mexeuAMao) {
    problemas.push({
      nivel: 'dica',
      texto: 'o tema tem ajustes manuais por cima do que a data comemorativa aplicou — os manuais é que valem',
    });
  }
  if (settings.layoutAuto === true) {
    problemas.push({
      nivel: 'dica',
      texto: 'as zonas trocam de proporção sozinhas a cada ' + (settings.layoutAutoSeconds || 20) + 's — as peças encolhem e crescem junto',
    });
  }

  const cicloTotal = porZona.filter((z) => z.tipo === 'playlist').reduce((m, z) => Math.max(m, z.ciclo), 0);

  return {
    layout: layout.name,
    tema, decoracao,
    zonas: porZona,
    origens,
    cicloTotal,
    problemas,
    rotuloOrigem: (k) => ROTULO_ORIGEM[k] || k,
  };
}
