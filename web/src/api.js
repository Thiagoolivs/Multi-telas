/*
 * api.js — cliente HTTP do painel React.
 *
 * Espelha o contrato do server/ (mesma origem, cookie de sessão automático).
 * Mantido pequeno de propósito: uma função `api()` e helpers nomeados por
 * endpoint, para as telas não lidarem com fetch cru.
 */
async function api(method, path, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  /*
   * Falha de REDE não é falha do servidor, e a diferença importa para quem
   * está usando o app instalado.
   *
   * O `fetch` estoura um TypeError seco ("Failed to fetch") quando o aparelho
   * está sem conexão. Sem separar esse caso, a tela dizia "erro ao publicar" —
   * e "erro ao publicar" faz a pessoa achar que fez algo errado, ou pior, que
   * o sistema recusou. O que aconteceu foi que a mensagem não saiu do celular.
   *
   * Marcado com `.offline`, quem chama pode dizer a verdade: não foi enviado,
   * tente de novo quando a conexão voltar — e as telas continuam no ar.
   */
  let res;
  try {
    res = await fetch(path, opt);
  } catch (falha) {
    /*
     * O aviso vem do que ACONTECEU com uma chamada de verdade, e não de
     * `navigator.onLine`. Aquela bandeira mente com frequência: fica em `true`
     * num wi-fi de hotel que ainda não deixou passar, ou num escritório cuja
     * saída caiu. A requisição que falhou é a única testemunha confiável.
     */
    window.dispatchEvent(new CustomEvent('mt:sem-rede'));
    const e = new Error('Sem conexão. Nada foi enviado — tente de novo quando a internet voltar.');
    e.offline = true;
    e.causa = falha;
    throw e;
  }
  window.dispatchEvent(new CustomEvent('mt:com-rede'));
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = new Error((data && data.error) || 'HTTP ' + res.status);
    e.status = res.status;
    throw e;
  }
  return data;
}

export const auth = {
  me: () => api('GET', '/api/auth/me').catch(() => null),
  signup: (payload) => api('POST', '/api/auth/signup', payload),
  login: (email, password) => api('POST', '/api/auth/login', { email, password }),
  logout: () => api('POST', '/api/auth/logout'),
  // Quais formas de login este servidor oferece (Google, e-mail de reset).
  config: () => api('GET', '/api/auth/config').catch(() => ({ google: false, mail: false })),
  forgot: (email) => api('POST', '/api/auth/forgot', { email }),
  reset: (token, password) => api('POST', '/api/auth/reset', { token, password }),
  verify: (token) => api('POST', '/api/auth/verify', { token }),
  updateProfile: (payload) => api('POST', '/api/auth/profile', payload),
  changePassword: (atual, nova) => api('POST', '/api/auth/password', { atual, nova }),
};

// Direitos do titular (LGPD). A exportação não passa por aqui: é um download
// direto em /api/privacidade/exportar, para o navegador salvar o arquivo.
export const privacidade = {
  excluirConta: (confirmacao) => api('DELETE', '/api/privacidade/conta', { confirmacao }),
};

export const team = {
  list: () => api('GET', '/api/team'),
  invite: (email, role) => api('POST', '/api/team/invites', { email, role }),
  revokeInvite: (id) => api('DELETE', '/api/team/invites/' + id),
  setRole: (id, role) => api('POST', '/api/team/members/' + id + '/role', { role }),
  remove: (id) => api('DELETE', '/api/team/members/' + id),
};

export const devices = {
  list: () => api('GET', '/api/devices'),
  pair: (code, name) => api('POST', '/api/pair', { code: String(code || '').trim().toUpperCase(), name }),
  rename: (id, name) => api('POST', '/api/devices/' + id + '/rename', { name }),
  /*
   * Liga esta tela do painel à TV que está mostrando `code` agora. Devolve um
   * id novo: quem fica é a TV, e é ela que herda o nome e a programação.
   */
  reconectar: (id, code) => api('POST', '/api/devices/' + id + '/reconectar', { code: String(code || '').trim().toUpperCase() }),
  remove: (id) => api('DELETE', '/api/devices/' + id),
};

export const deviceConfig = {
  // GET retorna null quando a tela ainda não tem config (204 no servidor).
  get: (id) => api('GET', '/api/devices/' + id + '/config'),
  save: (id, config) => api('PUT', '/api/devices/' + id + '/config', config),
};

/*
 * ─────────────────────────────────────────────────────────────────────────
 * TODA geração de IA é um TRABALHO, e nenhuma delas se perde.
 *
 * Antes só a campanha rodava assim. As outras oito eram requisições comuns, e
 * o defeito era o mesmo em tamanho menor: fechar a aba, trocar de página ou o
 * celular perder a rede por dez segundos matava o pedido — e o crédito de IA
 * já tinha sido gasto. A imagem era a pior: paga, gerada, salva no
 * armazenamento, e ninguém nunca via.
 *
 * O trabalho roda no SERVIDOR. Sair daqui não cancela nada; só pararia de
 * olhar. Por isso o id fica guardado no navegador POR TIPO, e a tela que sabe
 * o que fazer com aquele resultado volta a acompanhar sozinha quando a pessoa
 * reaparece.
 *
 * Por tipo, e não numa lista: quem tem uma peça sendo composta no editor e uma
 * campanha rodando ao mesmo tempo precisa que cada tela reencontre a SUA — e
 * uma lista faria a primeira tela a perguntar levar o trabalho da outra.
 */
const PENDENTES = 'mt.ia.pendentes';

function lerPendentes() {
  try { return JSON.parse(localStorage.getItem(PENDENTES) || '{}') || {}; } catch (e) { return {}; }
}
function escrever(obj) {
  try { localStorage.setItem(PENDENTES, JSON.stringify(obj)); } catch (e) {}
}
function guardarPendente(tipo, job, pedido) {
  const t = lerPendentes();
  t[tipo] = { id: job.id, brief: (pedido && pedido.brief) || '', em: Date.now() };
  escrever(t);
}
function esquecerPendente(tipo) {
  const t = lerPendentes();
  delete t[tipo];
  escrever(t);
}

/*
 * O trabalho pendente daquele tipo, se ainda vale a pena esperar.
 *
 * O teto de 24 h casa com quanto tempo o servidor guarda o trabalho. Mais que
 * isso seria oferecer à pessoa um "continuando…" que termina em 404.
 */
function pendenteDe(tipo) {
  const j = lerPendentes()[tipo];
  if (!j || !j.id || Date.now() - (j.em || 0) > 24 * 60 * 60 * 1000) return null;
  return j;
}

/*
 * Acompanha até terminar. `sinal` para de olhar sem cancelar o trabalho — quem
 * sai da tela para de acompanhar, o servidor continua.
 *
 * O intervalo começa curto e abre. Reescrever um texto responde em um segundo
 * e esperar um segundo cheio para perguntar dobraria o tempo que a pessoa
 * sente; uma campanha leva minutos, e perguntar de trezentos em trezentos
 * milissegundos por quatro minutos são oitocentas requisições à toa.
 */
async function acompanhar(id, tipo, onEtapa, sinal) {
  const limite = Date.now() + 20 * 60 * 1000;
  let espera = 300;
  while (Date.now() < limite) {
    if (sinal && sinal.parado) return null;
    let s;
    try {
      s = await api('GET', '/api/ai/job/' + id);
    } catch (e) {
      // 404 = o prazo passou, ou o trabalho nunca existiu. Insistir enganaria.
      if (e.status === 404) { esquecerPendente(tipo); throw new Error('o trabalho expirou — refaça o pedido'); }
      throw e;
    }
    if (onEtapa) onEtapa(s);
    if (s.estado === 'pronto') { esquecerPendente(tipo); return s.resultado; }
    if (s.estado === 'erro') { esquecerPendente(tipo); throw new Error(s.erro || 'a IA não conseguiu terminar'); }
    await new Promise((r) => setTimeout(r, espera));
    espera = Math.min(2000, Math.round(espera * 1.4));
  }
  throw new Error('a geração demorou demais — tente de novo');
}

/* Começa um trabalho e espera por ele, guardando o id para poder voltar. */
async function rodar(rota, payload, tipo, onEtapa, sinal) {
  const job = await api('POST', rota, payload);
  guardarPendente(tipo, job, payload);
  return acompanhar(job.id, tipo, onEtapa, sinal);
}

export const ai = {
  /*
   * Cada uma destas devolve o resultado, como sempre devolveu — quem chama não
   * precisa saber que virou trabalho. O que mudou é que agora dá para passar
   * `onEtapa` e sobreviver a fechar a aba.
   */
  generate: (brief, opts, onEtapa, sinal) =>
    rodar('/api/ai/generate-content', { brief, ...(opts || {}) }, 'conteudo', onEtapa, sinal),
  campaign: (payload, onEtapa, sinal) =>
    rodar('/api/ai/generate-campaign', payload, 'campanha-simples', onEtapa, sinal),
  composition: (payload, onEtapa, sinal) =>
    rodar('/api/ai/generate-composition', payload, 'peca-do-editor', onEtapa, sinal),
  kit: (payload, onEtapa, sinal) =>
    rodar('/api/ai/generate-kit', payload, 'kit-de-marca', onEtapa, sinal),
  image: (payload, onEtapa, sinal) =>
    rodar('/api/ai/generate-image', payload, 'imagem', onEtapa, sinal),

  // Chat de briefing: uma pergunta por vez até a IA entender a campanha.
  // Continua síncrono: é uma conversa, e conversa que responde por polling
  // deixa de parecer conversa.
  analiseVisual: (imageB64) => api('POST', '/api/ai/analise-visual', { imageB64 }),
    briefing: (mensagens, extra) => api('POST', '/api/ai/briefing', { mensagens, ...(extra || {}) }),

  /*
   * O guia: OFERECE campanhas em vez de perguntar. Uma chamada, no começo —
   * quem não sabe o que pedir escolhe de um cardápio em vez de encarar um
   * campo de texto vazio.
   */
  guia: (extra) => api('POST', '/api/ai/guia', extra || {}),

  /*
   * O diretor: briefing → plano → imagens → composição → crítica. É o motor
   * que respeita a marca e o acervo.
   */
  director: (payload) => api('POST', '/api/ai/director', payload),
  directorStatus: (id) => api('GET', '/api/ai/job/' + id),

  /* ---- Voltar para o que ficou rodando ---- */

  // O trabalho pendente de um tipo, para a tela oferecer "continuar".
  pendente: pendenteDe,
  esquecer: esquecerPendente,
  // Volta a acompanhar um trabalho já começado, sem começar outro.
  retomar: (tipo, onEtapa, sinal) => {
    const j = pendenteDe(tipo);
    if (!j) return Promise.resolve(null);
    return acompanhar(j.id, tipo, onEtapa, sinal);
  },
  // Tudo o que a CONTA tem em andamento — inclusive o que outra aba começou.
  emAndamento: () => api('GET', '/api/ai/jobs'),

  /* ---- Campanha (o diretor) ---- */

  async directorStart(payload) {
    const job = await api('POST', '/api/ai/director', payload);
    guardarPendente('campanha', job, payload);
    return job.id;
  },
  jobPendente: () => pendenteDe('campanha'),
  descartarPendente: () => esquecerPendente('campanha'),
  directorAcompanhar: (id, onEtapa, sinal) => acompanhar(id, 'campanha', onEtapa, sinal),
  async directorRun(payload, onEtapa, sinal) {
    const id = await ai.directorStart(payload);
    return ai.directorAcompanhar(id, onEtapa, sinal);
  },
};

/*
 * Som ao vivo. Fora de `deviceConfig` de propósito: isto NÃO passa por salvar.
 * Abaixar o volume no meio de um evento é uma ação, e uma ação que exigisse
 * publicar a tela inteira reconstruiria o palco e cortaria a música.
 */
export const som = {
  comando: (deviceId, acao, valor) => api('POST', '/api/devices/' + deviceId + '/audio', { acao, valor }),
  estado: (deviceId) => api('GET', '/api/devices/' + deviceId + '/audio'),
};

export const brand = {
  get: () => api('GET', '/api/brand'),
  save: (kit) => api('PUT', '/api/brand', kit),
  addAsset: (kind, url, label) => api('POST', '/api/brand/assets', { kind, url, label }),
  labelAsset: (id, label) => api('PUT', '/api/brand/assets/' + id, { label }),
  removeAsset: (id) => api('DELETE', '/api/brand/assets/' + id),
  // A memória é dedução do sistema — o usuário vê e apaga quando quiser.
  esquecer: () => api('DELETE', '/api/brand/memoria'),
  // Até três marcas por conta. `save` continua salvando a ATIVA — é o que
  // mantém o resto do painel funcionando sem saber que há mais de uma.
  marcas: () => api('GET', '/api/brand/marcas'),
  criarMarca: (nome) => api('POST', '/api/brand/marcas', { nome }),
  ativarMarca: (id) => api('POST', '/api/brand/marcas/' + id + '/ativar'),
  removerMarca: (id) => api('DELETE', '/api/brand/marcas/' + id),
  // Lê o site do cliente e guarda o resumo na marca. É rede alheia: pode
  // demorar, e a tela precisa dizer isso enquanto espera.
  lerSite: (id, site) => api('POST', '/api/brand/marcas/' + id + '/site', { site }),
};

// Datas comemorativas: catálogo e qual está valendo hoje.
export const seasons = {
  // `zonas` são as do layout da tela aberta: o servidor só gera conteúdo para
  // zona que existe, senão metade do pacote sumiria sem explicação.
  list: (zonas) => api('GET', '/api/seasons' + (zonas && zonas.length ? '?zonas=' + encodeURIComponent(zonas.join(',')) : '')),
};

/*
 * Suporte: o cliente escreve e alguém do outro lado lê. Antes a página de
 * Suporte era só perguntas frequentes — quem tinha um problema não tinha para
 * onde escrever dentro do produto.
 */
export const suporte = {
  enviar: (tipo, texto) => api('POST', '/api/suporte/reclamacao', { tipo, texto }),
  meus: () => api('GET', '/api/suporte/reclamacao'),
};

/*
 * Os números do MultiTelas inteiro. Só quem opera a plataforma chega aqui — e
 * a porta é do servidor, não daqui: esconder o menu sem fechar a rota seria
 * segurança de fachada.
 */
export const plataforma = {
  metricas: (dias) => api('GET', '/api/plataforma/metricas' + (dias ? '?dias=' + dias : '')),
  reclamacoes: () => api('GET', '/api/plataforma/reclamacoes'),
  resolver: (id, status, resposta) => api('POST', '/api/plataforma/reclamacoes/' + id, { status, resposta }),
  contas: (q, dias) => api('GET', '/api/plataforma/contas?q=' + encodeURIComponent(q || '') + (dias ? '&dias=' + dias : '')),
  conta: (id, dias) => api('GET', '/api/plataforma/contas/' + id + (dias ? '?dias=' + dias : '')),
  limites: () => api('GET', '/api/plataforma/limites'),
  // A fila do Banco de Imagens: nada entra no acervo de todo mundo sem alguém olhar.
  bancoFila: (estado) => api('GET', '/api/plataforma/banco' + (estado ? '?estado=' + estado : '')),
  bancoDecidir: (id, estado) => api('POST', '/api/plataforma/banco/' + id, { estado }),
  erros: () => api('GET', '/api/plataforma/erros'),
  limparErros: () => api('DELETE', '/api/plataforma/erros'),
  operadores: () => api('GET', '/api/plataforma/operadores'),
  addOperador: (email, nome) => api('POST', '/api/plataforma/operadores', { email, nome }),
  removerOperador: (email) => api('DELETE', '/api/plataforma/operadores/' + encodeURIComponent(email)),
};

export const library = {
  list: () => api('GET', '/api/library'),
  save: (campaign, pieces) => api('POST', '/api/library', { campaign, pieces }),
  update: (id, item, label) => api('PUT', '/api/library/' + id, { item, label }),
  remove: (id) => api('DELETE', '/api/library/' + id),
  // Campanha como pasta: renomear, duplicar e excluir de uma vez só.
  renameCampaign: (nome, novo) => api('PUT', '/api/library/campanhas/' + encodeURIComponent(nome), { nome: novo }),
  removeCampaign: (nome) => api('DELETE', '/api/library/campanhas/' + encodeURIComponent(nome)),
  duplicateCampaign: (nome, novo) => api('POST', '/api/library/campanhas/' + encodeURIComponent(nome) + '/duplicar', { nome: novo }),
};

/*
 * Mural de fotos: o público envia pelo QR e aparece na TV.
 *
 * `ocultarFoto`/`limpar` escondem em vez de apagar — moderação tem que ser
 * instantânea e reversível, então nada aqui destrói arquivo.
 */
export const murais = {
  list: () => api('GET', '/api/murais'),
  create: (titulo) => api('POST', '/api/murais', { titulo }),
  update: (id, titulo, aceitando) => api('PUT', '/api/murais/' + id, { titulo, aceitando }),
  remove: (id) => api('DELETE', '/api/murais/' + id),
  fotos: (id) => api('GET', '/api/murais/' + id + '/fotos'),
  ocultarFoto: (fotoId) => api('DELETE', '/api/murais/fotos/' + fotoId),
  mostrarFoto: (fotoId) => api('PUT', '/api/murais/fotos/' + fotoId, { oculta: false }),
  // Botão de pânico: tira tudo da tela e fecha o mural no mesmo gesto.
  limpar: (id) => api('DELETE', '/api/murais/' + id + '/fotos'),
  // Desenho do QR — o mesmo endereço que a TV usa.
  qr: (link) => '/api/qr.svg?d=' + encodeURIComponent(link),
};

export const birthdays = {
  list: () => api('GET', '/api/birthdays'),
  import: (rows) => api('POST', '/api/birthdays/import', { rows }),
  clear: () => api('DELETE', '/api/birthdays'),
};

/* Estado do sistema (só o dono). */
export const sistema = {
  diagnostico: () => api('GET', '/api/diagnostico'),
};

export const billing = {
  get: () => api('GET', '/api/billing'),
  checkout: (plan) => api('POST', '/api/billing/checkout', { plan }),
  // O "portal" não existia: devolvia uma URL que voltava para esta mesma tela.
  // A gestão é nossa — estado da assinatura, fatura em aberto e cancelamento.
  assinatura: () => api('GET', '/api/billing/assinatura'),
  cancelar: () => api('DELETE', '/api/billing/assinatura'),
};

/*
 * Banco de Imagens MultiTelas — o acervo compartilhado entre contas.
 * As regras (o que pode entrar, o que sai, o que sobrevive) estão em
 * server/banco.js; aqui é só o transporte.
 */
export const bancoImagens = {
  feed: (q) => api('GET', '/api/banco' + (q ? '?' + new URLSearchParams(q).toString() : '')),
  minhas: () => api('GET', '/api/banco/minhas'),
  // `aceito` não é enfeite: sem ele o servidor recusa. Ver Termos, cláusula 6.
  compartilhar: (mediaId) => api('POST', '/api/banco/' + mediaId + '/compartilhar', { aceito: true }),
  descompartilhar: (mediaId) => api('DELETE', '/api/banco/' + mediaId + '/compartilhar'),
  usar: (id) => api('POST', '/api/banco/' + id + '/usar', {}),
};

export const media = {
  list: () => api('GET', '/api/media'),
  remove: (id) => api('DELETE', '/api/media/' + id),
  // Upload de bytes crus (o navegador manda o File direto). Retorna { url, ... }.
  async upload(file) {
    const qs = '?name=' + encodeURIComponent(file.name || 'arquivo') + '&mime=' + encodeURIComponent(file.type || '');
    const res = await fetch('/api/media' + qs, { method: 'POST', body: file, credentials: 'same-origin' });
    const data = await res.json().catch(() => null);
    if (!res.ok) { const e = new Error((data && data.error) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
    return data;
  },
};

export default api;
