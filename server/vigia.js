/*
 * server/vigia.js — a tela caiu e o cliente fica sabendo por nós.
 *
 * O painel já mostrava se a tela está online. Mostrar não é avisar: ninguém
 * abre o painel para conferir se está tudo bem — abre depois que o gerente da
 * loja reclamou que a TV está preta desde ontem. O concorrente vende
 * "monitoramento remoto" e entrega a mesma coisa: uma luzinha que só existe
 * para quem foi olhar.
 *
 * Aqui a varredura é do servidor. A TV pulsa a cada 30s; quinze minutos de
 * silêncio é queda de verdade, não oscilação de Wi-Fi, e rende um e-mail para
 * o dono da conta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AS TRÊS COISAS QUE ISTO NÃO PODE FAZER
 *
 *   — Avisar duas vezes da mesma queda. `alerta_offline_em` guarda quando
 *     avisamos; enquanto a tela não voltar (não pulsar de novo), ela não
 *     entra outra vez. Voltar e cair de novo é queda nova, e essa merece
 *     aviso.
 *   — Acordar o cliente por causa de tela abandonada. Uma tela desligada há
 *     três meses não é notícia. Só entra queda de até JANELA — e é isso que
 *     impede o primeiro deploy disto de disparar um e-mail por cada tela
 *     morta que já existe no banco.
 *   — Mandar oito e-mails quando a internet da loja cai. O aviso é por CONTA,
 *     com a lista das telas: uma queda de link é um evento, não oito.
 */
'use strict';

const { log } = require('./log.js');

// A TV pulsa a cada 30s. 15 min = 30 batidas perdidas: já não é oscilação.
const LIMITE_MS = 15 * 60 * 1000;
// Queda mais velha que isto é tela abandonada, não novidade. Contada em
// horas de EXPEDIENTE (ver abaixo), não de relógio.
const JANELA_MS = 24 * 60 * 60 * 1000;
// De quanto em quanto a varredura roda.
const INTERVALO_MS = 5 * 60 * 1000;
// Quantas telas o e-mail nomeia antes de resumir o resto.
const MAX_NOMEADAS = 8;

/* ---------------- Expediente ----------------
 *
 * O defeito que isto conserta: a loja desliga a TV às 22h, e às 22h15 saía
 * "Vitrine está fora do ar". Toda noite. Em uma semana o cliente cria uma
 * regra que manda o aviso para o lixo — e o aviso de verdade, o da TV que
 * morreu numa terça de manhã, vai junto.
 *
 * A regra: só conta tempo fora do ar DENTRO do expediente, e só avisa
 * DURANTE o expediente. A TV desligada às 22h que não voltou às 7h vira
 * aviso às 7h15 — que é exatamente quando alguém precisa saber.
 *
 * O horário é o de Brasília por padrão: o servidor roda em UTC, e "7h" para
 * o dono da padaria é 7h no relógio dele.
 */
/*
 * A regra mora em js/expediente.js, a MESMA que a TV usa para apagar fora do
 * horário (EXECUTOR, item 8). Duas contas e, um dia, a TV apagaria às 22h e
 * o vigia acharia que ela caiu.
 */
const E = require('../js/expediente.js');
const EXPEDIENTE_PADRAO = E.PADRAO;
const normalizarExpediente = E.normalizar;

// Quanto para trás o banco busca: um fim de semana prolongado inteiro.
const BUSCA_MS = 5 * 24 * 60 * 60 * 1000;
// Passo da soma de tempo de expediente. Cinco minutos = a mesma precisão da varredura.
const PASSO_MS = 5 * 60 * 1000;

/*
 * Memória do relógio por passo de 5 minutos: a varredura pergunta pelos
 * MESMOS instantes para todas as telas (os passos são alinhados), e
 * formatToParts é caro. Sem isto, centenas de telas caídas num fim de semana
 * viravam centenas de milhares de chamadas por varredura, travando o servidor.
 */
const memoRelogio = new Map();
function relogioLocal(t, fuso) {
  const passo = Math.floor(t / PASSO_MS);
  const chave = fuso + '|' + passo;
  let base = memoRelogio.get(chave);
  if (!base) {
    base = E.relogioLocal(passo * PASSO_MS, fuso);
    if (memoRelogio.size > 20000) memoRelogio.clear();
    memoRelogio.set(chave, base);
  }
  // O início do passo vem da memória; os minutos dentro dele, da conta.
  let min = base.min + Math.floor((t - passo * PASSO_MS) / 60000);
  let dia = base.dia;
  if (min >= 1440) { min -= 1440; dia = (dia + 1) % 7; }
  return { dia, min };
}

/* O instante `t` está dentro do expediente? (a regra: js/expediente.js) */
function dentroDoExpediente(t, exp) {
  return E.dentro(t, exp, relogioLocal);
}

/* Quanto do intervalo [de, ate) caiu dentro do expediente. */
function tempoDeExpediente(de, ate, exp) {
  let soma = 0;
  let t = de;
  while (t < ate) {
    // Anda até a próxima fronteira de 5 min: os instantes consultados são os
    // mesmos para todas as telas, e a memória do relógio serve a todas.
    const prox = Math.min(ate, (Math.floor(t / PASSO_MS) + 1) * PASSO_MS);
    if (dentroDoExpediente(t, exp)) soma += prox - t;
    t = prox;
  }
  return soma;
}

/*
 * decidir — puro: recebe linhas do banco, devolve os avisos a mandar.
 *
 * Todas as regras moram aqui, e não no SQL, porque é aqui que dá para provar
 * que elas valem. O SQL faz o corte grosso por tempo (para não ler a frota
 * inteira a cada cinco minutos) e repete as mesmas condições; se as duas
 * discordarem, quem manda é esta função.
 */
function decidir(telas, agora, opcoes) {
  const o = opcoes || {};
  const limite = o.limiteMs || LIMITE_MS;
  const janela = o.janelaMs || JANELA_MS;
  const porConta = new Map();

  for (const t of telas || []) {
    const desde = Number(t.last_seen) || 0;
    // Tela que nunca pulsou não caiu: nunca subiu. É o pareamento que falta,
    // e para isso o aviso certo é outro.
    if (!desde) continue;
    if (!t.tenant_id || !t.email) continue;
    const parada = agora - desde;
    if (parada < limite) continue;

    // Já avisamos desta queda: sai antes da conta cara do expediente.
    if ((Number(t.alerta_offline_em) || 0) >= desde) continue;

    const exp = normalizarExpediente(t.expediente);
    // Desligado pelo dono: nada de aviso para esta tela.
    if (!exp.alerta) continue;
    // Fora do expediente ninguém precisa ser acordado. O aviso sai quando o
    // expediente começar, se a tela ainda estiver fora.
    if (!dentroDoExpediente(agora, exp)) continue;
    const paradaNoExpediente = tempoDeExpediente(desde, agora, exp);
    if (paradaNoExpediente < limite) continue;
    if (paradaNoExpediente > janela) continue;
    // Já avisamos desta queda: só volta a valer se a tela pulsou depois.
    const avisado = Number(t.alerta_offline_em) || 0;
    if (avisado >= desde) continue;

    const chave = t.tenant_id;
    if (!porConta.has(chave)) {
      porConta.set(chave, { tenantId: chave, email: t.email, conta: t.conta || '', telas: [], ids: [] });
    }
    const aviso = porConta.get(chave);
    aviso.telas.push({ id: t.id, nome: t.name || 'Tela sem nome', desde, parada });
    aviso.ids.push(t.id);
  }

  // A mais recente primeiro: é a que a pessoa acabou de perder.
  for (const a of porConta.values()) a.telas.sort((x, y) => y.desde - x.desde);
  return [...porConta.values()];
}

/* "há 20 minutos" / "há 3 horas" — sem trazer biblioteca de data para isto. */
function faz(ms) {
  const min = Math.round(ms / 60000);
  if (min < 60) return 'há ' + min + ' minutos';
  const h = Math.round(min / 60);
  if (h < 24) return 'há ' + h + (h === 1 ? ' hora' : ' horas');
  const d = Math.round(h / 24);
  return 'há ' + d + (d === 1 ? ' dia' : ' dias');
}

/*
 * Texto do aviso. Fica aqui, e não em mail.js, porque é conteúdo de produto:
 * o que a pessoa lê às sete da manhã tem que dizer QUAL tela, HÁ QUANTO
 * TEMPO, e o que fazer — nessa ordem, e sem jargão.
 */
function mensagem(aviso, appUrl) {
  const n = aviso.telas.length;
  const nomeadas = aviso.telas.slice(0, MAX_NOMEADAS);
  const resto = n - nomeadas.length;
  const titulo = n === 1
    ? aviso.telas[0].nome + ' está fora do ar'
    : n + ' telas estão fora do ar';
  const subject = (n === 1 ? '⚠ ' : '⚠ ') + titulo + ' · MultiTelas';

  const linhas = nomeadas.map((t) => '  • ' + t.nome + ' — sem sinal ' + faz(t.parada));
  if (resto > 0) linhas.push('  • e mais ' + resto + (resto === 1 ? ' tela' : ' telas'));

  const causas = n > 1
    ? 'Quando várias caem juntas, quase sempre é a internet do local ou a energia.'
    : 'Na maioria das vezes é a TV desligada no botão, o cabo de rede solto ou o Wi-Fi caído.';

  const text = titulo + '.\n\n' + linhas.join('\n') + '\n\n' + causas +
    '\n\nVocê não precisa fazer nada no MultiTelas: assim que a tela voltar a ' +
    'ter internet, ela volta a exibir sozinha o que já estava programado.\n\n' +
    (appUrl ? 'Ver a frota: ' + appUrl + '/app\n\n' : '') +
    'Este aviso é enviado uma vez por queda.';

  const itens = nomeadas.map((t) =>
    '<li style="margin:0 0 6px"><strong>' + escapar(t.nome) + '</strong> ' +
    '<span style="color:#64748b">— sem sinal ' + faz(t.parada) + '</span></li>').join('');
  const extra = resto > 0
    ? '<li style="margin:0 0 6px;color:#64748b">e mais ' + resto + (resto === 1 ? ' tela' : ' telas') + '</li>'
    : '';

  const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">' +
    '<h1 style="font-size:18px;margin:0 0 12px">' + escapar(titulo) + '</h1>' +
    '<ul style="font-size:14px;line-height:1.6;margin:0 0 20px;padding-left:20px;color:#334155">' + itens + extra + '</ul>' +
    '<p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#334155">' + causas + '</p>' +
    '<p style="font-size:14px;line-height:1.6;margin:0 0 20px;color:#334155">Você não precisa fazer nada aqui: quando a tela voltar a ter internet, ela volta a exibir sozinha o que já estava programado.</p>' +
    (appUrl ? '<p style="margin:0 0 24px"><a href="' + appUrl + '/app" style="display:inline-block;background:#2f6feb;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px">Ver a frota</a></p>' : '') +
    '<p style="font-size:12px;line-height:1.6;color:#64748b;margin:0">Este aviso é enviado uma vez por queda.</p>' +
    '</div>';

  return { subject, text, html };
}

function escapar(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/*
 * varrer — uma passada. Lê, decide, manda, marca.
 *
 * A marcação vem DEPOIS do envio de propósito. Marcar antes evitaria e-mail
 * repetido se o provedor falhasse no meio, e o preço seria a queda que nunca
 * foi avisada — o defeito exato que este arquivo existe para não ter. Um
 * aviso duplicado é chato; um aviso que não sai é a tela preta que o cliente
 * descobre sozinho.
 */
async function varrer({ db, mail, appUrl, agora }) {
  const t0 = typeof agora === 'number' ? agora : Date.now();
  // A busca volta mais que a janela: a janela conta horas de EXPEDIENTE, e
  // uma TV que caiu sábado às 22h só completa 15 minutos de expediente
  // fora do ar na segunda às 7h15.
  const linhas = await db.telasCaidas(t0 - BUSCA_MS, t0 - LIMITE_MS);
  const avisos = decidir(linhas, t0);
  let enviados = 0;

  for (const aviso of avisos) {
    const { subject, text, html } = mensagem(aviso, appUrl);
    try {
      await mail.send({ to: aviso.email, subject, html, text });
      await db.marcarAlertaOffline(aviso.ids, t0);
      enviados++;
    } catch (e) {
      // Falha de provedor não pode derrubar a varredura das outras contas, e
      // não marca: a próxima passada tenta de novo.
      log.aviso('vigia.envio-falhou', { conta: aviso.tenantId, motivo: e.message });
    }
  }

  if (enviados) log.info('vigia.avisos', { contas: enviados });
  return { avisos: avisos.length, enviados };
}

/*
 * ligar — agenda a varredura. `unref` para não segurar o processo de pé.
 *
 * A primeira passada é adiada um minuto: subiu agora, a frota inteira ainda
 * não pulsou, e varrer nesse instante acusaria de offline metade das telas que
 * estão vivas esperando o primeiro heartbeat depois do deploy.
 */
function ligar({ db, mail, appUrl }) {
  const passada = () => varrer({ db, mail, appUrl })
    .catch((e) => log.aviso('vigia.varredura-falhou', { motivo: e.message }));
  const inicio = setTimeout(passada, 60 * 1000);
  if (inicio.unref) inicio.unref();
  const relogio = setInterval(passada, INTERVALO_MS);
  if (relogio.unref) relogio.unref();
  return () => { clearTimeout(inicio); clearInterval(relogio); };
}

module.exports = {
  decidir, mensagem, varrer, ligar, faz, LIMITE_MS, JANELA_MS, INTERVALO_MS, MAX_NOMEADAS,
  EXPEDIENTE_PADRAO, normalizarExpediente, dentroDoExpediente, tempoDeExpediente,
};
