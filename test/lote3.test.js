/*
 * Lote 3 do conteúdo pronto (fase 9): as peças-ouro que faltavam para os
 * "12 modelos-mestre por frente" e as telas prontas feitas com elas.
 *
 * Desenhadas sem foto (a IA de imagem estava sem crédito): o desenho é CSS
 * (ícones, padrões, carimbos) e tipografia. Tudo chega 'proposta' e o dono
 * aprova na galeria (Plataforma › Conteúdo pronto). A régua da TV
 * (tools/regua-tv.mjs) mede cada uma em tela cheia, sozinha.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');
const P = require('../js/peca-html.js');
const M = JSON.parse(ler('pecas-ouro/manifesto.json'));
const FRENTES = ['comercio', 'saude', 'empresa'];
const CASA = { otica: 'comercio', padaria: 'comercio', salao: 'comercio', lanchonete: 'comercio', restaurante: 'comercio',
  clinica: 'saude', dentista: 'saude', farmacia: 'saude', rotasul: 'empresa', escritorio: 'empresa', industria: 'empresa' };
const LOTE = M.pecas.filter((p) => p.lote === 3);
const campos = (id) => P.higienizar(P.doArquivo(ler('pecas-ouro/' + id + '.html'))).campos;
const textosDe = (id) => campos(id).filter((c) => c.tipo === 'texto' && c.nome !== 'marca').map((c) => c.nome);

// Publicidade de saúde (CFM 2.336/2023, CFO 196/2019): sem preço, sem promessa de resultado.
const PRECO = /R\$|\b\d+,\d{2}\b/;
const PROMESSA = /garanti|100\s?%|sem dor|\bcura\b|milagr|definitiv/i;

test('lote 3: as peças que faltavam, cada uma com o lugar dela na TV', () => {
  assert.ok(LOTE.length >= 18, 'lote 3 com ' + LOTE.length + ' peças');
  const ids = new Set(LOTE.map((p) => p.id));
  // As lacunas do plano (fase 9), por frente.
  for (const id of ['indicador-meta', 'gente-destaque', 'servico-semana', 'servico-ramais', 'social-pesquisa', 'cardapio-semana', 'servico-epi', 'indicador-turno',
    'social-campanha', 'servico-preparo', 'servico-convenios', 'gente-equipe', 'servico-vacina', 'servico-espera', 'servico-hora',
    'oferta-relampago', 'oferta-kit', 'oferta-chegou', 'social-fidelidade', 'social-delivery', 'social-wifi', 'servico-pagamento', 'social-nota']) {
    assert.ok(ids.has(id), 'falta a peça ' + id);
  }
  assert.ok(LOTE.filter((p) => p.familia === 'ambiente').length >= 2, 'modo ambiente: pelo menos duas artes calmas');
  for (const p of LOTE) {
    assert.equal(p.estado, 'proposta', p.id + ': só vai para as contas depois da galeria');
    assert.ok(fs.existsSync(path.join(RAIZ, 'pecas-ouro', p.id + '.html')), p.id + ': arquivo');
    // Destaque e lateral: entra na régua de tela cheia e na do escritório, e serve na tela quadrada (sem lateral).
    assert.ok(p.papeis.includes('destaque') && p.papeis.includes('lateral'), p.id + ': destaque e lateral');
    assert.ok(p.frentes.length && p.frentes.every((f) => FRENTES.includes(f)), p.id + ': frentes');
    assert.ok(M.marcas.some((b) => b.id === p.marca), p.id + ': marca de exemplo');
    assert.ok(p.frentes.includes(CASA[p.marca]), p.id + ': nasce numa marca da própria frente');
  }
  // Cada frente ganha peças novas (o caminho dos 12 modelos-mestre).
  for (const f of FRENTES) assert.ok(LOTE.filter((p) => p.frentes.includes(f)).length >= 10, f + ': peças do lote 3');
});

test('lote 3: cada frente tem o exemplo na língua dela, campo por campo', () => {
  for (const p of LOTE) {
    const nomes = textosDe(p.id);
    for (const f of p.frentes) {
      const t = (p.textos || {})[f];
      assert.ok(t, p.id + ': sem textos de ' + f);
      for (const k of Object.keys(t)) assert.ok(nomes.includes(k), p.id + ' / ' + f + ': o campo ' + k + ' não existe');
      // Todos os campos de texto: nada da marca de exemplo vaza para a frente do cliente.
      for (const k of nomes) assert.ok(k in t, p.id + ' / ' + f + ': falta o campo ' + k);
    }
    for (const k of Object.keys(p.campos || {})) assert.ok(campos(p.id).some((c) => c.nome === k), p.id + ': campo de exemplo ' + k);
  }
});

test('lote 3: na saúde, nada de preço nem promessa', () => {
  for (const p of LOTE) {
    const html = ler('pecas-ouro/' + p.id + '.html');
    // Peça com campo de preço não serve à saúde (dentista e médico não anunciam preço).
    if (/data-campo="(preco|centavos)"/.test(html)) assert.ok(!p.frentes.includes('saude'), p.id + ': peça de preço na saúde');
    const saude = p.textos && p.textos.saude;
    if (!saude) continue;
    for (const [k, v] of Object.entries(saude)) {
      assert.doesNotMatch(String(v), PRECO, p.id + ' / saude / ' + k + ': preço');
      assert.doesNotMatch(String(v), PROMESSA, p.id + ' / saude / ' + k + ': promessa');
    }
  }
});

test('lote 3: desenho só com o que a porta deixa, na régua da TV', () => {
  for (const p of LOTE) {
    const arq = P.doArquivo(ler('pecas-ouro/' + p.id + '.html'));
    const r = P.higienizar(arq);
    assert.deepEqual(r.problemas, [], p.id);
    assert.deepEqual(r.avisos, [], p.id);
    assert.ok(r.html.split('<').length - 1 <= P.LIMITES.elementos * 2, p.id + ': elementos');
    // Sem foto e sem SVG: a ilustração é CSS (a porta tira <svg> com o conteúdo).
    assert.doesNotMatch(arq.html, /<svg|<img(?![^>]*data-campo-(img|qr))/i, p.id);
    // A letra miúda respeita o piso da TV (--mt-piso) e o título encolhe com a fonte larga da marca.
    assert.ok((arq.css.match(/max\(var\(--mt-piso, 0cqw\)/g) || []).length >= 8, p.id + ': piso da letra');
    assert.match(arq.css, /var\(--mt-escala-titulo, 1\)/, p.id + ': escala do título');
    // As zonas: coluna estreita (lateral), em pé, quadrada e a faixa baixa da TV em pé.
    for (const cond of ['(max-width: 700px)', '(aspect-ratio < 1.25)', '(aspect-ratio >= 0.8) and (aspect-ratio < 1.25)', '(aspect-ratio >= 1.25) and (max-height: 640px)']) {
      assert.ok(arq.css.includes('@container ' + cond), p.id + ': @container ' + cond);
    }
  }
  // Modo ambiente: a frase é opcional — em branco, some.
  for (const p of LOTE.filter((x) => x.familia === 'ambiente')) assert.match(ler('pecas-ouro/' + p.id + '.html'), /\.frase:empty|:has\(\.frase:empty\)/, p.id);
});

/*
 * As telas do lote 3: dois formatos por negócio, seis de cada orientação,
 * feitas com as peças novas. Conferidas na bancada no tamanho de verdade:
 * a letra inteira (piso sem ceder) em todas as zonas das 18.
 */
const TELAS = M.telas.filter((t) => t.lote === 3);
const NEGOCIOS = ['padaria', 'restaurante', 'otica', 'salao', 'farmacia', 'clinica', 'dentista', 'escritorio', 'industria'];
const LAYOUT = { deitada: 'corporate', 'em-pe': 'portrait-stack', quadrada: 'square-hero' };
const { RAMOS } = require('../js/paletas.js');
const entrada = (e) => (typeof e === 'string' ? { id: e, campos: {} } : { id: e.id, campos: e.campos || {} });

test('lote 3: telas prontas por negócio, nas três orientações', () => {
  assert.ok(TELAS.length >= 12, 'lote 3 com ' + TELAS.length + ' telas');
  for (const n of NEGOCIOS) assert.ok(TELAS.some((t) => t.negocio === n), n + ' sem tela no lote 3');
  for (const [forma, layout] of Object.entries(LAYOUT)) assert.ok(TELAS.filter((t) => t.layout === layout).length >= 4, forma + ': poucas telas');
  const ramos = new Set(RAMOS.map((r) => r.id));
  for (const t of TELAS) {
    const forma = Object.keys(LAYOUT).find((f) => t.id.endsWith('-' + f));
    assert.ok(forma && t.id === 'l3-' + t.negocio + '-' + forma, t.id + ': id');
    assert.equal(t.layout, LAYOUT[forma], t.id + ': layout');
    assert.equal(t.estado, 'proposta', t.id + ': só vai para as contas depois da galeria');
    assert.ok(NEGOCIOS.includes(t.negocio), t.id + ': negócio');
    assert.ok(FRENTES.includes(t.perfil), t.id + ': perfil');
    assert.ok(t.ramos.length && t.ramos.every((r) => ramos.has(r)), t.id + ': ramos da Marca');
    assert.ok(M.marcas.some((b) => b.id === t.marca), t.id + ': marca de exemplo');
    assert.equal(CASA[t.marca], t.perfil, t.id + ': marca da própria frente');
    assert.equal('lateral' in t.zonas, forma !== 'quadrada', t.id + ': a quadrada não tem lado');
    // O texto do cartão é de cliente: sem nota interna (web/src/lib/telasProntas.js, descricaoDaTela).
    assert.ok(t.sobre && t.sobre.length <= 140 && !/PLANO|§|docs\/|bancada|\bzonas?\b|\blote\b/i.test(t.sobre), t.id + ': sobre');
    // Cada tela mostra peças novas: o lote 3 não é o lote 2 com outro nome.
    const novas = Object.values(t.zonas).flatMap((z) => z.pecas.map(entrada)).filter((e) => LOTE.some((p) => p.id === e.id));
    assert.ok(novas.length >= 2, t.id + ': peças do lote 3');
    for (const z of Object.values(t.zonas)) {
      for (const e of z.pecas.map(entrada)) {
        const def = M.pecas.find((p) => p.id === e.id);
        // A peça do lote 3 serve à frente da tela.
        if (def.lote === 3) assert.ok(def.frentes.includes(t.perfil), t.id + ': ' + e.id + ' não serve à frente ' + t.perfil);
        const nomes = campos(e.id).map((c) => c.nome);
        for (const k of Object.keys(e.campos)) assert.ok(nomes.includes(k), t.id + ': ' + e.id + ' não tem o campo ' + k);
      }
    }
  }
});

test('lote 3: tela de saúde sem preço e sem promessa, nem no letreiro', () => {
  for (const t of TELAS.filter((x) => x.perfil === 'saude')) {
    const textos = Object.values(t.zonas).flatMap((z) => z.pecas.map(entrada))
      .flatMap((e) => Object.entries(e.campos).filter(([k]) => !/^(link|wifi)$/.test(k)).map(([, v]) => v))
      .concat(t.mensagens);
    for (const v of textos) {
      assert.doesNotMatch(String(v), PRECO, t.id + ': preço em "' + v + '"');
      assert.doesNotMatch(String(v), PROMESSA, t.id + ': promessa em "' + v + '"');
    }
    for (const z of Object.values(t.zonas)) {
      for (const e of z.pecas.map(entrada)) assert.doesNotMatch(ler('pecas-ouro/' + e.id + '.html'), /data-campo="preco"/, t.id + ': peça de preço');
    }
  }
});
