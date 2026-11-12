/*
 * Reteste 2 (09/11), a TV e o conteúdo pronto: o que a régua visual achou e
 * o que impede de voltar. As medidas de verdade (texto cortado, texto sobre
 * texto, piso) são do robô da régua (tools/regua-tv.mjs) na bancada; aqui
 * ficam as partes puras e as regras do manifesto.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const R = require('../js/peca-render.js');
const C = require('../js/peca-conferir.js');
const manifesto = () => JSON.parse(ler('pecas-ouro', 'manifesto.json'));

test('a foto padrão do espaço vazio está no banco, com o papel e o ramo dela; pessoa nunca', () => {
  const banco = JSON.parse(ler('pecas-ouro', 'fotos', 'banco.json'));
  const confere = (ramo, papel, f) => {
    assert.ok(fs.existsSync(path.join(RAIZ, f.arquivo)), f.arquivo + ' não existe');
    const doBanco = banco.filter((b) => b.arquivo === f.arquivo);
    assert.ok(doBanco.length, f.arquivo + ' não está no banco');
    assert.ok(f.foco && f.foco.x >= 0 && f.foco.x <= 1 && f.foco.y >= 0 && f.foco.y <= 1, f.arquivo + ': foco');
    return doBanco;
  };
  for (const [ramo, papeis] of Object.entries(R.FOTOS_PADRAO)) {
    for (const [papel, f] of Object.entries(papeis)) {
      const doBanco = confere(ramo, papel, f);
      // A do escritório no lugar do "produto" é a mesa (o banco não tem produto de escritório): o papel pode ser ambiente.
      assert.ok(doBanco.some((b) => b.ramos.includes(ramo)), ramo + '/' + papel + ': ' + f.arquivo + ' é de outro ramo');
    }
  }
  const geral = confere('geral', 'textura', R.FOTO_GERAL);
  assert.ok(geral.some((b) => b.ramos.includes('geral') && b.papel === 'textura'), 'a foto geral é uma textura neutra');
  assert.equal(R.fotoPadrao('pessoa', 'padaria'), null, 'rosto de banco no lugar de uma pessoa, nunca');
  assert.equal(R.fotoPadrao(undefined, 'padaria'), null, 'sem papel, sem foto');
  assert.equal(R.fotoPadrao('produto', 'padaria').arquivo, '/pecas-ouro/fotos/padaria/pao-tabua.jpg');
  assert.equal(R.fotoPadrao('ambiente', '', 'saude').arquivo, R.FOTOS_PADRAO.saude.ambiente.arquivo, 'sem ramo, vale a frente');
  assert.equal(R.fotoPadrao('produto', 'pet', 'comercio'), R.FOTO_GERAL, 'ramo sem foto: a geral');
  assert.equal(R.fotoPadrao('produto', 'barbearia').arquivo, R.FOTOS_PADRAO.beleza.produto.arquivo);
  // A TV sabe o ramo: o servidor manda, o player guarda e a peça recebe.
  assert.match(ler('server', 'routes', 'telas.js'), /const ramo = await paleta\.ramoDaConta\(db, device\.tenant_id\)\.catch\(\(\) => ''\);\s+if \(ramo\) \{ c\.settings\.ramo = ramo;/);
  assert.match(ler('js', 'player.js'), /global\.MT_RAMO = typeof s\.ramo === 'string' \? s\.ramo : '';/);
  assert.match(ler('js', 'render.js'), /ramo: global\.MT_RAMO \|\| '',\s+frente: global\.MT_FRENTE \|\| '',/);
});

test('a data curta, para a faixa em que a longa não cabe', () => {
  const qui = new Date(2026, 10, 12, 9, 0);
  assert.equal(R.vivo('data', qui), 'Quinta · 12 nov');
  assert.equal(R.vivo('data-curta', qui), 'Qui · 12 nov');
  assert.equal(R.vivo('data-curta', new Date(2026, 10, 14)), 'Sáb · 14 nov');
  assert.equal(R.vivo('data-curta', new Date(2000, 0, 1)), '', 'relógio de box sem internet: nada');
  assert.equal(typeof R.semCorte, 'function');
});

test('texto sobre texto: a linha deslocada meia linha também cobre (a chamada sobre o WhatsApp)', () => {
  // As duas linhas do rodapé de 09/11: compridas, uma entra 20 px na outra (de 49).
  const chamada = { left: 74, right: 599, top: 206, bottom: 255 };
  const rotulo = { left: 439, right: 841, top: 177, bottom: 226 };
  assert.ok(C.cobre(chamada, rotulo));
  // Encostar não é cobrir: 4 px de altura em comum, ou meia letra de largura.
  assert.ok(!C.cobre({ left: 0, right: 500, top: 0, bottom: 50 }, { left: 0, right: 500, top: 46, bottom: 96 }));
  assert.ok(!C.cobre({ left: 0, right: 500, top: 0, bottom: 50 }, { left: 480, right: 900, top: 10, bottom: 60 }));
  // O piso usa a mesma regra.
  assert.match(ler('js', 'peca-render.js'), /h > linha \* 0\.3 && w > linha \* 0\.8/);
});

test('fora de época não aparece nos Prontos; a Saúde não recebe preço nem parcela', async () => {
  const { naEpoca, daFrente } = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/modelosOuro.js')).href);
  const dia = (s) => new Date(s + 'T12:00:00');
  assert.equal(naEpoca({}, 'saude', dia('2026-11-12')), true);
  assert.equal(naEpoca({ sazonal: { de: '10-01', ate: '10-31' } }, 'saude', dia('2026-11-12')), false);
  assert.equal(naEpoca({ sazonal: { de: '10-01', ate: '10-31' } }, 'saude', dia('2026-10-31')), true);
  assert.equal(naEpoca({ sazonal: { de: '12-01', ate: '01-06' } }, 'comercio', dia('2027-01-03')), true, 'a janela vira o ano');
  assert.equal(naEpoca({ sazonal: { saude: { de: '10-01', ate: '10-31' } } }, 'comercio', dia('2026-11-12')), true, 'só o texto da Saúde tem época');
  const m = manifesto();
  const novembro = dia('2026-11-12');
  const saude = daFrente(m.pecas, 'saude', novembro).map((p) => p.id);
  assert.ok(!saude.includes('oferta-parcelado'), 'parcelado para clínica');
  assert.ok(!saude.includes('social-data'), '"Outubro Rosa" em novembro');
  assert.ok(daFrente(m.pecas, 'comercio', novembro).some((p) => p.id === 'social-data'), 'a Black Friday é de novembro');
  // Nenhum texto de campanha de mês sem época: Outubro Rosa, Novembro Azul, Black Friday, Natal, Dia das Mães/Pais.
  const CAMPANHA = { 'outubro rosa': 10, 'novembro azul': 11, 'black friday': 11, natal: 12, 'dia das mães': 5, 'dia dos pais': 8 };
  const cobre = (s, mes) => s && s.de && Number(s.de.slice(0, 2)) <= mes && mes <= Number(s.ate.slice(0, 2));
  for (const p of m.pecas) {
    for (const [f, t] of Object.entries(p.textos || {})) {
      const texto = Object.values(t).join(' ').toLowerCase();
      for (const [nome, mes] of Object.entries(CAMPANHA)) {
        if (!texto.includes(nome) && !(nome === 'black friday' && /\bblack\b/.test(texto) && /\bfriday\b/.test(texto))) continue;
        const s = p.sazonal && (p.sazonal.de ? p.sazonal : p.sazonal[f]);
        assert.ok(cobre(s, mes), p.id + ' (' + f + ') fala de ' + nome + ' sem a época');
      }
    }
  }
  for (const t of m.telas.filter((x) => x.estado !== 'rascunho')) {
    const texto = JSON.stringify([t.zonas, t.mensagens, t.nome]).toLowerCase();
    for (const [nome, mes] of Object.entries(CAMPANHA)) if (texto.includes(nome)) assert.ok(cobre(t.sazonal, mes), t.id + ' fala de ' + nome + ' sem a época');
  }
  // Preço, parcela e desconto não são da Saúde (REFERENCIAS: CFO 196/2019).
  const PRECO = /^(preco|centavos|parcela|vezes|desconto)$/;
  for (const p of m.pecas) {
    const t = (p.textos || {}).saude || {};
    for (const [k, v] of Object.entries(t)) if (PRECO.test(k)) assert.equal(v, '', p.id + ': ' + k + ' na Saúde');
    if (p.familia === 'oferta' && (p.frentes || []).includes('saude')) assert.ok(!/R\$|%|sem juros|parcel/i.test(JSON.stringify(t)), p.id + ': oferta com preço na Saúde');
  }
  // O painel aplica: as peças pela frente e pela época, as telas também.
  assert.match(ler('web/src/lib/telasProntas.js'), /\.filter\(\(t\) => t\.estado === 'aprovada' && naEpoca\(t, perfilDaTela\(t\), hoje\)\)/);
});

test('exemplo com o dia da semana errado não volta: "hoje", não "quinta"', () => {
  const m = manifesto();
  const ERRADO = /(prato do dia|almoço de hoje|só hoje)[^"]*·\s*(segunda|terça|quarta|quinta|sexta|sábado|domingo)/i;
  const textos = [];
  for (const p of m.pecas) {
    textos.push([p.id, ler('pecas-ouro', p.id + '.html')]);
    textos.push([p.id + ' (textos)', JSON.stringify(p.textos || {})]);
  }
  for (const t of m.telas) textos.push([t.id, JSON.stringify(t.zonas)]);
  for (const [id, s] of textos) assert.doesNotMatch(s, ERRADO, id);
  assert.doesNotMatch(ler('pecas-ouro', 'cabecalho-chamada.html'), /Terça do burger em dobro<\/span><small data-campo="quando">só hoje/);
  assert.doesNotMatch(ler('pecas-ouro', 'gente-mes.html'), /data-campo="mes">outubro/);
  // A vitrine: a parcela completa, com o valor.
  const vit = m.telas.find((t) => t.id === 'l1-comercio-vitrine');
  const of = vit.zonas.principal.pecas.find((e) => e.id === 'oferta-foto');
  assert.match(of.campos.parcelas, /\d+\s*×\s*de R\$ \d/);
});

test('preço pela metade não vai ao ar, e o espaço de foto vazio não fica vazio', () => {
  const src = ler('js', 'peca-render.js');
  assert.match(src, /if \(peca\) esconderPrecoIncompleto\(sombra, peca\);/);
  const re = /\d\s*[x×]\s*(de)?\s*(R\$)?\s*$/i;
  for (const t of ['10x de', '10× de R$', '3x']) assert.ok(re.test(t), t);
  for (const t of ['ou 10× de R$ 18,99', '3x de R$ 29,90']) assert.ok(!re.test(t), t);
  assert.match(src, /const PARCELA_SEM_VALOR = \/\\d\\s\*\[x×\]\\s\*\(de\)\?\\s\*\(R\\\$\)\?\\s\*\$\/i;/);
});

test('a TV antes do conteúdo: letra de 4,5% do lado menor, e a espera na marca da conta', () => {
  const css = ler('css', 'player.css');
  const regra = (sel) => { const i = css.indexOf(sel + ' {'); return css.slice(i, css.indexOf('}', i)); };
  const vmin = (sel) => Number((/font-size: ([\d.]+)vmin;/.exec(regra(sel)) || [])[1]);
  assert.ok(vmin('.mt-pairing-hint') >= 4.5, 'a instrução');
  assert.ok(vmin('.mt-pairing-reset') >= 4.5, 'o "Gerar outro código"');
  assert.ok(vmin('.mt-pairing-title') >= 4.5, 'o título');
  assert.match(regra('.mt-pairing-code'), /min\(15vw, 18vmin\)/, 'o código, quatro vezes a instrução');
  assert.match(ler('player.html'), /<div class="mt-pairing-passos">/);
  assert.match(css, /\.mt-pairing\.mt-pairing-da-conta \{ background: #0E0B1F; background: linear-gradient\(135deg, var\(--conta-1/);
  // O servidor manda a marca: na leitura dos dados da TV pareada e vazia, e no aviso de pareamento.
  const srv = ler('server', 'routes', 'telas.js');
  assert.match(srv, /async function marcaDaTv\(tenantId\)/);
  assert.match(srv, /broadcast\(d\.id, 'pareada', \{ nome, em: Date\.now\(\), marca: await marcaDaTv\(sess\.tenant_id\)/);
  assert.match(srv, /if \(dtOk && device\.tenant_id && !device\.config\) return sendJson\(res, 200, Object\.assign\(pubDevice\(device\), \{ marca: await marcaDaTv/);
  const player = ler('js', 'player.js');
  assert.match(player, /guardarMarcaDaEspera\(dados && dados\.marca\);\s+showAguardando\(dados && dados\.nome\);/);
  assert.match(player, /marcaNaEspera\(el, marcaDaEspera\);/);
  assert.match(ler('js', 'cloud.js'), /marca: meta\.marca \|\| null/);
});

test('nenhum recado técnico do "Adicionar" na parede', () => {
  const render = ler('js', 'render.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const t of ['Imagem indisponível', 'Carregando clima', 'Envie um arquivo', 'Escolha um mural', 'Entrada de vídeo indisponível',
    'Em breve, novos aniversários', 'Stream indisponível', 'Mapa indisponível', 'Trânsito indisponível', 'Captura não suportada']) {
    assert.ok(!render.includes(t), 'ainda na TV: ' + t);
  }
  assert.match(render, /function marcaEmCalma\(el\)/);
  const player = ler('js', 'player.js');
  for (const tipo of ['image', 'video', 'youtube', 'pptx', 'mural', 'composicao']) assert.match(player, new RegExp('\\n    ' + tipo + ': \\(it\\) =>'), tipo);
  assert.match(player, /&& \(!MTRender\.temAniversario \|\| MTRender\.temAniversario\(it\)\)/);
});

test('corpo e título do texto e do aviso numa zona grande: 5,2% e 11% da TV de teto', () => {
  const css = ler('css', 'player.css');
  assert.match(css, /\.ann-title \{\s+font-size: max\(var\(--mt-piso, 0px\), clamp\(2\.22vmin, 10\.5cqh, 11vmin\)\);/);
  assert.match(css, /font-size: max\(var\(--mt-piso, 0px\), clamp\(1\.39vmin, 4\.9cqh, 5\.2vmin\)\);\s+line-height: 1\.5;/);
  assert.match(css, /\.mt-text-body \{ font-size: max\(var\(--mt-piso, 0px\), calc\(clamp\(1\.39vmin, min\(4\.8cqw, 5cqh\), 5\.2vmin\)/);
});
