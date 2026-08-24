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
const crypto = require('crypto');

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
    ALTER TABLE brandassets ADD COLUMN IF NOT EXISTS marca_id TEXT;
    /*
     * Marcas — até três por conta.
     *
     * "brandkit" tinha o tenant como CHAVE PRIMÁRIA: uma identidade por
     * empresa, por construção. Quem atende três clientes com o mesmo painel
     * tinha que reescrever as cores a cada peça. As linhas antigas são
     * migradas para cá logo abaixo, uma vez só.
     */
    CREATE TABLE IF NOT EXISTS marcas (
      id TEXT PRIMARY KEY, tenant_id TEXT, nome TEXT, cores TEXT,
      fonte_titulo TEXT, fonte_apoio TEXT, direcao TEXT, tom TEXT, observacoes TEXT,
      site TEXT, site_resumo TEXT, site_shot TEXT, site_em BIGINT,
      ativa BOOLEAN, created_at BIGINT, updated_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_marcas_tenant ON marcas(tenant_id);
    -- Quem opera a PLATAFORMA (não uma conta). A raiz da confiança é a
    -- variável ADMIN_EMAILS; aqui só ficam os que a raiz convidou depois.
    CREATE TABLE IF NOT EXISTS operadores (
      email TEXT PRIMARY KEY, nome TEXT, convidado_por TEXT, created_at BIGINT
    );
    -- Eventos de uso: QUE função foi usada, por quem e quando. Nunca o
    -- conteúdo — para saber que o editor é usado não é preciso guardar o que
    -- foi escrito nele.
    -- Trabalhos de IA. Viviam só na memória: um deploy no meio de uma geração
    -- matava o trabalho, e uma geração PRONTA que ninguém tinha lido ia junto.
    -- A coluna resultado é JSON em texto: cada tipo devolve uma forma diferente.
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, tipo TEXT,
      estado TEXT, etapa TEXT, detalhe TEXT, resultado TEXT, erro TEXT,
      pedido TEXT, criado_em BIGINT, terminado_em BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_tenant ON jobs(tenant_id, criado_em);
    CREATE INDEX IF NOT EXISTS idx_jobs_estado ON jobs(estado);
    CREATE TABLE IF NOT EXISTS eventos (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, acao TEXT, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_eventos_quando ON eventos(created_at);
    CREATE INDEX IF NOT EXISTS idx_eventos_tenant ON eventos(tenant_id, created_at);
    -- Reclamações e pedidos escritos pelo cliente. Antes não havia canal
    -- nenhum dentro do produto.
    CREATE TABLE IF NOT EXISTS reclamacoes (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, email TEXT,
      tipo TEXT, texto TEXT, status TEXT, resposta TEXT,
      created_at BIGINT, resolvido_em BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_reclamacoes_quando ON reclamacoes(created_at);
    /*
     * A identidade única vira a primeira marca. Idempotente: só age em conta
     * que ainda não tem marca nenhuma. Sem isto, quem já tinha cores e fontes
     * abriria a tela de Marca em branco depois do deploy — e concluiria, com
     * razão, que o sistema perdeu o trabalho dele.
     */
    INSERT INTO marcas (id, tenant_id, nome, cores, fonte_titulo, fonte_apoio, direcao, tom,
        observacoes, site, site_resumo, site_shot, site_em, ativa, created_at, updated_at)
      SELECT 'mk_' || substr(md5(random()::text || b.tenant_id), 1, 14), b.tenant_id, 'Marca principal',
             b.cores, b.fonte_titulo, b.fonte_apoio, b.direcao, b.tom, b.observacoes,
             '', '', '', 0, TRUE, COALESCE(b.updated_at, 0), COALESCE(b.updated_at, 0)
        FROM brandkit b
       WHERE NOT EXISTS (SELECT 1 FROM marcas m WHERE m.tenant_id = b.tenant_id);
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
    -- origem: 'upload' (a pessoa enviou), 'ia' (gerada) ou 'mural' (do
    -- público). Toda gravação passa por server/midia.js e cai aqui.
    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY, tenant_id TEXT, name TEXT, mime TEXT, size BIGINT,
      key TEXT, url TEXT, created_at BIGINT
    );
    ALTER TABLE media ADD COLUMN IF NOT EXISTS origem TEXT;
    UPDATE media SET origem = 'upload' WHERE origem IS NULL;
    CREATE INDEX IF NOT EXISTS idx_media_tenant ON media(tenant_id);
    /*
     * Uso de IA: toda chamada entra aqui, cobrando crédito ou não. Medir
     * antes de cobrar é a fatia 1 de docs/BILLING.md.
     */
    CREATE TABLE IF NOT EXISTS uso_ia (
      id TEXT PRIMARY KEY, tenant_id TEXT, user_id TEXT, tipo TEXT,
      creditos INTEGER, custo_centavos INTEGER, referencia TEXT, created_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS idx_uso_ia_tenant ON uso_ia(tenant_id, created_at);
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS creditos_franquia INTEGER;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS creditos_comprados INTEGER;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS creditos_ciclo BIGINT;
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
/* ---------------- Marcas (até três por conta) ---------------- */
const MAX_MARCAS = 3;

function mapMarca(r) {
  if (!r) return null;
  let cores = []; try { cores = JSON.parse(r.cores || '[]'); } catch (e) {}
  return {
    id: r.id, nome: r.nome || 'Marca', cores,
    fonteTitulo: r.fonte_titulo || '', fonteApoio: r.fonte_apoio || '',
    direcao: r.direcao || '', tom: r.tom || '', observacoes: r.observacoes || '',
    site: r.site || '', siteResumo: r.site_resumo || '', siteShot: r.site_shot || '', siteEm: Number(r.site_em) || 0,
    ativa: !!r.ativa, updatedAt: r.updated_at,
  };
}

/*
 * Toda conta tem PELO MENOS uma marca, criada na hora em que se pergunta por
 * ela. Sem isto, cada chamador teria que lidar com "não há marca ainda" — e a
 * tela de Marca abriria sem lugar onde escrever.
 */
async function garantirMarca(tenantId) {
  const r = await pool.query(
    'SELECT * FROM marcas WHERE tenant_id = $1 ORDER BY ativa DESC, created_at ASC LIMIT 1', [tenantId]);
  if (r.rows[0]) {
    const m = r.rows[0];
    if (!m.ativa) await pool.query('UPDATE marcas SET ativa = (id = $2) WHERE tenant_id = $1', [tenantId, m.id]);
    return Object.assign({}, m, { ativa: true });
  }
  const id = 'mk_' + rid(14);
  const t = Date.now();
  await pool.query(`INSERT INTO marcas (id, tenant_id, nome, cores, fonte_titulo, fonte_apoio, direcao, tom,
      observacoes, site, site_resumo, site_shot, site_em, ativa, created_at, updated_at)
    VALUES ($1,$2,$3,'[]','','','','','','','','',0,TRUE,$4,$4)`, [id, tenantId, 'Marca principal', t]);
  const n = await pool.query('SELECT * FROM marcas WHERE id = $1', [id]);
  return n.rows[0];
}

async function listMarcas(tenantId) {
  await garantirMarca(tenantId);
  const r = await pool.query('SELECT * FROM marcas WHERE tenant_id = $1 ORDER BY created_at ASC', [tenantId]);
  return r.rows.map(mapMarca);
}
async function marcaAtiva(tenantId) { return mapMarca(await garantirMarca(tenantId)); }
async function criarMarca(tenantId, nome) {
  await garantirMarca(tenantId);
  const c = await pool.query('SELECT COUNT(*)::int AS n FROM marcas WHERE tenant_id = $1', [tenantId]);
  if (c.rows[0].n >= MAX_MARCAS) return { erro: 'limite', limite: MAX_MARCAS };
  const id = 'mk_' + rid(14);
  const t = Date.now();
  // A marca nova já entra ATIVA: quem acabou de criar quer trabalhar nela.
  await pool.query(`INSERT INTO marcas (id, tenant_id, nome, cores, fonte_titulo, fonte_apoio, direcao, tom,
      observacoes, site, site_resumo, site_shot, site_em, ativa, created_at, updated_at)
    VALUES ($1,$2,$3,'[]','','','','','','','','',0,FALSE,$4,$4)`, [id, tenantId, String(nome || 'Marca').slice(0, 60), t]);
  await pool.query('UPDATE marcas SET ativa = (id = $2) WHERE tenant_id = $1', [tenantId, id]);
  const n = await pool.query('SELECT * FROM marcas WHERE id = $1', [id]);
  return { marca: mapMarca(n.rows[0]) };
}
async function salvarMarca(id, tenantId, k) {
  await pool.query(`UPDATE marcas SET nome=$1, cores=$2, fonte_titulo=$3, fonte_apoio=$4,
      direcao=$5, tom=$6, observacoes=$7, updated_at=$8 WHERE id=$9 AND tenant_id=$10`,
    [String(k.nome || 'Marca').slice(0, 60), JSON.stringify(k.cores || []), k.fonteTitulo || '',
     k.fonteApoio || '', k.direcao || '', k.tom || '', k.observacoes || '', Date.now(), id, tenantId]);
  const r = await pool.query('SELECT * FROM marcas WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return mapMarca(r.rows[0]);
}
async function salvarSiteDaMarca(id, tenantId, site, resumo, shot) {
  await pool.query('UPDATE marcas SET site=$1, site_resumo=$2, site_shot=$3, site_em=$4, updated_at=$4 WHERE id=$5 AND tenant_id=$6',
    [site || '', resumo || '', shot || '', Date.now(), id, tenantId]);
  const r = await pool.query('SELECT * FROM marcas WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  return mapMarca(r.rows[0]);
}
async function ativarMarca(id, tenantId) {
  const r = await pool.query('SELECT 1 FROM marcas WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  if (!r.rows[0]) return null;
  await pool.query('UPDATE marcas SET ativa = (id = $2) WHERE tenant_id = $1', [tenantId, id]);
  const n = await pool.query('SELECT * FROM marcas WHERE id = $1', [id]);
  return mapMarca(n.rows[0]);
}
async function removerMarca(id, tenantId) {
  // A última não sai: uma conta sem marca nenhuma é um estado que nenhuma tela
  // sabe desenhar, e recriar na marra perderia o nome que a pessoa deu.
  const c = await pool.query('SELECT COUNT(*)::int AS n FROM marcas WHERE tenant_id = $1', [tenantId]);
  if (c.rows[0].n <= 1) return { erro: 'ultima' };
  await pool.query('DELETE FROM marcas WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
  await pool.query('DELETE FROM brandassets WHERE marca_id = $1 AND tenant_id = $2', [id, tenantId]);
  await garantirMarca(tenantId);
  return { ok: true };
}

/*
 * As duas funções antigas continuam existindo e passam a falar da marca ATIVA.
 *
 * É o que mantém o diretor de IA, o compositor e o editor funcionando sem
 * saber que existem três marcas — para eles sempre houve "a marca da conta", e
 * continua havendo: a que está escolhida agora.
 */
async function getBrandKit(tenantId) { return mapMarca(await garantirMarca(tenantId)); }
async function saveBrandKit(tenantId, k) {
  const m = await garantirMarca(tenantId);
  /*
   * `k.nome || m.nome`, e não Object.assign({nome: m.nome}, k): quando `k` traz
   * a chave `nome` com valor undefined — que é o que a rota manda quando o
   * corpo não tem nome —, o assign COPIA o undefined por cima e toda marca
   * salva viraria "Marca".
   */
  await salvarMarca(m.id, tenantId, Object.assign({}, k, { nome: k.nome || m.nome }));
}
async function listBrandAssets(tenantId) {
  const r = await pool.query('SELECT * FROM brandassets WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
  return r.rows.map((x) => ({ id: x.id, kind: x.kind, url: x.url, label: x.label || '', marcaId: x.marca_id || '', createdAt: x.created_at }));
}
async function addBrandAsset(tenantId, kind, url, label, marcaId) {
  const id = 'ba_' + rid(14);
  await pool.query('INSERT INTO brandassets (id, tenant_id, kind, url, label, marca_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
    [id, tenantId, kind, url, label || '', marcaId || null, Date.now()]);
  return { id, kind, url, label: label || '', marcaId: marcaId || '' };
}
async function removeBrandAsset(id, tenantId) {
  await pool.query('DELETE FROM brandassets WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
}
/* ---------------- Plataforma: operadores, eventos e reclamações ---------------- */

async function listarOperadores() {
  const r = await pool.query('SELECT * FROM operadores ORDER BY created_at ASC');
  return r.rows.map((x) => ({ email: x.email, nome: x.nome || '', convidadoPor: x.convidado_por || '', createdAt: Number(x.created_at) }));
}
async function addOperador(email, nome, convidadoPor) {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return null;
  await pool.query(`INSERT INTO operadores (email, nome, convidado_por, created_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome`,
    [e, String(nome || '').slice(0, 80), String(convidadoPor || '').toLowerCase(), Date.now()]);
  return { email: e, nome: nome || '', convidadoPor: convidadoPor || '' };
}
async function removerOperador(email) {
  await pool.query('DELETE FROM operadores WHERE email = $1', [String(email || '').trim().toLowerCase()]);
}

async function registrarEvento(tenantId, userId, acao) {
  await pool.query('INSERT INTO eventos (id, tenant_id, user_id, acao, created_at) VALUES ($1,$2,$3,$4,$5)',
    ['ev_' + rid(14), tenantId || '', userId || '', String(acao || '').slice(0, 40), Date.now()]);
}
async function eventosPorAcao(desde) {
  const r = await pool.query('SELECT acao, COUNT(*)::int AS n FROM eventos WHERE created_at >= $1 GROUP BY acao ORDER BY n DESC LIMIT 30', [desde || 0]);
  return r.rows.map((x) => ({ acao: x.acao, n: Number(x.n) }));
}
async function eventosParaSessoes(desde) {
  // Só o par (usuário, instante): é o suficiente para medir sessão, e não
  // carrega mais nada de ninguém para dentro da conta.
  const r = await pool.query('SELECT user_id, created_at FROM eventos WHERE created_at >= $1 ORDER BY user_id ASC, created_at ASC', [desde || 0]);
  return r.rows.map((x) => ({ userId: x.user_id, em: Number(x.created_at) }));
}
async function eventosPorDia(desde) {
  const r = await pool.query(
    "SELECT to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD') AS dia, COUNT(*)::int AS n FROM eventos WHERE created_at >= $1 GROUP BY dia ORDER BY dia ASC", [desde || 0]);
  return r.rows.map((x) => ({ dia: x.dia, n: Number(x.n) }));
}
async function contasAtivas(desde) {
  const r = await pool.query('SELECT COUNT(DISTINCT tenant_id)::int AS n FROM eventos WHERE created_at >= $1', [desde || 0]);
  return Number(r.rows[0].n);
}
async function pessoasAtivas(desde) {
  const r = await pool.query('SELECT COUNT(DISTINCT user_id)::int AS n FROM eventos WHERE created_at >= $1', [desde || 0]);
  return Number(r.rows[0].n);
}
async function limparEventos(antesDe) {
  await pool.query('DELETE FROM eventos WHERE created_at < $1', [antesDe]);
}

/* ---------------- Trabalhos de IA ---------------- */
/* Ver a nota em db-sqlite.js: a memória guarda o que está rodando, o banco
 * guarda o que sobrevive a reinício. Mesma API assíncrona nos dois. */
async function salvarJob(j) {
  await pool.query(
    `INSERT INTO jobs (id, tenant_id, user_id, tipo, estado, etapa, detalhe, resultado, erro, pedido, criado_em, terminado_em)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [j.id, j.tenantId, j.userId || null, j.tipo || '', j.estado, j.etapa || '', j.detalhe || '',
      j.resultado == null ? null : JSON.stringify(j.resultado), j.erro || null,
      j.pedido == null ? null : JSON.stringify(j.pedido), j.criadoEm, j.terminadoEm || null]
  );
}
async function atualizarJob(j) {
  await pool.query(
    `UPDATE jobs SET estado = $1, etapa = $2, detalhe = $3, resultado = $4, erro = $5, terminado_em = $6 WHERE id = $7`,
    [j.estado, j.etapa || '', j.detalhe || '',
      j.resultado == null ? null : JSON.stringify(j.resultado), j.erro || null, j.terminadoEm || null, j.id]
  );
}
async function lerJob(id) {
  const r = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
  return r.rows[0] || null;
}
async function listarJobs(tenantId, desde, limite) {
  const r = await pool.query('SELECT * FROM jobs WHERE tenant_id = $1 AND criado_em > $2 ORDER BY criado_em DESC LIMIT $3',
    [tenantId, desde || 0, limite || 20]);
  return r.rows;
}
async function interromperJobs(motivo) {
  await pool.query("UPDATE jobs SET estado = 'erro', erro = $1, terminado_em = $2 WHERE estado = 'rodando'", [motivo, Date.now()]);
}
async function limparJobs(antesDe) {
  await pool.query('DELETE FROM jobs WHERE criado_em < $1', [antesDe]);
}


const mapRec = (r) => ({
  id: r.id, tenantId: r.tenant_id, email: r.email || '', tipo: r.tipo || 'duvida',
  texto: r.texto || '', status: r.status || 'aberta', resposta: r.resposta || '',
  createdAt: Number(r.created_at), resolvidoEm: Number(r.resolvido_em) || 0,
});
async function criarReclamacao(tenantId, userId, email, tipo, texto) {
  const id = 'rec_' + rid(14);
  await pool.query(`INSERT INTO reclamacoes (id, tenant_id, user_id, email, tipo, texto, status, resposta, created_at, resolvido_em)
    VALUES ($1,$2,$3,$4,$5,$6,'aberta','',$7,0)`,
    [id, tenantId, userId || '', String(email || '').slice(0, 160),
     String(tipo || 'duvida').slice(0, 20), String(texto || '').slice(0, 4000), Date.now()]);
  return { id };
}
async function listarReclamacoes(limite) {
  const r = await pool.query('SELECT * FROM reclamacoes ORDER BY created_at DESC LIMIT $1', [Number(limite) || 100]);
  return r.rows.map(mapRec);
}
async function reclamacoesDoTenant(tenantId) {
  const r = await pool.query('SELECT * FROM reclamacoes WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50', [tenantId]);
  return r.rows.map(mapRec);
}
async function resolverReclamacao(id, status, resposta) {
  await pool.query('UPDATE reclamacoes SET status = $1, resposta = $2, resolvido_em = $3 WHERE id = $4',
    [status, String(resposta || '').slice(0, 2000), Date.now(), id]);
}
async function resumoReclamacoes(desde) {
  const r = await pool.query('SELECT status, COUNT(*)::int AS n FROM reclamacoes WHERE created_at >= $1 GROUP BY status', [desde || 0]);
  const out = { aberta: 0, resolvida: 0 };
  for (const x of r.rows) out[x.status] = Number(x.n);
  return out;
}

/* Números da plataforma inteira. Só o operador chega aqui — ver server/operadores.js. */

/*
 * A ficha de UMA conta, para a supervisão. Ver a nota em db-sqlite.js: existia
 * só a lista das maiores, que diz quem é grande e não diz quem está com
 * problema. Mesma API assíncrona nos dois bancos.
 */
async function fichaDaConta(tenantId, desde) {
  const c = await pool.query(
    `SELECT id, name, created_at, COALESCE(plan, 'free') AS plano, plan_status,
       stripe_subscription_id, creditos_franquia, creditos_comprados, creditos_ciclo
     FROM tenants WHERE id = $1`, [tenantId]);
  if (!c.rows[0]) return null;
  const t = c.rows[0];
  const [pessoas, telas, midia, pecas, eventos] = await Promise.all([
    pool.query('SELECT id, email, role, name, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at ASC LIMIT 50', [tenantId]),
    pool.query('SELECT id, name, last_seen, updated_at FROM devices WHERE tenant_id = $1 ORDER BY last_seen DESC NULLS LAST LIMIT 100', [tenantId]),
    pool.query('SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes FROM media WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT COUNT(*) AS n FROM library WHERE tenant_id = $1', [tenantId]),
    pool.query('SELECT COUNT(*) AS n FROM eventos WHERE tenant_id = $1 AND created_at > $2', [tenantId, desde || 0]),
  ]);
  return {
    id: t.id, nome: t.name, criadaEm: Number(t.created_at) || 0,
    plano: t.plano, planoStatus: t.plan_status || 'free',
    assinatura: !!t.stripe_subscription_id,
    creditos: {
      franquia: Number(t.creditos_franquia) || 0,
      comprados: Number(t.creditos_comprados) || 0,
      cicloEm: Number(t.creditos_ciclo) || 0,
    },
    pessoas: pessoas.rows.map((u) => ({
      id: u.id, email: u.email, papel: u.role, nome: u.name, criadoEm: Number(u.created_at) || 0,
    })),
    telas: telas.rows.map((d) => ({
      id: d.id, nome: d.name, ultimaVez: Number(d.last_seen) || 0, configEm: Number(d.updated_at) || 0,
    })),
    midiaBytes: Number(midia.rows[0].bytes) || 0,
    midiaArquivos: Number(midia.rows[0].n) || 0,
    pecas: Number(pecas.rows[0].n) || 0,
    acoes: Number(eventos.rows[0].n) || 0,
    usoIA: await resumoUsoIA(tenantId, desde || 0),
  };
}

async function buscarContas(termo, vivaDesde, limite) {
  const t = String(termo || '').trim().toLowerCase();
  const like = '%' + t + '%';
  const r = await pool.query(
    `SELECT t.id, t.name, COALESCE(t.plan, 'free') AS plano, t.plan_status, t.created_at,
       (SELECT COUNT(*) FROM devices d WHERE d.tenant_id = t.id) AS telas,
       (SELECT COUNT(*) FROM devices d WHERE d.tenant_id = t.id AND d.last_seen > $1) AS vivas,
       (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS pessoas,
       (SELECT email FROM users u WHERE u.tenant_id = t.id ORDER BY created_at ASC LIMIT 1) AS dono
     FROM tenants t
     WHERE ($2 = '' OR LOWER(t.name) LIKE $3 OR t.id LIKE $3
            OR EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id AND LOWER(u.email) LIKE $3))
     ORDER BY t.created_at DESC LIMIT $4`,
    [vivaDesde || 0, t, like, limite || 30]
  );
  return r.rows.map((x) => ({
    id: x.id, nome: x.name, dono: x.dono || '', plano: x.plano, planoStatus: x.plan_status || 'free',
    criadaEm: Number(x.created_at) || 0,
    telas: Number(x.telas), vivas: Number(x.vivas), pessoas: Number(x.pessoas),
  }));
}

async function numerosDaPlataforma(agora, vivaDesde, desde) {
  const um = async (sql, args) => (await pool.query(sql, args || [])).rows[0];
  const varios = async (sql, args) => (await pool.query(sql, args || [])).rows;
  const [contas, contasNovas, pessoas, telas, telasVivas, midia, pecas, ia] = await Promise.all([
    um('SELECT COUNT(*)::int AS n FROM tenants'),
    um('SELECT COUNT(*)::int AS n FROM tenants WHERE created_at >= $1', [desde]),
    um('SELECT COUNT(*)::int AS n FROM users'),
    um('SELECT COUNT(*)::int AS n FROM devices'),
    um('SELECT COUNT(*)::int AS n FROM devices WHERE last_seen >= $1', [vivaDesde]),
    um('SELECT COALESCE(SUM(size), 0)::bigint AS b FROM media'),
    um('SELECT COUNT(*)::int AS n FROM library'),
    um('SELECT COALESCE(SUM(creditos),0)::int AS c, COALESCE(SUM(custo_centavos),0)::int AS centavos, COUNT(*)::int AS n FROM uso_ia WHERE created_at >= $1', [desde]),
  ]);
  const [porPlano, iaPorTipo, maiores] = await Promise.all([
    varios("SELECT COALESCE(plan, 'free') AS plano, COUNT(*)::int AS n FROM tenants GROUP BY plano"),
    varios('SELECT tipo, COUNT(*)::int AS n FROM uso_ia WHERE created_at >= $1 GROUP BY tipo ORDER BY n DESC LIMIT 12', [desde]),
    varios(`SELECT t.id, t.name, COALESCE(t.plan, 'free') AS plano, t.created_at,
        (SELECT COUNT(*) FROM devices d WHERE d.tenant_id = t.id)::int AS telas,
        (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id)::int AS pessoas
      FROM tenants t ORDER BY telas DESC, t.created_at ASC LIMIT 20`),
  ]);
  return {
    contas: Number(contas.n), contasNovas: Number(contasNovas.n), pessoas: Number(pessoas.n),
    telas: Number(telas.n), telasVivas: Number(telasVivas.n),
    porPlano: porPlano.map((r) => ({ plano: r.plano, n: Number(r.n) })),
    midiaBytes: Number(midia.b), pecas: Number(pecas.n),
    ia: { creditos: Number(ia.c), custoCentavos: Number(ia.centavos), chamadas: Number(ia.n) },
    iaPorTipo: iaPorTipo.map((r) => ({ tipo: r.tipo, n: Number(r.n) })),
    maiores: maiores.map((r) => ({
      id: r.id, nome: r.name, plano: r.plano, telas: Number(r.telas), pessoas: Number(r.pessoas), createdAt: Number(r.created_at),
    })),
  };
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
/*
 * Apaga TODAS as sessões de um usuário.
 *
 * Existe por causa de um caminho que fazia o oposto do que a pessoa espera:
 * trocar a senha só gravava o novo hash. Com sessão de 30 dias, o cookie de
 * quem tinha invadido continuava valendo por até um mês — sobrevivendo
 * exatamente à ação que a vítima faz para se defender. No fluxo de "esqueci a
 * senha" era pior, porque ele existe justamente para recuperar conta
 * comprometida.
 */
async function destroySessionsOfUser(userId) { await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]); }

/* ---------------- Dispositivos ---------------- */
async function createDevice(id, code, deviceToken) {
  const now = Date.now();
  await pool.query(
    'INSERT INTO devices (id, tenant_id, code, name, config, device_token, updated_at, created_at, last_seen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [id, null, code, '', null, deviceToken, now, now, now]); // nasce "vivo": pareável já
  return { id, code };
}
/*
 * A TV existe, é deste inquilino e apresentou o token certo?
 *
 * Serve para autorizar a leitura do mural pelo player: o código do cartaz
 * autoriza enviar foto, e listar o que os outros mandaram exige a credencial
 * da tela que vai exibir. A comparação é feita em tempo constante lá em
 * server.js, onde o segredo chega.
 */
async function deviceComToken(token, tenantId) {
  if (!token || !tenantId) return null;
  const r = await pool.query('SELECT * FROM devices WHERE device_token = $1 AND tenant_id = $2', [String(token), tenantId]);
  return r.rows[0] || null;
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
/* ---------------- Uso de IA e créditos ---------------- */

async function registrarUsoIA(tenantId, uso) {
  const id = 'uso_' + rid(14);
  await pool.query(
    'INSERT INTO uso_ia (id, tenant_id, user_id, tipo, creditos, custo_centavos, referencia, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, tenantId, uso.userId || '', uso.tipo || '', Number(uso.creditos) || 0,
      Number(uso.custoCentavos) || 0, uso.referencia || '', Date.now()]);
  return { id };
}
async function listarUsoIA(tenantId, limite) {
  const r = await pool.query(
    'SELECT id, tipo, creditos, custo_centavos, referencia, created_at FROM uso_ia WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2',
    [tenantId, limite || 100]);
  return r.rows.map((x) => ({
    id: x.id, tipo: x.tipo, creditos: Number(x.creditos), custoCentavos: Number(x.custo_centavos),
    referencia: x.referencia, createdAt: Number(x.created_at),
  }));
}
async function resumoUsoIA(tenantId, desde) {
  const r = await pool.query(
    'SELECT COALESCE(SUM(creditos),0) AS creditos, COALESCE(SUM(custo_centavos),0) AS centavos, COUNT(*) AS n FROM uso_ia WHERE tenant_id = $1 AND created_at > $2',
    [tenantId, desde || 0]);
  const x = r.rows[0] || {};
  return { creditos: Number(x.creditos || 0), custoCentavos: Number(x.centavos || 0), chamadas: Number(x.n || 0) };
}
async function contarUsoIA(tenantId, desde) {
  const r = await pool.query('SELECT COUNT(*) AS n FROM uso_ia WHERE tenant_id = $1 AND created_at > $2', [tenantId, desde || 0]);
  return Number((r.rows[0] || {}).n || 0);
}
async function getCreditos(tenantId) {
  const r = await pool.query('SELECT creditos_franquia, creditos_comprados, creditos_ciclo FROM tenants WHERE id = $1', [tenantId]);
  const x = r.rows[0];
  if (!x) return null;
  return {
    franquiaRestante: Number(x.creditos_franquia) || 0,
    creditosComprados: Number(x.creditos_comprados) || 0,
    cicloEm: Number(x.creditos_ciclo) || 0,
  };
}
async function setCreditos(tenantId, c) {
  await pool.query('UPDATE tenants SET creditos_franquia = $1, creditos_comprados = $2, creditos_ciclo = $3 WHERE id = $4',
    [Math.max(0, Number(c.franquiaRestante) || 0), Math.max(0, Number(c.creditosComprados) || 0), Number(c.cicloEm) || 0, tenantId]);
}

async function createMedia(m) {
  await pool.query('INSERT INTO media (id, tenant_id, name, mime, size, key, url, origem, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [m.id, m.tenantId, m.name, m.mime, m.size, m.key, m.url, m.origem || 'upload', Date.now()]);
  return m;
}
async function listMedia(tenantId) {
  const r = await pool.query('SELECT id, name, mime, size, url, origem, created_at FROM media WHERE tenant_id = $1 ORDER BY created_at DESC', [tenantId]);
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
  // Foto de mural passou a ter linha em `media` (server/midia.js), mas fotos
  // gravadas ANTES dessa mudança só existem em `muralfotos`. A união cobre as
  // duas gerações; apagar uma chave que já sumiu é inofensivo.
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

/*
 * Identificadores sorteados com RNG CRIPTOGRÁFICO.
 *
 * Isto usava `Math.random()`, e três segredos do produto saíam daqui: o
 * `deviceToken` (a credencial permanente de uma TV), a chave de cada arquivo
 * de mídia — que é a única barreira de `/media/*`, uma rota sem autenticação
 * — e o código do mural.
 *
 * O `Math.random()` do V8 é um xorshift128+: o estado de 128 bits é
 * recuperável a partir de saídas observadas. E `POST /api/devices` é público
 * e devolve 38 sorteios seguidos deste mesmo gerador por chamada. Quem
 * observasse algumas criações passava a prever os identificadores seguintes —
 * e com o token previsto vinham a programação e os aniversariantes da tela de
 * outro cliente.
 *
 * `crypto.randomInt` é uniforme e imprevisível. O código de pareamento de 6
 * dígitos já usava esse caminho desde o começo; o resto é que ficou para trás.
 */
function rid(n) {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < n; i++) s += c[crypto.randomInt(c.length)];
  return s;
}


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

module.exports = {
  init,
  createAccount, createUser, getUserByEmail, getUserById, listUsers,
  getUserByGoogle, setUserGoogle, setUserPassword, setUserName, setTenantName,
  createReset, getReset, consumeReset, createVerification, getVerification, consumeVerification,
  setUserRole, removeUser, countOwners,
  createInvite, getInviteByCode, listInvites, deleteInvite, acceptInvite,
  createSession, getSession, destroySession, destroySessionsOfUser,
  createDevice, getDevice, getDeviceByCode, deviceComToken, claimDevice, setDeviceConfig,
  renameDevice, removeDevice, touchDevice, listDevices, countDevices,
  getTenant, getTenantByCustomer, setTenantBilling,
  registrarUsoIA, listarUsoIA, resumoUsoIA, contarUsoIA, getCreditos, setCreditos,
  createMedia, listMedia, getMedia, removeMedia, sumMediaBytes,
  replaceBirthdays, listBirthdays, clearBirthdays, setBirthdayPhoto, countBirthdays,
  addLibrary, listLibrary, getLibraryItem, updateLibraryItem, deleteLibraryItem, rid,
  listCampaign, renameCampaign, deleteCampaign,
  registrarAceite, listarAceites, dadosDoTenant, apagarTenant,
  getMemoria, saveMemoria, clearMemoria,
  criarMural, listarMurais, muralPorCodigo, muralPorId, atualizarMural, removerMural,
  addFotoMural, listarFotosMural, fotosVisiveis, ocultarFoto, ocultarTodasFotos, contarFotosRecentes,
  getBrandKit, saveBrandKit, listBrandAssets, addBrandAsset, removeBrandAsset, labelBrandAsset,
  listMarcas, marcaAtiva, criarMarca, salvarMarca, ativarMarca, removerMarca, salvarSiteDaMarca, MAX_MARCAS,
  listarOperadores, addOperador, removerOperador,
  fichaDaConta, buscarContas,
  registrarEvento, eventosPorAcao, eventosParaSessoes, eventosPorDia, contasAtivas, pessoasAtivas, limparEventos,
  salvarJob, atualizarJob, lerJob, listarJobs, interromperJobs, limparJobs,
  criarReclamacao, listarReclamacoes, reclamacoesDoTenant, resolverReclamacao, resumoReclamacoes,
  numerosDaPlataforma,
};
