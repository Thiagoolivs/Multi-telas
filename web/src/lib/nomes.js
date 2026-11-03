/*
 * Os nomes que as pessoas leem para os ids do banco.
 *
 * QA de lançamento, 03/11: o operador via "Pro"/"pro" numa conta que, para o
 * cliente, é do plano Essencial — e existe outro plano chamado Pro (o
 * 'integrada', em breve). E a página de Suporte mostrava "(owner)". O id
 * fica no banco por compatibilidade (server/plans.js: 'pro' = Essencial);
 * na tela, sempre o nome. test/painel-acessivel.test.js confere que estes
 * nomes são os mesmos de server/plans.js.
 */
export const NOME_DO_PLANO = { free: 'Grátis', pro: 'Essencial', integrada: 'Pro', enterprise: 'Enterprise' };
export const nomeDoPlano = (id) => NOME_DO_PLANO[id || 'free'] || String(id || '');

// O papel como o painel chama (Equipe e Ajustes): nunca "owner"/"member" na tela.
export const NOME_DO_PAPEL = { owner: 'Dono', admin: 'Administrador', member: 'Membro' };
