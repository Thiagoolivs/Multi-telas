/*
 * js/aviso.js — o aviso rápido NA PROGRAMAÇÃO de uma TV (EXECUTOR D27):
 * onde ele entra, como entra e como sai.
 *
 * Morava só no painel (web/src/lib/aviso.js), que lia a programação de cada
 * TV, punha o aviso e mandava todas de volta num envio. Com a conta de RH
 * (300 TVs, ~96 KB de programação cada) isso eram 300 leituras e ~29 MB num
 * pedido só — recusado pelo teto de 2 MB acima de ~20 TVs (teste de carga,
 * 16/11). Agora o SERVIDOR põe o aviso em cada TV (server/routes/telas.js,
 * POST /api/lote/aviso), com esta mesma regra; o painel usa a mesma para a
 * prévia e os testes.
 *
 * Módulo duplo: require() no servidor e nos testes, MTAviso no painel. Não
 * é carregado pela TV.
 */
(function (raiz, fabrica) {
  // O catálogo de layouts (MT_getLayout): no navegador, quem importa já trouxe; no Node, vem aqui.
  var T = typeof module === 'object' && module.exports && typeof require === 'function' ? require('./templates.js') : null;
  var api = fabrica(raiz, T);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTAviso = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (raiz, T) {
  'use strict';

  // Quanto tempo o urgente sem data fica no ar.
  var URGENTE_DURA_MS = 2 * 60 * 60 * 1000;

  // O dia de hoje no relógio de quem roda (no painel, o da pessoa).
  function hojeLocal() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /*
   * Quanto da tela cada parte da grade ocupa (0–100), pela trilha do layout:
   * "1fr 11vh" = a linha fixa leva 11, as frações dividem o resto.
   */
  function partes(trilha) {
    var t = String(trilha || '1fr').trim().split(/\s+/);
    var fixo = t.reduce(function (s, x) { return s + (/v[hw]$/.test(x) ? parseFloat(x) : 0); }, 0);
    var fr = t.reduce(function (s, x) { return s + (/fr$/.test(x) ? parseFloat(x) : 0); }, 0) || 1;
    return t.map(function (x) { return /v[hw]$/.test(x) ? parseFloat(x) : (/fr$/.test(x) ? parseFloat(x) / fr * Math.max(0, 100 - fixo) : 0); });
  }

  /*
   * A zona do aviso (nota do consultor no D27): a principal; sem ela, a MAIOR
   * lista em área — nunca o cabeçalho nem o rodapé, onde o aviso não cabe e
   * vazaria. null = esta TV não tem onde mostrar. O layout é lido na hora
   * (raiz.MT_getLayout): os testes trocam o catálogo.
   */
  function zonaDoAviso(cfg) {
    // Sem o do global (no Node, com um `window` de mentira o catálogo vai para ele), o do js/templates.js lido aqui.
    var id = cfg && cfg.settings && cfg.settings.layoutId;
    var layout = raiz.MT_getLayout ? raiz.MT_getLayout(id) : (T && T.getLayout ? T.getLayout(id) : null);
    var listas = ((layout && layout.zones) || []).filter(function (z) { return z.type === 'playlist'; });
    var principal = listas.filter(function (z) { return /^(principal|video|z1)$/.test(z.id); })[0];
    if (principal) return principal.id;
    var g = (layout && layout.grid) || {};
    var linhas = partes(g.rows);
    var colunas = partes(g.columns);
    var area = function (z) {
      return (g.areas || []).reduce(function (s, linha, i) {
        return s + linha.trim().split(/\s+/).reduce(function (u, nome, j) { return u + (nome === z.area ? (linhas[i] || 0) * (colunas[j] || 0) : 0); }, 0);
      }, 0);
    };
    var maior = listas.slice().sort(function (a, b) { return area(b) - area(a); })[0];
    return maior ? maior.id : null;
  }

  /*
   * Põe o aviso na frente da zona do aviso, MUDANDO `cfg` (quem quer a
   * original copia antes — o painel copia). O mesmo `id` de novo troca o
   * aviso, não empilha. Estoura se a TV não tem onde mostrar.
   *
   * `opcoes.hoje` (AAAA-MM-DD): o dia de quem mandou, onde a data do aviso
   * começa a valer — é o dia da loja, não o do relógio do servidor (UTC).
   * `opcoes.agora`: o relógio do fim do urgente sem data.
   */
  function porAviso(cfg, item, aviso, id, opcoes) {
    var o = opcoes || {};
    var next = cfg && typeof cfg === 'object' ? cfg : {};
    if (!next.zonas || typeof next.zonas !== 'object') next.zonas = {};
    var z = zonaDoAviso(next);
    if (!z) throw new Error('esta TV não tem onde mostrar o aviso');
    var atual = next.zonas[z];
    var zona = atual && Array.isArray(atual.items) ? atual : Object.assign({}, atual || {}, { items: [] });
    var resto = zona.items.filter(function (it) { return !(it && it._aviso === id); });
    var prioridade = (aviso && aviso.prioridade) || 'alta';
    var ate = (aviso && aviso.ate) || '';
    /*
     * O URGENTE TEM FIM (QA total, 05/11). Sem data, ele ficava para sempre
     * tomando a tela. Sem "até quando", sai sozinho em 2 horas; com data, vale
     * o dia escolhido. A TV confere `expiraEm` a cada volta (js/player.js).
     */
    var urgenteSemData = prioridade === 'urgente' && !ate;
    var meta = { tipo: 'aviso', prioridade: prioridade };
    if (urgenteSemData) meta.expiraEm = (o.agora || Date.now()) + URGENTE_DURA_MS;
    var novo = Object.assign({}, item, { _aviso: id, meta: meta });
    if (ate) novo.agendamento = { ativo: true, dias: [], dataInicio: o.hoje || hojeLocal(), dataFim: ate };
    next.zonas[z] = Object.assign({}, zona, { items: [novo].concat(resto) });
    return next;
  }

  /*
   * Tira o aviso `id` de todas as zonas, MUDANDO `cfg`. Devolve quantos itens
   * saíram (0: o aviso já não estava lá). É o Desfazer do aviso para muitas
   * TVs: tira só o aviso, e o que alguém mudou na TV depois fica.
   */
  function tirarAviso(cfg, id) {
    var n = 0;
    var zonas = (cfg && cfg.zonas) || {};
    Object.keys(zonas).forEach(function (k) {
      var z = zonas[k];
      if (!z || !Array.isArray(z.items)) return;
      var antes = z.items.length;
      z.items = z.items.filter(function (it) { return !(it && it._aviso === id); });
      n += antes - z.items.length;
    });
    return n;
  }

  /*
   * A programação de uma TV que ainda não tem nenhuma, para o aviso entrar
   * nela: a mesma do painel (web/src/lib/contentTypes.js, defaultConfig — o
   * teste confere que são iguais).
   */
  function configDaTvNova(nome) {
    return {
      version: 1,
      settings: {
        nome: nome || 'Tela',
        layoutId: 'dashboard',
        theme: { preset: 'dark-premium', font: 'system', overrides: {} },
        transicao: 'dissolver',
        audio: { ativo: false, faixas: [], volume: 60, aleatorio: false, abaixarComVideo: true },
      },
      zonas: { principal: { items: [] } },
    };
  }

  return { URGENTE_DURA_MS: URGENTE_DURA_MS, zonaDoAviso: zonaDoAviso, porAviso: porAviso, tirarAviso: tirarAviso, configDaTvNova: configDaTvNova };
});
