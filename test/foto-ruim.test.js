/*
 * A foto ruim do cliente (web/src/lib/fotoRuim.js): escura, apagada,
 * pequena para a TV ou mal enquadrada para o espaço. As contas são puras
 * (o canvas só entrega os pixels); o painel mostra o antes e o depois e a
 * pessoa escolhe — nada muda calado.
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const RAIZ = path.join(__dirname, '..');
const lib = () => import(pathToFileURL(path.join(RAIZ, 'web/src/lib/fotoRuim.js')).href);

// Uma "foto" de w×h: fn(x, y) → [r, g, b].
function foto(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = fn(x, y); const o = (y * w + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255; }
  return { data, width: w, height: h };
}
// Textura com detalhe (o "assunto") e parede lisa.
const xadrez = (x, y) => (((x >> 2) + (y >> 2)) & 1 ? 200 : 40);
const boa = (x, y) => { const v = Math.round((x / 191) * 230 + ((x + y) & 7) * 3); return [v, Math.min(255, v + 10), Math.max(0, v - 10)]; };

test('foto boa: nada a dizer, e os níveis não mexem', async () => {
  const F = await lib();
  const px = foto(192, 108, boa);
  assert.deepEqual(F.problemasDaFoto(px, { largura: 1920, altura: 1080 }, [1920, 1080]), []);
  assert.equal(F.niveisAutomaticos(F.medirLuz(px)), null);
});

test('escura: o aviso, e os níveis clareiam sem lavar (o preto continua preto, a média vai para o meio)', async () => {
  const F = await lib();
  const px = foto(192, 108, (x, y) => { const v = Math.round(10 + (x / 191) * 90 + ((x * 7 + y * 3) % 11)); return [v, v * 0.9, v * 0.8]; });
  const luz = F.medirLuz(px);
  assert.ok(luz.media < 78, 'a foto de teste não ficou escura: ' + luz.media);
  const p = F.problemasDaFoto(px, { largura: 3000, altura: 1688 }, [1920, 1080]);
  assert.deepEqual(p.map((x) => [x.tipo, x.conserta]), [['escura', 'niveis']]);
  const lut = F.niveisAutomaticos(luz);
  assert.ok(lut);
  for (let v = 1; v < 256; v++) assert.ok(lut[v] >= lut[v - 1], 'a curva desce em ' + v);
  assert.ok(lut[0] <= 5, 'o preto virou cinza');
  const depois = F.medirLuz(F.aplicarNiveis({ data: Uint8ClampedArray.from(px.data), width: px.width, height: px.height }, lut));
  assert.ok(depois.media > 95 && depois.media < 150, 'média depois: ' + depois.media);
  assert.ok(depois.alto - depois.baixo > luz.alto - luz.baixo, 'não ganhou contraste');
});

test('apagada (sem contraste): o aviso, e os níveis esticam a faixa', async () => {
  const F = await lib();
  // A foto "lavada" de verdade: tudo entre o cinza-escuro e o cinza-claro, nada preto nem branco.
  const px = foto(192, 108, (x, y) => { const v = 80 + Math.round((x / 191) * 105) + ((x + y) % 5); return [v, v, v]; });
  const p = F.problemasDaFoto(px, { largura: 2000, altura: 1125 }, [1920, 1080]);
  assert.deepEqual(p.map((x) => x.tipo), ['contraste']);
  const lut = F.niveisAutomaticos(F.medirLuz(px));
  const d = F.medirLuz(F.aplicarNiveis({ data: Uint8ClampedArray.from(px.data), width: 192, height: 108 }, lut));
  assert.ok(d.alto - d.baixo > 150, 'faixa depois: ' + (d.alto - d.baixo));
});

test('pequena para a TV: o aviso com a medida, sem conserto (não há como inventar resolução)', async () => {
  const F = await lib();
  const px = foto(192, 144, boa);
  const pequena = F.problemasDaFoto(px, { largura: 640, altura: 480 }, [1920, 1080]).find((x) => x.tipo === 'pequena');
  assert.ok(pequena && pequena.conserta === '' && /640×480/.test(pequena.texto));
  // Entre esticar um pouco e desistir de cobrir: "um pouco borrada".
  assert.ok(F.problemasDaFoto(foto(192, 108, boa), { largura: 1000, altura: 562 }, [1920, 1080]).some((x) => x.tipo === 'borrada'));
  // O espaço pequeno da peça (uma lateral) aceita a mesma foto.
  assert.deepEqual(F.problemasDaFoto(foto(192, 144, boa), { largura: 640, altura: 480 }, [500, 380]).filter((x) => x.tipo === 'pequena' || x.tipo === 'borrada'), []);
  assert.equal(F.ampliacao({ largura: 960, altura: 540 }, [1920, 1080]), 2);
});

test('mal enquadrada: a foto deitada no espaço em pé é recortada em volta do assunto, não no meio', async () => {
  const F = await lib();
  // O assunto (com detalhe) está no terço da direita; o resto é parede lisa.
  const px = foto(192, 108, (x, y) => (x > 128 ? [xadrez(x, y), xadrez(x, y), xadrez(x, y)] : [120, 118, 110]));
  const p = F.problemasDaFoto(px, { largura: 1920, altura: 1080 }, [1080, 1920]);
  assert.ok(p.some((x) => x.tipo === 'enquadramento' && x.conserta === 'recorte'));
  const r = F.recorteInteligente(px, 1080 / 1920);
  assert.ok(r);
  assert.equal(r.y, 0); assert.equal(r.h, 1);
  assert.ok(Math.abs(r.w - (108 * 1080 / 1920) / 192) < 0.02, 'a janela não tem a proporção do espaço: ' + r.w);
  assert.ok(r.x + r.w / 2 > 0.6, 'o recorte não foi para o assunto (centro em ' + (r.x + r.w / 2).toFixed(2) + ')');
  assert.ok(r.x >= 0 && r.x + r.w <= 1.0001);
  // Em pé para o deitado: a janela desliza na vertical, para o assunto embaixo.
  const empe = foto(108, 192, (x, y) => (y > 128 ? [xadrez(x, y), xadrez(x, y), xadrez(x, y)] : [120, 118, 110]));
  const r2 = F.recorteInteligente(empe, 16 / 9);
  assert.ok(r2.x === 0 && r2.w === 1 && r2.y + r2.h / 2 > 0.6);
  // Já na proporção do espaço: nada a recortar.
  assert.equal(F.recorteInteligente(foto(160, 90, boa), 16 / 9), null);
});

test('no painel: a foto ruim mostra o antes e o depois antes de subir, e a pessoa escolhe', () => {
  const tf = fs.readFileSync(path.join(RAIZ, 'web/src/components/fotos/TrocarFoto.jsx'), 'utf8');
  const i = tf.indexOf('analisarFoto(f, espaco)');
  assert.ok(i > 0 && i < tf.indexOf('subirFotoDoCelular(f)', i), 'a análise vem antes de subir');
  assert.match(tf, /<MelhorarFoto arquivo=\{revisar\.arquivo\} analise=\{revisar\.analise\} espaco=\{espaco\} onUsar=\{subir\}/);
  const mf = fs.readFileSync(path.join(RAIZ, 'web/src/components/fotos/MelhorarFoto.jsx'), 'utf8');
  assert.match(mf, /Antes · /);
  assert.match(mf, /Usar a original/);
  assert.match(mf, /Usar a melhorada/);
  assert.match(mf, /onUsar\(arquivo\)/);
  assert.match(mf, /onUsar\(depois\.arquivo\)/);
});
