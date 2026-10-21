/*
 * Expediente na TV (docs/EXECUTOR.md, item 8).
 *
 * Fora do horário da loja, a TV fica preta ou mostra só o relógio — à
 * escolha do dono —, e o vigia não avisa queda. Uma regra só (js/expediente.js)
 * para os dois lados. Os testes mudam o RELÓGIO: cada caso é um instante em
 * UTC, e a loja está em São Paulo (UTC−3).
 *
 * Conferido também no player de verdade, com o relógio do navegador trocado:
 * 23h tela preta, 23h com relógio, 10h programação de volta.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../js/expediente.js');
const V = require('../server/vigia.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
// Quarta-feira, 21/10/2026, no horário de São Paulo.
const sp = (hhmm, dia = 21) => Date.parse('2026-10-' + String(dia).padStart(2, '0') + 'T' + hhmm + ':00-03:00');
const LOJA = { dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '22:00' };

test('dentro do horário a TV mostra a programação; fora, o que o dono escolheu', () => {
  for (const fora of ['preta', 'relogio']) {
    const exp = { ...LOJA, foraDoHorario: fora };
    assert.equal(E.estadoDaTela(sp('10:00'), exp), 'normal');
    assert.equal(E.estadoDaTela(sp('06:59'), exp), fora);
    assert.equal(E.estadoDaTela(sp('07:00'), exp), 'normal', 'abre às 7h em ponto');
    assert.equal(E.estadoDaTela(sp('21:59'), exp), 'normal');
    assert.equal(E.estadoDaTela(sp('22:00'), exp), fora, 'fecha às 22h em ponto');
    assert.equal(E.estadoDaTela(sp('12:00', 25), exp), fora, 'domingo não está nos dias');
  }
});

test('o padrão é continuar mostrando: nenhuma TV apaga sem o dono ter escolhido', () => {
  assert.equal(E.estadoDaTela(sp('03:00'), LOJA), 'normal', 'expediente antigo, sem a escolha');
  assert.equal(E.estadoDaTela(sp('03:00'), null), 'normal', 'tela sem horário nenhum');
  assert.equal(E.estadoDaTela(sp('03:00'), { ...LOJA, foraDoHorario: 'qualquer-coisa' }), 'normal', 'lixo vira o padrão');
  assert.equal(E.normalizar({}).foraDoHorario, 'ligada');
});

test('o fuso é o da loja, não o do box (que costuma vir em UTC)', () => {
  // 23:30 UTC = 20:30 em São Paulo: a loja está aberta, mesmo que o relógio
  // do box (em UTC) diga que já passou das 22h.
  const t = Date.parse('2026-10-21T23:30:00Z');
  assert.equal(E.estadoDaTela(t, { ...LOJA, foraDoHorario: 'preta' }), 'normal');
  assert.equal(E.estadoDaTela(t, { ...LOJA, foraDoHorario: 'preta', fuso: 'UTC' }), 'preta', 'com o fuso errado, apagaria às 19h');
});

test('expediente que atravessa a meia-noite (bar das 18h às 2h)', () => {
  const bar = { dias: [2, 3, 4, 5, 6], inicio: '18:00', fim: '02:00', foraDoHorario: 'relogio' };
  assert.equal(E.estadoDaTela(sp('23:00'), bar), 'normal');
  assert.equal(E.estadoDaTela(sp('01:30', 22), bar), 'normal', 'a madrugada de quinta é da quarta');
  assert.equal(E.estadoDaTela(sp('02:30', 22), bar), 'relogio');
  assert.equal(E.estadoDaTela(sp('15:00'), bar), 'relogio');
});

test('o vigia usa a MESMA regra: fora do horário, a TV apagada não vira aviso', () => {
  assert.match(ler('server/vigia.js'), /const E = require\('\.\.\/js\/expediente\.js'\);/);
  assert.strictEqual(V.normalizarExpediente, E.normalizar);
  const exp = E.normalizar({ ...LOJA, foraDoHorario: 'preta' });
  for (const h of ['06:00', '07:00', '12:00', '21:59', '22:00', '23:30']) {
    assert.equal(V.dentroDoExpediente(sp(h), exp), E.dentro(sp(h), exp), h);
  }
});

test('o servidor leva o horário para a config da TV, e avisa a TV na hora', () => {
  const t = ler('server/routes/telas.js');
  assert.match(t, /if \(device\.expediente\) cfg\.settings\.expediente = vigia\.normalizarExpediente\(device\.expediente\);\s+else delete cfg\.settings\.expediente;/);
  const post = t.slice(t.indexOf("sub === 'expediente'"));
  assert.match(post, /cfg\.settings\.expediente = exp;\s+await db\.setDeviceConfig\(/);
  assert.match(post, /broadcast\(id, 'config', \{ updatedAt: Date\.now\(\) \}\);/);
});

test('a TV: camada por cima, sem remontar as zonas, som e vídeo parados, música volta ao abrir', () => {
  const p = ler('js/player.js');
  assert.match(p, /expediente: 1, +\/\/ aplicarExpediente/);
  assert.match(p, /aplicarMargem\(cfg\);\s+aplicarExpediente\(cfg\);/);
  assert.match(p, /const estado = E \? E\.estadoDaTela\(Date\.now\(\), expediente\) : 'normal';/);
  assert.match(p, /if \(trilha\.estado\(\)\.tocando\) \{ musicaPausadaPeloHorario = true; trilha\.comando\(\{ acao: 'pausar' \}\); \}/);
  assert.match(p, /if \(musicaPausadaPeloHorario\) \{ musicaPausadaPeloHorario = false;/);
  assert.match(p, /toLocaleTimeString\('pt-BR', \{ timeZone: fuso/);
  const css = ler('css/player.css');
  assert.match(css, /\.mt-fora \{ position: fixed; inset: 0; z-index: 90; background: #000;/);
  assert.match(css, /\.mt-fora-do-horario \.mt-stage \{ visibility: hidden; \}/);
  // O módulo carrega antes do player, e vai para o cache da TV (offline).
  const html = ler('player.html');
  assert.ok(html.indexOf('js/expediente.js') > 0 && html.indexOf('js/expediente.js') < html.indexOf('js/player.js'));
  assert.match(ler('sw.js'), /'\/js\/expediente\.js',/);
});

test('no painel: o horário fica sempre editável, e a escolha do que a TV mostra é explícita', () => {
  // Desde o item 33 o formulário mora em HorarioDaTela.jsx, usado pela lista de Telas e pelos Ajustes.
  const s = ler('web/src/components/tela/HorarioDaTela.jsx');
  assert.ok(ler('web/src/pages/ScreensPage.jsx').includes('<CamposDoHorario exp={exp} setExp={setExp} />'));
  assert.ok(ler('web/src/components/content/SettingsForm.jsx').includes('<CamposDoHorario exp={exp} setExp={setExp} />'));
  assert.match(s, /\['ligada', 'Continua mostrando a programação'\], \['relogio', 'Mostra só o relógio'\], \['preta', 'Fica preta/);
  assert.doesNotMatch(s, /<fieldset disabled=\{!exp\.alerta\}/, 'desligar o alerta não pode travar o horário');
});
