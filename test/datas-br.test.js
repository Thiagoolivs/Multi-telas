/*
 * Quando cada data cai, de verdade.
 *
 * O defeito que trouxe este arquivo: o catálogo usava faixas fixas em MMDD, e
 * metade das datas brasileiras é móvel. Dia dos Pais é o 2º domingo de agosto;
 * em 2026 caiu no dia 9, e a faixa fixa 01/08–11/08 ligava a homenagem oito
 * dias antes e a mantinha no ar dois dias DEPOIS. "Feliz Dia dos Pais" numa
 * terça, depois do domingo, é pior do que não ter posto nada.
 *
 * Datas móveis são o tipo de coisa que passa despercebida por um ano inteiro e
 * aparece na parede do cliente. Por isso cada uma tem aqui um ano conferido
 * contra o calendário.
 */
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/datas-br');

const iso = (d) => d.getFullYear() + '-'
  + String(d.getMonth() + 1).padStart(2, '0') + '-'
  + String(d.getDate()).padStart(2, '0');

test('Páscoa, conferida contra o calendário', () => {
  const esperado = {
    2024: '2024-03-31',
    2025: '2025-04-20',
    2026: '2026-04-05',
    2027: '2027-03-28',
    2028: '2028-04-16',
    2030: '2030-04-21',
  };
  for (const [ano, data] of Object.entries(esperado)) {
    assert.equal(iso(D.pascoa(Number(ano))), data, 'Páscoa de ' + ano);
  }
});

test('Carnaval é 47 dias antes da Páscoa', () => {
  // Terça de carnaval: 2026 cai em 17 de fevereiro.
  assert.equal(iso(D.quandoCai({ tipo: 'pascoa', desloc: -47 }, 2026)), '2026-02-17');
  assert.equal(iso(D.quandoCai({ tipo: 'pascoa', desloc: -47 }, 2025)), '2025-03-04');
});

test('Corpus Christi é 60 dias depois da Páscoa', () => {
  assert.equal(iso(D.quandoCai({ tipo: 'pascoa', desloc: 60 }, 2026)), '2026-06-04');
});

test('segundo domingo do mês: Dia das Mães e Dia dos Pais', () => {
  // O caso do relato. Agosto de 2026 começa num sábado: os domingos são 2, 9,
  // 16, 23, 30 — o segundo é o dia 9.
  assert.equal(iso(D.nthSemana(2026, 8, 2, 0)), '2026-08-09', 'Dia dos Pais 2026');
  assert.equal(iso(D.nthSemana(2026, 5, 2, 0)), '2026-05-10', 'Dia das Mães 2026');
  assert.equal(iso(D.nthSemana(2025, 8, 2, 0)), '2025-08-10');
  assert.equal(iso(D.nthSemana(2025, 5, 2, 0)), '2025-05-11');
});

test('mês que começa exatamente no dia da semana procurado', () => {
  // Armadilha do cálculo: quando o dia 1º já é o dia procurado, o primeiro é
  // o próprio dia 1º — e não a semana seguinte.
  // 1º de fevereiro de 2026 é um domingo.
  assert.equal(iso(D.nthSemana(2026, 2, 1, 0)), '2026-02-01');
  assert.equal(iso(D.nthSemana(2026, 2, 2, 0)), '2026-02-08');
});

test('última sexta do mês: Black Friday', () => {
  assert.equal(iso(D.nthSemana(2026, 11, -1, 5)), '2026-11-27');
  assert.equal(iso(D.nthSemana(2025, 11, -1, 5)), '2025-11-28');
  assert.equal(iso(D.nthSemana(2024, 11, -1, 5)), '2024-11-29');
});

test('a janela conta a partir da data, e não sobra depois dela', () => {
  const pais = { quando: { tipo: 'semana', mes: 8, semana: 2, diaSemana: 0 }, antes: 6, depois: 0 };
  const j = D.janela(pais, 2026);
  assert.equal(iso(j.alvo), '2026-08-09');
  assert.equal(iso(j.inicio), '2026-08-03');
  assert.equal(iso(j.fim), '2026-08-09');
});

test('o dia 11 de agosto de 2026 NÃO exibe mais o Dia dos Pais', () => {
  // Este é o relato, virado teste.
  const pais = { quando: { tipo: 'semana', mes: 8, semana: 2, diaSemana: 0 }, antes: 6, depois: 0 };
  assert.equal(D.janelaVigente(pais, new Date(2026, 7, 11)), null, 'ainda estava no ar dois dias depois');
  assert.ok(D.janelaVigente(pais, new Date(2026, 7, 9)), 'sumiu no próprio dia');
  assert.ok(D.janelaVigente(pais, new Date(2026, 7, 3)), 'não entrou no começo da janela');
  assert.equal(D.janelaVigente(pais, new Date(2026, 7, 2)), null, 'entrou cedo demais');
});

test('janela que cruza o Ano Novo vale no dia 1º de janeiro', () => {
  /*
   * O 1º de janeiro é o dia em que a mensagem de Ano Novo mais importa, e é
   * exatamente onde uma conta feita só com o ano corrente falha: a janela
   * pertence ao ano anterior.
   */
  const anoNovo = { quando: { tipo: 'fixo', mes: 1, dia: 1 }, antes: 6, depois: 5 };
  assert.ok(D.janelaVigente(anoNovo, new Date(2026, 0, 1)), 'sumiu no dia 1º');
  assert.ok(D.janelaVigente(anoNovo, new Date(2025, 11, 28)), 'não apareceu antes da virada');
  assert.ok(D.janelaVigente(anoNovo, new Date(2026, 0, 5)), 'sumiu cedo demais em janeiro');
  assert.equal(D.janelaVigente(anoNovo, new Date(2026, 0, 20)), null, 'ficou o mês inteiro');
});

test('campanha de mês inteiro ocupa o mês, e só ele', () => {
  const rosa = { quando: { tipo: 'mes', mes: 10 } };
  const j = D.janela(rosa, 2026);
  assert.equal(iso(j.inicio), '2026-10-01');
  assert.equal(iso(j.fim), '2026-10-31');
  assert.ok(D.janelaVigente(rosa, new Date(2026, 9, 31)));
  assert.equal(D.janelaVigente(rosa, new Date(2026, 10, 1)), null);
});

test('fevereiro de ano bissexto não quebra o mês inteiro', () => {
  const j = D.janela({ quando: { tipo: 'mes', mes: 2 } }, 2028);
  assert.equal(iso(j.fim), '2028-02-29');
});

test('a hora do dia não muda a resposta', () => {
  // A TV liga de madrugada e roda até a noite. Se a comparação levasse hora em
  // conta, a data entraria ou sairia no meio do expediente.
  const natal = { quando: { tipo: 'fixo', mes: 12, dia: 25 }, antes: 20, depois: 0 };
  assert.ok(D.janelaVigente(natal, new Date(2026, 11, 25, 0, 1)));
  assert.ok(D.janelaVigente(natal, new Date(2026, 11, 25, 23, 59)));
  assert.equal(D.janelaVigente(natal, new Date(2026, 11, 26, 0, 1)), null);
});

test('duração da janela serve de desempate', () => {
  const curta = D.janela({ quando: { tipo: 'fixo', mes: 9, dia: 7 }, antes: 6, depois: 0 }, 2026);
  const longa = D.janela({ quando: { tipo: 'mes', mes: 9 } }, 2026);
  assert.equal(D.duracao(curta), 7);
  assert.equal(D.duracao(longa), 30);
  assert.ok(D.duracao(curta) < D.duracao(longa), 'a específica precisa ganhar da campanha do mês');
});
