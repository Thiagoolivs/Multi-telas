/*
 * server/ia-imagem.js — o "Gerar com IA" do espaço de imagem
 * (POST /api/ia/imagem; o painel: web/src/components/fotos/TrocarFoto.jsx).
 *
 * O cliente escreve o que a foto deve mostrar ("pão francês dourado na
 * bancada"), e sai UMA foto no formato do espaço (deitada, em pé ou
 * quadrada), guardada nas fotos da conta como qualquer envio. A resposta é a
 * mídia, pronta para o espaço.
 *
 * O caminho do dinheiro é o de toda imagem (server.js, generate-image e
 * fotoDaConta): reserva o crédito ANTES de gerar, devolve se falhar, cobra só
 * depois de guardar, e toda chamada vira linha no uso_ia. O modelo é o da
 * cascata do Gemini em server/ai.js, e GEMINI_IMAGE_MODEL escolhe outro sem
 * mexer no código.
 *
 * Sem IA (AI_PROVIDER=dev: localhost, testes, o robô da régua) sai uma foto
 * de exemplo desenhada aqui, sempre a mesma para o mesmo pedido, e nada é
 * cobrado — mas o uso fica registrado, como o das outras chamadas.
 *
 * Gerador sem crédito (o provedor responde 402, ou "teto de gasto", "quota")
 * não é erro do cliente: a resposta diz o que fazer em vez disso.
 */
'use strict';
const zlib = require('zlib');
const crypto = require('crypto');
const cred = require('./creditos');

const FORMATOS = ['16/9', '9/16', '1/1'];
const PAPEIS = ['produto', 'ambiente', 'pessoa', 'textura'];
const SEM_CREDITO = 'A geração de imagens está sem crédito agora. Use uma foto do celular ou do banco.';
const FORA_DO_AR = 'A geração de imagens não está ligada agora. Use uma foto do celular ou do banco.';
const FALHOU = 'A IA não conseguiu fazer a foto agora. Tente de novo, ou use uma foto do celular ou do banco.';
const MAX_PEDIDO = 400;

// Quantas fotos por hora, por conta. MT_IA_IMAGEM_POR_HORA muda (o teste usa um número pequeno).
function porHora() {
  const n = Math.floor(Number(process.env.MT_IA_IMAGEM_POR_HORA));
  return n > 0 ? n : 20;
}

// O pedido, limpo: { prompt, formato, papel } ou { erro }.
function lerPedido(b) {
  const o = b && typeof b === 'object' ? b : {};
  const prompt = String(o.prompt == null ? '' : o.prompt).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_PEDIDO);
  if (!prompt) return { erro: 'Escreva o que a foto deve mostrar.' };
  return {
    prompt,
    formato: FORMATOS.indexOf(o.formato) >= 0 ? o.formato : '16/9',
    papel: PAPEIS.indexOf(o.papel) >= 0 ? o.papel : '',
  };
}

/*
 * O papel do espaço vira direção de foto. A direção de arte geral (sem
 * texto na imagem, luz, marca) é a de server/direcao-arte.js, que o
 * ai.generateImage já aplica; aqui só o que muda com o espaço.
 */
const DIRECAO_DO_PAPEL = {
  produto: 'o produto em destaque, inteiro no quadro, com respiro em volta',
  ambiente: 'o ambiente inteiro, sem uma pessoa em primeiro plano',
  pessoa: 'a pessoa de frente, rosto inteiro no quadro, com espaço acima da cabeça',
  textura: 'só textura de fundo, suave e sem objetos, sem nada no centro',
};
function promptDoEspaco(p) {
  return p.prompt + (DIRECAO_DO_PAPEL[p.papel] ? '. ' + DIRECAO_DO_PAPEL[p.papel] : '');
}

/*
 * O provedor recusou por dinheiro? 402, "spending cap", "billing" (a cota
 * classificada em server/motores.js) ou o 429 de "quota" do Gemini, que é a
 * cota do plano de graça acabando — não adianta tentar de novo agora.
 */
function semCredito(e) {
  if (!e) return false;
  return e.tipo === 'cota' || e.status === 402 || (e.status === 429 && /quota|exhausted/i.test(String(e.message || '')));
}

/* ---------------- A foto de exemplo (sem IA) ---------------- */

const TABELA_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TABELA_CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pedacoPng(tipo, dados) {
  const tam = Buffer.alloc(4); tam.writeUInt32BE(dados.length);
  const td = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([tam, td, crc]);
}

/*
 * Um PNG de verdade (não SVG: a foto entra no espaço, no <canvas> do fundo
 * desfocado e na lista de fotos da conta como qualquer outra), com um
 * degradê e uma luz macia onde ficaria o assunto. As cores saem do pedido:
 * o mesmo pedido dá sempre a mesma foto, byte a byte.
 */
function fotoDeExemplo(pedido) {
  const p = pedido || {};
  const [W, H] = p.formato === '9/16' ? [720, 1280] : p.formato === '1/1' ? [1024, 1024] : [1280, 720];
  const h = crypto.createHash('sha256').update(String(p.prompt || '') + '|' + (p.formato || '') + '|' + (p.papel || '')).digest();
  const cor = (i) => [h[i], h[i + 1], h[i + 2]].map((v) => 40 + Math.round(v * 0.55));
  const a = cor(0), b = cor(3);
  const cx = W * (0.35 + (h[6] / 255) * 0.3), cy = H * (0.4 + (h[7] / 255) * 0.2), r = Math.min(W, H) * 0.32;
  const linha = W * 3 + 1;
  const cru = Buffer.alloc(linha * H);
  for (let y = 0; y < H; y++) {
    cru[y * linha] = 0;
    for (let x = 0; x < W; x++) {
      const t = (x / W + y / H) / 2;
      const d = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy)) / r;
      const luz = d < 1 ? 0.35 * (1 - d * d) : 0;
      const o = y * linha + 1 + x * 3;
      for (let c = 0; c < 3; c++) {
        const v = a[c] + (b[c] - a[c]) * t;
        cru[o + c] = Math.min(255, Math.round(v + (255 - v) * luz));
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedacoPng('IHDR', ihdr),
    pedacoPng('IDAT', zlib.deflateSync(cru, { level: 6 })),
    pedacoPng('IEND', Buffer.alloc(0)),
  ]);
  return { mime: 'image/png', data: png, largura: W, altura: H };
}

/* ---------------- A geração ---------------- */

// A mídia como o painel lê (a mesma forma do envio: POST /api/media).
const daMidia = (salvo, nome, formato) => ({ id: salvo.id, name: nome, mime: salvo.mime, size: salvo.size, url: salvo.url, origem: 'ia', formato });

/*
 * Gera, guarda e cobra. Devolve { status, corpo } para a rota mandar.
 * ctx: { db, ai, midia, usoIA }; sess: a sessão (tenant_id, user_id).
 */
async function gerar(ctx, sess, pedido) {
  const { db, ai, midia, usoIA } = ctx;
  const tenant = await db.getTenant(sess.tenant_id);
  if (!tenant) return { status: 401, corpo: { error: 'não autenticado' } };
  const nome = 'IA · ' + pedido.prompt.slice(0, 60);

  if (ai.mode() === 'dev') {
    const img = fotoDeExemplo(pedido);
    const salvo = await midia.guardarBuffer(db, sess.tenant_id, img.data, img.mime, { nome, origem: 'ia', formato: pedido.formato });
    // Registrada como as outras chamadas, sem crédito: é a foto de exemplo.
    await usoIA.cobrar(db, tenant, { tipo: 'gerar-imagem-exemplo', quantidade: 1, userId: sess.user_id, referencia: salvo.id });
    return { status: 200, corpo: { item: daMidia(salvo, nome, pedido.formato), exemplo: true } };
  }

  // Reserva antes de gerar (D0.4b): sem saldo, nada é gerado.
  const pode = await usoIA.reservar(db, tenant, 'gerar-imagem', 1);
  if (!pode.ok) {
    const r = pode.resposta || cred.semSaldo(1, 0);
    return { status: 402, corpo: Object.assign({}, r, { error: r.mensagem || SEM_CREDITO, code: r.erro || 'imagem-sem-credito' }) };
  }
  // Uma reserva acaba de um jeito só: cobrada ou devolvida (D0.4c).
  const reserva = usoIA.controleDaReserva(db, tenant, pode.reserva);
  try {
    let img;
    try {
      img = await ai.generateImage(promptDoEspaco(pedido), { formato: pedido.formato, estilo: 'fotográfico' });
    } catch (e) {
      if (semCredito(e)) return { status: 402, corpo: { error: SEM_CREDITO, code: 'imagem-sem-credito' } };
      // Sem a chave de imagem (o 503 do próprio ai.generateImage) ou chave recusada: desligado, não adianta tentar de novo.
      if (e && ((e.status === 503 && !e.tipo) || e.tipo === 'chave')) return { status: 503, corpo: { error: FORA_DO_AR, code: 'imagem-desligada' } };
      return { status: 502, corpo: { error: FALHOU, code: 'imagem-falhou' } };
    }
    // A reserva de foto (sem a chave de imagem) não se cobra.
    if (img.reserva) await reserva.devolver();
    const salvo = await midia.guardarBuffer(db, sess.tenant_id, Buffer.from(img.data, 'base64'), img.mime, { nome, origem: 'ia', formato: pedido.formato });
    if (!img.reserva) {
      reserva.cobrada();
      await usoIA.cobrar(db, tenant, { tipo: 'gerar-imagem', quantidade: 1, userId: sess.user_id, referencia: salvo.id, reserva: pode.reserva });
    }
    return { status: 200, corpo: { item: daMidia(salvo, nome, pedido.formato) } };
  } finally { await reserva.fechar(); }
}

module.exports = { lerPedido, gerar, porHora, semCredito, promptDoEspaco, fotoDeExemplo, FORMATOS, SEM_CREDITO, FORA_DO_AR, FALHOU };
