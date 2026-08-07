/*
 * A queixa que estes testes protegem: "apliquei o Dia dos Pais e a tela ficou
 * sem graça — uma mensagem só na principal, nada na lateral, sem decoração".
 * Um pacote de data precisa vestir a TELA, não uma zona.
 */
const test = require('node:test');
const assert = require('node:assert');
const seasons = require('../js/seasons.js');

const pais = seasons.getSeason('dia-pais');

test('a data de hoje é encontrada pela janela do catálogo', () => {
  assert.equal(seasons.todaySeason(new Date('2026-08-07T12:00:00')).id, 'dia-pais');
  assert.equal(seasons.todaySeason(new Date('2026-12-20T12:00:00')).id, 'natal');
  // Fora de qualquer janela devolve null em vez de chutar uma data.
  assert.equal(seasons.todaySeason(new Date('2026-08-20T12:00:00')), null);
});

test('toda data do catálogo tem decoração — nenhuma fica igual a um dia comum', () => {
  for (const s of seasons.SEASONS) {
    assert.notEqual(s.decoracao, 'none', s.id + ' ficaria sem nada animado');
    assert.ok(seasons.DECORATIONS.some((d) => d.id === s.decoracao), s.id + ': decoração inexistente');
  }
});

test('toda data tem frases de apoio para encher a programação', () => {
  for (const s of seasons.SEASONS) {
    const f = seasons.FRASES[s.id];
    assert.ok(f && f.length >= 2, s.id + ' tem menos de 2 frases');
  }
});

test('a programação enche todas as zonas do layout', () => {
  const p = seasons.programaDe(pais, { zonas: ['principal', 'lateral', 'rodape'] });
  assert.ok(p.principal.length >= 3, 'principal precisa de conteúdo para rodar horas');
  assert.ok(p.lateral.length >= 2);
  assert.ok(p.rodape.messages.length >= 1);
  assert.equal(p.decoracao, 'confetti');
});

test('não gera conteúdo para zona que o layout não tem', () => {
  // Layout de tela cheia: mandar itens de lateral criaria conteúdo invisível.
  const p = seasons.programaDe(pais, { zonas: ['principal', 'rodape'] });
  assert.deepEqual(p.lateral, []);
  assert.ok(p.principal.length >= 3);
});

test('as peças da programação têm durações diferentes', () => {
  // Tudo com a mesma duração troca junto e a tela parece piscar.
  const p = seasons.programaDe(pais, { zonas: ['principal'] });
  const duracoes = new Set(p.principal.map((i) => i.duracao));
  assert.ok(duracoes.size > 1, 'durações iguais fazem a tela trocar tudo de uma vez');
});

test('a programação roda por minutos, não segundos', () => {
  const p = seasons.programaDe(pais, { zonas: ['principal', 'lateral'] });
  const total = p.principal.reduce((s, i) => s + (i.duracao || 0), 0);
  assert.ok(total >= 40, 'ciclo de ' + total + 's repete rápido demais');
});

test('nenhum item da programação trava a zona com duração 0', () => {
  // Duração 0 = "fica fixo": um item assim impede a zona de rodar os outros.
  // O widget de clima tem 0 por padrão, então precisa de duração explícita.
  for (const s of seasons.SEASONS) {
    const p = seasons.programaDe(s, { zonas: ['principal', 'lateral'] });
    [...p.principal, ...p.lateral].forEach((i) => {
      assert.ok(i.duracao > 0, `${s.id}: "${i.type}" com duração ${i.duracao} travaria a zona`);
    });
  }
});
