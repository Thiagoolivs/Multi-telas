/*
 * js/regras-de-conteudo.js — o que a peça e a legenda NÃO podem dizer, e o
 * que elas dizem sem ninguém ter dito.
 *
 * QA de lançamento, 03/11: "Remédio X cura a gripe em 1 dia" passou pela
 * conversa, pelos textos, pela porta e foi salvo "pronto" — na TV e na
 * legenda do Instagram. Quem corrigia era só o modelo, e só quando queria.
 * Aqui a regra vira CÓDIGO, igual para todos os caminhos (peça, textos da
 * campanha, redes), e o mesmo arquivo serve ao painel.
 *
 * Duas partes:
 *
 *   TERMOS   conferir(texto, { perfil, contexto }) → { bloqueios, avisos }
 *            Bloqueio: o que a lei barra em propaganda (promessa de cura em
 *            saúde, medicamento com promessa, cigarro eletrônico). Quem gera
 *            pede de novo ao modelo com o motivo; se ele insistir, a peça não
 *            fica "pronta" e a pessoa recebe a explicação e uma sugestão.
 *            Aviso: o que PODE ferir o código de ética de um conselho
 *            (dentista e médico anunciando preço, parcelamento, "grátis") —
 *            na dúvida, avisa e deixa a pessoa decidir.
 *
 *   FATOS    conferirFatos(texto, permitidos, { hoje }) → avisos
 *            Preço, porcentagem, parcelas, data e horário que aparecem na peça
 *            e não estavam no pedido, no combinado nem na marca ("Confira:
 *            R$ 189,90 não estava no seu pedido"), e data com o dia da semana
 *            errado ("Sábado, 12/11" quando 12/11 é quinta).
 *
 * As listas são de propósito curtas e conservadoras: é melhor deixar passar
 * uma frase rara (o modelo e a pessoa ainda leem) do que recusar "curativo"
 * numa farmácia. O que cada regra cobre está nos testes
 * (test/regras-de-conteudo.test.js). Base: Anvisa RDC 96/2008 (propaganda de
 * medicamento), CDC art. 37 (publicidade enganosa), Código de Ética
 * Odontológica (CFO, Res. 118/2012, cap. XVI) e Res. CFM 2.336/2023
 * (publicidade médica). Não é parecer jurídico: docs/FRENTES.md diz o que
 * ainda precisa ser conferido com o advogado.
 *
 * Módulo duplo: require() no Node, MTRegrasDeConteudo no navegador. ES5, sem
 * spread (o mesmo estilo de js/cor.js).
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTRegrasDeConteudo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Minúsculo e sem acento, com o MESMO comprimento do original (o trecho achado é recortado dele).
  function normal(s) {
    return String(s == null ? '' : s).normalize('NFC').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }
  function original(s) { return String(s == null ? '' : s).normalize('NFC'); }

  /* ======================= TERMOS ======================= */

  /*
   * Saúde: promessa de resultado. A propaganda de serviço e produto de saúde
   * não pode prometer cura nem resultado garantido (CDC art. 37; Anvisa; os
   * conselhos). "Elimine a água parada" é campanha de prevenção, não
   * promessa: o "elimina" só conta quando não é sobre o criadouro do mosquito.
   */
  var SAUDE = [
    { id: 'cura', re: /\b(cura|curam|curar|curou|curado|curada|curados|curadas|cure|curem|curativa)\b/g,
      motivo: 'promete cura, e propaganda de saúde não pode prometer cura',
      sugestao: 'Alívio para os sintomas — fale com o farmacêutico' },
    { id: 'elimina', re: /\belimin(a|am|ar|ou|e|em|acao)\b(?!\s+(a |o |os |as )?(agua|criadouro|foco|lixo|recipiente|entulho))/g,
      motivo: 'promete eliminar o problema, o que é promessa de resultado',
      sugestao: 'Ajuda a cuidar da sua saúde' },
    { id: 'cem', re: /\b100\s?%/g,
      motivo: 'promete resultado total ("100%"), o que é promessa de resultado',
      sugestao: 'Cuidado de verdade, com orientação profissional' },
    { id: 'garantido', re: /\b(garantid[oa]s?|garante|garantem|garantimos|garantia de (resultado|cura|sucesso))\b/g,
      motivo: 'garante resultado, e resultado em saúde não se garante',
      sugestao: 'Com acompanhamento profissional' },
    { id: 'colaterais', re: /\bsem (efeitos? colatera(l|is)|contra-?indicac(ao|oes)|riscos?)\b/g,
      motivo: 'diz que não tem efeito colateral ou risco, o que a Anvisa proíbe afirmar',
      sugestao: 'Converse com o farmacêutico ou o médico antes de usar' },
    { id: 'milagre', re: /\b(milagr(e|es|oso|osa|osos|osas)|infaliv(el|eis))\b/g,
      motivo: 'promete efeito milagroso',
      sugestao: 'Cuidado no dia a dia, com orientação' },
    { id: 'acaba', re: /\bacab(a|am|e) com (a |o |as |os |sua |seu )?(dor|dores|gripe|tosse|febre|doenca|doencas|infeccao|queda|calvicie|celulite|rugas|espinhas|acne|ansiedade|insonia)\b/g,
      motivo: 'promete acabar com o problema de saúde',
      sugestao: 'Alívio para os sintomas' },
    { id: 'antesdepois', re: /\bantes\s*(e|&|\/|x)\s*depois\b/g,
      motivo: 'mostra "antes e depois", que os conselhos de medicina e odontologia proíbem em propaganda',
      sugestao: 'Mostre o atendimento e a equipe, não o resultado' },
  ];

  /*
   * Todas as frentes: o que a lei barra em qualquer peça. Medicamento com
   * promessa (Anvisa RDC 96/2008) — a padaria que vende antigripal no
   * balcão também não pode; antibiótico sem receita; cigarro eletrônico
   * (venda e propaganda proibidas, Anvisa RDC 855/2024).
   */
  var MEDICAMENTO = /\b(remedio|remedios|medicamento|medicamentos|comprimido|comprimidos|xarope|xaropes|antibiotico|antibioticos|analgesico|analgesicos|antigripal|antigripais|capsula|capsulas|pomada|pomadas|antiinflamatorio|anti-inflamatorio)\b/;
  var PROMESSA = /\b(cura|curam|curar|cure|elimin\w*|garantid\w*|garante|100\s?%|milagr\w*|sem efeitos? colatera\w*|acab(a|e) com|resolve)\b/;
  var TODAS = [
    { id: 'medicamento', teste: function (n) { return MEDICAMENTO.test(n) && PROMESSA.test(n); },
      re: new RegExp(PROMESSA.source, 'g'),
      motivo: 'promete efeito de medicamento, o que a Anvisa proíbe em propaganda',
      sugestao: 'Fale com o farmacêutico sobre o alívio dos sintomas' },
    { id: 'antibiotico', re: /\bantibioticos?\b.{0,40}\bsem receita\b|\bsem receita\b.{0,40}\bantibioticos?\b/g,
      motivo: 'oferece antibiótico sem receita, o que a lei proíbe',
      sugestao: 'Antibiótico só com receita: traga a sua' },
    { id: 'vape', re: /\b(cigarros? eletronicos?|vapes?|vaper|pods? descartave(l|is))\b/g,
      motivo: 'anuncia cigarro eletrônico, cuja venda e propaganda são proibidas no Brasil',
      sugestao: '' },
  ];

  /*
   * Saúde, AVISO (não bloqueio): dentista e médico. O Código de Ética
   * Odontológica veda anunciar preço, forma de pagamento e serviço gratuito
   * como chamariz; a publicidade médica (CFM 2.336/2023) proíbe promoção e
   * desconto. A redação exata muda e a interpretação varia por conselho
   * regional, então AVISA: a pessoa decide, e quem tem dúvida pergunta ao
   * conselho. Farmácia anuncia preço normalmente: não recebe este aviso.
   */
  var CONSELHO = [
    { id: 'gratis', re: /\b(gratis|gratuit[oa]s?|de graca|sem custo)\b/g,
      motivo: 'oferece serviço gratuito como chamariz — em clínica odontológica ou médica, o conselho (CFO/CFM) costuma vetar',
      sugestao: 'Agende a sua avaliação' },
    { id: 'parcelas', re: /\b\d{1,2}\s?(x\b|×)|\bsem juros\b|\bparcel(a|as|ado|ada|amento)\b/g,
      motivo: 'anuncia parcelamento — o Código de Ética Odontológica veda anunciar forma de pagamento',
      sugestao: 'Consulte as condições na recepção' },
    { id: 'promocao', re: /\b\d{1,2}\s?%\s?(off|de desconto)?|\b(desconto|descontos|promocao|promocoes|promocional|imperdivel|queima)\b|\boff\b|r\$\s?\d/g,
      motivo: 'anuncia preço ou desconto — em clínica odontológica ou médica, o conselho limita preço promocional',
      sugestao: 'Fale com a recepção sobre valores' },
  ];

  var FARMACIA = /\b(farmacia|farmacias|drogaria|drogarias|drogas|manipulacao)\b/;
  var CLINICA = /\b(odonto\w*|dentist\w*|dente|dentes|clareament\w*|implante\w*|ortodon\w*|aparelho|canal|consultorio|clinica|medic[oa]s?|dermato\w*|estetica|fisioterap\w*|pediatr\w*|ginecolog\w*|oftalmo\w*)\b/;

  function acharTodos(re, n, s, regra, nivel, saida) {
    re.lastIndex = 0;
    var m;
    while ((m = re.exec(n))) {
      saida.push({ regra: regra.id, nivel: nivel, trecho: s.slice(m.index, m.index + m[0].length).trim(), motivo: regra.motivo, sugestao: regra.sugestao });
      if (!re.global) break;
    }
  }

  /*
   * Confere um texto (ou uma lista deles). `perfil`: 'saude' | 'comercio' |
   * 'empresa'. `contexto`: a empresa, o ramo e o pedido, para saber se é
   * clínica (o aviso do conselho) ou farmácia (não é).
   */
  function conferir(texto, opts) {
    var o = opts || {};
    var s = original(Array.isArray(texto) ? texto.join(' \n ') : texto);
    var n = normal(s);
    var bloqueios = [], avisos = [];
    if (!n.trim()) return { bloqueios: bloqueios, avisos: avisos };
    if (o.perfil === 'saude') SAUDE.forEach(function (r) { acharTodos(r.re, n, s, r, 'bloqueio', bloqueios); });
    TODAS.forEach(function (r) {
      if (r.teste && !r.teste(n)) return;
      // Em Saúde, a promessa já foi acusada termo a termo; o medicamento só reforça o motivo.
      if (r.id === 'medicamento' && o.perfil === 'saude' && bloqueios.length) return;
      acharTodos(r.re, n, s, r, 'bloqueio', bloqueios);
    });
    if (o.perfil === 'saude') {
      var ctx = normal(o.contexto || '') + ' ' + n;
      var ehFarmacia = FARMACIA.test(ctx) && !CLINICA.test(normal(o.contexto || ''));
      if (!ehFarmacia) CONSELHO.forEach(function (r) { acharTodos(r.re, n, s, r, 'aviso', avisos); });
    }
    return { bloqueios: unicos(bloqueios), avisos: unicos(avisos) };
  }

  // Um achado por regra e trecho: "cura" três vezes na mesma legenda é uma explicação só.
  function unicos(lista) {
    var vistos = {};
    return lista.filter(function (a) {
      var k = a.regra + '|' + normal(a.trecho);
      if (vistos[k]) return false;
      vistos[k] = true;
      return true;
    });
  }

  // O pedido de novo ao modelo, como a porta da peça faz para cor fixa.
  function paraCorrecao(achados) {
    var l = (achados || []).filter(function (a) { return a.nivel === 'bloqueio'; });
    if (!l.length) return '';
    return 'Sua resposta anterior foi RECUSADA pela regra de conteúdo (é lei, não gosto):\n'
      + l.map(function (a) { return '- "' + a.trecho + '": ' + a.motivo + (a.sugestao ? '. Em vez disso, algo como: "' + a.sugestao + '"' : ''); }).join('\n')
      + '\nEscreva de novo sem nenhum desses termos, mesmo que o pedido do cliente os traga.';
  }

  // A frase para a pessoa: o que foi, por quê, e o que dá para pôr no lugar.
  function explicar(a) {
    return '"' + a.trecho + '" ' + a.motivo + '.' + (a.sugestao ? ' Sugestão: "' + a.sugestao + '".' : '');
  }

  /* ======================= FATOS ======================= */

  var SEMANA = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'];
  var NOME_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  var MESES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /*
   * O preço partido em campos ("R$" | "0" | ",90") e o horário partido
   * ("15h" | "às" | "18h") voltam a ser um só antes de ler: a peça da IA
   * guarda os centavos num campo à parte.
   */
  function juntar(s) {
    return original(s).replace(/(\d)\s+([.,]\d{2})(?!\d)/g, '$1$2').replace(/R\$\s+/gi, 'R$ ');
  }

  /*
   * Os fatos de um texto, cada um com a chave (para comparar) e o trecho
   * (para mostrar): preco "18990", pct "30", vezes "10", semjuros, data
   * "12/11", hora "15:00".
   */
  function fatosDe(texto) {
    var s = juntar(texto);
    var n = normal(s);
    var fatos = [];
    var m, re;
    var add = function (tipo, chave, ini, fim, extra) {
      var f = { tipo: tipo, chave: chave, trecho: s.slice(ini, fim).trim(), ini: ini };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) f[k] = extra[k];
      fatos.push(f);
    };
    // Preço: "R$ 189,90", "R$ 9", "39,90" (o número com centavos é preço).
    re = /r\$\s?(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{2}))?|(?:^|[^\d.,/])((?:\d{1,3}\.)?\d{1,3}),(\d{2})(?![\d%])/g;
    while ((m = re.exec(n))) {
      var inteiro = (m[1] || m[3] || '').replace(/\./g, '');
      var cent = m[2] || m[4] || '00';
      var ini = m[1] ? m.index : m.index + m[0].indexOf(m[3]);
      add('preco', String(Number(inteiro) * 100 + Number(cent)), ini, m.index + m[0].length);
      // O preço sem o "R$" (os centavos num campo, o símbolo noutro) aparece com ele: é assim que a pessoa o reconhece.
      if (!m[1]) fatos[fatos.length - 1].trecho = 'R$ ' + fatos[fatos.length - 1].trecho;
    }
    re = /(\d{1,3})\s?%/g;
    while ((m = re.exec(n))) add('pct', m[1], m.index, m.index + m[0].length);
    re = /\b(\d{1,2})\s?(?:x\b|×)(?!\s?\d)/g;
    while ((m = re.exec(n))) add('vezes', String(Number(m[1])), m.index, m.index + m[0].length);
    re = /\bsem juros\b/g;
    while ((m = re.exec(n))) add('semjuros', 'sem juros', m.index, m.index + m[0].length);
    // Data: "12/11", "12/11/2026", "12 de novembro". O dia da semana logo antes dela vai junto.
    re = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b|\b(\d{1,2})(?:º)? de (janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/g;
    while ((m = re.exec(n))) {
      var d = Number(m[1] || m[4]);
      var mes = m[2] ? Number(m[2]) : MESES.indexOf(m[5]) + 1;
      if (!(d >= 1 && d <= 31 && mes >= 1 && mes <= 12)) continue;
      var antes = n.slice(Math.max(0, m.index - 24), m.index);
      var sem = /(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\.?[\s,·•|-]*(?:dia\s*)?$/.exec(antes);
      var a = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
      add('data', (d < 10 ? '0' : '') + d + '/' + (mes < 10 ? '0' : '') + mes, sem ? m.index - (antes.length - sem.index) : m.index, m.index + m[0].length,
        { dia: d, mes: mes, ano: a, semana: sem ? SEMANA.indexOf(sem[1]) : -1 });
    }
    // Horário: "15h", "15h30", "15:00". "24h" é duração (atendimento 24h), não hora.
    re = /(^|[^\d:,./])([01]?\d|2[0-3])\s?(?:h(?:([0-5]\d))?(?![a-z])|:([0-5]\d))/g;
    while ((m = re.exec(n))) {
      var h = Number(m[2]), mi = Number(m[3] || m[4] || 0);
      var i0 = m.index + m[1].length;
      add('hora', (h < 10 ? '0' : '') + h + ':' + (mi < 10 ? '0' : '') + mi, i0, m.index + m[0].length);
    }
    return fatos;
  }

  /*
   * O que pode aparecer: os fatos das fontes (o que a pessoa disse, o
   * combinado, a marca, o período e os horários do escopo). Devolve um
   * objeto { preco: [...], data: [...], ... } de chaves — curto, para ir
   * guardado junto da campanha e valer de novo depois de uma edição.
   */
  function permitidosDe(fontes, extras) {
    var p = { preco: [], pct: [], vezes: [], semjuros: [], data: [], hora: [] };
    var por = function (f) { if (p[f.tipo] && p[f.tipo].indexOf(f.chave) < 0) p[f.tipo].push(f.chave); };
    (Array.isArray(fontes) ? fontes : [fontes]).forEach(function (t) { fatosDe(t).forEach(por); });
    var x = extras || {};
    (x.datas || []).forEach(function (iso) {
      var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
      if (m) por({ tipo: 'data', chave: m[3] + '/' + m[2] });
    });
    (x.horas || []).forEach(function (hm) {
      var m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ''));
      if (m) por({ tipo: 'hora', chave: (m[1].length < 2 ? '0' : '') + m[1] + ':' + m[2] });
    });
    return p;
  }

  function somar(a, b) {
    var p = { preco: [], pct: [], vezes: [], semjuros: [], data: [], hora: [] };
    [a, b].forEach(function (x) {
      Object.keys(p).forEach(function (k) { ((x && x[k]) || []).forEach(function (v) { if (p[k].indexOf(v) < 0) p[k].push(v); }); });
    });
    return p;
  }

  var ROTULO = { preco: 'o preço', pct: 'a porcentagem', vezes: 'o parcelamento', semjuros: '"sem juros"', data: 'a data', hora: 'o horário' };

  // O ano de uma data sem ano: este, ou o próximo se ela já passou faz mais de dois meses.
  function anoDe(f, hoje) {
    if (f.ano) return f.ano;
    var h = hoje || new Date();
    var ano = h.getFullYear();
    var dt = new Date(ano, f.mes - 1, f.dia);
    return dt.getTime() < h.getTime() - 60 * 86400000 ? ano + 1 : ano;
  }

  /*
   * Os fatos do texto da peça que não estavam nas fontes, e as datas com o
   * dia da semana errado. Só AVISO: a pessoa pode ter dito o preço de outro
   * jeito ("noventa centavos"), e quem confere é ela — mas não calado.
   */
  function conferirFatos(texto, permitidos, opts) {
    var o = opts || {};
    var p = permitidos || {};
    var avisos = [];
    var vistos = {};
    fatosDe(texto).forEach(function (f) {
      var k = f.tipo + '|' + f.chave;
      if (f.tipo === 'data' && f.semana >= 0) {
        var ano = anoDe(f, o.hoje);
        var dt = new Date(ano, f.mes - 1, f.dia);
        if (dt.getMonth() === f.mes - 1 && dt.getDay() !== f.semana && !vistos['sem|' + k]) {
          vistos['sem|' + k] = true;
          avisos.push({ tipo: 'semana', trecho: f.trecho, motivo: f.chave + ' cai numa ' + NOME_SEMANA[dt.getDay()] + ', não ' + (f.semana === 0 || f.semana === 6 ? 'no ' : 'na ') + NOME_SEMANA[f.semana] });
        }
      }
      if (vistos[k] || (p[f.tipo] || []).indexOf(f.chave) >= 0) return;
      vistos[k] = true;
      var mostra = f.tipo === 'data' ? f.chave : f.trecho;
      avisos.push({ tipo: f.tipo, trecho: f.trecho, motivo: ROTULO[f.tipo] + (f.tipo === 'semjuros' ? '' : ' ' + mostra) + ' não estava no seu pedido' });
    });
    return avisos;
  }

  return {
    conferir: conferir, unicos: unicos, paraCorrecao: paraCorrecao, explicar: explicar,
    fatosDe: fatosDe, permitidosDe: permitidosDe, somar: somar, conferirFatos: conferirFatos,
    normal: normal, SAUDE: SAUDE, TODAS: TODAS, CONSELHO: CONSELHO,
  };
});
