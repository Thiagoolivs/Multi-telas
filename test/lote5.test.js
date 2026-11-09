/*
 * Lote 5 do conteúdo pronto, "movimento": as peças feitas para a FOTO VIVA
 * (o laço curto e mudo no espaço da foto) e a língua de movimento das peças
 * com foto (docs/design/SISTEMA-VISUAL.md, Movimento).
 *
 * O dono pediu as peças "mais premium e animadas". O lote 5 nasce com um
 * vídeo do banco (pecas-ouro/videos/banco.json) em cada espaço principal, o
 * texto sempre num bloco de fundo cheio (nunca sobre o vídeo cru) e a
 * coreografia de cinema: a imagem aproxima, o bloco varre, o filete se
 * desenha, o título se revela, o número conta — e às 2,5 s tudo está parado,
 * menos o vídeo. As telas l5-* montam um pacote por negócio com UM laço por
 * vez na tela (a lateral leva foto). Tudo chega 'proposta'; a régua da TV
 * (tools/regua-tv.mjs) mede cada peça nas 11 marcas, com margem e sem rodapé.
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
const FOTOS = JSON.parse(ler('pecas-ouro/fotos/banco.json'));
const VIDEOS = JSON.parse(ler('pecas-ouro/videos/banco.json'));
const { RAMOS } = require('../js/paletas.js');
const FRENTES = ['comercio', 'saude', 'empresa'];
const LOTE = M.pecas.filter((p) => p.lote === 5);
const LOTE4 = M.pecas.filter((p) => p.lote === 4);
const TELAS = M.telas.filter((t) => t.lote === 5);
const PERFIL = { padaria: 'comercio', restaurante: 'comercio', lanchonete: 'comercio', otica: 'comercio', salao: 'comercio',
  farmacia: 'saude', clinica: 'saude', dentista: 'saude', escritorio: 'empresa', industria: 'empresa' };
const arquivo = (id) => P.doArquivo(ler('pecas-ouro/' + id + '.html'));
const campos = (id) => P.higienizar(arquivo(id)).campos;
const entrada = (e) => (typeof e === 'string' ? { id: e, campos: {} } : { id: e.id, campos: e.campos || {} });
const doBancoDeVideos = (v) => VIDEOS.find((b) => b.arquivo === v);
const doBancoDeFotos = (v) => FOTOS.find((b) => b.arquivo === v);

// Publicidade de saúde (CFM 2.336/2023, CFO 196/2019): sem preço, desconto, brinde nem promessa de resultado.
const PRECO = /R\$|\b\d+,\d{2}\b|%|desconto|gr[aá]tis|promo[cç]/i;
const PROMESSA = /garanti|100\s?%|sem dor|\bcura\b|milagr|definitiv|antes e depois|resultado garantido/i;

test('lote 5: cerca de 15 peças com vídeo, em proposta, com os papéis dos espaços e o laço do banco', () => {
  assert.ok(LOTE.length >= 14, 'lote 5 com ' + LOTE.length + ' peças');
  for (const p of LOTE) {
    assert.equal(p.estado, 'proposta', p.id + ': só vai para as contas depois da galeria');
    assert.match(p.id, /^cena-[a-z-]+$/, p.id + ': as peças do lote 5 começam por "cena-"');
    assert.ok(p.papeis.includes('destaque') && p.papeis.every((x) => ['destaque', 'lateral'].includes(x)), p.id + ': papéis');
    assert.ok(p.frentes.length && p.frentes.every((f) => FRENTES.includes(f)), p.id + ': frentes');
    assert.ok(M.marcas.some((b) => b.id === p.marca), p.id + ': marca de exemplo');
    const espacos = campos(p.id).filter((c) => c.tipo === 'img').map((c) => c.nome);
    assert.deepEqual(Object.keys(p.fotos || {}).sort(), espacos.slice().sort(), p.id + ': espaços declarados');
    // Um laço só por peça (o box toca um vídeo por vez com folga); os outros espaços, foto do banco.
    const comVideo = espacos.filter((n) => P.ehVideo((p.campos || {})[n]));
    assert.equal(comVideo.length, 1, p.id + ': um laço por peça');
    for (const n of espacos) {
      assert.ok(P.PAPEIS_FOTO.includes(p.fotos[n]), p.id + ': papel de ' + n);
      const v = (p.campos || {})[n];
      if (P.ehVideo(v)) {
        const b = doBancoDeVideos(v);
        assert.ok(b, p.id + ': o laço de ' + n + ' não está no banco de vídeos');
        assert.ok(fs.existsSync(path.join(RAIZ, v)) && fs.existsSync(path.join(RAIZ, P.posterDoVideo(v))), p.id + ': vídeo e poster de ' + n);
      } else {
        assert.ok(doBancoDeFotos(v), p.id + ': a foto de ' + n + ' não está no banco de fotos');
      }
    }
  }
  for (const fam of ['oferta', 'institucional', 'social', 'serviço', 'cardápio']) {
    assert.ok(LOTE.some((p) => p.familia === fam), 'família ' + fam);
  }
  // Os formatos pedidos: tela cheia com bloco, dividida, janela, cardápio, horário, QR, número, boas-vindas.
  for (const id of ['cena-capa', 'cena-dividida', 'cena-janela', 'cena-cardapio', 'cena-aberto', 'cena-qr', 'cena-numero', 'cena-boas-vindas']) {
    assert.ok(LOTE.some((p) => p.id === id), 'falta ' + id);
  }
  // O QR do lote 5 fica sobre a textura que se mexe: papel textura (a TV nunca troca pelo fundo desfocado).
  assert.equal(LOTE.find((p) => p.id === 'cena-qr').fotos.foto, 'textura');
});

test('lote 5: cada frente tem o exemplo na língua dela, campo por campo', () => {
  for (const p of LOTE) {
    const nomes = campos(p.id).filter((c) => c.tipo === 'texto' && c.nome !== 'marca').map((c) => c.nome);
    for (const f of p.frentes) {
      const t = (p.textos || {})[f];
      assert.ok(t, p.id + ': sem textos de ' + f);
      for (const k of Object.keys(t)) assert.ok(nomes.includes(k), p.id + ' / ' + f + ': o campo ' + k + ' não existe');
      for (const k of nomes) assert.ok(k in t, p.id + ' / ' + f + ': falta o campo ' + k);
    }
    // O exemplo do HTML é o da marca da peça: nada de nome de outra empresa de exemplo pela metade.
    for (const v of Object.values(p.textos).flatMap((t) => Object.values(t))) assert.doesNotMatch(String(v), /Vértice|Andrade|Nona\b/, p.id + ': "' + v + '"');
  }
});

test('lote 5: só o que a porta deixa, só token de cor, a letra da TV e os seis formatos', () => {
  for (const p of LOTE) {
    const arq = arquivo(p.id);
    const r = P.higienizar(arq);
    assert.deepEqual(r.problemas, [], p.id);
    assert.deepEqual(r.avisos, [], p.id);
    assert.deepEqual(P.validarItem({ type: 'peca-html', html: arq.html, css: arq.css, campos: p.campos || {} }).problemas, [], p.id);
    // Sem SVG, e o autor nunca escreve <video>: o laço entra pelo espaço da foto.
    assert.doesNotMatch(arq.html, /<svg|<video|<source|<img(?![^>]*data-campo-(img|qr))/i, p.id);
    assert.doesNotMatch(arq.css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, p.id);
    assert.ok((arq.css.match(/max\(var\(--mt-piso, 0cqw\)/g) || []).length >= 3, p.id + ': piso da letra');
    assert.match(arq.css, /var\(--mt-escala-titulo, 1\)/, p.id + ': escala do título');
    for (const papel of p.papeis) assert.deepEqual(RC.letrasPequenas(r.css, papel, r.html), [], p.id + ' (' + papel + ')');
    // O Corporativo já com a faixa sem mensagem no rodapé (até 940 px), em pé e quadrada.
    assert.ok(arq.css.includes('@container ((aspect-ratio >= 1.25) and (max-height: 900px)) or ((aspect-ratio >= 1.25) and (aspect-ratio < 1.6) and (max-height: 940px))'), p.id + ': Corporativo');
    for (const cond of ['(aspect-ratio < 1.25)', '(aspect-ratio >= 0.8) and (aspect-ratio < 1.25)']) assert.ok(arq.css.includes('@container ' + cond), p.id + ': @container ' + cond);
    // Com a lateral, também a coluna estreita e a faixa de baixo da TV em pé (onde a lateral mora na tela em pé).
    if (p.papeis.includes('lateral')) {
      assert.ok(arq.css.includes('@container (max-width: 700px)'), p.id + ': lateral');
      assert.ok(arq.css.includes('@container (aspect-ratio >= 1.25) and (max-height: 640px)'), p.id + ': faixa baixa');
    }
  }
});

/*
 * A LÍNGUA DE MOVIMENTO (SISTEMA-VISUAL.md, Movimento): a vez de cada um é
 * 0,15 s + 0,15 s × data-ordem (+ data-atraso). Contenção é o luxo: nada que
 * pula ou gira, um reflexo no máximo (e nenhum na saúde), a última entrada
 * começa até 2,1 s — depois disso só a câmera lenta (e o vídeo) se mexem.
 */
const PROIBIDAS = /data-entrada="(estourar|girar)"|data-continua="(flutuar|pulsar|balancar|brilhar)"/;
const inicio = (attrs) => {
  const ordem = Number((/data-ordem="(\d+)"/.exec(attrs) || [])[1] || 0);
  const atraso = Number((/data-atraso="([\d.]+)"/.exec(attrs) || [])[1] || 0);
  return 0.15 + 0.15 * ordem + atraso;
};
function conferirMovimento(p) {
  assert.deepEqual(P.higienizar(arquivo(p.id)).problemas, [], p.id + ': a porta');
  const html = arquivo(p.id).html;
  assert.doesNotMatch(html, PROIBIDAS, p.id + ': movimento que pula, gira ou não para');
  const reflexos = (html.match(/data-continua="reflexo"/g) || []).length;
  assert.ok(reflexos <= 1, p.id + ': ' + reflexos + ' reflexos');
  if (p.frentes.includes('saude')) assert.equal(reflexos, 0, p.id + ': reflexo numa peça que vai para a saúde');
  // A imagem principal (o primeiro espaço de foto) aproxima e segue em câmera lenta quando é foto.
  const primeira = /<img[^>]*data-campo-img="[^"]+"[^>]*>/.exec(html)[0];
  assert.match(primeira, /data-entrada="aproximar"/, p.id + ': a imagem principal aproxima');
  // O título (ou a frase, ou o número) chega com cinema, não com o deslizar de sempre.
  assert.match(html, /data-entrada="(revelar|contar)"/, p.id + ': sem revelar nem contar');
  for (const m of html.matchAll(/<[a-z0-9]+([^>]*data-entrada="[^"]+"[^>]*)>/g)) {
    assert.ok(inicio(m[1]) <= 2.1 + 1e-9, p.id + ': uma entrada começa às ' + inicio(m[1]).toFixed(2) + ' s');
  }
  // O preço conta até o valor (o elemento que conta é o que tem o campo dentro).
  if (/data-campo="preco"/.test(html)) {
    const i = html.indexOf('data-entrada="contar"');
    assert.ok(i >= 0 && html.slice(i, i + 300).includes('data-campo="preco"'), p.id + ': o preço não conta');
  }
}

test('o movimento: as 29 peças do lote 4 e as do lote 5 falam a mesma língua', () => {
  assert.ok(LOTE4.length >= 28);
  for (const p of LOTE4.concat(LOTE)) conferirMovimento(p);
  // As 23 coreografadas agora (as seis primeiras têm o teste delas em movimento-cinema).
  const cinema = LOTE4.filter((p) => /data-entrada="(revelar|varrer|desenhar|contar|aproximar)"/.test(ler('pecas-ouro/' + p.id + '.html')));
  assert.equal(cinema.length, LOTE4.length, 'peça do lote 4 sem o movimento de cinema');
});

test('lote 5: na saúde, nada de preço, desconto, brinde nem promessa', () => {
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

test('lote 5: as telas l5-*, deitada e em pé, com um laço por vez na tela', () => {
  assert.ok(TELAS.length >= 6 && TELAS.length <= 10, TELAS.length + ' telas');
  const ramos = new Set(RAMOS.map((r) => r.id));
  for (const forma of ['deitada', 'em-pe']) assert.ok(TELAS.filter((t) => t.id.endsWith('-' + forma)).length >= 3, 'telas ' + forma);
  for (const t of TELAS) {
    const [, negocio, forma] = /^l5-([a-z]+)-(deitada|em-pe)$/.exec(t.id) || [];
    assert.ok(negocio, t.id + ': nome');
    assert.equal(t.layout, forma === 'deitada' ? 'corporate' : 'portrait-stack', t.id + ': layout');
    assert.equal(t.estado, 'proposta', t.id);
    assert.equal(t.negocio, negocio, t.id);
    assert.equal(t.perfil, PERFIL[negocio], t.id + ': perfil');
    assert.ok(t.ramos.length && t.ramos.every((r) => ramos.has(r)), t.id + ': ramos');
    assert.ok(t.sobre && t.sobre.length <= 140 && !/PLANO|§|docs\/|bancada|\bzonas?\b|\blote\b/i.test(t.sobre), t.id + ': sobre');
    assert.equal(t.zonas.principal.modo, 'escuro', t.id + ': principal');
    assert.equal(t.zonas.lateral.modo, 'escuro', t.id + ': lateral');
    let zonasComQr = 0;
    for (const [g, z] of Object.entries(t.zonas)) {
      if (z.pecas.some((e) => /data-campo-qr=/.test(ler('pecas-ouro/' + entrada(e).id + '.html')))) zonasComQr++;
      for (const e of z.pecas.map(entrada)) {
        const def = M.pecas.find((p) => p.id === e.id);
        assert.ok(def, t.id + ': ' + e.id + ' não existe');
        if (def.lote === 5) assert.ok(def.frentes.includes(t.perfil), t.id + ': ' + e.id + ' não serve à frente ' + t.perfil);
        const nomes = campos(e.id).map((c) => c.nome);
        for (const k of Object.keys(e.campos)) assert.ok(nomes.includes(k), t.id + ': ' + e.id + ' não tem o campo ' + k);
        if (g === 'principal' || g === 'lateral') assert.equal(def.lote, 5, t.id + ': ' + e.id + ' não é do lote 5');
        for (const c of campos(e.id).filter((x) => x.tipo === 'img')) {
          const v = e.campos[c.nome];
          if (!v) continue;
          if (P.ehVideo(v)) {
            assert.ok(doBancoDeVideos(v), t.id + ': ' + e.id + '.' + c.nome + ' fora do banco de vídeos');
            // Um laço por vez: só a principal toca vídeo; a lateral (ou a faixa de baixo) leva foto.
            assert.equal(g, 'principal', t.id + ': vídeo em ' + g + ' (' + e.id + ')');
          } else {
            assert.ok(doBancoDeFotos(v), t.id + ': ' + e.id + '.' + c.nome + ' fora do banco de fotos');
          }
        }
      }
    }
    // Toda peça da principal tem o laço; QR numa zona só.
    for (const e of t.zonas.principal.pecas.map(entrada)) assert.ok(Object.values(e.campos).some((v) => P.ehVideo(v)), t.id + ': ' + e.id + ' sem vídeo na principal');
    assert.ok(zonasComQr <= 1, t.id + ': QR em ' + zonasComQr + ' zonas');
  }
});

test('o sistema visual descreve o movimento e o lote 5', () => {
  const doc = ler('docs/design/SISTEMA-VISUAL.md');
  assert.match(doc, /## Movimento/);
  for (const palavra of ['aproximar', 'kenburns', 'varrer', 'desenhar', 'revelar', 'contar', 'reflexo', 'lote 5', 'um laço por vez']) {
    assert.ok(doc.toLowerCase().includes(palavra.toLowerCase()), 'o sistema visual não fala de ' + palavra);
  }
});
