/*
 * A DATA DE HOJE COMO IDEIA (EXECUTOR §2c, item 35).
 *
 * O aviso "Hoje é Outubro Rosa / Vestir a tela" morava no topo da página da
 * TV e trocava a tela inteira num clique, por fora do Criar. Decisão do dono:
 * a data vira uma ideia — no Criar (a primeira das "Ideias para hoje") e no
 * Início —, e a campanha dela passa pelo mesmo caminho de todas as outras.
 *
 * `alvo` (AAAA-MM-DD, o `hojeAlvo` de /api/seasons) é o dia da data. A
 * janela começa dias antes (a Black Friday, uma semana), e o painel dizia
 * "É a data de hoje" cinco dias antes dela (reteste 4). Agora diz quanto
 * falta; a campanha de mês inteiro diz que é o mês dela. A frase do pedido
 * fala do `lugar` da frente (a loja, a empresa, a clínica): a fábrica recebia
 * "uma campanha … para a loja".
 */
function diasAte(alvo, agora) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(alvo || ''));
  if (!m) return null;
  const a = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const h = agora || new Date();
  const hoje = new Date(h.getFullYear(), h.getMonth(), h.getDate());
  return Math.round((a.getTime() - hoje.getTime()) / 864e5);
}

export function ideiaDaData(hoje, { alvo, agora, lugar } = {}) {
  if (!hoje || !hoje.label) return null;
  const mesInteiro = hoje.quando && hoje.quando.tipo === 'mes';
  const faltam = mesInteiro ? null : diasAte(alvo, agora);
  const porque = mesInteiro ? 'É o mês dela: uma campanha com a cara dela.'
    : faltam > 1 ? 'Faltam ' + faltam + ' dias: uma campanha com a cara dela.'
      : faltam === 1 ? 'É amanhã: uma campanha com a cara dela.'
        : 'É a data de hoje: uma campanha com a cara dela.';
  return {
    titulo: (hoje.emoji ? hoje.emoji + ' ' : '') + hoje.label,
    porque,
    brief: 'Uma campanha de ' + hoje.label + (lugar ? ' para a ' + lugar : ''),
    imagens: 'nenhuma',
    daData: true,
  };
}
