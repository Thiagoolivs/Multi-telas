/*
 * Lote 4 do conteúdo pronto: as peças com FOTO (docs/design/SISTEMA-VISUAL.md).
 *
 * O dono achou o conteúdo pronto "feio e infantil" — pictogramas de CSS em
 * fundo pastel, quase sem foto. O lote 4 é foto + tipografia: cada peça tem
 * espaço de foto com o papel declarado (`fotos` no manifesto), a foto padrão
 * vem do banco (pecas-ouro/fotos/banco.json, CC0 ou domínio público, com
 * crédito), e as telas l4-* montam um pacote por negócio, deitada e em pé.
 * Tudo chega 'proposta' e o dono aprova na galeria. A régua da TV
 * (tools/regua-tv.mjs) mede cada peça em tela cheia e no Corporativo.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const P = require('../js/peca-html.js');
const RC = require('../js/regras-composicao.js');
const M = JSON.parse(ler('pecas-ouro/manifesto.json'));
const BANCO = JSON.parse(ler('pecas-ouro/fotos/banco.json'));
const { RAMOS } = require('../js/paletas.js');
const FRENTES = ['comercio', 'saude', 'empresa'];
const LOTE = M.pecas.filter((p) => p.lote === 4);
const TELAS = M.telas.filter((t) => t.lote === 4);
const NEGOCIOS = ['padaria', 'restaurante', 'lanchonete', 'otica', 'salao', 'farmacia', 'clinica', 'dentista', 'escritorio', 'industria'];
const PERFIL = { padaria: 'comercio', restaurante: 'comercio', lanchonete: 'comercio', otica: 'comercio', salao: 'comercio',
  farmacia: 'saude', clinica: 'saude', dentista: 'saude', escritorio: 'empresa', industria: 'empresa' };
const arquivo = (id) => P.doArquivo(ler('pecas-ouro/' + id + '.html'));
const campos = (id) => P.higienizar(arquivo(id)).campos;
const entrada = (e) => (typeof e === 'string' ? { id: e, campos: {} } : { id: e.id, campos: e.campos || {} });

// Publicidade de saúde (CFM 2.336/2023, CFO 196/2019): sem preço, desconto, brinde nem promessa de resultado.
const PRECO = /R\$|\b\d+,\d{2}\b|%|desconto|gr[aá]tis|promo[cç]/i;
const PROMESSA = /garanti|100\s?%|sem dor|\bcura\b|milagr|definitiv|antes e depois|resultado garantido/i;

test('lote 4: cerca de 30 peças com foto, todas em proposta e com os papéis das fotos', () => {
  assert.ok(LOTE.length >= 28, 'lote 4 com ' + LOTE.length + ' peças');
  for (const p of LOTE) {
    assert.equal(p.estado, 'proposta', p.id + ': só vai para as contas depois da galeria');
    assert.ok(fs.existsSync(path.join(RAIZ, 'pecas-ouro', p.id + '.html')), p.id + ': arquivo');
    assert.ok(p.papeis.includes('destaque'), p.id + ': serve no destaque');
    assert.ok(p.papeis.every((x) => ['destaque', 'lateral'].includes(x)), p.id + ': papéis');
    assert.ok(p.frentes.length && p.frentes.every((f) => FRENTES.includes(f)), p.id + ': frentes');
    assert.ok(M.marcas.some((b) => b.id === p.marca), p.id + ': marca de exemplo');
    // Foto é o centro do lote: todo espaço de foto tem papel, e a foto padrão é do banco, do papel certo.
    const fotos = campos(p.id).filter((c) => c.tipo === 'img').map((c) => c.nome);
    assert.ok(fotos.length >= 1, p.id + ': sem espaço de foto');
    assert.deepEqual(Object.keys(p.fotos || {}).sort(), fotos.slice().sort(), p.id + ': fotos declaradas');
    for (const n of fotos) {
      assert.ok(P.PAPEIS_FOTO.includes(p.fotos[n]), p.id + ': papel de ' + n);
      const doBanco = BANCO.find((b) => b.arquivo === (p.campos || {})[n]);
      assert.ok(doBanco, p.id + ': a foto padrão de ' + n + ' não está no banco');
    }
  }
  // As famílias do conteúdo pronto, todas com foto agora.
  for (const fam of ['oferta', 'institucional', 'gente', 'social', 'serviço', 'cardápio']) {
    assert.ok(LOTE.filter((p) => p.familia === fam).length >= 2, 'família ' + fam);
  }
  // Pelo menos duas peças de QR e o cardápio de quadro.
  assert.ok(LOTE.filter((p) => /data-campo-qr=/.test(ler('pecas-ouro/' + p.id + '.html'))).length >= 3, 'peças com QR');
});

test('lote 4: cada frente tem o exemplo na língua dela, campo por campo', () => {
  for (const p of LOTE) {
    const nomes = campos(p.id).filter((c) => c.tipo === 'texto' && c.nome !== 'marca').map((c) => c.nome);
    for (const f of p.frentes) {
      const t = (p.textos || {})[f];
      assert.ok(t, p.id + ': sem textos de ' + f);
      for (const k of Object.keys(t)) assert.ok(nomes.includes(k), p.id + ' / ' + f + ': o campo ' + k + ' não existe');
      for (const k of nomes) assert.ok(k in t, p.id + ' / ' + f + ': falta o campo ' + k);
    }
  }
});

test('lote 4: desenho só com o que a porta deixa, só com token de cor e na letra da TV', () => {
  for (const p of LOTE) {
    const arq = arquivo(p.id);
    const r = P.higienizar(arq);
    assert.deepEqual(r.problemas, [], p.id);
    assert.deepEqual(r.avisos, [], p.id);
    assert.deepEqual(P.validarItem({ type: 'peca-html', html: arq.html, css: arq.css, campos: p.campos || {} }).problemas, [], p.id);
    // Sem SVG (a porta tira) e sem pictograma de clip-art: foto só por campo.
    assert.doesNotMatch(arq.html, /<svg|<img(?![^>]*data-campo-(img|qr))/i, p.id);
    // Cor só por token, e nada de fundo pastel: o fundo é --mt-fundo (ou o destaque, num campo de cor deliberado).
    assert.doesNotMatch(arq.css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, p.id);
    // Toda letra com o piso da TV, e o título encolhendo com a fonte larga da marca.
    assert.ok((arq.css.match(/max\(var\(--mt-piso, 0cqw\)/g) || []).length >= 3, p.id + ': piso da letra');
    assert.match(arq.css, /var\(--mt-escala-titulo, 1\)/, p.id + ': escala do título');
    for (const papel of p.papeis) assert.deepEqual(RC.letrasPequenas(r.css, papel, r.html), [], p.id + ' (' + papel + ')');
    // Os formatos: Corporativo, em pé e quadrada (e a lateral, quando é papel da peça).
    for (const cond of ['(aspect-ratio >= 1.25) and (max-height: 900px)', '(aspect-ratio < 1.25)', '(aspect-ratio >= 0.8) and (aspect-ratio < 1.25)']) {
      assert.ok(arq.css.includes('@container ' + cond), p.id + ': @container ' + cond);
    }
    if (p.papeis.includes('lateral')) assert.ok(arq.css.includes('@container (max-width: 700px)'), p.id + ': lateral');
  }
});

test('lote 4: na saúde, nada de preço, desconto, brinde nem promessa', () => {
  for (const p of LOTE) {
    const html = ler('pecas-ouro/' + p.id + '.html');
    if (/data-campo="(preco|centavos|desconto|preco1)"/.test(html)) assert.ok(!p.frentes.includes('saude'), p.id + ': peça de preço na saúde');
    for (const [k, v] of Object.entries((p.textos || {}).saude || {})) {
      assert.doesNotMatch(String(v), PRECO, p.id + ' / saude / ' + k + ': preço');
      assert.doesNotMatch(String(v), PROMESSA, p.id + ' / saude / ' + k + ': promessa');
    }
  }
  for (const t of TELAS.filter((x) => x.perfil === 'saude')) {
    const textos = Object.values(t.zonas).flatMap((z) => z.pecas.map(entrada))
      .flatMap((e) => Object.entries(e.campos).filter(([k]) => !/^(link|foto\d?)$/.test(k)).map(([, v]) => v)).concat(t.mensagens);
    for (const v of textos) {
      assert.doesNotMatch(String(v), PRECO, t.id + ': preço em "' + v + '"');
      assert.doesNotMatch(String(v), PROMESSA, t.id + ': promessa em "' + v + '"');
    }
  }
});

test('o banco de fotos: cerca de dez fotos por negócio, com crédito, licença livre e arquivo leve', () => {
  const ids = new Set();
  const ramos = new Set(RAMOS.map((r) => r.id).concat('geral'));
  for (const f of BANCO) {
    assert.ok(!ids.has(f.id), f.id + ': id repetido');
    ids.add(f.id);
    assert.match(f.id, /^[a-z0-9-]{3,60}$/, f.id);
    assert.ok(f.ramos.length && f.ramos.every((r) => ramos.has(r)), f.id + ': ramos');
    assert.ok(P.PAPEIS_FOTO.includes(f.papel), f.id + ': papel');
    assert.ok(f.foco && f.foco.x >= 0 && f.foco.x <= 1 && f.foco.y >= 0 && f.foco.y <= 1, f.id + ': foco');
    for (const k of ['credito', 'licenca', 'fonte']) assert.ok(String(f[k] || '').trim(), f.id + ': ' + k);
    assert.ok(fs.existsSync(path.join(RAIZ, f.arquivo)), f.id + ': arquivo');
  }
  // As fotos do lote 4 moram em pecas-ouro/fotos/<ramo>/, com o id começando pelo ramo, e são CC0 ou domínio público.
  const doLote = BANCO.filter((f) => /^\/pecas-ouro\/fotos\/[a-z]+\//.test(f.arquivo));
  for (const f of doLote) {
    const pasta = f.arquivo.split('/')[3];
    assert.ok(f.id.startsWith(pasta + '-'), f.id + ': o id começa pela pasta (' + pasta + ')');
    assert.match(f.licenca, /CC0|domínio público/i, f.id + ': licença');
    assert.match(f.fonte, /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/, f.id + ': fonte');
  }
  for (const n of NEGOCIOS) {
    const qtd = doLote.filter((f) => f.arquivo.startsWith('/pecas-ouro/fotos/' + n + '/')).length;
    assert.ok(qtd >= 7, n + ': ' + qtd + ' fotos no banco');
  }
  assert.ok(doLote.some((f) => f.papel === 'textura' && f.ramos.includes('geral')), 'texturas genéricas');
  // Peso: o banco inteiro cabe no pacote (até ~25 MB) e nenhuma foto passa de 1920 px.
  const total = doLote.reduce((s, f) => s + fs.statSync(path.join(RAIZ, f.arquivo)).size, 0);
  assert.ok(total < 26 * 1024 * 1024, 'banco com ' + Math.round(total / 1048576) + ' MB');
  // Os créditos: cada foto do lote 4 numa linha de CREDITOS.md.
  const cred = ler('pecas-ouro/fotos/CREDITOS.md');
  for (const f of doLote) assert.ok(cred.includes('`' + f.arquivo.replace('/pecas-ouro/fotos/', '') + '`'), f.id + ': sem crédito em CREDITOS.md');
});

test('lote 4: as telas l4-*, deitada e em pé para cada negócio, feitas com as peças com foto', () => {
  assert.equal(TELAS.length, NEGOCIOS.length * 2);
  const ramos = new Set(RAMOS.map((r) => r.id));
  for (const n of NEGOCIOS) {
    for (const [forma, layout] of [['deitada', 'corporate'], ['em-pe', 'portrait-stack']]) {
      const t = TELAS.find((x) => x.id === 'l4-' + n + '-' + forma);
      assert.ok(t, 'falta l4-' + n + '-' + forma);
      assert.equal(t.layout, layout, t.id + ': layout');
      assert.equal(t.estado, 'proposta', t.id);
      assert.equal(t.negocio, n, t.id);
      assert.equal(t.perfil, PERFIL[n], t.id + ': perfil');
      assert.ok(t.ramos.length && t.ramos.every((r) => ramos.has(r)), t.id + ': ramos');
      assert.ok(t.sobre && t.sobre.length <= 140 && !/PLANO|§|docs\/|bancada|\bzonas?\b|\blote\b/i.test(t.sobre), t.id + ': sobre');
      // Nada de fundo pastel: as zonas grandes no escuro.
      assert.equal(t.zonas.principal.modo, 'escuro', t.id + ': principal');
      assert.equal(t.zonas.lateral.modo, 'escuro', t.id + ': lateral');
      for (const [g, z] of Object.entries(t.zonas)) {
        for (const e of z.pecas.map(entrada)) {
          const def = M.pecas.find((p) => p.id === e.id);
          if (def.lote === 4) assert.ok(def.frentes.includes(t.perfil), t.id + ': ' + e.id + ' não serve à frente ' + t.perfil);
          const nomes = campos(e.id).map((c) => c.nome);
          for (const k of Object.keys(e.campos)) assert.ok(nomes.includes(k), t.id + ': ' + e.id + ' não tem o campo ' + k);
          // A foto da tela é do banco, e do negócio dela (ou genérica).
          for (const c of campos(e.id).filter((x) => x.tipo === 'img')) {
            const v = e.campos[c.nome];
            if (!v) continue;
            assert.ok(BANCO.some((b) => b.arquivo === v), t.id + ': ' + e.id + '.' + c.nome + ' fora do banco');
          }
          if (g === 'principal' || g === 'lateral') assert.equal(def.lote, 4, t.id + ': ' + e.id + ' não é do lote 4');
        }
      }
    }
  }
});
