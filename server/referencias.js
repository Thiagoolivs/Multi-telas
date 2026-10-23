/*
 * server/referencias.js — IMAGEM DE REFERÊNCIA NO CHAT (EXECUTOR D45).
 *
 * O dono: "no chat permitir subir e colar imagens de referência para a
 * criação". No Criar e no Editar com a IA, a pessoa anexa ou cola (Ctrl+V,
 * colar do celular) uma imagem, e diz para que ela serve:
 *
 *   - ESTILO: "quero assim" — a IA lê o estilo (cores, clima, composição)
 *     e desenha nessa direção; a imagem não vai para a TV.
 *   - PRODUTO: a foto do produto, que é DO CLIENTE e vai como está (a regra
 *     "foto do produto é do cliente": a IA não inventa o produto).
 *
 * A imagem vira mídia da conta (conta na cota, aparece em Mídias), o tipo é
 * conferido pelos BYTES (PNG, JPEG, WEBP — o nome e o cabeçalho podem dizer
 * qualquer coisa) e ela fica presa à conversa. Nada é gerado aqui: gerar
 * continua sendo o "Gerar" (e, no D42, só depois do esboço aprovado).
 */
const site = require('./site');

const MAX_POR_CONVERSA = 10;
const LIMITE_BYTES = 8 * 1024 * 1024;
const USOS = ['estilo', 'produto'];
const NOME_DO_USO = { estilo: 'referência de estilo', produto: 'foto do produto' };

// O corpo inteiro, até o limite. Passou: null (e o resto não é lido).
function lerBytes(req, limite) {
  return new Promise((resolve) => {
    const partes = [];
    let total = 0;
    let estourou = false;
    req.on('data', (c) => {
      if (estourou) return;
      total += c.length;
      if (total > limite) { estourou = true; partes.length = 0; resolve(null); req.resume(); return; }
      partes.push(c);
    });
    req.on('end', () => { if (!estourou) resolve(Buffer.concat(partes)); });
    req.on('error', () => { if (!estourou) resolve(null); });
  });
}

const usoDe = (u) => (USOS.includes(u) ? u : 'estilo');

/*
 * Recebe a imagem e grava como mídia da conta. Devolve { referencia } ou
 * { erro, status }. `cota` é o teto da conta em bytes; `usado`, o que ela já
 * usa — conferidos ANTES de gravar.
 */
async function receber({ db, midia, tenantId, req, uso, cota, usado }) {
  const bytes = await lerBytes(req, LIMITE_BYTES);
  if (!bytes) return { erro: 'a imagem passa de 8 MB — mande uma menor', status: 413 };
  const mime = site.tipoDaImagem(bytes);
  if (!mime) return { erro: 'só imagem PNG, JPEG ou WEBP', status: 415 };
  if (Number.isFinite(cota) && (Number(usado) || 0) + bytes.length > cota) return { erro: 'o armazenamento da conta está cheio', status: 413 };
  const u = usoDe(uso);
  const salvo = await midia.guardarBuffer(db, tenantId, bytes, mime, { nome: 'Referência: ' + NOME_DO_USO[u], origem: 'referencia' });
  return { referencia: { url: salvo.url, mediaId: salvo.id, uso: u } };
}

/*
 * A lista que a pessoa mandou de volta (mudou o uso ou tirou uma): só o que
 * JÁ era desta conversa (pela URL) entra — ninguém aponta a referência para
 * um arquivo qualquer.
 */
function conferirLista(nova, atuais) {
  const porUrl = new Map((Array.isArray(atuais) ? atuais : []).map((r) => [r && r.url, r]));
  const vistas = new Set();
  const out = [];
  for (const r of Array.isArray(nova) ? nova : []) {
    const velha = r && porUrl.get(r.url);
    if (!velha || vistas.has(velha.url)) continue;
    vistas.add(velha.url);
    out.push({ url: velha.url, mediaId: velha.mediaId || '', uso: usoDe(r.uso) });
  }
  return out.slice(0, MAX_POR_CONVERSA);
}

// O que a IA da conversa precisa saber (ela não vê a imagem; o gerador lê o estilo e usa a foto).
function paraIA(refs) {
  const l = Array.isArray(refs) ? refs : [];
  if (!l.length) return '';
  return 'IMAGENS QUE A PESSOA MANDOU NESTA CONVERSA (as do produto vão como estão; as de estilo guiam o desenho):\n'
    + l.map((r, i) => '- imagem ' + (i + 1) + ': ' + NOME_DO_USO[usoDe(r.uso)]).join('\n');
}

/*
 * Para o gerador (D45): as de estilo entram nas referências que a IA lê
 * (estiloDasReferencias, D9) e as do produto entram como fotos da empresa,
 * na frente — é a foto que a pessoa acabou de mandar.
 */
function naMarca(marca, refs) {
  const m = Object.assign({}, marca || {});
  const l = Array.isArray(refs) ? refs : [];
  const estilo = l.filter((r) => r.uso === 'estilo').map((r) => r.url);
  const produto = l.filter((r) => r.uso === 'produto').map((r) => ({ url: r.url, label: 'foto do produto que o cliente mandou na conversa' }));
  if (estilo.length) m.referencias = estilo.concat(m.referencias || []).slice(0, 8);
  if (produto.length) m.bases = produto.concat(m.bases || []).slice(0, 12);
  return m;
}

module.exports = { receber, conferirLista, paraIA, naMarca, lerBytes, MAX_POR_CONVERSA, LIMITE_BYTES, USOS };
