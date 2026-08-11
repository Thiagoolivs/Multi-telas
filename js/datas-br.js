/*
 * datas-br.js — quando cada data comemorativa cai, de verdade.
 *
 * O catálogo de datas nasceu com faixas fixas em MMDD: Dia dos Pais de 01/08
 * a 11/08, por exemplo. Metade das datas brasileiras, porém, é MÓVEL, e o
 * resultado aparecia na parede do cliente:
 *
 *   Dia dos Pais é o 2º domingo de agosto. Em 2026 caiu no dia 9. A faixa fixa
 *   ligava a homenagem no dia 1º — oito dias antes — e ela continuava no ar no
 *   dia 11, dois dias depois da data. "Feliz Dia dos Pais" numa terça-feira
 *   depois do domingo é pior do que não ter posto nada.
 *
 * Aqui a data é CALCULADA para o ano em questão, e a janela é contada a partir
 * dela: tantos dias antes, tantos depois. É o que faz a programação ser
 * automática de verdade — quem cadastra a data uma vez não precisa voltar todo
 * ano para corrigir o calendário.
 */
(function (global) {
  'use strict';

  const DIA = 24 * 60 * 60 * 1000;

  /* Data local, sem hora — comparar datas com hora dentro dá erro de um dia
     dependendo do fuso e do horário em que a TV liga. */
  function dia(ano, mes, d) { return new Date(ano, mes - 1, d, 0, 0, 0, 0); }
  function zerar(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
  function somar(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 0, 0, 0, 0); }

  /*
   * Páscoa pelo cômputo gregoriano (algoritmo anônimo). Dela saem o Carnaval
   * e o Corpus Christi, que são as outras duas móveis do calendário brasileiro
   * que aparecem em tela.
   */
  function pascoa(ano) {
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const diaDoMes = ((h + l - 7 * m + 114) % 31) + 1;
    return dia(ano, mes, diaDoMes);
  }

  /*
   * N-ésimo dia da semana de um mês. `semana` negativa conta do fim: −1 é o
   * último. É assim que se acha "2º domingo de agosto" (Dia dos Pais) e
   "última sexta de novembro" (Black Friday).
   */
  function nthSemana(ano, mes, semana, diaSemana) {
    if (semana > 0) {
      const primeiro = dia(ano, mes, 1);
      const desloc = (diaSemana - primeiro.getDay() + 7) % 7;
      return somar(primeiro, desloc + (semana - 1) * 7);
    }
    const ultimo = dia(ano, mes + 1, 0);   // dia 0 do mês seguinte = último deste
    const volta = (ultimo.getDay() - diaSemana + 7) % 7;
    return somar(ultimo, -volta - (Math.abs(semana) - 1) * 7);
  }

  /*
   * Resolve o `quando` de uma data para um ano.
   *
   *   { tipo: 'fixo', mes, dia }
   *   { tipo: 'semana', mes, semana, diaSemana }   semana negativa = do fim
   *   { tipo: 'pascoa', desloc }                   dias a partir da Páscoa
   *   { tipo: 'mes', mes }                         o mês inteiro (campanhas)
   */
  function quandoCai(quando, ano) {
    if (!quando) return null;
    if (quando.tipo === 'fixo') return dia(ano, quando.mes, quando.dia);
    if (quando.tipo === 'semana') return nthSemana(ano, quando.mes, quando.semana, quando.diaSemana);
    if (quando.tipo === 'pascoa') return somar(pascoa(ano), quando.desloc || 0);
    if (quando.tipo === 'mes') return dia(ano, quando.mes, 1);
    return null;
  }

  /*
   * A janela em que a data fica no ar, para um ano.
   *
   * Campanha de mês inteiro (Outubro Rosa) ocupa o mês. As demais são
   * `antes` dias antes até `depois` dias depois — e o padrão de `depois` é
   * ZERO, porque felicitação atrasada é o defeito que trouxe este arquivo à
   * existência.
   */
  function janela(data, ano) {
    const quando = data.quando;
    if (!quando) return null;

    if (quando.tipo === 'mes') {
      return { inicio: dia(ano, quando.mes, 1), fim: dia(ano, quando.mes + 1, 0), alvo: dia(ano, quando.mes, 1) };
    }
    const alvo = quandoCai(quando, ano);
    if (!alvo) return null;
    const antes = data.antes != null ? data.antes : 6;
    const depois = data.depois != null ? data.depois : 0;
    return { inicio: somar(alvo, -antes), fim: somar(alvo, depois), alvo };
  }

  function dentro(hoje, j) {
    const h = zerar(hoje).getTime();
    return h >= j.inicio.getTime() && h <= j.fim.getTime();
  }

  /*
   * Acha a janela vigente de uma data, considerando o ano corrente e os
   * vizinhos — sem isso, uma janela que cruza o Ano Novo (26/12 a 06/01) some
   * justamente no dia 1º de janeiro, que é quando ela mais importa.
   */
  function janelaVigente(data, hoje) {
    const ano = zerar(hoje).getFullYear();
    for (const a of [ano - 1, ano, ano + 1]) {
      const j = janela(data, a);
      if (j && dentro(hoje, j)) return j;
    }
    return null;
  }

  // Quantos dias a janela dura — o desempate quando duas datas se sobrepõem.
  function duracao(j) { return Math.round((j.fim - j.inicio) / DIA) + 1; }

  const api = { pascoa, nthSemana, quandoCai, janela, janelaVigente, dentro, duracao, somar, zerar };
  global.MTDatasBR = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
