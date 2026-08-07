/*
 * server/db-sqlite.js — camada de dados sobre SQLite embutido (node:sqlite).
 *
 * Fallback de desenvolvimento: sem DATABASE_URL, o projeto roda "clone e
 * pronto", sem subir um Postgres. A API é assíncrona para casar 1:1 com o
 * backend Postgres (server/db-postgres.js) — o restante do servidor não
 * precisa saber qual está em uso. Arquivo do banco: data/multitelas.db.
 */
const { DatabaseSync } = require('node:sqlite');
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
  CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, mime TEXT, size INTEGER,
    key TEXT, url TEXT, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id);
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
  CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_devices_code ON devices(code);
  CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
`);

// Migração leve para bancos de dev anteriores (SQLite não tem ADD COLUMN IF
// NOT EXISTS): garante as colunas role/name em users.
const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!userCols.includes('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT");
if (!userCols.includes('name')) db.exec("ALTER TABLE users ADD COLUMN name TEXT");
// google_sub: identifica a conta Google (login social). Nulo = só senha.
if (!userCols.includes('google_sub')) db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
db.exec("UPDATE users SET role = 'owner' WHERE role IS NULL");
const deviceCols = db.prepare('PRAGMA table_info(devices)').all().map((c) => c.name);
if (!deviceCols.includes('last_seen')) db.exec('ALTER TABLE devices ADD COLUMN last_seen INTEGER');
const tenantCols = db.prepare('PRAGMA table_info(tenants)').all().map((c) => c.name);
for (const col of ['plan TEXT', 'plan_status TEXT', 'stripe_customer_id TEXT', 'stripe_subscription_id TEXT', 'plan_renews_at INTEGER']) {
  if (!tenantCols.includes(col.split(' ')[0])) db.exec('ALTER TABLE tenants ADD COLUMN ' + col);
}
db.exec("UPDATE tenants SET plan = 'free' WHERE plan IS NULL");

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
  insertDevice: db.prepare('INSERT INTO devices (id, tenant_id, code, name, config, device_token, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  deviceById: db.prepare('SELECT * FROM devices WHERE id = ?'),
  deviceByCode: db.prepare('SELECT * FROM devices WHERE code = ?'),
  claimDevice: db.prepare('UPDATE devices SET tenant_id = ?, name = ? WHERE id = ?'),
  setConfig: db.prepare('UPDATE devices SET config = ?, name = ?, updated_at = ? WHERE id = ?'),
  renameDevice: db.prepare('UPDATE devices SET name = ? WHERE id = ?'),
  deleteDevice: db.prepare('DELETE FROM devices WHERE id = ?'),
  touchDevice: db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?'),
  listByTenant: db.prepare('SELECT id, name, code, tenant_id, updated_at, last_seen, (config IS NOT NULL) AS has_config FROM devices WHERE tenant_id = ? ORDER BY created_at DESC'),
  insertMedia: db.prepare('INSERT INTO media (id, tenant_id, name, mime, size, key, url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  mediaByTenant: db.prepare('SELECT id, name, mime, size, url, created_at FROM media WHERE tenant_id = ? ORDER BY created_at DESC'),
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
async function getDeviceByCode(code) { return q.deviceByCode.get(String(code || '').trim().toUpperCase()) || null; }
async function claimDevice(id, tenantId, name) { q.claimDevice.run(tenantId, name || '', id); }
async function setDeviceConfig(id, configJson, name) { q.setConfig.run(configJson, name || '', Date.now(), id); }
async function renameDevice(id, name) { q.renameDevice.run(name, id); }
async function removeDevice(id) { q.deleteDevice.run(id); }
async function touchDevice(id) { q.touchDevice.run(Date.now(), id); }
async function listDevices(tenantId) { return q.listByTenant.all(tenantId); }
async function countDevices(tenantId) { return Number(q.countDevicesByTenant.get(tenantId).n); }

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
  q.insertMedia.run(m.id, m.tenantId, m.name, m.mime, m.size, m.key, m.url, Date.now());
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
async function getBrandKit(tenantId) { return mapKit(qBrand.get.get(tenantId)); }
async function saveBrandKit(tenantId, k) {
  qBrand.up.run(tenantId, JSON.stringify(k.cores || []), k.fonteTitulo || '', k.fonteApoio || '',
    k.direcao || '', k.tom || '', k.observacoes || '', Date.now());
}
async function listBrandAssets(tenantId) { return qBrand.listAssets.all(tenantId).map(mapAsset); }
async function addBrandAsset(tenantId, kind, url, label) {
  const id = 'ba_' + rid(14);
  qBrand.addAsset.run(id, tenantId, kind, url, label || '', Date.now());
  return { id, kind, url, label: label || '' };
}
async function removeBrandAsset(id, tenantId) { qBrand.delAsset.run(id, tenantId); }
async function labelBrandAsset(id, tenantId, label) { qBrand.labelAsset.run(label || '', id, tenantId); }

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

function mapKit(r) {
  if (!r) return null;
  let cores = []; try { cores = JSON.parse(r.cores || '[]'); } catch (e) {}
  return { cores, fonteTitulo: r.fonte_titulo || '', fonteApoio: r.fonte_apoio || '',
    direcao: r.direcao || '', tom: r.tom || '', observacoes: r.observacoes || '', updatedAt: r.updated_at };
}
function mapAsset(r) { return { id: r.id, kind: r.kind, url: r.url, label: r.label || '', createdAt: r.created_at }; }
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
  // Foto de mural não passa pela tabela `media`: sem juntar as duas listas, o
  // arquivo continuaria no storage depois da conta apagada.
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

function rid(n) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

module.exports = {
  init,
  createAccount, createUser, getUserByEmail, getUserById, listUsers,
  getUserByGoogle, setUserGoogle, setUserPassword, setUserName, setTenantName,
  createReset, getReset, consumeReset,
  setUserRole, removeUser, countOwners,
  createInvite, getInviteByCode, listInvites, deleteInvite, acceptInvite,
  createSession, getSession, destroySession,
  createDevice, getDevice, getDeviceByCode, claimDevice, setDeviceConfig,
  renameDevice, removeDevice, touchDevice, listDevices, countDevices,
  getTenant, getTenantByCustomer, setTenantBilling,
  createMedia, listMedia, getMedia, removeMedia, sumMediaBytes,
  replaceBirthdays, listBirthdays, clearBirthdays, setBirthdayPhoto, countBirthdays,
  addLibrary, listLibrary, getLibraryItem, updateLibraryItem, deleteLibraryItem, rid,
  listCampaign, renameCampaign, deleteCampaign,
  registrarAceite, listarAceites, dadosDoTenant, apagarTenant,
  getMemoria, saveMemoria, clearMemoria,
  criarMural, listarMurais, muralPorCodigo, muralPorId, atualizarMural, removerMural,
  addFotoMural, listarFotosMural, fotosVisiveis, ocultarFoto, ocultarTodasFotos, contarFotosRecentes,
  getBrandKit, saveBrandKit, listBrandAssets, addBrandAsset, removeBrandAsset, labelBrandAsset,
};
