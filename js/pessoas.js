/*
 * js/pessoas.js — as pessoas da empresa (EXECUTOR D30). A regra é uma só
 * para o servidor e o painel: o painel mostra o que vai acontecer, o
 * servidor faz exatamente isso.
 *
 * A planilha do RH (Excel ou CSV) entra por aqui: cada linha vira uma pessoa
 * — nome, setor, cargo, matrícula, e-mail, dia e mês do aniversário e foto.
 * O ANO do nascimento não é guardado: a TV só precisa do dia (LGPD: o
 * mínimo que serve).
 *
 * Importar de novo SINCRONIZA só o que veio da planilha: quem saiu dela sai,
 * quem continua é atualizado (sem perder a foto que já tinha) e quem chegou
 * por outro caminho — o QR, à mão no painel — fica.
 *
 * Módulo duplo: require() no Node, MTPessoas no navegador.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPessoas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LIMITE = 2000;
  var ORIGENS = ['planilha', 'qr', 'manual'];
  var MARCAS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

  function corta(s, n) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n); }
  function plano(s) { return String(s == null ? '' : s).normalize('NFD').replace(MARCAS, '').trim().toLowerCase(); }

  var DIAS_DO_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  function valida(dia, mes) {
    dia = Number(dia); mes = Number(mes);
    if (!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= DIAS_DO_MES[mes - 1])) return null;
    return { dia: dia, mes: mes };
  }

  /*
   * O aniversário: dia e mês em colunas, "DD/MM", "DD/MM/AAAA", "AAAA-MM-DD"
   * ou o número que o Excel guarda na célula de data (dias desde 30/12/1899).
   */
  function diaEMes(r) {
    var d = parseInt(r.dia, 10), m = parseInt(r.mes, 10);
    if (d && m) return valida(d, m);
    var n = r.nascimento;
    if (n == null || n === '') return null;
    var s = String(n).trim();
    if (typeof n === 'number' || /^\d{4,5}(\.\d+)?$/.test(s)) {
      var serial = Math.floor(Number(s));
      if (serial > 0 && serial < 80000) {
        var data = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
        return valida(data.getUTCDate(), data.getUTCMonth() + 1);
      }
      return null;
    }
    var iso = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (iso) return valida(iso[3], iso[2]);
    var br = /(\d{1,2})[\/\-.](\d{1,2})/.exec(s);
    return br ? valida(br[1], br[2]) : null;
  }

  // A foto é um arquivo da conta (/media/...) ou um endereço https; o resto não vai para a TV.
  function foto(u) {
    var s = corta(u, 400);
    return /^\/media\/[\w.\-\/]+$/.test(s) || /^https:\/\/[^\s"'<>]+$/.test(s) ? s : '';
  }
  function email(e) {
    var s = corta(e, 120).toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
  }

  // Uma linha (da planilha ou do painel) vira pessoa — ou null, sem nome ou sem aniversário.
  function normalizar(r) {
    if (!r) return null;
    var nome = corta(r.nome, 80);
    if (!nome) return null;
    var d = diaEMes(r);
    if (!d) return null;
    return {
      nome: nome,
      matricula: corta(r.matricula, 40),
      setor: corta(r.setor, 60),
      cargo: corta(r.cargo, 80),
      email: email(r.email),
      foto: foto(r.foto),
      dia: d.dia, mes: d.mes,
    };
  }

  // Quem é quem entre duas importações: a matrícula (sem zeros à esquerda); sem ela, o nome com o aniversário.
  function chave(p) {
    var m = plano(p.matricula).replace(/^0+(?=.)/, '');
    return m ? 'm:' + m : 'n:' + plano(p.nome) + '|' + p.dia + '/' + p.mes;
  }

  function origemDe(p) { return ORIGENS.indexOf(p && p.origem) >= 0 ? p.origem : 'planilha'; }

  /*
   * O plano de uma importação, antes de gravar:
   *   entram     — pessoas novas (origem planilha);
   *   atualizam  — [{ id, pessoa }]: a foto e o e-mail de antes ficam se a
   *                linha não trouxer; quem estava pelo QR passa a ser do RH;
   *   saem       — ids de quem veio da planilha e não está mais nela;
   *   ficam      — quantas pessoas do QR ou de à mão continuam como estão;
   *   ignoradas  — linhas sem nome ou sem aniversário (ou repetidas).
   */
  function planoDeImportacao(atuais, linhas) {
    atuais = atuais || [];
    var novas = [];
    var vistas = {};
    (linhas || []).forEach(function (l) {
      if (novas.length >= LIMITE) return;
      var p = normalizar(l);
      if (!p) return;
      var k = chave(p);
      if (vistas[k]) return;
      vistas[k] = true;
      novas.push(p);
    });
    var porChave = {};
    atuais.forEach(function (a) { var k = chave(a); if (!porChave[k]) porChave[k] = a; });
    var usadas = {};
    var entram = [];
    var atualizam = [];
    novas.forEach(function (p) {
      var a = porChave[chave(p)];
      if (a && !usadas[a.id]) {
        usadas[a.id] = true;
        atualizam.push({ id: a.id, pessoa: Object.assign({}, p, { foto: p.foto || a.foto || '', email: p.email || a.email || '', origem: 'planilha' }) });
      } else {
        entram.push(Object.assign({}, p, { origem: 'planilha' }));
      }
    });
    var resto = atuais.filter(function (a) { return !usadas[a.id]; });
    return {
      entram: entram,
      atualizam: atualizam,
      saem: resto.filter(function (a) { return origemDe(a) === 'planilha'; }).map(function (a) { return a.id; }),
      ficam: resto.filter(function (a) { return origemDe(a) !== 'planilha'; }).length,
      ignoradas: (linhas || []).length - novas.length,
    };
  }

  /*
   * As colunas da planilha, pelo cabeçalho (sem acento, minúsculo). Setor e
   * cargo agora são colunas diferentes.
   */
  var COLUNAS = [
    ['nome', function (h) { return h.indexOf('nome') >= 0; }],
    ['matricula', function (h) { return /matricula|registro|cracha|codigo/.test(h) || h === 'id'; }],
    ['nascimento', function (h) { return /nascimento|aniversario|^data/.test(h); }],
    ['dia', function (h) { return h === 'dia' || /^dia\b/.test(h); }],
    ['mes', function (h) { return h === 'mes' || /^mes\b/.test(h); }],
    ['setor', function (h) { return /setor|departamento|depto|^area|equipe/.test(h); }],
    ['cargo', function (h) { return /cargo|funcao/.test(h); }],
    ['email', function (h) { return /e-?mail/.test(h); }],
    ['foto', function (h) { return /foto|imagem/.test(h); }],
  ];
  function colunas(cabecalho) {
    var h = (cabecalho || []).map(plano);
    var out = {};
    COLUNAS.forEach(function (c) {
      var i = h.findIndex(function (x, j) { return c[1](x) && Object.keys(out).every(function (k) { return out[k] !== j; }); });
      if (i >= 0) out[c[0]] = i;
    });
    return out;
  }

  // A planilha (linhas de células, a primeira é o cabeçalho) vira as linhas para normalizar.
  function linhasDaPlanilha(matriz) {
    if (!matriz || matriz.length < 2) return [];
    var c = colunas(matriz[0]);
    if (c.nome == null) return [];
    var out = [];
    for (var r = 1; r < matriz.length; r++) {
      var linha = matriz[r] || [];
      var o = {};
      Object.keys(c).forEach(function (k) { var v = linha[c[k]]; if (v != null && v !== '') o[k] = typeof v === 'number' ? v : String(v).trim(); });
      if (o.nome) out.push(o);
    }
    return out;
  }

  return {
    LIMITE: LIMITE, ORIGENS: ORIGENS,
    normalizar: normalizar, chave: chave, diaEMes: diaEMes, origemDe: origemDe,
    planoDeImportacao: planoDeImportacao, colunas: colunas, linhasDaPlanilha: linhasDaPlanilha,
  };
});
