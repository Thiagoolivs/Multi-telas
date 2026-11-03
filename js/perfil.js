/*
 * js/perfil.js — as TRÊS FRENTES do produto: MultiTelas Empresas, Saúde e
 * Comércio (docs/FRENTES.md). É o registro central: tudo o que muda de uma
 * frente para outra mora aqui, como dado; o resto do código lê daqui em vez
 * de perguntar "se for clínica…". O nome do arquivo e o campo `perfil` da
 * conta ficam por compatibilidade (o banco e dezenas de lugares já leem).
 *
 * Desde 02/11 (decisão do dono) a frente é escolhida no cadastro e só muda
 * pelo operador da plataforma: são três produtos para o cliente, e trocar
 * sozinho no meio do caminho mexe no menu, nas sugestões e na IA de uma vez.
 *
 * Histórico — o perfil da conta: Empresa, Comércio ou Saúde.
 *
 * O dono: um produto só, com as nuances de cada nicho (EXECUTOR D4). No
 * teste de uso de 23/10 uma metalúrgica abriu o painel e viu "Promoção com
 * preço", "pão de queijo", "Onde fica a loja" e "Campanha com desconto 20%".
 * O perfil decide os começos do Início e do Criar (de 10 a 12, D17), o exemplo da caixa
 * de texto, como o painel chama o lugar ("empresa", "loja", "clínica") e a
 * peça de amostra das paletas. A IA também lê o perfil (ai-conversa).
 *
 * Deduzido do ramo no cadastro (js/paletas.js, detectarRamo) e editável em
 * Ajustes. Módulo duplo: require() no Node, MTPerfil no navegador.
 */
(function (raiz, fabrica) {
  var api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (raiz) raiz.MTPerfil = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PERFIS = {
    empresa: {
      id: 'empresa', nome: 'Empresa', descricao: 'Comunicação interna: avisos, RH, indicadores.',
      marca: 'MultiTelas Empresas', slug: 'empresas', publico: 'quem trabalha aqui',
      // A TV fala com a equipe: anúncio de terceiros não cabe (docs/ads/README.md).
      recebeAnuncios: false,
      // Pessoas, mural e indicadores são o dia a dia de RH e gestão: sobem no menu.
      extras: { rotulo: 'Pessoas e indicadores', depoisDe: 'midias' },
      lugar: 'empresa', lugarDe: 'da empresa',
      opcoes: ['aviso', 'comunicado', 'aniversario', 'boasvindas', 'indicador', 'seguranca', 'evento', 'vaga', 'agradecimento', 'valores', 'horario', 'cardapio'],
      exemplo: 'Ex.: avisar que o refeitório fecha mais cedo na sexta, na TV do refeitório',
      paraIA: 'Empresa: comunicação interna, para quem trabalha lá (avisos, RH, segurança, metas). Não fale de preço, oferta ou cliente comprando, a menos que peçam.',
      // Os exemplos e as frases fixas do painel que mudam de frente (QA de lançamento, 03/11: SIPAT, RH e Protheus apareciam na padaria e na clínica).
      textos: {
        datas: '10/11 SIPAT — palestras às 15h no refeitório\n15/11 Feriado — não haverá expediente\n28/11 Confraternização às 18h',
        deOndeVemAsDatas: 'a lista do RH, um e-mail, a agenda',
        planilha: 'a planilha do RH', sistema: 'do Protheus ou de qualquer sistema', nomesDeTv: 'Recepção, Refeitório, Portaria',
        pedidoDeExemplo: 'Ex.: avisar que o refeitório fecha às 14h na sexta', festas: 'o aniversário da empresa, a confraternização',
      },
    },
    comercio: {
      id: 'comercio', nome: 'Comércio', descricao: 'Loja, restaurante, serviço: ofertas e novidades.',
      marca: 'MultiTelas Comércio', slug: 'comercio', publico: 'clientes',
      recebeAnuncios: true,
      extras: { rotulo: 'Recursos extras', depoisDe: 'marca' },
      lugar: 'loja', lugarDe: 'da loja',
      opcoes: ['promocao', 'novidade', 'cardapio', 'foto', 'horario', 'aviso', 'evento', 'instagram', 'depoimento', 'pagamento', 'wifi', 'aniversario'],
      exemplo: 'Ex.: quero divulgar o pão de queijo em dobro à tarde, na TV e no Instagram',
      paraIA: 'Comércio: fala com clientes (ofertas, novidades, horário, redes sociais).',
      textos: {
        datas: '27/11 Black Friday — descontos o dia todo\n08/12 Feriado — abrimos das 9h às 13h\n24/12 Fechamos às 14h',
        deOndeVemAsDatas: 'a agenda da loja, um e-mail, a lista de feriados',
        planilha: 'a planilha da equipe', sistema: 'do sistema que vocês já usam (o caixa, uma planilha, o ERP)', nomesDeTv: 'Vitrine, Balcão, Caixa',
        pedidoDeExemplo: 'Ex.: avisar que a loja fecha às 14h no sábado', festas: 'o aniversário da loja, uma inauguração',
      },
    },
    saude: {
      id: 'saude', nome: 'Saúde', descricao: 'Clínica, consultório, farmácia: orientação e serviços.',
      marca: 'MultiTelas Saúde', slug: 'saude', publico: 'pacientes na sala de espera',
      recebeAnuncios: true,
      extras: { rotulo: 'Recursos extras', depoisDe: 'marca' },
      lugar: 'clínica', lugarDe: 'da clínica',
      opcoes: ['aviso', 'dica', 'servicos', 'prevencao', 'horario', 'convenios', 'evento', 'depoimento', 'instagram', 'wifi', 'aniversario'],
      exemplo: 'Ex.: lembrar que a vacina da gripe chegou, na TV da recepção',
      paraIA: 'Saúde: fala com pacientes na sala de espera (orientação, serviços, prevenção). Sem promessa de cura, sem desconto agressivo, tom acolhedor.',
      textos: {
        datas: '25/11 Mutirão de vacinação — das 8h às 12h\n08/12 Feriado — não haverá atendimento\n24/12 Atendimento só até as 12h',
        deOndeVemAsDatas: 'a agenda da clínica, um e-mail, a lista de feriados',
        planilha: 'a planilha da equipe', sistema: 'do sistema que vocês já usam (a agenda, uma planilha, o ERP)', nomesDeTv: 'Recepção, Sala de espera, Corredor',
        pedidoDeExemplo: 'Ex.: avisar que a clínica não abre no feriado de quinta', festas: 'o aniversário da clínica, uma campanha de vacinação',
      },
    },
  };

  // Do ramo que js/paletas.js deduz para o perfil.
  var DO_RAMO = { corporativo: 'empresa', saude: 'saude' };

  // Só as chaves próprias: 'constructor' e '__proto__' vêm do protótipo e não são perfil (nota do consultor no #218).
  var proprio = Object.prototype.hasOwnProperty;
  function tem(id) { return typeof id === 'string' && proprio.call(PERFIS, id); }
  function normalizar(id) { return tem(id) ? id : 'comercio'; }
  function deduzir(ramo) { return typeof ramo === 'string' && proprio.call(DO_RAMO, ramo) ? DO_RAMO[ramo] : 'comercio'; }
  function de(id) { return PERFIS[normalizar(id)]; }
  // A frente pelo endereço da landing (/empresas, /saude, /comercio), ou null.
  function doSlug(slug) {
    for (var k in PERFIS) if (proprio.call(PERFIS, k) && PERFIS[k].slug === slug) return PERFIS[k];
    return null;
  }

  return { PERFIS: PERFIS, IDS: Object.keys(PERFIS), tem: tem, normalizar: normalizar, deduzir: deduzir, de: de, doSlug: doSlug };
});
