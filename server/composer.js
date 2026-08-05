/*
 * server/composer.js — validação e reparo de composições.
 *
 * O modelo propõe o layout; este arquivo garante que ele seja exibível. É a
 * diferença entre "a IA cospe JSON" e "sai peça de signage profissional":
 * nenhum texto fora da tela, nada colado na borda, contraste sempre legível,
 * texto que não cabe reduzido, e camadas na ordem certa.
 *
 * Todas as funções são puras e determinísticas — dá para testar sem chamar IA.
 */
const ds = require('./design-system');

const TIPOS = ['texto', 'forma', 'icone', 'imagem'];
const PAPEIS = ['kicker', 'headline', 'sub', 'cta', 'fundo', 'destaque', 'decor', 'logo', 'imagem'];

/* ---------------- Saneamento de um elemento ---------------- */

function sanearElemento(e, palette, formato) {
  if (!e || typeof e !== 'object') return null;
  const tipo = TIPOS.includes(e.tipo) ? e.tipo : (e.text ? 'texto' : e.src ? 'imagem' : 'forma');
  const papel = PAPEIS.includes(e.papel) ? e.papel : null;

  const out = {
    tipo,
    papel: papel || undefined,
    x: ds.clamp(ds.num(e.x, 0), -20, 120),
    y: ds.clamp(ds.num(e.y, 0), -20, 120),
    w: ds.clamp(ds.num(e.w, 20), 1, 160),
    h: ds.clamp(ds.num(e.h, 20), 1, 160),
    rot: ds.clamp(ds.num(e.rot, 0), -45, 45),
    z: ds.clamp(Math.round(ds.num(e.z, 1)), 0, 99),
    opacidade: ds.clamp(ds.num(e.opacidade, 1), 0.05, 1),
  };

  if (tipo === 'texto') {
    out.text = String(e.text == null ? '' : e.text).slice(0, 240);
    out.cor = ds.okHex(e.cor, palette.texto);
    out.align = ['left', 'center', 'right'].includes(e.align) ? e.align : 'left';
    out.peso = ds.clamp(ds.num(e.peso, 800), 300, 900);
    out.sombra = !!e.sombra;
    const escala = ds.escalaTipografica(formato);
    const padrao = escala[papel] || escala.sub;
    out.tamanho = ds.clamp(ds.num(e.tamanho, padrao), 1.2, 22);
  } else if (tipo === 'forma') {
    out.shape = ['rect', 'ellipse', 'triangle', 'diamond', 'diag'].includes(e.shape) ? e.shape : 'rect';
    out.radius = ds.clamp(ds.num(e.radius, 0), 0, 50);
    out.fill = sanearFill(e.fill, palette);
  } else if (tipo === 'icone') {
    out.name = typeof e.name === 'string' ? e.name : 'star';
    out.cor = ds.okHex(e.cor, palette.acento);
    out.peso = ds.clamp(ds.num(e.peso, 1.6), 0.5, 4);
  } else {
    out.src = typeof e.src === 'string' ? e.src : '';
    out.fit = e.fit === 'cover' ? 'cover' : 'contain';
    if (!out.src) return null; // imagem sem fonte não vira nada na tela
  }
  return out;
}

function sanearFill(fill, palette) {
  if (typeof fill === 'string') return ds.okHex(fill, palette.acento);
  if (fill && typeof fill === 'object') {
    const cores = Array.isArray(fill.cores) ? fill.cores : [];
    const c1 = ds.okHex(cores[0], palette.brand);
    const c2 = ds.okHex(cores[1], palette.brand2);
    return {
      grad: fill.grad === 'radial' ? 'radial' : 'linear',
      ang: ds.clamp(ds.num(fill.ang, 150), 0, 360),
      cores: [c1, c2],
    };
  }
  return palette.acento;
}

/* ---------------- Reparos ---------------- */

/*
 * Formas de fundo podem (e devem) sangrar para fora da peça — é o que dá o
 * visual de signage. Texto, não: fica dentro da área segura, senão a TV corta.
 */
function dentroDaAreaSegura(el, formato) {
  if (el.tipo === 'forma' || el.papel === 'fundo' || el.papel === 'decor') return el;
  const s = ds.safeArea(formato);
  const w = Math.min(el.w, s.w);
  const h = Math.min(el.h, s.h);
  return {
    ...el,
    w, h,
    x: ds.clamp(el.x, s.x, s.x + s.w - w),
    y: ds.clamp(el.y, s.y, s.y + s.h - h),
  };
}

/*
 * Cor efetiva de uma forma. Um gradiente não tem "uma" cor — o texto pode cair
 * em qualquer ponto dele, então usamos a média dos extremos. E uma forma
 * semitransparente deixa o fundo aparecer: mistura na proporção da opacidade.
 * Sem isso o validador estima errado e "corrige" texto claro para escuro em
 * cima de um fundo que continua escuro — deixando o texto invisível.
 */
function corEfetiva(forma, fundo) {
  const f = forma.fill;
  const base = typeof f === 'string' ? f
    : (f && Array.isArray(f.cores) && f.cores.length)
      ? ds.mix(f.cores[0], f.cores[1] || f.cores[0], 0.5)
      : fundo;
  const op = forma.opacidade == null ? 1 : forma.opacidade;
  return ds.mix(fundo, base, ds.clamp(op, 0, 1));
}

// O que está atrás de um elemento, para decidir a cor do texto por cima.
function fundoAtras(el, elementos, palette) {
  let cor = palette.bg;
  // Empilha da camada mais baixa para a mais alta: cada forma pinta por cima
  // da anterior, igual ao que o navegador faz.
  const abaixo = elementos
    .filter((o) => o !== el && o.tipo === 'forma' && (o.z || 0) < (el.z || 0))
    .sort((a, b) => (a.z || 0) - (b.z || 0));
  for (const forma of abaixo) {
    const area = ds.areaSobreposta(el, forma);
    // Cobertura parcial não define o fundo do texto inteiro — só conta quando
    // a forma cobre a maior parte dele.
    if (area <= el.w * el.h * 0.6) continue;
    cor = corEfetiva(forma, cor);
  }
  return cor;
}

// Texto ilegível é o erro mais comum do modelo. Aqui ele nunca sai ilegível.
function corrigirContraste(el, elementos, palette, formato) {
  if (el.tipo !== 'texto' && el.tipo !== 'icone') return el;
  const bg = fundoAtras(el, elementos, palette);
  const grande = el.tipo === 'texto' && el.tamanho >= ds.escalaTipografica(formato).headline * 0.7;
  const minimo = grande ? ds.MIN_CONTRAST_TITULO : ds.MIN_CONTRAST;
  if (ds.contrast(el.cor, bg) >= minimo) return el;

  // 1ª tentativa: manter a intenção de cor, só clarear/escurecer até passar.
  const paraClaro = ds.luminance(bg) < 0.4;
  let cor = el.cor;
  for (let i = 0; i < 12; i++) {
    cor = paraClaro ? ds.clarear(cor, 0.14) : ds.escurecer(cor, 0.14);
    if (ds.contrast(cor, bg) >= minimo) return { ...el, cor };
  }
  // 2ª: cai para preto/branco, que sempre resolve.
  return { ...el, cor: ds.textOn(bg) };
}

// Texto que não cabe: reduz o corpo até caber (nunca deixa transbordar).
function ajustarTamanho(el, formato) {
  if (el.tipo !== 'texto' || !el.text) return el;
  const r = ds.cabeNaCaixa(el.text, el, el.tamanho, formato);
  if (r.cabe) return el;
  return { ...el, tamanho: Math.max(1.4, r.sugestaoCqw) };
}

/*
 * Textos que colidem: empurra o de baixo para depois do de cima. Mexe só no
 * eixo Y — deslocar em X quebraria o alinhamento da coluna de texto.
 */
function separarTextos(elementos, formato) {
  const s = ds.safeArea(formato);
  const textos = elementos.filter((e) => e.tipo === 'texto').sort((a, b) => a.y - b.y);
  for (let i = 1; i < textos.length; i++) {
    const anterior = textos[i - 1];
    const atual = textos[i];
    if (!ds.sobrepoe(anterior, atual)) continue;
    const alvo = anterior.y + anterior.h + 1.5;
    // Só empurra se ainda couber na área segura; senão, encolhe o de cima.
    if (alvo + atual.h <= s.y + s.h) atual.y = alvo;
    else {
      const sobra = s.y + s.h - atual.h - 1.5;
      atual.y = Math.max(s.y, sobra);
      anterior.h = Math.max(4, atual.y - 1.5 - anterior.y);
    }
  }
  return elementos;
}

/*
 * Ordem das camadas: fundo embaixo, decoração, depois imagem, texto por cima.
 * O modelo costuma inverter isso e enterrar o título atrás de um bloco.
 */
const PESO_Z = { fundo: 0, decor: 1, imagem: 3, logo: 6, kicker: 7, headline: 8, sub: 8, cta: 9, destaque: 5 };
function ordenarCamadas(elementos) {
  return elementos.map((e) => {
    const base = e.papel && PESO_Z[e.papel] != null ? PESO_Z[e.papel]
      : e.tipo === 'forma' ? 1
      : e.tipo === 'imagem' ? 3
      : 7;
    // Preserva o desempate que o modelo propôs dentro da mesma faixa.
    return { ...e, z: base * 10 + ds.clamp(e.z, 0, 9) };
  });
}

/* ---------------- Entrada principal ---------------- */

/*
 * validarComposicao — recebe o que a IA propôs e devolve algo exibível, junto
 * com o relatório do que precisou ser corrigido (útil para melhorar o prompt e
 * para mostrar no painel que houve ajuste automático).
 */
function validarComposicao(bruto, { formato = '16/9', palette, duracao = 12 } = {}) {
  const pal = palette || ds.buildPalette('#1e3a8a', null, 'escuro');
  const correcoes = [];

  let elementos = (Array.isArray(bruto && bruto.elementos) ? bruto.elementos : [])
    .map((e) => sanearElemento(e, pal, formato))
    .filter(Boolean)
    .slice(0, 24); // peça de signage com mais que isso vira poluição

  if (!elementos.length) correcoes.push('composição vazia — devolvida sem elementos');

  elementos = ordenarCamadas(elementos);

  elementos = elementos.map((e) => {
    const dentro = dentroDaAreaSegura(e, formato);
    if (dentro.x !== e.x || dentro.y !== e.y || dentro.w !== e.w || dentro.h !== e.h) {
      correcoes.push(`"${rotulo(e)}" estava fora da área segura`);
    }
    return dentro;
  });

  elementos = separarTextos(elementos, formato);

  elementos = elementos.map((e) => {
    const ajustado = ajustarTamanho(e, formato);
    if (ajustado.tamanho !== e.tamanho) correcoes.push(`"${rotulo(e)}" não cabia — corpo reduzido`);
    return ajustado;
  });

  elementos = elementos.map((e) => {
    const corrigido = corrigirContraste(e, elementos, pal, formato);
    if (corrigido.cor !== e.cor) correcoes.push(`"${rotulo(e)}" sem contraste — cor ajustada`);
    return corrigido;
  });

  const bg = sanearBg(bruto && bruto.bg, pal);

  return {
    item: {
      type: 'composicao',
      formato,
      duracao: ds.clamp(ds.num(bruto && bruto.duracao, duracao), 5, 60),
      bg,
      elementos: elementos.map(({ papel, ...resto }) => (papel ? { ...resto, papel } : resto)),
    },
    correcoes,
  };
}

function rotulo(e) {
  if (e.tipo === 'texto') return (e.text || '').slice(0, 24) || e.papel || 'texto';
  return e.papel || e.tipo;
}

function sanearBg(bg, palette) {
  if (bg && bg.kind === 'imagem' && typeof bg.src === 'string' && bg.src) {
    return { kind: 'imagem', src: bg.src };
  }
  if (bg && bg.kind === 'cor' && typeof bg.cor === 'string' && bg.cor.trim()) {
    return { kind: 'cor', cor: bg.cor };
  }
  // Padrão: gradiente da paleta — nunca um fundo chapado sem graça.
  return { kind: 'cor', cor: `linear-gradient(150deg, ${palette.bg}, ${palette.bgAlt})` };
}

module.exports = { validarComposicao, sanearElemento, dentroDaAreaSegura, corrigirContraste, ajustarTamanho, separarTextos, ordenarCamadas };
