/*
 * server/conferencia.js — a conferência da campanha ANTES de ela ficar
 * "pronta" (QA de lançamento, 03/11).
 *
 * O teste com a IA simulada mostrou que a forma da peça era bem protegida e
 * o conteúdo, não: a ótica saiu com três preços que ninguém disse, o
 * restaurante com "Sábado, 12/11" (12/11 é quinta), a clínica com um horário
 * inventado, a farmácia com "cura a gripe". Tudo salvo "pronto", calado.
 *
 * Aqui o resultado inteiro — o texto de cada peça (o que está no HTML da IA,
 * não só nos campos), os letreiros e os textos das redes — passa por
 * js/regras-de-conteudo.js:
 *
 *   bloqueios  o que a lei barra (promessa de cura em Saúde, medicamento com
 *              promessa). A campanha fica "revisar", não "pronta": o painel
 *              mostra o motivo e a sugestão, e não deixa pôr no ar até a
 *              pessoa trocar o texto.
 *   avisos     preço, data e horário que não estavam no pedido, o dia da
 *              semana errado e o aviso do conselho (dentista). Não bloqueia:
 *              aparece no resultado ("Confira: …").
 *
 * O que pode aparecer (`permitidos`) sai do que a pessoa disse na conversa,
 * do combinado, do escopo e da marca, e fica guardado no resultado: depois
 * de uma edição, a conferência roda de novo com a mesma régua.
 */
'use strict';

const RC = require('../js/regras-de-conteudo.js');
const Perfil = require('../js/perfil.js');
const { textosDaPeca } = require('./compositor');

const corta = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

/*
 * As fontes dos fatos: tudo o que a pessoa (ou a marca dela) disse. Os
 * horários e o período do escopo entram como dado, já que "das 15h às 18h"
 * vira { inicio: '15:00', fim: '18:00' } e "sábado" vira a data.
 */
function permitidosDe(escopo, ctx) {
  const e = escopo || {};
  const c = ctx || {};
  const m = c.marca || {};
  const local = c.local || {};
  const textos = [
    e.nome, e.objetivo, e.publico,
    ...(c.falas || []), ...(c.combinado || []),
    m.observacoes, m.tom, c.empresa, local.endereco, local.bairro, local.cidade, local.link,
    c.memoria && typeof c.memoria === 'object' ? JSON.stringify(c.memoria) : '',
  ];
  for (const t of e.telas || []) {
    for (const z of Object.keys(t.zonas || {})) {
      const zona = t.zonas[z] || {};
      textos.push(zona.pedido || '', ...(zona.mensagens || []));
    }
  }
  const datas = [e.periodo && e.periodo.inicio, e.periodo && e.periodo.fim];
  for (const t of e.telas || []) if (t.zonas && t.zonas.rodape && t.zonas.rodape.contagem) datas.push(t.zonas.rodape.contagem);
  const horas = [];
  for (const h of e.horarios || []) { if (h.inicio) horas.push(h.inicio); if (h.fim) horas.push(h.fim); }
  return RC.permitidosDe(textos.filter(Boolean).map(String), { datas: datas.filter(Boolean), horas });
}

// A mesma ordem de server/ajuste.js (numerar): por TV, cabeçalho, principal, lateral, rodapé.
function pecasNumeradas(resultado) {
  const lista = [];
  ((resultado && resultado.telas) || []).forEach((t, ti) => {
    const z = t.zonas || {};
    const por = [(z.cabecalho || {}).pecas, z.principal, z.lateral, (z.rodape || {}).pecas];
    for (const pecas of por) (pecas || []).forEach((p) => lista.push({ n: lista.length + 1, tela: ti, peca: p }));
  });
  return lista;
}

const NOME_CANAL = { instagram: 'Instagram', whatsapp: 'WhatsApp', facebook: 'Facebook', google: 'Google' };

/*
 * Os lugares onde há texto que o público lê, cada um com o nome que a
 * pessoa reconhece ("peça 2", "letreiro da TV 1", "Instagram").
 */
function lugaresDeTexto(resultado) {
  const r = resultado || {};
  const lugares = [];
  for (const x of pecasNumeradas(r)) {
    lugares.push({ onde: 'peça ' + x.n, peca: x.n, texto: Object.values(textosDaPeca(x.peca.item)).join(' \n ') });
  }
  (r.telas || []).forEach((t, i) => {
    const z = t.zonas || {};
    const rod = (z.rodape && z.rodape.mensagens) || [];
    const cab = (z.cabecalho && z.cabecalho.mensagens) || [];
    if (rod.length) lugares.push({ onde: 'letreiro da TV ' + (i + 1), texto: rod.join(' \n ') });
    if (cab.length) lugares.push({ onde: 'cabeçalho da TV ' + (i + 1), texto: cab.join(' \n ') });
  });
  // As redes num lugar só: o mesmo "grátis" nos quatro canais é um aviso, não quatro.
  const tx = r.social && r.social.textos;
  if (tx) {
    const canais = Object.keys(NOME_CANAL).filter((c) => tx[c]);
    const texto = canais.map((c) => {
      const t = tx[c];
      return c === 'instagram' ? [t.legenda].concat((t.hashtags || []).map((h) => String(h).replace(/^#/, ''))).join(' ') : c === 'whatsapp' ? t.mensagem : t.texto;
    }).join(' \n ');
    if (canais.length) lugares.push({ onde: 'textos das redes', rede: true, texto: String(texto || '') });
  }
  return lugares;
}

/*
 * A conferência. `o`: { permitidos, perfil, contexto, hoje }. Devolve
 * { bloqueios, avisos, permitidos } — cada achado com onde está, o trecho,
 * o motivo e (no bloqueio) a sugestão do que pôr no lugar.
 */
function conferirCampanha(resultado, o) {
  const op = o || {};
  const permitidos = op.permitidos || RC.permitidosDe([]);
  const bloqueios = [], avisos = [];
  for (const l of lugaresDeTexto(resultado)) {
    const regra = RC.conferir(l.texto, { perfil: op.perfil || '', contexto: op.contexto || '' });
    const base = { onde: l.onde };
    if (l.peca) base.peca = l.peca;
    for (const b of regra.bloqueios) bloqueios.push(Object.assign({}, base, { trecho: corta(b.trecho, 80), motivo: b.motivo, sugestao: b.sugestao, regra: b.regra }));
    // Um aviso do conselho por regra e lugar: "6x" e "sem juros" são o mesmo parcelamento.
    const vistas = new Set();
    for (const a of regra.avisos) {
      if (vistas.has(a.regra)) continue;
      vistas.add(a.regra);
      avisos.push(Object.assign({}, base, { tipo: 'conselho', trecho: corta(a.trecho, 80), motivo: a.motivo, sugestao: a.sugestao }));
    }
    // O fato inventado conta na peça e no letreiro; a legenda das redes repete a peça (e o aviso lá seria o mesmo duas vezes).
    if (!l.rede) for (const f of RC.conferirFatos(l.texto, permitidos, { hoje: op.hoje })) avisos.push(Object.assign({}, base, { tipo: f.tipo, trecho: corta(f.trecho, 80), motivo: f.motivo }));
  }
  return { bloqueios, avisos: avisos.slice(0, 30), permitidos };
}

/*
 * A conferência de novo, depois de uma edição: a mesma régua guardada, mais
 * o que a pessoa acabou de escrever ou confirmar (`extras`, textos dela).
 */
function reconferir(resultado, o, extras) {
  const antes = (resultado && resultado.conferencia && resultado.conferencia.permitidos) || null;
  const novos = RC.permitidosDe((extras || []).filter(Boolean).map(String));
  return conferirCampanha(resultado, Object.assign({}, o, { permitidos: RC.somar(antes, novos) }));
}

// O contexto da regra: a empresa e o ramo dizem se é clínica (aviso do conselho) ou farmácia.
function opcoesDaConta(ctx, escopo) {
  const c = ctx || {};
  return {
    perfil: Perfil.tem(c.perfil) ? c.perfil : '',
    contexto: [c.empresa, c.segmento, c.ramo, escopo && escopo.nome, escopo && escopo.objetivo].filter(Boolean).join(' '),
  };
}

// "pronta" só sem bloqueio. A que está no ar ou pausada fica como está: quem decide tirar é a pessoa.
function estadoDepois(estadoAtual, conferencia) {
  if (estadoAtual === 'no_ar' || estadoAtual === 'pausada') return estadoAtual;
  return conferencia && conferencia.bloqueios && conferencia.bloqueios.length ? 'revisar' : 'pronta';
}

// A frase para quem tenta pôr no ar a campanha barrada.
function porQueNaoRoda(conferencia) {
  const b = (conferencia && conferencia.bloqueios) || [];
  if (!b.length) return '';
  const x = b[0];
  return 'Antes de pôr no ar, troque o texto da ' + x.onde + ': ' + RC.explicar(x)
    + (b.length > 1 ? ' (e mais ' + (b.length - 1) + ' trecho' + (b.length > 2 ? 's' : '') + ')' : '');
}

module.exports = { permitidosDe, conferirCampanha, reconferir, opcoesDaConta, estadoDepois, porQueNaoRoda, lugaresDeTexto };
