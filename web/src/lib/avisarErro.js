/*
 * O PAINEL AVISA QUANDO UMA TELA QUEBRA (05/11).
 *
 * A Programação quebrou em produção para toda conta com campanha no ar, e a
 * equipe só soube por um vídeo do dono. Agora o erro que derruba uma tela
 * (LimiteDeErro) e o que escapa de tudo (window 'error' e promessa sem
 * catch) vão para o servidor, que agrupa, alerta pelo webhook no primeiro de
 * cada tipo e mostra na Plataforma (server/erros.js).
 *
 * O que NÃO vai: o endereço com parâmetros (pode ter token de senha), o
 * conteúdo da tela e qualquer dado digitado. Só a mensagem, a pilha (os
 * arquivos do pacote) e qual página estava aberta.
 *
 * Sem enxurrada: o mesmo erro vai uma vez por aba, e no máximo 10 por aba.
 * Falha de rede e recusa do servidor (erro com `status`) não são defeito do
 * painel: ficam de fora.
 */
const vistos = new Set();
let enviados = 0;
const MAX_POR_ABA = 10;

// O pacote velho de antes de um deploy: esperado, o LimiteDeErro já pede para recarregar.
export const ehPacoteVelho = (e) => /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading (CSS )?chunk/i.test(String((e && e.message) || e || ''));

function ignorar(e) {
  if (!e) return true;
  if (typeof e === 'object' && e.status) return true; // resposta do servidor (api.js)
  const msg = String(e.message || e);
  if (/Failed to fetch|NetworkError|Load failed|AbortError|The user aborted/i.test(msg)) return true;
  return ehPacoteVelho(e);
}

// A página aberta, sem parâmetros além de `ir` (o nome da tela do painel).
function paginaAberta() {
  try {
    const ir = new URLSearchParams(location.search).get('ir');
    return location.pathname + (ir ? '?ir=' + encodeURIComponent(ir).slice(0, 40) : '');
  } catch (x) { return ''; }
}

export function avisarErro(erro, tipo) {
  try {
    if (ignorar(erro) || enviados >= MAX_POR_ABA) return;
    const mensagem = String((erro && erro.message) || erro).slice(0, 300);
    const chave = (tipo || '') + '|' + mensagem;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    enviados++;
    fetch('/api/erros/painel', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensagem, pilha: String((erro && erro.stack) || '').slice(0, 3000), tipo: tipo || 'tela', pagina: paginaAberta() }),
    }).catch(() => {});
  } catch (x) { /* avisar nunca pode ser o segundo erro */ }
}

// O que escapa de tudo: erro solto na janela e promessa rejeitada sem catch.
export function vigiarErros() {
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (ev) => avisarErro(ev.error || ev.message, 'janela'));
  window.addEventListener('unhandledrejection', (ev) => avisarErro(ev.reason, 'promessa'));
}
