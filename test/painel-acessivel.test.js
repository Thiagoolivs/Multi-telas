/*
 * QA de lançamento, 03/11 (usuários 15 e 16: deficiência visual e idoso).
 * O que o painel passou a garantir para quem usa teclado, leitor de tela ou
 * pouca intimidade com tecnologia — cada teste diz qual achado ele segura.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const WEB = path.join(RAIZ, 'web/src');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const importar = (p) => import(pathToFileURL(path.join(RAIZ, p)).href);

function jsxDe(dir) {
  const saida = [];
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) saida.push(...jsxDe(p));
    else if (/\.jsx$/.test(nome.name)) saida.push(p);
  }
  return saida;
}

test('subir arquivo pelo teclado: nenhum <input type=file> escondido dentro de um <label>', () => {
  // Bloqueador B3: o <label> com o input em display:none não recebe Tab. Todo
  // seletor de arquivo é aberto por um botão (EscolherArquivo, ou ref + click()).
  const ruins = [];
  for (const f of jsxDe(WEB)) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/<input\b[^>]*type="file"[^>]*>/g)) {
      const antes = s.slice(Math.max(0, m.index - 400), m.index);
      const labelAberto = antes.lastIndexOf('<label') > antes.lastIndexOf('</label>');
      if (labelAberto || !/\bref=\{/.test(m[0])) ruins.push(path.relative(RAIZ, f) + ': ' + m[0].slice(0, 80));
    }
  }
  assert.deepEqual(ruins, [], 'seletor de arquivo que o teclado não abre');
  const e = ler('web/src/components/ui/EscolherArquivo.jsx');
  assert.match(e, /<button type="button"/);
  assert.match(e, /entrada\.current\.click\(\)/);
  for (const f of ['components/content/SubirConteudo.jsx', 'components/content/LogoDaMarca.jsx', 'pages/BrandPage.jsx',
    'pages/ScreensPage.jsx', 'pages/MyDesignsPage.jsx', 'pages/CriacaoRapidaPage.jsx']) {
    assert.match(ler('web/src', f), /<EscolherArquivo\b/, f + ' sem o botão de escolher arquivo');
  }
});

test('diálogos e a gaveta do celular: foco entra, fica preso, Esc fecha o de cima, foco volta', () => {
  const f = ler('web/src/lib/focoPreso.js');
  assert.match(f, /e\.key === 'Escape'/);
  assert.match(f, /e\.key !== 'Tab'/);
  assert.match(f, /const pilha = \[\]/, 'sem pilha, o Esc de uma confirmação fecharia os dois diálogos');
  assert.match(f, /quemAbriu\.focus/, 'o foco não volta para quem abriu');
  const d = ler('web/src/components/ui/Dialog.jsx');
  assert.match(d, /prenderFoco\(caixa\.current/);
  assert.match(d, /aria-labelledby=/);
  // O efeito não pode depender de onClose (muda a cada render e roubaria o foco do campo).
  assert.match(d, /\}, \[open\]\);/);
  const a = ler('web/src/components/layout/AppShell.jsx');
  assert.match(a, /role="dialog" aria-modal="true" aria-label="Menu"/);
  assert.match(a, /prenderFoco\(gaveta\.current/);
});

test('"Testar grátis" e links com ?frente= ou ?cadastro=1 abrem o cadastro, não o login', async () => {
  const { modoInicial } = await importar('web/src/lib/entrada.js');
  assert.equal(modoInicial('?frente=saude'), 'signup');
  assert.equal(modoInicial('?frente=empresas'), 'signup');
  assert.equal(modoInicial('?cadastro=1'), 'signup');
  assert.equal(modoInicial('?frente=comercio&cadastro=1'), 'signup');
  assert.equal(modoInicial(''), 'login');
  assert.equal(modoInicial('?frente=qualquer'), 'login', 'frente inventada não decide nada');
  assert.equal(modoInicial('?reset=abc&frente=saude'), 'login', 'o link do e-mail segue o caminho dele');
  assert.match(ler('web/src/pages/AuthScreen.jsx'), /useState\(\(\) => modoInicial\(window\.location\.search\)\)/);
});

test('cadastro: o botão diz o que falta, nome obrigatório, "Esqueci" sem prometer antes, alternador com estado', () => {
  const s = ler('web/src/pages/AuthScreen.jsx');
  // O botão não fica mais cinza e mudo esperando o aceite: responde dizendo o que fazer.
  assert.doesNotMatch(s, /disabled=\{busy \|\| \(mode === 'signup' && !aceite\)\}/);
  assert.match(s, /marque a caixinha/);
  assert.match(s, /if \(!form\.name\.trim\(\)\)/);
  assert.doesNotMatch(s, /mode === 'forgot' \? 'Enviamos/, '"Enviamos" antes de enviar');
  assert.match(s, /aria-pressed=\{mode === m\}/);
  assert.match(s, /role="alert" aria-live="assertive"/);
});

test('erros com o que fazer, em frase de gente', async () => {
  const { paraGente, frase } = await importar('web/src/lib/erros.js');
  assert.equal(paraGente({ message: 'código não encontrado', status: 404 }, 'parear'),
    'Não achamos esse código. Confira na TV: são 6 letras e números. Se a TV mostrar um código novo, use o novo.');
  assert.match(paraGente({ message: 'e-mail ou senha incorretos' }), /^E-mail ou senha não conferem\. .*Esqueci minha senha/);
  assert.match(paraGente({ message: 'e-mail já cadastrado' }), /já tem conta/);
  assert.match(paraGente({ message: 'muitas tentativas de pareamento' }, 'parear'), /Espere/);
  // O que não é conhecido ganha ao menos maiúscula e ponto.
  assert.equal(paraGente({ message: 'json inválido' }), 'Json inválido.');
  assert.equal(frase('já está ok!'), 'Já está ok!');
  assert.equal(paraGente(null), 'Não deu certo. Tente de novo em instantes.');
  // A mensagem de sem rede (api.js) já diz o que fazer: passa como está.
  assert.equal(paraGente({ message: 'Sem conexão. Nada foi enviado.', offline: true }), 'Sem conexão. Nada foi enviado.');
});

test('código da TV com espaço ou traço: normalizado antes de validar; Enter pareia; erro anunciado', async () => {
  const { codigoDaTv } = await importar('web/src/lib/erros.js');
  assert.equal(codigoDaTv('bwc dqz'), 'BWCDQZ');
  assert.equal(codigoDaTv(' BWC-DQZ '), 'BWCDQZ');
  assert.equal(codigoDaTv('bwc.dqz9'), 'BWCDQZ', 'no máximo 6');
  const s = ler('web/src/pages/ScreensPage.jsx');
  assert.match(s, /setCode\(codigoDaTv\(e\.target\.value\)\)/);
  assert.doesNotMatch(s, /setCode\(e\.target\.value\.toUpperCase\(\)\)/, 'campo de código sem normalizar');
  assert.match(s, /<form id="form-parear" onSubmit=\{submit\}/);
  assert.match(s, /type="submit" form="form-parear"/);
  assert.match(s, /paraGente\(err, 'parear'\)/);
});

// Contraste: lê os tokens do index.css e calcula (WCAG 2.x, luminância relativa).
function tokens(css, seletor) {
  const i = css.indexOf(seletor + ' {');
  assert.ok(i >= 0, 'sem o bloco ' + seletor);
  const bloco = css.slice(i, css.indexOf('}', i));
  const t = {};
  for (const m of bloco.matchAll(/--c-([a-z0-9-]+):\s*(\d+)\s+(\d+)\s+(\d+)/g)) t[m[1]] = [+m[2], +m[3], +m[4]];
  return t;
}
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

test('contraste: texto de apoio ≥ 4,5:1 e anel de foco ≥ 3:1 em todos os fundos, nos dois temas', () => {
  const css = ler('web/src/index.css');
  const claro = tokens(css, ':root');
  const escuro = { ...claro, ...tokens(css, ":root[data-theme='dark']") };
  for (const [nome, t] of [['claro', claro], ['escuro', escuro]]) {
    for (const fundo of ['canvas', 'surface', 'surface-2', 'accent-soft']) {
      const c = contraste(t['ink-3'], t[fundo]);
      assert.ok(c >= 4.5, nome + ': ink-3 sobre ' + fundo + ' = ' + c.toFixed(2) + ':1 (mínimo 4,5)');
      const anel = contraste(t.accent, t[fundo]);
      assert.ok(anel >= 3, nome + ': anel de foco sobre ' + fundo + ' = ' + anel.toFixed(2) + ':1 (mínimo 3)');
      // A letra na cor de destaque (text-accent, --c-accent-texto): link, ícone, "Criar para a data".
      const letra = contraste(t['accent-texto'], t[fundo]);
      assert.ok(letra >= 4.5, nome + ': letra de destaque sobre ' + fundo + ' = ' + letra.toFixed(2) + ':1 (mínimo 4,5)');
    }
    // O texto do botão cheio sobre a cor de destaque.
    const botao = contraste(t['accent-fg'], t.accent);
    assert.ok(botao >= 4.5, nome + ': texto do botão sobre o destaque = ' + botao.toFixed(2) + ':1 (mínimo 4,5)');
  }
  // O anel é o violeta cheio, não a 40% (2:1).
  const b = ler('web/src/components/ui/Button.jsx');
  assert.doesNotMatch(b, /ring-accent\/40/);
  assert.match(b, /focus-visible:ring-accent/);
  assert.doesNotMatch(ler('web/src/components/ui/Field.jsx'), /ring-accent\/25/);
  assert.match(css, /:focus-visible \{ outline: 2px solid rgb\(var\(--c-accent\)\)/);
});

test('"Pular para o conteúdo" e o título da aba por página', () => {
  const a = ler('web/src/components/layout/AppShell.jsx');
  assert.match(a, /Pular para o conteúdo/);
  assert.match(a, /<main id="conteudo"/);
  const app = ler('web/src/App.jsx');
  assert.match(app, /document\.title = tituloDaPagina \+ ' · ' \+ perfil\.marca/);
  assert.match(ler('web/src/pages/AuthScreen.jsx'), /document\.title = titulo \+ ' · MultiTelas'/);
});

test('árvore de acessibilidade limpa: miniaturas fora dela, <main> no login, menu da conta com estado', () => {
  // axe: 2 a 7 "h1" por página vinham do texto das miniaturas; label-content-name-mismatch no botão da conta.
  assert.match(ler('web/src/components/content/PecaHtml.jsx'), /<div ref=\{caixa\} aria-hidden="true"/);
  assert.match(ler('web/src/components/content/DesignThumb.jsx'), /<div aria-hidden="true" className=\{'relative overflow-hidden/);
  assert.match(ler('web/src/pages/AuthScreen.jsx'), /<main className="flex min-h-screen/);
  const t = ler('web/src/components/layout/Topbar.jsx');
  assert.match(t, /aria-expanded=\{open\}/);
  assert.match(t, /e\.key !== 'Escape'/);
  assert.doesNotMatch(t, /aria-label=\{'Conta: ' \+ name\}/);
});
