/*
 * A regra de conteúdo (js/regras-de-conteudo.js) e a letra mínima lida no
 * CSS (js/regras-composicao.js, letrasPequenas). QA de lançamento, 03/11:
 * "cura a gripe em 1 dia" passou na peça e na legenda, a ótica saiu com
 * preços que ninguém disse, o restaurante com "Sábado, 12/11" (quinta) e uma
 * nota de 12px foi salva "pronta".
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const RC = require('../js/regras-de-conteudo.js');
const R = require('../js/regras-composicao.js');
const P = require('../js/peca-html.js');
const Perfil = require('../js/perfil.js');

const regras = (a) => a.map((x) => x.regra);

test('Saúde: promessa de cura e de resultado é bloqueio', () => {
  for (const [frase, regra] of [
    ['Remédio X: cura a gripe em 1 dia', 'cura'], ['Vamos curar a sua dor', 'cura'], ['Elimina a gripe', 'elimina'],
    ['Resultado 100% natural', 'cem'], ['Resultado garantido', 'garantido'], ['Sem efeitos colaterais', 'colaterais'],
    ['Um milagre para a pele', 'milagre'], ['Acaba com a dor de cabeça', 'acaba'], ['Veja o antes e depois', 'antesdepois'],
  ]) {
    const r = RC.conferir(frase, { perfil: 'saude' });
    assert.ok(regras(r.bloqueios).includes(regra), frase + ' → ' + JSON.stringify(r));
    assert.ok(r.bloqueios[0].motivo && r.bloqueios[0].trecho, 'explica o quê e por quê');
  }
});

test('Saúde: o que é prevenção ou curativo não é barrado', () => {
  for (const frase of ['Faça seu curativo aqui', 'Elimine a água parada do vaso', 'Procura vacina? Temos', 'Segurança do paciente em primeiro lugar', 'Vacina da gripe chegou']) {
    assert.deepEqual(RC.conferir(frase, { perfil: 'saude' }).bloqueios, [], frase);
  }
});

test('todas as frentes: medicamento com promessa, antibiótico sem receita e cigarro eletrônico', () => {
  assert.deepEqual(regras(RC.conferir('Remédio X cura a gripe', { perfil: 'comercio' }).bloqueios), ['medicamento']);
  assert.deepEqual(regras(RC.conferir('Antibiótico sem receita aqui', { perfil: 'comercio' }).bloqueios), ['antibiotico']);
  assert.deepEqual(regras(RC.conferir('Vape descartável chegou', { perfil: 'empresa' }).bloqueios), ['vape']);
  // Sem promessa, remédio é só produto; e "cura" sem remédio fora da Saúde não é da regra (o queijo curado).
  assert.deepEqual(RC.conferir('Remédio para gripe em oferta', { perfil: 'comercio' }).bloqueios, []);
  assert.deepEqual(RC.conferir('Queijo curado da serra', { perfil: 'comercio' }).bloqueios, []);
});

test('dentista e médico: preço, parcelamento e "grátis" são AVISO, não bloqueio; farmácia não recebe', () => {
  const r = RC.conferir('Clareamento em até 6x sem juros. Avaliação grátis', { perfil: 'saude', contexto: 'Sorriso Odontologia' });
  assert.deepEqual(r.bloqueios, []);
  assert.ok(regras(r.avisos).includes('gratis') && regras(r.avisos).includes('parcelas'), JSON.stringify(r.avisos));
  assert.match(r.avisos.find((a) => a.regra === 'parcelas').motivo, /Código de Ética Odontológica/);
  assert.deepEqual(RC.conferir('Dipirona R$ 9,90, 20% off', { perfil: 'saude', contexto: 'Drogaria São Paulo' }).avisos, []);
  // Fora da Saúde, o "grátis" do comércio é só oferta.
  assert.deepEqual(RC.conferir('Frete grátis em 10x', { perfil: 'comercio' }).avisos, []);
});

test('a regra da frente Saúde diz à IA os termos barrados e a orientação do conselho', () => {
  const t = Perfil.de('saude').paraIA;
  for (const termo of ['cura', 'elimina', '100%', 'garantido', 'sem efeitos colaterais', 'milagre', 'antes e depois', 'grátis', 'sem juros', 'CFO']) assert.ok(t.includes(termo), termo);
});

test('o pedido de novo ao modelo leva o motivo e a sugestão; a explicação para a pessoa também', () => {
  const b = RC.conferir('Cura a gripe', { perfil: 'saude' }).bloqueios;
  assert.match(RC.paraCorrecao(b), /RECUSADA pela regra de conteúdo[\s\S]*"Cura": promete cura[\s\S]*Alívio para os sintomas/);
  assert.match(RC.explicar(b[0]), /^"Cura" promete cura.*Sugestão: "Alívio/);
  assert.equal(RC.paraCorrecao([]), '');
});

test('fatos: preço partido em campos, porcentagem, parcelas, data e hora', () => {
  const f = RC.fatosDe('Sábado, 12/11 · a partir das 11h · Feijoada R$ 39 ,90 · ou 10× de R$ 18,99 sem juros · 30% OFF');
  const de = (tipo) => f.filter((x) => x.tipo === tipo).map((x) => x.chave);
  assert.deepEqual(de('preco'), ['3990', '1899']);
  assert.deepEqual(de('vezes'), ['10']);
  assert.deepEqual(de('pct'), ['30']);
  assert.deepEqual(de('semjuros'), ['sem juros']);
  assert.deepEqual(de('data'), ['12/11']);
  assert.equal(f.find((x) => x.tipo === 'data').semana, 6);
  assert.deepEqual(de('hora'), ['11:00']);
  // "24h" é duração, não hora; telefone e endereço não são fato.
  assert.deepEqual(RC.fatosDe('Atendimento 24h · (11) 98888-0000 · Rua das Flores, 120'), []);
});

test('fatos: o que não estava no pedido vira aviso; o dia da semana errado também', () => {
  const ok = RC.permitidosDe(['prato do dia: feijoada, R$ 39,90, sábado'], { datas: ['2026-11-07'], horas: ['11:30', '13:59'] });
  const hoje = new Date(2026, 10, 3);
  const a = RC.conferirFatos('Sábado, 12/11 · a partir das 11h · Feijoada R$ 39,90', ok, { hoje });
  assert.deepEqual(a.map((x) => x.tipo), ['semana', 'data', 'hora']);
  assert.match(a[0].motivo, /12\/11 cai numa quinta-feira, não no sábado/);
  assert.match(a[1].motivo, /a data 12\/11 não estava no seu pedido/);
  assert.deepEqual(RC.conferirFatos('Sábado, 07/11 · Feijoada R$ 39,90', ok, { hoje }), [], 'o que foi dito passa calado');
  const otica = RC.conferirFatos('Aviador R$ 189,90 · 10x sem juros', RC.permitidosDe(['vitrine da semana, três armações com preço']), { hoje });
  assert.match(otica[0].motivo, /^o preço R\$ 189,90 não estava no seu pedido$/);
  assert.deepEqual(otica.map((x) => x.tipo), ['preco', 'vezes', 'semjuros']);
  // A régua se soma: o que a pessoa escreveu numa edição passa a valer.
  assert.deepEqual(RC.conferirFatos('R$ 189,90', RC.somar(ok, RC.permitidosDe(['põe R$ 189,90'])), { hoje }), []);
});

test('letra mínima no CSS: a nota de 0,62cqw é acusada; a biblioteca-ouro inteira passa', () => {
  assert.equal(Math.round(R.emPx('calc(6.6cqw * var(--mt-escala-titulo, 1))', 1405, 832)), 93);
  assert.equal(R.emPx('1.2em', 1405, 832), null, 'em depende da página montada: não acusa');
  const css = '.nota { font: 400 .62cqw/1.2 var(--mt-fonte-texto); } h1 { font-size: 6cqw; } @container (aspect-ratio < 0.8) { .nota { font-size: 5cqw; } }';
  const r = R.letrasPequenas(css, 'destaque');
  assert.deepEqual(r.map((x) => x.seletor + ' ' + x.formato), ['.nota deitada', '.nota quadrada'], 'em pé o @container corrige');
  assert.ok(r[0].px < 13);
  assert.deepEqual(R.letrasPequenas('.nota { font-size: .5cqw; display: none; }', 'destaque'), [], 'escondido não conta');
  // Com o HTML: a regra de um elemento que a peça não tem (o molde sem nota) e o enfeite aria-hidden não contam.
  const html = '<section class="mt-peca"><h1 data-campo="titulo">Oi</h1><span class="talher" aria-hidden="true"></span></section>';
  assert.deepEqual(R.letrasPequenas('.nota { font-size: .5cqw; } .talher { font-size: .5cqw; } h1 { font-size: .5cqw; }', 'destaque', html).map((x) => x.seletor), ['h1', 'h1', 'h1']);
  const raiz = path.join(__dirname, '..', 'pecas-ouro');
  const m = JSON.parse(fs.readFileSync(path.join(raiz, 'manifesto.json'), 'utf8'));
  for (const p of m.pecas) {
    const h = P.higienizar(P.doArquivo(fs.readFileSync(path.join(raiz, p.id + '.html'), 'utf8')));
    for (const papel of p.papeis) assert.deepEqual(R.letrasPequenas(h.css, papel, h.html), [], p.id + ' (' + papel + ')');
  }
});
