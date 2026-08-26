/*
 * server/midia.js — o único lugar por onde arquivo entra e sai.
 *
 * O problema que isto resolve: havia três caminhos de gravação e só um deles
 * registrava o arquivo no banco. Upload do painel criava linha em `media`;
 * imagem gerada pela IA e foto de mural iam direto para o storage. O resultado
 * era um sistema que não sabia o que possuía:
 *
 *   - a página Armazenamento não listava as imagens da IA;
 *   - a cota somava só a tabela `media` — gerar imagem era de graça;
 *   - excluir a conta apagava as linhas e deixava os arquivos no disco/R2,
 *     contrariando a Política de Privacidade deste próprio repositório.
 *
 * Agora toda gravação passa por aqui e toda linha nasce junto com o arquivo.
 * `origem` diz de onde veio, para o painel poder separar "o que eu enviei" do
 * "o que a IA gerou" sem precisar de outra tabela.
 */
const storage = require('./storage');

/*
 * Grava bytes já em memória (imagem da IA, thumbnail, QR renderizado) e
 * registra. Devolve o mesmo formato de `storage.saveBuffer` mais o `id`.
 */
async function guardarBuffer(db, tenantId, buf, mime, meta) {
  const salvo = await storage.saveBuffer(tenantId, buf, mime);
  await registrar(db, tenantId, salvo, meta);
  return salvo;
}

/*
 * Grava um corpo de requisição em streaming (upload do painel, foto do mural)
 * e registra. `max` limita o tamanho para rotas mais apertadas que o teto
 * global — a pública do mural é o caso.
 */
async function guardarStream(db, tenantId, req, { mime, max }, meta) {
  const salvo = await storage.saveStream(tenantId, req, { mime, max });
  await registrar(db, tenantId, salvo, meta);
  return salvo;
}

async function registrar(db, tenantId, salvo, meta) {
  const m = meta || {};
  await db.createMedia({
    id: salvo.id,
    tenantId,
    name: String(m.nome || 'arquivo').slice(0, 180),
    mime: salvo.mime,
    size: salvo.size,
    key: salvo.key,
    url: salvo.url,
    // 'upload' (a pessoa enviou), 'ia' (foi gerada), 'mural' (veio do público).
    origem: m.origem || 'upload',
    /*
     * Só a imagem da IA traz estes dois. Ficam na mídia porque o Banco de
     * Imagens precisa da proporção e da cor de origem sem abrir o arquivo —
     * ver server/banco.js.
     */
    formato: m.formato ? String(m.formato).slice(0, 12) : null,
    cor: /^#[0-9a-fA-F]{6}$/.test(String(m.cor || '')) ? String(m.cor).toLowerCase() : null,
  });
}

/*
 * Apaga arquivo e linha, nesta ordem. Se o arquivo já não existir, a linha sai
 * do mesmo jeito: um registro apontando para o nada é pior que nenhum.
 */
async function apagar(db, tenantId, id) {
  const m = await db.getMedia(id);
  if (!m || m.tenant_id !== tenantId) return false;
  /*
   * Se esta imagem está APROVADA no Banco de Imagens, o arquivo fica.
   *
   * Outra conta pode já ter publicado essa foto numa TV, e apagar o arquivo
   * deixaria a tela dela com um buraco por decisão de alguém que ela não
   * conhece. A linha da mídia sai (some do Armazenamento e da cota de quem
   * apagou); a linha do banco continua, com a chave e a URL que já guarda.
   * Mesma decisão da exclusão de conta, em server/db-*.js.
   */
  const noBanco = db.bancoPorMedia ? await db.bancoPorMedia(m.id) : null;
  const compartilhada = !!(noBanco && noBanco.estado === 'aprovada');
  if (!compartilhada) {
    if (db.bancoApagarDaMedia) await db.bancoApagarDaMedia(m.id, tenantId);
    try { await storage.remove(m.key); } catch (e) { console.warn('[midia]', e.message); }
  }
  await db.removeMedia(m.id, tenantId);
  return true;
}

module.exports = { guardarBuffer, guardarStream, apagar };
