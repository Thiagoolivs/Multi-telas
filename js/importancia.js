/*
 * js/importancia.js — a importância de uma peça pela natureza dela (fase 5).
 *
 * Antes, as peças das campanhas entravam todas como Normal — inclusive a
 * oferta que vence amanhã e o "sistema fora do ar" (BLOCO-3). Aqui a regra
 * sugere o nível e diz o porquê, em palavras de gente ("fala de segurança ·
 * sai amanhã"); o cliente vê e troca com um toque. Sem IA: é de graça e dá
 * sempre a mesma resposta para o mesmo texto.
 *
 *   Urgente   o texto pede ação já: urgente, atenção, emergência, fora do ar,
 *             piso molhado, interditado, evacuação, vazamento, incêndio.
 *   Alta      prazo curto (sai em até 2 dias) ou oferta.
 *   Normal    o resto: o institucional.
 *
 * Quem decide por último é a pessoa: prioridade já escolhida não muda.
 */
(function (global) {
  'use strict';

  const URGENTE = /\b(urgente|aten[çc][ãa]o|emerg[êe]ncia|fora do ar|piso molhado|interditad[oa]|evacua[çc][ãa]o|vazamento|inc[êe]ndio|perigo|proibida? a entrada|n[ãa]o use|desligad[oa] agora)\b/i;
  const OFERTA = /\b(oferta|promo[çc][ãa]o|desconto|liquida[çc][ãa]o|queima|leve \d|pague \d|\d+\s?% ?off|por apenas|s[óo] hoje)\b/i;
  const DIA_MS = 24 * 60 * 60 * 1000;

  function textoDe(it) {
    if (!it) return '';
    const partes = [];
    ['etiqueta', 'kicker', 'selo', 'titulo', 'corpo', 'texto', 'info', 'cta', 'caption', 'rotulo', 'detalhe'].forEach((k) => {
      if (typeof it[k] === 'string') partes.push(it[k]);
    });
    if (it.campos && typeof it.campos === 'object') {
      Object.keys(it.campos).forEach((k) => { if (typeof it.campos[k] === 'string' && !/^(https?:|data:|\/)/.test(it.campos[k])) partes.push(it.campos[k]); });
    }
    return partes.join(' · ');
  }

  // Quando a peça sai, em ms (o fim marcado, ou o fim do último dia do agendamento).
  function fimDe(it) {
    const exp = Number(it && it.meta && it.meta.expiraEm);
    if (exp > 0) return exp;
    const a = it && it.agendamento;
    if (a && a.ativo && /^\d{4}-\d{2}-\d{2}$/.test(String(a.dataFim || ''))) {
      const p = a.dataFim.split('-').map(Number);
      const h = /^\d{2}:\d{2}$/.test(String(a.horaFim || '')) ? a.horaFim.split(':').map(Number) : [23, 59];
      return new Date(p[0], p[1] - 1, p[2], h[0], h[1]).getTime();
    }
    return 0;
  }

  function quandoSai(fim, agoraMs) {
    const falta = fim - agoraMs;
    const d = new Date(fim);
    const hora = String(d.getHours()).padStart(2, '0') + 'h' + (d.getMinutes() ? String(d.getMinutes()).padStart(2, '0') : '');
    if (falta <= DIA_MS && new Date(agoraMs).getDate() === d.getDate()) return 'sai hoje às ' + hora;
    if (falta <= 2 * DIA_MS) return 'sai amanhã';
    return '';
  }

  /*
   * { nivel, porque, sugerido } — `sugerido` é falso quando a pessoa já
   * escolheu (aí o nível é o dela, e o porquê só explica).
   */
  function importancia(it, ctx) {
    const agoraMs = (ctx && ctx.agoraMs) || Date.now();
    const escolhido = it && it.meta && it.meta.prioridade;
    const t = textoDe(it);
    const porque = [];
    let nivel = 'normal';
    if (URGENTE.test(t)) { nivel = 'urgente'; porque.push(/segura|piso|incênd|incend|evacua|vazamento|perigo/i.test(t) ? 'fala de segurança' : 'pede ação já'); }
    const fim = fimDe(it);
    if (fim > agoraMs && fim - agoraMs <= 2 * DIA_MS) {
      if (nivel === 'normal') nivel = 'alta';
      porque.push(quandoSai(fim, agoraMs) || 'prazo curto');
    }
    if (nivel === 'normal' && (it && it.type === 'promo' || OFERTA.test(t))) { nivel = 'alta'; porque.push('é oferta'); }
    if (!porque.length) porque.push('institucional');
    return { nivel: escolhido || nivel, porque: porque.join(' · '), sugerido: !escolhido };
  }

  // A peça com o nível sugerido gravado (meta.prioridade e meta.porque), sem passar por cima da escolha da pessoa.
  function comImportancia(it, ctx) {
    if (!it || typeof it !== 'object') return it;
    const r = importancia(it, ctx);
    const meta = Object.assign({}, it.meta || {}, { porque: r.porque });
    if (r.sugerido && r.nivel !== 'normal') meta.prioridade = r.nivel;
    return Object.assign({}, it, { meta: meta });
  }

  const ROTULO = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal' };
  // "Urgente · fala de segurança · sai hoje às 16h": o que o painel mostra ao lado da peça.
  function explicar(it, ctx) {
    const r = importancia(it, ctx);
    return ROTULO[r.nivel] + ' · ' + r.porque;
  }

  const api = { importancia: importancia, comImportancia: comImportancia, explicar: explicar, fimDe: fimDe, textoDe: textoDe };
  global.MTImportancia = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
