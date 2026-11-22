'use strict';
/*
 * A planilha local (Excel ou CSV) → PUT /api/v1/planilhas/:chave, em CSV.
 *
 * Só sobe quando o conteúdo muda (sha256 do CSV gerado), e mais uma vez a
 * cada vez que o conector liga — o servidor não tem como dizer o que tem, e
 * reenviar uma planilha pequena é barato. Enquanto o Excel está salvando
 * (arquivo mexido há menos de N segundos, ou ZIP incompleto), espera: subir
 * meia planilha apagaria metade do cardápio da TV.
 */
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { lerXlsx, paraCsv, decodificar } = require('./xlsx');
const { registrarErro, fonte } = require('./estado');
const { ErroDoServidor, TokenRevogado, SemConexao } = require('./rede');
const { explicarErroDeArquivo } = require('./pastas');

const MAX_BYTES = 50 * 1024 * 1024;

async function planilhaComoCsv(caminho) {
  const ext = path.extname(caminho).toLowerCase();
  if (ext === '.xls') throw new Error('é uma planilha .xls antiga: no Excel, salve como .xlsx (Pasta de Trabalho do Excel) ou CSV');
  if (ext !== '.xlsx' && ext !== '.csv') throw new Error('só leio .xlsx ou .csv (veio "' + ext + '")');
  const st = await fsp.stat(caminho);
  if (!st.isFile()) throw new Error('"' + caminho + '" não é um arquivo');
  if (st.size > MAX_BYTES) throw new Error('a planilha tem mais de 50 MB');
  const bytes = await fsp.readFile(caminho);
  if (ext === '.xlsx') {
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('o arquivo é um .xls antigo com nome de .xlsx: salve de novo como .xlsx');
    const linhas = lerXlsx(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length));
    return { csv: paraCsv(linhas), linhas: linhas.length, st };
  }
  const texto = decodificar(bytes);
  // CSV já é CSV: só vira UTF-8 (o Excel brasileiro salva em Windows-1252).
  return { csv: texto, linhas: texto.split(/\r?\n/).filter((l) => l.trim()).length, st };
}

async function sincronizarPlanilha(ctx, planilha) {
  const { api, estado, log, cfg } = ctx;
  const agora = ctx.agora ? ctx.agora() : Date.now();
  const id = 'planilha:' + planilha.chave;
  const rotulo = 'Planilha "' + (planilha.nome || planilha.chave) + '"';
  const est = estado.planilhas[planilha.chave] || (estado.planilhas[planilha.chave] = {});
  const f = fonte(estado, id, { tipo: 'planilha', chave: planilha.chave, nome: planilha.nome || planilha.chave, origem: planilha.caminho, ultimaTentativa: agora });
  const resumo = { enviada: false, linhas: 0, fila: [], erros: [] };

  let lida;
  try {
    const st = await fsp.stat(planilha.caminho);
    if (agora - st.mtimeMs < cfg.segundosParaEstabilizar * 1000) {
      resumo.fila.push({ nome: path.basename(planilha.caminho), motivo: 'acabou de ser salva; espero o Excel terminar' });
      return resumo;
    }
    lida = await planilhaComoCsv(planilha.caminho);
  } catch (e) {
    const msg = e.code ? explicarErroDeArquivo(e, planilha.caminho) : e.message;
    log.umaVez(id + '|erro|' + msg, 'erro', rotulo + ': ' + msg + '. A planilha que está na TV continua a mesma.');
    registrarErro(estado, id, msg, agora);
    f.ultimoErro = msg;
    resumo.erros.push(msg);
    return resumo;
  }
  log.esquecer(id + '|erro');
  resumo.linhas = lida.linhas;
  const sha = crypto.createHash('sha256').update(lida.csv).digest('hex');
  const jaFoi = est.sha256 === sha && ctx.enviadasNesteProcesso && ctx.enviadasNesteProcesso.has(planilha.chave);
  if (jaFoi) {
    f.ultimaSincronizacao = agora;
    f.ultimoErro = '';
    return resumo;
  }
  if (ctx.simular) { resumo.enviada = est.sha256 !== sha; return resumo; }
  try {
    await api.enviarPlanilha(planilha.chave, lida.csv);
  } catch (e) {
    if (e instanceof TokenRevogado || e instanceof SemConexao) throw e;
    const msg = e instanceof ErroDoServidor ? e.message + ' (' + e.status + ')' : e.message;
    log.erro(rotulo + ': o envio falhou: ' + msg + '.');
    registrarErro(estado, id, msg, agora);
    f.ultimoErro = msg;
    resumo.erros.push(msg);
    return resumo;
  }
  if (est.sha256 !== sha) log.info(rotulo + ': enviada (' + lida.linhas + ' linha(s)).');
  est.sha256 = sha;
  est.enviadaEm = agora;
  if (ctx.enviadasNesteProcesso) ctx.enviadasNesteProcesso.add(planilha.chave);
  resumo.enviada = true;
  f.ultimaSincronizacao = agora;
  f.ultimoErro = '';
  f.ultimoResumo = lida.linhas + ' linha(s)';
  return resumo;
}

module.exports = { planilhaComoCsv, sincronizarPlanilha };
