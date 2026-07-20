/*
 * server/db-sqlite.js — camada de dados sobre SQLite embutido (node:sqlite).
 *
 * Fallback de desenvolvimento: sem DATABASE_URL, o projeto roda "clone e
 * pronto", sem subir um Postgres. A API é assíncrona para casar 1:1 com o
 * backend Postgres (server/db-postgres.js) — o restante do servidor não
 * precisa saber qual está em uso. Arquivo do banco: data/vistra.db.
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'vistra.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY, name TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT UNIQUE,
    pass_hash TEXT, role TEXT, name TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT, expires_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, name TEXT,
    config TEXT, device_token TEXT, updated_at INTEGER, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS invites (
    id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, role TEXT, code TEXT,
    invited_by TEXT, created_at INTEGER, expires_at INTEGER, accepted_at INTEGER
  );
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
db.exec("UPDATE users SET role = 'owner' WHERE role IS NULL");

const q = {
  insertTenant: db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)'),
  insertUser: db.prepare('INSERT INTO users (id, tenant_id, email, pass_hash, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  usersByTenant: db.prepare('SELECT id, email, role, name, created_at FROM users WHERE tenant_id = ? ORDER BY created_at ASC'),
  setUserRole: db.prepare('UPDATE users SET role = ? WHERE id = ? AND tenant_id = ?'),
  deleteUser: db.prepare('DELETE FROM users WHERE id = ? AND tenant_id = ?'),
  countOwners: db.prepare("SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND role = 'owner'"),
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
  listByTenant: db.prepare('SELECT id, name, code, tenant_id, updated_at, (config IS NOT NULL) AS has_config FROM devices WHERE tenant_id = ? ORDER BY created_at DESC'),
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
  return { id, code };
}
async function getDevice(id) { return q.deviceById.get(id) || null; }
async function getDeviceByCode(code) { return q.deviceByCode.get(String(code || '').trim().toUpperCase()) || null; }
async function claimDevice(id, tenantId, name) { q.claimDevice.run(tenantId, name || '', id); }
async function setDeviceConfig(id, configJson, name) { q.setConfig.run(configJson, name || '', Date.now(), id); }
async function renameDevice(id, name) { q.renameDevice.run(name, id); }
async function removeDevice(id) { q.deleteDevice.run(id); }
async function listDevices(tenantId) { return q.listByTenant.all(tenantId); }

function rid(n) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

module.exports = {
  init,
  createAccount, createUser, getUserByEmail, getUserById, listUsers,
  setUserRole, removeUser, countOwners,
  createInvite, getInviteByCode, listInvites, deleteInvite, acceptInvite,
  createSession, getSession, destroySession,
  createDevice, getDevice, getDeviceByCode, claimDevice, setDeviceConfig,
  renameDevice, removeDevice, listDevices, rid,
};
