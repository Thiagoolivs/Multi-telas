/*
 * O app Android contra travamento (docs/CAPACIDADE-E-TVBOX.md §6.2).
 *
 * O app é atualizado sozinho em TODAS as TVs da produção (android.yml publica
 * o Release, server/apk.js serve): um defeito aqui vai para a parede de todo
 * cliente. Por isso as regras do vigia do app moram numa classe sem nada do
 * Android (RegrasDoVigia.java), e este teste a COMPILA e roda de verdade
 * quando há um javac na máquina (o CI tem); sem javac, essa parte é pulada e
 * o resto roda igual.
 *
 *   1. O silêncio conta: a pergunta que não volta é falha, e a escada sobe
 *      (recarregar → recriar o WebView → reiniciar o app, este só no Android
 *      até 9 e uma vez a cada 6 h), sempre com 3 falhas seguidas antes de
 *      cada degrau, e depois do topo no máximo uma ação a cada 30 min.
 *   2. A recarga da madrugada do vigia da página vira um WebView novo no app
 *      (os dois nunca agem na mesma noite).
 *   3. O pulso conta se o app é a tela inicial; o painel avisa na página da TV.
 *   4. "Reiniciar o app" pelo painel; sem o app, recarrega a página.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8').replace(/\r\n/g, '\n');
const importar = (f) => import(pathToFileURL(path.join(RAIZ, f)).href);
const JAVA = 'android/app/src/main/java/br/com/multitelas/tv/';
const MIN = 60 * 1000;
const HORA = 60 * MIN;

/* ---------------- 1. As regras do vigia do app (Java de verdade) ---------------- */

// Um roteiro: cada linha é uma chamada às regras; a saída é uma linha por chamada.
const ROTEIRO_JAVA = `package br.com.multitelas.tv;
import java.io.*;
public class Roteiro {
  public static void main(String[] a) throws Exception {
    RegrasDoVigia r = new RegrasDoVigia();
    BufferedReader in = new BufferedReader(new InputStreamReader(System.in));
    StringBuilder out = new StringBuilder();
    for (String l; (l = in.readLine()) != null; ) {
      String[] p = l.trim().split(" ");
      if (p[0].equals("novo")) { r = new RegrasDoVigia(); out.append("-\\n"); continue; }
      long t = Long.parseLong(p[1]);
      if (p[0].equals("pedido")) out.append(r.aceitarPedido(t) ? "sim" : "nao");
      else if (p[0].equals("queda")) out.append(r.esperaDepoisDaQueda(t));
      else out.append(r.anotar(Integer.parseInt(p[2]), t, p[3].equals("1"), p[4].equals("1")));
      out.append("\\n");
    }
    System.out.print(out);
  }
}
`;

const temJava = (() => {
  try { return spawnSync('javac', ['-version'], { encoding: 'utf8' }).status === 0 && spawnSync('java', ['-version']).status === 0; } catch (e) { return false; }
})();

let roteiroCompilado = null;
function compilarRoteiro() {
  if (roteiroCompilado) return roteiroCompilado;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-vigia-app-'));
  const pacote = path.join(dir, 'src', 'br', 'com', 'multitelas', 'tv');
  fs.mkdirSync(pacote, { recursive: true });
  fs.copyFileSync(path.join(RAIZ, JAVA, 'RegrasDoVigia.java'), path.join(pacote, 'RegrasDoVigia.java'));
  fs.writeFileSync(path.join(pacote, 'Roteiro.java'), ROTEIRO_JAVA);
  const saida = path.join(dir, 'classes');
  // Só a classe e o roteiro, sem o android.jar: se algo do Android entrar nas regras, não compila.
  const c = spawnSync('javac', ['-encoding', 'UTF-8', '-d', saida, path.join(pacote, 'RegrasDoVigia.java'), path.join(pacote, 'Roteiro.java')], { encoding: 'utf8' });
  assert.equal(c.status, 0, 'RegrasDoVigia.java não compila sozinha (nada do Android pode entrar nela):\n' + c.stderr);
  roteiroCompilado = { dir, saida };
  return roteiroCompilado;
}
test.after(() => { if (roteiroCompilado) fs.rmSync(roteiroCompilado.dir, { recursive: true, force: true }); });

const R = { OK: 0, FORA: 1, PARADO: 2, SILENCIO: 3 };
const A = ['nada', 'recarregar', 'recriar', 'reiniciar-app'];

// Roda as linhas e devolve uma saída por linha (as ações já com nome).
function rodar(linhas) {
  const { saida } = compilarRoteiro();
  const r = spawnSync('java', ['-cp', saida, 'br.com.multitelas.tv.Roteiro'], { input: linhas.join('\n') + '\n', encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim().split('\n');
}
// Uma resposta por minuto, a partir do minuto `de`. Devolve [minuto, ação] de cada ação que não é "nada".
function minutoAMinuto(respostas, o = {}) {
  const de = o.de || 1;
  const linhas = respostas.map((resp, i) => ['anotar', (de + i) * MIN, R[resp], o.foraDaFrente ? 0 : 1, o.appPode ? 1 : 0].join(' '));
  return rodar(linhas).map((s, i) => [de + i, A[Number(s)]]).filter(([, a]) => a !== 'nada');
}
const vezes = (n, r) => Array.from({ length: n }, () => r);

test('vigia do app: o silêncio conta, e a escada é recarregar, recriar e, no topo, uma vez a cada 30 min', { skip: !temJava && 'sem javac nesta máquina' }, () => {
  // Android 10+ (o app não reinicia): 3 min, 6 min, e depois só aos 36 min.
  assert.deepEqual(minutoAMinuto(vezes(70, 'SILENCIO')), [[3, 'recarregar'], [6, 'recriar'], [36, 'recriar'], [66, 'recriar']]);
  // Android até 9: o segundo degrau do silêncio é reiniciar o app (o renderizador não morre sozinho lá).
  assert.deepEqual(minutoAMinuto(vezes(8, 'SILENCIO'), { appPode: true }), [[3, 'recarregar'], [6, 'reiniciar-app']]);
  // A zona parada (o JavaScript vivo) nunca reinicia o app, nem no Android 9.
  assert.deepEqual(minutoAMinuto(vezes(8, 'PARADO'), { appPode: true }), [[3, 'recarregar'], [6, 'recriar']]);
});

test('vigia do app: "fora" (o JavaScript responde, o player não) só recarrega, de 3 em 3 min, como antes', { skip: !temJava && 'sem javac nesta máquina' }, () => {
  assert.deepEqual(minutoAMinuto(vezes(9, 'FORA'), { appPode: true }), [[3, 'recarregar'], [6, 'recarregar'], [9, 'recarregar']]);
  // E não sobe a escada: o silêncio que vem depois começa do primeiro degrau.
  assert.deepEqual(minutoAMinuto([...vezes(3, 'FORA'), ...vezes(3, 'SILENCIO')]), [[3, 'recarregar'], [6, 'recarregar']]);
});

test('vigia do app: uma falha só não faz nada; a resposta boa zera a conta; 30 min bem e a escada recomeça', { skip: !temJava && 'sem javac nesta máquina' }, () => {
  assert.deepEqual(minutoAMinuto(['SILENCIO', 'SILENCIO', 'OK', 'SILENCIO', 'SILENCIO', 'OK', 'PARADO', 'PARADO', 'OK']), []);
  // Recarregou, ficou bem 31 min, travou de novo: recarrega (não recria).
  assert.deepEqual(minutoAMinuto([...vezes(3, 'SILENCIO'), ...vezes(31, 'OK'), ...vezes(3, 'SILENCIO')]), [[3, 'recarregar'], [37, 'recarregar']]);
  // Ficou bem só 10 min: o defeito é o mesmo, sobe para recriar.
  assert.deepEqual(minutoAMinuto([...vezes(3, 'SILENCIO'), ...vezes(10, 'OK'), ...vezes(3, 'SILENCIO')]), [[3, 'recarregar'], [16, 'recriar']]);
});

test('vigia do app: com outra tela por cima (configurações, instalador), só o primeiro degrau', { skip: !temJava && 'sem javac nesta máquina' }, () => {
  assert.deepEqual(minutoAMinuto(vezes(12, 'SILENCIO'), { foraDaFrente: true, appPode: true }), [[3, 'recarregar']]);
  // Voltou para a frente: o degrau seguinte sai na primeira falha.
  const linhas = [];
  for (let m = 1; m <= 5; m++) linhas.push(['anotar', m * MIN, R.SILENCIO, 0, 0].join(' '));
  linhas.push(['anotar', 6 * MIN, R.SILENCIO, 1, 0].join(' '));
  assert.deepEqual(rodar(linhas).map((s) => A[Number(s)]), ['nada', 'nada', 'recarregar', 'nada', 'nada', 'recriar']);
});

test('vigia do app: o pedido da página (painel, madrugada) no máximo a cada 5 min; queda em série espera 1 min', { skip: !temJava && 'sem javac nesta máquina' }, () => {
  assert.deepEqual(rodar(['pedido 0', 'pedido ' + 4 * MIN, 'pedido ' + 5 * MIN, 'pedido ' + 6 * MIN]), ['sim', 'nao', 'sim', 'nao']);
  // Três quedas em 10 min passam direto; a quarta espera; uma queda depois da janela, direto de novo.
  assert.deepEqual(rodar(['queda 0', 'queda ' + MIN, 'queda ' + 2 * MIN, 'queda ' + 3 * MIN, 'queda ' + 20 * MIN]), ['0', '0', '0', '60000', '0']);
});

/* ---------------- O app: o que só a leitura do código confere ---------------- */

test('o app: a pergunta conta o silêncio, a marca da página, a zona parada; o reinício do app tem freio guardado', () => {
  const M = ler(JAVA + 'MainActivity.java');
  // O silêncio: a pergunta de um minuto atrás que não voltou vira falha.
  assert.match(M, /if \(esperandoResposta\) \{\n\s+esperandoResposta = false;\n\s+if \(agir\(regras\.anotar\(RegrasDoVigia\.SILENCIO,/);
  assert.match(M, /if \(esta != pergunta\) return;/, 'resposta de pergunta antiga contaria');
  // Primeiro agenda o próximo: uma exceção não para o vigia.
  assert.match(M, /public void run\(\) \{\n\s+\/\/[^\n]*\n\s+handler\.postDelayed\(this, VIGIA_MS\);/);
  // A página pede o reinício por uma marca (não por um método da ponte que todo iframe vê).
  assert.match(M, /var r=window\.MT_REINICIAR;if\(r\)return 'reiniciar:'/);
  assert.match(M, /if\(v&&v\.parada>" \+ PARADA_MS \+ "&&v\.pulsoOk&&Date\.now\(\)-v\.pulsoOk<120000\)return 'parado';/);
  assert.match(M, /PARADA_MS = 15 \* 60_000L;/);
  assert.match(M, /if \(regras\.aceitarPedido\(agora\)\) \{/);
  // A página "Procurando a internet…" não conta como falha (a nova tentativa de 15 s cuida).
  assert.match(M, /vigiaEmPausa = true;\n\s+v\.loadDataWithBaseURL\(null, PAGINA_SEM_REDE/);
  // Recriar: no 10+ mata o renderizador; o onRenderProcessGone recria.
  assert.match(M, /if \(Build\.VERSION\.SDK_INT >= 29 && terminarRenderizador\(\)\) return;/);
  assert.match(M, /if \(v != web\) return true;/);
  // Reiniciar o app: só até o Android 9, a marca gravada (commit) ANTES de sair, e 6 h de freio.
  assert.match(M, /private boolean appPodeReiniciar\(\) \{\n\s+if \(Build\.VERSION\.SDK_INT >= 29\) return false;/);
  const reiniciar = M.slice(M.indexOf('private void reiniciarApp()'), M.indexOf('private boolean appPodeReiniciar()'));
  const ordem = ['putLong(CHAVE_REINICIO, System.currentTimeMillis())', '.commit();', 'agendarReabertura(', 'killProcess('];
  ordem.reduce((i, s) => { const j = reiniciar.indexOf(s); assert.ok(j > i, 'fora de ordem ou faltando: ' + s); return j; }, -1);
  const Rg = ler(JAVA + 'RegrasDoVigia.java');
  assert.match(Rg, /FALHAS_PARA_AGIR = 3;/);
  assert.match(Rg, /ENTRE_REINICIOS_DO_APP_MS = 6 \* 60 \* 60_000L;/);
  assert.match(Rg, /ENTRE_ACOES_NO_TOPO_MS = 30 \* 60_000L;/);
  assert.doesNotMatch(Rg, /^import android/m, 'RegrasDoVigia precisa compilar sem o Android');
});

test('o app: a ponte só lê (versão do vigia, tela inicial, resumo); o manifesto enxerga as telas iniciais', () => {
  const P = ler(JAVA + 'Ponte.java');
  const semComentario = P.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(semComentario, /public int vigia\(\) \{\n\s+return 2;/);
  assert.match(semComentario, /public boolean telaInicial\(\) \{\n\s+return MainActivity\.ehTelaInicial\(ctx\);/);
  assert.doesNotMatch(semComentario, /reiniciar|recriar|killProcess|loadUrl|evaluateJavascript/, 'a ponte (que todo iframe enxerga) não pode mexer na TV');
  const M = ler(JAVA + 'MainActivity.java');
  assert.match(M, /resolveActivity\(home, PackageManager\.MATCH_DEFAULT_ONLY\)/);
  assert.match(M, /ctx\.getPackageName\(\)\.equals\(r\.activityInfo\.packageName\)/);
  const X = ler('android/app/src/main/AndroidManifest.xml');
  assert.match(X, /<queries>\s*<intent>\s*<action android:name="android\.intent\.action\.MAIN" \/>\s*<category android:name="android\.intent\.category\.HOME" \/>/);
});

/* ---------------- 2. O vigia da página conversa com o app ---------------- */

const V = require('../js/vigia.js');

function comApp(versao, fn) {
  const antes = { app: globalThis.MTApp, marca: globalThis.MT_REINICIAR, location: globalThis.location };
  const recargas = [];
  globalThis.MTApp = versao == null ? undefined : { vigia: () => versao };
  delete globalThis.MT_REINICIAR;
  globalThis.location = { reload: () => recargas.push('reload') };
  try { return fn(recargas); } finally {
    globalThis.MTApp = antes.app;
    if (antes.marca === undefined) delete globalThis.MT_REINICIAR; else globalThis.MT_REINICIAR = antes.marca;
    if (antes.location === undefined) delete globalThis.location; else globalThis.location = antes.location;
  }
}

test('vigia da página: "reiniciar o app" vira a marca para o app v2; sem ele (ou casca antiga), recarrega', () => {
  for (const versao of [null, 1]) {
    comApp(versao, (recargas) => {
      assert.equal(V.reiniciarApp('painel'), false);
      assert.deepEqual(recargas, ['reload'], 'TV sem o app v2 não recarregou');
      assert.equal(globalThis.MT_REINICIAR, undefined);
    });
  }
  comApp(2, (recargas) => {
    const esperas = [];
    assert.equal(V.reiniciarApp('painel', { esperar: (fn, ms) => esperas.push([fn, ms]) }), true);
    assert.equal(globalThis.MT_REINICIAR, 'painel');
    assert.deepEqual(recargas, [], 'com o app, a página não recarrega na hora');
    // O app não agiu em 3 min (outra tela por cima, freio dele): a página recarrega mesmo assim.
    assert.equal(esperas[0][1], 3 * MIN);
    esperas[0][0]();
    assert.deepEqual(recargas, ['reload']);
  });
  // A ponte que falha não derruba o pedido: vira recarga.
  const antes = globalThis.MTApp;
  globalThis.MTApp = { vigia: () => { throw new Error('ponte'); } };
  try { assert.equal(V.appReinicia(), false); } finally { globalThis.MTApp = antes; }
});

test('vigia da página: a recarga da madrugada vai ao app (WebView novo); a da zona parada continua da página', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  comApp(2, (recargas) => {
    V._zerar(); // a página "sobe" agora (estado.desde)
    let agora = Date.now() + 5 * HORA;
    const armazem = { getItem: () => null, setItem: () => {} };
    const vig = V.ligar({ semRelogio: true, agora: () => agora, hora: () => 3, armazem, avisar: () => {} });
    V.marcarPulso(agora);
    // Ligada há 5 h: nada. Há 21 h, às 3h e com servidor: o app recria.
    assert.equal(vig.olhar().acao, '');
    agora += 16 * HORA;
    V.marcarPulso(agora);
    assert.equal(vig.olhar().motivo, 'madrugada');
    assert.equal(globalThis.MT_REINICIAR, 'madrugada');
    assert.deepEqual(recargas, [], 'recarregou a página em vez de pedir o WebView novo');
    t.mock.timers.tick(3 * MIN);
    assert.deepEqual(recargas, ['reload'], 'o app não agiu e a página ficou esperando para sempre');
    V._zerar();
  });
});

test('vigia da página: a zona que nem o cutucão faz andar volta à vista; `parada` conta desde a primeira hora perdida', () => {
  V._zerar();
  let t = 50 * HORA;
  const guardado = {};
  const armazem = { getItem: (k) => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = v; } };
  const recargas = [];
  let cutucadas = 0;
  const z = V.zona(() => { cutucadas++; }); // o cutucão não marca relógio novo: a zona está quebrada
  const vig = V.ligar({ semRelogio: true, agora: () => t, hora: () => 14, armazem, recarregar: (m) => recargas.push(m), avisar: () => {} });
  const perdida = t + 6000;
  z.devido(perdida);
  t += 3 * MIN; V.marcarPulso(t);
  assert.equal(vig.olhar().acao, 'cutucar');
  assert.equal(cutucadas, 1);
  // Antes o cutucão zerava o relógio e a zona sumia da vista para sempre. Agora, 2 min depois, recarrega.
  t += 1 * MIN; V.marcarPulso(t);
  assert.equal(vig.olhar().acao, '');
  t += 2 * MIN; V.marcarPulso(t);
  assert.equal(vig.olhar().acao, 'recarregar');
  assert.deepEqual(recargas, ['zona-parada']);
  // `parada` mede desde a primeira hora perdida, não desde o cutucão.
  assert.equal(V.estado(t).parada, t - perdida);
  // A zona que andou sozinha (relógio novo) não está mais parada.
  z.devido(t + 10000);
  assert.equal(V.estado(t).parada, 0);
  V._zerar();
});

test('vigia da página: sem servidor não recarrega, só cutuca; a `parada` passa dos 15 min e o app (com o servidor de volta) vê', () => {
  V._zerar();
  let t = 70 * HORA;
  const armazem = { getItem: () => null, setItem: () => {} };
  const recargas = [];
  const z = V.zona(() => {});
  const vig = V.ligar({ semRelogio: true, agora: () => t, hora: () => 14, armazem, recarregar: (m) => recargas.push(m), avisar: () => {} });
  z.devido(t);
  for (let m = 1; m <= 17; m++) { t += MIN; vig.olhar(); }
  assert.deepEqual(recargas, [], 'recarregou sem servidor');
  assert.ok(V.estado(t).cutucadas >= 2, 'parou de cutucar');
  assert.ok(V.estado(t).parada > 15 * MIN, 'a parada recomeçou a cada cutucão');
  V._zerar();
});

/* ---------------- 3 e 4. O pulso e o comando, no cloud.js de verdade ---------------- */

function carregarCloud({ app, vigia } = {}) {
  const enviados = [];
  const recargas = [];
  const guardado = {};
  let resposta = {};
  const ctx = {
    console: { warn() {}, log() {} },
    URLSearchParams, URL, Promise, JSON, Object, Number, String, Array, Error, setTimeout, clearTimeout,
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 9) MultiTelasTV/1.0.70' },
    screen: { width: 1920, height: 1080 },
    devicePixelRatio: 1,
    location: { search: '', reload: () => recargas.push('reload') },
    localStorage: { getItem: (k) => (k in guardado ? guardado[k] : null), setItem: (k, v) => { guardado[k] = String(v); }, removeItem: (k) => { delete guardado[k]; } },
    document: { cookie: '', dispatchEvent: () => true },
    CustomEvent: function CustomEvent(tipo, o) { this.type = tipo; this.detail = o && o.detail; },
    fetch: async (url, opt) => {
      enviados.push({ url, corpo: opt && opt.body ? JSON.parse(opt.body) : null });
      return { status: 200, ok: true, json: async () => resposta };
    },
  };
  if (app) ctx.MTApp = app;
  if (vigia) ctx.MTVigia = vigia;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(ler('js/cloud.js'), ctx, { filename: 'js/cloud.js' });
  return { ctx, enviados, recargas, responder: (r) => { resposta = r; } };
}

test('o pulso: o app conta se é a tela inicial e o que o vigia dele fez; a casca antiga e o navegador não contam nada', async () => {
  const pedidos = [];
  const novo = carregarCloud({
    app: { versao: () => '1.0.70', codigo: () => 70, vigia: () => 2, telaInicial: () => false, vigiaResumo: () => 'recargas 1 · webview 0 · pedidos 1 · app 0' },
    vigia: { marcarPulso() {}, reiniciarApp: (m) => pedidos.push(m) },
  });
  await novo.ctx.MTCloud.heartbeat('tv1');
  const corpo = novo.enviados[0].corpo;
  assert.equal(corpo.inicial, false);
  assert.equal(corpo.appVigia, 'recargas 1 · webview 0 · pedidos 1 · app 0');
  assert.equal(corpo.appCodigo, 70);

  const antigo = carregarCloud({ app: { versao: () => '1.0.55', codigo: () => 55 } });
  await antigo.ctx.MTCloud.heartbeat('tv1');
  assert.ok(!('inicial' in antigo.enviados[0].corpo), 'a casca antiga não sabe: não pode mandar "não é"');
  assert.ok(!('appVigia' in antigo.enviados[0].corpo));

  // A ponte que falha não derruba o pulso.
  const quebrado = carregarCloud({ app: { versao: () => '1.0.70', telaInicial: () => { throw new Error('x'); } } });
  await quebrado.ctx.MTCloud.heartbeat('tv1');
  assert.equal(quebrado.enviados[0].corpo.app, '1.0.70');
  assert.ok(!('inicial' in quebrado.enviados[0].corpo));
});

test('o comando "reiniciar": com o vigia, pede o app (uma vez por comando); sem ele, recarrega', async () => {
  const pedidos = [];
  const tv = carregarCloud({ app: { versao: () => '1.0.70', vigia: () => 2 }, vigia: { marcarPulso() {}, reiniciarApp: (m) => pedidos.push(m) } });
  tv.responder({ ok: true, comando: { id: 'c1', acao: 'reiniciar' } });
  await tv.ctx.MTCloud.heartbeat('tv1');
  await tv.ctx.MTCloud.heartbeat('tv1'); // o mesmo comando de novo (o SSE e o pulso): uma vez só
  assert.deepEqual(pedidos, ['painel']);
  assert.deepEqual(tv.recargas, []);
  const navegador = carregarCloud({});
  navegador.responder({ ok: true, comando: { id: 'c2', acao: 'reiniciar' } });
  await navegador.ctx.MTCloud.heartbeat('tv1');
  assert.deepEqual(navegador.recargas, ['reload']);
});

/* ---------------- O painel ---------------- */

test('o aviso da tela inicial: só quando o app diz que NÃO é; com o que fazer', async () => {
  const { avisoDaTelaInicial } = await importar('web/src/lib/telaInicial.js');
  for (const info of [null, undefined, {}, { w: 1920, ua: 'Tizen' }, { app: '1.0.55' }, { app: '1.0.70', inicial: true }, { inicial: false }, { app: '1.0.70', inicial: 'false' }]) {
    assert.equal(avisoDaTelaInicial(info), null, JSON.stringify(info));
  }
  const a = avisoDaTelaInicial({ app: '1.0.70', appCodigo: 70, inicial: false });
  assert.ok(a && a.titulo && a.texto);
  assert.ok(a.passos.some((p) => /Apps padrão › Tela inicial › MultiTelas TV/.test(p)), 'o caminho nas configurações');
  assert.ok(a.passos.some((p) => /tire o aparelho da tomada/.test(p)), 'o teste de voltar sozinho');
  assert.equal(a.comando, 'adb shell cmd package set-home-activity br.com.multitelas.tv/.MainActivity');
  assert.ok(ler('android/README.md').includes(a.comando), 'o comando do painel e o do guia divergiram');
});

test('o painel: o aviso na página da TV; "Reiniciar o app da TV" junto dos outros comandos, só na TV com o app', () => {
  const E = ler('web/src/pages/ContentEditorPage.jsx');
  assert.match(E, /<AvisoTelaInicial info=\{device\.info\} \/>/);
  const S = ler('web/src/pages/ScreensPage.jsx');
  assert.match(S, /await devices\.comando\(d\.id, 'reiniciar'\)/);
  assert.match(S, /\{d\.info && d\.info\.app && <OpcaoDaTela icon=\{Power\} titulo="Reiniciar o app da TV"/);
  assert.match(ler('js/vigia.js'), /if \(motivo === 'madrugada'\) reiniciarApp\('madrugada'\);/);
  assert.ok(Number(/const SHELL_CACHE = 'mt-shell-v(\d+)';/.exec(ler('sw.js'))[1]) >= 92, 'o player mudou: suba o SHELL_CACHE');
});
