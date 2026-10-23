/*
 * js/quiz.js — o quiz da TV (EXECUTOR D21).
 *
 * Pergunta, alternativas, o tempo correndo, a resposta certa e a
 * explicação. Na fábrica é a SIPAT ("qual EPI protege do ruído?"), na loja
 * é a curiosidade do produto, na clínica é a prevenção do mês. Prende o
 * olho de quem passa — e é por isso mesmo que fato errado na parede é pior
 * que nenhum: o que a IA escreve entra como NÃO conferido, e a TV só mostra
 * a pergunta que uma pessoa conferiu.
 *
 * Módulo duplo como precos.js: `require()` no servidor e nos testes,
 * `window.MTQuiz` na TV e no painel — a mesma regra nos três lugares.
 * Sem spread de objeto: roda em TV antiga.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTQuiz = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIMITES = { pergunta: 140, alternativa: 60, explicacao: 180, perguntas: 12 };
  var TEMPOS = [5, 8, 10, 15, 20, 30];
  var LETRAS = ['A', 'B', 'C', 'D'];

  function texto(v, n) {
    return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  }

  /*
   * Uma pergunta só vale com enunciado, de 2 a 4 alternativas preenchidas e
   * a certa apontando para uma delas. `revisada` é false só quando veio da
   * IA e ninguém conferiu; a digitada pela pessoa já nasce conferida.
   */
  function pergunta(p) {
    if (!p || typeof p !== 'object') return null;
    var enunciado = texto(p.pergunta, LIMITES.pergunta);
    var alts = (Array.isArray(p.alternativas) ? p.alternativas : []).slice(0, 4).map(function (a) { return texto(a, LIMITES.alternativa); });
    var certa = Number(p.certa);
    // Alternativa vazia sai; a certa acompanha a posição.
    var limpas = [];
    var novaCerta = -1;
    alts.forEach(function (a, i) { if (a) { if (i === certa) novaCerta = limpas.length; limpas.push(a); } });
    if (!enunciado || limpas.length < 2 || novaCerta < 0) return null;
    return {
      pergunta: enunciado,
      alternativas: limpas,
      certa: novaCerta,
      explicacao: texto(p.explicacao, LIMITES.explicacao),
      revisada: p.revisada !== false,
    };
  }

  function normalizar(item) {
    var it = item && typeof item === 'object' ? item : {};
    var perguntas = (Array.isArray(it.perguntas) ? it.perguntas : []).map(pergunta).filter(Boolean).slice(0, LIMITES.perguntas);
    var tempo = Number(it.tempo);
    var revelar = Number(it.revelar);
    return {
      type: 'quiz',
      titulo: texto(it.titulo, 40) || 'Quiz',
      perguntas: perguntas,
      tempo: TEMPOS.indexOf(tempo) >= 0 ? tempo : 10,
      revelar: isFinite(revelar) && revelar >= 4 ? Math.min(15, Math.round(revelar)) : 7,
    };
  }

  // As perguntas que podem ir ao ar: as conferidas.
  function prontas(item) { return normalizar(item).perguntas.filter(function (p) { return p.revisada; }); }
  // Quantas a IA escreveu e ninguém conferiu ainda.
  function pendentes(item) { return normalizar(item).perguntas.filter(function (p) { return !p.revisada; }).length; }

  // Quanto o quiz fica na tela: cada pergunta com o tempo de responder e o de mostrar a resposta.
  function duracao(item) {
    var q = normalizar(item);
    var n = prontas(item).length;
    return n ? n * (q.tempo + q.revelar) : 0;
  }

  return { normalizar: normalizar, pergunta: pergunta, prontas: prontas, pendentes: pendentes, duracao: duracao, LIMITES: LIMITES, TEMPOS: TEMPOS, LETRAS: LETRAS };
});
