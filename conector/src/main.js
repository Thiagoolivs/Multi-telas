#!/usr/bin/env node
'use strict';
/*
 * MultiTelasConector.exe — os comandos.
 *
 *   (nada) / rodar   roda para sempre (é o que a tarefa do Windows chama)
 *   configurar       perguntas da primeira vez, com teste de conexão
 *   testar           mostra o que sincronizaria, sem enviar nem apagar nada
 *   status           último sincronismo, erros, fila e versão
 *   uma-vez          um ciclo só, e sai (para diagnóstico)
 *   diagnostico      versão do Node, proxy, certificados, conta do Windows
 *   versao / ajuda
 */
const os = require('node:os');
const http = require('node:http');
const tls = require('node:tls');
const versao = require('../package.json').version;
const { pastaBase, caminhos, carregarConfig, ehExecutavel } = require('./config');
const { criarLog } = require('./log');
const { carregarEstado } = require('./estado');
const { criarRede, ambienteDoProxy } = require('./rede');
const { ciclo, rodar, travar, criarSono, MENSAGEM_401, contaAtual } = require('./sincronizar');
const { textoDoStatus } = require('./status');
const { configurar, criarPerguntas } = require('./configurar');
const { criarConversor } = require('./conversor');

const AJUDA = `MultiTelas Conector ${versao}

Uso: MultiTelasConector.exe [comando]

  configurar   pergunta o servidor, o token e os caminhos, e testa a conexão
  testar       mostra o que seria enviado e apagado, sem mexer em nada
  status       último sincronismo de cada fonte, erros, fila e versão
  rodar        sincroniza para sempre (o padrão; é o que a tarefa do Windows usa)
  uma-vez      um ciclo de sincronismo e sai
  diagnostico  Node, proxy, certificados e a conta do Windows em uso
  versao       a versão
  ajuda        esta tela

A configuração fica em conector.json, ao lado do .exe. O token também pode
vir da variável de ambiente MULTITELAS_TOKEN. O log fica em conector.log.`;

function separarArgumentos(argv) {
  const resto = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--pasta') { i++; continue; }
    if (argv[i].startsWith('--pasta=')) continue;
    resto.push(argv[i]);
  }
  return resto;
}

function nomeDoComando(c) {
  const n = String(c || 'rodar').toLowerCase().replace(/^(--|-|\/)/, '');
  const apelidos = { help: 'ajuda', h: 'ajuda', '?': 'ajuda', version: 'versao', v: 'versao', 'versão': 'versao', run: 'rodar', 'uma-vez': 'uma-vez', umavez: 'uma-vez', once: 'uma-vez', 'diagnóstico': 'diagnostico', test: 'testar', config: 'configurar' };
  return apelidos[n] || n;
}

function contexto(base, opcoes, logOpcoes) {
  const c = caminhos(base);
  const log = opcoes.log || criarLog(Object.assign({ arquivo: c.log }, logOpcoes || {}, opcoes.naTela === false ? { naTela: false } : {}));
  return {
    base, caminhos: c, log, versao, maquina: os.hostname(), env: opcoes.env || process.env,
    estado: carregarEstado(c.estado), rede: criarRede(log), fetch: opcoes.fetch, fetchIntranet: opcoes.fetchIntranet,
    esperar: opcoes.esperar, opcoesApi: opcoes.opcoesApi, conversor: opcoes.conversor || criarConversor({ env: opcoes.env || process.env }),
  };
}

function imprimirTeste(escrever, r, ctx) {
  const plano = r.plano;
  escrever('');
  escrever('Servidor: OK — conta "' + ((plano.conta && plano.conta.nome) || '?') + '", integração "' + ((plano.integracao && plano.integracao.nome) || '?') + '", ciclo a cada ' + r.intervalo + ' s.');
  escrever('(Teste: nada foi enviado nem apagado.)');
  const lista = (titulo, itens, max = 15) => {
    if (!itens || !itens.length) return;
    escrever('    ' + titulo + ' (' + itens.length + '):');
    for (const x of itens.slice(0, max)) escrever('      - ' + (typeof x === 'string' ? x : x.nome + ' — ' + x.motivo));
    if (itens.length > max) escrever('      … e mais ' + (itens.length - max));
  };
  for (const p of plano.pastas || []) {
    const s = r.resultados.pastas[p.chave];
    escrever('');
    escrever('  Pasta "' + (p.nome || p.chave) + '" (chave ' + p.chave + ') — ' + (ctx.cfg.pastas[p.chave] || 'SEM CAMINHO no conector.json'));
    if (!s) continue;
    if (s.inacessivel) { escrever('    NÃO ABRE: ' + s.erros[0]); continue; }
    escrever('    ' + s.lidos + ' arquivo(s) aceito(s)' + (s.completa ? '' : ' (leitura incompleta: nada seria apagado)'));
    lista('enviaria', s.enviados);
    lista('apagaria no servidor', s.apagados);
    lista('na fila', s.fila);
    lista('recusados', s.recusados);
    lista('ignorados', s.ignorados, 10);
  }
  for (const p of plano.planilhas || []) {
    const s = r.resultados.planilhas[p.chave];
    escrever('');
    escrever('  Planilha "' + (p.nome || p.chave) + '" (chave ' + p.chave + ') — ' + (ctx.cfg.planilhas[p.chave] || 'SEM CAMINHO no conector.json'));
    if (!s) continue;
    if (s.erros.length) escrever('    ERRO: ' + s.erros[0]);
    else if (s.fila.length) escrever('    ' + s.fila[0].motivo);
    else escrever('    ' + s.linhas + ' linha(s); ' + (s.enviada ? 'enviaria (mudou desde o último envio)' : 'igual à última enviada'));
  }
  for (const f of plano.feeds || []) {
    const s = r.resultados.feeds[f.chave];
    escrever('');
    escrever('  Feed "' + (f.nome || f.chave) + '" (chave ' + f.chave + ') — ' + f.url);
    if (!s) continue;
    if (s.erros.length) { escrever('    ERRO: ' + s.erros[0]); continue; }
    escrever('    ' + s.itens + ' item(ns) no feed');
    lista('enviaria como comunicado', s.salvos);
    lista('tiraria das TVs', s.apagados);
    lista('na fila', s.fila);
  }
}

async function principal(argv = process.argv.slice(2), opcoes = {}) {
  const env = opcoes.env || process.env;
  const base = opcoes.base || pastaBase(argv, env);
  const args = separarArgumentos(argv);
  const comando = nomeDoComando(args[0]);
  const escrever = opcoes.escrever || ((t) => process.stdout.write(t + '\n'));

  if (comando === 'ajuda') { escrever(AJUDA); return 0; }
  if (comando === 'versao') { escrever(versao); return 0; }

  if (comando === 'status') {
    escrever(textoDoStatus({ versao, caminhos: caminhos(base), env }));
    return 0;
  }

  if (comando === 'diagnostico') {
    const c = caminhos(base);
    let cfg = null;
    try { cfg = carregarConfig(base, env).cfg; } catch (e) { escrever('conector.json: ' + e.message); }
    const amb = cfg ? ambienteDoProxy(cfg, env) : null;
    escrever('MultiTelas Conector ' + versao);
    escrever('Node: ' + process.version + (ehExecutavel() ? ' (embutido no .exe)' : ' (' + process.execPath + ')'));
    escrever('Opções do Node: ' + (process.execArgv.join(' ') || '(nenhuma)'));
    escrever('Pasta do conector: ' + c.base);
    escrever('Máquina: ' + os.hostname() + ' · conta: ' + contaAtual());
    escrever('Proxy: ' + (amb ? (amb.HTTPS_PROXY || amb.HTTP_PROXY).replace(/(\/\/[^\s/:@]+:)[^\s/@]+@/, '$1***@') + ' · sem proxy para: ' + amb.NO_PROXY : 'nenhum'));
    escrever('Proxy embutido no Node: ' + (typeof http.setGlobalProxyFromEnv === 'function' ? 'sim' : 'não (use o .exe ou NODE_USE_ENV_PROXY=1)'));
    let sistema = 0;
    try { sistema = tls.getCACertificates ? tls.getCACertificates('system').length : 0; } catch (e) { sistema = 0; }
    escrever('Certificados do Windows em uso: ' + (process.execArgv.includes('--use-system-ca') ? 'sim (' + sistema + ')' : 'não'));
    escrever('NODE_EXTRA_CA_CERTS: ' + (env.NODE_EXTRA_CA_CERTS || '(não definido)'));
    escrever('certificadoCA no conector.json: ' + ((cfg && cfg.certificadoCA) || '(não definido)'));
    return 0;
  }

  if (comando === 'configurar') {
    const ctx = contexto(base, opcoes, { naTela: false });
    const perguntas = opcoes.perguntas || criarPerguntas();
    try {
      const r = await configurar(Object.assign(ctx, { perguntas }));
      return r.salvo ? 0 : 1;
    } finally { if (!opcoes.perguntas) perguntas.fechar(); }
  }

  if (comando === 'testar' || comando === 'uma-vez') {
    const simular = comando === 'testar';
    // O teste só escreve na tela: o log do arquivo é do conector em segundo plano.
    const ctx = contexto(base, opcoes, simular ? { arquivo: null } : {});
    ctx.simular = simular;
    ctx.enviadasNesteProcesso = new Set();
    try {
      const r = await ciclo(ctx);
      if (r.parado) { escrever(MENSAGEM_401); return 2; }
      if (simular) imprimirTeste(escrever, r, ctx);
      else require('./estado').salvarEstado(ctx.caminhos.estado, ctx.estado);
      return 0;
    } catch (e) {
      if (!simular) require('./estado').salvarEstado(ctx.caminhos.estado, ctx.estado);
      if (e.name === 'TokenRevogado') { escrever(MENSAGEM_401); return 2; }
      if (e.name === 'ConfigFaltando') { escrever('Ainda não configurado: rode "MultiTelasConector.exe configurar".'); return 1; }
      escrever('FALHOU: ' + ctx.log.limpar(e.message));
      return 1;
    }
  }

  if (comando === 'rodar') {
    const c = caminhos(base);
    // Clicou duas vezes no .exe sem configurar: em vez de um erro, as perguntas.
    if (!opcoes.semPerguntas && process.stdin.isTTY) {
      let existe = true;
      try { const l = carregarConfig(base, env); existe = l.existe || !!l.cfg.token; } catch (e) { existe = true; }
      if (!existe) {
        escrever('Ainda não há configuração nesta pasta. Vamos configurar agora.');
        const codigo = await principal(['configurar'], Object.assign({}, opcoes, { base }));
        if (codigo !== 0) return codigo;
      }
    }
    const trava = travar(c.trava);
    if (!trava.ok) {
      escrever('Já existe um conector rodando nesta pasta (processo ' + trava.pid + '). Use "MultiTelasConector.exe status" para ver como ele está.');
      return 1;
    }
    const ctx = contexto(base, opcoes, opcoes.logOpcoes);
    ctx.sono = opcoes.sono || criarSono();
    ctx.maxCiclos = opcoes.maxCiclos;
    ctx.semVigias = opcoes.semVigias;
    const sair = () => { trava.soltar(); process.exit(0); };
    if (!opcoes.semSinais) {
      process.once('SIGINT', sair);
      process.once('SIGTERM', sair);
      process.once('SIGBREAK', sair); // Ctrl+Break no console do Windows
      process.on('uncaughtException', (e) => { ctx.log.erro('Erro inesperado (o conector vai reiniciar): ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); trava.soltar(); process.exit(1); });
      process.on('unhandledRejection', (e) => { ctx.log.erro('Erro inesperado: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e)); });
    }
    try { await rodar(ctx); } finally { trava.soltar(); }
    return 0;
  }

  escrever('Comando desconhecido: "' + args[0] + '".\n');
  escrever(AJUDA);
  return 1;
}

module.exports = { principal, AJUDA };

if (require.main === module) {
  principal().then((codigo) => { process.exitCode = codigo; }, (e) => {
    process.stderr.write('Erro: ' + (e && e.message ? e.message : e) + '\n');
    process.exitCode = 1;
  });
}
