/*
 * QA de lançamento, 03/11 (leitura de design e textos, operador, TI de rede):
 * o painel fala a língua da frente da conta, não mostra nota interna nem
 * jargão de programador, pede confirmação no que muda a conta do cliente e
 * deixa desfazer um envio em lote depois que o aviso some.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const importar = (p) => import(pathToFileURL(path.join(RAIZ, p)).href);
const P = require('../js/perfil.js');

test('o registro tem os textos do painel nas três frentes; RH, SIPAT e Protheus só na Empresas', () => {
  const campos = Object.keys(P.PERFIS.empresa.textos).sort();
  for (const id of P.IDS) {
    const t = P.PERFIS[id].textos;
    assert.deepEqual(Object.keys(t).sort(), campos, id + ': faltam textos');
    for (const k of campos) assert.ok(String(t[k]).trim(), id + '.' + k + ' vazio');
    if (id !== 'empresa') {
      assert.doesNotMatch(JSON.stringify(t), /SIPAT|\bRH\b|Protheus|refeitório|crachá|expediente/i, id + ' com texto de empresa');
    }
  }
  // As páginas leem do registro em vez de escrever o texto de empresa para todos.
  const semComentario = (x) => x.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const cal = semComentario(ler('web/src/pages/CalendarioPage.jsx'));
  assert.doesNotMatch(cal, /SIPAT|a lista do RH|Calendário da empresa/);
  assert.match(cal, /placeholder=\{perfil\.textos\.datas\}/);
  for (const f of ['web/src/pages/BirthdaysPage.jsx', 'web/src/components/pessoas/ResumoDasPessoas.jsx']) {
    assert.doesNotMatch(ler(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), /planilha do RH/, f);
  }
  // Protheus só aparece quando a frente é a Empresas.
  const ind = ler('web/src/pages/IndicadoresPage.jsx').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  for (const linha of ind.split('\n').filter((l) => /Protheus/.test(l))) {
    assert.match(linha, /empresa/, 'Protheus para qualquer frente: ' + linha.trim().slice(0, 100));
  }
  assert.doesNotMatch(ler('web/src/components/tela/PedirIA.jsx'), /'Ex\.: avisar que o refeitório/);
  assert.match(ler('web/src/components/dashboard/PrimeirosPassos.jsx'), /'Diga quem é a ' \+ perfil\.lugar/);
});

test('"Criar na mão": o exemplo escrito nos modelos é da frente (sem crachá nem RH na loja e na clínica)', () => {
  const M = require('../js/modelos.js');
  for (const frente of ['comercio', 'saude']) {
    for (const { id } of M.listar()) {
      for (const f of ['16/9', '9/16']) {
        const textos = M.montar(id, f, [], frente).elementos.filter((e) => e.tipo === 'texto').map((e) => e.text).join(' | ');
        assert.doesNotMatch(textos, /crachá|Bata o ponto|Fale com o RH|refeitório|SEM ACIDENTES|CONFRATERNIZAÇÃO/i, frente + '/' + id + ': ' + textos);
      }
    }
  }
  // A Empresa (e quem não diz a frente) segue com o exemplo de sempre.
  const lista = M.montar('lista', '16/9', []).elementos.map((e) => e.text).join(' ');
  assert.match(lista, /Use o crachá/);
  assert.match(ler('web/src/components/content/EscolherModelo.jsx'), /M\.montar\(m\.id, formato, cores, perfil\.id\)/);
});

test('Suporte: papel em português e o navegador em duas palavras, não o user-agent', async () => {
  const { navegadorCurto } = await importar('web/src/lib/navegador.js');
  assert.equal(navegadorCurto('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/153.0.0.0 Safari/537.36'), 'Chrome 153 · Linux');
  assert.equal(navegadorCurto('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'), 'Safari 17 · iPhone');
  assert.equal(navegadorCurto('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Edg/120.0'), 'Edge 120 · Windows');
  assert.equal(navegadorCurto(''), '');
  const s = ler('web/src/pages/SupportPage.jsx');
  assert.doesNotMatch(s, /'Navegador: ' \+ \(typeof navigator !== 'undefined' \? navigator\.userAgent/);
  assert.doesNotMatch(s, /\(user\.role \|\| '—'\)/, 'o papel cru ("owner") na tela');
  assert.match(s, /NOME_DO_PAPEL\[user\.role\]/);
  assert.match(s, /Detalhe técnico: ' \+ ua/, 'o user-agent completo continua indo no e-mail');
});

test('o nome do plano no operador é o que o cliente vê (pro = Essencial), igual a server/plans.js', async () => {
  const { NOME_DO_PLANO } = await importar('web/src/lib/nomes.js');
  const planos = require('../server/plans.js').PLANS;
  for (const [id, p] of Object.entries(planos)) assert.equal(NOME_DO_PLANO[id], p.name, 'plano ' + id);
  const plat = ler('web/src/pages/PlatformPage.jsx');
  assert.doesNotMatch(plat, /\{c\.plano\}|valor=\{data\.plano \+/, 'o id do plano cru na tela');
  assert.doesNotMatch(ler('web/src/components/platform/Negocio.jsx'), /\{c\.plano\}|: c\.plano\}/);
  // Os "14 de 14" e "20 de 20" na mesma página: este cartão conta aparelhos, não telas pareadas.
  assert.doesNotMatch(plat, /de \$\{formatNumber\(data\.telas\)\} pareadas/);
});

test('o operador confirma antes de trocar frente ou contrato; promover a Dono também pede confirmação', () => {
  const plat = ler('web/src/pages/PlatformPage.jsx');
  const fim = plat.indexOf("fazer('frente'");
  const frente = plat.slice(fim - 700, fim);
  assert.match(frente, /await confirmar\(/, 'trocar a frente sem confirmar');
  const fimC = plat.indexOf("fazer('contrato'");
  const contrato = plat.slice(fimC - 800, fimC);
  assert.match(contrato, /await confirmar\([\s\S]*botao: 'Salvar contrato'/, 'salvar contrato sem confirmar');
  const team = ler('web/src/pages/TeamPage.jsx');
  assert.match(team, /if \(role === 'owner' && !\(await confirmar\(\{/);
});

test('Telas prontas: a nota interna do manifesto não chega ao cliente (corrigido na leitura)', async () => {
  const T = await importar('web/src/lib/telasProntas.js');
  const m = JSON.parse(ler('pecas-ouro/manifesto.json'));
  // O manifesto continua com a nota (é dela que a bancada precisa)...
  assert.ok(m.telas.some((t) => /PLANO §/.test(t.sobre || '')));
  // ...e o que o painel recebe não tem `sobre`, só a descrição de cliente.
  for (const t of T.aprovadas(m)) {
    assert.equal(t.sobre, undefined);
    assert.doesNotMatch(t.descricao, /PLANO|§|docs\/|bancada|\bzonas?\b/i, t.id + ': ' + t.descricao);
  }
  assert.equal(T.descricaoDaTela({ sobre: 'O aviso da semana em letra grande e o horário logo depois.' }), 'O aviso da semana em letra grande e o horário logo depois.');
  assert.match(T.descricaoDaTela({ sobre: 'Cada zona diz uma coisa (PLANO §4.7).', zonas: { principal: {}, rodape: {} } }), /^Tela inteira, com destaque e faixa de avisos embaixo\./);
  assert.equal(T.descricaoDaTela({ paraCliente: 'Escrito pelo dono.', sobre: 'PLANO' }), 'Escrito pelo dono.');
  const pag = ler('web/src/pages/TelasProntasPage.jsx');
  assert.doesNotMatch(pag, /tela\.sobre/);
});

test('Peças prontas: carregando mostra carregando, não "Nenhuma peça pronta ainda"', () => {
  const s = ler('web/src/pages/PecasProntasPage.jsx');
  assert.match(s, /pecas === null \|\| \(visiveis\.length === 0 && \(modelos === null \|\| marca === null\)\)/);
  assert.match(s, /Carregando as peças…/);
});

test('Início: um botão principal só ("Criar com a IA")', () => {
  const d = ler('web/src/pages/DashboardPage.jsx');
  assert.doesNotMatch(d, /variant="primary"/, 'botão cheio além do "Criar com a IA"');
  assert.match(d, /bg-accent px-4 py-3 text-sm font-semibold text-accent-fg[\s\S]{0,80}Criar com a IA/);
  assert.doesNotMatch(ler('web/src/components/dashboard/PrimeirosPassos.jsx'), /agora \? 'bg-accent text-accent-fg/);
});

test('envio em lote: os últimos envios ficam na Programação, com Desfazer', () => {
  assert.match(ler('web/src/api.js'), /listar: \(\) => api\('GET', '\/api\/lote'\)/);
  const u = ler('web/src/components/tela/UltimosEnvios.jsx');
  assert.match(u, /lote\.listar\(\)/);
  assert.match(u, /desfazerLote\(l\.id\)/);
  assert.match(u, /l\.desfeitoEm/);
  const r = ler('web/src/lib/rodar.js');
  assert.match(r, /export async function desfazerLote\(idLote\)/);
  assert.match(r, /on: \(\) => desfazerLote\(idLote\)/, 'o aviso de 9 s e a lista desfazem do mesmo jeito');
  assert.match(ler('web/src/pages/ProgramacaoPage.jsx'), /<UltimosEnvios /);
});
