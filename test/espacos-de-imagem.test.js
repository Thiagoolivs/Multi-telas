/*
 * Espaços de imagem: qualquer foto fica bem em qualquer composição.
 *
 * O cliente enche o espaço de foto de uma peça com a foto do celular, uma do
 * banco de fotos do ramo dele ou uma gerada pela IA (o "Trocar foto" do
 * painel). Aqui, o que garante isso:
 *
 *   - o formato do item: o arquivo continua TEXTO em `campos` (o item
 *     antigo, a TV antiga e a conferência do servidor seguem iguais), e o
 *     papel, o foco e o fundo desfocado moram em `espacos`;
 *   - a decisão de encaixe (cobrir em volta do foco, ou a foto inteira com
 *     o fundo desfocado), a mesma na TV, na bancada e no painel;
 *   - o índice do banco de fotos (pecas-ouro/fotos/banco.json) e os papéis
 *     no manifesto;
 *   - a rota POST /api/ia/imagem: foto de exemplo sem IA, freio por conta,
 *     uso registrado, e a frase certa quando o gerador está sem crédito.
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
const P = require('../js/peca-html.js');
const R = require('../js/peca-render.js');
const iaImagem = require('../server/ia-imagem.js');
const motores = require('../server/motores.js');
const cred = require('../server/creditos.js');

const RAIZ = path.join(__dirname, '..');
const ler = (...p) => fs.readFileSync(path.join(RAIZ, ...p), 'utf8');
const OFERTA = P.doArquivo(ler('pecas-ouro', 'oferta-foto.html'));
const peca = (extra) => Object.assign({ type: 'peca-html', html: OFERTA.html, css: OFERTA.css }, extra);
const FUNDO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

/* ---------------- O formato do item ---------------- */

test('o foco: { x, y } de 0 a 1, dentro da foto; o resto não é foco', () => {
  assert.deepEqual(P.lerFoco({ x: 0.54, y: 0.46 }), { x: 0.54, y: 0.46 });
  assert.deepEqual(P.lerFoco({ x: '0.25', y: 0 }), { x: 0.25, y: 0 });
  assert.deepEqual(P.lerFoco({ x: -0.0001, y: 1.0004 }), { x: 0, y: 1 }, 'o arredondamento que passa da borda volta para ela');
  assert.deepEqual(P.lerFoco({ x: 0.123456, y: 0.5 }), { x: 0.123, y: 0.5 });
  // 54 (alguém quis dizer 54%) não vira o canto: não é foco.
  for (const ruim of [null, 'meio', { x: 0.5 }, { x: 'a', y: 0.2 }, { x: true, y: 0.2 }, { x: '', y: 0.1 }, { x: NaN, y: 0.1 }, { x: 0.5, y: 500 }, { x: 54, y: 46 }, { x: -3, y: 0.5 }]) {
    assert.equal(P.lerFoco(ruim), null, JSON.stringify(ruim));
  }
  assert.deepEqual(P.fotoDoCampo('/media/t1/a.jpg'), { src: '/media/t1/a.jpg', foco: null });
  assert.deepEqual(P.fotoDoCampo({ src: '/media/t1/a.jpg', foco: { x: 0.3, y: 0.7 } }), { src: '/media/t1/a.jpg', foco: { x: 0.3, y: 0.7 } });
  assert.deepEqual(P.fotoDoCampo(null), { src: '', foco: null });
});

test('item antigo, com a foto em texto, sai exatamente como antes (sem espaços)', () => {
  const v = P.validarItem(peca({ campos: { foto: '/media/t1/abc.jpg', titulo: 'Óculos' } }));
  assert.equal(v.ok, true, v.problemas.join('\n'));
  assert.deepEqual(v.item.campos, { foto: '/media/t1/abc.jpg', titulo: 'Óculos' });
  assert.equal('espacos' in v.item, false, 'item antigo ganhou campo novo');
  assert.deepEqual(P.fotosDoItem(v.item), ['/media/t1/abc.jpg']);
});

test('a foto com foco ({ src, foco }) vira texto em campos e o foco vai para espacos', () => {
  const v = P.validarItem(peca({
    campos: { foto: { src: '/pecas-ouro/fotos/otica-sol.jpg', foco: { x: 0.54, y: 0.46 } } },
    espacos: { foto: { papel: 'produto', fundo: FUNDO } },
  }));
  assert.equal(v.ok, true, v.problemas.join('\n'));
  assert.equal(v.item.campos.foto, '/pecas-ouro/fotos/otica-sol.jpg', 'quem lê campos tem que continuar achando texto');
  assert.deepEqual(v.item.espacos, { foto: { papel: 'produto', foco: { x: 0.54, y: 0.46 }, fundo: FUNDO } });
  // O foco escrito no espaço também vale; o do campo vence.
  const s = P.validarItem(peca({ campos: { foto: '/media/t1/a.jpg' }, espacos: { foto: { foco: { x: 0.1, y: 0.9 } } } }));
  assert.deepEqual(s.item.espacos.foto.foco, { x: 0.1, y: 0.9 });
  // A pré-carga da TV lê o valor novo também (item ainda não passado pela porta).
  assert.deepEqual(P.fotosDoItem(peca({ campos: { foto: { src: '/media/t1/b.jpg', foco: { x: 0.5, y: 0.5 } } } })), ['/media/t1/b.jpg']);
});

test('espaços: só o que se conhece, só nos campos de foto da peça; foco e fundo só com foto', () => {
  const v = P.validarItem(peca({
    campos: { foto: '/media/t1/a.jpg' },
    espacos: {
      foto: { papel: 'vitrine', foco: { x: 0.2, y: 0.2 }, fundo: 'https://fora.example/a.jpg', extra: 'x' },
      titulo: { papel: 'produto' },
      inventado: { papel: 'pessoa' },
    },
  }));
  assert.equal(v.ok, true, 'espaço ruim não recusa a tela: sai calado');
  assert.deepEqual(v.item.espacos, { foto: { foco: { x: 0.2, y: 0.2 } } });
  for (const ruim of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,AAA")', 'data:image/jpeg;base64,' + 'A'.repeat(5000), '/media/t1/a.jpg']) {
    assert.equal((P.validarItem(peca({ campos: { foto: '/media/t1/a.jpg' }, espacos: { foto: { fundo: ruim } } })).item.espacos), undefined, ruim.slice(0, 40));
  }
  // Sem foto no campo: o papel fica (é do espaço), o foco e o fundo não (eram da foto).
  const sem = P.validarItem(peca({ espacos: { foto: { papel: 'pessoa', foco: { x: 0.5, y: 0.5 }, fundo: FUNDO } } }));
  assert.deepEqual(sem.item.espacos, { foto: { papel: 'pessoa' } });
  // A foto de fora continua recusada, com ou sem foco.
  const fora = P.validarItem(peca({ campos: { foto: { src: 'https://images.unsplash.com/photo-1', foco: { x: 0.5, y: 0.5 } } } }));
  assert.equal(fora.ok, false);
  assert.ok(fora.problemas.some((p) => /foto do campo "foto"/.test(p)));
  assert.equal(fora.item.espacos, undefined);
});

test('a conferência do servidor (conferirConfig) aceita a foto nova e grava no formato de sempre', () => {
  const cfg = {
    settings: { ambiente: { peca: peca({ campos: { foto: '/media/t1/c.jpg' }, espacos: { foto: { papel: 'textura' } } }) } },
    zonas: {
      principal: { items: [
        peca({ id: 'nova', campos: { foto: { src: '/pecas-ouro/fotos/otica-sol.jpg', foco: { x: 0.54, y: 0.46 } } }, espacos: { foto: { papel: 'produto', fundo: FUNDO } } }),
        peca({ id: 'antiga', campos: { foto: '/media/t1/d.jpg' } }),
        peca({ id: 'sobra', campos: { foto: '/media/t1/e.jpg' }, espacos: { foto: { papel: 'inventado' }, titulo: { papel: 'produto' } } }),
      ] },
    },
  };
  assert.deepEqual(P.conferirConfig(cfg).problemas, []);
  const [nova, antiga, sobra] = cfg.zonas.principal.items;
  assert.equal(nova.id, 'nova');
  assert.equal(nova.campos.foto, '/pecas-ouro/fotos/otica-sol.jpg');
  assert.deepEqual(nova.espacos.foto, { papel: 'produto', foco: { x: 0.54, y: 0.46 }, fundo: FUNDO });
  assert.equal(antiga.campos.foto, '/media/t1/d.jpg');
  assert.equal('espacos' in antiga, false);
  assert.equal('espacos' in sobra, false, 'o espaço que a porta jogou fora ficou escondido no item gravado');
  assert.deepEqual(cfg.settings.ambiente.peca.espacos, { foto: { papel: 'textura' } });
  // Conferir de novo o que saiu não muda nada.
  const antes = JSON.stringify(cfg);
  P.conferirConfig(cfg);
  assert.equal(JSON.stringify(cfg), antes);
});

/* ---------------- A decisão de encaixe ---------------- */

test('encaixe: cobrir quando cabe; a foto inteira com o fundo desfocado quando o formato não combina', () => {
  const e = (fotoW, fotoH, espacoW, espacoH, papel, foco) => R.encaixeDaFoto({ fotoW, fotoH, espacoW, espacoH, papel, foco });
  // A foto deitada no espaço deitado: cobre.
  assert.equal(e(1600, 1067, 1920, 1080, 'produto').modo, 'cobrir');
  // A foto em pé na TV deitada inteira: perderia 62% — inteira, com o fundo desfocado.
  const empe = e(1200, 1800, 1920, 1080, 'produto');
  assert.deepEqual([empe.modo, empe.motivo, empe.corte], ['conter', 'formato', 0.625]);
  // O mesmo exemplo aprovado na bancada (oferta-foto, 16:9: o espaço é 64% da largura) continua cortado como o dono aprovou.
  assert.equal(e(1200, 1800, 1229, 1080, 'produto').modo, 'cobrir');
  // O ambiente aguenta mais corte; a pessoa, menos que o produto.
  assert.equal(e(1200, 1800, 1920, 1080, 'ambiente').modo, 'conter');
  assert.equal(e(1000, 1000, 1700, 1000, 'produto').modo, 'cobrir', 'perde 41%: o produto aguenta');
  assert.equal(e(1000, 1000, 1700, 1000, 'pessoa').modo, 'conter', 'perde 41%: corta a cabeça');
  // Com o foco escolhido, a folga cresce: o ponto que importa já está garantido no quadro.
  assert.equal(e(1200, 1800, 1920, 1080, 'ambiente', { x: 0.5, y: 0.3 }).modo, 'cobrir');
  assert.equal(e(1000, 1000, 1700, 1000, 'pessoa', { x: 0.5, y: 0.3 }).modo, 'cobrir');
  // Textura é fundo: cobre sempre, por mais torta que seja.
  assert.equal(e(500, 3000, 1920, 200, 'textura').modo, 'cobrir');
  // Pequena demais para cobrir sem borrar (mais de 2,5×): inteira, no meio.
  const pequena = e(400, 225, 1920, 1080, 'produto');
  assert.deepEqual([pequena.modo, pequena.motivo], ['conter', 'pequena']);
  assert.equal(e(800, 450, 1920, 1080, 'produto').modo, 'cobrir', '2,4×: ainda nítida');
  // Sem medida (a zona ainda não está na tela): cobre, e decide de novo quando medir.
  assert.equal(e(0, 0, 1920, 1080).motivo, 'sem-medida');
  assert.equal(e(1200, 1800, 0, 0).modo, 'cobrir');
});

// Um <img> de mentira: o que o encaixe escreve nele.
function imgFalso(o) {
  const props = {};
  const attrs = {};
  return {
    naturalWidth: o.fw, naturalHeight: o.fh, clientWidth: o.w, clientHeight: o.h, src: o.src || '/media/t1/x.jpg', ownerDocument: null,
    style: { props, setProperty(k, v, imp) { props[k] = v + (imp ? ' !important' : ''); }, removeProperty(k) { delete props[k]; } },
    setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute(k) { return k in attrs; },
    attrs,
  };
}

test('no <img> da peça: foco vira object-position; "conter" ganha a janela da foto e o fundo desfocado, sem filtro', () => {
  const a = imgFalso({ fw: 1600, fh: 1067, w: 1920, h: 1080 });
  assert.equal(R.encaixarFoto(a, { papel: 'produto', foco: { x: 0.54, y: 0.461 } }).modo, 'cobrir');
  assert.deepEqual(a.style.props, { 'object-position': '54% 46.1% !important' });
  assert.equal(a.attrs['data-mt-encaixe'], undefined);
  // Sem foco: nada inline, vale o object-position da peça.
  const b = imgFalso({ fw: 1600, fh: 1067, w: 1920, h: 1080 });
  R.encaixarFoto(b, {});
  assert.deepEqual(b.style.props, {});
  // Foto em pé no espaço deitado, com a miniatura pronta do painel.
  const c = imgFalso({ fw: 1200, fh: 1800, w: 1920, h: 1080 });
  R.encaixarFoto(c, { papel: 'produto', fundo: FUNDO });
  assert.equal(c.attrs['data-mt-encaixe'], 'formato');
  // A janela é a foto inteira (720×1080, no meio): o resto do espaço é padding, onde aparece o fundo.
  assert.equal(c.style.props.padding, '0.0px 600.0px !important');
  assert.equal(c.style.props['object-fit'], 'cover !important');
  assert.equal(c.style.props['object-position'], '50% 50% !important');
  // Com o foco, a janela cresce (até um quarto da foto some, em volta do ponto) e se alinha nele.
  const f = imgFalso({ fw: 1200, fh: 1800, w: 1920, h: 1080 });
  R.encaixarFoto(f, { papel: 'produto', foco: { x: 0.54, y: 0.3 } });
  assert.equal(f.attrs['data-mt-encaixe'], 'formato');
  assert.equal(f.style.props.padding, '0.0px 480.0px !important');
  assert.equal(f.style.props['object-position'], '54% 30% !important');
  // Se o padding mudar o tamanho do espaço (foto de altura automática), fica a foto inteira, sem janela.
  const g = imgFalso({ fw: 1200, fh: 1800, w: 1920, h: 1080 });
  g.style.setProperty = function (k, v, imp) { this.props[k] = v + (imp ? ' !important' : ''); if (k === 'padding') g.clientHeight = 1300; };
  R.encaixarFoto(g, { papel: 'produto' });
  assert.deepEqual([g.style.props.padding, g.style.props['object-fit']], [undefined, 'contain !important']);
  assert.ok(c.style.props.background.startsWith('linear-gradient(rgba(0,0,0,.38),rgba(0,0,0,.38)),url("' + FUNDO + '") center/cover no-repeat,var(--mt-fundo-2'), c.style.props.background);
  // Sem miniatura e sem canvas (foto de outro endereço): a cor de fundo da marca, nunca faixa preta crua.
  const d = imgFalso({ fw: 1200, fh: 1800, w: 1920, h: 1080, src: '/media/t1/sem-canvas.jpg' });
  R.encaixarFoto(d, { papel: 'produto' });
  assert.match(d.style.props.background, /^var\(--mt-fundo-2,#1a1a1a\) !important$/);
  // Pequena: inteira, no meio, até 2,5× o tamanho dela (o resto é fundo desfocado).
  const p = imgFalso({ fw: 400, fh: 225, w: 1920, h: 1080 });
  R.encaixarFoto(p, { fundo: FUNDO });
  assert.equal(p.attrs['data-mt-encaixe'], 'pequena');
  assert.equal(p.style.props.padding, '258.8px 460.0px !important');
  // Encaixar de novo (a zona mudou) começa do zero: o que valia antes não fica.
  p.clientWidth = 400; p.clientHeight = 225;
  R.encaixarFoto(p, {});
  assert.deepEqual(p.style.props, {});
  // O borrão é a miniatura esticada, não filtro (a placa do box barato não aguenta).
  const src = ler('js/peca-render.js');
  const trecho = src.slice(src.indexOf('function encaixarFoto('), src.indexOf('/* ============ Navegador sem container queries'));
  assert.doesNotMatch(trecho, /filter|blur\(/);
});

test('o desenhista encaixa toda foto de campo — menos a logo, o QR e o rascunho — e de novo quando a zona muda', () => {
  const src = ler('js/peca-render.js');
  const montar = src.slice(src.indexOf('function montar('), src.indexOf('return {\n      peca,'));
  assert.match(montar, /let esp = \(it\.espacos \|\| \{\}\)\[campo\] \|\| \{\};/);
  // Reteste 2: o espaço vazio leva a foto padrão do papel e do ramo (fotoPadrao), e também é encaixado.
  assert.match(montar, /const padrao = !qr && campo !== 'logo' && !o\.rascunho && !valor \? fotoPadrao\(esp\.papel, o\.ramo, o\.frente\) : null;/);
  assert.match(montar, /const foto = !qr && campo !== 'logo' && !o\.rascunho && !!valor \? \{ el, esp \} : null;/);
  assert.match(montar, /el\.addEventListener\('load', \(\) => encaixarFoto\(el, foto\.esp\)\)/);
  assert.match(montar, /new ResizeObserver\(\(\) => \{ enquadrar\(host, palcoEl\); remedir\(\); encaixarFotos\(\); naTela\(\); \}\)/);
  assert.match(montar, /aoRedimensionar = \(\) => \{ enquadrar\(host, palcoEl\); remedir\(\); encaixarFotos\(\); \}/);
  /*
   * Nenhum nome de função repetido na porta e no desenhista: a segunda
   * declaração apaga a primeira em silêncio (a decisão da foto nasceu como
   * `encaixe` e engoliu a medida do piso da régua, que tinha o mesmo nome).
   */
  for (const f of ['js/peca-render.js', 'js/peca-html.js']) {
    const nomes = (ler(f).match(/^\s*function [A-Za-z_$][\w$]*\(/gm) || []).map((s) => s.trim());
    assert.deepEqual(nomes.filter((n, i) => nomes.indexOf(n) !== i), [], f + ': função declarada duas vezes');
  }
  assert.equal(typeof R.encaixeDaFoto, 'function');
  // A TV recebe o desenhista novo.
  assert.ok(Number(/const SHELL_CACHE = 'mt-shell-v(\d+)';/.exec(ler('sw.js'))[1]) >= 83, 'o player mudou: suba o SHELL_CACHE');
  // O índice do banco muda quando entra foto nova: o service worker não o guarda.
  assert.match(ler('sw.js'), /url\.pathname === '\/pecas-ouro\/fotos\/banco\.json'\) return;/);
});

/* ---------------- Banco de fotos e manifesto ---------------- */

// Largura e altura de um JPEG, PNG ou WEBP, lidas do cabeçalho.
function medidas(buf) {
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const tipo = buf.toString('ascii', 12, 16);
    if (tipo === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
    if (tipo === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
    if (tipo === 'VP8L') { const b = buf.readUInt32LE(21); return [1 + (b & 0x3fff), 1 + ((b >> 14) & 0x3fff)]; }
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

test('o banco de fotos (pecas-ouro/fotos/banco.json): cada foto com papel, foco, ramos, crédito e licença', () => {
  const banco = JSON.parse(ler('pecas-ouro', 'fotos', 'banco.json'));
  assert.ok(Array.isArray(banco) && banco.length >= 3, 'o banco precisa de fotos');
  const RAMOS = require('../js/paletas.js').RAMOS.map((r) => r.id).concat('geral');
  const ids = new Set();
  for (const f of banco) {
    const onde = f.id || JSON.stringify(f).slice(0, 60);
    assert.match(String(f.id), /^[a-z0-9-]{3,60}$/, onde + ': id');
    assert.ok(!ids.has(f.id), onde + ': id repetido'); ids.add(f.id);
    assert.match(String(f.arquivo), /^\/pecas-ouro\/fotos\/([a-z0-9-]+\/)?[a-z0-9-]+\.(jpg|png|webp)$/, onde + ': arquivo');
    assert.ok(P.ehMidia(f.arquivo), onde + ': a TV não aceitaria este caminho');
    assert.ok(Array.isArray(f.ramos) && f.ramos.length && f.ramos.every((r) => RAMOS.includes(r)), onde + ': ramos fora de js/paletas.js (' + f.ramos + ')');
    assert.ok(P.PAPEIS_FOTO.includes(f.papel), onde + ': papel');
    assert.deepEqual(P.lerFoco(f.foco), f.foco, onde + ': foco é { x, y } de 0 a 1');
    for (const k of ['credito', 'licenca', 'fonte']) assert.ok(typeof f[k] === 'string' && f[k].trim(), onde + ': falta ' + k);
    const arq = path.join(RAIZ, f.arquivo);
    assert.ok(fs.existsSync(arq), onde + ': o arquivo não existe');
    const buf = fs.readFileSync(arq);
    const [w, h] = medidas(buf) || [];
    assert.ok(w && h, onde + ': não é JPEG, PNG nem WEBP');
    assert.ok(Math.max(w, h) <= 1920, onde + ': maior lado ' + Math.max(w, h) + ' px (o máximo é 1920)');
    assert.ok(buf.length <= 900 * 1024, onde + ': ' + Math.round(buf.length / 1024) + ' KB (o máximo é 900)');
  }
});

test('o manifesto dá o papel de todo espaço de foto (menos a logo), e só de espaço que existe', () => {
  const m = JSON.parse(ler('pecas-ouro', 'manifesto.json'));
  let comFoto = 0;
  for (const p of m.pecas) {
    const fotos = P.higienizar(P.doArquivo(ler('pecas-ouro', p.id + '.html'))).campos.filter((c) => c.tipo === 'img' && c.nome !== 'logo').map((c) => c.nome);
    const declarados = Object.keys(p.fotos || {});
    for (const n of fotos) assert.ok(declarados.includes(n), p.id + ': o espaço "' + n + '" precisa de papel no manifesto (fotos: { "' + n + '": "produto" })');
    for (const n of declarados) {
      assert.ok(fotos.includes(n), p.id + ': "' + n + '" não é espaço de foto desta peça');
      assert.ok(P.PAPEIS_FOTO.includes(p.fotos[n]), p.id + ': papel "' + p.fotos[n] + '"');
    }
    if (fotos.length) comFoto++;
  }
  assert.ok(comFoto >= 7, 'as peças com foto sumiram do manifesto?');
  assert.equal(m.pecas.find((p) => p.id === 'gente-aniversariante').fotos.foto, 'pessoa');
  assert.equal(m.pecas.find((p) => p.id === 'oferta-foto').fotos.foto, 'produto');
  // O papel vai para o item quando a peça nasce no painel, e na bancada.
  assert.match(ler('web/src/lib/modelosOuro.js'), /const espacos = espacosDoModelo\(m\);/);
  assert.match(ler('js/bancada.js'), /espacos: Object\.assign\(espacosDe\(def\), x\.espacos \|\| \{\}\)/);
});

test('o painel: o banco começa pelo ramo e pelo papel; o pedido à IA já vem escrito', async () => {
  const E = await import(pathToFileURL(path.join(RAIZ, 'web/src/lib/espacos.js')).href);
  const lista = [
    { id: 'a', arquivo: '/pecas-ouro/fotos/a.jpg', ramos: ['otica'], papel: 'ambiente' },
    { id: 'b', arquivo: '/pecas-ouro/fotos/b.jpg', ramos: ['padaria'], papel: 'produto' },
    { id: 'c', arquivo: '/pecas-ouro/fotos/c.jpg', ramos: ['otica'], papel: 'produto' },
    { id: 'd', arquivo: '/pecas-ouro/fotos/d.jpg', ramos: ['geral'], papel: 'produto' },
    { id: 'e', arquivo: '/pecas-ouro/fotos/e.jpg', ramos: ['moda'], papel: 'pessoa' },
  ];
  const r = E.fotosDoBanco(lista, 'otica', 'produto');
  assert.deepEqual(r.map((f) => f.id), ['c', 'd', 'a', 'b', 'e']);
  assert.deepEqual(r.map((f) => f.combina), [true, true, false, false, false]);
  assert.deepEqual(r.map((f) => f.doRamo), [true, true, true, false, false]);
  assert.deepEqual(E.fotosDoBanco(null, 'otica', 'produto'), []);
  assert.equal(E.pedidoDaFoto({ titulo: 'pão francês dourado', papel: 'produto', ramo: 'padaria' }), 'Pão francês dourado na bancada da padaria, luz natural, foto profissional');
  assert.match(E.pedidoDaFoto({ titulo: 'Bem-vinda, Ana', papel: 'pessoa', ramo: 'corporativo' }), /^Retrato de uma pessoa sorrindo no escritório/, 'o nome de quem chega não vira pedido de foto');
  assert.deepEqual([E.formatoParaIA({ w: 1229, h: 1080 }), E.formatoParaIA('9/16'), E.formatoParaIA([1080, 346])], ['1/1', '9/16', '16/9']);
  assert.deepEqual(E.tamanhoNaTv('9/16'), [1080, 1920]);
  assert.deepEqual(E.espacoComFoto({ papel: 'pessoa', foco: { x: 0.1, y: 0.1 }, fundo: 'velho' }, { foco: { x: 0.54321, y: 0.5 } }), { papel: 'pessoa', foco: { x: 0.543, y: 0.5 } },
    'o foco e o fundo da foto velha não ficam na nova');
  assert.equal(E.papelDoEspaco({ espacos: { foto: { papel: 'ambiente' } } }, 'foto', 'produto'), 'ambiente');
  assert.equal(E.papelDoEspaco({}, 'foto', 'pessoa'), 'pessoa');
  assert.equal(E.papelDoEspaco({}, 'foto', ''), 'produto');
  assert.deepEqual(E.lerValor({ src: '/media/a.jpg', foco: { x: 0.2, y: 0.4 } }), { src: '/media/a.jpg', foco: { x: 0.2, y: 0.4 } });
});

test('o painel: "Trocar foto" com três abas, um violeta só, no editor da peça', () => {
  const t = ler('web/src/components/fotos/TrocarFoto.jsx');
  assert.match(t, /export function TrocarFoto\(\{ papel = 'produto', ramo = '', valor, onTrocar, formato = '16\/9', titulo = '', onFechar, abaInicial = 'celular', umToque = false \}\)/);
  assert.match(t, /\[\['celular', 'Do celular', Smartphone\], \['banco', 'Banco de fotos', Images\], \['ia', 'Gerar com IA', null\]\]/);
  assert.equal((t.match(/variant="primary"/g) || []).length, 1, 'um violeta por tela: o "Usar esta foto"');
  // FOTO VIVA: o mesmo botão diz "Usar este vídeo" quando o escolhido é um vídeo.
  assert.match(t, /<Button variant="primary" icon=\{Check\}[^>]*>\{escolhida && escolhida\.video \? 'Usar este vídeo' : 'Usar esta foto'\}<\/Button>/);
  assert.match(t, /await media\.upload\(p\.envio\)/, 'a foto do celular sobe pelo envio de sempre');
  assert.match(t, /capture="environment"/);
  assert.match(t, /await ia\.imagem\(\{ prompt: t, formato: forma, papel \}\)/);
  assert.match(t, /fotosDoBanco\(lista, ramo, papel\)/);
  assert.match(t, /R\.encaixarFoto\(el, \{ papel, foco, fundo \}\)/, 'a prévia encaixa com o código da TV');
  assert.match(ler('web/src/lib/espacos.js'), /fetch\('\/pecas-ouro\/fotos\/banco\.json'/);
  assert.match(ler('web/src/api.js'), /imagem: \(\{ prompt, formato, papel \}\) => api\('POST', '\/api\/ia\/imagem', \{ prompt, formato, papel \}\)/);
  const e = ler('web/src/components/content/EditarPeca.jsx');
  assert.match(e, /<TrocarFoto papel=\{trocandoFoto\.papel\} ramo=\{ramo\} formato=\{trocandoFoto\.formato\}/);
  assert.match(e, /espacoComFoto\(\{ \.\.\.\(x\[campo\] \|\| \{\}\), papel: trocandoFoto\.papel \}, \{ foco: valor\.foco, fundo: extra && extra\.fundo, poster: extra && extra\.poster \}\)/);
  assert.match(e, /else if \(mudou\) delete n\[campo\];/, 'ajustar o ponto da mesma foto apagava o crédito dela');
});

/* ---------------- A rota POST /api/ia/imagem, sem servidor ---------------- */

function contaFalsa(o) {
  const chamadas = { reservar: 0, devolver: 0, cobrar: [], guardar: [], gerar: [] };
  const ctx = {
    db: { getTenant: async (id) => ({ id, plan: 'pro' }) },
    ai: {
      mode: () => o.modo || 'gemini',
      generateImage: async (prompt, opts) => { chamadas.gerar.push({ prompt, opts }); if (o.erro) throw o.erro; return { mime: 'image/png', data: Buffer.from('png').toString('base64') }; },
    },
    midia: { guardarBuffer: async (db, t, buf, mime, meta) => { chamadas.guardar.push({ buf, mime, meta }); return { id: 'm1', mime, size: buf.length, url: '/media/' + t + '/m1.png' }; } },
    usoIA: {
      reservar: async () => { chamadas.reservar++; return o.semSaldo ? { ok: false, resposta: cred.semSaldo(1, 0) } : { ok: true, reserva: { daFranquia: 1, doComprado: 0 } }; },
      controleDaReserva: () => {
        let acabou = false;
        return { async devolver() { if (!acabou) { acabou = true; chamadas.devolver++; } }, cobrada() { acabou = true; }, fechar() { return this.devolver(); } };
      },
      cobrar: async (db, t, x) => { chamadas.cobrar.push(x); return {}; },
    },
  };
  return { ctx, chamadas };
}
const SESS = { tenant_id: 't1', user_id: 'u1' };

test('o pedido: frase obrigatória, curta; formato e papel só dos conhecidos', () => {
  assert.equal(iaImagem.lerPedido({ prompt: '   ' }).erro, 'Escreva o que a foto deve mostrar.');
  assert.equal(iaImagem.lerPedido(null).erro, 'Escreva o que a foto deve mostrar.');
  assert.deepEqual(iaImagem.lerPedido({ prompt: ' pão\n francês ', formato: '4/3', papel: 'vitrine' }), { prompt: 'pão francês', formato: '16/9', papel: '' });
  assert.deepEqual(iaImagem.lerPedido({ prompt: 'x', formato: '9/16', papel: 'pessoa' }), { prompt: 'x', formato: '9/16', papel: 'pessoa' });
  assert.equal(iaImagem.lerPedido({ prompt: 'a'.repeat(900) }).prompt.length, 400);
  assert.match(iaImagem.promptDoEspaco({ prompt: 'Pão francês', papel: 'pessoa' }), /^Pão francês\. a pessoa de frente/);
});

test('com IA: reserva, gera no formato do espaço, guarda nas fotos da conta e cobra uma criação', async () => {
  const { ctx, chamadas } = contaFalsa({});
  const r = await iaImagem.gerar(ctx, SESS, { prompt: 'pão francês', formato: '9/16', papel: 'produto' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.item, { id: 'm1', name: 'IA · pão francês', mime: 'image/png', size: 3, url: '/media/t1/m1.png', origem: 'ia', formato: '9/16' });
  assert.equal(chamadas.gerar[0].opts.formato, '9/16');
  assert.match(chamadas.gerar[0].prompt, /^pão francês\. o produto em destaque/);
  assert.deepEqual(chamadas.guardar[0].meta, { nome: 'IA · pão francês', origem: 'ia', formato: '9/16' });
  assert.equal(chamadas.cobrar.length, 1);
  assert.deepEqual([chamadas.cobrar[0].tipo, chamadas.cobrar[0].referencia, !!chamadas.cobrar[0].reserva], ['gerar-imagem', 'm1', true]);
  assert.equal(chamadas.devolver, 0, 'cobrou e devolveu o mesmo crédito');
});

test('gerador sem crédito (402, teto de gasto, cota do Gemini): a frase do que fazer, e o crédito volta', async () => {
  const erros = [
    motores.erroIA('Payment Required', 402, 'gemini'),
    motores.erroIA('Your project has exceeded its monthly spending cap', 429, 'gemini'),
    motores.erroIA('You exceeded your current quota, please check your plan and billing details', 429, 'gemini'),
    motores.erroIA('RESOURCE_EXHAUSTED: quota exceeded for image generation', 429, 'gemini'),
  ];
  for (const erro of erros) {
    const { ctx, chamadas } = contaFalsa({ erro });
    const r = await iaImagem.gerar(ctx, SESS, { prompt: 'pão', formato: '16/9', papel: '' });
    assert.equal(r.status, 402, erro.message);
    assert.equal(r.corpo.error, 'A geração de imagens está sem crédito agora. Use uma foto do celular ou do banco.');
    assert.equal(chamadas.devolver, 1, 'o crédito reservado não voltou: ' + erro.message);
    assert.equal(chamadas.cobrar.length, 0);
    assert.equal(chamadas.guardar.length, 0);
  }
  // Sem a chave de imagem: desligado (503), não "sem crédito". Outra falha: tente de novo (502). Nada se cobra.
  const semChave = Object.assign(new Error('o gerador de fotos não está ligado (falta a chave de imagem)'), { status: 503 });
  const a = contaFalsa({ erro: semChave });
  assert.deepEqual([(await iaImagem.gerar(a.ctx, SESS, { prompt: 'x', formato: '1/1', papel: '' })).status, a.chamadas.devolver], [503, 1]);
  const b = contaFalsa({ erro: motores.erroIA('model overloaded', 503, 'gemini') });
  const rb = await iaImagem.gerar(b.ctx, SESS, { prompt: 'x', formato: '1/1', papel: '' });
  assert.deepEqual([rb.status, rb.corpo.error, b.chamadas.devolver], [502, iaImagem.FALHOU, 1], 'sobrecarga passa: é "tente de novo"');
  const chave = contaFalsa({ erro: motores.erroIA('API key not valid', 400, 'gemini') });
  assert.equal((await iaImagem.gerar(chave.ctx, SESS, { prompt: 'x', formato: '1/1', papel: '' })).status, 503);
  const c = contaFalsa({ erro: motores.erroIA('invalid argument', 400, 'gemini') });
  const rc = await iaImagem.gerar(c.ctx, SESS, { prompt: 'x', formato: '1/1', papel: '' });
  assert.deepEqual([rc.status, rc.corpo.error, c.chamadas.devolver], [502, iaImagem.FALHOU, 1]);
});

test('conta sem criações: 402 antes de chamar a IA, com a mensagem da conta', async () => {
  const { ctx, chamadas } = contaFalsa({ semSaldo: true });
  const r = await iaImagem.gerar(ctx, SESS, { prompt: 'pão', formato: '16/9', papel: '' });
  assert.equal(r.status, 402);
  assert.equal(r.corpo.erro, 'creditos_insuficientes');
  assert.match(r.corpo.error, /Suas telas continuam no ar/);
  assert.equal(chamadas.gerar.length, 0, 'chamou a IA sem saldo');
});

test('sem IA (dev): a foto de exemplo é um PNG de verdade, a mesma para o mesmo pedido, no formato pedido', async () => {
  const a = iaImagem.fotoDeExemplo({ prompt: 'pão francês', formato: '16/9', papel: 'produto' });
  const b = iaImagem.fotoDeExemplo({ prompt: 'pão francês', formato: '16/9', papel: 'produto' });
  assert.equal(a.mime, 'image/png');
  assert.ok(a.data.equals(b.data), 'o mesmo pedido deu outra foto');
  assert.ok(!a.data.equals(iaImagem.fotoDeExemplo({ prompt: 'café', formato: '16/9', papel: 'produto' }).data));
  assert.deepEqual(medidas(a.data), [1280, 720]);
  assert.deepEqual(medidas(iaImagem.fotoDeExemplo({ prompt: 'x', formato: '9/16' }).data), [720, 1280]);
  assert.deepEqual(medidas(iaImagem.fotoDeExemplo({ prompt: 'x', formato: '1/1' }).data), [1024, 1024]);
  // Um PNG que o zlib consegue abrir de novo (CRC e compressão certos).
  const zlib = require('node:zlib');
  const idat = a.data.indexOf('IDAT');
  const tam = a.data.readUInt32BE(idat - 4);
  assert.equal(zlib.inflateSync(a.data.subarray(idat + 4, idat + 4 + tam)).length, (1280 * 3 + 1) * 720);
  // Na rota: guarda, registra o uso (sem crédito) e não reserva nada.
  const { ctx, chamadas } = contaFalsa({ modo: 'dev' });
  const r = await iaImagem.gerar(ctx, SESS, { prompt: 'pão francês', formato: '16/9', papel: 'produto' });
  assert.deepEqual([r.status, r.corpo.exemplo, chamadas.reservar, chamadas.gerar.length], [200, true, 0, 0]);
  assert.equal(chamadas.guardar[0].mime, 'image/png');
  assert.deepEqual([chamadas.cobrar[0].tipo, chamadas.cobrar[0].referencia], ['gerar-imagem-exemplo', 'm1']);
  assert.deepEqual([cred.creditosDe('gerar-imagem-exemplo', 1), cred.operacao('gerar-imagem-exemplo').rotulo], [0, 'Foto de exemplo (sem IA)']);
});

/* ---------------- A rota e a conferência, num servidor de verdade ---------------- */

const PORTA = 8300 + Math.floor(Math.random() * 90);
function pedir(caminho, o = {}) {
  return new Promise((resolve, reject) => {
    const corpo = o.json ? Buffer.from(JSON.stringify(o.json)) : null;
    const req = http.request({ host: '127.0.0.1', port: PORTA, path: caminho, method: o.method || 'GET',
      headers: Object.assign({}, o.json ? { 'Content-Type': 'application/json' } : {}, o.cookie ? { Cookie: o.cookie } : {}, o.headers || {}) }, (res) => {
      const partes = [];
      res.on('data', (c) => partes.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(partes);
        let json = null; try { json = JSON.parse(buf.toString('utf8')); } catch (e) { json = null; }
        resolve({ status: res.statusCode, json, buf, headers: res.headers, cookies: [].concat(res.headers['set-cookie'] || []) });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('a rota ' + caminho + ' não respondeu')));
    if (corpo) req.write(corpo);
    req.end();
  });
}
const cookieDe = (r) => r.cookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');

test('servidor: gera sem IA, registra o uso, freia por hora, e a TV recebe a foto com foco', async (t) => {
  const dados = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-espacos-'));
  const servidor = spawn(process.execPath, ['server.js'], {
    cwd: RAIZ, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORTA), STORAGE: 'local', SKIP_VERIFY: '1', DATABASE_URL: '', DATA_DIR: dados, MEDIA_DIR: dados, AI_PROVIDER: 'dev',
      MT_IA_IMAGEM_POR_HORA: '3', MT_APK_REPO: 'desligado', TRUST_PROXY: '', RAILWAY_ENVIRONMENT: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' },
  });
  t.after(() => { servidor.kill(); try { fs.rmSync(dados, { recursive: true, force: true }); } catch (e) { /* o Windows segura o arquivo */ } });
  let ok = false;
  for (let i = 0; i < 160 && !ok; i++) { try { await pedir('/tv'); ok = true; } catch (e) { await new Promise((r) => setTimeout(r, 250)); } }
  assert.ok(ok, 'o servidor de teste não subiu');

  assert.equal((await pedir('/api/ia/imagem', { method: 'POST', json: { prompt: 'pão' } })).status, 401);
  const dono = cookieDe(await pedir('/api/auth/signup', { method: 'POST', json: { email: 'esp' + Date.now() + '@teste.local', password: 'senha-de-teste-123', name: 'Ótica Central', aceite: true, perfil: 'comercio' } }));
  assert.equal((await pedir('/api/ia/imagem', { cookie: dono })).status, 405);

  const pedido = { prompt: 'Óculos de sol na vitrine da ótica', formato: '9/16', papel: 'produto' };
  const um = await pedir('/api/ia/imagem', { method: 'POST', cookie: dono, json: pedido });
  assert.equal(um.status, 200, JSON.stringify(um.json));
  const item = um.json.item;
  assert.match(item.url, /^\/media\/[^/]+\/[\w-]+\.png$/);
  assert.deepEqual([item.mime, item.origem, item.formato, um.json.exemplo], ['image/png', 'ia', '9/16', true]);
  const arquivo = await pedir(item.url);
  assert.equal(arquivo.status, 200);
  assert.deepEqual(medidas(arquivo.buf), [720, 1280], 'a foto em pé para o espaço em pé');
  const dois = await pedir('/api/ia/imagem', { method: 'POST', cookie: dono, json: pedido });
  assert.ok((await pedir(dois.json.item.url)).buf.equals(arquivo.buf), 'o mesmo pedido, a mesma foto de exemplo');
  assert.equal((await pedir('/api/ia/imagem', { method: 'POST', cookie: dono, json: { prompt: '  ' } })).json.error, 'Escreva o que a foto deve mostrar.');
  // O freio por conta (MT_IA_IMAGEM_POR_HORA=3): a quarta na hora espera, com a frase do que fazer.
  const freio = await pedir('/api/ia/imagem', { method: 'POST', cookie: dono, json: pedido });
  assert.equal(freio.status, 429);
  assert.ok(Number(freio.headers['retry-after']) > 0);
  assert.match(freio.json.error, /use uma foto do celular ou do banco/);

  // O uso: duas linhas, sem crédito (foto de exemplo); as fotos estão na Biblioteca da conta.
  const consumo = (await pedir('/api/billing/consumo', { cookie: dono })).json;
  const linhas = consumo.itens.filter((i) => i.tipo === 'gerar-imagem-exemplo');
  assert.equal(linhas.length, 2);
  assert.ok(linhas.every((l) => l.rotulo === 'Foto de exemplo (sem IA)' && Number(l.creditos) === 0));
  const midias = (await pedir('/api/media', { cookie: dono })).json.items.filter((m) => m.origem === 'ia');
  assert.equal(midias.length, 2);

  // A TV: a peça com a foto gerada (com foco e papel) e a antiga (texto) passam pela conferência e chegam no formato de sempre.
  const tv = (await pedir('/api/devices', { method: 'POST', json: {} })).json;
  assert.ok((await pedir('/api/pair', { method: 'POST', cookie: dono, json: { code: tv.code, nova: true } })).status < 300);
  const cfg = { settings: { layoutId: 'full' }, zonas: { principal: { items: [
    peca({ id: 'nova', campos: { foto: { src: item.url, foco: { x: 0.5, y: 0.35 } }, titulo: 'Óculos de sol' }, espacos: { foto: { papel: 'produto', fundo: FUNDO } } }),
    peca({ id: 'antiga', campos: { foto: '/pecas-ouro/fotos/otica-sol.jpg' } }),
  ] } } };
  const gravou = await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: dono, json: cfg });
  assert.equal(gravou.status, 200, JSON.stringify(gravou.json));
  const daTv = (await pedir('/api/devices/' + tv.id + '/config', { headers: { 'x-device-token': tv.deviceToken } })).json.zonas.principal.items;
  assert.equal(daTv[0].campos.foto, item.url, 'a TV antiga lê campos.foto como texto');
  assert.deepEqual(daTv[0].espacos, { foto: { papel: 'produto', foco: { x: 0.5, y: 0.35 }, fundo: FUNDO } });
  assert.equal(daTv[1].campos.foto, '/pecas-ouro/fotos/otica-sol.jpg');
  assert.equal(daTv[1].espacos, undefined);
  // Foto de fora continua recusada, com ou sem foco.
  const fora = JSON.parse(JSON.stringify(cfg));
  fora.zonas.principal.items[0].campos.foto = { src: 'https://images.unsplash.com/photo-1', foco: { x: 0.5, y: 0.5 } };
  assert.equal((await pedir('/api/devices/' + tv.id + '/config', { method: 'PUT', cookie: dono, json: fora })).status, 400);
  // O banco de fotos é público, como as fotos das peças (a TV e o painel leem).
  const banco = await pedir('/pecas-ouro/fotos/banco.json');
  assert.equal(banco.status, 200);
  assert.ok(Array.isArray(banco.json) && banco.json.length >= 3);
});
