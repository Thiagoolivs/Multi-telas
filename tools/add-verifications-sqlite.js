const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../server/db-sqlite.js');
let code = fs.readFileSync(file, 'utf8');

// 1. Add schema
const resetsTable = `  CREATE TABLE IF NOT EXISTS resets (
    token TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER, used_at INTEGER, created_at INTEGER
  );`;

const verificationsTable = `
  CREATE TABLE IF NOT EXISTS verifications (
    token TEXT PRIMARY KEY, payload TEXT, expires_at INTEGER, used_at INTEGER, created_at INTEGER
  );`;

code = code.replace(resetsTable, resetsTable + verificationsTable);

// 2. Add methods
const methods = `
// --- Verificações de E-mail (Cadastro) ---
const qVerif = {
  create: db.prepare('INSERT INTO verifications (token, payload, expires_at, created_at) VALUES (?, ?, ?, ?)'),
  get: db.prepare('SELECT * FROM verifications WHERE token = ? AND used_at IS NULL AND expires_at > ?'),
  use: db.prepare('UPDATE verifications SET used_at = ? WHERE token = ?'),
};
async function createVerification(token, payload, expiresAt) {
  qVerif.create.run(token, JSON.stringify(payload), expiresAt, Date.now());
}
async function getVerification(token) {
  const v = qVerif.get.get(token, Date.now());
  if (!v) return null;
  try { v.payload = JSON.parse(v.payload); } catch(e) { v.payload = {}; }
  return v;
}
async function consumeVerification(token) {
  qVerif.use.run(Date.now(), token);
}
`;

code = code.replace('module.exports = {', methods + '\nmodule.exports = {');

// 3. Export methods
code = code.replace('createReset, getReset, consumeReset,', 'createReset, getReset, consumeReset, createVerification, getVerification, consumeVerification,');

fs.writeFileSync(file, code);
console.log('Verifications added to db-sqlite.js');
