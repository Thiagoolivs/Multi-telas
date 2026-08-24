const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../server/db-postgres.js');
let code = fs.readFileSync(file, 'utf8');

// 1. Add schema
const resetsTable = `    CREATE TABLE IF NOT EXISTS resets (
      token TEXT PRIMARY KEY, user_id TEXT, expires_at BIGINT, used_at BIGINT, created_at BIGINT
    );`;

const verificationsTable = `
    CREATE TABLE IF NOT EXISTS verifications (
      token TEXT PRIMARY KEY, payload TEXT, expires_at BIGINT, used_at BIGINT, created_at BIGINT
    );`;

code = code.replace(resetsTable, resetsTable + verificationsTable);

// 2. Add methods
const methods = `
// --- Verificações de E-mail (Cadastro) ---
async function createVerification(token, payload, expiresAt) {
  await pool.query('INSERT INTO verifications (token, payload, expires_at, created_at) VALUES ($1, $2, $3, $4)', [token, JSON.stringify(payload), expiresAt, Date.now()]);
}
async function getVerification(token) {
  const r = await pool.query('SELECT * FROM verifications WHERE token = $1 AND used_at IS NULL AND expires_at > $2', [token, Date.now()]);
  if (!r.rows[0]) return null;
  const v = r.rows[0];
  try { v.payload = JSON.parse(v.payload); } catch(e) { v.payload = {}; }
  return v;
}
async function consumeVerification(token) {
  await pool.query('UPDATE verifications SET used_at = $1 WHERE token = $2', [Date.now(), token]);
}
`;

code = code.replace('module.exports = {', methods + '\nmodule.exports = {');

// 3. Export methods
code = code.replace('createReset, getReset, consumeReset,', 'createReset, getReset, consumeReset, createVerification, getVerification, consumeVerification,');

fs.writeFileSync(file, code);
console.log('Verifications added to db-postgres.js');
