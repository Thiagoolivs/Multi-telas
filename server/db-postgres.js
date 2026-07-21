/*
 * server/db-postgres.js — camada de dados sobre PostgreSQL (driver `pg`).
 *
 * Backend de produção. Toda a API é assíncrona (Promises). A conexão vem de
 * DATABASE_URL (Railway/Neon/Supabase/etc. fornecem essa variável). O schema
 * é criado de forma idempotente em init(), chamado antes do servidor subir.
 *
 * Modelo (MVP multi-tenant): 1 usuário = 1 tenant (empresa). Dispositivos
 * pertencem a um tenant após o pareamento. Config guardada como JSON (TEXT).
 */
const { Pool, types } = require('pg');

// BIGINT (int8, OID 20) volta como número — nossos timestamps são epoch em
// milissegundos, bem abaixo de Number.MAX_SAFE_INTEGER. Assim o backend
// Postgres devolve os mesmos tipos que o SQLite (números, não strings).
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10)));

function sslOption(connStr) {
  if (process.env.PGSSL === 'disable') return false;
  if (process.env.PGSSL === 'require') return { rejectUnauthorized: false };
  try {
    const u = new URL(connStr);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    return local ? false : { rejectUnauthorized: false };
  } catch (e) { return false; }
}

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: sslOption(connectionString) });
pool.on('error', (e) => console.warn('[pg] pool error:', e.message));

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY, name TEXT, created_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT UNIQUE,
      pass_hash TEXT, role TEXT, name TEXT, created_at BIGINT
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
    UPDATE users SET role = 'owner' WHERE role IS NULL;
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT, expires_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, name TEXT,
      config TEXT, device_token TEXT, updated_at BIGINT, created_at BIGINT,
      last_seen BIGINT
    );
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_seen BIGINT;
    CREATE TABLE IF NOT EXISTS invites (
      id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT, role TEXT, code TEXT,
      invited_by TEXT, created_at BIGINT, expires_at BIGINT, accepted_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, mime TEXT, size BIGINT,
      key TEXT, url TEXT, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_devices_code ON devices(code);
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_invites_tenant ON invites(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
  `);
}

/* ---------------- Contas / sessões ---------------- */
async function createAccount(email, passHash, tenantName, userName) {
  const now = Date.now();
  const tenantId = 'ten_' + rid(14);
  const userId = 'usr_' + rid(14);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)', [tenantId, tenantName || email, now]);
    await client.query('INSERT INTO users (id, tenant_id, email, pass_hash, role, name, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [userId, tenantId, email, passHash, 'owner', userName || tenantName || '', now]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); }
  return { userId, tenantId };
}
// Adiciona um usuário a um tenant existente (fluxo de convite).
async function createUser(tenantId, email, passHash, role, userName) {
  const now = Date.now();
  const userId = 'usr_' + rid(14);
  await pool.query('INSERT INTO users (id, tenant_id, email, pass_hash, role, name, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [userId, tenantId, email, passHash, role || 'member', userName || '', now]);
  return { userId, tenantId };
}
async function getUserByEmail(email) {
  const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return r.rows[0] || null;
}
async function getUserById(id) {
  const r = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function listUsers(tenantId) {
  const r = await pool.query('SELECT id, email, role, name, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at ASC', [tenantId]);
  return r.rows;
}
async function setUserRole(userId, tenantId, role) {
  await pool.query('UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3', [role, userId, tenantId]);
}
async function removeUser(userId, tenantId) {
  await pool.query('DELETE FROM users WHERE id = $1 AND tenant_id = $2', [userId, tenantId]);
}
async function countOwners(tenantId) {
  const r = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE tenant_id = $1 AND role = 'owner'", [tenantId]);
  return r.rows[0].n;
}

/* ---------------- Convites ---------------- */
async function createInvite(tenantId, email, role, code, invitedBy, expiresAt) {
  const id = 'inv_' + rid(14);
  await pool.query('INSERT INTO invites (id, tenant_id, email, role, code, invited_by, created_at, expires_at, accepted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)', [id, tenantId, email, role, code, invitedBy, Date.now(), expiresAt]);
  return { id, code };
}
async function getInviteByCode(code) {
  const r = await pool.query('SELECT * FROM invites WHERE code = $1', [String(code || '').trim().toUpperCase()]);
  return r.rows[0] || null;
}
async function listInvites(tenantId) {
  const r = await pool.query('SELECT id, email, role, code, created_at, expires_at, accepted_at FROM invites WHERE tenant_id = $1 AND accepted_at IS NULL ORDER BY created_at DESC', [tenantId]);
  return r.rows;
}
async function deleteInvite(id, tenantId) {
  await pool.query('DELETE FROM invites WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
}
async function acceptInvite(id) {
  await pool.query('UPDATE invites SET accepted_at = $1 WHERE id = $2', [Date.now(), id]);
}
async function createSession(token, userId, tenantId, expiresAt) {
  await pool.query('INSERT INTO sessions (token, user_id, tenant_id, expires_at) VALUES ($1, $2, $3, $4)', [token, userId, tenantId, expiresAt]);
}
async function getSession(token) {
  const r = await pool.query('SELECT * FROM sessions WHERE token = $1', [token]);
  const s = r.rows[0];
  if (!s) return null;
  if (s.expires_at && Number(s.expires_at) < Date.now()) { await destroySession(token); return null; }
  return s;
}
async function destroySession(token) { await pool.query('DELETE FROM sessions WHERE token = $1', [token]); }

/* ---------------- Dispositivos ---------------- */
async function createDevice(id, code, deviceToken) {
  const now = Date.now();
  await pool.query(
    'INSERT INTO devices (id, tenant_id, code, name, config, device_token, updated_at, created_at, last_seen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, null, code, '', null, deviceToken, now, now, now]); // nasce "vivo": pareável já
  return { id, code };
}
async function getDevice(id) {
  const r = await pool.query('SELECT * FROM devices WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function getDeviceByCode(code) {
  const r = await pool.query('SELECT * FROM devices WHERE code = $1', [String(code || '').trim().toUpperCase()]);
  return r.rows[0] || null;
}
async function claimDevice(id, tenantId, name) {
  await pool.query('UPDATE devices SET tenant_id = $1, name = $2 WHERE id = $3', [tenantId, name || '', id]);
}
async function setDeviceConfig(id, configJson, name) {
  await pool.query('UPDATE devices SET config = $1, name = $2, updated_at = $3 WHERE id = $4', [configJson, name || '', Date.now(), id]);
}
async function renameDevice(id, name) { await pool.query('UPDATE devices SET name = $1 WHERE id = $2', [name, id]); }
async function removeDevice(id) { await pool.query('DELETE FROM devices WHERE id = $1', [id]); }
async function touchDevice(id) { await pool.query('UPDATE devices SET last_seen = $1 WHERE id = $2', [Date.now(), id]); }
async function listDevices(tenantId) {
  const r = await pool.query(
    'SELECT id, name, code, tenant_id, updated_at, last_seen, (config IS NOT NULL) AS has_config FROM devices WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]);
  return r.rows;
}

/* ---------------- Mídia ---------------- */
async function createMedia(m) {
  await pool.query('INSERT INTO media (id, tenant_id, name, mime, size, key, url, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [m.id, m.tenantId, m.name, m.mime, m.size, m.key, m.url, Date.now()]);
  return m;
}
async function listMedia(tenantId) {
  const r = await pool.query('SELECT id, name, mime, size, url, created_at FROM media WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows;
}
async function getMedia(id) {
  const r = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function removeMedia(id, tenantId) {
  await pool.query('DELETE FROM media WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
}
async function sumMediaBytes(tenantId) {
  const r = await pool.query('SELECT COALESCE(SUM(size),0)::bigint AS n FROM media WHERE tenant_id = $1', [tenantId]);
  return Number(r.rows[0].n);
}

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
  renameDevice, removeDevice, touchDevice, listDevices,
  createMedia, listMedia, getMedia, removeMedia, sumMediaBytes, rid,
};
