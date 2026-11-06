/*
 * Fase 12 do plano de ação: a chamada de senha da Saúde.
 *
 *   - A recepção chama (próxima, de novo, um número, zerar o dia) e a TV
 *     mostra a senha GIGANTE, o lugar e as três anteriores. Nunca o nome do
 *     paciente: o lugar é tipo da lista e número, sem texto livre.
 *   - A chamada chega à TV em até 1 s pelo tempo real (o evento "senha" do
 *     SSE, com o estado inteiro), com pergunta de reserva; sobrevive a recarga.
 *   - Dado por conta e grupo de TVs, guardado nos DOIS bancos; rota com
 *     login; o membro chama.
 *   - A tela da TV segue a régua: a menor letra tem 4,5% do lado menor.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-senha-db-'));
const db = require('../server/db-sqlite.js');
const S = require('../server/senha.js');
const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

/* ---------------- a regra (server/senha.js) ---------------- */

test('o lugar é da lista, com número: não há onde escrever o nome do paciente', () => {
  assert.deepEqual(S.localDe({ tipo: 'consultorio', numero: 3 }), { tipo: 'consultorio', numero: 3, nome: 'Consultório 3', curto: 'Cons. 3' });
  assert.equal(S.localDe({ tipo: 'triagem' }).nome, 'Triagem', 'sem número também vale');
  assert.equal(S.localDe({ tipo: 'guiche', numero: '2' }).nome, 'Guichê 2');
  for (const ruim of [{ tipo: 'Dona Maria' }, { tipo: 'guiche', numero: 100 }, { tipo: 'sala', numero: -1 }, { tipo: 'sala', numero: 1.5 }, 'Consultório 3', null]) {
    assert.equal(S.localDe(ruim), null, JSON.stringify(ruim));
  }
  // Nem o que a TV recebe tem campo de nome: só senha, lugar e hora.
  const c = S.publico({ id: 'sc_1', prefixo: 'A', numero: 42, local_tipo: 'consultorio', local_num: 3, tipo: 'proxima', em: 1, grupo: '' });
  assert.deepEqual(Object.keys(c).sort(), ['em', 'grupo', 'id', 'local', 'localCurto', 'numero', 'prefixo', 'rechamada', 'senha']);
  assert.equal(c.senha, 'A 042');
});

test('a senha: uma letra (ou nenhuma) e três dígitos; de 1 a 999', () => {
  assert.equal(S.senhaTexto('A', 7), 'A 007');
  assert.equal(S.senhaTexto('', 120), '120');
  assert.equal(S.prefixoDe('p'), 'P');
  assert.equal(S.prefixoDe(''), '');
  assert.equal(S.prefixoDe('AB'), null);
  assert.equal(S.prefixoDe('1'), null);
  assert.equal(S.numeroDe(999), 999);
  assert.equal(S.numeroDe(0), null);
  assert.equal(S.numeroDe(1000), null);
  assert.equal(S.grupoDe('  Sala   2 '), 'Sala 2', 'a mesma limpeza do grupo da TV');
});

test('a TV mostra a atual e as três anteriores, sem repetir a senha chamada de novo', () => {
  const ch = (n, em, tipo) => ({ id: 'c' + em, prefixo: 'A', numero: n, local_tipo: 'guiche', local_num: 1, tipo: tipo || 'proxima', em });
  const e = S.estadoDe([ch(1, 1), ch(2, 2), ch(3, 3), ch(2, 4, 'rechamada'), ch(4, 5), ch(5, 6)], 7);
  assert.equal(e.atual.senha, 'A 005');
  assert.deepEqual(e.anteriores.map((x) => x.senha), ['A 004', 'A 002', 'A 003'], 'a A 002 chamada de novo aparece uma vez só');
  const r = S.estadoDe([ch(1, 1), ch(2, 2), ch(2, 3, 'rechamada')], 4);
  assert.equal(r.atual.senha, 'A 002');
  assert.equal(r.atual.rechamada, true);
  assert.deepEqual(r.anteriores.map((x) => x.senha), ['A 001'], 'a atual não volta como anterior');
  assert.deepEqual(S.estadoDe([], 9), { atual: null, anteriores: [], agora: 9 });
});

test('o dia é o da loja: às 22h de São Paulo ainda é hoje (o servidor roda em UTC)', () => {
  const t = Date.UTC(2026, 10, 6, 1, 0);   // 06/11 01:00 UTC = 05/11 22:00 em São Paulo
  assert.equal(S.diaNaLoja(t, 'America/Sao_Paulo'), '2026-11-05');
  assert.equal(S.diaNaLoja(t, 'UTC'), '2026-11-06');
  assert.equal(S.diaNaLoja(t, 'fuso/inventado'), '2026-11-05', 'fuso estragado: o de São Paulo');
  assert.equal(S.fusoDasTelas([{ expediente: JSON.stringify({ fuso: 'America/Manaus' }) }]), 'America/Manaus');
  assert.equal(S.fusoDasTelas([{ expediente: null }]), 'America/Sao_Paulo');
});

/* ---------------- o banco ---------------- */

test('banco: a próxima é um comando só; dia novo volta a 1; depois de 999, também; zerar limpa a fila', async () => {
  const t = 'ten_senha_' + Date.now();
  const em = Date.now();
  // Muitas recepções apertando juntas: números diferentes, sem buraco.
  const nums = await Promise.all(Array.from({ length: 20 }, () => db.senhaProxima(t, '', 'A', '2026-11-06', em)));
  assert.deepEqual(nums.slice().sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.equal(await db.senhaProxima(t, '', 'P', '2026-11-06', em), 1, 'cada letra tem a sua fila');
  assert.equal(await db.senhaProxima(t, 'Sala 2', 'A', '2026-11-06', em), 1, 'cada grupo de TVs tem a sua fila');
  assert.equal(await db.senhaProxima(t, '', 'A', '2026-11-07', em), 1, 'o dia seguinte começa do 1');
  for (let i = 0; i < 998; i++) await db.senhaProxima(t, '', 'B', '2026-11-06', em);
  assert.equal(await db.senhaProxima(t, '', 'B', '2026-11-06', em), 999);
  assert.equal(await db.senhaProxima(t, '', 'B', '2026-11-06', em), 1, 'depois de 999 volta ao 1');
  await db.senhaRegistrar(t, { grupo: '', prefixo: 'A', numero: 1, localTipo: 'guiche', localNum: 1, tipo: 'proxima', dia: '2026-11-07', em });
  await db.senhaRegistrar(t, { grupo: 'Sala 2', prefixo: 'A', numero: 1, localTipo: 'sala', localNum: 2, tipo: 'proxima', dia: '2026-11-07', em: em + 1 });
  assert.equal((await db.senhaChamadas(t, [''], '2026-11-07', 10)).length, 1);
  assert.equal((await db.senhaChamadas(t, ['', 'Sala 2'], '2026-11-07', 10)).length, 2, 'a TV do grupo vê as de todas e as do grupo');
  assert.equal((await db.senhaChamadas(t, [''], '2026-11-06', 10)).length, 0, 'só as do dia');
  await db.senhaZerar(t, '');
  assert.equal((await db.senhaChamadas(t, [''], '2026-11-07', 10)).length, 0);
  assert.equal((await db.senhaChamadas(t, ['Sala 2'], '2026-11-07', 10)).length, 1, 'zerar uma fila não mexe na outra');
  assert.equal(await db.senhaProxima(t, '', 'A', '2026-11-07', em), 1);
});

test('os dois bancos: as tabelas nascem no init, saem com a conta e vão na exportação', () => {
  for (const arq of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const s = ler(arq);
    for (const tabela of ['senha_filas', 'senha_chamadas']) {
      assert.match(s, new RegExp('CREATE TABLE IF NOT EXISTS ' + tabela + ' \\('), arq + ' não cria ' + tabela);
      const i = s.indexOf('async function apagarTenant');
      assert.ok(s.slice(i, s.indexOf("'users']", i)).includes("'" + tabela + "'"), arq + ': excluir a conta deixa ' + tabela);
    }
    assert.match(s, /chamadasDeSenha:/, arq + ' não exporta as chamadas');
    for (const f of ['senhaProxima', 'senhaRegistrar', 'senhaChamadas', 'senhaFilas', 'senhaZerar']) {
      assert.match(s, new RegExp('async function ' + f + '\\('), arq + ' sem ' + f);
      assert.match(s.slice(s.indexOf('module.exports')), new RegExp('\\b' + f + '\\b'), arq + ' não exporta ' + f);
    }
    // "Chamar a próxima" é UM comando (UPSERT ... RETURNING): duas recepções juntas não pegam o mesmo número.
    assert.match(s, /ON CONFLICT \(tenant_id, grupo, prefixo\) DO UPDATE SET[\s\S]{0,300}RETURNING numero/, arq);
  }
});

/* ---------------- a TV (js/senha.js) ---------------- */

test('a tela da senha na TV: régua de 4,5%, sem `inset`, sem nome, no pacote do player', () => {
  const src = ler('js/senha.js');
  const css = (src.match(/const CSS = \[([\s\S]*?)\]\.join/) || [])[1] || '';
  assert.ok(css.length > 1000, 'não achei o CSS da senha');
  // Toda letra em vmin (a tela inteira) tem pelo menos a régua; a senha, muito mais.
  const tamanhos = [...css.matchAll(/font-size:([\d.]+)vmin/g)].map((m) => Number(m[1]));
  assert.ok(tamanhos.length >= 15, 'poucos tamanhos: ' + tamanhos.length);
  assert.ok(Math.min(...tamanhos) >= 4.5, 'letra abaixo da régua: ' + Math.min(...tamanhos) + 'vmin');
  assert.match(css, /\.mt-senha-num\{font-size:30vmin/, 'a senha é a maior coisa da tela');
  assert.doesNotMatch(css, /(^|[;{'])inset\s*:/, 'inset não existe no Chromium < 87');
  assert.match(src, /const REGUA = 4\.5;/);
  assert.match(src, /Math\.max\(piso, atual \* \(largura \/ c\.scrollWidth\) \* 0\.98\)/, 'encolher para caber, nunca abaixo da régua');
  // A tela só desenha a senha e o lugar da chamada (nada mais do que o servidor manda).
  assert.deepEqual([...new Set([...src.matchAll(/\batual\.(\w+)/g)].map((m) => m[1]))].sort(), ['local', 'senha']);
  // No pacote, depois do desenhista e do cliente da nuvem, antes do player.
  const html = ler('player.html');
  const ordem = ['js/render.js', 'js/ambiente.js', 'js/cloud.js', 'js/senha.js', 'js/rodizio.js', 'js/player.js'].map((s) => html.indexOf('<script src="' + s + '">'));
  assert.ok(ordem.every((x, i) => x > 0 && (i === 0 || x > ordem[i - 1])), 'ordem dos scripts: ' + ordem.join(','));
  assert.ok(Number(/mt-shell-v(\d+)/.exec(ler('sw.js'))[1]) >= 81, 'a TV precisa baixar o player novo');
});

test('a TV recebe pelo tempo real, pergunta sem ele, e não anuncia de novo depois de recarregar', () => {
  const C = ler('js/cloud.js');
  assert.match(C, /es\.addEventListener\('senha', \(ev\) =>/);
  assert.match(C, /document\.dispatchEvent\(new CustomEvent\('mt:senha', \{ detail: dado \}\)\)/);
  assert.match(C, /es\.addEventListener\('ready', \(\) => avisarTempoReal\(true\)\)/);
  assert.match(C, /avisarTempoReal\(false\);/, 'o tempo real que cai liga a pergunta de reserva');
  assert.match(C, /localStorage\.removeItem\('mt\.senha\.estado'\)/, 'a TV nova não herda a senha da conta antiga');
  const T = ler('js/senha.js');
  assert.match(T, /const POLL_MS = 4000;/);
  assert.match(T, /\(opcoes\.ativo && !tempoReal\(\)\)/, 'sem tempo real, pergunta');
  assert.match(T, /chave !== lerGuardado\(CHAVE_ANUNCIADA\) && origem !== 'memoria'/, 'a recarga não anuncia de novo');
  assert.match(T, /estado\.agora - Number\(a\.em\) < NOVA_MS/, 'a idade pelo relógio do servidor');
  assert.match(T, /if \(estado && estado\.agora && Number\(e\.agora\) && Number\(e\.agora\) < estado\.agora\) return;/, 'a pergunta que volta atrasada não anuncia de novo a senha anterior');
  assert.match(T, /if \(opcoes\.som\) \{ try \{ tocar\(\); \}/, 'o som só com o som da chamada ligado nesta TV');
  const P = ler('js/player.js');
  assert.match(P, /if \(global\.MTSenha\) MTSenha\.ligar\(dev\.id\);/);
  assert.match(P, /if \(global\.MTSenha\) MTSenha\.configurar\(cfg\);/);
  assert.match(P, /senha: 1,\s+\/\/ a chamada de senha/, 'mudar o som da senha não refaz as zonas');
  const st = require('../js/storage.js');
  assert.deepEqual(st.normalize({ settings: { senha: { som: false, segundos: 99 } } }).settings.senha, { ativo: true, som: false, fixa: false, segundos: 30 });
  assert.equal('senha' in st.normalize({}).settings, false, 'a config que nunca mexeu continua sem a chave');
});

/* ---------------- o painel ---------------- */

test('o painel: a página da senha a um toque na Saúde, com um violeta só, e aberta a todas as frentes', async () => {
  const app = ler('web/src/App.jsx');
  assert.match(app, /case 'senha': return <SenhaPage onIr=\{go\} \/>;/);
  assert.match(app, /'indicadores', 'senha',/, '?ir=senha sobrevive ao recarregar');
  const { pathToFileURL } = require('node:url');
  const M = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/menu.js')).href);
  assert.equal(M.paginaDoIr('senha'), 'senha');
  assert.equal(M.grupoNaFrente('senha', 'saude').id, 'midias', 'na Saúde acende a Biblioteca, onde moram os Apps');
  const top = ler('web/src/components/layout/Topbar.jsx');
  assert.match(top, /perfil\.id === 'saude' && onNavigate && \(/);
  assert.match(top, /onClick=\{\(\) => onNavigate\('senha'\)\}/);
  assert.doesNotMatch(top.slice(top.indexOf("onNavigate('senha')") - 200, top.indexOf("onNavigate('senha')") + 400), /bg-accent/, 'o botão do topo é neutro');
  assert.match(ler('web/src/pages/BibliotecaPage.jsx'), /\{ id: 'senha', nome: 'Chamada de senha'/);
  assert.ok(JSON.parse(ler('web/public/manifest.webmanifest')).shortcuts.some((x) => x.url === '/app/?ir=senha'), 'atalho do ícone');
  const p = ler('web/src/pages/SenhaPage.jsx');
  assert.equal((p.match(/bg-accent |variant="primary"/g) || []).length, 1, 'um violeta por tela');
  for (const t of ['Chamar a próxima', 'Chamar de novo', 'Chamar um número', 'Zerar o dia', 'Onde você atende', 'Nunca o nome do paciente']) assert.ok(p.includes(t), t);
  assert.match(p, /confirmar\(\{\s+titulo: 'Zerar as senhas de hoje\?'/, 'zerar pergunta antes');
  assert.match(p, /aria-live="polite"/);
});

/* ---------------- o servidor de verdade ---------------- */

const PORTA = 7300 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.headers || {}) }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(txt); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const jarra = (r) => r.cookies.map((x) => x.split(';')[0]).filter((x) => !x.endsWith('=')).join('; ');

// O tempo real da TV, como o player abre (o cabeçalho com o token vale para quem consegue mandar cabeçalho).
function ouvirTv(tv) {
  const eventos = [];
  let pronto;
  const aberto = new Promise((r) => { pronto = r; });
  const req = http.get({ host: '127.0.0.1', port: PORTA, path: '/api/devices/' + tv.id + '/events', headers: { 'x-device-token': tv.deviceToken } }, (res) => {
    let buf = '';
    res.on('data', (c) => {
      buf += c;
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const bloco = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = (/^event: (.+)$/m.exec(bloco) || [])[1];
        const dado = (/^data: (.+)$/m.exec(bloco) || [])[1];
        if (ev === 'ready') pronto();
        if (ev) eventos.push({ ev, em: Date.now(), dado: dado ? JSON.parse(dado) : null });
      }
    });
  });
  return { eventos, aberto, fechar: () => req.destroy() };
}
async function esperarEvento(ouvido, filtro, ms) {
  const fim = Date.now() + (ms || 3000);
  while (Date.now() < fim) {
    const e = ouvido.eventos.find(filtro);
    if (e) return e;
    await new Promise((r) => setTimeout(r, 10));
  }
  return null;
}

test('servidor: a recepção (membro) chama e a TV recebe em menos de 1 s; login em toda rota; cada conta e cada grupo na sua fila', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-senha-srv-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  const ouvidos = [];
  t.after(() => { ouvidos.forEach((o) => o.fechar()); servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const marca = Date.now();
  const dono = jarra(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'clinica' + marca + '@teste.local', password: 'senha-de-teste-123', name: 'Clínica Vida', aceite: true, perfil: 'saude' } }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono, json: { plan: 'pro' } })).status, 200);
  const conv = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'recepcao' + marca + '@teste.local', role: 'member' } });
  assert.equal(conv.status, 201);
  const recepcao = jarra(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'recepcao' + marca + '@teste.local', password: 'senha-de-teste-123', name: 'Recepção', aceite: true, inviteCode: conv.json.code } }));
  const outra = jarra(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'outra' + marca + '@teste.local', password: 'senha-de-teste-123', name: 'Outra', aceite: true, perfil: 'saude' } }));

  async function tvDaClinica(grupo) {
    const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
    await pedir('/api/devices/' + tv.id + '/heartbeat', { method: 'POST', json: { ua: 'tv-' + tv.id, w: 1920, h: 1080 }, headers: { 'x-device-token': tv.deviceToken } });
    assert.equal((await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: tv.code, nova: true } })).status, 200);
    if (grupo) assert.equal((await pedir('/api/devices/' + tv.id + '/grupo', { method: 'POST', cookie: dono, json: { grupo } })).status, 200);
    return tv;
  }
  const recepcaoTv = await tvDaClinica('');
  const sala2Tv = await tvDaClinica('Sala 2');

  // Sem login, nada; o lugar com nome é recusado.
  assert.equal((await pedir('/api/senha')).status, 401);
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', json: { prefixo: 'A', local: { tipo: 'guiche', numero: 1 } } })).status, 401);
  const comNome = await pedir('/api/senha/proxima', { method: 'POST', cookie: recepcao, json: { prefixo: 'A', local: { tipo: 'Dona Maria' } } });
  assert.equal(comNome.status, 400);
  assert.match(comNome.json.error, /Escolha onde o paciente vai ser atendido/);
  assert.equal((await pedir('/api/senha/chamar', { method: 'POST', cookie: recepcao, json: { prefixo: 'A', numero: 0, local: { tipo: 'guiche', numero: 1 } } })).status, 400);
  assert.equal((await pedir('/api/senha/rechamar', { method: 'POST', cookie: recepcao, json: {} })).status, 400, 'nada para chamar de novo ainda');

  // A TV com o tempo real aberto: a chamada do MEMBRO chega em menos de 1 s, com o estado inteiro.
  const ouvido = ouvirTv(recepcaoTv);
  const ouvido2 = ouvirTv(sala2Tv);
  ouvidos.push(ouvido, ouvido2);
  await ouvido.aberto; await ouvido2.aberto;
  const t0 = Date.now();
  const r1 = await pedir('/api/senha/proxima', { method: 'POST', cookie: recepcao, json: { prefixo: 'A', local: { tipo: 'consultorio', numero: 3 } } });
  assert.equal(r1.status, 200, JSON.stringify(r1.json));
  assert.equal(r1.json.atual.senha, 'A 001');
  assert.equal(r1.json.proximos.A, 2);
  const chegou = await esperarEvento(ouvido, (e) => e.ev === 'senha' && e.dado.atual && e.dado.atual.senha === 'A 001', 2000);
  assert.ok(chegou, 'a TV não recebeu a chamada pelo tempo real');
  assert.ok(chegou.em - t0 < 1000, 'a chamada levou ' + (chegou.em - t0) + ' ms para chegar à TV');
  assert.equal(chegou.dado.atual.local, 'Consultório 3');
  assert.ok(chegou.dado.agora > 0, 'a TV conta a idade pelo relógio do servidor');
  assert.ok(await esperarEvento(ouvido2, (e) => e.ev === 'senha', 2000), 'a fila de todas as TVs chega também à TV do grupo');

  // Mais chamadas: a próxima, um número escolhido (a fila não anda) e de novo.
  await pedir('/api/senha/proxima', { method: 'POST', cookie: recepcao, json: { prefixo: 'A', local: { tipo: 'guiche', numero: 2 } } });
  const n42 = await pedir('/api/senha/chamar', { method: 'POST', cookie: recepcao, json: { prefixo: 'P', numero: 42, local: { tipo: 'guiche', numero: 1 } } });
  assert.equal(n42.json.atual.senha, 'P 042');
  assert.equal(n42.json.proximos.A, 3, 'chamar um número não muda a sequência');
  const de = await pedir('/api/senha/rechamar', { method: 'POST', cookie: dono, json: {} });
  assert.equal(de.json.atual.senha, 'P 042');
  assert.equal(de.json.atual.rechamada, true);
  assert.deepEqual(de.json.anteriores.map((x) => x.senha), ['A 002', 'A 001']);

  // A pergunta de reserva da TV (sem tempo real): o mesmo estado, só com o token dela.
  const daTv = await pedir('/api/devices/' + recepcaoTv.id + '/senha', { headers: { 'x-device-token': recepcaoTv.deviceToken } });
  assert.equal(daTv.status, 200);
  assert.equal(daTv.json.atual.senha, 'P 042');
  assert.equal((await pedir('/api/devices/' + recepcaoTv.id + '/senha')).status, 403, 'sem o token da TV, não');
  assert.equal((await pedir('/api/devices/' + recepcaoTv.id + '/senha', { cookie: outra })).status, 403, 'outra conta não lê a TV da clínica');
  assert.equal((await pedir('/api/senha', { cookie: outra })).json.atual, null, 'a fila da outra conta é outra');

  // A fila de um grupo só chega às TVs dele.
  const antes = ouvido.eventos.length;
  const sala = await pedir('/api/senha/proxima', { method: 'POST', cookie: recepcao, json: { grupo: 'Sala 2', prefixo: 'A', local: { tipo: 'sala', numero: 2 } } });
  assert.equal(sala.json.atual.senha, 'A 001', 'cada grupo começa a sua fila');
  assert.deepEqual(sala.json.grupos, ['Sala 2']);
  assert.ok(await esperarEvento(ouvido2, (e) => e.ev === 'senha' && e.dado.atual.local === 'Sala 2', 2000), 'a TV da Sala 2 recebe');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(ouvido.eventos.slice(antes).filter((e) => e.ev === 'senha').length, 0, 'a TV da recepção não recebe a fila da Sala 2');
  const tv2 = await pedir('/api/devices/' + sala2Tv.id + '/senha', { headers: { 'x-device-token': sala2Tv.deviceToken } });
  assert.equal(tv2.json.atual.local, 'Sala 2');
  assert.ok(tv2.json.anteriores.some((x) => x.senha === 'P 042'), 'a TV do grupo soma as chamadas de todas as TVs');

  // Zerar o dia: a TV fica sem chamada, e a próxima volta a 001.
  const z = await pedir('/api/senha/zerar', { method: 'POST', cookie: recepcao, json: {} });
  assert.equal(z.status, 200);
  assert.equal(z.json.atual, null);
  assert.ok(await esperarEvento(ouvido, (e) => e.ev === 'senha' && e.dado.atual === null, 2000), 'a TV fica sem a chamada na hora');
  assert.equal((await pedir('/api/senha/proxima', { method: 'POST', cookie: recepcao, json: { prefixo: 'A', local: { tipo: 'guiche', numero: 1 } } })).json.atual.senha, 'A 001');
});
