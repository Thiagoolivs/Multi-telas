/*
 * Reteste 4 (26/11), a frente da TV: o nome da conta e o clima no
 * cabeçalho, as telas prontas que cediam a letra na TV em pé e na quadrada,
 * e o "R$" repetido no preço. O desenho foi conferido na bancada, peça a
 * peça e tela a tela, com "Grupo Horizonte" e "Metalúrgica Horizonte Ltda"
 * (tools/regua-tv.mjs mede no CI); aqui ficam as partes puras e o que
 * impede de voltar.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8').replace(/\r\n/g, '\n');
const P = require('../js/peca-html.js');
const R = require('../js/peca-render.js');
const daPeca = (id) => P.doArquivo(ler('pecas-ouro', id + '.html'));
const manifesto = () => JSON.parse(ler('pecas-ouro', 'manifesto.json'));
// O nível de quem cede em cada elemento do HTML da peça: { 'classe ou campo': nível }.
function niveis(id) {
  const html = P.higienizar(daPeca(id)).html;
  const out = {};
  html.replace(/<(\w+)([^>]*)\sdata-cede="(\d)"([^>]*)>/g, (_, tag, a, n, b) => {
    const attrs = a + b;
    const nome = (/data-campo="([\w-]+)"/.exec(attrs) || /data-vivo="([\w-]+)"/.exec(attrs) || /class="([\w-]+)/.exec(attrs) || [])[1];
    out[nome] = Number(n);
  });
  return out;
}

/* ---------------- 1. A letra não cede: o que é menos importante sai ---------------- */

test('a porta aceita data-cede de 1 a 5 e recusa o resto', () => {
  const peca = (v) => P.higienizar({ html: '<section class="mt-peca"><p data-cede="' + v + '" data-campo="titulo">Oi</p></section>', css: '' });
  assert.equal(peca('1').ok, true);
  assert.match(peca('1').html, /data-cede="1"/);
  assert.match(peca('5').html, /data-cede="5"/);
  for (const ruim of ['0', '6', 'x', '1;']) {
    const r = peca(ruim);
    assert.doesNotMatch(r.html, /data-cede/, ruim + ' passou');
    assert.ok(r.problemas.some((p) => /data-cede/.test(p)), ruim + ': a porta não avisou');
  }
});

test('o cabeçalho diz o que sai primeiro: a chamada, a data, o clima — o nome e a hora nunca', () => {
  assert.deepEqual(niveis('cabecalho-classico'), { chamada: 1, data: 2, clima: 3, sep: 3 });
  assert.deepEqual(niveis('cabecalho-centro'), { info: 3, data: 2, sub: 1 });
  assert.deepEqual(niveis('cabecalho-chamada'), { chamada: 2, quando: 1 });
  assert.deepEqual(niveis('cabecalho-status'), { status: 5, desde: 1, horario: 4, clima: 3, sep: 3, data: 2 });
  assert.deepEqual(niveis('cabecalho-minimo'), { data: 1 });
  for (const id of ['cabecalho-classico', 'cabecalho-centro', 'cabecalho-chamada', 'cabecalho-chamadas', 'cabecalho-minimo', 'cabecalho-status', 'rodape-selo']) {
    const html = P.higienizar(daPeca(id)).html;
    assert.doesNotMatch(html, /data-cede="\d"[^>]*data-campo="marca"|data-campo="marca"[^>]*data-cede/, id + ': o nome da marca não pode sair');
    assert.doesNotMatch(html, /data-cede="\d"[^>]*data-vivo="relogio"/, id + ': a hora não pode sair');
  }
});

test('o nome longo quebra em duas linhas no cabeçalho e no selo do rodapé, em vez de empurrar o resto', () => {
  assert.match(ler('pecas-ouro', 'cabecalho-chamadas.html'), /\.marca \{[^}]*max-width: 46%;/);
  assert.match(ler('pecas-ouro', 'cabecalho-chamadas.html'), /\.nome \{[^}]*-webkit-line-clamp: 2; text-wrap: balance; \}/);
  assert.match(ler('pecas-ouro', 'cabecalho-status.html'), /\.nome \{[^}]*text-align: center;\n {2}overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; text-wrap: balance; \}/);
  // O status sai na faixa em pé quando o nome não cabe; cada bloco na coluna dele (sem ele, a marca não pula para a primeira).
  assert.match(ler('pecas-ouro', 'cabecalho-status.html'), /\.status \{ grid-column: 1;[\s\S]*\.marca \{ grid-column: 2;[\s\S]*\.agora \{ grid-column: 3;/);
  assert.match(ler('pecas-ouro', 'cabecalho-centro.html'), /@container \(aspect-ratio < 9\) \{[\s\S]*?\.nome \{[^}]*white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;/);
  assert.match(ler('pecas-ouro', 'rodape-selo.html'), /\.selo \{ flex: 0 1 auto; min-width: 0; max-width: 50%;/);
  assert.match(ler('pecas-ouro', 'rodape-selo.html'), /\.selo span \{[^}]*-webkit-line-clamp: 2;/);
});

test('o nível de quem sai: o que a peça marcou; na faixa, a data e o clima sem marca; na principal, a assinatura com a marca', () => {
  const el = (attrs) => ({ getAttribute: (n) => (n in attrs ? attrs[n] : null) });
  assert.equal(R.nivelDe(el({ 'data-cede': '2' }), false), 2);
  assert.equal(R.nivelDe(el({ 'data-cede': '2', 'data-vivo': 'data' }), true), 2, 'o que a peça marcou vale');
  assert.equal(R.nivelDe(el({ 'data-cede': '9' }), false), 0, 'fora de 1 a 5 não vale');
  // A peça antiga (ou a da IA), sem data-cede: na faixa, a data e o clima saem por último.
  assert.equal(R.nivelDe(el({ 'data-vivo': 'data' }), true), 8);
  assert.equal(R.nivelDe(el({ 'data-vivo': 'clima' }), true), 9);
  assert.equal(R.nivelDe(el({ 'data-vivo': 'relogio' }), true), 0, 'a hora nunca sai');
  assert.equal(R.nivelDe(el({ 'data-vivo': 'data' }), false), 0, 'fora da faixa a data é conteúdo');
  // O nome repetido dentro da peça da principal (data-repete) sai depois de tudo o que ela marcou; na faixa, nunca.
  assert.equal(R.nivelDe(el({ 'data-repete': 'marca' }), false), 6);
  assert.equal(R.nivelDe(el({ 'data-repete': 'marca' }), true), 0);
});

test('o piso tenta tirar antes de ceder, devolve o que não adiantou, e se mede de novo quando o clima chega', () => {
  const PR = ler('js', 'peca-render.js');
  assert.match(PR, /'\.mt-peca \[data-mt-cedido\]\{display:none!important\}'/);
  // Primeiro sai o que está no defeito; sem ele, o menor nível. Nada sai à toa: se não adiantou, volta.
  assert.match(PR, /const doDefeito = vivos\.filter\(\(x\) => culpados\.some\(\(c\) => c && \(x\.el === c \|\| x\.el\.contains\(c\)\)\)\);/);
  assert.match(PR, /const sai = quemSai\(palco, culpadosDoPiso\(antes, depois\)\);/);
  assert.match(PR, /devolverTirados\(palco, tirados\);/);
  // E só então a letra cede (a régua reprova), com o porquê.
  assert.match(PR, /palco\.setAttribute\('data-mt-piso-motivo', motivoDoPiso\(antes, depois\)\);/);
  // O texto que ainda corta com a letra inteira também tira o próximo; cada medida começa do desenho.
  assert.match(PR, /for \(let i = 0; i < 8 && piso && corta && corta\.length; i\+\+\) \{\n\s*const sai = quemSai\(palco, corta\);/);
  assert.match(PR, /desfazerSemCorte\(palco\);\n\s*devolverCedidos\(palco\);\n\s*const piso = pisoDaZona\(host, k, ref\);/);
  // Quebrado em duas linhas, o texto não pode sair pelo pé da peça (o status do cabeçalho).
  assert.match(PR, /const quebrado = passaDaPeca\(el, peca\) \? \{ corte: 'linha' \} : ondeCorta\(el, caixas\);/);
  // O clima chega depois da medida: chegou (ou falhou), a peça se mede de novo.
  assert.match(PR, /if \(clima\.map\(\(el\) => el\.textContent\)\.join\('\|'\) !== antes\) remedirComOClima\(\);/);
});

test('o cabeçalho próprio da TV: antes de o nome encolher, saem a data e o clima, e ele quebra em duas linhas; nunca abaixo do piso', () => {
  const js = ler('js', 'player.js');
  const ini = js.indexOf('  function caberNome(el) {');
  const fonte = js.slice(ini, js.indexOf('\n  }\n', ini));
  assert.match(fonte, /zona\.classList\.add\(SAI_DO_CABECALHO\[i\]\);\n\s*if \(cabe\(\)\) return;/);
  assert.match(fonte, /const minimo = piso \? Math\.min\(1, piso \/ base\) : 0\.7;/);
  assert.doesNotMatch(fonte, /Math\.max\(0\.7,/, 'a letra do nome ia a 70% mesmo com o piso da TV');
});

/* ---------------- 2. As telas prontas que cediam na TV em pé e na quadrada ---------------- */

test('a peça da TV em pé e da quadrada corre de cima para baixo: nada preso no alto e no pé se encontra no meio', () => {
  const quase = (id) => {
    const css = daPeca(id).css;
    const blocos = css.split('@container (aspect-ratio >= 0.8) and (aspect-ratio < 1.25) {');
    return blocos[blocos.length - 1];
  };
  // O pedido de duas linhas ("Prioridade: idosos e gestantes") empurra em vez de cobrir; os passos um embaixo do outro.
  assert.match(quase('servico-passos'), /\.mt-peca \{ display: flex; flex-direction: column;/);
  assert.match(quase('servico-passos'), /\.marca-nome, \.cabeca, \.passos, \.cta \{ position: static; \}/);
  assert.match(quase('servico-passos'), /\.passos \{ grid-template-columns: 1fr;/);
  // O "98 dias" grande e no meio da altura, a frase logo abaixo.
  assert.match(quase('numero-grande'), /\.numero \{ margin: auto 0 0; text-align: left; \}/);
  assert.match(quase('numero-grande'), /calc\(46cqw \* var\(--mt-escala-titulo, 1\)\)/);
  assert.match(quase('institucional-valores'), /\.marca-nome, \.cabeca, \.valores \{ position: static; \}/);
  assert.match(quase('oferta-lista'), /\.marca-nome, \.cabeca, \.itens, \.cta \{ position: static; \}/);
  // O selo do "20% OFF" não cobre o nome nem o kicker: o nome fica na coluna da esquerda e o texto começa abaixo do selo.
  assert.match(quase('oferta-selo'), /\.marca-nome \{ left: 7cqw; right: 50cqw;/);
  assert.match(quase('oferta-selo'), /\.bloco \{[^}]*top: calc\(6cqh \+ 34cqw \+ 2\.4cqh\);/);
  assert.match(quase('oferta-selo'), /\.selo \{ right: 7cqw; top: 6cqh; width: 34cqw; height: 34cqw;/);
  assert.match(quase('oferta-selo'), /\.bloco > \.kicker \{ margin-top: auto; \}/);
});

test('o que pode sair em cada peça que cedia, do menos importante', () => {
  assert.deepEqual(niveis('servico-passos'), { 'passo1-detalhe': 1, 'passo2-detalhe': 1, 'passo3-detalhe': 1 });
  assert.deepEqual(niveis('numero-grande'), { apoio: 2, endereco: 1 });
  assert.deepEqual(niveis('oferta-selo'), { apoio: 1 });
  assert.deepEqual(niveis('oferta-lista'), { apoio: 1 });
  assert.deepEqual(niveis('social-data'), { apoio: 1 });
  assert.deepEqual(niveis('institucional-valores'), { 'valor1-texto': 1, 'valor2-texto': 1, 'valor3-texto': 1 });
  assert.deepEqual(niveis('servico-horario'), { kicker: 2, nota: 1 });
  assert.deepEqual(niveis('lateral-qr'), { kicker: 2, apoio: 1 });
  assert.deepEqual(niveis('social-avaliacao'), { kicker: 1 });
  // O título e o número nunca saem.
  for (const id of ['servico-passos', 'numero-grande', 'oferta-selo', 'oferta-lista', 'social-data', 'institucional-valores', 'servico-horario', 'lateral-qr', 'social-avaliacao']) {
    const n = niveis(id);
    assert.ok(!('titulo' in n) && !('numero' in n) && !('desconto' in n), id);
  }
});

test('a zona larga e baixa da TV em pé (1036×556) tem desenho nas laterais que vão para lá', () => {
  for (const id of ['servico-horario', 'lateral-qr', 'social-avaliacao']) {
    assert.match(daPeca(id).css, /@container \(aspect-ratio >= 1\.6\) and \(max-height: 600px\) \{/, id);
  }
});

test('o "R$" que o cliente digita no preço não aparece duas vezes', () => {
  const no = (texto) => ({ textContent: texto });
  const campo = (nome, irmaos) => {
    const el = { getAttribute: (n) => (n === 'data-campo' ? nome : null), textContent: '' };
    el.parentElement = { childNodes: irmaos.map(no).concat(el) };
    return el;
  };
  assert.equal(R.semMoedaRepetida(campo('item2-preco', ['R$']), 'R$ 249'), '249', 'a peça já escreve o R$');
  assert.equal(R.semMoedaRepetida(campo('preco', ['R$ ']), 'r$29'), '29');
  assert.equal(R.semMoedaRepetida(campo('item2-preco', []), 'R$ 249'), 'R$ 249', 'sem o R$ da peça, o do cliente fica');
  assert.equal(R.semMoedaRepetida(campo('titulo', ['R$']), 'R$ 249'), 'R$ 249', 'só no campo de preço');
  assert.equal(R.semMoedaRepetida(campo('preco', ['R$']), '29,90'), '29,90');
});

/* ---------------- 3. A régua confere a tela com o nome da conta e o clima ---------------- */

test('a régua monta cada tela pronta também com o nome de uma conta longa, e a letra que cede reprova', () => {
  const regua = ler('tools', 'regua-tv.mjs');
  assert.match(regua, /const CONTAS_LONGAS = \(process\.env\.REGUA_CONTAS \|\| 'Metalúrgica Horizonte Ltda'\)/);
  assert.match(regua, /for \(const conta of CONTAS_LONGAS\) telas = telas\.concat\(await conferirTelas\(navegador, conta\)\);/);
  assert.match(regua, /const ruins = prontas\.filter\(\(t\) => t\.naoCoube\.length \|\| t\.pisoCedeu\.length\);/);
  assert.match(regua, /if \(ruins\.length\) reprova = true;/);
  // As faixas também, nas 11 fontes.
  assert.match(regua, /for \(const conta of CONTAS_LONGAS\) faixas = faixas\.concat\(await conferirPecas\(navegador, 'balcao', ZONAS_DAS_FAIXAS, \{ todasAsMarcas: true, faixas: true, conta \}\)\);/);
  // A bancada põe o nome da conta onde o "Usar" do Prontos põe, e diz a letra que cedeu, peça a peça.
  const B = ler('js', 'bancada.js');
  assert.match(B, /if \(\/data-campo="marca"\/\.test\(arq\.html\)\) out\.marca = CONTA;/);
  assert.match(B, /campos: comAConta\(def, campos, arq\),/);
  assert.match(B, /pisoCedeu: achados\.map\(\(a\) => a\.piso\)\.filter\(Boolean\)/);
  // O clima na bancada está sempre à vista.
  assert.match(B, /clima: \(\) => Promise\.resolve\('27°'\),/);
  // O rascunho é só medido.
  assert.ok(manifesto().telas.some((t) => t.estado === 'rascunho'));
  assert.match(regua, /rascunho: t\.estado === 'rascunho'/);
});

test('a TV baixa as peças novas (o cache do player subiu)', () => {
  const versao = Number(/mt-shell-v(\d+)/.exec(ler('sw.js'))[1]);
  assert.ok(versao >= 100, 'SHELL_CACHE em v' + versao);
});
