/*
 * "Sua primeira TV em 5 minutos" (o dono, 06/11): quem abre o produto monta
 * a TV em uns cinco minutos — negócio, marca, TV, tela, fotos e textos,
 * horário e "Pôr na TV". Medido no navegador por tools/cinco-minutos.mjs
 * (docs/qa-total/CINCO-MINUTOS.md).
 *
 * Aqui: o progresso (js/primeira-tv.js) — avançar, pular, voltar e retomar
 * de onde parou; as telas do passo 4 (só aprovadas, ou montadas só com
 * peças aprovadas, nunca de outra frente); o que o passo 5 pergunta e o que
 * a TV recebe; e o caminho de gravar, de verdade, no servidor — o dono põe
 * na TV, o membro com aprovação ligada pede.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const P = require('../js/primeira-tv.js');
require('../js/peca-html.js');
globalThis.window = globalThis.window || { dispatchEvent() {} };
const lib = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/primeiraTv.js')).href);
const telas = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/telasProntas.js')).href);

// O manifesto e as peças aprovadas, abertas como o painel abre (carregarTelasProntas), sem rede.
async function dadosDoManifesto(manifesto) {
  const T = await telas();
  const M = manifesto || JSON.parse(ler('pecas-ouro/manifesto.json'));
  const real = JSON.parse(ler('pecas-ouro/manifesto.json'));
  const modelos = new Map(real.pecas.filter((p) => p.estado === 'aprovada')
    .map((p) => [p.id, { ...p, arq: globalThis.MTPecaHtml.doArquivo(ler('pecas-ouro/' + p.id + '.html')) }]));
  return { telas: T.aprovadas(M), modelos, exemplos: T.nomesDeExemplo(real.marcas) };
}
const MARCA = { cores: ['#6b3a1e', '#e8b04b'], fonteTitulo: '', fonteApoio: '', nome: 'Padaria Sol', site: '', endereco: '', ramo: 'padaria' };

/* ---------------- o progresso ---------------- */

test('o progresso: avançar, pular, voltar, terminar e começar de novo', () => {
  const e0 = P.inicial(1000);
  assert.equal(e0.passo, 'negocio');
  assert.deepEqual(P.PASSOS, ['negocio', 'marca', 'tv', 'tela', 'fotos', 'horario', 'pronto']);
  const e1 = P.concluir(e0, 'negocio', { negocio: 'padaria' });
  assert.equal(e1.passo, 'marca');
  assert.deepEqual(e1.feitos, ['negocio']);
  assert.equal(e1.negocio, 'padaria');
  const e2 = P.pular(P.concluir(e1, 'marca'), 'tv');
  assert.equal(e2.passo, 'tela', '"Fazer isso depois" segue para o próximo passo');
  assert.deepEqual(e2.pulados, ['tv']);
  const e3 = P.concluir(e2, 'tela', { tela: 'montada:padaria:cardapio-dia-foto' });
  const e4 = P.voltar(e3);
  assert.equal(e4.passo, 'tela', 'voltar volta um passo');
  assert.equal(e4.tela, 'montada:padaria:cardapio-dia-foto', 'e o que já foi feito fica guardado');
  // Fazer depois o que ficou para depois: sai dos pulados.
  const e5 = P.concluir(P.voltar(P.voltar(e4)), 'tv', { tv: 'dev_1' });
  assert.deepEqual(e5.pulados, []);
  assert.equal(e5.tv, 'dev_1');
  const fim = P.terminar(e5, true, 5000);
  assert.deepEqual(fim.fim, { em: 5000, pendente: true });
  assert.equal(fim.passo, 'pronto');
  // "Montar a TV de novo": recomeça do 1, guardando só o negócio.
  const novo = P.deNovo(fim, 9000);
  assert.equal(novo.passo, 'negocio');
  assert.equal(novo.negocio, 'padaria');
  assert.equal(novo.fim, null);
  assert.deepEqual([novo.tv, novo.tela, novo.feitos.length, novo.comecouEm], ['', '', 0, 9000]);
});

test('retomar de onde parou: o passo guardado, o que ficou sem fazer antes dele, ou o fim', () => {
  const meio = P.concluir(P.concluir(P.concluir(P.inicial(1), 'negocio', { negocio: 'otica' }), 'marca'), 'tv', { tv: 'd' });
  assert.equal(P.passoParaRetomar(meio), 'tela');
  // Um progresso que pulou um passo sem registro (outra versão do painel): volta ao que falta.
  assert.equal(P.passoParaRetomar({ ...meio, feitos: ['negocio', 'tv'] }), 'marca');
  assert.equal(P.passoParaRetomar(P.terminar(meio, false, 2)), 'pronto');
  assert.equal(P.passoParaRetomar(null), 'negocio');
});

test('o progresso que chega é limpo: lixo vira o começo, nada passa do teto', () => {
  const e = P.normalizar({
    passo: 'hackear', feitos: ['negocio', 'negocio', 'x'], negocio: 'cassino', tv: 'a'.repeat(500),
    campos: { titulo: ' Pão ', __proto__x: 'x', 'Mau Nome': 'y', preco: 12, vazio: '' }, horario: { dias: [1, 9, 1, 'x'], inicio: '25:00', fim: '18:00', foraDoHorario: 'festa', preset: 'semana' },
    fim: { em: 'ontem' }, saiu: 'sim',
  });
  assert.equal(e.passo, 'negocio');
  assert.deepEqual(e.feitos, ['negocio']);
  assert.equal(e.negocio, '');
  assert.equal(e.tv.length, 60);
  assert.deepEqual(e.campos, { titulo: 'Pão' });
  assert.deepEqual(e.horario, { preset: 'semana', dias: [1], inicio: '08:00', fim: '18:00', foraDoHorario: 'relogio' }, 'fora do horário, o relógio');
  assert.equal(e.fim, null);
  assert.equal(e.saiu, true);
  assert.deepEqual(P.normalizar('lixo'), P.normalizar({}));
  assert.equal(P.normalizarHorario({ dias: [] }), null);
});

test('o negócio vira o ramo da Marca; "Outro" não mexe', () => {
  assert.equal(P.ramoDoNegocio('padaria'), 'padaria');
  assert.equal(P.ramoDoNegocio('restaurante'), 'comida');
  assert.equal(P.ramoDoNegocio('dentista'), 'saude');
  assert.equal(P.ramoDoNegocio('industria'), 'corporativo');
  assert.equal(P.ramoDoNegocio('outro'), '');
  assert.equal(P.ramoDoNegocio('x'), '');
  // Os onze do pedido do dono, e os ramos existem na Marca (js/paletas.js).
  assert.deepEqual(P.NEGOCIOS.map((n) => n.id), ['padaria', 'restaurante', 'lanchonete', 'otica', 'salao', 'farmacia', 'clinica', 'dentista', 'escritorio', 'industria', 'outro']);
  const ramos = require('../js/paletas.js').RAMOS.map((r) => r.id);
  for (const n of P.NEGOCIOS) if (n.ramo) assert.ok(ramos.includes(n.ramo), n.id + ': ramo ' + n.ramo);
});

/* ---------------- as telas do passo 4 ---------------- */

test('passo 4: três telas do negócio, com o manifesto de hoje; nada de outra frente', async () => {
  const L = await lib();
  const dados = await dadosDoManifesto();
  const aprovadas = new Set([...dados.modelos.keys()]);
  for (const n of L.NEGOCIOS) {
    for (const frente of n.frente ? [n.frente] : ['comercio', 'saude', 'empresa']) {
      const ops = L.opcoesDeTela(dados, n, frente, MARCA, 'deitada');
      assert.equal(ops.length, 3, n.id + '/' + frente + ': ' + ops.length + ' telas');
      for (const o of ops) {
        for (const [g, pecas] of Object.entries(o.montada.grupos)) {
          assert.ok(pecas.length <= 1, o.id + ': só a primeira peça de cada parte');
          for (const p of pecas) assert.ok(aprovadas.has(p.origem.base), o.id + ': ' + p.origem.base + ' (' + g + ') não está aprovada');
        }
        if (o.aprovada) assert.equal(require('../js/perfil.js').de(frente).id, frente);
      }
      // A clínica nunca estreia com óculos de sol (QA de 03/11, bloqueador B1).
      if (frente !== 'comercio') assert.ok(!ops.some((o) => o.id === 'otica-semana-do-sol'), n.id + ': tela da ótica na ' + frente);
    }
  }
  // A ótica tem tela aprovada: ela vem primeiro, sem o nome da empresa de exemplo.
  const otica = L.opcoesDeTela(dados, L.negocioPeloId('otica'), 'comercio', MARCA, 'deitada');
  assert.equal(otica[0].id, 'otica-semana-do-sol');
  assert.equal(otica[0].aprovada, true);
  assert.equal(otica[0].nome, 'Semana do Sol');
  // TV em pé: a tela montada é em pé.
  assert.equal(L.opcoesDeTela(dados, L.negocioPeloId('padaria'), 'comercio', MARCA, 'empe')[0].montada.layout, 'portrait-stack');
});

test('passo 4: a ordem é a da proximidade — o negócio, o ramo, a da frente, as montadas, e só então outro negócio', async () => {
  const L = await lib();
  const tela = (id, extra) => ({ id, nome: id, estado: 'aprovada', layout: 'corporate', zonas: { principal: { modo: 'escuro', pecas: [{ id: 'oferta-foto' }] } }, mensagens: [], ...extra });
  const manifesto = { marcas: [], telas: [
    tela('outra-frente', { perfil: 'saude', negocio: 'clinica', ramos: ['saude'] }),
    tela('outro-negocio', { perfil: 'comercio', negocio: 'otica', ramos: ['otica'], marca: 'otica' }),
    tela('da-frente', { perfil: 'comercio', marca: 'salao' }),
    tela('do-ramo', { perfil: 'comercio', negocio: 'lanchonete', ramos: ['comida'], marca: 'lanchonete' }),
    tela('do-negocio', { perfil: 'comercio', negocio: 'restaurante', ramos: ['comida'], marca: 'restaurante' }),
    tela('em-pe', { perfil: 'comercio', negocio: 'restaurante', ramos: ['comida'], layout: 'portrait-stack' }),
  ] };
  const dados = await dadosDoManifesto(manifesto);
  const restaurante = L.negocioPeloId('restaurante');
  assert.deepEqual(L.opcoesDeTela(dados, restaurante, 'comercio', MARCA, 'deitada', 9).map((o) => o.id),
    ['do-negocio', 'do-ramo', 'da-frente', 'montada:restaurante:cardapio-dia-foto', 'montada:restaurante:institucional-lancamento', 'montada:restaurante:cardapio-categorias', 'outro-negocio']);
  assert.deepEqual(L.opcoesDeTela(dados, restaurante, 'comercio', MARCA, 'empe').map((o) => o.id)[0], 'em-pe');
  assert.equal(L.proximidade(manifesto.telas[0], restaurante, 'comercio'), 9);
  // Voltar à tela escolhida depois de recarregar (a montada e a aprovada).
  assert.equal(L.opcaoPeloId('montada:restaurante:cardapio-categorias', dados, restaurante, 'comercio', MARCA).nome, 'Cardápio');
  assert.equal(L.opcaoPeloId('do-ramo', dados, restaurante, 'comercio', MARCA).id, 'do-ramo');
  assert.equal(L.opcaoPeloId('nao-existe', dados, restaurante, 'comercio', MARCA), null);
});

/* ---------------- passos 5 e 6: o que a TV recebe ---------------- */

test('passo 5: a foto e até três textos; o que sobra do exemplo sai da TV', async () => {
  const L = await lib();
  const dados = await dadosDoManifesto();
  const padaria = L.negocioPeloId('padaria');
  const [op] = L.opcoesDeTela(dados, padaria, 'comercio', MARCA, 'deitada');
  const c = L.camposQueImportam(op.montada, padaria, dados.modelos);
  assert.deepEqual(c.fotos, [{ nome: 'foto', rotulo: 'Ponha a foto do seu pão ou do seu café' }]);
  assert.deepEqual(c.textos.map((t) => [t.nome, t.rotulo]), [['titulo', 'Nome do produto'], ['preco', 'Preço'], ['quando', 'Quando']]);
  assert.ok(c.textos.every((t) => t.limite >= 12 && t.exemplo), 'o exemplo vira o "Ex.:" do campo');
  const com = L.aplicarCampos(op.montada, { foto: '/media/t/pao.jpg', titulo: 'Pão de queijo', preco: 'R$ 4,5' });
  const heroi = com.grupos.principal[0];
  assert.deepEqual([heroi.campos.foto, heroi.campos.titulo, heroi.campos.preco, heroi.campos.centavos], ['/media/t/pao.jpg', 'Pão de queijo', '4', ',50']);
  for (const k of ['titulo2', 'acompanha', 'kicker', 'quando']) {
    assert.equal(heroi.campos[k], '', k + ' do exemplo continua na TV');
    assert.ok(heroi.ocultos.includes(k));
  }
  assert.equal(op.montada.grupos.principal[0].campos.titulo, undefined, 'mexeu na tela recebida');
  // Sem o preço dela, o preço do exemplo também sai.
  const semPreco = L.aplicarCampos(op.montada, { titulo: 'Pão de queijo' }).grupos.principal[0];
  assert.equal(semPreco.campos.preco, '');
  assert.ok(semPreco.ocultos.includes('preco'));
  // Sem trocar o título, nada some.
  assert.equal(L.aplicarCampos(op.montada, {}).grupos.principal[0].ocultos, undefined);
  assert.deepEqual(L.dividirPreco('12'), ['12', ',00']);
  assert.deepEqual(L.dividirPreco('1.299,9'), ['1.299', ',90']);
});

test('passo 6: o horário vai para a lateral, o cabeçalho e o letreiro; a TV recebe o expediente', async () => {
  const L = await lib();
  const dados = await dadosDoManifesto();
  const clinica = L.negocioPeloId('clinica');
  const [op] = L.opcoesDeTela(dados, clinica, 'saude', MARCA, 'deitada');
  const semana = { preset: 'semana', dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00', foraDoHorario: 'relogio' };
  const t = L.aplicarHorario(op.montada, semana, 'saude');
  const lateral = t.grupos.lateral[0];
  assert.equal(lateral.origem.base, 'servico-horario');
  assert.deepEqual([lateral.campos.dia1, lateral.campos.hora1, lateral.campos.dia2, lateral.campos.hora2, lateral.campos.dia3], ['Segunda a sexta', '8h – 18h', 'Sábado e domingo', 'Fechado', '']);
  assert.ok(lateral.ocultos.includes('dia3') && lateral.ocultos.includes('nota'), 'a nota do exemplo ("Exames de sangue até as 10h") saiu');
  assert.equal(lateral.campos.titulo2, 'de atendimento', 'a lateral do refeitório da fábrica não vira a da clínica');
  const cab = t.grupos.cabecalho[0];
  assert.deepEqual([cab.campos.status, cab.campos.horario], ['Atendendo agora', 'Hoje até as 18h']);
  assert.deepEqual(t.mensagens, ['Atendimento de segunda a sexta, das 8h às 18h'], 'as frases de exemplo do letreiro saem');
  assert.equal(L.fraseDoHorario({ dias: [0, 1, 2, 3, 4, 5, 6], inicio: '00:00', fim: '00:00' }, 'comercio'), 'Aberto todos os dias, 24 horas');
  assert.equal(L.fraseDoHorario({ dias: [1, 3, 5], inicio: '07:30', fim: '12:00' }, 'empresa'), 'Expediente de segunda, quarta e sexta, das 7h30 às 12h');
  assert.deepEqual(L.expedienteDoHorario(semana), { alerta: true, dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00', foraDoHorario: 'relogio' });
  // Sem horário escolhido (o passo pulado): o mais comum, e fora dele o relógio.
  assert.equal(L.expedienteDoHorario(null).foraDoHorario, 'relogio');
  // A programação da TV: o layout da tela e as peças em cada parte.
  const cfg = L.configDaTela(t, 'Clínica Vida');
  assert.equal(cfg.settings.layoutId, 'corporate');
  assert.equal(cfg.zonas.lateral.items[0].origem.base, 'servico-horario');
  assert.deepEqual(cfg.zonas.rodape.messages, ['Atendimento de segunda a sexta, das 8h às 18h']);
});

test('o negócio da frente da conta vem primeiro; "Outro" no fim', async () => {
  const L = await lib();
  assert.deepEqual(L.negociosDaFrente('saude').map((n) => n.id).slice(0, 3), ['farmacia', 'clinica', 'dentista']);
  assert.equal(L.negociosDaFrente('empresa').slice(-1)[0].id, 'outro');
  assert.equal(L.frenteDe(L.negocioPeloId('outro'), 'empresa'), 'empresa');
  assert.equal(L.frenteDe(L.negocioPeloId('farmacia'), 'comercio'), 'saude');
  assert.equal(L.nomeParaOCliente('Ótica Central · Semana do Sol', { nomes: ['Ótica Central'] }), 'Semana do Sol');
  assert.equal(L.nomeParaOCliente('Padaria · TV deitada', { nomes: ['Padaria do Bairro'] }), 'Padaria · TV deitada');
});

/* ---------------- o painel ---------------- */

test('o painel: abre sozinho na conta nova, fica no Início, e cada passo tem um violeta só', () => {
  const app = ler('web/src/App.jsx');
  assert.match(app, /else if \(r\.abrir && rotaAtual\.current === 'overview'\) go\('primeiratv'\);/);
  assert.match(app, /if \(q\.get\('ir'\) === 'primeiratv'\) return \{ name: 'primeiratv' \};/, 'recarregar no meio do passo a passo volta a ele');
  assert.match(app, /<PrimeiraTvPage key=\{route\.deNovo \? 'de-novo' : 'continuar'\}/);
  const inicio = ler('web/src/pages/DashboardPage.jsx');
  assert.ok(inicio.indexOf('<CartaoPrimeiraTv') > 0 && inicio.indexOf('<CartaoPrimeiraTv') < inicio.indexOf('<PrimeirosPassos'));
  assert.match(ler('web/src/components/dashboard/CartaoPrimeiraTv.jsx'), /Montar a TV de novo/);
  // Um violeta por tela: só o rodapé do passo pinta o botão; nenhum passo tem um violeta próprio.
  const dir = path.join(RAIZ, 'web/src/components/primeira-tv');
  for (const f of fs.readdirSync(dir)) {
    const s = fs.readFileSync(path.join(dir, f), 'utf8');
    if (f === 'MolduraDoPasso.jsx') { assert.equal((s.match(/bg-accent px-6/g) || []).length, 1); continue; }
    assert.doesNotMatch(s, /variant="primary"|bg-accent text-accent-fg|bg-accent px-/, f + ' tem um violeta fora do rodapé');
  }
  // Os passos com botão principal: um por tela (cada `return` com no máximo um `principal:`).
  for (const f of ['PassoMarca.jsx', 'PassoTv.jsx', 'PassoFotos.jsx', 'PassoHorario.jsx', 'PassoPronto.jsx']) {
    for (const bloco of fs.readFileSync(path.join(dir, f), 'utf8').split(/\breturn \(/).slice(1)) {
      assert.ok((bloco.split(/\n {2}\}/)[0].match(/principal: \{/g) || []).length <= 1, f + ': dois botões violeta na mesma tela');
    }
  }
  // O quadro da foto é trocado pelo TrocarFoto (components/fotos) sem mexer em quem chama: as mesmas props.
  const foto = ler('web/src/components/primeira-tv/FotoDoPasso.jsx');
  assert.match(foto, /export function FotoDoPasso\(\{ papel, ramo, valor, onTrocar, formato = '16\/9', rotulo \}\)/);
  assert.match(ler('web/src/components/primeira-tv/PassoFotos.jsx'), /<FotoDoPasso key=\{f\.nome\} papel="destaque" ramo=\{neg && neg\.ramo\} formato="16\/9"/);
  // O pedido do membro diz que espera o dono.
  const pronto = ler('web/src/components/primeira-tv/PassoPronto.jsx');
  assert.match(pronto, /precisaAprovar \? 'Pedir para pôr na TV' : 'Pôr na TV'/);
  assert.match(pronto, /'Pedido mandado!'/);
  // O "Ligar a TV" é o de Telas: o mesmo endereço e o mesmo pedido.
  assert.match(ler('web/src/pages/ScreensPage.jsx'), /import \{ EnderecoDaTv \} from '\.\.\/components\/tela\/EnderecoDaTv\.jsx';/);
  assert.match(ler('web/src/components/primeira-tv/PassoTv.jsx'), /await devices\.pair\(code, '', extra\);/);
});

/* ---------------- servidor de verdade ---------------- */

const PORTA = 8700 + Math.floor(Math.random() * 90);
const BASE = 'http://127.0.0.1:' + PORTA;
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}), ...(o.headers || {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('servidor: o progresso guardado na conta, o negócio vira o ramo, e o fim pelo caminho de sempre (o dono põe, o membro pede)', async (t) => {
  const dadosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-primeira-tv-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dadosDir, MEDIA_DIR: dadosDir, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dadosDir, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const n = Date.now();
  const cadastro = (email, extra) => pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Pessoa', aceite: true, ...extra } });
  // O nome diz "Studio" (a Marca deduziria salão); a pessoa diz que é padaria.
  const dono = cookieDe(await cadastro('dono' + n + '@teste.local', { name: 'Studio Pão Sol', perfil: 'comercio' }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono, json: { plan: 'pro' } })).status, 200);
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'equipe' + n + '@teste.local', role: 'member' } });
  const membro = cookieDe(await cadastro('equipe' + n + '@teste.local', { inviteCode: convite.json.code, name: 'Equipe' }));

  /* ---- conta nova: abre sozinho para o dono; o membro chega pelo Início ---- */
  const g0 = (await pedir('/api/primeira-tv', { cookie: dono })).json;
  assert.deepEqual([g0.abrir, g0.nova, g0.comecou, g0.estado.passo], [true, true, false, 'negocio']);
  assert.equal((await pedir('/api/primeira-tv', { cookie: membro })).json.abrir, false);
  assert.equal((await pedir('/api/primeira-tv')).status, 401);
  assert.equal((await pedir('/api/brand', { cookie: dono })).json.ramo, 'beleza', 'antes da escolha, o ramo deduzido do nome');

  /* ---- o progresso: limpo, guardado na conta, e o negócio vira o ramo ---- */
  const passo1 = P.concluir(P.inicial(n), 'negocio', { negocio: 'padaria' });
  const put = await pedir('/api/primeira-tv', { method: 'PUT', cookie: dono, json: { estado: { ...passo1, lixo: 'x', campos: { 'Mau Nome': 'y' } } } });
  assert.equal(put.status, 200);
  assert.equal(put.json.estado.lixo, undefined);
  assert.deepEqual(put.json.estado.campos, {});
  const g1 = (await pedir('/api/primeira-tv', { cookie: dono })).json;
  assert.deepEqual([g1.comecou, g1.estado.passo, g1.estado.negocio], [true, 'marca', 'padaria'], 'o progresso não voltou igual');
  assert.equal((await pedir('/api/brand', { cookie: dono })).json.ramo, 'padaria', 'o negócio escolhido não virou o ramo da conta');
  // O membro passa pelos passos, mas não troca o negócio da conta.
  await pedir('/api/primeira-tv', { method: 'PUT', cookie: membro, json: { estado: { ...g1.estado, negocio: 'industria', passo: 'tv' } } });
  const g2 = (await pedir('/api/primeira-tv', { cookie: dono })).json;
  assert.deepEqual([g2.estado.negocio, g2.estado.passo], ['padaria', 'tv']);
  assert.equal((await pedir('/api/primeira-tv', { method: 'PUT', cookie: dono, json: [] })).status, 400);
  // Saiu no meio: não abre sozinho de novo.
  await pedir('/api/primeira-tv', { method: 'PUT', cookie: dono, json: { estado: { ...g2.estado, saiu: true } } });
  assert.equal((await pedir('/api/primeira-tv', { cookie: dono })).json.abrir, false);

  /* ---- a TV, e o fim pelo caminho do painel (lib/primeiraTv.js, porNaTv) ---- */
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: tv.code, nova: true } })).status < 300);
  const L = await lib();
  const dados = await dadosDoManifesto();
  const padaria = L.negocioPeloId('padaria');
  const [op] = L.opcoesDeTela(dados, padaria, 'comercio', MARCA, 'deitada');
  const montada = L.aplicarCampos(op.montada, { titulo: 'Pão de queijo', preco: '4,50' });
  const horario = { preset: 'comercio', dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '20:00', foraDoHorario: 'relogio' };
  // O painel fala com o servidor de verdade: o fetch do api.js vai para a porta de teste, com o cookie de quem está.
  let quem = dono;
  const fetchAntes = globalThis.fetch;
  globalThis.fetch = (url, op2 = {}) => fetchAntes(BASE + url, { ...op2, headers: { ...(op2.headers || {}), Cookie: quem } });
  t.after(() => { globalThis.fetch = fetchAntes; });
  const naTv = async () => (await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } })).json;

  const r = await L.porNaTv({ tv: { id: tv.id, name: 'TV 1' }, montada, horario, frente: 'comercio' });
  assert.equal(r.pendente, false);
  assert.ok(r.lote, 'o envio do dono não foi pelo lote (sem Desfazer)');
  const cfg = await naTv();
  assert.equal(cfg.settings.layoutId, 'corporate');
  assert.equal(cfg.zonas.principal.items[0].campos.titulo, 'Pão de queijo', 'a TV não recebeu o texto do passo 5');
  assert.equal(cfg.zonas.principal.items[0].campos.centavos, ',50');
  assert.deepEqual(cfg.zonas.rodape.messages, ['Aberto de segunda a sábado, das 7h às 20h']);
  assert.deepEqual([cfg.settings.expediente.foraDoHorario, cfg.settings.expediente.inicio, cfg.settings.expediente.fim], ['relogio', '07:00', '20:00'], 'o horário não chegou à TV');

  // A aprovação ligada: o membro PEDE, e a TV continua como estava até o dono aprovar.
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono, json: { ligada: true } })).json.ligada, true);
  quem = membro;
  const pedido = await L.porNaTv({ tv: { id: tv.id, name: 'TV 1' }, montada: L.aplicarCampos(op.montada, { titulo: 'Bolo de cenoura' }), horario, frente: 'comercio' });
  assert.equal(pedido.pendente, true, 'o envio do membro com aprovação não virou pedido');
  assert.match(pedido.mensagem, /aprovação/);
  assert.equal((await naTv()).zonas.principal.items[0].campos.titulo, 'Pão de queijo', 'foi para a TV sem aprovação');
  const fila = (await pedir('/api/aprovacoes', { cookie: dono })).json.pendentes;
  assert.equal(fila.length, 1);
  assert.equal(fila[0].descricao, 'Tela pronta: ' + op.nome);
  assert.equal((await pedir('/api/aprovacoes/' + fila[0].id + '/aprovar', { method: 'POST', cookie: dono })).status, 200);
  assert.equal((await naTv()).zonas.principal.items[0].campos.titulo, 'Bolo de cenoura', 'aprovado, não foi para a TV');

  /* ---- terminado: não abre sozinho; e a conta com TV no ar não é "nova" ---- */
  quem = dono;
  await pedir('/api/primeira-tv', { method: 'PUT', cookie: dono, json: { estado: P.terminar(g2.estado, false, Date.now()) } });
  const g3 = (await pedir('/api/primeira-tv', { cookie: dono })).json;
  assert.deepEqual([g3.abrir, g3.nova, !!g3.estado.fim], [false, false, true]);
});
