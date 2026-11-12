/*
 * ESPAÇOS DE IMAGEM no painel: o que o "Trocar foto"
 * (components/fotos/TrocarFoto.jsx) e o editor da peça precisam saber de um
 * espaço — o papel, a foto de agora, o banco de fotos do ramo, o pedido para
 * a IA — sem desenhar nada. O formato do item está em js/peca-html.js
 * (ESPAÇOS DE IMAGEM); a decisão de como a foto entra no espaço, em
 * js/peca-render.js (`encaixeDaFoto`), a mesma da TV.
 */

export const PAPEIS_FOTO = ['produto', 'ambiente', 'pessoa', 'textura'];
export const NOME_DO_PAPEL = { produto: 'produto', ambiente: 'ambiente', pessoa: 'pessoa', textura: 'fundo' };

// O valor de um campo de foto: o texto de sempre ("/media/…") ou { src, foco } (FOTO VIVA: também `poster`).
export function lerValor(valor) {
  if (valor && typeof valor === 'object') {
    const f = valor.foco;
    const foco = f && Number.isFinite(Number(f.x)) && Number.isFinite(Number(f.y)) ? { x: Number(f.x), y: Number(f.y) } : null;
    const r = { src: typeof valor.src === 'string' ? valor.src : '', foco };
    if (typeof valor.poster === 'string' && valor.poster) r.poster = valor.poster;
    return r;
  }
  return { src: valor ? String(valor) : '', foco: null };
}

// O papel do espaço: o que o item diz, o do modelo de onde ele veio, ou "produto".
export function papelDoEspaco(item, campo, doModelo) {
  const e = item && item.espacos && item.espacos[campo];
  if (e && PAPEIS_FOTO.includes(e.papel)) return e.papel;
  if (PAPEIS_FOTO.includes(doModelo)) return doModelo;
  return 'produto';
}

/*
 * O espaço depois de escolher a foto: o papel fica; foco e fundo são da foto
 * nova (os da foto de antes não valem mais).
 */
export function espacoComFoto(anterior, escolha) {
  const a = anterior || {};
  const e = escolha || {};
  const novo = {};
  if (PAPEIS_FOTO.includes(a.papel)) novo.papel = a.papel;
  if (e.foco) novo.foco = { x: arred(e.foco.x), y: arred(e.foco.y) };
  if (typeof e.fundo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(e.fundo) && e.fundo.length <= 4096) novo.fundo = e.fundo;
  // FOTO VIVA: o poster do vídeo (o primeiro quadro, ao lado dele). A porta confere (js/peca-html.js, posterDoVideo).
  if (typeof e.poster === 'string' && /^(https:\/\/[\w.-]+)?\/(media|pecas-ouro\/videos)\/[\w./-]+\.(jpe?g|png|webp)$/i.test(e.poster)) novo.poster = e.poster;
  return novo;
}
const arred = (n) => Math.round(Math.min(1, Math.max(0, Number(n) || 0)) * 1000) / 1000;

// A proporção (largura ÷ altura) de um formato: '16/9', um número, [w, h] ou { w, h }.
export function proporcaoDe(formato) {
  if (typeof formato === 'number' && formato > 0) return formato;
  if (Array.isArray(formato) && formato[0] > 0 && formato[1] > 0) return formato[0] / formato[1];
  if (formato && typeof formato === 'object' && formato.w > 0 && formato.h > 0) return formato.w / formato.h;
  const m = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(String(formato || ''));
  return m && Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : 16 / 9;
}

/*
 * O tamanho do espaço na TV, em pixel: o medido (o editor mede a peça no
 * tamanho real) ou o de uma TV de 1080 linhas na proporção pedida. É nesse
 * tamanho que a prévia decide "pequena demais", como a TV.
 */
export function tamanhoNaTv(formato) {
  if (formato && typeof formato === 'object' && !Array.isArray(formato) && formato.w > 0 && formato.h > 0) return [formato.w, formato.h];
  if (Array.isArray(formato) && formato[0] > 0 && formato[1] > 0) return [formato[0], formato[1]];
  const r = proporcaoDe(formato);
  // O lado menor tem 1080, como em TAMANHO_REAL (lib/pecaHtml.js): 16/9 é 1920×1080; 9/16, 1080×1920.
  return r >= 1 ? [Math.round(1080 * r), 1080] : [1080, Math.round(1080 / r)];
}

// A foto que a IA gera sai deitada, em pé ou quadrada: a mais perto do espaço.
export function formatoParaIA(formato) {
  const r = proporcaoDe(formato);
  const opcoes = [['16/9', 16 / 9], ['9/16', 9 / 16], ['1/1', 1]];
  return opcoes.reduce((m, o) => (Math.abs(Math.log(r / o[1])) < Math.abs(Math.log(r / m[1])) ? o : m))[0];
}

/*
 * O BANCO DE FOTOS (pecas-ouro/fotos/banco.json): as do ramo da conta e do
 * papel do espaço primeiro; depois as do ramo para outro papel e as que
 * servem a qualquer negócio ("geral"); por fim, as do mesmo papel de outro
 * ramo. Nunca vazio enquanto houver foto no banco.
 */
export function fotosDoBanco(lista, ramo, papel) {
  const fotos = (Array.isArray(lista) ? lista : []).filter((f) => f && f.id && f.arquivo);
  const doRamo = (f) => Array.isArray(f.ramos) && (f.ramos.includes(ramo) || f.ramos.includes('geral'));
  const nota = (f) => (doRamo(f) && f.papel === papel ? 0 : doRamo(f) ? 1 : f.papel === papel ? 2 : 3);
  return fotos.map((f, i) => ({ f, i, n: nota(f) })).sort((a, b) => a.n - b.n || a.i - b.i)
    .map(({ f, n }) => ({ ...f, combina: n === 0, doRamo: n <= 1 }));
}

const LUGAR_DO_RAMO = {
  padaria: 'padaria', comida: 'restaurante', otica: 'ótica', saude: 'clínica', beleza: 'salão de beleza', barbearia: 'barbearia',
  academia: 'academia', pet: 'pet shop', moda: 'loja de roupas', varejo: 'mercado', corporativo: 'escritório',
};
const FEMININOS = new Set(['padaria', 'ótica', 'clínica', 'barbearia', 'academia', 'loja de roupas']);
const da = (l) => (FEMININOS.has(l) ? 'da ' : 'do ') + l;
const na = (l) => (FEMININOS.has(l) ? 'na ' : 'no ') + l;
// Onde o produto aparece, quando o ramo tem um lugar óbvio para ele.
const VITRINE_DO_RAMO = {
  padaria: 'na bancada da padaria', comida: 'na mesa do restaurante', otica: 'na vitrine da ótica',
  varejo: 'na prateleira do mercado', moda: 'na arara da loja',
};
const ASSUNTO_DO_RAMO = {
  padaria: 'pão francês dourado', comida: 'prato do dia bem servido', otica: 'óculos de sol', saude: 'atendimento acolhedor',
  beleza: 'cabelo bem cuidado', barbearia: 'corte de cabelo masculino', academia: 'treino com halteres', pet: 'cachorro feliz depois do banho',
  moda: 'roupas da nova coleção', varejo: 'frutas frescas', corporativo: 'equipe trabalhando',
};

/*
 * O pedido para a IA, já escrito: o título da peça (o que ela anuncia), o
 * lugar do negócio e o jeito de foto do papel. A pessoa só confere e manda.
 * Ex.: "Pão francês dourado na bancada da padaria, luz natural, foto profissional".
 */
export function pedidoDaFoto({ titulo, papel, ramo } = {}) {
  const assunto = String(titulo || '').replace(/\s+/g, ' ').trim().replace(/[.!]+$/, '') || ASSUNTO_DO_RAMO[ramo] || 'O produto da loja';
  const Assunto = assunto.charAt(0).toUpperCase() + assunto.slice(1);
  const minusculo = assunto.charAt(0).toLowerCase() + assunto.slice(1);
  const lugar = LUGAR_DO_RAMO[ramo] || '';
  const fim = 'luz natural, foto profissional';
  if (papel === 'ambiente') return 'Interior ' + (lugar ? da(lugar) : 'da loja') + ' arrumado e acolhedor, ' + minusculo + ', ' + fim;
  // Pessoa e fundo não levam o título: o título de quem aparece costuma ser um nome ("Bem-vinda, Ana").
  if (papel === 'pessoa') return 'Retrato de uma pessoa sorrindo' + (lugar ? ' ' + na(lugar) : '') + ', meio corpo, ' + fim;
  if (papel === 'textura') return 'Textura suave e desfocada para fundo' + (lugar ? ', no clima ' + da(lugar) : '') + ', sem objetos no centro, foto profissional';
  return Assunto + ' ' + (VITRINE_DO_RAMO[ramo] || (lugar ? 'em destaque ' + na(lugar) : 'em destaque')) + ', ' + fim;
}

/* ---------------- Leituras (navegador) ---------------- */

let banco = null;
// O índice do banco de fotos, uma vez por sessão. Sem rede ou sem arquivo: lista vazia.
export function carregarBanco() {
  if (!banco) {
    banco = fetch('/pecas-ouro/fotos/banco.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : []))
      .then((l) => (Array.isArray(l) ? l : []))
      .catch(() => { banco = null; return []; });
  }
  return banco;
}

let manifesto = null;
// O papel que o manifesto dá ao espaço de uma peça-ouro (item antigo, sem `espacos`).
export function papelNoManifesto(base, campo) {
  if (!base) return Promise.resolve('');
  if (!manifesto) {
    manifesto = fetch('/pecas-ouro/manifesto.json').then((r) => (r.ok ? r.json() : null)).catch(() => { manifesto = null; return null; });
  }
  return manifesto.then((m) => {
    const p = ((m && m.pecas) || []).find((x) => x.id === base);
    return (p && p.fotos && p.fotos[campo]) || '';
  });
}
