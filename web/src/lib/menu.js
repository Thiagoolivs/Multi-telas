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
  programacao: 'Programação',
  calendario: 'Calendário',
  criar: 'Criar',
  criando: 'Criando',
  campanhas: 'Campanhas',
  designs: 'Meus Designs',
  telasprontas: 'Telas prontas',
  pecas: 'Peças prontas',
  storage: 'Fotos e vídeos',
  musicas: 'Músicas',
  ia: 'Da IA',
  banco: 'Banco de Imagens',
  brand: 'Marca',
  birthdays: 'Pessoas',
  mural: 'Mural de fotos',
  relatorio: 'Relatório de exibição',
  billing: 'Plano',
  team: 'Equipe',
  settings: 'Ajustes',
  support: 'Suporte',
};

/*
 * Os grupos. A primeira página é para onde o clique no menu leva.
 * `content` (o editor de uma tela) não tem aba: abre de dentro da Programação.
 *
 * Programação é um grupo próprio desde o item 40 (EXECUTOR §2d): "dentro de
 * Telas está muito escondido". Telas é o aparelho; Programação é o que passa.
 */
export const GRUPOS = [
  { id: 'inicio', label: 'Início', paginas: ['overview', 'alerts'] },
  { id: 'telas', label: 'Telas', paginas: ['screens'] },
  // D23: o calendário da empresa vira programação com período — mora ao lado dela.
  { id: 'programacao', label: 'Programação', paginas: ['programacao', 'calendario'], tambem: ['content'] },
  // "Criando" (D11): o que a IA está fazendo agora e o que terminou hoje.
  { id: 'criar', label: 'Criar', paginas: ['criar', 'criando', 'campanhas', 'designs'], tambem: ['studio', 'campaigns', 'images', 'rapida'] },
  // Mídias por propósito (item 34): o que está pronto para a TV primeiro, depois a matéria-prima.
  // D18: a tela inteira pronta vem antes da peça solta — é o caminho mais curto até a TV.
  { id: 'midias', label: 'Mídias', paginas: ['telasprontas', 'pecas', 'storage', 'musicas', 'ia', 'banco'] },
  { id: 'marca', label: 'Marca', paginas: ['brand'] },
  { id: 'automaticos', label: 'Automáticos', paginas: ['birthdays', 'mural'] },
  { id: 'relatorios', label: 'Relatórios', paginas: ['relatorio'] },
  { id: 'conta', label: 'Conta', paginas: ['billing', 'team', 'settings', 'support'] },
];

// No celular: a barra de baixo. O resto fica em "Mais" (o menu inteiro).
// A Programação entra no lugar de Telas: mudar o que passa é o uso de todo dia;
// parear é uma vez só (e Telas segue em "Mais").
export const BARRA_INFERIOR = ['inicio', 'programacao', 'criar', 'midias'];

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
