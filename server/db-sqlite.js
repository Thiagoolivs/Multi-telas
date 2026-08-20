/*
 * server/db-sqlite.js — camada de dados sobre SQLite embutido (node:sqlite).
 *
 * Fallback de desenvolvimento: sem DATABASE_URL, o projeto roda "clone e
 * pronto", sem subir um Postgres. A API é assíncrona para casar 1:1 com o
 * backend Postgres (server/db-postgres.js) — o restante do servidor não
 * precisa saber qual está em uso. Arquivo do banco: data/multitelas.db.
 */
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
/*
 * Nome do arquivo mudou de vistra.db para multitelas.db na troca de marca.
 * Se o banco antigo existir, continuamos usando ELE — renomear arquivo em
 * volume de produção é jeito fácil de perder dados.
 */
const LEGACY_DB = path.join(DATA_DIR, 'vistra.db');
const DB_FILE = fs.existsSync(LEGACY_DB) ? LEGACY_DB : path.join(DATA_DIR, 'multitelas.db');
const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, name TEXT, created_at INTEGER,
    plan TEXT, plan_status TEXT, stripe_customer_id TEXT,
    stripe_subscription_id TEXT, plan_renews_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT UNIQUE,
    pass_hash TEXT, role TEXT, name TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT, expires_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS resets (
    token TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, used_at INTEGER, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, name TEXT,
    config TEXT, device_token TEXT, updated_at INTEGER, created_at INTEGER,
    last_seen INTEGER
  );
  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, role TEXT, code TEXT,
    invited_by TEXT, created_at INTEGER, expires_at INTEGER, accepted_at INTEGER
  );
  -- origem: 'upload' (a pessoa enviou), 'ia' (gerada) ou 'mural' (do público).
  -- Toda gravação de arquivo passa por server/midia.js e cai aqui — sem isso a
  -- cota mentia e a exclusão de conta deixava arquivo órfão.
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, mime TEXT, size INTEGER,
    key TEXT, url TEXT, origem TEXT, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id);
  /*
   * Todo uso de IA passa por aqui, cobrando crédito ou não. Medir antes de
   * cobrar é a fatia 1 de docs/BILLING.md: duas a quatro semanas de dados
   * reais valem mais que qualquer estimativa de custo — inclusive as que
   * estão escritas na própria proposta.
   *
   * A coluna creditos é o que saiu do saldo (zero para texto, que é livre);
   * custo_centavos é o que a chamada nos custou, para o extrato mostrar
   * dinheiro e para conferir a margem depois.
   */
  CREATE TABLE IF NOT EXISTS uso_ia (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, tipo TEXT,
    creditos INTEGER, custo_centavos INTEGER, referencia TEXT, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_uso_ia_tenant ON uso_ia(tenant_id, created_at);
  CREATE TABLE IF NOT EXISTS birthdays (
    id TEXT PRIMARY KEY, tenant_id TEXT, nome TEXT, matricula TEXT,
    dia INTEGER, mes INTEGER, cargo TEXT, foto TEXT, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_birthdays_tenant ON birthdays(tenant_id);
  CREATE TABLE IF NOT EXISTS library (
    id TEXT PRIMARY KEY, tenant_id TEXT, campaign TEXT, canal TEXT, formato TEXT,
    label TEXT, item TEXT, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_library_tenant ON library(tenant_id);
  -- Mural: o público envia foto por QR e ela aparece na TV. O codigo é o que
  -- vai no QR — curto porque às vezes alguém digita à mão.
  CREATE TABLE IF NOT EXISTS murais (
    id TEXT PRIMARY KEY, tenant_id TEXT, codigo TEXT UNIQUE, titulo TEXT,
    aceitando INTEGER, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_murais_tenant ON murais(tenant_id);
  -- Coluna oculta em vez de DELETE: o botão de pânico precisa ser instantâneo e
  -- reversível. Apagar arquivo de storage no meio de um evento é irreversível
  -- e lento justamente quando a pressa é máxima.
  CREATE TABLE IF NOT EXISTS muralfotos (
    id TEXT PRIMARY KEY, mural_id TEXT, tenant_id TEXT, url TEXT, chave TEXT,
    autor TEXT, mensagem TEXT, ip TEXT, oculta INTEGER, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_muralfotos_mural ON muralfotos(mural_id);
  -- Identidade visual da empresa: uma linha por tenant.
  CREATE TABLE IF NOT EXISTS brandkit (
    tenant_id TEXT PRIMARY KEY, cores TEXT, fonte_titulo TEXT, fonte_apoio TEXT,
    direcao TEXT, tom TEXT, observacoes TEXT, updated_at INTEGER
  );
  -- O que o sistema DEDUZIU sobre a empresa, conversando. Tabela separada do
  -- brandkit de propósito: aquilo o usuário declarou e é dele para editar;
  -- isto é dedução nossa, e dedução precisa poder ser revista e esquecida.
  CREATE TABLE IF NOT EXISTS brandmemoria (
    tenant_id TEXT PRIMARY KEY, dados TEXT, updated_at INTEGER
  );
  -- Prova de que a pessoa aceitou os termos, e QUAL versão deles.
  CREATE TABLE IF NOT EXISTS aceites (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, email TEXT,
    versao TEXT, origem TEXT, ip TEXT, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_aceites_tenant ON aceites(tenant_id);
  -- Imagens da marca: logo, bases reutilizáveis e referências de estilo.
  CREATE TABLE IF NOT EXISTS brandassets (
    id TEXT PRIMARY KEY, tenant_id TEXT, kind TEXT, url TEXT, label TEXT, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_brandassets_tenant ON brandassets(tenant_id);
  /*
   * Marcas — até três por conta.
   *
   * "brandkit" tinha o tenant como CHAVE PRIMÁRIA: uma identidade por empresa,
   * por construção. Quem atende três clientes com o mesmo painel (é o caso de
   * agência e de administradora de condomínio) tinha que reescrever as cores a
   * cada peça. A tabela nova existe por isso, e as linhas de "brandkit" são
   * migradas para cá na primeira subida — ver a migração logo abaixo.
   *
   * As colunas de site já entram aqui: o site é referência de estilo da MARCA,
   * e criar a tabela sem elas obrigaria a uma segunda migração por nada.
   */
  CREATE TABLE IF NOT EXISTS marcas (
    id TEXT PRIMARY KEY, tenant_id TEXT, nome TEXT, cores TEXT,
    fonte_titulo TEXT, fonte_apoio TEXT, direcao TEXT, tom TEXT, observacoes TEXT,
    site TEXT, site_resumo TEXT, site_shot TEXT, site_em INTEGER,
    ativa INTEGER, created_at INTEGER, updated_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_marcas_tenant ON marcas(tenant_id);
  /*
   * Quem opera a PLATAFORMA (não uma conta). A raiz da confiança é a variável
   * ADMIN_EMAILS; esta tabela só guarda quem a raiz convidou depois.
   */
  CREATE TABLE IF NOT EXISTS operadores (
    email TEXT PRIMARY KEY, nome TEXT, convidado_por TEXT, created_at INTEGER
  );
  /*
   * Eventos de uso: QUE função foi usada, por quem e quando. Nunca o conteúdo.
   *
   * É o que responde "quais funções são mais usadas" e "quanto tempo a pessoa
   * passa aqui" — perguntas que hoje não têm dado nenhum por trás, e que sem
   * isto só poderiam ser respondidas com chute.
   *
   * Guardar o conteúdo junto seria fácil e seria errado: para saber que o
   * editor é usado não é preciso guardar o que foi escrito nele.
   */
  CREATE TABLE IF NOT EXISTS eventos (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, acao TEXT, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_eventos_quando ON eventos(created_at);
  CREATE INDEX IF NOT EXISTS idx_eventos_tenant ON eventos(tenant_id, created_at);
  /*
   * Reclamações e pedidos, escritos pelo cliente. Antes não existia canal
   * nenhum: a página de Suporte era só perguntas frequentes, e quem tinha um
   * problema não tinha para onde escrever dentro do produto.
   */
  CREATE TABLE IF NOT EXISTS reclamacoes (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, email TEXT,
    tipo TEXT, texto TEXT, status TEXT, resposta TEXT,
    created_at INTEGER, resolvido_em INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_reclamacoes_quando ON reclamacoes(created_at);
  CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_devices_code ON devices(code);
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
`);

/*
 * Migração: a identidade única vira a primeira marca.
 *
 * Roda uma vez por conta e é idempotente (só age quando a conta ainda não tem
 * marca nenhuma). Sem ela, quem já tinha cores e fontes cadastradas abriria a
 * tela de Marca em branco depois do deploy — e concluiria, com razão, que o
 * sistema perdeu o trabalho dele.
 */
const assetCols = db.prepare('PRAGMA table_info(brandassets)').all().map((c) => c.name);
if (!assetCols.includes('marca_id')) db.exec('ALTER TABLE brandassets ADD COLUMN marca_id TEXT');

function migrarBrandkit() {
  const antigos = db.prepare(`SELECT b.* FROM brandkit b
    WHERE NOT EXISTS (SELECT 1 FROM marcas m WHERE m.tenant_id = b.tenant_id)`).all();
  if (!antigos.length) return;
  const ins = db.prepare(`INSERT INTO marcas (id, tenant_id, nome, cores, fonte_titulo, fonte_apoio,
      direcao, tom, observacoes, site, site_resumo, site_shot, site_em, ativa, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', '', 0, 1, ?, ?)`);
  db.exec('BEGIN');
  try {
    for (const b of antigos) {
      ins.run('mk_' + rid(14), b.tenant_id, 'Marca principal', b.cores || '[]',
        b.fonte_titulo || '', b.fonte_apoio || '', b.direcao || '', b.tom || '', b.observacoes || '',
        b.updated_at || Date.now(), b.updated_at || Date.now());
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Migração leve para bancos de dev anteriores (SQLite não tem ADD COLUMN IF
// NOT EXISTS): garante as colunas role/name em users.
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT");
if (!userCols.includes('name')) db.exec("ALTER TABLE users ADD COLUMN name TEXT");
// google_sub: identifica a conta Google (login social). Nulo = só senha.
if (!userCols.includes('google_sub')) db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
db.exec("UPDATE users SET role = 'owner' WHERE role IS NULL");
const mediaCols = db.prepare('PRAGMA table_info(media)').all().map((c) => c.name);
if (!mediaCols.includes('origem')) {
  db.exec("ALTER TABLE media ADD COLUMN origem TEXT");
  db.exec("UPDATE media SET origem = 'upload' WHERE origem IS NULL");
}
const deviceCols = db.prepare('PRAGMA table_info(devices)').all().map((c) => c.name);
if (!deviceCols.includes('last_seen')) db.exec('ALTER TABLE devices ADD COLUMN last_seen INTEGER');
const tenantCols = db.prepare('PRAGMA table_info(tenants)').all().map((c) => c.name);
for (const col of ['plan TEXT', 'plan_status TEXT', 'stripe_customer_id TEXT', 'stripe_subscription_id TEXT', 'plan_renews_at INTEGER',
  // Saldo em duas partes: a franquia do ciclo (expira) e o comprado (não
  // expira). `creditos_ciclo` guarda quando a franquia foi reposta pela
  // última vez, para a reposição acontecer sozinha na virada do mês.
  'creditos_franquia INTEGER', 'creditos_comprados INTEGER', 'creditos_ciclo INTEGER']) {
  if (!tenantCols.includes(col.split(' ')[0])) db.exec('ALTER TABLE tenants ADD COLUMN ' + col);
}
db.exec("UPDATE tenants SET plan = 'free' WHERE plan IS NULL");
migrarBrandkit();

const q = {
  insertTenant: db.prepare("INSERT INTO tenants (id, name, created_at, plan) VALUES (?, ?, ?, 'free')"),
  tenantById: db.prepare('SELECT * FROM tenants WHERE id = ?'),
  tenantByCustomer: db.prepare('SELECT * FROM tenants WHERE stripe_customer_id = ?'),
  countDevicesByTenant: db.prepare('SELECT COUNT(*) AS n FROM devices WHERE tenant_id = ?'),
  insertUser: db.prepare('INSERT INTO users (id, tenant_id, email, pass_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  usersByTenant: db.prepare('SELECT id, email, role, name, created_at FROM users WHERE tenant_id = ? ORDER BY created_at ASC'),
  setUserRole: db.prepare('UPDATE users SET role = ? WHERE id = ? AND tenant_id = ?'),
  setUserName: db.prepare('UPDATE users SET name = ? WHERE id = ?'),
  setTenantName: db.prepare('UPDATE tenants SET name = ? WHERE id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?'),
  countOwners: db.prepare("SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND role = 'owner'"),
  userByGoogle: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
  setUserGoogle: db.prepare('UPDATE users SET google_sub = ? WHERE id = ?'),
  setUserPass: db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?'),
  insertReset: db.prepare('INSERT INTO resets (token, user_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)'),
  resetByToken: db.prepare('SELECT * FROM resets WHERE token = ?'),
  useReset: db.prepare('UPDATE resets SET used_at = ? WHERE token = ?'),
  purgeResets: db.prepare('DELETE FROM resets WHERE user_id = ? AND used_at IS NULL'),
  insertInvite: db.prepare('INSERT INTO invites (id, tenant_id, email, role, code, invited_by, created_at, expires_at, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)'),
  inviteByCode: db.prepare('SELECT * FROM invites WHERE code = ?'),
  invitesByTenant: db.prepare('SELECT id, email, role, code, created_at, expires_at, accepted_at FROM invites WHERE tenant_id = ? AND accepted_at IS NULL ORDER BY created_at DESC'),
  deleteInvite: db.prepare('DELETE FROM invites WHERE id = ? AND tenant_id = ?'),
  acceptInvite: db.prepare('UPDATE invites SET accepted_at = ? WHERE id = ?'),
  insertSession: db.prepare('INSERT INTO sessions (token, user_id, tenant_id, expires_at) VALUES (?, ?, ?, ?)'),
  sessionByToken: db.prepare('SELECT * FROM sessions WHERE token = ?'),
  deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
  deleteSessionsOfUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  insertDevice: db.prepare('INSERT INTO devices (id, tenant_id, code, name, config, device_token, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  deviceById: db.prepare('SELECT * FROM devices WHERE id = ?'),
  deviceByToken: db.prepare('SELECT * FROM devices WHERE device_token = ? AND tenant_id = ?'),
  deviceByCode: db.prepare('SELECT * FROM devices WHERE code = ?'),
  claimDevice: db.prepare('UPDATE devices SET tenant_id = ?, name = ? WHERE id = ?'),
  setConfig: db.prepare('UPDATE devices SET config = ?, name = ?, updated_at = ? WHERE id = ?'),
  renameDevice: db.prepare('UPDATE devices SET name = ? WHERE id = ?'),
  deleteDevice: db.prepare('DELETE FROM devices WHERE id = ?'),
  touchDevice: db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?'),
  listByTenant: db.prepare('SELECT id, name, code, tenant_id, updated_at, last_seen, (config IS NOT NULL) AS has_config FROM devices WHERE tenant_id = ? ORDER BY created_at DESC'),
  insertUsoIA: db.prepare('INSERT INTO uso_ia (id, tenant_id, user_id, tipo, creditos, custo_centavos, referencia, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  usoIAPorTenant: db.prepare('SELECT id, tipo, creditos, custo_centavos, referencia, created_at FROM uso_ia WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?'),
  usoIAResumo: db.prepare('SELECT COALESCE(SUM(creditos),0) AS creditos, COALESCE(SUM(custo_centavos),0) AS centavos, COUNT(*) AS n FROM uso_ia WHERE tenant_id = ? AND created_at > ?'),
  usoIADesde: db.prepare('SELECT COUNT(*) AS n FROM uso_ia WHERE tenant_id = ? AND created_at > ?'),
  creditosDo: db.prepare('SELECT creditos_franquia, creditos_comprados, creditos_ciclo FROM tenants WHERE id = ?'),
  setCreditos: db.prepare('UPDATE tenants SET creditos_franquia = ?, creditos_comprados = ?, creditos_ciclo = ? WHERE id = ?'),
  apagarUsoIA: db.prepare('DELETE FROM uso_ia WHERE tenant_id = ?'),
  insertMedia: db.prepare('INSERT INTO media (id, tenant_id, name, mime, size, key, url, origem, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  mediaByTenant: db.prepare('SELECT id, name, mime, size, url, origem, created_at FROM media WHERE tenant_id = ? ORDER BY created_at DESC'),
  mediaById: db.prepare('SELECT * FROM media WHERE id = ?'),
  deleteMedia: db.prepare('DELETE FROM media WHERE id = ? AND tenant_id = ?'),
  sumMedia: db.prepare('SELECT COALESCE(SUM(size),0) AS n FROM media WHERE tenant_id = ?'),
  insertBirthday: db.prepare('INSERT INTO birthdays (id, tenant_id, nome, matricula, dia, mes, cargo, foto, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  birthdaysByTenant: db.prepare('SELECT id, nome, matricula, dia, mes, cargo, foto FROM birthdays WHERE tenant_id = ? ORDER BY mes, dia, nome'),
  deleteBirthdays: db.prepare('DELETE FROM birthdays WHERE tenant_id = ?'),
  setBirthdayPhoto: db.prepare('UPDATE birthdays SET foto = ? WHERE tenant_id = ? AND matricula = ?'),
  countBirthdays: db.prepare('SELECT COUNT(*) AS n FROM birthdays WHERE tenant_id = ?'),
  insertLibrary: db.prepare('INSERT INTO library (id, tenant_id, campaign, canal, formato, label, item, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  libraryByTenant: db.prepare('SELECT id, campaign, canal, formato, label, item, created_at FROM library WHERE tenant_id = ? ORDER BY created_at DESC'),
  libraryById: db.prepare('SELECT * FROM library WHERE id = ? AND tenant_id = ?'),
  updateLibrary: db.prepare('UPDATE library SET item = ?, label = ? WHERE id = ? AND tenant_id = ?'),
  deleteLibrary: db.prepare('DELETE FROM library WHERE id = ? AND tenant_id = ?'),
  libraryByCampaign: db.prepare('SELECT id, campaign, canal, formato, label, item, created_at FROM library WHERE tenant_id = ? AND campaign = ? ORDER BY created_at ASC'),
  renameCampaign: db.prepare('UPDATE library SET campaign = ? WHERE tenant_id = ? AND campaign = ?'),
  deleteCampaign: db.prepare('DELETE FROM library WHERE tenant_id = ? AND campaign = ?'),
};

async function init() { /* schema já criado no require */ }

/* ---------------- Contas / sessões ---------------- */
async function createAccount(email, passHash, tenantName, userName) {
  const now = Date.now();
  const tenantId = 'ten_' + rid(14);
  const userId = 'usr_' + rid(14);
  q.insertTenant.run(tenantId, tenantName || email, now);
  q.insertUser.run(userId, tenantId, email, passHash, 'owner', userName || tenantName || '', now);
  return { userId, tenantId };
}
async function createUser(tenantId, email, passHash, role, userName) {
  const now = Date.now();
  const userId = 'usr_' + rid(14);
  q.insertUser.run(userId, tenantId, email, passHash, role || 'member', userName || '', now);
  return { userId, tenantId };
}
async function getUserByEmail(email) { return q.userByEmail.get(email) || null; }
async function getUserById(id) { return q.userById.get(id) || null; }
async function getUserByGoogle(sub) { return q.userByGoogle.get(sub) || null; }
async function setUserGoogle(id, sub) { q.setUserGoogle.run(sub, id); }
async function setUserPassword(id, passHash) { q.setUserPass.run(passHash, id); }
async function setUserName(id, name) { q.setUserName.run(String(name || '').slice(0, 80), id); }
async function setTenantName(id, name) { q.setTenantName.run(String(name || '').slice(0, 80), id); }
// Reset de senha: um token de uso único, com validade curta.
async function createReset(token, userId, expiresAt) {
  q.purgeResets.run(userId); // invalida pedidos anteriores
  q.insertReset.run(token, userId, expiresAt, Date.now());
}
async function getReset(token) { return q.resetByToken.get(token) || null; }
async function consumeReset(token) { q.useReset.run(Date.now(), token); }
async function listUsers(tenantId) { return q.usersByTenant.all(tenantId); }
async function setUserRole(userId, tenantId, role) { q.setUserRole.run(role, userId, tenantId); }
async function removeUser(userId, tenantId) { q.deleteUser.run(userId, tenantId); }
async function countOwners(tenantId) { return q.countOwners.get(tenantId).n; }

/* ---------------- Convites ---------------- */
async function createInvite(tenantId, email, role, code, invitedBy, expiresAt) {
  const id = 'inv_' + rid(14);
  q.insertInvite.run(id, tenantId, email, role, code, invitedBy, Date.now(), expiresAt);
  return { id, code };
}
async function getInviteByCode(code) { return q.inviteByCode.get(String(code || '').trim().toUpperCase()) || null; }
async function listInvites(tenantId) { return q.invitesByTenant.all(tenantId); }
async function deleteInvite(id, tenantId) { q.deleteInvite.run(id, tenantId); }
async function acceptInvite(id) { q.acceptInvite.run(Date.now(), id); }
/*
 * Apaga TODAS as sessões de um usuário.
 *
 * Existe por causa de um caminho que fazia o oposto do que a pessoa espera:
 * trocar a senha só gravava o novo hash. Com sessão de 30 dias, o cookie de
 * quem tinha invadido continuava valendo por até um mês — sobrevivendo
 * exatamente à ação que a vítima faz para se defender. No fluxo de "esqueci a
 * senha" era pior, porque ele existe justamente para recuperar conta
 * comprometida.
 */
async function destroySessionsOfUser(userId) { Q.deleteSessionsOfUser.run(userId); }

async function createSession(token, userId, tenantId, expiresAt) {
  q.insertSession.run(token, userId, tenantId, expiresAt);
}
async function getSession(token) {
  const s = q.sessionByToken.get(token);
  if (!s) return null;
  if (s.expires_at && s.expires_at < Date.now()) { q.deleteSession.run(token); return null; }
  return s;
}
async function destroySession(token) { q.deleteSession.run(token); }

/* ---------------- Dispositivos ---------------- */
async function createDevice(id, code, deviceToken) {
  const now = Date.now();
  q.insertDevice.run(id, null, code, '', null, deviceToken, now, now);
  q.touchDevice.run(now, id); // nasce "vivo": pareável já no primeiro segundo
  return { id, code };
}
async function getDevice(id) { return q.deviceById.get(id) || null; }
/*
 * A TV existe, é deste inquilino e apresentou o token certo?
 *
 * Serve para autorizar a leitura do mural pelo player: o código do cartaz
 * autoriza enviar foto, e listar o que os outros mandaram exige a credencial
 * da tela que vai exibir. A comparação é feita em tempo constante lá em
 * server.js, onde o segredo chega.
 */
async function deviceComToken(token, tenantId) {
  if (!token || !tenantId) return null;
  return q.deviceByToken.get(String(token), tenantId) || null;
}

async function getDeviceByCode(code) { return q.deviceByCode.get(String(code || '').trim().toUpperCase()) || null; }
async function claimDevice(id, tenantId, name) { q.claimDevice.run(tenantId, name || '', id); }
async function setDeviceConfig(id, configJson, name) { q.setConfig.run(configJson, name || '', Date.now(), id); }
async function renameDevice(id, name) { q.renameDevice.run(name, id); }
async function removeDevice(id) { q.deleteDevice.run(id); }
async function touchDevice(id) { q.touchDevice.run(Date.now(), id); }
async function listDevices(tenantId) { return q.listByTenant.all(tenantId); }
async function countDevices(tenantId) { return Number(q.countDevicesByTenant.get(tenantId).n); }

/* ---------------- Uso de IA e créditos ---------------- */

async function registrarUsoIA(tenantId, uso) {
  const id = 'uso_' + rid(14);
  q.insertUsoIA.run(id, tenantId, uso.userId || '', uso.tipo || '', Number(uso.creditos) || 0,
    Number(uso.custoCentavos) || 0, uso.referencia || '', Date.now());
  return { id };
}
async function listarUsoIA(tenantId, limite) {
  return q.usoIAPorTenant.all(tenantId, limite || 100).map((r) => ({
    id: r.id, tipo: r.tipo, creditos: r.creditos, custoCentavos: r.custo_centavos,
    referencia: r.referencia, createdAt: r.created_at,
  }));
}
async function resumoUsoIA(tenantId, desde) {
  const r = q.usoIAResumo.get(tenantId, desde || 0);
  return { creditos: Number(r.creditos), custoCentavos: Number(r.centavos), chamadas: Number(r.n) };
}
async function contarUsoIA(tenantId, desde) { return Number(q.usoIADesde.get(tenantId, desde || 0).n); }

async function getCreditos(tenantId) {
  const r = q.creditosDo.get(tenantId);
  if (!r) return null;
  return {
    franquiaRestante: Number(r.creditos_franquia) || 0,
    creditosComprados: Number(r.creditos_comprados) || 0,
    cicloEm: Number(r.creditos_ciclo) || 0,
  };
}
async function setCreditos(tenantId, c) {
  q.setCreditos.run(Math.max(0, Number(c.franquiaRestante) || 0), Math.max(0, Number(c.creditosComprados) || 0),
    Number(c.cicloEm) || 0, tenantId);
}

/* ---------------- Billing (tenant) ---------------- */
async function getTenant(id) { return q.tenantById.get(id) || null; }
async function getTenantByCustomer(customerId) { return q.tenantByCustomer.get(customerId) || null; }
// Atualiza só as colunas de billing informadas (patch parcial).
async function setTenantBilling(id, fields) {
  const map = {
    plan: 'plan', status: 'plan_status', customerId: 'stripe_customer_id',
    subscriptionId: 'stripe_subscription_id', renewsAt: 'plan_renews_at',
  };
  const sets = [], vals = [];
  for (const k of Object.keys(map)) if (k in fields && fields[k] !== undefined) { sets.push(map[k] + ' = ?'); vals.push(fields[k]); }
  if (!sets.length) return;
  vals.push(id);
  db.prepare('UPDATE tenants SET ' + sets.join(', ') + ' WHERE id = ?').run(...vals);
}

/* ---------------- Mídia ---------------- */
async function createMedia(m) {
  q.insertMedia.run(m.id, m.tenantId, m.name, m.mime, m.size, m.key, m.url, m.origem || 'upload', Date.now());
  return m;
}
async function listMedia(tenantId) { return q.mediaByTenant.all(tenantId); }
async function getMedia(id) { return q.mediaById.get(id) || null; }
async function removeMedia(id, tenantId) { q.deleteMedia.run(id, tenantId); }
async function sumMediaBytes(tenantId) { return Number(q.sumMedia.get(tenantId).n); }

/* ----- Aniversariantes ----- */
// Substitui toda a relação do tenant de uma vez (re-importação da planilha).
async function replaceBirthdays(tenantId, rows) {
  db.exec('BEGIN');
  try {
    q.deleteBirthdays.run(tenantId);
    for (const r of rows) {
      q.insertBirthday.run(rid(14), tenantId, r.nome, r.matricula || '', r.dia, r.mes, r.cargo || '', r.foto || '', Date.now());
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return rows.length;
}
async function listBirthdays(tenantId) { return q.birthdaysByTenant.all(tenantId); }
async function clearBirthdays(tenantId) { q.deleteBirthdays.run(tenantId); }
async function setBirthdayPhoto(tenantId, matricula, url) { return q.setBirthdayPhoto.run(url, tenantId, String(matricula)).changes; }
async function countBirthdays(tenantId) { return Number(q.countBirthdays.get(tenantId).n); }

/* ----- Biblioteca de peças (kits de campanha) ----- */
async function addLibrary(tenantId, campaign, pieces) {
  db.exec('BEGIN');
  try {
    for (const p of pieces) {
      q.insertLibrary.run(rid(14), tenantId, String(campaign || '').slice(0, 120), p.canal || '', p.formato || '', p.label || '', JSON.stringify(p.item || {}), Date.now());
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return pieces.length;
}
/* ---------------- Marca (identidade visual) ---------------- */
const qBrand = {
  get: db.prepare('SELECT * FROM brandkit WHERE tenant_id = ?'),
  up: db.prepare(`INSERT INTO brandkit (tenant_id, cores, fonte_titulo, fonte_apoio, direcao, tom, observacoes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET cores=excluded.cores, fonte_titulo=excluded.fonte_titulo,
      fonte_apoio=excluded.fonte_apoio, direcao=excluded.direcao, tom=excluded.tom,
      observacoes=excluded.observacoes, updated_at=excluded.updated_at`),
  listAssets: db.prepare('SELECT * FROM brandassets WHERE tenant_id = ? ORDER BY created_at DESC'),
  addAsset: db.prepare('INSERT INTO brandassets (id, tenant_id, kind, url, label, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
  delAsset: db.prepare('DELETE FROM brandassets WHERE id = ? AND tenant_id = ?'),
  labelAsset: db.prepare('UPDATE brandassets SET label = ? WHERE id = ? AND tenant_id = ?'),
};
/* ---------------- Marcas (até três por conta) ---------------- */
const MAX_MARCAS = 3;
const qMarca = {
  lista: db.prepare('SELECT * FROM marcas WHERE tenant_id = ? ORDER BY created_at ASC'),
  porId: db.prepare('SELECT * FROM marcas WHERE id = ? AND tenant_id = ?'),
  ativa: db.prepare('SELECT * FROM marcas WHERE tenant_id = ? AND ativa = 1 ORDER BY created_at ASC LIMIT 1'),
  primeira: db.prepare('SELECT * FROM marcas WHERE tenant_id = ? ORDER BY created_at ASC LIMIT 1'),
  criar: db.prepare(`INSERT INTO marcas (id, tenant_id, nome, cores, fonte_titulo, fonte_apoio,
      direcao, tom, observacoes, site, site_resumo, site_shot, site_em, ativa, created_at, updated_at)
    VALUES (?, ?, ?, '[]', '', '', '', '', '', '', '', '', 0, ?, ?, ?)`),
  salvar: db.prepare(`UPDATE marcas SET nome = ?, cores = ?, fonte_titulo = ?, fonte_apoio = ?,
      direcao = ?, tom = ?, observacoes = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`),
  salvarSite: db.prepare('UPDATE marcas SET site = ?, site_resumo = ?, site_shot = ?, site_em = ?, updated_at = ? WHERE id = ? AND tenant_id = ?'),
  desativar: db.prepare('UPDATE marcas SET ativa = 0 WHERE tenant_id = ?'),
  ativar: db.prepare('UPDATE marcas SET ativa = 1 WHERE id = ? AND tenant_id = ?'),
  apagar: db.prepare('DELETE FROM marcas WHERE id = ? AND tenant_id = ?'),
  contar: db.prepare('SELECT COUNT(*) AS n FROM marcas WHERE tenant_id = ?'),
};

function mapMarca(r) {
  if (!r) return null;
  let cores = []; try { cores = JSON.parse(r.cores || '[]'); } catch (e) {}
  return {
    id: r.id, nome: r.nome || 'Marca', cores,
    fonteTitulo: r.fonte_titulo || '', fonteApoio: r.fonte_apoio || '',
    direcao: r.direcao || '', tom: r.tom || '', observacoes: r.observacoes || '',
    site: r.site || '', siteResumo: r.site_resumo || '', siteShot: r.site_shot || '', siteEm: r.site_em || 0,
    ativa: !!r.ativa, updatedAt: r.updated_at,
  };
}

/*
 * Toda conta tem PELO MENOS uma marca, criada na hora em que se pergunta por
 * ela. Sem isto, cada chamador teria que lidar com "não há marca ainda" — e a
 * tela de Marca abriria sem lugar onde escrever.
 */
function garantirMarca(tenantId) {
  const r = qMarca.ativa.get(tenantId) || qMarca.primeira.get(tenantId);
  if (r) {
    if (!r.ativa) { qMarca.desativar.run(tenantId); qMarca.ativar.run(r.id, tenantId); }
    return qMarca.porId.get(r.id, tenantId);
  }
  const id = 'mk_' + rid(14);
  const t = Date.now();
  qMarca.criar.run(id, tenantId, 'Marca principal', 1, t, t);
  return qMarca.porId.get(id, tenantId);
}

async function listMarcas(tenantId) {
  garantirMarca(tenantId);
  return qMarca.lista.all(tenantId).map(mapMarca);
}
async function marcaAtiva(tenantId) { return mapMarca(garantirMarca(tenantId)); }
async function criarMarca(tenantId, nome) {
  garantirMarca(tenantId);
  if (qMarca.contar.get(tenantId).n >= MAX_MARCAS) return { erro: 'limite', limite: MAX_MARCAS };
  const id = 'mk_' + rid(14);
  const t = Date.now();
  // A marca nova já entra ATIVA: quem acabou de criar quer trabalhar nela.
  qMarca.desativar.run(tenantId);
  qMarca.criar.run(id, tenantId, String(nome || 'Marca').slice(0, 60), 1, t, t);
  return { marca: mapMarca(qMarca.porId.get(id, tenantId)) };
}
async function salvarMarca(id, tenantId, k) {
  qMarca.salvar.run(String(k.nome || 'Marca').slice(0, 60), JSON.stringify(k.cores || []),
    k.fonteTitulo || '', k.fonteApoio || '', k.direcao || '', k.tom || '', k.observacoes || '',
    Date.now(), id, tenantId);
  return mapMarca(qMarca.porId.get(id, tenantId));
}
async function salvarSiteDaMarca(id, tenantId, site, resumo, shot) {
  qMarca.salvarSite.run(site || '', resumo || '', shot || '', Date.now(), Date.now(), id, tenantId);
  return mapMarca(qMarca.porId.get(id, tenantId));
}
async function ativarMarca(id, tenantId) {
  if (!qMarca.porId.get(id, tenantId)) return null;
  qMarca.desativar.run(tenantId);
  qMarca.ativar.run(id, tenantId);
  return mapMarca(qMarca.porId.get(id, tenantId));
}
async function removerMarca(id, tenantId) {
  // A última não sai: uma conta sem marca nenhuma é um estado que nenhuma tela
  // sabe desenhar, e recriar na marra perderia o nome que a pessoa deu.
  if (qMarca.contar.get(tenantId).n <= 1) return { erro: 'ultima' };
  qMarca.apagar.run(id, tenantId);
  db.prepare('DELETE FROM brandassets WHERE marca_id = ? AND tenant_id = ?').run(id, tenantId);
  garantirMarca(tenantId);
  return { ok: true };
}

/*
 * As duas funções antigas continuam existindo e passam a falar da marca ATIVA.
 *
 * É o que mantém o diretor de IA, o compositor e o editor funcionando sem
 * saber que existem três marcas — para eles sempre houve "a marca da conta", e
 * continua havendo: a que está escolhida agora.
 */
async function getBrandKit(tenantId) { return mapMarca(garantirMarca(tenantId)); }
async function saveBrandKit(tenantId, k) {
  const m = garantirMarca(tenantId);
  /*
   * `k.nome || m.nome`, e não Object.assign({nome: m.nome}, k): quando `k` traz
   * a chave `nome` com valor undefined — que é o que a rota manda quando o
   * corpo não tem nome —, o assign COPIA o undefined por cima e toda marca
   * salva viraria "Marca".
   */
  await salvarMarca(m.id, tenantId, Object.assign({}, k, { nome: k.nome || m.nome }));
}
async function listBrandAssets(tenantId) { return qBrand.listAssets.all(tenantId).map(mapAsset); }
async function addBrandAsset(tenantId, kind, url, label, marcaId) {
  const id = 'ba_' + rid(14);
  qBrand.addAsset.run(id, tenantId, kind, url, label || '', Date.now());
  if (marcaId) db.prepare('UPDATE brandassets SET marca_id = ? WHERE id = ?').run(marcaId, id);
  return { id, kind, url, label: label || '', marcaId: marcaId || '' };
}
async function removeBrandAsset(id, tenantId) { qBrand.delAsset.run(id, tenantId); }
async function labelBrandAsset(id, tenantId, label) { qBrand.labelAsset.run(label || '', id, tenantId); }

/* ---------------- Plataforma: operadores, eventos e reclamações ---------------- */

const qOp = {
  lista: db.prepare('SELECT * FROM operadores ORDER BY created_at ASC'),
  add: db.prepare('INSERT OR REPLACE INTO operadores (email, nome, convidado_por, created_at) VALUES (?, ?, ?, ?)'),
  del: db.prepare('DELETE FROM operadores WHERE email = ?'),
};
async function listarOperadores() {
  return qOp.lista.all().map((r) => ({ email: r.email, nome: r.nome || '', convidadoPor: r.convidado_por || '', createdAt: r.created_at }));
}
async function addOperador(email, nome, convidadoPor) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return null;
  qOp.add.run(e, String(nome || '').slice(0, 80), String(convidadoPor || '').toLowerCase(), Date.now());
  return { email: e, nome: nome || '', convidadoPor: convidadoPor || '' };
}
async function removerOperador(email) {
  qOp.del.run(String(email || '').trim().toLowerCase());
}

const qEv = {
  add: db.prepare('INSERT INTO eventos (id, tenant_id, user_id, acao, created_at) VALUES (?, ?, ?, ?, ?)'),
  porAcao: db.prepare('SELECT acao, COUNT(*) AS n FROM eventos WHERE created_at >= ? GROUP BY acao ORDER BY n DESC LIMIT 30'),
  // Só o par (usuário, instante) — é o suficiente para medir sessão, e não
  // carrega mais nada de ninguém para dentro da conta.
  paraSessoes: db.prepare('SELECT user_id, created_at FROM eventos WHERE created_at >= ? ORDER BY user_id ASC, created_at ASC'),
  contasAtivas: db.prepare('SELECT COUNT(DISTINCT tenant_id) AS n FROM eventos WHERE created_at >= ?'),
  pessoasAtivas: db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM eventos WHERE created_at >= ?'),
  porDia: db.prepare("SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS dia, COUNT(*) AS n FROM eventos WHERE created_at >= ? GROUP BY dia ORDER BY dia ASC"),
  limpar: db.prepare('DELETE FROM eventos WHERE created_at < ?'),
};
async function registrarEvento(tenantId, userId, acao) {
  qEv.add.run('ev_' + rid(14), tenantId || '', userId || '', String(acao || '').slice(0, 40), Date.now());
}
async function eventosPorAcao(desde) { return qEv.porAcao.all(desde || 0).map((r) => ({ acao: r.acao, n: Number(r.n) })); }
async function eventosParaSessoes(desde) { return qEv.paraSessoes.all(desde || 0).map((r) => ({ userId: r.user_id, em: Number(r.created_at) })); }
async function eventosPorDia(desde) { return qEv.porDia.all(desde || 0).map((r) => ({ dia: r.dia, n: Number(r.n) })); }
async function contasAtivas(desde) { return Number(qEv.contasAtivas.get(desde || 0).n); }
async function pessoasAtivas(desde) { return Number(qEv.pessoasAtivas.get(desde || 0).n); }
async function limparEventos(antesDe) { qEv.limpar.run(antesDe); }

const qRec = {
  add: db.prepare('INSERT INTO reclamacoes (id, tenant_id, user_id, email, tipo, texto, status, resposta, created_at, resolvido_em) VALUES (?, ?, ?, ?, ?, ?, ?, \'\', ?, 0)'),
  todas: db.prepare('SELECT * FROM reclamacoes ORDER BY created_at DESC LIMIT ?'),
  doTenant: db.prepare('SELECT * FROM reclamacoes WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 50'),
  resolver: db.prepare('UPDATE reclamacoes SET status = ?, resposta = ?, resolvido_em = ? WHERE id = ?'),
  contar: db.prepare('SELECT status, COUNT(*) AS n FROM reclamacoes WHERE created_at >= ? GROUP BY status'),
};
const mapRec = (r) => ({
  id: r.id, tenantId: r.tenant_id, email: r.email || '', tipo: r.tipo || 'duvida',
  texto: r.texto || '', status: r.status || 'aberta', resposta: r.resposta || '',
  createdAt: r.created_at, resolvidoEm: r.resolvido_em || 0,
});
async function criarReclamacao(tenantId, userId, email, tipo, texto) {
  const id = 'rec_' + rid(14);
  qRec.add.run(id, tenantId, userId || '', String(email || '').slice(0, 160),
    String(tipo || 'duvida').slice(0, 20), String(texto || '').slice(0, 4000), 'aberta', Date.now());
  return { id };
}
async function listarReclamacoes(limite) { return qRec.todas.all(Number(limite) || 100).map(mapRec); }
async function reclamacoesDoTenant(tenantId) { return qRec.doTenant.all(tenantId).map(mapRec); }
async function resolverReclamacao(id, status, resposta) {
  qRec.resolver.run(status, String(resposta || '').slice(0, 2000), Date.now(), id);
}
async function resumoReclamacoes(desde) {
  const out = { aberta: 0, resolvida: 0 };
  for (const r of qRec.contar.all(desde || 0)) out[r.status] = Number(r.n);
  return out;
}

/* Números da plataforma inteira. Só o operador chega aqui — ver server/operadores.js. */
const qPlat = {
  contas: db.prepare('SELECT COUNT(*) AS n FROM tenants'),
  contasNovas: db.prepare('SELECT COUNT(*) AS n FROM tenants WHERE created_at >= ?'),
  pessoas: db.prepare('SELECT COUNT(*) AS n FROM users'),
  telas: db.prepare('SELECT COUNT(*) AS n FROM devices'),
  telasVivas: db.prepare('SELECT COUNT(*) AS n FROM devices WHERE last_seen >= ?'),
  porPlano: db.prepare("SELECT COALESCE(plan, 'free') AS plano, COUNT(*) AS n FROM tenants GROUP BY plano"),
  midiaBytes: db.prepare('SELECT COALESCE(SUM(size), 0) AS b FROM media'),
  pecas: db.prepare('SELECT COUNT(*) AS n FROM library'),
  iaResumo: db.prepare('SELECT COALESCE(SUM(creditos),0) AS c, COALESCE(SUM(custo_centavos),0) AS centavos, COUNT(*) AS n FROM uso_ia WHERE created_at >= ?'),
  iaPorTipo: db.prepare('SELECT tipo, COUNT(*) AS n FROM uso_ia WHERE created_at >= ? GROUP BY tipo ORDER BY n DESC LIMIT 12'),
  maiores: db.prepare(`SELECT t.id, t.name, COALESCE(t.plan, 'free') AS plano, t.created_at,
      (SELECT COUNT(*) FROM devices d WHERE d.tenant_id = t.id) AS telas,
      (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS pessoas
    FROM tenants t ORDER BY telas DESC, t.created_at ASC LIMIT 20`),
};
async function numerosDaPlataforma(agora, vivaDesde, desde) {
  return {
    contas: Number(qPlat.contas.get().n),
    contasNovas: Number(qPlat.contasNovas.get(desde).n),
    pessoas: Number(qPlat.pessoas.get().n),
    telas: Number(qPlat.telas.get().n),
    telasVivas: Number(qPlat.telasVivas.get(vivaDesde).n),
    porPlano: qPlat.porPlano.all().map((r) => ({ plano: r.plano, n: Number(r.n) })),
    midiaBytes: Number(qPlat.midiaBytes.get().b),
    pecas: Number(qPlat.pecas.get().n),
    ia: (() => { const r = qPlat.iaResumo.get(desde); return { creditos: Number(r.c), custoCentavos: Number(r.centavos), chamadas: Number(r.n) }; })(),
    iaPorTipo: qPlat.iaPorTipo.all(desde).map((r) => ({ tipo: r.tipo, n: Number(r.n) })),
    maiores: qPlat.maiores.all().map((r) => ({
      id: r.id, nome: r.name, plano: r.plano, telas: Number(r.telas), pessoas: Number(r.pessoas), createdAt: r.created_at,
    })),
  };
}

/* ---------------- Mural de fotos do público ---------------- */
const qMural = {
  criar: db.prepare('INSERT INTO murais (id, tenant_id, codigo, titulo, aceitando, created_at) VALUES (?, ?, ?, ?, 1, ?)'),
  porTenant: db.prepare('SELECT * FROM murais WHERE tenant_id = ? ORDER BY created_at DESC'),
  porCodigo: db.prepare('SELECT * FROM murais WHERE codigo = ?'),
  porId: db.prepare('SELECT * FROM murais WHERE id = ? AND tenant_id = ?'),
  atualizar: db.prepare('UPDATE murais SET titulo = ?, aceitando = ? WHERE id = ? AND tenant_id = ?'),
  remover: db.prepare('DELETE FROM murais WHERE id = ? AND tenant_id = ?'),
  addFoto: db.prepare('INSERT INTO muralfotos (id, mural_id, tenant_id, url, chave, autor, mensagem, ip, oculta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)'),
  fotos: db.prepare('SELECT * FROM muralfotos WHERE mural_id = ? ORDER BY created_at DESC LIMIT ?'),
  visiveis: db.prepare('SELECT id, url, autor, mensagem, created_at FROM muralfotos WHERE mural_id = ? AND oculta = 0 ORDER BY created_at DESC LIMIT ?'),
  ocultar: db.prepare('UPDATE muralfotos SET oculta = ? WHERE id = ? AND tenant_id = ?'),
  ocultarTodas: db.prepare('UPDATE muralfotos SET oculta = 1 WHERE mural_id = ? AND tenant_id = ?'),
  contarRecentes: db.prepare('SELECT COUNT(*) AS n FROM muralfotos WHERE mural_id = ? AND created_at > ?'),
};
// `tenantId` sai daqui porque a rota pública do QR não tem sessão: quem manda
// a foto é identificado pelo mural, e é do mural que vem a empresa dona dela.
const mapMural = (r) => (r ? { id: r.id, tenantId: r.tenant_id, codigo: r.codigo, titulo: r.titulo, aceitando: !!r.aceitando, createdAt: r.created_at } : null);
const mapFoto = (r) => ({ id: r.id, url: r.url, autor: r.autor || '', mensagem: r.mensagem || '', oculta: !!r.oculta, createdAt: r.created_at });

async function criarMural(tenantId, codigo, titulo) {
  const id = 'mur_' + rid(12);
  qMural.criar.run(id, tenantId, codigo, titulo || 'Mural', Date.now());
  return { id, codigo, titulo: titulo || 'Mural', aceitando: true };
}
async function listarMurais(tenantId) { return qMural.porTenant.all(tenantId).map(mapMural); }
async function muralPorCodigo(codigo) { return mapMural(qMural.porCodigo.get(codigo)); }
async function muralPorId(id, tenantId) { return mapMural(qMural.porId.get(id, tenantId)); }
async function atualizarMural(id, tenantId, titulo, aceitando) { qMural.atualizar.run(titulo || 'Mural', aceitando ? 1 : 0, id, tenantId); }
async function removerMural(id, tenantId) { qMural.remover.run(id, tenantId); }
async function addFotoMural(muralId, tenantId, foto) {
  const id = 'mf_' + rid(14);
  qMural.addFoto.run(id, muralId, tenantId, foto.url, foto.chave || '', foto.autor || '', foto.mensagem || '', foto.ip || '', Date.now());
  return { id, ...foto };
}
async function listarFotosMural(muralId, limite) { return qMural.fotos.all(muralId, limite || 200).map(mapFoto); }
async function fotosVisiveis(muralId, limite) { return qMural.visiveis.all(muralId, limite || 60).map(mapFoto); }
async function ocultarFoto(id, tenantId, oculta) { qMural.ocultar.run(oculta ? 1 : 0, id, tenantId); }
async function ocultarTodasFotos(muralId, tenantId) { return qMural.ocultarTodas.run(muralId, tenantId).changes; }
async function contarFotosRecentes(muralId, desde) { return qMural.contarRecentes.get(muralId, desde).n; }

/* Memória da empresa: o que aprendemos conversando. */
const qMem = {
  get: db.prepare('SELECT dados FROM brandmemoria WHERE tenant_id = ?'),
  up: db.prepare(`INSERT INTO brandmemoria (tenant_id, dados, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(tenant_id) DO UPDATE SET dados=excluded.dados, updated_at=excluded.updated_at`),
  del: db.prepare('DELETE FROM brandmemoria WHERE tenant_id = ?'),
};
async function getMemoria(tenantId) {
  const r = qMem.get.get(tenantId);
  if (!r) return null;
  try { return JSON.parse(r.dados || '{}'); } catch (e) { return null; }
}
async function saveMemoria(tenantId, dados) { qMem.up.run(tenantId, JSON.stringify(dados || {}), Date.now()); }
async function clearMemoria(tenantId) { qMem.del.run(tenantId); }

function mapAsset(r) { return { id: r.id, kind: r.kind, url: r.url, label: r.label || '', marcaId: r.marca_id || '', createdAt: r.created_at }; }
function mapLibRow(r) { let item = {}; try { item = JSON.parse(r.item); } catch (e) {} return { id: r.id, campaign: r.campaign, canal: r.canal, formato: r.formato, label: r.label, item, createdAt: r.created_at }; }
async function listLibrary(tenantId) { return q.libraryByTenant.all(tenantId).map(mapLibRow); }
async function getLibraryItem(id, tenantId) { const r = q.libraryById.get(id, tenantId); return r ? mapLibRow(r) : null; }
async function updateLibraryItem(id, tenantId, item, label) { return q.updateLibrary.run(JSON.stringify(item || {}), label || '', id, tenantId).changes; }
async function deleteLibraryItem(id, tenantId) { q.deleteLibrary.run(id, tenantId); }

/*
 * Aceite dos termos: guarda QUAL versão a pessoa aceitou, quando e de onde. Sem
 * a versão o registro não prova nada — o texto muda e some a referência.
 */
const qAceite = {
  add: db.prepare('INSERT INTO aceites (id, tenant_id, user_id, email, versao, origem, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  byTenant: db.prepare('SELECT versao, origem, email, created_at FROM aceites WHERE tenant_id = ? ORDER BY created_at ASC'),
};
async function registrarAceite(tenantId, userId, email, versao, origem, ip) {
  qAceite.add.run('ac_' + rid(14), tenantId, userId, email || '', versao || '', origem || '', ip || '', Date.now());
}
async function listarAceites(tenantId) { return qAceite.byTenant.all(tenantId); }

/* Operações sobre a campanha inteira — uma pasta é gerenciada como um todo. */
async function listCampaign(tenantId, campaign) { return q.libraryByCampaign.all(tenantId, campaign).map(mapLibRow); }
async function renameCampaign(tenantId, de, para) { return q.renameCampaign.run(para, tenantId, de).changes; }
async function deleteCampaign(tenantId, campaign) { return q.deleteCampaign.run(tenantId, campaign).changes; }

/* ---------------- LGPD: exportar e excluir ---------------- */

/*
 * Tudo que guardamos de uma conta, num objeto só. Senhas e tokens ficam de
 * fora: hash de senha não serve ao titular e token de sessão exportado vira
 * chave de acesso circulando por e-mail.
 */
async function dadosDoTenant(tenantId) {
  const t = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId) || null;
  const pega = (sql) => db.prepare(sql).all(tenantId);
  return {
    conta: t,
    usuarios: pega('SELECT id, email, role, name, created_at FROM users WHERE tenant_id = ?'),
    aceites: pega('SELECT versao, origem, email, ip, created_at FROM aceites WHERE tenant_id = ?'),
    convites: pega('SELECT id, email, role, created_at, expires_at, accepted_at FROM invites WHERE tenant_id = ?'),
    telas: pega('SELECT id, code, name, config, created_at, updated_at, last_seen FROM devices WHERE tenant_id = ?'),
    biblioteca: pega('SELECT id, campaign, canal, formato, label, item, created_at FROM library WHERE tenant_id = ?'),
    marca: db.prepare('SELECT * FROM brandkit WHERE tenant_id = ?').get(tenantId) || null,
    imagensDaMarca: pega('SELECT id, kind, url, label, created_at FROM brandassets WHERE tenant_id = ?'),
    aniversariantes: pega('SELECT id, nome, matricula, dia, mes, cargo, foto, created_at FROM birthdays WHERE tenant_id = ?'),
    midias: pega('SELECT id, name, mime, size, url, created_at FROM media WHERE tenant_id = ?'),
    // O mural também é dado pessoal — de terceiros, inclusive. Exportar sem ele
    // seria entregar uma cópia incompleta com cara de completa.
    murais: pega('SELECT id, codigo, titulo, aceitando, created_at FROM murais WHERE tenant_id = ?'),
    fotosDoMural: pega('SELECT id, mural_id, url, autor, mensagem, ip, oculta, created_at FROM muralfotos WHERE tenant_id = ?'),
  };
}

/*
 * Exclusão de verdade: não há coluna "apagado", não há lixeira. Devolve as
 * chaves das mídias para quem chamou apagar os arquivos no storage — o banco
 * não conhece disco nem R2.
 */
async function apagarTenant(tenantId) {
  // Foto de mural passou a ter linha em `media` (server/midia.js), mas fotos
  // gravadas ANTES dessa mudança só existem em `muralfotos`. A união cobre as
  // duas gerações; apagar uma chave que já sumiu é inofensivo.
  const chaves = [
    ...db.prepare('SELECT key FROM media WHERE tenant_id = ?').all(tenantId).map((r) => r.key),
    ...db.prepare('SELECT chave FROM muralfotos WHERE tenant_id = ?').all(tenantId).map((r) => r.chave),
  ].filter(Boolean);
  const usuarios = db.prepare('SELECT id FROM users WHERE tenant_id = ?').all(tenantId).map((r) => r.id);
  db.exec('BEGIN');
  try {
    for (const uid of usuarios) db.prepare('DELETE FROM resets WHERE user_id = ?').run(uid);
    for (const tabela of ['sessions', 'aceites', 'invites', 'devices', 'library',
      'brandassets', 'brandkit', 'brandmemoria', 'murais', 'muralfotos', 'birthdays', 'media', 'users']) {
      db.prepare('DELETE FROM ' + tabela + ' WHERE tenant_id = ?').run(tenantId);
    }
    db.prepare('DELETE FROM tenants WHERE id = ?').run(tenantId);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return chaves;
}

/*
 * Identificadores sorteados com RNG CRIPTOGRÁFICO.
 *
 * Isto usava `Math.random()`, e três segredos do produto saíam daqui: o
 * `deviceToken` (a credencial permanente de uma TV), a chave de cada arquivo
 * de mídia — que é a única barreira de `/media/*`, uma rota sem autenticação
 * — e o código do mural.
 *
 * O `Math.random()` do V8 é um xorshift128+: o estado de 128 bits é
 * recuperável a partir de saídas observadas. E `POST /api/devices` é público
 * e devolve 38 sorteios seguidos deste mesmo gerador por chamada. Quem
 * observasse algumas criações passava a prever os identificadores seguintes —
 * e com o token previsto vinham a programação e os aniversariantes da tela de
 * outro cliente.
 *
 * `crypto.randomInt` é uniforme e imprevisível. O código de pareamento de 6
 * dígitos já usava esse caminho desde o começo; o resto é que ficou para trás.
 */
function rid(n) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < n; i++) s += c[crypto.randomInt(c.length)];
  return s;
}

module.exports = {
  init,
  createAccount, createUser, getUserByEmail, getUserById, listUsers,
  getUserByGoogle, setUserGoogle, setUserPassword, setUserName, setTenantName,
  createReset, getReset, consumeReset,
  setUserRole, removeUser, countOwners,
  createInvite, getInviteByCode, listInvites, deleteInvite, acceptInvite,
  createSession, getSession, destroySession, destroySessionsOfUser,
  createDevice, getDevice, getDeviceByCode, deviceComToken, claimDevice, setDeviceConfig,
  renameDevice, removeDevice, touchDevice, listDevices, countDevices,
  getTenant, getTenantByCustomer, setTenantBilling,
  registrarUsoIA, listarUsoIA, resumoUsoIA, contarUsoIA, getCreditos, setCreditos,
  createMedia, listMedia, getMedia, removeMedia, sumMediaBytes,
  replaceBirthdays, listBirthdays, clearBirthdays, setBirthdayPhoto, countBirthdays,
  addLibrary, listLibrary, getLibraryItem, updateLibraryItem, deleteLibraryItem, rid,
  listCampaign, renameCampaign, deleteCampaign,
  registrarAceite, listarAceites, dadosDoTenant, apagarTenant,
  getMemoria, saveMemoria, clearMemoria,
  criarMural, listarMurais, muralPorCodigo, muralPorId, atualizarMural, removerMural,
  addFotoMural, listarFotosMural, fotosVisiveis, ocultarFoto, ocultarTodasFotos, contarFotosRecentes,
  getBrandKit, saveBrandKit, listBrandAssets, addBrandAsset, removeBrandAsset, labelBrandAsset,
  listMarcas, marcaAtiva, criarMarca, salvarMarca, ativarMarca, removerMarca, salvarSiteDaMarca, MAX_MARCAS,
  listarOperadores, addOperador, removerOperador,
  registrarEvento, eventosPorAcao, eventosParaSessoes, eventosPorDia, contasAtivas, pessoasAtivas, limparEventos,
  criarReclamacao, listarReclamacoes, reclamacoesDoTenant, resolverReclamacao, resumoReclamacoes,
  numerosDaPlataforma,
};
