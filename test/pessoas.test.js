/*
 * Cadastro de pessoas (EXECUTOR D30).
 *
 * "Planilha do RH (Excel ou CSV), setor, nascimento e foto ligada a cada
 * pessoa; importar não apaga quem chegou pelo QR." Antes: só CSV, setor
 * misturado no cargo, e cada importação apagava a lista inteira.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const P = require('../js/pessoas.js');

test('uma linha vira pessoa: sem o ano, setor separado do cargo, foto e e-mail conferidos', () => {
  assert.deepEqual(P.normalizar({ nome: '  Ana   Souza ', nascimento: '15/03/1990', setor: 'RH', cargo: 'Analista', email: 'ANA@Empresa.com', foto: 'javascript:alert(1)' }),
    { nome: 'Ana Souza', matricula: '', setor: 'RH', cargo: 'Analista', email: 'ana@empresa.com', foto: '', dia: 15, mes: 3 });
  assert.equal(P.normalizar({ nome: 'X', nascimento: '1/1', foto: '/media/t1/abc.jpg' }).foto, '/media/t1/abc.jpg');
  assert.equal(P.normalizar({ nome: 'X', nascimento: '1/1', foto: 'https://cdn.exemplo.com/a.jpg' }).foto, 'https://cdn.exemplo.com/a.jpg');
  assert.equal(P.normalizar({ nome: 'X', nascimento: '1/1', email: 'sem arroba' }).email, '');
  assert.equal(P.normalizar({ nome: '', nascimento: '1/1' }), null);
  assert.equal(P.normalizar({ nome: 'X', nascimento: '31/02' }), null, '31 de fevereiro passou');
  // A data como o Excel guarda (32947 = 15/03/1990), ISO e dia/mês em colunas.
  assert.deepEqual(P.diaEMes({ nascimento: 32947 }), { dia: 15, mes: 3 });
  assert.deepEqual(P.diaEMes({ nascimento: '1990-03-15' }), { dia: 15, mes: 3 });
  assert.deepEqual(P.diaEMes({ dia: '29', mes: '2' }), { dia: 29, mes: 2 });
  assert.deepEqual(P.colunas(['Nome completo', 'Matrícula', 'Data de nascimento', 'Setor', 'Cargo', 'E-mail', 'Foto']),
    { nome: 0, matricula: 1, nascimento: 2, setor: 3, cargo: 4, email: 5, foto: 6 });
});

test('importar de novo sincroniza só a planilha: quem veio do QR ou à mão fica, a foto de quem continua não some', () => {
  const atuais = [
    { id: 'a', nome: 'Ana', matricula: '0101', dia: 15, mes: 3, foto: '/media/t/a.jpg', origem: 'planilha' },
    { id: 'b', nome: 'Bia', dia: 1, mes: 1, origem: 'qr', foto: '/media/t/b.jpg' },
    { id: 'c', nome: 'Caio', matricula: '7', dia: 2, mes: 2, origem: null },
    { id: 'd', nome: 'Duda', dia: 3, mes: 3, origem: 'manual' },
  ];
  const plano = P.planoDeImportacao(atuais, [
    { nome: 'Ana Souza', matricula: '101', nascimento: '15/03', setor: 'RH' },
    { nome: 'Edu', nascimento: '10/10' },
    { nome: 'Edu', nascimento: '10/10' },
    { nome: '', nascimento: '1/1' },
  ]);
  assert.deepEqual(plano.atualizam.map((u) => [u.id, u.pessoa.nome, u.pessoa.foto, u.pessoa.setor]), [['a', 'Ana Souza', '/media/t/a.jpg', 'RH']], 'matrícula 0101 = 101; a foto ficou');
  assert.deepEqual(plano.entram.map((p) => [p.nome, p.origem]), [['Edu', 'planilha']]);
  assert.deepEqual(plano.saem, ['c'], 'quem veio de planilha antiga (sem origem) e saiu dela sai');
  assert.equal(plano.ficam, 2, 'o QR e o de à mão ficaram');
  assert.equal(plano.ignoradas, 2, 'a repetida e a sem nome');
});

/* ---------------- a planilha no navegador ---------------- */

// Um .xlsx de verdade (ZIP com deflate), montado aqui: primeira aba com nome que não é sheet1.
function zip(arquivos) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const [nome, texto] of Object.entries(arquivos)) {
    const dados = zlib.deflateRawSync(Buffer.from(texto, 'utf8'));
    const n = Buffer.from(nome, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(Buffer.byteLength(texto), 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(dados.length, 20); central.writeUInt32LE(Buffer.byteLength(texto), 24); central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locais.push(local, n, dados);
    centrais.push(central, n);
    offset += local.length + n.length + dados.length;
  }
  const cd = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(arquivos).length, 8); fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locais, cd, fim]));
}
const XLSX = {
  'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="Equipe" sheetId="1" r:id="rId3"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="styles.xml"/><Relationship Id="rId3" Type="worksheet" Target="worksheets/equipe.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Nome</t></si><si><t>Nascimento</t></si><si><t>Setor</t></si><si><r><t>Ana </t></r><r><t xml:space="preserve">Souza</t></r></si><si><t>Produ&#231;&#227;o</t></si></sst>',
  'xl/worksheets/equipe.xml': '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" s="1"><v>32947</v></c><c r="C2" t="s"><v>4</v></c></row>'
    + '<row r="3"><c r="A3" t="inlineStr"><is><t>Jo&amp;o</t></is></c><c r="C3" t="str"><v>RH</v></c></row>'
    + '<row r="4"><c r="A4" t="inlineStr"><is><t>Lia</t></is></c><c r="B4" t="str"><v>02/12</v></c></row>'
    + '</sheetData></worksheet>',
};

test('a planilha: Excel (.xlsx) sem biblioteca, CSV com ponto e vírgula e acento do Excel brasileiro', async () => {
  const L = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/planilha.js')).href);
  const linhas = await L.lerXlsx(zip(XLSX));
  assert.deepEqual(linhas, [['Nome', 'Nascimento', 'Setor'], ['Ana Souza', 32947, 'Produção'], ['Jo&o', '', 'RH'], ['Lia', '02/12']]);
  const pessoas = P.linhasDaPlanilha(linhas).map(P.normalizar).filter(Boolean);
  assert.deepEqual(pessoas.map((p) => [p.nome, p.dia + '/' + p.mes, p.setor]), [['Ana Souza', '15/3', 'Produção'], ['Lia', '2/12', '']], 'João sem data fica de fora');

  const bom = String.fromCharCode(0xfeff);
  assert.deepEqual(L.lerCsv(bom + 'nome;nascimento;setor\r\n"Souza; Ana";15/03;"Sala ""A"""\r\n\r\n'), [['nome', 'nascimento', 'setor'], ['Souza; Ana', '15/03', 'Sala "A"']]);
  // CSV salvo pelo Excel em Windows-1252: "Conceição" com ç e ã de um byte.
  const w1252 = new Uint8Array([...Buffer.from('nome,nascimento\nConcei'), 0xe7, 0xe3, ...Buffer.from('o,01/02\n')]);
  assert.deepEqual(await L.lerPlanilha({ arrayBuffer: async () => w1252.buffer }), [['nome', 'nascimento'], ['Conceição', '01/02']]);
  await assert.rejects(L.lerPlanilha({ arrayBuffer: async () => new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]).buffer }), /salve como \.xlsx ou CSV/);
});

test('o painel: Pessoas no menu, a prévia pela mesma regra do servidor, foto por pessoa', () => {
  const pg = ler('web/src/pages/BirthdaysPage.jsx');
  assert.match(pg, /P\.planoDeImportacao\(lista, comFotos\)/, 'a prévia não é a regra do servidor');
  assert.match(pg, /accept="\.xlsx,\.csv/);
  assert.match(pg, /await birthdays\.atualizar\(p\.id, \{ foto: up\.url \}\);/);
  assert.match(pg, /await birthdays\.remover\(p\.id\);/);
  assert.match(ler('web/src/lib/menu.js'), /birthdays: 'Pessoas',/);
  const srv = ler('server.js');
  assert.match(srv, /const plano = pessoas\.planoDeImportacao\(await db\.listBirthdays\(t\), raw\.slice\(0, pessoas\.LIMITE \* 2\)\);/);
  assert.doesNotMatch(srv, /db\.replaceBirthdays\(/, 'a importação voltou a apagar tudo');
  const pg2 = ler('server/db-postgres.js');
  for (const c of ['setor TEXT', 'email TEXT', 'origem TEXT', 'updated_at BIGINT']) assert.match(pg2, new RegExp('ALTER TABLE birthdays ADD COLUMN IF NOT EXISTS ' + c));
  const sq = ler('server/db-sqlite.js');
  for (const c of ['setor TEXT', 'email TEXT', 'origem TEXT', 'updated_at INTEGER']) assert.match(sq, new RegExp("garantirColuna\\('birthdays', '" + c + "'\\)"));
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6900 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}

test('a rota: importar mescla, uma pessoa à mão fica, editar, tirar uma só, exportar com setor; a TV mostra o setor sem cargo', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-d30-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');
  assert.equal((await pedir('/api/birthdays')).status, 401);
  const c = (await pedir('/api/auth/signup', { method: 'POST', json: { email: 'd30' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Metalúrgica', aceite: true } }))
    .cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');
  const hoje = new Date();
  const amanha = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1);
  const ddmm = String(amanha.getDate()).padStart(2, '0') + '/' + String(amanha.getMonth() + 1).padStart(2, '0');

  const a = await pedir('/api/birthdays/import', { method: 'POST', cookie: c, json: { rows: [
    { nome: 'Ana', matricula: '1', nascimento: ddmm, setor: 'Produção' },
    { nome: 'Caio', matricula: '2', nascimento: '02/02' },
    { nome: 'Sem data' },
  ] } });
  assert.equal(a.status, 200);
  assert.deepEqual([a.json.entram, a.json.atualizam, a.json.saem, a.json.ignoradas, a.json.imported], [2, 0, 0, 1, 2]);
  const manual = await pedir('/api/birthdays', { method: 'POST', cookie: c, json: { pessoa: { nome: 'Duda', nascimento: '03/03', email: 'duda@x.com' } } });
  assert.equal(manual.status, 200);
  assert.equal((await pedir('/api/birthdays', { method: 'POST', cookie: c, json: { pessoa: { nome: 'Sem aniversário' } } })).status, 400);

  // A planilha nova: Ana continua (com setor novo), Caio saiu, Edu é novo; Duda (à mão) fica.
  const b = await pedir('/api/birthdays/import', { method: 'POST', cookie: c, json: { rows: [
    { nome: 'Ana Lima', matricula: '01', nascimento: ddmm, setor: 'Qualidade' },
    { nome: 'Edu', nascimento: '10/10' },
  ] } });
  assert.deepEqual([b.json.entram, b.json.atualizam, b.json.saem, b.json.ficam], [1, 1, 1, 1]);
  let lista = (await pedir('/api/birthdays', { cookie: c })).json.birthdays;
  assert.deepEqual(lista.map((p) => [p.nome, p.origem]).sort(), [['Ana Lima', 'planilha'], ['Duda', 'manual'], ['Edu', 'planilha']]);
  const ana = lista.find((p) => p.nome === 'Ana Lima');
  assert.equal(ana.setor, 'Qualidade');

  // Editar: a foto que não é da conta nem https não passa; trocar só a foto mantém o resto.
  assert.equal((await pedir('/api/birthdays/' + ana.id, { method: 'PUT', cookie: c, json: { pessoa: { foto: 'javascript:alert(1)', cargo: 'Inspetora' } } })).status, 200);
  lista = (await pedir('/api/birthdays', { cookie: c })).json.birthdays;
  assert.deepEqual([lista.find((p) => p.id === ana.id).foto, lista.find((p) => p.id === ana.id).cargo, lista.find((p) => p.id === ana.id).setor], ['', 'Inspetora', 'Qualidade']);
  assert.equal((await pedir('/api/birthdays/naoexiste', { method: 'PUT', cookie: c, json: { pessoa: { nome: 'X' } } })).status, 404);

  // A TV (dono vendo pela rota da TV): amanhã entra, com o setor quando não há cargo.
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);
  await pedir('/api/birthdays/' + ana.id, { method: 'PUT', cookie: c, json: { pessoa: { cargo: '' } } });
  const naTv = (await pedir('/api/devices/' + tv.id + '/birthdays', { cookie: c })).json.birthdays;
  assert.deepEqual(naTv, [{ nome: 'Ana Lima', dia: amanha.getDate(), mes: amanha.getMonth() + 1, cargo: 'Qualidade', foto: '' }], 'a TV recebeu e-mail/matrícula ou não recebeu o setor');

  // LGPD: a exportação leva setor, e-mail e origem.
  const exp = (await pedir('/api/privacidade/exportar', { cookie: c })).json;
  const duda = exp.dados.aniversariantes.find((p) => p.nome === 'Duda');
  assert.deepEqual([duda.email, duda.origem], ['duda@x.com', 'manual']);

  // Tirar uma pessoa só.
  assert.equal((await pedir('/api/birthdays/' + ana.id, { method: 'DELETE', cookie: c })).status, 200);
  assert.equal((await pedir('/api/birthdays/' + ana.id, { method: 'DELETE', cookie: c })).status, 404);
  assert.equal((await pedir('/api/birthdays', { cookie: c })).json.count, 2);
});
