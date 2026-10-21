/*
 * js/paletas.js — as paletas que o sistema sugere para a Marca.
 *
 * O dono, em 21/10: "se deixar ao gosto do cliente fica feio para quem tem
 * mau gosto". Cor livre continua existindo (em "avançado"), mas o caminho
 * principal é ESCOLHER entre três ou quatro paletas prontas, e a melhor já
 * vem aplicada.
 *
 * De onde vêm as sugestões, nesta ordem:
 *
 *   1. As cores que a empresa JÁ TEM (as que ela digitou, as do logo, as do
 *      site lido). Viram a BASE: a matiz é dela, e o sistema só acerta a
 *      luminosidade e a saturação para a cor servir de fundo de cartaz e de
 *      texto, e monta o acento em volta. Magenta puro digitado à mão vira um
 *      framboesa que se lê — continua sendo a cor dela.
 *   2. O ramo do negócio. Cada ramo tem paletas curadas, desenhadas para
 *      aquele tipo de vitrine (ótica pede confiança, academia pede energia).
 *      Conta nova nasce com a primeira do ramo dela — nunca sem marca.
 *
 * Toda paleta devolvida passa no contrato de js/tokens.js nos modos claro,
 * escuro e marca. Não por estimativa: o teste gera os tokens e confere.
 *
 * Não chama modelo nenhum. Sugerir paleta é gosto codificado mais conta de
 * contraste, e isso tem que funcionar de graça, na hora, e com a IA fora do
 * ar — é a primeira tela que a conta nova vê.
 *
 * A ordem das cores é a da Marca: [principal, acento, apoio]. A principal é a
 * identidade (o fundo no modo "Cor da marca"); o acento é a cor de ação — o
 * selo, o preço, a chamada (`marca2` em js/tokens.js); o apoio é a terceira,
 * para quem quiser.
 *
 * Módulo duplo, como js/tokens.js: `require()` no Node, `MTPaletas` no
 * navegador (depois de js/cor.js, js/fontes.js e js/tokens.js).
 */
(function (raiz, fabrica) {
  var node = typeof module === 'object' && module.exports && typeof require === 'function';
  var api = fabrica(node ? require('./cor.js') : raiz.MTCor, node ? require('./tokens.js') : raiz.MTTokens);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPaletas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (C, T) {
  'use strict';

  /*
   * Os ramos e as palavras que os denunciam no nome da empresa, no ramo que a
   * memória deduziu ou no resumo do site. A ordem importa: "pet shop" é pet
   * antes de ser loja, "café" é padaria antes de ser restaurante.
   */
  const RAMOS = [
    { id: 'otica', nome: 'Ótica', palavras: ['otica', 'optica', 'oculos', 'lentes', 'oftalm'] },
    { id: 'pet', nome: 'Pet shop', palavras: ['pet', 'veterin', 'banho e tosa', 'animal', 'cao', 'gato'] },
    { id: 'academia', nome: 'Academia', palavras: ['academia', 'fitness', 'crossfit', 'pilates', 'treino', 'gym', 'musculacao', 'funcional', 'luta', 'jiu', 'muay', 'danca'] },
    { id: 'barbearia', nome: 'Barbearia', palavras: ['barbearia', 'barber', 'barba'] },
    { id: 'beleza', nome: 'Salão e estética', palavras: ['salao', 'beleza', 'estetica', 'studio', 'cabelo', 'manicure', 'unha', 'spa', 'cosmetic', 'maquiagem', 'sobrancelha', 'depila'] },
    { id: 'saude', nome: 'Saúde', palavras: ['clinica', 'saude', 'odonto', 'dent', 'sorriso', 'medic', 'consultorio', 'laborator', 'fisio', 'vacina', 'hospital', 'farmacia', 'drogaria', 'psico', 'nutri', 'exame'] },
    { id: 'padaria', nome: 'Padaria e café', palavras: ['padaria', 'panificadora', 'confeitaria', 'doceria', 'doces', 'bolo', 'pao', 'cafeteria', 'cafe', 'emporio'] },
    { id: 'comida', nome: 'Restaurante e lanchonete', palavras: ['restaurante', 'lanchonete', 'lanche', 'pizzaria', 'pizza', 'hamburguer', 'burger', 'churrasc', 'sushi', 'japones', 'bistro', 'cozinha', 'comida', 'acai', 'sorvete', 'bar ', 'boteco', 'marmita', 'grill', 'espetinho', 'pastel'] },
    { id: 'moda', nome: 'Moda', palavras: ['moda', 'roupa', 'boutique', 'confeccao', 'calcado', 'sapat', 'joia', 'semijoia', 'acessorio', 'bolsa', 'lingerie', 'fashion', 'store'] },
    { id: 'varejo', nome: 'Mercado e varejo', palavras: ['mercado', 'supermercado', 'mercearia', 'atacad', 'hortifruti', 'sacolao', 'conveniencia', 'loja', 'magazine', 'material de construcao', 'ferragem', 'papelaria', 'distribuidora'] },
    { id: 'corporativo', nome: 'Escritório e indústria', palavras: ['escritorio', 'advoca', 'advog', 'contab', 'industria', 'fabrica', 'embalag', 'grafica', 'metalurg', 'engenharia', 'imobiliaria', 'condominio', 'consultoria', 'logistica', 'transport', 'construtora', 'seguros', 'banco', 'cooperativa', 'escola', 'colegio', 'faculdade', 'igreja'] },
  ];
  const RAMO_PADRAO = 'geral';
  const NOMES_RAMO = RAMOS.reduce((o, r) => { o[r.id] = r.nome; return o; }, { geral: 'Outro ramo' });

  /*
   * As paletas curadas. Três por ramo, de propósito diferentes entre si:
   * uma clássica do ramo, uma contemporânea e uma ousada. Quem escolhe vê
   * três caminhos de verdade, e não três tons do mesmo azul.
   */
  const CURADAS = {
    otica: [
      { nome: 'Clássica', cores: ['#1b2a4a', '#c8a96e', '#e9e4d8'], porque: 'azul-marinho e dourado: confiança e acabamento de joalheria' },
      { nome: 'Contemporânea', cores: ['#23272f', '#2bb3a3', '#dfe6ea'], porque: 'grafite com turquesa: tecnologia de lente, sem frieza' },
      { nome: 'Boutique', cores: ['#5e1f2d', '#e3c79a', '#f3ece4'], porque: 'vinho e champanhe: grife, armação importada' },
    ],
    padaria: [
      { nome: 'Forno', cores: ['#6b3a1e', '#e8b04b', '#f6ead7'], porque: 'casca de pão e trigo: cheiro de fornada' },
      { nome: 'Rústica', cores: ['#a94a2a', '#f3d9a4', '#5f6b3a'], porque: 'terracota e creme: padaria de bairro, feita à mão' },
      { nome: 'Café da manhã', cores: ['#24493a', '#e0a82e', '#f5ebd9'], porque: 'verde-musgo e mostarda: café especial, empório' },
    ],
    academia: [
      { nome: 'Energia', cores: ['#121418', '#c6f432', '#2a2e35'], porque: 'preto e verde-limão: treino pesado, alto contraste' },
      { nome: 'Potência', cores: ['#1c3fbf', '#ff7a1a', '#0e1430'], porque: 'azul elétrico e laranja: movimento, resultado' },
      { nome: 'Intensa', cores: ['#b3122a', '#ffc93c', '#1c1c1f'], porque: 'vermelho e amarelo: luta, explosão, desafio' },
    ],
    barbearia: [
      { nome: 'Navalha', cores: ['#1c1c1c', '#b87333', '#e8dccb'], porque: 'preto e cobre: couro, madeira, tradição' },
      { nome: 'Poste', cores: ['#1f3a5f', '#c0392b', '#f1ece2'], porque: 'azul e vermelho do poste de barbeiro, em versão sóbria' },
      { nome: 'Whisky', cores: ['#3b2a20', '#d4a373', '#f2e8da'], porque: 'marrom e caramelo: clube, conversa, cadeira de couro' },
    ],
    beleza: [
      { nome: 'Rosé', cores: ['#7a2e4a', '#f2b8c6', '#f7edee'], porque: 'ameixa e rosa-claro: feminino sem ser infantil' },
      { nome: 'Nude', cores: ['#6e5246', '#e7cbb5', '#2e2523'], porque: 'tons de pele: estética, cuidado, naturalidade' },
      { nome: 'Glamour', cores: ['#1e1a1d', '#d4a08a', '#f4e9e4'], porque: 'preto e ouro rosé: noite, maquiagem, festa' },
    ],
    saude: [
      { nome: 'Confiança', cores: ['#0f4c75', '#4cc9a6', '#eaf4f8'], porque: 'azul e verde-menta: cuidado, limpeza, segurança' },
      { nome: 'Serena', cores: ['#16696d', '#f29e7e', '#eef6f5'], porque: 'verde-petróleo e coral: acolhimento, sem cara de hospital' },
      { nome: 'Clínica', cores: ['#1d3557', '#57b8e6', '#f1f6fa'], porque: 'marinho e azul-céu: precisão, consultório' },
    ],
    comida: [
      { nome: 'Brasa', cores: ['#9e1b14', '#f2b134', '#2b1d16'], porque: 'vermelho e mostarda: apetite, chapa quente' },
      { nome: 'Bistrô', cores: ['#2f3e2e', '#e9a23b', '#f4ecdc'], porque: 'verde-escuro e âmbar: comida caseira com capricho' },
      { nome: 'Noturna', cores: ['#1b1b1d', '#f25c05', '#f2e6d8'], porque: 'preto e laranja: hamburgueria, bar, delivery' },
    ],
    pet: [
      { nome: 'Patinha', cores: ['#245c80', '#f6b93b', '#eef4f8'], porque: 'azul e amarelo: alegria e confiança do veterinário' },
      { nome: 'Natural', cores: ['#2f6b4f', '#f28f3b', '#f1efe6'], porque: 'verde e laranja: ração natural, passeio no parque' },
      { nome: 'Divertida', cores: ['#5a3d82', '#ffca3a', '#f3eff8'], porque: 'roxo e amarelo: banho e tosa, brinquedo' },
    ],
    moda: [
      { nome: 'Editorial', cores: ['#1a1a1a', '#c8a97e', '#efe9e1'], porque: 'preto e areia: revista de moda, minimalismo' },
      { nome: 'Terracota', cores: ['#8f4128', '#e9d8c4', '#2f2622'], porque: 'terracota e linho: coleção de verão, tecido natural' },
      { nome: 'Musgo', cores: ['#3d4a3a', '#d9b88f', '#f1ece3'], porque: 'verde-musgo e caramelo: atemporal, alfaiataria' },
    ],
    varejo: [
      { nome: 'Oferta', cores: ['#b3121d', '#ffd60a', '#1f1f1f'], porque: 'vermelho e amarelo: preço baixo de longe' },
      { nome: 'Fresco', cores: ['#1f7a3a', '#ffb703', '#f2f7ee'], porque: 'verde e laranja: hortifruti, produto do dia' },
      { nome: 'Confiança', cores: ['#023e8a', '#ff8500', '#eef3fa'], porque: 'azul e laranja: atendimento, entrega, garantia' },
    ],
    corporativo: [
      { nome: 'Institucional', cores: ['#12355b', '#f2a541', '#eef2f6'], porque: 'marinho e âmbar: sério sem ser triste' },
      { nome: 'Sóbria', cores: ['#263238', '#26a69a', '#eceff1'], porque: 'grafite e verde-água: moderno, comunicação interna' },
      { nome: 'Azul', cores: ['#1e3a8a', '#38bdf8', '#eff4fb'], porque: 'azul corporativo com acento claro: tecnologia, clareza' },
    ],
    geral: [
      { nome: 'Azul profundo', cores: ['#1e3a8a', '#f2a541', '#eef2f8'], porque: 'azul e âmbar: combina com quase tudo' },
      { nome: 'Verde elegante', cores: ['#1f4d3f', '#e3b23c', '#f2efe6'], porque: 'verde-escuro e dourado: sofisticado e acolhedor' },
      { nome: 'Grafite', cores: ['#22252b', '#e4572e', '#efefec'], porque: 'grafite e laranja: moderno, chama atenção sem gritar' },
    ],
  };

  // Sem acento e em minúsculas: "Ótica", "OTICA" e "otica" são a mesma palavra.
  const normal = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /*
   * Descobre o ramo pelos textos que a conta já tem. Devolve o id ou
   * 'geral'. Palavra curta ("bar", "pet", "cao") só vale como palavra
   * inteira — senão "Barbosa Advogados" seria um bar e "Competência", pet.
   */
  function detectarRamo(textos) {
    const t = ' ' + normal([].concat(textos || []).filter(Boolean).join(' ')).replace(/[^a-z0-9 ]/g, ' ') + ' ';
    for (const r of RAMOS) {
      for (const p of r.palavras) {
        const curta = p.trim().length <= 4;
        if (curta ? new RegExp('\\b' + p.trim() + '\\b').test(t) : t.indexOf(p) >= 0) return r.id;
      }
    }
    return RAMO_PADRAO;
  }

  /*
   * A cor da empresa acertada para servir de PRINCIPAL.
   *
   * A principal é o fundo do cartaz (modo "Cor da marca") e a tinta dos
   * fundos claro e escuro. Muito clara, o cartaz vira papel; muito escura,
   * vira preto; saturada demais, vibra na TV e cansa. A matiz não se toca:
   * é ela que faz a cor ser "a da empresa".
   *
   * Cinza continua cinza, mas vira GRAFITE: marca preta e branca é escolha,
   * não defeito, e o que a faz parecer cara é o preto — branco ou cinza-médio
   * de fundo de cartaz parece papel.
   *
   * Amarelo é a exceção de luminosidade: escurecido na mesma matiz vira oliva
   * (o mesmo problema que js/tokens.js resolve em `matizAoEscurecer`). Ele
   * pode ficar mais claro que as outras cores, e o que escurece puxa para o
   * âmbar.
   */
  function principalDe(hex) {
    const o = C.paraOklch(C.okHex(hex, T.gerar({}).marca));
    if (o.c < 0.03) return C.deOklch(Math.min(o.l, 0.27), o.c, o.h);
    const amarelo = o.h >= 80 && o.h <= 115;
    const L = Math.max(0.3, Math.min(amarelo ? 0.74 : 0.58, o.l));
    // No máximo 20° de puxada: amarelo vira âmbar, não laranja.
    const h = amarelo && L < o.l ? o.h - Math.min(20, (o.h - 75) * Math.min(1, (o.l - L) / 0.25)) : o.h;
    return C.deOklch(L, Math.max(0.06, Math.min(0.15, o.c)), h);
  }

  /*
   * Cor "neon": muito clara e muito saturada — verde-limão, amarelo-limão,
   * ciano. Ela é acento por natureza: de fundo, ofusca; sobre fundo escuro,
   * é a assinatura (o preto e limão das academias). Escurecida para virar
   * fundo, perderia justamente o que a faz ser dela.
   */
  const neon = (hex) => { const o = C.paraOklch(hex); return o.l > 0.78 && o.c > 0.12; };

  /*
   * O acento acertado para se ler sobre a principal (3:1, o AA de elemento
   * gráfico — é o selo e o preço no cartaz) sem perder a matiz dele.
   */
  function acentoDe(hex, principal) {
    const o = C.paraOklch(hex);
    const c = o.c < 0.03 ? o.c : Math.max(0.08, Math.min(0.17, o.c));
    let melhor = C.deOklch(o.l, c, o.h);
    if (C.contraste(melhor, principal) >= 3) return melhor;
    const lp = C.paraOklch(principal).l;
    // Afasta da principal: sobe se ela é escura, desce se é clara.
    const passo = lp < 0.6 ? 0.02 : -0.02;
    for (let L = o.l; L >= 0 && L <= 1; L += passo) {
      melhor = C.deOklch(L, c, o.h);
      if (C.contraste(melhor, principal) >= 3) return melhor;
    }
    return melhor;
  }

  // O apoio: um neutro claro tingido pela principal. Papel, não cor.
  const apoioDe = (principal) => {
    const o = C.paraOklch(principal);
    return C.deOklch(0.95, Math.min(o.c * 0.12, 0.015), o.h);
  };

  /*
   * O acento que combina com a matiz da principal. Não é a complementar
   * pura — magenta com verde-menta é o tipo de par que o "mau gosto" escolhe.
   * É o par que designer usa para cada faixa:
   *   azul, turquesa, roxo     âmbar (o par clássico de frio com quente)
   *   verde                    dourado
   *   laranja, marrom, amarelo creme (terracota com linho, pão com trigo)
   *   vermelho, rosa, vinho    dourado
   */
  function acentoQueCombina(h) {
    if (h > 160 && h < 300) return { nome: 'âmbar', cor: C.deOklch(0.8, 0.14, 70) };
    if (h >= 100 && h <= 160) return { nome: 'dourado', cor: C.deOklch(0.82, 0.12, 85) };
    if (h >= 20 && h < 100) return { nome: 'creme', cor: C.deOklch(0.92, 0.05, 85) };
    return { nome: 'dourado', cor: C.deOklch(0.82, 0.12, 85) };
  }

  /*
   * Paletas em volta das cores da empresa, a melhor primeiro.
   *
   *   "As suas cores"   a principal e o acento dela, só acertados
   *   "Sua cor + …"     a principal com o acento que combina com ela
   *   "Tom sobre tom"   a principal com uma versão clara dela mesma —
   *                     monocromático, não erra nunca
   */
  function aoRedor(cores) {
    const lista = [].concat(cores || []).map((c) => C.okHex(c, null)).filter(Boolean);
    if (!lista.length) return [];
    const sai = [];
    if (neon(lista[0])) {
      const n = C.paraOklch(lista[0]);
      const fundo = C.deOklch(0.2, 0.02, n.h);
      sai.push({ nome: 'Sua cor em destaque', cores: [fundo, acentoDe(lista[0], fundo), C.deOklch(0.3, 0.025, n.h)],
        porque: 'a sua cor brilhando sobre um fundo escuro, como letreiro', base: true });
    }
    const principal = principalDe(lista[0]);
    const o = C.paraOklch(principal);
    if (lista[1]) {
      sai.push({ nome: 'As suas cores', cores: [principal, acentoDe(lista[1], principal), apoioDe(principal)],
        porque: 'as cores que a empresa já usa, acertadas para a TV', base: true });
    }
    /*
     * Principal clara (amarelo, âmbar) pede acento ESCURO: creme sobre
     * amarelo não aparece, e o ajuste de contraste o transformaria num
     * marrom que ninguém escolheu.
     */
    const par = o.l > 0.62 ? { nome: 'marinho', cor: C.deOklch(0.3, 0.08, 260) } : acentoQueCombina(o.c < 0.03 ? 250 : o.h);
    sai.push({ nome: 'Sua cor + ' + par.nome, cores: [principal, acentoDe(par.cor, principal), apoioDe(principal)],
      porque: 'a sua cor com o acento que combina com ela', base: true });
    sai.push({ nome: 'Tom sobre tom', cores: [principal, acentoDe(C.deOklch(0.86, Math.min(o.c, 0.1), o.h), principal), C.deOklch(0.22, Math.min(o.c, 0.05), o.h)],
      porque: 'a sua cor em dois tons: monocromático, sempre elegante', base: true });
    return sai;
  }

  // Duas paletas iguais (mesmas duas primeiras cores) contam uma vez só.
  const chave = (p) => p.cores.slice(0, 2).join('|');

  /*
   * As sugestões, melhor primeiro.
   *
   *   ramo    id de RAMOS, ou textos para detectar (nome da empresa etc.)
   *   cores   as cores que a empresa já tem: digitadas, do logo, do site
   *   limite  quantas (padrão 4)
   *
   * Com cores da empresa, a primeira sugestão parte delas — a identidade
   * que ela já tem vale mais que qualquer paleta bonita de catálogo. As do
   * ramo vêm depois, como alternativa.
   */
  function sugerir(o) {
    const p = o || {};
    const ramo = CURADAS[p.ramo] ? p.ramo : detectarRamo(p.textos || p.ramo);
    const limite = p.limite || 4;
    const vistas = new Set();
    const out = [];
    const por = (x, origem) => {
      if (out.length >= limite || vistas.has(chave(x))) return;
      vistas.add(chave(x));
      out.push(Object.assign({}, x, { origem, id: origem + '-' + out.length }));
    };
    const daEmpresa = aoRedor(p.cores);
    // Da empresa: no máximo duas, para sobrar lugar para o ramo.
    daEmpresa.slice(0, 2).forEach((x) => por(x, 'empresa'));
    CURADAS[ramo].forEach((x) => por(x, 'ramo'));
    CURADAS[RAMO_PADRAO].forEach((x) => por(x, 'ramo'));
    return { ramo, nomeRamo: NOMES_RAMO[ramo], paletas: out };
  }

  // A paleta com que uma conta nova nasce: a primeira do ramo dela.
  function inicial(textos) {
    const ramo = detectarRamo(textos);
    return CURADAS[ramo][0].cores.slice();
  }

  /*
   * O aviso do modo avançado: as cores escolhidas à mão se leem?
   *
   * Duas perguntas, em português de lojista:
   *   - o acento aparece sobre a principal? (3:1 — é o selo no cartaz)
   *   - o sistema precisou mexer muito para a peça se ler? (algum par do
   *     contrato falha mesmo depois do ajuste)
   * Devolve uma lista de frases; vazia é tudo certo.
   */
  function avisos(cores) {
    const lista = [].concat(cores || []).map((c) => C.okHex(c, null)).filter(Boolean);
    const sai = [];
    if (!lista.length) return sai;
    const [a, b] = lista;
    if (b) {
      const k = C.contraste(a, b);
      if (k < 3) {
        sai.push('O acento quase some sobre a cor principal (' + k.toFixed(1).replace('.', ',')
          + ':1). Na TV o sistema vai clarear ou escurecer o acento para ele aparecer.');
      }
    }
    const o = C.paraOklch(a);
    if (o.c > 0.2) sai.push('A cor principal é muito saturada: numa TV grande ela vibra e cansa a vista. Uma versão um pouco mais fechada fica mais cara.');
    if (o.l > 0.85) sai.push('A cor principal é quase branca: no estilo "Cor da marca" a peça vai parecer papel em branco.');
    for (const modo of ['claro', 'escuro', 'marca']) {
      if (T.conferir(T.gerar({ marca: a, marca2: b, modo })).length) {
        sai.push('Algumas combinações não chegam ao contraste mínimo no estilo ' + modo + '. Prefira uma das paletas sugeridas.');
        break;
      }
    }
    return sai;
  }

  return { RAMOS, NOMES_RAMO, CURADAS, detectarRamo, aoRedor, sugerir, inicial, avisos, principalDe };
});
