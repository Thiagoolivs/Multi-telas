/*
 * O Conector MultiTelas DE VERDADE (conector/src) contra o servidor DE
 * VERDADE (server.js), de ponta a ponta — o que o primeiro cliente vai ter
 * em dezembro: a pasta de rede do RH, a planilha do refeitório, a dos
 * indicadores e o RSS da intranet, indo para duas TVs.
 *
 * Pastas temporárias no lugar do compartilhamento, um servidor HTTP local no
 * lugar da intranet, e um ciclo do Conector por vez (o "uma-vez" do .exe).
 * O que só o Windows prova (a tarefa agendada, a conta de serviço lendo
 * \\servidor\pasta, o PowerPoint convertendo) fica fora: ver
 * docs/implantacao/CONECTOR.md, "a validar no Windows". Portas 6162–6163.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const { principal } = require('../conector/src/main.js');
const X = require('../conector/src/xlsx.js');
const P = require('../server/planilha');
const K = require('../server/kpis');

const PORTA = 6162;
const PORTA_INTRANET = 6163;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const JPG = (n) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), crypto.randomBytes(n || 1500)]);
const PNG = (n) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(n || 1500)]);

// Um .xlsx mínimo (o mesmo formato do test/conector.test.js): ZIP com os XMLs da primeira aba.
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
  return Buffer.concat([...locais, cd, fim]);
}
// O cardápio do refeitório: o preço com três casas (o combustível do posto da fábrica) e o percentual.
const CARDAPIO_XLSX = zip({
  'xl/workbook.xml': '<workbook><sheets><sheet name="Cardápio" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Item</t></si><si><t>Preço</t></si><si><t>Prato do dia</t></si><si><t>Suco, laranja</t></si><si><t>Gasolina (litro)</t></si></sst>',
  'xl/styles.xml': '<styleSheet><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>24.9</v></c></row>'
    + '<row r="3"><c r="A3" t="s"><v>3</v></c><c r="B3"><v>8</v></c></row>'
    + '<row r="4"><c r="A4" t="s"><v>4</v></c><c r="B4"><v>5.899</v></c></row>'
    + '</sheetData></worksheet>',
});

test('a planilha como o Conector manda: o CSV do .xlsx (vírgula, aspas, CRLF) e o .csv do Excel brasileiro (;) dão o mesmo número', () => {
  const linhas = X.lerXlsx(CARDAPIO_XLSX);
  const csv = X.paraCsv(linhas);
  assert.equal(csv, 'Item,Preço\r\nPrato do dia,"24,9"\r\n"Suco, laranja",8\r\nGasolina (litro),"5,899"\r\n');
  const doXlsx = P.lerPrecos(P.lerCsv(csv)).itens.map((i) => [i.item, i.preco]);
  const doCsv = P.lerPrecos(P.lerCsv('Item;Preço\r\nPrato do dia;24,90\r\nSuco, laranja;8,00\r\nGasolina (litro);5,899\r\n')).itens.map((i) => [i.item, i.preco]);
  assert.deepEqual(doXlsx, [['Prato do dia', 24.9], ['Suco, laranja', 8], ['Gasolina (litro)', 5.9]], 'o .xlsx (a tabela de preços arredonda em centavos; com o ponto, seriam R$ 5.899)');
  assert.deepEqual(doCsv, doXlsx, 'o .csv com ponto e vírgula');
  // O que dava errado com o ponto decimal: "5.899" no servidor é milhar brasileiro.
  assert.equal(K.lerNumero('5.899').valor, 5899);
  // O percentual do Excel (0,875 com formato %) sai como ele mostra.
  assert.equal(X.numeroDoExcel('0.875', true), '87,5%');
  assert.equal(K.lerNumero('87,5%').valor, 87.5);
  // Data como o Excel mostra (dd/mm/aaaa) é texto para o servidor: não vira número.
  assert.equal(K.lerNumero('22/11/2026').valor, null);
});

/* ---------------- o servidor, a intranet e o Conector ---------------- */

function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.json !== undefined ? Buffer.from(JSON.stringify(o.json)) : null;
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, corpo ? { 'Content-Type': 'application/json', 'Content-Length': corpo.length } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.token ? { Authorization: 'Bearer ' + o.token } : {}, o.headers || {}) }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(partes).toString('utf8');
        let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, txt, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
const esperar = async (fn, ms = 8000) => {
  const ate = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v || Date.now() > ate) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
};

const rss = (itens) => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Intranet</title>' + itens.join('') + '</channel></rss>';
const item = (guid, titulo, imagem) => '<item><title>' + titulo + '</title><link>http://127.0.0.1:' + PORTA_INTRANET + '/noticias/' + guid + '</link><guid>' + guid + '</guid>'
  + '<pubDate>' + new Date(Date.now() - 60 * 60 * 1000).toUTCString() + '</pubDate><description>' + titulo + ', na intranet.</description>'
  + (imagem ? '<enclosure url="http://127.0.0.1:' + PORTA_INTRANET + '/img/' + imagem + '" type="image/png" length="1"/>' : '') + '</item>';

test('o Conector de verdade contra o servidor de verdade: pasta, planilhas e feed nas TVs; o que sai, sai; pasta fora do ar não apaga; token revogado para', { timeout: 240000 }, async (t) => {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-ponta-'));
  const dados = path.join(raiz, 'servidor');
  const share = path.join(raiz, 'share');
  const base = path.join(raiz, 'conector');
  for (const d of [dados, share, base, path.join(share, 'Sub')]) fs.mkdirSync(d, { recursive: true });

  // A intranet: o RSS e a imagem de um item.
  const fotoDaNoticia = PNG(2000);
  const intranet = { itens: [item('n1', 'Festa de fim de ano', 'festa.png'), item('n2', 'Vacinação na enfermaria'), item('n3', 'Ginástica laboral')] };
  const servIntranet = http.createServer((req, res) => {
    if (req.url === '/rss.xml') { res.writeHead(200, { 'content-type': 'application/rss+xml; charset=utf-8' }); return res.end(rss(intranet.itens)); }
    if (req.url === '/img/festa.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(fotoDaNoticia); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => servIntranet.listen(PORTA_INTRANET, '127.0.0.1', r));

  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: process.env.TEST_DATABASE_URL || '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev',
      MT_INTEGRACAO_ESPERA_MS: '150', MT_CONECTOR_REPO: 'desligado', MT_APK_REPO: 'desligado' },
  });
  t.after(() => { servidor.kill(); servIntranet.close(); try { fs.rmSync(raiz, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  /* ----- 1 e 2: a conta, as duas TVs, a integração e o que o painel define ----- */
  const c = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'ponta' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Metalúrgica Andrade', aceite: true } }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: c, json: { plan: 'pro' } })).status, 200);
  const novaTv = async () => {
    const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
    assert.ok((await pedir('/api/pair', { method: 'POST', cookie: c, json: { code: tv.code } })).status < 300);
    return tv;
  };
  const refeitorio = await novaTv();
  const portaria = await novaTv();
  assert.ok((await pedir('/api/devices/' + portaria.id + '/grupo', { method: 'POST', cookie: c, json: { grupo: 'Recepção' } })).status < 300);
  const criada = (await pedir('/api/integracoes', { method: 'POST', cookie: c, json: { nome: 'Conector do RH' } })).json;
  const token = criada.token;
  const integ = criada.integracao;
  const fonte = async (json) => {
    const r = await pedir('/api/integracoes/' + integ.id + '/fontes', { method: 'POST', cookie: c, json });
    assert.equal(r.status, 200, r.txt);
    return r.json.fonte;
  };
  await fonte({ tipo: 'pasta', nome: 'Avisos do RH', chave: 'avisos', segundos: 8, alvo: { telas: [refeitorio.id], grupos: ['Recepção'] } });
  const cardapio = await fonte({ tipo: 'planilha', nome: 'Cardápio', chave: 'cardapio' });
  const producao = await fonte({ tipo: 'planilha', nome: 'Produção', chave: 'producao', uso: 'indicadores' });
  const feed = await fonte({ tipo: 'feed', nome: 'Notícias', chave: 'noticias', url: 'http://127.0.0.1:' + PORTA_INTRANET + '/rss.xml', formato: 'rss' });
  assert.equal((await pedir('/api/integracoes/' + integ.id, { method: 'PUT', cookie: c, json: { comunicados: { alvo: { todas: true } } } })).status, 200);

  /* ----- 3: o compartilhamento, as planilhas e o conector.json ----- */
  const escrever = (rel, bytes) => { const p = path.join(share, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, bytes); return p; };
  escrever('a.jpg', JPG());
  escrever('b.png', PNG());
  escrever('Sub/c.jpg', JPG());
  escrever('Thumbs.db', Buffer.from('lixo do Windows'));
  escrever('rascunho.xlsx', CARDAPIO_XLSX); // planilha numa pasta: fica fora (é "planilha" no painel)
  const xlsx = path.join(raiz, 'Cardapio.xlsx');
  fs.writeFileSync(xlsx, CARDAPIO_XLSX);
  const csv = path.join(raiz, 'metas.csv');
  // O CSV do Excel brasileiro: ponto e vírgula, vírgula decimal, Windows-1252.
  fs.writeFileSync(csv, Buffer.from('Indicador;Valor;Meta\r\nEficiência;87,5%;90%\r\nPeças por hora;1.250;1.400\r\n', 'latin1'));
  const antigo = new Date(Date.now() - 60 * 1000);
  for (const p of [xlsx, csv]) fs.utimesSync(p, antigo, antigo);
  const config = {
    servidor: 'http://127.0.0.1:' + PORTA, token,
    pastas: { avisos: share }, planilhas: { cardapio: xlsx, producao: csv },
    intranet: { hostsPermitidos: ['127.0.0.1'] },
    segundosParaEstabilizar: 0, ciclosParaApagar: 2, vigiarPastas: false,
  };
  fs.writeFileSync(path.join(base, 'conector.json'), JSON.stringify(config, null, 2));
  const saida = [];
  const umCiclo = () => principal(['uma-vez'], { base, env: {}, escrever: (x) => saida.push(x), naTela: false });

  // O que as TVs mostram (pelo token de cada uma).
  const naTv = async (tv) => {
    const r = await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } });
    const lido = r.status === 204 ? null : r.json;
    return Object.values((lido && lido.zonas) || {}).flatMap((z) => (z && Array.isArray(z.items) ? z.items : []));
  };
  const fotosNa = async (tv) => (await naTv(tv)).filter((i) => String(i._integracao || '').startsWith('pasta:')).map((i) => i.nome).sort();
  const avisosNa = async (tv) => (await naTv(tv)).filter((i) => String(i._integracao || '').startsWith('comunicados:') && i.type === 'announce').map((i) => i.titulo).sort();

  /* ----- 3 e 4: um ciclo, e tudo nas TVs ----- */
  assert.equal(await umCiclo(), 0, saida.join('\n'));
  const fotos = ['a.jpg', 'b.png', 'c.jpg'];
  assert.deepEqual(await esperar(async () => { const f = await fotosNa(refeitorio); return f.length === 3 ? f : null; }), fotos, 'as fotos da pasta não chegaram ao Refeitório');
  assert.deepEqual(await fotosNa(portaria), fotos, 'nem à Portaria (grupo Recepção)');
  const titulos = ['Festa de fim de ano', 'Ginástica laboral', 'Vacinação na enfermaria'];
  assert.deepEqual(await esperar(async () => { const a = await avisosNa(portaria); return a.length === 3 ? a : null; }), titulos, 'os comunicados do RSS não chegaram');
  const fotoDaFesta = (await naTv(refeitorio)).find((i) => i.type === 'image' && String(i._integracao || '').startsWith('comunicados:'));
  assert.ok(fotoDaFesta, 'a foto da notícia não chegou à TV');
  const servida = await new Promise((r) => http.get({ host: '127.0.0.1', port: PORTA, path: fotoDaFesta.src }, (res) => { const p = []; res.on('data', (x) => p.push(x)); res.on('end', () => r(Buffer.concat(p))); }));
  assert.ok(servida.equals(fotoDaNoticia), 'a foto da notícia não é a da intranet');
  assert.deepEqual((await pedir('/api/v1/pastas/_feed-noticias', { token })).json.arquivos.map((a) => a.nome), [sha(fotoDaNoticia).slice(0, 32) + '.png']);
  // As planilhas: pelo caminho de sempre (Preços da planilha e Indicadores).
  const precos = (await pedir('/api/planilhas', { cookie: c })).json.planilhas.find((p) => p.id === cardapio.config.destinoId);
  assert.deepEqual(precos.itens.map((i) => [i.item, i.preco]), [['Prato do dia', 24.9], ['Suco, laranja', 8], ['Gasolina (litro)', 5.9]]);
  const kpis = (await pedir('/api/kpis', { cookie: c })).json.indicadores.filter((i) => i.conectorId === producao.config.destinoId);
  assert.deepEqual(kpis.map((i) => [i.nome, i.valor, i.meta]).sort(), [['Eficiência', 87.5, 90], ['Peças por hora', 1250, 1400]]);
  // O painel vê o Conector.
  const painel = (await pedir('/api/integracoes', { cookie: c })).json.integracoes[0];
  assert.equal(painel.conectorOnline, true);
  assert.match(painel.versao, /^\d+\.\d+\.\d+$/);

  /* ----- 5: some um arquivo e um item do RSS; dois ciclos depois, somem das TVs ----- */
  fs.rmSync(path.join(share, 'b.png'));
  intranet.itens = intranet.itens.filter((x) => !x.includes('<guid>n1</guid>')); // a festa, com a foto
  assert.equal(await umCiclo(), 0);
  assert.deepEqual(await fotosNa(refeitorio), fotos, 'apagou na primeira leitura (o "salvar" do Office renomeia por um instante)');
  assert.equal(await umCiclo(), 0);
  assert.deepEqual(await esperar(async () => { const f = await fotosNa(refeitorio); return f.length === 2 ? f : null; }), ['a.jpg', 'c.jpg'], 'b.png ficou na TV');
  assert.deepEqual(await esperar(async () => { const a = await avisosNa(refeitorio); return a.length === 2 ? a : null; }), ['Ginástica laboral', 'Vacinação na enfermaria'], 'o item que saiu do RSS ficou na TV');
  assert.deepEqual((await pedir('/api/v1/pastas/_feed-noticias', { token })).json.arquivos, [], 'a foto da notícia que saiu ficou guardada');

  // O Conector perdeu a memória (estado.json apagado): o que sai do RSS sai mesmo assim (o servidor lista o que é do feed).
  fs.rmSync(path.join(base, 'estado.json'));
  intranet.itens = intranet.itens.filter((x) => !x.includes('<guid>n3</guid>'));
  assert.equal(await umCiclo(), 0);
  assert.equal(await umCiclo(), 0);
  assert.deepEqual(await esperar(async () => { const a = await avisosNa(refeitorio); return a.length === 1 ? a : null; }), ['Vacinação na enfermaria'], 'sem o estado, o item que saiu ficou na TV');
  assert.deepEqual(await fotosNa(refeitorio), ['a.jpg', 'c.jpg'], 'sem o estado, a pasta mudou');

  /* ----- 6: o compartilhamento fora do ar NÃO apaga nada ----- */
  fs.renameSync(share, share + '-fora');
  assert.equal(await umCiclo(), 0);
  assert.equal(await umCiclo(), 0);
  assert.equal(await umCiclo(), 0);
  await new Promise((r) => setTimeout(r, 600));
  assert.deepEqual(await fotosNa(refeitorio), ['a.jpg', 'c.jpg'], 'a pasta fora do ar apagou as fotos da TV');
  assert.deepEqual((await pedir('/api/v1/pastas/avisos', { token })).json.arquivos.map((a) => a.nome).sort(), ['Sub/c.jpg', 'a.jpg']);
  const estado = JSON.parse(fs.readFileSync(path.join(base, 'estado.json'), 'utf8'));
  assert.match(JSON.stringify(estado.erros), /não existe ou o servidor não respondeu/, 'o status não diz que a pasta está fora');
  fs.renameSync(share + '-fora', share);

  /* ----- o feed apagado no painel leva os comunicados dele (o Conector não apaga: o feed só some) ----- */
  assert.equal((await pedir('/api/integracoes/' + integ.id + '/fontes/' + feed.id, { method: 'DELETE', cookie: c })).status, 200);
  assert.deepEqual(await avisosNa(refeitorio), [], 'o comunicado do feed apagado ficou na TV');
  assert.equal(await umCiclo(), 0);
  await new Promise((r) => setTimeout(r, 600));
  assert.deepEqual(await avisosNa(refeitorio), [], 'o Conector pôs de volta o comunicado do feed apagado');

  /* ----- 7: token revogado: o Conector para, e diz onde gerar outro ----- */
  assert.equal((await pedir('/api/integracoes/' + integ.id + '/revogar', { method: 'POST', cookie: c })).status, 200);
  saida.length = 0;
  assert.equal(await umCiclo(), 2, 'o "uma-vez" não parou com o token revogado');
  assert.match(saida.join('\n'), /401/);
  assert.match(saida.join('\n'), /menu do avatar › Integrações/);
  // O laço de sempre (a tarefa do Windows): marca "parado" e não insiste.
  const codigo = await principal(['rodar'], { base, env: {}, escrever: () => {}, naTela: false, semPerguntas: true, semSinais: true, semVigias: true, maxCiclos: 2, sono: { dormir: async () => {}, acordar() {} } });
  assert.equal(codigo, 0);
  const parado = JSON.parse(fs.readFileSync(path.join(base, 'estado.json'), 'utf8')).parado;
  assert.equal(parado && parado.motivo, 'token-revogado');
  // O que estava nas TVs fica.
  assert.deepEqual(await fotosNa(refeitorio), ['a.jpg', 'c.jpg']);
  // Nada do que o Conector grava tem o token.
  for (const arq of ['conector.log', 'estado.json']) {
    const p = path.join(base, arq);
    if (fs.existsSync(p)) assert.equal(fs.readFileSync(p, 'utf8').includes(token), false, 'o token apareceu em ' + arq);
  }
});
