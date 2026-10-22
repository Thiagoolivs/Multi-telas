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

module.exports = { semCopiasDeCampanha, ehCopia };
