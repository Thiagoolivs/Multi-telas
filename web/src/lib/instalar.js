/*
 * instalar.js — o painel como app instalado.
 *
 * Duas coisas moram aqui: registrar o service worker e guardar o convite de
 * instalação do navegador.
 *
 * ---- Por que guardar o convite ----
 *
 * O Chrome dispara `beforeinstallprompt` UMA vez, quando bem entende, e o
 * evento morre se ninguém o segurar. Só que o momento em que ele chega quase
 * nunca é o momento em que a pessoa quer instalar: ele costuma cair enquanto
 * ela ainda está entendendo a tela. Então o evento é capturado assim que
 * aparece, guardado, e o botão de instalar — que fica em Ajustes, onde se
 * procura por ele — usa o convite guardado quando for clicado.
 *
 * ---- E o iPhone ----
 *
 * O Safari não implementa esse evento e não instala por botão nenhum: o
 * caminho é Compartilhar → Adicionar à Tela de Início, à mão. Um botão que
 * não faz nada é pior que nenhum botão, então lá a interface mostra a
 * instrução em vez do botão.
 */

let convite = null;
const ouvintes = new Set();

function avisar() { ouvintes.forEach((f) => f()); }

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Sem o preventDefault o Chrome mostra a barrinha dele por cima do app.
    e.preventDefault();
    convite = e;
    avisar();
  });
  window.addEventListener('appinstalled', () => {
    convite = null;
    avisar();
  });
}

/* Já está rodando como app instalado? */
export function instalado() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.matchMedia('(display-mode: window-controls-overlay)').matches
    // O caminho do iOS, que não tem display-mode.
    || window.navigator.standalone === true;
}

export function podeInstalar() { return convite !== null; }

/*
 * iPhone e iPad: não dá para instalar por botão, e a instrução muda de lugar
 * conforme o navegador. Detectado pelo toque + plataforma porque o iPad se
 * apresenta como Mac desde o iPadOS 13.
 */
export function precisaDeInstrucaoIOS() {
  if (typeof navigator === 'undefined' || instalado()) return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.platform || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !podeInstalar();
}

export function assinar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/*
 * Abre o convite. Devolve o que a pessoa respondeu — e o convite é de uso
 * único: depois de mostrado, o navegador não deixa reabrir o mesmo.
 */
export async function instalar() {
  if (!convite) return 'indisponivel';
  const e = convite;
  convite = null;
  avisar();
  e.prompt();
  const { outcome } = await e.userChoice;
  return outcome; // 'accepted' | 'dismissed'
}

/*
 * Registra o worker que faz o app abrir sem rede.
 *
 * Só em produção: no `vite dev` os arquivos não têm hash e o worker serviria
 * uma versão velha a cada alteração, o que transforma qualquer sessão de
 * desenvolvimento numa caça a fantasma.
 */
export function registrarWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).catch((e) => {
      // Falhar aqui não pode derrubar o painel: sem worker ele continua
      // inteiro, só deixa de abrir offline.
      console.warn('[pwa] service worker não registrou:', e && e.message);
    });
  });
}
