/*
 * O gerador do ecossistema (docs/EXECUTOR.md, item 23).
 *
 * O dono: "a IA gera o ecossistema inteiro — imagens, programação, diversas
 * telas — ou só o que ele pedir". O que estes testes seguram:
 *   - o escopo vira EXATAMENTE as peças pedidas, zona por zona, TV por TV;
 *   - a foto segue a escolha do cliente, e só onde ela aparece;
 *   - toda peça passa pela porta da TV, inclusive a de reserva;
 *   - os horários viram o agendamento que o player entende;
 *   - a campanha sai salva, sem a pessoa apertar nada, e não vaza entre contas.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const P = require('../js/peca-html.js');
const E = require('../js/escopo.js');
const ai = require('../server/ai.js');
const motores = require('../server/motores.js');
const eco = require('../server/ecossistema.js');

const RAIZ = path.join(__dirname, '..');
const TELAS = [{ id: 'dev_balcao1', nome: 'TV do balcão', layout: 'corporate' }, { id: 'dev_vitrine', nome: 'Vitrine', layout: 'portrait-hero', emPe: true }];
const AGORA = new Date('2026-10-21T12:00:00');

const ESCOPO = () => ({
  nome: 'Semana do pão de queijo', objetivo: 'vender mais pão de queijo à tarde', imagens: 'gerar',
  periodo: { inicio: '2026-10-21', fim: '2026-10-27' },
  telas: [
    {
      alvo: { tipo: 'tela', id: 'dev_balcao1' }, nome: 'TV do balcão',
      zonas: {
        principal: { pecas: 3, pedido: 'pão de queijo saindo do forno' },
        lateral: { pecas: 2, pedido: 'promoção da tarde' },
        cabecalho: { pecas: 2, vivos: ['relogio', 'clima'] },
        rodape: { pecas: 1, mensagens: ['Pão de queijo em dobro das 15h às 17h'], contagem: '2026-10-27T18:00' },
      },
    },
    { alvo: { tipo: 'tela', id: 'dev_vitrine' }, zonas: { principal: { pecas: 1 }, lateral: { pecas: 1 }, cabecalho: { pecas: 1 }, rodape: { pecas: 1 } } },
  ],
  redes: { instagramPost: true, instagramStory: true, whatsappMensagem: true },
  horarios: [{ faixa: 'manha', foco: 'café' }, { inicio: '15:00', fim: '17:00', foco: 'pão de queijo' }, { faixa: 'saida' }],
});

function modo(t, provedor) {
  const antes = process.env.AI_PROVIDER;
  process.env.AI_PROVIDER = provedor;
  t.after(() => { if (antes === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = antes; });
}

test('as vagas: exatamente o que o escopo pede, com o papel e o formato da zona', () => {
  const v = eco.vagasDoEscopo(ESCOPO(), TELAS);
  assert.equal(v.length, 12);
  assert.equal(v.length, E.custo(ESCOPO()).pecas, 'o cartão e o gerador contam igual');
  const da = (tela, zona) => v.filter((x) => x.tela === tela && x.zona === zona);
  assert.equal(da(0, 'principal').length, 3);
  assert.equal(da(0, 'cabecalho').length, 2);
  assert.deepEqual([...new Set(da(0, 'principal').map((x) => x.formato))], ['16/9']);
  assert.equal(da(1, 'principal')[0].formato, '9/16', 'na TV em pé, a principal é em pé');
  assert.equal(da(0, 'lateral')[0].papel, 'lateral');
  assert.equal(da(0, 'rodape')[0].papel, 'rodape');
  assert.equal(da(0, 'principal')[0].pedido, 'pão de queijo saindo do forno');
  assert.deepEqual(eco.vagasDoEscopo({ redes: { google: true } }, []).map((x) => [x.zona, x.formato]), [['redes', '1/1']], 'só redes: uma peça para elas');
  assert.deepEqual(eco.vagasDoEscopo({}, []), []);
});

test('a foto segue a escolha do cliente, e só onde ela aparece', () => {
  const bases = [{ url: '/media/t/loja.jpg' }, { url: '/media/t/pao.jpg' }];
  const p = { zona: 'principal' }, cab = { zona: 'cabecalho' };
  const t = (o) => ({ titulo: 'Pão', descricaoFoto: 'pão saindo do forno', foto: 'gerar', base: null, ...o });
  assert.deepEqual(eco.decidirFoto(cab, t(), 'gerar', bases, 0), { tipo: 'nenhuma' }, 'faixa fina não leva foto');
  assert.deepEqual(eco.decidirFoto(p, t(), 'nenhuma', bases, 0), { tipo: 'nenhuma' });
  assert.deepEqual(eco.decidirFoto(p, t({ base: 1 }), 'gerar', bases, 0), { tipo: 'gerar', descricao: 'pão saindo do forno' }, '"a IA gera" gera mesmo com acervo');
  assert.deepEqual(eco.decidirFoto(p, t({ foto: 'minha', base: 1 }), 'mistura', bases, 0), { tipo: 'minha', url: '/media/t/pao.jpg' });
  assert.equal(eco.decidirFoto(p, t(), 'mistura', bases, 0).tipo, 'gerar', 'mistura: gera onde a da empresa não serve');
  assert.deepEqual(eco.decidirFoto(p, t({ foto: 'gerar' }), 'minhas', bases, 3), { tipo: 'minha', url: '/media/t/pao.jpg' }, '"só as minhas" nunca gera');
  assert.equal(eco.decidirFoto(p, t(), 'minhas', [], 0).porque, 'a empresa ainda não tem fotos no acervo');
});

test('os horários viram o agendamento do player', () => {
  const hoje = new Date('2026-10-21T12:00:00');
  assert.deepEqual(eco.agendamentoDe({ faixa: 'manha' }, { inicio: '', fim: '2026-10-27' }, hoje),
    { ativo: true, dataInicio: '2026-10-21', dataFim: '2026-10-27', dias: [], horaInicio: '06:00', horaFim: '11:29' });
  assert.equal(eco.agendamentoDe({ inicio: '15:00', fim: '17:00' }, {}, hoje).horaInicio, '15:00');
  assert.equal(eco.agendamentoDe({ faixa: 'dia' }, {}, hoje), null, 'o dia todo e sem prazo: nada a agendar');
  assert.equal(eco.agendamentoDe(null, { fim: '2026-10-27' }, hoje).dataFim, '2026-10-27', 'só o prazo também vale');
});

test('modo demonstração: 2 TVs × 4 zonas + redes + 3 horários, tudo pronto para a TV', async (t) => {
  modo(t, 'dev');
  const pedidas = [];
  const etapas = [];
  const r = await eco.gerar(ESCOPO(), { empresa: 'Padaria do Bairro', telas: TELAS, marca: { cores: ['#8a4b16', '#f2c14e'], logo: '/media/t/logo.png' } }, {
    onImagem: async (prompt, formato, arte) => { pedidas.push({ prompt, formato, arte }); return '/media/t/gerada-' + pedidas.length + '.png'; },
    onProgresso: (e) => etapas.push(e), agora: AGORA,
  });
  assert.equal(r.nome, 'Semana do pão de queijo');
  assert.equal(pedidas.length, E.custo(ESCOPO()).fotos, 'gerou exatamente as fotos que o cartão prometeu');
  assert.equal(pedidas[0].arte.brand, '#8a4b16', 'a cor da marca chega à foto');
  assert.equal(r.contagem.fotosGeradas, pedidas.length);
  assert.deepEqual(r.semFoto, []);
  assert.ok(etapas.includes('gerando as fotos') && etapas.includes('desenhando as peças'));

  const [balcao, vitrine] = r.telas;
  assert.deepEqual(balcao.alvo, { tipo: 'tela', id: 'dev_balcao1' });
  assert.equal(balcao.zonas.principal.length, 3);
  assert.equal(balcao.zonas.lateral.length, 2);
  assert.equal(balcao.zonas.cabecalho.pecas.length, 2);
  assert.deepEqual(balcao.zonas.cabecalho.vivos, ['relogio', 'clima']);
  assert.equal(balcao.zonas.rodape.pecas.length, 1);
  assert.deepEqual(balcao.zonas.rodape.mensagens, ['Pão de queijo em dobro das 15h às 17h'], 'o letreiro que o cliente escreveu, sem mudar');
  assert.equal(balcao.zonas.rodape.contagem, '2026-10-27T18:00');
  assert.equal(vitrine.zonas.principal[0].formato, '9/16');

  const todas = r.telas.flatMap((x) => [...x.zonas.principal, ...x.zonas.lateral, ...x.zonas.cabecalho.pecas, ...x.zonas.rodape.pecas]);
  assert.equal(todas.length, 12);
  for (const p of todas) {
    assert.deepEqual(P.validarItem(p.item).problemas, [], p.vaga + ' não passa pela porta da TV');
    assert.doesNotMatch(JSON.stringify(p.item.campos), /Ótica|Central/, p.vaga + ': texto de exemplo de outro negócio');
  }
  assert.ok(balcao.zonas.principal.every((p) => p.comFoto && p.item.campos.foto), 'a principal com foto');
  assert.ok(balcao.zonas.lateral.every((p) => p.comFoto && p.item.campos.foto), 'a lateral com foto: ela foi paga');
  assert.ok(balcao.zonas.cabecalho.pecas.every((p) => !p.comFoto && p.item.papel === 'cabecalho'));
  const bases = balcao.zonas.cabecalho.pecas.map((p) => p.item.origem.base);
  assert.notEqual(bases[0], bases[1], 'dois estilos de cabeçalho, duas estruturas');
  assert.equal(balcao.zonas.cabecalho.pecas[0].item.campos.logo, '/media/t/logo.png');
  assert.equal(balcao.zonas.cabecalho.pecas[0].item.campos.marca, 'Padaria do Bairro');

  // Os horários se revezam pela principal, com o prazo da campanha.
  const ag = balcao.zonas.principal.map((p) => p.item.agendamento);
  assert.deepEqual(ag.map((a) => a.horaInicio), ['06:00', '15:00', '17:30']);
  assert.ok(ag.every((a) => a.dataInicio === '2026-10-21' && a.dataFim === '2026-10-27'));
  assert.equal(balcao.zonas.cabecalho.pecas[0].item.agendamento, undefined, 'cabeçalho não tem horário');

  // Redes: a partir da peça principal, com os textos de cada canal.
  assert.deepEqual(r.social.canais, ['instagramPost', 'instagramStory', 'whatsappMensagem']);
  assert.equal(r.social.peca, 't0-principal-0');
  assert.ok(r.social.textos && r.social.textos.instagram && r.social.textos.whatsapp, 'os textos das redes');
  // A biblioteca recebe o que Meus Designs mostra bem.
  assert.equal(r.biblioteca.length, 7);
});

test('"só as minhas" sem fotos: a peça sai sem foto, com o motivo, e nada é gerado', async (t) => {
  modo(t, 'dev');
  let geradas = 0;
  const r = await eco.gerar({ ...ESCOPO(), imagens: 'minhas' }, { telas: TELAS }, { onImagem: async () => { geradas++; return '/x.png'; } });
  assert.equal(geradas, 0);
  assert.equal(r.semFoto.length, 7);
  assert.match(r.semFoto[0].porque, /não tem fotos/);
  const comBases = await eco.gerar({ ...ESCOPO(), imagens: 'minhas' }, { telas: TELAS, marca: { bases: [{ url: '/media/t/loja.jpg' }] } }, { onImagem: async () => { geradas++; return '/x.png'; } });
  assert.equal(geradas, 0);
  assert.equal(comBases.telas[0].zonas.principal[0].item.campos.foto, '/media/t/loja.jpg');
});

test('o saldo acaba no meio: as peças seguintes saem sem foto, e a campanha termina', async (t) => {
  modo(t, 'dev');
  let n = 0;
  const r = await eco.gerar(ESCOPO(), { telas: TELAS }, {
    onImagem: async () => { if (++n > 2) throw new Error('acabaram as criações com IA do mês'); return '/media/t/f' + n + '.png'; },
  });
  assert.equal(r.contagem.fotosGeradas, 2);
  assert.equal(r.semFoto.length, E.custo(ESCOPO()).fotos - 2);
  assert.match(r.semFoto[0].porque, /acabaram as criações/);
  assert.equal(r.telas[0].zonas.principal.length, 3, 'nenhuma zona ficou vazia');
});

test('com IA: uma chamada para os textos de todas as peças; a peça recusada cai na reserva', async (t) => {
  modo(t, 'anthropic');
  const chamar = { llm: ai.callLLM, motor: motores.chamar };
  t.after(() => { ai.callLLM = chamar.llm; motores.chamar = chamar.motor; });
  const pedidos = [];
  ai.callLLM = async (sistema, usuario) => {
    pedidos.push(usuario);
    if (sistema === eco.SISTEMA) {
      return JSON.stringify({
        nome: 'Tarde do pão de queijo', direcao: 'cartaz', estilo: 'energetico',
        vagas: { 't0-principal-0': { kicker: 'SAIU AGORA', titulo: 'Pão de queijo quentinho', apoio: 'Das 15h às 17h', cta: 'Peça já', foto: 'gerar', descricaoFoto: 'cesta de pão de queijo' } },
        mensagens: { 0: ['frase da IA'] },
      });
    }
    return JSON.stringify({ instagram: { legenda: 'x' } });
  };
  // O motor de HTML fora do ar: toda peça cai na peça-ouro do papel dela.
  motores.chamar = async () => { throw new Error('fora do ar'); };
  const fotos = [];
  const r = await eco.gerar(ESCOPO(), { empresa: 'Padaria do Bairro', telas: TELAS }, { onImagem: async (p) => { fotos.push(p); return '/media/t/f.png'; } });
  const textosPedido = pedidos.find((u) => u.includes('VAGAS:'));
  assert.ok(textosPedido, 'os textos foram pedidos numa chamada só');
  assert.match(textosPedido, /- t0-principal-0: TV do balcão, principal — o cliente pediu: pão de queijo saindo do forno \(aceita foto\)/);
  assert.match(textosPedido, /Fotos: a IA gera/);
  assert.equal(r.nome, 'Semana do pão de queijo', 'o nome que o cliente deu vence');
  assert.equal(r.identidade.direcao, 'cartaz');
  const p0 = r.telas[0].zonas.principal[0];
  assert.equal(p0.item.campos.titulo, 'Pão de queijo');
  assert.equal(p0.motor, 'ouro');
  assert.equal(fotos[0], 'cesta de pão de queijo', 'a descrição da foto que a IA escreveu');
  assert.deepEqual(r.telas[0].zonas.rodape.mensagens, ['Pão de queijo em dobro das 15h às 17h'], 'o letreiro do cliente vence o da IA');
  // A peça do rodapé só aparece com mensagem: sem frase da IA para a vitrine, entram as palavras do próprio cliente.
  assert.deepEqual(r.telas[1].zonas.rodape.mensagens, ['Semana do pão de queijo', 'vender mais pão de queijo à tarde']);
});

/* ---------- de ponta a ponta ---------- */

const PORTA = 4160 + Math.floor(Math.random() * 9);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: { ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.cookie ? { Cookie: o.cookie } : {}) } }, (res) => {
      let corpo = '';
      res.on('data', (c) => { corpo += c; });
      res.on('end', () => {
        let json = null; try { json = JSON.parse(corpo); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (o.body) req.write(JSON.stringify(o.body));
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('rotas: da conversa à campanha salva, presa à conta', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-eco-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, AI_PROVIDER: 'dev' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  const marca = Date.now();
  const conta = (email, name) => pedir('/api/auth/signup', { method: 'POST', body: { email, password: 'senha-de-teste-123', name, aceite: true } });
  const a = await conta('eco-a' + marca + '@teste.local', 'Padaria A');
  const b = await conta('eco-b' + marca + '@teste.local', 'Ótica B');
  const cA = cookieDe(a), cB = cookieDe(b);

  let conv = null;
  for (const texto of ['Quero divulgar o pão de queijo em dobro à tarde', 'Pode gerar as fotos', 'Instagram e WhatsApp', 'Manhã café, tarde lanche']) {
    conv = (await pedir('/api/ai/conversa', { method: 'POST', cookie: cA, body: { id: conv && conv.id, texto } })).json.conversa;
  }
  assert.equal(conv.estado, 'entendido');

  assert.equal((await pedir('/api/ai/ecossistema', { method: 'POST', cookie: cA, body: { escopo: {} } })).status, 400, 'escopo vazio não gera');
  assert.equal((await pedir('/api/ai/ecossistema', { method: 'POST', cookie: cB, body: { conversaId: conv.id } })).status, 404, 'a outra conta não gera com a conversa desta');

  const job = await pedir('/api/ai/ecossistema', { method: 'POST', cookie: cA, body: { conversaId: conv.id } });
  assert.equal(job.status, 202);
  let fim = null;
  for (let i = 0; i < 120 && !fim; i++) {
    const j = (await pedir('/api/ai/job/' + job.json.id, { cookie: cA })).json;
    if (j.estado === 'pronto' || j.estado === 'erro') fim = j;
    else await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(fim, 'o trabalho não terminou');
  assert.equal(fim.estado, 'pronto', fim.erro);
  const id = fim.resultado.campanha.id;
  assert.match(id, /^camp_/);

  const c = (await pedir('/api/campanhas/' + id, { cookie: cA })).json.campanha;
  assert.equal(c.estado, 'pronta');
  assert.equal(c.conversaId, conv.id);
  assert.equal(c.resultado.telas[0].zonas.principal.length, 3);
  assert.equal(c.resultado.contagem.fotosGeradas, 5, 'modo demonstração: a reserva, sem cobrar');
  const lista = (await pedir('/api/campanhas', { cookie: cA })).json.campanhas;
  assert.equal(lista[0].id, id);
  assert.equal(lista[0].resultado, undefined, 'a lista não carrega o resultado');
  const daConversa = (await pedir('/api/conversas/' + conv.id, { cookie: cA })).json.conversa;
  assert.equal(daConversa.estado, 'gerado');
  assert.equal(daConversa.campanhaId, id);
  const biblioteca = (await pedir('/api/library', { cookie: cA })).json.items;
  assert.ok(biblioteca.filter((x) => x.campaign === c.nome).length >= 5, 'as peças foram para Meus Designs');

  assert.equal((await pedir('/api/campanhas/' + id, { cookie: cB })).status, 404);
  assert.deepEqual((await pedir('/api/campanhas', { cookie: cB })).json.campanhas, []);
});

test('a tabela existe nos dois bancos, e o gerador usa a foto com saldo e cobrança', () => {
  for (const f of ['server/db-sqlite.js', 'server/db-postgres.js']) {
    const s = fs.readFileSync(path.join(RAIZ, f), 'utf8');
    assert.match(s, /CREATE TABLE IF NOT EXISTS campanhas/, f);
    for (const fn of ['criarCampanha', 'lerCampanha', 'salvarCampanha', 'listarCampanhas']) assert.match(s, new RegExp('async function ' + fn + '\\('), f + ' ' + fn);
  }
  const rota = fs.readFileSync(path.join(RAIZ, 'server/routes/campanhas.js'), 'utf8');
  assert.match(rota, /onImagem: fotoDaConta\(sess, null\)/);
  assert.match(rota, /emTrabalho\(res, sess, 'campanha'/, 'a geração roda como trabalho');
  assert.match(fs.readFileSync(path.join(RAIZ, 'server.js'), 'utf8'), /ecossistema: 'ecossistema',/, 'medida como rota de IA');
});
