/*
 * A DATA DE HOJE COMO IDEIA (EXECUTOR §2c, item 35).
 *
 * O aviso "Hoje é Outubro Rosa / Vestir a tela" morava no topo da página da
 * TV e trocava a tela inteira num clique, por fora do Criar. Decisão do dono:
 * a data vira uma ideia — no Criar (a primeira das "Ideias para hoje") e no
 * Início —, e a campanha dela passa pelo mesmo caminho de todas as outras.
 */
export function ideiaDaData(hoje) {
  if (!hoje || !hoje.label) return null;
  return {
    titulo: (hoje.emoji ? hoje.emoji + ' ' : '') + hoje.label,
    porque: 'É a data de hoje: uma campanha com a cara dela.',
    brief: 'Uma campanha de ' + hoje.label + ' para a loja',
    imagens: 'nenhuma',
    daData: true,
  };
}
