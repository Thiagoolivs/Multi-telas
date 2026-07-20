/*
 * server/db.js — seleção do backend de dados.
 *
 * Com DATABASE_URL definido, usa PostgreSQL (produção). Sem ele, cai no
 * SQLite embutido (dev local, "clone e pronto"). Os dois expõem a MESMA API
 * assíncrona, então o restante do servidor não sabe qual está em uso.
 *
 * O schema é criado em init(), que server.js aguarda antes de subir.
 * Ver docs/PLANO-SAAS.md para o modelo multi-tenant.
 */
const usePostgres = !!process.env.DATABASE_URL;
const impl = usePostgres ? require('./db-postgres') : require('./db-sqlite');

if (usePostgres) console.log('[db] backend: PostgreSQL');
else console.log('[db] backend: SQLite (defina DATABASE_URL para usar Postgres)');

module.exports = impl;
