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
  ];

  function getLayout(id) {
    return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
  }

  global.MT_LAYOUTS = LAYOUTS;
  global.MT_getLayout = getLayout;
})(window);
