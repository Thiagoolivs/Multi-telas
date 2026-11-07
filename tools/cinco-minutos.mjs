/*
 * tools/cinco-minutos.mjs — "Sua primeira TV em 5 minutos", medido.
 *
 *   node tools/cinco-minutos.mjs            (servidor já no ar em CINCO_BASE, padrão http://127.0.0.1:6002)
 *   CINCO_SAIDA=<pasta> node tools/cinco-minutos.mjs
 *
 * Uma pessoa que nunca viu o produto: cria a conta pelo painel, cai no passo
 * a passo e vai até a TV — uma TV de mentira (o player num navegador, como
 * em tools/regua-tv.mjs) mostrando o código. No celular (390×844) e no
 * computador (1280×800). Conta os toques, as palavras e a espera do painel
 * em cada passo, tira a foto de cada tela e confere, no fim, que a TV mostra
 * o que a pessoa digitou.
 *
 * O tempo de uma pessoa cuidadosa é estimado (o pedido do dono): 1 s para
 * cada 3 palavras na tela, 2 s por decisão, 0,3 s por letra digitada, 4 s
 * para achar a foto na galeria — mais a espera de verdade do painel.
 *
 * Saída: o relatório no terminal (e resultado.json) e as fotos na pasta.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.CINCO_BASE || 'http://127.0.0.1:6002';
// As fotos e o resultado.json: fora do repositório, a não ser que se peça outra pasta.
const SAIDA = process.env.CINCO_SAIDA || path.join(os.tmpdir(), 'cinco-minutos');
// Uma foto de verdade de prato (a mesma das peças-ouro), como a que a pessoa tiraria no celular.
const FOTO = path.join(RAIZ, 'pecas-ouro/fotos/prato-do-dia.jpg');
const PRODUTO = 'Churrasco do dia';
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync(SAIDA, { recursive: true });

const TAMANHOS = [
  { id: 'celular', nome: 'Celular 390×844', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  { id: 'computador', nome: 'Computador 1280×800', viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
];

// O logo da padaria de teste: desenhado no navegador e salvo em PNG (nada de arquivo de fora).
async function fazerLogo(navegador) {
  const arq = path.join(SAIDA, 'logo-teste.png');
  if (fs.existsSync(arq)) return arq;
  const p = await navegador.newPage({ viewport: { width: 600, height: 300 } });
  await p.setContent('<body style="margin:0;background:transparent"><div style="width:600px;height:300px;display:flex;align-items:center;justify-content:center;gap:24px;font:800 88px sans-serif;color:#7a3b12">'
    + '<span style="width:150px;height:150px;border-radius:50%;background:#e8961e;display:inline-block"></span>Sol</div></body>');
  await p.screenshot({ path: arq, omitBackground: true });
  await p.close();
  return arq;
}

// A TV de mentira: o player num navegador deitado; devolve a página e o código que ela mostra.
async function ligarTvDeMentira(navegador) {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'America/Sao_Paulo' });
  /*
   * A TV numa segunda-feira às 10h (horário de Brasília): a padaria escolhe
   * "segunda a sábado, das 7h às 20h", e fora dele a TV mostra só o relógio —
   * rodando de noite, a foto da TV seria o relógio (certo, mas não confere nada).
   */
  await ctx.clock.install({ time: proximaSegundaAs10() });
  const tv = await ctx.newPage();
  await tv.goto(BASE + '/player.html?cloud=1&pid=cinco' + Date.now() + Math.random().toString(36).slice(2, 6));
  let codigo = null;
  for (let i = 0; i < 60 && !codigo; i++) {
    await espera(400);
    codigo = await tv.evaluate(() => { const m = document.body.innerText.match(/\b[A-Z0-9]{6}\b/); return m && m[0]; });
  }
  if (!codigo) throw new Error('a TV de mentira não mostrou o código');
  return { tv, codigo, ctx };
}

function proximaSegundaAs10() {
  const d = new Date();
  const ate = (8 - d.getUTCDay()) % 7 || 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ate, 13, 0, 0)); // 10h em Brasília
}

// As palavras que a pessoa lê no passo (o que está na coluna do passo e no rodapé).
const palavrasNaTela = (p) => p.evaluate(() => {
  const t = [document.querySelector('main'), document.querySelector('header')].filter(Boolean).map((e) => e.innerText).join(' ');
  return (t.match(/[\p{L}\p{N}]+/gu) || []).length;
});

async function rodar(navegador, tam, logo) {
  const ctx = await navegador.newContext({ viewport: tam.viewport, isMobile: tam.isMobile, hasTouch: tam.hasTouch, deviceScaleFactor: tam.deviceScaleFactor, locale: 'pt-BR' });
  const p = await ctx.newPage();
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  const passos = [];
  let atual = null;
  let n = 0;
  const foto = async (nome) => { n++; await p.screenshot({ path: path.join(SAIDA, tam.id + '-' + String(n).padStart(2, '0') + '-' + nome + '.png'), fullPage: false }); };
  const comecar = async (id, nome) => {
    atual = { id, nome, toques: 0, campos: 0, decisoes: 0, letras: 0, fotosNaGaleria: 0, palavras: 0, espera: 0, acoes: [] };
    passos.push(atual);
  };
  // A espera do painel depois de um toque (subir o logo, ligar a TV, a tela seguinte): a pessoa também espera.
  const esperarPainel = async (loc, timeout = 30000) => {
    const t = Date.now();
    await loc.waitFor({ state: 'visible', timeout });
    atual.espera += Date.now() - t;
  };
  // Cada tela do passo é lida uma vez (a Marca tem duas: de onde vem a marca, e as cores).
  const ler = async () => { atual.palavras += await palavrasNaTela(p); };
  const toque = async (loc, rotulo, { decisao = false } = {}) => {
    await loc.waitFor({ state: 'visible', timeout: 30000 });
    if (tam.hasTouch) await loc.tap(); else await loc.click();
    atual.toques++; if (decisao) atual.decisoes++;
    atual.acoes.push(rotulo);
  };
  const digitar = async (loc, texto, rotulo) => {
    await toque(loc, 'campo: ' + rotulo);
    atual.campos++;
    await loc.pressSequentially(texto, { delay: 15 });
    atual.letras += texto.length;
  };
  const escolherArquivo = async (loc, arquivo, rotulo) => {
    const [seletor] = await Promise.all([p.waitForEvent('filechooser'), (async () => { await toque(loc, rotulo); })()]);
    await seletor.setFiles(arquivo);
    atual.toques++; atual.fotosNaGaleria++; atual.decisoes++;
    atual.acoes.push('escolher a foto na galeria');
  };

  /* ---- O cadastro (fora da conta dos 15 toques: é o mesmo para qualquer fluxo) ---- */
  await comecar('cadastro', 'Criar a conta');
  await p.goto(BASE + '/app/');
  await toque(p.getByRole('button', { name: 'Criar conta', pressed: false }), 'aba Criar conta');
  await digitar(p.getByPlaceholder('Minha Empresa'), 'Padaria Sol', 'nome da empresa');
  await digitar(p.getByPlaceholder('voce@empresa.com'), 'dono' + Date.now() + tam.id + '@teste.local', 'e-mail');
  await digitar(p.locator('input[type=password]'), 'senha-de-teste-123', 'senha');
  await toque(p.getByRole('checkbox', { name: /Li e aceito/ }), 'aceitar os termos');
  atual.palavras += await p.evaluate(() => (document.body.innerText.match(/[\p{L}\p{N}]+/gu) || []).length);
  await foto('cadastro');
  await toque(p.locator('form button[type=submit]'), 'Criar conta', { decisao: true });

  /* ---- 1. Seu negócio ---- */
  await esperarPainel(p.getByRole('heading', { name: 'Qual é o seu negócio?' }));
  await comecar('negocio', '1. Seu negócio');
  await ler(); await foto('negocio');
  await toque(p.getByRole('button', { name: 'Padaria' }), 'Padaria', { decisao: true });

  /* ---- 2. Sua marca ---- */
  await esperarPainel(p.getByRole('heading', { name: 'Sua marca' }));
  await comecar('marca', '2. Sua marca');
  await ler(); await foto('marca');
  await escolherArquivo(p.getByRole('button', { name: 'Mandar o logo' }), logo, 'Mandar o logo');
  await esperarPainel(p.getByRole('heading', { name: 'As cores da sua marca' }));
  await esperarPainel(p.getByRole('img', { name: /Esboço da TV/ }).first());
  await p.waitForTimeout(300); // a foto, só
  await ler(); await foto('marca-cores');
  await toque(p.getByRole('button', { name: 'Está bom' }), 'Está bom', { decisao: true });

  /* ---- 3. Ligar a TV ---- */
  await esperarPainel(p.getByRole('heading', { name: 'Ligue a TV' }));
  await comecar('tv', '3. Ligar a TV');
  // A TV de mentira sobe fora da conta: a pessoa já está com a TV ligada mostrando o código.
  const { tv, codigo, ctx: ctxTv } = await ligarTvDeMentira(navegador);
  await ler(); await foto('tv');
  await digitar(p.getByLabel('Código que aparece na TV'), codigo, 'código da TV');
  await toque(p.getByRole('button', { name: 'Ligar a TV' }), 'Ligar a TV', { decisao: true });

  /* ---- 4. Escolher a tela ---- */
  await esperarPainel(p.getByRole('heading', { name: 'Escolha a tela' }));
  await comecar('tela', '4. Escolher a tela');
  await esperarPainel(p.locator('main button[aria-pressed]').first());
  await p.waitForTimeout(600); // a foto, só
  await ler(); await foto('tela');
  await toque(p.locator('main button[aria-pressed]').first(), 'a primeira tela', { decisao: true });

  /* ---- 5. Fotos e textos ---- */
  await esperarPainel(p.getByRole('heading', { name: 'Fotos e textos' }));
  await comecar('fotos', '5. Fotos e textos');
  await p.waitForTimeout(400); // a foto, só
  await ler(); await foto('fotos');
  const quadro = p.locator('main button').filter({ hasText: 'Ponha a foto' }).first();
  if (await quadro.count()) {
    await escolherArquivo(quadro, FOTO, 'quadro da foto');
    await esperarPainel(p.locator('main button img').first());
  }
  const titulo = p.getByLabel(/Nome do produto|Título/).first();
  if (await titulo.count()) await digitar(titulo, PRODUTO, 'nome do produto');
  const preco = p.getByLabel('Preço');
  if (await preco.count()) await digitar(preco, '29,90', 'preço');
  await p.waitForTimeout(500);
  await foto('fotos-preenchido');
  await toque(p.getByRole('button', { name: 'Continuar' }), 'Continuar', { decisao: true });

  /* ---- 6. Horário ---- */
  await esperarPainel(p.getByRole('heading', { name: /Quando a .* abre\?/ }));
  await comecar('horario', '6. Horário');
  await ler(); await foto('horario');
  await toque(p.getByRole('button', { name: /Segunda a sábado/ }), 'Segunda a sábado', { decisao: true });

  /* ---- 7. Pôr na TV ---- */
  await esperarPainel(p.getByRole('heading', { name: 'Tudo pronto!' }));
  await comecar('pronto', '7. Pôr na TV');
  await p.waitForTimeout(1500); // o quadro da TV entrar, para a foto
  await ler(); await foto('pronto');
  await toque(p.getByRole('button', { name: 'Pôr na TV' }), 'Pôr na TV', { decisao: true });
  await esperarPainel(p.getByRole('heading', { name: 'Pronto! Está na TV.' }));
  await ler(); // o fim também se lê: "Pronto! Está na TV." e os três próximos passos
  await p.waitForTimeout(2500);
  await foto('na-tv');
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(300);
  await foto('na-tv-proximos');

  // A TV de mentira mostra o que a pessoa digitou?
  let naTv = false;
  for (let i = 0; i < 40 && !naTv; i++) {
    await espera(500);
    // As peças desenham dentro de uma sombra (shadow DOM): o texto é procurado nela também.
    naTv = await tv.evaluate((t) => {
      const textos = [];
      const andar = (raiz) => { raiz.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) { textos.push(el.shadowRoot.textContent || ''); andar(el.shadowRoot); } }); };
      textos.push(document.body.textContent || '');
      andar(document);
      return textos.join(' ').toLowerCase().includes(t.toLowerCase());
    }, PRODUTO);
  }
  await tv.waitForTimeout(2500);
  await tv.screenshot({ path: path.join(SAIDA, tam.id + '-' + String(++n).padStart(2, '0') + '-a-tv.png') });
  await ctxTv.close();
  await ctx.close();
  return { tam, passos, naTv, erros };
}

// Lendo, decidindo, digitando e achando a foto (a estimativa do dono), mais a espera de verdade do painel.
function estimar(ps) {
  return ps.palavras / 3 + 2 * ps.decisoes + 0.3 * ps.letras + 4 * ps.fotosNaGaleria + ps.espera / 1000;
}

async function main() {
  const navegador = await chromium.launch();
  const logo = await fazerLogo(navegador);
  const resultados = [];
  try {
    for (const tam of TAMANHOS) resultados.push(await rodar(navegador, tam, logo));
  } finally { await navegador.close(); }

  const linhas = [];
  const json = [];
  const soma = (l, f) => l.reduce((t, x) => t + f(x), 0);
  for (const r of resultados) {
    const fluxo = r.passos.filter((x) => x.id !== 'cadastro');
    const toques = soma(fluxo, (x) => x.toques);
    const nosCampos = soma(fluxo, (x) => x.campos);
    const espera = soma(fluxo, (x) => x.espera) / 1000;
    const pessoa = soma(fluxo, estimar);
    const cadastro = r.passos.find((x) => x.id === 'cadastro');
    linhas.push('\n## ' + r.tam.nome);
    linhas.push('| Passo | Toques (no campo) | Decisões | Palavras | Letras | Espera do painel (s) | Pessoa cuidadosa (s) |');
    linhas.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const x of r.passos) {
      linhas.push('| ' + x.nome + ' | ' + x.toques + ' (' + x.campos + ') | ' + x.decisoes + ' | ' + x.palavras + ' | ' + x.letras + ' | ' + (x.espera / 1000).toFixed(1) + ' | ' + estimar(x).toFixed(0) + ' |');
    }
    linhas.push('| **Passo a passo (1 a 7)** | **' + toques + '** (' + nosCampos + ') | | | | **' + espera.toFixed(1) + '** | **' + pessoa.toFixed(0) + '** |');
    linhas.push('| Com o cadastro | ' + (toques + cadastro.toques) + ' (' + (nosCampos + cadastro.campos) + ') | | | | | ' + (pessoa + estimar(cadastro)).toFixed(0) + ' |');
    linhas.push('\nA TV de mentira mostrou o texto digitado: ' + (r.naTv ? 'sim' : 'NÃO') + (r.erros.length ? ' · erros na página: ' + r.erros.join(' | ') : ' · nenhum erro na página'));
    json.push({ tamanho: r.tam.id, toques, toquesNoCampo: nosCampos, esperaS: +espera.toFixed(1), pessoaS: +pessoa.toFixed(0),
      comCadastro: { toques: toques + cadastro.toques, pessoaS: +(pessoa + estimar(cadastro)).toFixed(0) }, naTv: r.naTv, erros: r.erros,
      passos: r.passos.map((x) => ({ id: x.id, toques: x.toques, noCampo: x.campos, decisoes: x.decisoes, palavras: x.palavras, letras: x.letras, esperaMs: x.espera, pessoaS: +estimar(x).toFixed(1), acoes: x.acoes })) });
  }
  fs.writeFileSync(path.join(SAIDA, 'resultado.json'), JSON.stringify(json, null, 2));
  console.log(linhas.join('\n'));
  const falhou = json.some((j) => !j.naTv || j.toques > 15 || j.pessoaS > 300);
  process.exit(falhou ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
