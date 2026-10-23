/*
 * server/segredo.js — segredo de integração guardado CIFRADO (EXECUTOR D36).
 *
 * O conector de indicadores busca a API da empresa (TOTVS Protheus e afins)
 * com a autenticação que o dono deu: token, usuário e senha. Isso não pode
 * morar em texto no banco — um backup vazado entregaria a porta do ERP do
 * cliente. AES-256-GCM, com a chave fora do banco (MT_CHAVE_SEGREDOS, 32
 * bytes em base64, no Railway).
 *
 * Sem a chave em produção, guardar segredo é RECUSADO (disponivel() = false):
 * melhor o painel dizer "fale com o suporte" que gravar em claro. Em
 * desenvolvimento, uma chave fixa de teste.
 */
const crypto = require('crypto');

const PREFIXO = 'mts1:';

function emProducao() {
  return !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID || process.env.DYNO || process.env.RENDER);
}
function chave() {
  const b = Buffer.from(String(process.env.MT_CHAVE_SEGREDOS || ''), 'base64');
  if (b.length === 32) return b;
  return emProducao() ? null : crypto.createHash('sha256').update('multitelas-dev-segredos').digest();
}
function disponivel() { return !!chave(); }

function cifrar(texto) {
  const k = chave();
  if (!k) throw new Error('sem chave de segredos (MT_CHAVE_SEGREDOS)');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const corpo = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return PREFIXO + Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64');
}

// '' quando não dá para abrir (chave trocada, texto adulterado): o conector para, e o painel pede o segredo de novo.
function decifrar(guardado) {
  const s = String(guardado || '');
  const k = chave();
  if (!s.startsWith(PREFIXO) || !k) return '';
  try {
    const b = Buffer.from(s.slice(PREFIXO.length), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', k, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch (e) { return ''; }
}

module.exports = { cifrar, decifrar, disponivel, PREFIXO };
