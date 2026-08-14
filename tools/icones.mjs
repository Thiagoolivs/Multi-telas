/*
 * tools/icones.mjs — desenha os ícones do app a partir de um SVG só.
 *
 * Rode à mão quando a marca mudar:  node tools/icones.mjs
 * Os PNG ficam versionados em icons/ — o build normal não depende deste
 * script, nem de ter um navegador instalado.
 *
 * Por que PNG e não o SVG direto no manifesto: instalação de PWA é o momento
 * em que menos se pode "quase funcionar". Android, Windows e macOS montam o
 * ícone da tela inicial por caminhos diferentes, e PNG é o único formato que
 * os três aceitam sem ressalva. Um ícone que não carrega vira um quadrado
 * cinza na tela inicial de quem acabou de instalar.
 *
 * MASCARÁVEL é ícone à parte, e não capricho: o Android RECORTA o ícone na
 * forma do aparelho (círculo, squircle, gota). Ele corta até 20% de cada
 * borda, então o desenho precisa caber numa "zona segura" de 80% no centro —
 * ou o sistema come um pedaço do símbolo. O ícone comum, esse, aparece
 * inteiro, com o próprio canto arredondado.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESTINO = path.join(RAIZ, 'icons');

const AZUL = '#2f6feb';
const CLARO = '#56ccf2';

/*
 * O símbolo: uma tela com um traço de base, que é o que a marca já usa na
 * navegação da landing. Desenhado com caminho e não com fonte de ícone — o
 * arquivo tem que se bastar.
 */
function tela(cor) {
  return `
    <rect x="14" y="20" width="72" height="50" rx="7" fill="none" stroke="${cor}" stroke-width="7"/>
    <path d="M38 80 h24" stroke="${cor}" stroke-width="7" stroke-linecap="round"/>
    <path d="M50 70 v10" stroke="${cor}" stroke-width="7"/>
    <path d="M28 34 h30" stroke="${cor}" stroke-width="6" stroke-linecap="round" opacity=".95"/>
    <path d="M28 47 h44" stroke="${cor}" stroke-width="6" stroke-linecap="round" opacity=".6"/>
    <path d="M28 58 h20" stroke="${cor}" stroke-width="6" stroke-linecap="round" opacity=".35"/>`;
}

/*
 * `escala` encolhe o símbolo dentro do quadro. No mascarável ele fica em 0.62
 * para caber na zona segura mesmo quando o sistema recorta um círculo.
 * `raio` é o canto: 0 no mascarável, porque quem arredonda ali é o Android.
 */
function svg({ escala, raio, fundo }) {
  const desloc = (100 - 100 * escala) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${CLARO}"/>
      <stop offset="1" stop-color="${AZUL}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="${raio}" fill="${fundo === 'gradiente' ? 'url(#g)' : AZUL}"/>
  <g transform="translate(${desloc} ${desloc}) scale(${escala})">${tela('#ffffff')}</g>
</svg>`;
}

const PECAS = [
  { arquivo: 'icone-192.png', tamanho: 192, escala: 0.78, raio: 22, fundo: 'gradiente' },
  { arquivo: 'icone-512.png', tamanho: 512, escala: 0.78, raio: 22, fundo: 'gradiente' },
  // Mascaráveis: sem canto próprio e com o símbolo dentro da zona segura.
  { arquivo: 'icone-mascara-192.png', tamanho: 192, escala: 0.62, raio: 0, fundo: 'gradiente' },
  { arquivo: 'icone-mascara-512.png', tamanho: 512, escala: 0.62, raio: 0, fundo: 'gradiente' },
  // iOS ignora o manifesto e usa esta: sem transparência e sem canto (o
  // próprio sistema arredonda).
  { arquivo: 'apple-touch-icon.png', tamanho: 180, escala: 0.74, raio: 0, fundo: 'solido' },
];

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await mkdir(DESTINO, { recursive: true });

for (const p of PECAS) {
  const marcacao = svg(p);
  await pagina.setViewportSize({ width: p.tamanho, height: p.tamanho });
  await pagina.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:${p.tamanho}px;height:${p.tamanho}px}</style>${marcacao}`,
  );
  const png = await pagina.locator('svg').screenshot({ omitBackground: true });
  await writeFile(path.join(DESTINO, p.arquivo), png);
  console.log(p.arquivo, png.length + ' bytes');
}

// O favicon vetorial, que é o único lugar onde SVG é melhor: nítido em
// qualquer tamanho de aba e pesa 600 bytes.
await writeFile(path.join(DESTINO, 'icone.svg'), svg({ escala: 0.78, raio: 22, fundo: 'gradiente' }));
console.log('icone.svg');

await navegador.close();
