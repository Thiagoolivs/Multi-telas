/*
 * As integrações (docs/INTEGRACOES.md): o Conector MultiTelas, que mora num
 * PC da rede do cliente e EMPURRA para nós, e a intranet, que chama a mesma
 * API com o token dela. O primeiro cliente (8 TVs, dezembro) usa as duas.
 *
 * As regras puras (server/integracoes.js e js/lote-tv.js) e, depois, um
 * servidor de verdade: o token (o escopo da conta, revogar, trocar), a pasta
 * (sha igual não muda nada, apagar, tipo pelos bytes, tamanho, atalho para
 * fora da pasta), a planilha pelo caminho de sempre, o comunicado (upsert e
 * fim), a pasta indo às TVs pelo envio em lote (com a aprovação) e o limite
 * por token. Portas 6160–6169.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const I = require('../server/integracoes');
const loteTv = require('../js/lote-tv.js');
const suporte = require('../server/suporte');

/* ---------------- arquivos de mentira, com os bytes de verdade do começo ---------------- */

const resto = (n) => crypto.randomBytes(n);
const PNG = (n = 2000) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), resto(n)]);
const JPG = (n = 2000) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), resto(n)]);
const WEBP = () => Buffer.concat([Buffer.from('RIFF'), Buffer.from([1, 2, 3, 4]), Buffer.from('WEBPVP8 '), resto(500)]);
const MP4 = (codec = 'avc1') => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2'), resto(200), Buffer.from('stsd'), resto(8), Buffer.from(codec), resto(300)]);
const PDF = () => Buffer.concat([Buffer.from('%PDF-1.7\n'), resto(500)]);
const ZIP = (nomes) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), resto(30), ...nomes.map((n) => Buffer.from(n)), resto(200)]);
const PPTX = () => ZIP(['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml']);
const DOCX = () => ZIP(['[Content_Types].xml', 'word/document.xml']);
const HEIC = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), resto(300)]);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

/* ---------------- as regras puras ---------------- */

test('o nome do arquivo: subpasta com "/" vale; "..", caminho absoluto, unidade, "\\" e controle, não', () => {
  assert.deepEqual(I.nomeDoArquivo('Avisos/dezembro.jpg'), { nome: 'Avisos/dezembro.jpg' });
  assert.deepEqual(I.nomeDoArquivo('Apresentacao.pptx/01.png'), { nome: 'Apresentacao.pptx/01.png' });
  for (const ruim of ['../segredo.jpg', 'a/../../b.jpg', './a.jpg', '/etc/passwd', 'C:/x.jpg', 'a\\b.jpg', 'a//b.jpg', 'a/', '', 'a\u0000.jpg', 'x'.repeat(241)]) {
    assert.ok(I.nomeDoArquivo(ruim).erro, 'aceitou "' + ruim.slice(0, 30) + '"');
  }
});

test('o tipo sai dos BYTES: JPG, PNG, WEBP e MP4 entram; PDF e PPTX são reconhecidos para a recusa; DOCX, HEIC e lixo, não', () => {
  const t = (b) => I.tipoPelosBytes(b, b);
  assert.deepEqual(t(JPG()), { mime: 'image/jpeg', tipo: 'imagem' });
  assert.deepEqual(t(PNG()), { mime: 'image/png', tipo: 'imagem' });
  assert.deepEqual(t(WEBP()), { mime: 'image/webp', tipo: 'imagem' });
  assert.deepEqual(t(MP4()), { mime: 'video/mp4', tipo: 'video' });
  assert.equal(t(PDF()).tipo, 'documento');
  assert.equal(t(PPTX()).tipo, 'documento');
  assert.ok(!I.ACEITO.documento, 'PDF e PPTX não vão direto para a TV (revisão de lançamento)');
  assert.equal(t(DOCX()), null);
  assert.equal(t(HEIC()), null, 'foto HEIC do iPhone no envelope do MP4');
  assert.equal(t(Buffer.from('<html><script>alert(1)</script>')), null);
  assert.match(I.SLIDES_COMO_IMAGEM, /Salve os slides como imagem; o Conector converte sozinho quando o PowerPoint está instalado/);
});

test('a pasta na TV: por nome ou por data, e os slides de uma apresentação juntos, na ordem', () => {
  const arq = [['b.jpg', 3], ['Apresentacao.pptx/02.png', 5], ['Apresentacao.pptx/01.png', 1], ['Apresentacao.pptx/10.png', 2], ['a 2.jpg', 4], ['a 10.jpg', 6], ['v.mp4', 9]]
    .map(([nome, em]) => ({ nome, em, url: '/media/t/' + em, mime: nome.endsWith('mp4') ? 'video/mp4' : 'image/png' }));
  assert.deepEqual(I.itensDaPasta(arq, { ordem: 'nome' }).map((i) => i.nome),
    ['a 2.jpg', 'a 10.jpg', 'Apresentacao · 01', 'Apresentacao · 02', 'Apresentacao · 10', 'b.jpg', 'v.mp4']);
  // Mais novo primeiro: a apresentação vai inteira, na data do slide mais novo (5), e o slide 01 continua antes do 02.
  assert.deepEqual(I.itensDaPasta(arq, { ordem: 'data' }).map((i) => i.nome),
    ['v.mp4', 'a 10.jpg', 'Apresentacao · 01', 'Apresentacao · 02', 'Apresentacao · 10', 'a 2.jpg', 'b.jpg']);
  const [foto] = I.itensDaPasta([arq[0]], { segundos: 7, ajuste: 'preencher' });
  assert.deepEqual(foto, { type: 'image', src: '/media/t/3', fit: 'cover', duracao: 7, nome: 'b.jpg', meta: { duracaoManual: true } });
  const [video] = I.itensDaPasta([arq[6]], {});
  assert.equal(video.type, 'video');
  assert.equal(video.duracao, 0, 'o vídeo toca inteiro');
  assert.deepEqual(I.itensDaPasta([{ nome: 'x.pdf', em: 1, url: '/m', mime: 'application/pdf' }], {}), [], 'documento antigo não vira item');
});

test('a TV: a integração troca só o que é dela, no lugar onde estava; lista vazia tira', () => {
  const cfg = { settings: { layoutId: 'full' }, zonas: { principal: { items: [{ type: 'text', titulo: 'A' }, { type: 'text', titulo: 'B' }] } } };
  const um = loteTv.aplicarIntegracao(cfg, { id: 'pasta:1', itens: [{ type: 'image', src: '/1' }] });
  assert.deepEqual(um.zonas.principal.items.map((i) => i.titulo || i.src), ['A', 'B', '/1'], 'a pasta entra no fim');
  assert.equal(um.zonas.principal.items[2]._integracao, 'pasta:1');
  // A pessoa arrastou a pasta para o meio: a próxima sincronização fica ali.
  const meio = JSON.parse(JSON.stringify(um));
  meio.zonas.principal.items = [meio.zonas.principal.items[0], meio.zonas.principal.items[2], meio.zonas.principal.items[1]];
  const dois = loteTv.aplicarIntegracao(meio, { id: 'pasta:1', itens: [{ type: 'image', src: '/1' }, { type: 'image', src: '/2' }] });
  assert.deepEqual(dois.zonas.principal.items.map((i) => i.titulo || i.src), ['A', '/1', '/2', 'B']);
  const com = loteTv.aplicarIntegracao(dois, { id: 'comunicados:x', posicao: 'inicio', itens: [{ type: 'announce', titulo: 'Festa' }] });
  assert.equal(com.zonas.principal.items[0].titulo, 'Festa', 'o comunicado é notícia: entra na frente');
  const fora = loteTv.tirarIntegracao(com, 'pasta:1');
  assert.deepEqual(fora.zonas.principal.items.map((i) => i.titulo || i.src), ['Festa', 'A', 'B']);
  assert.deepEqual(cfg.zonas.principal.items.length, 2, 'não mexe na recebida');
});

test('o comunicado: título obrigatório, datas ISO no horário de Brasília, imagem só https ou da pasta', () => {
  assert.equal(I.lerComunicado({}).code, 'campo-invalido');
  assert.equal(I.lerComunicado(null).code, 'json-invalido');
  const c = I.lerComunicado({ titulo: ' Festa ', texto: 'Dia 20\n\n\n\nno pátio', inicio: '2026-12-01', fim: '2026-12-20T18:00', destaque: true, link: 'https://intranet.exemplo.com.br/festa/' });
  assert.equal(c.dados.titulo, 'Festa');
  assert.equal(c.dados.texto, 'Dia 20\n\nno pátio');
  assert.equal(new Date(c.inicio).toISOString(), '2026-12-01T03:00:00.000Z', 'só a data: desde a meia-noite de Brasília');
  assert.equal(new Date(c.fim).toISOString(), '2026-12-20T21:00:00.000Z', 'sem fuso: horário de Brasília');
  assert.equal(I.lerComunicado({ titulo: 'x', inicio: '2026-12-02', fim: '2026-12-01' }).code, 'campo-invalido');
  assert.equal(I.lerComunicado({ titulo: 'x', fim: 'amanhã' }).code, 'campo-invalido');
  assert.deepEqual(I.lerComunicado({ titulo: 'x', imagemUrl: 'pasta:rh/Avisos/foto.jpg' }).imagem, { pasta: 'rh', nome: 'Avisos/foto.jpg' });
  assert.equal(I.lerComunicado({ titulo: 'x', imagemUrl: 'http://intranet/foto.jpg' }).code, 'imagem-invalida', 'http da rede interna');
  assert.equal(I.lerComunicado({ titulo: 'x', imagemUrl: 'pasta:rh/../x.jpg' }).code, 'imagem-invalida');
  assert.equal(I.lerComunicado({ titulo: 'x', link: 'javascript:alert(1)' }).code, 'campo-invalido');
  const itens = I.itensDoComunicado({ idExterno: 'n1', inicio: c.inicio, fim: c.fim, dados: c.dados }, '/media/t/f.jpg');
  assert.deepEqual(itens.map((i) => i.type), ['image', 'announce']);
  assert.equal(itens[1].meta.expiraEm, c.fim, 'a TV esconde no fim mesmo sem falar conosco');
  assert.equal(itens[1].meta.prioridade, 'alta');
  assert.deepEqual(itens[1].agendamento, { ativo: true, dias: [], dataInicio: '2026-12-01', dataFim: '2026-12-20' });
  assert.equal(itens[1].info, 'intranet.exemplo.com.br/festa');
  const agora = Date.parse('2026-12-10T12:00:00Z');
  const { ativos, proxima } = I.agendaDosComunicados([
    { idExterno: 'a', inicio: 0, fim: 0, dados: { titulo: 'a' }, criadoEm: 1 },
    { idExterno: 'b', inicio: agora + 1000, fim: 0, dados: { titulo: 'b' }, criadoEm: 2 },
    { idExterno: 'c', inicio: 0, fim: agora - 1, dados: { titulo: 'c' }, criadoEm: 3 },
    { idExterno: 'd', inicio: 0, fim: agora + 5000, dados: { titulo: 'd', destaque: true }, criadoEm: 4 },
  ], agora);
  assert.deepEqual(ativos.map((x) => x.idExterno), ['d', 'a'], 'no ar agora, o destaque na frente');
  assert.equal(proxima, agora + 1000, 'o relógio volta quando o próximo começa');
});

test('o token: 256 bits com prefixo, guardado só como hash; o suporte não cria nem troca token', () => {
  const tk = I.novoToken();
  assert.match(tk, /^mti_[A-Za-z0-9_-]{43}$/);
  assert.ok(I.tokenComFormato(tk));
  assert.equal(I.hashToken(tk).length, 64);
  assert.notEqual(I.novoToken(), tk);
  assert.match(suporte.bloqueio(['api', 'integracoes'], 'POST'), /dono/);
  assert.match(suporte.bloqueio(['api', 'integracoes', 'int_x', 'token'], 'POST'), /dono/);
  assert.equal(suporte.bloqueio(['api', 'integracoes', 'int_x', 'fontes'], 'POST'), '');
  assert.equal(suporte.bloqueio(['api', 'integracoes'], 'GET'), '');
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 6160;
const PORTA_IMAGEM = 6161;
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.corpo != null ? (Buffer.isBuffer(o.corpo) ? o.corpo : Buffer.from(String(o.corpo))) : (o.json !== undefined ? Buffer.from(JSON.stringify(o.json)) : null);
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json !== undefined ? { 'Content-Type': 'application/json' } : {}, corpo ? { 'Content-Length': corpo.length } : {},
        o.cookie ? { Cookie: o.cookie } : {}, o.token ? { Authorization: 'Bearer ' + o.token } : {}, o.headers || {}) }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const txt = Buffer.concat(partes).toString('utf8');
        let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, txt, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
const esperar = async (fn, ms = 6000) => {
  const ate = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > ate) return v;
    await new Promise((r) => setTimeout(r, 100));
  }
};

test('o servidor: token, pasta, planilha, comunicado, a TV pelo envio em lote, a aprovação e o limite', { timeout: 180000 }, async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-int-'));
  // A imagem pública do comunicado, servida aqui (INTEGRACAO_HOST_TESTE libera só este host, e só fora de produção).
  const imagemPublica = PNG(3000);
  const servImagem = http.createServer((req, res) => {
    if (req.url === '/foto.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(imagemPublica); }
    if (req.url === '/mentira.png') { res.writeHead(200, { 'content-type': 'image/png' }); return res.end('<html>não sou imagem</html>'); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => servImagem.listen(PORTA_IMAGEM, '127.0.0.1', r));
  let saida = '';
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: process.env.TEST_DATABASE_URL || '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev',
      MT_INTEGRACAO_ESPERA_MS: '150', INTEGRACAO_HOST_TESTE: '127.0.0.1:' + PORTA_IMAGEM, LOG_FORMATO: 'json' },
  });
  servidor.stdout.on('data', (c) => { saida += c; });
  servidor.stderr.on('data', (c) => { saida += c; });
  t.after(() => { servidor.kill(); servImagem.close(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const conta = async (n) => cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'int' + n + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'RH ' + n, aceite: true } }));
  const c = await conta('a');
  const outra = await conta('b');
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: c, json: { plan: 'pro' } })).status, 200);
  const novaTv = async (cookie) => {
    const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
    assert.ok((await pedir('/api/pair', { method: 'POST', cookie, json: { code: tv.code } })).status < 300);
    return tv;
  };
  const tv1 = await novaTv(c);
  const tv2 = await novaTv(c);
  assert.equal((await pedir('/api/devices/' + tv2.id + '/grupo', { method: 'POST', cookie: c, json: { grupo: 'Recepção' } })).status < 300, true);
  // A programação como a TV lê (com o token dela): sem freio, como o player.
  const naTv = async (tv) => {
    const r = await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } });
    if (r.status === 204) return [];
    return Object.values((r.json && r.json.zonas) || {}).flatMap((z) => (z && Array.isArray(z.items) ? z.items : []));
  };
  const daIntegracao = async (tv, prefixo) => (await naTv(tv)).filter((i) => String(i._integracao || '').startsWith(prefixo));

  /* ----- criar a integração: o token sai uma vez ----- */
  assert.equal((await pedir('/api/integracoes')).status, 401);
  const criada = await pedir('/api/integracoes', { method: 'POST', cookie: c, json: { nome: 'Conector do RH' } });
  assert.equal(criada.status, 200);
  const token = criada.json.token;
  assert.match(token, /^mti_/);
  const integ = criada.json.integracao;
  assert.equal(integ.tokenDica, token.slice(-4));
  const lista0 = await pedir('/api/integracoes', { cookie: c });
  assert.equal(lista0.status, 200);
  assert.equal(lista0.txt.includes(token), false, 'o token voltou na lista');
  assert.equal(lista0.txt.includes(I.hashToken(token)), false, 'o hash do token voltou na lista');
  assert.equal(lista0.json.integracoes[0].comunicados.config.aprovacao, false, 'a aprovação começa desligada');

  /* ----- autenticação ----- */
  assert.equal((await pedir('/api/v1/conector')).json.code, 'sem-token');
  assert.equal((await pedir('/api/v1/conector', { token: 'mti_' + 'x'.repeat(43) })).json.code, 'token-invalido');
  assert.equal((await pedir('/api/v1/conector', { headers: { Authorization: 'Basic ' + Buffer.from('a:b').toString('base64') } })).status, 401);

  /* ----- as fontes: o painel decide ----- */
  const fonte = async (json) => pedir('/api/integracoes/' + integ.id + '/fontes', { method: 'POST', cookie: c, json });
  const pasta = (await fonte({ tipo: 'pasta', nome: 'Avisos do RH', chave: 'avisos', segundos: 8, alvo: { telas: [tv1.id], grupos: ['recepção'] } })).json.fonte;
  assert.equal(pasta.chave, 'avisos');
  assert.deepEqual(pasta.config.alvo, { todas: false, telas: [tv1.id], grupos: ['recepção'] });
  assert.equal(pasta.config.aprovacao, false);
  assert.equal((await fonte({ tipo: 'pasta', nome: 'Outra', chave: 'avisos' })).status, 409, 'chave repetida');
  assert.equal((await fonte({ tipo: 'feed', nome: 'Notícias', url: 'http://usuario:senha@intranet/rss' })).status, 400, 'senha no endereço do feed');
  const feed = (await fonte({ tipo: 'feed', nome: 'Notícias', url: 'http://intranet.local/noticias.json', formato: 'json', mapa: { lista: 'itens', titulo: 'title', 'x;': 1 } })).json.fonte;
  const precos = (await fonte({ tipo: 'planilha', nome: 'Cardápio', chave: 'cardapio' })).json.fonte;
  const kpi = (await fonte({ tipo: 'planilha', nome: 'Produção', chave: 'producao', uso: 'indicadores' })).json.fonte;
  assert.ok(precos.config.destinoId && kpi.config.destinoId, 'a planilha nasce com o lugar dela');

  /* ----- o aperto de mão ----- */
  const ola = await pedir('/api/v1/conector', { token, headers: { 'X-Conector-Versao': '1.0.3', 'X-Conector-Maquina': 'PC-RH-01' } });
  assert.equal(ola.status, 200);
  assert.deepEqual(Object.keys(ola.json).sort(), ['conta', 'feeds', 'integracao', 'intervaloSegundos', 'pastas', 'planilhas']);
  assert.equal(ola.json.conta.nome, 'RH a');
  assert.deepEqual(ola.json.integracao, { nome: 'Conector do RH' });
  assert.deepEqual(ola.json.pastas, [{ chave: 'avisos', nome: 'Avisos do RH' }]);
  assert.deepEqual(ola.json.planilhas.map((p) => p.chave).sort(), ['cardapio', 'producao']);
  assert.deepEqual(ola.json.feeds, [{ chave: feed.chave, nome: 'Notícias', url: 'http://intranet.local/noticias.json', formato: 'json', mapa: { lista: 'itens', id: '', titulo: 'title', texto: '', imagem: '', link: '', inicio: '', fim: '' } }]);
  assert.equal(ola.json.intervaloSegundos, 60);
  const visto = (await pedir('/api/integracoes', { cookie: c })).json.integracoes[0];
  assert.deepEqual([visto.versao, visto.maquina, visto.conectorOnline], ['1.0.3', 'PC-RH-01', true]);

  /* ----- a pasta: o arquivo ----- */
  const subir = (nome, corpo, cab) => pedir('/api/v1/pastas/avisos/arquivos/' + nome, { method: 'PUT', token, corpo, headers: Object.assign({ 'Content-Type': 'application/octet-stream', 'X-Sha256': sha(corpo) }, cab || {}) });
  const foto = JPG(4000);
  assert.equal((await pedir('/api/v1/pastas/avisos/arquivos/a.jpg', { method: 'PUT', token, corpo: foto })).json.code, 'sha-invalido');
  assert.equal((await subir('a.jpg', foto, { 'X-Sha256': sha(PNG()) })).json.code, 'sha-diferente');
  const r1 = await subir('Avisos%2Fnatal.jpg', foto, { 'Content-Type': 'image/jpeg' });
  assert.equal(r1.status, 200, r1.txt);
  assert.deepEqual(r1.json, { ok: true, nome: 'Avisos/natal.jpg', sha256: sha(foto), mudou: true });
  const r2 = await subir('Avisos%2Fnatal.jpg', foto);
  assert.deepEqual([r2.status, r2.json.mudou], [200, false], 'o mesmo sha de novo não muda nada');
  // O ".png" que é JPG entra como JPG: o tipo é o dos bytes, não o do nome.
  assert.equal((await subir('b.png', JPG(), { 'Content-Type': 'image/png' })).status, 200);
  const slides = [PNG(), PNG()];
  assert.equal((await subir('Apresentacao.pptx%2F02.png', slides[1])).status, 200);
  assert.equal((await subir('Apresentacao.pptx/01.png', slides[0])).status, 200, 'a barra crua também vale');
  const lista = (await pedir('/api/v1/pastas/avisos', { token })).json.arquivos;
  assert.deepEqual(lista.map((a) => a.nome).sort(), ['Apresentacao.pptx/01.png', 'Apresentacao.pptx/02.png', 'Avisos/natal.jpg', 'b.png']);
  const natal = lista.find((a) => a.nome === 'Avisos/natal.jpg');
  assert.deepEqual([natal.sha256, natal.tamanho], [sha(foto), foto.length]);
  assert.match(natal.em, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await pedir('/api/v1/pastas/nao-existe', { token })).json.code, 'pasta-desconhecida');

  // O tipo e o tamanho: recusas com o motivo em português.
  const pdf = await subir('regras.pdf', PDF());
  assert.deepEqual([pdf.status, pdf.json.code], [415, 'tipo-nao-aceito']);
  assert.match(pdf.json.error, /Salve os slides como imagem; o Conector converte sozinho quando o PowerPoint está instalado/);
  const pptxDeclarado = await subir('slides.pptx', PPTX(), { 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  assert.equal(pptxDeclarado.status, 415);
  assert.match(pptxDeclarado.json.error, /Salve os slides como imagem/);
  assert.equal((await subir('foto.jpg', PPTX())).status, 415, 'o PPTX com nome de foto');
  const lixo = await subir('pagina.jpg', Buffer.from('<html><script>alert(1)</script></html>'), { 'Content-Type': 'image/jpeg' });
  assert.deepEqual([lixo.status, lixo.json.code], [415, 'tipo-nao-aceito']);
  assert.match(lixo.json.error, /conferido pelo conteúdo/);
  assert.equal((await subir('iphone.mp4', HEIC())).status, 415);
  const grande = await subir('enorme.jpg', JPG(21 * 1024 * 1024));
  assert.deepEqual([grande.status, grande.json.code], [413, 'grande-demais']);
  assert.match(grande.json.error, /máximo para foto é 20 MB/);
  const video = await subir('boas-vindas.mp4', MP4('hvc1'));
  assert.equal(video.status, 200);
  assert.match(video.json.aviso, /H\.265/, 'o vídeo que o TV Box não toca entra com o aviso');

  // O atalho para fora da pasta.
  for (const ruim of ['..%2F..%2Fetc%2Fpasswd', '%2E%2E%2Fx.jpg', 'a%5Cb.jpg', 'C%3A%2Fx.jpg', 'a%2F%2Fb.jpg', '%00.jpg']) {
    const r = await subir(ruim, JPG());
    assert.deepEqual([r.status, r.json && r.json.code], [400, 'nome-invalido'], ruim);
  }

  /* ----- a pasta vai às TVs pelo envio em lote ----- */
  const fotosNa = async (tv) => (await daIntegracao(tv, 'pasta:')).map((i) => i.nome);
  const esperado = ['Apresentacao · 01', 'Apresentacao · 02', 'natal.jpg', 'b.png', 'boas-vindas.mp4'];
  assert.deepEqual(await esperar(async () => { const n = await fotosNa(tv1); return n.length === 5 ? n : null; }), esperado);
  assert.deepEqual(await fotosNa(tv2), esperado, 'a TV do grupo Recepção também');
  const item = (await daIntegracao(tv1, 'pasta:')).find((i) => i.nome === 'natal.jpg');
  assert.deepEqual([item.type, item.duracao, item.fit], ['image', 8, 'contain']);
  assert.match(item.src, /^\/media\//);
  assert.equal((await pedir(item.src)).status, 200, 'a foto é servida');
  const lotes = (await pedir('/api/lote', { cookie: c })).json.lotes;
  assert.ok(lotes.some((l) => l.descricao === 'Pasta da rede: Avisos do RH'), 'o envio aparece nos Últimos envios (com Desfazer)');

  // Apagar no compartilhamento tira da TV.
  const apagado = await pedir('/api/v1/pastas/avisos/arquivos/b.png', { method: 'DELETE', token });
  assert.deepEqual(apagado.json, { ok: true, nome: 'b.png', removido: true });
  assert.equal((await pedir('/api/v1/pastas/avisos/arquivos/b.png', { method: 'DELETE', token })).json.removido, false);
  assert.ok(await esperar(async () => !(await fotosNa(tv1)).includes('b.png')), 'b.png continuou na TV');

  // A TV que sai do mapa perde o que era da pasta; o resto dela fica.
  assert.equal((await pedir('/api/integracoes/' + integ.id + '/fontes/' + pasta.id, { method: 'PUT', cookie: c, json: { alvo: { telas: [tv1.id] } } })).status, 200);
  assert.ok(await esperar(async () => (await fotosNa(tv2)).length === 0), 'a TV fora do mapa continuou com a pasta');
  assert.equal((await fotosNa(tv1)).length, 4);

  /* ----- com "precisa de aprovação": vira pedido ----- */
  assert.equal((await pedir('/api/integracoes/' + integ.id + '/fontes/' + pasta.id, { method: 'PUT', cookie: c, json: { aprovacao: true } })).status, 200);
  assert.equal((await subir('nova.jpg', JPG())).status, 200);
  const pedido = await esperar(async () => {
    const a = (await pedir('/api/aprovacoes', { cookie: c })).json;
    return a.pendentes && a.pendentes.find((p) => /Pasta da rede: Avisos do RH/.test(p.descricao));
  }, 8000);
  assert.ok(pedido, 'a mudança não virou pedido de aprovação');
  assert.equal((await fotosNa(tv1)).includes('nova.jpg'), false, 'foi ao ar sem aprovação');
  const status = (await pedir('/api/integracoes', { cookie: c })).json.integracoes[0].fontes.find((f) => f.id === pasta.id);
  assert.equal(status.estado.resultado, 'esperando');
  assert.equal(status.pedido.estado, 'pendente');
  assert.equal((await pedir('/api/aprovacoes/' + pedido.id + '/aprovar', { method: 'POST', cookie: c })).status, 200);
  assert.ok((await fotosNa(tv1)).includes('nova.jpg'), 'aprovado e não foi para a TV');

  /* ----- a planilha: o mesmo caminho da planilha ligada ----- */
  const csv = (chave, corpo, cab) => pedir('/api/v1/planilhas/' + chave, { method: 'PUT', token, corpo, headers: Object.assign({ 'Content-Type': 'text/csv; charset=utf-8' }, cab || {}) });
  const p1 = await csv('cardapio', 'Item;Preço;Seção\nCafé expresso;6,00;Bebidas\nPão de queijo;4,50;Lanches\n');
  assert.deepEqual([p1.status, p1.json.itens, p1.json.mudou], [200, 2, true], p1.txt);
  const nasPlanilhas = (await pedir('/api/planilhas', { cookie: c })).json.planilhas.find((p) => p.id === precos.config.destinoId);
  assert.equal(nasPlanilhas.origem, 'conector');
  assert.deepEqual(nasPlanilhas.itens.map((i) => [i.item, i.preco, i.secao]), [['Café expresso', 6, 'Bebidas'], ['Pão de queijo', 4.5, 'Lanches']]);
  // O CSV do Excel em português (Windows-1252) acerta os acentos.
  const latin = Buffer.from('Item;Preço\nCafé com leite;7,00\n', 'latin1');
  assert.equal((await csv('cardapio', latin, { 'Content-Type': 'text/csv' })).json.itens, 1);
  assert.equal((await pedir('/api/planilhas', { cookie: c })).json.planilhas.find((p) => p.id === precos.config.destinoId).itens[0].item, 'Café com leite');
  assert.deepEqual([(await csv('cardapio', ZIP(['xl/workbook.xml']))).status], [415], 'o .xlsx cru');
  const vazia = await csv('cardapio', 'só um título\n');
  assert.deepEqual([vazia.status, vazia.json.code], [422, 'planilha-sem-itens']);
  assert.equal((await pedir('/api/planilhas', { cookie: c })).json.planilhas.find((p) => p.id === precos.config.destinoId).itens.length, 1, 'o erro apagou os itens bons');
  assert.equal((await csv('cardapio', 'x'.repeat(600 * 1024))).status, 413);
  assert.equal((await csv('nao-existe', 'a;1')).json.code, 'planilha-desconhecida');
  const k1 = await csv('producao', 'Indicador;Valor;Meta\nPeças por hora;1.250;1.400\nRefugo;2,6;2\n');
  assert.deepEqual([k1.status, k1.json.indicadores], [200, 2], k1.txt);
  const kpis = (await pedir('/api/kpis', { cookie: c })).json;
  assert.deepEqual(kpis.indicadores.filter((i) => i.conectorId === kpi.config.destinoId).map((i) => [i.nome, i.valor, i.meta, i.sentido]).sort(),
    [['Peças por hora', 1250, 1400, 'maior'], ['Refugo', 2.6, 2, 'menor']]);

  /* ----- os comunicados: upsert, imagem e o fim ----- */
  assert.equal((await pedir('/api/integracoes/' + integ.id, { method: 'PUT', cookie: c, json: { comunicados: { alvo: { todas: true } } } })).status, 200);
  const comunicar = (id, json, cab) => pedir('/api/v1/comunicados/' + encodeURIComponent(id), { method: 'PUT', token, json, headers: cab || {} });
  const avisosNa = async (tv) => (await daIntegracao(tv, 'comunicados:')).filter((i) => i.type === 'announce').map((i) => i.titulo);
  const u1 = await comunicar('noticia/1', { titulo: 'Festa de fim de ano', texto: 'Dia 20, no pátio', destaque: true }, { 'X-Conector-Feed': feed.chave });
  assert.deepEqual([u1.status, u1.json.criado, u1.json.situacao], [200, true, 'no-ar'], u1.txt);
  const u2 = await comunicar('noticia/1', { titulo: 'Festa de fim de ano (mudou o horário)' });
  assert.equal(u2.json.criado, false, 'o mesmo id criou outro');
  assert.deepEqual(await esperar(async () => { const a = await avisosNa(tv2); return a.length && a[0] === 'Festa de fim de ano (mudou o horário)' ? a : null; }), ['Festa de fim de ano (mudou o horário)'], 'o upsert duplicou ou não chegou');
  const porId = (await pedir('/api/integracoes', { cookie: c })).json.integracoes[0];
  assert.equal(porId.comunicados.total, 1);
  assert.equal(porId.fontes.find((f) => f.id === feed.id).estado.itens, 1, 'o feed contou o item');
  // A imagem: da pasta, ou https pública (baixada pela porta do site.js); interna, nunca.
  assert.equal((await comunicar('c2', { titulo: 'x', imagemUrl: 'pasta:avisos/nao-existe.jpg' })).json.code, 'imagem-nao-encontrada');
  assert.equal((await comunicar('c2', { titulo: 'x', imagemUrl: 'pasta:avisos/boas-vindas.mp4' })).json.code, 'imagem-invalida');
  const interna = await comunicar('c2', { titulo: 'x', imagemUrl: 'https://127.0.0.1:9/foto.png' });
  assert.deepEqual([interna.status, interna.json.code], [400, 'imagem-invalida']);
  assert.match(interna.json.error, /rede interna/);
  assert.equal((await comunicar('c2', { titulo: 'x', imagemUrl: 'http://intranet.local/foto.png' })).json.code, 'imagem-invalida');
  assert.match((await comunicar('c2', { titulo: 'x', imagemUrl: 'http://127.0.0.1:' + PORTA_IMAGEM + '/mentira.png' })).json.error, /conferido pelo conteúdo/);
  assert.equal((await comunicar('c2', { titulo: 'Natal', imagemUrl: 'pasta:avisos/Avisos/natal.jpg' })).status, 200);
  assert.equal((await comunicar('c3', { titulo: 'Campanha do agasalho', imagemUrl: 'http://127.0.0.1:' + PORTA_IMAGEM + '/foto.png' })).status, 200);
  const comFoto = await esperar(async () => { const it = await daIntegracao(tv1, 'comunicados:'); return it.filter((i) => i.type === 'image').length === 2 ? it : null; });
  assert.ok(comFoto, 'as fotos dos comunicados não chegaram');
  const baixada = comFoto.find((i) => i.type === 'image' && i._comunicado === 'c3');
  assert.match(baixada.src, /^\/media\//, 'a imagem de fora foi guardada aqui (a TV não busca o endereço de fora)');
  assert.deepEqual((await pedir(baixada.src)).status, 200);
  // O que acaba sai sozinho; o que começa depois entra sozinho.
  const fim = new Date(Date.now() + 1500).toISOString();
  assert.equal((await comunicar('relampago', { titulo: 'Aviso relâmpago', fim })).json.situacao, 'no-ar');
  const inicio = new Date(Date.now() + 1500).toISOString();
  assert.equal((await comunicar('depois', { titulo: 'Começa daqui a pouco', inicio })).json.situacao, 'agendado');
  assert.ok(await esperar(async () => (await avisosNa(tv1)).includes('Aviso relâmpago')), 'o relâmpago não entrou');
  assert.equal((await avisosNa(tv1)).includes('Começa daqui a pouco'), false, 'entrou antes do início');
  const relampago = (await daIntegracao(tv1, 'comunicados:')).find((i) => i.titulo === 'Aviso relâmpago');
  assert.equal(relampago.meta.expiraEm, Date.parse(fim), 'a TV sabe a hora do fim');
  assert.ok(await esperar(async () => { const a = await avisosNa(tv1); return !a.includes('Aviso relâmpago') && a.includes('Começa daqui a pouco'); }, 8000), 'o fim e o início não foram respeitados');
  // Tirar pela API, e pelo painel.
  assert.deepEqual((await pedir('/api/v1/comunicados/depois', { method: 'DELETE', token })).json, { ok: true, id: 'depois', removido: true });
  assert.equal((await pedir('/api/integracoes/' + integ.id + '/comunicados/c2', { method: 'DELETE', cookie: c })).status, 200);
  assert.ok(await esperar(async () => { const a = await avisosNa(tv1); return !a.includes('Começa daqui a pouco') && !a.includes('Natal'); }), 'o comunicado apagado ficou na TV');

  /* ----- o escopo: o token é de uma conta só ----- */
  const deOutra = (await pedir('/api/integracoes', { method: 'POST', cookie: outra, json: { nome: 'Intranet' } })).json;
  assert.equal((await pedir('/api/integracoes/' + deOutra.integracao.id + '/fontes', { method: 'POST', cookie: outra, json: { tipo: 'pasta', nome: 'Avisos', chave: 'avisos' } })).status, 200);
  assert.deepEqual((await pedir('/api/v1/pastas/avisos', { token: deOutra.token })).json.arquivos, [], 'a pasta de outra conta apareceu');
  assert.equal((await pedir('/api/integracoes/' + integ.id, { cookie: outra, method: 'PUT', json: { nome: 'roubada' } })).status, 404);
  assert.equal((await pedir('/api/v1/comunicados/noticia%2F1', { method: 'DELETE', token: deOutra.token })).json.removido, false, 'apagou o comunicado de outra conta');

  /* ----- revogar e trocar o token ----- */
  assert.equal((await pedir('/api/integracoes/' + integ.id + '/revogar', { method: 'POST', cookie: c })).status, 200);
  assert.equal((await pedir('/api/v1/conector', { token })).json.code, 'token-revogado');
  const trocado = (await pedir('/api/integracoes/' + integ.id + '/token', { method: 'POST', cookie: c })).json.token;
  assert.equal((await pedir('/api/v1/conector', { token })).json.code, 'token-invalido', 'o token antigo voltou a valer');
  assert.equal((await pedir('/api/v1/conector', { token: trocado })).status, 200);

  /* ----- a auditoria e o log ----- */
  const registro = (await pedir('/api/integracoes/' + integ.id + '/registro', { cookie: c })).json.registro;
  for (const acao of ['arquivo.novo', 'arquivo.apagado', 'planilha.lida', 'comunicado.novo', 'comunicado.trocado', 'tv.enviado', 'tv.aprovacao', 'token.revogado', 'token.novo']) {
    assert.ok(registro.some((r) => r.acao === acao), 'a auditoria não tem ' + acao);
  }
  assert.ok(registro.some((r) => r.quem === 'token …' + token.slice(-4)), 'a auditoria não diz qual token');
  assert.ok(saida.includes('"integracao.chamada"') && saida.includes('"integracao":"' + integ.id + '"'), 'o log não tem a chamada com o id da integração');
  assert.equal(saida.includes(token) || saida.includes(trocado), false, 'o token foi parar no log');
  assert.equal(saida.includes('natal.jpg'), false, 'o nome do arquivo foi parar no log de chamadas');

  /* ----- a operação da integração é do servidor; a exportação leva tudo, menos o hash ----- */
  const forjada = await pedir('/api/lote/operacao', { method: 'POST', cookie: c, json: { operacao: { tipo: 'integracao', id: 'pasta:x', entradas: [{ itens: [] }] }, telas: [tv1.id] } });
  assert.deepEqual([forjada.status, forjada.json.code], [400, 'operacao-invalida'], 'o painel forjou a origem da integração');
  const exportado = await pedir('/api/privacidade/exportar', { cookie: c });
  assert.equal(exportado.status, 200);
  assert.ok(exportado.txt.includes('integracoes') && exportado.txt.includes('Conector do RH'), 'a exportação não levou as integrações');
  assert.equal(exportado.txt.includes(I.hashToken(trocado)), false, 'a exportação levou o hash do token');

  /* ----- o limite por token ----- */
  const rapida = (await pedir('/api/integracoes', { method: 'POST', cookie: c, json: { nome: 'Intranet' } })).json.token;
  let barrado = null;
  for (let i = 0; i < 125 && !barrado; i++) {
    const r = await pedir('/api/v1/comunicados/x', { method: 'DELETE', token: rapida });
    if (r.status === 429) barrado = r;
  }
  assert.ok(barrado, 'o limite de 120 por minuto não segurou');
  assert.equal(barrado.json.code, 'limite');
  assert.ok(Number(barrado.headers['retry-after']) > 0);
  assert.equal((await pedir('/api/v1/conector', { token: trocado })).status, 200, 'o limite de um token segurou o outro');

  /* ----- apagar a integração tira das TVs o que ela pôs ----- */
  assert.equal((await pedir('/api/integracoes/' + integ.id, { method: 'DELETE', cookie: c })).status, 200);
  assert.deepEqual(await daIntegracao(tv1, ''), [], 'sobrou conteúdo da integração apagada na TV');
  assert.equal((await pedir('/api/v1/conector', { token: trocado })).status, 401);
  assert.equal((await pedir('/api/planilhas', { cookie: c })).json.planilhas.some((p) => p.id === precos.config.destinoId), false, 'a planilha da integração apagada ficou');
});

/* ---------------- o painel ---------------- */

test('o painel: Integrações no avatar e nos Apps, o token uma vez, o passo a passo do Conector e o curl da intranet', async () => {
  const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
  const app = ler('web/src/App.jsx');
  assert.match(app, /const IntegracoesPage = pagina\(\(\) => import\('\.\/pages\/IntegracoesPage\.jsx'\), 'IntegracoesPage'\);/);
  assert.match(app, /case 'integracoes': return <IntegracoesPage \/>;/);
  assert.match(app, /integracoes: \{ title: 'Integrações'/);
  const { pathToFileURL } = require('node:url');
  const M = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/menu.js')).href);
  assert.equal(M.grupoDa('integracoes').id, 'conta', 'mora na conta, como a Equipe');
  assert.equal(M.paginaDoIr('integracoes'), 'integracoes');
  assert.match(ler('web/src/components/layout/Topbar.jsx'), /\['integracoes', 'Integrações', PlugZap\]/);
  assert.match(ler('web/src/pages/BibliotecaPage.jsx'), /id: 'integracoes', nome: 'Pasta da rede e intranet'/);
  const p = ler('web/src/pages/IntegracoesPage.jsx');
  assert.match(p, /Copie agora: por segurança, ele não aparece de novo/);
  assert.match(p, /\/conector\/MultiTelasConector\.zip/);
  assert.match(p, /Como instalar o Conector/);
  assert.match(p, /API para a intranet/);
  assert.match(p, /curl -X PUT/);
  assert.match(p, /Precisa de aprovação/);
  assert.doesNotMatch(p, /window\.(confirm|prompt|alert)/);
  // O instalador é servido como arquivo público (só ele, e não a pasta inteira).
  assert.match(ler('server.js'), /'\/conector\/MultiTelasConector\.zip',/);
  // A documentação existe, em português, com o curl.
  const doc = ler('docs/INTEGRACOES.md');
  for (const trecho of ['GET /conector', 'PUT /pastas/:chave/arquivos/:nome', 'PUT /planilhas/:chave', 'PUT /comunicados/:idExterno', 'Salve os slides como imagem', '120 pedidos por minuto', 'curl -X PUT']) {
    assert.ok(doc.includes(trecho), 'a documentação não tem ' + trecho);
  }
});
