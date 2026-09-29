/*
 * server/routes/relatorio.js — o relatório de exibição (proof-of-play).
 *
 *   GET /api/relatorio?dias=7|30|90[&tela=ID][&formato=csv]
 *
 * O que tocou, quantas vezes, por quanto tempo e em qual tela — contado pela
 * própria TV (js/exibicoes.js), agregado por hora. É o argumento de venda
 * corporativo ("prove que passou") e voltou ao plano Pro quando passou a
 * existir de verdade.
 *
 * Quem vê: plano com o recurso 'relatorio' e quem ainda está no teste (é
 * justamente no teste que o cliente precisa ver que funciona).
 */
'use strict';

module.exports = function (ctx) {
  const { db, plans, sendJson } = ctx;

  const HORA = 3600 * 1000;
  const DIAS_PERMITIDOS = [1, 7, 30, 90];

  // O dia do cliente, e não o de Greenwich: 23h em Brasília é o mesmo dia.
  const formatoDia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const diaDe = (t) => formatoDia.format(new Date(Number(t)));

  function csv(rel) {
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const horas = (seg) => (Number(seg) / 3600).toFixed(2).replace('.', ',');
    const linhas = ['Conteúdo;Tipo;Exibições;Horas no ar;Telas'];
    for (const c of rel.porConteudo) linhas.push([c.rotulo, c.tipo, c.vezes, horas(c.segundos), c.telas].map(esc).join(';'));
    linhas.push('', 'Tela;Exibições;Horas no ar');
    for (const t of rel.porTela) linhas.push([t.nome || t.device_id, t.vezes, horas(t.segundos)].map(esc).join(';'));
    linhas.push('', 'Dia;Exibições;Horas no ar');
    for (const d of rel.porDia) linhas.push([d.dia, d.vezes, horas(d.segundos)].map(esc).join(';'));
    // BOM + ";" : é o que o Excel em português abre certo com dois cliques.
    return '﻿' + linhas.join('\r\n') + '\r\n';
  }

  async function tratar(req, res, parts, query, sess) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'só leitura' });
    if (!sess) return sendJson(res, 401, { error: 'não autenticado' });

    const tenant = await db.getTenant(sess.tenant_id);
    const libera = plans.temRecurso((tenant && tenant.plan) || 'free', 'relatorio') || plans.testeAtivo(tenant);
    if (!libera) {
      return sendJson(res, 402, {
        error: 'O relatório de exibição faz parte do plano Pro. Suas telas continuam contando: assinando, o histórico aparece aqui.',
        code: 'plano_sem_relatorio',
      });
    }

    const dias = DIAS_PERMITIDOS.includes(Number(query.dias)) ? Number(query.dias) : 7;
    const ate = (Math.floor(Date.now() / HORA) + 1) * HORA;
    const de = ate - dias * 24 * HORA;
    const tela = query.tela ? String(query.tela).slice(0, 40) : null;
    if (tela) {
      const d = await db.getDevice(tela);
      if (!d || d.tenant_id !== sess.tenant_id) return sendJson(res, 404, { error: 'tela não encontrada' });
    }

    const r = await db.relatorioExibicoes(sess.tenant_id, de, ate, tela);
    const num = (x) => Number(x) || 0;
    const porDiaMapa = new Map();
    for (const h of r.porHora) {
      const dia = diaDe(h.hora);
      const acc = porDiaMapa.get(dia) || { dia, vezes: 0, segundos: 0 };
      acc.vezes += num(h.vezes); acc.segundos += num(h.segundos);
      porDiaMapa.set(dia, acc);
    }
    const rel = {
      de, ate, dias,
      porConteudo: r.porConteudo.map((c) => ({ chave: c.chave, rotulo: c.rotulo || 'Conteúdo', tipo: c.tipo || '', vezes: num(c.vezes), segundos: num(c.segundos), telas: num(c.telas) })),
      porTela: r.porTela.map((t) => ({ id: t.device_id, nome: t.nome || 'Tela removida', vezes: num(t.vezes), segundos: num(t.segundos) })),
      porDia: [...porDiaMapa.values()],
    };
    rel.totais = {
      vezes: rel.porConteudo.reduce((a, c) => a + c.vezes, 0),
      segundos: rel.porConteudo.reduce((a, c) => a + c.segundos, 0),
      conteudos: rel.porConteudo.length,
      telas: rel.porTela.length,
    };

    if (query.formato === 'csv') {
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="relatorio-exibicao-' + dias + 'd.csv"',
        'Cache-Control': 'no-store',
      });
      return res.end(csv(rel));
    }
    return sendJson(res, 200, rel);
  }

  return async function (req, res, parts, query, sess) {
    if (parts[1] !== 'relatorio') return false;
    await tratar(req, res, parts, query, sess);
    return true;
  };
};
