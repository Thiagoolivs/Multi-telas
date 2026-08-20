/*
 * tools/baixar-fontes.mjs — traz as fontes para dentro de casa.
 *
 * POR QUE ISTO EXISTE
 *
 * O texto de uma peça é medido antes de existir: o compositor calcula se
 * "PROMOÇÃO DE SEXTA" cabe na caixa usando a largura média de caractere de
 * cada família (`largura`, em js/fontes.js). Essa conta só vale se a fonte
 * que a TV desenha for a fonte que o compositor mediu.
 *
 * Enquanto as famílias vinham de fonts.googleapis.com, isso era uma aposta na
 * rede do cliente. TV em recepção com Wi-Fi ruim, rede corporativa que bloqueia
 * domínio de terceiro, DNS capturado por portal cativo — em qualquer um desses
 * casos a folha da Google não chega, o navegador cai na fonte de sistema (mais
 * larga que Anton em 40%) e o título que cabia estoura a peça. O pior é o
 * silêncio: nada falha, nada avisa, e o defeito só aparece na parede.
 *
 * As famílias do catálogo são todas OFL (SIL Open Font License), que permite
 * redistribuir. Servindo do nosso domínio, a fonte chega junto com o resto do
 * app ou não chega nenhum dos dois — que é o modo de falhar honesto.
 *
 * O QUE ELE FAZ
 *
 * Pede a cada família a folha CSS da Google usando User-Agent de Chrome
 * moderno (é o UA que decide o formato: com ele vem woff2, sem ele vem ttf,
 * três vezes maior), guarda os arquivos em fonts/arquivos/ e escreve
 * fonts/fontes.css apontando para eles.
 *
 * Fica só latin e latin-ext: é o que o português precisa. Cirílico, grego e
 * vietnamita são metade do peso do pacote e nenhum cliente vai usar.
 *
 * COMO RODAR
 *
 *   node tools/baixar-fontes.mjs
 *
 * Só precisa rodar de novo quando alguém acrescentar família ao catálogo. O
 * resultado é versionado de propósito: build de produção não pode depender de
 * a Google estar no ar.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(RAIZ, 'fonts');
const DEST_ARQUIVOS = path.join(DEST, 'arquivos');
const DEST_LICENCAS = path.join(DEST, 'licencas');

/*
 * Pastas do repositório google/fonts, para buscar a licença de cada família.
 * A OFL permite redistribuir com uma condição que não é decorativa: a licença
 * e o aviso de copyright vão junto com o arquivo. Baixar a fonte e deixar a
 * licença para trás é o único jeito de errar aqui, e é o jeito fácil.
 */
const REPO_FONTS = 'https://raw.githubusercontent.com/google/fonts/main/ofl/';

/*
 * UA de Chrome. A Google serve formato diferente por UA e é a única forma de
 * pedir woff2 — não há parâmetro na URL para isso.
 */
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/* Os dois alfabetos que interessam ao português. */
const SUBSETS = new Set(['latin', 'latin-ext']);

/*
 * As famílias vêm do catálogo único (js/fontes.js) mais as do TEMA do painel
 * (js/theme.js), que são outra lista: tipografia de interface, não de peça.
 * Ler daqui em vez de repetir a lista é o que impede o pacote de envelhecer
 * sem ninguém notar.
 */
function specsDoCatalogo() {
  const { FAMILIAS } = require(path.join(RAIZ, 'js', 'fontes.js'));
  const specs = new Set();
  for (const f of Object.values(FAMILIAS)) if (f.google) specs.add(f.google);
  return specs;
}

function specsDoTema() {
  const fonte = require('node:fs').readFileSync(path.join(RAIZ, 'js', 'theme.js'), 'utf8');
  const bloco = /const FONTS = \{([\s\S]*?)\n  \};/.exec(fonte);
  const specs = new Set();
  if (!bloco) throw new Error('js/theme.js mudou de forma: não achei o bloco FONTS');
  for (const m of bloco[1].matchAll(/google: '([^']+)'/g)) specs.add(m[1]);
  return specs;
}

async function baixar(url, comoTexto) {
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(url + ' respondeu ' + r.status);
  return comoTexto ? r.text() : Buffer.from(await r.arrayBuffer());
}

/*
 * A folha da Google vem com um comentário de subset antes de cada @font-face:
 *
 *   \/* latin *\/
 *   @font-face { font-family:'Inter'; ... src:url(https://fonts.gstatic.com/...) }
 *
 * É por esse comentário que dá para saber qual alfabeto cada bloco cobre —
 * o unicode-range diz a mesma coisa, mas comparando faixas.
 */
function blocos(css) {
  const out = [];
  const re = /\/\*\s*([a-z0-9-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/gi;
  for (const m of css.matchAll(re)) out.push({ subset: m[1], regra: m[2] });
  return out;
}

/* Nome de arquivo estável: mesma fonte, mesmo nome, em qualquer máquina. */
function nomeArquivo(regra, subset, urlOriginal) {
  const familia = /font-family:\s*'([^']+)'/.exec(regra)?.[1] || 'fonte';
  const peso = /font-weight:\s*([0-9]+)/.exec(regra)?.[1] || '400';
  const estilo = /font-style:\s*(italic)/.exec(regra) ? 'italic' : 'normal';
  const ext = path.extname(new URL(urlOriginal).pathname) || '.woff2';
  return `${familia.toLowerCase().replace(/\s+/g, '-')}-${peso}-${estilo}-${subset}${ext}`;
}

/*
 * Baixa a OFL de cada família. O nome da pasta no google/fonts é o nome da
 * família em minúsculas, sem espaço — 'Space Grotesk' vira 'spacegrotesk'.
 */
async function licencas(familias) {
  await fs.mkdir(DEST_LICENCAS, { recursive: true });
  const linhas = [];
  for (const nome of [...familias].sort()) {
    const pasta = nome.toLowerCase().replace(/[^a-z0-9]/g, '');
    const txt = await baixar(REPO_FONTS + pasta + '/OFL.txt', true);
    await fs.writeFile(path.join(DEST_LICENCAS, pasta + '.txt'), txt);
    const copyright = /^Copyright.*$/m.exec(txt)?.[0] || '';
    linhas.push(`| ${nome} | ${copyright} | [\`licencas/${pasta}.txt\`](licencas/${pasta}.txt) |`);
  }
  const md = `# Licenças das fontes

As famílias em \`arquivos/\` foram baixadas do Google Fonts e são
redistribuídas aqui sob a **SIL Open Font License 1.1**, que permite embutir e
servir do próprio domínio desde que a licença e o aviso de copyright venham
junto — é o que esta pasta faz.

Nenhuma delas foi modificada. Os arquivos são os \`.woff2\` que a Google serve,
recortados para os alfabetos latin e latin-ext.

| Família | Copyright | Licença |
|---|---|---|
${linhas.join('\n')}

Regenerar: \`node tools/baixar-fontes.mjs\`.
`;
  await fs.writeFile(path.join(DEST, 'LICENSE.md'), md);
  console.log(`${linhas.length} licenças em fonts/licencas/`);
}

async function main() {
  const specs = [...new Set([...specsDoCatalogo(), ...specsDoTema()])].sort();
  await fs.mkdir(DEST_ARQUIVOS, { recursive: true });

  const regras = [];
  const vistas = new Set();
  const familias = new Set();
  const baixados = new Map(); // url da Google → nome local (a mesma URL repete entre famílias)
  let bytes = 0;

  for (const spec of specs) {
    const url = 'https://fonts.googleapis.com/css2?family=' + spec + '&display=swap';
    const css = await baixar(url, true);
    const achados = blocos(css);
    if (!achados.length) throw new Error('nenhum @font-face em ' + spec);

    let mantidos = 0;
    for (const { subset, regra } of achados) {
      if (!SUBSETS.has(subset)) continue;
      const src = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(regra);
      if (!src) continue;
      const original = src[1];

      let nome = baixados.get(original);
      if (!nome) {
        nome = nomeArquivo(regra, subset, original);
        const bin = await baixar(original, false);
        await fs.writeFile(path.join(DEST_ARQUIVOS, nome), bin);
        baixados.set(original, nome);
        bytes += bin.length;
      }
      /*
       * A mesma família aparece nas duas listas (catálogo da peça e tema do
       * painel) com recortes de peso diferentes. Sem esta chave, Inter entrava
       * duas vezes na folha — inofensivo, mas ilegível para quem for ler.
       */
      familias.add(/font-family:\s*'([^']+)'/.exec(regra)[1]);
      const chave = regra.replace(/\s+/g, ' ').trim();
      if (!vistas.has(chave)) { vistas.add(chave); regras.push(regra.replace(original, 'arquivos/' + nome)); }
      mantidos++;
    }
    console.log(`${spec.split(':')[0].padEnd(22)} ${mantidos} corte(s)`);
  }

  const cabecalho = `/*
 * fonts/fontes.css — GERADO por tools/baixar-fontes.mjs. Não edite à mão.
 *
 * Todas as famílias do catálogo, servidas do nosso domínio. Uma folha só com
 * tudo dentro não pesa: @font-face é uma promessa, e o navegador só busca o
 * arquivo da família que algum texto realmente usa.
 *
 * font-display: swap — o conteúdo aparece na hora com a fonte de sistema e
 * troca quando a certa chega. Numa TV, ver o aviso antes vale mais do que
 * vê-lo bonito depois.
 *
 * Fontes sob SIL Open Font License 1.1 (ver fonts/LICENSE.md).
 */
`;
  await fs.writeFile(path.join(DEST, 'fontes.css'), cabecalho + regras.join('\n') + '\n');
  await licencas(familias);
  console.log(`\n${baixados.size} arquivos, ${(bytes / 1024 / 1024).toFixed(2)} MB em fonts/arquivos/`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
