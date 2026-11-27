/*
 * server/agente/banco.js — as duas tabelas do agente, no SQLite e no Postgres.
 *
 *   agente_execucoes   cada volta e cada execução (server/agente/registro.js)
 *   agente_contas      a chave da conta: o operador desligou o agente aqui
 *
 * Ficam num arquivo só do agente, ligadas ao fim de server/db-sqlite.js e
 * server/db-postgres.js, para os dois bancos exporem a MESMA API
 * (server/db.js) sem o agente espalhar SQL pelos arquivos de todo mundo.
 * Apagar a conta (LGPD) apaga as linhas dela aqui também.
 */
'use strict';

const crypto = require('crypto');
const rid = () => 'agx_' + crypto.randomBytes(9).toString('hex');
const json = (t, padrao) => { try { return t ? JSON.parse(t) : padrao; } catch (e) { return padrao; } };

const daLinha = (r) => r && ({
  id: r.id, tenantId: r.tenant_id, userId: r.user_id || '', conversaId: r.conversa_id || '', tipo: r.tipo || '', cerebro: r.cerebro || '',
  pedido: r.pedido || '', resumo: r.resumo || '', motivo: r.motivo || '', passos: json(r.passos, []), custoCentavos: Number(r.custo_centavos) || 0,
  checks: json(r.checks, null), publicado: json(r.publicado, null), ms: Number(r.ms) || 0, criadoEm: Number(r.criado_em) || 0,
});
const txt = (v) => String(v == null ? '' : v);
const colunas = (l) => [rid(), txt(l.tenantId), txt(l.userId), txt(l.conversaId), txt(l.tipo), txt(l.cerebro), txt(l.pedido), txt(l.resumo), txt(l.motivo), JSON.stringify(l.passos || []),
  Number(l.custoCentavos) || 0, JSON.stringify(l.checks || null), JSON.stringify(l.publicado || null), Math.round(Number(l.ms) || 0), l.criadoEm || Date.now()];
const INSERIR_COLUNAS = 'id, tenant_id, user_id, conversa_id, tipo, cerebro, pedido, resumo, motivo, passos, custo_centavos, checks, publicado, ms, criado_em';

// Guarda 180 dias: é o que o suporte usa para entender um caso, não um arquivo eterno.
const GUARDA_MS = 180 * 24 * 60 * 60 * 1000;

function sqlite(db, exportados) {
  db.exec(`CREATE TABLE IF NOT EXISTS agente_execucoes (
    id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, conversa_id TEXT, tipo TEXT, cerebro TEXT, pedido TEXT, resumo TEXT, motivo TEXT,
    passos TEXT, custo_centavos REAL, checks TEXT, publicado TEXT, ms INTEGER, criado_em INTEGER
  )`);
  db.exec('CREATE INDEX IF NOT EXISTS idx_agente_tenant ON agente_execucoes(tenant_id, criado_em)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agente_quando ON agente_execucoes(criado_em)');
  db.exec('CREATE TABLE IF NOT EXISTS agente_contas (tenant_id TEXT PRIMARY KEY, desligado INTEGER, por TEXT, em INTEGER)');
  const inserir = db.prepare('INSERT INTO agente_execucoes (' + INSERIR_COLUNAS + ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const apagarTenantAntes = exportados.apagarTenant;
  return {
    async salvarExecucaoAgente(l) {
      const c = colunas(l);
      inserir.run(...c);
      db.prepare('DELETE FROM agente_execucoes WHERE criado_em < ?').run(Date.now() - GUARDA_MS);
      return daLinha(db.prepare('SELECT * FROM agente_execucoes WHERE id = ?').get(c[0]));
    },
    async listarExecucoesAgente({ tenantId, desde, limite } = {}) {
      const onde = [];
      const args = [];
      if (tenantId) { onde.push('tenant_id = ?'); args.push(tenantId); }
      if (desde) { onde.push('criado_em >= ?'); args.push(Number(desde)); }
      args.push(Math.min(5000, limite || 30));
      return db.prepare('SELECT * FROM agente_execucoes' + (onde.length ? ' WHERE ' + onde.join(' AND ') : '') + ' ORDER BY criado_em DESC LIMIT ?').all(...args).map(daLinha);
    },
    async agenteDaConta(tenantId) {
      const r = db.prepare('SELECT * FROM agente_contas WHERE tenant_id = ?').get(tenantId);
      return r ? { desligado: !!Number(r.desligado), por: r.por || '', em: Number(r.em) || 0 } : null;
    },
    async salvarAgenteDaConta(tenantId, { desligado, por } = {}) {
      db.prepare('INSERT INTO agente_contas (tenant_id, desligado, por, em) VALUES (?, ?, ?, ?) ON CONFLICT(tenant_id) DO UPDATE SET desligado = excluded.desligado, por = excluded.por, em = excluded.em')
        .run(tenantId, desligado ? 1 : 0, String(por || '').slice(0, 120), Date.now());
    },
    async apagarTenant(tenantId) {
      const r = await apagarTenantAntes(tenantId);
      db.prepare('DELETE FROM agente_execucoes WHERE tenant_id = ?').run(tenantId);
      db.prepare('DELETE FROM agente_contas WHERE tenant_id = ?').run(tenantId);
      return r;
    },
  };
}

function postgres(pool, exportados) {
  const initAntes = exportados.init;
  const apagarTenantAntes = exportados.apagarTenant;
  return {
    async init() {
      await initAntes();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS agente_execucoes (
          id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, conversa_id TEXT, tipo TEXT, cerebro TEXT, pedido TEXT, resumo TEXT, motivo TEXT,
          passos TEXT, custo_centavos DOUBLE PRECISION, checks TEXT, publicado TEXT, ms BIGINT, criado_em BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_agente_tenant ON agente_execucoes(tenant_id, criado_em);
        CREATE INDEX IF NOT EXISTS idx_agente_quando ON agente_execucoes(criado_em);
        CREATE TABLE IF NOT EXISTS agente_contas (tenant_id TEXT PRIMARY KEY, desligado INTEGER, por TEXT, em BIGINT);
      `);
    },
    async salvarExecucaoAgente(l) {
      const c = colunas(l);
      const ph = c.map((_, i) => '$' + (i + 1)).join(', ');
      const r = await pool.query('INSERT INTO agente_execucoes (' + INSERIR_COLUNAS + ') VALUES (' + ph + ') RETURNING *', c);
      pool.query('DELETE FROM agente_execucoes WHERE criado_em < $1', [Date.now() - GUARDA_MS]).catch(() => {});
      return daLinha(r.rows[0]);
    },
    async listarExecucoesAgente({ tenantId, desde, limite } = {}) {
      const onde = [];
      const args = [];
      if (tenantId) { args.push(tenantId); onde.push('tenant_id = $' + args.length); }
      if (desde) { args.push(Number(desde)); onde.push('criado_em >= $' + args.length); }
      args.push(Math.min(5000, limite || 30));
      const r = await pool.query('SELECT * FROM agente_execucoes' + (onde.length ? ' WHERE ' + onde.join(' AND ') : '') + ' ORDER BY criado_em DESC LIMIT $' + args.length, args);
      return r.rows.map(daLinha);
    },
    async agenteDaConta(tenantId) {
      const r = await pool.query('SELECT * FROM agente_contas WHERE tenant_id = $1', [tenantId]);
      const x = r.rows[0];
      return x ? { desligado: !!Number(x.desligado), por: x.por || '', em: Number(x.em) || 0 } : null;
    },
    async salvarAgenteDaConta(tenantId, { desligado, por } = {}) {
      await pool.query('INSERT INTO agente_contas (tenant_id, desligado, por, em) VALUES ($1, $2, $3, $4) ON CONFLICT (tenant_id) DO UPDATE SET desligado = EXCLUDED.desligado, por = EXCLUDED.por, em = EXCLUDED.em',
        [tenantId, desligado ? 1 : 0, String(por || '').slice(0, 120), Date.now()]);
    },
    async apagarTenant(tenantId) {
      const r = await apagarTenantAntes(tenantId);
      await pool.query('DELETE FROM agente_execucoes WHERE tenant_id = $1', [tenantId]);
      await pool.query('DELETE FROM agente_contas WHERE tenant_id = $1', [tenantId]);
      return r;
    },
  };
}

module.exports = { sqlite, postgres };
