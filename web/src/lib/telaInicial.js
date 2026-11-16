/*
 * O app MultiTelas TV não é a tela inicial do aparelho (vigia v2 do app).
 *
 * É a única garantia de a TV voltar sozinha depois do que o app não
 * consegue tratar por conta própria: o Android matando o app por falta de
 * memória, uma queda nativa e a atualização do Android System WebView, que
 * mata o app. O Android reabre a tela inicial sozinho; qualquer outro app
 * fica fechado, com o menu do aparelho na parede, até alguém abrir de novo
 * (docs/CAPACIDADE-E-TVBOX.md §6.2, item 3).
 *
 * O app conta no pulso (`info.inicial`, js/cloud.js). As cascas de antes não
 * contam nada, e a TV de navegador não tem app: nos dois casos, sem aviso —
 * só se avisa o que se sabe.
 */
export function avisoDaTelaInicial(info) {
  if (!info || typeof info !== 'object' || !info.app || info.inicial !== false) return null;
  return {
    titulo: 'Esta TV pode não voltar sozinha',
    texto: 'O app MultiTelas TV não está como tela inicial do aparelho. Se o aparelho fechar o app '
      + '(falta de memória, atualização do Android), a TV fica no menu do aparelho até alguém abrir o app de novo.',
    passos: [
      'No controle da TV, aperte o botão Início (a casinha). Se o aparelho perguntar qual app usar, escolha MultiTelas TV e depois “Sempre”.',
      'Se ele não perguntar: Configurações › Apps › Apps padrão › Tela inicial › MultiTelas TV.',
      'No Google TV essa opção costuma não aparecer. Quem instalou o aparelho resolve pelo computador, com a depuração ligada no aparelho e o comando abaixo.',
      'Para conferir: tire o aparelho da tomada, ligue de novo e veja se o MultiTelas volta sozinho. Resolvido, o aviso some na próxima vez que você abrir esta página.',
    ],
    // O mesmo do android/README.md (passo 4), para quem instala.
    comando: 'adb shell cmd package set-home-activity br.com.multitelas.tv/.MainActivity',
  };
}
