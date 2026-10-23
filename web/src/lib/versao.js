/*
 * O PAINEL ABERTO HÁ HORAS (EXECUTOR D46).
 *
 * O painel é uma página só: quem o deixa aberto (no computador da loja, no
 * app instalado) roda o pacote do dia em que abriu, por mais deploys que
 * aconteçam. Foi assim que o "Assinar" ficou mudo em produção: o painel de
 * antes do D0.8 recebia o 400 "falta o CPF/CNPJ" e não abria o pedido.
 *
 * Aqui o painel confere, ao voltar à aba e de 15 em 15 minutos, se o
 * servidor já serve outro pacote. Se sim, um aviso com "Recarregar" — sem
 * recarregar sozinho, que perderia o que a pessoa está escrevendo.
 */
import { aviso } from './avisos.js';

const INTERVALO_MS = 15 * 60 * 1000;

// O pacote principal que um HTML do painel carrega ("/app/assets/index-XXXX.js").
export function pacoteDe(html) {
  const m = /\/app\/assets\/index-[\w-]+\.js/.exec(String(html || ''));
  return m ? m[0] : '';
}

export function vigiarVersao() {
  if (!import.meta.env.PROD || typeof document === 'undefined') return;
  const s = document.querySelector('script[type="module"][src*="/app/assets/index-"]');
  const atual = s ? new URL(s.getAttribute('src'), location.href).pathname : '';
  if (!atual) return;
  let avisou = false;
  async function conferir() {
    if (avisou || document.visibilityState === 'hidden') return;
    try {
      // fetch comum (não navegação): o worker do painel deixa passar direto para a rede.
      const r = await fetch('/app/', { cache: 'no-store', credentials: 'same-origin' });
      if (!r.ok) return;
      const novo = pacoteDe(await r.text());
      if (novo && novo !== atual) {
        avisou = true;
        aviso.pronto('versao-do-painel', 'O painel foi atualizado.', 'Recarregue para usar a versão nova.',
          { rotulo: 'Recarregar', on: () => location.reload() });
      }
    } catch (e) { /* sem rede: confere na próxima */ }
  }
  document.addEventListener('visibilitychange', conferir);
  setInterval(conferir, INTERVALO_MS);
}
