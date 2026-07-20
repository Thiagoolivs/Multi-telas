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
    pass_hash TEXT, created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT, expires_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, name TEXT,
    config TEXT, device_token TEXT, updated_at INTEGER, created_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
  CREATE INDEX IF NOT EXISTS idx_devices_code ON devices(code);
`);

const q = {
  insertTenant: db.prepare('INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)'),
  insertUser: db.prepare('INSERT INTO users (id, tenant_id, email, pass_hash, created_at) VALUES (?, ?, ?, ?, ?)'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
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
async function createAccount(email, passHash, tenantName) {
  const now = Date.now();
  const tenantId = 'ten_' + rid(14);
  const userId = 'usr_' + rid(14);
  q.insertTenant.run(tenantId, tenantName || email, now);
  q.insertUser.run(userId, tenantId, email, passHash, now);
  return { userId, tenantId };
}
async function getUserByEmail(email) { return q.userByEmail.get(email) || null; }
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
  createAccount, getUserByEmail, createSession, getSession, destroySession,
  createDevice, getDevice, getDeviceByCode, claimDevice, setDeviceConfig,
  renameDevice, removeDevice, listDevices, rid,
};
