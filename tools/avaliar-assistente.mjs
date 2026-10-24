#!/usr/bin/env node
/*
 * tools/avaliar-assistente.mjs — a IA do Criar entende o pedido? (dono, 24/10)
 *
 * Roda as conversas de tools/casos-assistente.json, fala por fala, e confere
 * a ÚLTIMA volta: a intenção (quiz, aviso, aparência da TV, campanha, editar,
 * dúvida, perguntar), a zona, a quantidade, a TV, e os assuntos que não podem
 * aparecer (o roteiro que pergunta de Instagram num pedido de quiz).
 *
 *   node tools/avaliar-assistente.mjs --sistema=atual   o Criar de hoje (server/ai-conversa.js)
 *   node tools/avaliar-assistente.mjs --sistema=novo    o assistente com ferramentas (server/assistente.js)
 *   --ia   usa a IA de verdade (GASTA: só texto, ~1 chamada por fala). Sem isto, modo sem IA.
 *   --so=id1,id2   só esses casos
 *
 * Escreve docs/AVALIACAO-ASSISTENTE-<sistema>-<ia|sem-ia>.md e mostra a nota.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v === undefined ? true : v]; }));
const sistema = args.sistema === 'novo' ? 'novo' : 'atual';
const comIA = !!args.ia;
// A IA só entra quando pedida: sem --ia é o modo sem IA, mesmo com a chave no ambiente.
process.env.AI_PROVIDER = comIA ? (process.env.AI_PROVIDER_AVALIACAO || 'gemini') : 'dev';

const casos = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tools', 'casos-assistente.json'), 'utf8'));
const so = args.so ? String(args.so).split(',') : null;
const motores = require(path.join(RAIZ, 'server', 'motores.js'));

const TVS = casos.tvs.map((nome, i) => ({ id: 'tv' + (i + 1), nome, layout: 'corporate' }));
const CTX = {
  hoje: '2026-10-24', diaSemana: 'sábado', empresa: 'Padaria do Bairro', segmento: 'padaria', perfil: 'comercio',
  telas: TVS, marca: { bases: [] }, memoria: null,
};
const sem = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* ---------------- os dois sistemas, devolvendo o mesmo formato ---------------- */

// O Criar de hoje: só sabe campanha/peça/aviso/dúvida, e o escopo.
async function voltaAtual(mensagens, estado) {
  const conversa = require(path.join(RAIZ, 'server', 'ai-conversa.js'));
  const E = require(path.join(RAIZ, 'js', 'escopo.js'));
  const r = await conversa.conversar({ mensagens, escopo: estado.escopo, decisoes: estado.decisoes, ctx: CTX });
  estado.escopo = r.escopo; estado.decisoes = r.decisoes;
  const zonasComPeca = new Set();
  (r.escopo && r.escopo.telas || []).forEach((t) => E.ZONAS.forEach((z) => { if (t.zonas[z].pecas > 0) zonasComPeca.add(z); }));
  const intencao = r.tipo === 'duvida' ? 'duvida' : r.tipo === 'aviso' ? 'aviso' : r.modo === 'falha' ? 'falha' : 'campanha';
  return { intencao, resposta: r.resposta, zonas: [...zonasComPeca], quantidade: null, tv: null, gerar: !!r.gerar, falha: r.modo === 'falha', modo: r.modo };
}

// O assistente novo: o maestro diz a ferramenta e os argumentos; a mensagem da IA guarda a tarefa em andamento.
async function voltaNovo(mensagens, estado) {
  const assistente = require(path.join(RAIZ, 'server', 'assistente.js'));
  const E = require(path.join(RAIZ, 'js', 'escopo.js'));
  const r = await assistente.responder({ mensagens, escopo: estado.escopo, decisoes: estado.decisoes, ctx: CTX });
  estado.escopo = r.escopo; estado.decisoes = r.decisoes;
  const a = r.acao || {};
  let zonas = a.zona ? [a.zona] : [];
  if (r.intencao === 'campanha') {
    const z = new Set();
    (r.escopo && r.escopo.telas || []).forEach((t) => E.ZONAS.forEach((n) => { if (t.zonas[n].pecas > 0) z.add(n); }));
    zonas = [...z];
  }
  return {
    intencao: r.modo === 'falha' ? 'falha' : r.intencao, resposta: r.resposta, zonas, mensagem: r.mensagem,
    quantidade: a.quantidade != null ? a.quantidade : null, tv: a.tv ? a.tv.nome || a.tv : (r.args && r.args.tv) || null, gerar: !!r.gerar, falha: !!r.falha,
    modo: r.modo,
  };
}

/* ---------------- a nota ---------------- */

function conferir(caso, saida) {
  const falhas = [];
  const certas = [caso.intencao].concat(caso.aceita || []);
  if (!certas.includes(saida.intencao)) falhas.push('intenção ' + saida.intencao + ' (esperada ' + certas.join('/') + ')');
  if (caso.zona && saida.intencao === caso.intencao) {
    const zonas = saida.zonas || [];
    if (!(zonas.length === 1 && zonas[0] === caso.zona)) falhas.push('zona ' + (zonas.join('+') || 'nenhuma') + ' (esperada só ' + caso.zona + ')');
  }
  if (caso.quantidade && saida.intencao === caso.intencao && Number(saida.quantidade) !== caso.quantidade) falhas.push('quantidade ' + saida.quantidade + ' (esperada ' + caso.quantidade + ')');
  if (caso.tv && saida.intencao === caso.intencao && sem(saida.tv) !== sem(caso.tv)) falhas.push('TV "' + (saida.tv || '') + '" (esperada ' + caso.tv + ')');
  for (const s of caso.sem || []) if (sem(saida.resposta).includes(sem(s))) falhas.push('falou de "' + s + '"');
  if (caso.gerar === false && saida.gerar) falhas.push('mandou gerar');
  return falhas;
}

const lista = casos.casos.filter((c) => !so || so.includes(c.id));
const resultados = [];
let custo = 0;
for (const caso of lista) {
  const estado = { escopo: null, decisoes: [], assistente: null };
  const mensagens = [];
  const modos = [];   // quem decidiu cada volta: a IA (gemini, claude...), a regra (a IA caiu) ou dev (sem IA)
  let saida = null;
  try {
    for (const fala of caso.falas) {
      mensagens.push({ papel: 'pessoa', texto: fala });
      const medicao = await new Promise((resolve, reject) => motores.medir(async () => {
        try { const s = await (sistema === 'novo' ? voltaNovo : voltaAtual)(mensagens.slice(), estado); resolve({ s, m: motores.consumirMedicao() }); } catch (e) { reject(e); }
      }));
      saida = medicao.s;
      custo += medicao.m.custoCentavos;
      modos.push(saida.modo || '?');
      mensagens.push(saida.mensagem || { papel: 'ia', texto: saida.resposta });
    }
  } catch (e) {
    saida = { intencao: 'erro', resposta: String(e && e.message || e), zonas: [] };
  }
  const falhas = conferir(caso, saida);
  resultados.push({ caso, saida, falhas, modos });
  process.stdout.write((falhas.length ? '✖ ' : '✔ ') + caso.id + (falhas.length ? ' — ' + falhas.join('; ') : '') + '\n');
}

const acertos = resultados.filter((r) => !r.falhas.length).length;
const nota = Math.round((acertos / Math.max(1, resultados.length)) * 100);
const voltas = resultados.flatMap((r) => r.modos || []);
const daIA = voltas.filter((m) => !['dev', 'regra', 'falha', '?'].includes(m)).length;
const linha = (s) => String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 160);
const md = [
  '# Avaliação do assistente do Criar — ' + sistema + (comIA ? ' (IA de verdade)' : ' (sem IA)'),
  '',
  'Gerado por `node tools/avaliar-assistente.mjs --sistema=' + sistema + (comIA ? ' --ia' : '') + '` em ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + '. **Não editar à mão.**',
  '',
  '**Nota: ' + acertos + ' de ' + resultados.length + ' (' + nota + '%)**' + (comIA ? ' · custo da IA: R$ ' + (custo / 100).toFixed(2) : ''),
  '',
  'Quem decidiu: a IA em ' + daIA + ' de ' + voltas.length + ' voltas' + (daIA < voltas.length ? ' (as outras, pelas regras: ' + voltas.filter((m) => ['dev', 'regra', 'falha', '?'].includes(m)).join(', ') + ')' : '') + '.',
  '',
  '| caso | intenção | quem decidiu | resposta da última volta | o que falhou |',
  '|---|---|---|---|---|',
  ...resultados.map((r) => '| ' + r.caso.id + ' | ' + r.saida.intencao + ' | ' + (r.modos || []).join(' → ') + ' | ' + linha(r.saida.resposta) + ' | ' + (r.falhas.length ? linha(r.falhas.join('; ')) : '—') + ' |'),
  '',
].join('\n');
const arquivo = path.join(RAIZ, 'docs', 'AVALIACAO-ASSISTENTE-' + sistema + '-' + (comIA ? 'ia' : 'sem-ia') + '.md');
fs.writeFileSync(arquivo, md);
console.log('\nNota: ' + acertos + '/' + resultados.length + ' (' + nota + '%) · IA decidiu ' + daIA + '/' + voltas.length + ' voltas' + (comIA ? ' · custo R$ ' + (custo / 100).toFixed(2) : '') + ' → ' + path.relative(RAIZ, arquivo));
