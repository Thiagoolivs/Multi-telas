/*
 * seasons.js
 * Catálogo de datas comemorativas brasileiras. Cada data é um "pacote"
 * que combina tema (cores), decoração animada e uma mensagem de saudação
 * pronta. O admin aplica um pacote com um clique; o player desenha a
 * decoração conforme settings.decoracao.
 */
(function (global) {
  'use strict';

  // Tipos de decoração animada disponíveis (renderizados por player.js).
  const DECORATIONS = [
    { id: 'none', label: 'Nenhuma' },
    { id: 'snow', label: 'Neve' },
    { id: 'lights', label: 'Luzes de Natal' },
    { id: 'hearts', label: 'Corações' },
    { id: 'petals', label: 'Pétalas' },
    { id: 'flags', label: 'Bandeirinhas' },
    { id: 'confetti', label: 'Confete' },
    { id: 'fireworks', label: 'Fogos' },
  ];

  // Catálogo (from/to em 'MMDD'; ranges podem cruzar o ano — ex.: Ano Novo).
  const SEASONS = [
    {
      id: 'natal', label: 'Natal', emoji: '🎄',
      quando: { tipo: 'fixo', mes: 12, dia: 25 }, antes: 24, depois: 0,
      decoracao: 'snow',
      theme: { preset: 'luxury-gold', overrides: { bg: '#0a1a12', bg2: '#3a1414', brand: '#e11d48', accent: '#f5d67b' } },
      greeting: { type: 'text', titulo: 'Feliz Natal!', corpo: 'Que esta época traga paz, união e boas festas a todos.', bg: '#7f1d1d', cor: '#ffffff', duracao: 12 },
    },
    {
      id: 'ano-novo', label: 'Ano Novo', emoji: '🎆',
      // Única que fica DEPOIS da data: "feliz ano novo" na primeira semana de
      // janeiro ainda é saudação, não atraso.
      quando: { tipo: 'fixo', mes: 1, dia: 1 }, antes: 6, depois: 5,
      decoracao: 'fireworks',
      theme: { preset: 'luxury-gold', overrides: { bg: '#0a0e1f', bg2: '#241a08', brand: '#d4af37', accent: '#ffe08a' } },
      greeting: { type: 'text', titulo: 'Feliz Ano Novo!', corpo: 'Um novo ciclo de conquistas começa. Boas festas!', bg: '#111827', cor: '#ffd76e', duracao: 12 },
    },
    {
      id: 'carnaval', label: 'Carnaval', emoji: '🎭',
      // Terça de carnaval: 47 dias antes da Páscoa.
      quando: { tipo: 'pascoa', desloc: -47 }, antes: 5, depois: 1,
      decoracao: 'confetti',
      theme: { preset: 'modern-purple', overrides: { brand: '#f59e0b', accent: '#22d3ee' } },
      greeting: { type: 'text', titulo: 'Bom Carnaval!', corpo: 'Aproveite com alegria e responsabilidade.', bg: '#6d28d9', cor: '#ffffff', duracao: 12 },
    },
    {
      id: 'pascoa', label: 'Páscoa', emoji: '🐰',
      quando: { tipo: 'pascoa', desloc: 0 }, antes: 10, depois: 1,
      decoracao: 'petals',
      theme: { preset: 'corporate-blue', overrides: { bg: '#1a1330', bg2: '#3a2456', brand: '#a78bfa', accent: '#f9a8d4' } },
      greeting: { type: 'text', titulo: 'Feliz Páscoa!', corpo: 'Que seja um período de renovação e boas energias.', bg: '#4c1d95', cor: '#ffffff', duracao: 12 },
    },
    {
      id: 'dia-trabalho', label: 'Dia do Trabalho', emoji: '🛠️',
      quando: { tipo: 'fixo', mes: 5, dia: 1 }, antes: 3, depois: 0,
      decoracao: 'confetti',
      theme: { preset: 'corporate-blue', overrides: {} },
      greeting: { type: 'announce', tipo: 'conquista', titulo: 'Feliz Dia do Trabalho', corpo: 'Nossa gratidão a cada colaborador que constrói a Raft todos os dias.', info: '1º de Maio', duracao: 12 },
    },
    {
      id: 'dia-maes', label: 'Dia das Mães', emoji: '💐',
      // Segundo domingo de maio — móvel.
      quando: { tipo: 'semana', mes: 5, semana: 2, diaSemana: 0 }, antes: 6, depois: 0,
      decoracao: 'hearts',
      theme: { preset: 'modern-purple', overrides: { bg: '#2a1030', bg2: '#5a1e4a', brand: '#f472b6', accent: '#fda4af' } },
      greeting: { type: 'text', titulo: 'Feliz Dia das Mães', corpo: 'Uma homenagem a todas as mães da nossa equipe.', bg: '#9d174d', cor: '#ffffff', duracao: 12 },
    },
    {
      id: 'festa-junina', label: 'Festa Junina', emoji: '🎉',
      // Ancorada no São João, mas com janela larga dos dois lados: arraiá é
      // temporada, não dia — e no interior vai até julho.
      quando: { tipo: 'fixo', mes: 6, dia: 24 }, antes: 23, depois: 12,
      decoracao: 'flags',
      theme: { preset: 'luxury-gold', overrides: { bg: '#1a0e05', bg2: '#3a1e0a', brand: '#ea580c', accent: '#facc15' } },
      greeting: { type: 'text', titulo: 'Arraiá da Raft!', corpo: 'Chegou o São João! Bora pular fogueira e comer pé de moleque.', bg: '#7c2d12', cor: '#fde68a', duracao: 12 },
    },
    {
      id: 'dia-pais', label: 'Dia dos Pais', emoji: '👔',
      // Segundo domingo de agosto — móvel. A faixa fixa que existia aqui
      // (01/08 a 11/08) ligava a homenagem oito dias antes e a deixava no ar
      // dois dias depois da data.
      quando: { tipo: 'semana', mes: 8, semana: 2, diaSemana: 0 }, antes: 6, depois: 0,
      // Estava 'none': a data era a única do catálogo sem nada animado, e a
      // tela ficava idêntica a um dia comum depois de aplicar o pacote.
      decoracao: 'confetti',
      theme: { preset: 'corporate-blue', overrides: { bg: '#0a1526', bg2: '#123a5e' } },
      greeting: { type: 'text', titulo: 'Feliz Dia dos Pais', corpo: 'Uma homenagem a todos os pais da nossa equipe.', bg: '#1e3a8a', cor: '#ffffff', duracao: 12 },
    },
    {
      id: 'independencia', label: 'Independência', emoji: '🇧🇷',
      quando: { tipo: 'fixo', mes: 9, dia: 7 }, antes: 6, depois: 0,
      decoracao: 'fireworks',
      theme: { preset: 'energy-green', overrides: { bg: '#04140d', bg2: '#0a3a1e', brand: '#16a34a', accent: '#fde047' } },
      greeting: { type: 'text', titulo: '7 de Setembro', corpo: 'Independência do Brasil. Orgulho de fazer parte desta história.', bg: '#14532d', cor: '#fde047', duracao: 12 },
    },
    {
      id: 'dia-criancas', label: 'Dia das Crianças', emoji: '🎈',
      quando: { tipo: 'fixo', mes: 10, dia: 12 }, antes: 4, depois: 0,
      decoracao: 'confetti',
      theme: { preset: 'neon-cyber', overrides: { brand: '#fb7185', accent: '#38bdf8' } },
      greeting: { type: 'text', titulo: 'Feliz Dia das Crianças', corpo: 'Que a alegria da infância nunca acabe!', bg: '#0369a1', cor: '#ffffff', duracao: 12 },
    },
    {
      id: 'outubro-rosa', label: 'Outubro Rosa', emoji: '🎀',
      // Campanha de mês inteiro: aqui a janela longa é o certo.
      quando: { tipo: 'mes', mes: 10 },
      decoracao: 'petals',
      theme: { preset: 'modern-purple', overrides: { bg: '#2a1024', bg2: '#5a1e46', brand: '#ec4899', accent: '#f9a8d4' } },
      greeting: { type: 'announce', tipo: 'saude', titulo: 'Outubro Rosa', corpo: 'Mês de conscientização e prevenção ao câncer de mama. Cuide-se.', info: 'Previna-se · Faça seus exames', duracao: 14 },
    },
    {
      id: 'novembro-azul', label: 'Novembro Azul', emoji: '💙',
      quando: { tipo: 'mes', mes: 11 },
      // Campanha de saúde pede presença discreta, não festa: pétalas caem
      // devagar e não competem com a mensagem.
      decoracao: 'petals',
      theme: { preset: 'corporate-blue', overrides: { brand: '#2563eb', accent: '#38bdf8' } },
      greeting: { type: 'announce', tipo: 'saude', titulo: 'Novembro Azul', corpo: 'Mês de conscientização sobre a saúde do homem. Cuide-se e faça seus exames.', info: 'Previna-se', duracao: 14 },
    },
    {
      id: 'black-friday', label: 'Black Friday', emoji: '🏷️',
      // Última sexta de novembro — móvel. O 'depois' cobre a Cyber Monday.
      quando: { tipo: 'semana', mes: 11, semana: -1, diaSemana: 5 }, antes: 7, depois: 3,
      decoracao: 'confetti',
      theme: { preset: 'elegant-black', overrides: { brand: '#f59e0b', accent: '#fbbf24' } },
      greeting: { type: 'text', titulo: 'BLACK FRIDAY', corpo: 'Ofertas imperdíveis. Fale com o comercial e aproveite.', bg: '#000000', cor: '#fbbf24', duracao: 12 },
    },
  ];

  /*
   * As datas se calculam sozinhas (js/datas-br.js). Metade do calendário
   * brasileiro é móvel — Páscoa, Carnaval, Dia das Mães, Dia dos Pais, Black
   * Friday —, e a faixa fixa em MMDD que existia aqui errava todo ano.
   */
  const D = global.MTDatasBR || (typeof require === 'function' ? require('./datas-br.js') : null);

  // Verifica se um 'MMDD' está dentro de [from, to], tratando virada de ano.
  /*
   * O pacote da data de hoje, ou null.
   *
   * Desempate por janela mais curta: no dia 12 de outubro, Dia das Crianças
   * (5 dias) precisa ganhar do Outubro Rosa (31), senão a campanha do mês
   * engole todas as datas específicas que caem dentro dela.
   */
  function todaySeason(date) {
    const hoje = date || new Date();
    let melhor = null;
    for (const s of SEASONS) {
      const j = D.janelaVigente(s, hoje);
      if (!j) continue;
      const dur = D.duracao(j);
      if (!melhor || dur < melhor.dur) melhor = { s, dur };
    }
    return melhor ? melhor.s : null;
  }

  /* Quando a data cai neste ano, para o painel mostrar em vez de adivinhar. */
  function dataDe(season, ano) {
    const j = D.janela(season, ano != null ? ano : new Date().getFullYear());
    return j ? j.alvo : null;
  }

  function getSeason(id) { return SEASONS.find((s) => s.id === id) || null; }

  /* ---------------- Programação da data ----------------
   *
   * O pacote antigo entregava UMA mensagem na zona principal. Numa tela de
   * três zonas isso deixava a lateral vazia, o rodapé com o texto de sempre e
   * nenhuma decoração — o cliente aplicava a data e a tela continuava com cara
   * de nada. "Sem graça" foi a palavra usada, e estava certa.
   *
   * Aqui a data vira PROGRAMAÇÃO: conteúdo suficiente em cada zona para a tela
   * rodar horas sem repetir de forma óbvia, e sem o usuário escrever nada.
   *
   * As frases por data são poucas de propósito. O resto é montado a partir
   * delas — data nova entra no catálogo sem precisar preencher tudo à mão.
   */

  // Frases de apoio por data. Curtas: é tela vista de longe, de passagem.
  const FRASES = {
    natal: ['Boas festas a todos', 'Que 2027 comece leve', 'Obrigado por mais um ano juntos'],
    'ano-novo': ['Ano novo, ciclo novo', 'Que venham as próximas conquistas', 'Comece com o pé direito'],
    carnaval: ['Aproveite com responsabilidade', 'Descanse e volte com energia', 'Bom feriado'],
    pascoa: ['Tempo de renovar', 'Boa Páscoa para você e sua família', 'Aproveite os dias com quem ama'],
    'dia-trabalho': ['Nosso time faz acontecer', 'Orgulho de trabalhar aqui', 'Obrigado por cada dia de dedicação'],
    'dia-maes': ['Obrigado por tudo, mãe', 'Às mães do nosso time', 'Sua força inspira a gente'],
    'festa-junina': ['Bora pro arraiá!', 'Quadrilha, quentão e pé de moleque', 'Boa festa junina a todos'],
    'dia-pais': ['Obrigado, pai', 'Aos pais do nosso time', 'Exemplo que a gente carrega'],
    independencia: ['7 de Setembro', 'Orgulho de fazer parte', 'Bom feriado'],
    'dia-criancas': ['Feliz Dia das Crianças', 'A alegria de quem é criança contagia', 'Bom dia das crianças'],
    'outubro-rosa': ['Outubro Rosa', 'O exame de rotina salva vidas', 'Cuide de você: agende o seu'],
    'novembro-azul': ['Novembro Azul', 'Homem também cuida da saúde', 'Faça o exame: prevenir é simples'],
    'black-friday': ['Ofertas por tempo limitado', 'Aproveite enquanto dura', 'Corre que acaba'],
  };

  // Avisos do rodapé. Formato "Título :: detalhe" do ticker de notícias.
  const AVISOS = {
    'dia-pais': [
      'Feliz Dia dos Pais :: Nossa homenagem a todos os pais da equipe',
      'Mural :: Deixe seu recado para os pais do time',
    ],
    'dia-maes': [
      'Feliz Dia das Mães :: Nossa homenagem a todas as mães da equipe',
      'Mural :: Deixe seu recado para as mães do time',
    ],
  };

  /*
   * Monta a programação completa. `formato` decide a proporção das peças e
   * `zonas` diz quais existem no layout da tela — não adianta gerar conteúdo
   * para uma lateral que aquele layout não tem.
   */
  function programaDe(season, opts) {
    const o = opts || {};
    const zonas = o.zonas || ['principal'];
    const frases = FRASES[season.id] || [];
    const g = season.greeting || {};
    const cor = g.cor || '#ffffff';
    const bg = g.bg || null;

    const principal = [];
    if (season.greeting) principal.push({ ...season.greeting });
    /*
     * As frases entram como "quote": tipografia grande e centrada, feita para
     * ser lida de longe. Duração escalonada evita que tudo troque junto e a
     * tela pareça piscar.
     */
    frases.slice(0, 3).forEach((texto, i) => {
      principal.push({
        type: 'quote', texto, autor: '', duracao: 10 + i * 2,
        ...(bg ? { bg } : {}), cor,
      });
    });

    // Lateral: o que é útil o dia inteiro sem ninguém mexer.
    /*
     * Lateral: o que é útil o dia inteiro sem ninguém mexer.
     *
     * Nenhum item com duração 0 aqui. Duração 0 significa "fica fixo", e um
     * item fixo TRAVA a zona: os outros nunca entram. O padrão do widget de
     * clima é 0, então precisa de duração explícita — a primeira versão desta
     * programação tinha esse defeito e o resumo da tela o encontrou.
     */
    const lateral = [];
    if (zonas.includes('lateral')) {
      lateral.push({ type: 'clock', duracao: 12 });
      lateral.push({ type: 'weatherpro', cidade: o.cidade || 'São Paulo', duracao: 16 });
      if (frases[0]) lateral.push({ type: 'quote', texto: frases[0], autor: '', duracao: 10, ...(bg ? { bg } : {}), cor });
    }

    // Rodapé: avisos da data, ou a saudação virando aviso.
    const avisos = AVISOS[season.id]
      || (g.titulo ? [g.titulo + ' :: ' + (g.corpo || '')] : []);

    return {
      principal,
      lateral,
      rodape: { titulo: (season.label || 'AVISOS').toUpperCase(), messages: avisos },
      decoracao: season.decoracao || 'none',
      theme: season.theme || null,
    };
  }

  const api = { SEASONS, DECORATIONS, todaySeason, dataDe, getSeason, programaDe, FRASES };
  global.MTSeasons = api;
  /*
   * O servidor lê o MESMO arquivo (require) para servir o catálogo ao painel
   * React. Antes só o player e o admin antigo enxergavam as datas — o painel
   * novo não tinha como oferecer "aplicar Dia dos Pais", e o pacote existia
   * sem ninguém alcançar. Duas cópias da lista seria pior: uma envelhece.
   */
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
