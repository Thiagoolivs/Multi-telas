/*
 * server/guarda.js — o prazo de guarda das fotos de gente (EXECUTOR D35).
 *
 * Foto de pessoa é dado pessoal: fica o tempo que serve, e sai sozinha.
 *   - O MURAL DA DATA (D33) sai 30 dias depois da data — o registro e o
 *     arquivo. O painel avisa 7 dias antes ("baixe se quiser guardar") e o
 *     RH pode guardar por mais 30 dias. Nota do consultor; o número final é
 *     do dono.
 *   - A FOTO QUE NINGUÉM DECIDIU (a fila do QR) sai em 30 dias.
 * A varredura roda junto da faxina diária (server.js).
 *
 * E o .zip para baixar o mural antes de ele sair — sem biblioteca: arquivos
 * guardados sem compressão (foto já é comprimida), com o CRC que todo
 * descompactador confere.
 */
const F = require('./foto-qr');

const PRAZO_DATA_DIAS = 30;
const PRAZO_FILA_DIAS = 30;
const AVISO_DIAS = 7;

// Quando o mural de um pedido de data sai (AAAA-MM-DD); '' para o pedido que não é de data.
function apagaEm(pedido) {
  if (!pedido || pedido.tipo !== 'data' || !F.dataValida(pedido.dataAlvo)) return '';
  const base = F.somarDias(pedido.dataAlvo, PRAZO_DATA_DIAS);
  return pedido.guardarAte && pedido.guardarAte > base ? pedido.guardarAte : base;
}
// Quantos dias faltam para sair, se já é hora de avisar (7 ou menos); senão null.
function diasParaSair(pedido, hoje) {
  const fim = apagaEm(pedido);
  if (!fim) return null;
  const h = hoje || F.hojeIso();
  const dias = Math.round((new Date(fim + 'T12:00:00') - new Date(h + 'T12:00:00')) / 864e5);
  return dias <= AVISO_DIAS ? Math.max(0, dias) : null;
}

async function varrer({ db, midia, agora }) {
  const quando = agora ? new Date(agora) : new Date();
  const hoje = F.hojeIso(quando);
  const r = { muraisDeData: 0, fotos: 0 };
  const apagar = async (f) => {
    if (f.mediaId) await midia.apagar(db, f.tenantId, f.mediaId).catch(() => {});
    await db.removerFotoPessoa(f.id, f.tenantId);
    r.fotos += 1;
  };
  for (const p of await db.pedidosFotoDeData()) {
    const fim = apagaEm(p);
    if (!fim || fim >= hoje) continue;
    for (const f of (await db.listarFotosPessoa(p.tenantId)).filter((x) => x.pedidoId === p.id)) await apagar(f);
    await db.removerPedidoFoto(p.id, p.tenantId);
    r.muraisDeData += 1;
  }
  for (const f of await db.fotosPendentesAntigas(quando.getTime() - PRAZO_FILA_DIAS * 864e5)) await apagar(f);
  return r;
}

/* ---------------- .zip sem compressão ---------------- */
let TABELA = null;
function crc32(buf) {
  if (!TABELA) {
    TABELA = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TABELA[n] = c; }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABELA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
// arquivos: [{ nome, bytes }] → Buffer do .zip.
function zip(arquivos) {
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const a of arquivos) {
    const nome = Buffer.from(a.nome, 'utf8');
    const crc = crc32(a.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); // UTF-8 no nome
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(a.bytes.length, 18); local.writeUInt32LE(a.bytes.length, 22); local.writeUInt16LE(nome.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(a.bytes.length, 20); central.writeUInt32LE(a.bytes.length, 24); central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(offset, 42);
    locais.push(local, nome, a.bytes);
    centrais.push(central, nome);
    offset += 30 + nome.length + a.bytes.length;
  }
  const cd = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(offset, 16);
  return Buffer.concat([...locais, cd, fim]);
}

module.exports = { apagaEm, diasParaSair, varrer, zip, crc32, PRAZO_DATA_DIAS, PRAZO_FILA_DIAS, AVISO_DIAS };
