/*
 * Backup diário (PLANO §10): cifra, assinatura S3 e a limpeza dos antigos.
 * O caminho inteiro (pg_dump → bucket → restauração) roda contra Postgres e
 * MinIO de verdade — o roteiro está em docs/BACKUP.md.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const B = require('../server/backup.js');
const S3 = require('../server/s3.js');

const RAIZ = path.join(__dirname, '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mt-backup-teste-'));

/* ---------------- Assinatura S3 ---------------- */

// Exemplos publicados pela AWS em "Signature Calculations for the Authorization Header".
const AWS = { endpoint: 'https://examplebucket.s3.amazonaws.com', bucket: 'examplebucket', region: 'us-east-1',
  key: 'AKIAIOSFODNN7EXAMPLE', secret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY' };
const DATA_AWS = new Date('2013-05-24T00:00:00Z');

test('S3: assinatura do GET Object bate com o exemplo da AWS', () => {
  const r = S3.criar(AWS).assinar('GET', 'test.txt', { cabecalhos: { range: 'bytes=0-9' }, agora: DATA_AWS });
  assert.strictEqual(r.assinatura, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
  assert.strictEqual(r.url, 'https://examplebucket.s3.amazonaws.com/test.txt');
});

test('S3: assinatura da listagem (query ordenada) bate com o exemplo da AWS', () => {
  const r = S3.criar(AWS).assinar('GET', '', { query: { prefix: 'J', 'max-keys': '2' }, agora: DATA_AWS });
  assert.strictEqual(r.assinatura, '34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7');
  assert.strictEqual(r.url, 'https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J');
});

test('S3: R2 e MinIO endereçam por caminho, com o bucket na URL', () => {
  const s = S3.criar({ endpoint: 'https://conta.r2.cloudflarestorage.com/', bucket: 'mt-backup', key: 'k', secret: 's' });
  assert.strictEqual(s.config.pathStyle, true);
  assert.strictEqual(s.assinar('GET', 'postgres/2026-10-20.dump.enc').url, 'https://conta.r2.cloudflarestorage.com/mt-backup/postgres/2026-10-20.dump.enc');
  assert.throws(() => S3.criar({ endpoint: 'https://x', bucket: 'b' }), /faltam/);
});

test('S3: lê a listagem, com entidades XML na chave', () => {
  const xml = '<ListBucketResult><Contents><Key>postgres/a&amp;b.json</Key><Size>12</Size></Contents>'
    + '<Contents><Key>postgres/2026-10-20.dump.enc</Key><Size>3456</Size></Contents></ListBucketResult>';
  assert.deepStrictEqual(S3.lerLista(xml), [{ chave: 'postgres/a&b.json', tamanho: 12 }, { chave: 'postgres/2026-10-20.dump.enc', tamanho: 3456 }]);
});

/* ---------------- Cifra ---------------- */

const CHAVE = crypto.randomBytes(32);

test('chave: só aceita 32 bytes em base64', () => {
  assert.deepStrictEqual(B.lerChave(CHAVE.toString('base64')), CHAVE);
  assert.throws(() => B.lerChave(''), /32 bytes/);
  assert.throws(() => B.lerChave(crypto.randomBytes(16).toString('base64')), /32 bytes/);
});

test('cifra e decifra devolvem o mesmo dump; o cifrado não contém o original', async () => {
  const d = tmp();
  const original = Buffer.concat([Buffer.from('PGDMP aniversario@cliente.com '), crypto.randomBytes(300000)]);
  fs.writeFileSync(path.join(d, 'a.dump'), original);
  const r = await B.cifrar(path.join(d, 'a.dump'), path.join(d, 'a.enc'), CHAVE);
  const cifrado = fs.readFileSync(path.join(d, 'a.enc'));
  assert.strictEqual(r.bytes, cifrado.length);
  assert.strictEqual(r.sha256, await B.sha256DoArquivo(path.join(d, 'a.enc')));
  assert.strictEqual(cifrado.length, original.length + 5 + 12 + 16);
  assert.ok(cifrado.subarray(0, 5).equals(B.MAGICO));
  assert.strictEqual(cifrado.indexOf('aniversario@cliente.com'), -1);
  await B.decifrar(path.join(d, 'a.enc'), path.join(d, 'b.dump'), CHAVE);
  assert.ok(fs.readFileSync(path.join(d, 'b.dump')).equals(original));
  fs.rmSync(d, { recursive: true });
});

test('decifrar recusa chave errada e arquivo alterado, sem deixar meio dump', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'a.dump'), crypto.randomBytes(200000));
  await B.cifrar(path.join(d, 'a.dump'), path.join(d, 'a.enc'), CHAVE);
  await assert.rejects(B.decifrar(path.join(d, 'a.enc'), path.join(d, 'x.dump'), crypto.randomBytes(32)), /chave errada ou arquivo alterado/);
  assert.ok(!fs.existsSync(path.join(d, 'x.dump')));
  // Um byte no meio do dump, e um no IV (que é dado autenticado).
  for (const pos of [100000, 7]) {
    const b = fs.readFileSync(path.join(d, 'a.enc')); b[pos] ^= 1;
    fs.writeFileSync(path.join(d, 'm.enc'), b);
    await assert.rejects(B.decifrar(path.join(d, 'm.enc'), path.join(d, 'y.dump'), CHAVE), /não confere/);
    assert.ok(!fs.existsSync(path.join(d, 'y.dump')));
  }
  fs.writeFileSync(path.join(d, 'z.enc'), Buffer.concat([Buffer.from('XXXXX'), crypto.randomBytes(40)]));
  await assert.rejects(B.decifrar(path.join(d, 'z.enc'), path.join(d, 'z.dump'), CHAVE), /MTBK1/);
  fs.rmSync(d, { recursive: true });
});

test('dump vazio também vai e volta', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'v.dump'), '');
  await B.cifrar(path.join(d, 'v.dump'), path.join(d, 'v.enc'), CHAVE);
  await B.decifrar(path.join(d, 'v.enc'), path.join(d, 'w.dump'), CHAVE);
  assert.strictEqual(fs.readFileSync(path.join(d, 'w.dump')).length, 0);
  fs.rmSync(d, { recursive: true });
});

/* ---------------- Nomes, limpeza, conferência ---------------- */

test('o dia do backup é o de São Paulo', () => {
  assert.strictEqual(B.diaDe('2026-10-21T02:30:00Z'), '2026-10-20');
  assert.strictEqual(B.diaDe('2026-10-21T06:00:00Z'), '2026-10-21');
  assert.strictEqual(B.chaveDump('2026-10-21'), 'postgres/2026-10-21.dump.enc');
  assert.strictEqual(B.diaDaChave('postgres/2026-10-21.json'), '2026-10-21');
  assert.strictEqual(B.diaDaChave('outra/2026-10-21.json'), null);
});

function diasAntes(hoje, n) { return B.diaDe(new Date(hoje).getTime() - n * 86400000); }

test('limpeza: apaga o que passou de 30 dias, os dois arquivos do dia', () => {
  const hoje = '2026-12-31T09:00:00Z';
  const chaves = [];
  for (let i = 0; i < 40; i++) { const d = diasAntes(hoje, i); chaves.push(B.chaveDump(d), B.chaveManifesto(d)); }
  chaves.push('leia-me.txt');
  const fora = B.quaisApagar(chaves, hoje);
  const dias = [...new Set(fora.map(B.diaDaChave))].sort();
  assert.deepStrictEqual(dias, Array.from({ length: 9 }, (_, i) => diasAntes(hoje, 39 - i)));
  assert.strictEqual(fora.length, 18);
  assert.ok(!fora.includes('leia-me.txt'));
});

test('limpeza: cron parado há 60 dias não apaga os 7 últimos backups', () => {
  const hoje = '2026-12-31T09:00:00Z';
  const chaves = [];
  for (let i = 60; i < 75; i++) chaves.push(B.chaveDump(diasAntes(hoje, i)));
  const fora = B.quaisApagar(chaves, hoje);
  assert.strictEqual(fora.length, 8);
  for (let i = 60; i < 67; i++) assert.ok(!fora.includes(B.chaveDump(diasAntes(hoje, i))));
  assert.deepStrictEqual(B.quaisApagar(chaves, hoje, { manter: 20 }), []);
});

test('conferência da restauração: acusa tabela faltando, sobrando ou com linha a menos', () => {
  assert.deepStrictEqual(B.compararContagens({ users: 3, devices: 4 }, { devices: 4, users: 3 }), []);
  assert.deepStrictEqual(B.compararContagens({ users: 3, devices: 4, uso_ia: 9 }, { users: 2, devices: 4, extra: 1 }), [
    'users: 3 na origem, 2 restauradas', 'uso_ia: falta na restauração', 'extra: só existe na restauração',
  ]);
});

test('versão: pg_dump e servidor', () => {
  assert.strictEqual(B.versaoMaior('pg_dump (PostgreSQL) 18.0'), 18);
  assert.strictEqual(B.versaoMaior('pg_dump (PostgreSQL) 17.6 (Debian 17.6-1)'), 17);
  assert.strictEqual(B.versaoMaior('180001'), 18);
  assert.strictEqual(B.versaoMaior('90624'), 9);
  assert.strictEqual(B.ident('a"b'), '"a""b"');
});

/* ---------------- A imagem do serviço ---------------- */

test('a imagem do backup copia todo arquivo do servidor que o script carrega', () => {
  const docker = fs.readFileSync(path.join(RAIZ, 'backup', 'Dockerfile'), 'utf8');
  const script = fs.readFileSync(path.join(RAIZ, 'tools', 'backup.mjs'), 'utf8');
  const usados = [...script.matchAll(/path\.join\(RAIZ, 'server', '([\w-]+\.js)'\)/g)].map((m) => m[1]);
  assert.ok(usados.length >= 3);
  for (const f of usados) {
    assert.match(docker, new RegExp('COPY [^\\n]*server/' + f.replace('.', '\\.')), f + ' não entra na imagem');
    // E esse arquivo não pode puxar outro módulo nosso que ficou de fora.
    const fonte = fs.readFileSync(path.join(RAIZ, 'server', f), 'utf8');
    for (const m of fonte.matchAll(/require\('\.\/([\w-]+)(?:\.js)?'\)/g)) assert.ok(usados.includes(m[1] + '.js'), f + ' carrega ' + m[1]);
  }
  assert.match(docker, /^FROM postgres:\d+-alpine/m);
  assert.match(docker, /^USER postgres/m);
});
