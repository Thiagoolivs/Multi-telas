/*
 * A semana simulada (fase 5 do plano de ação; o método do BLOCO-3).
 *
 * Cada cenário monta a programação como o painel monta (as faixas do dia
 * com cobrirODia, a importância com js/importancia.js) e roda uma semana
 * inteira, de quinta 05/11 a quarta 11/11, hora a hora: em cada hora a zona
 * gira 2 minutos com o MESMO rodízio da TV (js/rodizio.js). Mede o que a
 * parede mostra:
 *   - buraco: hora de loja aberta em que a zona com conteúdo fica só com o relógio;
 *   - repetição seguida: a mesma peça de novo logo depois dela, havendo outras;
 *   - teto: o urgente com até 25% do tempo e a Alta com até 40%;
 *   - vencida: peça no ar depois do fim.
 * E a volta do tamanho do lugar: o painel avisa quando ela foge do lugar
 * (web/src/lib/screenDigest.js).
 */
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/rodizio.js');
const I = require('../js/importancia.js');

const INICIO = new Date(2026, 10, 5, 0, 0);   // quinta, 05/11/2026
const dd = (n) => String(n).padStart(2, '0');
const isoDe = (d) => d.getFullYear() + '-' + dd(d.getMonth() + 1) + '-' + dd(d.getDate());

let A; // web/src/lib/aplicarConteudo.js (ESM)
test.before(async () => { A = await import('../web/src/lib/aplicarConteudo.js'); });

const peca = (id, titulo, extra) => Object.assign({ type: 'announce', id, titulo, corpo: 'Venha conferir com a gente.', duracao: 12 }, extra || {});
/*
 * O "hoje" do painel é o primeiro dia da semana simulada (quinta, 05/11), e
 * não o do relógio de quem roda o teste: agendarPeca começa a peça HOJE, e
 * rodado no dia 06 a quinta inteira virava relógio (15 "buracos") e a oferta
 * terminava no domingo.
 */
function noPrimeiroDia(fn) {
  const Real = Date;
  class Congelado extends Real {
    constructor(...a) { if (a.length) super(...a); else super(INICIO.getTime()); }
    static now() { return INICIO.getTime(); }
  }
  globalThis.Date = Congelado;
  try { return fn(); } finally { globalThis.Date = Real; }
}
const naFaixa = (item, faixa, dias) => noPrimeiroDia(() => A.agendarPeca(item, faixa, dias || 0));

/*
 * Roda a zona a semana inteira. `aberto(dia, hora)`: o horário da loja
 * (fora dele a TV mostra o relógio de propósito, não é buraco).
 */
function semana(itens, aberto) {
  const r = { buracos: 0, seguidas: 0, vencidas: 0, horasUrgenteAcima: 0, horasAltaAcima: 0, entradas: 0, maxUrgente: 0, maxAlta: 0 };
  let ultimo = null;
  // Como na TV (js/player.js, advance): o índice segue de uma hora para a outra, não recomeça.
  let idx = 0;
  for (let h = 0; h < 168; h++) {
    const t = new Date(INICIO.getTime() + h * 3600 * 1000 + 5 * 60 * 1000);
    const loja = { data: isoDe(t), dia: t.getDay(), hm: dd(t.getHours()) + ':' + dd(t.getMinutes()) };
    const ctx = { agoraMs: t.getTime(), hoje: loja.data };
    const noAr = itens.filter((it) => R.naJanela(it, loja) && !(it.meta && Number(it.meta.expiraEm) > 0 && t.getTime() > it.meta.expiraEm));
    const dur = (it) => R.duracaoDe(it, it.duracao || 12);
    const seq = R.distribuir(noAr, ctx, dur);
    const abre = aberto(t.getDay(), t.getHours());
    if (!seq.length) { if (abre && itens.length) r.buracos++; ultimo = null; continue; }
    // 2 minutos de TV: a sequência gira (e a volta seguinte começa onde a outra parou).
    let s = 0;
    const tempo = { urgente: 0, alta: 0, normal: 0 };
    const distintos = new Set(seq).size;
    while (s < 120) {
      let it = seq[idx % seq.length];
      // O mesmo que a TV faz (js/player.js): a lista mudou e a primeira dela é a que está no ar → a seguinte.
      if (it === ultimo && seq.length > 1 && seq[(idx - 1 + seq.length) % seq.length] !== it) { idx++; it = seq[idx % seq.length]; }
      if (it === ultimo && distintos >= 3) r.seguidas++;
      if (it.agendamento && it.agendamento.dataFim && loja.data > it.agendamento.dataFim) r.vencidas++;
      const d = Math.max(1, dur(it));
      tempo[R.nivelDe(it, ctx)] += d;
      s += d; idx++; r.entradas++;
      ultimo = it;
    }
    const total = tempo.urgente + tempo.alta + tempo.normal;
    const temOutros = noAr.some((it) => R.nivelDe(it, ctx) !== 'urgente');
    const temNormal = noAr.some((it) => R.nivelDe(it, ctx) === 'normal');
    // Medido na volta inteira (a de 2 min corta no meio; o teto vale para a volta).
    const volta = { urgente: 0, alta: 0, normal: 0 };
    seq.forEach((it) => { volta[R.nivelDe(it, ctx)] += dur(it); });
    const tv = volta.urgente + volta.alta + volta.normal;
    if (temOutros && tv) { r.maxUrgente = Math.max(r.maxUrgente, volta.urgente / tv); if (volta.urgente / tv > R.TETO.urgente + 0.01) r.horasUrgenteAcima++; }
    if (temNormal && tv) { r.maxAlta = Math.max(r.maxAlta, volta.alta / tv); if (volta.alta / tv > R.TETO.alta + 0.01) r.horasAltaAcima++; }
    void total;
  }
  return r;
}
const lojaDas7As22 = (dia, h) => h >= 7 && h < 22;
const sempre = () => true;

function confere(nome, r) {
  assert.equal(r.buracos, 0, nome + ': horas de loja aberta só com o relógio');
  assert.equal(r.seguidas, 0, nome + ': a mesma peça duas vezes seguidas');
  assert.equal(r.vencidas, 0, nome + ': peça vencida no ar');
  assert.equal(r.horasUrgenteAcima, 0, nome + ': urgente acima de 25% (máx. ' + Math.round(r.maxUrgente * 100) + '%)');
  assert.equal(r.horasAltaAcima, 0, nome + ': Alta acima de 40% (máx. ' + Math.round(r.maxAlta * 100) + '%)');
}

test('1. Balcão, conta nova: as faixas que a IA deu cobrem o dia inteiro (antes: 7 h de relógio por dia)', () => {
  // A IA pôs duas peças de manhã e uma à tarde (o caso do BLOCO-3): sem cobrir, almoço e noite viravam relógio.
  const principal = A.cobrirODia([
    naFaixa(peca('m1', 'Seu café da manhã perfeito'), 'manha'),
    naFaixa(peca('m2', 'Pão quentinho às 7h'), 'manha'),
    naFaixa(peca('t1', 'Bolo da tarde'), 'tarde'),
  ]);
  const lateral = A.cobrirODia([naFaixa(peca('l1', 'Encomende pelo WhatsApp'), 'manha')]);
  confere('principal', semana(principal, lojaDas7As22));
  confere('lateral (uma peça só: fica no ar, não reentra)', semana(lateral, lojaDas7As22));
});

test('2. Cardápio por horário: café, almoço e happy hour, cada um na hora, sem vão', () => {
  const z = A.cobrirODia([
    naFaixa(peca('c', 'Café da manhã'), 'manha'),
    naFaixa(peca('a', 'Prato do dia'), 'almoco'),
    naFaixa(peca('h', 'Happy hour'), 'saida'),
  ]);
  confere('cardápio', semana(z, lojaDas7As22));
  // Cada peça continua na hora dela: o almoço não aparece às 8h.
  assert.equal(R.naJanela(z[1], { data: '2026-11-05', dia: 4, hm: '08:00' }), false);
  assert.equal(R.naJanela(z[0], { data: '2026-11-05', dia: 4, hm: '06:30' }), true, 'o café vale desde a abertura');
  assert.equal(R.naJanela(z[1], { data: '2026-11-05', dia: 4, hm: '15:00' }), true, 'o almoço estica pela tarde, que não tinha peça');
});

test('3. Oferta até sábado: entra, vale Alta no último dia e sai sozinha no domingo', () => {
  const oferta = I.comImportancia(naFaixa(peca('o', 'Leve 3, pague 2'), 'dia', 3), { agoraMs: INICIO.getTime() });
  assert.equal(oferta.agendamento.dataFim, '2026-11-07');
  assert.equal(oferta.meta.prioridade, 'alta', 'é oferta');
  const z = [oferta, peca('n1', 'Nossa história'), peca('n2', 'Pão de fermentação natural'), peca('n3', 'Siga a gente')];
  const r = semana(z, lojaDas7As22);
  confere('oferta', r);
  assert.equal(R.naJanela(oferta, { data: '2026-11-08', dia: 0, hm: '10:00' }), false, 'domingo ela já saiu');
});

test('4 e 6. Dois urgentes e duas campanhas juntos: o urgente fica no teto de 25% (antes: 60% da tela)', () => {
  const u1 = I.comImportancia(peca('u1', 'Acabou o pão de queijo!', { corpo: 'Urgente: nova fornada às 16h.' }));
  const u2 = I.comImportancia(peca('u2', 'Cuidado: piso molhado na entrada'));
  assert.equal(u1.meta.prioridade, 'urgente');
  assert.equal(u2.meta.prioridade, 'urgente');
  const camp = (c, n) => Object.assign(peca(c + n, 'Campanha ' + c + ' ' + n), { _campanha: c });
  const z = [u1, u2, camp('X', 1), camp('X', 2), camp('X', 3), camp('Y', 1), camp('Y', 2), peca('n', 'Cardápio')];
  const r = semana(z, sempre);
  confere('Loja Centro', r);
  assert.ok(r.maxUrgente > 0.1, 'o urgente continua passando');
});

test('7. Trinta peças no balcão: a volta passa de 5 min e o painel avisa', async () => {
  const D = await import('../web/src/lib/screenDigest.js');
  const itens = Array.from({ length: 30 }, (_, i) => peca('p' + i, 'Peça número ' + (i + 1) + ' da loja, com o texto do dia'));
  confere('Shopping', semana(itens, lojaDas7As22));
  const cfg = { settings: { layoutId: 'full', local: 'balcao' }, zonas: { principal: { items: itens } } };
  const d = D.digest(cfg);
  assert.ok(d.problemas.some((p) => /leva .* para dar a volta: no balcão/.test(p.texto)), JSON.stringify(d.problemas));
});

test('10. Empresas: "sistema fora do ar" urgente sem fim não toma a semana (fica no teto)', () => {
  const fora = I.comImportancia(peca('f', 'Urgente: o sistema está fora do ar', { corpo: 'Use a planilha de contingência.' }));
  assert.equal(fora.meta.prioridade, 'urgente', 'a IA ignorava a palavra "urgente"');
  const vacina = naFaixa(peca('v', 'Vacinação até sexta'), 'dia', 2);
  const z = [fora, vacina, peca('c', 'Reunião geral'), peca('r', 'Refeitório: cardápio da semana')];
  confere('Refeitório', semana(z, lojaDas7As22));
});

test('11. Sala de espera com 6 peças: a volta de ~1 min não serve a quem espera 12 — o painel avisa', async () => {
  const D = await import('../web/src/lib/screenDigest.js');
  const itens = Array.from({ length: 6 }, (_, i) => peca('s' + i, 'Dica de saúde ' + (i + 1)));
  confere('Sala de espera', semana(itens, lojaDas7As22));
  const d = D.digest({ settings: { layoutId: 'full' }, zonas: { principal: { items: itens } } }, null, 'saude');
  assert.ok(d.problemas.some((p) => /na sala de espera a pessoa fica uns 8min/.test(p.texto)), JSON.stringify(d.problemas));
});

test('o tempo é o da leitura: 1 s por palavra, de 6 a 25 s; o tempo posto à mão vale', () => {
  assert.equal(R.duracaoDe({ type: 'announce', titulo: 'Oi' }, 12), 6, 'mínimo de 6 s');
  assert.equal(R.duracaoDe({ type: 'announce', titulo: 'Degustação de pães no sábado', corpo: 'Das 9h às 12h, no balcão.' }, 12), 11);
  assert.equal(R.duracaoDe({ type: 'announce', titulo: 'x '.repeat(60) }, 12), 25, 'máximo de 25 s');
  assert.equal(R.duracaoDe({ type: 'announce', titulo: 'Oi', duracao: 30, meta: { duracaoManual: true } }, 30), 30);
  assert.equal(R.duracaoDe({ type: 'image', duracao: 8 }, 8), 8, 'foto tem o tempo dela');
  assert.equal(R.duracaoDe({ type: 'video', duracao: 0 }, 0), 0, 'vídeo vai até o fim');
});
