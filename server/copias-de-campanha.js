/*
 * AS CÓPIAS DE CAMPANHA EM MEUS DESIGNS (EXECUTOR §2e, item 43).
 *
 * Até o item 29, cada campanha do Criar era copiada para a biblioteca com o
 * nome dela — e Meus Designs mostrava a mesma campanha várias vezes, cada
 * uma com um jeito próprio de publicar. A campanha mora em Criar › Campanhas,
 * e as peças dela em Mídias › Peças prontas. As cópias antigas saem da lista
 * (escondidas, não apagadas: a linha continua no banco).
 *
 * Uma linha é cópia quando tem o nome de uma campanha do Criar e nasceu
 * enquanto ela era criada ou ajustada. A Criação rápida também grava na
 * biblioteca com o nome da campanha, mas não tem linha em `campanhas`: fica.
 */
const FOLGA_MS = 60 * 1000;

function ehCopia(item, campanhas) {
  const t = Number(item.createdAt) || 0;
  return campanhas.some((c) => c.nome && c.nome === item.campaign
    && t >= (c.criadoEm || 0) - 5000 && t <= Math.max(c.atualizadoEm || 0, c.criadoEm || 0) + FOLGA_MS);
}

function semCopiasDeCampanha(items, campanhas) {
  const lista = Array.isArray(campanhas) ? campanhas : [];
  if (!lista.length) return items;
  return items.filter((i) => !ehCopia(i, lista));
}

/*
 * A PASTA COM O NOME DE UMA CAMPANHA (fase 10, reteste do bloco 8: "a mesma
 * campanha aparece em 3 lugares"). A peça guardada fora da janela da cópia
 * (outra hora, à mão) fica na lista, mas leva o id da campanha de mesmo
 * nome: Peças guardadas mostra um link para a campanha, a casa das peças
 * dela, em vez de listar tudo de novo. Com dois nomes iguais, vale a
 * campanha mais recente (a lista vem do mais novo para o mais velho).
 */
function comACampanha(items, campanhas) {
  const porNome = new Map();
  for (const c of Array.isArray(campanhas) ? campanhas : []) if (c.nome && !porNome.has(c.nome)) porNome.set(c.nome, c.id);
  if (!porNome.size) return items;
  return items.map((i) => (porNome.has(i.campaign) ? { ...i, campanhaId: porNome.get(i.campaign) } : i));
}

module.exports = { semCopiasDeCampanha, ehCopia, comACampanha };
