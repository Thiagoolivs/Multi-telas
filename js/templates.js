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
        { id: 'lateral', area: 'lateral', name: 'Lateral', type: 'playlist', formato: 'retrato' },
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
    /*
     * DOIS QUADRADOS (fase 1 do plano, 05/11): a tela deitada dividida em
     * duas metades iguais, como os menus da Starbucks na Índia. Um produto,
     * uma foto e um preço em cada metade: cada uma é quase quadrada e lê
     * melhor que uma lateral estreita.
     */
    {
      id: 'duo',
      name: 'Dois quadrados',
      description: 'Duas metades iguais, lado a lado: um produto, uma foto e um preço em cada.',
      grid: {
        columns: '1fr 1fr',
        rows: '1fr',
        areas: ['principal secundaria'],
      },
      zones: [
        { id: 'principal', area: 'principal', name: 'Esquerda', type: 'playlist' },
        { id: 'secundaria', area: 'secundaria', name: 'Direita', type: 'playlist' },
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
        { id: 'lateral', area: 'lateral', name: 'Lateral', type: 'playlist', formato: 'retrato' },
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
        { id: 'info', area: 'info', name: 'Painel Dinâmico', type: 'playlist', formato: 'retrato' },
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
        { id: 'lateral', area: 'lateral', name: 'Lateral', type: 'playlist', formato: 'retrato' },
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
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist', formato: 'retrato' },
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
        { id: 'principal', area: 'principal', name: 'Principal', type: 'playlist', formato: 'retrato' },
        { id: 'secundaria', area: 'secundaria', name: 'Secundária', type: 'playlist', formato: 'retrato' },
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
        { id: 'principal', area: 'principal', name: 'Superior', type: 'playlist', formato: 'retrato' },
        { id: 'secundaria', area: 'secundaria', name: 'Inferior', type: 'playlist', formato: 'retrato' },
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

  /*
   * Fase 3: a zona vazia some. Uma zona sem nada a mostrar (a playlist sem
   * itens, o rodapé sem mensagem) não vira enfeite com a marca e a data: a
   * zona com conteúdo ao lado ocupa o lugar dela. Duas formas, nesta ordem:
   *   1. a zona vazia ocupa linhas (ou colunas) inteiras da grade: elas
   *      saem, e as outras crescem (o rodapé sem mensagem, a metade de
   *      baixo do "Em pé · duas zonas");
   *   2. senão, uma playlist vizinha com conteúdo absorve as células dela,
   *      se o resultado continuar um retângulo (a lateral vazia do
   *      Corporativo vira principal), a principal primeiro.
   * O cabeçalho nunca sai. Sem nenhuma playlist com conteúdo, nada muda: a
   * tela inteira espera (js/player.js, esperaDeZona). Pura e sem DOM, para
   * a TV e para os testes.
   */
  function juntarZonasVazias(layout, vazias) {
    const vaz = (vazias || []).filter((id) => layout.zones.some((z) => z.id === id && z.type !== 'header'));
    const cheias = layout.zones.filter((z) => z.type === 'playlist' && vaz.indexOf(z.id) < 0);
    if (!vaz.length || !cheias.length) return layout;
    let areas = layout.grid.areas.map((r) => String(r).trim().split(/\s+/));
    const trilhas = (t) => (typeof t === 'string' && t.indexOf('(') < 0 ? t.trim().split(/\s+/) : null);
    let linhas = trilhas(layout.grid.rows);
    let colunas = trilhas(layout.grid.columns);
    const retangulo = (nome) => {
      let a = Infinity, b = -1, c = Infinity, d = -1, n = 0;
      areas.forEach((r, i) => r.forEach((x, j) => { if (x === nome) { a = Math.min(a, i); b = Math.max(b, i); c = Math.min(c, j); d = Math.max(d, j); n++; } }));
      return n > 0 && n === (b - a + 1) * (d - c + 1);
    };
    const saiu = {};
    vaz.forEach((id) => {
      const z = layout.zones.find((x) => x.id === id);
      // 1. Linhas inteiras dela saem da grade.
      const soDela = (r) => r.every((x) => x === z.area);
      if (linhas && linhas.length === areas.length && areas.some(soDela) && !areas.every(soDela)) {
        linhas = linhas.filter((t, i) => !soDela(areas[i]));
        areas = areas.filter((r) => !soDela(r));
        if (!areas.some((r) => r.indexOf(z.area) >= 0)) { saiu[id] = true; return; }
      }
      // ... ou colunas inteiras.
      const colunaDela = (j) => areas.every((r) => r[j] === z.area);
      if (colunas && areas.length && colunas.length === areas[0].length) {
        const fora = colunas.map((t, j) => colunaDela(j));
        if (fora.some(Boolean) && !fora.every(Boolean)) {
          colunas = colunas.filter((t, j) => !fora[j]);
          areas = areas.map((r) => r.filter((x, j) => !fora[j]));
          if (!areas.some((r) => r.indexOf(z.area) >= 0)) { saiu[id] = true; return; }
        }
      }
      // 2. Uma playlist vizinha com conteúdo absorve (a principal primeiro).
      const vizinhas = cheias.slice().sort((x, y) => (y.id === 'principal') - (x.id === 'principal'));
      for (const v of vizinhas) {
        const antes = areas;
        areas = areas.map((r) => r.map((x) => (x === z.area ? v.area : x)));
        if (retangulo(v.area)) { saiu[id] = true; return; }
        areas = antes;
      }
    });
    if (!Object.keys(saiu).length) return layout;
    const grid = Object.assign({}, layout.grid, { areas: areas.map((r) => r.join(' ')) });
    if (linhas) grid.rows = linhas.join(' ');
    if (colunas) grid.columns = colunas.join(' ');
    return Object.assign({}, layout, { grid, zones: layout.zones.filter((z) => !saiu[z.id]), juntadas: Object.keys(saiu) });
  }

  global.MT_LAYOUTS = LAYOUTS;
  global.MT_getLayout = getLayout;
  global.MT_layoutsByOrientation = layoutsByOrientation;
  global.MT_juntarZonasVazias = juntarZonasVazias;

  /*
   * Módulo duplo. O servidor precisa saber quais zonas um layout tem para
   * validar a config antes de gravá-la — e duas listas de layouts seria a
   * mesma armadilha da matemática de cor: uma envelhece.
   */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LAYOUTS, getLayout, layoutsByOrientation, juntarZonasVazias };
  }
})(typeof window !== 'undefined' ? window : globalThis);
