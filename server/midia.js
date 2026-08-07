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
  });
}

/*
 * Apaga arquivo e linha, nesta ordem. Se o arquivo já não existir, a linha sai
 * do mesmo jeito: um registro apontando para o nada é pior que nenhum.
 */
async function apagar(db, tenantId, id) {
  const m = await db.getMedia(id);
  if (!m || m.tenant_id !== tenantId) return false;
  try { await storage.remove(m.key); } catch (e) { console.warn('[midia]', e.message); }
  await db.removeMedia(m.id, tenantId);
  return true;
}

module.exports = { guardarBuffer, guardarStream, apagar };
