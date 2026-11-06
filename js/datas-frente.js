/*
 * js/datas-frente.js — as datas prontas de cada frente (fase 11, "calendário
 * de datas pronto para cada frente").
 *
 * O dono não precisa lembrar que maio tem o Dia das Mães no 2º domingo, que
 * setembro é Amarelo ou que a SIPAT pede aviso: a Agenda já oferece as datas
 * que vêm, da frente da conta, e cada uma vai para a programação com um
 * toque (o mesmo caminho do "Colar o calendário": evento → peça → TV).
 *
 * As datas se calculam para o ano (js/datas-br.js): Dia das Mães, Dia dos
 * Pais, Páscoa e Black Friday mudam todo ano. As campanhas de mês inteiro
 * (Outubro Rosa) passam o mês todo: o evento é o último dia do mês, e a
 * antecedência cobre do dia 1º em diante. As que cada empresa marca (SIPAT,
 * eleição da CIPA, aniversário da empresa) vêm sem dia: a pessoa escolhe.
 *
 * Módulo duplo: require() no servidor (server/calendario.js entende os nomes
 * no texto colado) e no teste; MTDatasFrente no painel.
 */
(function (raiz, fabrica) {
  var D = raiz.MTDatasBR || (typeof require === 'function' ? require('./datas-br.js') : null);
  var api = fabrica(D);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTDatasFrente = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (D) {
  'use strict';

  var fixo = function (mes, dia) { return { tipo: 'fixo', mes: mes, dia: dia }; };
  var mes = function (m) { return { tipo: 'mes', mes: m }; };
  var semana = function (m, s, d) { return { tipo: 'semana', mes: m, semana: s, diaSemana: d }; };

  // As que servem a mais de uma frente.
  var NATAL = { id: 'natal', titulo: 'Natal', quando: fixo(12, 25), tipo: 'comemorativa', antecedencia: 20 };
  var ANO_NOVO = { id: 'ano-novo', titulo: 'Ano Novo', quando: fixo(12, 31), tipo: 'comemorativa', antecedencia: 5 };
  var MULHER = { id: 'dia-mulher', titulo: 'Dia da Mulher', quando: fixo(3, 8), tipo: 'comemorativa', antecedencia: 5 };
  var MAES = { id: 'dia-maes', titulo: 'Dia das Mães', quando: semana(5, 2, 0), tipo: 'comemorativa', antecedencia: 10 };
  var PAIS = { id: 'dia-pais', titulo: 'Dia dos Pais', quando: semana(8, 2, 0), tipo: 'comemorativa', antecedencia: 10 };
  var SETEMBRO = { id: 'setembro-amarelo', titulo: 'Setembro Amarelo', quando: mes(9), tipo: 'campanha', detalhe: 'Prevenção do suicídio: falar é a melhor solução' };
  var OUTUBRO = { id: 'outubro-rosa', titulo: 'Outubro Rosa', quando: mes(10), tipo: 'campanha', detalhe: 'Prevenção do câncer de mama' };
  var NOVEMBRO = { id: 'novembro-azul', titulo: 'Novembro Azul', quando: mes(11), tipo: 'campanha', detalhe: 'Saúde do homem e prevenção do câncer de próstata' };

  var DATAS = {
    comercio: [
      { id: 'liquidacao-janeiro', titulo: 'Liquidação de janeiro', quando: fixo(1, 15), tipo: 'campanha', detalhe: 'Queima de estoque depois das festas', antecedencia: 10 },
      { id: 'volta-as-aulas', titulo: 'Volta às aulas', quando: fixo(2, 2), tipo: 'campanha', antecedencia: 14 },
      { id: 'carnaval', titulo: 'Carnaval', quando: { tipo: 'pascoa', desloc: -47 }, tipo: 'comemorativa', antecedencia: 7 },
      MULHER,
      { id: 'dia-consumidor', titulo: 'Dia do Consumidor', quando: fixo(3, 15), tipo: 'campanha', antecedencia: 7 },
      { id: 'pascoa', titulo: 'Páscoa', quando: { tipo: 'pascoa', desloc: 0 }, tipo: 'comemorativa', antecedencia: 14 },
      MAES,
      { id: 'dia-namorados', titulo: 'Dia dos Namorados', quando: fixo(6, 12), tipo: 'comemorativa', antecedencia: 10 },
      { id: 'festa-junina', titulo: 'Festa Junina', quando: fixo(6, 24), tipo: 'comemorativa', antecedencia: 14 },
      PAIS,
      { id: 'dia-cliente', titulo: 'Dia do Cliente', quando: fixo(9, 15), tipo: 'campanha', antecedencia: 7 },
      { id: 'dia-criancas', titulo: 'Dia das Crianças', quando: fixo(10, 12), tipo: 'comemorativa', antecedencia: 10 },
      { id: 'black-friday', titulo: 'Black Friday', quando: semana(11, -1, 5), tipo: 'campanha', antecedencia: 10 },
      NATAL,
      ANO_NOVO,
    ],
    saude: [
      { id: 'janeiro-branco', titulo: 'Janeiro Branco', quando: mes(1), tipo: 'campanha', detalhe: 'Cuidar da saúde mental' },
      { id: 'fevereiro-roxo-laranja', titulo: 'Fevereiro Roxo e Laranja', quando: mes(2), tipo: 'campanha', detalhe: 'Lúpus, fibromialgia e Alzheimer; leucemia e doação de medula' },
      { id: 'marco-lilas', titulo: 'Março Lilás', quando: mes(3), tipo: 'campanha', detalhe: 'Prevenção do câncer do colo do útero' },
      MULHER,
      { id: 'abril-azul', titulo: 'Abril Azul', quando: mes(4), tipo: 'campanha', detalhe: 'Conscientização sobre o autismo' },
      { id: 'dia-saude', titulo: 'Dia Mundial da Saúde', quando: fixo(4, 7), tipo: 'comemorativa', antecedencia: 5 },
      { id: 'vacinacao-gripe', titulo: 'Vacinação contra a gripe', quando: fixo(4, 10), tipo: 'campanha', detalhe: 'Confira as datas e os grupos do seu município', antecedencia: 10 },
      { id: 'maio-amarelo', titulo: 'Maio Amarelo', quando: mes(5), tipo: 'campanha', detalhe: 'Segurança no trânsito' },
      MAES,
      { id: 'junho-vermelho', titulo: 'Junho Vermelho', quando: mes(6), tipo: 'campanha', detalhe: 'Doe sangue: uma doação salva até quatro vidas' },
      { id: 'julho-amarelo', titulo: 'Julho Amarelo', quando: mes(7), tipo: 'campanha', detalhe: 'Prevenção das hepatites virais' },
      { id: 'agosto-dourado', titulo: 'Agosto Dourado', quando: mes(8), tipo: 'campanha', detalhe: 'Aleitamento materno' },
      SETEMBRO,
      OUTUBRO,
      { id: 'vacinacao-multi', titulo: 'Atualize a caderneta de vacinação', quando: fixo(10, 17), tipo: 'campanha', detalhe: 'Dia Nacional da Vacinação: confira as vacinas em dia', antecedencia: 7 },
      NOVEMBRO,
      { id: 'dezembro-vermelho', titulo: 'Dezembro Vermelho', quando: mes(12), tipo: 'campanha', detalhe: 'Prevenção do HIV e da aids' },
      NATAL,
    ],
    empresa: [
      MULHER,
      { id: 'abril-verde', titulo: 'Abril Verde', quando: mes(4), tipo: 'campanha', detalhe: 'Segurança e saúde no trabalho' },
      { id: 'dia-trabalho', titulo: 'Dia do Trabalho', quando: fixo(5, 1), tipo: 'feriado', antecedencia: 5 },
      MAES,
      PAIS,
      SETEMBRO,
      OUTUBRO,
      NOVEMBRO,
      { id: 'confraternizacao', titulo: 'Confraternização de fim de ano', quando: semana(12, 3, 5), tipo: 'evento', detalhe: 'Confira a data, a hora e o local', antecedencia: 14 },
      NATAL,
      ANO_NOVO,
      // As que cada empresa marca: a pessoa escolhe o dia.
      { id: 'sipat', titulo: 'SIPAT', quando: null, tipo: 'evento', detalhe: 'Semana Interna de Prevenção de Acidentes', antecedencia: 14 },
      { id: 'cipa', titulo: 'Eleição da CIPA', quando: null, tipo: 'aviso', detalhe: 'Vote no seu representante', antecedencia: 7 },
      { id: 'aniversario-empresa', titulo: 'Aniversário da empresa', quando: null, tipo: 'comemorativa', antecedencia: 7 },
    ],
  };

  var dois = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (d) { return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate()); };

  /*
   * Quando a data cai, a partir de `hoje`: { data, antecedencia, mesInteiro }.
   * A campanha de mês inteiro termina no último dia do mês e começa no 1º —
   * a do mês corrente ainda vale (Novembro Azul no dia 6 de novembro).
   */
  function ocorrencia(d, hoje) {
    if (!d.quando || !D) return null;
    var hojeIso = iso(hoje);
    for (var ano = hoje.getFullYear(); ano <= hoje.getFullYear() + 1; ano++) {
      if (d.quando.tipo === 'mes') {
        var fim = new Date(ano, d.quando.mes, 0);
        if (iso(fim) >= hojeIso) return { data: iso(fim), antecedencia: fim.getDate() - 1, mesInteiro: true };
        continue;
      }
      var alvo = D.quandoCai(d.quando, ano);
      if (alvo && iso(alvo) >= hojeIso) return { data: iso(alvo), antecedencia: d.antecedencia != null ? d.antecedencia : 7, mesInteiro: false };
    }
    return null;
  }

  /*
   * As datas que vêm, da frente: as com dia, em ordem, nos próximos 12
   * meses; depois as sem dia (a pessoa escolhe). Cada uma já no formato do
   * evento do calendário (server/calendario.js, normalizar).
   */
  function proximas(frente, hoje) {
    var agora = hoje || new Date();
    var limite = iso(new Date(agora.getFullYear() + 1, agora.getMonth(), agora.getDate()));
    var lista = DATAS[frente] || DATAS.comercio;
    var comDia = [];
    var semDia = [];
    lista.forEach(function (d) {
      var base = { id: d.id, titulo: d.titulo, tipo: d.tipo, detalhe: d.detalhe || '' };
      if (!d.quando) { semDia.push(Object.assign(base, { data: '', antecedencia: d.antecedencia || 7, semDia: true })); return; }
      var o = ocorrencia(d, agora);
      if (o && o.data <= limite) comDia.push(Object.assign(base, o));
    });
    comDia.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    return comDia.concat(semDia);
  }

  // Todas as datas com dia, de todas as frentes, sem repetir (para ler os nomes no texto colado).
  function todas() {
    var vistos = {};
    var saida = [];
    Object.keys(DATAS).forEach(function (f) {
      DATAS[f].forEach(function (d) { if (d.quando && !vistos[d.id]) { vistos[d.id] = true; saida.push(d); } });
    });
    return saida;
  }

  return { DATAS: DATAS, proximas: proximas, ocorrencia: ocorrencia, todas: todas };
});
