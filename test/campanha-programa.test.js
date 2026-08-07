/*
 * A campanha como PROGRAMA, não como playlist plana.
 *
 * O pedido era "que ela rode por horas ou até dias com eu fazendo ajustes
 * mínimos". O plano já dizia a que horas cada peça fazia sentido — e ninguém
 * lia. Estes testes protegem a ponte: faixa no plano → agendamento que o player
 * já sabe respeitar.
 */
const test = require('node:test');
const assert = require('node:assert');
const director = require('../server/ai-director');

test('as faixas cobrem o dia inteiro, sem buraco e sem sobreposição', () => {
  const ordem = ['manha', 'almoco', 'tarde', 'saida'];
  let anterior = '05:59';
  for (const f of ordem) {
    const faixa = director.FAIXAS[f];
    assert.ok(faixa.horaInicio > anterior, f + ' começa antes do fim da anterior');
    assert.ok(faixa.horaFim > faixa.horaInicio, f + ' termina antes de começar');
    anterior = faixa.horaFim;
  }
  assert.equal(director.FAIXAS.saida.horaFim, '23:59');
  assert.equal(director.FAIXAS.dia.horaInicio, '', 'o dia todo não tem janela');
});

test('plano sem faixa nenhuma ainda vira programa', () => {
  // Se a IA esquecer de classificar, a campanha não pode virar a mesma tela
  // das 8h às 18h. O espalhamento é a rede de segurança.
  const plano = director.normalizarPlano({
    campanha: 'Teste',
    pecas: [
      { formato: '16/9', headline: 'A' }, { formato: '16/9', headline: 'B' },
      { formato: '16/9', headline: 'C' }, { formato: '16/9', headline: 'D' },
      { formato: '16/9', headline: 'E' },
    ],
  }, { empresa: 'Acme' });

  const faixas = plano.pecas.map((p) => p.faixa);
  assert.ok(faixas.every(Boolean), 'peça ficou sem faixa: ' + JSON.stringify(faixas));
  assert.ok(new Set(faixas).size >= 3, 'campanha inteira na mesma faixa: ' + faixas.join(','));
  assert.equal(faixas[0], 'dia', 'a primeira é a mensagem-âncora, vale a qualquer hora');
});

test('faixa escolhida pela IA é respeitada', () => {
  const plano = director.normalizarPlano({
    campanha: 'Teste',
    pecas: [
      { formato: '16/9', headline: 'Bom dia', faixa: 'manha' },
      { formato: '16/9', headline: 'Almoço', faixa: 'almoco' },
    ],
  }, { empresa: 'Acme' });
  assert.equal(plano.pecas[0].faixa, 'manha');
  assert.equal(plano.pecas[1].faixa, 'almoco');
});

test('faixa inventada pela IA não passa', () => {
  const plano = director.normalizarPlano({
    campanha: 'T',
    pecas: [{ formato: '16/9', headline: 'X', faixa: 'madrugada' }],
  }, { empresa: 'Acme' });
  assert.ok(director.FAIXAS_OK.includes(plano.pecas[0].faixa), 'passou "' + plano.pecas[0].faixa + '"');
});

test('cada formato recebe o dia inteiro, não só o principal', () => {
  // A queixa era "adicionou uma tela só na principal". Se a lateral recebe
  // peças, elas também precisam variar ao longo do dia.
  const plano = director.normalizarPlano({
    campanha: 'T',
    pecas: [
      { formato: '16/9', headline: 'A1' }, { formato: '16/9', headline: 'A2' }, { formato: '16/9', headline: 'A3' },
      { formato: '9/16', headline: 'B1' }, { formato: '9/16', headline: 'B2' }, { formato: '9/16', headline: 'B3' },
    ],
  }, { empresa: 'Acme' });

  for (const fmt of ['16/9', '9/16']) {
    const doFormato = plano.pecas.filter((p) => p.formato === fmt).map((p) => p.faixa);
    assert.ok(new Set(doFormato).size >= 2, fmt + ' ficou numa faixa só: ' + doFormato.join(','));
  }
});
