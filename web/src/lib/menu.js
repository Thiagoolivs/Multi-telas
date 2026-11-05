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

import '../../../js/perfil.js';

const P = globalThis.MTPerfil;

// O nome de cada página, como aparece na aba do grupo.
export const PAGINAS = {
  // QA de 26/10: a aba não repete o título da página ("Visão geral" sobre "Visão geral").
  overview: 'Agora',
  alerts: 'Alertas',
  screens: 'Telas',
  programacao: 'Programação',
  calendario: 'Calendário',
  criar: 'Criar',
  criando: 'Criando',
  // D47: o que ficou pronto mora em Criados (o endereço continua ?ir=campanhas).
  campanhas: 'Campanhas',
  designs: 'Peças guardadas',
  telasprontas: 'Telas prontas',
  pecas: 'Peças prontas',
  // Fase 7: a Biblioteca única — o que está pronto, o que é seu, os arquivos e os Apps.
  prontos: 'Prontos para você',
  seus: 'Seus conteúdos',
  apps: 'Apps',
  // Fotos e vídeos, Músicas e Da IA viraram uma aba só, com filtro (QA de 26/10).
  storage: 'Fotos e vídeos',
  musicas: 'Músicas',
  ia: 'Da IA',
  banco: 'Banco de Imagens',
  brand: 'Marca',
  birthdays: 'Pessoas',
  mural: 'Mural de fotos',
  relatorio: 'Relatório de exibição',
  indicadores: 'Indicadores',
  billing: 'Plano',
  team: 'Equipe',
  settings: 'Ajustes',
  support: 'Suporte',
};

/*
 * O MENU NOVO (fase 7 do plano de ação; docs/qa-total/BLOCO-8-INTERFACE.md, 4.1).
 * Eram 8 grupos, 22 abas e 3 níveis; o dono se perdia em "portas" demais.
 * Agora: o botão Criar, fixo em cima, e 5 itens (6 na Empresas):
 *   Início · Telas · Agenda · Biblioteca · Marca (· Pessoas, na Empresas).
 * Plano, Equipe, Ajustes e Ajuda vão para o avatar (`menu: false`). Cada
 * página antiga continua aberta pelo mesmo endereço; o que mudou foi onde
 * ela mora. `tambem`: páginas que acendem o grupo sem ser aba dele.
 */
export const GRUPOS = [
  // Criar é o botão de cima, sempre igual (`botao`). O que está sendo criado vira aviso no topo.
  { id: 'criar', label: 'Criar', botao: true, paginas: ['criar'], tambem: ['criando', 'rapida'] },
  // Os alertas viram uma faixa "Precisa de você" no Início (a página continua no endereço).
  { id: 'inicio', label: 'Início', paginas: ['overview'], tambem: ['alerts'] },
  /*
   * Telas: as TVs; cada uma abre a página dela (o que passa, os ajustes e o
   * que passou). A Programação deixou de ser item do menu: ela é a lista das
   * TVs com o que passa em cada uma, dentro de Telas.
   */
  { id: 'telas', label: 'Telas', paginas: ['screens'], tambem: ['programacao', 'content', 'relatorio'] },
  // Agenda: as datas e o que tem período (a semana visual é a fase 8).
  { id: 'agenda', label: 'Agenda', paginas: ['calendario'] },
  /*
   * Biblioteca: tudo que pode ir para a TV, uma vez só. Quatro abas no máximo:
   * o que está pronto, o que é seu, as fotos e vídeos (com as músicas) e,
   * no Comércio e na Saúde, os Apps (aniversários, mural e indicadores).
   * As páginas de antes continuam como partes delas.
   */
  { id: 'midias', label: 'Biblioteca', paginas: ['prontos', 'seus', 'storage'],
    tambem: ['apps', 'telasprontas', 'pecas', 'campanhas', 'designs', 'studio', 'campaigns', 'images', 'musicas', 'ia', 'banco'] },
  { id: 'marca', label: 'Marca', paginas: ['brand'] },
  // Pessoas: item do menu na Empresas; no Comércio e na Saúde, os Apps da Biblioteca (gruposDa).
  { id: 'extras', label: 'Pessoas', paginas: ['birthdays', 'mural', 'indicadores'] },
  // A conta mora no avatar (Topbar): Plano, Equipe, Ajustes e Ajuda.
  { id: 'conta', label: 'Conta', menu: false, paginas: ['billing', 'team', 'settings', 'support'] },
];

/*
 * O menu DA FRENTE (docs/FRENTES.md). Na Empresas, Pessoas é o dia a dia de
 * RH: item do menu, depois da Biblioteca. No Comércio e na Saúde, vira a aba
 * Apps da Biblioteca ("conteúdos que se atualizam sozinhos") — o menu fica
 * com 5 itens. O nome e o lugar vêm do registro das frentes (js/perfil.js).
 */
export function gruposDa(frente) {
  const f = P.de(frente);
  return GRUPOS.map((g) => {
    if (g.id === 'extras') return f.extras.noMenu ? { ...g, menu: false } : { ...g, label: f.extras.rotulo };
    if (g.id === 'midias' && f.extras.noMenu) return { ...g, paginas: g.paginas.concat('apps') };
    return g;
  });
}
// Os itens do menu (a lista de baixo do botão Criar), na ordem.
export function itensDoMenu(frente) {
  return gruposDa(frente).filter((g) => g.menu !== false && !g.botao);
}

// No celular: a barra de baixo, com o Criar no meio. O resto (Marca, Pessoas, a conta) fica no menu de cima.
export const BARRA_INFERIOR = ['inicio', 'telas', 'criar', 'agenda', 'midias'];

/* O grupo de uma página (ou nulo, para as páginas de quem opera a plataforma). */
export function grupoDa(pagina) {
  return GRUPOS.find((g) => g.paginas.includes(pagina) || (g.tambem || []).includes(pagina)) || null;
}
/*
 * O grupo aceso NA FRENTE: no Comércio e na Saúde, Pessoas, Mural e
 * Indicadores moram nos Apps da Biblioteca — é ela que acende.
 */
export function grupoNaFrente(pagina, frente) {
  const g = grupoDa(pagina);
  if (g && g.id === 'extras' && P.de(frente).extras.noMenu) return gruposDa(frente).find((x) => x.id === 'midias');
  return g ? gruposDa(frente).find((x) => x.id === g.id) : null;
}

/*
 * Para onde vai um `?ir=` da URL: o nome de uma página (o endereço antigo,
 * que continua valendo) ou de um grupo (o endereço novo, que abre a primeira
 * página dele). A lista é fechada de propósito: URL é coisa que qualquer um
 * escreve.
 */
// Nomes novos para páginas que mantêm o endereço antigo, e grupos que mudaram de nome.
const APELIDOS = { criados: 'campanhas', automaticos: 'birthdays', relatorios: 'relatorio', biblioteca: 'prontos', pessoas: 'birthdays' };

export function paginaDoIr(ir) {
  if (!ir) return null;
  if (PAGINAS[ir]) return ir;
  if (APELIDOS[ir]) return APELIDOS[ir];
  const g = GRUPOS.find((x) => x.id === ir);
  return g ? g.paginas[0] : null;
}
