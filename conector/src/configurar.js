'use strict';
/*
 * `MultiTelasConector.exe configurar`: as perguntas da primeira vez.
 *
 * O TI não precisa saber a sintaxe do conector.json (nem dobrar as barras do
 * caminho de rede): pergunta o endereço e o token, testa a conexão, e para
 * cada pasta/planilha que o painel listou pergunta onde ela fica nesta rede —
 * já conferindo se abre. Os hosts dos feeds são mostrados e liberados aqui,
 * com um "sim" de quem conhece a rede.
 *
 * O token é digitado sem eco e nunca é mostrado de volta.
 */
const os = require('node:os');
const readline = require('node:readline/promises');
const { carregarConfig, salvarConfig, normalizar, servidorValido, SERVIDOR_PADRAO, VARIAVEL_TOKEN } = require('./config');
const { criarApi, hostPermitido, TokenRevogado } = require('./rede');
const { lerPasta } = require('./pastas');
const { planilhaComoCsv } = require('./planilhas');

function criarPerguntas(entrada = process.stdin, saida = process.stdout) {
  const tty = !!entrada.isTTY;
  const rl = readline.createInterface({ input: entrada, output: saida, terminal: tty });
  let mudo = false;
  // Sem eco para o token: cada tecla vira "*". Só no console de verdade.
  if (tty && typeof rl._writeToOutput === 'function') {
    const original = rl._writeToOutput.bind(rl);
    rl._writeToOutput = (s) => { if (!mudo) return original(s); if (s.includes('\n') || s.includes('\r')) return original('\n'); return original('*'); };
  }
  // Fora do console (entrada redirecionada), as linhas chegam antes das
  // perguntas: guardar tudo numa fila evita perder resposta.
  const fila = [];
  const esperando = [];
  if (!tty) {
    rl.on('line', (linha) => { const w = esperando.shift(); if (w) w(linha); else fila.push(linha); });
    rl.on('close', () => { while (esperando.length) esperando.shift()(''); });
  }
  async function ler(texto) {
    if (tty) return rl.question(texto);
    saida.write(texto);
    if (fila.length) return fila.shift();
    return new Promise((r) => esperando.push(r));
  }
  return {
    escrever: (t) => saida.write(t + '\n'),
    async perguntar(texto, padrao) {
      const r = String(await ler(texto + (padrao ? ' [' + padrao + ']' : '') + ': ')).trim();
      return r || padrao || '';
    },
    async segredo(texto) {
      mudo = true;
      try { return String(await ler(texto + ': ')).trim(); } finally { mudo = false; }
    },
    async simNao(texto, padrao) {
      const r = String(await ler(texto + (padrao ? ' (S/n): ' : ' (s/N): '))).trim().toLowerCase();
      if (!r) return padrao;
      return r.startsWith('s') || r.startsWith('y');
    },
    fechar: () => rl.close(),
  };
}

async function configurar(ctx) {
  const { caminhos, versao, perguntas: p, log } = ctx;
  const env = ctx.env || process.env;
  let atual;
  try { atual = carregarConfig(caminhos.base, env); } catch (e) {
    p.escrever('Aviso: ' + e.message + '\nComeço uma configuração nova (o arquivo antigo será substituído ao salvar).');
    atual = { cfg: normalizar({}), origemToken: '', tokenDoArquivo: '' };
  }
  const cfg = atual.cfg;
  // O token do ambiente não vai para o arquivo: quem pôs na variável não quer segredo em disco.
  // (O que já estava no arquivo fica como estava.)
  const tokenDoArquivo = atual.tokenDoArquivo || '';
  p.escrever('');
  p.escrever('Configuração do MultiTelas Conector ' + versao);
  p.escrever('Arquivo: ' + caminhos.config);
  p.escrever('Enter mantém o valor entre colchetes.');
  p.escrever('');

  for (;;) {
    cfg.servidor = (await p.perguntar('Endereço do servidor do MultiTelas', cfg.servidor || SERVIDOR_PADRAO)).replace(/\/+$/, '');
    const erro = servidorValido(cfg.servidor);
    if (!erro) break;
    p.escrever('  → ' + erro);
  }

  let tokenNovo = '';
  if (env[VARIAVEL_TOKEN]) p.escrever('Token: usando a variável de ambiente ' + VARIAVEL_TOKEN + ' (não vai para o arquivo).');
  else {
    tokenNovo = await p.segredo('Token do conector (no painel: menu do avatar › Integrações; ' + (cfg.token ? 'Enter mantém o atual' : 'obrigatório') + ')');
    if (tokenNovo) cfg.token = tokenNovo;
  }

  const proxyAtual = cfg.proxy || '';
  const proxy = await p.perguntar('Proxy da empresa para a internet (Enter = ' + (proxyAtual ? 'manter' : 'sem proxy') + '; "-" = tirar; ex.: http://proxy:3128)', proxyAtual);
  cfg.proxy = proxy === '-' ? '' : proxy;
  if (ctx.rede) ctx.rede.aplicar(cfg, env);

  // Testa de verdade: o mesmo pedido que o conector faz a cada ciclo.
  let plano = null;
  if (cfg.token) {
    p.escrever('');
    p.escrever('Testando a conexão com ' + cfg.servidor + ' …');
    try {
      const api = criarApi({ servidor: cfg.servidor, token: cfg.token, versao, maquina: os.hostname(), log, fetch: ctx.fetch, tentativas: 2, esperaBaseMs: 500 });
      plano = await api.handshake();
      p.escrever('  OK: conta "' + ((plano.conta && plano.conta.nome) || '?') + '", integração "' + ((plano.integracao && plano.integracao.nome) || '?') + '".');
    } catch (e) {
      p.escrever('  FALHOU: ' + (e instanceof TokenRevogado ? 'o token foi recusado (revogado ou copiado errado). Gere outro no painel: menu do avatar › Integrações › Token novo.' : e.message));
    }
  } else p.escrever('Sem token não dá para testar a conexão.');

  if (plano) {
    const pastas = Array.isArray(plano.pastas) ? plano.pastas : [];
    const planilhas = Array.isArray(plano.planilhas) ? plano.planilhas : [];
    const feeds = Array.isArray(plano.feeds) ? plano.feeds : [];
    if (pastas.length) {
      p.escrever('');
      p.escrever('Pastas (ex.: \\\\servidor\\Comunicacao\\TV). A conta que vai RODAR o conector precisa ler esse caminho.');
    }
    for (const item of pastas) {
      const caminho = await p.perguntar('  Onde fica a pasta "' + (item.nome || item.chave) + '" (chave ' + item.chave + ')', cfg.pastas[item.chave] || '');
      if (!caminho) { delete cfg.pastas[item.chave]; continue; }
      cfg.pastas[item.chave] = caminho;
      try {
        const l = await lerPasta(caminho);
        p.escrever('    OK: ' + l.arquivos.length + ' arquivo(s) para a TV' + (l.ignorados.length ? ', ' + l.ignorados.length + ' ignorado(s)' : '') + '.');
      } catch (e) {
        p.escrever('    ATENÇÃO: ' + e.message + '. (Esta é a conta ' + os.userInfo().username + '; a tarefa pode rodar com outra.)');
      }
    }
    if (planilhas.length) { p.escrever(''); p.escrever('Planilhas (.xlsx ou .csv; vai a primeira aba).'); }
    for (const item of planilhas) {
      const caminho = await p.perguntar('  Onde fica a planilha "' + (item.nome || item.chave) + '" (chave ' + item.chave + ')', cfg.planilhas[item.chave] || '');
      if (!caminho) { delete cfg.planilhas[item.chave]; continue; }
      cfg.planilhas[item.chave] = caminho;
      try {
        const r = await planilhaComoCsv(caminho);
        p.escrever('    OK: ' + r.linhas + ' linha(s).');
      } catch (e) { p.escrever('    ATENÇÃO: ' + (e.code ? 'não consegui abrir "' + caminho + '" (' + e.code + ')' : e.message) + '.'); }
    }
    const hosts = new Map();
    for (const f of feeds) {
      try { const h = new URL(String(f.url)).hostname.toLowerCase(); if (!hosts.has(h)) hosts.set(h, f.nome || f.chave); } catch (e) { /* URL estranha: o ciclo avisa */ }
    }
    if (hosts.size) {
      p.escrever('');
      p.escrever('Feeds da intranet: o conector só lê os hosts que você liberar aqui.');
    }
    for (const [h, nome] of hosts) {
      if (hostPermitido(h, cfg.intranet.hostsPermitidos)) { p.escrever('  ' + h + ' (feed "' + nome + '"): já liberado.'); continue; }
      if (await p.simNao('  Liberar a leitura de ' + h + ' (feed "' + nome + '")?', true)) cfg.intranet.hostsPermitidos.push(h);
    }
  }

  if (!cfg.token) {
    p.escrever('');
    p.escrever('Sem token a configuração não serve. Nada foi salvo.');
    return { salvo: false, plano };
  }
  if (!plano && !(await p.simNao('A conexão não funcionou. Salvar assim mesmo?', false))) {
    p.escrever('Nada foi salvo.');
    return { salvo: false, plano };
  }
  const gravar = Object.assign({}, cfg, { token: env[VARIAVEL_TOKEN] ? tokenDoArquivo : cfg.token });
  salvarConfig(caminhos.config, gravar);
  p.escrever('');
  p.escrever('Salvo em ' + caminhos.config + '.');
  p.escrever('Próximos passos: "MultiTelasConector.exe testar" mostra o que vai sincronizar, sem enviar nada;');
  p.escrever('o instalar.ps1 registra o conector para ligar junto com o Windows.');
  return { salvo: true, plano };
}

module.exports = { configurar, criarPerguntas };
