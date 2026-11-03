/*
 * Foco preso num diálogo (ou na gaveta do menu), sem biblioteca.
 *
 * QA de lançamento, 03/11 (acessibilidade, usuário 15): os diálogos abriam
 * com o foco ATRÁS do modal; o Tab saía para a página; e ao fechar o foco
 * caía no <body> — quem usa teclado ou leitor de tela perdia onde estava a
 * cada "Parear", "Mais opções" ou confirmação. O combinado agora, para todo
 * diálogo do painel:
 *
 *   1. ao abrir, o foco entra (no campo com autoFocus, senão no primeiro
 *      controle do conteúdo, senão no próprio diálogo);
 *   2. Tab e Shift+Tab rodam só dentro dele;
 *   3. Esc fecha — só o de cima, quando um diálogo abre outro (a confirmação
 *      por cima do "Mais opções" não fecha os dois de uma vez);
 *   4. ao fechar, o foco volta para quem abriu.
 *
 * Funções puras sobre o DOM, para o Dialog e a gaveta usarem igual.
 */

const FOCAVEIS = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])', '[contenteditable="true"]',
].join(',');

export function focaveis(caixa) {
  if (!caixa) return [];
  return [...caixa.querySelectorAll(FOCAVEIS)].filter((el) => {
    if (el.getAttribute('aria-hidden') === 'true' || el.tabIndex < 0) return false;
    // Escondido (display:none, ou dentro de algo escondido) não recebe foco.
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  });
}

// A pilha dos que estão abertos: só o de cima responde ao Esc e prende o Tab.
const pilha = [];

/*
 * Liga o foco preso em `caixa`. `inicial` (opcional) escolhe onde o foco
 * começa; devolve a função que desliga e devolve o foco a quem abriu.
 */
export function prenderFoco(caixa, { aoFechar, inicial } = {}) {
  const quemAbriu = document.activeElement;
  const eu = {};
  pilha.push(eu);
  const noTopo = () => pilha[pilha.length - 1] === eu;

  /*
   * Depois do quadro: o React já pôs o conteúdo e o autoFocus dele já agiu.
   * Se o foco já está dentro (autoFocus), fica onde está.
   */
  const quadro = requestAnimationFrame(() => {
    if (!caixa.isConnected || caixa.contains(document.activeElement)) return;
    const alvo = (inicial && inicial(caixa)) || focaveis(caixa)[0] || caixa;
    try { alvo.focus({ preventScroll: true }); } catch (e) { alvo.focus(); }
  });

  function onKey(e) {
    if (!noTopo()) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.stopPropagation();
      if (aoFechar) aoFechar();
      return;
    }
    if (e.key !== 'Tab') return;
    const lista = focaveis(caixa);
    if (!lista.length) { e.preventDefault(); caixa.focus(); return; }
    const primeiro = lista[0];
    const ultimo = lista[lista.length - 1];
    const ativo = document.activeElement;
    const fora = !caixa.contains(ativo);
    if (e.shiftKey && (ativo === primeiro || ativo === caixa || fora)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && (ativo === ultimo || fora)) { e.preventDefault(); primeiro.focus(); }
  }
  document.addEventListener('keydown', onKey, true);

  return function soltar() {
    cancelAnimationFrame(quadro);
    document.removeEventListener('keydown', onKey, true);
    const i = pilha.indexOf(eu);
    if (i >= 0) pilha.splice(i, 1);
    /*
     * Devolve o foco a quem abriu — se ainda existe na página. (O botão
     * "Ligar a primeira TV" some quando a primeira TV entra; aí vai para o
     * conteúdo da página, em vez de um elemento que já não está lá.)
     */
    let alvo = quemAbriu && quemAbriu.isConnected && typeof quemAbriu.focus === 'function' && quemAbriu !== document.body ? quemAbriu : null;
    // Sem ele, o conteúdo da página (o <main> do AppShell), e não o <body>.
    if (!alvo && !(document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected)) alvo = document.getElementById('conteudo');
    if (alvo) { try { alvo.focus({ preventScroll: true }); } catch (e) { alvo.focus(); } }
  };
}
