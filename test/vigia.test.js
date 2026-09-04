/*
 * O aviso de tela offline.
 *
 * Três defeitos justificam este arquivo, e são os três que quebram confiança
 * na direção errada: o aviso que não sai (a tela ficou preta e o cliente
 * descobriu sozinho), o aviso que sai de novo e de novo (vira spam e a pessoa
 * cria uma regra de caixa de entrada — e aí o próximo, o de verdade, também
 * some), e a enxurrada do primeiro deploy, que mandaria um e-mail por cada
 * tela morta que já está no banco há meses.
 */
const test = require('node:test');
const assert = require('node:assert');

const V = require('../server/vigia.js');

const AGORA = 1700000000000;
const MIN = 60 * 1000;

const tela = (extra) => ({
  id: 'dev1', name: 'Vitrine', tenant_id: 't1', email: 'dono@loja.com', conta: 'Loja',
  last_seen: AGORA - 30 * MIN, alerta_offline_em: null, ...extra,
});

/* ---------------- Quem entra ---------------- */

test('tela parada há mais que o limite vira aviso', () => {
  const r = V.decidir([tela()], AGORA);
  assert.equal(r.length, 1);
  assert.equal(r[0].email, 'dono@loja.com');
  assert.deepEqual(r[0].ids, ['dev1']);
});

test('oscilação de Wi-Fi não vira aviso', () => {
  // A TV pulsa a cada 30s. Cinco minutos de silêncio é rede ruim, não queda —
  // e avisar disso ensina o cliente a ignorar o aviso.
  assert.equal(V.decidir([tela({ last_seen: AGORA - 5 * MIN })], AGORA).length, 0);
});

test('tela que nunca pulsou não é queda', () => {
  // Nunca subiu. O problema dela é pareamento, e o aviso certo é outro.
  assert.equal(V.decidir([tela({ last_seen: 0 })], AGORA).length, 0);
  assert.equal(V.decidir([tela({ last_seen: null })], AGORA).length, 0);
});

test('tela abandonada há meses não acorda ninguém', () => {
  /*
   * Esta é a que protege o PRIMEIRO deploy. Sem ela, a varredura inicial
   * encontraria toda tela morta que já existe no banco — nenhuma com
   * alerta_offline_em preenchido — e mandaria a conta inteira de uma vez.
   */
  const r = V.decidir([tela({ last_seen: AGORA - 90 * 24 * 60 * MIN })], AGORA);
  assert.equal(r.length, 0);
});

test('tela sem dono não gera aviso sem destinatário', () => {
  assert.equal(V.decidir([tela({ email: null })], AGORA).length, 0);
  assert.equal(V.decidir([tela({ tenant_id: null })], AGORA).length, 0);
});

/* ---------------- Uma vez por queda ---------------- */

test('queda já avisada não é avisada de novo', () => {
  const t = tela({ alerta_offline_em: AGORA - 20 * MIN }); // avisamos depois de ela cair
  assert.equal(V.decidir([t], AGORA).length, 0);
});

test('voltar e cair de novo é queda nova', () => {
  /*
   * A tela caiu, avisamos, ela voltou (pulsou), e caiu outra vez. Se o aviso
   * antigo calasse este, o segundo apagão passaria em silêncio para sempre.
   */
  const t = tela({ alerta_offline_em: AGORA - 300 * MIN, last_seen: AGORA - 30 * MIN });
  assert.equal(V.decidir([t], AGORA).length, 1);
});

/* ---------------- Um e-mail por conta ---------------- */

test('internet da loja caindo é um e-mail, não oito', () => {
  const telas = ['a', 'b', 'c'].map((id, i) => tela({ id, name: 'Tela ' + id, last_seen: AGORA - (30 + i) * MIN }));
  const r = V.decidir(telas, AGORA);
  assert.equal(r.length, 1);
  assert.equal(r[0].telas.length, 3);
  assert.deepEqual(r[0].ids.sort(), ['a', 'b', 'c']);
});

test('contas diferentes recebem e-mails diferentes', () => {
  const r = V.decidir([tela(), tela({ id: 'd2', tenant_id: 't2', email: 'outro@x.com' })], AGORA);
  assert.equal(r.length, 2);
});

test('a tela que caiu por último aparece primeiro', () => {
  const r = V.decidir([
    tela({ id: 'velha', last_seen: AGORA - 300 * MIN }),
    tela({ id: 'nova', last_seen: AGORA - 20 * MIN }),
  ], AGORA);
  assert.equal(r[0].telas[0].id, 'nova');
});

/* ---------------- O que a pessoa lê ---------------- */

test('o assunto nomeia a tela quando é uma só', () => {
  const [aviso] = V.decidir([tela()], AGORA);
  const m = V.mensagem(aviso, 'https://app.multitelas.com.br');
  assert.match(m.subject, /Vitrine/);
  assert.match(m.subject, /fora do ar/);
  assert.match(m.text, /há 30 minutos/);
});

test('com várias telas o assunto conta quantas', () => {
  const telas = ['a', 'b'].map((id) => tela({ id, name: 'Tela ' + id }));
  const m = V.mensagem(V.decidir(telas, AGORA)[0], '');
  assert.match(m.subject, /2 telas/);
  // Várias juntas quase nunca são várias TVs quebradas ao mesmo tempo.
  assert.match(m.text, /internet do local|energia/i);
});

test('o e-mail não promete trabalho que o cliente não precisa fazer', () => {
  // Ele não tem que reprogramar nada: a tela volta sozinha ao que já estava.
  const m = V.mensagem(V.decidir([tela()], AGORA)[0], '');
  assert.match(m.text, /volta a exibir sozinha/i);
});

test('lista longa é resumida em vez de virar parede de texto', () => {
  const telas = Array.from({ length: 12 }, (_, i) => tela({ id: 'd' + i, name: 'Tela ' + i }));
  const m = V.mensagem(V.decidir(telas, AGORA)[0], '');
  assert.match(m.text, /e mais 4 telas/);
});

test('nome de tela com HTML não escapa para dentro do e-mail', () => {
  const m = V.mensagem(V.decidir([tela({ name: '<script>x</script>' })], AGORA)[0], '');
  assert.ok(!m.html.includes('<script>'));
  assert.match(m.html, /&lt;script&gt;/);
});

test('sem APP_URL o e-mail não sai com um botão quebrado', () => {
  const m = V.mensagem(V.decidir([tela()], AGORA)[0], '');
  assert.ok(!/href="\/app"/.test(m.html));
});

/* ---------------- A varredura ---------------- */

function bancoFake(linhas) {
  const marcados = [];
  return {
    marcados,
    async telasCaidas() { return linhas; },
    async marcarAlertaOffline(ids, quando) { marcados.push({ ids, quando }); },
  };
}

test('varrer manda o e-mail e marca a queda como avisada', async () => {
  const db = bancoFake([tela()]);
  const enviados = [];
  const mail = { async send(m) { enviados.push(m); } };
  const r = await V.varrer({ db, mail, appUrl: '', agora: AGORA });
  assert.equal(r.enviados, 1);
  assert.equal(enviados[0].to, 'dono@loja.com');
  assert.deepEqual(db.marcados[0].ids, ['dev1']);
});

test('provedor de e-mail fora do ar NÃO marca a queda como avisada', () => {
  /*
   * Marcar antes de enviar evitaria e-mail repetido e cobraria o preço no
   * lugar errado: a queda ficaria marcada como avisada sem nunca ter saído
   * aviso nenhum — a tela preta que o cliente descobre sozinho, que é
   * exatamente o defeito que este código existe para não ter.
   */
  const db = bancoFake([tela()]);
  const mail = { async send() { throw new Error('Resend HTTP 500'); } };
  return V.varrer({ db, mail, appUrl: '', agora: AGORA }).then((r) => {
    assert.equal(r.enviados, 0);
    assert.equal(db.marcados.length, 0);
  });
});

test('uma conta com falha não impede o aviso das outras', async () => {
  const db = bancoFake([tela(), tela({ id: 'd2', tenant_id: 't2', email: 'b@x.com' })]);
  const mail = { async send(m) { if (m.to === 'dono@loja.com') throw new Error('recusado'); } };
  const r = await V.varrer({ db, mail, appUrl: '', agora: AGORA });
  assert.equal(r.enviados, 1);
  assert.deepEqual(db.marcados[0].ids, ['d2']);
});
