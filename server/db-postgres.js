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
    // Rede privada (localhost ou host interno do Railway) NÃO usa SSL — forçar
    // SSL aí quebra a conexão ("server does not support SSL connections").
    const plain = u.hostname === 'localhost' || u.hostname === '127.0.0.1' ||
      /\.railway\.internal$/.test(u.hostname) || /\.internal$/.test(u.hostname);
    return plain ? false : { rejectUnauthorized: false };
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
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_status TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan_renews_at BIGINT;
    UPDATE tenants SET plan = 'free' WHERE plan IS NULL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT UNIQUE,
      pass_hash TEXT, role TEXT, name TEXT, created_at BIGINT
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
    -- google_sub: conta Google vinculada (login social). Nulo = só senha.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
    UPDATE users SET role = 'owner' WHERE role IS NULL;
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY, user_id TEXT, tenant_id TEXT, expires_at BIGINT
    );
    -- Mural: o público envia foto por QR e ela aparece na TV. O codigo é o
    -- que vai no QR — curto porque às vezes alguém digita à mão.
    CREATE TABLE IF NOT EXISTS murais (
      id TEXT PRIMARY KEY, tenant_id TEXT, codigo TEXT UNIQUE, titulo TEXT,
      aceitando BOOLEAN, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_murais_tenant ON murais(tenant_id);
    -- Coluna oculta em vez de DELETE: o botão de pânico precisa ser
    -- instantâneo e reversível. Apagar arquivo de storage no meio de um evento
    -- é irreversível e lento justamente quando a pressa é máxima.
    CREATE TABLE IF NOT EXISTS muralfotos (
      id TEXT PRIMARY KEY, mural_id TEXT, tenant_id TEXT, url TEXT, chave TEXT,
      autor TEXT, mensagem TEXT, ip TEXT, oculta BOOLEAN, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_muralfotos_mural ON muralfotos(mural_id);
    -- Identidade visual da empresa: uma linha por tenant.
    CREATE TABLE IF NOT EXISTS brandkit (
      tenant_id TEXT PRIMARY KEY, cores TEXT, fonte_titulo TEXT, fonte_apoio TEXT,
      direcao TEXT, tom TEXT, observacoes TEXT, updated_at BIGINT
    );
    -- Prova de que a pessoa aceitou os termos, e QUAL versão deles.
    CREATE TABLE IF NOT EXISTS aceites (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, email TEXT,
      versao TEXT, origem TEXT, ip TEXT, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_aceites_tenant ON aceites(tenant_id);
    -- O que o sistema DEDUZIU sobre a empresa, conversando. Separado do
    -- brandkit: aquilo o usuário declarou; isto é dedução, e dedução precisa
    -- poder ser revista e esquecida.
    CREATE TABLE IF NOT EXISTS brandmemoria (
      tenant_id TEXT PRIMARY KEY, dados TEXT, updated_at BIGINT
    );
    -- Imagens da marca: logo, bases reutilizáveis e referências de estilo.
    CREATE TABLE IF NOT EXISTS brandassets (
      id TEXT PRIMARY KEY, tenant_id TEXT, kind TEXT, url TEXT, label TEXT, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_brandassets_tenant ON brandassets(tenant_id);
    CREATE TABLE IF NOT EXISTS resets (
      token TEXT PRIMARY KEY, user_id TEXT, expires_at BIGINT, used_at BIGINT, created_at BIGINT
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
    CREATE TABLE IF NOT EXISTS birthdays (
      id TEXT PRIMARY KEY, tenant_id TEXT, nome TEXT, matricula TEXT,
      dia INTEGER, mes INTEGER, cargo TEXT, foto TEXT, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_birthdays_tenant ON birthdays(tenant_id);
    CREATE TABLE IF NOT EXISTS library (
      id TEXT PRIMARY KEY, tenant_id TEXT, campaign TEXT, canal TEXT, formato TEXT,
      label TEXT, item TEXT, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_library_tenant ON library(tenant_id);
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
    await client.query("INSERT INTO tenants (id, name, created_at, plan) VALUES ($1, $2, $3, 'free')", [tenantId, tenantName || email, now]);
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
async function getUserByGoogle(sub) {
  const r = await pool.query('SELECT * FROM users WHERE google_sub = $1', [sub]);
  return r.rows[0] || null;
}
async function setUserGoogle(id, sub) {
  await pool.query('UPDATE users SET google_sub = $1 WHERE id = $2', [sub, id]);
}
async function setUserPassword(id, passHash) {
  await pool.query('UPDATE users SET pass_hash = $1 WHERE id = $2', [passHash, id]);
}
async function setUserName(id, name) {
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [String(name || '').slice(0, 80), id]);
}
async function setTenantName(id, name) {
  await pool.query('UPDATE tenants SET name = $1 WHERE id = $2', [String(name || '').slice(0, 80), id]);
}
// Reset de senha: token de uso único e validade curta.
async function createReset(token, userId, expiresAt) {
  await pool.query('DELETE FROM resets WHERE user_id = $1 AND used_at IS NULL', [userId]);
  await pool.query('INSERT INTO resets (token, user_id, expires_at, used_at, created_at) VALUES ($1, $2, $3, NULL, $4)', [token, userId, expiresAt, Date.now()]);
}
async function getReset(token) {
  const r = await pool.query('SELECT * FROM resets WHERE token = $1', [token]);
  return r.rows[0] || null;
}
async function consumeReset(token) {
  await pool.query('UPDATE resets SET used_at = $1 WHERE token = $2', [Date.now(), token]);
}
/* ---------------- Marca (identidade visual) ---------------- */
function mapKit(r) {
  if (!r) return null;
  let cores = []; try { cores = JSON.parse(r.cores || '[]'); } catch (e) {}
  return { cores, fonteTitulo: r.fonte_titulo || '', fonteApoio: r.fonte_apoio || '',
    direcao: r.direcao || '', tom: r.tom || '', observacoes: r.observacoes || '', updatedAt: r.updated_at };
}
async function getBrandKit(tenantId) {
  const r = await pool.query('SELECT * FROM brandkit WHERE tenant_id = $1', [tenantId]);
  return mapKit(r.rows[0]);
}
async function saveBrandKit(tenantId, k) {
  await pool.query(`INSERT INTO brandkit (tenant_id, cores, fonte_titulo, fonte_apoio, direcao, tom, observacoes, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (tenant_id) DO UPDATE SET cores=EXCLUDED.cores, fonte_titulo=EXCLUDED.fonte_titulo,
      fonte_apoio=EXCLUDED.fonte_apoio, direcao=EXCLUDED.direcao, tom=EXCLUDED.tom,
      observacoes=EXCLUDED.observacoes, updated_at=EXCLUDED.updated_at`,
    [tenantId, JSON.stringify(k.cores || []), k.fonteTitulo || '', k.fonteApoio || '',
     k.direcao || '', k.tom || '', k.observacoes || '', Date.now()]);
}
async function listBrandAssets(tenantId) {
  const r = await pool.query('SELECT * FROM brandassets WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows.map((x) => ({ id: x.id, kind: x.kind, url: x.url, label: x.label || '', createdAt: x.created_at }));
}
async function addBrandAsset(tenantId, kind, url, label) {
  const id = 'ba_' + rid(14);
  await pool.query('INSERT INTO brandassets (id, tenant_id, kind, url, label, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
    [id, tenantId, kind, url, label || '', Date.now()]);
  return { id, kind, url, label: label || '' };
}
async function removeBrandAsset(id, tenantId) {
  await pool.query('DELETE FROM brandassets WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
}
/* ---------------- Mural de fotos do público ---------------- */
// `tenantId` sai daqui porque a rota pública do QR não tem sessão: quem manda
// a foto é identificado pelo mural, e é do mural que vem a empresa dona dela.
const mapMural = (r) => (r ? { id: r.id, tenantId: r.tenant_id, codigo: r.codigo, titulo: r.titulo, aceitando: !!r.aceitando, createdAt: r.created_at } : null);
const mapFoto = (r) => ({ id: r.id, url: r.url, autor: r.autor || '', mensagem: r.mensagem || '', oculta: !!r.oculta, createdAt: r.created_at });

async function criarMural(tenantId, codigo, titulo) {
  const id = 'mur_' + rid(12);
  await pool.query('INSERT INTO murais (id, tenant_id, codigo, titulo, aceitando, created_at) VALUES ($1,$2,$3,$4,TRUE,$5)',
    [id, tenantId, codigo, titulo || 'Mural', Date.now()]);
  return { id, codigo, titulo: titulo || 'Mural', aceitando: true };
}
async function listarMurais(tenantId) {
  const r = await pool.query('SELECT * FROM murais WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows.map(mapMural);
}
async function muralPorCodigo(codigo) {
  const r = await pool.query('SELECT * FROM murais WHERE codigo = $1', [codigo]);
  return mapMural(r.rows[0]);
}
async function muralPorId(id, tenantId) {
  const r = await pool.query('SELECT * FROM murais WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return mapMural(r.rows[0]);
}
async function atualizarMural(id, tenantId, titulo, aceitando) {
  await pool.query('UPDATE murais SET titulo = $1, aceitando = $2 WHERE id = $3 AND tenant_id = $4',
    [titulo || 'Mural', !!aceitando, id, tenantId]);
}
async function removerMural(id, tenantId) {
  await pool.query('DELETE FROM murais WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
}
async function addFotoMural(muralId, tenantId, foto) {
  const id = 'mf_' + rid(14);
  await pool.query('INSERT INTO muralfotos (id, mural_id, tenant_id, url, chave, autor, mensagem, ip, oculta, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,FALSE,$9)',
    [id, muralId, tenantId, foto.url, foto.chave || '', foto.autor || '', foto.mensagem || '', foto.ip || '', Date.now()]);
  return { id, ...foto };
}
async function listarFotosMural(muralId, limite) {
  const r = await pool.query('SELECT * FROM muralfotos WHERE mural_id = $1 ORDER BY created_at DESC LIMIT $2', [muralId, limite || 200]);
  return r.rows.map(mapFoto);
}
async function fotosVisiveis(muralId, limite) {
  const r = await pool.query('SELECT id, url, autor, mensagem, created_at FROM muralfotos WHERE mural_id = $1 AND oculta = FALSE ORDER BY created_at DESC LIMIT $2', [muralId, limite || 60]);
  return r.rows.map(mapFoto);
}
async function ocultarFoto(id, tenantId, oculta) {
  await pool.query('UPDATE muralfotos SET oculta = $1 WHERE id = $2 AND tenant_id = $3', [!!oculta, id, tenantId]);
}
async function ocultarTodasFotos(muralId, tenantId) {
  const r = await pool.query('UPDATE muralfotos SET oculta = TRUE WHERE mural_id = $1 AND tenant_id = $2', [muralId, tenantId]);
  return r.rowCount;
}
async function contarFotosRecentes(muralId, desde) {
  const r = await pool.query('SELECT COUNT(*) AS n FROM muralfotos WHERE mural_id = $1 AND created_at > $2', [muralId, desde]);
  return Number(r.rows[0].n) || 0;
}

/* Memória da empresa: o que aprendemos conversando. */
async function getMemoria(tenantId) {
  const r = await pool.query('SELECT dados FROM brandmemoria WHERE tenant_id = $1', [tenantId]);
  if (!r.rows[0]) return null;
  try { return JSON.parse(r.rows[0].dados || '{}'); } catch (e) { return null; }
}
async function saveMemoria(tenantId, dados) {
  await pool.query(`INSERT INTO brandmemoria (tenant_id, dados, updated_at) VALUES ($1,$2,$3)
    ON CONFLICT (tenant_id) DO UPDATE SET dados=EXCLUDED.dados, updated_at=EXCLUDED.updated_at`,
    [tenantId, JSON.stringify(dados || {}), Date.now()]);
}
async function clearMemoria(tenantId) {
  await pool.query('DELETE FROM brandmemoria WHERE tenant_id = $1', [tenantId]);
}

async function labelBrandAsset(id, tenantId, label) {
  await pool.query('UPDATE brandassets SET label = $1 WHERE id = $2 AND tenant_id = $3', [label || '', id, tenantId]);
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

async function countDevices(tenantId) {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM devices WHERE tenant_id = $1', [tenantId]);
  return Number(r.rows[0].n);
}

/* ---------------- Billing (tenant) ---------------- */
async function getTenant(id) {
  const r = await pool.query('SELECT * FROM tenants WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function getTenantByCustomer(customerId) {
  const r = await pool.query('SELECT * FROM tenants WHERE stripe_customer_id = $1', [customerId]);
  return r.rows[0] || null;
}
// Atualiza só as colunas de billing informadas (patch parcial).
async function setTenantBilling(id, fields) {
  const map = {
    plan: 'plan', status: 'plan_status', customerId: 'stripe_customer_id',
    subscriptionId: 'stripe_subscription_id', renewsAt: 'plan_renews_at',
  };
  const sets = [], vals = [];
  let i = 1;
  for (const k of Object.keys(map)) if (k in fields && fields[k] !== undefined) { sets.push(map[k] + ' = $' + (i++)); vals.push(fields[k]); }
  if (!sets.length) return;
  vals.push(id);
  await pool.query('UPDATE tenants SET ' + sets.join(', ') + ' WHERE id = $' + i, vals);
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

/* ----- Aniversariantes ----- */
// Substitui toda a relação do tenant de uma vez (re-importação da planilha).
async function replaceBirthdays(tenantId, rows) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM birthdays WHERE tenant_id = $1', [tenantId]);
    for (const r of rows) {
      await client.query(
        'INSERT INTO birthdays (id, tenant_id, nome, matricula, dia, mes, cargo, foto, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [rid(14), tenantId, r.nome, r.matricula || '', r.dia, r.mes, r.cargo || '', r.foto || '', Date.now()]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK'); throw e;
  } finally {
    client.release();
  }
  return rows.length;
}
async function listBirthdays(tenantId) {
  const r = await pool.query('SELECT id, nome, matricula, dia, mes, cargo, foto FROM birthdays WHERE tenant_id = $1 ORDER BY mes, dia, nome', [tenantId]);
  return r.rows;
}
async function clearBirthdays(tenantId) { await pool.query('DELETE FROM birthdays WHERE tenant_id = $1', [tenantId]); }
async function setBirthdayPhoto(tenantId, matricula, url) {
  const r = await pool.query('UPDATE birthdays SET foto = $1 WHERE tenant_id = $2 AND matricula = $3', [url, tenantId, String(matricula)]);
  return r.rowCount;
}
async function countBirthdays(tenantId) {
  const r = await pool.query('SELECT COUNT(*)::int AS n FROM birthdays WHERE tenant_id = $1', [tenantId]);
  return Number(r.rows[0].n);
}

/* ----- Biblioteca de peças (kits de campanha) ----- */
async function addLibrary(tenantId, campaign, pieces) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of pieces) {
      await client.query('INSERT INTO library (id, tenant_id, campaign, canal, formato, label, item, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [rid(14), tenantId, String(campaign || '').slice(0, 120), p.canal || '', p.formato || '', p.label || '', JSON.stringify(p.item || {}), Date.now()]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  return pieces.length;
}
function mapLibRow(r) { let item = {}; try { item = JSON.parse(r.item); } catch (e) {} return { id: r.id, campaign: r.campaign, canal: r.canal, formato: r.formato, label: r.label, item, createdAt: Number(r.created_at) }; }
async function listLibrary(tenantId) {
  const r = await pool.query('SELECT id, campaign, canal, formato, label, item, created_at FROM library WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows.map(mapLibRow);
}
async function getLibraryItem(id, tenantId) {
  const r = await pool.query('SELECT * FROM library WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return r.rows[0] ? mapLibRow(r.rows[0]) : null;
}
async function updateLibraryItem(id, tenantId, item, label) {
  const r = await pool.query('UPDATE library SET item = $1, label = $2 WHERE id = $3 AND tenant_id = $4', [JSON.stringify(item || {}), label || '', id, tenantId]);
  return r.rowCount;
}
async function deleteLibraryItem(id, tenantId) { await pool.query('DELETE FROM library WHERE id = $1 AND tenant_id = $2', [id, tenantId]); }

/*
 * Aceite dos termos: guarda QUAL versão a pessoa aceitou, quando e de onde. Sem
 * a versão o registro não prova nada — o texto muda e some a referência.
 */
async function registrarAceite(tenantId, userId, email, versao, origem, ip) {
  await pool.query('INSERT INTO aceites (id, tenant_id, user_id, email, versao, origem, ip, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    ['ac_' + rid(14), tenantId, userId, email || '', versao || '', origem || '', ip || '', Date.now()]);
}
async function listarAceites(tenantId) {
  const r = await pool.query('SELECT versao, origem, email, created_at FROM aceites WHERE tenant_id = $1 ORDER BY created_at ASC', [tenantId]);
  return r.rows;
}

/* Operações sobre a campanha inteira — uma pasta é gerenciada como um todo. */
async function listCampaign(tenantId, campaign) {
  const r = await pool.query('SELECT id, campaign, canal, formato, label, item, created_at FROM library WHERE tenant_id = $1 AND campaign = $2 ORDER BY created_at ASC', [tenantId, campaign]);
  return r.rows.map(mapLibRow);
}
async function renameCampaign(tenantId, de, para) {
  const r = await pool.query('UPDATE library SET campaign = $1 WHERE tenant_id = $2 AND campaign = $3', [para, tenantId, de]);
  return r.rowCount;
}
async function deleteCampaign(tenantId, campaign) {
  const r = await pool.query('DELETE FROM library WHERE tenant_id = $1 AND campaign = $2', [tenantId, campaign]);
  return r.rowCount;
}

/* ---------------- LGPD: exportar e excluir ---------------- */

/*
 * Tudo que guardamos de uma conta, num objeto só. Senhas e tokens ficam de
 * fora: hash de senha não serve ao titular e token de sessão exportado vira
 * chave de acesso circulando por e-mail.
 */
async function dadosDoTenant(tenantId) {
  const um = async (sql) => (await pool.query(sql, [tenantId])).rows[0] || null;
  const varios = async (sql) => (await pool.query(sql, [tenantId])).rows;
  return {
    conta: await um('SELECT * FROM tenants WHERE id = $1'),
    usuarios: await varios('SELECT id, email, role, name, created_at FROM users WHERE tenant_id = $1'),
    aceites: await varios('SELECT versao, origem, email, ip, created_at FROM aceites WHERE tenant_id = $1'),
    convites: await varios('SELECT id, email, role, created_at, expires_at, accepted_at FROM invites WHERE tenant_id = $1'),
    telas: await varios('SELECT id, code, name, config, created_at, updated_at, last_seen FROM devices WHERE tenant_id = $1'),
    biblioteca: await varios('SELECT id, campaign, canal, formato, label, item, created_at FROM library WHERE tenant_id = $1'),
    marca: await um('SELECT * FROM brandkit WHERE tenant_id = $1'),
    imagensDaMarca: await varios('SELECT id, kind, url, label, created_at FROM brandassets WHERE tenant_id = $1'),
    aniversariantes: await varios('SELECT id, nome, matricula, dia, mes, cargo, foto, created_at FROM birthdays WHERE tenant_id = $1'),
    midias: await varios('SELECT id, name, mime, size, url, created_at FROM media WHERE tenant_id = $1'),
    // O mural também é dado pessoal — de terceiros, inclusive. Exportar sem ele
    // seria entregar uma cópia incompleta com cara de completa.
    murais: await varios('SELECT id, codigo, titulo, aceitando, created_at FROM murais WHERE tenant_id = $1'),
    fotosDoMural: await varios('SELECT id, mural_id, url, autor, mensagem, ip, oculta, created_at FROM muralfotos WHERE tenant_id = $1'),
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
    ...(await pool.query('SELECT key FROM media WHERE tenant_id = $1', [tenantId])).rows.map((r) => r.key),
    ...(await pool.query('SELECT chave FROM muralfotos WHERE tenant_id = $1', [tenantId])).rows.map((r) => r.chave),
  ].filter(Boolean);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM resets WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)', [tenantId]);
    for (const tabela of ['sessions', 'aceites', 'invites', 'devices', 'library',
      'brandassets', 'brandkit', 'brandmemoria', 'murais', 'muralfotos', 'birthdays', 'media', 'users']) {
      await client.query('DELETE FROM ' + tabela + ' WHERE tenant_id = $1', [tenantId]);
    }
    await client.query('DELETE FROM tenants WHERE id = $1', [tenantId]);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
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
