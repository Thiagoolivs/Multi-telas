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
      pass_hash TEXT, created_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT, expires_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, tenant_id TEXT, code TEXT, name TEXT,
      config TEXT, device_token TEXT, updated_at BIGINT, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_devices_code ON devices(code);
  `);
}

/* ---------------- Contas / sessões ---------------- */
async function createAccount(email, passHash, tenantName) {
  const now = Date.now();
  const tenantId = 'ten_' + rid(14);
  const userId = 'usr_' + rid(14);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO tenants (id, name, created_at) VALUES ($1, $2, $3)', [tenantId, tenantName || email, now]);
    await client.query('INSERT INTO users (id, tenant_id, email, pass_hash, created_at) VALUES ($1, $2, $3, $4, $5)', [userId, tenantId, email, passHash, now]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally { client.release(); }
  return { userId, tenantId };
}
async function getUserByEmail(email) {
  const r = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return r.rows[0] || null;
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
    'INSERT INTO devices (id, tenant_id, code, name, config, device_token, updated_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, null, code, '', null, deviceToken, now, now]);
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
async function listDevices(tenantId) {
  const r = await pool.query(
    'SELECT id, name, code, tenant_id, updated_at, (config IS NOT NULL) AS has_config FROM devices WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]);
  return r.rows;
}

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
