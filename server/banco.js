/*
 * server/banco.js — o Banco de Imagens MultiTelas.
 *
 * O problema: uma plataforma de arte que abre vazia não tem gosto nenhum. O
 * primeiro cliente entra, vê um formulário em branco e conclui que o trabalho
 * é dele. E do nosso lado cada imagem custa dinheiro de verdade (R$ 0,35 no
 * Gemini), pagos de novo toda vez que alguém pede uma foto de pão que já foi
 * gerada quarenta vezes.
 *
 * A ideia é a mesma dos bancos de imagem: o que já foi gerado e o dono
 * AUTORIZOU vira acervo comum. Quem chega depois encontra prateleira cheia, e
 * nós não pagamos duas vezes pela mesma foto.
 *
 * Este arquivo é onde as regras moram. Elas existem porque compartilhar
 * conteúdo entre contas diferentes é o tipo de coisa que, feita sem regra,
 * vira notícia ruim:
 *
 *   1. SÓ ENTRA O QUE A IA GEROU. Foto que a pessoa subiu pode ter o rosto de
 *      um funcionário, o produto de um fornecedor, uma marca de terceiro.
 *      Não temos o direito de redistribuir isso, e ela clica no botão sem
 *      pensar. `origem` (server/midia.js) já separa os dois casos desde que
 *      toda gravação passou a ser registrada — aqui isso vira barreira.
 *
 *   2. É OPT-IN, E O TEXTO DIZ "INCLUSIVE CONCORRENTES". A padaria compartilha
 *      e a padaria da esquina usa. Isso vai acontecer. O erro seria a pessoa
 *      descobrir depois: o aceite fica registrado com a versão dos Termos.
 *
 *   3. REVOGAR VALE PARA A FRENTE. Sai do feed na hora; campanha que outra
 *      conta já publicou continua no ar. Uma tela apagando sozinha por decisão
 *      de alguém que o dono dela não conhece é pior que a imagem continuar.
 *
 *   4. NADA ENTRA SEM MODERAÇÃO. O volume no começo é minúsculo e o custo de
 *      olhar é quase zero — mas o custo de UMA imagem errada no feed de todo
 *      mundo não é. `pendente` é o estado inicial, sempre.
 *
 * O que NÃO está aqui, e é de propósito: filtro por cidade. A ideia era não
 * oferecer a imagem de uma padaria para outra padaria da mesma rua, e o
 * sistema não guarda a cidade de ninguém hoje (a memória de marca tem
 * `segmento`, não localidade). Preferi não fingir uma proteção que o dado não
 * sustenta — o aviso nos Termos é o que existe até haver cidade cadastrada.
 */

const ESTADOS = ['pendente', 'aprovada', 'recusada', 'revogada'];

/*
 * Regra 1, sozinha e testável. Devolve motivo em vez de booleano porque a
 * mensagem vai direto para a tela de quem tentou — "não pode" sem porquê é a
 * forma mais rápida de gerar um chamado de suporte.
 */
function podeOferecer(m) {
  if (!m) return { ok: false, motivo: 'mídia não encontrada' };
  if (!/^image\//.test(String(m.mime || ''))) {
    return { ok: false, motivo: 'o banco é só de imagens' };
  }
  if (m.origem !== 'ia') {
    return {
      ok: false,
      motivo: 'só imagem gerada pela IA pode ir para o banco. Arquivo que você enviou pode ter pessoa, produto ou marca de terceiro — não temos direito de repassar isso a outras contas.',
    };
  }
  return { ok: true };
}

/*
 * O nome da mídia gerada nasce como "IA · <prompt>" (ver server.js). É a única
 * descrição que existe, e é ela que faz a busca do feed funcionar — sem tirar
 * o prefixo, todo item do banco começa igual e a busca por "ia" traz tudo.
 */
function descricaoDe(m) {
  const nome = String((m && m.name) || '').trim();
  return nome.replace(/^IA\s*·\s*/i, '').slice(0, 180) || 'imagem';
}

function limpar(t, max) {
  return String(t == null ? '' : t).trim().slice(0, max || 80) || null;
}

/*
 * Oferecer é criar uma linha PENDENTE — nunca aprovada. Quem chama já
 * confirmou o aceite; a checagem do aceite fica na rota, junto com o registro
 * de quem aceitou o quê.
 */
async function oferecer(db, tenantId, media, meta) {
  const pode = podeOferecer(media);
  if (!pode.ok) return { ok: false, status: 422, error: pode.motivo };
  if (media.tenant_id !== tenantId) return { ok: false, status: 404, error: 'mídia não encontrada' };

  const jaTem = await db.bancoPorMedia(media.id);
  if (jaTem) {
    /*
     * Reoferecer o que foi revogado é legítimo — a pessoa mudou de ideia. Volta
     * para a fila, não para o feed: o texto pode ter mudado de sentido desde a
     * primeira aprovação. Recusada não volta sozinha, senão a moderação vira
     * um jogo de insistência.
     */
    if (jaTem.estado === 'revogada') {
      await db.bancoDecidir(jaTem.id, 'pendente', null);
      return { ok: true, status: 200, item: { ...jaTem, estado: 'pendente' } };
    }
    return { ok: false, status: 409, error: 'esta imagem já está no banco', item: jaTem };
  }

  const m = meta || {};
  const item = {
    id: 'bk_' + db.rid(14),
    mediaId: media.id,
    tenantId,
    key: media.key,
    url: media.url,
    mime: media.mime,
    size: media.size,
    formato: limpar(media.formato || m.formato, 12),
    cor: /^#[0-9a-fA-F]{6}$/.test(String(media.cor || m.cor || '')) ? String(media.cor || m.cor).toLowerCase() : null,
    segmento: limpar(m.segmento, 80),
    descricao: descricaoDe(media),
    estado: 'pendente',
  };
  await db.bancoOferecer(item);
  return { ok: true, status: 201, item: { ...item, usos: 0 } };
}

/*
 * Revogar. Vale para a frente: nenhuma peça já publicada é tocada, e o arquivo
 * continua onde está. O que muda é que o feed para de oferecer.
 */
async function revogar(db, tenantId, mediaId) {
  const item = await db.bancoPorMedia(mediaId);
  if (!item || item.tenant_id !== tenantId) return { ok: false, status: 404, error: 'esta imagem não está no banco' };
  if (item.estado === 'revogada') return { ok: true, status: 200, item };
  await db.bancoDecidir(item.id, 'revogada', null);
  return { ok: true, status: 200, item: { ...item, estado: 'revogada' } };
}

/* A moderação da plataforma. Só 'aprovada' e 'recusada' saem daqui. */
async function moderar(db, id, estado, operadorId) {
  if (!['aprovada', 'recusada'].includes(estado)) return { ok: false, status: 400, error: 'estado inválido' };
  const item = await db.bancoPorId(id);
  if (!item) return { ok: false, status: 404, error: 'item não encontrado' };
  if (item.estado === 'revogada') {
    // O dono tirou enquanto a fila andava. A vontade dele vence a da moderação.
    return { ok: false, status: 409, error: 'o dono revogou esta imagem' };
  }
  await db.bancoDecidir(item.id, estado, operadorId || null);
  return { ok: true, status: 200, item: { ...item, estado } };
}

/*
 * O que o painel mostra de um item. Nunca devolve `key` nem `tenant_id`: a
 * chave é a única barreira de /media/* e o dono da imagem não é assunto de
 * quem está usando.
 */
function paraCliente(r, tenantId) {
  if (!r) return null;
  const minha = !!(tenantId && r.tenant_id === tenantId);
  return {
    id: r.id,
    /*
     * O id da mídia de origem só sai para o DONO — é o que o Armazenamento
     * dele usa para saber qual card já está compartilhado. Para os outros,
     * mostrar isso seria dizer de qual conta a imagem veio.
     */
    mediaId: minha ? r.media_id : undefined,
    url: r.url,
    mime: r.mime,
    formato: r.formato || null,
    cor: r.cor || null,
    descricao: r.descricao || '',
    segmento: r.segmento || null,
    usos: Number(r.usos || 0),
    estado: r.estado,
    minha,
    em: Number(r.created_at || 0),
  };
}

/* O feed: só aprovadas, com busca por texto e filtro de proporção. */
async function listar(db, { termo, formato, limite } = {}, tenantId) {
  const linhas = await db.bancoBuscar({ estado: 'aprovada', termo: limpar(termo, 60), formato: limpar(formato, 12), limite });
  return linhas.map((r) => paraCliente(r, tenantId));
}

/*
 * Usar. O contador não é vaidade: é o que ordena o feed (o que os outros
 * usaram sobe) e é o que vai dizer, daqui a um mês, se o banco está pagando o
 * próprio custo.
 */
async function usar(db, tenantId, id) {
  const item = await db.bancoPorId(id);
  if (!item || item.estado !== 'aprovada') return { ok: false, status: 404, error: 'imagem indisponível' };
  await db.bancoUsar(item.id);
  return { ok: true, status: 200, item: paraCliente({ ...item, usos: Number(item.usos || 0) + 1 }, tenantId) };
}

module.exports = { ESTADOS, podeOferecer, descricaoDe, oferecer, revogar, moderar, listar, usar, paraCliente };
