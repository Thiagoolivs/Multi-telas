'use strict';
/*
 * estado.json: a memória do conector entre um ciclo e outro (e entre
 * reinícios do Windows).
 *
 * Serve a duas coisas. (1) Não refazer trabalho caro: o sha256 de um vídeo de
 * 300 MB numa pasta de rede custa minutos, então fica guardado por tamanho e
 * data. (2) O comando `status`, que roda em OUTRO processo (o TI abre um
 * prompt enquanto a tarefa roda em segundo plano), lê daqui o último
 * sincronismo, os erros e a fila.
 *
 * Nada de token aqui: o estado é lido por quem pede `status`.
 */
const fs = require('node:fs');
const { gravarAtomico } = require('./config');

const MAX_ERROS = 30;

function novo() {
  return {
    versao: 1,
    conector: {},
    servidor: {},
    parado: null,
    fontes: {},
    erros: [],
    fila: [],
    pastas: {},
    planilhas: {},
    feeds: {},
  };
}

function carregarEstado(arquivo) {
  const e = novo();
  try {
    const lido = JSON.parse(fs.readFileSync(arquivo, 'utf8').replace(/^﻿/, ''));
    if (lido && typeof lido === 'object') {
      for (const k of Object.keys(e)) if (lido[k] !== undefined && typeof lido[k] === typeof e[k]) e[k] = lido[k];
      if (lido.parado && typeof lido.parado === 'object') e.parado = lido.parado;
    }
  } catch (err) {
    // Sem estado (primeira vez) ou estado corrompido: começa do zero. O pior
    // caso é recalcular os hashes e reenviar o que não mudou (o PUT é idempotente).
  }
  return e;
}

function salvarEstado(arquivo, estado) {
  try { gravarAtomico(arquivo, JSON.stringify(estado)); return true; } catch (e) { return false; }
}

function fonte(estado, id, extra) {
  const f = estado.fontes[id] || (estado.fontes[id] = {});
  if (extra) Object.assign(f, extra);
  return f;
}

function registrarErro(estado, idFonte, mensagem, quando = Date.now()) {
  const ultimo = estado.erros[estado.erros.length - 1];
  // O mesmo erro a cada minuto vira um só, com a hora da última vez.
  if (ultimo && ultimo.fonte === idFonte && ultimo.mensagem === mensagem) { ultimo.em = quando; ultimo.vezes = (ultimo.vezes || 1) + 1; return; }
  estado.erros.push({ em: quando, fonte: idFonte, mensagem });
  if (estado.erros.length > MAX_ERROS) estado.erros.splice(0, estado.erros.length - MAX_ERROS);
}

module.exports = { novo, carregarEstado, salvarEstado, fonte, registrarErro };
