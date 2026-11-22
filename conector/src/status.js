'use strict';
/*
 * `MultiTelasConector.exe status`: o que o TI precisa para responder "está
 * funcionando?" sem abrir o log. Lê o estado.json que a tarefa em segundo
 * plano grava a cada ciclo — este comando roda em outro processo e não fala
 * com o servidor. O token nunca aparece, nem pedaço dele.
 */
const fs = require('node:fs');
const { carregarEstado } = require('./estado');
const { carregarConfig } = require('./config');
const { lerTrava } = require('./sincronizar');

const dd = (n) => String(n).padStart(2, '0');
function quando(ms, agora = Date.now()) {
  if (!ms) return 'nunca';
  const d = new Date(ms);
  const s = dd(d.getDate()) + '/' + dd(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + dd(d.getHours()) + ':' + dd(d.getMinutes());
  const seg = Math.round((agora - ms) / 1000);
  let ha;
  if (seg < 0) ha = 'agora';
  else if (seg < 90) ha = 'há ' + seg + ' s';
  else if (seg < 5400) ha = 'há ' + Math.round(seg / 60) + ' min';
  else if (seg < 48 * 3600) ha = 'há ' + Math.round(seg / 3600) + ' h';
  else ha = 'há ' + Math.round(seg / 86400) + ' dias';
  return s + ' (' + ha + ')';
}

const ROTULO = { pasta: 'Pasta', planilha: 'Planilha', feed: 'Feed' };

function textoDoStatus({ versao, caminhos, env = process.env, agora = Date.now() }) {
  const l = [];
  l.push('MultiTelas Conector ' + versao);
  l.push('Pasta do conector: ' + caminhos.base);
  let lido = null;
  try { lido = carregarConfig(caminhos.base, env); } catch (e) { l.push('Configuração: ERRO — ' + e.message); }
  if (lido) {
    if (!lido.existe && !lido.cfg.token) l.push('Configuração: não achei ' + caminhos.config + ' (rode "MultiTelasConector.exe configurar").');
    else {
      l.push('Servidor: ' + lido.cfg.servidor);
      l.push('Token: ' + (lido.cfg.token ? 'configurado (' + lido.origemToken + ')' : 'NÃO configurado'));
      if (lido.problemas.length) l.push('Problemas no conector.json: ' + lido.problemas.join('; '));
    }
  }
  const estado = carregarEstado(caminhos.estado);
  const trava = lerTrava(caminhos.trava);
  const c = estado.conector || {};
  if (trava && trava.ativa) l.push('Rodando agora: sim (processo ' + trava.pid + ', ligado ' + quando(trava.desde, agora) + ', conta ' + (c.conta || '?') + ')');
  else l.push('Rodando agora: NÃO' + (c.iniciadoEm ? ' (última vez ligado ' + quando(c.iniciadoEm, agora) + ', conta ' + (c.conta || '?') + ')' : '') + '. Confira a tarefa "MultiTelas Conector" no Agendador de Tarefas.');
  if (c.versao && c.versao !== versao) l.push('Atenção: o conector em segundo plano é a versão ' + c.versao + '; este arquivo é a ' + versao + '. Reinicie a tarefa.');

  if (estado.parado) {
    l.push('');
    l.push('*** PARADO: ' + (estado.parado.mensagem || estado.parado.motivo) + ' (desde ' + quando(estado.parado.em, agora) + ')');
  }

  const s = estado.servidor || {};
  l.push('');
  l.push('Último contato com o servidor: ' + quando(s.ultimoContato, agora)
    + (s.conta ? ' — conta "' + s.conta + '"' : '') + (s.integracao ? ', integração "' + s.integracao + '"' : '')
    + (s.intervaloSegundos ? ', ciclo a cada ' + s.intervaloSegundos + ' s' : ''));
  if (s.ultimoErro) l.push('  último erro: ' + s.ultimoErro);

  const fontes = Object.entries(estado.fontes || {}).sort(([a], [b]) => a.localeCompare(b));
  l.push('');
  l.push('Fontes (' + fontes.length + '):');
  if (!fontes.length) l.push('  nenhuma ainda (o servidor lista as fontes no primeiro contato)');
  for (const [, f] of fontes) {
    l.push('  ' + (ROTULO[f.tipo] || f.tipo) + ' "' + f.nome + '" (chave ' + f.chave + ')' + (f.origem ? ' — ' + f.origem : ''));
    l.push('    última sincronização: ' + quando(f.ultimaSincronizacao, agora) + (f.ultimoResumo ? ' · ' + f.ultimoResumo : ''));
    if (f.ultimoErro) l.push('    ERRO: ' + f.ultimoErro);
  }

  const fila = estado.fila || [];
  l.push('');
  l.push('Fila (' + fila.length + '):' + (fila.length ? '' : ' vazia'));
  for (const x of fila.slice(0, 30)) l.push('  - ' + x.fonte + ': ' + x.nome + ' — ' + x.motivo);
  if (fila.length > 30) l.push('  … e mais ' + (fila.length - 30));

  const erros = (estado.erros || []).slice(-10).reverse();
  l.push('');
  l.push('Erros recentes (' + erros.length + '):' + (erros.length ? '' : ' nenhum'));
  for (const e of erros) l.push('  ' + quando(e.em, agora) + ' ' + e.fonte + ': ' + e.mensagem + (e.vezes > 1 ? ' (' + e.vezes + ' vezes)' : ''));

  l.push('');
  l.push('Log completo: ' + caminhos.log + (fs.existsSync(caminhos.log) ? '' : ' (ainda não existe)'));
  return l.join('\n');
}

module.exports = { textoDoStatus, quando };
