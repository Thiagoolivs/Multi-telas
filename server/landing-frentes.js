/*
 * server/landing-frentes.js — a landing de cada frente: /empresas, /saude e
 * /comercio (docs/FRENTES.md).
 *
 * Uma página só (landing/index.html), três versões. O que muda está marcado
 * no HTML com comentários `<!--frente:nome-->…<!--/frente-->` (o herói) e é
 * trocado aqui; o resto (como funciona, preços, perguntas) é o mesmo produto
 * e fica igual. Assim uma correção na landing vale para as quatro páginas, e
 * cada frente fala com o seu público:
 *
 *   - título, descrição, canônico e og da página (para o Google);
 *   - o herói (chamada, título, texto e os ramos);
 *   - o cartão da frente em "Um MultiTelas para cada lugar" fica aceso;
 *   - o "Testar grátis" leva ao cadastro já na frente (/app/?frente=saude).
 *
 * O texto não promete nada que o produto não faça: cada recurso citado existe
 * na frente (js/perfil.js, opções).
 */
'use strict';

const Perfil = require('../js/perfil.js');

const SITE = 'https://app.multitelas.net.br';

const ramos = (lista) => lista.map((r) => '\n        <span class="rounded-full border border-mt-linha bg-white px-3 py-1">' + r + '</span>').join('');

const TEXTOS = {
  empresas: {
    titulo: 'TV corporativa para comunicação interna com IA | MultiTelas Empresas',
    descricao: 'TV corporativa para comunicação interna: avisos, RH, aniversariantes, metas e segurança nas TVs da equipe. A IA cria as peças com a marca da empresa. Teste 14 dias grátis.',
    kicker: 'MultiTelas Empresas · comunicação interna',
    h1: 'A comunicação interna <span class="grifo">na parede</span>, sem depender do e-mail.',
    texto: '\n        Você fala o que quer mostrar, tipo “o refeitório fecha mais cedo na sexta”. A IA monta a peça com a marca\n        da empresa e as TVs do refeitório, da fábrica e da recepção mudam na hora. Aniversariantes e indicadores entram sozinhos.\n      ',
    chips: ramos(['Indústria', 'Escritório', 'Logística', 'Centro de distribuição', 'Call center', 'Construção']),
    exemplo: 'empresa',
    heroi: { src: 'vendor/galeria/empresa.webp', alt: 'TV corporativa de uma empresa mostrando um comunicado interno à equipe' },
  },
  saude: {
    titulo: 'TV para sala de espera de clínica com IA | MultiTelas Saúde',
    descricao: 'TV para sala de espera de clínicas e consultórios: orientação, serviços, prevenção e convênios na recepção, com a sua marca e tom acolhedor. Teste 14 dias grátis.',
    kicker: 'MultiTelas Saúde · sala de espera',
    h1: 'A sala de espera <span class="grifo">orientando</span> enquanto o paciente aguarda.',
    texto: '\n        Você fala o que quer mostrar, tipo “a vacina da gripe chegou”. A IA monta a peça com a sua marca, em tom\n        acolhedor e sem promessa, e a TV da recepção muda na hora. Na TV ou no box que você já tem.\n      ',
    chips: ramos(['Clínica', 'Consultório', 'Odontologia', 'Laboratório', 'Farmácia', 'Fisioterapia']),
    exemplo: 'clinica',
    heroi: { src: 'vendor/galeria/clinica.webp', alt: 'TV da sala de espera de uma clínica mostrando um pacote de exames' },
  },
  comercio: {
    titulo: 'TV para loja e restaurante com IA | MultiTelas Comércio',
    descricao: 'TV para loja, restaurante e serviço: ofertas, cardápio, novidades e redes sociais na vitrine. A IA cria a peça com a sua marca e a TV muda na hora. Teste 14 dias grátis.',
    kicker: 'MultiTelas Comércio · loja, restaurante e serviço',
    // O herói de comércio é o da página principal (a loja de verdade no topo).
    h1: null,
    texto: null,
    chips: ramos(['Padaria', 'Restaurante', 'Ótica', 'Academia', 'Salão', 'Lanchonete']),
    exemplo: 'padaria',
    heroi: null, // a TV da padaria e as trocas da página principal
  },
};

const SLUGS = Object.keys(TEXTOS);

function escAttr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function trocarMarcado(html, nome, conteudo) {
  if (conteudo == null) return html;
  const re = new RegExp('(<!--frente:' + nome + '-->)[\\s\\S]*?(<!--/frente-->)');
  return html.replace(re, (_, a, b) => a + conteudo + b);
}

/* O HTML da landing de uma frente, ou null se o endereço não for de frente. */
function montar(html, slug) {
  const t = TEXTOS[slug];
  const frente = Perfil.doSlug(slug);
  if (!t || !frente) return null;
  let s = String(html);
  const url = SITE + '/' + slug;
  s = s.replace(/<title>[^<]*<\/title>/, '<title>' + t.titulo + '</title>');
  s = s.replace(/(<meta name="description" content=")[^"]*(")/, '$1' + escAttr(t.descricao) + '$2');
  s = s.replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + escAttr(t.titulo) + '$2');
  s = s.replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + escAttr(t.descricao) + '$2');
  s = s.replace(/(<meta property="og:url" content=")[^"]*(")/, '$1' + url + '$2');
  s = s.replace(/(<link rel="canonical" href=")[^"]*(")/, '$1' + url + '$2');
  s = trocarMarcado(s, 'kicker', t.kicker);
  s = trocarMarcado(s, 'titulo', t.h1);
  s = trocarMarcado(s, 'texto', t.texto);
  s = trocarMarcado(s, 'chips', t.chips + '\n      ');
  /*
   * A TV do topo mostra uma peça da frente, sem as trocas de peça de loja
   * (ótica, lanchonete), que só fazem sentido no Comércio.
   */
  if (t.heroi) {
    s = s.replace(/<img src="vendor\/galeria\/heroi\.webp"[^>]*>/, (tag) => tag.replace('vendor/galeria/heroi.webp', t.heroi.src).replace(/alt="[^"]*"/, 'alt="' + escAttr(t.heroi.alt) + '"'));
    s = s.replace(/\s*<img class="troca"[^>]*>/g, '');
    s = s.replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + SITE + '/' + t.heroi.src + '$2');
  }
  // A frente no <body> (estilo e o exemplo que abre primeiro, landing.js) e o cartão aceso.
  // O <body> de verdade, com a classe: um "<body>" escrito num comentário não conta.
  s = s.replace(/<body class="([^"]*)">/, (m, cls) => '<body class="' + cls + '" data-frente="' + slug + '" data-exemplo="' + t.exemplo + '">');
  s = s.replace('data-frente-card="' + slug + '"', 'data-frente-card="' + slug + '" aria-current="page"');
  // Testar grátis: o cadastro já abre na frente.
  s = s.replace(/<a href="\/app" data-track="trial"/g, '<a href="/app/?frente=' + slug + '" data-track="trial"');
  return s;
}

module.exports = { montar, SLUGS, TEXTOS };
