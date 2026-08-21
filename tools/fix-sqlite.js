const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '../server/db-sqlite.js');
let code = fs.readFileSync(file, 'utf8');

// The code I inserted earlier for qVerif is at the bottom of the file
const badCreate = `
  CREATE TABLE IF NOT EXISTS verifications (
    token TEXT PRIMARY KEY, payload TEXT, expires_at INTEGER, used_at INTEGER, created_at INTEGER
  );`;
code = code.replace(badCreate, '');

const verifBlockFind = `const qVerif = {`;
const verifBlockReplace = `
// Garante que a tabela existe antes de fazer db.prepare
db.exec(\`
  CREATE TABLE IF NOT EXISTS verifications (
    token TEXT PRIMARY KEY, payload TEXT, expires_at INTEGER, used_at INTEGER, created_at INTEGER
  );
\`);

const qVerif = {`;

code = code.replace(verifBlockFind, verifBlockReplace);

fs.writeFileSync(file, code);
console.log('Fixed db-sqlite.js');
