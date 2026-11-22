/*
 * server/integracoes.js — as regras das integrações (docs/INTEGRACOES.md).
 *
 * O servidor mora na nuvem e NÃO alcança a rede do cliente: o compartilhamento
 * onde o RH guarda os avisos, o Excel do cardápio, a intranet. Então um
 * programa pequeno, o Conector MultiTelas, roda num PC lá dentro e EMPURRA
 * para nós pela API pública (/api/v1, server/routes/integracoes.js). A
 * própria intranet usa a mesma API para publicar comunicados.
 *
 * Aqui mora só a regra pura, sem banco e sem HTTP, para o teste e as rotas
 * usarem a mesma: o token, o nome do arquivo (sem atalho para fora da
 * pasta), o tipo pelos BYTES, a configuração de cada fonte, o mapa das TVs,
 * os itens que cada arquivo e cada comunicado viram na TV, e as datas.
 *
 * O que é decidido no PAINEL e nunca pelo Conector: quais pastas, planilhas e
 * feeds existem, para quais TVs cada uma vai, em que zona, e se precisa de
 * aprovação. O Conector só manda o conteúdo.
 */
'use strict';

const crypto = require('crypto');
const K = require('./kpis');
const P = require('./planilha');
const storage = require('./storage');
const permissoes = require('./permissoes');

/* ---------------- Os limites (os mesmos que a documentação promete) ---------------- */

const LIMITES = {
  integracoesPorConta: 5,
  fontesPorTipo: 10,           // pastas, planilhas e feeds, cada um, por integração
  arquivosPorPasta: 200,       // 200 fotos a 10 s são 33 minutos de playlist: mais que isso não é playlist
  bytesPorPasta: 4 * 1024 * 1024 * 1024,
  // Os tetos de cada arquivo, coerentes com o upload do painel: a foto chega
  // encolhida a 2560 px lá (web/src/lib/subir.js); daqui do compartilhamento
  // ela vem como o RH salvou, e 20 MB já é uma foto de 6000 px.
  imagemBytes: 20 * 1024 * 1024,
  // O vídeo tem o teto do storage (MEDIA_MAX_FILE, 200 MB), o mesmo do painel.
  videoBytes: storage.MAX_FILE_BYTES,
  imagemRemotaBytes: 10 * 1024 * 1024,
  csvBytes: P.LIMITE_BYTES,
  // O balde por token: 120 pedidos por minuto (a primeira carga de uma pasta de 200 arquivos leva 2 minutos)…
  pedidosPorMinuto: 120,
  // …e 2 GB de arquivo por hora (o upload é o que pesa: banda e disco, não contagem).
  bytesPorHora: 2 * 1024 * 1024 * 1024,
  // Token errado por IP: o token tem 256 bits (não se adivinha), isto só poupa o banco de um laço.
  tokensErradosPorIp: 60,
  comunicadosPorIntegracao: 300,
  // A pasta reservada das imagens de um feed ("_feed-<chave>"): só fotos, e poucas (um feed mostra até 50 itens).
  imagensPorFeed: 200,
};
// De quanto em quanto tempo o Conector deve bater o ponto e conferir as pastas (a resposta do aperto de mão).
const INTERVALO_SEGUNDOS = 60;
// O arquivo trocado ou apagado fica este tempo: a TV que ainda não pegou a lista nova, o pedido de aprovação e o Desfazer.
const RETENCAO_MS = 15 * 24 * 60 * 60 * 1000;
// O comunicado que acabou fica este tempo no painel ("encerrado") e depois sai do banco.
const ENCERRADO_FICA_MS = 7 * 24 * 60 * 60 * 1000;

/* ---------------- O token ---------------- */

// "mti_" + 32 bytes aleatórios: 256 bits. O prefixo diz o que é (num log vazado, num e-mail) sem dizer de quem.
const PREFIXO_TOKEN = 'mti_';
const FORMATO_TOKEN = /^mti_[A-Za-z0-9_-]{43}$/;
const novoToken = () => PREFIXO_TOKEN + crypto.randomBytes(32).toString('base64url');
const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const dicaDoToken = (t) => String(t || '').slice(-4);
const tokenComFormato = (t) => FORMATO_TOKEN.test(String(t || ''));

/* ---------------- Textos curtos ---------------- */

const CONTROLE = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g');
const corta = (s, n) => String(s == null ? '' : s).replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
// O texto do comunicado guarda as quebras de linha (a TV mostra o parágrafo), e só elas.
const textoComLinhas = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').split('\n')
  .map((l) => l.replace(CONTROLE, ' ').replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const chaveLimpa = (s) => K.chaveDe(s);

/*
 * O nome de um arquivo da pasta, como o Conector manda (`:nome`, já
 * decodificado). Pode ter subpastas com "/" ("Avisos/dezembro.jpg"). O nome é
 * só DADO — o arquivo é guardado com uma chave sorteada (server/storage.js) —,
 * mas o contrato promete recusar o atalho para fora da pasta, e um nome com
 * ".." ou caminho absoluto quase sempre é um Conector com defeito: melhor
 * dizer na hora que gravar lixo.
 */
function nomeDoArquivo(bruto) {
  const s = String(bruto == null ? '' : bruto).normalize('NFC');
  if (!s) return { erro: 'falta o nome do arquivo' };
  if (s.length > 240) return { erro: 'o nome do arquivo passou de 240 caracteres' };
  if (new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(s)) return { erro: 'o nome do arquivo tem caractere de controle' };
  if (s.indexOf('\\') >= 0) return { erro: 'use "/" para as subpastas, não "\\"' };
  if (s.indexOf(':') >= 0) return { erro: 'o nome do arquivo não pode ter ":" (nem letra de unidade, como C:)' };
  if (s[0] === '/') return { erro: 'o nome é relativo à pasta: tire a "/" do começo' };
  const partes = s.split('/');
  if (partes.length > 8) return { erro: 'subpastas demais (no máximo 8 níveis)' };
  for (const p of partes) {
    if (!p.trim()) return { erro: 'o nome tem uma subpasta vazia ("//" ou "/" no fim)' };
    if (p === '.' || p === '..') return { erro: 'o nome não pode ter "." nem ".." (sair da pasta não é permitido)' };
  }
  return { nome: s };
}

/* ---------------- O tipo pelos BYTES ---------------- */

/*
 * O nome e o Content-Type são escritos por quem manda — um ".jpg" pode ser
 * qualquer coisa. O que entra é decidido pelos primeiros bytes (e, no
 * PPTX, pelos nomes de dentro do ZIP). `cabeca`: o começo do arquivo;
 * `cauda`: o fim (o índice do ZIP mora lá). Devolve { mime, tipo } ou null.
 *   tipo: 'imagem' | 'video' | 'documento'
 *
 * O 'documento' (PDF, PPTX) é RECONHECIDO para ser recusado com o motivo
 * certo (revisão de lançamento, 22/11): o tipo `pptx` da TV manda o
 * endereço relativo /media/ ao visualizador da Microsoft, que não o
 * alcança, e o WebView do Android não desenha PDF. O Conector converte os
 * slides em PNG no PC do cliente ("Apresentacao.pptx/01.png", "02.png"…).
 */
const MARCAS_MP4_RECUSADAS = ['qt  ', 'heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif', 'avis', 'M4A ', 'M4B ', 'M4P ', 'crx '];
function tipoPelosBytes(cabeca, cauda) {
  const b = cabeca || Buffer.alloc(0);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', tipo: 'imagem' };
  if (b.length >= 8 && b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', tipo: 'imagem' };
  if (b.length >= 12 && b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', tipo: 'imagem' };
  if (b.length >= 12 && b.slice(4, 8).toString('latin1') === 'ftyp') {
    const marca = b.slice(8, 12).toString('latin1');
    if (MARCAS_MP4_RECUSADAS.indexOf(marca) >= 0) return null;
    return { mime: 'video/mp4', tipo: 'video' };
  }
  if (b.length >= 5 && b.slice(0, 5).toString('latin1') === '%PDF-') return { mime: 'application/pdf', tipo: 'documento' };
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    // O PPTX é um ZIP com ppt/presentation.xml dentro; o DOCX (word/) e o XLSX (xl/) também são ZIP.
    const nomes = Buffer.concat([b, cauda || Buffer.alloc(0)]).toString('latin1');
    if (nomes.indexOf('ppt/presentation.xml') >= 0 || (nomes.indexOf('[Content_Types].xml') >= 0 && nomes.indexOf('ppt/') >= 0)) {
      return { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', tipo: 'documento' };
    }
    return null;
  }
  return null;
}
const TIPOS_ACEITOS = 'foto (JPG, PNG ou WEBP) nem vídeo MP4';
// A frase do 415 do PDF e do PPTX (o combinado com o Conector, que converte quando o PowerPoint está instalado).
const SLIDES_COMO_IMAGEM = 'Salve os slides como imagem; o Conector converte sozinho quando o PowerPoint está instalado';
// O que entra numa pasta: foto e vídeo. O documento é reconhecido só para a recusa dizer o que fazer.
const ACEITO = { imagem: true, video: true };
function tetoDo(tipo) {
  if (tipo === 'video') return Math.min(LIMITES.videoBytes, storage.MAX_FILE_BYTES);
  return Math.min(LIMITES.imagemBytes, storage.MAX_FILE_BYTES);
}
// O maior teto de todos: enquanto o corpo chega, o tipo ainda não é conhecido.
const tetoDoCorpo = () => Math.max(tetoDo('video'), tetoDo('imagem'));
const emMB = (b) => Math.round(b / (1024 * 1024)) + ' MB';

/* ---------------- A configuração de cada fonte (o painel decide) ---------------- */

const TIPOS_FONTE = ['pasta', 'planilha', 'feed'];
const ZONAS = ['principal', 'lateral'];
const ehObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// As TVs de uma fonte: todas, ou estas TVs e estes grupos ("Loja Centro"). `ids`: as TVs que existem na conta.
function alvoLimpo(a, ids) {
  const o = ehObjeto(a) ? a : {};
  const existem = new Set(ids || []);
  return {
    todas: o.todas === true,
    telas: (Array.isArray(o.telas) ? o.telas : []).map((t) => String(t || '').slice(0, 64)).filter((t) => existem.has(t)).slice(0, 1000),
    grupos: permissoes.limparGrupos(Array.isArray(o.grupos) ? o.grupos : []) || [],
  };
}
// As TVs do alvo, nesta conta, agora (a TV nova do grupo "Recepção" entra sozinha).
function telasDoAlvo(alvo, devices) {
  const a = alvo || {};
  const lista = devices || [];
  if (a.todas) return lista.map((d) => d.id);
  const ids = new Set(a.telas || []);
  const grupos = new Set((a.grupos || []).map(permissoes.chave));
  return lista.filter((d) => ids.has(d.id) || (d.grupo && grupos.has(permissoes.chave(d.grupo)))).map((d) => d.id);
}
const temAlvo = (a) => !!a && (a.todas || (a.telas && a.telas.length) || (a.grupos && a.grupos.length));

// O mapa de um feed JSON: onde estão a lista e os campos (o Conector lê; nós só guardamos).
const CAMPOS_DO_MAPA = ['lista', 'id', 'titulo', 'texto', 'imagem', 'link', 'inicio', 'fim'];
function mapaDoFeed(m) {
  const o = ehObjeto(m) ? m : {};
  const saida = {};
  for (const k of CAMPOS_DO_MAPA) saida[k] = corta(o[k], 80).replace(/[^\w.\-]/g, '');
  return saida;
}
/*
 * O endereço do feed é INTERNO (http://intranet/rss): é o Conector, lá
 * dentro, quem busca. O servidor nunca chama este endereço. Só se confere a
 * forma, e que não traga usuário e senha (ficariam em texto no painel).
 */
function urlDoFeed(bruto) {
  const s = corta(bruto, 500);
  if (!s) return { erro: 'diga o endereço do feed' };
  let u;
  try { u = new URL(s); } catch (e) { return { erro: 'o endereço do feed não é um link (comece com http:// ou https://)' }; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { erro: 'o endereço do feed precisa começar com http:// ou https://' };
  if (u.username || u.password) return { erro: 'não ponha usuário e senha no endereço do feed: eles ficariam visíveis no painel' };
  return { url: u.href };
}

/*
 * A configuração que o painel manda para uma fonte, limpa. `atual`: a de
 * antes (o que não veio fica). `ids`: as TVs da conta. Devolve { config } ou { erro }.
 */
function configDaFonte(tipo, b, atual, ids) {
  const o = ehObjeto(b) ? b : {};
  const antes = ehObjeto(atual) ? atual : {};
  const c = Object.assign({}, antes);
  const comTvs = tipo === 'pasta' || tipo === 'comunicados';
  if (comTvs) {
    if (o.alvo !== undefined) c.alvo = alvoLimpo(o.alvo, ids);
    if (!c.alvo) c.alvo = { todas: false, telas: [], grupos: [] };
    if (o.zona !== undefined) c.zona = ZONAS.indexOf(o.zona) >= 0 ? o.zona : 'principal';
    if (!c.zona) c.zona = 'principal';
    // "Precisa de aprovação": desligado até o dono ligar.
    if (o.aprovacao !== undefined) c.aprovacao = o.aprovacao === true;
    if (c.aprovacao === undefined) c.aprovacao = false;
  }
  if (tipo === 'pasta') {
    if (o.segundos !== undefined) c.segundos = Math.max(3, Math.min(120, Math.round(Number(o.segundos) || 10)));
    if (!c.segundos) c.segundos = 10;
    if (o.ordem !== undefined) c.ordem = o.ordem === 'data' ? 'data' : 'nome';
    if (!c.ordem) c.ordem = 'nome';
    if (o.ajuste !== undefined) c.ajuste = o.ajuste === 'preencher' ? 'preencher' : 'inteira';
    if (!c.ajuste) c.ajuste = 'inteira';
  }
  if (tipo === 'planilha') {
    // O uso é escolhido uma vez: trocar de preço para indicador seria outra planilha no painel.
    if (!c.uso) c.uso = o.uso === 'indicadores' ? 'indicadores' : 'precos';
  }
  if (tipo === 'feed') {
    if (o.url !== undefined || !c.url) {
      const u = urlDoFeed(o.url !== undefined ? o.url : c.url);
      if (u.erro) return { erro: u.erro };
      c.url = u.url;
    }
    if (o.formato !== undefined || !c.formato) c.formato = o.formato === 'json' ? 'json' : 'rss';
    if (o.mapa !== undefined) c.mapa = mapaDoFeed(o.mapa);
    if (c.formato !== 'json') delete c.mapa;
  }
  return { config: c };
}

/* ---------------- O que cada arquivo vira na TV ---------------- */

// O nome que a pessoa reconhece na lista da TV: o arquivo, sem a subpasta.
const nomeVisivel = (nome) => String(nome || '').split('/').pop().slice(0, 120);
const comparaNome = (a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR', { numeric: true, sensitivity: 'base' });

/*
 * OS SLIDES DE UMA APRESENTAÇÃO. O Conector converte o PPTX (ou o PDF) em
 * PNG e manda cada slide dentro de uma "pasta" com o nome do arquivo:
 * "Apresentacao.pptx/01.png", "02.png"… Esses ficam JUNTOS na playlist, na
 * ordem do nome, mesmo com a pasta em "mais novo primeiro": o slide 3 não
 * pode passar antes do 1 só porque foi salvo depois.
 */
const APRESENTACAO = /\.(pptx?|pdf|odp|key)$/i;
function deckDe(nome) {
  const partes = String(nome || '').split('/');
  if (partes.length < 2) return '';
  const pai = partes.slice(0, -1).join('/');
  return APRESENTACAO.test(partes[partes.length - 2]) ? pai : '';
}
// "Apresentacao.pptx/01.png" vira "Apresentacao · 01" na lista da TV.
function nomeNaTv(nome) {
  const deck = deckDe(nome);
  if (!deck) return nomeVisivel(nome);
  return (deck.split('/').pop().replace(APRESENTACAO, '') + ' · ' + nomeVisivel(nome).replace(/\.[a-z0-9]{2,4}$/i, '')).slice(0, 120);
}

/*
 * Os itens da playlist de uma pasta, na ordem dela. A foto fica o tempo que
 * a pasta diz (duracaoManual: a régua do rodízio não recalcula) e o vídeo
 * toca inteiro. "Por nome" é a ordem do nome com os números como números
 * ("2" antes de "10"); "por data", o mais novo primeiro — a apresentação
 * conta como um bloco, na data do slide mais novo dela.
 */
function itensDaPasta(arquivos, config) {
  const c = config || {};
  const seg = Math.max(3, Math.min(120, Number(c.segundos) || 10));
  const lista = (arquivos || []).filter((a) => a && a.url && !a.removidoEm && /^(image|video)\//.test(a.mime || ''));
  const blocos = new Map();
  for (const a of lista) {
    const k = deckDe(a.nome) || '\u0000' + a.nome;
    if (!blocos.has(k)) blocos.set(k, { nome: deckDe(a.nome) || a.nome, em: 0, arquivos: [] });
    const b = blocos.get(k);
    b.arquivos.push(a);
    b.em = Math.max(b.em, Number(a.em) || 0);
  }
  const ordenados = [...blocos.values()];
  ordenados.forEach((b) => b.arquivos.sort(comparaNome));
  ordenados.sort(c.ordem === 'data' ? (a, b) => (b.em - a.em) || comparaNome(a, b) : comparaNome);
  return [].concat(...ordenados.map((b) => b.arquivos)).map((a) => {
    const nome = nomeNaTv(a.nome);
    if (/^video\//.test(a.mime)) return { type: 'video', src: a.url, muted: true, loop: false, fit: 'contain', duracao: 0, nome };
    return { type: 'image', src: a.url, fit: c.ajuste === 'preencher' ? 'cover' : 'contain', duracao: seg, nome, meta: { duracaoManual: true } };
  });
}

/* ---------------- Os comunicados ---------------- */

/*
 * As datas como a intranet manda (ISO 8601). Sem fuso, vale o horário de
 * Brasília (-03:00, sem horário de verão desde 2019): a intranet que escreve
 * "2026-12-01T08:00" quer dizer 8h aqui, e não 8h em Londres. Só a data:
 * o começo vale da meia-noite e o fim até 23:59:59 do dia.
 */
const FUSO = '-03:00';
function lerData(v, fimDoDia) {
  if (v == null || v === '') return { ms: 0 };
  const s = String(v).trim();
  let texto = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) texto = s + (fimDoDia ? 'T23:59:59' : 'T00:00:00') + FUSO;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/.test(s)) texto = s + FUSO;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) texto = s;
  const ms = texto ? Date.parse(texto) : NaN;
  const ano = Number(s.slice(0, 4));
  if (!Number.isFinite(ms) || ano < 2000 || ano > 2100) return { erro: 'data inválida: "' + s.slice(0, 40) + '" (use ISO 8601, como 2026-12-01 ou 2026-12-01T08:00:00-03:00)' };
  return { ms };
}
// O dia (AAAA-MM-DD) em Brasília, para o agendamento que a TV confere.
function diaEmBrasilia(ms) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms); }
  catch (e) { return new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 10); }
}

/*
 * A PASTA RESERVADA DE UM FEED. O Conector baixa a imagem de cada item do
 * feed (ela mora na intranet, que o servidor não alcança) e sobe para
 * "_feed-<chave do feed>"; o comunicado aponta para lá. O "_" não existe
 * nas chaves que o painel cria (chaveLimpa), então não colide com pasta
 * nenhuma. Devolve a chave do feed, ou '' se não for a reservada.
 */
const PREFIXO_FEED = '_feed-';
function feedDaPasta(chave) {
  const s = String(chave || '');
  if (!s.startsWith(PREFIXO_FEED)) return '';
  const k = chaveLimpa(s.slice(PREFIXO_FEED.length));
  return k && k === s.slice(PREFIXO_FEED.length) ? k : '';
}
// A chave de uma pasta como aparece no "pasta:" do comunicado: a do painel, ou a reservada de um feed.
function chaveDaPasta(bruta) {
  const f = feedDaPasta(bruta);
  return f ? PREFIXO_FEED + f : chaveLimpa(bruta);
}

/*
 * O STATUS DE UMA RECUSA. O Conector repete o 400 (pedido estragado no
 * caminho: o arquivo chegou cortado, o sha não bate) e NÃO repete 413, 415
 * nem 422 enquanto o conteúdo não mudar. Então o que é do conteúdo — um nome
 * de arquivo que não serve, um campo do comunicado, a imagem que não existe —
 * é 422; repetir o mesmo pedido a cada minuto só encheria o log dos dois lados.
 */
const RECUSA_DO_CONTEUDO = ['nome-invalido', 'campo-invalido', 'imagem-invalida', 'imagem-nao-encontrada'];
const statusDaRecusa = (code) => (RECUSA_DO_CONTEUDO.indexOf(code) >= 0 ? 422 : 400);

// O id que a intranet dá ao comunicado: o que for, curto e sem caractere de controle.
function idExternoLimpo(bruto) {
  const s = String(bruto == null ? '' : bruto).normalize('NFC');
  if (!s.trim()) return { erro: 'falta o id do comunicado no endereço' };
  if (s.length > 200) return { erro: 'o id do comunicado passou de 200 caracteres' };
  if (new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(s)) return { erro: 'o id do comunicado tem caractere de controle' };
  return { id: s };
}

/*
 * O corpo do PUT /api/v1/comunicados/:idExterno, conferido:
 *   { titulo, texto?, imagemUrl?, inicio?, fim?, destaque?, link? }
 * Devolve { dados, inicio, fim, imagem } — `imagem` é o pedido de imagem
 * ({ pasta, nome } ou { url }), resolvido por quem chama — ou { erro, code }.
 */
function lerComunicado(b, opcoes) {
  // `opcoes.httpDeTeste(url)`: só o teste local (INTEGRACAO_HOST_TESTE, fora de produção) serve imagem em http.
  const httpDeTeste = (opcoes && opcoes.httpDeTeste) || (() => false);
  if (!ehObjeto(b)) return { erro: 'o corpo precisa ser um objeto JSON, como {"titulo": "Festa de fim de ano"}', code: 'json-invalido' };
  const titulo = corta(b.titulo, 120);
  if (!titulo) return { erro: 'falta o título do comunicado', code: 'campo-invalido' };
  const texto = textoComLinhas(b.texto, 600);
  const ini = lerData(b.inicio, false);
  if (ini.erro) return { erro: 'inicio: ' + ini.erro, code: 'campo-invalido' };
  const fim = lerData(b.fim, true);
  if (fim.erro) return { erro: 'fim: ' + fim.erro, code: 'campo-invalido' };
  if (ini.ms && fim.ms && fim.ms <= ini.ms) return { erro: 'o fim precisa ser depois do início', code: 'campo-invalido' };
  let link = '';
  if (b.link != null && b.link !== '') {
    const l = corta(b.link, 300);
    try {
      const u = new URL(l);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('protocolo');
      link = u.href;
    } catch (e) { return { erro: 'o link precisa começar com http:// ou https://', code: 'campo-invalido' }; }
  }
  let imagem = null;
  if (b.imagemUrl != null && b.imagemUrl !== '') {
    const s = String(b.imagemUrl).trim().slice(0, 1000);
    if (/^pasta:/i.test(s)) {
      const resto = s.slice(6);
      const barra = resto.indexOf('/');
      // "_feed-<chave do feed>": a pasta reservada onde o Conector põe as imagens dos itens de um feed.
      const chave = barra > 0 ? chaveDaPasta(resto.slice(0, barra)) : '';
      const n = barra > 0 ? nomeDoArquivo(resto.slice(barra + 1)) : { erro: 'x' };
      if (!chave || n.erro) return { erro: 'imagemUrl de pasta é "pasta:<chave da pasta>/<nome do arquivo>"', code: 'imagem-invalida' };
      imagem = { pasta: chave, nome: n.nome };
    } else if (/^https:\/\//i.test(s) || httpDeTeste(s)) {
      imagem = { url: s };
    } else {
      return { erro: 'a imagem precisa ser um endereço https:// público ou um arquivo já enviado a uma pasta ("pasta:<chave>/<nome>")', code: 'imagem-invalida' };
    }
  }
  return { dados: { titulo, texto, link, destaque: b.destaque === true }, inicio: ini.ms, fim: fim.ms, imagem };
}

// Em que pé está o comunicado agora: 'agendado' (ainda não começou), 'no-ar' ou 'encerrado'.
function situacao(c, agora) {
  if (c.fim && c.fim <= agora) return 'encerrado';
  if (c.inicio && c.inicio > agora) return 'agendado';
  return 'no-ar';
}
/*
 * Os que estão no ar AGORA, os em destaque na frente e depois os mais novos;
 * e a próxima vez em que a lista muda sozinha (um começa ou um acaba) — o
 * relógio volta nessa hora para pôr ou tirar da TV. 0: nada marcado.
 */
function agendaDosComunicados(lista, agora) {
  const ativos = [];
  let proxima = 0;
  const marca = (t) => { if (t > agora && (!proxima || t < proxima)) proxima = t; };
  for (const c of lista || []) {
    const s = situacao(c, agora);
    if (s === 'no-ar') ativos.push(c);
    if (c.inicio) marca(c.inicio);
    if (c.fim) marca(c.fim);
  }
  ativos.sort((a, b) => (Number(!!b.dados.destaque) - Number(!!a.dados.destaque)) || ((b.inicio || b.criadoEm) - (a.inicio || a.criadoEm)) || String(a.idExterno).localeCompare(String(b.idExterno)));
  return { ativos: ativos.slice(0, 50), proxima };
}

// O link aparece escrito no rodapé do aviso (a TV não é clicável): sem o https:// e sem a barra do fim.
const linkVisivel = (l) => String(l || '').replace(/^https?:\/\//i, '').replace(/\/$/, '').slice(0, 80);

/*
 * O comunicado na TV: o Aviso (type 'announce', a variação "Comunicado") —
 * título, texto e o link escrito no rodapé. Com imagem, a foto vai junto,
 * logo antes do aviso (o Aviso não desenha foto). O fim vale duas vezes: o
 * servidor tira da TV na hora (o relógio), e a própria TV esconde depois
 * dele (meta.expiraEm, js/player.js) — mesmo se ficar sem falar conosco.
 */
function itensDoComunicado(c, imagemUrl) {
  const d = c.dados || {};
  const meta = Object.assign({ tipo: 'comunicado' }, d.destaque ? { prioridade: 'alta' } : {}, c.fim ? { expiraEm: c.fim } : {});
  const base = { _comunicado: String(c.idExterno).slice(0, 120) };
  if (c.fim) base.agendamento = { ativo: true, dias: [], dataInicio: c.inicio ? diaEmBrasilia(c.inicio) : '', dataFim: diaEmBrasilia(c.fim) };
  const aviso = Object.assign({ type: 'announce', tipo: 'comunicado', titulo: d.titulo, duracao: 12 },
    d.texto ? { corpo: d.texto } : {}, d.link ? { info: linkVisivel(d.link) } : {}, d.destaque ? { etiqueta: 'Em destaque' } : {},
    base, { meta });
  const lista = [];
  if (imagemUrl) lista.push(Object.assign({ type: 'image', src: imagemUrl, fit: 'contain', duracao: 10, titulo: d.titulo }, base, { meta: Object.assign({}, meta, { duracaoManual: true }) }));
  lista.push(aviso);
  return lista;
}

// O que foi para a TV da última vez, resumido: igual, a sincronização não manda nada.
const resumo = (x) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('base64').slice(0, 27);

/* ---------------- O CSV que o Conector manda ---------------- */

/*
 * O corpo do PUT /api/v1/planilhas/:chave em texto. O Conector converte o
 * .xlsx para CSV lá dentro; se mandar o .xlsx cru (um ZIP), dizemos. Em
 * UTF-8 (o combinado); se não for UTF-8 válido, é o CSV do Excel em
 * português (Windows-1252) e lemos como latin1, que acerta os acentos.
 */
function textoDoCsv(buf, contentType) {
  const b = buf || Buffer.alloc(0);
  if (!b.length) return { erro: 'o CSV veio vazio', code: 'csv-vazio' };
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return { erro: 'isto é um .xlsx: o Conector precisa converter a primeira aba para CSV antes de mandar', code: 'tipo-nao-aceito', status: 415 };
  if (b.indexOf(0) >= 0) return { erro: 'o corpo não é texto: mande a planilha como CSV', code: 'tipo-nao-aceito', status: 415 };
  const latin = /charset=(iso-8859-1|latin1|windows-1252|cp1252)/i.test(String(contentType || ''));
  let texto = latin ? b.toString('latin1') : b.toString('utf8');
  if (!latin && texto.indexOf('�') >= 0) texto = b.toString('latin1');
  return { texto };
}

module.exports = {
  PREFIXO_FEED, feedDaPasta, chaveDaPasta, RECUSA_DO_CONTEUDO, statusDaRecusa,
  LIMITES, INTERVALO_SEGUNDOS, RETENCAO_MS, ENCERRADO_FICA_MS, PREFIXO_TOKEN, TIPOS_FONTE, ZONAS, TIPOS_ACEITOS, SLIDES_COMO_IMAGEM, ACEITO,
  novoToken, hashToken, dicaDoToken, tokenComFormato,
  corta, chaveLimpa, nomeDoArquivo, nomeVisivel, nomeNaTv, deckDe, tipoPelosBytes, tetoDo, tetoDoCorpo, emMB,
  alvoLimpo, telasDoAlvo, temAlvo, mapaDoFeed, urlDoFeed, configDaFonte,
  itensDaPasta, lerData, diaEmBrasilia, idExternoLimpo, lerComunicado, situacao, agendaDosComunicados, itensDoComunicado, linkVisivel,
  resumo, textoDoCsv,
};
