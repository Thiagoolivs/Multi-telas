/*
 * server/routes/integracoes.js — as integrações: o Conector MultiTelas e a
 * intranet (docs/INTEGRACOES.md). As regras puras moram em
 * server/integracoes.js; aqui ficam o HTTP, o banco e o caminho até as TVs.
 *
 * A API PÚBLICA (/api/v1), com o token da integração (Authorization: Bearer):
 *   GET    /api/v1/conector                         aperto de mão e pulso: o que o painel definiu
 *   GET    /api/v1/pastas/:chave                    o que já temos da pasta (o Conector manda só a diferença)
 *   PUT    /api/v1/pastas/:chave/arquivos/:nome     os bytes do arquivo (X-Sha256; mesmo sha = nada muda)
 *   DELETE /api/v1/pastas/:chave/arquivos/:nome     o arquivo saiu do compartilhamento
 *   PUT    /api/v1/planilhas/:chave                 o CSV (a primeira aba do .xlsx), pelo caminho da planilha de sempre
 *   PUT    /api/v1/comunicados/:idExterno           cria ou troca um comunicado (o Conector e a intranet)
 *   DELETE /api/v1/comunicados/:idExterno           tira o comunicado
 *
 * DO PAINEL (/api/integracoes), com a sessão: ler é de quem é da conta;
 * mexer é do dono e dos administradores (como os indicadores, D36):
 *   GET    /api/integracoes                         as integrações, as fontes e o estado de cada uma
 *   POST   /api/integracoes                         cria (o token sai UMA vez)
 *   PUT    /api/integracoes/:id                     nome e o mapa dos comunicados
 *   POST   /api/integracoes/:id/token               token novo (o antigo para de valer)
 *   POST   /api/integracoes/:id/revogar             o token para de valer; o que está na TV fica
 *   DELETE /api/integracoes/:id                     apaga tudo (e tira das TVs o que ela pôs)
 *   POST   /api/integracoes/:id/fontes              uma pasta, planilha ou feed
 *   PUT    /api/integracoes/:id/fontes/:fonte       muda a configuração (e a TV acompanha)
 *   DELETE /api/integracoes/:id/fontes/:fonte       apaga (e tira das TVs)
 *   GET    /api/integracoes/:id/fontes/:fonte/arquivos   os arquivos da pasta
 *   POST   /api/integracoes/:id/fontes/:fonte/sincronizar  põe nas TVs agora
 *   DELETE /api/integracoes/:id/comunicados/:idExterno     o RH tira um comunicado da TV pelo painel
 *   GET    /api/integracoes/:id/registro            as últimas mudanças (auditoria)
 *
 * O CAMINHO ATÉ AS TVs é o do envio em lote (POST /api/lote/operacao, tipo
 * 'integracao', server/routes/telas.js e js/lote-tv.js): posse e loja de cada
 * TV, versão, a porta das peças, tudo ou nada, o Desfazer e, com "precisa de
 * aprovação" ligado na pasta, o pedido (202) no lugar do envio. Nada aqui
 * grava a programação de uma TV por conta própria.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const nodeCrypto = require('crypto');
const I = require('../integracoes');
const P = require('../planilha');
const K = require('../kpis');
const MTVideo = require('../../js/video.js');

module.exports = function (ctx) {
  const { db, sendJson, readBody, rateLimit, security, clientIp, safeEqual, canManageTeam, avisarTelas, baseUrl, midia, plans, site, log, erros } = ctx;

  const LIM = I.LIMITES;
  // Quem assina o envio e o pedido de aprovação: a integração, não uma pessoa (um autor só, para os pedidos se juntarem).
  const AUTOR = 'integracao';
  /*
   * A ESPERA antes de ir às TVs. O Conector manda a pasta arquivo por
   * arquivo; ir às TVs a cada um seria um envio (e um pedido de aprovação)
   * por foto. Cada mudança empurra a ida para ESPERA_MS depois — até
   * ESPERA_MAX_MS da primeira, para a pasta grande não esperar para sempre.
   */
  const ESPERA_MS = Math.max(50, Number(process.env.MT_INTEGRACAO_ESPERA_MS) || 10 * 1000);
  const ESPERA_MAX_MS = Math.max(ESPERA_MS, 2 * 60 * 1000);
  const DE_NOVO_MS = 5 * 60 * 1000;            // deu erro indo às TVs: tenta de novo em 5 minutos
  const DRENAR_MAX = 64 * 1024 * 1024;         // passou do teto: lê e joga fora até isto, para o 413 chegar a quem mandou

  const ehObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
  const erro = (res, status, code, error, extra, cab) => sendJson(res, status, Object.assign({ error, code }, extra || {}), cab);

  /* ================= A API pública (/api/v1) ================= */

  // Os pedaços CRUS do caminho: o nome do arquivo pode vir com "%2F" (subpasta) e o caminho já decodificado o partiria.
  function pedacosCrus(req) {
    return String(req.url || '').split('?')[0].split('/').filter(Boolean);
  }
  const decodificar = (s) => { try { return decodeURIComponent(s); } catch (e) { return null; } };

  const ultimaChamada = new Map();             // integração → quando gravamos chamada_em (uma escrita a cada 30 s basta)
  const bytesNaHora = new Map();               // integração → { bytes, ate }

  // O token, conferido: a integração, ou a resposta 401/429 já enviada (null).
  async function autenticar(req, res) {
    const ip = clientIp(req);
    const travado = security.rateLimitConsultar('int:erro:' + ip, LIM.tokensErradosPorIp);
    if (!travado.ok) {
      erro(res, 429, 'limite', 'Tokens errados demais deste endereço. Espere ' + travado.retryAfter + ' segundos.', { retryAfter: travado.retryAfter }, { 'Retry-After': String(travado.retryAfter) });
      return null;
    }
    const m = /^Bearer\s+(\S+)\s*$/i.exec(String(req.headers.authorization || ''));
    if (!m) { erro(res, 401, 'sem-token', 'Falta o token: mande o cabeçalho "Authorization: Bearer <token>" (o token é criado no painel, em Integrações).'); return null; }
    const token = m[1];
    const errado = () => {
      rateLimit('int:erro:' + ip, LIM.tokensErradosPorIp, 10 * 60 * 1000);
      erro(res, 401, 'token-invalido', 'Token inválido. Confira se copiou inteiro, ou gere um novo no painel (Integrações).');
      return null;
    };
    if (!I.tokenComFormato(token)) return errado();
    const h = I.hashToken(token);
    const integ = await db.integracaoPorToken(h);
    // A busca é pelo hash (um índice); a conferência final é em tempo constante, como a do pareamento.
    if (!integ || !safeEqual(integ.tokenHash, h)) return errado();
    if (integ.revogadaEm) { erro(res, 401, 'token-revogado', 'Este token foi revogado no painel. Gere um novo em Integrações e troque no Conector.'); return null; }
    return integ;
  }

  // Quem fez, na auditoria: o token pela dica, nunca ele.
  const quemDoToken = (integ) => 'token …' + (integ.tokenDica || '????');
  async function registrar(tenantId, integracaoId, acao, detalhe, quem) {
    await db.registrarNaIntegracao(tenantId, integracaoId, { acao, detalhe, quem }).catch((e) => erros.registrar(e, { onde: 'integração: auditoria' }));
    log.info('integracao.mudou', { conta: tenantId, integracao: integracaoId, acao });
  }

  async function api(req, res) {
    const inicio = Date.now();
    const crus = pedacosCrus(req);                       // ['api', 'v1', 'pastas', ':chave', 'arquivos', ...nome]
    // O pedaço do endereço vai para o log: só os nomes conhecidos (o resto é texto de quem chamou).
    const recurso = ['conector', 'pastas', 'planilhas', 'comunicados'].indexOf(crus[2]) >= 0 ? crus[2] : (crus[2] ? 'desconhecido' : '');
    let integ = null;
    // Uma linha por chamada, com o id da integração — nunca o token, e o padrão da rota (o nome do arquivo pode ser de gente).
    res.on('finish', () => {
      const rota = req.method + ' /api/v1/' + recurso + (recurso === 'pastas' && crus[4] === 'arquivos' ? '/:chave/arquivos/:nome' : crus[3] ? '/:' + (recurso === 'comunicados' ? 'id' : 'chave') : '');
      log.info('integracao.chamada', { integracao: integ ? integ.id : '', conta: integ ? integ.tenantId : '', rota, status: res.statusCode, ms: Date.now() - inicio });
    });
    integ = await autenticar(req, res);
    if (!integ) return;
    const rl = rateLimit('int:pedidos:' + integ.id, LIM.pedidosPorMinuto, 60 * 1000);
    if (!rl.ok) {
      return erro(res, 429, 'limite', 'Muitos pedidos: no máximo ' + LIM.pedidosPorMinuto + ' por minuto por token. Espere ' + rl.retryAfter + ' segundos.',
        { retryAfter: rl.retryAfter }, { 'Retry-After': String(rl.retryAfter) });
    }
    const agora = Date.now();
    if (!ultimaChamada.has(integ.id) || agora - ultimaChamada.get(integ.id) > 30 * 1000) {
      ultimaChamada.set(integ.id, agora);
      db.atualizarIntegracao(integ.id, integ.tenantId, { chamadaEm: agora }).catch(() => {});
    }
    const m = req.method;
    if (recurso === 'conector' && crus.length === 3 && m === 'GET') return apertoDeMao(req, res, integ);
    if (recurso === 'pastas' && crus.length === 4 && m === 'GET') return listarPasta(req, res, integ, decodificar(crus[3]));
    if (recurso === 'pastas' && crus[4] === 'arquivos' && crus.length >= 6 && (m === 'PUT' || m === 'DELETE')) {
      const nomeCru = crus.slice(5).map(decodificar);
      if (nomeCru.some((x) => x == null)) return erro(res, 400, 'nome-invalido', 'O nome do arquivo veio mal codificado no endereço (use encodeURIComponent em cada parte).');
      const chave = decodificar(crus[3]);
      return m === 'PUT' ? receberArquivo(req, res, integ, chave, nomeCru.join('/')) : apagarArquivo(req, res, integ, chave, nomeCru.join('/'));
    }
    if (recurso === 'planilhas' && crus.length === 4 && m === 'PUT') return receberPlanilha(req, res, integ, decodificar(crus[3]));
    if (recurso === 'comunicados' && crus.length === 4 && (m === 'PUT' || m === 'DELETE')) {
      const id = I.idExternoLimpo(decodificar(crus[3]));
      if (id.erro) return erro(res, 400, 'id-invalido', id.erro);
      return m === 'PUT' ? receberComunicado(req, res, integ, id.id) : apagarComunicado(req, res, integ, id.id);
    }
    const conhecido = ['conector', 'pastas', 'planilhas', 'comunicados'].indexOf(recurso) >= 0;
    return erro(res, conhecido ? 405 : 404, conhecido ? 'metodo' : 'rota-desconhecida', conhecido ? 'Método ' + m + ' não serve aqui.' : 'Endereço desconhecido na API do MultiTelas (veja docs/INTEGRACOES.md).');
  }

  /* ----- GET /api/v1/conector ----- */
  async function apertoDeMao(req, res, integ) {
    const t = integ.tenantId;
    const agora = Date.now();
    const versao = I.corta(req.headers['x-conector-versao'], 40);
    const maquina = I.corta(req.headers['x-conector-maquina'], 80);
    await db.atualizarIntegracao(integ.id, t, Object.assign({ vistoEm: agora, chamadaEm: agora }, versao ? { versao } : {}, maquina ? { maquina } : {}));
    if ((versao && versao !== integ.versao) || (maquina && maquina !== integ.maquina)) {
      await registrar(t, integ.id, 'conector.ligou', 'Conector ' + (versao || integ.versao || '?') + ' no computador ' + (maquina || integ.maquina || '?'), quemDoToken(integ));
    }
    const [conta, fontes] = await Promise.all([db.getTenant(t), db.listarFontes(t, integ.id)]);
    const de = (tipo) => fontes.filter((f) => f.tipo === tipo);
    return sendJson(res, 200, {
      conta: { nome: (conta && conta.name) || '' },
      integracao: { nome: integ.nome },
      pastas: de('pasta').map((f) => ({ chave: f.chave, nome: f.nome })),
      planilhas: de('planilha').map((f) => ({ chave: f.chave, nome: f.nome })),
      feeds: de('feed').map((f) => Object.assign({ chave: f.chave, nome: f.nome, url: f.config.url || '', formato: f.config.formato === 'json' ? 'json' : 'rss' },
        f.config.formato === 'json' && f.config.mapa ? { mapa: f.config.mapa } : {})),
      intervaloSegundos: I.INTERVALO_SEGUNDOS,
    });
  }

  async function pastaDoPedido(res, integ, chaveCrua) {
    const chave = chaveCrua == null ? '' : String(chaveCrua);
    const fonte = chave ? await db.fontePorChave(integ.id, 'pasta', chave) : null;
    if (!fonte) { erro(res, 404, 'pasta-desconhecida', 'A pasta "' + I.corta(chave, 40) + '" não existe nesta integração. As pastas são criadas no painel, em Integrações.'); return null; }
    return fonte;
  }

  /* ----- GET /api/v1/pastas/:chave ----- */
  async function listarPasta(req, res, integ, chave) {
    const fonte = await pastaDoPedido(res, integ, chave);
    if (!fonte) return;
    const arquivos = await db.listarArquivosDaFonte(fonte.id, integ.tenantId);
    return sendJson(res, 200, { arquivos: arquivos.map((a) => ({ nome: a.nome, sha256: a.sha256, tamanho: a.tamanho, em: new Date(a.em).toISOString() })) });
  }

  /*
   * O corpo direto num arquivo temporário, com o sha256 calculado no caminho.
   * Passou do teto: para de gravar e LÊ O RESTO (até DRENAR_MAX) jogando
   * fora, para o 413 com o motivo chegar a quem mandou — cortar a conexão
   * faria o Conector ver "conexão caiu" e mandar de novo para sempre.
   */
  function receberEmTemp(req, max) {
    return new Promise((resolve) => {
      const tmp = path.join(os.tmpdir(), 'mt-int-' + nodeCrypto.randomBytes(12).toString('hex'));
      const out = fs.createWriteStream(tmp);
      const hash = nodeCrypto.createHash('sha256');
      let total = 0;
      let estado = 'gravando';                 // gravando | grande | falhou
      let feito = false;
      const acabar = (r) => { if (!feito) { feito = true; resolve(r); } };
      const descartar = () => { out.destroy(); fs.unlink(tmp, () => {}); };
      out.on('error', () => { if (estado === 'gravando') { estado = 'falhou'; descartar(); req.resume(); acabar({ erro: 'não deu para gravar o arquivo agora' }); } });
      req.on('data', (c) => {
        total += c.length;
        if (estado !== 'gravando') { if (total > max + DRENAR_MAX) req.destroy(); return; }
        if (total > max) { estado = 'grande'; descartar(); return; }
        hash.update(c);
        if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); }
      });
      req.on('end', () => {
        if (estado === 'grande') return acabar({ grande: true, total });
        if (estado === 'falhou') return;
        out.end(() => acabar({ tmp, size: total, sha256: hash.digest('hex') }));
      });
      req.on('close', () => { if (!req.complete && estado === 'gravando') { estado = 'falhou'; descartar(); acabar({ erro: 'a conexão caiu no meio do envio' }); } });
      req.on('error', () => { if (estado === 'gravando') { estado = 'falhou'; descartar(); } acabar({ erro: 'a conexão caiu no meio do envio' }); });
    });
  }
  // O começo e o fim do arquivo: o tipo (e o codec do vídeo) mora nas pontas.
  async function pontas(tmp, size) {
    const fd = await fs.promises.open(tmp, 'r');
    try {
      const n = Math.min(size, 1024 * 1024);
      const cabeca = Buffer.alloc(n);
      await fd.read(cabeca, 0, n, 0);
      const m = Math.min(size, 1024 * 1024);
      const cauda = Buffer.alloc(m);
      await fd.read(cauda, 0, m, Math.max(0, size - m));
      return { cabeca, cauda };
    } finally { await fd.close(); }
  }
  async function cotaDa(tenantId) {
    const [usado, telas, conta] = await Promise.all([db.sumMediaBytes(tenantId), db.countDevices(tenantId), db.getTenant(tenantId)]);
    return { usado, cota: plans.cotaBytes(conta && conta.plan, Math.max(1, telas)) };
  }
  function orcamentoDeBytes(integracaoId) {
    const agora = Date.now();
    let b = bytesNaHora.get(integracaoId);
    if (!b || agora > b.ate) { b = { bytes: 0, ate: agora + 60 * 60 * 1000 }; bytesNaHora.set(integracaoId, b); }
    return b;
  }

  const recebendo = new Set();                 // fonte + nome: o mesmo arquivo em dois envios ao mesmo tempo

  /* ----- PUT /api/v1/pastas/:chave/arquivos/:nome ----- */
  async function receberArquivo(req, res, integ, chave, nomeCru) {
    const t = integ.tenantId;
    const fonte = await pastaDoPedido(res, integ, chave);
    if (!fonte) return;
    const n = I.nomeDoArquivo(nomeCru);
    if (n.erro) return erro(res, 400, 'nome-invalido', 'Nome de arquivo recusado: ' + n.erro + '.');
    const nome = n.nome;
    const sha = String(req.headers['x-sha256'] || '').trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) return erro(res, 400, 'sha-invalido', 'Falta o cabeçalho X-Sha256 (o sha256 do arquivo, 64 letras e números em hexadecimal).');
    const atual = await db.arquivoDaFonte(fonte.id, nome);
    // O mesmo conteúdo de novo: nada muda (o corpo é lido e jogado fora pelo próprio Node).
    if (atual && atual.sha256 === sha) { req.resume(); return sendJson(res, 200, { ok: true, nome, sha256: sha, mudou: false }); }
    const declarado = Number(req.headers['content-length']);
    const teto = I.tetoDoCorpo();
    // Quem DECLARA PDF ou PPTX é recusado antes de mandar os bytes (aceitar, só pelo conteúdo — recusar o que o próprio Conector disse que é documento não engana ninguém).
    if (/^application\/(pdf|vnd\.openxmlformats-officedocument\.presentationml|vnd\.ms-powerpoint)/i.test(String(req.headers['content-type'] || ''))) {
      req.resume();
      return erro(res, 415, 'tipo-nao-aceito', 'PDF e PPTX não vão direto para a TV. ' + I.SLIDES_COMO_IMAGEM + '.');
    }
    if (declarado > teto) { req.resume(); return erro(res, 413, 'grande-demais', 'O arquivo tem ' + I.emMB(declarado) + ': o máximo é ' + I.emMB(I.tetoDo('video')) + ' para vídeo e ' + I.emMB(I.tetoDo('imagem')) + ' para foto.'); }
    const contagem = await db.contarArquivosDaFonte(fonte.id);
    if (!atual && contagem.n >= LIM.arquivosPorPasta) { req.resume(); return erro(res, 413, 'pasta-cheia', 'A pasta "' + fonte.nome + '" já tem ' + LIM.arquivosPorPasta + ' arquivos, o máximo. Tire os antigos do compartilhamento ou divida em outra pasta.'); }
    const orc = orcamentoDeBytes(integ.id);
    if (orc.bytes >= LIM.bytesPorHora) {
      const espera = Math.max(1, Math.ceil((orc.ate - Date.now()) / 1000));
      req.resume();
      return erro(res, 429, 'limite', 'Esta integração já mandou ' + I.emMB(LIM.bytesPorHora) + ' na última hora, o máximo. Espere ' + espera + ' segundos.', { retryAfter: espera }, { 'Retry-After': String(espera) });
    }
    const c0 = await cotaDa(t);
    if (declarado > 0 && c0.usado + declarado > c0.cota) { req.resume(); return erro(res, 413, 'cota-cheia', 'O armazenamento da conta está cheio. Apague arquivos antigos no painel ou fale com o suporte sobre o plano.'); }
    const trava = fonte.id + '\n' + nome;
    if (recebendo.has(trava)) { req.resume(); return erro(res, 409, 'ocupado', 'Este mesmo arquivo está chegando em outro envio agora. Tente de novo em instantes.'); }
    recebendo.add(trava);
    let tmp = null;
    try {
      const rec = await receberEmTemp(req, teto);
      if (rec.erro) return erro(res, 400, 'corpo-incompleto', 'O arquivo não chegou inteiro: ' + rec.erro + '.');
      if (rec.grande) return erro(res, 413, 'grande-demais', 'O arquivo passou de ' + I.emMB(teto) + ', o máximo.');
      tmp = rec.tmp;
      orc.bytes += rec.size;
      if (!rec.size) return erro(res, 415, 'tipo-nao-aceito', 'O arquivo veio vazio.');
      if (rec.sha256 !== sha) return erro(res, 400, 'sha-diferente', 'O arquivo chegou diferente do X-Sha256 (o envio foi cortado ou o sha está errado). Mande de novo.');
      const { cabeca, cauda } = await pontas(tmp, rec.size);
      const tipo = I.tipoPelosBytes(cabeca, cauda);
      if (tipo && !I.ACEITO[tipo.tipo]) return erro(res, 415, 'tipo-nao-aceito', '"' + I.nomeVisivel(nome) + '" é ' + (/pdf/.test(tipo.mime) ? 'um PDF' : 'uma apresentação PPTX') + ', que não vai direto para a TV. ' + I.SLIDES_COMO_IMAGEM + '.');
      if (!tipo) return erro(res, 415, 'tipo-nao-aceito', 'O conteúdo de "' + I.nomeVisivel(nome) + '" não é ' + I.TIPOS_ACEITOS + ' (o tipo é conferido pelo conteúdo, não pelo nome).');
      if (rec.size > I.tetoDo(tipo.tipo)) return erro(res, 413, 'grande-demais', '"' + I.nomeVisivel(nome) + '" tem ' + I.emMB(rec.size) + ': o máximo para ' + (tipo.tipo === 'video' ? 'vídeo' : 'foto') + ' é ' + I.emMB(I.tetoDo(tipo.tipo)) + '.');
      if (contagem.bytes - (atual ? atual.tamanho : 0) + rec.size > LIM.bytesPorPasta) return erro(res, 413, 'pasta-cheia', 'A pasta "' + fonte.nome + '" passou de ' + I.emMB(LIM.bytesPorPasta) + ', o máximo.');
      const c1 = await cotaDa(t);
      if (c1.usado + rec.size > c1.cota) return erro(res, 413, 'cota-cheia', 'O armazenamento da conta está cheio. Apague arquivos antigos no painel ou fale com o suporte sobre o plano.');
      // O vídeo que o TV Box não aguenta entra, com o aviso no painel (a mesma régua do upload do painel, js/video.js).
      let aviso = '';
      if (tipo.tipo === 'video') {
        const v = MTVideo.avaliar({ bytes: rec.size, codec: MTVideo.codecNosBytes([cabeca, cauda]) });
        if (v && v.motivos && v.motivos.length) aviso = 'Este vídeo ' + v.motivos.join(' e ') + '.';
      }
      // O temporário sai no finally: no disco o rename já o levou (o unlink não acha nada); no R2 ele ficaria.
      const salvo = await midia.guardarTemp(db, t, tmp, { mime: tipo.mime, size: rec.size, sha256: rec.sha256 }, { nome: I.nomeVisivel(nome), origem: 'conector' });
      await db.gravarArquivoDaFonte(t, fonte.id, { nome, sha256: rec.sha256, tamanho: rec.size, mime: tipo.mime, mediaId: salvo.id, url: salvo.url, aviso });
      await registrar(t, integ.id, atual ? 'arquivo.trocado' : 'arquivo.novo', 'Pasta "' + fonte.nome + '": ' + nome + ' (' + I.emMB(rec.size).replace(/^0 MB$/, 'menos de 1 MB') + ')', quemDoToken(integ));
      await mudou(fonte, integ);
      return sendJson(res, 200, Object.assign({ ok: true, nome, sha256: rec.sha256, mudou: true }, aviso ? { aviso } : {}));
    } finally {
      recebendo.delete(trava);
      if (tmp) fs.unlink(tmp, () => {});
    }
  }

  /* ----- DELETE /api/v1/pastas/:chave/arquivos/:nome ----- */
  async function apagarArquivo(req, res, integ, chave, nomeCru) {
    const fonte = await pastaDoPedido(res, integ, chave);
    if (!fonte) return;
    const n = I.nomeDoArquivo(nomeCru);
    if (n.erro) return erro(res, 400, 'nome-invalido', 'Nome de arquivo recusado: ' + n.erro + '.');
    // O arquivo não some na hora: sai da TV pela sincronização, e a mídia espera a faxina (o Desfazer e a aprovação ainda a usam).
    const tirados = await db.removerArquivoDaFonte(fonte.id, integ.tenantId, n.nome, Date.now());
    if (tirados) {
      await registrar(integ.tenantId, integ.id, 'arquivo.apagado', 'Pasta "' + fonte.nome + '": ' + n.nome, quemDoToken(integ));
      await mudou(fonte, integ);
    }
    return sendJson(res, 200, { ok: true, nome: n.nome, removido: !!tirados });
  }

  // O corpo inteiro na memória, com teto (o CSV: 512 KB). Passou: lê e joga fora o resto, para o 413 chegar.
  function lerCorpo(req, max) {
    return new Promise((resolve) => {
      const partes = [];
      let total = 0;
      let grande = false;
      req.on('data', (c) => {
        total += c.length;
        if (grande) { if (total > max + DRENAR_MAX) req.destroy(); return; }
        if (total > max) { grande = true; partes.length = 0; return; }
        partes.push(c);
      });
      req.on('end', () => resolve(grande ? { grande: true } : { buf: Buffer.concat(partes) }));
      req.on('error', () => resolve({ erro: true }));
      req.on('close', () => { if (!req.complete) resolve({ erro: true }); });
    });
  }

  /* ----- PUT /api/v1/planilhas/:chave ----- */
  async function receberPlanilha(req, res, integ, chaveCrua) {
    const t = integ.tenantId;
    const chave = chaveCrua == null ? '' : String(chaveCrua);
    const fonte = chave ? await db.fontePorChave(integ.id, 'planilha', chave) : null;
    if (!fonte) { req.resume(); return erro(res, 404, 'planilha-desconhecida', 'A planilha "' + I.corta(chave, 40) + '" não existe nesta integração. As planilhas são criadas no painel, em Integrações.'); }
    const declarado = Number(req.headers['content-length']);
    const grande = () => erro(res, 413, 'grande-demais', 'O CSV passou de ' + Math.round(LIM.csvBytes / 1024) + ' KB. Deixe na primeira aba só os itens que vão para a TV.');
    if (declarado > LIM.csvBytes) { req.resume(); return grande(); }
    const r = await lerCorpo(req, LIM.csvBytes);
    if (r.erro) return erro(res, 400, 'corpo-incompleto', 'O CSV não chegou inteiro. Mande de novo.');
    if (r.grande) return grande();
    const txt = I.textoDoCsv(r.buf, req.headers['content-type']);
    if (txt.erro) return erro(res, txt.status || 400, txt.code, txt.erro + '.');
    const agora = Date.now();
    const linhas = P.lerCsv(txt.texto);
    const destino = await destinoDaPlanilha(fonte, integ);
    let resposta;
    let falha = '';
    if (fonte.config.uso === 'indicadores') {
      // O mesmo caminho da planilha de indicadores do Google (server/kpis.js, gravarDaPlanilha).
      const g = await K.gravarDaPlanilha(destino, linhas, { db, agora });
      if (g.erro) falha = g.erro;
      else { avisarTelas(t, 'kpis', {}).catch(() => {}); resposta = Object.assign({ ok: true, indicadores: g.lista.length }, g.avisos && g.avisos.length ? { avisos: g.avisos } : {}); }
    } else {
      // O mesmo caminho da planilha de preços ligada (server/planilha.js, atualizarAgora), como se o link tivesse sido lido.
      await db.atualizarPlanilha(destino.id, t, { origem: 'conector', csv: txt.texto });
      const g = await P.atualizarAgora(Object.assign({}, destino, { origem: 'conector', csv: txt.texto }), { db, agora });
      if (g.erro) falha = g.erro;
      else {
        if (g.mudou) avisarTelas(t, 'planilhas', {}).catch(() => {});
        resposta = Object.assign({ ok: true, itens: g.itens.length, mudou: !!g.mudou }, g.aviso ? { aviso: g.aviso } : {});
      }
    }
    const f = (await db.fonteDaConta(fonte.id, t)) || fonte;
    const estado = Object.assign({}, f.estado, falha ? { ultimoErro: falha, erroEm: agora } : { ultimoOk: agora, ultimoErro: '', itens: resposta.itens != null ? resposta.itens : resposta.indicadores });
    await db.atualizarFonte(fonte.id, t, { estado });
    await registrar(t, integ.id, falha ? 'planilha.erro' : 'planilha.lida', 'Planilha "' + fonte.nome + '": ' + (falha || ((resposta.itens != null ? resposta.itens + ' itens' : resposta.indicadores + ' indicadores'))), quemDoToken(integ));
    // A TV continua com os últimos bons (a planilha de sempre faz igual): o erro volta em palavras para o Conector.
    if (falha) return erro(res, 422, 'planilha-sem-itens', falha + '. A TV continua com o que veio da última vez.');
    return sendJson(res, 200, resposta);
  }

  // A planilha de Preços (ou o conector de Indicadores) que esta fonte alimenta; some, nasce de novo.
  async function destinoDaPlanilha(fonte, integ) {
    const t = integ.tenantId;
    const id = fonte.config.destinoId;
    if (fonte.config.uso === 'indicadores') {
      let linha = id ? await db.conectorInterno(id, t) : null;
      if (!linha) {
        const c = await db.criarConector(t, { nome: fonte.nome, modo: 'conector' });
        await db.atualizarFonte(fonte.id, t, { config: Object.assign({}, fonte.config, { destinoId: c.id }) });
        linha = await db.conectorInterno(c.id, t);
      }
      return linha;
    }
    let linha = id ? await db.planilhaInterna(id, t) : null;
    if (!linha) {
      const p = await db.criarPlanilha(t, { nome: fonte.nome, origem: 'conector' });
      await db.atualizarFonte(fonte.id, t, { config: Object.assign({}, fonte.config, { destinoId: p.id }) });
      linha = await db.planilhaInterna(p.id, t);
    }
    return linha;
  }

  /*
   * A IMAGEM DE UM COMUNICADO que vem de fora (https). O servidor busca
   * pela porta de sempre (server/site.js): o IP resolvido não pode ser de
   * rede interna, a conexão vai no IP conferido, cada redirecionamento passa
   * pela mesma checagem, com tempo e tamanho no teto. E só https: a imagem
   * da rede interna o Conector manda para uma pasta, e o comunicado aponta
   * para ela ("pasta:<chave>/<nome>"). O servidor NUNCA busca um endereço
   * interno.
   *
   * INTEGRACAO_HOST_TESTE ("127.0.0.1:6169"): o teste local serve a imagem
   * sem tocar a internet. Desligado por padrão e ignorado em produção, como
   * o PLANILHA_HOST_TESTE (server/planilha.js).
   */
  function hostDeTeste() {
    if (process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') return '';
    return String(process.env.INTEGRACAO_HOST_TESTE || '').trim().toLowerCase();
  }
  async function politicaDaImagem(alvo) {
    let u;
    try { u = new URL(alvo); } catch (e) { return { erro: 'endereço inválido' }; }
    const teste = hostDeTeste();
    if (teste && u.host.toLowerCase() === teste) return { url: u, ip: net.isIP(u.hostname) ? u.hostname : '127.0.0.1' };
    if (u.protocol !== 'https:') return { erro: 'a imagem precisa estar num endereço https://' };
    return site.conferir(alvo);
  }
  async function baixarImagem(url) {
    const r = await site.buscar(url, politicaDaImagem, /^image\/(png|jpe?g|webp)/i, 'image/png,image/jpeg,image/webp', null, LIM.imagemRemotaBytes);
    if (r.erro) return { erro: r.erro.replace(/^o site /, 'o endereço da imagem ').replace('esse endereço não é uma página', 'o endereço não devolveu uma imagem PNG, JPG ou WEBP') };
    if (r.cortado) return { erro: 'a imagem passou de ' + I.emMB(LIM.imagemRemotaBytes) };
    const mime = site.tipoDaImagem(r.bytes);
    if (!mime) return { erro: 'o endereço não devolveu uma imagem PNG, JPG ou WEBP (o tipo é conferido pelo conteúdo)' };
    return { bytes: r.bytes, mime };
  }
  const nomeDaImagemDo = (idExterno) => 'comunicado:' + idExterno;

  // A fonte dos comunicados de uma integração (o mapa das TVs deles), criada junto com ela.
  async function fonteDosComunicados(integ) {
    const t = integ.tenantId;
    const f = await db.fontePorChave(integ.id, 'comunicados', '_');
    if (f) return f;
    return db.criarFonte(t, integ.id, { tipo: 'comunicados', chave: '_', nome: 'Comunicados', config: I.configDaFonte('comunicados', {}, {}, []).config });
  }

  /* ----- PUT /api/v1/comunicados/:idExterno ----- */
  function receberComunicado(req, res, integ, idExterno) {
    const t = integ.tenantId;
    return readBody(req, res, async (b) => {
      if (b == null) return erro(res, 400, 'json-invalido', 'O corpo não é um JSON válido. Exemplo: {"titulo": "Festa de fim de ano", "fim": "2026-12-20"}');
      const c = I.lerComunicado(b, { httpDeTeste: (u) => { try { return !!hostDeTeste() && new URL(u).host.toLowerCase() === hostDeTeste(); } catch (e) { return false; } } });
      if (c.erro) return erro(res, 400, c.code, c.erro + '.');
      const existente = await db.comunicadoPorIdExterno(integ.id, idExterno);
      if (!existente && (await db.listarComunicados(t, integ.id)).length >= LIM.comunicadosPorIntegracao) {
        return erro(res, 413, 'comunicados-demais', 'Esta integração já tem ' + LIM.comunicadosPorIntegracao + ' comunicados guardados, o máximo. Apague os antigos (DELETE) ou ponha "fim" neles.');
      }
      const fonteCom = await fonteDosComunicados(integ);
      const imagemAntes = existente && existente.dados.imagem;
      let imagem = null;
      if (c.imagem && c.imagem.pasta) {
        const fp = await db.fontePorChave(integ.id, 'pasta', c.imagem.pasta);
        const arq = fp ? await db.arquivoDaFonte(fp.id, c.imagem.nome) : null;
        if (!arq) return erro(res, 400, 'imagem-nao-encontrada', 'A imagem "' + c.imagem.nome + '" não está na pasta "' + c.imagem.pasta + '". Mande o arquivo para a pasta antes do comunicado.');
        if (!/^image\//.test(arq.mime)) return erro(res, 400, 'imagem-invalida', '"' + c.imagem.nome + '" não é uma foto (JPG, PNG ou WEBP).');
        imagem = { tipo: 'pasta', pasta: c.imagem.pasta, nome: c.imagem.nome };
      } else if (c.imagem && c.imagem.url) {
        const guardada = imagemAntes && imagemAntes.tipo === 'baixada' && imagemAntes.origem === c.imagem.url
          ? await db.arquivoDaFonte(fonteCom.id, nomeDaImagemDo(idExterno)) : null;
        if (guardada) imagem = imagemAntes;
        else {
          const r = await baixarImagem(c.imagem.url);
          if (r.erro) return erro(res, 400, 'imagem-invalida', 'Não deu para usar a imagem: ' + r.erro + '.');
          const salvo = await midia.guardarBuffer(db, t, r.bytes, r.mime, { nome: 'Comunicado: ' + c.dados.titulo, origem: 'conector' });
          await db.gravarArquivoDaFonte(t, fonteCom.id, { nome: nomeDaImagemDo(idExterno), sha256: nodeCrypto.createHash('sha256').update(r.bytes).digest('hex'), tamanho: r.bytes.length, mime: r.mime, mediaId: salvo.id, url: salvo.url });
          imagem = { tipo: 'baixada', origem: c.imagem.url };
        }
      }
      // A imagem baixada que não é mais usada sai para a faxina.
      if (imagemAntes && imagemAntes.tipo === 'baixada' && (!imagem || imagem.tipo !== 'baixada')) await db.removerArquivoDaFonte(fonteCom.id, t, nomeDaImagemDo(idExterno), Date.now());
      // O feed de onde veio (opcional: o Conector diz no cabeçalho; a intranet não precisa).
      const feedChave = I.corta(req.headers['x-conector-feed'], 40);
      const feed = feedChave ? await db.fontePorChave(integ.id, 'feed', feedChave) : null;
      const dados = Object.assign({}, c.dados, imagem ? { imagem } : {}, feed ? { feed: feed.chave } : {});
      const { comunicado, criado } = await db.gravarComunicado(t, integ.id, idExterno, { dados, inicio: c.inicio, fim: c.fim });
      if (feed) {
        const e = Object.assign({}, feed.estado, { ultimoItemEm: Date.now(), itens: (Number(feed.estado.itens) || 0) + (criado ? 1 : 0) });
        await db.atualizarFonte(feed.id, t, { estado: e });
      }
      await registrar(t, integ.id, criado ? 'comunicado.novo' : 'comunicado.trocado', '"' + c.dados.titulo + '"' + (feed ? ' (feed ' + feed.nome + ')' : ''), quemDoToken(integ));
      await mudou(fonteCom, integ);
      return sendJson(res, 200, { ok: true, id: idExterno, criado, situacao: I.situacao(comunicado, Date.now()) });
    });
  }

  /* ----- DELETE /api/v1/comunicados/:idExterno ----- */
  async function apagarComunicado(req, res, integ, idExterno) {
    const removido = await tirarComunicado(integ, idExterno, quemDoToken(integ));
    return sendJson(res, 200, { ok: true, id: idExterno, removido });
  }
  async function tirarComunicado(integ, idExterno, quem) {
    const t = integ.tenantId;
    const c = await db.comunicadoPorIdExterno(integ.id, idExterno);
    if (!c) return false;
    await db.removerComunicado(t, integ.id, idExterno);
    const fonteCom = await fonteDosComunicados(integ);
    if (c.dados.imagem && c.dados.imagem.tipo === 'baixada') await db.removerArquivoDaFonte(fonteCom.id, t, nomeDaImagemDo(idExterno), Date.now());
    await registrar(t, integ.id, 'comunicado.apagado', '"' + (c.dados.titulo || idExterno) + '"', quem);
    await mudou(fonteCom, integ);
    return true;
  }

  /* ================= O caminho até as TVs ================= */

  const emCurso = new Set();
  const deNovo = new Set();
  const primeiraMudanca = new Map();

  /*
   * Houve mudança nesta fonte: a ida às TVs fica para daqui a ESPERA_MS (o
   * relógio pega pelo banco — sobrevive a um restart). A pasta mudou: os
   * comunicados da integração que usam foto dela conferem também.
   */
  async function mudou(fonte, integ) {
    const t = fonte.tenantId;
    const agora = Date.now();
    const desde = primeiraMudanca.get(fonte.id) || agora;
    primeiraMudanca.set(fonte.id, desde);
    const quando = Math.min(agora + ESPERA_MS, desde + ESPERA_MAX_MS);
    const atual = (await db.fonteDaConta(fonte.id, t)) || fonte;
    await db.atualizarFonte(fonte.id, t, { sincronizarEm: quando, estado: Object.assign({}, atual.estado, { mudouEm: agora }) });
    if (emCurso.has(fonte.id)) deNovo.add(fonte.id);
    if (fonte.tipo === 'pasta' && integ) {
      const com = await db.fontePorChave(integ.id, 'comunicados', '_');
      if (com) await db.atualizarFonte(com.id, t, { sincronizarEm: Math.min(com.sincronizarEm || quando, quando) });
    }
  }

  // A sessão com que a integração envia: da conta, todas as TVs dela; a aprovação é a da pasta (ou dos comunicados).
  const sessaoDaIntegracao = (integ, fonte) => ({
    tenant_id: integ.tenantId, user_id: AUTOR, role: 'admin', name: 'Integração: ' + integ.nome, email: '',
    lojas: null, precisaAprovar: !!(fonte.config && fonte.config.aprovacao),
  });
  const origemDa = (fonte, integ) => (fonte.tipo === 'comunicados' ? 'comunicados:' + integ.id : 'pasta:' + fonte.id);

  // A URL da imagem de um comunicado AGORA (a foto da pasta pode ter trocado desde o comunicado).
  async function urlDaImagem(integ, fonteCom, c) {
    const img = c.dados && c.dados.imagem;
    if (!img) return '';
    if (img.tipo === 'pasta') {
      const fp = await db.fontePorChave(integ.id, 'pasta', img.pasta);
      const arq = fp ? await db.arquivoDaFonte(fp.id, img.nome) : null;
      return arq && /^image\//.test(arq.mime) ? arq.url : '';
    }
    const arq = await db.arquivoDaFonte(fonteCom.id, nomeDaImagemDo(c.idExterno));
    return arq ? arq.url : '';
  }

  // O que a fonte põe na TV agora: { itens, proxima, titulo, posicao }.
  async function oQueVaiParaATv(fonte, integ, agora) {
    if (fonte.tipo === 'pasta') {
      const arquivos = await db.listarArquivosDaFonte(fonte.id, fonte.tenantId);
      return { itens: I.itensDaPasta(arquivos, fonte.config), proxima: 0, titulo: 'Pasta da rede: ' + fonte.nome, posicao: 'fim' };
    }
    const lista = await db.listarComunicados(fonte.tenantId, integ.id);
    const { ativos, proxima } = I.agendaDosComunicados(lista, agora);
    const itens = [];
    for (const c of ativos) itens.push(...I.itensDoComunicado(c, await urlDaImagem(integ, fonte, c)));
    return { itens, proxima, titulo: 'Comunicados: ' + integ.nome, posicao: 'inicio' };
  }

  // Uma por vez por fonte; mudança no meio, roda de novo no fim.
  async function sincronizar(fonteId, tenantId, opcoes) {
    if (emCurso.has(fonteId)) { deNovo.add(fonteId); return { emCurso: true }; }
    emCurso.add(fonteId);
    try {
      return await sincronizarUmaVez(fonteId, tenantId, opcoes || {});
    } catch (e) {
      erros.registrar(e, { onde: 'integração: pôr nas TVs', tenant: tenantId });
      const f = await db.fonteDaConta(fonteId, tenantId).catch(() => null);
      if (f) await db.atualizarFonte(fonteId, tenantId, { estado: Object.assign({}, f.estado, { ultimoErro: 'não deu para pôr nas TVs agora; tentamos de novo em 5 minutos', erroEm: Date.now() }), sincronizarEm: Date.now() + DE_NOVO_MS }).catch(() => {});
      return { erro: true };
    } finally {
      emCurso.delete(fonteId);
      if (deNovo.delete(fonteId)) setImmediate(() => { sincronizar(fonteId, tenantId).catch(() => {}); });
    }
  }

  async function sincronizarUmaVez(fonteId, tenantId, o) {
    const fonte = await db.fonteDaConta(fonteId, tenantId);
    if (!fonte) return {};
    // Marca antes (a ida está sendo feita): dois relógios não vão às TVs pela mesma mudança.
    await db.atualizarFonte(fonte.id, tenantId, { sincronizarEm: 0 });
    primeiraMudanca.delete(fonte.id);
    if (fonte.tipo !== 'pasta' && fonte.tipo !== 'comunicados') return {};
    const integ = await db.integracaoDaConta(fonte.integracaoId, tenantId);
    if (!integ) return {};
    const agora = Date.now();
    const vai = await oQueVaiParaATv(fonte, integ, agora);
    const devices = await db.listDevices(tenantId);
    const existem = new Set(devices.map((d) => d.id));
    const alvo = I.telasDoAlvo(fonte.config.alvo, devices);
    const antes = (fonte.estado.telas || []).filter((id) => existem.has(id));
    const hash = I.resumo({ itens: vai.itens, alvo: alvo.slice().sort(), zona: fonte.config.zona, aprovacao: !!fonte.config.aprovacao });
    if (!o.forcar && hash === fonte.estado.hash) {
      // Nada a levar: a TV já está assim. Conferido agora (o painel para de dizer "indo para as TVs").
      const atual = (await db.fonteDaConta(fonte.id, tenantId)) || fonte;
      await db.atualizarFonte(fonte.id, tenantId, { sincronizarEm: vai.proxima || 0, estado: Object.assign({}, atual.estado, { ultimoOk: agora }) });
      return { igual: true };
    }
    // As TVs do mapa recebem a lista (entrada 0); as que saíram do mapa, a vazia (entrada 1): o que era daqui sai delas.
    const telas = alvo.map((id) => ({ id, entrada: 0 })).concat(antes.filter((id) => alvo.indexOf(id) < 0).map((id) => ({ id, entrada: 1 })));
    const r = telas.length
      ? await ctx.publicar.operacao(sessaoDaIntegracao(integ, fonte), {
        operacao: { tipo: 'integracao', id: origemDa(fonte, integ), titulo: vai.titulo, zona: fonte.config.zona, posicao: vai.posicao, entradas: [{ itens: vai.itens }, { itens: [] }] },
        telas,
      }, { soQuemMuda: true })
      : { status: 200, corpo: { ok: true, nada: true, telas: [] } };
    const atual = (await db.fonteDaConta(fonte.id, tenantId)) || fonte;
    const estado = Object.assign({}, atual.estado);
    if (r.status === 200 || r.status === 202) {
      Object.assign(estado, { hash, telas: alvo, ultimoOk: agora, ultimoErro: '', itens: vai.itens.length });
      delete estado.erroEm;
      if (r.status === 202) { estado.resultado = 'esperando'; estado.pedido = r.corpo.aprovacao && r.corpo.aprovacao.id; }
      // Nenhuma TV mudou: o que estava (inclusive o pedido que ainda espera o dono) continua valendo.
      else if (!r.corpo.nada) { estado.resultado = 'no-ar'; delete estado.pedido; if (r.corpo.lote) estado.lote = r.corpo.lote.id; }
      else if (!estado.resultado) estado.resultado = 'no-ar';
      await db.atualizarFonte(fonte.id, tenantId, { estado, sincronizarEm: vai.proxima || 0 });
      if (!r.corpo.nada) {
        const n = r.status === 202 ? ((r.corpo.aprovacao && r.corpo.aprovacao.telas) || []).length : (r.corpo.telas || []).length;
        await registrar(tenantId, integ.id, r.status === 202 ? 'tv.aprovacao' : 'tv.enviado', vai.titulo + ': ' + (r.status === 202 ? 'mandado para aprovação' : 'nas TVs') + ' (' + n + (n === 1 ? ' TV' : ' TVs') + ')', 'MultiTelas');
      }
      return { ok: true, status: r.status, corpo: r.corpo };
    }
    estado.ultimoErro = (r.corpo && r.corpo.error) || 'não deu para pôr nas TVs';
    estado.erroEm = agora;
    await db.atualizarFonte(fonte.id, tenantId, { estado, sincronizarEm: agora + DE_NOVO_MS });
    await registrar(tenantId, integ.id, 'tv.erro', vai.titulo + ': ' + estado.ultimoErro, 'MultiTelas');
    return { ok: false, status: r.status, corpo: r.corpo };
  }

  // Tira das TVs o que a fonte pôs (a pasta apagada, a integração apagada): com a sessão de quem apagou, sem aprovação.
  async function tirarDasTvs(sess, fonte, integ) {
    const devices = await db.listDevices(fonte.tenantId);
    const existem = new Set(devices.map((d) => d.id));
    const ids = [...new Set((fonte.estado.telas || []).concat(I.telasDoAlvo(fonte.config.alvo, devices)))].filter((id) => existem.has(id));
    if (!ids.length) return { status: 200, corpo: { ok: true, nada: true } };
    return ctx.publicar.operacao(sess, {
      operacao: { tipo: 'integracao', id: origemDa(fonte, integ), titulo: 'Tirar: ' + (fonte.tipo === 'comunicados' ? 'comunicados de ' + integ.nome : fonte.nome), entradas: [{ itens: [] }] },
      telas: ids.map((id) => ({ id, entrada: 0 })),
    }, { soQuemMuda: true });
  }

  /* ================= O painel (/api/integracoes) ================= */

  const fontePublica = (f, extra) => Object.assign({
    id: f.id, tipo: f.tipo, chave: f.chave, nome: f.nome, config: f.config,
    estado: {
      resultado: f.estado.resultado || '', ultimoOk: f.estado.ultimoOk || 0, ultimoErro: f.estado.ultimoErro || '', erroEm: f.estado.erroEm || 0,
      mudouEm: f.estado.mudouEm || 0, itens: f.estado.itens || 0, telas: (f.estado.telas || []).length, ultimoItemEm: f.estado.ultimoItemEm || 0,
      // Mudou depois da última ida às TVs (e do último erro): a próxima ida está a caminho. (sincronizarEm sozinho
      // não serve: nos comunicados ele marca também a hora em que o próximo começa ou acaba.)
      pendente: (f.estado.mudouEm || 0) > Math.max(f.estado.ultimoOk || 0, f.estado.erroEm || 0),
    },
  }, extra || {});
  const integracaoPublica = (i) => ({
    id: i.id, nome: i.nome, tokenDica: i.tokenDica, revogada: !!i.revogadaEm, revogadaEm: i.revogadaEm, vistoEm: i.vistoEm, chamadaEm: i.chamadaEm,
    versao: i.versao, maquina: i.maquina, criadoEm: i.criadoEm,
    // O Conector bate o ponto a cada INTERVALO_SEGUNDOS: três sem bater é "não está falando".
    conectorOnline: !!i.vistoEm && Date.now() - i.vistoEm < 3 * I.INTERVALO_SEGUNDOS * 1000,
  });

  // O pedido de aprovação de cada fonte, em palavras: esperando, aprovado, recusado (com o motivo).
  async function pedidosDaIntegracao(t) {
    const lista = await db.listarAprovacoes(t, { autorId: AUTOR, limite: 30 }).catch(() => []);
    const pendente = lista.find((p) => p.estado === 'pendente' || p.estado === 'aplicando');
    return (id) => {
      const p = id && lista.find((x) => x.id === id);
      if (!p) return null;
      // Juntado num pedido mais novo (aprovacao.js, pedir): vale o mais novo.
      if (p.estado === 'substituida' && pendente) return { id: pendente.id, estado: 'pendente' };
      return Object.assign({ id: p.id, estado: p.estado === 'aplicando' ? 'pendente' : p.estado }, p.estado === 'recusada' && p.motivo ? { motivo: p.motivo } : {});
    };
  }

  async function listar(req, res, sess) {
    const t = sess.tenant_id;
    const agora = Date.now();
    const [integracoes, fontes, pedidoDe] = await Promise.all([db.listarIntegracoes(t), db.listarFontes(t), pedidosDaIntegracao(t)]);
    const saida = [];
    for (const i of integracoes) {
      const minhas = fontes.filter((f) => f.integracaoId === i.id);
      const lista = [];
      for (const f of minhas.filter((x) => I.TIPOS_FONTE.indexOf(x.tipo) >= 0)) {
        const extra = {};
        if (f.tipo === 'pasta') {
          extra.arquivos = await db.contarArquivosDaFonte(f.id);
          extra.avisos = (await db.listarArquivosDaFonte(f.id, t)).filter((a) => a.aviso).length;
        }
        extra.pedido = pedidoDe(f.estado.pedido);
        lista.push(fontePublica(f, extra));
      }
      const com = minhas.find((f) => f.tipo === 'comunicados');
      const comunicados = await db.listarComunicados(t, i.id);
      saida.push(Object.assign(integracaoPublica(i), {
        fontes: lista,
        comunicados: Object.assign(com ? fontePublica(com, { pedido: pedidoDe(com.estado.pedido) }) : { config: I.configDaFonte('comunicados', {}, {}, []).config, estado: {} }, {
          lista: comunicados.slice(0, 50).map((c) => ({
            id: c.idExterno, titulo: c.dados.titulo, texto: c.dados.texto || '', destaque: !!c.dados.destaque, link: c.dados.link || '',
            comImagem: !!c.dados.imagem, feed: c.dados.feed || '', inicio: c.inicio, fim: c.fim, situacao: I.situacao(c, agora), atualizadoEm: c.atualizadoEm,
          })),
          total: comunicados.length,
        }),
      }));
    }
    return sendJson(res, 200, {
      integracoes: saida,
      podeMexer: canManageTeam(sess.role),
      api: { base: baseUrl(req) + '/api/v1', download: '/conector/MultiTelasConector.zip', intervaloSegundos: I.INTERVALO_SEGUNDOS },
      limites: {
        integracoes: LIM.integracoesPorConta, fontesPorTipo: LIM.fontesPorTipo, arquivosPorPasta: LIM.arquivosPorPasta,
        imagemMB: Math.round(I.tetoDo('imagem') / 1048576), videoMB: Math.round(I.tetoDo('video') / 1048576),
        csvKB: Math.round(LIM.csvBytes / 1024), pedidosPorMinuto: LIM.pedidosPorMinuto,
      },
    });
  }

  // A chave que o Conector usa no endereço: do que a pessoa escreveu, ou do nome. Repetida no mesmo tipo: recusada.
  async function chaveNova(integ, tipo, bruta, nome, fonteId) {
    const chave = I.chaveLimpa(bruta || nome);
    if (!chave) return { erro: 'dê um nome (letras ou números)' };
    const ja = await db.fontePorChave(integ.id, tipo, chave);
    if (ja && ja.id !== fonteId) return { erro: 'já existe ' + (tipo === 'pasta' ? 'uma pasta' : tipo === 'planilha' ? 'uma planilha' : 'um feed') + ' com o nome curto "' + chave + '" nesta integração' };
    return { chave };
  }

  const quemDaSessao = (sess) => String(sess.name || sess.email || 'painel').slice(0, 80);

  async function painel(req, res, parts, sess) {
    const t = sess.tenant_id;
    if (parts.length === 2 && req.method === 'GET') return listar(req, res, sess);
    const id = parts[2];
    const integ = id ? await db.integracaoDaConta(id, t) : null;
    if (req.method === 'GET' && integ && parts[3] === 'registro' && !parts[4]) {
      return sendJson(res, 200, { registro: await db.registroDaIntegracao(t, integ.id, 50) });
    }
    if (req.method === 'GET' && integ && parts[3] === 'fontes' && parts[5] === 'arquivos' && !parts[6]) {
      const f = await db.fonteDaConta(parts[4], t);
      if (!f || f.integracaoId !== integ.id || f.tipo !== 'pasta') return erro(res, 404, 'nao-encontrado', 'pasta não encontrada');
      const arquivos = await db.listarArquivosDaFonte(f.id, t);
      return sendJson(res, 200, { arquivos: arquivos.map((a) => ({ nome: a.nome, tamanho: a.tamanho, mime: a.mime, url: a.url, aviso: a.aviso, em: a.em })) });
    }
    if (!canManageTeam(sess.role)) return erro(res, 403, 'papel', 'Só o dono ou um administrador mexe nas integrações.');

    if (!id && req.method === 'POST') {
      return readBody(req, res, async (b) => {
        if ((await db.listarIntegracoes(t)).length >= LIM.integracoesPorConta) return erro(res, 400, 'limite', 'No máximo ' + LIM.integracoesPorConta + ' integrações por conta.');
        const token = I.novoToken();
        const nova = await db.criarIntegracao(t, { nome: I.corta(b && b.nome, 60) || 'Conector MultiTelas', tokenHash: I.hashToken(token), tokenDica: I.dicaDoToken(token) });
        await fonteDosComunicados(nova);
        await db.registrarEvento(t, sess.user_id, 'integracao.criar').catch(() => {});
        await registrar(t, nova.id, 'integracao.criada', 'Token …' + nova.tokenDica + ' criado', quemDaSessao(sess));
        // O token sai UMA vez: no banco fica só o hash.
        return sendJson(res, 200, { integracao: integracaoPublica(nova), token });
      });
    }
    if (!integ) return erro(res, 404, 'nao-encontrado', 'integração não encontrada');

    if (!parts[3] && req.method === 'PUT') {
      return readBody(req, res, async (b) => {
        if (!ehObjeto(b)) return erro(res, 400, 'json-invalido', 'pedido inválido');
        if (b.nome !== undefined) await db.atualizarIntegracao(integ.id, t, { nome: I.corta(b.nome, 60) || integ.nome });
        if (ehObjeto(b.comunicados)) {
          const com = await fonteDosComunicados(integ);
          const ids = (await db.listDevices(t)).map((d) => d.id);
          const r = I.configDaFonte('comunicados', b.comunicados, com.config, ids);
          if (r.erro) return erro(res, 400, 'campo-invalido', r.erro);
          await db.atualizarFonte(com.id, t, { config: r.config });
          await registrar(t, integ.id, 'comunicados.mapa', 'Onde os comunicados aparecem mudou', quemDaSessao(sess));
          await mudou(Object.assign({}, com, { config: r.config }), integ);
        }
        await db.registrarEvento(t, sess.user_id, 'integracao.editar').catch(() => {});
        return sendJson(res, 200, { integracao: integracaoPublica(await db.integracaoDaConta(integ.id, t)) });
      });
    }
    if (parts[3] === 'token' && !parts[4] && req.method === 'POST') {
      const token = I.novoToken();
      await db.atualizarIntegracao(integ.id, t, { tokenHash: I.hashToken(token), tokenDica: I.dicaDoToken(token), revogadaEm: 0 });
      await db.registrarEvento(t, sess.user_id, 'integracao.token').catch(() => {});
      await registrar(t, integ.id, 'token.novo', 'Token novo …' + I.dicaDoToken(token) + ' (o …' + (integ.tokenDica || '?') + ' parou de valer)', quemDaSessao(sess));
      return sendJson(res, 200, { token });
    }
    if (parts[3] === 'revogar' && !parts[4] && req.method === 'POST') {
      await db.atualizarIntegracao(integ.id, t, { revogadaEm: Date.now() });
      await db.registrarEvento(t, sess.user_id, 'integracao.revogar').catch(() => {});
      await registrar(t, integ.id, 'token.revogado', 'Token …' + (integ.tokenDica || '?') + ' revogado', quemDaSessao(sess));
      return sendJson(res, 200, { ok: true });
    }
    if (!parts[3] && req.method === 'DELETE') {
      // Primeiro sai das TVs; se não der, nada é apagado (a TV não fica com conteúdo órfão de uma integração que não existe).
      for (const f of await db.listarFontes(t, integ.id)) {
        if (f.tipo !== 'pasta' && f.tipo !== 'comunicados') continue;
        const r = await tirarDasTvs(sess, f, integ);
        if (r.status !== 200) return sendJson(res, r.status, Object.assign({}, r.corpo, { error: 'Não deu para tirar das TVs o que esta integração pôs: ' + ((r.corpo && r.corpo.error) || 'tente de novo') }));
      }
      for (const f of await db.listarFontes(t, integ.id)) if (f.tipo === 'planilha') await apagarDestino(f, t);
      for (const a of await db.arquivosDaIntegracao(integ.id, t)) if (a.mediaId) await midia.apagar(db, t, a.mediaId).catch(() => false);
      await db.removerIntegracao(integ.id, t);
      await db.registrarEvento(t, sess.user_id, 'integracao.apagar').catch(() => {});
      log.info('integracao.mudou', { conta: t, integracao: integ.id, acao: 'integracao.apagada' });
      return sendJson(res, 200, { ok: true });
    }

    if (parts[3] === 'comunicados' && parts[4] && !parts[5] && req.method === 'DELETE') {
      const idExterno = decodificar(pedacosCrus(req)[4]);
      const removido = idExterno ? await tirarComunicado(integ, idExterno, quemDaSessao(sess)) : false;
      if (!removido) return erro(res, 404, 'nao-encontrado', 'comunicado não encontrado');
      return sendJson(res, 200, { ok: true });
    }

    if (parts[3] !== 'fontes') return erro(res, 404, 'nao-encontrado', 'não encontrado');
    if (!parts[4] && req.method === 'POST') {
      return readBody(req, res, async (b) => {
        if (!ehObjeto(b)) return erro(res, 400, 'json-invalido', 'pedido inválido');
        const tipo = I.TIPOS_FONTE.indexOf(b.tipo) >= 0 ? b.tipo : '';
        if (!tipo) return erro(res, 400, 'campo-invalido', 'escolha: pasta, planilha ou feed');
        const doTipo = (await db.listarFontes(t, integ.id)).filter((f) => f.tipo === tipo);
        if (doTipo.length >= LIM.fontesPorTipo) return erro(res, 400, 'limite', 'No máximo ' + LIM.fontesPorTipo + ' de cada tipo por integração.');
        const nome = I.corta(b.nome, 60);
        if (!nome) return erro(res, 400, 'campo-invalido', 'dê um nome');
        const k = await chaveNova(integ, tipo, b.chave, nome);
        if (k.erro) return erro(res, 409, 'chave-repetida', k.erro);
        const ids = (await db.listDevices(t)).map((d) => d.id);
        const c = I.configDaFonte(tipo, b, {}, ids);
        if (c.erro) return erro(res, 400, 'campo-invalido', c.erro);
        let f = await db.criarFonte(t, integ.id, { tipo, chave: k.chave, nome, config: c.config });
        // A planilha nasce junto com o lugar onde ela aparece: Preços da planilha, ou Indicadores.
        if (tipo === 'planilha') { await destinoDaPlanilha(f, integ); f = await db.fonteDaConta(f.id, t); }
        await db.registrarEvento(t, sess.user_id, 'integracao.fonte').catch(() => {});
        await registrar(t, integ.id, 'fonte.criada', (tipo === 'pasta' ? 'Pasta' : tipo === 'planilha' ? 'Planilha' : 'Feed') + ' "' + nome + '" (' + k.chave + ')', quemDaSessao(sess));
        return sendJson(res, 200, { fonte: fontePublica(f) });
      });
    }
    const fonte = parts[4] ? await db.fonteDaConta(parts[4], t) : null;
    if (!fonte || fonte.integracaoId !== integ.id || I.TIPOS_FONTE.indexOf(fonte.tipo) < 0) return erro(res, 404, 'nao-encontrado', 'não encontrado');
    if (!parts[5] && req.method === 'PUT') {
      return readBody(req, res, async (b) => {
        if (!ehObjeto(b)) return erro(res, 400, 'json-invalido', 'pedido inválido');
        const campos = {};
        if (b.nome !== undefined) campos.nome = I.corta(b.nome, 60) || fonte.nome;
        if (b.chave !== undefined) {
          const k = await chaveNova(integ, fonte.tipo, b.chave, campos.nome || fonte.nome, fonte.id);
          if (k.erro) return erro(res, 409, 'chave-repetida', k.erro);
          campos.chave = k.chave;
        }
        const ids = (await db.listDevices(t)).map((d) => d.id);
        const c = I.configDaFonte(fonte.tipo, b, fonte.config, ids);
        if (c.erro) return erro(res, 400, 'campo-invalido', c.erro);
        campos.config = c.config;
        await db.atualizarFonte(fonte.id, t, campos);
        if (fonte.tipo === 'planilha' && campos.nome) {
          // O nome em Preços da planilha (ou em Indicadores) acompanha.
          if (fonte.config.uso === 'indicadores') await db.atualizarConector(fonte.config.destinoId, t, { nome: campos.nome }).catch(() => 0);
          else await db.atualizarPlanilha(fonte.config.destinoId, t, { nome: campos.nome }).catch(() => 0);
        }
        await registrar(t, integ.id, 'fonte.editada', '"' + (campos.nome || fonte.nome) + '"', quemDaSessao(sess));
        if (fonte.tipo === 'pasta') await mudou(Object.assign({}, fonte, campos), integ);
        return sendJson(res, 200, { fonte: fontePublica(await db.fonteDaConta(fonte.id, t)) });
      });
    }
    if (parts[5] === 'sincronizar' && !parts[6] && req.method === 'POST') {
      if (fonte.tipo !== 'pasta') return erro(res, 400, 'campo-invalido', 'só a pasta vai para as TVs por aqui');
      const r = await sincronizar(fonte.id, t, { forcar: true });
      const f = await db.fonteDaConta(fonte.id, t);
      if (r.emCurso) return sendJson(res, 202, { ok: true, emCurso: true, fonte: fontePublica(f) });
      return sendJson(res, r.ok === false ? (r.status || 400) : 200, Object.assign({ fonte: fontePublica(f) }, r.ok === false ? { error: f.estado.ultimoErro, code: (r.corpo && r.corpo.code) || 'erro' } : { ok: true, pendente: r.status === 202 }));
    }
    if (!parts[5] && req.method === 'DELETE') {
      if (fonte.tipo === 'pasta') {
        const r = await tirarDasTvs(sess, fonte, integ);
        if (r.status !== 200) return sendJson(res, r.status, Object.assign({}, r.corpo, { error: 'Não deu para tirar a pasta das TVs: ' + ((r.corpo && r.corpo.error) || 'tente de novo') }));
        for (const a of await db.listarArquivosDaFonte(fonte.id, t, true)) if (a.mediaId) await midia.apagar(db, t, a.mediaId).catch(() => false);
      }
      if (fonte.tipo === 'planilha') await apagarDestino(fonte, t);
      await db.removerFonte(fonte.id, t);
      await registrar(t, integ.id, 'fonte.apagada', '"' + fonte.nome + '"', quemDaSessao(sess));
      return sendJson(res, 200, { ok: true });
    }
    return erro(res, 405, 'metodo', 'método inválido');
  }

  // Apagar a planilha da integração apaga também o lugar onde ela aparecia (como desligar uma planilha em Preços).
  async function apagarDestino(fonte, t) {
    const id = fonte.config.destinoId;
    if (!id) return;
    if (fonte.config.uso === 'indicadores') { await db.removerConector(id, t).catch(() => 0); avisarTelas(t, 'kpis', {}).catch(() => {}); }
    else { await db.removerPlanilha(id, t).catch(() => 0); avisarTelas(t, 'planilhas', {}).catch(() => {}); }
  }

  const rotas = async function (req, res, parts, query, sess) {
    if (parts[1] === 'v1') { await api(req, res); return true; }
    if (parts[1] !== 'integracoes') return false;
    if (!sess) { erro(res, 401, 'sem-sessao', 'não autenticado'); return true; }
    await painel(req, res, parts, sess);
    return true;
  };

  /*
   * O relógio (server.js liga depois do banco): as fontes com mudança
   * esperando vão às TVs; os comunicados voltam na hora em que um começa ou
   * acaba; e a faxina apaga a mídia que saiu há mais de RETENCAO_MS e os
   * comunicados encerrados há mais de uma semana.
   */
  rotas.ligarRelogio = function () {
    const volta = async () => {
      try {
        for (const f of await db.fontesParaSincronizar(Date.now())) await sincronizar(f.id, f.tenantId);
      } catch (e) { erros.registrar(e, { onde: 'integrações: relógio' }); }
    };
    const faxina = async () => {
      try {
        const agora = Date.now();
        for (const a of await db.arquivosParaApagar(agora - I.RETENCAO_MS, 100)) {
          if (a.mediaId) await midia.apagar(db, a.tenantId, a.mediaId).catch(() => false);
          await db.apagarArquivoDaFonte(a.id);
        }
        for (const c of await db.comunicadosVencidos(agora - I.ENCERRADO_FICA_MS, 100)) {
          const integ = await db.integracaoDaConta(c.integracaoId, c.tenantId);
          if (integ) await tirarComunicado(integ, c.idExterno, 'MultiTelas (encerrado há uma semana)');
          else await db.removerComunicado(c.tenantId, c.integracaoId, c.idExterno);
        }
      } catch (e) { erros.registrar(e, { onde: 'integrações: faxina' }); }
    };
    setInterval(volta, Math.max(100, Math.min(5000, ESPERA_MS))).unref();
    setInterval(faxina, 10 * 60 * 1000).unref();
    setTimeout(faxina, 60 * 1000).unref();
    return { volta, faxina };
  };
  // Para o teste e para quem precisa saber o que vai acontecer (o painel e a documentação).
  rotas.sincronizar = sincronizar;
  return rotas;
};
