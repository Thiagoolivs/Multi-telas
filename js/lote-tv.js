/*
 * js/lote-tv.js — o que uma campanha, uma peça pronta ou uma publicação faz
 * na programação de UMA TV: em que zona entra, como troca o que já era dela,
 * como sai, e a hora e o dia de cada peça.
 *
 * Morava só no painel (web/src/lib/rodar.js, aplicarConteudo.js, quando.js,
 * publicar.js), que lia a programação de cada TV, aplicava e mandava todas de
 * volta num envio só. Na conta de RH (300 TVs, ~96 KB de programação cada)
 * eram 300 leituras e ~29 MB num pedido — recusado pelo teto de 2 MB acima de
 * ~19 TVs (teste de carga, 16/11). Agora o painel manda a OPERAÇÃO ("esta
 * campanha nestas TVs") e o servidor aplica em cada uma com estas mesmas
 * funções (server/routes/telas.js, POST /api/lote/operacao). O painel usa as
 * mesmas para a prévia e as telas de uma TV só: uma regra, dois lados.
 *
 * O que depende do relógio (o dia em que a peça começa) recebe `agora`: no
 * servidor, o dia de quem mandou, e não o do relógio dele (UTC).
 *
 * Módulo duplo: require() no servidor e nos testes, MTLoteTv no painel. Não
 * é carregado pela TV.
 */
(function (raiz, fabrica) {
  // O catálogo de layouts (MT_getLayout): no navegador, quem importa já trouxe; no Node, vem aqui.
  if (typeof module === 'object' && module.exports && typeof require === 'function') require('./templates.js');
  var api = fabrica(raiz);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTLoteTv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (raiz) {
  'use strict';

  const copia = (x) => JSON.parse(JSON.stringify(x || {}));

  /* ---------------- A origem do conteúdo (era web/src/lib/aplicarConteudo.js) ---------------- */

  // Marca de origem. Duas chaves porque o histórico já gravou as duas nos itens
  // que estão em produção; ler as duas evita órfão em tela de cliente.
  const CHAVES_ORIGEM = ['_season', '_campanha'];

  function origemDoItem(item) {
    if (!item) return null;
    for (const k of CHAVES_ORIGEM) if (item[k]) return { chave: k, valor: item[k] };
    return null;
  }

  /*
   * Aplica `blocos` — { [zonaId]: [itens] } — numa config. `origem` =
   * { chave, valor }; `politica`: 'trocar' (padrão) troca o conteúdo DESTA
   * origem e preserva o resto; 'somar' acrescenta; 'limpar' esvazia a zona
   * antes. Devolve a config nova; não modifica a recebida.
   */
  function aplicarConteudo(cfg, blocos, origem, politica) {
    const modo = politica || 'trocar';
    const next = copia(cfg);
    if (!next.zonas) next.zonas = {};
    for (const zonaId of Object.keys(blocos || {})) {
      const itens = blocos[zonaId];
      if (!itens || !itens.length) continue;
      if (!next.zonas[zonaId] || !Array.isArray(next.zonas[zonaId].items)) next.zonas[zonaId] = { items: [] };
      const atuais = next.zonas[zonaId].items;
      const marcados = itens.map((i) => Object.assign({}, i, { [origem.chave]: origem.valor }));
      let base;
      if (modo === 'limpar') base = [];
      else if (modo === 'somar') base = atuais;
      else base = atuais.filter((i) => !(i && i[origem.chave] === origem.valor));
      // O que entra vai na frente: quem acabou de publicar quer ver na tela.
      next.zonas[zonaId].items = marcados.concat(base);
    }
    return next;
  }

  // Tira da config tudo o que veio de uma origem.
  function removerOrigem(cfg, origem) {
    const next = copia(cfg);
    for (const k of Object.keys(next.zonas || {})) {
      const z = next.zonas[k];
      if (z && Array.isArray(z.items)) z.items = z.items.filter((i) => !(i && i[origem.chave] === origem.valor));
    }
    return next;
  }

  /* ---------------- A hora e o dia de cada peça ---------------- */

  /*
   * As faixas do expediente — espelham `FAIXAS` em server/ai-director.js. Esta
   * é a ponta que só ROTULA e converte; a classificação acontece uma vez só,
   * no plano.
   */
  const FAIXAS = {
    manha:  { rotulo: 'Manhã',      hora: '6h–11h30', horaInicio: '06:00', horaFim: '11:29' },
    almoco: { rotulo: 'Almoço',     hora: '11h30–14h', horaInicio: '11:30', horaFim: '13:59' },
    tarde:  { rotulo: 'Tarde',      hora: '14h–17h30', horaInicio: '14:00', horaFim: '17:29' },
    saida:  { rotulo: 'Fim do dia', hora: '17h30–24h', horaInicio: '17:30', horaFim: '23:59' },
    dia:    { rotulo: 'O dia todo', hora: 'qualquer hora', horaInicio: '', horaFim: '' },
  };
  const doisDigitos = (n) => String(n).padStart(2, '0');
  const emISO = (d) => d.getFullYear() + '-' + doisDigitos(d.getMonth() + 1) + '-' + doisDigitos(d.getDate());

  /*
   * A faixa de cada peça vira o `agendamento` que o player entende. Sem prazo
   * (`dias` = 0), fica até ser trocada; com prazo, sai sozinha. `agora`: o
   * dia de referência (testes e servidor); sem ele, o relógio de quem roda.
   */
  function agendarPeca(item, faixa, dias, agora) {
    const f = FAIXAS[faixa] || FAIXAS.dia;
    const semHora = !f.horaInicio && !f.horaFim;
    const prazo = Number(dias) > 0 ? Number(dias) : 0;
    if (semHora && !prazo) return item;                 // sem janela: nada a agendar
    const hoje = agora ? new Date(agora) : new Date();
    const fim = new Date(hoje);
    if (prazo) fim.setDate(fim.getDate() + prazo - 1);
    return Object.assign({}, item, {
      agendamento: {
        ativo: true,
        dataInicio: emISO(hoje),
        dataFim: prazo ? emISO(fim) : '',
        dias: [],
        horaInicio: f.horaInicio,
        horaFim: f.horaFim,
      },
    });
  }

  /*
   * Fase 5: sem buraco no dia. Sem peça "o dia todo" na zona, cada faixa que
   * tem peça estica até a próxima que tem: a primeira começa à meia-noite e a
   * última vai até o fim do dia.
   */
  const ORDEM = ['manha', 'almoco', 'tarde', 'saida'];
  const menosUmMinuto = (hm) => {
    const p = hm.split(':').map(Number);
    const t = p[0] * 60 + p[1] - 1;
    return doisDigitos(Math.floor(t / 60)) + ':' + doisDigitos(t % 60);
  };
  function cobrirODia(lista) {
    const itens = lista || [];
    const faixaDe = (it) => {
      const a = it && it.agendamento;
      if (!a || !a.ativo || (!a.horaInicio && !a.horaFim)) return 'dia';
      // A hora que a pessoa escolheu no "Pôr na TV" (fase 7) vale como está.
      if (a.escolhido) return 'outra';
      const f = ORDEM.find((k) => FAIXAS[k].horaInicio === a.horaInicio && FAIXAS[k].horaFim === a.horaFim);
      return f || 'outra';
    };
    const faixas = itens.map(faixaDe);
    if (!itens.length || faixas.some((f) => f === 'dia' || f === 'outra')) return itens;
    const presentes = ORDEM.filter((k) => faixas.indexOf(k) >= 0);
    const janela = {};
    presentes.forEach((k, i) => {
      const proxima = presentes[i + 1];
      janela[k] = { horaInicio: i === 0 ? '00:00' : FAIXAS[k].horaInicio, horaFim: proxima ? menosUmMinuto(FAIXAS[proxima].horaInicio) : '23:59' };
    });
    return itens.map((it, i) => Object.assign({}, it, { agendamento: Object.assign({}, it.agendamento, janela[faixas[i]]) }));
  }

  /*
   * As peças de uma publicação pelas zonas da tela: 16/9 na zona deitada,
   * 9/16 na em pé (sem isto, tudo caía na principal).
   */
  function distribuirPorZona(pecas, zonas, dias, agora) {
    const saida = {};
    const emPe = zonas.filter((z) => z.formato === 'retrato');
    const deitadas = zonas.filter((z) => z.formato !== 'retrato');
    const alvoDeitada = deitadas[0] && deitadas[0].id;
    const alvoEmPe = emPe[0] && emPe[0].id;
    for (const p of pecas) {
      const vertical = String(p.formato || '').indexOf('9/') === 0;
      const zona = (vertical && alvoEmPe) ? alvoEmPe : alvoDeitada;
      if (!zona) continue;
      if (!saida[zona]) saida[zona] = [];
      saida[zona].push(agendarPeca(p.item, p.faixa, dias, agora));
    }
    Object.keys(saida).forEach((z) => { saida[z] = cobrirODia(saida[z]); });
    return saida;
  }

  /*
   * O "Quando" do Pôr na TV (fase 7): sempre, só hoje, até um dia, numa hora
   * do dia. `agora`: o dia de referência, como em agendarPeca.
   */
  const dia = (iso) => { const p = String(iso).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
  function diasAte(iso, hoje) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return 0;
    const h = hoje ? new Date(hoje) : new Date();
    const zero = new Date(h.getFullYear(), h.getMonth(), h.getDate());
    return Math.max(1, Math.round((dia(iso) - zero) / 864e5) + 1);
  }
  function comQuando(item, escolha, agora) {
    const e = escolha || {};
    if (e.quando === 'hoje') return agendarPeca(item, 'dia', 1, agora);
    if (e.quando === 'ate') { const n = diasAte(e.ate, agora); return n ? agendarPeca(item, 'dia', n, agora) : item; }
    if (e.quando === 'hora') {
      // `escolhido`: foi a pessoa que pôs nesta hora; o cobrirODia (fase 5) não estica pelo resto do dia.
      const com = agendarPeca(item, FAIXAS[e.faixa] ? e.faixa : 'manha', 0, agora);
      return Object.assign({}, com, { agendamento: Object.assign({}, com.agendamento, { escolhido: true }) });
    }
    return item;
  }

  /* ---------------- As zonas pelo papel (era web/src/lib/rodar.js) ---------------- */

  // As zonas do layout da TV, do catálogo (js/templates.js) — as mesmas do painel (screenConfig.js, zonesOf).
  function zonasDe(cfg) {
    const l = raiz.MT_getLayout && raiz.MT_getLayout(cfg && cfg.settings && cfg.settings.layoutId);
    return (l && l.zones) || [];
  }
  // Zona de conteúdo primária (a playlist editável) — a mesma de web/src/lib/contentTypes.js.
  function zonaPrimaria(cfg) {
    const z = (cfg && cfg.zonas) || {};
    if (z.principal && Array.isArray(z.principal.items)) return 'principal';
    const k = Object.keys(z).find((key) => z[key] && Array.isArray(z[key].items));
    return k || 'principal';
  }
  // As zonas de uma config pelo papel: cabeçalho, principal, lateral, rodapé.
  function zonasPorPapel(cfg) {
    const zonas = zonasDe(cfg);
    const listas = zonas.filter((z) => z.type === 'playlist');
    const principal = listas.find((z) => /^(principal|video|z1)$/.test(z.id)) || listas[0] || null;
    const outras = listas.filter((z) => z !== principal);
    const lateral = outras.find((z) => z.id === 'lateral') || outras.find((z) => z.id === 'secundaria') || outras[0] || null;
    return {
      cabecalho: (zonas.find((z) => z.type === 'header') || {}).id || null,
      principal: principal ? principal.id : null,
      lateral: lateral ? lateral.id : null,
      rodape: (zonas.find((z) => z.type === 'ticker') || {}).id || null,
    };
  }

  // O layout com as quatro zonas, deitado e em pé.
  const LAYOUT_COMPLETO = { deitada: 'corporate', emPe: 'portrait-stack' };
  const emPe = (cfg) => /^portrait/.test((cfg && cfg.settings && cfg.settings.layoutId) || '');
  function layoutPara(cfg) { return emPe(cfg) ? LAYOUT_COMPLETO.emPe : LAYOUT_COMPLETO.deitada; }

  const temCabecalho = (e) => e.zonas.cabecalho.pecas.length > 0;
  const temRodape = (e) => e.zonas.rodape.pecas.length > 0 || e.zonas.rodape.mensagens.length > 0;

  // O que a entrada da campanha pede e a TV, no layout de hoje, não tem onde pôr.
  function zonasQueFaltam(cfg, entrada) {
    const z = zonasPorPapel(cfg);
    const faltam = [];
    if (entrada.zonas.lateral.length && !z.lateral) faltam.push('lateral');
    if (temCabecalho(entrada) && !z.cabecalho) faltam.push('cabeçalho');
    if (temRodape(entrada) && !z.rodape) faltam.push('rodapé');
    return faltam;
  }

  /* ---------------- A campanha ---------------- */

  const marcar = (p, nome) => Object.assign({}, p.item, { _campanha: nome });

  /*
   * A config nova de uma TV com a campanha. Não modifica a recebida.
   * `opcoes.trocarLayout`: troca para o layout das quatro zonas quando falta
   * zona. `opcoes.imp`: a importância de cada peça (js/importancia.js) — o
   * painel aplica; no servidor ela já vem aplicada pelo painel.
   */
  function aplicarCampanha(cfg, entrada, nome, opcoes) {
    const o = opcoes || {};
    let next = copia(cfg);
    if (o.trocarLayout && zonasQueFaltam(next, entrada).length) {
      next.settings = Object.assign({}, next.settings || {}, { layoutId: layoutPara(next) });
    }
    const z = zonasPorPapel(next);
    const origem = { chave: '_campanha', valor: nome };
    // Sem lateral na TV, a lateral vai para a principal: nada do que foi pago se perde.
    const imp = typeof o.imp === 'function' ? o.imp : (it) => it;
    const principal = entrada.zonas.principal.map((p) => imp(p.item));
    const lateral = entrada.zonas.lateral.map((p) => imp(p.item));
    const blocos = {};
    if (z.principal) blocos[z.principal] = z.lateral ? principal : principal.concat(lateral);
    if (z.lateral && lateral.length) blocos[z.lateral] = lateral;
    next = aplicarConteudo(next, blocos, origem, 'trocar');

    if (z.cabecalho && temCabecalho(entrada)) {
      const pecas = entrada.zonas.cabecalho.pecas.map((p) => marcar(p, nome));
      const antes = next.zonas[z.cabecalho] || {};
      next.zonas[z.cabecalho] = Object.assign({}, antes, { header: true, peca: pecas[0], pecas },
        entrada.zonas.cabecalho.mensagens.length ? { messages: entrada.zonas.cabecalho.mensagens } : {});
    }
    if (z.rodape && temRodape(entrada)) {
      const pecas = entrada.zonas.rodape.pecas.map((p) => marcar(p, nome));
      const antes = next.zonas[z.rodape] || {};
      next.zonas[z.rodape] = Object.assign({}, antes,
        pecas.length ? { peca: pecas[0], pecas } : {},
        entrada.zonas.rodape.mensagens.length ? { messages: entrada.zonas.rodape.mensagens } : {},
        entrada.zonas.rodape.contagem ? { contagem: entrada.zonas.rodape.contagem } : {});
    }
    return next;
  }

  /*
   * Tira a campanha de uma TV: os itens dela nas playlists, as peças dela no
   * cabeçalho e no rodapé, as frases dela no letreiro e a contagem. O que não
   * é dela fica.
   */
  function tirarCampanha(cfg, entrada, nome) {
    const next = removerOrigem(cfg, { chave: '_campanha', valor: nome });
    const frases = new Set([].concat(entrada.zonas.rodape.mensagens || [], entrada.zonas.cabecalho.mensagens || []));
    for (const k of Object.keys(next.zonas || {})) {
      const zona = next.zonas[k];
      if (!zona || typeof zona !== 'object') continue;
      if (Array.isArray(zona.pecas)) {
        zona.pecas = zona.pecas.filter((p) => !(p && p._campanha === nome));
        if (!zona.pecas.length) delete zona.pecas;
      }
      if (zona.peca && zona.peca._campanha === nome) {
        if (zona.pecas && zona.pecas.length) zona.peca = zona.pecas[0]; else delete zona.peca;
      }
      if (Array.isArray(zona.messages) && frases.size) zona.messages = zona.messages.filter((m) => !frases.has(m));
      if (zona.contagem && zona.contagem === entrada.zonas.rodape.contagem) delete zona.contagem;
    }
    return next;
  }

  /*
   * O "QUANDO" DA CAMPANHA (reteste 2): vale para as peças da campanha que
   * giram no meio e no lado; as faixas de cima e de baixo não têm horário na
   * TV. O que não é da campanha não muda.
   */
  function quandoNaCampanha(cfg, nome, escolha, agora) {
    if (!cfg || !escolha || !escolha.quando || escolha.quando === 'sempre') return cfg;
    const next = Object.assign({}, cfg, { zonas: Object.assign({}, cfg.zonas || {}) });
    for (const id of Object.keys(next.zonas)) {
      const z = next.zonas[id];
      if (!z || !Array.isArray(z.items) || !z.items.some((it) => it && it._campanha === nome)) continue;
      next.zonas[id] = Object.assign({}, z, { items: z.items.map((it) => (it && it._campanha === nome ? comQuando(it, escolha, agora) : it)) });
    }
    return next;
  }

  /* ---------------- A peça pronta e a publicação ---------------- */

  /*
   * UMA PEÇA PRONTA (EXECUTOR §2c, item 34): a zona sai do papel da peça —
   * faixa no cabeçalho ou no rodapé, em pé na lateral, deitada na principal —
   * e, sem a zona certa, ela vai para a principal. Entra no fim da zona.
   */
  function aplicarPeca(cfg, peca) {
    const next = copia(cfg);
    if (!next.zonas) next.zonas = {};
    const z = zonasPorPapel(next);
    const item = Object.assign({}, peca.item, peca.campanha ? { _campanha: peca.campanha } : {});
    const papel = peca.papel || (peca.item && peca.item.papel) || '';
    if ((papel === 'cabecalho' || papel === 'rodape') && z[papel]) {
      const atual = next.zonas[z[papel]] || {};
      const lista = (Array.isArray(atual.pecas) && atual.pecas.length ? atual.pecas : (atual.peca ? [atual.peca] : [])).concat(Object.assign({ duracao: 20 }, item));
      next.zonas[z[papel]] = Object.assign({}, atual, papel === 'cabecalho' ? { header: true } : {}, { pecas: lista, peca: lista[0] });
      return next;
    }
    if (papel === 'cabecalho' || papel === 'rodape') return next; // a TV não tem essa faixa: nada a fazer
    const vertical = String(peca.formato || item.formato || '').indexOf('9/') === 0;
    const zona = (vertical && z.lateral) ? z.lateral : (z.principal || z.lateral);
    if (!zona) return next;
    const atual = next.zonas[zona] || { items: [] };
    next.zonas[zona] = Object.assign({}, atual, { items: (Array.isArray(atual.items) ? atual.items : []).concat(item) });
    return next;
  }

  // Peça de cabeçalho ou de rodapé: vai para a lista da faixa, nunca para uma playlist.
  const ehFaixa = (p) => { const papel = (p.item && p.item.papel) || p.papel; return papel === 'cabecalho' || papel === 'rodape'; };

  /*
   * PUBLICAR PEÇAS numa TV (era web/src/lib/publicar.js, montar): a peça em
   * pé na zona em pé, a deitada na deitada, com a faixa de horário de cada
   * uma; 'trocar' substitui só o que veio desta origem (`titulo`) e
   * 'limpar' (`substituir`) esvazia a zona. As faixas de cabeçalho e rodapé
   * seguem o caminho das peças prontas.
   */
  function montarPublicacao(cfg, publicacao, agora) {
    const pub = publicacao || {};
    const todas = pub.pecas || [];
    const titulo = pub.titulo;
    const dias = pub.dias || 0;
    const faixas = todas.filter(ehFaixa);
    const pecas = todas.filter((p) => !ehFaixa(p));
    const zonas = zonasDe(cfg).filter((z) => z.type === 'playlist');
    let blocos = distribuirPorZona(pecas, zonas, dias, agora);
    if (!Object.keys(blocos).length && pecas.length) {
      blocos = { [zonaPrimaria(cfg)]: cobrirODia(pecas.map((p) => agendarPeca(p.item, p.faixa, dias, agora))) };
    }
    let novaCfg = pecas.length ? aplicarConteudo(cfg, blocos, { chave: '_campanha', valor: titulo }, pub.substituir ? 'limpar' : 'trocar') : cfg;
    if (faixas.length) {
      // Publicar de novo troca as faixas desta mesma origem, como nas playlists.
      const z = zonasPorPapel(novaCfg);
      for (const papel of ['cabecalho', 'rodape']) {
        const zona = z[papel] && novaCfg.zonas[z[papel]];
        if (!zona || !Array.isArray(zona.pecas)) continue;
        const resto = zona.pecas.filter((p) => !(p && p._campanha === titulo));
        if (resto.length !== zona.pecas.length) {
          novaCfg = Object.assign({}, novaCfg, { zonas: Object.assign({}, novaCfg.zonas, { [z[papel]]: Object.assign({}, zona, { pecas: resto, peca: resto[0] }) }) });
          if (!resto.length) { delete novaCfg.zonas[z[papel]].pecas; delete novaCfg.zonas[z[papel]].peca; }
        }
      }
      for (const p of faixas) novaCfg = aplicarPeca(novaCfg, Object.assign({}, p, { campanha: titulo }));
    }
    return novaCfg;
  }

  return {
    CHAVES_ORIGEM, origemDoItem, aplicarConteudo, removerOrigem,
    FAIXAS, agendarPeca, cobrirODia, distribuirPorZona, diasAte, comQuando,
    zonasDe, zonaPrimaria, zonasPorPapel, LAYOUT_COMPLETO, layoutPara, zonasQueFaltam,
    aplicarCampanha, tirarCampanha, quandoNaCampanha, aplicarPeca, montarPublicacao,
  };
});
