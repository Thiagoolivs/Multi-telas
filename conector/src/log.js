'use strict';
/*
 * O log do conector: um arquivo ao lado do .exe, em português simples.
 *
 * Quem lê é o TI do cliente, no Bloco de Notas, quando "a foto não apareceu
 * na TV". Por isso cada linha diz o que aconteceu e o que fazer, sem pilha de
 * erro nem código interno. Gira por tamanho (conector.log → conector.log.1 …)
 * porque o conector roda meses sem ninguém olhar e não pode encher o disco.
 *
 * O token NUNCA vai para o arquivo: todo texto passa por `limpar`, que troca
 * os segredos registrados e qualquer "Bearer xxx" por ***. Isso vale até para
 * mensagens de erro que vêm de fora (fetch, servidor), que a gente não controla.
 */
const fs = require('node:fs');
const path = require('node:path');

const NIVEIS = { info: 'INFO', aviso: 'AVISO', erro: 'ERRO' };

function doisDigitos(n) { return String(n).padStart(2, '0'); }

// Hora local da máquina: o TI compara com o relógio da parede, não com UTC.
function carimbo(d = new Date()) {
  return d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate())
    + ' ' + doisDigitos(d.getHours()) + ':' + doisDigitos(d.getMinutes()) + ':' + doisDigitos(d.getSeconds());
}

function criarLog(opcoes = {}) {
  const arquivo = opcoes.arquivo || null;
  const tamanhoMaximo = opcoes.tamanhoMaximo || 1024 * 1024;
  const quantos = opcoes.arquivos || 5;
  const naTela = opcoes.naTela !== false;
  const segredos = new Set();
  const avisados = new Set();
  let tamanho = -1;
  const linhas = []; // as últimas, em memória: o teste e o "testar" leem daqui

  function limpar(texto) {
    let s = String(texto == null ? '' : texto);
    for (const seg of segredos) if (seg) s = s.split(seg).join('***');
    // Um cabeçalho que escapou inteiro (um erro que ecoa a requisição).
    s = s.replace(/(Bearer\s+)[^\s"',;]+/gi, '$1***');
    // Proxy com senha na URL: http://usuario:senha@proxy:8080.
    s = s.replace(/(\/\/[^\s/:@]+:)[^\s/@]+@/g, '$1***@');
    return s;
  }

  function girar() {
    // Do mais velho para o mais novo; o que passar de `quantos` some.
    try { fs.rmSync(arquivo + '.' + quantos, { force: true }); } catch (e) { /* sem permissão: segue */ }
    for (let i = quantos - 1; i >= 1; i--) {
      try { if (fs.existsSync(arquivo + '.' + i)) fs.renameSync(arquivo + '.' + i, arquivo + '.' + (i + 1)); } catch (e) { /* idem */ }
    }
    try { fs.renameSync(arquivo, arquivo + '.1'); } catch (e) { /* idem */ }
    tamanho = 0;
  }

  function escrever(nivel, msg) {
    const linha = carimbo() + ' [' + NIVEIS[nivel] + '] ' + limpar(msg);
    linhas.push(linha);
    if (linhas.length > 500) linhas.shift();
    if (naTela) (nivel === 'erro' ? process.stderr : process.stdout).write(linha + '\n');
    if (!arquivo) return;
    try {
      if (tamanho < 0) {
        try { tamanho = fs.statSync(arquivo).size; } catch (e) { tamanho = 0; }
      }
      const bytes = Buffer.byteLength(linha) + 2;
      if (tamanho + bytes > tamanhoMaximo && tamanho > 0) girar();
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      // \r\n: o Bloco de Notas antigo (Windows Server 2016) não quebra linha com \n sozinho.
      fs.appendFileSync(arquivo, linha + '\r\n');
      tamanho += bytes;
    } catch (e) {
      // Disco cheio ou sem permissão na pasta: o conector continua; avisa na tela uma vez.
      if (!avisados.has('#falha-log')) {
        avisados.add('#falha-log');
        process.stderr.write('Não consegui escrever o log em ' + arquivo + ': ' + e.message + '\n');
      }
    }
  }

  const log = {
    info: (m) => escrever('info', m),
    aviso: (m) => escrever('aviso', m),
    erro: (m) => escrever('erro', m),
    // A mesma condição a cada minuto (pasta fora do ar, arquivo grande demais)
    // vira uma linha só, até `esquecer` — senão o log vira ruído e gira à toa.
    umaVez(chave, nivel, m) {
      if (avisados.has(chave)) return false;
      avisados.add(chave);
      escrever(nivel, m);
      return true;
    },
    esquecer(prefixo) {
      let quantos = 0;
      for (const k of [...avisados]) if (k === prefixo || k.startsWith(prefixo + '|')) { avisados.delete(k); quantos++; }
      return quantos;
    },
    segredo(valor) {
      // Segredo curto demais trocaria pedaços de palavras comuns por ***.
      if (valor && String(valor).length >= 6) segredos.add(String(valor));
    },
    limpar,
    linhas,
    arquivo,
  };
  return log;
}

module.exports = { criarLog, carimbo };
