/*
 * Mudar a tela com a IA, no painel (EXECUTOR D28), sem React para dar para
 * testar.
 *
 * O servidor devolve a LISTA DE MUDANÇAS ({ layoutId, tema, fundo, fundoCor,
 * destaque, fonte, relogio, clima, cidadeClima }), já conferida. Aqui ela é
 * aplicada numa CÓPIA da config — a mesma que vira a prévia "depois" e, com
 * o "Usar assim", o rascunho do editor (vai para a TV no Publicar).
 */
import { getLayout, THEME_PRESETS, FONTS } from './screenConfig.js';
import './fundoDaTV.js'; // js/theme.js: a mesma conta de cor da TV

// O que some ao trocar de layout: zona com conteúdo que o layout novo não tem (fica guardado na config).
export function zonasQueSaem(zonasAtuais, idNovo) {
  const novo = getLayout(idNovo);
  const ids = new Set(novo.zones.map((z) => z.id));
  return Object.entries(zonasAtuais || {})
    .filter(([id, z]) => !ids.has(id) && z && ((Array.isArray(z.items) && z.items.length) || z.peca || (Array.isArray(z.pecas) && z.pecas.length)))
    .map(([id]) => id);
}

// A orientação da TV pelo layout (o layout "qualquer" vale como deitada, como no resto do painel).
export function orientacaoDaTela(cfg) {
  const o = getLayout(cfg && cfg.settings && cfg.settings.layoutId).orientation;
  return o === 'portrait' || o === 'square' ? o : 'landscape';
}

const mostrarOuNao = (z, chave, mostrar) => { const n = { ...z }; if (mostrar) delete n[chave]; else n[chave] = false; return n; };

export function aplicarMudancas(cfg, m, { coresMarca = [] } = {}) {
  const next = JSON.parse(JSON.stringify(cfg || {}));
  const s = (next.settings = { ...(next.settings || {}) });
  const theme = (s.theme = { preset: 'dark-premium', font: 'system', ...(s.theme || {}) });
  const ov = (theme.overrides = { ...(theme.overrides || {}) });
  m = m || {};

  if (m.layoutId) s.layoutId = m.layoutId;
  // Tema da marca sem cores cadastradas não muda nada (a descrição avisa).
  if (m.tema === 'marca') { if (coresMarca.length) { theme.preset = 'marca'; theme.marca = coresMarca.slice(); } }
  else if (m.tema) { theme.preset = m.tema; if (theme.aplicarMarca && coresMarca.length) theme.marca = coresMarca.slice(); }
  // Como em Ajustes › Fundo da TV: escolher o fundo apaga o fundo pintado à mão.
  if (m.fundo) {
    delete ov.bg; delete ov.bg2;
    theme.fundo = m.fundo;
    if (m.fundo === 'cor') theme.fundoCor = m.fundoCor || theme.fundoCor || '#f5efe8';
  }
  if (m.fonte) theme.font = m.fonte;
  // O destaque no tom que se lê sobre o fundo que a tela vai ter.
  if (m.destaque) {
    const T = globalThis.MTTheme;
    const semAcento = { ...theme, overrides: { ...ov, accent: '' } };
    const t = T ? T.resolve(semAcento, { pecas: T.pecasDaConfig(next) }) : null;
    ov.accent = t && T.acentoSobre ? T.acentoSobre(t.bg, m.destaque) : m.destaque;
  }
  if (m.cidadeClima) s.cidadeClima = m.cidadeClima;

  next.zonas = { ...(next.zonas || {}) };
  const layout = getLayout(s.layoutId);
  const cab = layout.zones.find((z) => z.type === 'header');
  const rod = layout.zones.find((z) => z.type === 'ticker');
  // "Tira o relógio" tira os dois: o de cima e o do rodapé (que aparece quando o de cima some).
  if (m.relogio !== undefined) {
    if (cab) next.zonas[cab.id] = mostrarOuNao({ header: true, ...(next.zonas[cab.id] || {}) }, 'relogio', m.relogio);
    if (rod) next.zonas[rod.id] = { ...(next.zonas[rod.id] || {}), mostrarRelogio: !!m.relogio };
  }
  if (m.clima !== undefined && cab) next.zonas[cab.id] = mostrarOuNao({ header: true, ...(next.zonas[cab.id] || {}) }, 'clima', m.clima);
  return next;
}

const NOME_DO_FUNDO = { pecas: 'combinando com as peças', claro: 'claro', escuro: 'escuro', cor: 'na cor escolhida' };
const rotulo = (lista, v) => ((lista.find((x) => x.value === v) || {}).label || v);

// O que muda, em português, para a pessoa ler antes do "Usar assim". { texto, aviso? }
export function descrever(cfg, m, { coresMarca = [] } = {}) {
  const l = [];
  m = m || {};
  const atual = getLayout(cfg && cfg.settings && cfg.settings.layoutId);
  if (m.layoutId) {
    const novo = getLayout(m.layoutId);
    l.push({ texto: 'Layout: ' + atual.name + ' → ' + novo.name });
    for (const id of zonasQueSaem(cfg && cfg.zonas, m.layoutId)) {
      const z = atual.zones.find((x) => x.id === id);
      l.push({ aviso: true, texto: 'A zona ' + (z ? z.name.replace(/\s*\(.*\)$/, '') : id) + ' sai da tela; o que está nela fica guardado.' });
    }
  }
  if (m.tema === 'marca') l.push(coresMarca.length ? { texto: 'Cores: as da sua marca' } : { aviso: true, texto: 'Para usar as cores da marca, cadastre-as em Marca.' });
  else if (m.tema) l.push({ texto: 'Cores: tema ' + rotulo(THEME_PRESETS, m.tema) });
  if (m.fundo) l.push({ texto: 'Fundo ' + NOME_DO_FUNDO[m.fundo], ...(m.fundo === 'cor' && m.fundoCor ? { cor: m.fundoCor } : {}) });
  if (m.destaque) l.push({ texto: 'Cor dos destaques', cor: m.destaque });
  if (m.fonte) l.push({ texto: 'Fonte: ' + rotulo(FONTS, m.fonte) });
  if (m.relogio !== undefined) l.push({ texto: m.relogio ? 'O relógio aparece' : 'O relógio sai' });
  if (m.clima !== undefined) l.push({ texto: m.clima ? 'O clima aparece' + (m.cidadeClima ? ' (' + m.cidadeClima + ')' : '') : 'O clima sai' });
  else if (m.cidadeClima) l.push({ texto: 'Clima de ' + m.cidadeClima });
  return l;
}

export const temMudanca = (m) => !!m && Object.keys(m).length > 0;
