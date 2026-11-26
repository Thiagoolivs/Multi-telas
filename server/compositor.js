/*
 * server/compositor.js — o motor HTML (PLANO §4.2): a IA escreve a peça.
 *
 *   pedido → COMPOR (HTML + CSS imitando a biblioteca-ouro)
 *          → LINT (a porta de js/peca-html.js; recusou, pede de novo
 *            dizendo o que estava errado)
 *          → item peca-html pronto para a TV
 *
 * A biblioteca-ouro vai como exemplo, no `fixo` da chamada: é o mesmo texto
 * em todo pedido, e por isso fica no cache do provedor (server/motores.js).
 * Inteira até o teto do papel (MAX_EXEMPLOS); passou dele, uma amostra fixa
 * com variedade. O que muda por pedido — empresa, frase, foto — vai no fim.
 *
 * Renderizar e criticar o print (o resto do motor no §4.2) ficam para o
 * serviço de render; o experimento (§4.4) mede primeiro se a IA compõe bem
 * com exemplo bom e regra dura.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/peca-html.js');
const T = require('../js/tokens.js');
const regrasDoPapel = require('../js/regras-composicao.js');
const RC = require('../js/regras-de-conteudo.js');
const Perfil = require('../js/perfil.js');
const motores = require('./motores');
const conteudoPronto = require('./conteudoPronto');

const RAIZ = path.join(__dirname, '..');
const PASTA = path.join(RAIZ, 'pecas-ouro');

/*
 * Os trilhos, em português de quem escreve a peça. São as regras da porta
 * (js/peca-html.js) e a régua visual do lote 1 (PLANO §4.8) — a porta
 * recusa o que quebra regra; a régua é o que separa peça de agência de
 * slide.
 */
function regras() {
  const tokens = Object.keys(T.NOMES).map((k) => 'var(' + T.NOMES[k] + ')').join(', ');
  return [
    'FORMATO DO ARQUIVO: um <style> e uma <section class="mt-peca …">. Nada antes, nada depois, sem cercas de código.',
    '',
    'REGRAS DURAS (a peça é recusada se quebrar qualquer uma):',
    '- Sem JavaScript, sem <script>, sem on*=, sem url(), sem @import, sem link externo.',
    '- Tags permitidas: section div header footer aside figure figcaption p h1 h2 h3 h4 span em strong b i small sup sub s del ul ol li br img.',
    '- Cor SÓ por token: ' + tokens + '. Nenhum hex, rgb(), hsl() ou nome de cor.',
    '- Medida SÓ relativa ao container: cqw, cqh, cqmin, cqmax, %, fr, em. px só dentro da condição de @container.',
    '- Fonte SÓ var(--mt-fonte-titulo) ou var(--mt-fonte-texto).',
    '- Título e número GRANDES em var(--mt-fonte-titulo): font-size: calc(<tamanho> * var(--mt-escala-titulo, 1)). A fonte da marca pode ser bem mais larga que a do exemplo, e a escala é o que impede o título de vazar.',
    '- Proibido: filter, backdrop-filter, mix-blend-mode, mask, animation, transition, will-change, position fixed/sticky, @media.',
    '- No máximo 2 sombras por elemento, desfoque até 3cqw.',
    '- Todo texto editável com data-campo="nome" (nomes curtos, sem espaço). Foto só com <img data-campo-img="foto" alt="">. QR só com <img data-campo-qr="link" alt="…">. O que só faz sentido com o QR (a instrução "aponte a câmera", a moldura dele) leva data-com-qr="link": sem o link, some junto. Se a peça inteira é o convite do QR, a raiz também leva data-com-qr="link" (sem o link, ela não vai ao ar).',
    '- Animação só declarada: data-entrada="aparecer|subir|descer|esquerda|direita|crescer|estourar|girar|revelar|varrer|desenhar|contar|aproximar", data-ordem="1..8" (opcional data-atraso="0.4", em segundos), data-continua="flutuar|pulsar|balancar|brilhar|kenburns|reflexo".',
    '- Movimento de cinema: revelar no título (cada linha sobe de uma máscara); varrer no bloco de cor ou faixa (data-origem="esquerda|direita|cima|baixo"); desenhar no filete; contar no preço ou número (sobe do zero, o texto final fica igual); aproximar e kenburns na foto que encosta na borda da peça; reflexo no preço ou no produto. Os filhos de um bloco que varre entram depois dele (data-ordem maior).',
    '- Hora/data/clima só por data-vivo="relogio|data|clima"; contagem regressiva só por data-vivo="contagem" (o player conta até a data da zona); o nome da marca, se aparecer no destaque, com data-repete="marca".',
    '- Formatos por @container: deitada (padrão), (aspect-ratio < 0.8) em pé, (aspect-ratio >= 0.8) and (aspect-ratio < 1.25) quadrada. A MESMA peça precisa ficar certa em 1920×1080 e 1080×1920.',
    '- Peça que serve na lateral: @container (max-width: 700px) — menos texto, letra maior, nada some.',
    '',
    'A RÉGUA VISUAL (é isto que o cliente aprova):',
    '- Um elemento domina. O resto é menor e mais calmo.',
    '- Kicker discreto (espaçado, com filete), mas nunca abaixo da letra mínima: na TV ele também é lido a 4 m. Chamada como texto sublinhado, nunca botão gordo.',
    '- Pouco texto: uma mensagem por peça, uns 15 palavras no máximo. Letra grande lê; letra pequena vira textura.',
    '- Preço com o R$ e os centavos pequenos; o número é o que se lê.',
    '- Quebra de linha DECIDIDA: título em duas linhas vira dois <span> (ou span + em) com display:block; nunca uma palavra sozinha na última linha.',
    '- Nada escrito sobre foto sem véu (gradiente de var(--mt-fundo) a var(--mt-fundo-0)).',
    '- Respiro: margem de ~6cqw; nada encostado na borda.',
    '- Texto que cabe: nada pode sair da peça nem ficar por cima de outro texto.',
  ].join('\n');
}

/*
 * O exemplo como a IA precisa ler: sem os comentários de quem desenhou e sem
 * o espaço de alinhamento. QA de lançamento, 03/11: a biblioteca do destaque
 * ia com 155 mil caracteres (~44 mil tokens) em TODA peça — 85 a 90% do custo
 * de texto de um pedido. O código das peças é o mesmo, letra por letra; só
 * sai o que o navegador também ignora. Medido: −13% no destaque (155 → 135
 * mil caracteres) e no resto dos papéis. O nome e a família de cada peça
 * continuam no título do exemplo.
 */
function enxuto(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/^ /gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/*
 * O CSS da biblioteca sem os espaços que o navegador ignora em volta de
 * { } ; , e > (e o último ; antes do }). Só dentro do <style>: no HTML o
 * espaço é texto. O ":" fica como está — antes dele o espaço é seletor
 * (".a :hover" não é ".a:hover"). Fase 2: o redesenho das peças para a
 * letra da TV trouxe blocos novos de @container; isto devolve o tamanho.
 */
function cssJusto(html) {
  return String(html || '').replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g, (m, abre, css, fecha) => abre + css
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim() + fecha);
}

/*
 * O piso da TV (fase 2, 05/11) envolve cada tamanho das peças-ouro em
 * `max(var(--mt-piso, 0cqw), X)`. A IA não precisa dele: quem garante o piso
 * na TV é o player (peca-render.js, aplicarPiso), em qualquer peça. Na
 * biblioteca que vai no pedido fica só o X — o mesmo exemplo, sem pagar o
 * envoltório em toda chamada.
 */
const PISO = 'max(var(--mt-piso, 0cqw), ';
function semPiso(css) {
  let s = String(css || '');
  for (let i = s.indexOf(PISO); i !== -1; i = s.indexOf(PISO, i)) {
    let fundo = 1, j = i + PISO.length;
    for (; j < s.length && fundo; j++) {
      if (s[j] === '(') fundo++;
      else if (s[j] === ')') fundo--;
    }
    if (fundo) break; // parêntese sem par: deixa como está
    s = s.slice(0, i) + s.slice(i + PISO.length, j - 1) + s.slice(j);
  }
  return s;
}

/*
 * AS DECISÕES DA GALERIA (Plataforma › Conteúdo pronto, tabela
 * conteudo_pronto; server/conteudoPronto.js). O dono aprova e recusa as
 * peças-ouro lá, e a decisão vence o estado do arquivo — no manifesto que o
 * painel recebe e, desde 26/11, também aqui: na biblioteca que ensina a IA
 * e na peça de reserva. Antes só o arquivo contava: a peça aprovada na
 * galeria não virava exemplo, e a recusada continuava ensinando, até alguém
 * mudar o arquivo e subir de novo.
 *
 * Quem tem o banco é o server.js: ele entrega as decisões no boot, depois
 * de cada decisão (uma ou em lote) e de tempos em tempos. Só as de peça
 * contam; mudou alguma, a biblioteca guardada é refeita no próximo pedido —
 * e só então. Sem banco (o CI, a bancada, o experimento), vale o arquivo.
 */
const BIBLIOTECA = {}; // 'papel|frente' → os exemplos; só em produção
let DECISOES = [];
let CHAVE_DECISOES = '[]';
function definirDecisoes(lista) {
  const pecas = (Array.isArray(lista) ? lista : [])
    .filter((d) => d && d.tipo === 'peca' && typeof d.id === 'string' && d.id)
    .map((d) => ({ tipo: 'peca', id: d.id, estado: String(d.estado || ''), decidido_por: d.decidido_por || '', decidido_em: Number(d.decidido_em) || 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const chave = JSON.stringify(pecas.map((d) => [d.id, d.estado]));
  if (chave === CHAVE_DECISOES) return false;
  DECISOES = pecas;
  CHAVE_DECISOES = chave;
  for (const k of Object.keys(BIBLIOTECA)) delete BIBLIOTECA[k];
  return true;
}

// O manifesto como a galeria o mostra: o arquivo com as decisões do banco por cima.
function manifestoEfetivo() {
  return conteudoPronto.aplicarDecisoes(conteudoPronto.lerManifesto(RAIZ), DECISOES);
}
const aprovada = (p) => !p.estado || p.estado === 'aprovada';

/*
 * A peça-ouro pode ir para a TV como reserva? Só a aprovada, no arquivo ou
 * na galeria: a recusada pelo dono não vai ao ar nem quando a IA falha. A
 * que o manifesto não lista não foi recusada por ninguém.
 */
function podeSerReserva(id) {
  let m;
  try { m = manifestoEfetivo(); } catch (e) { return true; }
  const p = (m.pecas || []).find((x) => x.id === id);
  return !p || aprovada(p);
}

/*
 * O TETO DA BIBLIOTECA (26/11). Os exemplos vão em todo pedido, e o
 * destaque já mandava ~155 mil caracteres com 32 peças — 85 a 90% do custo
 * de texto de uma peça. Com a lista recomendada aprovada na galeria, iria a
 * ~430 mil no destaque e ~310 mil na lateral: o triplo do custo e da
 * espera, sem ensinar o triplo. Até o teto vai tudo, como antes; passou
 * dele, vai uma amostra com variedade:
 *   - uma peça de cada família por rodada (oferta, institucional, social,
 *     cardápio…), até o teto — família nenhuma some porque outra tem mais;
 *   - dentro da família, primeiro as da frente da conta (a clínica vê os
 *     exemplos de Saúde) e, entre elas, a que atende a frente menos vista;
 *   - no empate, a ordem do id. A amostra é a mesma em todo pedido da mesma
 *     frente, e o cache do provedor continua valendo (no máximo três
 *     prefixos por papel, um por frente).
 * O teto, por papel: 32 no destaque (o tamanho de hoje, já medido no QA),
 * 24 na lateral (~110 mil caracteres) e 16 nas faixas (hoje com 6 e 5).
 */
const MAX_EXEMPLOS = { destaque: 32, lateral: 24, cabecalho: 16, rodape: 16 };

function escolherExemplos(lista, max, frente) {
  if (lista.length <= max) return lista;
  const daFrente = (p) => (!frente || (p.frentes || []).includes(frente) ? 0 : 1);
  const vistas = {};
  const menosVista = (p) => Math.min(...((p.frentes && p.frentes.length) ? p.frentes : ['']).map((f) => vistas[f] || 0));
  const familias = new Map();
  for (const p of lista) {
    const f = String(p.familia || '');
    if (!familias.has(f)) familias.set(f, []);
    familias.get(f).push(p);
  }
  const ordem = [...familias.keys()].sort();
  const escolhidas = [];
  while (escolhidas.length < max && ordem.some((f) => familias.get(f).length)) {
    for (const f of ordem) {
      const fila = familias.get(f);
      if (!fila.length || escolhidas.length >= max) continue;
      let melhor = 0;
      for (let i = 1; i < fila.length; i++) {
        const a = fila[i], b = fila[melhor];
        if (daFrente(a) !== daFrente(b) ? daFrente(a) < daFrente(b) : menosVista(a) < menosVista(b)) melhor = i;
      }
      const p = fila.splice(melhor, 1)[0];
      escolhidas.push(p);
      for (const fr of p.frentes || []) vistas[fr] = (vistas[fr] || 0) + 1;
    }
  }
  return escolhidas.sort((a, b) => a.id.localeCompare(b.id));
}

// A biblioteca no papel pedido, em ordem fixa — o fixo precisa ser igual entre chamadas para o cache valer.
function biblioteca(papel, frente) {
  const fr = Perfil.tem(frente) ? frente : '';
  const chave = papel + '|' + fr;
  if (BIBLIOTECA[chave]) return BIBLIOTECA[chave];
  // Só o que o dono aprovou (no arquivo ou na galeria): uma peça do lote novo, ainda em proposta, não ensina a IA.
  const candidatas = manifestoEfetivo().pecas
    .filter((p) => p.papeis.includes(papel) && (!p.estado || p.estado === 'aprovada'))
    .sort((a, b) => a.id.localeCompare(b.id));
  const lista = escolherExemplos(candidatas, MAX_EXEMPLOS[papel] || MAX_EXEMPLOS.destaque, fr)
    .map((p) => '### ' + p.nome + ' (' + p.familia + ')\n' + cssJusto(semPiso(enxuto(fs.readFileSync(path.join(PASTA, p.id + '.html'), 'utf8')))));
  // Em teste a biblioteca muda no disco entre um caso e outro: só guarda fora dele.
  if (process.env.NODE_ENV === 'production') BIBLIOTECA[chave] = lista;
  return lista;
}

// `frente`: o perfil da conta (js/perfil.js). Só muda a biblioteca quando ela passa do teto.
function fixo(papel, frente) {
  return [
    'Você escreve peças de digital signage em HTML+CSS, para TVs de comércio. Estas são as REGRAS e a BIBLIOTECA-OURO — o padrão de qualidade que o dono aprovou. Imite o vocabulário dela; não copie o texto.',
    '',
    regras(),
    '',
    // D44: as regras de composição em número, as mesmas que o detector confere na peça montada.
    regrasDoPapel.paraIA(papel),
    '',
    '## BIBLIOTECA-OURO (papel: ' + papel + ')',
    '',
    biblioteca(papel, frente).join('\n\n'),
  ].join('\n');
}

const PAPEL_TXT = {
  destaque: 'o DESTAQUE da tela (a zona grande): a oferta ou a mensagem principal',
  lateral: 'a LATERAL estreita (515×832 numa TV deitada): como, onde e quando — sem repetir o destaque',
  cabecalho: 'o CABEÇALHO (faixa de ~130px de altura): marca, hora (data-vivo) e a chamada da campanha',
  rodape: 'o RODAPÉ (faixa de ~120px): as mensagens rolando em data-vivo="mensagens" e um selo',
};

// Os textos que o cliente aprovou no plano, na ordem em que a peça os lê.
const ROTULO_TEXTO = { kicker: 'kicker', titulo: 'título', apoio: 'apoio', cta: 'chamada' };

function pedidoTexto(o) {
  const t = o.textos || null;
  const aprovados = t ? Object.keys(ROTULO_TEXTO).filter((k) => String(t[k] || '').trim())
    .map((k) => ROTULO_TEXTO[k] + ' "' + String(t[k]).trim().slice(0, 160) + '"') : [];
  const linhas = [
    'Empresa: ' + (o.empresa || 'a empresa') + (o.segmento ? ' (' + o.segmento + ')' : '') + '.',
    'Pedido do cliente, como chegou: "' + String(o.pedido || '').slice(0, 600) + '".'
      // Com o texto aprovado, o pedido é só a ordem: copiado, a TV mostraria "letreiro com mensagem…".
      + (aprovados.length ? ' É a instrução do que fazer, não texto para a peça.' : ''),
    /*
     * Na campanha, o texto já foi APROVADO na revisão do plano: a peça diz
     * exatamente aquilo. A IA decide o desenho, não as palavras — a pessoa
     * aprovaria uma coisa e veria outra na TV.
     */
    aprovados.length ? 'Textos aprovados pelo cliente — use exatamente estes, sem trocar palavra nem acrescentar frase: '
      + aprovados.join('; ') + '. O título pode ser quebrado em duas linhas.' : '',
    // As referências do cliente (D9): o desenho segue o que ele mostrou que gosta.
    o.estiloRef ? 'Direção visual das referências do cliente (siga no desenho, não copie conteúdo): ' + String(o.estiloRef).slice(0, 240) + '.' : '',
    'Escreva ' + (PAPEL_TXT[o.papel] || PAPEL_TXT.destaque) + '.',
    o.foto ? 'Há uma foto para a peça (campo "foto"): use <img data-campo-img="foto">, com véu.' : 'NÃO há foto: a peça é só tipografia e forma — não use data-campo-img.',
  ];
  if (o.textosCampos && Object.keys(o.textosCampos).length) {
    linhas.push('Os campos da peça e o texto de cada um — mantenha os mesmos nomes de data-campo e estes textos: '
      + Object.keys(o.textosCampos).map((k) => k + ' "' + String(o.textosCampos[k]).slice(0, 160) + '"').join('; ') + '.');
  }
  if (o.evitar && o.evitar.length) linhas.push('As outras zonas da tela já dizem: ' + o.evitar.map((x) => '"' + x + '"').join(', ') + '. Não repita nenhum desses textos.');
  /*
   * QA de lançamento, 03/11: "deixa o preço maior" no Editar com a IA chegava
   * só à chamada dos textos, e a peça saía com o preço do mesmo tamanho. O
   * pedido de DESENHO vem aqui, por último, onde a IA mais presta atenção.
   */
  if (o.ajusteDesenho) linhas.push('O CLIENTE PEDIU ESTA MUDANÇA NO DESENHO — é o que tem de mudar desta vez, de forma visível; o resto fica como estava: "' + String(o.ajusteDesenho).slice(0, 300) + '".');
  linhas.push('Responda só com o arquivo da peça.');
  return linhas.filter(Boolean).join('\n');
}

/*
 * O modelo que compõe. O experimento de 20/10 escolheu o Gemini (§4.4): 4,65
 * contra 1,40 do motor antigo. MT_MOTOR_HTML troca sem deploy de código.
 */
function motorDoHtml() {
  const m = process.env.MT_MOTOR_HTML;
  if (m && motores.MOTORES[m]) return m;
  /*
   * AI_PROVIDER=dev é "sem IA de verdade" (o servidor local, os testes): vale
   * aqui também. Antes a chave do Gemini no ambiente do PC passava por cima e
   * a composição chamava o Gemini real no modo de teste.
   */
  if (String(process.env.AI_PROVIDER || '').toLowerCase() === 'dev') return 'dev';
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return 'gemini';
  return motores.motorPadrao();
}

/*
 * A PEÇA-OURO PREENCHIDA (§4.9): quando a IA falha — fora do ar, recusada
 * três vezes — a peça não some. Uma peça-ouro recebe os textos aprovados.
 *
 * Só as duas que servem a QUALQUER negócio e cujos campos todos têm de onde
 * vir: um campo sem texto aprovado mostraria o exemplo da peça ("Ótica
 * Central", "30% OFF") na TV de uma padaria.
 */
/*
 * As duas foram desenhadas para títulos CURTOS ("Burger / de costela", "Ver
 * bem / muda tudo"), em letra enorme e sem quebra. Aqui elas recebem
 * qualquer manchete — visto na tela: "Só esta semana" passou por baixo do
 * carimbo. Então o título ganha quebra e encolhe na proporção do tamanho
 * (`k`), formato por formato; e no lançamento deitado o carimbo sobe para
 * cima do título em vez de dividir a linha com ele.
 */
/*
 * Por formato: a letra do título é a base da peça, ou menor, até a linha
 * mais longa caber na largura livre. A conta supõe letra LARGA (0,7 em por
 * caractere, maiúscula): palavra sozinha não quebra, e "SEMANA" em pé
 * passou 16px da borda com a conta otimista. Quebra só não basta.
 */
const LETRA_LARGA = 0.7;
const QUERY = { deitada: '', empe: '(aspect-ratio < 0.8)', quadrada: '(aspect-ratio >= 0.8) and (aspect-ratio < 1.25)' };
/*
 * `extra(tamanho)` acrescenta regras que dependem do tamanho final do título
 * no formato — o carimbo do lançamento, que não pode ficar maior que ele: com
 * "Superpromoção" em pé, o título encolhia e o carimbo virava o elemento que
 * domina. "Um elemento domina" (§4.8) vale também na peça de reserva.
 */
function titulosQueCabem(t, formatos, extra) {
  const maior = Math.max(t.titulo1.length, t.titulo2.length, 1);
  let css = '.mt-peca h1 span, .mt-peca h1 em { white-space: normal; text-wrap: balance; }';
  for (const f of Object.keys(QUERY)) {
    const tam = formatos[f].base * Math.min(1, formatos[f].largura / (LETRA_LARGA * formatos[f].base * maior));
    const regras = '.mt-peca h1 { font-size: ' + tam.toFixed(2) + 'cqw; }' + (extra ? ' ' + extra(f, tam) : '');
    css += QUERY[f] ? ' @container ' + QUERY[f] + ' { ' + regras + ' }' : ' ' + regras;
  }
  return css;
}

const OURO = {
  // com foto: a foto cheia com véu e a assinatura
  comFoto: {
    id: 'institucional-foto',
    campos: (t, e) => ({ kicker: t.kicker, titulo: t.titulo1, titulo2: t.titulo2, marca: e, endereco: t.cta || t.apoio }),
    // Deitada, a frase divide a linha com a assinatura: sobra ~60cqw.
    ajuste: (t) => titulosQueCabem(t, { deitada: { base: 6.4, largura: 60 }, empe: { base: 13, largura: 84 }, quadrada: { base: 9, largura: 86 } }),
  },
  // sem foto: só tipografia
  semFoto: {
    id: 'institucional-lancamento',
    campos: (t, e) => ({ marca: e, selo: t.kicker || 'Novidade', titulo: t.titulo1, titulo2: t.titulo2, apoio: t.apoio, quando: t.cta }),
    ajuste: (t) => titulosQueCabem(t, { deitada: { base: 13, largura: 88 }, empe: { base: 18, largura: 84 }, quadrada: { base: 16, largura: 86 } },
      // O carimbo no máximo metade do título; o recheio em em, para encolher junto com a letra.
      (f, tam) => '.mt-peca .carimbo { font-size: ' + Math.min({ deitada: 3.2, empe: 7, quadrada: 4.4 }[f], tam * 0.5).toFixed(2) + 'cqw; padding: .32em .68em .28em; }')
      // Deitada, o carimbo sobe para cima do título em vez de dividir a linha com ele.
      + ' @container (aspect-ratio >= 1.25) { .mt-peca .carimbo { left: 6cqw; right: auto; top: 15cqh; border-width: .3cqw; rotate: -6deg; }'
      + ' .mt-peca .bloco { top: 31cqh; } }',
  },
};

// "Óculos de sol com 30% até sábado" → duas linhas parecidas, quebradas entre palavras.
function partirTitulo(s) {
  const p = String(s || '').trim().split(/\s+/).filter(Boolean);
  if (p.length < 3) return [p.join(' '), ''];
  let melhor = 1, dif = Infinity;
  for (let i = 1; i < p.length; i++) {
    const d = Math.abs(p.slice(0, i).join(' ').length - p.slice(i).join(' ').length);
    if (d < dif) { dif = d; melhor = i; }
  }
  return [p.slice(0, melhor).join(' '), p.slice(melhor).join(' ')];
}

function preencherOuro(o) {
  // A recusada na galeria não vai ao ar (podeSerReserva). Sem foto, a da foto não serve: o lugar dela ficaria vazio.
  const escolha = (o.foto ? [OURO.comFoto, OURO.semFoto] : [OURO.semFoto]).find((x) => podeSerReserva(x.id));
  if (!escolha) return reservaDaReserva(o, 'destaque');
  const t = o.textos || {};
  const [titulo1, titulo2] = partirTitulo(t.titulo);
  const textos = { kicker: t.kicker || '', titulo1, titulo2, apoio: t.apoio || '', cta: t.cta || '' };
  const arquivo = P.doArquivo(fs.readFileSync(path.join(PASTA, escolha.id + '.html'), 'utf8'));
  // O ajuste passa pela MESMA porta que a peça: CSS nosso também não entra sem conferência.
  const h = P.higienizar({ html: arquivo.html, css: arquivo.css + '\n' + escolha.ajuste(textos) });
  const campos = escolha.campos(textos, o.empresa || '');
  for (const k of Object.keys(campos)) campos[k] = String(campos[k] || '').slice(0, 160);
  // Só na peça que tem o campo: campo que não existe faz a TV recusar a peça.
  if (o.foto && escolha === OURO.comFoto) campos.foto = o.foto;
  return {
    type: 'peca-html', versao: 1, papel: 'destaque', html: h.html, css: h.css, campos,
    marca: o.marca || null, modo: o.modo || 'escuro', duracao: 12,
    origem: { motor: 'ouro', base: escolha.id, pedido: String(o.pedido || '').slice(0, 200) },
  };
}

/*
 * A RESERVA POR PAPEL (EXECUTOR item 23). O ecossistema pede peça para as
 * quatro zonas, e a reserva só sabia o destaque. Sem IA (ou com ela recusada
 * três vezes), cabeçalho, lateral e rodapé também saem de uma peça-ouro, e
 * só das que dá para preencher INTEIRAS com o que temos: campo que sobrasse
 * mostraria o texto de exemplo de outro negócio ("Ótica Central") na TV da
 * padaria. Várias por papel, para dois estilos de cabeçalho não saírem iguais.
 */
const OURO_PAPEL = {
  /*
   * A lateral sem foto: a coluna com chamada. Era a peça de alerta (o
   * triângulo com '!'), que dizia "atenção" até para a promoção da tarde
   * (visto na varredura do item 27).
   */
  lateral: [
    { id: 'lateral-chamada', campos: (t) => ({ kicker: t.kicker, titulo: t.titulo, apoio: t.apoio, cta: t.cta }) },
  ],
  cabecalho: [
    { id: 'cabecalho-classico', campos: (t, e) => ({ marca: e, chamada: t.titulo }) },
    // O "quando" é a letrinha ao lado da chamada: o apoio inteiro (até 90 letras) passava por cima do relógio.
    // Só entra se couber inteiro (16 letras): cortado, ficava "Reserve pelo".
    { id: 'cabecalho-chamada', campos: (t, e) => ({ marca: e, chamada: t.titulo, quando: [t.cta, t.apoio].find((x) => x && x.length <= 16) || '' }) },
    { id: 'cabecalho-centro', campos: (t, e) => ({ marca: e, sub: t.titulo }) },
  ],
  rodape: [
    { id: 'rodape-selo', campos: (t) => ({ selo: t.kicker || t.titulo }) },
    { id: 'rodape-relogio', campos: (t, e) => ({ rotulo: t.kicker || e }) },
  ],
};
/*
 * Quando a faixa tem o que só uma peça mostra — a contagem no rodapé, as
 * chamadas girando no cabeçalho (EXECUTOR item 22) —, é ela que entra.
 */
const OURO_VIVO = {
  rodape: { id: 'rodape-contagem', campos: () => ({ rotulo: 'Acaba em' }), quando: (o) => !!o.contagem },
  cabecalho: { id: 'cabecalho-chamadas', campos: (t, e) => ({ marca: e }), quando: (o) => Array.isArray(o.chamadas) && o.chamadas.length > 0 },
};
// Faixa fina e coluna estreita: texto curto, cortado na palavra.
const CABE_NO_PAPEL = { kicker: 22, titulo: 38, apoio: 90, cta: 36 };

/*
 * O nome da empresa na faixa (D44): palavras inteiras até o teto, sem "e",
 * "da", "de" pendurados no fim. Medido na bancada: com mais de 18 letras o
 * nome empurrava o relógio para fora no cabeçalho em pé ("Ótica e
 * Relojoaria São Bento"). Com logo, a peça mostra o logo e o nome nem entra.
 */
const NOME_NA_FAIXA = 18;
function cortarNome(s, max) {
  const palavras = String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  let out = '';
  for (const p of palavras) {
    const prox = out ? out + ' ' + p : p;
    if (prox.length > max) break;
    out = prox;
  }
  if (!out) return cortarNaPalavra(s, max);
  return out.replace(/\s+(e|da|de|do|das|dos|&)$/i, '');
}

/*
 * Cortado no meio de uma frase, o fim não pode ficar pendurado num "até",
 * "de", "nas" — "30% off até" no cabeçalho, visto no teste do dono no
 * navegador. Sai o conector (e a pontuação que sobrar antes dele).
 */
const CONECTOR_NO_FIM = /(?:[\s,;:·—-]+(?:e|ou|de|da|do|das|dos|na|no|nas|nos|em|até|com|para|pra|por|pelo|pela|a|o|as|os|um|uma|que|sem|à|ao|às|aos))+[\s,;:·—-]*$/i;
function cortarNaPalavra(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const c = t.slice(0, max + 1);
  const i = c.lastIndexOf(' ');
  const cortado = (i > max * 0.5 ? c.slice(0, i) : t.slice(0, max)).replace(/[,;:·—-]+$/, '').trim();
  return cortado.replace(CONECTOR_NO_FIM, '').trim() || cortado;
}

function preencherPapel(o) {
  const papel = OURO_PAPEL[o.papel] ? o.papel : 'destaque';
  // Destaque, e a lateral com foto (a foto já foi paga): a reserva de sempre, que sabe a foto.
  if (papel === 'destaque' || (papel === 'lateral' && o.foto)) return Object.assign(preencherOuro(o), { papel });
  // A recusada na galeria fica fora; as que sobram giram como antes.
  const opcoes = OURO_PAPEL[papel].filter((x) => podeSerReserva(x.id));
  const vivo = OURO_VIVO[papel] && podeSerReserva(OURO_VIVO[papel].id) ? OURO_VIVO[papel] : null;
  // Só a primeira peça da faixa: a segunda, se houver, gira com outro estilo.
  const escolha = vivo && vivo.quando(o) && !o.indice ? vivo : opcoes[Math.abs(o.indice || 0) % opcoes.length];
  // Todas recusadas: a lateral cai na reserva do destaque; a faixa, na peça mínima.
  if (!escolha) return papel === 'lateral' ? Object.assign(preencherOuro(o), { papel }) : pecaMinima(o, papel);
  return pecaDoPapel(escolha, o, papel);
}

/*
 * As duas peças do destaque recusadas na galeria: entra a coluna com
 * chamada (que também é de destaque) e, sem ela, a peça mínima.
 */
function reservaDaReserva(o, papel) {
  const coluna = OURO_PAPEL.lateral[0];
  return podeSerReserva(coluna.id) ? pecaDoPapel(coluna, o, papel) : pecaMinima(o, papel);
}

// Uma peça-ouro de OURO_PAPEL preenchida com os textos cortados para caber.
function pecaDoPapel(escolha, o, papel) {
  const arquivo = P.doArquivo(fs.readFileSync(path.join(PASTA, escolha.id + '.html'), 'utf8'));
  const h = P.higienizar(arquivo);
  const t = {};
  for (const k of Object.keys(CABE_NO_PAPEL)) t[k] = cortarNaPalavra((o.textos || {})[k], CABE_NO_PAPEL[k]);
  const campos = escolha.campos(t, papel === 'cabecalho' ? cortarNome(o.empresa, NOME_NA_FAIXA) : cortarNaPalavra(o.empresa, 28));
  for (const k of Object.keys(campos)) campos[k] = String(campos[k] || '');
  if (o.logo && h.campos.some((c) => c.nome === 'logo' && c.tipo === 'img')) campos.logo = o.logo;
  return {
    type: 'peca-html', versao: 1, papel, html: h.html, css: h.css, campos,
    marca: o.marca || null, modo: o.modo || 'escuro', duracao: papel === 'cabecalho' || papel === 'rodape' ? 20 : 12,
    origem: { motor: 'ouro', base: escolha.id, pedido: String(o.pedido || '').slice(0, 200) },
  };
}

/*
 * A PEÇA MÍNIMA (26/11): a última reserva, para quando o dono recusou na
 * galeria todas as peças-ouro de reserva daquele papel. Escrita aqui, só
 * tipografia e os tokens, e passa pela mesma porta: a reserva nunca põe no
 * ar o que o dono recusou, e a zona também não fica sem peça. Hoje não
 * entra (as reservas estão aprovadas); é o chão.
 */
const MINIMA_CSS = [
  '.mt-peca { display: flex; flex-direction: column; justify-content: center; padding: 9cqmin; color: var(--mt-texto); font-family: var(--mt-fonte-texto);',
  '  background: linear-gradient(160deg, var(--mt-fundo-2), var(--mt-fundo)); }',
  // Em cqmin, a mesma peça na tela cheia e na coluna; a letra menor é a mínima do destaque (48px) na TV deitada.
  '.kicker { font: 700 6cqmin/1.1 var(--mt-fonte-texto); letter-spacing: .2em; text-transform: uppercase; color: var(--mt-destaque); }',
  'h1 { margin-top: 4cqmin; font: 700 calc(14cqmin * var(--mt-escala-titulo, 1))/1.04 var(--mt-fonte-titulo); text-wrap: balance; }',
  '.apoio { margin-top: 4cqmin; font: 500 6.4cqmin/1.3 var(--mt-fonte-texto); color: var(--mt-texto-suave); text-wrap: pretty; }',
  '.cta { margin-top: 6cqmin; align-self: flex-start; font: 700 6cqmin/1 var(--mt-fonte-texto); letter-spacing: .12em; text-transform: uppercase;',
  '  padding-bottom: 1.4cqmin; border-bottom: .7cqmin solid var(--mt-destaque); }',
  '.kicker:empty, .apoio:empty, .cta:empty { display: none; }',
  // A faixa (cabeçalho e rodapé): uma linha só, a letra pela altura.
  '@container (aspect-ratio >= 4) {',
  '  .mt-peca { flex-direction: row; align-items: center; justify-content: flex-start; gap: 3cqw; padding: 0 3cqw; background: var(--mt-fundo); }',
  '  .kicker { flex: none; font-size: 26cqh; letter-spacing: .2em; white-space: nowrap; }',
  '  h1 { flex: 1; min-width: 0; margin-top: 0; font-size: calc(40cqh * var(--mt-escala-titulo, 1)); white-space: nowrap; overflow: hidden; }',
  '  .trilho { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; font: 500 34cqh/1 var(--mt-fonte-texto); }',
  '  .hora { flex: none; font: 700 36cqh/1 var(--mt-fonte-texto); }',
  '}',
].join('\n');
const MINIMA_HTML = {
  destaque: '<p class="kicker" data-campo="kicker" data-entrada="aparecer">Novidade</p><h1 data-campo="titulo" data-entrada="subir" data-ordem="1">Título</h1>'
    + '<p class="apoio" data-campo="apoio" data-entrada="aparecer" data-ordem="2">Apoio</p><span class="cta" data-campo="cta" data-entrada="aparecer" data-ordem="3">Chamada</span>',
  cabecalho: '<p class="kicker" data-campo="kicker">Empresa</p><h1 data-campo="titulo">Chamada</h1><span class="hora" data-vivo="relogio">14:32</span>',
  rodape: '<p class="kicker" data-campo="kicker">Aviso</p><div class="trilho"><span data-vivo="mensagens">Mensagens</span></div>',
};
function pecaMinima(o, papel) {
  const t = o.textos || {};
  const curto = papel !== 'destaque';
  const texto = (k) => (curto ? cortarNaPalavra(t[k], CABE_NO_PAPEL[k]) : String(t[k] || '').trim().slice(0, 160));
  const faixa = papel === 'cabecalho' || papel === 'rodape';
  const h = P.higienizar({ html: '<section class="mt-peca peca-minima">' + (MINIMA_HTML[papel] || MINIMA_HTML.destaque) + '</section>', css: MINIMA_CSS });
  const campos = {};
  const valores = { kicker: papel === 'cabecalho' ? cortarNome(o.empresa, NOME_NA_FAIXA) : texto('kicker') || (papel === 'rodape' ? texto('titulo') : ''),
    titulo: texto('titulo'), apoio: texto('apoio'), cta: texto('cta') };
  for (const c of h.campos) if (c.tipo === 'texto') campos[c.nome] = valores[c.nome] || '';
  return {
    type: 'peca-html', versao: 1, papel, html: h.html, css: h.css, campos,
    marca: o.marca || null, modo: o.modo || 'escuro', duracao: faixa ? 20 : 12,
    origem: { motor: 'ouro', base: 'peca-minima', pedido: String(o.pedido || '').slice(0, 200) },
  };
}

// O modelo às vezes embrulha a resposta em cerca de código: tira.
function limparResposta(t) {
  const s = String(t || '').trim();
  const cerca = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (cerca ? cerca[1] : s).trim();
}

/*
 * Compõe uma peça. Até `tentativas` chamadas: a cada recusa da porta, o
 * motor recebe a própria resposta de volta com a lista do que estava errado.
 * Devolve o item e a medição — inclusive se passou de primeira, que é um dos
 * números do experimento.
 */
async function comporPeca(o) {
  const papel = PAPEL_TXT[o.papel] ? o.papel : 'destaque';
  const max = Math.max(1, o.tentativas || 3);
  const pedido = Object.assign({}, o, { papel });
  const usos = [];
  // Refazer (§4.10): a primeira chamada já leva a peça anterior e o que a tela mediu de errado nela.
  let usuario = o.anterior && o.critica
    ? pedidoTexto(pedido) + '\n\n' + o.critica + '\n\nA peça atual era:\n' + String(o.anterior).slice(0, 12000) + '\n\nResponda com o arquivo inteiro, corrigido.'
    : pedidoTexto(pedido);
  let ultimo = null;
  const t0 = Date.now();
  for (let i = 1; i <= max; i++) {
    const r = await motores.chamar({ motor: o.motor, fixo: fixo(papel, o.perfil), sistema: 'Escreva a peça pedida seguindo as regras e a régua.', usuario, maxTokens: 8192, temperatura: 0.6 });
    usos.push(r.uso);
    const arquivo = limparResposta(r.texto);
    const h = P.higienizar(P.doArquivo(arquivo));
    /*
     * A FOTO NÃO SE PERDE (EXECUTOR item 19). A foto chega aqui já gerada e
     * paga; se o modelo desenhou uma peça sem lugar para ela,
     * `camposQueExistem` a jogava fora sem aviso, e o cliente via a peça só
     * com texto: "nem imagens ele colocou". Agora a peça sem o campo é
     * recusada como qualquer outra falha da porta. Na última recusa, quem
     * chama cai na peça-ouro com foto.
     */
    if (o.foto && !h.campos.some((c) => c.nome === 'foto' && c.tipo === 'img')) {
      h.problemas = h.problemas.concat('a peça tem foto e não tem onde pô-la: use <img data-campo-img="foto" alt="">, com véu');
    }
    /*
     * QA de lançamento, 03/11: a porta conferia a FORMA e deixava passar o
     * conteúdo. Agora ela recusa também (e pede de novo, com o motivo):
     *   - a letra abaixo do mínimo, lida no CSS (o detector da tela só roda
     *     no navegador, e a peça de 12px foi salva "pronta");
     *   - o que a lei barra no texto (js/regras-de-conteudo.js): promessa de
     *     cura em Saúde, medicamento com promessa em qualquer frente.
     */
    if (!h.problemas.length) {
      const pequenas = regrasDoPapel.letrasPequenas(h.css, papel, h.html);
      if (pequenas.length) {
        h.problemas = h.problemas.concat(pequenas.slice(0, 3).map((x) => 'letra pequena demais: "' + x.seletor + '" fica com ' + x.px + 'px na TV ' + x.formato
          + ' (o mínimo é ' + (x.minimo || regrasDoPapel.REGRAS.letraMin) + 'px — veja a "Letra mínima" das REGRAS DE COMPOSIÇÃO)'));
      }
      const textos = h.campos.filter((c) => c.tipo === 'texto')
        .map((c) => (o.camposDe && typeof o.camposDe[c.nome] === 'string' ? o.camposDe[c.nome] : c.exemplo));
      const conteudo = RC.conferir(textos, { perfil: o.perfil || '', contexto: [o.empresa, o.segmento, o.pedido].filter(Boolean).join(' ') });
      if (conteudo.bloqueios.length) {
        h.problemas = h.problemas.concat(conteudo.bloqueios.map((b) => 'texto proibido: "' + b.trecho + '" ' + b.motivo
          + (b.sugestao ? ' — escreva algo como "' + b.sugestao + '"' : '') + '. Isso vale mesmo que o pedido ou os textos aprovados o tragam.'));
      }
    }
    ultimo = { arquivo, h };
    if (!h.problemas.length) {
      return {
        ok: true,
        item: {
          type: 'peca-html', versao: 1, papel, html: h.html, css: h.css,
          // Só campos que a peça tem: campo que não existe faz a TV recusar a peça.
          campos: camposQueExistem(o.camposDe || (o.foto ? { foto: o.foto } : {}), h.campos),
          marca: o.marca || null, modo: o.modo || 'escuro', duracao: 12,
          origem: { motor: o.motor || motores.motorPadrao(), pedido: String(o.pedido || '').slice(0, 200) },
        },
        tentativas: i, passouDePrimeira: i === 1, problemas: [], avisos: h.avisos,
        uso: somar(usos), ms: Date.now() - t0,
      };
    }
    usuario = pedidoTexto(pedido) + '\n\nSua resposta anterior foi RECUSADA pela porta:\n- ' + h.problemas.join('\n- ')
      + '\n\nA resposta anterior era:\n' + arquivo.slice(0, 12000) + '\n\nCorrija e responda com o arquivo inteiro.';
  }
  return { ok: false, item: null, tentativas: max, passouDePrimeira: false, problemas: ultimo.h.problemas, uso: somar(usos), ms: Date.now() - t0 };
}

/*
 * Os textos que a pessoa VÊ numa peça, campo por campo: o que a peça traz
 * no HTML (a peça da IA guarda o texto lá, e `campos` só tem a foto) com o
 * que foi editado por cima. Campo escondido não conta. QA de lançamento,
 * 03/11: sem isto, "troca a foto" refazia a peça só com o título e o preço
 * sumia, e a IA da edição via só o rótulo da peça.
 */
function textosDaPeca(item) {
  const it = item && typeof item === 'object' ? item : {};
  const campos = it.campos && typeof it.campos === 'object' ? it.campos : {};
  const ocultos = Array.isArray(it.ocultos) ? it.ocultos : [];
  const out = {};
  if (it.type !== 'peca-html' || !it.html) {
    for (const k of Object.keys(campos)) if (typeof campos[k] === 'string' && !/^(\/|https?:|data:)/.test(campos[k].trim()) && !ocultos.includes(k)) out[k] = campos[k];
    return out;
  }
  for (const c of P.higienizar({ html: it.html, css: '' }).campos) {
    if (c.tipo !== 'texto' || ocultos.includes(c.nome)) continue;
    out[c.nome] = typeof campos[c.nome] === 'string' ? campos[c.nome] : c.exemplo;
  }
  return out;
}

function camposQueExistem(campos, def) {
  const saida = {};
  for (const k of Object.keys(campos || {})) {
    const d = def.find((c) => c.nome === k);
    // Foto vazia não vira campo: a porta recusaria um endereço vazio.
    if (d && campos[k] != null && (d.tipo !== 'img' || campos[k])) saida[k] = campos[k];
  }
  return saida;
}

/*
 * REFAZER (§4.10, a barreira): a peça foi desenhada e MEDIDA no painel — o
 * mesmo detector da bancada — e algo não coube ("TV em pé: Título passa da
 * borda"). Ela volta para a IA com a medida, e a IA redesenha mantendo os
 * campos e os textos que o cliente aprovou ou editou.
 */
async function refazerPeca(o) {
  const v = P.validarItem(o.item);
  if (v.problemas.length) { const e = new Error('peça inválida: ' + v.problemas[0]); e.status = 400; throw e; }
  const it = v.item;
  const textosCampos = {};
  for (const c of v.campos) if (c.tipo === 'texto') textosCampos[c.nome] = it.campos[c.nome] != null ? it.campos[c.nome] : c.exemplo;
  const problemas = (o.problemas || []).map((x) => String(x).slice(0, 200)).filter(Boolean).slice(0, 10);
  return comporPeca({
    pedido: it.origem.pedido, papel: it.papel, marca: it.marca, modo: it.modo, motor: o.motor,
    foto: it.campos.foto || null, camposDe: it.campos, textosCampos,
    anterior: '<style>' + it.css + '</style>\n' + it.html,
    critica: 'A peça abaixo foi desenhada e MEDIDA na tela, e tem estes problemas:\n- ' + (problemas.join('\n- ') || 'texto que não cabe')
      + '\nRedesenhe para que tudo caiba na TV deitada (1920×1080), em pé (1080×1920) e na quadrada (1080×1080): '
      + 'letra menor onde precisar (sem passar do mínimo), quebra de linha decidida, véu mais forte onde o texto passa sobre a foto, outra organização se for o caso. '
      + 'Nada pode sair da peça, ficar por cima de outro texto nem quebrar as REGRAS DE COMPOSIÇÃO.',
  });
}

function somar(usos) {
  const s = { chamadas: usos.length, entrada: 0, saida: 0, cacheLida: 0, cacheEscrita: 0, custoCentavos: 0, modelo: '' };
  for (const u of usos) {
    s.entrada += u.entrada; s.saida += u.saida; s.cacheLida += u.cacheLida; s.cacheEscrita += u.cacheEscrita; s.custoCentavos += u.custoCentavos;
    s.modelo = u.modelo;
  }
  return s;
}

/*
 * Tela completa (§4.7): uma peça por zona, em ordem, e cada uma sabe o que
 * as anteriores já disseram — a lateral nunca repete o destaque.
 */
async function comporTela(o) {
  const zonas = ['cabecalho', 'destaque', 'lateral', 'rodape'];
  const pecas = {};
  const ditos = [];
  for (const papel of zonas) {
    const r = await comporPeca(Object.assign({}, o, { papel, foto: papel === 'destaque' ? o.foto : null, evitar: ditos.slice(0, 20) }));
    pecas[papel] = r;
    if (r.ok) P.higienizar({ html: r.item.html, css: r.item.css }).campos.forEach((c) => { if (c.tipo === 'texto' && c.exemplo) ditos.push(c.exemplo); });
  }
  return pecas;
}

/*
 * A TELA INTEIRA na "Campanha com IA" de dentro da tela (§4.7): uma peça por
 * zona que o layout tem — cabeçalho, duas no destaque (se revezam), lateral
 * e o rodapé com as frases que rolam. Cada uma sabe o que as anteriores já
 * disseram. Zona que falhar fica como estava, e a resposta diz qual foi.
 */
const ORDEM_DOS_PAPEIS = ['cabecalho', 'destaque', 'lateral', 'rodape'];

function papeisDaTela(zones) {
  const listas = (zones || []).filter((z) => z && z.type === 'playlist');
  const principal = listas.find((z) => /^(principal|video|z1)$/.test(z.id)) || listas[0];
  const plano = [];
  for (const z of zones || []) {
    if (!z) continue;
    if (z.type === 'header') plano.push({ zid: z.id, papel: 'cabecalho' });
    else if (z.type === 'ticker') plano.push({ zid: z.id, papel: 'rodape' });
    else if (z === principal) plano.push({ zid: z.id, papel: 'destaque' }, { zid: z.id, papel: 'destaque' });
    else if (z.type === 'playlist') plano.push({ zid: z.id, papel: 'lateral' });
  }
  return plano.sort((a, b) => ORDEM_DOS_PAPEIS.indexOf(a.papel) - ORDEM_DOS_PAPEIS.indexOf(b.papel));
}

// As frases do rodapé: o motor de rolagem do player as passa por dentro da pele (data-vivo="mensagens").
async function mensagensDoRodape(o, ditos) {
  try {
    const r = await motores.chamar({
      motor: o.motor, json: true, maxTokens: 400, temperatura: 0.7,
      sistema: 'Você escreve as frases curtas do rodapé rolante de uma TV de loja.',
      usuario: 'Empresa: ' + (o.empresa || 'a empresa') + '. Pedido: "' + String(o.pedido || '').slice(0, 400) + '".\n'
        + 'Escreva 4 frases de até 60 caracteres: horário, pagamento, contato, um aviso útil — o que completa a tela.'
        + (ditos.length ? ' Não repita: ' + ditos.slice(0, 12).map((x) => '"' + x + '"').join(', ') + '.' : '')
        + '\nResponda só com um JSON: ["frase", "frase", "frase", "frase"]',
    });
    const lista = JSON.parse((String(r.texto).match(/\[[\s\S]*\]/) || ['[]'])[0]);
    const frases = lista.map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 8);
    if (frases.length) return frases;
  } catch (e) { /* sem frases da IA, ficam as do pedido */ }
  return [o.oferta, o.prazo, o.empresa].map((x) => String(x || '').trim()).filter(Boolean);
}

async function comporTelaInteira(o) {
  const a = o.answers || {};
  const pedido = [a.objetivo, a.oferta && 'Oferta: ' + a.oferta, a.prazo && 'Prazo: ' + a.prazo,
    a.publico && 'Público: ' + a.publico, a.tom && 'Tom: ' + a.tom, a.extra].filter(Boolean).join('. ');
  const base = { pedido, empresa: o.empresa || '', segmento: o.segmento || '', marca: o.marca || null, modo: o.modo || 'escuro', motor: o.motor };
  const zonas = {};
  const falhas = [];
  const ditos = [];
  for (const p of papeisDaTela(o.zones)) {
    if (o.progresso) o.progresso('compondo a tela', p.papel);
    let r;
    try { r = await comporPeca(Object.assign({}, base, { papel: p.papel, evitar: ditos.slice(0, 20) })); }
    catch (e) { r = { ok: false }; }
    if (!r.ok) { falhas.push(p.papel); continue; }
    P.higienizar({ html: r.item.html, css: r.item.css }).campos.forEach((c) => { if (c.tipo === 'texto' && c.exemplo) ditos.push(c.exemplo); });
    const z = zonas[p.zid] = zonas[p.zid] || {};
    if (p.papel === 'cabecalho' || p.papel === 'rodape') z.peca = r.item;
    else (z.items = z.items || []).push(r.item);
  }
  for (const p of papeisDaTela(o.zones).filter((x) => x.papel === 'rodape')) {
    if (o.progresso) o.progresso('compondo a tela', 'frases do rodapé');
    zonas[p.zid] = Object.assign(zonas[p.zid] || {}, { messages: await mensagensDoRodape(Object.assign({}, base, a), ditos) });
  }
  return { zonas, falhas };
}

module.exports = { textosDaPeca, enxuto, semPiso, cssJusto, comporPeca, comporTela, comporTelaInteira, papeisDaTela, refazerPeca, regras, fixo, pedidoTexto, limparResposta, motorDoHtml, preencherOuro, preencherPapel, pecaMinima, cortarNaPalavra, cortarNome, partirTitulo, OURO, OURO_PAPEL, OURO_VIVO,
  definirDecisoes, podeSerReserva, escolherExemplos, MAX_EXEMPLOS };
