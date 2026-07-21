/*
 * contentTypes.js — fonte única do editor de conteúdo (React).
 *
 * Descreve os tipos de conteúdo suportados no editor: rótulo, ícone, campos do
 * formulário, item padrão e um resumo para a lista. Os nomes de campo batem
 * exatamente com o que o player (js/render.js) lê — o editor produz o MESMO
 * config que a TV consome.
 *
 * Fatia 1: tipos que não dependem de upload de mídia (imagens/vídeos por URL).
 * O upload real entra com o pipeline de object storage (ver docs/AUDITORIA.md).
 */
import {
  Megaphone, Type, Quote, Tag, BarChart3, Share2, Image as ImageIcon,
  Youtube, Globe, QrCode, CloudSun, Film,
} from 'lucide-react';

// Variantes do "Aviso Premium" (espelha ANN_VARIANTS em js/render.js).
export const ANNOUNCE_VARIANTS = [
  { value: 'comunicado', label: 'Comunicado' },
  { value: 'urgente', label: 'Urgente' },
  { value: 'evento', label: 'Evento' },
  { value: 'rh', label: 'Recursos Humanos' },
  { value: 'seguranca', label: 'Segurança' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'conquista', label: 'Conquista' },
  { value: 'treinamento', label: 'Treinamento' },
  { value: 'saude', label: 'Saúde & Bem-estar' },
];

const DUR = { key: 'duracao', label: 'Duração (s)', kind: 'number', min: 0, hint: '0 = fica fixo na tela' };

// Cada tipo: label, ícone, grupo, campos, item padrão e resumo p/ a lista.
export const CONTENT_TYPES = {
  text: {
    label: 'Texto / Comunicado', icon: Type, group: 'Mensagens',
    fields: [
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto', kind: 'textarea' },
      { key: 'align', label: 'Alinhamento', kind: 'select', options: [
        { value: 'center', label: 'Centro' }, { value: 'left', label: 'Esquerda' }, { value: 'right', label: 'Direita' } ] },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', optional: true },
      { key: 'cor', label: 'Cor do texto', kind: 'color', optional: true },
      DUR,
    ],
    make: () => ({ type: 'text', titulo: 'Novo comunicado', corpo: '', align: 'center', duracao: 10 }),
    summary: (i) => i.titulo || i.corpo || 'Texto',
  },
  announce: {
    label: 'Aviso Premium', icon: Megaphone, group: 'Mensagens',
    fields: [
      { key: 'tipo', label: 'Tipo', kind: 'select', options: ANNOUNCE_VARIANTS },
      { key: 'etiqueta', label: 'Etiqueta (opcional)', kind: 'text' },
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'corpo', label: 'Texto', kind: 'textarea' },
      { key: 'info', label: 'Rodapé / info', kind: 'text' },
      DUR,
    ],
    make: () => ({ type: 'announce', tipo: 'comunicado', titulo: 'Aviso importante', corpo: '', duracao: 12 }),
    summary: (i) => i.titulo || 'Aviso',
  },
  quote: {
    label: 'Frase do Dia', icon: Quote, group: 'Mensagens',
    fields: [
      { key: 'texto', label: 'Frase', kind: 'textarea' },
      { key: 'autor', label: 'Autor', kind: 'text' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', optional: true },
      DUR,
    ],
    make: () => ({ type: 'quote', texto: '', autor: '', duracao: 12 }),
    summary: (i) => i.texto || 'Frase',
  },
  promo: {
    label: 'Promoção / Produto', icon: Tag, group: 'Comercial',
    fields: [
      { key: 'selo', label: 'Selo (ex.: OFERTA)', kind: 'text' },
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'precoDe', label: 'Preço "de"', kind: 'text' },
      { key: 'precoPor', label: 'Preço "por"', kind: 'text' },
      { key: 'cta', label: 'Chamada (CTA)', kind: 'text' },
      { key: 'imagem', label: 'Imagem', kind: 'media', accept: 'image' },
      DUR,
    ],
    make: () => ({ type: 'promo', titulo: 'Produto', precoPor: '', duracao: 12 }),
    summary: (i) => i.titulo || 'Promoção',
  },
  kpi: {
    label: 'Indicador (KPI)', icon: BarChart3, group: 'Comercial',
    fields: [
      { key: 'rotulo', label: 'Rótulo', kind: 'text' },
      { key: 'valor', label: 'Valor', kind: 'text' },
      { key: 'variacao', label: 'Variação (ex.: 12%)', kind: 'text' },
      { key: 'tendencia', label: 'Tendência', kind: 'select', options: [
        { value: 'estavel', label: 'Estável' }, { value: 'subiu', label: 'Subiu' }, { value: 'desceu', label: 'Desceu' } ] },
      { key: 'detalhe', label: 'Detalhe', kind: 'text' },
      DUR,
    ],
    make: () => ({ type: 'kpi', rotulo: 'Meta do mês', valor: '0', tendencia: 'estavel', duracao: 12 }),
    summary: (i) => (i.rotulo ? i.rotulo + ': ' : '') + (i.valor || ''),
  },
  social: {
    label: 'Redes Sociais', icon: Share2, group: 'Comercial',
    fields: [
      { key: 'rede', label: 'Rede', kind: 'select', options: [
        { value: 'instagram', label: 'Instagram' }, { value: 'facebook', label: 'Facebook' },
        { value: 'youtube', label: 'YouTube' }, { value: 'linkedin', label: 'LinkedIn' },
        { value: 'tiktok', label: 'TikTok' }, { value: 'site', label: 'Site' } ] },
      { key: 'titulo', label: 'Título', kind: 'text' },
      { key: 'handle', label: 'Perfil (@)', kind: 'text' },
      { key: 'url', label: 'Link', kind: 'url' },
      { key: 'qr', label: 'Mostrar QR Code', kind: 'bool' },
      DUR,
    ],
    make: () => ({ type: 'social', rede: 'instagram', titulo: 'Siga-nos', handle: '', qr: false, duracao: 12 }),
    summary: (i) => i.handle || i.titulo || 'Redes sociais',
  },
  image: {
    label: 'Imagem', icon: ImageIcon, group: 'Mídia',
    fields: [
      { key: 'src', label: 'Imagem', kind: 'media', accept: 'image' },
      { key: 'fit', label: 'Ajuste', kind: 'select', options: [
        { value: 'cover', label: 'Preencher (cover)' }, { value: 'contain', label: 'Conter (contain)' } ] },
      DUR,
    ],
    make: () => ({ type: 'image', src: '', fit: 'cover', duracao: 8 }),
    summary: (i) => i.src ? 'Imagem' : 'Imagem (sem arquivo)',
  },
  video: {
    label: 'Vídeo (MP4)', icon: Film, group: 'Mídia',
    fields: [
      { key: 'src', label: 'Vídeo', kind: 'media', accept: 'video' },
      { key: 'loop', label: 'Repetir', kind: 'bool' },
      { key: 'muted', label: 'Sem som', kind: 'bool' },
      { key: 'fit', label: 'Ajuste', kind: 'select', options: [
        { value: 'contain', label: 'Conter (contain)' }, { value: 'cover', label: 'Preencher (cover)' } ] },
      { key: 'duracao', label: 'Duração (s)', kind: 'number', min: 0, hint: '0 = toca o vídeo inteiro' },
    ],
    make: () => ({ type: 'video', src: '', loop: false, muted: true, fit: 'contain', duracao: 0 }),
    summary: (i) => i.src ? 'Vídeo' : 'Vídeo (sem arquivo)',
  },
  youtube: {
    label: 'YouTube / Ao vivo', icon: Youtube, group: 'Mídia',
    fields: [
      { key: 'videoId', label: 'ID ou URL do vídeo', kind: 'text' },
      { key: 'channelId', label: 'ID do canal (transmissão ao vivo)', kind: 'text' },
      { key: 'loop', label: 'Repetir', kind: 'bool' },
      DUR,
    ],
    make: () => ({ type: 'youtube', videoId: '', duracao: 20 }),
    summary: (i) => i.channelId ? 'Live do canal' : (i.videoId || 'YouTube'),
  },
  web: {
    label: 'Página Web', icon: Globe, group: 'Mídia',
    fields: [
      { key: 'url', label: 'URL da página', kind: 'url' },
      DUR,
    ],
    make: () => ({ type: 'web', url: '', duracao: 20 }),
    summary: (i) => i.url || 'Página web',
  },
  qrcode: {
    label: 'QR Code', icon: QrCode, group: 'Mídia',
    fields: [
      { key: 'data', label: 'Link ou texto', kind: 'text' },
      { key: 'caption', label: 'Legenda', kind: 'text' },
      { key: 'bg', label: 'Cor de fundo', kind: 'color', optional: true },
      DUR,
    ],
    make: () => ({ type: 'qrcode', data: '', caption: '', duracao: 12 }),
    summary: (i) => i.caption || i.data || 'QR Code',
  },
  weatherpro: {
    label: 'Painel do Clima', icon: CloudSun, group: 'Widgets',
    fields: [
      { key: 'cidade', label: 'Cidade', kind: 'text' },
      DUR,
    ],
    make: () => ({ type: 'weatherpro', cidade: 'São Paulo', duracao: 0 }),
    summary: (i) => i.cidade || 'Clima',
  },
};

export const CONTENT_ORDER = ['text', 'announce', 'quote', 'promo', 'kpi', 'social', 'image', 'video', 'youtube', 'web', 'qrcode', 'weatherpro'];

export function typeLabel(type) {
  return (CONTENT_TYPES[type] && CONTENT_TYPES[type].label) || type;
}
export function itemSummary(item) {
  const t = CONTENT_TYPES[item.type];
  return t ? t.summary(item) : (item.type || 'Conteúdo');
}

// Config mínima para uma tela sem conteúdo ainda.
export function defaultConfig(deviceName) {
  return {
    version: 1,
    settings: {
      nome: deviceName || 'Tela',
      layoutId: 'dashboard',
      theme: { preset: 'dark-premium', font: 'system', overrides: {} },
    },
    zonas: { principal: { items: [] } },
  };
}

// Zona de conteúdo primária (onde fica a playlist editável).
export function primaryZoneKey(cfg) {
  const z = (cfg && cfg.zonas) || {};
  if (z.principal && Array.isArray(z.principal.items)) return 'principal';
  const k = Object.keys(z).find((key) => z[key] && Array.isArray(z[key].items));
  return k || 'principal';
}
