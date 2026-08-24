/*
 * Subir o banco com vários processos ao mesmo tempo.
 *
 * Este arquivo existe por causa de uma falha que passou na minha máquina e
 * quebrou no CI — e o CI estava certo. Ele roda um processo por arquivo de
 * teste, todos contra o mesmo banco, o que é a mesma coisa que o Railway faz a
 * cada deploy: sobe a instância nova antes de derrubar a velha, e por alguns
 * segundos duas rodam este arquivo lado a lado.
 *
 * Duas corridas diferentes apareceram ali, e é útil não confundi-las:
 *
 *   1. `PRAGMA journal_mode = WAL` precisa de lock exclusivo. Enquanto
 *      `busy_timeout` era declarado DEPOIS dele, quem chegasse junto morria com
 *      "database is locked" antes de existir tempo de espera.
 *
 *   2. As migrações perguntam "esta coluna existe?" e só então criam. São duas
 *      operações, e entre uma e outra outro processo pode ter criado: os dois
 *      leem "não existe", os dois criam, o segundo morre com "duplicate column
 *      name". `busy_timeout` não ajuda nessa — não é disputa de lock, é decisão
 *      tomada com informação que envelheceu.
 *
 * O estrago em produção seria a instância nova morrendo no boot, em silêncio,
 * com o produto parecendo só "lento para atualizar".
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promises: fsp } = fs;

const RAIZ = path.join(__dirname, '..');

/*
 * Cada rodada usa uma pasta descartável, e é `DATA_DIR` que torna isso
 * possível: apagar o banco compartilhado no meio da suíte quebraria os outros
 * arquivos de teste, que rodam ao lado.
 */
function subirJuntos(quantos, opcoes) {
  const manter = !!(opcoes && opcoes.manter);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conc-'));
  const um = () => new Promise((resolve) => {
    execFile(
      process.execPath,
      ['-e', "require(" + JSON.stringify(path.join(RAIZ, 'server', 'db-sqlite.js')) + ")"],
      { env: { ...process.env, DATA_DIR: dir }, timeout: 30000 },
      (erro, _saida, stderr) => resolve({ ok: !erro, stderr: String(stderr || '') })
    );
  });
  // Disparados de uma vez, sem esperar um pelo outro — é o ponto do teste.
  return Promise.all(Array.from({ length: quantos }, um))
    .then((r) => {
      // Quem pede `manter` vai inspecionar o banco depois, e apaga a pasta.
      if (manter) return { dir, resultados: r };
      fs.rmSync(dir, { recursive: true, force: true });
      return r;
    });
}

test('vários processos sobem o banco ao mesmo tempo sem nenhum morrer', async () => {
  const r = await subirJuntos(8);
  const mortos = r.filter((x) => !x.ok);
  const motivos = mortos.map((m) => (/Error: [^\n]+/.exec(m.stderr) || ['(sem mensagem)'])[0]);
  assert.deepStrictEqual(motivos, [], mortos.length + ' de 8 processos morreram ao subir o banco');
});

test('quem perde a disputa pelo WAL segue vivo em vez de morrer no boot', async () => {
  /*
   * A primeira versão deste teste subia oito processos juntos e conferia que
   * o banco terminava em WAL. Ele passava COM o defeito posto de volta: nesta
   * máquina, quatro núcleos e disco rápido, a janela de disputa simplesmente
   * não abre. Verde por não conseguir provocar o problema é o pior verde que
   * existe — e era o mesmo motivo de o CI ter achado o que eu não achei.
   *
   * Então aqui a disputa não é torcida, é CONSTRUÍDA: este processo segura uma
   * leitura aberta no banco, o que basta para impedir a troca do modo de
   * diário, e solta depois que o tempo de espera do filho já estourou uma vez.
   *
   * Sem tolerância, o filho morre na primeira negativa. Com tolerância, ele
   * tenta de novo, pega o banco livre e sobe. O que se cobra é ele estar VIVO.
   */
  const { DatabaseSync } = require('node:sqlite');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-wal-'));
  const arquivo = path.join(dir, 'multitelas.db');

  // Banco em modo rollback, para que a troca para WAL ainda esteja por fazer.
  const dono = new DatabaseSync(arquivo);
  dono.exec('PRAGMA busy_timeout = 500');
  dono.exec('CREATE TABLE marca_do_teste (a)');
  dono.exec('BEGIN');
  dono.prepare('SELECT * FROM marca_do_teste').all(); // leitura aberta = lock

  const filho = new Promise((resolve) => {
    execFile(process.execPath,
      ['-e', "require(" + JSON.stringify(path.join(RAIZ, 'server', 'db-sqlite.js')) + ")"],
      { env: { ...process.env, DATA_DIR: dir }, timeout: 60000 },
      (erro, _s, stderr) => resolve({ ok: !erro, stderr: String(stderr || '') }));
  });

  // Solta depois que os 5000ms de espera do filho já venceram uma vez.
  const solta = new Promise((r) => setTimeout(r, 6500)).then(() => {
    dono.exec('COMMIT');
    dono.close();
  });

  const [r] = await Promise.all([filho, solta]);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(r.ok, 'o processo morreu porque não conseguiu ligar o WAL na primeira tentativa: '
    + r.stderr.slice(0, 300));
});

test('nenhum processo esbarra em "duplicate column name"', async () => {
  // A corrida 2, também com cara própria: a migração deixou de tolerar que
  // outro processo tenha chegado primeiro.
  const r = await subirJuntos(8);
  const duplicados = r.filter((x) => /duplicate column name/i.test(x.stderr));
  assert.equal(duplicados.length, 0, 'a migração voltou a assumir que está sozinha');
});

test('o tempo de espera é configurado ANTES de trocar o modo de diário', () => {
  /*
   * A ordem é o conserto, e ela não aparece em nenhum comportamento observável
   * quando só um processo sobe — por isso está afirmada aqui, por leitura.
   * Trocar o modo de diário exige lock exclusivo: é justamente a instrução que
   * mais precisa do tempo de espera, e era a que rodava sem ele.
   */
  const fonte = fs.readFileSync(path.join(RAIZ, 'server', 'db-sqlite.js'), 'utf8');
  const espera = fonte.indexOf('PRAGMA busy_timeout');
  const diario = fonte.indexOf('PRAGMA journal_mode');
  assert.ok(espera > 0, 'sumiu o tempo de espera do SQLite');
  assert.ok(diario > 0, 'sumiu o modo WAL');
  assert.ok(espera < diario, 'o tempo de espera voltou a ser configurado depois do journal_mode');
});

test('toda coluna acrescentada passa pelo caminho que tolera a corrida', () => {
  /*
   * Sete migrações faziam `if (!cols.includes(x)) ALTER TABLE`, cada uma com a
   * mesma corrida. Agora todas passam por `garantirColuna`. Um `ALTER TABLE`
   * solto que apareça amanhã traz o defeito de volta — e num caminho que só
   * quebra quando duas instâncias sobem juntas, que é o que ninguém testa à mão.
   */
  const fonte = fs.readFileSync(path.join(RAIZ, 'server', 'db-sqlite.js'), 'utf8');
  const semComentarios = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const soltos = [...semComentarios.matchAll(/^(?!function garantirColuna).*ALTER TABLE.*$/gm)]
    .map((m) => m[0].trim())
    .filter((l) => !l.includes("db.exec('ALTER TABLE ' + tabela + ' ADD COLUMN ' + definicao)"));
  assert.deepStrictEqual(soltos, [], 'ALTER TABLE fora de garantirColuna');
});

test('quem já tem a coluna não tenta criá-la de novo', async () => {
  // Idempotência: subir duas vezes seguidas na MESMA pasta não pode falhar.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-conc2-'));
  const um = () => new Promise((resolve) => {
    execFile(process.execPath,
      ['-e', "require(" + JSON.stringify(path.join(RAIZ, 'server', 'db-sqlite.js')) + ")"],
      { env: { ...process.env, DATA_DIR: dir }, timeout: 30000 },
      (erro, _s, stderr) => resolve({ ok: !erro, stderr: String(stderr || '') }));
  });
  const a = await um();
  const b = await um();
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(a.ok, 'a primeira subida falhou: ' + a.stderr.slice(0, 200));
  assert.ok(b.ok, 'subir de novo no mesmo banco falhou: ' + b.stderr.slice(0, 200));
});
