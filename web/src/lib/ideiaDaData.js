/*
 * A DATA DE HOJE COMO IDEIA (EXECUTOR §2c, item 35).
 *
 * O aviso "Hoje é Outubro Rosa / Vestir a tela" morava no topo da página da
 * TV e trocava a tela inteira num clique, por fora do Criar. Decisão do dono:
 * a data vira uma ideia — no Criar (a primeira das "Ideias para hoje") e no
 * Início —, e a campanha dela passa pelo mesmo caminho de todas as outras.
 */
/*
 * Reteste 4: `lugar` é o da frente (a loja, a empresa, a clínica): a fábrica
 * recebia "uma campanha … para a loja". E a data é "da vez", não "de hoje":
 * a janela começa dias antes (a Black Friday aparecia em 22/11 como hoje).
 */
export function ideiaDaData(hoje, lugar = 'loja') {
  if (!hoje || !hoje.label) return null;
  return {
    titulo: (hoje.emoji ? hoje.emoji + ' ' : '') + hoje.label,
    porque: 'É a data da vez: uma campanha com a cara dela.',
    brief: 'Uma campanha de ' + hoje.label + ' para a ' + lugar,
    imagens: 'nenhuma',
    daData: true,
  };
}
