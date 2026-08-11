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
const fontes = require('../js/fontes.js');

const TIPOS = ['texto', 'forma', 'icone', 'imagem'];
const PAPEIS = ['kicker', 'headline', 'display', 'sub', 'cta', 'fundo', 'destaque', 'decor', 'logo', 'imagem', 'legal'];

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
    out.fonte = ds.familia(e.fonte);
    out.sombra = !!e.sombra;
    out.italico = !!e.italico;
    /*
     * O peso é encaixado no que a família TEM. Pedir 900 a uma fonte de um
     * peso só faz o navegador engordar a letra por conta própria, cada um do
     * seu jeito — e aí o editor mostra uma coisa e a TV desenha outra.
     */
    out.peso = fontes.pesoValido(out.fonte, ds.clamp(ds.num(e.peso, 800), 300, 900));
    out.caixaAlta = !!e.caixaAlta;
    /*
     * Ausente é diferente de zero: quem não mexeu no espaçamento segue o padrão
     * da família, e o padrão muda quando se troca a fonte. Guardar 0 aqui
     * congelaria o texto num ajuste que ninguém pediu.
     */
    if (e.espacamento != null && Number.isFinite(Number(e.espacamento))) {
      out.espacamento = ds.clamp(Number(e.espacamento), fontes.ESPACAMENTO.min, fontes.ESPACAMENTO.max);
    }
    if (e.entrelinha != null && Number.isFinite(Number(e.entrelinha))) {
      out.entrelinha = ds.clamp(Number(e.entrelinha), fontes.ENTRELINHA.min, fontes.ENTRELINHA.max);
    }
    // Família condensada de cartaz pede caixa alta — é parte do estilo.
    if (ds.FAMILIAS[out.fonte].caixaAlta || out.caixaAlta) out.text = out.text.toUpperCase();
    const escala = ds.escalaTipografica(formato);
    const padrao = escala[papel] || escala.sub;
    // Display pode ser enorme: o teto sobe para caber "ANIVERSÁRIO" ocupando
    // meia peça, como nas referências.
    out.tamanho = ds.clamp(ds.num(e.tamanho, padrao), 1.2, papel === 'display' ? 46 : 26);
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
  /*
   * "display" é o título-cartaz que sangra pelas bordas de propósito (o
   * ANIVERSÁRIO da referência). Só garantimos que ele não suma da tela: a
   * altura fica dentro, e sobra pelo menos metade da largura visível.
   */
  if (el.papel === 'display') {
    const s = ds.safeArea(formato);
    return {
      ...el,
      y: ds.clamp(el.y, -5, 100 - Math.min(el.h, 100) + 5),
      x: ds.clamp(el.x, -el.w * 0.35, 100 - el.w * 0.65),
    };
  }
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
  /*
   * A exigência de contraste vem do PAPEL, não do tamanho: o corpo pode ser
   * reduzido por não caber e isso não muda o fato de ser um título-cartaz.
   * Classificar por tamanho fazia o display perder a faixa dele depois do
   * ajuste e virar preto sobre laranja — o oposto da referência.
   */
  const esc = ds.escalaTipografica(formato);
  const grandePorTamanho = el.tipo === 'texto' && el.tamanho >= esc.headline * 0.7;
  const minimo = el.papel === 'display' ? ds.MIN_CONTRAST_DISPLAY
    : (el.papel === 'headline' || grandePorTamanho) ? ds.MIN_CONTRAST_TITULO
    : ds.MIN_CONTRAST;
  if (ds.contrast(el.cor, bg) >= minimo) return el;

  /*
   * Preserva a intenção de cor, clareando OU escurecendo até passar. Testa as
   * duas direções: decidir pela luminância do fundo erra em cor saturada de
   * luminância média (laranja, vermelho), onde clarear afasta do alvo.
   */
  let melhor = null;
  for (const paraClaro of [true, false]) {
    let cor = el.cor;
    // 22 passos: creme sobre laranja saturado precisa de ~16 para chegar ao
    // alvo; parar antes jogava a cor para o preto-azulado, fora da identidade.
    for (let i = 0; i < 22; i++) {
      cor = paraClaro ? ds.clarear(cor, 0.12) : ds.escurecer(cor, 0.12);
      if (ds.contrast(cor, bg) >= minimo) {
        // Entre as duas saídas, fica a que mudou menos a cor original.
        const passos = i;
        if (!melhor || passos < melhor.passos) melhor = { cor, passos };
        break;
      }
    }
  }
  if (melhor) return { ...el, cor: melhor.cor };
  // Nenhuma direção resolveu: preto/branco sempre resolve.
  return { ...el, cor: ds.textOn(bg) };
}

// Texto que não cabe: reduz o corpo até caber (nunca deixa transbordar).
function ajustarTamanho(el, formato) {
  if (el.tipo !== 'texto' || !el.text) return el;
  // A sugestão é uma estimativa, não a solução exata — itera até caber de
  // fato. Uma passada só deixava título de duas linhas ainda estourando.
  let tamanho = el.tamanho;
  for (let i = 0; i < 6; i++) {
    const r = ds.cabeNaCaixa(el.text, el, tamanho, formato, el.fonte);
    if (r.cabe) break;
    const proximo = Math.max(1.4, Math.min(r.sugestaoCqw, tamanho * 0.88));
    if (proximo >= tamanho) break; // não está convergindo; para para não travar
    tamanho = proximo;
  }
  return tamanho === el.tamanho ? el : { ...el, tamanho: Number(tamanho.toFixed(2)) };
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
/* ---------------- Autodiagnóstico da peça ----------------
 *
 * O validador conserta o que sabe consertar. Isto é diferente: OLHA o
 * resultado e descreve os problemas que sobraram — os que exigem outra
 * composição, não um ajuste.
 *
 * Por que geometria e não visão de máquina: rasterizar a peça no servidor
 * exigiria um navegador headless, que não existe no ambiente de produção. Já a
 * geometria o código conhece com precisão total — sobreposição, vazio,
 * desalinhamento e aperto de borda são fatos calculáveis, não impressões. É
 * mais confiável que pedir a um modelo para achar isso numa imagem, e chega
 * como instrução concreta na hora de refazer.
 */

// Só o que a pessoa lê. Forma e decoração se sobrepõem de propósito.
const PAPEIS_CONTEUDO = ['kicker', 'headline', 'display', 'sub', 'cta', 'logo', 'imagem', 'legal'];
const ehConteudo = (e) => PAPEIS_CONTEUDO.includes(e.papel) || e.tipo === 'texto';

function areaSobreposta(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function diagnosticar(elementos, formato) {
  const achados = [];
  const conteudo = elementos.filter(ehConteudo);
  if (!conteudo.length) return achados;

  /*
   * 1. Sobreposição entre conteúdos. Texto por cima de texto é o erro que mais
   * estraga a peça e o que o validador de contraste não enxerga — ele mede cor
   * contra o FUNDO, não contra outra palavra.
   */
  for (let i = 0; i < conteudo.length; i++) {
    for (let j = i + 1; j < conteudo.length; j++) {
      const a = conteudo[i], b = conteudo[j];
      const inter = areaSobreposta(a, b);
      if (inter <= 0) continue;
      const menor = Math.min(a.w * a.h, b.w * b.h) || 1;
      const parte = inter / menor;
      // Abaixo de 8% é encosto de caixa, não colisão visível.
      if (parte >= 0.08) {
        achados.push(`"${rotulo(a)}" e "${rotulo(b)}" se sobrepõem em ${Math.round(parte * 100)}% — separe os blocos`);
      }
    }
  }

  /*
   * 2. Alinhamento. Três margens esquerdas quase iguais mas não iguais é o que
   * separa peça de agência de peça de editor: ninguém aponta o motivo, todo
   * mundo sente. Só reclamamos do quase-alinhado — variar de propósito é arte.
   */
  const esquerdas = conteudo.filter((e) => (e.align || 'left') === 'left').map((e) => e.x);
  if (esquerdas.length >= 2) {
    const distintas = [];
    esquerdas.forEach((x) => { if (!distintas.some((d) => Math.abs(d - x) < 0.4)) distintas.push(x); });
    const quase = distintas.filter((a, i) => distintas.some((b, j) => j !== i && Math.abs(a - b) <= 4));
    if (quase.length >= 2) {
      achados.push(`margens quase iguais (${quase.map((v) => v.toFixed(1) + '%').join(', ')}) — alinhe no mesmo eixo`);
    }
  }

  /*
   * 3. Peso mal distribuído. Divide a peça em quadrantes e mede quanta área de
   * conteúdo cai em cada um. Tudo empilhado num canto com três quartos vazios
   * não é respiro, é peça torta.
   */
  const quad = [0, 0, 0, 0];
  conteudo.forEach((e) => {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2;
    const i = (cy >= 50 ? 2 : 0) + (cx >= 50 ? 1 : 0);
    quad[i] += e.w * e.h;
  });
  const total = quad.reduce((s, v) => s + v, 0);
  if (total > 0) {
    const maior = Math.max(...quad);
    const ocupados = quad.filter((v) => v / total >= 0.08).length;
    if (maior / total > 0.82 && ocupados <= 1) {
      const nomes = ['superior esquerdo', 'superior direito', 'inferior esquerdo', 'inferior direito'];
      achados.push(`quase tudo no canto ${nomes[quad.indexOf(maior)]} — distribua o peso na peça`);
    }
  }

  /*
   * 4. Aperto de borda. Elemento colado na margem da área segura passa a
   * sensação de que a peça foi cortada — em TV com overscan, às vezes é.
   */
  const s = ds.safeArea(formato);
  const colados = conteudo.filter((e) => {
    if (e.papel === 'display') return false; // display sangra de propósito
    return (e.x - s.x) < 0.5 || ((s.x + s.w) - (e.x + e.w)) < 0.5
      || (e.y - s.y) < 0.5 || ((s.y + s.h) - (e.y + e.h)) < 0.5;
  });
  if (colados.length >= 2) {
    achados.push(`${colados.length} elementos colados na borda da área segura — dê respiro`);
  }

  /*
   * 5. Hierarquia. Se o maior texto não é o headline, a peça não tem foco: a
   * pessoa lê o detalhe antes da mensagem.
   */
  const textos = conteudo.filter((e) => e.tipo === 'texto' && e.text);
  if (textos.length >= 2) {
    const maiorTexto = textos.reduce((a, b) => ((b.tamanho || 0) > (a.tamanho || 0) ? b : a));
    if (!['headline', 'display'].includes(maiorTexto.papel)) {
      achados.push(`"${rotulo(maiorTexto)}" está maior que o título — o olho lê o detalhe primeiro`);
    }
  }

  return achados.slice(0, 6);
}

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

  /*
   * O diagnóstico roda DEPOIS de todo conserto: o que ele acusa é o que
   * sobrou de errado na peça final, não no rascunho do modelo. Sem isso a
   * crítica reclamaria de coisas que o código já tinha resolvido.
   */
  const problemas = diagnosticar(elementos, formato);

  return {
    item: {
      type: 'composicao',
      formato,
      duracao: ds.clamp(ds.num(bruto && bruto.duracao, duracao), 5, 60),
      bg,
      elementos: elementos.map(({ papel, ...resto }) => (papel ? { ...resto, papel } : resto)),
    },
    correcoes,
    problemas,
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

module.exports = { validarComposicao, diagnosticar, sanearElemento, dentroDaAreaSegura, corrigirContraste, ajustarTamanho, separarTextos, ordenarCamadas };
