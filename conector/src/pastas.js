'use strict';
/*
 * A pasta de rede do RH (\\servidor\Comunicacao\TV) → a pasta no MultiTelas.
 *
 * Três regras guiam tudo aqui:
 *
 * 1. Pasta fora do ar NÃO é pasta vazia. Se o compartilhamento não abre, ou
 *    uma subpasta falha no meio da leitura, nada é apagado do servidor. E
 *    mesmo com a leitura completa, um arquivo só é apagado lá depois de
 *    sumir em `ciclosParaApagar` leituras seguidas: o "salvar" do Office e do
 *    Photoshop renomeia o original por um instante, e sem isso a TV piscaria.
 *
 * 2. Só sai daqui o que está DENTRO da pasta configurada: atalho (symlink,
 *    junção) que aponta para fora é ignorado, e o caminho real é conferido de
 *    novo antes de cada envio. Só as extensões que a TV mostra.
 *
 * 3. Arquivo pela metade não sobe. Cópia grande pela rede leva minutos: o
 *    arquivo só vai quando tamanho e data ficam parados por
 *    `segundosParaEstabilizar`. O sha256 decide o que mudou (e fica guardado
 *    por tamanho+data, para não reler um vídeo inteiro pela rede a cada minuto).
 */
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { registrarErro, fonte } = require('./estado');
const { ErroDoServidor, TokenRevogado, SemConexao } = require('./rede');
const { ConversorIndisponivel } = require('./conversor');

// Vão como estão.
const TIPOS = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  mp4: 'video/mp4',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};
// Viram uma imagem por slide/página aqui (a TV não toca PowerPoint nem PDF;
// o servidor recusa os dois). Veja conversor.js.
const CONVERTIDOS = { pptx: 'pptx', ppt: 'pptx', pdf: 'pdf' };
const EXTENSOES = Object.keys(TIPOS).concat(Object.keys(CONVERTIDOS));
// Conversão que falhou (arquivo protegido, travou) só é tentada de novo
// depois disto, ou quando o arquivo muda: abrir o PowerPoint a cada minuto não.
const ESPERA_APOS_FALHA_MS = 60 * 60 * 1000;

const SISTEMA = new Set(['thumbs.db', 'ehthumbs.db', 'ehthumbs_vista.db', 'desktop.ini', '.ds_store', 'icon\r', '$recycle.bin', 'system volume information', '@eadir', '#recycle', '#snapshot', '.snapshot', '~snapshot', 'lost+found']);
const SUFIXOS_TEMPORARIOS = ['.tmp', '.temp', '.part', '.partial', '.crdownload', '.download', '.filepart', '.!ut', '.swp', '.lock'];

class PastaInacessivel extends Error {
  constructor(raiz, causa) {
    super(explicarErroDeArquivo(causa, raiz));
    this.name = 'PastaInacessivel';
    this.causa = causa;
  }
}

// O código do erro do Windows/libuv em português, com a pista do que fazer.
function explicarErroDeArquivo(e, onde) {
  const c = (e && e.code) || '';
  if (c === 'ENOENT') return '"' + onde + '" não existe ou o servidor não respondeu';
  if (c === 'EACCES' || c === 'EPERM') return 'sem permissão para ler "' + onde + '": a conta que roda o conector precisa ter leitura nesse compartilhamento';
  if (c === 'EBUSY') return '"' + onde + '" está em uso por outro programa';
  if (c === 'ENOTDIR') return '"' + onde + '" não é uma pasta';
  if (['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'EIO', 'UNKNOWN', 'EBADF'].includes(c)) return 'o servidor de arquivos de "' + onde + '" não respondeu (' + c + ')';
  return 'não consegui ler "' + onde + '": ' + ((e && e.message) || c || 'erro desconhecido');
}

function extensao(nome) {
  const i = nome.lastIndexOf('.');
  return i > 0 ? nome.slice(i + 1).toLowerCase() : '';
}

function tipoDe(nome) { return TIPOS[extensao(nome)] || null; }
function conversaoDe(nome) { return CONVERTIDOS[extensao(nome)] || null; }

// Por que este nome nem entra na conta (arquivo de sistema, temporário, oculto).
function motivoParaIgnorar(nome) {
  const n = nome.toLowerCase();
  if (SISTEMA.has(n)) return 'arquivo do sistema';
  if (n.startsWith('~$')) return 'arquivo temporário do Office (documento aberto)';
  if (n.startsWith('~')) return 'arquivo temporário';
  if (n.startsWith('.')) return 'arquivo oculto';
  if (SUFIXOS_TEMPORARIOS.some((s) => n.endsWith(s))) return 'arquivo temporário (ainda sendo gravado ou baixado)';
  return null;
}

/*
 * O nome que vai para o servidor: relativo, com "/", sem "..", sem caminho
 * absoluto, sem caractere de controle. Vem da listagem da pasta (não de
 * fora), mas é conferido de novo: é ele que vira a URL do PUT.
 */
function nomeSeguro(rel) {
  if (typeof rel !== 'string' || !rel || rel.length > 400) return false;
  if (/[\u0000-\u001f\u007f\\]/.test(rel)) return false;
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return false;
  return rel.split('/').every((p) => p && p !== '.' && p !== '..' && p.length <= 255 && !/[<>:"|?*]/.test(p));
}

// "dentro" no sentido do Windows também: C:\TV\x está em c:\tv.
function dentro(raiz, alvo) {
  const igual = process.platform === 'win32' ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b;
  const r = path.resolve(raiz);
  const a = path.resolve(alvo);
  if (igual(r, a)) return true;
  const comBarra = r.endsWith(path.sep) ? r : r + path.sep;
  return igual(a.slice(0, comBarra.length), comBarra);
}

const nfc = (s) => s.normalize('NFC');
// O Windows não diferencia maiúscula em caminho; o Linux (testes) diferencia.
const chaveDeCaminho = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);

/*
 * Lê a pasta inteira (com subpastas). Lança PastaInacessivel se nem a raiz
 * abre. `completa: false` quando alguma parte falhou: aí o envio do que foi
 * lido segue, mas nenhuma exclusão acontece.
 */
async function lerPasta(raiz, op = {}) {
  const maxArquivos = op.maxArquivos || 5000;
  const maxProfundidade = op.maxProfundidade || 12;
  let real;
  try {
    real = await fsp.realpath(raiz);
    const st = await fsp.stat(real);
    if (!st.isDirectory()) throw Object.assign(new Error('não é pasta'), { code: 'ENOTDIR' });
  } catch (e) {
    throw new PastaInacessivel(raiz, e);
  }
  const arquivos = [];
  const presentes = new Set();
  const ignorados = [];
  const problemas = [];
  let completa = true;
  const visitadas = new Set([chaveDeCaminho(real)]);
  const fila = [{ dir: real, rel: '', prof: 0 }];

  while (fila.length) {
    const { dir, rel, prof } = fila.shift();
    let entradas;
    try {
      entradas = await fsp.readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (dir === real) throw new PastaInacessivel(raiz, e);
      completa = false;
      problemas.push(explicarErroDeArquivo(e, rel || raiz));
      continue;
    }
    // Em ordem de nome: o log e o "testar" saem iguais em qualquer sistema de arquivos.
    entradas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entradas) {
      const nome = nfc(ent.name);
      const relNome = rel ? rel + '/' + nome : nome;
      const motivo = motivoParaIgnorar(nome);
      if (motivo) { ignorados.push({ nome: relNome, motivo }); continue; }
      const cheio = path.join(dir, ent.name);
      let alvo = cheio;
      const atalho = ent.isSymbolicLink();
      if (atalho) {
        try { alvo = await fsp.realpath(cheio); } catch (e) { ignorados.push({ nome: relNome, motivo: 'atalho quebrado' }); continue; }
        if (!dentro(real, alvo)) { ignorados.push({ nome: relNome, motivo: 'atalho que aponta para fora da pasta configurada (não é enviado)' }); continue; }
      }
      let st;
      try { st = await fsp.stat(alvo); } catch (e) {
        // Existe mas não deu para ver: conta como presente (não apaga) e a leitura não é completa.
        presentes.add(relNome);
        completa = false;
        problemas.push(explicarErroDeArquivo(e, relNome));
        continue;
      }
      if (st.isDirectory()) {
        // Pasta comum também passa pelo caminho real: no Windows, uma junção
        // pode não se declarar como atalho, e é por ela que se sairia da pasta.
        let realDir = alvo;
        if (!atalho) {
          try { realDir = await fsp.realpath(cheio); } catch (e) { completa = false; problemas.push(explicarErroDeArquivo(e, relNome)); continue; }
          if (!dentro(real, realDir)) { ignorados.push({ nome: relNome, motivo: 'pasta que aponta para fora da pasta configurada (não é lida)' }); continue; }
        }
        if (visitadas.has(chaveDeCaminho(realDir))) continue; // atalho em círculo
        if (prof + 1 > maxProfundidade) {
          // Não lida: o que houver nela não pode ser apagado lá.
          ignorados.push({ nome: relNome, motivo: 'subpasta funda demais (mais de ' + maxProfundidade + ' níveis)' });
          completa = false;
          continue;
        }
        visitadas.add(chaveDeCaminho(realDir));
        fila.push({ dir: realDir, rel: relNome, prof: prof + 1 });
        continue;
      }
      if (!st.isFile()) continue;
      presentes.add(relNome);
      const conversao = conversaoDe(nome);
      if (!tipoDe(nome) && !conversao) { ignorados.push({ nome: relNome, motivo: 'extensão não permitida (só ' + EXTENSOES.join(', ') + ')' }); continue; }
      if (!nomeSeguro(relNome)) { ignorados.push({ nome: relNome, motivo: 'nome com caractere que não dá para enviar' }); continue; }
      arquivos.push({ nome: relNome, caminho: alvo, tamanho: st.size, mtimeMs: st.mtimeMs, conversao });
      if (arquivos.length >= maxArquivos) {
        completa = false;
        problemas.push('mais de ' + maxArquivos + ' arquivos: o resto ficou para depois');
        fila.length = 0;
        break;
      }
    }
  }
  return { raiz: real, arquivos, presentes, ignorados, problemas, completa };
}

async function sha256DoArquivo(caminho) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const f = fs.createReadStream(caminho);
    f.on('error', reject);
    f.on('data', (d) => h.update(d));
    f.on('end', () => resolve(h.digest('hex')));
  });
}

function assinatura(a) { return a.tamanho + ':' + Math.round(a.mtimeMs); }

/*
 * "Este arquivo já parou de ser gravado?" Pronto quando a data dele tem mais
 * de N segundos, ou quando a última leitura viu o mesmo tamanho e data há
 * mais de N segundos. Se mudou desde a última leitura, espera de novo.
 */
function estavel(vistos, arq, agora, segundos) {
  const sig = assinatura(arq);
  const v = vistos[arq.nome];
  const ms = segundos * 1000;
  if (!v || v.sig !== sig) {
    vistos[arq.nome] = { sig, desde: agora };
    if (v) return false; // mudou desde a leitura anterior: ainda está sendo gravado
    return agora - arq.mtimeMs >= ms;
  }
  return agora - v.desde >= ms || agora - arq.mtimeMs >= ms;
}

function mb(bytes) { return (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',') + ' MB'; }

/*
 * Converte (ou reaproveita a conversão guardada) um .pptx/.pdf: devolve as
 * páginas [{ nome: "Apresentacao.pptx/01.png", arquivo, sha256, tamanho }].
 * As imagens ficam em <pasta do conector>/convertidos/<chave>/<hash>/, para
 * reenviar sem reconverter se o servidor perder alguma.
 */
async function paginasDe(ctx, pasta, est, arq, sha, raizReal) {
  const conv = est.convertidos[arq.nome];
  if (conv && conv.sha256 === sha && conv.paginas.every((p) => fs.existsSync(p.arquivo))) return conv.paginas;
  // Nome + conteúdo: duas cópias iguais com nomes diferentes não dividem (nem apagam) a mesma pasta.
  const dir = path.join(ctx.pastaConvertidos, pasta.chave, crypto.createHash('sha256').update(arq.nome + '\n' + sha).digest('hex').slice(0, 32));
  const saida = path.join(dir, 'paginas');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(saida, { recursive: true });
  try {
    // Converte uma cópia local: o PowerPoint e o WinRT lidam mal com caminho
    // de rede, e a cópia é exatamente o que foi conferido.
    const real = await fsp.realpath(arq.caminho);
    if (!dentro(raizReal, real)) throw new Error('passou a apontar para fora da pasta');
    const origem = path.join(dir, 'origem.' + extensao(arq.nome));
    await fsp.copyFile(real, origem);
    const r = await ctx.conversor.converter(arq.conversao, origem, saida);
    fs.rmSync(origem, { force: true });
    const digitos = String(r.paginas.length).length > 2 ? 3 : 2;
    const paginas = [];
    for (let i = 0; i < r.paginas.length; i++) {
      const arquivo = r.paginas[i];
      const bytes = await fsp.readFile(arquivo);
      // O nome no servidor fica agrupado e em ordem: "Apresentacao.pptx/01.png".
      paginas.push({ nome: arq.nome + '/' + String(i + 1).padStart(digitos, '0') + '.png', arquivo, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), tamanho: bytes.length });
    }
    if (conv && conv.dir && conv.dir !== dir) fs.rmSync(conv.dir, { recursive: true, force: true });
    est.convertidos[arq.nome] = { sha256: sha, dir, paginas };
    return paginas;
  } catch (e) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}

const COMO_SALVAR = {
  pptx: 'Peça para salvar os slides como imagens (no PowerPoint: Arquivo › Exportar › Alterar o tipo de arquivo › PNG, "Todos os slides") e colocar as imagens na pasta.',
  pdf: 'Peça para salvar as páginas como imagens (JPG ou PNG) e colocar na pasta.',
};

/*
 * Um ciclo de uma pasta: lê, compara com o servidor, envia o que mudou e
 * apaga lá o que sumiu aqui (com as travas descritas no topo).
 * `simular` (o comando "testar") faz tudo menos PUT/DELETE, não converte, e
 * não grava estado.
 */
async function sincronizarPasta(ctx, pasta) {
  const { api, estado, log, cfg } = ctx;
  const agora = ctx.agora ? ctx.agora() : Date.now();
  const id = 'pasta:' + pasta.chave;
  const rotulo = 'Pasta "' + (pasta.nome || pasta.chave) + '"';
  const est = estado.pastas[pasta.chave] || (estado.pastas[pasta.chave] = {});
  for (const k of ['hashes', 'vistos', 'faltando', 'recusados', 'convertidos', 'falhasConversao']) if (!est[k] || typeof est[k] !== 'object') est[k] = {};
  const f = fonte(estado, id, { tipo: 'pasta', chave: pasta.chave, nome: pasta.nome || pasta.chave, origem: pasta.raiz, ultimaTentativa: agora });
  const resumo = { enviados: [], apagados: [], fila: [], ignorados: [], recusados: [], erros: [], completa: false, lidos: 0, convertidos: [] };

  let leitura;
  try {
    leitura = await lerPasta(pasta.raiz);
  } catch (e) {
    if (!(e instanceof PastaInacessivel)) throw e;
    const msg = rotulo + ': ' + e.message + '. Nada foi enviado nem apagado; tento de novo no próximo ciclo.';
    log.umaVez(id + '|inacessivel', 'erro', msg);
    registrarErro(estado, id, e.message, agora);
    f.ultimoErro = e.message;
    resumo.erros.push(e.message);
    resumo.inacessivel = true;
    return resumo;
  }
  if (log.esquecer(id + '|inacessivel')) log.info(rotulo + ' voltou a abrir.');
  resumo.completa = leitura.completa;
  resumo.ignorados = leitura.ignorados;
  resumo.lidos = leitura.arquivos.length;
  for (const p of leitura.problemas) log.umaVez(id + '|problema|' + p, 'aviso', rotulo + ': ' + p + '.');

  // O que já está lá. Se esta listagem falhar, o ciclo desta pasta para aqui:
  // sem saber o que existe, nem enviar com segurança dá.
  const lista = await api.listarPasta(pasta.chave);
  const remoto = new Map();
  for (const a of (lista && Array.isArray(lista.arquivos) ? lista.arquivos : [])) if (a && typeof a.nome === 'string') remoto.set(nfc(a.nome), a);

  // As imagens de um .pptx/.pdf que ainda não deu para (re)converter ficam lá
  // como estão: nada sob "Apresentacao.pptx/" é apagado enquanto o arquivo existir.
  const protegidos = [];
  const presente = (nome) => leitura.presentes.has(nome) || protegidos.some((p) => nome.startsWith(p));
  // Sem PowerPoint (ou PowerShell bloqueado) nesta máquina: não adianta abrir
  // um powershell por arquivo a cada minuto. Lembra por 1 hora.
  const memoria = ctx.memoria || {};
  const semConversor = memoria.semConversor || (memoria.semConversor = {});
  const avisarSemConversor = (arq, msg) => {
    log.umaVez(id + '|conversao|' + arq.nome, 'aviso', rotulo + ': "' + arq.nome + '" NÃO foi para a TV: ' + msg + '. ' + COMO_SALVAR[arq.conversao] + ' O resto da pasta continua sincronizando.');
    resumo.recusados.push({ nome: arq.nome, motivo: msg });
  };

  const maxBytes = cfg.tamanhoMaximoMB * 1024 * 1024;
  const enviar = [];
  for (const arq of leitura.arquivos) {
    const proteger = () => { if (arq.conversao) protegidos.push(arq.nome + '/'); };
    if (arq.tamanho > maxBytes) {
      log.umaVez(id + '|grande|' + arq.nome + '|' + assinatura(arq), 'aviso', rotulo + ': "' + arq.nome + '" tem ' + mb(arq.tamanho)
        + ', acima do limite de ' + cfg.tamanhoMaximoMB + ' MB, e NÃO foi enviado. Reduza o arquivo ou aumente "tamanhoMaximoMB" no conector.json.');
      resumo.recusados.push({ nome: arq.nome, motivo: 'acima de ' + cfg.tamanhoMaximoMB + ' MB' });
      proteger();
      continue;
    }
    if (arq.tamanho === 0) { resumo.fila.push({ nome: arq.nome, motivo: 'arquivo vazio (ainda sendo copiado?)' }); proteger(); continue; }
    if (!estavel(est.vistos, arq, agora, cfg.segundosParaEstabilizar)) {
      resumo.fila.push({ nome: arq.nome, motivo: 'esperando terminar de ser copiado' });
      proteger();
      continue;
    }
    const sig = assinatura(arq);
    let sha = est.hashes[arq.nome] && est.hashes[arq.nome].sig === sig ? est.hashes[arq.nome].sha256 : null;
    if (!sha) {
      try {
        sha = await sha256DoArquivo(arq.caminho);
        // Conferido de novo depois de ler: se mexeram no meio, espera o próximo ciclo.
        const st = await fsp.stat(arq.caminho);
        if (assinatura({ tamanho: st.size, mtimeMs: st.mtimeMs }) !== sig) {
          est.vistos[arq.nome] = { sig: assinatura({ tamanho: st.size, mtimeMs: st.mtimeMs }), desde: agora };
          resumo.fila.push({ nome: arq.nome, motivo: 'mudou enquanto era lido' });
          proteger();
          continue;
        }
        est.hashes[arq.nome] = { sig, sha256: sha };
      } catch (e) {
        resumo.fila.push({ nome: arq.nome, motivo: explicarErroDeArquivo(e, arq.nome) });
        proteger();
        continue;
      }
    }

    if (arq.conversao) {
      const conv = est.convertidos[arq.nome];
      const pronta = conv && conv.sha256 === sha && conv.paginas.every((p) => fs.existsSync(p.arquivo));
      if (!pronta) {
        const falha = est.falhasConversao[arq.nome];
        if (falha && falha.sha256 === sha && agora - falha.em < ESPERA_APOS_FALHA_MS) { resumo.recusados.push({ nome: arq.nome, motivo: falha.motivo }); proteger(); continue; }
        const sem = semConversor[arq.conversao];
        if (sem && agora - sem.em < ESPERA_APOS_FALHA_MS) { avisarSemConversor(arq, sem.msg); proteger(); continue; }
        if (ctx.simular) { resumo.enviados.push(arq.nome + ' (vira imagens, uma por ' + (arq.conversao === 'pdf' ? 'página' : 'slide') + ')'); proteger(); continue; }
      }
      let paginas;
      try {
        paginas = await paginasDe(ctx, pasta, est, arq, sha, leitura.raiz);
        delete est.falhasConversao[arq.nome];
        log.esquecer(id + '|conversao|' + arq.nome);
        if (!pronta) { resumo.convertidos.push(arq.nome); log.info(rotulo + ': "' + arq.nome + '" virou ' + paginas.length + ' imagem(ns).'); }
      } catch (e) {
        proteger();
        if (e instanceof ConversorIndisponivel) {
          semConversor[arq.conversao] = { msg: e.message, em: agora };
          avisarSemConversor(arq, e.message);
          continue;
        }
        const motivo = e.code ? explicarErroDeArquivo(e, arq.nome) : e.message;
        est.falhasConversao[arq.nome] = { sha256: sha, motivo, em: agora };
        log.umaVez(id + '|conversao|' + arq.nome, 'erro', rotulo + ': não consegui converter "' + arq.nome + '" em imagens: ' + motivo + '. Tento de novo em 1 hora ou quando o arquivo mudar. ' + COMO_SALVAR[arq.conversao]);
        registrarErro(estado, id, '"' + arq.nome + '" não converteu: ' + motivo, agora);
        resumo.recusados.push({ nome: arq.nome, motivo });
        continue;
      }
      for (const p of paginas) {
        leitura.presentes.add(p.nome);
        const r = remoto.get(p.nome);
        if (r && r.sha256 === p.sha256) continue;
        enviar.push({ nome: p.nome, caminho: p.arquivo, tamanho: p.tamanho, sha256: p.sha256, tipo: 'image/png', convertido: true });
      }
      continue;
    }

    const r = remoto.get(arq.nome);
    if (r && r.sha256 === sha) continue;
    const rec = est.recusados[arq.nome];
    if (rec && rec.sha256 === sha) { resumo.recusados.push({ nome: arq.nome, motivo: rec.motivo }); continue; }
    enviar.push(Object.assign({}, arq, { sha256: sha, tipo: tipoDe(arq.nome) }));
  }

  // A pasta das conversões pelo caminho real, como o resto (C:\Program Files pode ser junção).
  const raizConvertidos = enviar.some((a) => a.convertido) ? await fsp.realpath(ctx.pastaConvertidos).catch(() => ctx.pastaConvertidos) : '';
  for (const a of enviar) {
    if (ctx.simular) { resumo.enviados.push(a.nome); continue; }
    try {
      // Última conferência antes de abrir o arquivo: continua dentro da pasta
      // (ou, para as imagens convertidas, dentro da pasta de conversões)?
      const real = await fsp.realpath(a.caminho);
      if (!dentro(a.convertido ? raizConvertidos : leitura.raiz, real)) { resumo.ignorados.push({ nome: a.nome, motivo: 'passou a apontar para fora da pasta' }); continue; }
      await api.enviarArquivo(pasta.chave, a.nome, { caminho: real, tamanho: a.tamanho, sha256: a.sha256, tipo: a.tipo });
      delete est.recusados[a.nome];
      resumo.enviados.push(a.nome);
    } catch (e) {
      if (e instanceof TokenRevogado || e instanceof SemConexao) throw e;
      if (e instanceof ErroDoServidor && (e.status === 413 || e.status === 415 || e.status === 422)) {
        // O servidor disse não por causa do ARQUIVO: guarda, para não reenviar o
        // mesmo vídeo de 500 MB a cada minuto. Muda o arquivo, tenta de novo.
        est.recusados[a.nome] = { sha256: a.sha256, motivo: e.message, status: e.status };
        log.erro(rotulo + ': o servidor recusou "' + a.nome + '" (' + e.status + '): ' + e.message + '. Não tento de novo enquanto o arquivo não mudar.');
        registrarErro(estado, id, '"' + a.nome + '" recusado: ' + e.message, agora);
        resumo.recusados.push({ nome: a.nome, motivo: e.message });
        continue;
      }
      const msg = e instanceof ErroDoServidor ? e.message + ' (' + e.status + ')' : e.message;
      log.erro(rotulo + ': não consegui enviar "' + a.nome + '": ' + msg + '. Tento de novo no próximo ciclo.');
      registrarErro(estado, id, '"' + a.nome + '": ' + msg, agora);
      resumo.fila.push({ nome: a.nome, motivo: 'o envio falhou; tento de novo' });
      resumo.erros.push(msg);
    }
  }

  // Exclusões: só com a leitura completa, e só depois de sumir N vezes seguidas.
  if (leitura.completa) {
    for (const nome of Object.keys(est.faltando)) if (presente(nome) || !remoto.has(nome)) delete est.faltando[nome];
    for (const nome of remoto.keys()) {
      if (presente(nome)) continue;
      const vezes = (est.faltando[nome] || 0) + 1;
      if (vezes < cfg.ciclosParaApagar) {
        if (!ctx.simular) est.faltando[nome] = vezes;
        resumo.fila.push({ nome, motivo: 'sumiu da pasta; apago no servidor se continuar sumido na próxima leitura' });
        continue;
      }
      if (ctx.simular) { resumo.apagados.push(nome); continue; }
      try {
        await api.apagarArquivo(pasta.chave, nome);
        delete est.faltando[nome];
        resumo.apagados.push(nome);
      } catch (e) {
        if (e instanceof TokenRevogado || e instanceof SemConexao) throw e;
        if (e instanceof ErroDoServidor && e.status === 404) { delete est.faltando[nome]; resumo.apagados.push(nome); continue; }
        log.erro(rotulo + ': não consegui apagar "' + nome + '" no servidor: ' + e.message + '.');
        registrarErro(estado, id, 'apagar "' + nome + '": ' + e.message, agora);
        resumo.erros.push(e.message);
      }
    }
  } else if (remoto.size) {
    log.umaVez(id + '|incompleta', 'aviso', rotulo + ': a leitura não foi completa; por segurança nada foi apagado no servidor neste ciclo.');
  }

  // Memória só do que ainda existe (senão o estado cresce para sempre).
  if (!ctx.simular) {
    for (const mapa of [est.vistos, est.hashes, est.recusados, est.falhasConversao]) for (const nome of Object.keys(mapa)) if (!leitura.presentes.has(nome)) delete mapa[nome];
    for (const [nome, conv] of Object.entries(est.convertidos)) {
      if (leitura.presentes.has(nome)) continue;
      if (conv.dir) fs.rmSync(conv.dir, { recursive: true, force: true });
      delete est.convertidos[nome];
    }
    for (const n of resumo.enviados) log.info(rotulo + ': enviado "' + n + '".');
    for (const n of resumo.apagados) log.info(rotulo + ': "' + n + '" sumiu da pasta e foi apagado no MultiTelas.');
  }
  if (!resumo.erros.length) {
    f.ultimaSincronizacao = agora;
    f.ultimoErro = '';
  }
  f.arquivos = leitura.arquivos.length;
  f.ultimoResumo = resumo.enviados.length + ' enviado(s), ' + resumo.apagados.length + ' apagado(s), ' + resumo.fila.length + ' na fila' + (resumo.recusados.length ? ', ' + resumo.recusados.length + ' recusado(s)' : '');
  return resumo;
}

module.exports = {
  TIPOS, CONVERTIDOS, EXTENSOES, conversaoDe, lerPasta, sincronizarPasta, motivoParaIgnorar, nomeSeguro, dentro, tipoDe, extensao, sha256DoArquivo,
  estavel, PastaInacessivel, explicarErroDeArquivo, mb,
};
