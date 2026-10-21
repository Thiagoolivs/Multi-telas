/*
 * O menu do painel (PLANO §5.1, EXECUTOR item 15).
 *
 * Eram 14 entradas soltas, em duas seções. Agora são 8 GRUPOS, na ordem em
 * que o dono da loja pensa — e cada página antiga mora dentro de um deles,
 * como aba. Nada sumiu, nada mudou de endereço: `/app/?ir=birthdays` continua
 * abrindo Aniversariantes, agora dentro de Automáticos. O que mudou foi onde a
 * página aparece no menu.
 *
 * Só dados aqui, sem ícone nem React: é o que dá para provar num teste que
 * nenhuma página ficou sem lugar (test/menu.test.js). Os ícones moram no
 * Sidebar.
 */

// O nome de cada página, como aparece na aba do grupo.
export const PAGINAS = {
  overview: 'Visão geral',
  alerts: 'Alertas',
  screens: 'Telas',
  criar: 'Criar',
  campanhas: 'Campanhas',
  designs: 'Meus Designs',
  pecas: 'Peças prontas',
  storage: 'Fotos e vídeos',
  musicas: 'Músicas',
  ia: 'Da IA',
  banco: 'Banco de Imagens',
  brand: 'Marca',
  birthdays: 'Aniversariantes',
  mural: 'Mural de fotos',
  relatorio: 'Relatório de exibição',
  billing: 'Plano',
  team: 'Equipe',
  settings: 'Ajustes',
  support: 'Suporte',
};

/*
 * Os 8 grupos. A primeira página é para onde o clique no menu leva.
 * `content` (a programação de uma tela) não tem aba: abre de dentro de Telas.
 */
export const GRUPOS = [
  { id: 'inicio', label: 'Início', paginas: ['overview', 'alerts'] },
  { id: 'telas', label: 'Telas', paginas: ['screens'], tambem: ['content'] },
  { id: 'criar', label: 'Criar', paginas: ['criar', 'campanhas', 'designs'], tambem: ['studio', 'campaigns', 'images', 'rapida'] },
  // Mídias por propósito (item 34): o que está pronto para a TV primeiro, depois a matéria-prima.
  { id: 'midias', label: 'Mídias', paginas: ['pecas', 'storage', 'musicas', 'ia', 'banco'] },
  { id: 'marca', label: 'Marca', paginas: ['brand'] },
  { id: 'automaticos', label: 'Automáticos', paginas: ['birthdays', 'mural'] },
  { id: 'relatorios', label: 'Relatórios', paginas: ['relatorio'] },
  { id: 'conta', label: 'Conta', paginas: ['billing', 'team', 'settings', 'support'] },
];

// No celular: a barra de baixo. O resto fica em "Mais" (o menu inteiro).
export const BARRA_INFERIOR = ['inicio', 'telas', 'criar', 'midias'];

/* O grupo de uma página (ou nulo, para as páginas de quem opera a plataforma). */
export function grupoDa(pagina) {
  return GRUPOS.find((g) => g.paginas.includes(pagina) || (g.tambem || []).includes(pagina)) || null;
}

/*
 * Para onde vai um `?ir=` da URL: o nome de uma página (o endereço antigo,
 * que continua valendo) ou de um grupo (o endereço novo, que abre a primeira
 * página dele). A lista é fechada de propósito: URL é coisa que qualquer um
 * escreve.
 */
export function paginaDoIr(ir) {
  if (!ir) return null;
  if (PAGINAS[ir]) return ir;
  const g = GRUPOS.find((x) => x.id === ir);
  return g ? g.paginas[0] : null;
}
