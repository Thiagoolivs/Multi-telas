/*
 * templates.js
 * Catálogo de layouts (templates) prontos de multi-telas.
 * Cada template define uma grade CSS e as zonas que a compõem.
 *
 * Uma "zona" é uma região da tela. Zonas do tipo "playlist" giram
 * uma lista de conteúdos; zonas "ticker" exibem avisos rolando.
 */
(function (global) {
  'use strict';

  // Cada template: grid (colunas/linhas/áreas) + zonas.
  // As "areas" seguem a sintaxe de grid-template-areas.
  const LAYOUTS = [
    {
      id: 'dashboard',
      name: 'Painel Notícias',
      description: 'Barra lateral com clima e informações, destaque grande e faixa de notícias com hora ao vivo.',
      grid: {
        columns: '1.05fr 2.95fr',
        rows: '1fr 13vh',
        areas: [
          'lateral principal',
          'lateral rodape',
        ],
      },
      zones: [
        { id: 'lateral', area: 'lateral', name: 'Lateral', type: 'playlist' },
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Notícias', type: 'ticker' },
      ],
    },
    {
      id: 'full',
      name: 'Tela Cheia',
      orientation: 'any',
      description: 'Uma única zona ocupando toda a tela. Ideal para vídeos e campanhas.',
      grid: {
        columns: '1fr',
        rows: '1fr',
        areas: ['principal'],
      },
      zones: [
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
      ],
    },
    {
      id: 'full-ticker',
      name: 'Tela Cheia + Rodapé',
      orientation: 'any',
      description: 'Conteúdo em tela cheia com uma faixa de avisos rolando no rodapé.',
      grid: {
        columns: '1fr',
        rows: '1fr 11vh',
        areas: ['principal', 'rodape'],
      },
      zones: [
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },
    {
      id: 'sidebar-right',
      name: 'Destaque + Barra Lateral',
      description: 'Zona principal grande, barra lateral com avisos/agenda e rodapé de notícias.',
      grid: {
        columns: '3fr 1.1fr',
        rows: '1fr 11vh',
        areas: [
          'principal lateral',
          'rodape rodape',
        ],
      },
      zones: [
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'lateral', area: 'lateral', name: 'Lateral', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },
    {
      id: 'header-main-ticker',
      name: 'Cabeçalho + Principal + Rodapé',
      orientation: 'any',
      description: 'Faixa superior com logo/relógio/clima, conteúdo no meio e avisos no rodapé.',
      grid: {
        columns: '1fr',
        rows: '12vh 1fr 11vh',
        areas: ['cabecalho', 'principal', 'rodape'],
      },
      zones: [
        { id: 'cabecalho', area: 'cabecalho', name: 'Cabeçalho', type: 'header' },
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },
    {
      id: 'quad',
      name: 'Mosaico 2x2',
      orientation: 'any',
      description: 'Quatro zonas independentes girando conteúdos diferentes ao mesmo tempo.',
      grid: {
        columns: '1fr 1fr',
        rows: '1fr 1fr',
        areas: [
          'z1 z2',
          'z3 z4',
        ],
      },
      zones: [
        { id: 'z1', area: 'z1', name: 'Zona 1', type: 'playlist' },
        { id: 'z2', area: 'z2', name: 'Zona 2', type: 'playlist' },
        { id: 'z3', area: 'z3', name: 'Zona 3', type: 'playlist' },
        { id: 'z4', area: 'z4', name: 'Zona 4', type: 'playlist' },
      ],
    },
    {
      id: 'video-dynamic',
      name: 'Vídeo + Painel Dinâmico',
      description: 'Vídeo ou live contínuos (nunca reinicia) enquanto um painel ao lado respira de tamanho e roda avisos, clima e novidades.',
      grid: {
        columns: '3.2fr 1fr',
        rows: '1fr 11vh',
        areas: [
          'video info',
          'rodape rodape',
        ],
      },
      zones: [
        { id: 'video', area: 'video', name: 'Vídeo / Live', type: 'playlist' },
        { id: 'info', area: 'info', name: 'Painel Dinâmico', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Notícias', type: 'ticker' },
      ],
      // Faz o grid "respirar": alterna suavemente entre estas proporções
      // sem nunca recriar as zonas — o vídeo/live continua tocando.
      dynamic: {
        columns: ['3.2fr 1fr', '1.7fr 1.4fr'],
        intervalSeconds: 18,
      },
    },
    {
      id: 'corporate',
      name: 'Corporativo Completo',
      description: 'Cabeçalho com relógio/clima, destaque, lateral de avisos e rodapé de notícias. O mais completo.',
      grid: {
        columns: '3fr 1.1fr',
        rows: '12vh 1fr 11vh',
        areas: [
          'cabecalho cabecalho',
          'principal lateral',
          'rodape rodape',
        ],
      },
      zones: [
        { id: 'cabecalho', area: 'cabecalho', name: 'Cabeçalho', type: 'header' },
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'lateral', area: 'lateral', name: 'Lateral', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },

    /* ----- Vertical (tela em pé / portrait) ----- */
    {
      id: 'portrait-hero',
      name: 'Vertical · Destaque + Rodapé',
      orientation: 'portrait',
      description: 'Para telas em pé: destaque ocupando quase tudo e uma faixa de avisos no rodapé.',
      grid: {
        columns: '1fr',
        rows: '1fr 7vh',
        areas: ['principal', 'rodape'],
      },
      zones: [
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },
    {
      id: 'portrait-stack',
      name: 'Vertical · Cabeçalho + 2 Zonas + Rodapé',
      orientation: 'portrait',
      description: 'Para telas em pé: cabeçalho, dois blocos empilhados (destaque + secundário) e rodapé de avisos.',
      grid: {
        columns: '1fr',
        rows: '9vh 1.7fr 1fr 7vh',
        areas: ['cabecalho', 'principal', 'secundaria', 'rodape'],
      },
      zones: [
        { id: 'cabecalho', area: 'cabecalho', name: 'Cabeçalho', type: 'header' },
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'secundaria', area: 'secundaria', name: 'Secundária', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },
    {
      id: 'portrait-duo',
      name: 'Vertical · Duas Zonas',
      orientation: 'portrait',
      description: 'Para telas em pé: dois blocos iguais empilhados e uma faixa de avisos no rodapé.',
      grid: {
        columns: '1fr',
        rows: '1fr 1fr 7vh',
        areas: ['principal', 'secundaria', 'rodape'],
      },
      zones: [
        { id: 'principal', area: 'principal', name: 'Superior', type: 'playlist' },
        { id: 'secundaria', area: 'secundaria', name: 'Inferior', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },

    /* ----- Quadrada (square) ----- */
    {
      id: 'square-hero',
      name: 'Quadrada · Destaque + Rodapé',
      orientation: 'square',
      description: 'Para telas quadradas: destaque grande e faixa de avisos no rodapé.',
      grid: {
        columns: '1fr',
        rows: '1fr 12vh',
        areas: ['principal', 'rodape'],
      },
      zones: [
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },
    {
      id: 'square-split',
      name: 'Quadrada · Destaque + Dupla',
      orientation: 'square',
      description: 'Para telas quadradas: destaque grande em cima e duas zonas lado a lado embaixo.',
      grid: {
        columns: '1fr 1fr',
        rows: '1.5fr 1fr',
        areas: [
          'principal principal',
          'z2 z3',
        ],
      },
      zones: [
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'z2', area: 'z2', name: 'Zona 2', type: 'playlist' },
        { id: 'z3', area: 'z3', name: 'Zona 3', type: 'playlist' },
      ],
    },
    {
      id: 'square-header',
      name: 'Quadrada · Cabeçalho + Principal + Rodapé',
      orientation: 'square',
      description: 'Para telas quadradas: cabeçalho, destaque no meio e rodapé de avisos.',
      grid: {
        columns: '1fr',
        rows: '14vh 1fr 12vh',
        areas: ['cabecalho', 'principal', 'rodape'],
      },
      zones: [
        { id: 'cabecalho', area: 'cabecalho', name: 'Cabeçalho', type: 'header' },
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist' },
        { id: 'rodape', area: 'rodape', name: 'Rodapé (avisos)', type: 'ticker' },
      ],
    },
  ];

  // Orientação: 'landscape' (padrão), 'portrait', 'square' ou 'any'.
  function orientationOf(l) { return (l && l.orientation) || 'landscape'; }
  function layoutsByOrientation(orient) {
    if (!orient || orient === 'all') return LAYOUTS.slice();
    return LAYOUTS.filter((l) => orientationOf(l) === orient || orientationOf(l) === 'any');
  }

  function getLayout(id) {
    return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
  }

  global.MT_LAYOUTS = LAYOUTS;
  global.MT_getLayout = getLayout;
  global.MT_layoutsByOrientation = layoutsByOrientation;
})(window);
