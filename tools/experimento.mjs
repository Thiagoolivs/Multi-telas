/*
 * tools/experimento.mjs — o experimento do PLANO §4.4.
 *
 * Os 20 pedidos de tools/banco-avaliacao.json, cada um por até 4 motores:
 *
 *   atual        o de hoje: o diretor (server/ai-director.js) posicionando
 *                texto por coordenadas, no modelo padrão
 *   html-gemini  o motor HTML (server/compositor.js) no Gemini
 *   html-sonnet  … no claude-sonnet-5-5
 *   html-opus    … no claude-opus-5-5
 *
 * Uma peça por pedido, que precisa servir em 16:9 e 9:16 (o motor HTML faz
 * as duas com uma peça só; o atual faz uma composição por formato). Os
 * casos marcados com "tela" rodam também como tela completa.
 *
 * A MESMA FOTO vai para todos os motores: gerada uma vez por pedido e
 * guardada em pecas-ouro/fotos/experimento/. A nota mede o layout, não a
 * sorte da imagem.
 *
 * Mede, por peça: tokens reais e custo (server/motores.js), tempo, e se
 * passou na porta de primeira. O resultado é um JSON que a página de nota
 * às cegas (/experimento.html) abre.
 *
 *   node tools/experimento.mjs --simular             custo zero, sem rede: confere o caminho
 *   node tools/experimento.mjs                       os 20 × 4, de verdade (gasta)
 *   node tools/experimento.mjs --motores=html-sonnet --pedidos=3,7
 *
 * Chaves: GEMINI_API_KEY e ANTHROPIC_API_KEY no ambiente.
 */
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const SIMULAR = !!args.simular;
if (SIMULAR) process.env.AI_PROVIDER = 'dev';

const banco = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tools', 'banco-avaliacao.json'), 'utf8'));
const P = require(path.join(RAIZ, 'js', 'peca-html.js'));
const motores = require(path.join(RAIZ, 'server', 'motores.js'));
const compositor = require(path.join(RAIZ, 'server', 'compositor.js'));
const ai = require(path.join(RAIZ, 'server', 'ai.js'));
const director = require(path.join(RAIZ, 'server', 'ai-director.js'));
const templates = require(path.join(RAIZ, 'js', 'templates.js'));

export const MOTORES_EXP = {
  atual: { rotulo: 'Atual (coordenadas)' },
  'html-gemini': { rotulo: 'HTML + Gemini', motor: 'gemini' },
  'html-sonnet': { rotulo: 'HTML + Sonnet', motor: 'claude-sonnet' },
  'html-opus': { rotulo: 'HTML + Opus', motor: 'claude-opus' },
};

const escolhidos = (args.motores ? String(args.motores).split(',') : Object.keys(MOTORES_EXP)).filter((m) => MOTORES_EXP[m]);
const numeros = args.pedidos ? String(args.pedidos).split(',').map(Number) : null;
const pedidos = banco.pedidos.filter((p) => !numeros || numeros.includes(p.n));

/* ---------------- A foto, uma vez por pedido ---------------- */

/*
 * A simulação guarda o marcador (o SVG cinza do modo dev) numa pasta própria.
 * Na mesma pasta, a rodada de verdade achava o marcador "já gerado" e o usava
 * como foto — foi o que aconteceu na primeira rodada real, em 20/10.
 */
const PASTA_FOTOS = path.join(RAIZ, 'pecas-ouro', 'fotos', 'experimento', ...(SIMULAR ? ['simulado'] : []));
const URL_FOTOS = '/pecas-ouro/fotos/experimento/' + (SIMULAR ? 'simulado/' : '');
const FOTO_ACERVO_OTICA = '/pecas-ouro/fotos/otica-sol.jpg';

async function fotoDo(pedido) {
  if (pedido.foto === 'acervo') {
    // O acervo de verdade só existe para a ótica; os outros ficam sem foto (e o resultado diz).
    return pedido.empresa === 'Ótica Central' ? FOTO_ACERVO_OTICA : null;
  }
  if (pedido.foto !== 'gerar') return null;
  fs.mkdirSync(PASTA_FOTOS, { recursive: true });
  // Foto de verdade nunca é SVG: um SVG aqui é marcador que sobrou e não serve.
  const ja = fs.readdirSync(PASTA_FOTOS).find((f) => f.startsWith(pedido.id + '.') && (SIMULAR || !f.endsWith('.svg')));
  if (ja) return URL_FOTOS + ja;
  const img = await ai.generateImage('Foto publicitária para TV de loja: ' + pedido.pedido + '. ' + pedido.empresa + ', sem texto na imagem.', { formato: '16/9' });
  if (!SIMULAR && /svg/.test(img.mime)) throw new Error('veio o marcador do modo dev, não uma foto (confira GEMINI_API_KEY e AI_PROVIDER)');
  const ext = /svg/.test(img.mime) ? 'svg' : /png/.test(img.mime) ? 'png' : 'jpg';
  fs.writeFileSync(path.join(PASTA_FOTOS, pedido.id + '.' + ext), Buffer.from(img.data, 'base64'));
  return URL_FOTOS + pedido.id + '.' + ext;
}

/* ---------------- Simulação (custo zero) ---------------- */

/*
 * Sem rede, o motor HTML vira uma peça da biblioteca da mesma família com
 * o pedido no título — o bastante para conferir o caminho inteiro e a
 * página de notas, nunca para dar nota.
 */
function simularPeca(pedido, papel, foto, motor) {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', 'manifesto.json'), 'utf8'));
  const familia = pedido.familia.split(' ')[0];
  const candidatas = m.pecas.filter((p) => p.papeis.includes(papel));
  const def = candidatas.find((p) => p.familia === familia && (!foto || /foto/.test(p.id))) || candidatas.find((p) => p.familia === familia) || candidatas[0];
  const h = P.higienizar(P.doArquivo(fs.readFileSync(path.join(RAIZ, 'pecas-ouro', def.id + '.html'), 'utf8')));
  const campos = Object.assign({}, def.campos || {});
  if (h.campos.some((c) => c.nome === 'titulo')) campos.titulo = pedido.pedido.slice(0, 28);
  if (foto && h.campos.some((c) => c.nome === 'foto')) campos.foto = foto;
  return {
    ok: true, item: { type: 'peca-html', versao: 1, papel, html: h.html, css: h.css, campos, modo: 'escuro', duracao: 12, origem: { motor, simulado: def.id } },
    tentativas: 1, passouDePrimeira: true, problemas: [],
    uso: { chamadas: 0, entrada: 0, saida: 0, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelo: 'simulado' }, ms: 0,
  };
}

/* ---------------- Cada motor ---------------- */

async function rodarHtml(pedido, motorExp, foto, empresa) {
  const motor = MOTORES_EXP[motorExp].motor;
  const base = { pedido: pedido.pedido, empresa: pedido.empresa, segmento: empresa.segmento, marca: empresa.marca, foto, motor };
  if (SIMULAR) {
    const tela = pedido.tela ? Object.fromEntries(['cabecalho', 'destaque', 'lateral', 'rodape'].map((z) => [z, simularPeca(pedido, z, z === 'destaque' ? foto : null, motorExp)])) : null;
    return { peca: simularPeca(pedido, 'destaque', foto, motorExp), tela };
  }
  const peca = await compositor.comporPeca(base);
  const out = { peca };
  if (pedido.tela) {
    out.tela = await compositor.comporTela(base);
  }
  return out;
}

async function rodarAtual(pedido, foto, empresa) {
  const t0 = Date.now();
  const r = await motores.medir(async () => {
    const campanha = await director.dirigir(pedido.pedido, {
      empresa: pedido.empresa, segmento: empresa.segmento, brand: empresa.marca.cores[0],
      pedido: { formatos: ['16/9', '9/16'], quantidade: 2, imagens: foto ? 'gerar' : 'nenhuma' },
    }, { onImagem: async () => foto });
    let tela = null;
    if (pedido.tela) {
      const layout = templates.getLayout('corporate');
      tela = await ai.generateCampaign({ objetivo: pedido.pedido, oferta: pedido.pedido }, { empresa: pedido.empresa, zones: layout.zones });
    }
    return { campanha, tela, medido: motores.consumirMedicao() };
  });
  const porFormato = {};
  for (const p of r.campanha.pecas || []) if (!porFormato[p.formato]) porFormato[p.formato] = p.item;
  return {
    peca: {
      ok: !!(porFormato['16/9'] || porFormato['9/16']),
      itens: porFormato, tentativas: 1, passouDePrimeira: true, problemas: [],
      uso: Object.assign({ modelo: r.medido.modelos }, r.medido), ms: Date.now() - t0,
    },
    tela: r.tela,
  };
}

/* ---------------- O experimento ---------------- */

async function main() {
  const resultado = {
    criadoEm: new Date().toISOString(), simulado: SIMULAR,
    motores: Object.fromEntries(escolhidos.map((m) => [m, MOTORES_EXP[m].rotulo])),
    pedidos: pedidos.map((p) => ({ n: p.n, id: p.id, empresa: p.empresa, pedido: p.pedido, familia: p.familia, foto: p.foto, tela: !!p.tela })),
    marcas: banco.empresas,
    pecas: [],
  };
  for (const pedido of pedidos) {
    const empresa = banco.empresas[pedido.empresa];
    let foto = null;
    try { foto = await fotoDo(pedido); } catch (e) { console.warn('foto do pedido', pedido.n, 'falhou:', e.message); }
    for (const motorExp of escolhidos) {
      process.stdout.write(`#${String(pedido.n).padStart(2)} ${motorExp.padEnd(12)} `);
      const linha = { chave: crypto.randomBytes(6).toString('hex'), n: pedido.n, motor: motorExp, foto, marca: empresa.marca };
      try {
        const r = motorExp === 'atual' ? await rodarAtual(pedido, foto, empresa) : await rodarHtml(pedido, motorExp, foto, empresa);
        Object.assign(linha, r);
        const u = r.peca.uso || {};
        console.log(r.peca.ok ? 'ok' : 'RECUSADA', `· ${r.peca.tentativas} tentativa(s) · ${u.entrada || 0}+${u.saida || 0} tokens · R$ ${((u.custoCentavos || 0) / 100).toFixed(3)} · ${((r.peca.ms || 0) / 1000).toFixed(1)}s`);
      } catch (e) {
        linha.erro = e.message;
        console.log('ERRO', e.message);
      }
      resultado.pecas.push(linha);
    }
  }
  const dir = path.join(RAIZ, 'experimento');
  fs.mkdirSync(dir, { recursive: true });
  const nome = args.saida || ('resultados-' + resultado.criadoEm.replace(/[:.]/g, '-').slice(0, 19) + (SIMULAR ? '-simulado' : '') + '.json');
  const arquivo = path.isAbsolute(nome) ? nome : path.join(dir, nome);
  fs.writeFileSync(arquivo, JSON.stringify(resultado, null, 1));
  console.log('\nResultado:', path.relative(RAIZ, arquivo));
  console.log('Abra /experimento.html e carregue este arquivo para dar as notas às cegas.');
  return resultado;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
export { main };
