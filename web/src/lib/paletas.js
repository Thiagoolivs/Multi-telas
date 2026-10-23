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
 * cinza, e isso não é identidade.
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
  return sai;
}

/*
 * As cores do logo, lidas no navegador.
 *
 * O logo é mídia nossa (mesma origem), então o canvas não fica "sujo" e dá
 * para ler os pixels. Reduz para 64×64, ignora o transparente e o neutro
 * (fundo branco, contorno preto), agrupa por matiz e devolve a cor média
 * dos dois grupos maiores — a cor do logo, e a segunda se houver.
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
        const px = g.getImageData(0, 0, N, N).data;
        const grupos = {};
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] < 200) continue;
          const hex = C.rgb2hex(px[i], px[i + 1], px[i + 2]);
          const o = C.paraOklch(hex);
          if (o.c < 0.05 || o.l > 0.95 || o.l < 0.12) continue;
          const k = Math.round(o.h / 20) % 18;
          const gr = grupos[k] || (grupos[k] = { n: 0, r: 0, g: 0, b: 0 });
          gr.n++; gr.r += px[i]; gr.g += px[i + 1]; gr.b += px[i + 2];
        }
        const ordem = Object.values(grupos).filter((x) => x.n >= 12).sort((a, b) => b.n - a.n).slice(0, 2);
        ok(ordem.map((x) => C.rgb2hex(x.r / x.n, x.g / x.n, x.b / x.n)));
      } catch (e) { ok([]); }
    };
    img.onerror = () => ok([]);
    img.src = url;
  });
}
