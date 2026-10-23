/*
 * js/escopo.js — o ESCOPO: o que vai ser criado, para onde e como.
 *
 * É o contrato entre o chat e o gerador (EXECUTOR §2b, item 20). O chat
 * preenche, o cliente vê no cartão "O que vou criar" e mexe à mão, e o
 * gerador obedece. Um arquivo só para o servidor e o painel: se cada lado
 * tivesse a sua conta, o cartão prometeria 5 peças, o gerador faria 7 e a
 * cobrança contaria outra coisa.
 *
 *   nome, objetivo, publico   o que o cliente contou, em texto curto
 *   periodo                   { inicio, fim } em AAAA-MM-DD, ou vazio
 *   imagens                   'minhas' (só as fotos do cliente), 'gerar' (a
 *                             IA gera), 'mistura' (as dele primeiro, a IA
 *                             completa) ou 'nenhuma'
 *   telas[]                   cada uma com o alvo (uma TV, todas ou um
 *                             grupo), o nome, o layout e as quatro zonas
 *   redes                     o que sai para Instagram, WhatsApp, Facebook
 *                             e Google, cada um ligado ou desligado
 *   horarios[]                a faixa do dia (ou um horário próprio) e o
 *                             foco dela ("café da manhã")
 *
 * Zona: `pecas` é quantas peças a IA desenha ali (no cabeçalho, quantos
 * estilos giram), `pedido` é o que cada uma mostra ("promoção com preço").
 * Cabeçalho e rodapé têm também os campos vivos (relógio, data, clima,
 * contagem), as mensagens do letreiro e a data da contagem regressiva.
 *
 * Tudo o que entra passa por `normalizar`: vem da IA ou do navegador, e
 * nenhum dos dois é confiável. O que não é da forma é cortado, não corrigido.
 *
 * Módulo duplo: require() no Node, MTEscopo no navegador.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTEscopo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var IMAGENS = ['minhas', 'gerar', 'mistura', 'nenhuma'];
  var ZONAS = ['principal', 'lateral', 'cabecalho', 'rodape'];
  // Teto de peças por zona: o cabeçalho e o rodapé giram poucos estilos.
  var TETO_ZONA = { principal: 8, lateral: 8, cabecalho: 4, rodape: 4 };
  var VIVOS = ['relogio', 'data', 'clima', 'contagem', 'logo'];
  var REDES = ['instagramPost', 'instagramStory', 'whatsappStatus', 'whatsappMensagem', 'facebook', 'google'];
  var FAIXAS = ['manha', 'almoco', 'tarde', 'saida', 'dia'];
  var TETO = { telas: 12, pecas: 24, mensagens: 12, horarios: 6 };

  var NOME_ZONA = { principal: 'Principal', lateral: 'Lateral', cabecalho: 'Cabeçalho', rodape: 'Rodapé' };
  var NOME_VIVO = { relogio: 'relógio', data: 'data', clima: 'clima', contagem: 'contagem regressiva', logo: 'logo animado' };
  var NOME_REDE = {
    instagramPost: 'post do Instagram', instagramStory: 'Story do Instagram',
    whatsappStatus: 'Status do WhatsApp', whatsappMensagem: 'mensagem do WhatsApp',
    facebook: 'post do Facebook', google: 'post do Google',
  };
  var NOME_FAIXA = { manha: 'manhã', almoco: 'almoço', tarde: 'tarde', saida: 'fim do dia', dia: 'o dia todo' };
  var NOME_IMAGENS = {
    minhas: 'só as suas fotos', gerar: 'a IA gera as fotos',
    mistura: 'as suas fotos primeiro, a IA completa', nenhuma: 'sem foto',
  };

  function texto(v, max) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function inteiro(v, min, max) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }
  function data(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''; }
  function dataHora(v) { return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(v || '')) ? String(v) : ''; }
  function hora(v) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
    return m && +m[1] < 24 && +m[2] < 60 ? (m[1].length === 1 ? '0' : '') + m[1] + ':' + m[2] : '';
  }
  function lista(v, max, cada) {
    var saida = [];
    var a = Array.isArray(v) ? v : [];
    for (var i = 0; i < a.length && saida.length < max; i++) {
      var x = cada(a[i]);
      if (x) saida.push(x);
    }
    return saida;
  }
  function unicos(v, permitidos) {
    var saida = [];
    (Array.isArray(v) ? v : []).forEach(function (x) { if (permitidos.indexOf(x) >= 0 && saida.indexOf(x) < 0) saida.push(x); });
    return saida;
  }

  /*
   * O alvo de uma tela. O id é o da TV da conta; quem usa confere se ele é
   * desta conta (o servidor, preso a `tenant_id`). Aqui só a forma.
   */
  function alvo(v) {
    var a = v && typeof v === 'object' ? v : {};
    if (a.tipo === 'tela' && /^[A-Za-z0-9_-]{1,64}$/.test(String(a.id || ''))) return { tipo: 'tela', id: String(a.id) };
    if (a.tipo === 'grupo' && texto(a.nome, 40)) return { tipo: 'grupo', nome: texto(a.nome, 40) };
    return { tipo: 'todas' };
  }

  function zona(id, v) {
    var z = v && typeof v === 'object' ? v : {};
    var saida = { pecas: inteiro(z.pecas, 0, TETO_ZONA[id]), pedido: texto(z.pedido, 200) };
    if (id === 'cabecalho' || id === 'rodape') {
      saida.vivos = unicos(z.vivos, VIVOS);
      saida.mensagens = lista(z.mensagens, TETO.mensagens, function (m) { return texto(m, 120); });
      saida.contagem = dataHora(z.contagem);
      // Contagem sem data não conta nada: some da lista, para o cartão não prometer.
      if (!saida.contagem) saida.vivos = saida.vivos.filter(function (x) { return x !== 'contagem'; });
      else if (saida.vivos.indexOf('contagem') < 0) saida.vivos.push('contagem');
    }
    return saida;
  }

  function tela(v) {
    var t = v && typeof v === 'object' ? v : {};
    var zonas = {};
    ZONAS.forEach(function (id) { zonas[id] = zona(id, t.zonas && t.zonas[id]); });
    return {
      alvo: alvo(t.alvo),
      nome: texto(t.nome, 40),
      layout: /^[a-z0-9-]{1,40}$/.test(String(t.layout || '')) ? String(t.layout) : '',
      zonas: zonas,
    };
  }

  function horario(v) {
    var h = v && typeof v === 'object' ? v : {};
    var inicio = hora(h.inicio), fim = hora(h.fim);
    var faixa = FAIXAS.indexOf(h.faixa) >= 0 ? h.faixa : '';
    // Um horário próprio ("15h às 17h") vale mais que a faixa genérica.
    if (inicio && fim) return { faixa: '', inicio: inicio, fim: fim, foco: texto(h.foco, 120) };
    if (faixa) return { faixa: faixa, inicio: '', fim: '', foco: texto(h.foco, 120) };
    return null;
  }

  function normalizar(v) {
    var e = v && typeof v === 'object' ? v : {};
    var redes = {};
    REDES.forEach(function (r) { redes[r] = !!(e.redes && e.redes[r] === true); });
    var saida = {
      versao: 1,
      nome: texto(e.nome, 60),
      objetivo: texto(e.objetivo, 300),
      publico: texto(e.publico, 160),
      periodo: { inicio: data(e.periodo && e.periodo.inicio), fim: data(e.periodo && e.periodo.fim) },
      imagens: IMAGENS.indexOf(e.imagens) >= 0 ? e.imagens : 'mistura',
      telas: lista(e.telas, TETO.telas, tela),
      redes: redes,
      horarios: lista(e.horarios, TETO.horarios, horario),
      /*
       * As cores DESTA campanha, escolhidas nos cartões de cor da prévia
       * (D13). Vazio = as da Marca. Só #rrggbb, até três (principal, acento,
       * apoio), na ordem em que vieram.
       */
      cores: (Array.isArray(e.cores) ? e.cores : [])
        .map(function (c) { return String(c || '').trim().toLowerCase(); })
        .filter(function (c) { return /^#[0-9a-f]{6}$/.test(c); }).slice(0, 3),
    };
    /*
     * O teto do escopo inteiro: corta da última tela para a primeira, e
     * dentro da tela, das zonas de baixo para a principal. O que o cliente
     * pôs primeiro é o que ele mais quer.
     */
    var sobra = TETO.pecas;
    saida.telas.forEach(function (t) {
      ZONAS.forEach(function (id) {
        var z = t.zonas[id];
        z.pecas = Math.min(z.pecas, Math.max(0, sobra));
        sobra -= z.pecas;
      });
    });
    return saida;
  }

  // Começa vazio: quem decide o que entra é o cliente, conversando.
  function vazio() { return normalizar({}); }

  /*
   * O ponto de partida quando o cliente diz "pode gerar" sem detalhar: uma
   * tela para todas as TVs, com as quatro zonas e o essencial das redes.
   * É sugestão: o cartão mostra, e ele muda o que quiser.
   */
  function padrao() {
    return normalizar({
      imagens: 'mistura',
      telas: [{
        alvo: { tipo: 'todas' },
        zonas: {
          principal: { pecas: 3 },
          lateral: { pecas: 2 },
          cabecalho: { pecas: 1, vivos: ['relogio', 'data', 'clima'] },
          rodape: { pecas: 1 },
        },
      }],
      redes: { instagramPost: true, instagramStory: true, whatsappStatus: true, whatsappMensagem: true },
    });
  }

  function pecasDaTela(t) {
    return ZONAS.reduce(function (s, id) { return s + t.zonas[id].pecas; }, 0);
  }
  function algumaRede(e) { return REDES.some(function (r) { return e.redes[r]; }); }

  /*
   * O que o escopo vai gerar, e o que isso gasta.
   *
   * Foto só entra no principal e na lateral: cabeçalho e rodapé são faixas
   * finas, a foto não aparece. As redes usam a peça da TV no tamanho do
   * canal (EXECUTOR item 6), então não somam foto. A exceção é o escopo "só
   * redes": sem peça de TV, uma peça é feita para elas.
   *
   * Com 'mistura', o número é um TETO ("até 5"): a foto do cliente que
   * servir não custa nada. Só a foto gerada gasta criação; conversar e
   * escrever texto não.
   */
  function custo(v) {
    var e = normalizar(v);
    var pecas = 0, comFoto = 0;
    e.telas.forEach(function (t) {
      pecas += pecasDaTela(t);
      comFoto += t.zonas.principal.pecas + t.zonas.lateral.pecas;
    });
    if (!pecas && algumaRede(e)) { pecas = 1; comFoto = 1; }
    var fotos = e.imagens === 'gerar' || e.imagens === 'mistura' ? comFoto : 0;
    return { pecas: pecas, fotos: fotos, criacoes: fotos, ate: e.imagens === 'mistura' };
  }

  // Tem o que gerar? Sem nenhuma peça e nenhuma rede, o botão Gerar fica apagado.
  function temOQueGerar(v) {
    var e = normalizar(v);
    return e.telas.some(function (t) { return pecasDaTela(t) > 0 || t.zonas.rodape.mensagens.length > 0; }) || algumaRede(e);
  }

  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function juntar(partes) {
    if (partes.length < 2) return partes.join('');
    return partes.slice(0, -1).join(', ') + ' e ' + partes[partes.length - 1];
  }
  function nomeDoAlvo(t, i, total) {
    if (t.nome) return t.nome;
    if (t.alvo.tipo === 'todas') return total > 1 ? 'Tela ' + (i + 1) : 'Todas as TVs';
    if (t.alvo.tipo === 'grupo') return 'Grupo ' + t.alvo.nome;
    return 'Tela ' + (i + 1);
  }

  function descreverZona(id, z) {
    var partes = [];
    if (z.pecas) {
      partes.push(id === 'cabecalho'
        ? plural(z.pecas, 'estilo', 'estilos') + (z.pecas > 1 ? ' girando' : '')
        : plural(z.pecas, 'peça', 'peças') + (z.pedido ? ' (' + z.pedido + ')' : ''));
    }
    // A contagem tem linha própria, com a data: no meio dos campos vivos, ela se repetiria.
    var vivos = (z.vivos || []).filter(function (x) { return x !== 'contagem'; });
    if (vivos.length) partes.push(juntar(vivos.map(function (x) { return NOME_VIVO[x]; })));
    if (z.mensagens && z.mensagens.length) partes.push(plural(z.mensagens.length, 'aviso', 'avisos') + ' no letreiro');
    if (z.contagem) partes.push('contagem regressiva até ' + z.contagem.slice(8, 10) + '/' + z.contagem.slice(5, 7) + ' ' + z.contagem.slice(11).replace(':00', 'h'));
    return partes.length ? NOME_ZONA[id] + ': ' + partes.join(', ') : '';
  }

  /*
   * O escopo em português de lojista, uma linha por coisa: é o cartão "O que
   * vou criar". O cliente tem de saber o que vai em cada zona ANTES de gerar.
   */
  function descrever(v) {
    var e = normalizar(v);
    var linhas = [];
    e.telas.forEach(function (t, i) {
      var zonas = ZONAS.map(function (id) { return descreverZona(id, t.zonas[id]); }).filter(Boolean);
      linhas.push({ tipo: 'tela', titulo: nomeDoAlvo(t, i, e.telas.length), itens: zonas.length ? zonas : ['nada ainda'] });
    });
    var redes = REDES.filter(function (r) { return e.redes[r]; }).map(function (r) { return NOME_REDE[r]; });
    if (redes.length) linhas.push({ tipo: 'redes', titulo: 'Redes', itens: [juntar(redes)] });
    if (e.horarios.length) {
      linhas.push({
        tipo: 'horarios', titulo: 'Horários',
        itens: e.horarios.map(function (h) {
          var quando = h.faixa ? NOME_FAIXA[h.faixa] : h.inicio.replace(':00', 'h') + ' às ' + h.fim.replace(':00', 'h');
          return quando + (h.foco ? ': ' + h.foco : '');
        }),
      });
    }
    var c = custo(e);
    linhas.push({
      tipo: 'fotos', titulo: 'Fotos',
      itens: [NOME_IMAGENS[e.imagens] + (c.criacoes ? ' · ' + (c.ate ? 'até ' : '') + plural(c.criacoes, 'criação', 'criações') : ' · não gasta criação')],
    });
    return linhas;
  }

  /*
   * Os RECORTES: o cliente escolhe o tamanho do pedido com um toque, sem
   * gastar token ("só principal e lateral", "3 peças para a principal").
   * Cada um devolve um escopo novo; o original não muda.
   */
  function copia(v) { return normalizar(JSON.parse(JSON.stringify(normalizar(v)))); }
  function comTela(e) {
    if (!e.telas.length) e.telas.push(tela({ alvo: { tipo: 'todas' } }));
    return e;
  }
  function soZonas(e, ligadas, padraoPecas) {
    comTela(e).telas.forEach(function (t) {
      ZONAS.forEach(function (id) {
        var z = t.zonas[id];
        if (ligadas.indexOf(id) < 0) { z.pecas = 0; if (z.mensagens) { z.mensagens = []; z.vivos = []; z.contagem = ''; } }
        else if (!z.pecas) z.pecas = padraoPecas[id];
      });
    });
    return e;
  }
  var CHEIA = { principal: 3, lateral: 2, cabecalho: 1, rodape: 1 };
  var RECORTES = {
    tudo: {
      nome: 'Tudo: TV e redes',
      aplicar: function (e) {
        soZonas(e, ZONAS, CHEIA);
        ['instagramPost', 'instagramStory', 'whatsappStatus', 'whatsappMensagem'].forEach(function (r) { e.redes[r] = true; });
        return e;
      },
    },
    'principal-lateral': { nome: 'Só principal e lateral', aplicar: function (e) { return soZonas(e, ['principal', 'lateral'], CHEIA); } },
    'cabecalho-rodape': { nome: 'Só cabeçalho e rodapé', aplicar: function (e) { return soZonas(e, ['cabecalho', 'rodape'], CHEIA); } },
    'tres-principal': {
      nome: '3 peças para a principal',
      aplicar: function (e) { comTela(e).telas.forEach(function (t) { t.zonas.principal.pecas = 3; }); return e; },
    },
    'dois-cabecalho': {
      nome: '2 estilos de cabeçalho',
      aplicar: function (e) { comTela(e).telas.forEach(function (t) { t.zonas.cabecalho.pecas = 2; }); return e; },
    },
    'uma-peca': {
      nome: 'Só uma peça',
      aplicar: function (e) { soZonas(e, ['principal'], CHEIA).telas.forEach(function (t) { t.zonas.principal.pecas = 1; }); REDES.forEach(function (r) { e.redes[r] = false; }); return e; },
    },
    'so-redes': {
      nome: 'Só para as redes',
      aplicar: function (e) {
        e.telas = [];
        ['instagramPost', 'instagramStory', 'whatsappStatus', 'whatsappMensagem'].forEach(function (r) { e.redes[r] = true; });
        return e;
      },
    },
    'sem-redes': { nome: 'Sem redes', aplicar: function (e) { REDES.forEach(function (r) { e.redes[r] = false; }); return e; } },
  };

  function recortar(v, id) {
    var r = RECORTES[id];
    if (!r) return normalizar(v);
    return normalizar(r.aplicar(copia(v)));
  }

  return {
    IMAGENS: IMAGENS, ZONAS: ZONAS, TETO_ZONA: TETO_ZONA, VIVOS: VIVOS, REDES: REDES, FAIXAS: FAIXAS, TETO: TETO,
    NOME_ZONA: NOME_ZONA, NOME_VIVO: NOME_VIVO, NOME_REDE: NOME_REDE, NOME_IMAGENS: NOME_IMAGENS,
    RECORTES: Object.keys(RECORTES).map(function (id) { return { id: id, nome: RECORTES[id].nome }; }),
    normalizar: normalizar, vazio: vazio, padrao: padrao, custo: custo, temOQueGerar: temOQueGerar,
    descrever: descrever, recortar: recortar,
  };
});
