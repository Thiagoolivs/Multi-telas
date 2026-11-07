/*
 * Paletas sugeridas no painel — as MESMAS de js/paletas.js, não uma cópia.
 *
 * Importa os módulos canônicos por efeito colateral (cor → fontes → tokens →
 * paletas, nessa ordem, porque cada um usa o global do anterior) e
 * reexporta o global. O servidor usa o mesmo arquivo para dar a paleta com
 * que a conta nasce: se fossem duas listas, a conta nasceria com uma paleta
 * que a tela não reconhece como sugestão.
 */
import '../../../js/cor.js';
import '../../../js/fontes.js';
import '../../../js/tokens.js';
import '../../../js/paletas.js';

const P = globalThis.MTPaletas;
const C = globalThis.MTCor;

export const RAMOS = P.RAMOS;
export const CURADAS = P.CURADAS;
export const NOMES_RAMO = P.NOMES_RAMO;
export const sugerir = P.sugerir;
export const aoRedor = P.aoRedor;
export const avisos = P.avisos;
export const detectarRamo = P.detectarRamo;
// Os três climas da marca (Escuro elegante, Claro limpo, Cor da marca forte) e o do ramo.
export const CLIMAS = P.CLIMAS;
export const climaDoRamo = P.climaDoRamo;

// Duas listas de cores são a mesma paleta se as duas primeiras batem.
export const mesmaPaleta = (a, b) => !!a && !!b && a.length > 1 && b.length > 1
  && String(a[0]).toLowerCase() === String(b[0]).toLowerCase()
  && String(a[1]).toLowerCase() === String(b[1]).toLowerCase();

// A paleta é uma das curadas (de ramo)? Então não é cor "da empresa".
export function ehCurada(cores) {
  return Object.values(P.CURADAS).some((ps) => ps.some((p) => mesmaPaleta(p.cores, cores)));
}

/*
 * Cores do resumo do site lido (server/site.js escreve os hex no resumo).
 * Cinza e quase-branco saem: site de todo mundo tem fundo branco e texto
 * cinza, e isso não é identidade. Site só de pastéis ganha uma versão forte
 * da cor dele na frente (js/paletas.js, firmar — lote de 06/11).
 */
export function coresDoTexto(texto) {
  const achadas = String(texto || '').match(/#[0-9a-f]{6}\b/gi) || [];
  const sai = [];
  for (const h of achadas) {
    const o = C.paraOklch(h);
    if (!o || o.c < 0.04 || o.l > 0.93) continue;
    if (!sai.some((x) => x.toLowerCase() === h.toLowerCase())) sai.push(h.toLowerCase());
    if (sai.length >= 2) break;
  }
  return P.firmar(sai);
}

/*
 * As cores do logo, lidas no navegador.
 *
 * O logo é mídia nossa (mesma origem), então o canvas não fica "sujo" e dá
 * para ler os pixels. Reduz para 64×64 e entrega os pixels à regra de
 * js/paletas.js (coresDosPixels, lote de 06/11): a cor mais característica
 * e saturada, sem o fundo branco, o contorno preto e o cinza — a não ser
 * que o logo seja só isso —, e logo só de pastéis com uma versão forte da
 * cor dele na frente. A regra mora lá para o teste conferir sem navegador.
 */
export function coresDoLogo(url) {
  return new Promise((ok) => {
    if (!url) return ok([]);
    const img = new Image();
    img.onload = () => {
      try {
        const N = 64;
        const cv = document.createElement('canvas');
        cv.width = N; cv.height = N;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0, N, N);
        ok(P.coresDosPixels(g.getImageData(0, 0, N, N).data));
      } catch (e) { ok([]); }
    };
    img.onerror = () => ok([]);
    img.src = url;
  });
}
