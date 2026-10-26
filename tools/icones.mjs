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

// Marca de 10/2026: fundo quase preto, zonas em branco e o ponto vivo em lima.
const TINTA = '#0E0B1F';
const LIMA = '#C6F432';
const RODAPE = '#86858F'; // branco a 50% sobre a tinta, já misturado

/*
 * O símbolo: as três zonas da TV (principal, lateral e rodapé) — o que o
 * produto faz, desenhado. A lateral em lima é o "no ar". Caminho e não fonte
 * de ícone: o arquivo tem que se bastar.
 */
function zonas() {
  return `
    <rect x="0" y="0" width="88" height="88" rx="12" fill="#ffffff"/>
    <rect x="96" y="0" width="40" height="88" rx="12" fill="${LIMA}"/>
    <rect x="0" y="96" width="136" height="40" rx="12" fill="${RODAPE}"/>`;
}

/*
 * `escala` é quanto do quadro o símbolo ocupa. No mascarável ele fica menor
 * para caber na zona segura mesmo quando o sistema recorta um círculo.
 * `raio` é o canto: 0 no mascarável, porque quem arredonda ali é o Android.
 */
function svg({ escala, raio }) {
  const lado = 100 * escala;
  const desloc = (100 - lado) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" rx="${raio}" fill="${TINTA}"/>
  <g transform="translate(${+desloc.toFixed(2)} ${+desloc.toFixed(2)}) scale(${+(lado / 136).toFixed(4)})">${zonas()}</g>
</svg>`;
}

const PECAS = [
  { arquivo: 'icone-192.png', tamanho: 192, escala: 0.57, raio: 23 },
  { arquivo: 'icone-512.png', tamanho: 512, escala: 0.57, raio: 23 },
  // Mascaráveis: sem canto próprio e com o símbolo dentro da zona segura.
  { arquivo: 'icone-mascara-192.png', tamanho: 192, escala: 0.46, raio: 0 },
  { arquivo: 'icone-mascara-512.png', tamanho: 512, escala: 0.46, raio: 0 },
  // iOS ignora o manifesto e usa esta: sem transparência e sem canto (o
  // próprio sistema arredonda).
  { arquivo: 'apple-touch-icon.png', tamanho: 180, escala: 0.57, raio: 0 },
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
await writeFile(path.join(DESTINO, 'icone.svg'), svg({ escala: 0.57, raio: 23 }));
console.log('icone.svg');

await navegador.close();
