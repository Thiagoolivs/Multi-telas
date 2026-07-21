/*
 * screenConfig.js — catálogo de layouts, temas e opções de tela (espelha
 * js/templates.js, js/theme.js e js/news.js). Fonte única para a aba "Ajustes"
 * e para saber quais zonas cada layout tem.
 */

// Layouts (id, nome, descrição, zonas). type: playlist | ticker | header.
export const LAYOUTS = [
  { id: 'dashboard', name: 'Painel Notícias', description: 'Lateral + destaque grande + faixa de notícias.',
    zones: [ { id: 'lateral', name: 'Lateral', type: 'playlist' }, { id: 'principal', name: 'Principal', type: 'playlist' }, { id: 'rodape', name: 'Notícias', type: 'ticker' } ] },
  { id: 'full', name: 'Tela Cheia', description: 'Uma zona única. Ideal para vídeos e campanhas.',
    zones: [ { id: 'principal', name: 'Principal', type: 'playlist' } ] },
  { id: 'full-ticker', name: 'Tela Cheia + Rodapé', description: 'Tela cheia com avisos rolando no rodapé.',
    zones: [ { id: 'principal', name: 'Principal', type: 'playlist' }, { id: 'rodape', name: 'Rodapé', type: 'ticker' } ] },
  { id: 'sidebar-right', name: 'Destaque + Barra Lateral', description: 'Principal grande, lateral de avisos e rodapé.',
    zones: [ { id: 'principal', name: 'Principal', type: 'playlist' }, { id: 'lateral', name: 'Lateral', type: 'playlist' }, { id: 'rodape', name: 'Rodapé', type: 'ticker' } ] },
  { id: 'header-main-ticker', name: 'Cabeçalho + Principal + Rodapé', description: 'Faixa superior, conteúdo no meio, avisos no rodapé.',
    zones: [ { id: 'cabecalho', name: 'Cabeçalho', type: 'header' }, { id: 'principal', name: 'Principal', type: 'playlist' }, { id: 'rodape', name: 'Rodapé', type: 'ticker' } ] },
  { id: 'quad', name: 'Mosaico 2x2', description: 'Quatro zonas independentes ao mesmo tempo.',
    zones: [ { id: 'z1', name: 'Zona 1', type: 'playlist' }, { id: 'z2', name: 'Zona 2', type: 'playlist' }, { id: 'z3', name: 'Zona 3', type: 'playlist' }, { id: 'z4', name: 'Zona 4', type: 'playlist' } ] },
  { id: 'video-dynamic', name: 'Vídeo + Painel Dinâmico', description: 'Vídeo/live contínuo enquanto um painel ao lado respira.',
    zones: [ { id: 'video', name: 'Vídeo / Live', type: 'playlist' }, { id: 'info', name: 'Painel Dinâmico', type: 'playlist' }, { id: 'rodape', name: 'Notícias', type: 'ticker' } ] },
  { id: 'corporate', name: 'Corporativo Completo', description: 'Cabeçalho + destaque + lateral + rodapé. O mais completo.',
    zones: [ { id: 'cabecalho', name: 'Cabeçalho', type: 'header' }, { id: 'principal', name: 'Principal', type: 'playlist' }, { id: 'lateral', name: 'Lateral', type: 'playlist' }, { id: 'rodape', name: 'Rodapé', type: 'ticker' } ] },
];

export function getLayout(id) { return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0]; }
export function zonesOf(cfg) { return getLayout(cfg && cfg.settings && cfg.settings.layoutId).zones; }

export const THEME_PRESETS = [
  { value: 'dark-premium', label: 'Dark Premium' },
  { value: 'corporate-blue', label: 'Corporate Blue' },
  { value: 'luxury-gold', label: 'Luxury Gold' },
  { value: 'neon-cyber', label: 'Neon Cyber' },
  { value: 'glassmorphism', label: 'Glassmorphism' },
  { value: 'minimal-white', label: 'Minimal White' },
  { value: 'elegant-black', label: 'Elegant Black' },
  { value: 'energy-green', label: 'Energy Green' },
  { value: 'modern-purple', label: 'Modern Purple' },
];

export const FONTS = [
  { value: 'system', label: 'Sistema (recomendado)' },
  { value: 'inter', label: 'Inter' },
  { value: 'poppins', label: 'Poppins' },
  { value: 'montserrat', label: 'Montserrat' },
  { value: 'roboto', label: 'Roboto' },
  { value: 'space-grotesk', label: 'Space Grotesk' },
];

export const TRANSITIONS = [
  { value: 'cinematic', label: 'Cinematográfica' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide', label: 'Slide' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'none', label: 'Nenhuma' },
];

export const DECORATIONS = [
  { value: 'none', label: 'Nenhuma' },
  { value: 'auto', label: 'Automática (pela data)' },
  { value: 'snow', label: 'Neve' },
  { value: 'lights', label: 'Luzes' },
  { value: 'hearts', label: 'Corações' },
  { value: 'petals', label: 'Pétalas' },
  { value: 'flags', label: 'Bandeirinhas' },
  { value: 'confetti', label: 'Confete' },
  { value: 'fireworks', label: 'Fogos' },
];

export const NEWS_FEEDS = [
  { value: 'g1', label: 'G1 — Últimas' },
  { value: 'g1-economia', label: 'G1 — Economia' },
  { value: 'g1-tecnologia', label: 'G1 — Tecnologia' },
  { value: 'uol', label: 'UOL Notícias' },
  { value: 'folha', label: 'Folha de S.Paulo' },
  { value: 'cnnbrasil', label: 'CNN Brasil' },
  { value: 'bbc', label: 'BBC News Brasil' },
  { value: 'agenciabrasil', label: 'Agência Brasil' },
  { value: 'exame', label: 'Exame' },
];

// Ticker padrão (espelha storage.normalize em js/storage.js).
export function defaultTicker() {
  return { messages: [], velocidade: 60, titulo: 'ÚLTIMAS NOTÍCIAS', modo: 'noticias', intervalo: 8, fontes: [], rssUrl: '', quantidade: 10 };
}

// Garante que a zona exista no config, conforme o tipo dela no layout.
export function ensureZone(cfg, zone) {
  const z = cfg.zonas || (cfg.zonas = {});
  if (z[zone.id]) return;
  if (zone.type === 'ticker') z[zone.id] = defaultTicker();
  else if (zone.type === 'header') z[zone.id] = { header: true };
  else z[zone.id] = { items: [] };
}
