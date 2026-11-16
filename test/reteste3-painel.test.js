/*
 * Reteste 3 (12 a 14/11): o lado do painel. O que ele achou e foi
 * corrigido aqui — o nome da TV cortado pelo selo do grupo, os selos
 * "1 de 3" por cima da TV, o "Pôr na TV" da gerente que vira pedido, o
 * padrão de fora do horário, o exemplo de outro negócio com a foto da conta
 * (e a Saúde com preço no "Adicionar") e a acessibilidade que sobrou
 * (Equipe, Plataforma e as tabelas da Privacidade).
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
const importar = (f) => import(pathToFileURL(path.join(RAIZ, f)).href);
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/* ---------- 5. Telas: o nome da TV sempre inteiro ---------- */

test('Telas: o selo do grupo não corta o nome da TV ("TV 23 · Corredor" virava "TV 2…")', () => {
  const s = semComentarios(ler('web/src/pages/ScreensPage.jsx'));
  const cartao = s.slice(s.indexOf('function FleetCard('), s.indexOf('function OpcaoDaTela('));
  assert.match(cartao, /<div className="flex min-w-0 flex-wrap items-center gap-x-1\.5 gap-y-1">/, 'o grupo não desce quando não cabe');
  assert.match(cartao, /<span className="min-w-0 break-words text-base font-semibold text-ink">\{d\.name \|\| 'Tela sem nome'\}<\/span>/);
  assert.doesNotMatch(cartao, /truncate text-base font-semibold/, 'o nome voltou a cortar');
  const grupo = /\{d\.grupo && <span className="([^"]+)"[^>]*>\{d\.grupo\}<\/span>\}/.exec(cartao);
  assert.ok(grupo, 'sumiu o selo do grupo');
  assert.doesNotMatch(grupo[1], /shrink-0/, 'o grupo `shrink-0` empurra o nome para o "…"');
  assert.match(grupo[1], /\btruncate\b/, 'quem corta, se precisar, é o grupo');
});

/* ---------- 6. Prévias: os selos fora da TV, e o botão que diz o que vai acontecer ---------- */

test('as prévias: "peça 2 de 6" embaixo da TV, com o nome da parte, e não por cima da imagem', async () => {
  const q = semComentarios(ler('web/src/components/tela/TvAoVivo.jsx'));
  assert.doesNotMatch(q, /\{posicao\} de \{total\}/, 'o selo por cima da TV voltou');
  assert.doesNotMatch(q, /translate\(-100%, -100%\)/);
  // A linha fica DEPOIS do quadro (fora do role="img"), e só onde há espaço.
  const quadro = q.indexOf('role="img"');
  const linha = q.indexOf('{escala > 0 && contagem && contagens.length > 0 && (');
  assert.ok(quadro > 0 && linha > quadro, 'a contagem não está embaixo da TV');
  assert.match(q, /\{c\.nome\}: peça \{c\.posicao\} de \{c\.total\}/);
  assert.match(ler('web/src/components/tela/MiniaturaDaTela.jsx'), /contagem=\{altura > 240\}/, 'no cartão de Telas a TV enche a caixa: a linha não cabe');

  const L = require('../js/templates.js');
  const T = await importar('web/src/lib/tela.js');
  const corp = L.getLayout('corporate');
  const partes = corp.zones.map((z) => ({ id: z.id }));
  const cfg = { zonas: { principal: { items: [{}, {}, {}] }, lateral: { items: [{}] } } };
  // Na página da TV: a peça escolhida.
  assert.deepEqual(T.contagensDasPartes(partes, corp, cfg, { zona: 'principal', indice: 1 }, {}),
    [{ id: 'principal', nome: 'Meio', posicao: 2, total: 3 }]);
  // No "Ver agora": o que a TV contou. Parte com uma peça só não ganha contagem.
  assert.deepEqual(T.contagensDasPartes(partes, corp, cfg, null, { principal: { posicao: 3, total: 3 }, lateral: { posicao: 1, total: 4 }, cabecalho: { posicao: 1, total: 1 } }),
    [{ id: 'principal', nome: 'Meio', posicao: 3, total: 3 }, { id: 'lateral', nome: 'Lado', posicao: 1, total: 4 }]);
  assert.deepEqual(T.contagensDasPartes([], corp, cfg, null, {}), []);
});

test('"Pôr na TV" da gerente com a aprovação ligada: o botão diz "Pedir aprovação"', async () => {
  const A = await importar('web/src/lib/aprovacao.js');
  assert.equal(A.pedeAprovacao({ ligada: true, souRevisor: false, n: 0 }), true, 'membro com a aprovação ligada');
  assert.equal(A.pedeAprovacao({ ligada: true, souRevisor: true, n: 2 }), false, 'o dono e o admin aprovam, não pedem');
  assert.equal(A.pedeAprovacao({ ligada: false, souRevisor: false }), false);
  assert.equal(A.pedeAprovacao(null), false, 'sem resposta, o "Pôr na TV" de sempre');
  const a = ler('web/src/lib/aprovacao.js');
  assert.match(a, /aprovacoes\.contagem\(\)/, 'a regra é a do servidor, lida pela contagem do sino');
  assert.match(a, /window\.addEventListener\('mt:aprovacao', virouPedido\)/, 'o 202 do servidor também vira "Pedir aprovação"');
  assert.match(a, /window\.addEventListener\('mt:aprovacoes-mudou', ler\)/);

  const e = semComentarios(ler('web/src/pages/ContentEditorPage.jsx'));
  assert.match(e, /const vaiPedir = usePedeAprovacao\(\) \|\| !!meuPedido;/);
  assert.match(e, /\{publishing \? \(vaiPedir \? 'Pedindo aprovação…' : 'Pondo na TV…'\) : \(vaiPedir \? 'Pedir aprovação' : 'Pôr na TV'\)\}/);
  assert.match(e, /vaiPedir \? 'Rascunho · vai para o dono aprovar' : 'Rascunho · ainda não está na TV'/);
  const p = semComentarios(ler('web/src/components/tela/PorNaTV.jsx'));
  assert.match(p, /const vaiPedir = usePedeAprovacao\(\) \|\| comPedido\.length > 0;/);
  assert.match(p, /\{enviando \? \(vaiPedir \? 'Pedindo aprovação…' : 'Pondo na TV…'\) : \(vaiPedir \? 'Pedir aprovação' : 'Pôr na TV'\)\}/);
  assert.match(p, /O dono da conta aprova antes de ir para a TV\./);
});

/* ---------- 7b. Fora do horário ---------- */

test('fora do horário: o formulário sugere o relógio só para a TV que nunca salvou horário', async () => {
  const H = await importar('web/src/lib/horarioDaTela.js');
  assert.equal(H.HORARIO_PADRAO.foraDoHorario, 'relogio');
  assert.equal(H.FORA_DO_HORARIO[0][0], 'relogio', 'o recomendado primeiro');
  assert.match(H.FORA_DO_HORARIO[0][2]('loja'), /^Recomendado\. .*quando a loja abre\.$/);
  for (const [, rotulo, porque] of H.FORA_DO_HORARIO) assert.ok(rotulo && porque('clínica').length > 10, rotulo + ' sem o porquê');
  // Nunca salvou: o padrão novo, e o recado de que hoje ela mostra o tempo todo.
  const PADRAO_DA_LISTA = { alerta: true, dias: [1, 2, 3, 4, 5, 6], inicio: '07:00', fim: '22:00', fuso: 'America/Sao_Paulo', foraDoHorario: 'ligada' };
  const nova = H.horarioParaEditar({ expediente: PADRAO_DA_LISTA, horarioSalvo: false });
  assert.equal(nova.foraDoHorario, 'relogio');
  assert.equal(nova.semHorario, true);
  // Já salvou "continua mostrando": abre com a escolha dela, sem mudar nada.
  const salva = H.horarioParaEditar({ expediente: { ...PADRAO_DA_LISTA, inicio: '08:00' }, horarioSalvo: true });
  assert.equal(salva.foraDoHorario, 'ligada');
  assert.equal(salva.inicio, '08:00');
  assert.equal(salva.semHorario, undefined);
  // Lista sem o campo (servidor antigo): vale o que o servidor mandou.
  assert.equal(H.horarioParaEditar({ expediente: PADRAO_DA_LISTA }).foraDoHorario, 'ligada');
  assert.equal(H.horarioParaEditar(null).foraDoHorario, 'relogio');
  // A TV não muda sozinha: sem escolha salva, ela continua mostrando (js/expediente.js).
  const E = require('../js/expediente.js');
  assert.equal(E.normalizar({ dias: [1], inicio: '07:00', fim: '22:00' }).foraDoHorario, 'ligada');
  assert.equal(E.estadoDaTela(Date.parse('2026-11-12T03:00:00-03:00'), null), 'normal');
  // Os dois formulários (Telas e os Ajustes da TV) abrem pelo mesmo caminho, e o recado aparece.
  assert.match(ler('web/src/pages/ScreensPage.jsx'), /setExp\(target \? horarioParaEditar\(target\) : null\);/);
  assert.match(ler('web/src/components/content/SettingsForm.jsx'), /React\.useState\(\(\) => horarioParaEditar\(device\)\)/);
  assert.match(ler('web/src/components/tela/HorarioDaTela.jsx'), /\{exp\.semHorario && \(/);
  assert.match(ler('server/routes/telas.js'), /horarioSalvo: !!d\.expediente,/);
});

/* ---------- 8. Exemplos que combinam com o negócio ---------- */

async function modelos() {
  globalThis.MTPecaHtml = require('../js/peca-html.js');
  globalThis.MTPecaRender = require('../js/peca-render.js');
  const M = await importar('web/src/lib/modelosOuro.js');
  const man = JSON.parse(ler('pecas-ouro/manifesto.json'));
  const modelo = (id) => {
    const p = man.pecas.find((x) => x.id === id);
    return { ...p, arq: globalThis.MTPecaHtml.doArquivo(ler('pecas-ouro/' + id + '.html')) };
  };
  return { M, modelo, R: globalThis.MTPecaRender };
}

test('o exemplo de outro negócio vem com a foto DAQUELE negócio: nada de "Óculos de sol" em cima de um pão', async () => {
  const { M, modelo, R } = await modelos();
  const oculos = modelo('oferta-foto');
  const padaria = { nome: 'Padaria Sol', ramo: 'padaria' };
  const naPadaria = M.itemDoModelo(oculos, padaria, 'comercio');
  const sol = R.fotoPadrao('produto', 'otica', 'comercio');
  assert.deepEqual(naPadaria.campos.foto, { src: sol.arquivo, foco: sol.foco }, 'o texto da ótica com a foto da ótica');
  assert.ok(!/padaria/.test(naPadaria.campos.foto.src), 'o pão voltou para baixo dos óculos');
  assert.equal(naPadaria.espacos.foto.papel, 'produto');
  // A foto passa pela porta como a do "Trocar foto": o arquivo em campos, o foco ao lado.
  const v = globalThis.MTPecaHtml.validarItem(naPadaria);
  assert.ok(v.ok, JSON.stringify(v.problemas));
  assert.equal(v.item.campos.foto, sol.arquivo);
  assert.deepEqual(v.item.espacos.foto.foco, sol.foco);

  // Na ótica, o exemplo é dela: o espaço fica vazio e a TV põe a foto do ramo da conta, como antes.
  assert.equal(M.itemDoModelo(oculos, { nome: 'Ótica Lux', ramo: 'otica' }, 'comercio').campos.foto, undefined);
  // E o contrário: o prato do dia da padaria, na ótica, leva o prato (não os óculos).
  const prato = M.itemDoModelo(modelo('cardapio-dia-foto'), { nome: 'Ótica Lux', ramo: 'otica' }, 'comercio');
  assert.equal(prato.campos.foto.src, R.fotoPadrao('produto', 'padaria', 'comercio').arquivo);
  assert.equal(M.itemDoModelo(modelo('cardapio-dia-foto'), padaria, 'comercio').campos.foto, undefined);
  // Ramo que a Marca não conhece: o exemplo é de outro negócio, e a foto o acompanha.
  assert.equal(M.itemDoModelo(oculos, { nome: 'Pet Feliz', ramo: 'pet' }, 'comercio').campos.foto.src, sol.arquivo);
  // Texto escrito para a frente da conta por uma marca de outra frente: o texto é da conta, e a foto também.
  assert.equal(M.negocioDoTexto(modelo('cardapio-dia-foto'), 'corporativo', 'empresa'), '', 'textos.empresa da padaria: a foto é a da empresa');
  assert.equal(M.negocioDoTexto(oculos, 'padaria', 'comercio'), 'otica');
  assert.equal(M.negocioDoTexto(oculos, 'otica', 'comercio'), '');
  // Pessoa nunca: um rosto de banco no lugar de alguém.
  assert.deepEqual(M.fotosDoExemplo({ foto: { papel: 'pessoa' } }, 'otica', {}), {});
  // A foto que a pessoa já tem não é trocada.
  assert.deepEqual(M.fotosDoExemplo({ foto: { papel: 'produto' } }, 'otica', { foto: '/media/t1/minha.jpg' }), {});
  // Quem troca o texto por inteiro (aviso, Agenda, planilha, telas prontas) não leva a foto do exemplo.
  for (const f of ['web/src/lib/aviso.js', 'web/src/lib/calendario.js', 'web/src/pages/PlanilhasPage.jsx', 'web/src/lib/telasProntas.js']) {
    assert.doesNotMatch(semComentarios(ler(f)), /campos = \{ \.\.\.base\.campos/, f + ' levaria a foto do exemplo junto com o texto da pessoa');
  }
});

test('Saúde no "Adicionar": sem Promoção e sem Tabela de preços, e nenhum exemplo com preço ou oferta', async () => {
  // contentTypes.js importa os ícones do React; como no teste da fase 1, os imports viram um esboço.
  const fonte = ler('web/src/lib/contentTypes.js').replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*$/gm, (m) => {
    const nomes = ((m.match(/\{([^}]*)\}/) || [, ''])[1]).split(',').map((x) => x.trim().split(' as ').pop()).filter(Boolean);
    return nomes.length ? 'const {' + nomes.join(',') + '} = ESBOCO;' : '';
  });
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-tipos-r3-'));
  const arq = path.join(pasta, 'tipos.mjs');
  fs.writeFileSync(arq, 'const ESBOCO = new Proxy({}, { get: () => (() => null) });\n' + fonte);
  const T = await import(pathToFileURL(arq).href);
  fs.rmSync(pasta, { recursive: true, force: true });
  const todos = (f) => { const c = T.catalogoDaFrente(f); return c.principais.concat(c.avancados); };
  for (const t of ['promo', 'precos']) {
    assert.ok(!todos('saude').includes(t), 'a Saúde ainda oferece ' + t);
    assert.ok(todos('comercio').includes(t), 'o Comércio perdeu ' + t);
  }
  const PRECO = /R\$|\b\d+,\d{2}\b|%|desconto|condição especial|gr[aá]tis|promo[cç]|oferta/i;
  for (const tipo of Object.keys(T.CONTENT_TYPES)) {
    if (!T.tipoNaFrente(tipo, 'saude')) continue;
    const it = T.novoItem(tipo, 'saude');
    if (it && it.meta && it.meta.exemplo) assert.doesNotMatch(JSON.stringify(it), PRECO, tipo + ': exemplo da Saúde com preço ou oferta');
  }
  // O preço do exemplo do Comércio diz que é preço.
  const promo = T.novoItem('promo', 'comercio');
  assert.equal(promo.precoPor, 'R$ 34,90');
  assert.equal(promo.precoDe, 'R$ 42,00');
});

/* ---------- 9. Acessibilidade ---------- */

test('Equipe: o papel de cada membro tem nome; a tabela que rola entra no Tab; a Privacidade também', () => {
  const t = ler('web/src/pages/TeamPage.jsx');
  assert.match(t, /<Select value=\{m\.role\}[\s\S]{0,200}?aria-label=\{'Papel de ' \+ \(m\.name \|\| m\.email\)\}>/, 'o select do papel sem nome (axe: select-name, crítico)');
  const tab = ler('web/src/components/ui/Table.jsx');
  assert.match(tab, /setRola\(el\.scrollWidth > el\.clientWidth \+ 1\)/);
  assert.match(tab, /rola \? \{ tabIndex: 0, role: 'region', 'aria-label': rotulo \+ ' \(role para o lado para ver tudo\)' \} : \{\}/);
  assert.match(ler('web/src/components/platform/Negocio.jsx'), /<Table rotulo="Frota">/);
  // As três tabelas da Privacidade numa caixa que rola e entra no Tab; a tabela não rola sozinha.
  const L = require('../server/legal.js');
  const h = L.privacidadeHtml({});
  const caixas = h.match(/<div class="rolar" role="region" tabindex="0" aria-label="[^"]+">\n<table>/g) || [];
  assert.equal(caixas.length, (h.match(/<table>/g) || []).length, 'tabela fora da caixa que entra no Tab');
  assert.equal(caixas.length, 3);
  const css = ler('server/legal.js');
  assert.match(css, /\.rolar \{ overflow-x: auto;/);
  assert.doesNotMatch(css, /table \{[^}]*display: block; overflow-x: auto;/, 'a tabela voltou a rolar sem foco');
});

/* ---------- servidor de verdade: a lista diz se o horário foi salvo, e a contagem diz quem pede ---------- */

const PORTA = 8700 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.json ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; } resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) }); });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.json) req.write(JSON.stringify(o.json));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('servidor: horarioSalvo na lista de TVs, e "Pedir aprovação" só para o membro com a aprovação ligada', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-reteste3-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const H = await importar('web/src/lib/horarioDaTela.js');
  const A = await importar('web/src/lib/aprovacao.js');
  const n = Date.now();
  const cadastro = (email, extra) => pedir('/api/auth/signup', { method: 'POST', json: { email, password: 'senha-de-teste-123', name: 'Pessoa', aceite: true, ...extra } });
  const dono = cookieDe(await cadastro('dono' + n + '@teste.local', { name: 'Padaria Reteste', perfil: 'comercio' }));
  assert.equal((await pedir('/api/billing/dev-activate', { method: 'POST', cookie: dono, json: { plan: 'pro' } })).status, 200);
  const convite = await pedir('/api/team/invites', { method: 'POST', cookie: dono, json: { email: 'gerente' + n + '@teste.local', role: 'member' } });
  assert.equal(convite.status, 201);
  const gerente = cookieDe(await cadastro('gerente' + n + '@teste.local', { inviteCode: convite.json.code, name: 'Gerente' }));

  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: tv.code, nova: true } })).status < 300);
  const daLista = async () => (await pedir('/api/devices', { cookie: dono })).json.devices.find((d) => d.id === tv.id);

  // Nunca salvou: a lista diz, e o formulário abre com o relógio.
  const antes = await daLista();
  assert.equal(antes.horarioSalvo, false);
  assert.equal(antes.expediente.foraDoHorario, 'ligada', 'a lista segue mandando o horário normalizado');
  assert.equal(H.horarioParaEditar(antes).foraDoHorario, 'relogio');
  // Salvou "continua mostrando": a escolha fica, e o formulário a respeita.
  const salvar = await pedir('/api/devices/' + tv.id + '/expediente', { method: 'POST', cookie: dono, json: { ...H.horarioParaEditar(antes), foraDoHorario: 'ligada' } });
  assert.equal(salvar.status, 200);
  assert.equal(salvar.json.expediente.semHorario, undefined, 'o recado do formulário foi parar no banco');
  const depois = await daLista();
  assert.equal(depois.horarioSalvo, true);
  assert.equal(H.horarioParaEditar(depois).foraDoHorario, 'ligada');

  // A aprovação: desligada, ninguém pede; ligada, só a gerente (membro).
  const pede = async (cookie) => A.pedeAprovacao((await pedir('/api/aprovacoes/contagem', { cookie })).json);
  assert.equal(await pede(gerente), false);
  assert.equal((await pedir('/api/aprovacoes/regra', { method: 'PUT', cookie: dono, json: { ligada: true } })).json.ligada, true);
  assert.equal(await pede(gerente), true, 'a gerente com a aprovação ligada não vê "Pedir aprovação"');
  assert.equal(await pede(dono), false, 'o dono não pede a si mesmo');
});
