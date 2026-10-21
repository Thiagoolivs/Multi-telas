/*
 * js/expediente.js — o horário da loja, uma regra só para o servidor e a TV.
 *
 * Nasceu dentro de server/vigia.js, para o alerta de queda não acordar
 * ninguém de madrugada. Agora a TV também usa (EXECUTOR, item 8): fora do
 * horário ela pode ficar preta ou mostrar só o relógio. Se cada lado tivesse
 * a sua conta, um dia a TV apagaria às 22h e o vigia acharia que ela caiu.
 *
 *   dias          0 = domingo … 6 = sábado
 *   inicio, fim   "HH:MM". Igual = 24 horas. Fim antes do início (bar das
 *                 18h às 2h) atravessa a meia-noite, e a madrugada pertence
 *                 ao dia em que o expediente COMEÇOU.
 *   fuso          o do relógio do dono da loja (o servidor roda em UTC)
 *   alerta        avisa por e-mail quando a tela cai no expediente
 *   foraDoHorario o que a TV mostra fora dele: 'ligada' (continua como
 *                 sempre — o padrão, para nenhuma TV apagar sem o dono ter
 *                 escolhido), 'preta' ou 'relogio'
 *
 * Módulo duplo: require() no Node, MTExpediente no navegador.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTExpediente = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var FORA = ['ligada', 'preta', 'relogio'];
  var PADRAO = Object.freeze({
    alerta: true,
    dias: [1, 2, 3, 4, 5, 6],
    inicio: '07:00',
    fim: '22:00',
    fuso: 'America/Sao_Paulo',
    foraDoHorario: 'ligada',
  });

  function hhmm(v, padrao) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(v || ''));
    if (!m) return padrao;
    var h = Number(m[1]), mi = Number(m[2]);
    if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return padrao;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  }

  /* Aceita o que vier (JSON do banco, corpo da requisição) e devolve algo válido. */
  function normalizar(bruto) {
    var e = bruto;
    if (typeof e === 'string') { try { e = JSON.parse(e); } catch (_) { e = null; } }
    if (!e || typeof e !== 'object') return Object.assign({}, PADRAO, { dias: PADRAO.dias.slice() });
    var dias = Array.isArray(e.dias)
      ? Array.from(new Set(e.dias.map(Number).filter(function (d) { return Number.isInteger(d) && d >= 0 && d <= 6; }))).sort()
      : PADRAO.dias.slice();
    var fuso = PADRAO.fuso;
    if (typeof e.fuso === 'string') {
      try { new Intl.DateTimeFormat('en-US', { timeZone: e.fuso }); fuso = e.fuso; } catch (_) { /* fuso inválido: padrão */ }
    }
    return {
      alerta: e.alerta !== false,
      dias: dias,
      inicio: hhmm(e.inicio, PADRAO.inicio),
      fim: hhmm(e.fim, PADRAO.fim),
      fuso: fuso,
      foraDoHorario: FORA.indexOf(e.foraDoHorario) >= 0 ? e.foraDoHorario : PADRAO.foraDoHorario,
    };
  }

  var formatadores = {};
  /* O dia da semana e o minuto do dia no fuso da loja. */
  function relogioLocal(t, fuso) {
    if (!formatadores[fuso]) {
      formatadores[fuso] = new Intl.DateTimeFormat('en-US', {
        timeZone: fuso, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      });
    }
    var partes = formatadores[fuso].formatToParts(new Date(t));
    var val = function (tipo) { var p = partes.find(function (x) { return x.type === tipo; }); return p ? p.value : ''; };
    var dia = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(val('weekday'));
    return { dia: dia, min: Number(val('hour')) * 60 + Number(val('minute')) };
  }

  var emMin = function (s) { return Number(s.slice(0, 2)) * 60 + Number(s.slice(3)); };

  /*
   * O instante `t` está dentro do expediente? `relogio` é opcional: o vigia
   * passa o dele, com memória (varre centenas de telas a cada 5 minutos).
   */
  function dentro(t, exp, relogio) {
    var r = (relogio || relogioLocal)(t, exp.fuso);
    var ini = emMin(exp.inicio), fim = emMin(exp.fim);
    if (ini === fim) return exp.dias.indexOf(r.dia) >= 0;
    if (ini < fim) return exp.dias.indexOf(r.dia) >= 0 && r.min >= ini && r.min < fim;
    if (r.min >= ini) return exp.dias.indexOf(r.dia) >= 0;
    if (r.min < fim) return exp.dias.indexOf((r.dia + 6) % 7) >= 0;
    return false;
  }

  /*
   * O que a TV mostra agora: 'normal', 'preta' ou 'relogio'. Sem expediente
   * na config (tela que nunca teve horário), sempre 'normal'.
   */
  function estadoDaTela(t, bruto) {
    if (!bruto) return 'normal';
    var exp = normalizar(bruto);
    if (exp.foraDoHorario === 'ligada') return 'normal';
    return dentro(t, exp) ? 'normal' : exp.foraDoHorario;
  }

  return { PADRAO: PADRAO, FORA: FORA, normalizar: normalizar, relogioLocal: relogioLocal, dentro: dentro, estadoDaTela: estadoDaTela };
});
