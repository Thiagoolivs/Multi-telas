/*
 * server/admin.js — a visão do NEGÓCIO no painel do operador (PLANO §7.2,
 * EXECUTOR item 13).
 *
 * A pergunta que este painel responde todo dia: alguma tela de cliente está
 * apagada, alguém está devendo, e o negócio está crescendo? As contas daqui
 * são PURAS — recebem as linhas do banco e devolvem o que a tela mostra —
 * para cada uma ser provada num teste. Quem busca as linhas é a rota
 * (server.js, /api/plataforma/negocio), com cache: o painel do operador nunca
 * deixa o do cliente lento.
 */
'use strict';

const plans = require('./plans');
const E = require('../js/expediente.js');
const A = require('../js/aparelho.js');

const DIA = 24 * 60 * 60 * 1000;

const json = (v) => {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch (e) { return null; }
};

/*
 * FROTA: todas as telas, da que está apagada há mais tempo para a que está
 * no ar. A tela fora do expediente da loja (TV desligada à noite, como o dono
 * escolheu) vem marcada: offline ali não é problema, e o operador não pode
 * perder tempo com ela.
 */
function frota(linhas, agora, vivaMs) {
  const t = agora || Date.now();
  return (linhas || []).map((d) => {
    const visto = Number(d.last_seen) || 0;
    const online = visto > 0 && t - visto < vivaMs;
    const exp = json(d.expediente);
    let fora = false;
    if (exp && !online) { try { fora = !E.dentro(t, E.normalizar(exp)); } catch (e) { fora = false; } }
    return {
      id: d.id,
      nome: d.name || 'Tela sem nome',
      contaId: d.tenant_id,
      conta: d.conta || '',
      ultimoSinal: visto,
      online,
      offlineHa: online || !visto ? 0 : t - visto,
      foraDoExpediente: fora,
      // O mesmo resumo que o cliente vê no cartão da tela (js/aparelho.js).
      aparelho: A.descrever(d.info),
    };
  }).sort((a, b) => {
    // Apagada de verdade primeiro; depois a que dorme no horário do dono; no ar por último.
    const grupo = (x) => (x.online ? 2 : x.foraDoExpediente ? 1 : 0);
    if (grupo(a) !== grupo(b)) return grupo(a) - grupo(b);
    // Nunca deu sinal vem antes de todas do grupo: pareou e não ligou.
    return (a.ultimoSinal || 0) - (b.ultimoSinal || 0);
  });
}

/*
 * CLIENTES E RECEITA. Uma linha por conta paga, com o que se precisa para
 * ligar para ela: plano, telas, contrato (início, fim da fidelidade, multa
 * hoje) e pagamento. A receita recorrente é a soma das mensalidades de quem
 * está pagando — cortesia não é receita, e Enterprise é contrato (conta à
 * parte, sem valor de tabela).
 */
function clientes(linhas, agora, statusCortesia) {
  const t = agora || Date.now();
  return (linhas || []).map((c) => {
    const telas = Math.max(0, Number(c.telas) || 0);
    const contrato = plans.contratoDe(c.plan_contrato);
    const cortesia = c.plan_status === statusCortesia;
    const mensal = cortesia ? 0 : plans.mensalidadeCents(c.plan, Math.max(1, telas), contrato);
    const desde = Number(c.contrato_desde) || 0;
    const mesesUsados = desde ? Math.floor((t - desde) / (30 * DIA)) : 0;
    const atraso = plans.situacaoAtraso({ plan: c.plan, plan_status: c.plan_status, atraso_desde: c.atraso_desde }, t);
    return {
      id: c.id,
      nome: c.name || '',
      email: c.email || '',
      plano: c.plan,
      status: c.plan_status || '',
      cortesia,
      telas,
      contrato,
      contratoDesde: desde,
      fidelidadeAte: contrato === 'anual' && desde ? desde + plans.MESES_DO_CONTRATO * 30 * DIA : 0,
      multaHojeCents: contrato === 'anual' && desde ? plans.multaCancelamentoCents({ telas: Math.max(1, telas), mesesUsados }).cents : 0,
      mensalidadeCents: mensal,
      renovaEm: Number(c.plan_renews_at) || 0,
      atraso: atraso ? { dias: atraso.diasEmAtraso, selo: atraso.selo, bloqueado: atraso.bloqueado } : null,
    };
  });
}

function receita(lista, agora, cancelamentos) {
  const t = agora || Date.now();
  const pagando = lista.filter((c) => !c.cortesia && (c.status === 'active' || c.status === 'past_due'));
  const comTabela = pagando.filter((c) => c.mensalidadeCents != null);
  const inadimplentes = pagando.filter((c) => c.atraso).sort((a, b) => b.atraso.dias - a.atraso.dias);
  return {
    mrrCents: comTabela.reduce((s, c) => s + c.mensalidadeCents, 0),
    pagantes: pagando.length,
    telasPagas: pagando.reduce((s, c) => s + c.telas, 0),
    anuais: pagando.filter((c) => c.contrato === 'anual').length,
    enterprise: pagando.length - comTabela.length,
    cortesias: lista.filter((c) => c.cortesia).length,
    inadimplentes: inadimplentes.map((c) => ({ id: c.id, nome: c.nome, dias: c.atraso.dias, mensalidadeCents: c.mensalidadeCents })),
    devendoCents: inadimplentes.reduce((s, c) => s + (c.mensalidadeCents || 0), 0),
    cancelamentos: Number(cancelamentos) || 0,
    proximosVencimentos: pagando
      .filter((c) => c.renovaEm && c.renovaEm >= t && c.renovaEm - t <= 7 * DIA)
      .sort((a, b) => a.renovaEm - b.renovaEm)
      .map((c) => ({ id: c.id, nome: c.nome, em: c.renovaEm, mensalidadeCents: c.mensalidadeCents })),
  };
}

/*
 * FUNIL, por semana de cadastro: cadastrou → ligou uma TV (é o que o teste
 * prova) → paga. "Quanto do teste vira cliente" é pagos sobre quem ligou:
 * quem nunca ligou a TV não testou nada.
 */
function inicioDaSemana(ms) {
  const d = new Date(ms);
  const dia = (d.getUTCDay() + 6) % 7; // segunda = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dia);
}
function funil(linhas, statusCortesia) {
  const semanas = new Map();
  for (const c of linhas || []) {
    const s = inicioDaSemana(Number(c.created_at) || 0);
    if (!semanas.has(s)) semanas.set(s, { semana: s, cadastros: 0, ligaramTela: 0, pagos: 0 });
    const x = semanas.get(s);
    x.cadastros++;
    if (Number(c.pareou) > 0 || c.pareou === true) x.ligaramTela++;
    if (plans.isPaid(c.plan || 'free') && c.plan_status !== statusCortesia) x.pagos++;
  }
  const porSemana = [...semanas.values()].sort((a, b) => b.semana - a.semana);
  const total = porSemana.reduce((s, x) => ({
    cadastros: s.cadastros + x.cadastros, ligaramTela: s.ligaramTela + x.ligaramTela, pagos: s.pagos + x.pagos,
  }), { cadastros: 0, ligaramTela: 0, pagos: 0 });
  return { porSemana, total, conversaoDoTeste: total.ligaramTela ? total.pagos / total.ligaramTela : 0 };
}

/*
 * CUSTO DE IA POR CONTA (medido em uso_ia), contra o que a conta paga. A
 * margem é por mês: a janela é de 30 dias de propósito.
 */
function custoIa(linhas, statusCortesia) {
  return (linhas || []).map((r) => {
    const telas = Math.max(1, Number(r.telas) || 0);
    const cortesia = r.plan_status === statusCortesia;
    const pagando = plans.isPaid(r.plan || 'free') && !cortesia;
    const mensal = pagando ? plans.mensalidadeCents(r.plan, telas, r.plan_contrato) : 0;
    const custo = Number(r.centavos) || 0;
    return {
      id: r.tenant_id,
      nome: r.name || '(conta apagada)',
      plano: r.plan || 'free',
      cortesia,
      criacoes: Number(r.criacoes) || 0,
      chamadas: Number(r.chamadas) || 0,
      custoCents: custo,
      mensalidadeCents: mensal,
      margemCents: mensal == null ? null : mensal - custo,
      tetoCents: pagando ? plans.tetoIaCents(telas) : 0,
    };
  });
}

/*
 * O ÚLTIMO BACKUP. Quem faz é outro serviço (tools/backup.mjs, docs/BACKUP.md)
 * num bucket privado e só dele; o painel só LÊ o manifesto do dia, e só se o
 * servidor tiver as variáveis BACKUP_S3_* (é infra — sem elas, a tela diz que
 * não sabe, em vez de inventar).
 */
async function ultimoBackup(env, S3, B) {
  const e = env || {};
  if (!e.BACKUP_S3_ENDPOINT || !e.BACKUP_S3_BUCKET || !e.BACKUP_S3_ACCESS_KEY_ID || !e.BACKUP_S3_SECRET_ACCESS_KEY) {
    return { disponivel: false, motivo: 'o servidor do painel não tem acesso ao bucket de backup (BACKUP_S3_*)' };
  }
  const s3 = S3.criar({
    endpoint: e.BACKUP_S3_ENDPOINT, bucket: e.BACKUP_S3_BUCKET, region: e.BACKUP_S3_REGION || 'auto',
    key: e.BACKUP_S3_ACCESS_KEY_ID, secret: e.BACKUP_S3_SECRET_ACCESS_KEY,
  });
  const chaves = (await s3.listar('postgres/')).map((x) => (typeof x === 'string' ? x : x.chave || x.key)).filter(Boolean);
  const dias = chaves.filter((k) => /\.json$/.test(k)).map((k) => B.diaDaChave(k)).filter(Boolean).sort();
  if (!dias.length) return { disponivel: true, dia: null };
  const dia = dias[dias.length - 1];
  const r = await s3.baixar(B.chaveManifesto(dia));
  const m = r && typeof r.json === 'function' ? await r.json() : json(r);
  return {
    disponivel: true,
    dia,
    ok: !!(m && m.ok),
    fim: (m && m.fim) || null,
    bytes: (m && m.bytes) || 0,
    restaurado: !!(m && m.restauracao && m.restauracao.ok),
    erro: (m && m.erro) || '',
  };
}

module.exports = { frota, clientes, receita, funil, inicioDaSemana, custoIa, ultimoBackup };
