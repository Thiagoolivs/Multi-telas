/*
 * tools/eval.mjs — a mesma pergunta, sempre, para o número significar algo.
 *
 * Isto NÃO é teste, e a diferença muda como se usa. Teste pergunta "quebrou?"
 * e responde passa/falha. Eval pergunta "melhorou ou piorou?" e responde com
 * uma nota comparável à de ontem. Teste bloqueia o merge; eval informa a
 * decisão.
 *
 * O motivo de existir: o prompt vai mudar. Você vê a primeira peça gerada,
 * ajusta a direção de arte, e ela melhora PARA AQUELE CASO. Para os outros
 * nove, você não sabe — e descobre pelo cliente. Com dez entradas fixas e as
 * mesmas conferências, o ajuste vira medida.
 *
 * ENTRADAS FIXAS é o ponto inteiro. Muda o prompt, não muda a entrada: senão
 * não há comparação, há duas execuções diferentes.
 *
 * Roda em MODO DEV, sem chave e sem rede — custo zero, e por isso pode rodar
 * a cada commit. Modo dev não testa o prompt; testa TUDO O QUE VEM DEPOIS
 * dele: o corte de peças pelo teto, o formato pedido, o "sem foto", o layout,
 * o custo prometido. Que é exatamente onde os três defeitos desta semana
 * moraram.
 *
 *   node tools/eval.mjs            → tabela no terminal, grava docs/EVAL.md
 *   node tools/eval.mjs --json     → só o JSON, para script
 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

process.env.AI_PROVIDER = 'dev'; // custo zero, e determinístico o bastante
const director = require(path.join(RAIZ, 'server', 'ai-director.js'));
const ds = require(path.join(RAIZ, 'server', 'design-system.js'));
const fm = require(path.join(RAIZ, 'server', 'font-metrics.js'));
const cor = require(path.join(RAIZ, 'js', 'cor.js'));

/*
 * A clientela real: padaria, ótica, RH, aviso operacional. Não são casos
 * bonitos — são os pedidos de uma frase que chegam de verdade, com a
 * imprecisão que eles têm.
 */
const CASOS = [
  { id: 'padaria-promo', brief: 'promoção de café da manhã, pão na chapa e café por 9 reais',
    ctx: { empresa: 'Padaria do Bairro', segmento: 'padaria' },
    pedido: { formatos: ['16/9'], quantidade: 2, imagens: 'gerar' } },
  { id: 'padaria-feriado', brief: 'fechado no feriado de quinta',
    ctx: { empresa: 'Padaria do Bairro', segmento: 'padaria' },
    pedido: { formatos: ['16/9'], quantidade: 1, imagens: 'nenhuma' } },
  { id: 'otica-desconto', brief: 'óculos de sol com 30% de desconto até sábado',
    ctx: { empresa: 'Ótica Central', segmento: 'ótica' },
    pedido: { formatos: ['16/9', '1/1'], quantidade: 4, imagens: 'gerar' } },
  { id: 'otica-consulta', brief: 'consulta de vista grátis para quem comprar armação',
    ctx: { empresa: 'Ótica Central', segmento: 'ótica' },
    pedido: { formatos: ['9/16'], quantidade: 2, imagens: 'acervo' } },
  { id: 'rh-aniversario', brief: 'feliz aniversário, João',
    ctx: { empresa: 'Metalúrgica Sul', segmento: 'indústria' },
    pedido: { formatos: ['16/9'], quantidade: 1, imagens: 'nenhuma' } },
  { id: 'rh-vaga', brief: 'estamos contratando atendente de balcão',
    ctx: { empresa: 'Padaria do Bairro', segmento: 'padaria' },
    pedido: { formatos: ['16/9', '9/16'], quantidade: 2, imagens: 'gerar' } },
  { id: 'aviso-piso', brief: 'cuidado, piso molhado',
    ctx: { empresa: 'Supermercado Ponto', segmento: 'varejo' },
    pedido: { formatos: ['16/9'], quantidade: 1, imagens: 'nenhuma' } },
  { id: 'aviso-epi', brief: 'uso de EPI obrigatório nesta área',
    ctx: { empresa: 'Metalúrgica Sul', segmento: 'indústria' },
    pedido: { formatos: ['9/16'], quantidade: 1, imagens: 'nenhuma' } },
  // Sem pedido nenhum: o caso que gerava seis peças em três formatos.
  { id: 'sem-pedido', brief: 'novidade no cardápio',
    ctx: { empresa: 'Padaria do Bairro', segmento: 'padaria' }, pedido: null },
  // Texto longo: o que estoura caixa quando a medição está errada.
  { id: 'texto-longo', brief: 'venha conhecer nossa linha completa de armações importadas com garantia estendida de dois anos',
    ctx: { empresa: 'Ótica Central', segmento: 'ótica' },
    pedido: { formatos: ['16/9'], quantidade: 2, imagens: 'gerar' } },
];

/* ---------------- As conferências ---------------- */

/*
 * Cada uma nasceu de um defeito real. O nome diz o que se perde quando ela
 * falha — "teto" não diz nada; "gerou mais peça do que pediram" diz.
 */
const CONFERENCIAS = [
  {
    id: 'teto',
    o_que: 'não gera mais peça do que pediram',
    ver: (r, caso) => {
      const teto = caso.pedido && caso.pedido.quantidade;
      if (!teto) return null; // sem pedido não há teto a conferir
      return r.pecas.length <= teto ? null : `${r.pecas.length} peças para um teto de ${teto}`;
    },
  },
  {
    id: 'formato',
    o_que: 'não inventa formato que ninguém pediu',
    ver: (r, caso) => {
      const ok = caso.pedido && caso.pedido.formatos;
      if (!ok || !ok.length) return null;
      const fora = [...new Set(r.pecas.map((p) => p.formato).filter((f) => !ok.includes(f)))];
      return fora.length ? 'apareceu ' + fora.join(', ') : null;
    },
  },
  {
    id: 'formato-entregue',
    o_que: 'entrega TODOS os formatos que foram pedidos',
    ver: (r, caso) => {
      const querem = (caso.pedido && caso.pedido.formatos) || [];
      // Só faz sentido cobrar se há peça suficiente para cobrir os formatos.
      if (querem.length < 2 || r.pecas.length < querem.length) return null;
      const entregues = new Set(r.pecas.map((p) => p.formato));
      const faltam = querem.filter((f) => !entregues.has(f));
      return faltam.length ? 'não veio nenhuma peça em ' + faltam.join(', ') : null;
    },
  },
  {
    id: 'sem-foto',
    o_que: 'respeita "sem foto"',
    ver: (r, caso) => {
      if (!caso.pedido || caso.pedido.imagens !== 'nenhuma') return null;
      return r.imagensGeradas === 0 ? null : `gerou ${r.imagensGeradas} imagem(ns) num pedido sem foto`;
    },
  },
  {
    id: 'dentro-da-peca',
    o_que: 'nenhum elemento nasce fora da peça',
    ver: (r) => {
      const fora = [];
      for (const p of r.pecas) {
        for (const e of (p.item.elementos || [])) {
          // Sangra de propósito é permitida até 10% — decor e display cortados
          // nas bordas são decisão de arte, não defeito.
          if (e.y < -12 || e.y + e.h > 112 || e.x < -12 || e.x + e.w > 112) {
            fora.push(`${p.formato}:${e.papel || e.tipo}`);
          }
        }
      }
      return fora.length ? fora.slice(0, 3).join(', ') : null;
    },
  },
  {
    id: 'texto-cabe',
    o_que: 'todo texto cabe na própria caixa',
    ver: (r) => {
      const maus = [];
      for (const p of r.pecas) {
        for (const e of (p.item.elementos || [])) {
          if (e.tipo !== 'texto' || !e.text) continue;
          try {
            const m = fm.cabeNaCaixaReal(e.text, { w: e.w, h: e.h }, e.tamanho, p.formato, e.fonte, e.peso, e.italico);
            if (!m.cabe) maus.push(`${p.formato}:${e.papel || 'texto'}`);
          } catch (_) { /* sem métrica não é falha do plano */ }
        }
      }
      return maus.length ? maus.slice(0, 3).join(', ') : null;
    },
  },
  {
    id: 'manchete-unica',
    o_que: 'não repete a mesma manchete no mesmo formato',
    ver: (r) => {
      const vistas = new Set();
      const repetidas = [];
      for (const p of r.pecas) {
        const titulo = (p.item.elementos || []).find((e) => e.papel === 'headline' || e.papel === 'display');
        if (!titulo || !titulo.text) continue;
        const chave = p.formato + '|' + titulo.text.toLowerCase().trim();
        if (vistas.has(chave)) repetidas.push(titulo.text.slice(0, 30));
        vistas.add(chave);
      }
      return repetidas.length ? repetidas.slice(0, 2).join(' / ') : null;
    },
  },
  {
    id: 'contraste',
    o_que: 'o texto se lê sobre o fundo',
    ver: (r) => {
      const fundo = (r.paleta && r.paleta.bg) || '#000000';
      const fracos = [];
      for (const p of r.pecas) {
        // Peça com foto atrás não dá para medir por cor chapada: a foto manda.
        if (p.item.bg && p.item.bg.kind === 'imagem') continue;
        for (const e of (p.item.elementos || [])) {
          if (e.tipo !== 'texto' || !e.cor) continue;
          try {
            if (cor.contraste(e.cor, fundo) < 3) fracos.push(`${p.formato}:${e.papel}`);
          } catch (_) { /* cor em formato estranho não é falha do plano */ }
        }
      }
      return fracos.length ? fracos.slice(0, 3).join(', ') : null;
    },
  },
  {
    id: 'custo-previsto',
    o_que: 'cobra o que a confirmação prometeu',
    ver: (r, caso, previsto) => {
      if (previsto == null) return null;
      return r.imagensGeradas === previsto ? null
        : `prometeu ${previsto} crédito(s) e gastou ${r.imagensGeradas}`;
    },
  },
];

/* ---------------- Execução ---------------- */

async function rodarCaso(caso) {
  const ctx = { ...caso.ctx, pedido: caso.pedido };
  let gerou = 0;

  /*
   * Primeiro o PLANO, que é o que a tela de confirmação mostra ao cliente.
   * Guardar o número prometido aqui é o que permite conferir, no fim, se a
   * execução cobrou o que foi prometido — o defeito mais caro possível é a
   * conta não bater com o que a pessoa aprovou.
   */
  let previsto = null;
  try {
    const p = await director.dirigir(caso.brief, ctx, { pararNoPlano: true });
    previsto = p.orcamento.creditos;
  } catch (_) { /* segue: o caso ainda vale pela execução */ }

  const r = await director.dirigir(caso.brief, ctx, {
    onImagem: async () => { gerou++; return '/media/eval.jpg'; },
  });

  const falhas = [];
  for (const c of CONFERENCIAS) {
    let motivo;
    try { motivo = c.ver(r, caso, previsto); }
    catch (e) { motivo = 'a conferência estourou: ' + e.message; }
    if (motivo) falhas.push({ id: c.id, o_que: c.o_que, motivo });
  }
  return { id: caso.id, pecas: r.pecas.length, creditos: r.imagensGeradas, previsto, falhas };
}

const soJson = process.argv.includes('--json');
const resultados = [];
for (const caso of CASOS) {
  try { resultados.push(await rodarCaso(caso)); }
  catch (e) { resultados.push({ id: caso.id, erro: e.message, falhas: [{ id: 'estourou', o_que: 'a campanha rodou até o fim', motivo: e.message }] }); }
}

const totalFalhas = resultados.reduce((t, r) => t + r.falhas.length, 0);
const limpos = resultados.filter((r) => !r.falhas.length).length;

if (soJson) {
  console.log(JSON.stringify({ limpos, total: resultados.length, resultados }, null, 1));
} else {
  const VERDE = '\x1b[32m', VERMELHO = '\x1b[31m', CINZA = '\x1b[90m', FIM = '\x1b[0m';
  console.log('\nEval — 10 briefings fixos, modo dev, custo zero\n');
  console.log(CINZA + 'caso'.padEnd(18) + 'peças'.padStart(6) + 'créditos'.padStart(10) + '  situação' + FIM);
  for (const r of resultados) {
    const marca = r.falhas.length ? VERMELHO + '✗' + FIM : VERDE + '✓' + FIM;
    const estado = r.falhas.length ? r.falhas.map((f) => f.o_que).join('; ') : 'ok';
    console.log(marca + ' ' + r.id.padEnd(16) + String(r.pecas ?? '—').padStart(6)
      + String(r.creditos ?? '—').padStart(10) + '  ' + estado);
    for (const f of r.falhas) console.log(CINZA + '    └ ' + f.motivo + FIM);
  }
  console.log('\n' + (totalFalhas ? VERMELHO : VERDE) + limpos + ' de ' + resultados.length
    + ' sem nenhuma falha' + FIM + '\n');
}

/*
 * O histórico versionado é o que faz disto um eval em vez de um script: sem
 * ele, cada execução é um número solto e não há como ver que uma mudança de
 * prompt piorou três casos para melhorar um. O diff aparece no PR.
 */
const md = ['# Eval', '',
  'Gerado por `node tools/eval.mjs`. Modo dev, custo zero. **Não editar à mão.**', '',
  `**${limpos} de ${resultados.length}** casos sem nenhuma falha.`, '',
  '| caso | peças | créditos | falhas |', '|---|---|---|---|',
  ...resultados.map((r) => `| ${r.id} | ${r.pecas ?? '—'} | ${r.creditos ?? '—'} | `
    + (r.falhas.length ? r.falhas.map((f) => f.o_que + ' (' + f.motivo + ')').join('; ') : '—') + ' |'),
  ''].join('\n');
fs.writeFileSync(path.join(RAIZ, 'docs', 'EVAL.md'), md);

process.exit(totalFalhas ? 1 : 0);
