/*
 * O Conector MultiTelas (conector/): o programa que roda num PC do cliente e
 * leva a pasta de rede do RH, a planilha e o feed da intranet para o
 * MultiTelas — o servidor na nuvem não alcança nada disso.
 *
 * Tudo aqui roda contra um servidor FALSO (porta 6170–6179) que implementa o
 * contrato da API do conector (/api/v1/...) e uma "intranet" falsa no mesmo
 * servidor, com pastas temporárias no lugar do compartilhamento. A conversão
 * de PowerPoint/PDF em imagens usa um conversor falso: a de verdade só roda
 * no Windows (e lá precisa ser validada).
 */
'use strict';
const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const C = (m) => require(path.join(RAIZ, 'conector', 'src', m));
const { criarLog } = C('log.js');
const { caminhos, carregarConfig, chaveValida } = C('config.js');
const { carregarEstado } = C('estado.js');
const { criarRede, hostPermitido, ambienteDoProxy, lerRetryAfter, baixarDaIntranet, criarApi, TokenRevogado } = C('rede.js');
const { ciclo, rodar, intervaloDe, MENSAGEM_401 } = C('sincronizar.js');
const P = C('pastas.js');
const F = C('feeds.js');
const X = C('xlsx.js');
const CV = C('conversor.js');
const { principal } = C('main.js');
const VERSAO = require(path.join(RAIZ, 'conector', 'package.json')).version;

const TOKEN = 'mt_conector_teste_9f8e7d6c5b4a3210';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('JFIF-festa')]);

/* ---------------- o servidor falso (contrato da API) ---------------- */

function servidorFalso() {
  const s = { token: TOKEN, porta: 0 };
  s.reset = (plano) => {
    s.token = TOKEN;
    s.plano = plano;
    s.pastas = {};
    s.planilhas = {};
    s.comunicados = new Map();
    s.pedidos = [];
    s.intranetPedidos = [];
    s.forcar = [];
    s.intranet = {};
    s.limite = 0;
  };
  s.reset(null);
  s.url = () => 'http://127.0.0.1:' + s.porta;
  s.pasta = (chave) => s.pastas[chave] || (s.pastas[chave] = new Map());
  s.escritas = () => s.pedidos.filter((p) => p.metodo === 'PUT' || p.metodo === 'DELETE');

  const json = (res, status, corpo, cab) => { res.writeHead(status, Object.assign({ 'content-type': 'application/json' }, cab || {})); res.end(JSON.stringify(corpo)); };
  function responder(req, res, corpo) {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/intranet/')) {
      s.intranetPedidos.push({ caminho: u.pathname, auth: req.headers.authorization || '', cab: req.headers });
      const r = s.intranet[u.pathname];
      if (!r) { res.writeHead(404); return res.end('nada'); }
      res.writeHead(r.status || 200, Object.assign({ 'content-type': r.tipo || 'application/octet-stream' }, r.cabecalhos || {}));
      return res.end(r.corpo);
    }
    // Cada segmento decodificado: "sub%2Fb.png" volta a ser "sub/b.png", como no Express.
    const seg = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    s.pedidos.push({ metodo: req.method, caminho: u.pathname, seg, cab: req.headers, tamanho: corpo.length });
    const f = s.forcar.find((x) => x.vezes > 0 && (!x.metodo || x.metodo === req.method) && (!x.caminho || x.caminho.test(u.pathname)));
    if (f) { f.vezes--; return json(res, f.status, f.corpo || { error: 'forçado pelo teste', code: 'teste' }, f.cabecalhos); }
    if (req.headers.authorization !== 'Bearer ' + s.token) return json(res, 401, { error: 'token inválido', code: 'token' });
    if (seg[0] !== 'api' || seg[1] !== 'v1') return json(res, 404, { error: 'rota', code: 'rota' });
    const [, , rec, chave, sub, nome] = seg;
    if (req.method === 'GET' && rec === 'conector' && seg.length === 3) {
      if (!req.headers['x-conector-versao'] || !req.headers['x-conector-maquina']) return json(res, 400, { error: 'faltam os cabeçalhos do conector', code: 'cabecalho' });
      return json(res, 200, s.plano);
    }
    if (rec === 'pastas' && seg.length === 4 && req.method === 'GET') {
      return json(res, 200, { arquivos: [...s.pasta(chave)].map(([n, a]) => ({ nome: n, sha256: a.sha256, tamanho: a.bytes.length, em: a.em })) });
    }
    if (rec === 'pastas' && sub === 'arquivos' && seg.length === 6) {
      const pasta = s.pasta(chave);
      if (req.method === 'PUT') {
        if (/\.(pdf|pptx?)$/i.test(nome)) return json(res, 415, { error: 'PDF e PowerPoint não tocam na TV', code: 'tipo' });
        if (sha(corpo) !== req.headers['x-sha256']) return json(res, 400, { error: 'sha256 não confere', code: 'sha' });
        if (Number(req.headers['content-length']) !== corpo.length) return json(res, 400, { error: 'tamanho não confere', code: 'tamanho' });
        if (s.limite && corpo.length > s.limite) return json(res, 413, { error: 'arquivo maior que o permitido no plano', code: 'grande' });
        pasta.set(nome, { bytes: corpo, sha256: sha(corpo), tipo: req.headers['content-type'], em: Date.now() });
        return json(res, 200, { ok: true, nome, sha256: sha(corpo) });
      }
      if (req.method === 'DELETE') return pasta.delete(nome) ? json(res, 200, { ok: true }) : json(res, 404, { error: 'não existe', code: 'nao-existe' });
    }
    if (rec === 'planilhas' && seg.length === 4 && req.method === 'PUT') {
      s.planilhas[chave] = { csv: corpo.toString('utf8'), tipo: req.headers['content-type'] };
      return json(res, 200, { ok: true });
    }
    if (rec === 'comunicados' && seg.length === 4) {
      if (req.method === 'PUT') { s.comunicados.set(chave, JSON.parse(corpo.toString('utf8'))); return json(res, 200, { ok: true }); }
      if (req.method === 'DELETE') { s.comunicados.delete(chave); return json(res, 200, { ok: true }); }
    }
    return json(res, 404, { error: 'rota desconhecida', code: 'rota' });
  }
  const srv = http.createServer((req, res) => {
    const partes = [];
    req.on('data', (d) => partes.push(d));
    req.on('end', () => responder(req, res, Buffer.concat(partes)));
  });
  s.srv = srv;
  s.fechar = () => new Promise((r) => { srv.closeAllConnections(); srv.close(r); });
  return s;
}

// A primeira porta livre de 6170–6179 (a faixa reservada a este teste).
async function ouvirNaFaixa(servidor, ocupadas = []) {
  for (let p = 6170; p <= 6179; p++) {
    if (ocupadas.includes(p)) continue;
    try {
      await new Promise((ok, falha) => {
        servidor.once('error', falha);
        servidor.listen(p, '127.0.0.1', () => { servidor.off('error', falha); ok(); });
      });
      return p;
    } catch (e) { if (e.code !== 'EADDRINUSE') throw e; }
  }
  throw new Error('as portas 6170–6179 estão todas ocupadas');
}

let srv;
before(async () => { srv = servidorFalso(); srv.porta = await ouvirNaFaixa(srv.srv); });
after(() => srv.fechar());

const PLANO = () => ({
  conta: { nome: 'Empresa Teste' },
  integracao: { nome: 'Conector RH' },
  pastas: [{ chave: 'comunicacao', nome: 'Comunicação' }],
  planilhas: [],
  feeds: [],
  intervaloSegundos: 60,
});

function escrever(dir, nome, conteudo, idadeSegundos = 120) {
  const p = path.join(dir, ...nome.split('/'));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, conteudo);
  if (idadeSegundos != null) { const t = new Date(Date.now() - idadeSegundos * 1000); fs.utimesSync(p, t, t); }
  return p;
}

function conversorFalso(paginas = 3) {
  const c = {
    chamadas: [],
    paginas,
    indisponivel: false,
    async converter(tipo, entrada, saida) {
      c.chamadas.push({ tipo, entrada });
      if (c.indisponivel) throw new CV.ConversorIndisponivel('o PowerPoint não está instalado ou não abre com a conta do conector');
      const conteudo = fs.readFileSync(entrada);
      const n = typeof c.paginas === 'function' ? c.paginas(tipo, conteudo) : c.paginas;
      const out = [];
      for (let i = 1; i <= n; i++) {
        const p = path.join(saida, String(i).padStart(2, '0') + '.png');
        fs.writeFileSync(p, Buffer.concat([PNG, Buffer.from(tipo + ':' + sha(conteudo) + ':' + i)]));
        out.push(p);
      }
      return { paginas: out };
    },
  };
  return c;
}

function montar({ plano, config, arquivos } = {}) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conector-'));
  const base = path.join(raiz, 'conector');
  const share = path.join(raiz, 'share');
  fs.mkdirSync(base);
  fs.mkdirSync(share);
  for (const [n, c] of Object.entries(arquivos || {})) escrever(share, n, c);
  srv.reset(plano || PLANO());
  const m = { raiz, base, share, esperas: [] };
  m.cfg = Object.assign({ servidor: srv.url(), token: TOKEN, pastas: { comunicacao: share }, segundosParaEstabilizar: 2 }, config || {});
  m.gravarConfig = (mais) => { Object.assign(m.cfg, mais || {}); fs.writeFileSync(path.join(base, 'conector.json'), JSON.stringify(m.cfg, null, 2)); };
  m.gravarConfig();
  const log = criarLog({ arquivo: path.join(base, 'conector.log'), naTela: false });
  m.log = log;
  m.conversor = conversorFalso();
  m.ctx = {
    base, caminhos: caminhos(base), log, versao: VERSAO, maquina: 'PC-TESTE', env: {},
    estado: carregarEstado(path.join(base, 'estado.json')), rede: criarRede(log),
    esperar: async (ms) => { m.esperas.push(ms); }, enviadasNesteProcesso: new Set(), conversor: m.conversor,
  };
  m.textoDoLog = () => { try { return fs.readFileSync(path.join(base, 'conector.log'), 'utf8'); } catch (e) { return ''; } };
  m.limpar = () => {
    // Nada do que o conector grava pode ter o token.
    for (const arq of ['conector.log', 'estado.json']) {
      const p = path.join(base, arq);
      if (fs.existsSync(p)) assert.ok(!fs.readFileSync(p, 'utf8').includes(TOKEN), 'o token apareceu em ' + arq);
    }
    fs.rmSync(raiz, { recursive: true, force: true });
  };
  return m;
}

const nomes = (chave) => [...srv.pasta(chave).keys()].sort();

/* ---------------- handshake ---------------- */

test('handshake: o GET /api/v1/conector leva token, versão e máquina; o plano e o intervalo voltam', async () => {
  const m = montar({ plano: Object.assign(PLANO(), { pastas: [], intervaloSegundos: 5 }) });
  const r = await ciclo(m.ctx);
  const p = srv.pedidos.find((x) => x.caminho === '/api/v1/conector');
  assert.equal(p.metodo, 'GET');
  assert.equal(p.cab.authorization, 'Bearer ' + TOKEN);
  assert.equal(p.cab['x-conector-versao'], VERSAO);
  assert.equal(p.cab['x-conector-maquina'], 'PC-TESTE');
  assert.equal(r.intervalo, 15, 'intervalo absurdo de pequeno não pode martelar o servidor');
  assert.deepEqual([intervaloDe({}), intervaloDe({ intervaloSegundos: 120 }), intervaloDe({ intervaloSegundos: 99999 })], [60, 120, 3600]);
  assert.equal(m.ctx.estado.servidor.conta, 'Empresa Teste');
  assert.equal(m.ctx.estado.servidor.integracao, 'Conector RH');
  // O conector nunca escolhe TV: nenhum pedido além do handshake sem fontes.
  assert.deepEqual(srv.pedidos.map((x) => x.caminho), ['/api/v1/conector']);
  m.limpar();
});

test('a configuração: BOM do Bloco de Notas, barra invertida esquecida, token pela variável, só HTTPS', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conector-cfg-'));
  fs.writeFileSync(path.join(dir, 'conector.json'), '\uFEFF{"servidor": "https://app.multitelas.net.br/", "token": "abc123456789", "pastas": {"tv": "\\\\\\\\srv\\\\TV"}}');
  const l = carregarConfig(dir, {});
  assert.equal(l.cfg.servidor, 'https://app.multitelas.net.br');
  assert.equal(l.cfg.pastas.tv, '\\\\srv\\TV');
  assert.deepEqual(l.problemas, []);
  assert.equal(carregarConfig(dir, { MULTITELAS_TOKEN: 'doambiente123' }).cfg.token, 'doambiente123');
  assert.equal(carregarConfig(dir, { MULTITELAS_TOKEN: 'doambiente123' }).origemToken, 'variável MULTITELAS_TOKEN');
  fs.writeFileSync(path.join(dir, 'conector.json'), '{"pastas": {"tv": "\\\\srv\\TV"}}');
  assert.throws(() => carregarConfig(dir, {}), /cada \\ do caminho do Windows vai dobrado/);
  fs.writeFileSync(path.join(dir, 'conector.json'), '{"servidor": "http://app.multitelas.net.br", "token": "x y", "pastas": {"_feed-x": "C:\\\\a"}}');
  const ruim = carregarConfig(dir, {}).problemas.join(' | ');
  assert.match(ruim, /https:\/\//);
  assert.match(ruim, /espaço no meio/);
  assert.match(ruim, /"_feed-x".*não é válida/);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ---------------- pastas ---------------- */

test('primeiro envio: os arquivos da pasta (e das subpastas) sobem com sha256 e tipo; temporários e ocultos não', async () => {
  const m = montar({
    arquivos: {
      'aviso.jpg': 'foto-1',
      'sub/b.png': Buffer.concat([PNG, Buffer.from('b')]),
      'Vídeos/institucional.mp4': 'mp4-bytes',
      '~$Reunião.xlsx': 'dono do arquivo aberto',
      'Thumbs.db': 'miniaturas',
      '.DS_Store': 'mac',
      'desktop.ini': 'ini',
      'notas.txt': 'texto',
      'video.mp4.part': 'baixando',
      'copia.tmp': 'temp',
    },
  });
  const r = await ciclo(m.ctx);
  assert.deepEqual(nomes('comunicacao'), ['Vídeos/institucional.mp4', 'aviso.jpg', 'sub/b.png']);
  const puts = srv.pedidos.filter((p) => p.metodo === 'PUT');
  assert.equal(puts.length, 3);
  const b = puts.find((p) => p.seg[5] === 'sub/b.png');
  assert.ok(b.caminho.endsWith('/arquivos/sub%2Fb.png'), 'o nome com subpasta vai codificado num segmento só: ' + b.caminho);
  assert.equal(b.cab['content-type'], 'image/png');
  assert.equal(b.cab['x-sha256'], sha(Buffer.concat([PNG, Buffer.from('b')])));
  assert.equal(srv.pasta('comunicacao').get('Vídeos/institucional.mp4').tipo, 'video/mp4');
  const ignorados = r.resultados.pastas.comunicacao.ignorados.map((i) => i.nome).sort();
  assert.deepEqual(ignorados, ['.DS_Store', 'Thumbs.db', 'copia.tmp', 'desktop.ini', 'notas.txt', 'video.mp4.part', '~$Reunião.xlsx']);
  assert.match(m.textoDoLog(), /Pasta "Comunicação": enviado "aviso\.jpg"\./);
  // Segundo ciclo sem mudança: só o handshake e a listagem, nenhum envio.
  srv.pedidos.length = 0;
  await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), []);
  m.limpar();
});

test('mudou um arquivo: só ele sobe de novo (o hash dos outros vem do estado, sem reler)', async () => {
  const m = montar({ arquivos: { 'a.jpg': 'versão 1', 'b.jpg': 'fixo', 'c.webp': 'fixo também' } });
  await ciclo(m.ctx);
  srv.pedidos.length = 0;
  escrever(m.share, 'a.jpg', 'versão 2, maior', 60);
  // Mudou desde a última leitura: espera uma leitura com o arquivo parado (pode ser uma cópia em andamento).
  await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), []);
  await ciclo(m.ctx);
  const puts = srv.pedidos.filter((p) => p.metodo === 'PUT');
  assert.deepEqual(puts.map((p) => p.seg[5]), ['a.jpg']);
  assert.equal(srv.pasta('comunicacao').get('a.jpg').bytes.toString(), 'versão 2, maior');
  // O estado guardou os hashes por tamanho+data (reinício não relê vídeo inteiro).
  assert.equal(m.ctx.estado.pastas.comunicacao.hashes['b.jpg'].sha256, sha('fixo'));
  m.limpar();
});

test('apagou na pasta: sai do servidor só depois de sumir em duas leituras seguidas', async () => {
  const m = montar({ arquivos: { 'fica.jpg': 'x', 'sai.png': Buffer.concat([PNG, Buffer.from('sai')]) } });
  await ciclo(m.ctx);
  fs.rmSync(path.join(m.share, 'sai.png'));
  srv.pedidos.length = 0;
  const r1 = await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), [], 'apagou na primeira leitura (o "salvar" do Office some com o arquivo por um instante)');
  assert.ok(r1.fila.some((f) => f.nome === 'sai.png' && /sumiu da pasta/.test(f.motivo)));
  await ciclo(m.ctx);
  assert.deepEqual(srv.escritas().map((p) => [p.metodo, p.seg[5]]), [['DELETE', 'sai.png']]);
  assert.deepEqual(nomes('comunicacao'), ['fica.jpg']);
  // Voltou antes da segunda leitura? Não apaga.
  fs.rmSync(path.join(m.share, 'fica.jpg'));
  await ciclo(m.ctx);
  escrever(m.share, 'fica.jpg', 'x');
  srv.pedidos.length = 0;
  await ciclo(m.ctx);
  await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), []);
  assert.deepEqual(nomes('comunicacao'), ['fica.jpg']);
  m.limpar();
});

test('compartilhamento fora do ar: nada é enviado nem apagado, e o log diz uma vez só', async () => {
  const m = montar({ arquivos: { 'a.jpg': '1', 'b.jpg': '2', 'c.jpg': '3' } });
  await ciclo(m.ctx);
  assert.equal(nomes('comunicacao').length, 3);
  fs.renameSync(m.share, m.share + '-fora');
  srv.pedidos.length = 0;
  for (let i = 0; i < 4; i++) await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), [], 'mexeu no servidor com a pasta fora do ar');
  assert.ok(!srv.pedidos.some((p) => p.caminho === '/api/v1/pastas/comunicacao'), 'nem precisava listar o servidor');
  assert.equal(nomes('comunicacao').length, 3);
  const f = m.ctx.estado.fontes['pasta:comunicacao'];
  assert.match(f.ultimoErro, /não existe ou o servidor não respondeu/);
  assert.equal(m.textoDoLog().split('Nada foi enviado nem apagado').length - 1, 1, 'o mesmo erro a cada minuto encheria o log');
  fs.renameSync(m.share + '-fora', m.share);
  await ciclo(m.ctx);
  assert.match(m.textoDoLog(), /Pasta "Comunicação" voltou a abrir\./);
  assert.equal(nomes('comunicacao').length, 3);
  assert.equal(m.ctx.estado.fontes['pasta:comunicacao'].ultimoErro, '');
  m.limpar();
});

test('arquivo pela metade, vazio ou grande demais não sobe; quando assenta, sobe', async () => {
  const m = montar({ config: { tamanhoMaximoMB: 1 }, arquivos: { 'pronto.jpg': 'ok' } });
  let avanco = 0;
  m.ctx.agora = () => Date.now() + avanco;
  escrever(m.share, 'copiando.mp4', 'metade', null); // data de agora: ainda sendo copiado
  escrever(m.share, 'vazio.jpg', '', 300);
  escrever(m.share, 'enorme.mp4', Buffer.alloc(1536 * 1024, 1), 300);
  const r1 = await ciclo(m.ctx);
  assert.deepEqual(nomes('comunicacao'), ['pronto.jpg']);
  const fila = r1.resultados.pastas.comunicacao.fila;
  assert.ok(fila.some((f) => f.nome === 'copiando.mp4' && /terminar de ser copiado/.test(f.motivo)));
  assert.ok(fila.some((f) => f.nome === 'vazio.jpg'));
  assert.match(m.textoDoLog(), /"enorme\.mp4" tem 1,5 MB, acima do limite de 1 MB, e NÃO foi enviado/);
  // A cópia continua (cresceu) — mesmo com a data antiga que o Windows põe no fim, espera mais uma leitura.
  escrever(m.share, 'copiando.mp4', 'metade e mais a outra metade', 300);
  await ciclo(m.ctx);
  assert.ok(!srv.pasta('comunicacao').has('copiando.mp4'), 'subiu um arquivo que acabou de mudar');
  avanco = 5000;
  await ciclo(m.ctx);
  assert.equal(srv.pasta('comunicacao').get('copiando.mp4').bytes.toString(), 'metade e mais a outra metade');
  assert.ok(!srv.pasta('comunicacao').has('enorme.mp4'));
  assert.equal(m.textoDoLog().split('enorme.mp4" tem').length - 1, 1, 'o aviso do tamanho se repetiu a cada ciclo');
  m.limpar();
});

test('o servidor recusou o arquivo (413): não reenvia o mesmo a cada minuto', async () => {
  const m = montar({ arquivos: { 'grande.mp4': 'x'.repeat(5000), 'ok.jpg': 'y' } });
  srv.limite = 1000;
  await ciclo(m.ctx);
  assert.deepEqual(nomes('comunicacao'), ['ok.jpg']);
  assert.match(m.textoDoLog(), /o servidor recusou "grande\.mp4" \(413\): arquivo maior que o permitido no plano/);
  srv.pedidos.length = 0;
  await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), []);
  m.limpar();
});

/* ---------------- PowerPoint e PDF viram imagens ---------------- */

test('PowerPoint e PDF: viram uma imagem por slide/página ("Apresentacao.pptx/01.png"); o arquivo cru nunca sobe', async () => {
  const m = montar({ arquivos: { 'Apresentacao.pptx': 'slides v1', 'docs/Manual.pdf': 'pdf v1', 'foto.jpg': 'f' } });
  m.conversor.paginas = (tipo) => (tipo === 'pdf' ? 2 : 3);
  await ciclo(m.ctx);
  assert.deepEqual(nomes('comunicacao'), ['Apresentacao.pptx/01.png', 'Apresentacao.pptx/02.png', 'Apresentacao.pptx/03.png', 'docs/Manual.pdf/01.png', 'docs/Manual.pdf/02.png', 'foto.jpg']);
  assert.ok(!srv.pedidos.some((p) => /\.(pdf|pptx)$/.test(p.seg[5] || '')), 'mandou PDF/PPTX cru');
  assert.equal(srv.pasta('comunicacao').get('Apresentacao.pptx/02.png').tipo, 'image/png');
  assert.deepEqual(m.conversor.chamadas.map((c) => c.tipo).sort(), ['pdf', 'pptx']);
  assert.ok(m.conversor.chamadas.every((c) => c.entrada.startsWith(path.join(m.base, 'convertidos'))), 'converteu direto do compartilhamento, sem cópia local');

  // Sem mudança: não abre o PowerPoint de novo, não envia nada.
  srv.pedidos.length = 0;
  await ciclo(m.ctx);
  assert.equal(m.conversor.chamadas.length, 2);
  assert.deepEqual(srv.escritas(), []);

  // A apresentação mudou e ficou com 2 slides: reconverte, reenvia, e o slide 3 sai (na 2ª leitura).
  m.conversor.paginas = (tipo) => (tipo === 'pdf' ? 2 : 2);
  escrever(m.share, 'Apresentacao.pptx', 'slides v2', 60);
  await ciclo(m.ctx); // mudou desde a última leitura: espera assentar
  assert.equal(m.conversor.chamadas.length, 2);
  await ciclo(m.ctx);
  assert.equal(m.conversor.chamadas.length, 3);
  assert.ok(srv.pasta('comunicacao').has('Apresentacao.pptx/03.png'));
  await ciclo(m.ctx);
  assert.deepEqual(nomes('comunicacao').filter((n) => n.startsWith('Apresentacao')), ['Apresentacao.pptx/01.png', 'Apresentacao.pptx/02.png']);
  assert.match(srv.pasta('comunicacao').get('Apresentacao.pptx/01.png').bytes.toString(), new RegExp(sha('slides v2')));

  // O PDF saiu da pasta: as páginas dele saem do servidor, e a cópia local também.
  fs.rmSync(path.join(m.share, 'docs', 'Manual.pdf'));
  await ciclo(m.ctx);
  await ciclo(m.ctx);
  assert.deepEqual(nomes('comunicacao').filter((n) => n.includes('Manual')), []);
  assert.deepEqual(Object.keys(m.ctx.estado.pastas.comunicacao.convertidos), ['Apresentacao.pptx']);
  assert.equal(fs.readdirSync(path.join(m.base, 'convertidos', 'comunicacao')).length, 1, 'sobrou cópia local de conversão antiga');
  m.limpar();
});

test('sem PowerPoint (ou PowerShell bloqueado): o arquivo fica de fora com recado ao RH, o resto sincroniza, e nada já enviado é apagado', async () => {
  const m = montar({ arquivos: { 'Treinamento.pptx': 'v1', 'foto.jpg': 'f' } });
  m.conversor.indisponivel = true;
  // Slides de uma conversão anterior (outra máquina) já estão lá.
  const velho = Buffer.concat([PNG, Buffer.from('antigo')]);
  srv.pasta('comunicacao').set('Treinamento.pptx/01.png', { bytes: velho, sha256: sha(velho), tipo: 'image/png', em: 1 });
  for (let i = 0; i < 3; i++) await ciclo(m.ctx);
  assert.deepEqual(nomes('comunicacao'), ['Treinamento.pptx/01.png', 'foto.jpg']);
  const log = m.textoDoLog();
  assert.match(log, /"Treinamento\.pptx" NÃO foi para a TV: o PowerPoint não está instalado/);
  assert.match(log, /salvar os slides como imagens/);
  assert.equal(log.split('"Treinamento.pptx" NÃO foi').length - 1, 1, 'o recado se repetiu a cada ciclo');
  assert.equal(m.conversor.chamadas.length, 1, 'tentou abrir o PowerPoint a cada minuto');
  m.limpar();
});

test('o conversor de verdade: PowerShell 5.1 por -EncodedCommand, caminho escapado, e o código de saída vira o recado certo', async () => {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-cv-'));
  await assert.rejects(CV.criarConversor({ plataforma: 'linux' }).converter('pptx', 'a.pptx', saida), (e) => e instanceof CV.ConversorIndisponivel && /só funciona no Windows/.test(e.message));
  const chamadas = [];
  let codigo = 0;
  const executar = async (arquivo, args) => {
    chamadas.push({ arquivo, args });
    if (codigo === 0) { fs.writeFileSync(path.join(saida, '10.png'), PNG); fs.writeFileSync(path.join(saida, '02.png'), PNG); fs.writeFileSync(path.join(saida, 'Thumbs.db'), 'x'); }
    return { codigo, stdout: '{"paginas":2}', stderr: codigo ? 'Retrieving the COM class factory failed: 80040154' : '' };
  };
  const cv = CV.criarConversor({ plataforma: 'win32', executar, env: { SystemRoot: 'C:\\Windows' } });
  const r = await cv.converter('pptx', "C:\\conector\\convertidos\\O'Brien.pptx", saida);
  assert.deepEqual(r.paginas.map((p) => path.basename(p)), ['02.png', '10.png'], 'a ordem das páginas é numérica');
  const { arquivo, args } = chamadas[0];
  assert.equal(arquivo, path.join('C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));
  assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
  const script = Buffer.from(args[4], 'base64').toString('utf16le');
  assert.match(script, /\$Entrada = 'C:\\conector\\convertidos\\O''Brien\.pptx'/);
  assert.match(script, /New-Object -ComObject PowerPoint\.Application/);
  assert.match(script, /\.Export\(/);
  assert.match(CV.scriptDe('pdf', 'a.pdf', 'b'), /Windows\.Data\.Pdf\.PdfDocument/);
  codigo = 3;
  await assert.rejects(cv.converter('pptx', 'x.pptx', saida), (e) => e instanceof CV.ConversorIndisponivel && /PowerPoint não está instalado/.test(e.message));
  codigo = 4;
  await assert.rejects(cv.converter('pdf', 'x.pdf', saida), (e) => e instanceof CV.ErroDeConversao);
  fs.rmSync(saida, { recursive: true, force: true });
});

/* ---------------- planilha ---------------- */

// Um .xlsx de verdade (ZIP com deflate), montado aqui — o mesmo jeito do teste de Pessoas.
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

const CARDAPIO = {
  'xl/workbook.xml': '<workbook xmlns:r="x"><sheets><sheet name="Cardápio" sheetId="1" r:id="rId7"/><sheet name="Outra" sheetId="2" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Type="worksheet" Target="worksheets/cardapio.xml"/></Relationships>',
  'xl/sharedStrings.xml': '<sst><si><t>Prato</t></si><si><t>Preço</t></si><si><t>Data</t></si><si><t>Arroz, feijão</t></si><si><r><t>Diz </t></r><r><t xml:space="preserve">"olá"</t></r></si><si><t>Disponível</t></si></sst>',
  'xl/styles.xml': '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy\\ hh:mm"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>',
  'xl/worksheets/cardapio.xml': '<worksheet><sheetData>'
    + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>5</v></c></row>'
    + '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>12.5</v></c><c r="C2" s="1"><v>46348</v></c><c r="D2" t="b"><v>1</v></c></row>'
    + '<row r="3"><c r="A3" t="inlineStr"><is><t>Peixe&#10;frito</t></is></c><c r="B3" t="str"><v>9,90</v></c><c r="C3" s="2"><v>46348.5</v></c><c r="D3" t="b"><v>0</v></c></row>'
    + '<row r="4"><c r="A4" t="s"><v>4</v></c><c r="C4"><f>SUM(B2:B3)</f><v>22.4</v></c></row>'
    + '<row r="9"><c r="A9" s="1"/></row>'
    + '</sheetData></worksheet>',
  'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>NÃO É ESTA</t></is></c></row></sheetData></worksheet>',
};

test('planilha: a primeira aba do .xlsx vira CSV (datas como no Excel, vírgula e aspas escapadas) e só sobe quando muda', async () => {
  const plano = Object.assign(PLANO(), { pastas: [], planilhas: [{ chave: 'cardapio', nome: 'Cardápio' }] });
  const m = montar({ plano });
  const arq = escrever(m.raiz, 'Cardapio.xlsx', zip(CARDAPIO));
  m.gravarConfig({ planilhas: { cardapio: arq } });
  await ciclo(m.ctx);
  const esperado = 'Prato,Preço,Data,Disponível\r\n'
    + '"Arroz, feijão",12.5,22/11/2026,VERDADEIRO\r\n'
    + '"Peixe\nfrito","9,90",22/11/2026 12:00,FALSO\r\n'
    + '"Diz ""olá""",,22.4,\r\n';
  assert.equal(srv.planilhas.cardapio.csv, esperado);
  assert.equal(srv.planilhas.cardapio.tipo, 'text/csv; charset=utf-8');
  srv.pedidos.length = 0;
  await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), [], 'reenviou a mesma planilha');
  // O Excel acabou de salvar (data de agora): espera ele terminar.
  escrever(m.raiz, 'Cardapio.xlsx', zip(Object.assign({}, CARDAPIO, { 'xl/sharedStrings.xml': CARDAPIO['xl/sharedStrings.xml'].replace('Arroz, feijão', 'Lasanha') })), null);
  await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), []);
  fs.utimesSync(arq, new Date(Date.now() - 60000), new Date(Date.now() - 60000));
  await ciclo(m.ctx);
  assert.match(srv.planilhas.cardapio.csv, /^Prato,Preço,Data,Disponível\r\nLasanha,12\.5/);

  // CSV do Excel brasileiro (Windows-1252) sobe como UTF-8; .xls antigo é recusado com recado.
  const csv = escrever(m.raiz, 'metas.csv', Buffer.from([...Buffer.from('setor;meta\nProdu'), 0xe7, 0xe3, ...Buffer.from('o;95%\n')]));
  m.gravarConfig({ planilhas: { cardapio: csv } });
  await ciclo(m.ctx);
  assert.equal(srv.planilhas.cardapio.csv, 'setor;meta\nProdução;95%\n');
  const xls = escrever(m.raiz, 'velha.xls', Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  m.gravarConfig({ planilhas: { cardapio: xls } });
  await ciclo(m.ctx);
  assert.match(m.textoDoLog(), /planilha \.xls antiga: no Excel, salve como \.xlsx/);
  assert.equal(srv.planilhas.cardapio.csv, 'setor;meta\nProdução;95%\n', 'a planilha que está na TV continua');
  // ZIP pela metade (o Excel ainda gravando) não sobe metade do cardápio.
  assert.throws(() => X.lerXlsx(zip(CARDAPIO).subarray(0, 200)), /danificado/);
  m.limpar();
});

/* ---------------- feeds da intranet ---------------- */

const rss = (itens) => '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Intranet</title>' + itens.join('') + '</channel></rss>';
const ITEM_FESTA = '<item><title>Festa de fim de ano</title><link>/intranet/noticias/1</link><guid>noticia-1</guid><pubDate>Mon, 23 Nov 2026 10:00:00 -0300</pubDate>'
  + '<description>&lt;p&gt;Dia 18, no refeit&amp;oacute;rio. &lt;b&gt;Traga&lt;/b&gt; a fam&amp;iacute;lia.&lt;/p&gt;</description><enclosure url="/intranet/img/festa.jpg" type="image/jpeg" length="14"/></item>';
const ITEM_VACINA = '<item><title>Vacinação</title><link>/intranet/noticias/2</link><guid>noticia-2</guid><description>Campanha na enfermaria.</description></item>';

test('RSS da intranet vira comunicado; a imagem sobe para "_feed-<chave>"; o item que sai do feed é apagado', async () => {
  const plano = Object.assign(PLANO(), { pastas: [], feeds: [{ chave: 'noticias', nome: 'Notícias', url: srv.url() + '/intranet/rss.xml', formato: 'rss' }] });
  const m = montar({ plano, config: { intranet: { hostsPermitidos: ['127.0.0.1'] } } });
  srv.intranet['/intranet/rss.xml'] = { tipo: 'application/rss+xml', corpo: rss([ITEM_FESTA, ITEM_VACINA]) };
  srv.intranet['/intranet/img/festa.jpg'] = { tipo: 'image/jpeg', corpo: JPEG };
  await ciclo(m.ctx);
  const idFesta = F.idDoItem('noticias', { guid: 'noticia-1' });
  const idVacina = F.idDoItem('noticias', { guid: 'noticia-2' });
  assert.deepEqual([...srv.comunicados.keys()].sort(), [idFesta, idVacina].sort());
  const festa = srv.comunicados.get(idFesta);
  const imagem = sha(JPEG).slice(0, 32) + '.jpg';
  assert.deepEqual(festa, {
    titulo: 'Festa de fim de ano',
    texto: 'Dia 18, no refeitório. Traga a família.',
    imagemUrl: 'pasta:_feed-noticias/' + imagem,
    inicio: '2026-11-23T13:00:00.000Z',
    link: srv.url() + '/intranet/noticias/1',
  });
  assert.deepEqual(nomes('_feed-noticias'), [imagem], 'a imagem não subiu para a pasta reservada');
  assert.equal(srv.comunicados.get(idVacina).imagemUrl, undefined);
  assert.ok(srv.intranetPedidos.every((p) => p.auth === ''), 'o token do MultiTelas foi para a intranet');
  assert.equal(F.idDoItem('noticias', { guid: 'noticia-1' }), idFesta, 'idExterno instável');
  assert.notEqual(F.idDoItem('outro-feed', { guid: 'noticia-1' }), idFesta, 'o mesmo guid em dois feeds colide');

  // Sem mudança no feed: nada é reenviado (nem a imagem baixada de novo).
  srv.pedidos.length = 0;
  srv.intranetPedidos.length = 0;
  await ciclo(m.ctx);
  assert.deepEqual(srv.escritas(), []);
  assert.deepEqual(srv.intranetPedidos.map((p) => p.caminho), ['/intranet/rss.xml']);

  // A intranet caiu (500) ou devolveu a página de login: nenhum comunicado sai.
  srv.intranet['/intranet/rss.xml'] = { status: 500, corpo: 'erro' };
  await ciclo(m.ctx);
  srv.intranet['/intranet/rss.xml'] = { tipo: 'text/html', corpo: '<html><body><form>Login da intranet</form></body></html>' };
  await ciclo(m.ctx);
  await ciclo(m.ctx);
  assert.equal(srv.comunicados.size, 2, 'feed fora do ar apagou comunicados');
  assert.match(m.textoDoLog(), /não é um feed RSS\/Atom \(é uma página de login ou de erro\?\)/);

  // A festa saiu do feed: sai das TVs na segunda leitura, e a imagem sai da pasta.
  srv.intranet['/intranet/rss.xml'] = { tipo: 'application/rss+xml', corpo: rss([ITEM_VACINA]) };
  await ciclo(m.ctx);
  assert.ok(srv.comunicados.has(idFesta));
  await ciclo(m.ctx);
  assert.deepEqual([...srv.comunicados.keys()], [idVacina]);
  assert.deepEqual(nomes('_feed-noticias'), []);
  assert.match(m.textoDoLog(), /"Festa de fim de ano" saiu do feed e foi tirado das TVs/);
  m.limpar();
});

test('Atom também; e o feed num host que o TI não liberou nem é lido', async () => {
  const atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Resultados &amp;amp; metas</title><id>tag:intranet,2026:7</id>'
    + '<link rel="alternate" href="/intranet/n/7"/><updated>2026-11-20T10:00:00Z</updated><summary>Batemos 95% da meta.</summary></entry></feed>';
  const plano = Object.assign(PLANO(), { pastas: [], feeds: [{ chave: 'rh', nome: 'RH', url: srv.url() + '/intranet/atom.xml', formato: 'rss' }, { chave: 'fora', nome: 'Fora', url: 'http://localhost:' + srv.porta + '/intranet/atom.xml', formato: 'rss' }] });
  const m = montar({ plano, config: { intranet: { hostsPermitidos: ['127.0.0.1'] } } });
  srv.intranet['/intranet/atom.xml'] = { tipo: 'application/atom+xml', corpo: atom };
  await ciclo(m.ctx);
  const c = srv.comunicados.get(F.idDoItem('rh', { guid: 'tag:intranet,2026:7' }));
  assert.deepEqual(c, { titulo: 'Resultados & metas', texto: 'Batemos 95% da meta.', inicio: '2026-11-20T10:00:00.000Z', link: srv.url() + '/intranet/n/7' });
  assert.equal(srv.comunicados.size, 1, 'leu o feed do host não liberado');
  assert.equal(srv.intranetPedidos.length, 1);
  assert.match(m.textoDoLog(), /host "localhost", que o conector não tem permissão de ler/);
  m.limpar();
});

test('feed JSON com "mapa": os caminhos dizem onde estão lista, título, texto, imagem, data e link', async () => {
  const mapa = { lista: 'dados.noticias', titulo: 'manchete', texto: 'corpo', imagem: 'foto.url', data: 'quando', link: 'endereco', id: 'codigo', destaque: 'fixo' };
  const plano = Object.assign(PLANO(), { pastas: [], feeds: [{ chave: 'portal', nome: 'Portal', url: srv.url() + '/intranet/api/noticias', formato: 'json', mapa }] });
  const m = montar({ plano, config: { intranet: { hostsPermitidos: ['127.0.0.1'] } } });
  const png = Buffer.concat([PNG, Buffer.from('foto-json')]);
  srv.intranet['/intranet/img/b.png'] = { tipo: 'image/png', corpo: png };
  srv.intranet['/intranet/img/virus.jpg'] = { tipo: 'image/jpeg', corpo: '<html>não sou imagem</html>' };
  srv.intranet['/intranet/api/noticias'] = {
    tipo: 'application/json',
    corpo: JSON.stringify({ dados: { noticias: [
      { codigo: 41, manchete: 'Nova cantina', corpo: '<p>Abre <b>segunda</b>.</p>', foto: { url: '/intranet/img/b.png' }, quando: '2026-11-20T10:00:00Z', endereco: '/intranet/n/41', fixo: 'sim' },
      { codigo: 42, manchete: 'Sem foto boa', corpo: 'Texto.', foto: { url: '/intranet/img/virus.jpg' }, endereco: 'javascript:alert(1)' },
      { codigo: 43 },
    ] } }),
  };
  await ciclo(m.ctx);
  const a = srv.comunicados.get(F.idDoItem('portal', { guid: '41' }));
  assert.deepEqual(a, { titulo: 'Nova cantina', texto: 'Abre segunda.', imagemUrl: 'pasta:_feed-portal/' + sha(png).slice(0, 32) + '.png', inicio: '2026-11-20T10:00:00.000Z', destaque: true, link: srv.url() + '/intranet/n/41' });
  const b = srv.comunicados.get(F.idDoItem('portal', { guid: '42' }));
  assert.deepEqual(b, { titulo: 'Sem foto boa', texto: 'Texto.', destaque: false }, 'link javascript: ou imagem que não é imagem passaram');
  assert.equal(srv.comunicados.size, 2, 'item sem título nem texto virou comunicado');
  assert.match(m.textoDoLog(), /não consegui usar a imagem .*virus\.jpg \(não é JPG, PNG nem WebP\)/);
  // Sem mapa: JSON Feed (jsonfeed.org) e o "value" do SharePoint.
  assert.deepEqual(F.itensDoJson(JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', items: [{ id: '1', title: 'A', content_text: 'b', url: 'http://intra/1' }] }), null, 'http://intra/').map((i) => [i.guid, i.titulo, i.texto, i.link]), [['1', 'A', 'b', 'http://intra/1']]);
  assert.deepEqual(F.itensDoJson(JSON.stringify({ value: [{ Id: 9, Title: 'Comunicado SP' }] }), null, 'http://sp/').map((i) => [i.guid, i.titulo]), [['9', 'Comunicado SP']]);
  assert.throws(() => F.itensDoJson('{"x": 1}', { lista: 'dados.itens' }, 'http://a/'), /não achei a lista de itens no JSON em "dados\.itens"/);
  m.limpar();
});

/* ---------------- 401 e 429 ---------------- */

test('401: o conector PARA, diz claramente que o token foi revogado e não insiste; token novo, volta sozinho', async () => {
  const m = montar({ arquivos: { 'a.jpg': 'a' } });
  srv.forcar.push({ status: 401, vezes: 99, corpo: { error: 'token revogado', code: 'token-revogado' } });
  Object.assign(m.ctx, { sono: { dormir: async () => {}, acordar() {} }, maxCiclos: 4, semVigias: true });
  await rodar(m.ctx);
  assert.equal(srv.pedidos.filter((p) => p.caminho === '/api/v1/conector').length, 1, 'insistiu com o token revogado');
  assert.deepEqual(srv.escritas(), []);
  assert.equal(m.ctx.estado.parado.motivo, 'token-revogado');
  const log = m.textoDoLog();
  assert.equal(log.split('recusou o token (401)').length - 1, 1);
  assert.match(log, /O conector PAROU de sincronizar/);
  assert.ok(log.includes(MENSAGEM_401), 'a mensagem do 401 não é a combinada');
  assert.match(log, /gere um token novo no painel/);
  const status = [];
  await principal(['status'], { base: m.base, env: {}, escrever: (t) => status.push(t) });
  assert.match(status.join('\n'), /\*\*\* PARADO: O servidor do MultiTelas recusou o token \(401\)/);
  // O TI trocou o token no conector.json: o próximo ciclo percebe e volta.
  srv.forcar.length = 0;
  srv.token = 'mt_token_novo_0123456789abcdef';
  m.gravarConfig({ token: srv.token });
  m.ctx.maxCiclos = 1;
  await rodar(m.ctx);
  assert.equal(m.ctx.estado.parado, null);
  assert.ok(srv.pasta('comunicacao').has('a.jpg'));
  assert.match(m.textoDoLog(), /Token novo aceito/);
  assert.ok(!m.textoDoLog().includes('mt_token_novo_0123456789abcdef'));
  m.limpar();
});

test('429 e 5xx: espera (Retry-After ou espera dobrando) e tenta de novo; sem resposta, para o ciclo sem apagar nada', async () => {
  const m = montar({ arquivos: { 'a.jpg': 'a' } });
  srv.forcar.push({ metodo: 'GET', caminho: /^\/api\/v1\/conector$/, status: 429, vezes: 2, cabecalhos: { 'retry-after': '3' }, corpo: { error: 'calma', code: 'limite' } });
  await ciclo(m.ctx);
  assert.deepEqual(m.esperas, [3000, 3000], 'não respeitou o Retry-After');
  assert.ok(srv.pasta('comunicacao').has('a.jpg'), 'depois da espera, o ciclo seguiu');
  assert.match(m.textoDoLog(), /O servidor respondeu 429 \(muitos pedidos\) em GET \/api\/v1\/conector\. Tento de novo em 3 s \(1ª tentativa de 5\)/);

  m.esperas.length = 0;
  m.ctx.opcoesApi = { esperaBaseMs: 100 };
  srv.forcar.push({ metodo: 'PUT', status: 503, vezes: 3 });
  escrever(m.share, 'b.jpg', 'b');
  await ciclo(m.ctx);
  assert.equal(m.esperas.length, 3);
  m.esperas.forEach((ms, i) => assert.ok(ms >= 100 * 2 ** i && ms <= 100 * 2 ** i * 1.2 + 1, 'espera ' + i + ' = ' + ms));
  assert.ok(srv.pasta('comunicacao').has('b.jpg'));

  // Cinco tentativas e nada: o ciclo para com erro; nada foi apagado.
  srv.forcar.push({ metodo: 'GET', caminho: /^\/api\/v1\/conector$/, status: 502, vezes: 5 });
  fs.rmSync(path.join(m.share, 'a.jpg'));
  await assert.rejects(ciclo(m.ctx), (e) => e.status === 502);
  assert.ok(srv.pasta('comunicacao').has('a.jpg'));
  assert.deepEqual([lerRetryAfter('2'), lerRetryAfter(''), lerRetryAfter('abc')], [2000, null, null]);
  assert.ok(lerRetryAfter(new Date(Date.now() + 5000).toUTCString()) > 3000);

  // 401 no meio de um envio também para tudo, na hora.
  const api = criarApi({ servidor: srv.url(), token: 'errado-123456', versao: VERSAO, maquina: 'x', esperar: async () => {} });
  await assert.rejects(api.handshake(), (e) => e instanceof TokenRevogado);
  // Queda de rede tenta de novo; certificado recusado (proxy que inspeciona HTTPS) não adianta repetir.
  const falhas = { rede: 0, cert: 0 };
  const esperasRede = [];
  const quedaDeRede = criarApi({ servidor: 'https://app.multitelas.net.br', token: TOKEN, versao: VERSAO, maquina: 'x', esperar: async (ms) => { esperasRede.push(ms); }, fetch: async () => { falhas.rede++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } }); } });
  await assert.rejects(quedaDeRede.handshake(), /a conexão com app\.multitelas\.net\.br caiu no meio/);
  const certificado = criarApi({ servidor: 'https://app.multitelas.net.br', token: TOKEN, versao: VERSAO, maquina: 'x', esperar: async () => {}, fetch: async () => { falhas.cert++; throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } }); } });
  await assert.rejects(certificado.handshake(), /certificado HTTPS de app\.multitelas\.net\.br não foi aceito .*"certificadoCA"/);
  assert.deepEqual(falhas, { rede: 5, cert: 1 });
  assert.equal(esperasRede.length, 4);
  m.limpar();
});

/* ---------------- segurança ---------------- */

test('segurança: atalho para fora da pasta não sobe, nome com ".." não passa, só os hosts liberados da intranet', async () => {
  const m = montar({ arquivos: { 'dentro.jpg': 'ok' } });
  const fora = path.join(m.raiz, 'segredos');
  escrever(fora, 'folha-de-pagamento.jpg', 'não pode sair');
  escrever(fora, 'sub/contrato.pdf', 'nem isto');
  fs.symlinkSync(path.join(fora, 'folha-de-pagamento.jpg'), path.join(m.share, 'atalho.jpg'));
  fs.symlinkSync(fora, path.join(m.share, 'pasta-atalho'), 'dir');
  fs.symlinkSync(path.join(m.share, 'dentro.jpg'), path.join(m.share, 'outro-nome.jpg'));
  fs.symlinkSync(m.share, path.join(m.share, 'circulo'), 'dir');
  fs.symlinkSync(path.join(m.raiz, 'nao-existe.jpg'), path.join(m.share, 'quebrado.jpg'));
  const r = await ciclo(m.ctx);
  assert.deepEqual(nomes('comunicacao'), ['dentro.jpg', 'outro-nome.jpg'], 'subiu algo de fora da pasta');
  assert.ok(![...srv.pasta('comunicacao').values()].some((a) => /não pode sair|nem isto/.test(a.bytes.toString())));
  const motivos = Object.fromEntries(r.resultados.pastas.comunicacao.ignorados.map((i) => [i.nome, i.motivo]));
  assert.match(motivos['atalho.jpg'], /aponta para fora da pasta/);
  assert.match(motivos['pasta-atalho'], /aponta para fora da pasta/);
  assert.match(motivos['quebrado.jpg'], /atalho quebrado/);
  assert.equal(m.conversor.chamadas.length, 0, 'converteu o PDF de fora da pasta');

  for (const ruim of ['../x.jpg', 'a/../../x.jpg', '/etc/passwd', 'C:\\Windows\\x.jpg', 'a\\b.jpg', 'a//b.jpg', 'a/./b.jpg', 'nul\u0000.jpg', 'a/b?.jpg', '']) assert.equal(P.nomeSeguro(ruim), false, ruim);
  for (const bom of ['a.jpg', 'Sub Pasta/Foto de Natal (1).jpg', 'Ações/coração.png']) assert.equal(P.nomeSeguro(bom), true, bom);
  assert.equal(P.dentro('/srv/tv', '/srv/tv/a.jpg'), true);
  assert.equal(P.dentro('/srv/tv', '/srv/tv-outra/a.jpg'), false, 'prefixo de nome não é "dentro"');
  assert.equal(P.dentro('/srv/tv', '/srv'), false);
  // A chave vem do servidor e vira URL: chave estranha é ignorada.
  for (const ruim of ['../../x', '_feed-x', 'a/b', '', 'x'.repeat(65)]) assert.equal(chaveValida(ruim), false, ruim);

  assert.equal(hostPermitido('intranet.empresa.local', ['intranet.empresa.local']), true);
  assert.equal(hostPermitido('INTRANET.empresa.local.', ['intranet.empresa.local']), true);
  assert.equal(hostPermitido('noticias.empresa.local', ['*.empresa.local']), true);
  assert.equal(hostPermitido('empresa.local.atacante.com', ['*.empresa.local']), false);
  assert.equal(hostPermitido('169.254.169.254', ['intranet.empresa.local']), false);
  srv.intranet['/intranet/pula'] = { status: 302, cabecalhos: { location: 'http://localhost:' + srv.porta + '/intranet/rss.xml' } };
  await assert.rejects(baixarDaIntranet(srv.url() + '/intranet/pula', { hostsPermitidos: ['127.0.0.1'] }), (e) => e.code === 'host-nao-permitido' && e.host === 'localhost');
  await assert.rejects(baixarDaIntranet('file:///etc/passwd', { hostsPermitidos: ['127.0.0.1'] }), /só leio endereços http/);
  await assert.rejects(baixarDaIntranet('http://usuario:senha@127.0.0.1/', { hostsPermitidos: ['127.0.0.1'] }), /usuário e senha embutidos/);
  srv.intranet['/intranet/grande'] = { tipo: 'application/rss+xml', corpo: Buffer.alloc(2 * 1024 * 1024, 32) };
  await assert.rejects(baixarDaIntranet(srv.url() + '/intranet/grande', { hostsPermitidos: ['127.0.0.1'], maxBytes: 1024 * 1024 }), /passou do limite/);
  // XML com entidade externa (XXE) e "billion laughs": a DTD é ignorada, nada é expandido.
  const xxe = '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd"><!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;">]><rss><channel><item><title>Oi &x; &b;</title></item></channel></rss>';
  assert.deepEqual(F.itensDoXml(xxe, 'http://a/').map((i) => i.titulo), ['Oi &x; &b;']);
  m.limpar();
});

test('o token nunca vai para o log: nem o registrado, nem num "Bearer" que escape, nem a senha do proxy', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conector-log-'));
  const arquivo = path.join(dir, 'conector.log');
  const log = criarLog({ arquivo, naTela: false, tamanhoMaximo: 600, arquivos: 2 });
  log.segredo(TOKEN);
  log.erro('o servidor devolveu: ' + TOKEN);
  log.erro('cabeçalho vazado: Authorization: Bearer outro_token_secreto_123');
  log.info('proxy http://joao:SenhaForte9@proxy.empresa.local:3128');
  for (let i = 0; i < 20; i++) log.info('linha ' + i + ' para girar o arquivo');
  const tudo = [arquivo, arquivo + '.1', arquivo + '.2'].filter((p) => fs.existsSync(p)).map((p) => fs.readFileSync(p, 'utf8')).join('\n') + log.linhas.join('\n');
  assert.ok(!tudo.includes(TOKEN));
  assert.ok(!tudo.includes('outro_token_secreto_123'));
  assert.ok(!tudo.includes('SenhaForte9'));
  assert.match(log.linhas.join('\n'), /devolveu: \*\*\*/);
  assert.match(log.linhas.join('\n'), /joao:\*\*\*@proxy/);
  assert.ok(!fs.existsSync(arquivo + '.3'), 'girou além do limite de arquivos');
  assert.ok(fs.statSync(arquivo).size <= 600 + 200);
  fs.rmSync(dir, { recursive: true, force: true });
});

/* ---------------- os comandos ---------------- */

test('testar: mostra o que sincronizaria e não envia, não apaga, não converte e não grava estado', async () => {
  const m = montar({ arquivos: { 'novo.jpg': 'n', 'Slides.pptx': 's' } });
  const sobra = Buffer.from('sobra');
  srv.pasta('comunicacao').set('antigo.jpg', { bytes: sobra, sha256: sha(sobra), em: 1 });
  m.gravarConfig({ ciclosParaApagar: 1 });
  const saida = [];
  const codigo = await principal(['testar'], { base: m.base, env: {}, escrever: (t) => saida.push(t), conversor: m.conversor, naTela: false });
  assert.equal(codigo, 0);
  const texto = saida.join('\n');
  assert.match(texto, /Servidor: OK — conta "Empresa Teste", integração "Conector RH"/);
  assert.match(texto, /enviaria \(2\):\n\s+- Slides\.pptx \(vira imagens, uma por slide\)\n\s+- novo\.jpg/);
  assert.match(texto, /apagaria no servidor \(1\):\n\s+- antigo\.jpg/);
  assert.deepEqual(srv.escritas(), []);
  assert.equal(m.conversor.chamadas.length, 0);
  assert.ok(!fs.existsSync(path.join(m.base, 'estado.json')));
  m.limpar();
});

test('status: versão, conta e último contato, cada fonte com a última sincronização, fila e erros — sem o token', async () => {
  const m = montar({ arquivos: { 'a.jpg': 'a' } });
  escrever(m.share, 'chegando.mp4', 'copiando', null);
  const codigo = await principal(['uma-vez'], { base: m.base, env: {}, escrever: () => {}, conversor: m.conversor, naTela: false });
  assert.equal(codigo, 0);
  const saida = [];
  await principal(['status'], { base: m.base, env: {}, escrever: (t) => saida.push(t) });
  const texto = saida.join('\n');
  assert.match(texto, new RegExp('^MultiTelas Conector ' + VERSAO.replace(/\./g, '\\.')));
  assert.match(texto, /Token: configurado \(arquivo\)/);
  assert.match(texto, /Último contato com o servidor: \d\d\/\d\d\/\d{4} \d\d:\d\d \(há \d+ s\) — conta "Empresa Teste", integração "Conector RH", ciclo a cada 60 s/);
  assert.match(texto, /Pasta "Comunicação" \(chave comunicacao\) — .*share\n\s+última sincronização: .*1 enviado\(s\), 0 apagado\(s\), 1 na fila/);
  assert.match(texto, /Fila \(1\):\n\s+- pasta:comunicacao: chegando\.mp4 — esperando terminar de ser copiado/);
  assert.match(texto, /Erros recentes \(0\): nenhum/);
  assert.match(texto, /Rodando agora: NÃO/);
  assert.ok(!texto.includes(TOKEN));
  for (const c of ['versao', 'ajuda']) {
    const s = [];
    assert.equal(await principal([c], { base: m.base, escrever: (t) => s.push(t) }), 0);
    assert.match(s.join('\n'), c === 'versao' ? new RegExp('^' + VERSAO.replace(/\./g, '\\.') + '$') : /configurar\s+pergunta o servidor/);
  }
  m.limpar();
});

test('configurar: pergunta servidor, token e caminhos, testa a conexão e as pastas, libera os hosts dos feeds', async () => {
  const plano = Object.assign(PLANO(), {
    planilhas: [{ chave: 'cardapio', nome: 'Cardápio' }],
    feeds: [{ chave: 'noticias', nome: 'Notícias', url: 'http://intranet.empresa.local/rss', formato: 'rss' }],
  });
  const m = montar({ plano, arquivos: { 'a.jpg': 'a', 'b.png': 'b' } });
  fs.rmSync(path.join(m.base, 'conector.json'));
  const planilha = escrever(m.raiz, 'Cardapio.xlsx', zip(CARDAPIO));
  const respostas = [srv.url(), TOKEN, '', m.share, planilha];
  const saida = [];
  const perguntas = {
    escrever: (t) => saida.push(t),
    perguntar: async (t, padrao) => { saida.push('? ' + t); const r = respostas.shift(); return r || padrao || ''; },
    segredo: async () => respostas.shift(),
    simNao: async (t) => { saida.push('? ' + t); return true; },
    fechar() {},
  };
  const codigo = await principal(['configurar'], { base: m.base, env: {}, perguntas });
  assert.equal(codigo, 0, saida.join('\n'));
  const cfg = JSON.parse(fs.readFileSync(path.join(m.base, 'conector.json'), 'utf8'));
  assert.deepEqual(cfg, { servidor: srv.url(), token: TOKEN, pastas: { comunicacao: m.share }, planilhas: { cardapio: planilha }, intranet: { hostsPermitidos: ['intranet.empresa.local'] } });
  const texto = saida.join('\n');
  assert.match(texto, /OK: conta "Empresa Teste", integração "Conector RH"/);
  assert.match(texto, /OK: 2 arquivo\(s\) para a TV/);
  assert.match(texto, /OK: 4 linha\(s\)/);
  assert.match(texto, /Liberar a leitura de intranet\.empresa\.local/);
  assert.ok(!texto.includes(TOKEN), 'o token apareceu na tela');
  // Token pela variável de ambiente: não vai para o arquivo.
  const resp2 = [srv.url(), '', m.share, planilha];
  const p2 = Object.assign({}, perguntas, { perguntar: async (t, padrao) => resp2.shift() || padrao || '', segredo: async () => { throw new Error('não devia pedir o token'); } });
  assert.equal(await principal(['configurar'], { base: m.base, env: { MULTITELAS_TOKEN: TOKEN }, perguntas: p2 }), 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.base, 'conector.json'), 'utf8')).token, TOKEN, 'o token do arquivo foi perdido');
  m.limpar();
});

/* ---------------- proxy e empacotamento ---------------- */

test('proxy: HTTPS_PROXY/HTTP_PROXY ou "proxy" do conector.json; a intranet não passa pelo proxy', async () => {
  assert.equal(ambienteDoProxy({ intranet: { hostsPermitidos: [] } }, {}), null);
  assert.deepEqual(ambienteDoProxy({ proxy: 'http://proxy.empresa:3128', semProxy: '.empresa.local', intranet: { hostsPermitidos: ['intranet.empresa.local', '*.rh.local'] } }, { NO_PROXY: 'localhost,10.0.0.0/8' }),
    { HTTPS_PROXY: 'http://proxy.empresa:3128', HTTP_PROXY: 'http://proxy.empresa:3128', NO_PROXY: 'localhost,10.0.0.0/8,.empresa.local,127.0.0.1,::1,intranet.empresa.local,*.rh.local' });
  assert.equal(ambienteDoProxy({ intranet: { hostsPermitidos: ['intranet'], usarProxy: true } }, { HTTPS_PROXY: 'http://p:1' }).NO_PROXY, 'localhost,127.0.0.1,::1');

  // De verdade: outro processo do conector, com HTTP_PROXY apontando para um proxy falso.
  const vistos = [];
  const proxy = http.createServer((req, res) => {
    vistos.push(req.method + ' ' + req.url);
    const u = new URL(req.url);
    const ida = http.request({ host: '127.0.0.1', port: srv.porta, path: u.pathname + u.search, method: req.method, headers: req.headers }, (volta) => { res.writeHead(volta.statusCode, volta.headers); volta.pipe(res); });
    req.pipe(ida);
  });
  proxy.on('connect', (req, cliente, cabeca) => {
    vistos.push('CONNECT ' + req.url);
    const s = net.connect(srv.porta, '127.0.0.1', () => { cliente.write('HTTP/1.1 200 Connection Established\r\n\r\n'); s.write(cabeca); s.pipe(cliente); cliente.pipe(s); });
    s.on('error', () => cliente.destroy());
    cliente.on('error', () => s.destroy());
  });
  const portaProxy = await ouvirNaFaixa(proxy, [srv.porta]);
  const m = montar({ plano: Object.assign(PLANO(), { pastas: [] }) });
  // 127.0.0.2: loopback que não está no "sem proxy" padrão (localhost, 127.0.0.1).
  m.gravarConfig({ servidor: 'http://127.0.0.2:' + srv.porta, pastas: {} });
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!/^(https?|no|all)_proxy$/i.test(k) && k !== 'NODE_USE_ENV_PROXY') env[k] = v;
  Object.assign(env, { HTTP_PROXY: 'http://127.0.0.1:' + portaProxy, NODE_USE_ENV_PROXY: '1' });
  const filho = spawn(process.execPath, [path.join(RAIZ, 'conector', 'src', 'main.js'), 'uma-vez', '--pasta', m.base], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let saida = '';
  filho.stdout.on('data', (d) => { saida += d; });
  filho.stderr.on('data', (d) => { saida += d; });
  const codigo = await new Promise((r) => filho.on('close', r));
  await new Promise((r) => { proxy.closeAllConnections(); proxy.close(r); });
  assert.equal(codigo, 0, saida);
  assert.ok(vistos.some((v) => v.includes('127.0.0.2:' + srv.porta)), 'não passou pelo proxy: ' + JSON.stringify(vistos));
  assert.equal(carregarEstado(path.join(m.base, 'estado.json')).servidor.conta, 'Empresa Teste');
  m.limpar();
});

test('empacotamento: o conector vira um arquivo só (o que vai dentro do .exe) e roda sem a pasta src', () => {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conector-build-'));
  execFileSync(process.execPath, [path.join(RAIZ, 'conector', 'build', 'build.js'), '--so-bundle', '--saida', saida], { stdio: 'pipe' });
  const pacote = path.join(saida, 'MultiTelasConector.js');
  const codigo = fs.readFileSync(pacote, 'utf8');
  assert.ok(!codigo.includes('"scripts"'), 'o package.json inteiro foi para dentro do .exe');
  // Copiado para longe de conector/: se dependesse de algum arquivo solto, quebraria aqui.
  const longe = path.join(saida, 'longe');
  fs.mkdirSync(longe);
  fs.copyFileSync(pacote, path.join(longe, 'c.js'));
  assert.equal(execFileSync(process.execPath, [path.join(longe, 'c.js'), 'versao'], { encoding: 'utf8' }).trim(), VERSAO);
  const st = execFileSync(process.execPath, [path.join(longe, 'c.js'), 'status', '--pasta', longe], { encoding: 'utf8' });
  assert.match(st, /Configuração: não achei .*conector\.json/);
  // O zip: o mesmo deflate que o "Extrair tudo" do Windows abre.
  const B = require(path.join(RAIZ, 'conector', 'build', 'build.js'));
  const z = B.zipar([{ nome: 'a.txt', dados: Buffer.from('olá\r\n') }]);
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  assert.equal(B.crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.deepEqual(B.EXEC_ARGV, ['--use-system-ca', '--disable-warning=ExperimentalWarning']);
  assert.match(fs.readFileSync(path.join(RAIZ, '.gitignore'), 'utf8'), /^conector\/dist\/$/m);
  fs.rmSync(saida, { recursive: true, force: true });
});

test('os scripts do Windows: tarefa agendada com a conta escolhida, religa se cair, sem porta de entrada; desinstalar limpa', () => {
  const ins = fs.readFileSync(path.join(RAIZ, 'conector', 'windows', 'instalar.ps1'), 'utf8');
  assert.match(ins, /Register-ScheduledTask/);
  assert.match(ins, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(ins, /-MultipleInstances IgnoreNew/);
  assert.match(ins, /-ExecutionTimeLimit \(\[TimeSpan\]::Zero\)/, 'o padrão do Windows mata a tarefa em 72 h');
  assert.match(ins, /-User \$Conta -Password \$senha/);
  assert.match(ins, /icacls\.exe \$Destino \/inheritance:r/);
  assert.doesNotMatch(ins, /New-NetFirewallRule|netsh/i, 'o conector não abre porta de entrada');
  const des = fs.readFileSync(path.join(RAIZ, 'conector', 'windows', 'desinstalar.ps1'), 'utf8');
  assert.match(des, /Unregister-ScheduledTask -TaskName \$NomeTarefa -Confirm:\$false/);
  assert.match(des, /-ApagarArquivos/);
  for (const doc of ['conector/README.md', 'docs/implantacao/CONECTOR.md']) {
    const t = fs.readFileSync(path.join(RAIZ, doc), 'utf8');
    for (const tema of [/requisitos/i, /conta/i, /desinstalar/i, /firewall/i, /proxy/i, /problemas/i, /PowerPoint/]) assert.match(t, tema, doc + ' não fala de ' + tema);
  }
});
